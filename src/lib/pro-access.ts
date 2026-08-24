import type {
  Permission,
  UserRole,
} from "@/domain/types";

/**
 * DUEQUITY PRO ACCESS POLICY
 *
 * Every hired DueQuity employee works nationally.
 *
 * Role + permissions determine workspace access.
 * Geography does not restrict ordinary staff access.
 */

interface ProRouteRule {
  path: string;

  permission?: Permission;

  roles?: readonly UserRole[];

  exact?: boolean;
}

const PRO_ROUTE_RULES: readonly ProRouteRule[] = [
  {
    path: "/pro/discovered-records",

    permission: "opportunity.read",

    roles: [
      "research_analyst",
      "operations_specialist",
      "claims_manager",
      "administrator",
      "super_admin",
    ],
  },

  {
    path: "/pro/opportunities",

    permission: "opportunity.read",

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
    path: "/pro/properties",

    permission: "opportunity.read",

    roles: [
      "research_analyst",
      "operations_specialist",
      "claims_manager",
      "administrator",
      "super_admin",
    ],
  },

  {
    path: "/pro/claims",

    permission: "claim.read",

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
    path: "/pro/claimants",

    permission: "claimant.read",

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
    path: "/pro/documents",

    permission: "document.read",

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
    path: "/pro/tasks",

    permission: "claim.write",

    roles: [
      "operations_specialist",
      "claims_manager",
      "administrator",
      "super_admin",
    ],
  },

  {
    path: "/pro/recoveries",

    permission: "recovery.read",

    roles: [
      "operations_specialist",
      "claims_manager",
      "compliance_officer",
      "administrator",
      "super_admin",
    ],
  },

  {
    path: "/pro/jurisdictions",

    permission: "jurisdiction.read",

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
    path: "/pro/fee-policies",

    permission: "fee_policy.write",

    roles: [
      "super_admin",
    ],
  },

  {
    path: "/pro/manager",

    permission: "report.read",

    roles: [
      "claims_manager",
      "administrator",
      "super_admin",
    ],
  },

  {
    path: "/pro/staff",

    permission: "user.manage",

    roles: [
      "administrator",
      "super_admin",
    ],
  },

  {
    path: "/pro/compliance",

    permission: "compliance.approve",

    roles: [
      "compliance_officer",
      "super_admin",
    ],
  },

  {
    path: "/pro/attorneys",

    permission: "attorney.read",

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
    path: "/pro/audit",

    permission: "audit.read",

    roles: [
      "compliance_officer",
      "administrator",
      "super_admin",
    ],
  },

  {
    path: "/pro",

    roles: [
      "super_admin",
    ],

    exact: true,
  },
];

function normalizePathname(
  pathname: string,
): string {
  const trimmed =
    pathname.trim();

  if (
    trimmed.length > 1 &&
    trimmed.endsWith("/")
  ) {
    return trimmed.slice(
      0,
      -1,
    );
  }

  return trimmed || "/";
}

function routeMatches(
  pathname: string,
  rule: ProRouteRule,
): boolean {
  if (rule.exact) {
    return pathname === rule.path;
  }

  return (
    pathname === rule.path ||
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

export function staffLandingPath(
  role: UserRole,
): string {
  switch (role) {
    case "research_analyst":
      return "/pro/discovered-records";

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

export function canAccessProPath(
  role: UserRole,
  permissions: readonly Permission[],
  pathname: string,
): boolean {
  if (role === "super_admin") {
    return true;
  }

  const rule =
    resolveProRouteRule(
      pathname,
    );

  if (!rule) {
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