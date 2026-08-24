"use client";

import { useState } from "react";

import Link from "next/link";

import { usePathname } from "next/navigation";

import type {
  Permission,
  UserRole,
} from "@/domain/types";

import {
  canAccessProPath,
  staffLandingPath,
} from "@/lib/pro-access";

import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

import { Logo } from "@/components/brand/logo";

import { ProSearch } from "./pro-search";

import {
  IconAttorney,
  IconAudit,
  IconClaim,
  IconClaimant,
  IconClose,
  IconCompliance,
  IconDashboard,
  IconDocument,
  IconJurisdiction,
  IconMenu,
  IconOpportunity,
  IconProperty,
  IconRecovery,
  IconTask,
} from "@/components/ui/icon";

interface NavItem {
  href: string;

  label: string;

  icon: (props: {
    size?: number;

    className?: string;
  }) => React.ReactElement;

  exact?: boolean;

  badge?: number;

  badgeTone?: "caution" | "critical";
}

interface NavGroup {
  heading: string;

  items: NavItem[];
}

export function ProShell({
  children,
  operator,
  counts,
}: {
  children: React.ReactNode;

  operator: {
    name: string;

    title: string;

    role: UserRole;

    permissions: Permission[];
  };

  counts: {
    opportunities: number;

    claims: number;

    tasksOverdue: number;

    documentsOutstanding: number;

    complianceBlocked: number;
  };
}) {
  const [
    railOpen,
    setRailOpen,
  ] =
    useState(false);

  const pathname =
    usePathname();

  const homeHref =
    staffLandingPath(
      operator.role,
    );

  /*
   * Type the raw navigation before applying role filtering.
   *
   * This prevents TypeScript from widening badgeTone values such as
   * "critical" and "caution" into generic strings.
   */
  const baseGroups: NavGroup[] = [
    {
      heading: "Pipeline",

      items: [
        {
          href: "/pro",

          label: "Overview",

          icon: IconDashboard,

          exact: true,
        },

        {
          href: "/pro/discovered-records",

          label: "Discovered Records",

          icon: IconOpportunity,
        },

        {
          href: "/pro/opportunities",

          label: "Opportunities",

          icon: IconOpportunity,

          badge: counts.opportunities,
        },

        {
          href: "/pro/claims",

          label: "Claims",

          icon: IconClaim,

          badge: counts.claims,
        },

        {
          href: "/pro/recoveries",

          label: "Recoveries",

          icon: IconRecovery,
        },
      ],
    },

    {
      heading: "Work",

      items: [
        {
          href: "/pro/tasks",

          label: "Tasks",

          icon: IconTask,

          badge:
            counts.tasksOverdue ||
            undefined,

          badgeTone: "critical",
        },

        {
          href: "/pro/documents",

          label: "Documents",

          icon: IconDocument,

          badge:
            counts.documentsOutstanding ||
            undefined,

          badgeTone: "caution",
        },

        {
          href: "/pro/claimants",

          label: "Claimants",

          icon: IconClaimant,
        },

        {
          href: "/pro/properties",

          label: "Properties",

          icon: IconProperty,
        },
      ],
    },

    {
      heading: "Governance",

      items: [
        {
          href: "/pro/jurisdictions",

          label: "Jurisdictions",

          icon: IconJurisdiction,
        },

        {
          href: "/pro/fee-policies",

          label: "Fee Policies",

          icon: IconRecovery,
        },

        {
          href: "/pro/manager",

          label: "Manager Dashboard",

          icon: IconDashboard,
        },

        {
          href: "/pro/staff",

          label: "Staff Management",

          icon: IconClaimant,
        },

        {
          href: "/pro/compliance",

          label: "Compliance",

          icon: IconCompliance,

          badge:
            counts.complianceBlocked ||
            undefined,

          badgeTone: "critical",
        },

        {
          href: "/pro/attorneys",

          label: "Attorneys",

          icon: IconAttorney,
        },

        {
          href: "/pro/audit",

          label: "Audit",

          icon: IconAudit,
        },
      ],
    },
  ];

  const groups: NavGroup[] =
    baseGroups
      .map(
        (group) => ({
          ...group,

          items:
            group.items.filter(
              (item) =>
                canAccessProPath(
                  operator.role,
                  operator.permissions,
                  item.href,
                ),
            ),
        }),
      )
      .filter(
        (group) =>
          group.items.length > 0,
      );

  function isActive(
    item: NavItem,
  ) {
    if (item.exact) {
      return pathname === item.href;
    }

    return (
      pathname === item.href ||
      pathname.startsWith(
        `${item.href}/`,
      )
    );
  }

  return (
    <div className="flex min-h-full">
      <a
        href="#pro-main"
        className="skip-link"
      >
        Skip to main content
      </a>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-ink-800 bg-ink-950 transition-transform lg:static lg:translate-x-0",

          railOpen
            ? "translate-x-0"
            : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-ink-800 px-4">
          <Logo
            tone="light"
            size="sm"
            href={homeHref}
          />

          <span className="rounded-xs border border-ink-700 px-1.5 py-0.5 font-mono text-2xs tracking-tight text-ink-400">
            PRO
          </span>

          <button
            type="button"
            onClick={() =>
              setRailOpen(false)
            }
            aria-label="Close navigation"
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-300 hover:bg-ink-800 hover:text-white lg:hidden"
          >
            <IconClose size={18} />
          </button>
        </div>

        <nav
          aria-label="Operations"
          className="flex-1 overflow-y-auto px-2 py-3"
        >
          {groups.map(
            (group) => (
              <div
                key={group.heading}
                className="mb-4 last:mb-0"
              >
                <p className="eyebrow px-2 pb-1.5 text-ink-600">
                  {group.heading}
                </p>

                <ul className="space-y-0.5">
                  {group.items.map(
                    (item) => {
                      const active =
                        isActive(item);

                      const Icon =
                        item.icon;

                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() =>
                              setRailOpen(false)
                            }
                            aria-current={
                              active
                                ? "page"
                                : undefined
                            }
                            className={cn(
                              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400",

                              active
                                ? "bg-ink-800 text-white"
                                : "text-ink-400 hover:bg-ink-900 hover:text-ink-100",
                            )}
                          >
                            <Icon
                              size={17}
                              className={
                                active
                                  ? "text-accent-300"
                                  : undefined
                              }
                            />

                            <span className="flex-1 truncate">
                              {item.label}
                            </span>

                            {item.badge !==
                              undefined &&
                              item.badge > 0 && (
                                <span
                                  className={cn(
                                    "tnum rounded-xs px-1.5 py-0.5 text-2xs font-semibold",

                                    item.badgeTone ===
                                      "critical"
                                      ? "bg-critical-600 text-white"
                                      : item.badgeTone ===
                                          "caution"
                                        ? "bg-caution-600 text-white"
                                        : "bg-ink-700 text-ink-200",
                                  )}
                                >
                                  {item.badge}
                                </span>
                              )}
                          </Link>
                        </li>
                      );
                    },
                  )}
                </ul>
              </div>
            ),
          )}
        </nav>

        <div className="shrink-0 border-t border-ink-800 p-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-2xs font-semibold text-ink-200"
            >
              {initials(operator.name)}
            </span>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-100">
                {operator.name}
              </p>

              <p className="truncate text-2xs text-ink-500">
                {operator.title}
              </p>
            </div>
          </div>

          <p className="mt-2 text-2xs text-ink-600">
            National work access
          </p>

          <Link
            href="/auth/update-password?audience=staff"
            className="mt-3 block w-full rounded-md border border-ink-700 px-3 py-2 text-center text-sm font-medium text-ink-300 transition-colors hover:border-ink-600 hover:bg-ink-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
          >
            Security / Password
          </Link>

          <form
            action="/auth/sign-out"
            method="post"
            className="mt-2"
          >
            <button
              type="submit"
              className="w-full rounded-md border border-ink-700 px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:border-ink-600 hover:bg-ink-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {railOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() =>
            setRailOpen(false)
          }
          className="fixed inset-0 z-30 bg-ink-950/50 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper/95 px-3 backdrop-blur-sm sm:px-4">
          <button
            type="button"
            onClick={() =>
              setRailOpen(true)
            }
            aria-label="Open navigation"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 lg:hidden"
          >
            <IconMenu size={19} />
          </button>

          <ProSearch />

          <Link
            href="/"
            className="ml-auto hidden shrink-0 rounded-sm px-2 py-1.5 text-sm text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 sm:block"
          >
            duequity.com
          </Link>
        </header>

        <main
          id="pro-main"
          className="w-full min-w-0 self-stretch flex-1 bg-canvas px-3 py-5 sm:px-5 sm:py-6"
        >
          <div className="w-full max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}