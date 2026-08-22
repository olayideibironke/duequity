import "server-only";

import type {
  CommercialFeePolicy,
  IsoDate,
  IsoInstant,
} from "@/domain/types";
import { getSupabaseAdmin } from "@/server/supabase-admin";

export interface SaveCommercialFeePolicyDraftInput {
  policy: CommercialFeePolicy;
}

export interface ApproveCommercialFeePolicyInput {
  policyId: string;
  actorUserId: string;
  approvedAt: IsoInstant;
  reviewedOn?: IsoDate;
  reviewDueAt?: IsoDate;
}

export interface PauseCommercialFeePolicyInput {
  policyId: string;
}

export interface RetireCommercialFeePolicyInput {
  policyId: string;
  effectiveThrough?: IsoDate;
}

interface CommercialFeePolicyRow {
  id: string;
  jurisdiction_id: string;
  version: number | string;
  sale_types: string[] | null;
  custodians: string[] | null;
  status: CommercialFeePolicy["status"];
  effective_from: string;
  effective_through: string | null;
  tiers: unknown;
  approved_by_user_id: string | null;
  approved_at: string | null;
  last_reviewed_at: string | null;
  review_due_at: string | null;
  internal_notes: string | null;
  row_version: number | string;
}

function rowVersion(row: CommercialFeePolicyRow): number {
  const value = Number(row.row_version);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Commercial fee policy has an invalid row version.");
  }

  return value;
}

function policyFromRow(row: CommercialFeePolicyRow): CommercialFeePolicy {
  return {
    id: row.id,
    jurisdictionId: row.jurisdiction_id,

    saleTypes:
      row.sale_types && row.sale_types.length > 0
        ? (row.sale_types as NonNullable<CommercialFeePolicy["saleTypes"]>)
        : undefined,

    custodians:
      row.custodians && row.custodians.length > 0
        ? (row.custodians as NonNullable<CommercialFeePolicy["custodians"]>)
        : undefined,

    status: row.status,
    version: Number(row.version),

    effectiveFrom: row.effective_from as IsoDate,

    effectiveThrough: row.effective_through
      ? (row.effective_through as IsoDate)
      : undefined,

    tiers: row.tiers as CommercialFeePolicy["tiers"],

    approvedByUserId: row.approved_by_user_id ?? undefined,

    approvedAt: row.approved_at
      ? (row.approved_at as IsoInstant)
      : undefined,

    lastReviewedAt: row.last_reviewed_at
      ? (row.last_reviewed_at as IsoDate)
      : undefined,

    reviewDueAt: row.review_due_at
      ? (row.review_due_at as IsoDate)
      : undefined,

    internalNotes: row.internal_notes ?? undefined,
  };
}

function draftPayload(policy: CommercialFeePolicy) {
  return {
    id: policy.id,
    jurisdiction_id: policy.jurisdictionId,
    version: policy.version,
    sale_types: policy.saleTypes ?? null,
    custodians: policy.custodians ?? null,
    status: "draft",
    effective_from: policy.effectiveFrom,
    effective_through: policy.effectiveThrough ?? null,
    tiers: policy.tiers,
    approved_by_user_id: null,
    approved_at: null,
    last_reviewed_at: policy.lastReviewedAt ?? null,
    review_due_at: policy.reviewDueAt ?? null,
    internal_notes: policy.internalNotes ?? null,
  };
}

function assertValidPolicyIdentity(policy: CommercialFeePolicy): void {
  if (!policy.id.trim()) {
    throw new Error("Commercial fee policy id is required.");
  }

  if (!policy.jurisdictionId.trim()) {
    throw new Error("Commercial fee policy jurisdiction id is required.");
  }

  if (!Number.isInteger(policy.version) || policy.version < 1) {
    throw new Error(
      "Commercial fee policy version must be a positive integer.",
    );
  }

  if (!policy.effectiveFrom) {
    throw new Error("Commercial fee policy effective date is required.");
  }

  if (policy.tiers.length === 0) {
    throw new Error(
      "Commercial fee policy must contain at least one recovery tier.",
    );
  }
}

async function getPolicyRow(
  policyId: string,
): Promise<CommercialFeePolicyRow | undefined> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("commercial_fee_policies")
    .select("*")
    .eq("id", policyId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read commercial fee policy: ${error.message}`,
    );
  }

  return data ? (data as CommercialFeePolicyRow) : undefined;
}

async function updatePolicyWithVersion(
  policyId: string,
  expectedRowVersion: number,
  values: Record<string, unknown>,
): Promise<CommercialFeePolicy> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("commercial_fee_policies")
    .update({
      ...values,
      row_version: expectedRowVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", policyId)
    .eq("row_version", expectedRowVersion)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to update commercial fee policy: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Commercial fee policy changed while this request was being processed. Reload and try again.",
    );
  }

  return policyFromRow(data as CommercialFeePolicyRow);
}

/* ========================================================================== */
/* Read operations                                                             */
/* ========================================================================== */

export async function listCommercialFeePolicies(): Promise<
  CommercialFeePolicy[]
> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("commercial_fee_policies")
    .select("*")
    .order("jurisdiction_id", {
      ascending: true,
    })
    .order("version", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `Unable to list commercial fee policies: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    policyFromRow(row as CommercialFeePolicyRow),
  );
}

