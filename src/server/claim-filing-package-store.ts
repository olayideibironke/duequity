import "server-only";

import {
  createHash,
  randomUUID,
} from "node:crypto";

import type {
  Cents,
  DocumentKind,
  IsoDate,
  IsoInstant,
} from "@/domain/types";

import {
  resolveLegalPosition,
} from "@/domain/legal-position";

import {
  getClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import {
  listClaimDocuments,
  resolveClaimDocumentReadiness,
} from "@/server/claim-document-store";

import {
  resolvePersistedClaimFilingReadiness,
} from "@/server/claim-filing-readiness";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  getOpportunityConversionByClaimId,
} from "@/server/opportunity-conversion-store";

import {
  commercialQuoteHasLegalRuleProvenance,
  getCommercialApprovalByQuoteId,
  verifyCommercialQuoteSnapshot,
} from "@/server/commercial-approval-store";

import {
  listJurisdictionRulePackages,
  type JurisdictionPaymentRouting,
} from "@/server/jurisdiction-intelligence";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * CLAIM FILING PACKAGE STORE
 *
 * Durable Supabase-backed filing-package repository.
 *
 * Workflow:
 *
 *   1. Claim satisfies live filing readiness.
 *   2. Filing package is prepared and frozen.
 *   3. Package enters independent human review.
 *   4. A different authorized reviewer approves or returns it.
 *   5. Pre-filing approval unlocks Claim Initiation.
 *
 * No function in this file submits anything externally.
 *
 * SNAPSHOT PRINCIPLE
 *
 * The exact claimant, jurisdiction version, legal rule, payment route,
 * commercial provenance, agreement, accepted documents, deadline, legal lane
 * and readiness controls are frozen into a SHA-256-protected snapshot.
 *
 * PostgreSQL jsonb does not preserve JavaScript object-property order.
 * Therefore package hashing must never depend on the order returned by jsonb.
 *
 * Before hashing, this store reconstructs the snapshot into DueQuity's
 * deterministic filing-package schema order. That gives the same hash before
 * and after a Supabase round trip while still detecting any substantive
 * snapshot mutation.
 *
 * The Supabase table independently enforces immutable snapshot/provenance
 * fields and controlled status transitions.
 */

/* ========================================================================== */
/* Status                                                                      */
/* ========================================================================== */

export type ClaimFilingPackageStatus =
  | "prepared"
  | "under_review"
  | "pre_filing_approved"
  | "returned_for_changes"
  | "superseded";

/* ========================================================================== */
/* Snapshot                                                                    */
/* ========================================================================== */

export interface ClaimFilingPackageDocumentSnapshot {
  kind: DocumentKind;

  documentId: string;

  originalFileName?: string;

  reviewedByUserId?: string;

  reviewedAt?: IsoInstant;
}

export interface ClaimFilingPackageReadinessSnapshot {
  key: string;

  label: string;

  complete: boolean;

  detail: string;
}

export interface ClaimFilingPackageSnapshot {
  claimId: string;

  claimReference: string;

  opportunityId: string;

  jurisdictionId: string;

  jurisdictionPackageVersion: number;

  jurisdictionLegalRuleVersion: number;

  paymentRoute:
    JurisdictionPaymentRouting["paymentRoute"];

  launchPaymentTrack:
    JurisdictionPaymentRouting["launchTrack"];

  representativeMayFile:
    JurisdictionPaymentRouting["representativeMayFile"];

  representativeMayReceivePayment:
    JurisdictionPaymentRouting["representativeMayReceivePayment"];

  assignmentRequiredForRepresentativePayment:
    JurisdictionPaymentRouting["assignmentRequiredForRepresentativePayment"];

  feeCollectionMethod:
    JurisdictionPaymentRouting["feeCollectionMethod"];

  claimantId: string;

  claimantLegalName: string;

  filingDeadline?: IsoDate;

  legalLane: string;

  legalRationale: string;

  legalHumanDetermined: boolean;

  legalReviewedBy?: string;

  legalLastReviewedAt?: IsoDate;

  commercialQuoteId: string;

  commercialSnapshotHash: string;

  commercialPolicyId: string;

  commercialPolicyVersion: number;

  commercialTierId: string;

  commercialRecoveryAmount: Cents;

  commercialProjectedFee: Cents;

  commercialQuoteLegalRuleVersionSnapshot: number;

  commercialLegalFeeCapPercentSnapshot?: number;

  commercialLegalFeeCapAmountSnapshot?: Cents;

  feeAgreementId: string;

  feeAgreementLegalRuleVersionSnapshot: number;

  feeAgreementDocumentId: string;

  serviceAgreementSignedAt: IsoDate;

  serviceAgreementCancellationDeadline?: IsoDate;

  acceptedDocuments:
    ClaimFilingPackageDocumentSnapshot[];

  readinessControls:
    ClaimFilingPackageReadinessSnapshot[];

  readinessCompletedCount: number;

  readinessTotalCount: number;
}

/* ========================================================================== */
/* Filing package                                                              */
/* ========================================================================== */

export interface PersistedClaimFilingPackage {
  id: string;

  claimId: string;

  claimReference: string;

  version: number;

  status: ClaimFilingPackageStatus;

  snapshot: ClaimFilingPackageSnapshot;

  snapshotHash: string;

  preparedByUserId: string;

  preparedAt: IsoInstant;

  submittedForReviewByUserId?: string;

