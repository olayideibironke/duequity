import { NextRequest, NextResponse } from "next/server";

import {
  assessDeadline,
  evaluateIntakeGate,
  evaluateStartupGreenLane,
  validateFee,
  type StartupGreenLaneContext,
} from "@/domain/compliance";
import {
  classifyLegalComplexity,
  legalFlagFromRiskFlag,
  type LegalComplexityFlag,
} from "@/domain/legal";
import type { CommercialFeePolicy, IsoDate, Opportunity } from "@/domain/types";
import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";
import { resolveStaffSession } from "@/server/staff-session";
import {
  getCommercialApprovalForOpportunity,
  lockCommercialQuoteApproval,
  verifyCommercialQuoteSnapshot,
} from "@/server/commercial-approval-store";
import { listCommercialFeePolicies } from "@/server/commercial-fee-policy-store";
import {
  listJurisdictionRulePackages,
  type JurisdictionPaymentRouting,
} from "@/server/jurisdiction-intelligence";
import {
  createOpportunityConversion,
  getOpportunityConversion,
} from "@/server/opportunity-conversion-store";
import { getOpportunityById } from "@/server/opportunity-store";

/**
 * DUEQUITY OPPORTUNITY CONVERSION
 *
 * This route is the authoritative server-side boundary between:
 *
 *   researched Opportunity
 *
 * and
 *
 *   operational Claim
 *
 * A Claim may be created only when the opportunity remains inside Duequity's
 * startup Green Lane.
 *
 * Conversion requires:
 *
 *   - authenticated operational permission
 *   - an approved jurisdiction rule
 *   - ordinary jurisdiction intake permission
 *   - an approved launch payment route
 *   - no assignment or acquisition requirement
 *   - an administrative legal-complexity lane
 *   - no unresolved blocking risk flags
 *   - an unexpired claim deadline where one is recorded
 *   - an approved current commercial fee policy
 *   - an intact approved commercial quote snapshot
 *   - a fee that remains valid under the current jurisdiction rule
 *   - commercial quote lock before Claim persistence
 *
 * Duequity's launch workflow does not convert:
 *
 *   - attorney-required matters
 *   - legal-review matters
 *   - unresolved payment-route matters
 *   - acquisition or assignee matters
 *   - opportunities with unresolved blocking facts
 *
 * The conversion store remains persistence only. Legal, compliance, payment
 * routing, authorization, and commercial decisions are enforced here before
 * the Claim boundary is crossed.
 */

/* ========================================================================== */
/* Response helpers                                                            */
/* ========================================================================== */

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
    },
  );
}

/* ========================================================================== */
/* Time                                                                        */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

/* ========================================================================== */
/* Stable conversion identifiers                                               */
/* ========================================================================== */

function claimIdForOpportunity(opportunityId: string): string {
  return `claim-${opportunityId}`;
}

function claimReferenceForOpportunity(opportunityReference: string): string {
  const suffix = opportunityReference.replace(/^OPP-/, "");

  return `DQ-${suffix}`;
}

function feeAgreementIdForOpportunity(opportunityId: string): string {
  return `fee-agreement-${opportunityId}`;
}

/* ========================================================================== */
/* Comparison                                                                  */
/* ========================================================================== */

function sameOptionalNumber(
  left: number | undefined,
  right: number | undefined,
): boolean {
  return (left ?? null) === (right ?? null);
}

/* ========================================================================== */
/* Commercial policy selection                                                 */
/* ========================================================================== */

function policyCoversOpportunity(
  policy: CommercialFeePolicy,
  opportunity: Opportunity,
): boolean {
  const saleCovered =
    !policy.saleTypes ||
    policy.saleTypes.length === 0 ||
    policy.saleTypes.includes(opportunity.sale.saleType);

  const custodianCovered =
    !policy.custodians ||
    policy.custodians.length === 0 ||
    policy.custodians.includes(opportunity.custodian);

  return saleCovered && custodianCovered;
}

function selectCurrentCommercialPolicy(
  policies: CommercialFeePolicy[],
  opportunity: Opportunity,
): CommercialFeePolicy | undefined {
  return policies
    .filter(
      (policy) =>
        policy.status === "approved" &&
        policy.jurisdictionId === opportunity.jurisdictionId &&
        policyCoversOpportunity(policy, opportunity),
    )
    .slice()
    .sort((left, right) => right.version - left.version)[0];
}

