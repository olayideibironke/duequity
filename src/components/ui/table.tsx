import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * TABLES
 *
 * Duequity Pro is a table driven product. These are built for dense,
 * high information administrative reading: compact rows, tabular figures,
 * hairline dividers, no zebra striping.
 *
 * Two structural decisions:
 *
 * 1. Horizontal scrolling is contained. The table scrolls inside its own region
 *    with a keyboard reachable scroll container, so the page body never scrolls
 *    sideways on a phone.
 *
 * 2. Mobile is not a shrunken table. Section 19 is explicit about this, so list
 *    screens pair <DataTable> for desktop with <RecordList> for small screens
 *    rather than trying to reflow columns.
 */

export function TableRegion({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** Accessible name for the scrollable region. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({
  children,
  className,
  caption,
}: {
  children: ReactNode;
  className?: string;
  /** Visually hidden table caption. Always provide one. */
  caption?: string;
}) {
  return (
    <table className={cn("w-full border-collapse text-left", className)}>
      {caption && <caption className="sr-only">{caption}</caption>}
      {children}
    </table>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-inset">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  align = "left",
  width,
  className,
  scope = "col",
  sortDirection,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
  scope?: "col" | "row";
  /** Set on a sorted column so assistive technology announces the order. */
  sortDirection?: "ascending" | "descending";
}) {
  return (
    <th
      scope={scope}
      style={width ? { width } : undefined}
      aria-sort={sortDirection}
      className={cn(
        "px-3 py-2 text-xs font-semibold whitespace-nowrap text-ink-600 first:pl-4 last:pr-4",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line-subtle">{children}</tbody>;
}

export function TR({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  /** A left edge marker for rows needing attention, such as expiring deadlines. */
  tone?: "caution" | "critical";
}) {
  return (
    <tr
      className={cn(
        "group bg-paper transition-colors hover:bg-inset",
        tone === "caution" &&
          "shadow-[inset_2px_0_0_0_var(--color-caution-600)]",
        tone === "critical" &&
          "shadow-[inset_2px_0_0_0_var(--color-critical-600)]",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = "left",
  className,
  numeric = false,
  nowrap = false,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  /** Apply tabular figures so columns of money and counts align. */
  numeric?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-sm text-ink-700 first:pl-4 last:pr-4",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tnum",
        nowrap && "whitespace-nowrap",
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * The primary cell in a row: the thing the row is about.
 *
 * Renders as a <th scope="row"> so screen readers announce it when reading any
 * other cell in that row, and carries the row link so the whole primary cell is a
 * generous click target without nesting interactive elements in every cell.
 */
export function TDPrimary({
  href,
  children,
  secondary,
  className,
}: {
  href?: string;
  children: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  const content = (
    <>
      <span className="block truncate font-medium text-ink-900">
        {children}
      </span>
      {secondary && (
        <span className="mt-0.5 block truncate text-xs text-ink-500">
          {secondary}
        </span>
      )}
    </>
  );

  return (
    <th
      scope="row"
      className={cn(
        "max-w-0 px-3 py-2.5 text-left font-normal first:pl-4",
        className,
      )}
    >
      {href ? (
        <Link
          href={href}
          className="block min-w-0 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 group-hover:text-accent-700"
        >
          {content}
        </Link>
      ) : (
        <span className="block min-w-0">{content}</span>
      )}
    </th>
  );
}

/* ========================================================================== */
/* Mobile record list                                                          */
/* ========================================================================== */

/**
 * The mobile counterpart to a data table.
 *
 * A stacked list of records where each entry leads with the identifying line, then
 * status, then the two or three facts that matter for triage. This is a different
 * layout, not a reflowed table. Section 19.
 */
export function RecordList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line-subtle", className)}>{children}</ul>
  );
}

export function RecordListItem({
  href,
  title,
  subtitle,
  status,
  facts,
  tone,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  /** Two to four short label and value pairs. More than four is a detail screen. */
  facts?: { label: string; value: ReactNode }[];
  tone?: "caution" | "critical";
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-base font-medium text-ink-900">
            {title}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-sm text-ink-500">
              {subtitle}
            </span>
          )}
        </div>
        {status && <span className="shrink-0">{status}</span>}
      </div>

      {facts && facts.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-2xs text-ink-500">{fact.label}</dt>
              <dd className="tnum truncate text-sm text-ink-800">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  return (
    <li
      className={cn(
        "bg-paper",
        tone === "caution" &&
          "shadow-[inset_2px_0_0_0_var(--color-caution-600)]",
        tone === "critical" &&
          "shadow-[inset_2px_0_0_0_var(--color-critical-600)]",
      )}
    >
      {href ? (
        <Link
          href={href}
          className="block px-4 py-3.5 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 active:bg-sunken"
        >
          {body}
        </Link>
      ) : (
        <div className="px-4 py-3.5">{body}</div>
      )}
    </li>
  );
}

/* ========================================================================== */
/* Table shell helpers                                                         */
/* ========================================================================== */

/**
 * A toolbar above a table: result count on the left, filters and actions right.
 * The count is announced politely so filtering is perceivable without sight.
 */
export function TableToolbar({
  count,
  noun,
  children,
  className,
}: {
  count?: number;
  noun?: { one: string; many: string };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-4 py-2.5",
        className,
      )}
    >
      {count !== undefined && noun ? (
        <p aria-live="polite" className="tnum text-sm text-ink-600">
          <span className="font-semibold text-ink-900">
            {new Intl.NumberFormat("en-US").format(count)}
          </span>{" "}
          {count === 1 ? noun.one : noun.many}
        </p>
      ) : (
        <span />
      )}
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}

/** Footer for a table showing the visible range out of the total. */
export function TableFooter({
  shown,
  total,
  noun,
  children,
}: {
  shown: number;
  total: number;
  noun: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle bg-inset px-4 py-2.5">
      <p className="tnum text-xs text-ink-500">
        Showing {shown} of {total} {noun}
      </p>
      {children}
    </div>
  );
}