  submittedForReviewAt?: IsoInstant;

  reviewedByUserId?: string;

  reviewedAt?: IsoInstant;

  reviewNote?: string;

  preFilingApprovedAt?: IsoInstant;

  returnedAt?: IsoInstant;

  returnReason?: string;

  supersededAt?: IsoInstant;

  supersededByPackageId?: string;
}

/* ========================================================================== */
/* Audit                                                                       */
/* ========================================================================== */

export type ClaimFilingPackageAuditAction =
  | "filing_package_prepared"
  | "filing_package_submitted_for_review"
  | "filing_package_pre_filing_approved"
  | "filing_package_returned"
  | "filing_package_superseded";

export interface ClaimFilingPackageAuditEntry {
  id: string;

  claimId: string;

  packageId: string;

  action: ClaimFilingPackageAuditAction;

  actorUserId: string;

  occurredAt: IsoInstant;

  detail?: string;
}

/* ========================================================================== */
/* Inputs                                                                      */
/* ========================================================================== */

export interface PrepareClaimFilingPackageInput {
  claimId: string;

  actorUserId: string;

  occurredAt: IsoInstant;
}

export interface SubmitClaimFilingPackageForReviewInput {
  packageId: string;

  actorUserId: string;

  occurredAt: IsoInstant;
}

export interface ApproveClaimFilingPackageInput {
  packageId: string;

  reviewerUserId: string;

  occurredAt: IsoInstant;

  reviewNote?: string;
}

export interface ReturnClaimFilingPackageInput {
  packageId: string;

  reviewerUserId: string;

  occurredAt: IsoInstant;

  reason: string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimFilingPackageRow {
  id: string;

  claim_id: string;

  claim_reference: string;

  version: number;

  status: ClaimFilingPackageStatus;

  snapshot: ClaimFilingPackageSnapshot;

  package_hash: string;

  jurisdiction_package_id: string;

  jurisdiction_package_version: number;

  jurisdiction_legal_rule_version: number;

  commercial_quote_id: string;

  commercial_snapshot_hash: string;

  commercial_policy_id: string;

  commercial_policy_version: number;

  fee_agreement_id: string;

  fee_agreement_legal_rule_version_snapshot: number;

  fee_agreement_document_id: string;

  accepted_documents_snapshot:
    ClaimFilingPackageDocumentSnapshot[];

  readiness_snapshot:
    ClaimFilingPackageReadinessSnapshot[];

  readiness_completed_count: number;

  readiness_total_count: number;

  prepared_by_user_id: string;

  prepared_at: string;

  submitted_for_review_by_user_id: string | null;

  submitted_for_review_at: string | null;

  reviewed_by_user_id: string | null;

  reviewed_at: string | null;

  review_note: string | null;

  pre_filing_approved_at: string | null;

  returned_at: string | null;

  return_reason: string | null;

  superseded_at: string | null;

  superseded_by_package_id: string | null;

  row_version: number;

  updated_at: string;
}

interface ClaimFilingPackageAuditRow {
  id: string;

  claim_id: string;

  package_id: string;

  action: ClaimFilingPackageAuditAction;

  actor_user_id: string;

  occurred_at: string;

  detail: string | null;
}

interface BuiltLiveSnapshot {
  snapshot: ClaimFilingPackageSnapshot;

  jurisdictionPackageId: string;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    ) as IsoDate;
}

function requireNonEmpty(
  value: string,
  label: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function validateIsoInstant(
  value: string,
  label: string,
): IsoInstant {
  if (
    Number.isNaN(
      Date.parse(
        value,
      ),
    )
  ) {
    throw new Error(
      `${label} must be a valid ISO timestamp.`,
    );
  }

  return value;
}

function assertIndependentReviewer(
  filingPackage:
    PersistedClaimFilingPackage,
  reviewerUserId: string,
): void {
  if (
    filingPackage.preparedByUserId ===
    reviewerUserId
  ) {
    throw new Error(
      "The user who prepared the filing package cannot perform its independent pre-filing review.",
    );
  }

  if (
    filingPackage.submittedForReviewByUserId ===
    reviewerUserId
  ) {
    throw new Error(
      "The user who submitted the filing package for review cannot perform its independent pre-filing review.",
    );
  }
}

/* ========================================================================== */
/* Row mapping                                                                 */
/* ========================================================================== */

function packageFromRow(
  row:
    ClaimFilingPackageRow,
): PersistedClaimFilingPackage {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    version:
      Number(
        row.version,
      ),

    status:
      row.status,

    snapshot:
      row.snapshot,

    snapshotHash:
      row.package_hash,

    preparedByUserId:
      row.prepared_by_user_id,

    preparedAt:
      row.prepared_at as IsoInstant,

    submittedForReviewByUserId:
      row.submitted_for_review_by_user_id ??
      undefined,

    submittedForReviewAt:
      row.submitted_for_review_at
        ? row.submitted_for_review_at as IsoInstant
        : undefined,

    reviewedByUserId:
      row.reviewed_by_user_id ??
      undefined,

    reviewedAt:
      row.reviewed_at
        ? row.reviewed_at as IsoInstant
        : undefined,

    reviewNote:
      row.review_note ??
      undefined,

    preFilingApprovedAt:
      row.pre_filing_approved_at
        ? row.pre_filing_approved_at as IsoInstant
        : undefined,

    returnedAt:
      row.returned_at
        ? row.returned_at as IsoInstant
        : undefined,

    returnReason:
      row.return_reason ??
      undefined,

    supersededAt:
      row.superseded_at
        ? row.superseded_at as IsoInstant
        : undefined,

    supersededByPackageId:
      row.superseded_by_package_id ??
      undefined,
  };
}

