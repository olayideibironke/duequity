import "server-only";

import type {
  JurisdictionEvidencePacket,
} from "@/server/jurisdiction-evidence-harvester";

import type {
  JurisdictionReviewDraft,
} from "@/server/jurisdiction-review-store";

import {
  evaluateJurisdictionPaymentRouting,
  type JurisdictionRulePackage,
} from "@/server/jurisdiction-intelligence";

import { getSupabaseAdmin } from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export interface CanonicalJurisdictionPublicationResult {
  packageId: string;

  packageVersion: number;

  legalRuleVersion: number;

  intakeAuthorized: boolean;
}

interface CanonicalApprovalRow {
  package_id: string;
  package_version: number | string;
  legal_rule_version: number | string;
  intake_authorized: boolean;
}

interface CanonicalReviewRow {
  id: string;
  status: string;
  row_version: number | string;
  approved_package_id: string | null;
  approved_package_version: number | string | null;
}

type GateOutcome =
  | "permitted"
  | "conditional"
  | "blocked";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function positiveInteger(
  value: number | string,
  label: string,
): number {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return parsed;
}

function requireApprovedLocalReview(
  draft: JurisdictionReviewDraft,
  rulePackage: JurisdictionRulePackage,
): void {
  if (
    draft.status !==
    "approved"
  ) {
    throw new Error(
      "Only an already human-approved local jurisdiction review may be canonicalized through this compatibility path.",
    );
  }

  if (
    rulePackage.status !==
      "approved" ||
    !rulePackage.rule
  ) {
    throw new Error(
      "The local jurisdiction package is not approved.",
    );
  }

  if (
    draft.approvedPackageId !==
    rulePackage.id
  ) {
    throw new Error(
      "The approved local review does not reference the supplied jurisdiction package.",
    );
  }

  if (
    draft.approvedPackageVersion !==
    rulePackage.version
  ) {
    throw new Error(
      "The approved local review package version does not match the supplied jurisdiction package.",
    );
  }

  if (
    draft.evidencePacketId.trim() !==
    draft.evidencePacketId
  ) {
    throw new Error(
      "The local jurisdiction evidence packet identifier is malformed.",
    );
  }
}

function canonicalScope(
  draft: JurisdictionReviewDraft,
): "state" | "county" {
  if (
    draft.scope !==
      "state" &&
    draft.scope !==
      "county"
  ) {
    throw new Error(
      "The approved local jurisdiction review does not contain a valid scope.",
    );
  }

  return draft.scope;
}

function legalGate(
  rulePackage: JurisdictionRulePackage,
): GateOutcome {
  const rule =
    rulePackage.rule!;

  if (
    rule.complianceStatus ===
      "approved" &&
    rule.legalProcessingRule ===
      "administrative_permitted" &&
    !rule.attorneyRequired
  ) {
    return "permitted";
  }

  if (
    rule.complianceStatus ===
      "attorney_only" ||
    rule.legalProcessingRule ===
      "legal_review_recommended" ||
    rule.legalProcessingRule ===
      "attorney_mandatory"
  ) {
    return "conditional";
  }

  return "blocked";
}

function claimSubmissionGate(
  rulePackage: JurisdictionRulePackage,
): GateOutcome {
  const rule =
    rulePackage.rule!;

  if (
    rule.complianceStatus ===
      "approved" &&
    rule.legalProcessingRule ===
      "administrative_permitted" &&
    Boolean(
      rule.claimMethod,
    )
  ) {
    return "permitted";
  }

  return "blocked";
}

function feeGate(
  rulePackage: JurisdictionRulePackage,
): GateOutcome {
  const rule =
    rulePackage.rule!;

  if (
    rule.complianceStatus ===
      "approved" &&
    Array.isArray(
      rule.permittedFeeModels,
    )
  ) {
    return "permitted";
  }

  return "blocked";
}

