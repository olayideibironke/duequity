import "server-only";

import type {
  StaffUser,
  StateCode,
} from "@/domain/types";

import {
  isUserRole,
  permissionsFor,
  tryGetStaffSession,
  type StaffSession,
} from "@/lib/session";

import { getSupabaseAdmin } from "@/server/supabase-admin";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

/* ========================================================================== */
/* Database row                                                               */
/* ========================================================================== */

interface StaffUserRow {
  id: string;

  name: string;

  email: string;

  role: string;

  title: string | null;

  states_cleared: string[] | null;

  mfa_enrolled: boolean;

  status: string;
}

/* ========================================================================== */
/* Validation                                                                 */
/* ========================================================================== */

function normalizeStatesCleared(
  values: string[] | null,
): StateCode[] {
  if (!values) {
    return [];
  }

  return values
    .map((value) =>
      value.trim().toUpperCase(),
    )
    .filter((value) =>
      /^[A-Z]{2}$/.test(value),
    ) as StateCode[];
}

/* ========================================================================== */
/* Production staff session                                                   */
/* ========================================================================== */

async function resolveSupabaseStaffSession(): Promise<
  StaffSession | null
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
    .from("staff_users")
    .select(
      "id, name, email, role, title, states_cleared, mfa_enrolled, status",
    )
    .eq(
      "id",
      authUser.id,
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to resolve staff profile: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  const row =
    data as StaffUserRow;

  /*
   * Authentication alone never creates staff authority.
   *
   * The Auth identity must also map to an active staff_users record.
   */
  if (
    row.status !== "active"
  ) {
    return null;
  }

  if (
    !isUserRole(
      row.role,
    ) ||
    row.role === "claimant"
  ) {
    return null;
  }

  const user: StaffUser = {
    id:
      row.id,

    name:
      row.name,

    email:
      row.email,

    role:
      row.role,

    title:
      row.title?.trim() ||
      "Duequity staff",

    statesCleared:
      normalizeStatesCleared(
        row.states_cleared,
      ),

    mfaEnrolled:
      row.mfa_enrolled,

    status:
      "active",
  };

  return {
    user,

    permissions:
      permissionsFor(
        user.role,
      ),

    provider:
      "supabase",
  };
}

/* ========================================================================== */
/* Unified server resolver                                                    */
/* ========================================================================== */

/**
 * Resolve the current staff session.
 *
 * A valid Supabase staff identity always takes precedence.
 *
 * During local development, the explicitly enabled local development adapter
 * remains available only as a fallback when no valid Supabase staff session
 * exists.
 */
export async function resolveStaffSession(): Promise<
  StaffSession | null
> {
  const supabaseSession =
    await resolveSupabaseStaffSession();

  if (supabaseSession) {
    return supabaseSession;
  }

  return tryGetStaffSession();
}