function auditFromRow(
  row:
    ClaimFilingPackageAuditRow,
): ClaimFilingPackageAuditEntry {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    packageId:
      row.package_id,

    action:
      row.action,

    actorUserId:
      row.actor_user_id,

    occurredAt:
      row.occurred_at as IsoInstant,

    detail:
      row.detail ??
      undefined,
  };
}

/* ========================================================================== */
/* Deterministic snapshot hashing                                              */
/* ========================================================================== */

/**
 * PostgreSQL jsonb is semantically ordered but does not preserve the exact
 * JavaScript object-property order supplied at insert time.
 *
 * Package hashes must therefore be calculated from an explicitly rebuilt
 * DueQuity filing-package schema.
 *
 * This order intentionally matches the original buildLiveSnapshot() object
 * construction order. That preserves compatibility with filing packages
 * created before the Supabase-backed repository was introduced.
 *
 * Array ordering remains significant:
 *
 *   - acceptedDocuments are already deliberately ordered during preparation;
 *   - readinessControls intentionally preserve the operational control order.
 *
 * Optional undefined values are included in this JavaScript object but are
 * automatically omitted by JSON.stringify(), exactly as they were when the
 * original package hash was created.
 */
function deterministicSnapshot(
  snapshot:
    ClaimFilingPackageSnapshot,
): ClaimFilingPackageSnapshot {
  return {
    claimId:
      snapshot.claimId,

    claimReference:
      snapshot.claimReference,

    opportunityId:
      snapshot.opportunityId,

    jurisdictionId:
      snapshot.jurisdictionId,

    jurisdictionPackageVersion:
      snapshot.jurisdictionPackageVersion,

    jurisdictionLegalRuleVersion:
      snapshot.jurisdictionLegalRuleVersion,

    paymentRoute:
      snapshot.paymentRoute,

    launchPaymentTrack:
      snapshot.launchPaymentTrack,

    representativeMayFile:
      snapshot.representativeMayFile,

    representativeMayReceivePayment:
      snapshot.representativeMayReceivePayment,

    assignmentRequiredForRepresentativePayment:
      snapshot.assignmentRequiredForRepresentativePayment,

    feeCollectionMethod:
      snapshot.feeCollectionMethod,

    claimantId:
      snapshot.claimantId,

    claimantLegalName:
      snapshot.claimantLegalName,

    filingDeadline:
      snapshot.filingDeadline,

    legalLane:
      snapshot.legalLane,

    legalRationale:
      snapshot.legalRationale,

    legalHumanDetermined:
      snapshot.legalHumanDetermined,

    legalReviewedBy:
      snapshot.legalReviewedBy,

    legalLastReviewedAt:
      snapshot.legalLastReviewedAt,

    commercialQuoteId:
      snapshot.commercialQuoteId,

    commercialSnapshotHash:
      snapshot.commercialSnapshotHash,

    commercialPolicyId:
      snapshot.commercialPolicyId,

    commercialPolicyVersion:
      snapshot.commercialPolicyVersion,

    commercialTierId:
      snapshot.commercialTierId,

    commercialRecoveryAmount:
      snapshot.commercialRecoveryAmount,

    commercialProjectedFee:
      snapshot.commercialProjectedFee,

    commercialQuoteLegalRuleVersionSnapshot:
      snapshot.commercialQuoteLegalRuleVersionSnapshot,

    commercialLegalFeeCapPercentSnapshot:
      snapshot.commercialLegalFeeCapPercentSnapshot,

    commercialLegalFeeCapAmountSnapshot:
      snapshot.commercialLegalFeeCapAmountSnapshot,

    feeAgreementId:
      snapshot.feeAgreementId,

    feeAgreementLegalRuleVersionSnapshot:
      snapshot.feeAgreementLegalRuleVersionSnapshot,

    feeAgreementDocumentId:
      snapshot.feeAgreementDocumentId,

    serviceAgreementSignedAt:
      snapshot.serviceAgreementSignedAt,

    serviceAgreementCancellationDeadline:
      snapshot.serviceAgreementCancellationDeadline,

    acceptedDocuments:
      snapshot.acceptedDocuments.map(
        (
          document,
        ) => ({
          kind:
            document.kind,

          documentId:
            document.documentId,

          originalFileName:
            document.originalFileName,

          reviewedByUserId:
            document.reviewedByUserId,

          reviewedAt:
            document.reviewedAt,
        }),
      ),

    readinessControls:
      snapshot.readinessControls.map(
        (
          control,
        ) => ({
          key:
            control.key,

          label:
            control.label,

          complete:
            control.complete,

          detail:
            control.detail,
        }),
      ),

    readinessCompletedCount:
      snapshot.readinessCompletedCount,

    readinessTotalCount:
      snapshot.readinessTotalCount,
  };
}

function hashSnapshot(
  snapshot:
    ClaimFilingPackageSnapshot,
): string {
  const normalized =
    deterministicSnapshot(
      snapshot,
    );

  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        normalized,
      ),
      "utf8",
    )
    .digest(
      "hex",
    );
}

