import type {
  Permission,
  StateCode,
  StaffUser,
  UserRole,
} from "@/domain/types";

/**
 * SESSION AND AUTHORISATION
 *
 * The application currently supports:
 *
 *   1. A local development-only session adapter.
 *   2. Production Supabase authentication through the server auth adapter.
 *
 * The local adapter remains isolated to `next dev` and can never authenticate a
 * production build.
 *
 * Production session resolution is intentionally implemented outside this
 * shared policy module so client-safe permission helpers do not import
 * server-only cookie or service-role code.
 *
 * Authorisation remains server enforced. Hidden UI controls are not access
 * control.
 */

/* ========================================================================== */
/* Permission matrix                                                           */
/* ========================================================================== */

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  claimant: [],

  research_analyst: [
    "opportunity.read",
    "opportunity.write",
    "claimant.read",
    "document.read",
    "jurisdiction.read",
    "attorney.read",
    "claim.read",
  ],

  operations_specialist: [
    "opportunity.read",
    "opportunity.write",
    "claim.read",
    "claim.write",
    "claimant.read",
    "claimant.write",
    "claimant.read_sensitive",
    "document.read",
    "document.read_restricted",
    "document.review",
    "jurisdiction.read",
    "attorney.read",
    "recovery.read",
  ],

  claims_manager: [
    "opportunity.read",
    "opportunity.write",
    "opportunity.disqualify",
    "claim.read",
    "claim.write",
    "claim.submit",
    "claim.close",
    "claimant.read",
    "claimant.write",
    "claimant.read_sensitive",
    "document.read",
    "document.read_restricted",
    "document.review",
    "jurisdiction.read",
    "fee_agreement.write",
    "attorney.read",
    "attorney.refer",
    "recovery.read",
    "recovery.write",
    "report.read",
  ],

  compliance_officer: [
    "opportunity.read",
    "claim.read",
    "claimant.read",
    "document.read",
    "jurisdiction.read",
    "jurisdiction.write",
    "compliance.approve",
    "fee_agreement.write",
    "attorney.read",
    "recovery.read",
    "report.read",
    "audit.read",
  ],

  attorney_liaison: [
    "opportunity.read",
    "claim.read",
    "claimant.read",
    "document.read",
    "jurisdiction.read",
    "attorney.read",
    "attorney.refer",
  ],

  administrator: [
    "opportunity.read",
    "opportunity.write",
    "claim.read",
    "claim.write",
    "claimant.read",
    "claimant.write",
    "document.read",
    "document.review",
    "jurisdiction.read",
    "jurisdiction.write",
    "attorney.read",
    "recovery.read",
    "report.read",
    "audit.read",
    "user.manage",
    "settings.manage",
  ],

  super_admin: [
    "opportunity.read",
    "opportunity.write",
    "opportunity.disqualify",
    "claim.read",
    "claim.write",
    "claim.submit",
    "claim.close",
    "claimant.read",
    "claimant.write",
    "claimant.read_sensitive",
    "document.read",
    "document.read_restricted",
    "document.review",
    "document.delete",
    "jurisdiction.read",
    "jurisdiction.write",
    "compliance.approve",
    "fee_policy.write",
    "fee_policy.approve",
    "fee_agreement.write",
    "attorney.read",
    "attorney.refer",
    "recovery.read",
    "recovery.write",
    "recovery.approve",
    "report.read",
    "audit.read",
    "user.manage",
    "settings.manage",
  ],
};

const USER_ROLES: UserRole[] = [
  "claimant",
  "operations_specialist",
  "research_analyst",
  "compliance_officer",
  "claims_manager",
  "attorney_liaison",
  "administrator",
  "super_admin",
];

/* ========================================================================== */
/* Session shapes                                                              */
/* ========================================================================== */

export type SessionProvider =
  | "local_development"
  | "supabase";

export interface StaffSession {
  user: StaffUser;

  permissions: Permission[];

  provider: SessionProvider;
}

export interface ClaimantSession {
  claimantId: string;

  provider: SessionProvider;
}

