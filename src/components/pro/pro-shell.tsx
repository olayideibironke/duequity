"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

import type {
  Permission,
  UserRole,
} from "@/domain/types";

import {
  canAccessProPath,
  staffLandingPath,
} from "@/lib/pro-access";

import {
  cn,
} from "@/lib/cn";

import {
  initials,
} from "@/lib/format";

import {
  Logo,
} from "@/components/brand/logo";

import {
  ClaimantMessageHeaderSearch,
} from "@/components/pro/claimant-message-header-search";

import {
  StaffMailHeaderSearch,
} from "@/components/pro/staff-mail-header-search";

import {
  ProSearch,
} from "./pro-search";

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
  IconMail,
  IconMenu,
  IconOpportunity,
  IconProperty,
  IconRecovery,
  IconTask,
} from "@/components/ui/icon";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface NavChild {
  href:
    string;

  label:
    string;

  icon: (props: {
    size?:
      number;

    className?:
      string;
  }) => React.ReactElement;

  exact?:
    boolean;
}

interface NavItem {
  href:
    string;

  label:
    string;

  icon: (props: {
    size?:
      number;

    className?:
      string;
  }) => React.ReactElement;

  exact?:
    boolean;

  badge?:
    number;

  badgeTone?:
    | "accent"
    | "caution"
    | "critical";

  children?:
    NavChild[];
}

interface NavGroup {
  heading:
    string;

  items:
    NavItem[];
}

interface MailCountPayload {
  counts?: {
    unread?:
      number;
  };
}

interface LeadNotificationPayload {
  newCount?:
    number;
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ProShell({
  children,
  operator,
  counts,
}: {
  children:
    React.ReactNode;

  operator: {
    name:
      string;

    email:
      string;

    title:
      string;

    role:
      UserRole;

    permissions:
      Permission[];
  };

  counts: {
    opportunities:
      number;

    claims:
      number;

    tasksOverdue:
      number;

    documentsOutstanding:
      number;

    complianceBlocked:
      number;

    mailUnread:
      number;
  };
}) {
  const [
    railOpen,
    setRailOpen,
  ] =
    useState(
      false,
    );

  const [
    mailUnread,
    setMailUnread,
  ] =
    useState(
      counts.mailUnread,
    );

  const [
    leadNewCount,
    setLeadNewCount,
  ] =
    useState(
      0,
    );

  const [
    leadNoticeVisible,
    setLeadNoticeVisible,
  ] =
    useState(
      false,
    );

  const leadNewCountRef =
    useRef(
      0,
    );

  const pathname =
    usePathname();

  const [
    claimantsExpanded,
    setClaimantsExpanded,
  ] =
    useState(
      pathname ===
        "/pro/claimants" ||
      pathname.startsWith(
        "/pro/claimants/",
      ),
    );

  const mailWorkspace =
    pathname ===
      "/pro/mail" ||
    pathname.startsWith(
      "/pro/mail/",
    );

  const contactWorkspace =
    pathname ===
      "/pro/contact" ||
    pathname.startsWith(
      "/pro/contact/",
    );

  const claimantMessageWorkspace =
    pathname ===
      "/pro/claimants/messages";

  const homeHref =
    staffLandingPath(
      operator.role,
    );

  const canUseStaffMail =
    canAccessProPath(
      operator.role,
      operator.permissions,
      "/pro/mail",
      operator.email,
    );

  /*
   * My Leads is the staff-facing recovery assignment workspace.
   *
   * Administrators distribute leads through Lead Distribution instead.
   */
  const canUseMyLeads =
    operator.role !==
      "administrator" &&
    operator.role !==
      "super_admin" &&
    canAccessProPath(
      operator.role,
      operator.permissions,
      "/pro/my-leads",
      operator.email,
    );

  const canUseLeadDistribution =
    operator.role ===
      "administrator" ||
    operator.role ===
      "super_admin";

  useEffect(
    () => {
      if (
        pathname ===
          "/pro/claimants" ||
        pathname.startsWith(
          "/pro/claimants/",
        )
      ) {
        setClaimantsExpanded(
          true,
        );
      }
    },
    [
      pathname,
    ],
  );

  useEffect(
    () => {
      setMailUnread(
        counts.mailUnread,
      );
    },
    [
      counts.mailUnread,
    ],
  );

  /* ======================================================================== */
  /* Mail unread badge                                                        */
  /* ======================================================================== */

  useEffect(
    () => {
      if (
        !canUseStaffMail
      ) {
        return;
      }

      let cancelled =
        false;

      async function refreshMailUnread() {
        if (
          document.visibilityState !==
          "visible"
        ) {
          return;
        }

        try {
          const response =
            await fetch(
              "/api/pro/mail?folder=inbox",
              {
                cache:
                  "no-store",
              },
            );

          if (
            !response.ok
          ) {
            return;
          }

          const data =
            await response.json() as
              MailCountPayload;

          const unread =
            data.counts?.unread;

          if (
            !cancelled &&
            typeof unread ===
              "number"
          ) {
            setMailUnread(
              unread,
            );
          }
        } catch {
          /*
           * Badge refresh must never interrupt the staff workspace.
           */
        }
      }

      const timer =
        window.setInterval(
          () => {
            void refreshMailUnread();
          },
          30_000,
        );

      function handleVisibilityChange() {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void refreshMailUnread();
        }
      }

      document.addEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      return () => {
        cancelled =
          true;

        window.clearInterval(
          timer,
        );

        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      };
    },
    [
      canUseStaffMail,
    ],
  );

