import "server-only";

import type {
  StaffSession,
} from "@/lib/session";

import {
  recordAuditEvent,
} from "@/server/audit-event-store";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export interface AssignableClaimantStaff {
  id: string;

  name: string;

  email: string;

  role: string;
}

export interface ClaimantAssignmentResult {
  claimantId: string;

  claimantReference: string;

  claimId: string;

  originatingStaffUserId: string;

  previousAssignedStaffUserId: string;

  assignedStaffUserId: string;

  changed: boolean;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimantAssignmentRow {
  claim_id: string;

  claimant_id: string;

  claimant_reference: string;

  originating_staff_user_id: string;

  assigned_staff_user_id: string;

  row_version:
    | number
    | string;
}

interface StaffRow {
  id: string;

  name: string;

  email: string;

  role: string;

  status: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function requireSuperAdmin(
  session:
    StaffSession,
): void {
  if (
    session.user.role !==
    "super_admin"
  ) {
    throw new Error(
      "Only DueQuity Super Admin may reassign claimant management.",
    );
  }
}

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

function readRowVersion(
  value:
    number | string,
): number {
  const version =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      version,
    ) ||
    version <
      1
  ) {
    throw new Error(
      "Claimant onboarding has an invalid database row version.",
    );
  }

  return version;
}

/* ========================================================================== */
/* Assignable staff                                                           */
/* ========================================================================== */

export async function listAssignableClaimantStaff(
  session:
    StaffSession,
): Promise<
  AssignableClaimantStaff[]
