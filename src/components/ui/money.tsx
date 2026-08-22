import type { ReactNode } from "react";
import type { Cents, DataQuality, MonetaryFact } from "@/domain/types";
import { monetaryCertainty } from "@/domain/status";
import {
  formatCents,
  formatCentsCompact,
  formatCentsWhole,
} from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * MONETARY DISPLAY
 *
 * The most compliance sensitive component in the product.
 *
 * Section 24: "Never present an estimated surplus as confirmed."
 * Section 36: the reader must always be able to tell whether a figure is
 * estimated, verified, confirmed, gross, net, claimed or recovered.
 *
 * The certainty word is derived from the data quality on the fact itself, not from
 * a prop a caller chooses. A caller cannot pass a confirmed figure and label it
 * estimated, or the reverse, because the label is not theirs to pass.
 */

type MoneySize = "sm" | "md" | "lg" | "xl" | "display";

const SIZE_STYLES: Record<MoneySize, string> = {
  sm: "text-sm font-medium",
  md: "text-base font-semibold",
  lg: "text-xl font-semibold",
  xl: "text-3xl font-semibold",
  display: "text-4xl font-semibold",
};

const CERTAINTY_STYLES: Record<
  "positive" | "caution" | "critical" | "neutral" | "info" | "counsel",
  string
> = {
  positive: "text-accent-700",
  caution: "text-caution-700",
  critical: "text-critical-700",
  neutral: "text-ink-600",
  info: "text-info-700",
  counsel: "text-counsel-700",
};

export interface MoneyProps {
  fact: MonetaryFact;
  size?: MoneySize;
  /** Hide the certainty caption. Only for contexts that label certainty nearby. */
  hideCertainty?: boolean;
  /** Drop the cents. For dense tables and dashboard tiles. */
  whole?: boolean;
  /** Compact notation such as $4.3M. For aggregate figures only, never per claim. */
  compact?: boolean;
  className?: string;
}

/**
 * A monetary figure with its certainty stated above it.
 *
 * The certainty caption sits above the number rather than below, so a reader
 * scanning down a column reads "Estimated" before they read the amount.
 */
export function Money({
  fact,
  size = "md",
  hideCertainty = false,
  whole = false,
  compact = false,
  className,
}: MoneyProps) {
  const certainty = monetaryCertainty(fact.quality);
  const formatted = compact
    ? formatCentsCompact(fact.amount)
    : whole
      ? formatCentsWhole(fact.amount)
      : formatCents(fact.amount);

  return (
    <span className={cn("inline-flex flex-col", className)}>
      {!hideCertainty && (
        <span className={cn("eyebrow", CERTAINTY_STYLES[certainty.tone])}>
          {certainty.word}
        </span>
      )}
      <span
        className={cn("tnum text-ink-900", SIZE_STYLES[size])}
        title={fact.basis}
      >
        {formatted}
      </span>
    </span>
  );
}

/**
 * Inline variant for running prose and dense table cells, where a stacked caption
 * would break the line rhythm. The certainty is carried as a leading marker and in
 * the accessible name, never dropped.
 */
export function MoneyInline({
  fact,
  whole = false,
  className,
}: {
  fact: MonetaryFact;
  whole?: boolean;
  className?: string;
}) {
  const certainty = monetaryCertainty(fact.quality);
  const formatted = whole
    ? formatCentsWhole(fact.amount)
    : formatCents(fact.amount);
  const confirmed = certainty.word === "Confirmed";

  return (
    <span
      className={cn("tnum whitespace-nowrap tabular-nums", className)}
      title={`${certainty.word}${fact.basis ? `. ${fact.basis}` : ""}`}
    >
      <span className="sr-only">{certainty.word} </span>
      {!confirmed && (
        <span
          aria-hidden="true"
          className={cn(
            "mr-1 text-2xs font-semibold",
            CERTAINTY_STYLES[certainty.tone],
          )}
        >
          est.
        </span>
      )}
      <span
        className={confirmed ? "font-semibold text-ink-900" : "text-ink-800"}
      >
        {formatted}
      </span>
    </span>
  );
}

/**
 * A plain amount with no certainty semantics.
 *
 * Reserved for figures Duequity itself originated and therefore knows exactly: a
 * service fee, a net payout, an invoice line. Never used for a surplus estimate or
 * an agency figure, which must always carry provenance.
 */
export function Amount({
  cents,
  size = "md",
  whole = false,
  tone = "default",
  className,
}: {
  cents: Cents;
  size?: MoneySize;
  whole?: boolean;
  tone?: "default" | "muted" | "negative" | "positive";
  className?: string;
}) {
  const toneClass =
    tone === "muted"
      ? "text-ink-500"
      : tone === "negative"
        ? "text-critical-700"
        : tone === "positive"
          ? "text-accent-700"
          : "text-ink-900";

  return (
    <span
      className={cn(
        "tnum whitespace-nowrap",
        SIZE_STYLES[size],
        toneClass,
        className,
      )}
    >
      {whole ? formatCentsWhole(cents) : formatCents(cents)}
    </span>
  );
}

/**
 * A labelled figure row, used in financial breakdowns such as the surplus
 * derivation and the recovery settlement.
 */
export function FigureRow({
  label,
  children,
  sign,
  emphasis = false,
  note,
}: {
  label: ReactNode;
  children: ReactNode;
  sign?: "add" | "subtract";
  emphasis?: boolean;
  note?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2",
        emphasis && "border-t border-line-strong pt-3",
      )}
    >
      <div className="min-w-0">
        <span
          className={cn(
            "text-base",
            emphasis ? "font-semibold text-ink-900" : "text-ink-600",
          )}
        >
          {sign === "subtract" && (
            <span aria-hidden="true" className="mr-1 text-ink-400">
              less
            </span>
          )}
          {label}
        </span>
        {note && <p className="mt-0.5 text-xs text-ink-500">{note}</p>}
      </div>
      <div className="shrink-0 text-right">{children}</div>
    </div>
  );
}

/**
 * The certainty caption on its own, for use as a column header or legend entry
 * where the figures below share a single quality.
 */
export function CertaintyLabel({
  quality,
  className,
}: {
  quality: DataQuality;
  className?: string;
}) {
  const certainty = monetaryCertainty(quality);
  return (
    <span
      className={cn("eyebrow", CERTAINTY_STYLES[certainty.tone], className)}
    >
      {certainty.word}
    </span>
  );
}