export function verifyClaimFilingPackageSnapshot(
  filingPackage:
    PersistedClaimFilingPackage,
): boolean {
  return (
    hashSnapshot(
      filingPackage.snapshot,
    ) ===
    filingPackage.snapshotHash
  );
}

function assertStoredPackageSnapshotIntegrity(
  filingPackage:
    PersistedClaimFilingPackage,
): void {
  if (
    !verifyClaimFilingPackageSnapshot(
      filingPackage,
    )
  ) {
    throw new Error(
      "Filing package snapshot integrity verification failed. The package cannot progress until the persisted record is reviewed.",
    );
  }
}

/* ========================================================================== */
/* Database helpers                                                            */
/* ========================================================================== */

async function getPackageRow(
  packageId: string,
): Promise<
  ClaimFilingPackageRow | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_filing_packages",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        packageId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read filing package: ${error.message}`,
    );
  }

  return data
    ? data as unknown as
        ClaimFilingPackageRow
    : undefined;
}

async function updatePackageRow(
  current:
    ClaimFilingPackageRow,
  values:
    Record<
      string,
      unknown
    >,
): Promise<
  ClaimFilingPackageRow
> {
  const supabase =
    getSupabaseAdmin();

  const expectedVersion =
    Number(
      current.row_version,
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_filing_packages",
      )
      .update(
        values,
      )
      .eq(
        "id",
        current.id,
      )
      .eq(
        "row_version",
        expectedVersion,
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to update filing package: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "The filing package changed while this request was being processed. Reload and try again.",
    );
  }

  return data as unknown as
    ClaimFilingPackageRow;
}

/* ========================================================================== */
/* Audit                                                                       */
/* ========================================================================== */

async function appendAudit(
  input: {
    claimId: string;

    packageId: string;

    action:
      ClaimFilingPackageAuditAction;

    actorUserId: string;

    occurredAt: IsoInstant;

    detail?: string;
  },
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } =
    await supabase
      .from(
        "claim_filing_package_audit",
      )
      .insert({
        id:
          randomUUID(),

        claim_id:
          input.claimId,

        package_id:
          input.packageId,

        action:
          input.action,

        actor_user_id:
          input.actorUserId,

        occurred_at:
          input.occurredAt,

        detail:
          input.detail ??
          null,
      });

  if (error) {
    throw new Error(
      `Unable to write filing-package audit: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listClaimFilingPackages(
  claimId?: string,
): Promise<
  PersistedClaimFilingPackage[]
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claim_filing_packages",
      )
      .select(
        "*",
      )
      .order(
        "version",
        {
          ascending:
            false,
        },
      );

  if (claimId) {
    query =
      query.eq(
        "claim_id",
        claimId.trim(),
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw new Error(
      `Unable to list filing packages: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      packageFromRow(
        row as unknown as
          ClaimFilingPackageRow,
      ),
  );
}

export async function getClaimFilingPackage(
  packageId: string,
): Promise<
  PersistedClaimFilingPackage | undefined
> {
  const row =
    await getPackageRow(
      packageId,
    );

  return row
    ? packageFromRow(
        row,
      )
    : undefined;
}

export async function getCurrentClaimFilingPackage(
  claimId: string,
): Promise<
  PersistedClaimFilingPackage | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_filing_packages",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId.trim(),
      )
      .neq(
        "status",
        "superseded",
      )
      .order(
        "version",
        {
          ascending:
            false,
        },
      )
      .limit(
        2,
      );

  if (error) {
    throw new Error(
      `Unable to read current filing package: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as unknown as
      ClaimFilingPackageRow[];

  if (
    rows.length >
    1
  ) {
    throw new Error(
      "Multiple active filing packages exist for this claim. Filing workflow is blocked pending repository review.",
    );
  }

  return rows[0]
    ? packageFromRow(
        rows[0],
      )
    : undefined;
}

export async function claimFilingPackageAudit(
  claimId?: string,
): Promise<
  ClaimFilingPackageAuditEntry[]
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claim_filing_package_audit",
      )
      .select(
        "*",
      )
      .order(
        "occurred_at",
        {
          ascending:
            false,
        },
      );

  if (claimId) {
    query =
      query.eq(
        "claim_id",
        claimId.trim(),
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw new Error(
      `Unable to read filing-package audit: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      auditFromRow(
        row as unknown as
          ClaimFilingPackageAuditRow,
      ),
  );
}

/* ========================================================================== */
/* Live snapshot builder                                                       */
/* ========================================================================== */

async function buildLiveSnapshot(
  claimId: string,
): Promise<
  BuiltLiveSnapshot
