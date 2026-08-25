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
  claimant_id: string;
}

interface ClaimantInvitationSessionRow {
  claimant_id: string;

  status: string;
}

interface SupabaseClaimantResolution {
  authenticatedIdentity: boolean;

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

  const {
    data,
    error,
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

  if (error) {
    throw new Error(
      `Unable to resolve claimant profile: ${error.message}`,
    );
  }

  if (!data) {
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
  }

  const row =
    data as ClaimantOnboardingAuthRow;

  /*
   * Invitation-backed claimant identities must finish activation before portal
   * access is granted.
   *
   * Legacy claimant Auth identities created before controlled invitations were
   * introduced have no invitation rows and remain valid.
   */
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
    ) as ClaimantInvitationSessionRow[];

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

/* ========================================================================== */
/* Unified resolver                                                            */
/* ========================================================================== */

/**
 * A real Supabase identity always takes precedence.
 *
 * This matters during local invitation testing: a pending real claimant invite
 * must never fall through to the development claimant adapter and accidentally
 * receive portal access.
 */
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