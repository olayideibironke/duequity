import "server-only";

import {
  tryGetClaimantSession,
  type ClaimantSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ClaimantOnboardingAuthRow {
  claimant_id:
    string;
}

interface ClaimantInvitationSessionRow {
  claimant_id:
    string;

  status:
    string;
}

interface AssignedLeadClaimantAuthRow {
  claimant_id:
    string;

  status:
    string;
}

interface AssignedLeadInvitationSessionRow {
  claimant_id:
    string;

  status:
    string;
}

interface SupabaseClaimantResolution {
  authenticatedIdentity:
    boolean;

  session:
    ClaimantSession | null;
}

/* ========================================================================== */
/* Supabase                                                                    */
/* ========================================================================== */

async function resolveSupabaseClaimantSession(): Promise<
  SupabaseClaimantResolution
> {
  const auth =
    await getSupabaseServerAuth();

  const {
    data: {
      user:
        authUser,
    },
    error:
      authError,
  } =
    await auth.auth.getUser();

  if (
    authError ||
    !authUser
  ) {
    return {
      authenticatedIdentity:
        false,

      session:
        null,
    };
  }

  const admin =
    getSupabaseAdmin();

  /* ======================================================================== */
  /* Existing Claim-backed claimant                                           */
  /* ======================================================================== */

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
        "claimant_id",
      )
      .eq(
        "claimant_auth_user_id",
        authUser.id,
      )
      .maybeSingle();

  if (
    claimantError
  ) {
    throw new Error(
      `Unable to resolve claimant profile: ${claimantError.message}`,
    );
  }

  if (
    claimantData
  ) {
    const row =
      claimantData as
        ClaimantOnboardingAuthRow;

    const {
      data:
        invitationData,
      error:
        invitationError,
    } =
      await admin
        .from(
          "claimant_activation_invitations",
        )
        .select(
          "claimant_id, status",
        )
        .eq(
          "auth_user_id",
          authUser.id,
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          1,
        );

    if (
      invitationError
    ) {
      throw new Error(
        `Unable to verify claimant activation state: ${invitationError.message}`,
      );
    }

    const invitations =
      (
        invitationData ??
        []
      ) as
        ClaimantInvitationSessionRow[];

    if (
      invitations.length >
      0
    ) {
      const invitation =
        invitations[0];

      if (
        invitation.claimant_id !==
          row.claimant_id ||
        invitation.status !==
          "activated"
      ) {
        return {
          authenticatedIdentity:
            true,

          session:
            null,
        };
      }
    }

    return {
      authenticatedIdentity:
        true,

      session: {
        claimantId:
          row.claimant_id,

        provider:
          "supabase",
      },
    };
  }

  /* ======================================================================== */
  /* Admin-assigned pre-Claim claimant                                        */
  /* ======================================================================== */

  const {
    data:
      assignedWorkcase,
    error:
      assignedWorkcaseError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "claimant_id, status",
      )
      .eq(
        "auth_user_id",
        authUser.id,
      )
      .maybeSingle();

  if (
    assignedWorkcaseError
  ) {
    throw new Error(
      `Unable to resolve assigned claimant profile: ${assignedWorkcaseError.message}`,
    );
  }

  if (
    !assignedWorkcase
  ) {
    /*
     * A real Supabase identity exists, but it does not belong to a recognized
     * DueQuity claimant profile.
     *
     * Fail closed and never fall through to the local development claimant.
     */
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
  }

  const workcase =
    assignedWorkcase as
      AssignedLeadClaimantAuthRow;

  if (
    workcase.status !==
      "activated"
  ) {
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
  }

  const {
    data:
      assignedInvitationData,
    error:
      assignedInvitationError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_activation_invitations",
      )
      .select(
        "claimant_id, status",
      )
      .eq(
        "auth_user_id",
        authUser.id,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      );

  if (
    assignedInvitationError
  ) {
    throw new Error(
      `Unable to verify assigned claimant activation state: ${assignedInvitationError.message}`,
    );
  }

  const assignedInvitations =
    (
      assignedInvitationData ??
      []
    ) as
      AssignedLeadInvitationSessionRow[];

  if (
    assignedInvitations.length ===
      0 ||
    assignedInvitations[0]
      .claimant_id !==
      workcase.claimant_id ||
    assignedInvitations[0]
      .status !==
      "activated"
  ) {
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
  }

  return {
    authenticatedIdentity:
      true,

    session: {
      claimantId:
        workcase.claimant_id,

      provider:
        "supabase",
    },
  };
}

/* ========================================================================== */
/* Unified resolver                                                            */
/* ========================================================================== */

export async function resolveClaimantSession(): Promise<
  ClaimantSession | null
> {
  const resolution =
    await resolveSupabaseClaimantSession();

  if (
    resolution.authenticatedIdentity
  ) {
    return resolution.session;
  }

  return tryGetClaimantSession();
}