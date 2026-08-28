import "server-only";

import {
  randomUUID,
} from "node:crypto";

import type {
  IsoInstant,
} from "@/domain/types";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * CLAIM FINAL CLOSURE + RETENTION STORE
 *
 * Final claim closure is a durable operational event.
 *
 * It is deliberately separate from:
 *
 * - authority-review closure;
 * - recovery reconciliation;
 * - legacy claim status;
 * - document deletion;
 * - retention disposition.
 *
 * A claim may be finally closed only after the authority lifecycle is closed.
 *
 * If actual recovery exists, the recovery settlement must also be reconciled
 * before final claim closure is permitted.
 *
 * Every final closure automatically creates a retention record in
 * `policy_pending`.
 *
 * DueQuity does not infer a retention period. A retention schedule must cite an
 * explicit policy reference and policy basis before a destruction/disposition
 * eligibility date can exist.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type ClaimFinalOutcome =
  | "recovered_reconciled"
  | "denied_final"
  | "closed_without_recovery";

export type ClaimRetentionStatus =
  | "policy_pending"
  | "scheduled"
  | "legal_hold"
  | "eligible_for_disposition"
  | "disposed";

export interface PersistedClaimClosure {
  id:
    string;

  claimId:
    string;

  claimReference:
    string;

  authorityReviewId:
    string;

  recoverySettlementId?:
    string;

  finalOutcome:
    ClaimFinalOutcome;

  authorityClosedAt:
    IsoInstant;

  recoveryReconciledAt?:
    IsoInstant;

  closedAt:
    IsoInstant;

  closedByUserId:
    string;

  closureSummary:
    string;

  rowVersion:
    number;

  createdAt:
    IsoInstant;

  updatedAt:
    IsoInstant;
}

export interface PersistedClaimRetentionRecord {
  id:
    string;

  closureId:
    string;

  claimId:
    string;

  status:
    ClaimRetentionStatus;

  policyReference?:
    string;

  policyBasis?:
    string;

  scheduledAt?:
    IsoInstant;

  retentionUntil?:
    IsoInstant;

  preHoldStatus?:
    Exclude<
      ClaimRetentionStatus,
      "legal_hold" |
      "disposed"
    >;

  activeHoldStartedAt?:
    IsoInstant;

  activeHoldReason?:
    string;

  activeHoldByUserId?:
    string;

  eligibleAt?:
    IsoInstant;

  disposedAt?:
    IsoInstant;

  disposedByUserId?:
    string;

  dispositionMethod?:
    string;

  dispositionSummary?:
    string;

  lastActionByUserId:
    string;

  rowVersion:
    number;

  createdAt:
    IsoInstant;

  updatedAt:
    IsoInstant;
}

export interface ClaimClosureAuditEntry {
  id:
    string;

  claimId:
    string;

  closureId:
    string;

  retentionId?:
    string;

  action:
    | "claim_final_closed"
    | "retention_scheduled"
    | "retention_hold_placed"
    | "retention_hold_released"
    | "retention_eligible"
    | "retention_disposed";

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  summary?:
    string;

  detail?:
    Record<
      string,
      unknown
    >;

  createdAt:
    IsoInstant;
}

/* ========================================================================== */
/* Inputs                                                                      */
/* ========================================================================== */

export interface CloseClaimFinalInput {
  claimId:
    string;

  actorUserId:
    string;

  closedAt:
    IsoInstant;

  summary:
    string;
}

export interface ScheduleClaimRetentionInput {
  retentionId:
    string;

  actorUserId:
    string;

  scheduledAt:
    IsoInstant;

  retentionUntil:
    IsoInstant;

  policyReference:
    string;

  policyBasis:
    string;
}

export interface PlaceClaimRetentionHoldInput {
  retentionId:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  reason:
    string;
}

export interface ReleaseClaimRetentionHoldInput {
  retentionId:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  summary:
    string;
}

export interface MarkClaimRetentionEligibleInput {
  retentionId:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  summary:
    string;
}

export interface RecordClaimRetentionDispositionInput {
  retentionId:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  method:
    string;

  summary:
    string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimClosureRow {
  id:
    string;

  claim_id:
    string;

  claim_reference:
    string;

  authority_review_id:
    string;

  recovery_settlement_id:
    string |
    null;

  final_outcome:
    ClaimFinalOutcome;

  authority_closed_at:
    string;

  recovery_reconciled_at:
    string |
    null;

  closed_at:
    string;

  closed_by_user_id:
    string;

  closure_summary:
    string;

  row_version:
    number;

  created_at:
    string;

  updated_at:
    string;
}

interface ClaimRetentionRow {
  id:
    string;

  closure_id:
    string;

  claim_id:
    string;

  status:
    ClaimRetentionStatus;

  policy_reference:
    string |
    null;

  policy_basis:
    string |
    null;

  scheduled_at:
    string |
    null;

  retention_until:
    string |
    null;

  pre_hold_status:
    Exclude<
      ClaimRetentionStatus,
      "legal_hold" |
      "disposed"
    > |
    null;

  active_hold_started_at:
    string |
    null;

