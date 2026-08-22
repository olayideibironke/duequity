import "server-only";

import { createHash } from "node:crypto";
import type { CommercialFeeQuote, IsoInstant } from "@/domain/types";
import { getSupabaseAdmin } from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type PersistedCommercialApprovalStatus =
  CommercialFeeQuote["approvalStatus"];

export type CommercialApprovalLevel = "staff" | "manager";

export type CommercialApprovalAuditAction =
  | "quote_saved"
  | "staff_approved"
  | "manager_review_requested"
  | "manager_approved"
  | "quote_rejected"
  | "quote_locked";

export interface PersistedCommercialApproval {
  quoteId: string;
  opportunityId: string;
  jurisdictionId: string;

  commercialPolicyId: string;
  commercialPolicyVersion: number;
  commercialTierId: string;

  quoteSnapshot: CommercialFeeQuote;

  snapshotHash: string;

  approvalStatus: PersistedCommercialApprovalStatus;

  approvalReason?: string;

  approvedByUserId?: string;
  approvedAt?: IsoInstant;

  managerReviewedByUserId?: string;
  managerReviewedAt?: IsoInstant;

  rejectedByUserId?: string;
  rejectedAt?: IsoInstant;
  rejectionReason?: string;

  lockedFeeAgreementId?: string;
  lockedAt?: IsoInstant;

  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface CommercialApprovalAuditEntry {
  id: string;

  quoteId: string;
  opportunityId: string;

  action: CommercialApprovalAuditAction;

  actorUserId: string;
  occurredAt: IsoInstant;

  previousStatus?: PersistedCommercialApprovalStatus;
  nextStatus: PersistedCommercialApprovalStatus;

  commercialPolicyId: string;
  commercialPolicyVersion: number;

  legalRuleVersionSnapshot?: number;

  snapshotHash: string;

  reason?: string;
}

export interface SaveCommercialQuoteInput {
  quote: CommercialFeeQuote;
  actorUserId: string;
  occurredAt: IsoInstant;
}

export interface ApproveCommercialQuoteInput {
  quoteId: string;
  actorUserId: string;
  approvalLevel: CommercialApprovalLevel;
  occurredAt: IsoInstant;
  reason?: string;
}

export interface RejectCommercialQuoteInput {
  quoteId: string;
  actorUserId: string;
  occurredAt: IsoInstant;
  reason: string;
}

export interface LockCommercialQuoteInput {
  quoteId: string;
  feeAgreementId: string;
  actorUserId: string;
  occurredAt: IsoInstant;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface CommercialFeeQuoteRow {
  quote_id: string;
  opportunity_id: string;
  jurisdiction_id: string;

  commercial_policy_id: string;
  commercial_policy_version: number | string;
  commercial_tier_id: string;

  quote_snapshot: unknown;
  snapshot_hash: string;

  recovery_amount_cents: number | string;
  recovery_basis: CommercialFeeQuote["recoveryBasis"];
  fee_model: CommercialFeeQuote["model"];

  selected_percentage: number | string | null;
  selected_flat_amount_cents: number | string | null;

  projected_fee_cents: number | string;
  projected_claimant_net_cents: number | string;

  legal_rule_version_snapshot: number | string | null;
  legal_fee_cap_percent_snapshot: number | string | null;
  legal_fee_cap_amount_snapshot_cents: number | string | null;

  commercial_staff_floor_percent_snapshot: number | string | null;
  commercial_staff_ceiling_percent_snapshot: number | string | null;
  commercial_manager_ceiling_percent_snapshot: number | string | null;

  commercial_staff_floor_amount_snapshot_cents: number | string | null;
  commercial_staff_ceiling_amount_snapshot_cents: number | string | null;
  commercial_manager_ceiling_amount_snapshot_cents: number | string | null;

  internal_fee_cap_amount_snapshot_cents: number | string | null;
  minimum_viable_fee_snapshot_cents: number | string | null;

  viability_status: CommercialFeeQuote["viabilityStatus"];
  approval_status: PersistedCommercialApprovalStatus;
  approval_reason: string | null;

  approved_by_user_id: string | null;
  approved_at: string | null;

  manager_reviewed_by_user_id: string | null;
  manager_reviewed_at: string | null;

  rejected_by_user_id: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;

  locked_fee_agreement_id: string | null;
  locked_at: string | null;

  created_by_user_id: string;
  created_at: string;
  updated_at: string;

  row_version: number | string;
}

interface CommercialFeeQuoteAuditRow {
  id: string;

