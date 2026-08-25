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

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

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
/* Constants                                                                   */
/* ========================================================================== */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function staffUserFromRow(
  row: StaffUserRow,
): StaffUser | null {
  if (
    row.status !==
    "active"
  ) {
    return null;
  }

  if (
    !isUserRole(
      row.role,
    ) ||
    row.role ===
      "claimant"
  ) {
    return null;
  }

  if (
    !UUID_PATTERN.test(
      row.id,
    )
  ) {
    return null;
  }

  const email =
    row.email
      .trim()
      .toLowerCase();

  if (!email) {
    return null;
  }

  return {
    id:
      row.id,

    name:
      row.name,

    email,

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
   * getUser() validates the current access token with Supabase Auth.
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
   * A real Supabase identity now exists.
   *
   * If that identity is not an active DueQuity staff identity, access must
   * fail closed. We never fall through to the local development adapter after
   * successfully authenticating a non-staff Supabase identity.
   */
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

  const user =
    staffUserFromRow(
      row,
    );

  if (!user) {
    return {
      authenticatedIdentity:
        true,

      session:
        null,
    };
  }

  if (
    !authUser.email ||
    user.email !==
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
/* Local development database binding                                          */
/* ========================================================================== */

/**
 * Resolve a development-only session to a REAL persisted DueQuity staff row.
 *
 * The historical local adapter created synthetic identifiers such as:
 *
 *   local-dev-super-admin
 *
 * That was sufficient while local pages used local-only data. It is no longer
 * valid now that Mail, claimant messaging, audit records and other operational
 * repositories enforce UUID foreign keys to public.staff_users.
 *
 * Development therefore keeps the convenience of DUEQUITY_LOCAL_DEV_SESSION,
 * but database-backed operations always receive a real persisted staff UUID.
 *
 * Resolution priority:
 *
 *   1. DUEQUITY_LOCAL_DEV_STAFF_ID when it is a UUID
 *   2. DUEQUITY_LOCAL_DEV_STAFF_EMAIL when explicitly configured
 *   3. The single active staff user matching DUEQUITY_LOCAL_DEV_STAFF_ROLE
 *
 * If more than one active employee has the selected role, development fails
 * closed until DUEQUITY_LOCAL_DEV_STAFF_EMAIL is specified.
 */
async function resolveLocalDevelopmentStaffSession(): Promise<
  StaffSession | null
> {
  const localSession =
    tryGetStaffSession();

  if (!localSession) {
    return null;
  }

  const admin =
    getSupabaseAdmin();

  const configuredId =
    process.env
      .DUEQUITY_LOCAL_DEV_STAFF_ID
      ?.trim();

  const configuredEmail =
    process.env
      .DUEQUITY_LOCAL_DEV_STAFF_EMAIL
      ?.trim()
      .toLowerCase();

  let rows:
    StaffUserRow[] = [];

  if (
    configuredId &&
    UUID_PATTERN.test(
      configuredId,
    )
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "staff_users",
        )
        .select(
          "id, name, email, role, title, states_cleared, mfa_enrolled, status",
        )
        .eq(
          "id",
          configuredId,
        )
        .eq(
          "status",
          "active",
        )
        .limit(
          2,
        );

    if (error) {
      throw new Error(
        `Unable to bind local development staff by ID: ${error.message}`,
      );
    }

    rows =
      (
        data ??
        []
      ) as StaffUserRow[];
  } else if (
    configuredEmail
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "staff_users",
        )
        .select(
          "id, name, email, role, title, states_cleared, mfa_enrolled, status",
        )
        .eq(
          "email",
          configuredEmail,
        )
        .eq(
          "status",
          "active",
        )
        .limit(
          2,
        );

    if (error) {
      throw new Error(
        `Unable to bind local development staff by email: ${error.message}`,
      );
    }

    rows =
      (
        data ??
        []
      ) as StaffUserRow[];
  } else {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "staff_users",
        )
        .select(
          "id, name, email, role, title, states_cleared, mfa_enrolled, status",
        )
        .eq(
          "role",
          localSession.user.role,
        )
        .eq(
          "status",
          "active",
        )
        .limit(
          2,
        );

    if (error) {
      throw new Error(
        `Unable to bind local development staff by role: ${error.message}`,
      );
    }

    rows =
      (
        data ??
        []
      ) as StaffUserRow[];
  }

  if (
    rows.length ===
    0
  ) {
    throw new Error(
      `No active persisted DueQuity staff account matches the local development role "${localSession.user.role}".`,
    );
  }

  if (
    rows.length >
    1
  ) {
    throw new Error(
      `More than one active DueQuity staff account has role "${localSession.user.role}". Set DUEQUITY_LOCAL_DEV_STAFF_EMAIL in .env.local to select the intended staff identity.`,
    );
  }

  const user =
    staffUserFromRow(
      rows[0],
    );

  if (!user) {
    throw new Error(
      "The selected local development staff record is not an active authorized DueQuity staff identity.",
    );
  }

  /*
   * Do not let a configured ID or email silently change the role selected by
   * the local development adapter.
   */
  if (
    user.role !==
    localSession.user.role
  ) {
    throw new Error(
      `Local development requested role "${localSession.user.role}" but the selected persisted staff account has role "${user.role}".`,
    );
  }

  return {
    user,

    permissions:
      permissionsFor(
        user.role,
      ),

    provider:
      "local_development",
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
 * staff_users, mismatched by email, belongs to a claimant, or is otherwise
 * unauthorized, access fails closed and the local development adapter is not
 * consulted.
 *
 * When no Supabase identity exists, next-dev may use the explicitly enabled
 * local development adapter. That adapter is now bound to a real active
 * public.staff_users record before any database-backed operation receives it.
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

  return resolveLocalDevelopmentStaffSession();
}