> {
  requireSuperAdmin(
    session,
  );

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id, name, email, role, status",
      )
      .eq(
        "status",
        "active",
      )
      .neq(
        "role",
        "claimant",
      )
      .order(
        "name",
        {
          ascending:
            true,
        },
      );

  if (error) {
    throw new Error(
      `Unable to load assignable DueQuity staff: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      rawRow,
    ) => {
      const row =
        rawRow as StaffRow;

      return {
        id:
          row.id,

        name:
          row.name,

        email:
          row.email,

        role:
          row.role,
      };
    },
  );
}

/* ========================================================================== */
/* Reassignment                                                               */
/* ========================================================================== */

export async function reassignClaimantStaff({
  session,
  claimantId,
  assignedStaffUserId,
}: {
  session:
    StaffSession;

  claimantId:
    string;

  assignedStaffUserId:
    string;
}): Promise<
  ClaimantAssignmentResult
> {
  requireSuperAdmin(
    session,
  );

  const normalizedClaimantId =
    requireNonEmpty(
      claimantId,
      "Claimant ID",
    );

  const normalizedAssignedStaffUserId =
    requireNonEmpty(
      assignedStaffUserId,
      "Assigned staff user ID",
    );

  const admin =
    getSupabaseAdmin();

  const {
    data:
      claimantData,
    error:
      claimantError,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .select(
        "claim_id, claimant_id, claimant_reference, originating_staff_user_id, assigned_staff_user_id, row_version",
      )
      .eq(
        "claimant_id",
        normalizedClaimantId,
      )
      .maybeSingle();

  if (
    claimantError ||
    !claimantData
  ) {
    throw new Error(
      "Claimant record was not found.",
    );
  }

  const claimant =
    claimantData as ClaimantAssignmentRow;

  const {
    data:
      targetData,
    error:
      targetError,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id, name, email, role, status",
      )
      .eq(
        "id",
        normalizedAssignedStaffUserId,
      )
      .eq(
        "status",
        "active",
      )
      .maybeSingle();

  if (
    targetError ||
    !targetData
  ) {
    throw new Error(
      "The selected DueQuity staff member is not active or could not be found.",
    );
  }

  const target =
    targetData as StaffRow;

  if (
    target.role ===
    "claimant"
  ) {
    throw new Error(
      "A claimant account cannot be assigned as a DueQuity claimant manager.",
    );
  }

  if (
    claimant.assigned_staff_user_id ===
    target.id
  ) {
    return {
      claimantId:
        claimant.claimant_id,

      claimantReference:
        claimant.claimant_reference,

      claimId:
        claimant.claim_id,

      originatingStaffUserId:
        claimant.originating_staff_user_id,

      previousAssignedStaffUserId:
        claimant.assigned_staff_user_id,

      assignedStaffUserId:
        claimant.assigned_staff_user_id,

      changed:
        false,
    };
  }

  const staffIds =
    [
      ...new Set([
        claimant.originating_staff_user_id,
        claimant.assigned_staff_user_id,
        target.id,
      ]),
    ];

  const {
    data:
      staffData,
    error:
      staffError,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id, name, email, role, status",
      )
      .in(
        "id",
        staffIds,
      );

  if (staffError) {
    throw new Error(
      `Unable to resolve claimant staff attribution: ${staffError.message}`,
    );
  }

  const staffNames =
    new Map(
      (
        staffData ??
        []
      ).map(
        (
          rawRow,
        ) => {
          const row =
            rawRow as StaffRow;

          return [
            row.id,
            row.name,
          ];
        },
      ),
    );

  const previousAssignedStaffUserId =
    claimant.assigned_staff_user_id;

  const currentVersion =
    readRowVersion(
      claimant.row_version,
    );

  const nextVersion =
    currentVersion +
    1;

  const occurredAt =
    new Date()
      .toISOString();

  const {
    data:
      updatedData,
    error:
      updateError,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .update({
        assigned_staff_user_id:
          target.id,

        row_version:
          nextVersion,

        updated_at:
          occurredAt,
      })
      .eq(
        "claimant_id",
        claimant.claimant_id,
      )
      .eq(
        "row_version",
        currentVersion,
      )
      .select(
        "claim_id, claimant_id, claimant_reference, originating_staff_user_id, assigned_staff_user_id, row_version",
      )
      .maybeSingle();

  if (updateError) {
    throw new Error(
      `Unable to reassign claimant management: ${updateError.message}`,
    );
  }

  if (!updatedData) {
    throw new Error(
      "Claimant assignment changed while this request was being processed. Reload and try again.",
    );
  }

  try {
    await recordAuditEvent({
      actor:
        session.user,

      action:
        "claimant.staff_reassigned",

      targetType:
        "claimant",

      targetId:
        claimant.claimant_id,

      targetLabel:
        claimant.claimant_reference,

      outcome:
        "success",

      detail:
        `Claimant management reassigned from ${
          staffNames.get(
            previousAssignedStaffUserId,
          ) ??
          previousAssignedStaffUserId
        } to ${
          target.name
        }. Permanent originating staff remains ${
          staffNames.get(
            claimant.originating_staff_user_id,
          ) ??
          claimant.originating_staff_user_id
        }.`,
    });
  } catch (
    auditError
  ) {
    /*
     * Fail closed.
     *
     * Assignment changes are required to have an immutable audit event.
     * If that event cannot be written, attempt to restore the previous
     * assignment immediately.
     */
    const {
      data:
        rollbackData,
      error:
        rollbackError,
    } =
      await admin
        .from(
          "claimant_onboarding",
        )
        .update({
          assigned_staff_user_id:
            previousAssignedStaffUserId,

          row_version:
            nextVersion +
            1,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "claimant_id",
          claimant.claimant_id,
        )
        .eq(
          "row_version",
          nextVersion,
        )
        .select(
          "claimant_id",
        )
        .maybeSingle();

    if (
      rollbackError ||
      !rollbackData
    ) {
      throw new Error(
        "Claimant assignment changed, but immutable audit logging failed and the automatic rollback could not be verified. Immediate Super Admin review is required.",
      );
    }

    throw new Error(
      auditError instanceof Error
        ? `Claimant reassignment was rolled back because the immutable audit event could not be recorded: ${auditError.message}`
        : "Claimant reassignment was rolled back because the immutable audit event could not be recorded.",
    );
  }

  const updated =
    updatedData as ClaimantAssignmentRow;

  return {
    claimantId:
      updated.claimant_id,

    claimantReference:
      updated.claimant_reference,

    claimId:
      updated.claim_id,

    originatingStaffUserId:
      updated.originating_staff_user_id,

    previousAssignedStaffUserId,

    assignedStaffUserId:
      updated.assigned_staff_user_id,

    changed:
      true,
  };
}