/* ========================================================================== */
/* Payment routing                                                             */
/* ========================================================================== */

function paymentRouteReadyForLaunch(
  routing: JurisdictionPaymentRouting,
): boolean {
  if (
    routing.paymentRoute === "unknown" ||
    routing.paymentRoute === "assignee" ||
    routing.launchTrack === "blocked" ||
    routing.launchTrack === "future_acquisition" ||
    routing.feeCollectionMethod === "unknown" ||
    routing.feeCollectionMethod === "assignment_acquisition" ||
    routing.representativeMayFile === "unknown" ||
    routing.representativeMayReceivePayment === "unknown" ||
    routing.assignmentRequiredForRepresentativePayment === "unknown"
  ) {
    return false;
  }

  if (routing.assignmentRequiredForRepresentativePayment === "yes") {
    return false;
  }

  switch (routing.paymentRoute) {
    case "claimant_only":
      return (
        routing.launchTrack === "direct_claimant_recovery" &&
        routing.representativeMayReceivePayment === "no" &&
        routing.assignmentRequiredForRepresentativePayment === "no" &&
        routing.feeCollectionMethod === "contractual_post_recovery"
      );

    case "authorized_representative":
      return (
        routing.launchTrack === "managed_representative_recovery" &&
        routing.representativeMayReceivePayment === "yes" &&
        routing.assignmentRequiredForRepresentativePayment === "no" &&
        routing.feeCollectionMethod === "representative_disbursement"
      );

    case "joint_payee":
      return (
        routing.launchTrack === "managed_representative_recovery" &&
        routing.representativeMayReceivePayment === "yes" &&
        routing.assignmentRequiredForRepresentativePayment === "no" &&
        routing.feeCollectionMethod === "joint_payee_disbursement"
      );

    case "split_disbursement":
      return (
        routing.launchTrack === "managed_representative_recovery" &&
        routing.representativeMayReceivePayment === "yes" &&
        routing.assignmentRequiredForRepresentativePayment === "no" &&
        routing.feeCollectionMethod === "split_disbursement"
      );
  }
}

function startupGreenLaneContext(
  routing: JurisdictionPaymentRouting | undefined,
): StartupGreenLaneContext {
  if (!routing) {
    return {
      paymentRoute: "unknown",
      launchTrack: "blocked",
      representativeMayFile: "unknown",
      representativeMayReceivePayment: "unknown",
      assignmentRequiredForRepresentativePayment: "unknown",
      feeCollectionMethod: "unknown",
      paymentRouteReady: false,
      acquisitionRequested: false,
    };
  }

  return {
    paymentRoute: routing.paymentRoute,
    launchTrack: routing.launchTrack,
    representativeMayFile: routing.representativeMayFile,
    representativeMayReceivePayment: routing.representativeMayReceivePayment,

    assignmentRequiredForRepresentativePayment:
      routing.assignmentRequiredForRepresentativePayment,

    feeCollectionMethod: routing.feeCollectionMethod,

    paymentRouteReady:
      paymentRouteReadyForLaunch(routing),

    acquisitionRequested: false,
  };
}

/* ========================================================================== */
/* Case-level legal complexity                                                 */
/* ========================================================================== */