  active_hold_reason:
    string |
    null;

  active_hold_by_user_id:
    string |
    null;

  eligible_at:
    string |
    null;

  disposed_at:
    string |
    null;

  disposed_by_user_id:
    string |
    null;

  disposition_method:
    string |
    null;

  disposition_summary:
    string |
    null;

  last_action_by_user_id:
    string;

  row_version:
    number;

  created_at:
    string;

  updated_at:
    string;
}

interface ClaimClosureAuditRow {
  id:
    string;

  claim_id:
    string;

  closure_id:
    string;

  retention_id:
    string |
    null;

  action:
    ClaimClosureAuditEntry["action"];

  actor_user_id:
    string;

  occurred_at:
    string;

  summary:
    string |
    null;

  detail:
    Record<
      string,
      unknown
    > |
    null;

  created_at:
    string;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function requireNonEmpty(
  value:
    string,
  label:
    string,
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
  value:
    string,
  label:
    string,
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

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function closureFromRow(
  row:
    ClaimClosureRow,
): PersistedClaimClosure {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    authorityReviewId:
      row.authority_review_id,

    recoverySettlementId:
      row.recovery_settlement_id ??
      undefined,

    finalOutcome:
      row.final_outcome,

    authorityClosedAt:
      row.authority_closed_at as IsoInstant,

    recoveryReconciledAt:
      row.recovery_reconciled_at
        ? row.recovery_reconciled_at as IsoInstant
        : undefined,

    closedAt:
      row.closed_at as IsoInstant,

    closedByUserId:
      row.closed_by_user_id,

    closureSummary:
      row.closure_summary,

    rowVersion:
      Number(
        row.row_version,
      ),

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,
  };
}

function retentionFromRow(
  row:
    ClaimRetentionRow,
): PersistedClaimRetentionRecord {
  return {
    id:
      row.id,

    closureId:
      row.closure_id,

    claimId:
      row.claim_id,

    status:
      row.status,

    policyReference:
      row.policy_reference ??
      undefined,

    policyBasis:
      row.policy_basis ??
      undefined,

    scheduledAt:
      row.scheduled_at
        ? row.scheduled_at as IsoInstant
        : undefined,

    retentionUntil:
      row.retention_until
        ? row.retention_until as IsoInstant
        : undefined,

    preHoldStatus:
      row.pre_hold_status ??
      undefined,

    activeHoldStartedAt:
      row.active_hold_started_at
        ? row.active_hold_started_at as IsoInstant
        : undefined,

    activeHoldReason:
      row.active_hold_reason ??
      undefined,

    activeHoldByUserId:
      row.active_hold_by_user_id ??
      undefined,

    eligibleAt:
      row.eligible_at
        ? row.eligible_at as IsoInstant
        : undefined,

    disposedAt:
      row.disposed_at
        ? row.disposed_at as IsoInstant
        : undefined,

    disposedByUserId:
      row.disposed_by_user_id ??
      undefined,

    dispositionMethod:
      row.disposition_method ??
      undefined,

    dispositionSummary:
      row.disposition_summary ??
      undefined,

    lastActionByUserId:
      row.last_action_by_user_id,

    rowVersion:
      Number(
        row.row_version,
      ),

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,
  };
}

function auditFromRow(
  row:
    ClaimClosureAuditRow,
): ClaimClosureAuditEntry {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    closureId:
      row.closure_id,

    retentionId:
      row.retention_id ??
      undefined,

    action:
      row.action,

    actorUserId:
      row.actor_user_id,

    occurredAt:
      row.occurred_at as IsoInstant,

    summary:
      row.summary ??
      undefined,

    detail:
      row.detail ??
      undefined,

    createdAt:
      row.created_at as IsoInstant,
  };
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function getClaimClosure(
  closureId:
    string,
): Promise<
  PersistedClaimClosure |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_closures",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        closureId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read final claim closure: ${error.message}`,
    );
  }

  return data
    ? closureFromRow(
        data as unknown as
          ClaimClosureRow,
      )
    : undefined;
}

export async function getClaimClosureByClaimId(
  claimId:
    string,
): Promise<
  PersistedClaimClosure |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_closures",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read final claim closure: ${error.message}`,
    );
  }

  return data
    ? closureFromRow(
        data as unknown as
          ClaimClosureRow,
      )
    : undefined;
}

export async function getClaimRetentionByClaimId(
  claimId:
    string,
): Promise<
  PersistedClaimRetentionRecord |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_retention_records",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read claim retention record: ${error.message}`,
    );
  }

  return data
    ? retentionFromRow(
        data as unknown as
          ClaimRetentionRow,
      )
    : undefined;
}

export async function getClaimRetentionByClosureId(
  closureId:
    string,
): Promise<
  PersistedClaimRetentionRecord |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_retention_records",
      )
      .select(
        "*",
      )
      .eq(
        "closure_id",
        closureId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read claim retention record: ${error.message}`,
    );
  }

  return data
    ? retentionFromRow(
        data as unknown as
          ClaimRetentionRow,
      )
    : undefined;
}

export async function claimClosureAudit(
  claimId:
    string,
): Promise<
  ClaimClosureAuditEntry[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_closure_audit",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId.trim(),
      )
      .order(
        "occurred_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to read claim closure audit: ${error.message}`,
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
          ClaimClosureAuditRow,
      ),
  );
}