  quote_id: string;
  opportunity_id: string;

  action: CommercialApprovalAuditAction;

  actor_user_id: string;
  occurred_at: string;

  previous_status: PersistedCommercialApprovalStatus | null;
  next_status: PersistedCommercialApprovalStatus;

  commercial_policy_id: string;
  commercial_policy_version: number | string;

  legal_rule_version_snapshot: number | string | null;

  snapshot_hash: string;

  reason: string | null;
}

interface OpportunityCommercialQuoteRow {
  id: string;
  active_commercial_fee_quote_id: string | null;
  row_version: number | string;
}

/* ========================================================================== */
/* Numeric helpers                                                             */
/* ========================================================================== */

function requiredNumber(
  value: number | string,
  label: string,
): number {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${label} is invalid.`);
  }

  return number;
}

function optionalNumber(
  value: number | string | null,
): number | undefined {
  if (value === null) {
    return undefined;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : undefined;
}

function rowVersion(row: CommercialFeeQuoteRow): number {
  const version = Number(row.row_version);

  if (!Number.isInteger(version) || version < 1) {
    throw new Error(
      "Commercial fee quote has an invalid database row version.",
    );
  }

  return version;
}

/* ========================================================================== */
/* Stable snapshot integrity                                                   */
/* ========================================================================== */

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const source = value as Record<string, unknown>;

    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>(
        (result, key) => {
          result[key] = canonicalize(source[key]);
          return result;
        },
        {},
      );
  }

  return value;
}

function quoteSnapshotHash(
  quote: CommercialFeeQuote,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(canonicalize(quote)),
      "utf8",
    )
    .digest("hex");
}

export function commercialQuoteHasLegalRuleProvenance(
  quote: CommercialFeeQuote,
): boolean {
  const version = quote.legalRuleVersionSnapshot;

  return (
    version !== undefined &&
    Number.isInteger(version) &&
    version >= 1
  );
}

function quoteSnapshotMetadataMatchesRecord(
  record: PersistedCommercialApproval,
): boolean {
  const quote = record.quoteSnapshot;

  return (
    quote.id === record.quoteId &&
    quote.opportunityId === record.opportunityId &&
    quote.jurisdictionId === record.jurisdictionId &&
    quote.commercialPolicyId === record.commercialPolicyId &&
    quote.commercialPolicyVersion ===
      record.commercialPolicyVersion &&
    quote.commercialTierId === record.commercialTierId
  );
}

export function verifyCommercialQuoteSnapshot(
  record: PersistedCommercialApproval,
): boolean {
  return (
    quoteSnapshotHash(record.quoteSnapshot) ===
      record.snapshotHash &&
    quoteSnapshotMetadataMatchesRecord(record)
  );
}

function assertQuoteOperationallyApprovable(
  record: PersistedCommercialApproval,
  actionLabel: string,
): void {
  if (!verifyCommercialQuoteSnapshot(record)) {
    throw new Error(
      `Commercial quote snapshot integrity check failed. ${actionLabel} is blocked.`,
    );
  }

  if (
    !commercialQuoteHasLegalRuleProvenance(
      record.quoteSnapshot,
    )
  ) {
    throw new Error(
      `Commercial quote is missing a valid jurisdiction legal-rule version snapshot. ${actionLabel} is blocked until the quote is recalculated from a current approved versioned jurisdiction rule.`,
    );
  }
}

/* ========================================================================== */
/* Row mapping                                                                 */
/* ========================================================================== */

function quoteSnapshotFromRow(
  row: CommercialFeeQuoteRow,
): CommercialFeeQuote {
  if (
    row.quote_snapshot === null ||
    typeof row.quote_snapshot !== "object" ||
    Array.isArray(row.quote_snapshot)
  ) {
    throw new Error(
      "Commercial fee quote contains an invalid snapshot.",
    );
  }

  return row.quote_snapshot as CommercialFeeQuote;
}

function approvalFromRow(
  row: CommercialFeeQuoteRow,
): PersistedCommercialApproval {
  return {
    quoteId: row.quote_id,
    opportunityId: row.opportunity_id,
    jurisdictionId: row.jurisdiction_id,

    commercialPolicyId: row.commercial_policy_id,

    commercialPolicyVersion: requiredNumber(
      row.commercial_policy_version,
      "Commercial policy version",
    ),

    commercialTierId: row.commercial_tier_id,

    quoteSnapshot: quoteSnapshotFromRow(row),

    snapshotHash: row.snapshot_hash,

    approvalStatus: row.approval_status,

    approvalReason:
      row.approval_reason ?? undefined,

    approvedByUserId:
      row.approved_by_user_id ?? undefined,

    approvedAt:
      (row.approved_at as IsoInstant | null) ??
      undefined,

    managerReviewedByUserId:
      row.manager_reviewed_by_user_id ?? undefined,

    managerReviewedAt:
      (row.manager_reviewed_at as IsoInstant | null) ??
      undefined,

    rejectedByUserId:
      row.rejected_by_user_id ?? undefined,

    rejectedAt:
      (row.rejected_at as IsoInstant | null) ??
      undefined,

    rejectionReason:
      row.rejection_reason ?? undefined,

    lockedFeeAgreementId:
      row.locked_fee_agreement_id ?? undefined,

    lockedAt:
      (row.locked_at as IsoInstant | null) ??
      undefined,

    createdAt: row.created_at as IsoInstant,
    updatedAt: row.updated_at as IsoInstant,
  };
}

function auditFromRow(
  row: CommercialFeeQuoteAuditRow,
): CommercialApprovalAuditEntry {
  return {
    id: row.id,

    quoteId: row.quote_id,
    opportunityId: row.opportunity_id,

    action: row.action,

    actorUserId: row.actor_user_id,
    occurredAt: row.occurred_at as IsoInstant,

    previousStatus:
      row.previous_status ?? undefined,

    nextStatus: row.next_status,

    commercialPolicyId: row.commercial_policy_id,

    commercialPolicyVersion: requiredNumber(
      row.commercial_policy_version,
      "Commercial audit policy version",
    ),

    legalRuleVersionSnapshot:
      optionalNumber(
        row.legal_rule_version_snapshot,
      ),

    snapshotHash: row.snapshot_hash,

    reason: row.reason ?? undefined,
  };
}

/* ========================================================================== */
/* Quote database payload                                                      */
/* ========================================================================== */

function calculatedQuotePayload(
  quote: CommercialFeeQuote,
  snapshotHash: string,
) {
  return {
    quote_id: quote.id,

    opportunity_id: quote.opportunityId,
    jurisdiction_id: quote.jurisdictionId,

    commercial_policy_id:
      quote.commercialPolicyId,

    commercial_policy_version:
      quote.commercialPolicyVersion,

    commercial_tier_id:
      quote.commercialTierId,

    quote_snapshot: quote,

    snapshot_hash: snapshotHash,

    recovery_amount_cents:
      quote.recoveryAmount,

    recovery_basis:
      quote.recoveryBasis,

    fee_model:
      quote.model,

    selected_percentage:
      quote.selectedPercentage ?? null,

    selected_flat_amount_cents:
      quote.selectedFlatAmount ?? null,

    projected_fee_cents:
      quote.projectedFee,

    projected_claimant_net_cents:
      quote.projectedClaimantNet,

    legal_rule_version_snapshot:
      quote.legalRuleVersionSnapshot ?? null,

    legal_fee_cap_percent_snapshot:
      quote.legalFeeCapPercentSnapshot ?? null,

    legal_fee_cap_amount_snapshot_cents:
      quote.legalFeeCapAmountSnapshot ?? null,

    commercial_staff_floor_percent_snapshot:
      quote.commercialStaffFloorPercentSnapshot ??
      null,

    commercial_staff_ceiling_percent_snapshot:
      quote.commercialStaffCeilingPercentSnapshot ??
      null,

    commercial_manager_ceiling_percent_snapshot:
      quote.commercialManagerCeilingPercentSnapshot ??
      null,

    commercial_staff_floor_amount_snapshot_cents:
      quote.commercialStaffFloorAmountSnapshot ??
      null,

    commercial_staff_ceiling_amount_snapshot_cents:
      quote.commercialStaffCeilingAmountSnapshot ??
      null,

    commercial_manager_ceiling_amount_snapshot_cents:
      quote.commercialManagerCeilingAmountSnapshot ??
      null,

    internal_fee_cap_amount_snapshot_cents:
      quote.internalFeeCapAmountSnapshot ?? null,

    minimum_viable_fee_snapshot_cents:
      quote.minimumViableFeeSnapshot ?? null,

    viability_status:
      quote.viabilityStatus,

    approval_status:
      quote.approvalStatus,

    approval_reason:
      quote.approvalReason ?? null,

    approved_by_user_id: null,
    approved_at: null,

    manager_reviewed_by_user_id: null,
    manager_reviewed_at: null,

    rejected_by_user_id: null,
    rejected_at: null,
    rejection_reason: null,

    locked_fee_agreement_id: null,
    locked_at: null,

    created_by_user_id:
      quote.createdByUserId,
  };
}

/* ========================================================================== */
/* Audit                                                                       */
/* ========================================================================== */

function auditId(
  quoteId: string,
  action: CommercialApprovalAuditAction,
  occurredAt: IsoInstant,
): string {
  return createHash("sha256")
    .update(
      `${quoteId}:${action}:${occurredAt}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 24);
}

function buildAuditEntry({
  record,
  action,
  actorUserId,
  occurredAt,
  previousStatus,
  nextStatus,
  reason,
}: {
  record: PersistedCommercialApproval;
  action: CommercialApprovalAuditAction;
  actorUserId: string;
  occurredAt: IsoInstant;
  previousStatus?: PersistedCommercialApprovalStatus;
  nextStatus: PersistedCommercialApprovalStatus;
  reason?: string;
}): CommercialApprovalAuditEntry {
  return {
    id: auditId(
      record.quoteId,
      action,
      occurredAt,
    ),

    quoteId: record.quoteId,
    opportunityId: record.opportunityId,

    action,

    actorUserId,
    occurredAt,

    previousStatus,
    nextStatus,

    commercialPolicyId:
      record.commercialPolicyId,

    commercialPolicyVersion:
      record.commercialPolicyVersion,

    legalRuleVersionSnapshot:
      record.quoteSnapshot
        .legalRuleVersionSnapshot,

    snapshotHash:
      record.snapshotHash,

    reason,
  };
}

async function appendAuditEntry(
  entry: CommercialApprovalAuditEntry,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("commercial_fee_quote_audit")
    .insert({
      id: entry.id,

      quote_id: entry.quoteId,
      opportunity_id: entry.opportunityId,

      action: entry.action,

      actor_user_id: entry.actorUserId,
      occurred_at: entry.occurredAt,

      previous_status:
        entry.previousStatus ?? null,

      next_status:
        entry.nextStatus,

      commercial_policy_id:
        entry.commercialPolicyId,

      commercial_policy_version:
        entry.commercialPolicyVersion,

      legal_rule_version_snapshot:
        entry.legalRuleVersionSnapshot ?? null,

      snapshot_hash:
        entry.snapshotHash,

      reason:
        entry.reason ?? null,
    });

  if (error) {
    throw new Error(
      `Unable to append commercial approval audit entry: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Database helpers                                                            */
/* ========================================================================== */

async function getQuoteRow(
  quoteId: string,
): Promise<CommercialFeeQuoteRow | undefined> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("commercial_fee_quotes")
    .select("*")
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read commercial fee quote: ${error.message}`,
    );
  }

  return data
    ? (data as CommercialFeeQuoteRow)
    : undefined;
}

async function updateQuoteWithVersion(
  quoteId: string,
  expectedRowVersion: number,
  values: Record<string, unknown>,
): Promise<CommercialFeeQuoteRow> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("commercial_fee_quotes")
    .update({
      ...values,

      row_version:
        expectedRowVersion + 1,
    })
    .eq("quote_id", quoteId)
    .eq(
      "row_version",
      expectedRowVersion,
    )
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to update commercial fee quote: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Commercial fee quote changed while this request was being processed. Reload and try again.",
    );
  }

  return data as CommercialFeeQuoteRow;
}