function legalComplexityFlagsForOpportunity(
  opportunity: Opportunity,
): LegalComplexityFlag[] {
  const projectedFlags: LegalComplexityFlag[] = [];

  for (const risk of opportunity.flags) {
    if (risk.resolvedAt) {
      continue;
    }

    const kind = legalFlagFromRiskFlag(risk.kind);

    if (!kind) {
      continue;
    }

    if (projectedFlags.some((flag) => flag.kind === kind)) {
      continue;
    }

    projectedFlags.push({
      kind,
      detail: risk.detail,
      raisedAt: risk.raisedAt,
      raisedBy: risk.raisedBy,
    });
  }

  return projectedFlags;
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      opportunityId: string;
    }>;
  },
) {
  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "opportunity.read")) {
    return errorResponse(
      "You do not have permission to read opportunity conversion records.",
      403,
    );
  }

  const { opportunityId } = await context.params;

  const opportunity = await getOpportunityById(opportunityId);

  if (!opportunity) {
    return errorResponse("Opportunity not found.", 404);
  }

  const [conversion, approval] = await Promise.all([
    getOpportunityConversion(opportunity.id),
    getCommercialApprovalForOpportunity(opportunity.id),
  ]);

  return NextResponse.json({
    ok: true,

    opportunityId: opportunity.id,

    opportunityReference: opportunity.reference,

    convertedClaimId:
      opportunity.convertedClaimId ?? conversion?.claimId ?? null,

    conversion: conversion ?? null,

    approval: approval ?? null,
  });
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  _request: NextRequest,
  context: {
    params: Promise<{
      opportunityId: string;
    }>;
  },
) {
  /* ======================================================================== */
  /* Authorization                                                             */
  /* ======================================================================== */

  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "opportunity.write")) {
    return errorResponse(
      "You do not have permission to convert opportunities into claims.",
      403,
    );
  }

  const { opportunityId } = await context.params;

  /* ======================================================================== */
  /* Opportunity                                                               */
  /* ======================================================================== */

  const opportunity = await getOpportunityById(opportunityId);

  if (!opportunity) {
    return errorResponse("Opportunity not found.", 404);
  }

  const existingConversion = await getOpportunityConversion(opportunity.id);

  if (opportunity.convertedClaimId && !existingConversion) {
    return errorResponse(
      "This opportunity is already marked converted, but no matching persisted conversion record was found.",
      409,
    );
  }

  /* ======================================================================== */
  /* Current legal, jurisdiction and commercial records                        */
  /* ======================================================================== */

  const [rulePackages, commercialPolicies, approval] = await Promise.all([
    listJurisdictionRulePackages(),
    listCommercialFeePolicies(),
    getCommercialApprovalForOpportunity(opportunity.id),
  ]);

  const jurisdictionPackage = rulePackages.find(
    (rulePackage) =>
      rulePackage.status === "approved" &&
      rulePackage.rule?.id === opportunity.jurisdictionId,
  );

  const jurisdiction = jurisdictionPackage?.rule;

  if (!jurisdictionPackage || !jurisdiction) {
    return errorResponse(
      "No approved jurisdiction rule is published for this opportunity.",
      409,
    );
  }

  if (!clearedForState(session, jurisdictionPackage.stateCode)) {
    return errorResponse(
      `You are not cleared to convert opportunities in ${jurisdictionPackage.stateCode}.`,
      403,
    );
  }

  /* ======================================================================== */
  /* Gate 1: ordinary jurisdiction intake                                      */
  /* ======================================================================== */

  const intakeGate = evaluateIntakeGate(jurisdiction);

  if (intakeGate.outcome !== "permitted") {
    return errorResponse(
      intakeGate.reason ||
        "Jurisdiction intake is not cleared for Duequity's administrative launch workflow.",
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 2: Startup Green Lane payment routing                                */
  /* ======================================================================== */

  const greenLaneContext = startupGreenLaneContext(
    jurisdictionPackage.paymentRouting,
  );

  const startupGate = evaluateStartupGreenLane(
    jurisdiction,
    greenLaneContext,
  );

  if (startupGate.outcome !== "permitted") {
    return errorResponse(
      startupGate.reason ||
        "This jurisdiction is outside Duequity's startup Green Lane.",
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 3: case-level legal complexity                                       */
  /* ======================================================================== */

  const legalFlags =
    legalComplexityFlagsForOpportunity(opportunity);

  const legalClassification =
    classifyLegalComplexity(
      legalFlags,
      jurisdiction,
    );

  if (legalClassification.lane !== "administrative") {
    return errorResponse(
      `This opportunity is classified ${legalClassification.lane
        .split("_")
        .join(
          " ",
        )}. Duequity's startup Green Lane converts straightforward administrative recoveries only. ${legalClassification.rationale}`,
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 4: deadline                                                          */
  /* ======================================================================== */

  const deadline =
    assessDeadline(
      opportunity.claimDeadline,
      currentIsoDate(),
    );

  if (deadline.risk === "expired") {
    return errorResponse(
      "The claim deadline has expired.",
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 5: unresolved blocking flags                                         */
  /* ======================================================================== */

  const blockingFlags =
    opportunity.flags.filter(
      (flag) =>
        !flag.resolvedAt &&
        flag.severity === "blocking",
    );

  if (blockingFlags.length > 0) {
    return errorResponse(
      "One or more blocking review flags remain open. The opportunity cannot enter the startup Green Lane until every blocking issue is resolved.",
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 6: current commercial policy                                         */
  /* ======================================================================== */

  const commercialPolicy =
    selectCurrentCommercialPolicy(
      commercialPolicies,
      opportunity,
    );

  if (!commercialPolicy) {
    return errorResponse(
      "No current approved commercial fee policy applies to this opportunity.",
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 7: persisted commercial approval                                     */
  /* ======================================================================== */

  if (!approval) {
    return errorResponse(
      "Commercial pricing has not been approved for this opportunity.",
      409,
    );
  }

  if (!verifyCommercialQuoteSnapshot(approval)) {
    return errorResponse(
      "Commercial quote snapshot integrity verification failed. Conversion is blocked.",
      409,
    );
  }

  if (
    approval.approvalStatus !== "staff_approved" &&
    approval.approvalStatus !== "manager_approved" &&
    approval.approvalStatus !== "locked"
  ) {
    return errorResponse(
      approval.approvalStatus === "manager_review"
        ? "Commercial pricing is awaiting manager approval."
        : "Commercial pricing is not approved for conversion.",
      409,
    );
  }

  if (approval.opportunityId !== opportunity.id) {
    return errorResponse(
      "The approved commercial quote does not belong to this opportunity.",
      409,
    );
  }

  if (approval.jurisdictionId !== opportunity.jurisdictionId) {
    return errorResponse(
      "The approved commercial quote belongs to a different jurisdiction.",
      409,
    );
  }

  if (
    approval.commercialPolicyId !== commercialPolicy.id ||
    approval.commercialPolicyVersion !== commercialPolicy.version
  ) {
    return errorResponse(
      "The commercial fee policy changed after this quote was approved. Pricing must be recalculated and approved again before conversion.",
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 8: recovery snapshot                                                 */
  /* ======================================================================== */

  const currentRecoveryAmount =
    opportunity.confirmedSurplus?.amount ??
    opportunity.estimatedSurplus.amount;

  if (
    approval.quoteSnapshot.recoveryAmount !==
    currentRecoveryAmount
  ) {
    return errorResponse(
      "The recovery amount changed after commercial pricing was approved. Pricing must be recalculated before conversion.",
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 9: legal ceiling snapshot                                            */
  /* ======================================================================== */

  if (
    !sameOptionalNumber(
      approval.quoteSnapshot
        .legalFeeCapPercentSnapshot,
      jurisdiction.feeCapPercent,
    )
  ) {
    return errorResponse(
      "The recorded legal percentage ceiling changed after commercial pricing was approved. Conversion is blocked pending review.",
      409,
    );
  }

  if (
    !sameOptionalNumber(
      approval.quoteSnapshot
        .legalFeeCapAmountSnapshot,
      jurisdiction.feeCapAmount,
    )
  ) {
    return errorResponse(
      "The recorded legal amount ceiling changed after commercial pricing was approved. Conversion is blocked pending review.",
      409,
    );
  }

  /* ======================================================================== */
  /* Gate 10: independent current legal fee validation                         */
  /* ======================================================================== */

  const feeValidation =
    validateFee(
      jurisdiction,
      {
        model:
          approval.quoteSnapshot.model,

        percentage:
          approval.quoteSnapshot
            .selectedPercentage,

        flatAmount:
          approval.quoteSnapshot.model ===
          "flat"
            ? approval.quoteSnapshot
                .projectedFee
            : undefined,

        recoveryAmount:
          currentRecoveryAmount,
      },
    );

  if (feeValidation.outcome !== "permitted") {
    return errorResponse(
      `The approved commercial fee no longer passes the current jurisdiction rule. ${feeValidation.reason}`,
      409,
    );
  }

  /* ======================================================================== */
  /* Stable Claim identifiers                                                  */
  /* ======================================================================== */

  const claimId =
    existingConversion?.claimId ??
    claimIdForOpportunity(
      opportunity.id,
    );

  const claimReference =
    existingConversion?.claimReference ??
    claimReferenceForOpportunity(
      opportunity.reference,
    );

  const feeAgreementId =
    existingConversion?.feeAgreementId ??
    feeAgreementIdForOpportunity(
      opportunity.id,
    );

  /* ======================================================================== */
  /* Existing conversion consistency                                          */
  /* ======================================================================== */

  if (
    existingConversion &&
    existingConversion.jurisdictionId !==
      opportunity.jurisdictionId
  ) {
    return errorResponse(
      "The existing conversion belongs to a different jurisdiction. Manual review is required.",
      409,
    );
  }

  if (
    existingConversion &&
    existingConversion.commercialQuoteId !==
      approval.quoteId
  ) {
    return errorResponse(
      "The existing conversion references a different commercial quote. Manual review is required.",
      409,
    );
  }

  if (
    existingConversion &&
    existingConversion.commercialSnapshotHash !==
      approval.snapshotHash
  ) {
    return errorResponse(
      "The existing conversion commercial snapshot does not match the currently approved snapshot. Manual review is required.",
      409,
    );
  }

  /* ======================================================================== */
  /* Trusted actor                                                             */
  /* ======================================================================== */

  const actorUserId =
    session.user.id;

  const occurredAt =
    new Date().toISOString();

  /* ======================================================================== */
  /* Lock and activate commercial pricing before Claim persistence             */
  /* ======================================================================== */

  let lockedApproval;

  try {
    /*
     * Always pass the quote through the lock workflow.
     *
     * The lock operation is idempotent when the quote is already locked to the
     * same fee agreement. It also guarantees that the locked quote is attached
     * to the Opportunity as its active commercial quote.
     *
     * This is intentionally required even on conversion retries. A prior
     * partial conversion may have locked pricing before the Opportunity's
     * active-quote pointer was persisted.
     */
    lockedApproval =
      await lockCommercialQuoteApproval({
        quoteId:
          approval.quoteId,

        feeAgreementId,

        actorUserId,

        occurredAt,
      });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Commercial pricing could not be locked. No Claim was created.",
      409,
    );
  }

  /* ======================================================================== */
  /* Final locked-quote verification                                          */
  /* ======================================================================== */

  if (
    lockedApproval.approvalStatus !==
      "locked" ||
    lockedApproval.lockedFeeAgreementId !==
      feeAgreementId ||
    !verifyCommercialQuoteSnapshot(
      lockedApproval,
    )
  ) {
    return errorResponse(
      "The commercial quote did not reach a valid locked state. No Claim was created.",
      409,
    );
  }

  /* ======================================================================== */
  /* Persist conversion                                                       */
  /* ======================================================================== */

  let conversion;

  try {
    conversion =
      await createOpportunityConversion({
        opportunityId:
          opportunity.id,

        opportunityReference:
          opportunity.reference,

        jurisdictionId:
          opportunity.jurisdictionId,

        claimId,

        claimReference,

        commercialQuoteId:
          lockedApproval.quoteId,

        commercialSnapshotHash:
          lockedApproval.snapshotHash,

        feeAgreementId,

        actorUserId,

        occurredAt,
      });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Opportunity conversion could not be persisted.",

        claimCreated: false,

        commercialPricingLocked: true,

        retrySafe: true,
      },
      {
        status: 409,
      },
    );
  }

  /* ======================================================================== */
  /* Success                                                                   */
  /* ======================================================================== */

  return NextResponse.json({
    ok: true,

    conversion,

    approval:
      lockedApproval,

    alreadyConverted:
      Boolean(
        existingConversion,
      ),

    startupGreenLane: {
      legalLane:
        legalClassification.lane,

      paymentRoute:
        greenLaneContext.paymentRoute,

      launchTrack:
        greenLaneContext.launchTrack,

      paymentRouteReady:
        greenLaneContext.paymentRouteReady,

      acquisitionRequested:
        false,
    },
  });
}