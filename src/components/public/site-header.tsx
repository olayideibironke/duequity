"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { IconClose, IconMenu } from "@/components/ui/icon";

/**
 * PUBLIC SITE HEADER
 *
 * Deep charcoal navigation against the warm off-white page. The contrast is the
 * primary structural gesture of the brand: an institution's masthead over paper.
 *
 * The mobile menu is a client component because it holds open state. Everything
 * else on the public site stays a server component.
 */

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/states", label: "Where we operate" },
  { href: "/fees", label: "Fees" },
  { href: "/security", label: "Security" },
  { href: "/resources", label: "Resources" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Logo tone="light" />

        {/* Desktop navigation */}
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400",
                      active ? "text-white" : "text-ink-300 hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/staff/sign-in"
            className="hidden rounded-sm px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400 xl:block"
          >
            Staff sign in
          </Link>

          <Link
            href="/claimant/sign-in"
            className="hidden rounded-sm px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400 sm:block"
          >
            Claimant sign in
          </Link>

          <ButtonLink
            href="/check"
            variant="primary"
            accent
            size="sm"
            className="hidden sm:inline-flex"
          >
            Check a property
          </ButtonLink>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-10 items-center justify-center rounded-md text-ink-200 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400 lg:hidden"
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {/* Mobile navigation */}
      {open && (
        <div
          id="mobile-nav"
          className="border-t border-ink-800 bg-ink-950 lg:hidden"
        >
          <nav
            aria-label="Main"
            className="mx-auto max-w-7xl px-4 py-3 sm:px-6"
          >
            <ul className="space-y-0.5">
              {NAV.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-3 py-2.5 text-base font-medium transition-colors",
                        active
                          ? "bg-ink-900 text-white"
                          : "text-ink-300 hover:bg-ink-900 hover:text-white",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 space-y-2 border-t border-ink-800 pt-3">
              <ButtonLink
                href="/check"
                variant="primary"
                accent
                block
                onClick={() => setOpen(false)}
              >
                Check a property
              </ButtonLink>

              <Link
                href="/claimant/sign-in"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2.5 text-center text-base font-medium text-ink-300 transition-colors hover:bg-ink-900 hover:text-white"
              >
                Claimant sign in
              </Link>

              <Link
                href="/staff/sign-in"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2.5 text-center text-base font-medium text-ink-300 transition-colors hover:bg-ink-900 hover:text-white"
              >
                Staff sign in
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}