export async function getCommercialFeePolicyById(
  policyId: string,
): Promise<CommercialFeePolicy | undefined> {
  const row = await getPolicyRow(policyId);

  return row ? policyFromRow(row) : undefined;
}

export async function listCommercialFeePoliciesForJurisdiction(
  jurisdictionId: string,
): Promise<CommercialFeePolicy[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("commercial_fee_policies")
    .select("*")
    .eq("jurisdiction_id", jurisdictionId)
    .order("version", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `Unable to list commercial fee policies for jurisdiction: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    policyFromRow(row as CommercialFeePolicyRow),
  );
}

/* ========================================================================== */
/* Draft persistence                                                           */
/* ========================================================================== */

export async function saveCommercialFeePolicyDraft(
  input: SaveCommercialFeePolicyDraftInput,
): Promise<CommercialFeePolicy> {
  assertValidPolicyIdentity(input.policy);

  if (input.policy.status !== "draft") {
    throw new Error(
      "Only draft commercial fee policies may be saved through the draft workflow.",
    );
  }

  const supabase = getSupabaseAdmin();

  const existing = await getPolicyRow(input.policy.id);

  if (existing && existing.status !== "draft") {
    throw new Error(
      "An approved, paused, or retired commercial fee policy cannot be silently replaced. Create a new policy version instead.",
    );
  }

  const { data: conflict, error: conflictError } = await supabase
    .from("commercial_fee_policies")
    .select("id")
    .eq("jurisdiction_id", input.policy.jurisdictionId)
    .eq("version", input.policy.version)
    .neq("id", input.policy.id)
    .limit(1)
    .maybeSingle();

  if (conflictError) {
    throw new Error(
      `Unable to validate commercial fee policy version: ${conflictError.message}`,
    );
  }

  if (conflict) {
    throw new Error(
      "A commercial fee policy with this jurisdiction and version already exists.",
    );
  }

  const payload = draftPayload(input.policy);

  if (existing) {
    return updatePolicyWithVersion(
      input.policy.id,
      rowVersion(existing),
      payload,
    );
  }

  const { data, error } = await supabase
    .from("commercial_fee_policies")
    .insert({
      ...payload,
      row_version: 1,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Unable to save commercial fee policy draft: ${error.message}`,
    );
  }

  return policyFromRow(data as CommercialFeePolicyRow);
}

/* ========================================================================== */
/* Governance state changes                                                    */
/* ========================================================================== */

export async function approveCommercialFeePolicy(
  input: ApproveCommercialFeePolicyInput,
): Promise<CommercialFeePolicy> {
  const actorUserId = input.actorUserId.trim();

  if (!actorUserId) {
    throw new Error(
      "Commercial fee policy approval requires an approving user.",
    );
  }

  const currentRow = await getPolicyRow(input.policyId);

  if (!currentRow) {
    throw new Error("Commercial fee policy not found.");
  }

  const current = policyFromRow(currentRow);

  assertValidPolicyIdentity(current);

  if (current.status === "retired") {
    throw new Error(
      "A retired commercial fee policy cannot be approved again.",
    );
  }

  if (current.status === "approved") {
    return current;
  }

  return updatePolicyWithVersion(
    input.policyId,
    rowVersion(currentRow),
    {
      status: "approved",
      approved_by_user_id: actorUserId,
      approved_at: input.approvedAt,
      last_reviewed_at: input.reviewedOn ?? current.lastReviewedAt ?? null,
      review_due_at: input.reviewDueAt ?? current.reviewDueAt ?? null,
    },
  );
}

export async function pauseCommercialFeePolicy(
  input: PauseCommercialFeePolicyInput,
): Promise<CommercialFeePolicy> {
  const currentRow = await getPolicyRow(input.policyId);

  if (!currentRow) {
    throw new Error("Commercial fee policy not found.");
  }

  const current = policyFromRow(currentRow);

  if (current.status !== "approved") {
    throw new Error("Only an approved commercial fee policy may be paused.");
  }

  return updatePolicyWithVersion(
    input.policyId,
    rowVersion(currentRow),
    {
      status: "paused",
    },
  );
}

export async function retireCommercialFeePolicy(
  input: RetireCommercialFeePolicyInput,
): Promise<CommercialFeePolicy> {
  const currentRow = await getPolicyRow(input.policyId);

  if (!currentRow) {
    throw new Error("Commercial fee policy not found.");
  }

  const current = policyFromRow(currentRow);

  if (current.status === "retired") {
    return current;
  }

  return updatePolicyWithVersion(
    input.policyId,
    rowVersion(currentRow),
    {
      status: "retired",
      effective_through:
        input.effectiveThrough ?? current.effectiveThrough ?? null,
    },
  );
}