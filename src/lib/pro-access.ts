import type {
  Permission,
  UserRole,
} from "@/domain/types";

/**
 * DUEQUITY PRO ACCESS POLICY
 *
 * Every hired DueQuity employee works nationally.
 *
 * Role + permissions determine ordinary workspace access.
 *
 * Discovered Records is intentionally different:
 *
 * - it is an owner/admin-only research workspace
 * - staff receive approved Excel worklists separately
 * - role alone is NOT sufficient
 * - only the exact authorized Supabase staff identity may access it
 */

export const DISCOVERED_RECORDS_ADMIN_EMAIL =
  "invest@westforgeholdings.com";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ProRouteRule {
  path: string;

  permission?: Permission;

  roles?: readonly UserRole[];

  exact?: boolean;
}

/* ========================================================================== */
/* Route policy                                                                */
/* ========================================================================== */

const PRO_ROUTE_RULES: readonly ProRouteRule[] = [
  {
    path:
      "/pro/discovered-records",

    roles: [
      "super_admin",
    ],
  },

  {
    path:
      "/pro/opportunities",

    permission:
      "opportunity.read",

    roles: [
      "research_analyst",
      "operations_specialist",
      "claims_manager",
      "compliance_officer",
      "attorney_liaison",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/properties",

    permission:
      "opportunity.read",

    roles: [
      "research_analyst",
      "operations_specialist",
      "claims_manager",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/claims",

    permission:
      "claim.read",

    roles: [
      "operations_specialist",
      "claims_manager",
      "compliance_officer",
      "attorney_liaison",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/claimants",

    permission:
      "claimant.read",

    roles: [
      "research_analyst",
      "operations_specialist",
      "claims_manager",
      "compliance_officer",
      "attorney_liaison",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/documents",

    permission:
      "document.read",

    roles: [
      "research_analyst",
      "operations_specialist",
      "claims_manager",
      "compliance_officer",
      "attorney_liaison",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/tasks",

    permission:
      "claim.write",

    roles: [
      "operations_specialist",
      "claims_manager",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/recoveries",

    permission:
      "recovery.read",

    roles: [
      "operations_specialist",
      "claims_manager",
      "compliance_officer",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/jurisdictions",

    permission:
      "jurisdiction.read",

    roles: [
      "research_analyst",
      "operations_specialist",
      "claims_manager",
      "compliance_officer",
      "attorney_liaison",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/fee-policies",

    permission:
      "fee_policy.write",

    roles: [
      "super_admin",
    ],
  },

  {
    path:
      "/pro/manager",

    permission:
      "report.read",

    roles: [
      "claims_manager",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/staff",

    permission:
      "user.manage",

    roles: [
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/compliance",

    permission:
      "compliance.approve",

    roles: [
      "compliance_officer",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/attorneys",

    permission:
      "attorney.read",

    roles: [
      "operations_specialist",
      "claims_manager",
      "compliance_officer",
      "attorney_liaison",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro/audit",

    permission:
      "audit.read",

    roles: [
      "compliance_officer",
      "administrator",
      "super_admin",
    ],
  },

  {
    path:
      "/pro",

    roles: [
      "super_admin",
    ],

    exact:
      true,
  },
];

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function normalizePathname(
  pathname: string,
): string {
  const trimmed =
    pathname.trim();

  if (
    trimmed.length >
      1 &&
    trimmed.endsWith(
      "/",
    )
  ) {
    return trimmed.slice(
      0,
      -1,
    );
  }

  return trimmed ||
    "/";
}

function normalizeEmail(
  value:
    string | undefined,
): string {
  return (
    value
      ?.trim()
      .toLowerCase() ??
    ""
  );
}

function routeMatches(
  pathname: string,
  rule: ProRouteRule,
): boolean {
  if (
    rule.exact
  ) {
    return (
      pathname ===
      rule.path
    );
  }

  return (
    pathname ===
      rule.path ||
    pathname.startsWith(
      `${rule.path}/`,
    )
  );
}

function resolveProRouteRule(
  pathname: string,
): ProRouteRule | null {
  const normalized =
    normalizePathname(
      pathname,
    );

  return (
    PRO_ROUTE_RULES.find(
      (rule) =>
        routeMatches(
          normalized,
          rule,
        ),
    ) ??
    null
  );
}

export function isDiscoveredRecordsPath(
  pathname: string,
): boolean {
  const normalized =
    normalizePathname(
      pathname,
    );

  return (
    normalized ===
      "/pro/discovered-records" ||
    normalized.startsWith(
      "/pro/discovered-records/",
    )
  );
}

/* ========================================================================== */
/* Discovery administrator                                                     */
/* ========================================================================== */

export function canAccessDiscoveredRecords(
  role: UserRole,
  email:
    string | undefined,
): boolean {
  return (
    role ===
      "super_admin" &&
    normalizeEmail(
      email,
    ) ===
      DISCOVERED_RECORDS_ADMIN_EMAIL
  );
}

/* ========================================================================== */
/* Staff landing                                                               */
/* ========================================================================== */

export function staffLandingPath(
  role: UserRole,
): string {
  switch (
    role
  ) {
    case "research_analyst":
      /*
       * Research analysts no longer work from the discovery queue.
       *
       * The administrator provides approved Excel worklists separately.
       */
      return "/pro/opportunities";

    case "operations_specialist":
      return "/pro/claims";

    case "claims_manager":
      return "/pro/manager";

    case "compliance_officer":
      return "/pro/compliance";

    case "attorney_liaison":
      return "/pro/attorneys";

    case "administrator":
      return "/pro/manager";

    case "super_admin":
      return "/pro";

    default:
      return "/";
  }
}

/* ========================================================================== */
/* Route access                                                                */
/* ========================================================================== */

export function canAccessProPath(
  role: UserRole,
  permissions:
    readonly Permission[],
  pathname: string,
  email?: string,
): boolean {
  /*
   * IMPORTANT:
   *
   * Discovery authorization is checked BEFORE the super-admin shortcut.
   *
   * A super_admin role by itself therefore does not expose the confidential
   * discovery workspace.
   */
  if (
    isDiscoveredRecordsPath(
      pathname,
    )
  ) {
    return canAccessDiscoveredRecords(
      role,
      email,
    );
  }

  if (
    role ===
    "super_admin"
  ) {
    return true;
  }

  const rule =
    resolveProRouteRule(
      pathname,
    );

  if (
    !rule
  ) {
    return false;
  }

  if (
    rule.roles &&
    !rule.roles.includes(
      role,
    )
  ) {
    return false;
  }

  if (
    rule.permission &&
    !permissions.includes(
      rule.permission,
    )
  ) {
    return false;
  }

  return true;
}