function paymentGate(
  rulePackage: JurisdictionRulePackage,
): {
  outcome: GateOutcome;
  ready: boolean;
  reason: string;
} {
  const evaluation =
    evaluateJurisdictionPaymentRouting(
      rulePackage.paymentRouting,
    );

  return {
    outcome:
      evaluation.ready
        ? "permitted"
        : "blocked",

    ready:
      evaluation.ready,

    reason:
      evaluation.reason,
  };
}

function selectedSources(
  draft: JurisdictionReviewDraft,
) {
  const selected =
    new Set(
      draft.selectedSourceIds,
    );

  return [
    ...draft.sourceCandidates,
    ...draft.additionalSources,
  ].filter(
    (source) =>
      selected.has(
        source.id,
      ),
  );
}

/* ========================================================================== */
/* Evidence packet                                                            */
/* ========================================================================== */

async function ensureEvidencePacket(
  packet: JurisdictionEvidencePacket,
  draft: JurisdictionReviewDraft,
): Promise<void> {
  if (
    packet.id !==
      draft.evidencePacketId ||
    packet.packetHash !==
      draft.evidencePacketHash
  ) {
    throw new Error(
      "The approved jurisdiction review does not match its local evidence packet.",
    );
  }

  const scope =
    canonicalScope(
      draft,
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data: existing,
    error: readError,
  } =
    await supabase
      .from(
        "jurisdiction_evidence_packets",
      )
      .select(
        "packet_id, packet_hash",
      )
      .eq(
        "packet_id",
        packet.id,
      )
      .eq(
        "packet_hash",
        packet.packetHash,
      )
      .maybeSingle();

  if (readError) {
    throw new Error(
      `Unable to read canonical jurisdiction evidence: ${readError.message}`,
    );
  }

  if (existing) {
    return;
  }

  const {
    error,
  } =
    await supabase
      .from(
        "jurisdiction_evidence_packets",
      )
      .insert({
        schema_version:
          packet.schemaVersion,

        packet_id:
          packet.id,

        packet_hash:
          packet.packetHash,

        scope,

        state_fips:
          packet.stateFips,

        state_code:
          packet.stateCode,

        state_name:
          packet.stateName,

        county_geoid:
          scope === "county"
            ? packet.countyGeoid
            : null,

        county_name:
          scope === "county"
            ? packet.countyName ??
              draft.countyName ??
              null
            : null,

        sale_type:
          packet.saleType,

        harvested_at:
          packet.harvestedAt,

        evidence_status:
          packet.evidenceStatus,

        domains_attempted:
          packet.totals.domainsAttempted,

        html_pages_retrieved:
          packet.totals.htmlPagesRetrieved,

        documents_discovered:
          packet.totals.documentsDiscovered,

        retrieval_failures:
          packet.totals.retrievalFailures,

        process_context_sources:
          packet.totals.processContextSources,

        recovery_rule_sources:
          packet.totals.recoveryRuleSources,

        local_procedure_sources:
          packet.totals.localProcedureSources,

        legal_rules_created:
          false,

        jurisdiction_approved:
          false,

        intake_allowed:
          false,

        discovery_terms:
          packet.discoveryTerms,

        domains:
          packet.domains,
      });

  if (error) {
    throw new Error(
      `Unable to persist canonical jurisdiction evidence: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Review draft                                                               */
/* ========================================================================== */

async function ensureCanonicalReviewDraft(
  draft: JurisdictionReviewDraft,
  rulePackage: JurisdictionRulePackage,
): Promise<CanonicalReviewRow> {
  const supabase =
    getSupabaseAdmin();

  const {
    data: existing,
    error: readError,
  } =
    await supabase
      .from(
        "jurisdiction_review_drafts",
      )
      .select(
        "id, status, row_version, approved_package_id, approved_package_version",
      )
      .eq(
        "id",
        draft.id,
      )
      .maybeSingle();

  if (readError) {
    throw new Error(
      `Unable to read canonical jurisdiction review: ${readError.message}`,
    );
  }

  if (existing) {
    return existing as CanonicalReviewRow;
  }

  const scope =
    canonicalScope(
      draft,
    );

  const findings =
    draft.findings;

  const payment =
    paymentGate(
      rulePackage,
    );

  const legal =
    legalGate(
      rulePackage,
    );

  const claimSubmission =
    claimSubmissionGate(
      rulePackage,
    );

  const fee =
    feeGate(
      rulePackage,
    );

  const {
    error: insertError,
  } =
    await supabase
      .from(
        "jurisdiction_review_drafts",
      )
      .insert({
        id:
          draft.id,

        schema_version:
          draft.schemaVersion,

        revision:
          draft.revision,

        scope,

        state_fips:
          draft.stateFips,

        state_code:
          draft.stateCode,

        state_name:
          draft.stateName,

        county_geoid:
          scope === "county"
            ? draft.countyGeoid
            : null,

        county_name:
          scope === "county"
            ? draft.countyName ??
              null
            : null,

        sale_type:
          draft.saleType,

        status:
          "draft",

        evidence_packet_id:
          draft.evidencePacketId,

        evidence_packet_hash:
          draft.evidencePacketHash,

        evidence_status:
          draft.evidenceStatus,

        evidence_harvested_at:
          draft.evidenceHarvestedAt,

        source_candidates:
          draft.sourceCandidates,

        additional_sources:
          draft.additionalSources,

        selected_source_ids:
          draft.selectedSourceIds,

        reviewed_findings:
          draft.reviewedFindings,

        finding_source_ids:
          draft.findingSourceIds,

        jurisdiction_id:
          findings.jurisdictionId ??
          rulePackage.rule!.id,

        agency_name:
          findings.agencyName ??
          null,

        agency_website:
          findings.agencyWebsite ??
          null,

        agency_phone:
          findings.agencyPhone ??
          null,

        agency_address:
          findings.agencyAddress ??
          null,

        custodian:
          findings.custodian ??
          null,

        claim_method:
          findings.claimMethod ??
          null,

        claim_form_url:
          findings.claimFormUrl ??
          null,

        required_documents:
          findings.requiredDocuments ??
          null,

        claim_deadline_days:
          findings.claimDeadlineDays ??
          null,

        statute_reference:
          findings.statuteReference ??
          null,

        permitted_fee_models:
          findings.permittedFeeModels ??
          null,

        fee_cap_percent:
          findings.feeCapPercent ??
          null,

        fee_cap_amount_cents:
          findings.feeCapAmount ??
          null,

        assignment_permitted:
          findings.assignmentPermitted ??
          null,

        power_of_attorney_accepted:
          findings.powerOfAttorneyAccepted ??
          null,

        finder_license_required:
          findings.finderLicenseRequired ??
          null,

        bond_required:
          findings.bondRequired ??
          null,

        attorney_required:
          findings.attorneyRequired ??
          null,

        mandatory_contract_language:
          findings.mandatoryContractLanguage ??
          null,

        cancellation_period_days:
          findings.cancellationPeriodDays ??
          null,

        payment_routing_note:
          findings.paymentRoutingNote ??
          null,

        probate_required_when_deceased:
          findings.probateRequiredWhenDeceased ??
          null,

        compliance_status:
          findings.complianceStatus ??
          null,

        legal_processing_rule:
          findings.legalProcessingRule ??
          null,

        legal_rule_effective_from:
          findings.legalRuleEffectiveFrom ??
          null,

        legal_rule_effective_through:
          findings.legalRuleEffectiveThrough ??
          null,

        legal_review_due_at:
          findings.legalReviewDueAt ??
          null,

        internal_notes:
          findings.internalNotes ??
          null,

        payment_route:
          rulePackage.paymentRouting
            ?.paymentRoute ??
          "unknown",

        payment_launch_track:
          rulePackage.paymentRouting
            ?.launchTrack ??
          "blocked",

        representative_may_file:
          rulePackage.paymentRouting
            ?.representativeMayFile ??
          "unknown",

        representative_may_receive_payment:
          rulePackage.paymentRouting
            ?.representativeMayReceivePayment ??
          "unknown",

        assignment_required_for_representative_payment:
          rulePackage.paymentRouting
            ?.assignmentRequiredForRepresentativePayment ??
          "unknown",

        fee_collection_method:
          rulePackage.paymentRouting
            ?.feeCollectionMethod ??
          "unknown",

        payment_route_ready:
          payment.ready,

        legal_gate:
          legal,

        claim_submission_gate:
          claimSubmission,

        fee_gate:
          fee,

        payment_gate:
          payment.outcome,

        gate_details: {
          migration:
            "Canonicalized from a previously human-approved Duequity local jurisdiction review.",

          legal: {
            outcome:
              legal,

            complianceStatus:
              rulePackage.rule
                ?.complianceStatus,

            legalProcessingRule:
              rulePackage.rule
                ?.legalProcessingRule,

            attorneyRequired:
              rulePackage.rule
                ?.attorneyRequired,
          },

          claimSubmission: {
            outcome:
              claimSubmission,

            method:
              rulePackage.rule
                ?.claimMethod,
          },

          fee: {
            outcome:
              fee,

            permittedModels:
              rulePackage.rule
                ?.permittedFeeModels,
          },

          payment: {
            outcome:
              payment.outcome,

            ready:
              payment.ready,

            reason:
              payment.reason,
          },
        },

        review_reason:
          draft.reviewReason ??
          null,

        conflict_reason:
          draft.conflictReason ??
          null,

        review_notes:
          draft.reviewNotes ??
          null,

        created_by_user_id:
          draft.createdByUserId,

        created_by_name:
          draft.createdByName,

        created_at:
          draft.createdAt,

        updated_by_user_id:
          draft.updatedByUserId,

        updated_by_name:
          draft.updatedByName,

        updated_at:
          draft.updatedAt,
      });

  if (insertError) {
    throw new Error(
      `Unable to create canonical jurisdiction review: ${insertError.message}`,
    );
  }

  const {
    data: created,
    error: createdError,
  } =
    await supabase
      .from(
        "jurisdiction_review_drafts",
      )
      .select(
        "id, status, row_version, approved_package_id, approved_package_version",
      )
      .eq(
        "id",
        draft.id,
      )
      .single();

  if (createdError) {
    throw new Error(
      `Unable to reload canonical jurisdiction review: ${createdError.message}`,
    );
  }

  return created as CanonicalReviewRow;
}

/* ========================================================================== */
/* Ready-for-approval transition                                               */
/* ========================================================================== */

async function ensureReadyForApproval(
  review: CanonicalReviewRow,
  actorUserId: string,
  actorName: string,
): Promise<CanonicalReviewRow> {
  if (
    review.status ===
      "approved"
  ) {
    return review;
  }

  if (
    review.status ===
      "ready_for_approval"
  ) {
    return review;
  }

  if (
    review.status !==
      "draft" &&
    review.status !==
      "changes_required"
  ) {
    throw new Error(
      `Canonical jurisdiction review is in unsupported status: ${review.status}.`,
    );
  }

  const expectedRowVersion =
    positiveInteger(
      review.row_version,
      "Canonical jurisdiction review row version",
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "jurisdiction_review_drafts",
      )
      .update({
        status:
          "ready_for_approval",

        updated_by_user_id:
          actorUserId,

        updated_by_name:
          actorName,
      })
      .eq(
        "id",
        review.id,
      )
      .eq(
        "row_version",
        expectedRowVersion,
      )
      .select(
        "id, status, row_version, approved_package_id, approved_package_version",
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to prepare canonical jurisdiction review for approval: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Canonical jurisdiction review changed while it was being prepared for approval. Reload and try again.",
    );
  }

  return data as CanonicalReviewRow;
}

/* ========================================================================== */
/* Controlled publication                                                     */
/* ========================================================================== */

async function approveCanonicalReview(
  review: CanonicalReviewRow,
  actorUserId: string,
): Promise<CanonicalJurisdictionPublicationResult> {
  if (
    review.status ===
      "approved"
  ) {
    const packageId =
      review.approved_package_id;

    const packageVersion =
      review.approved_package_version;

    if (
      !packageId ||
      packageVersion === null
    ) {
      throw new Error(
        "Canonical approved jurisdiction review is missing package provenance.",
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "jurisdiction_rule_packages",
        )
        .select(
          "package_id, version, legal_rule_version, intake_authorized",
        )
        .eq(
          "package_id",
          packageId,
        )
        .eq(
          "version",
          positiveInteger(
            packageVersion,
            "Canonical package version",
          ),
        )
        .single();

    if (error) {
      throw new Error(
        `Unable to read canonical jurisdiction package: ${error.message}`,
      );
    }

    return {
      packageId:
        data.package_id,

      packageVersion:
        positiveInteger(
          data.version,
          "Canonical package version",
        ),

      legalRuleVersion:
        positiveInteger(
          data.legal_rule_version,
          "Canonical legal-rule version",
        ),

      intakeAuthorized:
        Boolean(
          data.intake_authorized,
        ),
    };
  }

  if (
    review.status !==
      "ready_for_approval"
  ) {
    throw new Error(
      "Canonical jurisdiction review is not ready for controlled approval.",
    );
  }

  const expectedRowVersion =
    positiveInteger(
      review.row_version,
      "Canonical jurisdiction review row version",
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "approve_jurisdiction_review_draft",
      {
        p_review_id:
          review.id,

        p_expected_row_version:
          expectedRowVersion,

        p_approver_id:
          actorUserId,
      },
    );

  if (error) {
    throw new Error(
      `Unable to publish canonical jurisdiction rule: ${error.message}`,
    );
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (!row) {
    throw new Error(
      "Canonical jurisdiction approval returned no publication result.",
    );
  }

  const approval =
    row as CanonicalApprovalRow;

  return {
    packageId:
      approval.package_id,

    packageVersion:
      positiveInteger(
        approval.package_version,
        "Canonical package version",
      ),

    legalRuleVersion:
      positiveInteger(
        approval.legal_rule_version,
        "Canonical legal-rule version",
      ),

    intakeAuthorized:
      Boolean(
        approval.intake_authorized,
      ),
  };
}

/* ========================================================================== */
/* Public boundary                                                            */
/* ========================================================================== */

export async function ensureCanonicalJurisdictionPublication({
  packet,
  draft,
  rulePackage,
  actorUserId,
  actorName,
}: {
  packet: JurisdictionEvidencePacket;

  draft: JurisdictionReviewDraft;

  rulePackage: JurisdictionRulePackage;

  actorUserId: string;

  actorName: string;
}): Promise<CanonicalJurisdictionPublicationResult> {
  requireApprovedLocalReview(
    draft,
    rulePackage,
  );

  if (
    packet.evidenceStatus !==
      "complete"
  ) {
    throw new Error(
      "Canonical publication requires a complete evidence packet.",
    );
  }

  if (
    draft.evidenceStatus !==
      "complete"
  ) {
    throw new Error(
      "Canonical publication requires a complete reviewed evidence record.",
    );
  }

  if (
    draft.reviewedFindings.length ===
      0 ||
    draft.selectedSourceIds.length ===
      0
  ) {
    throw new Error(
      "Canonical publication requires the completed human review and selected authority sources.",
    );
  }

  if (
    selectedSources(
      draft,
    ).length ===
      0
  ) {
    throw new Error(
      "Canonical publication requires at least one selected authority source.",
    );
  }

  await ensureEvidencePacket(
    packet,
    draft,
  );

  const canonicalReview =
    await ensureCanonicalReviewDraft(
      draft,
      rulePackage,
    );

  const readyReview =
    await ensureReadyForApproval(
      canonicalReview,
      actorUserId,
      actorName,
    );

  return approveCanonicalReview(
    readyReview,
    actorUserId,
  );
}