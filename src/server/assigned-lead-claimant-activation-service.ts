import "server-only";

import type {
  StaffSession,
} from "@/lib/session";

import {
  can,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const ACTIVATION_LIFETIME_MS =
  60 * 60 * 1000;

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type AssignedLeadActivationStatus =
  | "preparing"
  | "sent"
  | "activated"
  | "revoked"
  | "failed"
  | "expired";

export interface AssignedLeadActivationCandidate {
  workcaseId:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  discoveredRecordId:
    string;

  legalFirstName:
    string;

  legalLastName:
    string;

  email:
    string;

  mobilePhone:
    string;

  originatingStaffUserId:
    string;

  assignedStaffUserId:
    string;
}

export interface AssignedLeadActivationInvitation {
  id:
    string;

  workcaseId:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  legalFirstName:
    string;

  legalLastName:
    string;

  email:
    string;

  mobilePhone:
    string;

  authUserId?:
    string;

  status:
    AssignedLeadActivationStatus;

  sentByStaffUserId:
    string;

  sentAt?:
    string;

  activatedAt?:
    string;

  revokedAt?:
    string;

  expiresAt:
    string;

  createdAt:
    string;

  updatedAt:
    string;
}

export interface InviteAssignedLeadClaimantInput {
  session:
    StaffSession;

  workcaseId:
    string;

  redirectTo:
    string;
}

export interface InviteAssignedLeadClaimantResult {
  invitationId:
    string;

  workcaseId:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  email:
    string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface WorkcaseRow {
  id:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  discovered_record_id:
    string;

  legal_first_name:
    string;

  legal_last_name:
    string;

  email:
    string;

  mobile_phone:
    string;

  originating_staff_user_id:
    string;

  assigned_staff_user_id:
    string;

  auth_user_id:
    string | null;

  status:
    string;
}

interface InvitationRow {
  id:
    string;

  workcase_id:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  legal_first_name:
    string;

  legal_last_name:
    string;

  email:
    string;

  mobile_phone:
    string;

  auth_user_id:
    string | null;

  status:
    AssignedLeadActivationStatus;

  sent_by_staff_user_id:
    string;

  sent_at:
    string | null;

  activated_at:
    string | null;

  revoked_at:
    string | null;

  expires_at:
    string;

  created_at:
    string;

  updated_at:
    string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function hasGlobalAccess(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
      "administrator" ||
    session.user.role ===
      "super_admin"
  );
}

function requireActivationAuthority(
  session:
    StaffSession,
): void {
  if (
    !can(
      session,
      "claim.read",
    ) ||
    !can(
      session,
      "claim.write",
    ) ||
    !can(
      session,
      "claimant.read",
    ) ||
    !can(
      session,
      "claimant.write",
    )
  ) {
    throw new Error(
      "Your DueQuity role is not authorized to create claimant activation invitations.",
    );
  }
}

function normalizeEmail(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function validEmail(
  value:
    string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

function invitationFromRow(
  row:
    InvitationRow,
): AssignedLeadActivationInvitation {
  return {
    id:
      row.id,

    workcaseId:
      row.workcase_id,

    claimantId:
      row.claimant_id,

    claimantReference:
      row.claimant_reference,

    legalFirstName:
      row.legal_first_name,

    legalLastName:
      row.legal_last_name,

    email:
      row.email,

    mobilePhone:
      row.mobile_phone,

    authUserId:
      row.auth_user_id ??
      undefined,

    status:
      row.status,

    sentByStaffUserId:
      row.sent_by_staff_user_id,

    sentAt:
      row.sent_at ??
      undefined,

    activatedAt:
      row.activated_at ??
      undefined,

    revokedAt:
      row.revoked_at ??
      undefined,

    expiresAt:
      row.expires_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

/* ========================================================================== */
/* Expiration cleanup                                                          */
/* ========================================================================== */

async function expireStaleAssignedLeadInvitations():
  Promise<void> {
  const admin =
    getSupabaseAdmin();

  const now =
    new Date()
      .toISOString();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_activation_invitations",
      )
      .select(
        "id, auth_user_id",
      )
      .eq(
        "status",
        "sent",
      )
      .lt(
        "expires_at",
        now,
      );

  if (error) {
    throw new Error(
      `Unable to inspect expired assigned claimant invitations: ${error.message}`,
    );
  }

  for (
    const rawRow of
      data ??
      []
  ) {
    const row =
      rawRow as {
        id:
          string;

        auth_user_id:
          string | null;
      };

    const {
      error:
        expireError,
    } =
      await admin.rpc(
        "expire_assigned_lead_claimant_activation_invitation",
        {
          p_invitation_id:
            row.id,
        },
      );

    if (expireError) {
      throw new Error(
        `Unable to expire assigned claimant invitation: ${expireError.message}`,
      );
    }

    /*
     * The invitation is no longer usable once the database state is expired.
     * Remove the temporary invited Auth identity when one exists.
     */
    if (
      row.auth_user_id
    ) {
      await admin.auth.admin
        .deleteUser(
          row.auth_user_id,
        );
    }
  }
}

/* ========================================================================== */
/* Candidate reads                                                             */
/* ========================================================================== */

export async function listAssignedLeadActivationCandidates(
  session:
    StaffSession,
): Promise<
  AssignedLeadActivationCandidate[]
> {
  requireActivationAuthority(
    session,
  );

  await expireStaleAssignedLeadInvitations();

  const admin =
    getSupabaseAdmin();

  let workcaseQuery =
    admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        [
          "id",
          "claimant_id",
          "claimant_reference",
          "discovered_record_id",
          "legal_first_name",
          "legal_last_name",
          "email",
          "mobile_phone",
          "originating_staff_user_id",
          "assigned_staff_user_id",
          "auth_user_id",
          "status",
        ].join(
          ", ",
        ),
      )
      .eq(
        "status",
        "ready_for_activation",
      )
      .is(
        "auth_user_id",
        null,
      );

  if (
    !hasGlobalAccess(
      session,
    )
  ) {
    workcaseQuery =
      workcaseQuery.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const [
    workcasesResult,
    invitationsResult,
  ] =
    await Promise.all([
      workcaseQuery.order(
        "updated_at",
        {
          ascending:
            false,
        },
      ),

      admin
        .from(
          "assigned_lead_claimant_activation_invitations",
        )
        .select(
          "workcase_id",
        )
        .in(
          "status",
          [
            "preparing",
            "sent",
          ],
        ),
    ]);

  if (
    workcasesResult.error
  ) {
    throw new Error(
      `Unable to load assigned claimant activation candidates: ${workcasesResult.error.message}`,
    );
  }

  if (
    invitationsResult.error
  ) {
    throw new Error(
      `Unable to inspect assigned claimant invitation state: ${invitationsResult.error.message}`,
    );
  }

  const openWorkcases =
    new Set(
      (
        invitationsResult.data ??
        []
      ).map(
        (
          row,
        ) =>
          String(
            row.workcase_id,
          ),
      ),
    );

  return (
    workcasesResult.data ??
    []
  )
    .map(
      (
        rawRow,
      ) =>
        rawRow as unknown as
          WorkcaseRow,
    )
    .filter(
      (
        row,
      ) =>
        !openWorkcases.has(
          row.id,
        ),
    )
    .map(
      (
        row,
      ) => ({
        workcaseId:
          row.id,

        claimantId:
          row.claimant_id,

        claimantReference:
          row.claimant_reference,

        discoveredRecordId:
          row.discovered_record_id,

        legalFirstName:
          row.legal_first_name,

        legalLastName:
          row.legal_last_name,

        email:
          row.email,

        mobilePhone:
          row.mobile_phone,

        originatingStaffUserId:
          row.originating_staff_user_id,

        assignedStaffUserId:
          row.assigned_staff_user_id,
      }),
    );
}

/* ========================================================================== */
/* Invitation history                                                          */
/* ========================================================================== */

export async function listAssignedLeadActivationInvitations(
  session:
    StaffSession,
): Promise<
  AssignedLeadActivationInvitation[]
> {
  requireActivationAuthority(
    session,
  );

  await expireStaleAssignedLeadInvitations();

  const admin =
    getSupabaseAdmin();

  if (
    hasGlobalAccess(
      session,
    )
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "assigned_lead_claimant_activation_invitations",
        )
        .select(
          "*",
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          200,
        );

    if (error) {
      throw new Error(
        `Unable to load assigned claimant invitations: ${error.message}`,
      );
    }

    return (
      data ??
      []
    ).map(
      (
        row,
      ) =>
        invitationFromRow(
          row as
            InvitationRow,
        ),
    );
  }

  const {
    data:
      ownedWorkcases,
    error:
      ownershipError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id",
      )
      .eq(
        "assigned_staff_user_id",
        session.user.id,
      )
      .neq(
        "status",
        "closed",
      );

  if (
    ownershipError
  ) {
    throw new Error(
      `Unable to resolve assigned claimant invitation ownership: ${ownershipError.message}`,
    );
  }

  const workcaseIds =
    (
      ownedWorkcases ??
      []
    ).map(
      (
        row,
      ) =>
        String(
          row.id,
        ),
    );

  if (
    workcaseIds.length ===
    0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_activation_invitations",
      )
      .select(
        "*",
      )
      .in(
        "workcase_id",
        workcaseIds,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        200,
      );

  if (error) {
    throw new Error(
      `Unable to load assigned claimant invitations: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      invitationFromRow(
        row as
          InvitationRow,
      ),
  );
}

/* ========================================================================== */
/* Send invitation                                                             */
/* ========================================================================== */

export async function inviteAssignedLeadClaimantUser(
  input:
    InviteAssignedLeadClaimantInput,
): Promise<
  InviteAssignedLeadClaimantResult
> {
  requireActivationAuthority(
    input.session,
  );

  await expireStaleAssignedLeadInvitations();

  const workcaseId =
    input.workcaseId
      .trim();

  const redirectTo =
    input.redirectTo
      .trim();

  if (
    !workcaseId ||
    !redirectTo
  ) {
    throw new Error(
      "Assigned claimant activation information is incomplete.",
    );
  }

  const admin =
    getSupabaseAdmin();

  /*
   * The application never accepts claimant identity/contact values from the
   * activation form.
   *
   * Stage 29 copies the already-saved workcase identity into the prepared
   * invitation. This prevents the activation action from silently changing
   * the claimant's name, email or phone.
   */
  const expiresAt =
    new Date(
      Date.now() +
        ACTIVATION_LIFETIME_MS,
    );

  const {
    data:
      preparedData,
    error:
      preparedError,
  } =
    await admin.rpc(
      "prepare_assigned_lead_claimant_activation_invitation",
      {
        p_workcase_id:
          workcaseId,

        p_staff_user_id:
          input.session.user.id,

        p_expires_at:
          expiresAt.toISOString(),
      },
    );

  if (
    preparedError ||
    !Array.isArray(
      preparedData,
    ) ||
    preparedData.length !==
      1
  ) {
    throw new Error(
      preparedError?.message ??
      "DueQuity could not prepare the assigned claimant activation invitation.",
    );
  }

  const prepared =
    preparedData[0] as
      InvitationRow;

  const persistedEmail =
    normalizeEmail(
      prepared.email,
    );

  if (
    !validEmail(
      persistedEmail,
    ) ||
    !/^[0-9]{10}$/.test(
      prepared.mobile_phone,
    )
  ) {
    await admin.rpc(
      "mark_assigned_lead_claimant_activation_failed",
      {
        p_invitation_id:
          prepared.id,

        p_staff_user_id:
          input.session.user.id,
      },
    );

    throw new Error(
      "The saved assigned claimant contact information is incomplete for activation.",
    );
  }

  /*
   * Fail before touching Supabase Auth when the email belongs to a staff
   * identity.
   */
  const {
    data:
      staffEmailCollision,
    error:
      staffEmailCollisionError,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id",
      )
      .eq(
        "email",
        persistedEmail,
      )
      .maybeSingle();

  if (
    staffEmailCollisionError
  ) {
    await admin.rpc(
      "mark_assigned_lead_claimant_activation_failed",
      {
        p_invitation_id:
          prepared.id,

        p_staff_user_id:
          input.session.user.id,
      },
    );

    throw new Error(
      `Unable to verify claimant authentication audience: ${staffEmailCollisionError.message}`,
    );
  }

  if (
    staffEmailCollision
  ) {
    await admin.rpc(
      "mark_assigned_lead_claimant_activation_failed",
      {
        p_invitation_id:
          prepared.id,

        p_staff_user_id:
          input.session.user.id,
      },
    );

    throw new Error(
      "A DueQuity staff Auth identity cannot be used as a claimant identity.",
    );
  }

  let authUserId:
    string | undefined;

  try {
    const {
      data:
        inviteData,
      error:
        inviteError,
    } =
      await admin.auth.admin
        .inviteUserByEmail(
          persistedEmail,
          {
            redirectTo,

            data: {
              audience:
                "claimant_preclaim",

              claimant_id:
                prepared.claimant_id,

              claimant_reference:
                prepared.claimant_reference,

              workcase_id:
                prepared.workcase_id,

              recovery_stage:
                "assigned_lead",

              legal_name:
                `${prepared.legal_first_name} ${prepared.legal_last_name}`,
            },
          },
        );

    if (
      inviteError ||
      !inviteData.user
    ) {
      throw new Error(
        inviteError?.message ??
        "Supabase did not create the assigned claimant invitation identity.",
      );
    }

    authUserId =
      inviteData.user.id;

    /*
     * Defense in depth.
     *
     * We checked the email before invitation, but also verify the actual Auth
     * UUID returned by Supabase.
     */
    const {
      data:
        staffIdCollision,
      error:
        staffIdCollisionError,
    } =
      await admin
        .from(
          "staff_users",
        )
        .select(
          "id",
        )
        .eq(
          "id",
          authUserId,
        )
        .maybeSingle();

    if (
      staffIdCollisionError
    ) {
      throw new Error(
        `Unable to verify claimant Auth identity: ${staffIdCollisionError.message}`,
      );
    }

    if (
      staffIdCollision
    ) {
      /*
       * Never delete this Auth user: it is an existing DueQuity staff
       * identity.
       */
      authUserId =
        undefined;

      throw new Error(
        "A DueQuity staff Auth identity cannot be used as a claimant identity.",
      );
    }

    const {
      data:
        sentData,
      error:
        sentError,
    } =
      await admin.rpc(
        "mark_assigned_lead_claimant_activation_sent",
        {
          p_invitation_id:
            prepared.id,

          p_auth_user_id:
            inviteData.user.id,

          p_staff_user_id:
            input.session.user.id,
        },
      );

    if (
      sentError ||
      !Array.isArray(
        sentData,
      ) ||
      sentData.length !==
        1
    ) {
      throw new Error(
        sentError?.message ??
        "DueQuity could not finalize the assigned claimant activation invitation.",
      );
    }

    return {
      invitationId:
        prepared.id,

      workcaseId:
        prepared.workcase_id,

      claimantId:
        prepared.claimant_id,

      claimantReference:
        prepared.claimant_reference,

      email:
        persistedEmail,
    };
  } catch (
    failure
  ) {
    await admin.rpc(
      "mark_assigned_lead_claimant_activation_failed",
      {
        p_invitation_id:
          prepared.id,

        p_staff_user_id:
          input.session.user.id,
      },
    );

    /*
     * Only remove an Auth identity that was created for this attempted
     * claimant invitation and was not identified as an existing staff user.
     */
    if (
      authUserId
    ) {
      await admin.auth.admin
        .deleteUser(
          authUserId,
        );
    }

    throw failure;
  }
}