export const STAFF_AUTHENTICATION_REQUIRED_MESSAGE =
  "Staff authentication is required.";

export const CLAIMANT_AUTHENTICATION_REQUIRED_MESSAGE =
  "Claimant authentication is required.";

/* ========================================================================== */
/* Local development adapter gate                                              */
/* ========================================================================== */

export function localDevelopmentSessionAdapterActive(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DUEQUITY_LOCAL_DEV_SESSION === "enabled"
  );
}

function environmentValue(
  key: string,
): string | undefined {
  const value =
    process.env[key]?.trim();

  return value || undefined;
}

function localDevelopmentStaffRole(): UserRole {
  const requested =
    environmentValue(
      "DUEQUITY_LOCAL_DEV_STAFF_ROLE",
    );

  if (
    requested &&
    (USER_ROLES as string[]).includes(
      requested,
    )
  ) {
    return requested as UserRole;
  }

  return "super_admin";
}

function localDevelopmentStatesCleared(): StateCode[] {
  const raw =
    environmentValue(
      "DUEQUITY_LOCAL_DEV_STAFF_STATES",
    );

  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((token) =>
      token
        .trim()
        .toUpperCase(),
    )
    .filter((token) =>
      /^[A-Z]{2}$/.test(
        token,
      ),
    ) as StateCode[];
}

function localDevelopmentStaffUser(): StaffUser {
  const role =
    localDevelopmentStaffRole();

  const id =
    environmentValue(
      "DUEQUITY_LOCAL_DEV_STAFF_ID",
    ) ??
    `local-dev-${role.replaceAll(
      "_",
      "-",
    )}`;

  return {
    id,

    name:
      environmentValue(
        "DUEQUITY_LOCAL_DEV_STAFF_NAME",
      ) ??
      "Local development operator",

    email:
      `${id}@local-development.invalid`,

    role,

    title:
      "Local development session adapter",

    statesCleared:
      localDevelopmentStatesCleared(),

    mfaEnrolled:
      false,

    status:
      "active",
  };
}

/* ========================================================================== */
/* Local development staff session                                             */
/* ========================================================================== */

/**
 * Development-only compatibility session.
 *
 * Production staff authentication is resolved by the server-side Supabase auth
 * adapter. Existing call sites stay operational during the controlled migration
 * because this function remains unchanged for `next dev`.
 */
export function tryGetStaffSession(): StaffSession | null {
  if (
    !localDevelopmentSessionAdapterActive()
  ) {
    return null;
  }

  const user =
    localDevelopmentStaffUser();

  return {
    user,

    permissions:
      ROLE_PERMISSIONS[
        user.role
      ],

    provider:
      "local_development",
  };
}

/* ========================================================================== */
/* Shared authorisation                                                        */
/* ========================================================================== */

export function isUserRole(
  value: string,
): value is UserRole {
  return (
    USER_ROLES as string[]
  ).includes(value);
}

export function permissionsFor(
  role: UserRole,
): Permission[] {
  return ROLE_PERMISSIONS[
    role
  ];
}

export function can(
  session: StaffSession,
  permission: Permission,
): boolean {
  return session.permissions.includes(
    permission,
  );
}

export function clearedForState(
  session: StaffSession,
  state: string,
): boolean {
  if (
    session.user.statesCleared.length ===
    0
  ) {
    return true;
  }

  return session.user.statesCleared.includes(
    state as StateCode,
  );
}

/* ========================================================================== */
/* Claimant local development session                                          */
/* ========================================================================== */

/**
 * Claimant production authentication remains a separate audience and will be
 * connected after staff authentication is complete.
 */
export function tryGetClaimantSession(): ClaimantSession | null {
  if (
    !localDevelopmentSessionAdapterActive()
  ) {
    return null;
  }

  const claimantId =
    environmentValue(
      "DUEQUITY_LOCAL_DEV_CLAIMANT_ID",
    );

  if (!claimantId) {
    return null;
  }

  return {
    claimantId,

    provider:
      "local_development",
  };
}