> {
  const resolved =
    await resolveClaimRecord(
      claimId,
    );

  if (!resolved) {
    throw new Error(
      "Claim not found.",
    );
  }

  const claim =
    resolved.claim;

  const jurisdictionPackages =
    await listJurisdictionRulePackages();

  const jurisdictionPackage =
    jurisdictionPackages
      .filter(
        (
          rulePackage,
        ) =>
          rulePackage.status ===
            "approved" &&
          rulePackage.rule?.id ===
            claim.jurisdictionId,
      )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          right.version -
          left.version,
      )[0];

  const jurisdiction =
    jurisdictionPackage?.rule;

  if (
    !jurisdictionPackage ||
    !jurisdiction
  ) {
    throw new Error(
      "No current approved jurisdiction rule is published for this claim.",
    );
  }

  const jurisdictionPackageId =
    requireNonEmpty(
      jurisdictionPackage.id,
      "Jurisdiction package ID",
    );

  const jurisdictionLegalRuleVersion =
    jurisdiction.legalRuleVersion;

  if (
    jurisdictionLegalRuleVersion ===
      undefined ||
    !Number.isInteger(
      jurisdictionLegalRuleVersion,
    ) ||
    jurisdictionLegalRuleVersion <
      1
  ) {
    throw new Error(
      "The current approved jurisdiction does not have a valid legal-rule version. Filing-package preparation is blocked.",
    );
  }

  const paymentRouting =
    jurisdictionPackage.paymentRouting;

  if (!paymentRouting) {
    throw new Error(
      "The current approved jurisdiction does not have a frozen payment-routing determination. Filing-package preparation is blocked.",
    );
  }

  const today =
    currentIsoDate();

  const readiness =
    await resolvePersistedClaimFilingReadiness(
      claim,
      jurisdiction,
      today,
    );

  if (
    !readiness.readyToPrepare
  ) {
    throw new Error(
      `Claim is not ready to prepare. ${readiness.outstandingControlCount} filing-readiness control${
        readiness.outstandingControlCount ===
        1
          ? " remains"
          : "s remain"
      } outstanding.`,
    );
  }

  const onboarding =
    await getClaimantOnboarding(
      claim.id,
    );

  if (!onboarding) {
    throw new Error(
      "Persisted claimant onboarding could not be resolved.",
    );
  }

  if (
    onboarding.claimant
      .identityVerification !==
    "verified"
  ) {
    throw new Error(
      "Claimant identity is not verified.",
    );
  }

  if (
    !onboarding.serviceAgreement
  ) {
    throw new Error(
      "A signed claimant service agreement is required before preparing the filing package.",
    );
  }

  const conversion =
    await getOpportunityConversionByClaimId(
      claim.id,
    );

  if (!conversion) {
    throw new Error(
      "Opportunity conversion could not be resolved.",
    );
  }

  const commercialApproval =
    await getCommercialApprovalByQuoteId(
      conversion.commercialQuoteId,
    );

  if (
    !commercialApproval ||
    commercialApproval.approvalStatus !==
      "locked"
  ) {
    throw new Error(
      "The commercial pricing snapshot is not locked.",
    );
  }

  if (
    !verifyCommercialQuoteSnapshot(
      commercialApproval,
    )
  ) {
    throw new Error(
      "Commercial pricing snapshot integrity verification failed.",
    );
  }

  if (
    commercialApproval.snapshotHash !==
    conversion.commercialSnapshotHash
  ) {
    throw new Error(
      "Commercial pricing snapshot does not match the conversion record.",
    );
  }

  if (
    commercialApproval.lockedFeeAgreementId !==
    conversion.feeAgreementId
  ) {
    throw new Error(
      "Commercial pricing lock is not bound to the expected fee agreement record.",
    );
  }

  const commercialQuote =
    commercialApproval.quoteSnapshot;

  if (
    !commercialQuoteHasLegalRuleProvenance(
      commercialQuote,
    )
  ) {
    throw new Error(
      "The locked commercial quote does not contain a valid legal-rule version snapshot.",
    );
  }

  const commercialQuoteLegalRuleVersionSnapshot =
    commercialQuote
      .legalRuleVersionSnapshot;

  if (
    commercialQuoteLegalRuleVersionSnapshot ===
    undefined
  ) {
    throw new Error(
      "The locked commercial quote legal-rule version could not be resolved.",
    );
  }

  const feeAgreement =
    claim.feeAgreement;

  if (!feeAgreement) {
    throw new Error(
      "The Claim fee agreement could not be resolved.",
    );
  }

  const feeAgreementLegalRuleVersionSnapshot =
    feeAgreement
      .legalRuleVersionSnapshot;

  if (
    feeAgreementLegalRuleVersionSnapshot ===
      undefined ||
    !Number.isInteger(
      feeAgreementLegalRuleVersionSnapshot,
    ) ||
    feeAgreementLegalRuleVersionSnapshot <
      1
  ) {
    throw new Error(
      "The Claim fee agreement does not contain a valid legal-rule version snapshot.",
    );
  }

  if (
    commercialQuoteLegalRuleVersionSnapshot !==
    feeAgreementLegalRuleVersionSnapshot
  ) {
    throw new Error(
      "The locked commercial quote and Claim fee agreement do not reference the same legal-rule version.",
    );
  }

  if (
    commercialQuoteLegalRuleVersionSnapshot !==
    jurisdictionLegalRuleVersion
  ) {
    throw new Error(
      "The jurisdiction legal rule changed after commercial pricing or agreement creation. Prepare a new compliant pricing and agreement workflow before filing.",
    );
  }

  if (
    feeAgreement.commercialFeeQuoteId !==
      conversion.commercialQuoteId ||
    feeAgreement.id !==
      conversion.feeAgreementId
  ) {
    throw new Error(
      "The Claim fee agreement does not match the persisted opportunity conversion.",
    );
  }

  if (
    feeAgreement.commercialPolicyId !==
      commercialQuote.commercialPolicyId ||
    feeAgreement.commercialPolicyVersion !==
      commercialQuote.commercialPolicyVersion
  ) {
    throw new Error(
      "The Claim fee agreement commercial-policy snapshot does not match the locked quote.",
    );
  }

  const feeAgreementDocumentId =
    onboarding.serviceAgreement.documentId?.trim();

  if (
    !feeAgreementDocumentId
  ) {
    throw new Error(
      "The executed service-agreement document could not be resolved.",
    );
  }

  const documentReadiness =
    await resolveClaimDocumentReadiness(
      claim.id,
    );

  const documents =
    await listClaimDocuments(
      claim.id,
    );

  const estateHandlingRequired =
    jurisdiction
      .probateRequiredWhenDeceased &&
    claim.flags.some(
      (
        flag,
      ) =>
        flag.kind ===
          "deceased_owner" ||
        flag.kind ===
          "probate_required",
    );

  const requiredDocumentKinds =
    jurisdiction.requiredDocuments.filter(
      (
        kind,
      ) =>
        kind !==
          "letters_of_administration" ||
        estateHandlingRequired,
    );

  const acceptedDocumentSnapshots:
    ClaimFilingPackageDocumentSnapshot[] =
      [];

  for (
    const kind of
    requiredDocumentKinds
  ) {
    const request =
      documentReadiness.requiredRequests.find(
        (
          candidate,
        ) =>
          candidate.kind ===
          kind,
      );

    if (
      !request ||
      request.status !==
        "accepted" ||
      !request.fulfilledByDocumentId
    ) {
      throw new Error(
        `Accepted evidence is missing for ${kind.replaceAll(
          "_",
          " ",
        )}.`,
      );
    }

    const document =
      documents.find(
        (
          candidate,
        ) =>
          candidate.id ===
            request.fulfilledByDocumentId &&
          candidate.kind ===
            kind &&
          candidate.status ===
            "accepted",
      );

    if (!document) {
      throw new Error(
        `The accepted ${kind.replaceAll(
          "_",
          " ",
        )} document could not be resolved.`,
      );
    }

    acceptedDocumentSnapshots.push({
      kind,

      documentId:
        document.id,

      originalFileName:
        document.originalFileName,

      reviewedByUserId:
        document.reviewedByUserId,

      reviewedAt:
        document.reviewedAt,
    });
  }

  acceptedDocumentSnapshots.sort(
    (
      left,
      right,
    ) =>
      left.kind.localeCompare(
        right.kind,
      ),
  );

  const legalPosition =
    resolveLegalPosition(
      claim,
      jurisdiction,
      today,
    );

  const snapshot:
    ClaimFilingPackageSnapshot =
      {
        claimId:
          claim.id,

        claimReference:
          claim.reference,

        opportunityId:
          claim.opportunityId,

        jurisdictionId:
          claim.jurisdictionId,

        jurisdictionPackageVersion:
          jurisdictionPackage.version,

        jurisdictionLegalRuleVersion,

        paymentRoute:
          paymentRouting.paymentRoute,

        launchPaymentTrack:
          paymentRouting.launchTrack,

        representativeMayFile:
          paymentRouting.representativeMayFile,

        representativeMayReceivePayment:
          paymentRouting.representativeMayReceivePayment,

        assignmentRequiredForRepresentativePayment:
          paymentRouting.assignmentRequiredForRepresentativePayment,

        feeCollectionMethod:
          paymentRouting.feeCollectionMethod,

        claimantId:
          onboarding.claimant.id,

        claimantLegalName:
          onboarding.claimant.legalName,

        filingDeadline:
          claim.filingDeadline,

        legalLane:
          legalPosition.lane,

        legalRationale:
          legalPosition.rationale,

        legalHumanDetermined:
          legalPosition.humanDetermined,

        legalReviewedBy:
          legalPosition.reviewedBy,

        legalLastReviewedAt:
          legalPosition.lastReviewedAt,

        commercialQuoteId:
          conversion.commercialQuoteId,

        commercialSnapshotHash:
          conversion.commercialSnapshotHash,

        commercialPolicyId:
          commercialQuote.commercialPolicyId,

        commercialPolicyVersion:
          commercialQuote.commercialPolicyVersion,

        commercialTierId:
          commercialQuote.commercialTierId,

        commercialRecoveryAmount:
          commercialQuote.recoveryAmount,

        commercialProjectedFee:
          commercialQuote.projectedFee,

        commercialQuoteLegalRuleVersionSnapshot,

        commercialLegalFeeCapPercentSnapshot:
          commercialQuote
            .legalFeeCapPercentSnapshot,

        commercialLegalFeeCapAmountSnapshot:
          commercialQuote
            .legalFeeCapAmountSnapshot,

        feeAgreementId:
          conversion.feeAgreementId,

        feeAgreementLegalRuleVersionSnapshot,

        feeAgreementDocumentId,

        serviceAgreementSignedAt:
          onboarding.serviceAgreement
            .signedAt,

        serviceAgreementCancellationDeadline:
          onboarding.serviceAgreement
            .cancellationDeadline,

        acceptedDocuments:
          acceptedDocumentSnapshots,

        readinessControls:
          readiness.controls.map(
            (
              control,
            ) => ({
              key:
                control.key,

              label:
                control.label,

              complete:
                control.complete,

              detail:
                control.detail,
            }),
          ),

        readinessCompletedCount:
          readiness.completedControlCount,

        readinessTotalCount:
          readiness.controls.length,
      };

  return {
    snapshot,

    jurisdictionPackageId,
  };
}

