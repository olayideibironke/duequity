"use client";

import { useState } from "react";

import Link from "next/link";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

import { Logo } from "@/components/brand/logo";

import {
  IconClaim,
  IconClose,
  IconDocument,
  IconLock,
  IconMenu,
  IconMessage,
  IconClaimant,
} from "@/components/ui/icon";

/* ========================================================================== */
/* Navigation                                                                  */
/* ========================================================================== */

interface NavItem {
  href: string;

  label: string;

  icon: (props: {
    size?: number;

    className?: string;
  }) => React.ReactElement;

  exact?: boolean;
}

const NAV: NavItem[] = [
  {
    href: "/portal",

    label: "Overview",

    icon: IconClaimant,

    exact: true,
  },

  {
    href: "/portal/claims",

    label: "Claims",

    icon: IconClaim,
  },

  {
    href: "/portal/documents",

    label: "Documents",

    icon: IconDocument,
  },

  {
    href: "/portal/messages",

    label: "Messages",

    icon: IconMessage,
  },

  {
    href: "/portal/security",

    label: "Security",

    icon: IconLock,
  },
];

/* ========================================================================== */
/* Shell                                                                       */
/* ========================================================================== */

export function PortalShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const pathname = usePathname();

  function isActive(href: string, exact?: boolean): boolean {
    if (exact) {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-full flex-col">
      <a href="#portal-main" className="skip-link">
        Skip to main content
      </a>

      {/* ================================================================ header */}
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo tone="light" size="sm" href="/portal" />

            <span
              aria-hidden="true"
              className="hidden h-5 w-px bg-ink-700 sm:block"
            />

            <span className="hidden text-sm text-ink-400 sm:block">
              My Duequity
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink-100">
                Claimant portal
              </p>

              <p className="text-2xs text-ink-500">Recovery account</p>
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-controls="portal-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="inline-flex size-10 items-center justify-center rounded-md text-ink-200 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
            >
              {menuOpen ? <IconClose /> : <IconMenu />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="portal-menu" className="border-t border-ink-800 bg-ink-950">
            <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
              <p className="eyebrow text-ink-500">Account</p>

              <p className="mt-1.5 text-base font-medium text-white">
                My Duequity
              </p>

              <div className="mt-3 space-y-0.5">
                <Link
                  href="/portal/profile"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-base text-ink-300 transition-colors hover:bg-ink-900 hover:text-white"
                >
                  Profile and contact details
                </Link>

                <Link
                  href="/portal/security"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-base text-ink-300 transition-colors hover:bg-ink-900 hover:text-white"
                >
                  Security
                </Link>

                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-base text-ink-300 transition-colors hover:bg-ink-900 hover:text-white"
                >
                  Return to duequity.com
                </Link>

                <form action="/auth/sign-out" method="post" className="pt-2">
                  <button
                    type="submit"
                    className="w-full rounded-md border border-ink-700 px-3 py-2.5 text-left text-base font-medium text-ink-300 transition-colors hover:border-ink-600 hover:bg-ink-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ================================================================= body */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 py-6 sm:px-6 lg:py-8">
        {/* --------------------------------------------------------- desktop nav */}
        <nav aria-label="Portal" className="hidden w-52 shrink-0 lg:block">
          <ul className="sticky top-24 space-y-0.5">
            {NAV.map((item) => {
              const active = isActive(item.href, item.exact);

              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-base font-medium transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
                      active
                        ? "bg-ink-900 text-white"
                        : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                    )}
                  >
                    <Icon
                      size={18}
                      className={active ? "text-accent-300" : undefined}
                    />

                    <span className="flex-1">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* -------------------------------------------------------------- content */}
        <main id="portal-main" className="min-w-0 flex-1 pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      {/* ===================================================== mobile tab bar */}
      <nav
        aria-label="Portal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur-sm lg:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);

            const Icon = item.icon;

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-2xs font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500",
                    active ? "text-accent-700" : "text-ink-500",
                  )}
                >
                  <Icon size={20} />

                  {item.label}

                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent-600"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}