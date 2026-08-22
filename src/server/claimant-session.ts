import "server-only";

import {
  tryGetClaimantSession,
  type ClaimantSession,
} from "@/lib/session";

import { getSupabaseAdmin } from "@/server/supabase-admin";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

/* ========================================================================== */
/* Database row                                                               */
/* ========================================================================== */

interface ClaimantOnboardingAuthRow {
  claimant_id: string;
}

/* ========================================================================== */
/* Production claimant session                                                */
/* ========================================================================== */

async function resolveSupabaseClaimantSession(): Promise<
  ClaimantSession | null
> {
  const auth =
    await getSupabaseServerAuth();

  /*
   * getUser() validates the current access token with Supabase Auth.
   * Browser-supplied identity values are never trusted directly.
   */
  const {
    data: {
      user: authUser,
    },
    error: authError,
  } = await auth.auth.getUser();

  if (
    authError ||
    !authUser
  ) {
    return null;
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await admin
    .from("claimant_onboarding")
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
    return null;
  }

  const row =
    data as ClaimantOnboardingAuthRow;

  /*
   * Authentication alone never grants claimant portal access.
   *
   * The Supabase Auth identity must map to an existing claimant onboarding
   * record through claimant_auth_user_id.
   */
  return {
    claimantId:
      row.claimant_id,

    provider:
      "supabase",
  };
}

/* ========================================================================== */
/* Unified server resolver                                                    */
/* ========================================================================== */

/**
 * Resolve the current claimant session.
 *
 * During `next dev`, the explicitly enabled local development adapter remains
 * available so local portal development is not interrupted.
 *
 * Outside that development-only condition, identity must come from Supabase
 * Auth and map to a public.claimant_onboarding record through
 * claimant_auth_user_id.
 */
export async function resolveClaimantSession(): Promise<
  ClaimantSession | null
> {
  const localSession =
    tryGetClaimantSession();

  if (localSession) {
    return localSession;
  }

  return resolveSupabaseClaimantSession();
}