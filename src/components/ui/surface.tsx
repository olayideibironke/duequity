import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * SURFACES
 *
 * Cards, panels, sections and the definition lists that carry most of the
 * information on a detail screen.
 *
 * Restraint rules encoded here:
 *   - one hairline border, never a border plus a heavy shadow
 *   - radius from the small end of the scale, never a pill card
 *   - shadow only where an element genuinely floats above the page
 */

export function Card({
  children,
  className,
  as: Component = "div",
  elevated = false,
  inset = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  elevated?: boolean;
  inset?: boolean;
  /** Anchor target, for in page section navigation on long detail screens. */
  id?: string;
}) {
  return (
    <Component
      id={id}
      className={cn(
        "rounded-lg border border-line",
        inset ? "bg-inset" : "bg-paper",
        elevated ? "shadow-sm" : "shadow-xs",
        // Offset the sticky header when an anchor is targeted, so a jumped-to section
        // does not land underneath the toolbar.
        id && "scroll-mt-20",
        className,
      )}
    >
      {children}
    </Component>
  );
}

/**
 * A card header with a title, optional description and a trailing action slot.
 * The title renders as a heading element so the document outline stays correct.
 */
export function CardHeader({
  title,
  description,
  actions,
  headingLevel = 2,
  className,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
  eyebrow?: ReactNode;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-4 py-3 sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1 text-ink-500">{eyebrow}</div>}
        <Heading className="text-base font-semibold text-ink-900">
          {title}
        </Heading>
        {description && (
          <p className="mt-1 max-w-prose text-sm text-ink-600">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function CardBody({
  children,
  className,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  /** Remove padding, for a table or list that should meet the card edge. */
  flush?: boolean;
}) {
  return (
    <div className={cn(!flush && "px-4 py-4 sm:px-5", className)}>
      {children}
    </div>
  );
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle bg-inset px-4 py-3 sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ========================================================================== */
/* Page and section structure                                                  */
/* ========================================================================== */

/**
 * A page section heading. Used to divide a long detail screen into the named
 * sections required by Section 34 and Section 35.
 */
export function SectionHeading({
  title,
  description,
  actions,
  id,
  level = 2,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3",
        className,
      )}
      id={id}
    >
      <div className="min-w-0">
        <Heading
          className={cn(level === 2 ? "text-xl" : "text-base font-semibold")}
        >
          {title}
        </Heading>
        {description && (
          <p className="mt-1 max-w-prose text-sm text-ink-600">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Definition lists                                                            */
/* ========================================================================== */

/**
 * The workhorse of every detail screen.
 *
 * A two column definition list on desktop that becomes a stacked list on mobile,
 * built from real <dl>, <dt> and <dd> elements so screen readers announce the
 * term and value relationship. Section 20.
 */
export function DataList({
  children,
  columns = 1,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function DataItem({
  label,
  children,
  hint,
  span = false,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: string;
  /** Span the full width of a multi column DataList. */
  span?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-b border-line-subtle py-2.5 last:border-b-0 sm:border-b-0 sm:py-2",
        span && "sm:col-span-2 lg:col-span-3",
        className,
      )}
    >
      <dt className="text-xs text-ink-500" title={hint}>
        {label}
      </dt>
      <dd className="mt-0.5 text-base text-ink-900">{children}</dd>
    </div>
  );
}

/** Placeholder for a value that has not been recorded. Never an empty cell. */
export function NotRecorded({ label = "Not recorded" }: { label?: string }) {
  return <span className="text-ink-400 italic">{label}</span>;
}

/* ========================================================================== */
/* Metric tiles                                                                */
/* ========================================================================== */

/**
 * A dashboard metric.
 *
 * Section 31: "Avoid meaningless decorative widgets. Every dashboard item should
 * help operations make a decision." So a Stat requires a label and a value, and
 * offers a `context` slot for the comparison that makes the number actionable.
 */
export function Stat({
  label,
  value,
  context,
  tone = "default",
  href,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  context?: ReactNode;
  tone?: "default" | "caution" | "critical" | "positive";
  href?: string;
  className?: string;
}) {
  const accentBar =
    tone === "caution"
      ? "before:bg-caution-600"
      : tone === "critical"
        ? "before:bg-critical-600"
        : tone === "positive"
          ? "before:bg-accent-500"
          : "before:bg-ink-200";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-paper px-4 py-3.5 shadow-xs",
        "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-['']",
        accentBar,
        href && "transition-colors hover:border-ink-300 hover:bg-inset",
        className,
      )}
    >
      <p className="eyebrow text-ink-500">{label}</p>
      <div className="mt-1.5 tnum text-2xl font-semibold text-ink-900">
        {value}
      </div>
      {context && <p className="mt-1 text-xs text-ink-500">{context}</p>}
    </div>
  );
}

/* ========================================================================== */
/* Callouts                                                                    */
/* ========================================================================== */

type CalloutTone =
  "neutral" | "info" | "caution" | "critical" | "positive" | "counsel";

const CALLOUT_STYLES: Record<CalloutTone, { box: string; title: string }> = {
  neutral: { box: "border-line bg-inset", title: "text-ink-900" },
  info: { box: "border-info-200 bg-info-50", title: "text-info-700" },
  caution: {
    box: "border-caution-200 bg-caution-50",
    title: "text-caution-700",
  },
  critical: {
    box: "border-critical-200 bg-critical-50",
    title: "text-critical-700",
  },
  positive: { box: "border-accent-200 bg-accent-50", title: "text-accent-800" },
  counsel: {
    box: "border-counsel-200 bg-counsel-50",
    title: "text-counsel-700",
  },
};

/**
 * A framed notice.
 *
 * Used for the disclosures that must never be visually buried: the not a
 * government agency statement, the free claim option, deadline exposure, and
 * compliance blocks.
 */
export function Callout({
  tone = "neutral",
  title,
  children,
  actions,
  className,
  role,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Set to "alert" only for information the user must not miss. */
  role?: "note" | "alert" | "status";
}) {
  const styles = CALLOUT_STYLES[tone];
  return (
    <div
      role={role}
      className={cn("rounded-md border px-4 py-3", styles.box, className)}
    >
      {title && (
        <p className={cn("text-sm font-semibold", styles.title)}>{title}</p>
      )}
      <div className={cn("text-sm text-ink-700", title && "mt-1")}>
        {children}
      </div>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * The standing legal disclosure block.
 *
 * Section 4: the not a government agency statement and the free claim option are
 * part of the brand and are never hidden. This component exists so that statement
 * is rendered identically everywhere and cannot be quietly reworded per page.
 */
export function GovernmentDisclosure({
  agencyName,
  className,
}: {
  agencyName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-inset px-4 py-3 text-sm text-ink-700",
        className,
      )}
    >
      <p className="font-semibold text-ink-900">
        Duequity is not a government agency.
      </p>
      <p className="mt-1">
        Duequity is a private company and is not affiliated with any government
        agency.{" "}
        {agencyName
          ? `You may be able to claim these funds directly from ${agencyName} without using Duequity and without paying a service fee.`
          : "You may be able to claim these funds directly from the responsible agency without using Duequity and without paying a service fee."}
      </p>
    </div>
  );
}

/* ========================================================================== */
/* Empty and loading states                                                    */
/* ========================================================================== */

/**
 * An empty state.
 *
 * Section 39 requires every screen to have a considered empty state. An empty
 * state states what would appear here and what the user can do about it, never
 * just "No results".
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-inset text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      <p className="text-base font-semibold text-ink-800">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-ink-600">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A loading placeholder. Sized by the caller to match the content it replaces. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-xs bg-ink-100", className)}
    />
  );
}

/** A hairline divider with an optional centred label. */
export function Divider({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  if (!label) {
    return <hr className={cn("border-t border-line", className)} />;
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <hr className="flex-1 border-t border-line" />
      <span className="eyebrow text-ink-400">{label}</span>
      <hr className="flex-1 border-t border-line" />
    </div>
  );
}
