import "server-only";

import type {
  StaffUser,
} from "@/domain/types";

import { getSupabaseAdmin } from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type AuditEventOutcome =
  | "success"
  | "failure";

export interface RecordAuditEventInput {
  actor: StaffUser;

  action: string;

  targetType: string;

  targetId: string;

  targetLabel?: string | null;

  outcome: AuditEventOutcome;

  detail?: string | null;

  ipPrefix?: string | null;

  deviceSummary?: string | null;
}

/* ========================================================================== */
/* Writer                                                                      */
/* ========================================================================== */

/**
 * Append a durable event to the production audit chain.
 *
 * The database owns:
 *
 *   - event ID generation
 *   - occurred_at
 *   - chain_position
 *   - previous_event_hash
 *   - event_hash
 *
 * Application code must never calculate or mutate the chain itself.
 */
export async function recordAuditEvent(
  input: RecordAuditEventInput,
): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const {
    error,
  } = await admin
    .from("audit_events")
    .insert({
      actor_id:
        input.actor.id,

      actor_name:
        input.actor.name,

      actor_role:
        input.actor.role,

      action:
        input.action.trim(),

      target_type:
        input.targetType.trim(),

      target_id:
        input.targetId.trim(),

      target_label:
        input.targetLabel?.trim() ||
        null,

      outcome:
        input.outcome,

      ip_prefix:
        input.ipPrefix?.trim() ||
        null,

      device_summary:
        input.deviceSummary?.trim() ||
        null,

      detail:
        input.detail?.trim() ||
        null,
    });

  if (error) {
    throw new Error(
      `Unable to record audit event: ${error.message}`,
    );
  }
}