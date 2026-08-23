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

interface SupabaseStaffResolution {
  authenticatedIdentity: boolean;

  session: StaffSession | null;
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
      value
        .trim()
        .toUpperCase(),
    )
    .filter((value) =>
      /^[A-Z]{2}$/.test(
        value,
      ),
    ) as StateCode[];
}

/* ========================================================================== */
/* Production staff session                                                   */
/* ========================================================================== */

async function resolveSupabaseStaffSession(): Promise<
  SupabaseStaffResolution
> {
  const auth =
    await getSupabaseServerAuth();

  /*
   * getUser() validates the access token with Supabase Auth.
   * Browser-supplied identity values are never trusted directly.
   */
  const {
    data: {
      user: authUser,
    },
    error: authError,
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

  /*
   * From this point forward, a real Supabase identity exists.
   *
   * If that identity is not authorized as active DueQuity staff, we must
   * return null WITHOUT falling through to the local development adapter.
   */
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
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
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
  }

  const row =
    data as StaffUserRow;

  if (
    !authUser.email ||
    row.email
      .trim()
      .toLowerCase() !==
      authUser.email
        .trim()
        .toLowerCase()
  ) {
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
  }

  /*
   * Authentication alone never creates staff authority.
   *
   * invited  -> may complete activation only
   * active   -> may receive staff permissions
   * suspended -> receives no staff authority
   */
  if (
    row.status !== "active"
  ) {
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
  }

  if (
    !isUserRole(
      row.role,
    ) ||
    row.role === "claimant"
  ) {
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
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
      "DueQuity staff",

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
    authenticatedIdentity:
      true,

    session: {
      user,

      permissions:
        permissionsFor(
          user.role,
        ),

      provider:
        "supabase",
    },
  };
}

/* ========================================================================== */
/* Unified server resolver                                                    */
/* ========================================================================== */

/**
 * Resolve the current staff session.
 *
 * A real authenticated Supabase identity always takes precedence.
 *
 * If a Supabase identity exists but is invited, suspended, missing from
 * staff_users, mismatched by email, or otherwise unauthorized, access fails
 * closed and the local development adapter is NOT consulted.
 *
 * The development adapter remains available only when there is no
 * authenticated Supabase identity at all.
 */
export async function resolveStaffSession(): Promise<
  StaffSession | null
> {
  const resolution =
    await resolveSupabaseStaffSession();

  if (
    resolution.authenticatedIdentity
  ) {
    return resolution.session;
  }

  return tryGetStaffSession();
}