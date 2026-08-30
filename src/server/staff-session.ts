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
/* Database row                                                                */
/* ========================================================================== */

interface StaffUserRow {
  id:
    string;

  name:
    string;

  email:
    string;

  role:
    string;

  title:
    string | null;

  states_cleared:
    string[] | null;

  mfa_enrolled:
    boolean;

  status:
    string;
}

interface SupabaseStaffResolution {
  authenticatedIdentity:
    boolean;

  session:
    StaffSession | null;
}

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Local identity emulation is intentionally opt-in.
 *
 * DUEQUITY_LOCAL_DEV_SESSION by itself is no longer sufficient to create a
 * staff session.
 *
 * This prevents a signed-out browser, a fresh localhost tab or an external
 * localhost deep link from silently becoming a configured development staff
 * identity.
 *
 * To deliberately use the historical local adapter, both the existing local
 * session configuration and this explicit safety switch must be enabled:
 *
 *   DUEQUITY_ENABLE_LOCAL_DEV_STAFF_FALLBACK=true
 */
function localDevelopmentStaffFallbackEnabled():
  boolean {
  return (
    process.env.NODE_ENV ===
      "development" &&
    process.env
      .DUEQUITY_ENABLE_LOCAL_DEV_STAFF_FALLBACK ===
      "true"
  );
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function normalizeStatesCleared(
  values:
    string[] | null,
): StateCode[] {
  if (!values) {
    return [];
  }

  return values
    .map(
      (
        value,
      ) =>
        value
          .trim()
          .toUpperCase(),
    )
    .filter(
      (
        value,
      ) =>
        /^[A-Z]{2}$/.test(
          value,
        ),
    ) as StateCode[];
}

function staffUserFromRow(
  row:
    StaffUserRow,
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
/* Production / real-auth staff session                                        */
/* ========================================================================== */

async function resolveSupabaseStaffSession(): Promise<
  SupabaseStaffResolution
> {
  const auth =
    await getSupabaseServerAuth();

  /*
   * getUser() validates the current access token directly with Supabase Auth.
   * Browser-supplied identity values are never trusted.
   */
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

  /*
   * A real Supabase identity exists.
   *
   * If that identity is not an active DueQuity staff identity, access fails
   * closed. We never substitute another staff identity.
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
    data as
      StaffUserRow;

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
/* Explicit local-development identity adapter                                 */
/* ========================================================================== */

/**
 * This adapter is retained only for deliberate development scenarios.
 *
 * It is NOT a normal localhost fallback.
 *
 * A missing browser authentication session must normally mean:
 *
 *   signed out
 *
 * It must never silently mean:
 *
 *   become the developer-configured Administrator
 *
 * The adapter therefore runs only when
 * DUEQUITY_ENABLE_LOCAL_DEV_STAFF_FALLBACK=true is explicitly configured.
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
    StaffUserRow[] =
    [];

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
      ) as
        StaffUserRow[];
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
      ) as
        StaffUserRow[];
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
      ) as
        StaffUserRow[];
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
/* Unified server resolver                                                     */
/* ========================================================================== */

/**
 * Resolve the current DueQuity staff session.
 *
 * Rules:
 *
 * 1. A valid Supabase staff identity always wins.
 * 2. A valid Supabase identity that is not authorized staff fails closed.
 * 3. No Supabase identity means signed out.
 * 4. Local identity substitution is disabled by default.
 * 5. The historical local adapter runs only with the explicit development
 *    opt-in DUEQUITY_ENABLE_LOCAL_DEV_STAFF_FALLBACK=true.
 *
 * This prevents account switching and localhost deep links from silently
 * resolving to the wrong DueQuity employee.
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

  if (
    !localDevelopmentStaffFallbackEnabled()
  ) {
    return null;
  }

  return resolveLocalDevelopmentStaffSession();
}