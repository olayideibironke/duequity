import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * PUBLIC SITE FOOTER
 *
 * The footer carries the standing legal disclosures. Section 4 is explicit that
 * the not a government agency statement and the free claim option are part of the
 * brand and are never buried, so they appear here in full on every public page,
 * at readable size rather than in grey fine print.
 */

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/check", label: "Check a property" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/fees", label: "Fees" },
      { href: "/portal", label: "Claimant portal" },
    ],
  },
  {
    heading: "Where We Operate",
    links: [
      { href: "/states", label: "Nationwide" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Duequity" },
      { href: "/security", label: "Security" },
      { href: "/resources", label: "Resources" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/disclosures", label: "Disclosures" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

export function SiteFooter() {
  const year = 2026;

  return (
    <footer className="mt-auto border-t border-ink-800 bg-ink-950 text-ink-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-sm">
            <Logo tone="light" showParent href={null} />

            <p className="mt-4 text-sm leading-relaxed text-ink-400">
              Duequity helps former property owners and heirs identify and
              recover surplus funds that may still legally belong to them after
              a foreclosure, tax sale, or similar property sale.
            </p>

            <p className="mt-4 text-sm text-ink-300">
              Call{" "}
              <a
                href="tel:+18886692551"
                className="font-semibold text-white underline decoration-ink-600 underline-offset-4 transition-colors hover:decoration-accent-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
              >
                1-888-669-2551
              </a>
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:gap-12"
          >
            {COLUMNS.map((column) => (
              <div key={column.heading}>
                <h2 className="eyebrow text-ink-500">{column.heading}</h2>

                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="rounded-xs text-sm text-ink-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Standing disclosures. Deliberately at body size, not fine print. */}
        <div className="mt-12 space-y-3 border-t border-ink-800 pt-8 text-sm leading-relaxed text-ink-400">
          <p>
            <span className="font-semibold text-ink-200">
              Duequity is not a government agency.
            </span>{" "}
            Duequity is a private company operated by Westforge Holdings Inc.
            and is not affiliated with, endorsed by, or acting on behalf of any
            government agency.
          </p>

          <p>
            <span className="font-semibold text-ink-200">
              You may be able to claim funds yourself at no cost.
            </span>{" "}
            In most jurisdictions a former owner or eligible heir may file a
            surplus claim directly with the responsible agency without paying a
            service fee. Duequity will tell you which agency holds the funds and
            how to reach them, whether or not you choose to work with us.
          </p>

          <p>
            <span className="font-semibold text-ink-200">
              Duequity is not a law firm.
            </span>{" "}
            Duequity does not provide legal advice or legal representation.
            Where a matter requires counsel, Duequity can refer you to an
            independent attorney whom you engage directly. Duequity does not
            share in attorney fees and receives no compensation for a referral.
          </p>

          <p>
            Duequity does not take custody of claimant funds, does not purchase
            surplus claims, and does not guarantee that any claim will be
            approved or that any amount will be recovered. Fees vary by
            jurisdiction and are disclosed in writing before any agreement is
            signed.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-6 text-xs text-ink-500">
          <p>
            Copyright {year} Westforge Holdings Inc. All rights reserved.
            Duequity is a product of Westforge Holdings Inc.
          </p>

          <p className="font-mono tracking-tight">Duequity by Westforge</p>
        </div>
      </div>
    </footer>
  );
}