  /* ======================================================================== */
  /* My Leads notifications                                                   */
  /* ======================================================================== */

  useEffect(
    () => {
      if (
        !canUseMyLeads
      ) {
        leadNewCountRef.current =
          0;

        setLeadNewCount(
          0,
        );

        setLeadNoticeVisible(
          false,
        );

        return;
      }

      let cancelled =
        false;

      async function refreshLeadNotifications() {
        if (
          document.visibilityState !==
          "visible"
        ) {
          return;
        }

        try {
          const response =
            await fetch(
              "/api/pro/my-leads/notification",
              {
                cache:
                  "no-store",
              },
            );

          if (
            !response.ok
          ) {
            return;
          }

          const data =
            await response.json() as
              LeadNotificationPayload;

          if (
            typeof data.newCount !==
            "number"
          ) {
            return;
          }

          const nextCount =
            Math.max(
              0,
              Math.trunc(
                data.newCount,
              ),
            );

          if (
            cancelled
          ) {
            return;
          }

          const previousCount =
            leadNewCountRef.current;

          leadNewCountRef.current =
            nextCount;

          setLeadNewCount(
            nextCount,
          );

          /*
           * Show the tiny notice:
           *
           * 1. on login when unseen leads already exist;
           * 2. when a newer assignment raises the unseen count.
           *
           * Merely dismissing the notice does not acknowledge the leads.
           */
          if (
            nextCount >
              0 &&
            (
              previousCount ===
                0 ||
              nextCount >
                previousCount
            )
          ) {
            setLeadNoticeVisible(
              true,
            );
          }

          if (
            nextCount ===
            0
          ) {
            setLeadNoticeVisible(
              false,
            );
          }
        } catch {
          /*
           * Lead notification refresh must never interrupt staff operations.
           */
        }
      }

      function handleVisibilityChange() {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void refreshLeadNotifications();
        }
      }

      function handleMyLeadsSeen() {
        leadNewCountRef.current =
          0;

        setLeadNewCount(
          0,
        );

        setLeadNoticeVisible(
          false,
        );
      }

      /*
       * Fetch immediately so a staff member sees new assignments as soon as
       * their authenticated workspace loads.
       */
      void refreshLeadNotifications();

      const timer =
        window.setInterval(
          () => {
            void refreshLeadNotifications();
          },
          30_000,
        );

      document.addEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      window.addEventListener(
        "duequity:my-leads-seen",
        handleMyLeadsSeen,
      );

      return () => {
        cancelled =
          true;

        window.clearInterval(
          timer,
        );

        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );

        window.removeEventListener(
          "duequity:my-leads-seen",
          handleMyLeadsSeen,
        );
      };
    },
    [
      canUseMyLeads,
    ],
  );

  /* ======================================================================== */
  /* Navigation                                                               */
  /* ======================================================================== */

  const baseGroups:
    NavGroup[] = [
    {
      heading:
        "Pipeline",

      items: [
        {
          href:
            "/pro",

          label:
            "Overview",

          icon:
            IconDashboard,

          exact:
            true,
        },

        {
          href:
            "/pro/discovered-records",

          label:
            "Discovered Records",

          icon:
            IconOpportunity,
        },

        {
          href:
            "/pro/opportunities",

          label:
            "Opportunities",

          icon:
            IconOpportunity,

          badge:
            counts.opportunities,
        },

        {
          href:
            "/pro/my-leads",

          label:
            "My Leads",

          icon:
            IconOpportunity,

          badge:
            leadNewCount ||
            undefined,

          badgeTone:
            "accent",
        },

        {
          href:
            "/pro/claims",

          label:
            "Claims",

          icon:
            IconClaim,

          badge:
            counts.claims,
        },

        {
          href:
            "/pro/recoveries",

          label:
            "Recoveries",

          icon:
            IconRecovery,
        },
      ],
    },

    {
      heading:
        "Work",

      items: [
        {
          href:
            "/pro/contact",

          label:
            "Contact Inbox",

          icon:
            IconMail,
        },

        {
          href:
            "/pro/mail",

          label:
            "Mail",

          icon:
            IconMail,

          badge:
            mailUnread ||
            undefined,
        },

        {
          href:
            "/pro/tasks",

          label:
            "Tasks",

          icon:
            IconTask,

          badge:
            counts.tasksOverdue ||
            undefined,

          badgeTone:
            "critical",
        },

        {
          href:
            "/pro/documents",

          label:
            "Documents",

          icon:
            IconDocument,

          badge:
            counts.documentsOutstanding ||
            undefined,

          badgeTone:
            "caution",
        },

        {
          href:
            "/pro/claimants",

          label:
            "Claimants",

          icon:
            IconClaimant,

          children: [
            {
              href:
                "/pro/claimants",

              label:
                "All Claimants",

              icon:
                IconClaimant,

              exact:
                true,
            },

            {
              href:
                "/pro/claimants/onboarding",

              label:
                "Onboarding",

              icon:
                IconTask,

              exact:
                true,
            },

            {
              href:
                "/pro/claimants/messages",

              label:
                "Messages",

              icon:
                IconMail,

              exact:
                true,
            },
          ],
        },

        {
          href:
            "/pro/properties",

          label:
            "Properties",

          icon:
            IconProperty,
        },
      ],
    },

    {
      heading:
        "Governance",

      items: [
        {
          href:
            "/pro/jurisdictions",

          label:
            "Jurisdictions",

          icon:
            IconJurisdiction,
        },

        {
          href:
            "/pro/fee-policies",

          label:
            "Fee Policies",

          icon:
            IconRecovery,
        },

        {
          href:
            "/pro/manager",

          label:
            "Manager Dashboard",

          icon:
            IconDashboard,
        },

        {
          href:
            "/pro/lead-distribution",

          label:
            "Lead Distribution",

          icon:
            IconOpportunity,
        },

        {
          href:
            "/pro/staff",

          label:
            "Staff Management",

          icon:
            IconClaimant,
        },

        {
          href:
            "/pro/compliance",

          label:
            "Compliance",

          icon:
            IconCompliance,

          badge:
            counts.complianceBlocked ||
            undefined,

          badgeTone:
            "critical",
        },

        {
          href:
            "/pro/attorneys",

          label:
            "Attorneys",

          icon:
            IconAttorney,
        },

        {
          href:
            "/pro/audit",

          label:
            "Audit",

          icon:
            IconAudit,
        },
      ],
    },
  ];

  const groups:
    NavGroup[] =
    baseGroups
      .map(
        (
          group,
        ) => ({
          ...group,

          items:
            group.items
              .filter(
                (
                  item,
                ) => {
                  if (
                    item.href ===
                      "/pro/my-leads" &&
                    !canUseMyLeads
                  ) {
                    return false;
                  }

                  if (
                    item.href ===
                      "/pro/lead-distribution" &&
                    !canUseLeadDistribution
                  ) {
                    return false;
                  }

                  return canAccessProPath(
                    operator.role,
                    operator.permissions,
                    item.href,
                    operator.email,
                  );
                },
              )
              .map(
                (
                  item,
                ) => ({
                  ...item,

                  children:
                    item.children?.filter(
                      (
                        child,
                      ) =>
                        canAccessProPath(
                          operator.role,
                          operator.permissions,
                          child.href,
                          operator.email,
                        ),
                    ),
                }),
              ),
        }),
      )
      .filter(
        (
          group,
        ) =>
          group.items.length >
          0,
      );

  function pathActive(
    href:
      string,
    exact =
      false,
  ) {
    if (
      exact
    ) {
      return (
        pathname ===
        href
      );
    }

    return (
      pathname ===
        href ||
      pathname.startsWith(
        `${href}/`,
      )
    );
  }

  function isActive(
    item:
      NavItem,
  ) {
    return pathActive(
      item.href,
      item.exact,
    );
  }

  /* ======================================================================== */
  /* Render                                                                   */
  /* ======================================================================== */

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
            href={
              homeHref
            }
          />

          <span className="rounded-xs border border-ink-700 px-1.5 py-0.5 font-mono text-2xs tracking-tight text-ink-400">
            PRO
          </span>

          <button
            type="button"
            onClick={() => {
              setRailOpen(
                false,
              );
            }}
            aria-label="Close navigation"
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-300 hover:bg-ink-800 hover:text-white lg:hidden"
          >
            <IconClose
              size={18}
            />
          </button>
        </div>

        <nav
          aria-label="Operations"
          className="flex-1 overflow-y-auto px-2 py-3"
        >
          {groups.map(
            (
              group,
            ) => (
              <div
                key={
                  group.heading
                }
                className="mb-4 last:mb-0"
              >
                <p className="eyebrow px-2 pb-1.5 text-ink-600">
                  {
                    group.heading
                  }
                </p>

                <ul className="space-y-0.5">
                  {group.items.map(
                    (
                      item,
                    ) => {
                      const active =
                        isActive(
                          item,
                        );

                      const Icon =
                        item.icon;

                      const hasChildren =
                        Boolean(
                          item.children?.length,
                        );

                      if (
                        hasChildren
                      ) {
                        return (
                          <li
                            key={
                              item.href
                            }
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setClaimantsExpanded(
                                  (
                                    current,
                                  ) =>
                                    !current,
                                );
                              }}
                              aria-expanded={
                                claimantsExpanded
                              }
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
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

                              <span className="flex-1 truncate text-left">
                                {
                                  item.label
                                }
                              </span>

                              <span
                                aria-hidden="true"
                                className="text-xs text-ink-500"
                              >
                                {claimantsExpanded
                                  ? "▾"
                                  : "▸"}
                              </span>
                            </button>

                            {claimantsExpanded && (
                              <ul className="ml-4 mt-1 space-y-0.5 border-l border-ink-800 pl-2">
                                {item.children?.map(
                                  (
                                    child,
                                  ) => {
                                    const childActive =
                                      pathActive(
                                        child.href,
                                        child.exact,
                                      );

                                    const ChildIcon =
                                      child.icon;

                                    return (
                                      <li
                                        key={
                                          child.href
                                        }
                                      >
                                        <Link
                                          href={
                                            child.href
                                          }
                                          onClick={() => {
                                            setRailOpen(
                                              false,
                                            );
                                          }}
                                          aria-current={
                                            childActive
                                              ? "page"
                                              : undefined
                                          }
                                          className={cn(
                                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",

                                            childActive
                                              ? "bg-ink-800 text-white"
                                              : "text-ink-500 hover:bg-ink-900 hover:text-ink-100",
                                          )}
                                        >
                                          <ChildIcon
                                            size={14}
                                            className={
                                              childActive
                                                ? "text-accent-300"
                                                : undefined
                                            }
                                          />

                                          <span className="truncate">
                                            {
                                              child.label
                                            }
                                          </span>
                                        </Link>
                                      </li>
                                    );
                                  },
                                )}
                              </ul>
                            )}
                          </li>
                        );
                      }

                      return (
                        <li
                          key={
                            item.href
                          }
                        >
                          <Link
                            href={
                              item.href
                            }
                            onClick={() => {
                              setRailOpen(
                                false,
                              );
                            }}
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
                              {
                                item.label
                              }
                            </span>

                            {item.badge !==
                              undefined &&
                              item.badge >
                                0 && (
                                <span
                                  className={cn(
                                    "tnum rounded-xs px-1.5 py-0.5 text-2xs font-semibold",

                                    item.badgeTone ===
                                      "critical"
                                      ? "bg-critical-600 text-white"
                                      : item.badgeTone ===
                                          "caution"
                                        ? "bg-caution-600 text-white"
                                        : item.badgeTone ===
                                            "accent"
                                          ? "bg-accent-500 text-white"
                                          : "bg-ink-700 text-ink-200",
                                  )}
                                >
                                  {
                                    item.badge
                                  }
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
              {initials(
                operator.name,
              )}
            </span>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-100">
                {
                  operator.name
                }
              </p>

              <p className="truncate text-2xs text-ink-500">
                {
                  operator.title
                }
              </p>
            </div>
          </div>

          <p className="mt-2 text-2xs text-ink-600">
            {operator.role ===
            "communications_specialist"
              ? "Public communications access"
              : "National work access"}
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
          onClick={() => {
            setRailOpen(
              false,
            );
          }}
          className="fixed inset-0 z-30 bg-ink-950/50 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper/95 px-3 backdrop-blur-sm sm:px-4">
          <button
            type="button"
            onClick={() => {
              setRailOpen(
                true,
              );
            }}
            aria-label="Open navigation"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 lg:hidden"
          >
            <IconMenu
              size={19}
            />
          </button>

          {mailWorkspace ? (
            <StaffMailHeaderSearch />
          ) : claimantMessageWorkspace ? (
            <ClaimantMessageHeaderSearch />
          ) : contactWorkspace ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">
                Contact Inbox
              </p>

              <p className="truncate text-xs text-ink-500">
                Public DueQuity inquiries
              </p>
            </div>
          ) : (
            <ProSearch />
          )}

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
            {
              children
            }
          </div>
        </main>
      </div>

      {canUseMyLeads &&
        leadNoticeVisible &&
        leadNewCount >
          0 && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-accent-300 bg-paper p-3 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-1.5 inline-flex size-2.5 shrink-0 rounded-full bg-accent-600"
              />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-950">
                  New leads added
                </p>

                <p className="mt-0.5 text-xs leading-5 text-ink-600">
                  {leadNewCount} new{" "}
                  {leadNewCount ===
                  1
                    ? "recovery lead is"
                    : "recovery leads are"}{" "}
                  waiting in your workspace.
                </p>

                <Link
                  href="/pro/my-leads"
                  onClick={() => {
                    setRailOpen(
                      false,
                    );
                  }}
                  className="mt-2 inline-flex rounded-md bg-accent-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                >
                  View My Leads
                </Link>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLeadNoticeVisible(
                    false,
                  );
                }}
                aria-label="Dismiss new lead notification"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              >
                <IconClose
                  size={15}
                />
              </button>
            </div>
          </div>
        )}
    </div>
  );
}