async function ensureOpportunityActiveCommercialQuote(
  opportunityId: string,
  quoteId: string,
  occurredAt: IsoInstant,
): Promise<void> {
  const normalizedOpportunityId =
    opportunityId.trim();

  const normalizedQuoteId =
    quoteId.trim();

  if (!normalizedOpportunityId) {
    throw new Error(
      "An opportunity identifier is required before a commercial quote can become active.",
    );
  }

  if (!normalizedQuoteId) {
    throw new Error(
      "A commercial quote identifier is required before it can become active.",
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id, active_commercial_fee_quote_id, row_version",
    )
    .eq(
      "id",
      normalizedOpportunityId,
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read opportunity commercial-quote state: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Opportunity not found while activating the commercial quote.",
    );
  }

  const opportunity =
    data as OpportunityCommercialQuoteRow;

  if (
    opportunity.active_commercial_fee_quote_id ===
    normalizedQuoteId
  ) {
    return;
  }

  const expectedRowVersion =
    Number(
      opportunity.row_version,
    );

  if (
    !Number.isInteger(
      expectedRowVersion,
    ) ||
    expectedRowVersion < 1
  ) {
    throw new Error(
      "Opportunity has an invalid database row version while activating commercial pricing.",
    );
  }

  const { data: updated, error: updateError } =
    await supabase
      .from("opportunities")
      .update({
        active_commercial_fee_quote_id:
          normalizedQuoteId,

        row_version:
          expectedRowVersion + 1,

        updated_at:
          occurredAt,
      })
      .eq(
        "id",
        normalizedOpportunityId,
      )
      .eq(
        "row_version",
        expectedRowVersion,
      )
      .select("id")
      .maybeSingle();

  if (updateError) {
    throw new Error(
      `Unable to activate commercial quote on opportunity: ${updateError.message}`,
    );
  }

  if (!updated) {
    throw new Error(
      "Opportunity changed while commercial pricing was being activated. Reload and try again.",
    );
  }
}