/* ========================================================================== */
/* Current snapshot verification                                               */
/* ========================================================================== */

async function assertPackageStillCurrent(
  filingPackage:
    PersistedClaimFilingPackage,
): Promise<void> {
  assertStoredPackageSnapshotIntegrity(
    filingPackage,
  );

  const live =
    await buildLiveSnapshot(
      filingPackage.claimId,
    );

  const liveHash =
    hashSnapshot(
      live.snapshot,
    );

  if (
    liveHash !==
    filingPackage.snapshotHash
  ) {
    throw new Error(
      "The claim evidence changed after this filing package was prepared. Prepare a new filing package before approval.",
    );
  }
}

/* ========================================================================== */
/* Prepare                                                                     */
/* ========================================================================== */

export async function prepareClaimFilingPackage(
  input:
    PrepareClaimFilingPackageInput,
): Promise<
  PersistedClaimFilingPackage
> {
  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const live =
    await buildLiveSnapshot(
      input.claimId,
    );

  const snapshot =
    live.snapshot;

  const snapshotHash =
    hashSnapshot(
      snapshot,
    );

  const existing =
    await listClaimFilingPackages(
      snapshot.claimId,
    );

  const activePackages =
    existing.filter(
      (
        filingPackage,
      ) =>
        filingPackage.status !==
        "superseded",
    );

  if (
    activePackages.length >
    1
  ) {
    throw new Error(
      "Multiple active filing packages exist for this claim. Filing-package preparation is blocked pending repository cleanup.",
    );
  }

  const activePackage =
    activePackages[0];

  if (activePackage) {
    assertStoredPackageSnapshotIntegrity(
      activePackage,
    );

    if (
      activePackage.status ===
        "prepared" &&
      activePackage.snapshotHash ===
        snapshotHash
    ) {
      return activePackage;
    }

    if (
      activePackage.status !==
      "returned_for_changes"
    ) {
      throw new Error(
        "A current filing package already exists. Only a package returned for changes may be prepared again.",
      );
    }
  }

  const existingVersions =
    existing.map(
      (
        filingPackage,
      ) =>
        filingPackage.version,
    );

  const nextVersion =
    (
      existingVersions.length >
      0
        ? Math.max(
            ...existingVersions,
          )
        : 0
    ) + 1;

  const packageId =
    `filing-package-${snapshot.claimId}-v${nextVersion}`;

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_filing_packages",
      )
      .insert({
        id:
          packageId,

        claim_id:
          snapshot.claimId,

        claim_reference:
          snapshot.claimReference,

        version:
          nextVersion,

        status:
          "prepared",

        snapshot,

        package_hash:
          snapshotHash,

        jurisdiction_package_id:
          live.jurisdictionPackageId,

        jurisdiction_package_version:
          snapshot.jurisdictionPackageVersion,

        jurisdiction_legal_rule_version:
          snapshot.jurisdictionLegalRuleVersion,

        commercial_quote_id:
          snapshot.commercialQuoteId,

        commercial_snapshot_hash:
          snapshot.commercialSnapshotHash,

        commercial_policy_id:
          snapshot.commercialPolicyId,

        commercial_policy_version:
          snapshot.commercialPolicyVersion,

        fee_agreement_id:
          snapshot.feeAgreementId,

        fee_agreement_legal_rule_version_snapshot:
          snapshot.feeAgreementLegalRuleVersionSnapshot,

        fee_agreement_document_id:
          snapshot.feeAgreementDocumentId,

        accepted_documents_snapshot:
          snapshot.acceptedDocuments,

        readiness_snapshot:
          snapshot.readinessControls,

        readiness_completed_count:
          snapshot.readinessCompletedCount,

        readiness_total_count:
          snapshot.readinessTotalCount,

        prepared_by_user_id:
          actorUserId,

        prepared_at:
          occurredAt,
      })
      .select(
        "*",
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to persist filing package: ${error.message}`,
    );
  }

  const insertedRow =
    data as unknown as
      ClaimFilingPackageRow;

  if (activePackage) {
    const oldRow =
      await getPackageRow(
        activePackage.id,
      );

    if (!oldRow) {
      throw new Error(
        "The returned filing package could not be resolved for supersession.",
      );
    }

    await updatePackageRow(
      oldRow,
      {
        status:
          "superseded",

        superseded_at:
          occurredAt,

        superseded_by_package_id:
          packageId,
      },
    );

    await appendAudit({
      claimId:
        activePackage.claimId,

      packageId:
        activePackage.id,

      action:
        "filing_package_superseded",

      actorUserId,

      occurredAt,

      detail:
        `Superseded by ${packageId} after the prior package was returned for changes and a new frozen package version was prepared.`,
    });
  }

  await appendAudit({
    claimId:
      snapshot.claimId,

    packageId,

    action:
      "filing_package_prepared",

    actorUserId,

    occurredAt,

    detail:
      `${snapshot.readinessCompletedCount} of ${snapshot.readinessTotalCount} filing-readiness controls were captured as complete. ${snapshot.acceptedDocuments.length} accepted document${snapshot.acceptedDocuments.length === 1 ? "" : "s"} frozen into package version ${nextVersion}.`,
  });

  return packageFromRow(
    insertedRow,
  );
}

/* ========================================================================== */
/* Submit for review                                                           */
/* ========================================================================== */

export async function submitClaimFilingPackageForReview(
  input:
    SubmitClaimFilingPackageForReviewInput,
): Promise<
  PersistedClaimFilingPackage
> {
  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const row =
    await getPackageRow(
      input.packageId,
    );

  if (!row) {
    throw new Error(
      "Filing package not found.",
    );
  }

  const filingPackage =
    packageFromRow(
      row,
    );

  if (
    filingPackage.status ===
    "superseded"
  ) {
    throw new Error(
      "A superseded filing package cannot be submitted for review.",
    );
  }

  if (
    filingPackage.status ===
      "under_review" ||
    filingPackage.status ===
      "pre_filing_approved"
  ) {
    assertStoredPackageSnapshotIntegrity(
      filingPackage,
    );

    return filingPackage;
  }

  if (
    filingPackage.status !==
    "prepared"
  ) {
    throw new Error(
      filingPackage.status ===
        "returned_for_changes"
        ? "A package returned for changes must be prepared as a new package version before it can be submitted for review again."
        : "Only a prepared filing package may be submitted for review.",
    );
  }

  await assertPackageStillCurrent(
    filingPackage,
  );

  const updatedRow =
    await updatePackageRow(
      row,
      {
        status:
          "under_review",

        submitted_for_review_by_user_id:
          actorUserId,

        submitted_for_review_at:
          occurredAt,

        reviewed_by_user_id:
          null,

        reviewed_at:
          null,

        review_note:
          null,

        pre_filing_approved_at:
          null,

        returned_at:
          null,

        return_reason:
          null,
      },
    );

  await appendAudit({
    claimId:
      filingPackage.claimId,

    packageId:
      filingPackage.id,

    action:
      "filing_package_submitted_for_review",

    actorUserId,

    occurredAt,

    detail:
      "Package submitted for independent human pre-filing review.",
  });

  return packageFromRow(
    updatedRow,
  );
}

/* ========================================================================== */
/* Approve                                                                     */
/* ========================================================================== */

export async function approveClaimFilingPackage(
  input:
    ApproveClaimFilingPackageInput,
): Promise<
  PersistedClaimFilingPackage
> {
  const reviewerUserId =
    requireNonEmpty(
      input.reviewerUserId,
      "Reviewer user ID",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const row =
    await getPackageRow(
      input.packageId,
    );

  if (!row) {
    throw new Error(
      "Filing package not found.",
    );
  }

  const filingPackage =
    packageFromRow(
      row,
    );

  if (
    filingPackage.status ===
    "superseded"
  ) {
    throw new Error(
      "A superseded filing package cannot be approved.",
    );
  }

  if (
    filingPackage.status ===
    "pre_filing_approved"
  ) {
    assertStoredPackageSnapshotIntegrity(
      filingPackage,
    );

    return filingPackage;
  }

  if (
    filingPackage.status !==
    "under_review"
  ) {
    throw new Error(
      "The filing package must be under human review before it can receive pre-filing approval.",
    );
  }

  assertIndependentReviewer(
    filingPackage,
    reviewerUserId,
  );

  await assertPackageStillCurrent(
    filingPackage,
  );

  const reviewNote =
    input.reviewNote?.trim() ||
    undefined;

  const updatedRow =
    await updatePackageRow(
      row,
      {
        status:
          "pre_filing_approved",

        reviewed_by_user_id:
          reviewerUserId,

        reviewed_at:
          occurredAt,

        review_note:
          reviewNote ??
          null,

        pre_filing_approved_at:
          occurredAt,

        returned_at:
          null,

        return_reason:
          null,
      },
    );

  await appendAudit({
    claimId:
      filingPackage.claimId,

    packageId:
      filingPackage.id,

    action:
      "filing_package_pre_filing_approved",

    actorUserId:
      reviewerUserId,

    occurredAt,

    detail:
      reviewNote ||
      "Independent human pre-filing review approved the frozen package snapshot.",
  });

  return packageFromRow(
    updatedRow,
  );
}

/* ========================================================================== */
/* Return for changes                                                          */
/* ========================================================================== */

export async function returnClaimFilingPackage(
  input:
    ReturnClaimFilingPackageInput,
): Promise<
  PersistedClaimFilingPackage
> {
  const reviewerUserId =
    requireNonEmpty(
      input.reviewerUserId,
      "Reviewer user ID",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const reason =
    requireNonEmpty(
      input.reason,
      "Return reason",
    );

  const row =
    await getPackageRow(
      input.packageId,
    );

  if (!row) {
    throw new Error(
      "Filing package not found.",
    );
  }

  const filingPackage =
    packageFromRow(
      row,
    );

  if (
    filingPackage.status ===
    "superseded"
  ) {
    throw new Error(
      "A superseded filing package cannot be returned.",
    );
  }

  if (
    filingPackage.status !==
    "under_review"
  ) {
    throw new Error(
      "Only a package currently under review can be returned for changes.",
    );
  }

  assertStoredPackageSnapshotIntegrity(
    filingPackage,
  );

  assertIndependentReviewer(
    filingPackage,
    reviewerUserId,
  );

  const updatedRow =
    await updatePackageRow(
      row,
      {
        status:
          "returned_for_changes",

        reviewed_by_user_id:
          reviewerUserId,

        reviewed_at:
          occurredAt,

        returned_at:
          occurredAt,

        return_reason:
          reason,

        review_note:
          null,

        pre_filing_approved_at:
          null,
      },
    );

  await appendAudit({
    claimId:
      filingPackage.claimId,

    packageId:
      filingPackage.id,

    action:
      "filing_package_returned",

    actorUserId:
      reviewerUserId,

    occurredAt,

    detail:
      `Returned for changes. Reason: ${reason}`,
  });

  return packageFromRow(
    updatedRow,
  );
}