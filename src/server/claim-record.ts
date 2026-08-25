import type { Claim, IsoDate } from "@/domain/types";

import {
  getCommercialApprovalByQuoteId,
  verifyCommercialQuoteSnapshot,
} from "@/server/commercial-approval-store";

import { getOpportunityConversionByClaimId } from "@/server/opportunity-conversion-store";

import {
  getClaimantOnboarding,
  staffCanAccessClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import { resolvePersistedClaimFilingReadiness } from "@/server/claim-filing-readiness";

import { getOpportunityById } from "@/server/opportunity-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { resolveStaffSession } from "@/server/staff-session";

/**
 * CLAIM RECORD RESOLVER
 *
 * Provides claim-facing surfaces one production read boundary for claims created
 * through the persisted opportunity-conversion workflow.
 *
 * A claim is materialized only when:
 *
 *   1. A persisted opportunity conversion exists.
 *   2. The source opportunity still exists.
 *   3. An approved jurisdiction rule still exists.
 *   4. The exact commercial quote used during conversion still exists.
 *   5. The commercial quote snapshot is intact.
 *   6. The quote remains locked to the same fee agreement recorded at conversion.
 *
 * HISTORICAL LEGAL-RULE SNAPSHOT
 *
 * The Claim agreement inherits the legal-rule version stored on the commercial
 * quote itself.
 *
 * It must never copy the jurisdiction's current version at claim-read time,
 * because doing so would rewrite the historical legal basis of a signed deal.
 *
 * If the quote was created before legalRuleVersionSnapshot existed, the field
 * remains absent. The filing-readiness engine then fails closed rather than
 * fabricating historical provenance.
 *
 * Persisted downstream workflow state is merged into the Claim read model:
 *
 *   - claimant participant linkage
 *   - identity verification progress
 *   - disclosure acknowledgements
 *   - service agreement signature
 *   - cancellation deadline
 *   - free-claim disclosure
 *   - filing-readiness progress
 *
 * Nothing is fabricated. If a workflow has not recorded evidence, the Claim
 * read model continues to show that work as outstanding.
 *
 * STAFF OWNERSHIP
 *
 * When this resolver is invoked during an authenticated staff request, a
 * claimant-linked Claim is returned only to Super Admin or the staff member
 * currently recorded as assigned_staff_user_id on claimant_onboarding.
 *
 * This is intentionally enforced here because Claims, Documents, Recoveries,
 * Attorney Coordination, Filing and Search all resolve persisted Claims through
 * this boundary. Claimant-self authorization remains a separate portal concern.
 */

/* ========================================================================== */
/* Result                                                                      */
/* ========================================================================== */

export interface ResolvedClaimRecord {
  claim: Claim;

  source: "persisted_conversion";

  commercialSnapshotHash: string;

  commercialQuoteId: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function isoDateFromInstant(value: string): IsoDate {
  return value.slice(0, 10) as IsoDate;
}

/* ========================================================================== */
/* Persisted conversion materialization                                        */
/* ========================================================================== */

async function persistedClaim(
  claimId: string,
): Promise<ResolvedClaimRecord | undefined> {
  const conversion = await getOpportunityConversionByClaimId(claimId);

  if (!conversion) {
    return undefined;
  }

  /*
   * Claimant staff ownership is resolved before the Claim read model loads
   * downstream commercial, property and jurisdiction detail.
   *
   * This gives every staff-facing caller of resolveClaimRecord() the same
   * server-side ownership boundary:
   *
   *   - Super Admin may resolve every persisted Claim.
   *   - Ordinary staff may resolve a claimant-linked Claim only when that
   *     claimant is currently assigned to their persisted staff UUID.
   *   - A converted Claim with no claimant onboarding yet remains available to
   *     otherwise-authorized staff so the controlled onboarding workflow can
   *     begin.
   *   - Claimant-self and non-staff internal flows remain separate because no
   *     staff session is resolved for a claimant Auth identity.
   */
  const onboarding =
    await getClaimantOnboarding(
      conversion.claimId,
    );

  const staffSession =
    await resolveStaffSession();

  if (
    staffSession &&
    onboarding &&
    !staffCanAccessClaimantOnboarding(
      staffSession,
      onboarding,
    )
  ) {
    return undefined;
  }

  const [
    approval,
    opportunity,
    rulePackages,
  ] = await Promise.all([
    getCommercialApprovalByQuoteId(conversion.commercialQuoteId),

    getOpportunityById(conversion.opportunityId),

    listJurisdictionRulePackages(),
  ]);

  /*
   * Fail closed.
   *
   * A converted claim must never load from a pricing record that is missing,
   * modified, unlocked or linked to a different agreement.
   */
  if (
    !approval ||
    approval.approvalStatus !== "locked" ||
    !verifyCommercialQuoteSnapshot(approval) ||
    approval.snapshotHash !== conversion.commercialSnapshotHash ||
    approval.lockedFeeAgreementId !== conversion.feeAgreementId
  ) {
    return undefined;
  }

  if (!opportunity) {
    return undefined;
  }

  if (
    opportunity.jurisdictionId !== conversion.jurisdictionId ||
    approval.opportunityId !== opportunity.id ||
    approval.jurisdictionId !== opportunity.jurisdictionId
  ) {
    return undefined;
  }

  const jurisdictionPackage = rulePackages.find(
    (rulePackage) =>
      rulePackage.status === "approved" &&
      rulePackage.rule?.id === opportunity.jurisdictionId,
  );

  const jurisdiction = jurisdictionPackage?.rule;

  /*
   * Claims fail closed if the jurisdiction rule is no longer approved.
   *
   * The historical conversion record remains persisted, but claim processing
   * should not continue through the operational claim resolver without a current
   * approved jurisdiction rule.
   */
  if (!jurisdiction) {
    return undefined;
  }

  const quote = approval.quoteSnapshot;

  /*
   * The locked quote controls the fee terms.
   *
   * For percentage pricing, carry the approved percentage exactly.
   *
   * For a non-percentage model, projectedFee is the exact locked fee produced
   * by the pricing engine and becomes the agreement flat amount represented in
   * this read model.
   */
  const percentage = quote.selectedPercentage;

  const flatAmount =
    percentage === undefined && quote.model !== "no_fee"
      ? quote.projectedFee
      : undefined;

  const createdDate = isoDateFromInstant(conversion.convertedAt);

  const lastActivityDate = isoDateFromInstant(conversion.updatedAt);

  /*
   * Build the claim from persisted facts only.
   *
   * Downstream readiness is resolved immediately after this base record exists.
   */
  const claim: Claim = {
    id: conversion.claimId,

    reference: conversion.claimReference,

    opportunityId: opportunity.id,

    propertyId: opportunity.propertyId,

    jurisdictionId: opportunity.jurisdictionId,

    participants: onboarding ? [onboarding.participant] : [],

    status: onboarding ? "documentation" : "intake",

    /*
     * A converted claim begins at Identified until a real claimant has been
     * linked through onboarding.
     *
     * The presence of a former-owner candidate in the source record does not
     * mean Duequity has located or reached that person.
     */
    stageKey: onboarding
      ? onboarding.claimant.identityVerification === "verified"
        ? onboarding.serviceAgreement
          ? "documents_requested"
          : "entitlement_review"
        : "owner_located"
      : "identified",

    legalBasis:
      "Potential former-owner surplus claim opened from a verified opportunity record. Filing authority and legal handling remain governed by the approved jurisdiction rule and human review where the recorded rules or case complexity require it.",

    filingDeadline: opportunity.claimDeadline,

    estimatedRecovery: opportunity.estimatedSurplus,

    confirmedRecovery: opportunity.confirmedSurplus,

    feeAgreement: {
      id: conversion.feeAgreementId,

      model: quote.model,

      percentage,

      flatAmount,

      capAmount: quote.internalFeeCapAmountSnapshot,

      jurisdictionId: opportunity.jurisdictionId,

      commercialFeeQuoteId: conversion.commercialQuoteId,

      commercialPolicyId: quote.commercialPolicyId,

      commercialPolicyVersion: quote.commercialPolicyVersion,

      /*
       * Historical legal provenance comes from the locked quote.
       *
       * Never substitute jurisdiction.legalRuleVersion here.
       */
      legalRuleVersionSnapshot: quote.legalRuleVersionSnapshot,

      legalFeeCapPercentSnapshot: quote.legalFeeCapPercentSnapshot,

      legalFeeCapAmountSnapshot: quote.legalFeeCapAmountSnapshot,

      disclosuresAcknowledged:
        onboarding?.disclosureAcknowledgements.map(
          (acknowledgement) => acknowledgement.key,
        ) ?? [],

      signedAt: onboarding?.serviceAgreement?.signedAt,

      cancellationDeadline: onboarding?.serviceAgreement?.cancellationDeadline,

      freeClaimOptionDisclosedAt: onboarding?.freeClaimOptionDisclosedAt,

      documentId: onboarding?.serviceAgreement?.documentId,
    },

    custodian: opportunity.custodian,

    flags: opportunity.flags,

    nextInternalAction: onboarding
      ? "Continue the recorded claim workflow."
      : "Complete claimant onboarding and verify identity before preparing claim documents.",

    assignedSpecialistId: opportunity.assignedToUserId,

    createdAt: createdDate,

    lastActivityAt: lastActivityDate,

    notes: [
      {
        id: `note-${conversion.claimId}-conversion`,

        body: `Claim created from ${opportunity.reference}. Commercial pricing is locked to ${conversion.commercialQuoteId} with snapshot ${conversion.commercialSnapshotHash.slice(
          0,
          16,
        )}… . Claimant, agreement, disclosure and document state are resolved from persisted workflow records. Historical legal-rule provenance is inherited from the locked commercial quote.`,

        authorName: "Duequity system",

        createdAt: createdDate,

        visibility: "internal",

        pinned: true,
      },
    ],
  };

  /*
   * Resolve current operational state from the same filing-readiness engine used
   * by claim-facing workflows.
   *
   * Current date is used for live deadline, cancellation-period, jurisdiction,
   * payment-route and legal-rule-version evaluation.
   */
  const readiness = await resolvePersistedClaimFilingReadiness(
    claim,
    jurisdiction,
    currentIsoDate(),
  );

  if (readiness.readyToPrepare) {
    claim.status = "ready_to_file";

    claim.stageKey = "package_prepared";
  } else if (readiness.serviceAgreementSigned) {
    claim.status = "documentation";

    claim.stageKey = "documents_requested";
  } else if (readiness.identityVerified) {
    claim.status = "documentation";

    claim.stageKey = "entitlement_review";
  } else if (readiness.claimantLinked) {
    claim.status = "documentation";

    claim.stageKey = "owner_located";
  }

  claim.nextInternalAction = readiness.nextInternalAction;

  return {
    claim,

    source: "persisted_conversion",

    commercialSnapshotHash: conversion.commercialSnapshotHash,

    commercialQuoteId: conversion.commercialQuoteId,
  };
}

/* ========================================================================== */
/* Public resolver                                                             */
/* ========================================================================== */

export async function resolveClaimRecord(
  claimId: string,
): Promise<ResolvedClaimRecord | undefined> {
  return persistedClaim(claimId);
}