function assertActorUserId(
  actorUserId: string,
): string {
  const value = actorUserId.trim();

  if (!value) {
    throw new Error(
      "A commercial workflow action requires an actor user id.",
    );
  }

  return value;
}

/* ========================================================================== */
/* Read operations                                                             */
/* ========================================================================== */

export async function getCommercialApprovalByQuoteId(
  quoteId: string,
): Promise<
  PersistedCommercialApproval | undefined
> {
  const row = await getQuoteRow(quoteId);

  return row
    ? approvalFromRow(row)
    : undefined;
}

export async function getCommercialApprovalForOpportunity(
  opportunityId: string,
): Promise<
  PersistedCommercialApproval | undefined
> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("commercial_fee_quotes")
    .select("*")
    .eq(
      "opportunity_id",
      opportunityId,
    )
    .order("updated_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read commercial approval for opportunity: ${error.message}`,
    );
  }

  return data
    ? approvalFromRow(
        data as CommercialFeeQuoteRow,
      )
    : undefined;
}

export async function listCommercialApprovals(): Promise<
  PersistedCommercialApproval[]
> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("commercial_fee_quotes")
    .select("*")
    .order("updated_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `Unable to list commercial approvals: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    approvalFromRow(
      row as CommercialFeeQuoteRow,
    ),
  );
}

