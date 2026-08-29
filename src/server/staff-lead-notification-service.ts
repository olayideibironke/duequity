import "server-only";

import {
  can,
  type StaffSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Authorization                                                               */
/* ========================================================================== */

function requireLeadRead(
  session:
    StaffSession,
): void {
  if (
    !can(
      session,
      "opportunity.read",
    )
  ) {
    throw new Error(
      "Your DueQuity role is not authorized to access assigned recovery leads.",
    );
  }
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function normalizeCount(
  value:
    unknown,
): number {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
  ) {
    return Math.max(
      0,
      Math.trunc(
        value,
      ),
    );
  }

  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      Number.parseInt(
        value,
        10,
      );

    if (
      Number.isFinite(
        parsed,
      )
    ) {
      return Math.max(
        0,
        parsed,
      );
    }
  }

  return 0;
}

function normalizeAssignmentIds(
  values:
    string[],
): string[] {
  const unique =
    new Set<string>();

  for (
    const value
    of values
  ) {
    const normalized =
      value
        .trim()
        .slice(
          0,
          128,
        );

    if (
      normalized
    ) {
      unique.add(
        normalized,
      );
    }
  }

  return Array.from(
    unique,
  ).slice(
    0,
    1000,
  );
}

/* ========================================================================== */
/* Count unseen                                                                */
/* ========================================================================== */

export async function getUnseenStaffLeadCount(
  session:
    StaffSession,
): Promise<number> {
  requireLeadRead(
    session,
  );

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "count_unseen_staff_lead_assignments",
      {
        p_staff_user_id:
          session.user.id,
      },
    );

  if (
    error
  ) {
    throw new Error(
      `Unable to load new lead notifications: ${error.message}`,
    );
  }

  return normalizeCount(
    data,
  );
}

/* ========================================================================== */
/* Mark explicit assignments seen                                              */
/* ========================================================================== */

export async function markStaffLeadAssignmentIdsSeen({
  session,
  assignmentIds,
}: {
  session:
    StaffSession;

  assignmentIds:
    string[];
}): Promise<number> {
  requireLeadRead(
    session,
  );

  const requestedIds =
    normalizeAssignmentIds(
      assignmentIds,
    );

  if (
    requestedIds.length ===
    0
  ) {
    return 0;
  }

  const admin =
    getSupabaseAdmin();

  /*
   * Never trust assignment IDs supplied by the browser.
   *
   * Re-resolve them against the authenticated employee's currently active
   * assignments before creating acknowledgement receipts.
   */
  const {
    data:
      assignmentData,
    error:
      assignmentError,
  } =
    await admin
      .from(
        "lead_assignments",
      )
      .select(
        "id",
      )
      .eq(
        "assigned_to_staff_user_id",
        session.user.id,
      )
      .eq(
        "status",
        "active",
      )
      .in(
        "id",
        requestedIds,
      );

  if (
    assignmentError
  ) {
    throw new Error(
      `Unable to verify assigned leads before acknowledgement: ${assignmentError.message}`,
    );
  }

  const ownedIds =
    (
      assignmentData ??
      []
    )
      .map(
        (
          row,
        ) =>
          String(
            row.id,
          ),
      );

  if (
    ownedIds.length ===
    0
  ) {
    return 0;
  }

  const {
    data:
      existingData,
    error:
      existingError,
  } =
    await admin
      .from(
        "lead_assignment_receipts",
      )
      .select(
        "assignment_id",
      )
      .in(
        "assignment_id",
        ownedIds,
      );

  if (
    existingError
  ) {
    throw new Error(
      `Unable to inspect lead notification receipts: ${existingError.message}`,
    );
  }

  const alreadySeen =
    new Set(
      (
        existingData ??
        []
      ).map(
        (
          row,
        ) =>
          String(
            row.assignment_id,
          ),
      ),
    );

  const unseenOwnedIds =
    ownedIds.filter(
      (
        assignmentId,
      ) =>
        !alreadySeen.has(
          assignmentId,
        ),
    );

  if (
    unseenOwnedIds.length ===
    0
  ) {
    return 0;
  }

  const now =
    new Date()
      .toISOString();

  const {
    error:
      receiptError,
  } =
    await admin
      .from(
        "lead_assignment_receipts",
      )
      .upsert(
        unseenOwnedIds.map(
          (
            assignmentId,
          ) => ({
            assignment_id:
              assignmentId,

            first_seen_at:
              now,

            created_at:
              now,
          }),
        ),
        {
          onConflict:
            "assignment_id",

          ignoreDuplicates:
            true,
        },
      );

  if (
    receiptError
  ) {
    throw new Error(
      `Unable to acknowledge assigned leads: ${receiptError.message}`,
    );
  }

  return unseenOwnedIds.length;
}