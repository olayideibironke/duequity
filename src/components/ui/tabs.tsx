import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * SECTION NAVIGATION
 *
 * Detail screens in Duequity Pro carry many sections (Section 34 lists eleven for
 * the claim detail screen). These are the two navigation patterns used:
 *
 * TabLinks    real links that change the URL, so a specialist can bookmark and
 *             share "the documents tab of claim DQ-4471-MD". Preferred.
 * AnchorNav   in page anchors for a single scrolling document, used where the
 *             sections must be readable together and printable as one page.
 *
 * Both are server components. A tab that only changes local state loses the URL,
 * which on an operations tool is a real cost: staff share links to cases.
 */

export function TabLinks({
  tabs,
  className,
  label = "Sections",
}: {
  tabs: {
    href: string;
    label: string;
    count?: number;
    active: boolean;
    tone?: "caution" | "critical";
  }[];
  className?: string;
  label?: string;
}) {
  return (
    <nav aria-label={label} className={cn("border-b border-line", className)}>
      {/* Scrolls horizontally on narrow screens rather than wrapping into a block. */}
      <ul className="-mb-px flex gap-0.5 overflow-x-auto">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500",
                tab.active
                  ? "border-accent-600 text-ink-900"
                  : "border-transparent text-ink-500 hover:border-line-strong hover:text-ink-800",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "tnum rounded-xs px-1.5 py-0.5 text-2xs font-semibold",
                    tab.tone === "critical"
                      ? "bg-critical-100 text-critical-700"
                      : tab.tone === "caution"
                        ? "bg-caution-100 text-caution-700"
                        : tab.active
                          ? "bg-ink-900 text-white"
                          : "bg-ink-100 text-ink-600",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A sticky in page section index for long detail screens.
 * Rendered as a list of anchors so the whole record stays on one printable page.
 */
export function AnchorNav({
  sections,
  className,
}: {
  sections: { id: string; label: string; badge?: ReactNode }[];
  className?: string;
}) {
  return (
    <nav aria-label="On this page" className={cn("min-w-0", className)}>
      <p className="eyebrow mb-2 text-ink-500">On this page</p>
      <ul className="space-y-0.5">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500"
            >
              <span className="truncate">{section.label}</span>
              {section.badge}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A segmented control for filtering a list by status.
 *
 * Implemented as links with a query parameter so a filtered view is shareable and
 * survives a page reload, which matters for an operations queue.
 */
export function FilterLinks({
  filters,
  className,
  label = "Filter",
}: {
  filters: { href: string; label: string; count?: number; active: boolean }[];
  className?: string;
  label?: string;
}) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className="flex flex-wrap gap-1.5">
        {filters.map((filter) => (
          <li key={filter.href}>
            <Link
              href={filter.href}
              aria-current={filter.active ? "true" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
                filter.active
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-line-strong bg-paper text-ink-600 hover:border-ink-300 hover:text-ink-900",
              )}
            >
              {filter.label}
              {filter.count !== undefined && (
                <span
                  className={cn(
                    "tnum",
                    filter.active ? "text-ink-200" : "text-ink-400",
                  )}
                >
                  {filter.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Breadcrumbs for nested operations records.
 * The current page is the last item and is not a link.
 */
export function Breadcrumbs({
  trail,
  className,
}: {
  trail: { href?: string; label: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li
              key={`${crumb.label}-${index}`}
              className="flex items-center gap-1"
            >
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="rounded-xs transition-colors hover:text-ink-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "font-medium text-ink-700" : undefined}
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
              {!isLast && (
                <span aria-hidden="true" className="text-ink-300">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