export async function commercialApprovalAudit(
  quoteId?: string,
): Promise<CommercialApprovalAuditEntry[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("commercial_fee_quote_audit")
    .select("*")
    .order("occurred_at", {
      ascending: false,
    });

  if (quoteId) {
    query = query.eq(
      "quote_id",
      quoteId,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Unable to read commercial approval audit: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    auditFromRow(
      row as CommercialFeeQuoteAuditRow,
    ),
  );
}

/* ========================================================================== */
/* Save calculated quote                                                       */
/* ========================================================================== */

export async function saveCommercialQuote(
  input: SaveCommercialQuoteInput,
): Promise<PersistedCommercialApproval> {
  const actorUserId =
    assertActorUserId(
      input.actorUserId,
    );

  if (
    !commercialQuoteHasLegalRuleProvenance(
      input.quote,
    )
  ) {
    throw new Error(
      "A new commercial quote requires a valid jurisdiction legal-rule version snapshot before it can be persisted.",
    );
  }

  if (
    input.quote.approvalStatus !== "draft" &&
    input.quote.approvalStatus !==
      "manager_review"
  ) {
    throw new Error(
      "A calculated commercial quote may only be saved as draft or manager review. Approval and locking require their dedicated workflow actions.",
    );
  }

  const existingRow =
    await getQuoteRow(
      input.quote.id,
    );

  const existing =
    existingRow
      ? approvalFromRow(existingRow)
      : undefined;

  if (
    existing?.approvalStatus === "locked"
  ) {
    throw new Error(
      "A commercial quote locked to a signed agreement cannot be replaced.",
    );
  }

  if (
    existing &&
    existing.approvalStatus !== "draft" &&
    existing.approvalStatus !==
      "manager_review" &&
    existing.approvalStatus !== "rejected"
  ) {
    throw new Error(
      "An approved commercial quote cannot be silently recalculated. Create a new quote version instead.",
    );
  }

  const snapshotHash =
    quoteSnapshotHash(input.quote);

  const payload =
    calculatedQuotePayload(
      input.quote,
      snapshotHash,
    );

  let savedRow: CommercialFeeQuoteRow;

  if (existingRow) {
    savedRow =
      await updateQuoteWithVersion(
        input.quote.id,

        rowVersion(existingRow),

        {
          ...payload,

          updated_at:
            input.occurredAt,
        },
      );
  } else {
    const supabase =
      getSupabaseAdmin();

    const { data, error } =
      await supabase
        .from("commercial_fee_quotes")
        .insert({
          ...payload,

          created_at:
            input.occurredAt,

          updated_at:
            input.occurredAt,

          row_version: 1,
        })
        .select("*")
        .single();

    if (error) {
      throw new Error(
        `Unable to save commercial fee quote: ${error.message}`,
      );
    }

    savedRow =
      data as CommercialFeeQuoteRow;
  }

  const saved =
    approvalFromRow(savedRow);

  const action: CommercialApprovalAuditAction =
    saved.approvalStatus ===
    "manager_review"
      ? "manager_review_requested"
      : "quote_saved";

  await appendAuditEntry(
    buildAuditEntry({
      record: saved,

      action,

      actorUserId,

      occurredAt:
        input.occurredAt,

      previousStatus:
        existing?.approvalStatus,

      nextStatus:
        saved.approvalStatus,

      reason:
        saved.approvalStatus ===
        "manager_review"
          ? input.quote.approvalReason
          : undefined,
    }),
  );

  return saved;
}

/* ========================================================================== */
/* Approval                                                                    */
/* ========================================================================== */

export async function approveCommercialQuote(
  input: ApproveCommercialQuoteInput,
): Promise<PersistedCommercialApproval> {
  const actorUserId =
    assertActorUserId(
      input.actorUserId,
    );

  const currentRow =
    await getQuoteRow(
      input.quoteId,
    );

  if (!currentRow) {
    throw new Error(
      "Commercial quote not found.",
    );
  }

  const current =
    approvalFromRow(currentRow);

  assertQuoteOperationallyApprovable(
    current,
    "Approval",
  );

  if (
    current.approvalStatus === "locked"
  ) {
    throw new Error(
      "The commercial quote is already locked to an agreement.",
    );
  }

  if (
    current.approvalStatus === "rejected"
  ) {
    throw new Error(
      "A rejected commercial quote must be recalculated before it can be approved.",
    );
  }

  if (
    input.approvalLevel === "staff" &&
    current.approvalStatus ===
      "manager_review"
  ) {
    throw new Error(
      "This commercial quote requires manager approval.",
    );
  }

  if (
    current.approvalStatus ===
      "staff_approved" ||
    current.approvalStatus ===
      "manager_approved"
  ) {
    await ensureOpportunityActiveCommercialQuote(
      current.opportunityId,
      current.quoteId,
      input.occurredAt,
    );

    return current;
  }

  const previousStatus =
    current.approvalStatus;

  const nextStatus: PersistedCommercialApprovalStatus =
    input.approvalLevel === "manager"
      ? "manager_approved"
      : "staff_approved";

  const updatedRow =
    await updateQuoteWithVersion(
      input.quoteId,

      rowVersion(currentRow),

      {
        approval_status:
          nextStatus,

        approval_reason:
          input.reason ?? null,

        approved_by_user_id:
          actorUserId,

        approved_at:
          input.occurredAt,

        manager_reviewed_by_user_id:
          input.approvalLevel ===
          "manager"
            ? actorUserId
            : current.managerReviewedByUserId ??
              null,

        manager_reviewed_at:
          input.approvalLevel ===
          "manager"
            ? input.occurredAt
            : current.managerReviewedAt ??
              null,

        updated_at:
          input.occurredAt,
      },
    );

  const updated =
    approvalFromRow(updatedRow);

  await ensureOpportunityActiveCommercialQuote(
    updated.opportunityId,
    updated.quoteId,
    input.occurredAt,
  );

  await appendAuditEntry(
    buildAuditEntry({
      record: updated,

      action:
        input.approvalLevel ===
        "manager"
          ? "manager_approved"
          : "staff_approved",

      actorUserId,

      occurredAt:
        input.occurredAt,

      previousStatus,

      nextStatus,

      reason:
        input.reason,
    }),
  );

  return updated;
}

/* ========================================================================== */
/* Rejection                                                                   */
/* ========================================================================== */

export async function rejectCommercialQuote(
  input: RejectCommercialQuoteInput,
): Promise<PersistedCommercialApproval> {
  const actorUserId =
    assertActorUserId(
      input.actorUserId,
    );

  const reason =
    input.reason.trim();

  if (!reason) {
    throw new Error(
      "A commercial quote rejection requires a reason.",
    );
  }

  const currentRow =
    await getQuoteRow(
      input.quoteId,
    );

  if (!currentRow) {
    throw new Error(
      "Commercial quote not found.",
    );
  }

  const current =
    approvalFromRow(currentRow);

  if (
    current.approvalStatus === "locked"
  ) {
    throw new Error(
      "A quote locked to a signed agreement cannot be rejected.",
    );
  }

  const previousStatus =
    current.approvalStatus;

  const updatedRow =
    await updateQuoteWithVersion(
      input.quoteId,

      rowVersion(currentRow),

      {
        approval_status:
          "rejected",

        rejected_by_user_id:
          actorUserId,

        rejected_at:
          input.occurredAt,

        rejection_reason:
          reason,

        updated_at:
          input.occurredAt,
      },
    );

  const updated =
    approvalFromRow(updatedRow);

  await appendAuditEntry(
    buildAuditEntry({
      record: updated,

      action:
        "quote_rejected",

      actorUserId,

      occurredAt:
        input.occurredAt,

      previousStatus,

      nextStatus:
        "rejected",

      reason,
    }),
  );

  return updated;
}

/* ========================================================================== */
/* Agreement lock                                                              */
/* ========================================================================== */

export async function lockCommercialQuoteApproval(
  input: LockCommercialQuoteInput,
): Promise<PersistedCommercialApproval> {
  const actorUserId =
    assertActorUserId(
      input.actorUserId,
    );

  const feeAgreementId =
    input.feeAgreementId.trim();

  if (!feeAgreementId) {
    throw new Error(
      "A fee agreement identifier is required before a commercial quote can be locked.",
    );
  }

  const currentRow =
    await getQuoteRow(
      input.quoteId,
    );

  if (!currentRow) {
    throw new Error(
      "Commercial quote not found.",
    );
  }

  const current =
    approvalFromRow(currentRow);

  assertQuoteOperationallyApprovable(
    current,
    "Agreement locking",
  );

  if (
    current.approvalStatus === "locked"
  ) {
    if (
      current.lockedFeeAgreementId ===
      feeAgreementId
    ) {
      await ensureOpportunityActiveCommercialQuote(
        current.opportunityId,
        current.quoteId,
        input.occurredAt,
      );

      return current;
    }

    throw new Error(
      "The commercial quote is already locked to a different agreement.",
    );
  }

  if (
    current.approvalStatus !==
      "staff_approved" &&
    current.approvalStatus !==
      "manager_approved"
  ) {
    throw new Error(
      "Only an approved commercial quote may be locked to a fee agreement.",
    );
  }

  const previousStatus =
    current.approvalStatus;

  const updatedRow =
    await updateQuoteWithVersion(
      input.quoteId,

      rowVersion(currentRow),

      {
        approval_status:
          "locked",

        locked_fee_agreement_id:
          feeAgreementId,

        locked_at:
          input.occurredAt,

        updated_at:
          input.occurredAt,
      },
    );

  const updated =
    approvalFromRow(updatedRow);

  await ensureOpportunityActiveCommercialQuote(
    updated.opportunityId,
    updated.quoteId,
    input.occurredAt,
  );

  await appendAuditEntry(
    buildAuditEntry({
      record: updated,

      action:
        "quote_locked",

      actorUserId,

      occurredAt:
        input.occurredAt,

      previousStatus,

      nextStatus:
        "locked",

      reason:
        `Locked to fee agreement ${feeAgreementId}.`,
    }),
  );

  return updated;
}