/* ========================================================================== */
/* Final closure                                                               */
/* ========================================================================== */

export async function closeClaimFinal(
  input:
    CloseClaimFinalInput,
): Promise<
  PersistedClaimClosure
> {
  const supabase =
    getSupabaseAdmin();

  const claimId =
    requireNonEmpty(
      input.claimId,
      "Claim ID",
    );

  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const closedAt =
    validateIsoInstant(
      input.closedAt,
      "Final claim closure timestamp",
    );

  const summary =
    requireNonEmpty(
      input.summary,
      "Final claim closure summary",
    );

  const closureId =
    `claim-closure-${randomUUID()}`;

  const retentionId =
    `claim-retention-${randomUUID()}`;

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "close_claim_final",
        {
          p_claim_id:
            claimId,

          p_closure_id:
            closureId,

          p_retention_id:
            retentionId,

          p_actor_user_id:
            actorUserId,

          p_closed_at:
            closedAt,

          p_summary:
            summary,
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to close claim finally: ${error.message}`,
    );
  }

  return closureFromRow(
    data as unknown as
      ClaimClosureRow,
  );
}

/* ========================================================================== */
/* Retention schedule                                                          */
/* ========================================================================== */

export async function scheduleClaimRetention(
  input:
    ScheduleClaimRetentionInput,
): Promise<
  PersistedClaimRetentionRecord
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "schedule_claim_retention",
        {
          p_retention_id:
            requireNonEmpty(
              input.retentionId,
              "Retention record ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_scheduled_at:
            validateIsoInstant(
              input.scheduledAt,
              "Retention scheduling timestamp",
            ),

          p_retention_until:
            validateIsoInstant(
              input.retentionUntil,
              "Retention-until timestamp",
            ),

          p_policy_reference:
            requireNonEmpty(
              input.policyReference,
              "Retention policy reference",
            ),

          p_policy_basis:
            requireNonEmpty(
              input.policyBasis,
              "Retention policy basis",
            ),
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to schedule claim retention: ${error.message}`,
    );
  }

  return retentionFromRow(
    data as unknown as
      ClaimRetentionRow,
  );
}

/* ========================================================================== */
/* Legal hold                                                                  */
/* ========================================================================== */

export async function placeClaimRetentionHold(
  input:
    PlaceClaimRetentionHoldInput,
): Promise<
  PersistedClaimRetentionRecord
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "place_claim_retention_hold",
        {
          p_retention_id:
            requireNonEmpty(
              input.retentionId,
              "Retention record ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Retention-hold timestamp",
            ),

          p_reason:
            requireNonEmpty(
              input.reason,
              "Retention-hold reason",
            ),
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to place claim retention hold: ${error.message}`,
    );
  }

  return retentionFromRow(
    data as unknown as
      ClaimRetentionRow,
  );
}

export async function releaseClaimRetentionHold(
  input:
    ReleaseClaimRetentionHoldInput,
): Promise<
  PersistedClaimRetentionRecord
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "release_claim_retention_hold",
        {
          p_retention_id:
            requireNonEmpty(
              input.retentionId,
              "Retention record ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Retention-hold release timestamp",
            ),

          p_summary:
            requireNonEmpty(
              input.summary,
              "Retention-hold release summary",
            ),
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to release claim retention hold: ${error.message}`,
    );
  }

  return retentionFromRow(
    data as unknown as
      ClaimRetentionRow,
  );
}

/* ========================================================================== */
/* Disposition eligibility                                                     */
/* ========================================================================== */

export async function markClaimRetentionEligible(
  input:
    MarkClaimRetentionEligibleInput,
): Promise<
  PersistedClaimRetentionRecord
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "mark_claim_retention_eligible",
        {
          p_retention_id:
            requireNonEmpty(
              input.retentionId,
              "Retention record ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Retention eligibility timestamp",
            ),

          p_summary:
            requireNonEmpty(
              input.summary,
              "Retention eligibility summary",
            ),
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to mark claim retention eligible: ${error.message}`,
    );
  }

  return retentionFromRow(
    data as unknown as
      ClaimRetentionRow,
  );
}

/* ========================================================================== */
/* Retention disposition                                                       */
/* ========================================================================== */

export async function recordClaimRetentionDisposition(
  input:
    RecordClaimRetentionDispositionInput,
): Promise<
  PersistedClaimRetentionRecord
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "record_claim_retention_disposition",
        {
          p_retention_id:
            requireNonEmpty(
              input.retentionId,
              "Retention record ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Retention disposition timestamp",
            ),

          p_method:
            requireNonEmpty(
              input.method,
              "Retention disposition method",
            ),

          p_summary:
            requireNonEmpty(
              input.summary,
              "Retention disposition summary",
            ),
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to record claim retention disposition: ${error.message}`,
    );
  }

  return retentionFromRow(
    data as unknown as
      ClaimRetentionRow,
  );
}