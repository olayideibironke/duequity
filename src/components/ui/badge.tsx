import type { ReactNode } from "react";
import type { Tone, StatusDescriptor } from "@/domain/status";
import { cn } from "@/lib/cn";

/**
 * STATUS BADGES
 *
 * Six tones, no exceptions. A screen never picks a colour for a status: it passes
 * a StatusDescriptor from src/domain/status.ts and the tone comes with it.
 *
 * Section 33: "Do not create dozens of arbitrary badge colours."
 *
 * Every tone pairs a tinted surface with a dark text colour from the same family,
 * which keeps contrast above 4.5:1 in all six cases rather than relying on a light
 * tint of the accent that would fail on white paper.
 */

const TONE_SOLID: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  info: "bg-info-50 text-info-700 ring-info-200",
  positive: "bg-accent-50 text-accent-800 ring-accent-200",
  caution: "bg-caution-50 text-caution-700 ring-caution-200",
  critical: "bg-critical-50 text-critical-700 ring-critical-200",
  counsel: "bg-counsel-50 text-counsel-700 ring-counsel-200",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-ink-400",
  info: "bg-info-600",
  positive: "bg-accent-500",
  caution: "bg-caution-600",
  critical: "bg-critical-600",
  counsel: "bg-counsel-600",
};

export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  tone?: Tone;
  size?: BadgeSize;
  /** Show a leading tone dot. Useful in dense tables where the tint is subtle. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({
  tone = "neutral",
  size = "sm",
  dot = false,
  children,
  className,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm font-medium ring-1 ring-inset",
        size === "sm" ? "px-1.5 py-0.5 text-2xs" : "px-2 py-1 text-xs",
        TONE_SOLID[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
        />
      )}
      {children}
    </span>
  );
}

/**
 * A badge built directly from a StatusDescriptor.
 *
 * `audience` selects between the internal label and the claimant facing label, so
 * a claimant never reads operational vocabulary such as "Disqualified".
 */
export function StatusBadge({
  status,
  audience = "internal",
  size = "sm",
  dot = true,
  className,
}: {
  status: StatusDescriptor;
  audience?: "internal" | "claimant";
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}) {
  const label =
    audience === "claimant"
      ? (status.claimantLabel ?? status.label)
      : status.label;

  return (
    <Badge
      tone={status.tone}
      size={size}
      dot={dot}
      title={status.hint}
      className={className}
    >
      {label}
    </Badge>
  );
}

/**
 * A quieter marker for metadata that is not a workflow status: a jurisdiction
 * code, a sale type, a document kind. Deliberately toneless so real statuses stay
 * the only coloured elements on a dense screen.
 */
export function Tag({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-xs border border-line bg-inset px-1.5 py-0.5 text-2xs text-ink-600",
        mono && "font-mono tracking-tight",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A monospaced identifier: claim reference, case number, parcel number.
 * Identifiers are selectable and never truncated silently.
 */
export function Identifier({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      {label && <span className="text-2xs text-ink-500">{label}</span>}
      <span className="font-mono text-sm tracking-tight text-ink-800 select-all">
        {children}
      </span>
    </span>
  );
}

/**
 * Priority marker for the operations queues. Three levels only.
 */
export function PriorityMark({ priority }: { priority: 1 | 2 | 3 }) {
  const config = {
    1: { label: "P1", tone: "critical" as Tone, hint: "Highest priority" },
    2: { label: "P2", tone: "caution" as Tone, hint: "Standard priority" },
    3: { label: "P3", tone: "neutral" as Tone, hint: "Low priority" },
  }[priority];

  return (
    <Badge
      tone={config.tone}
      size="sm"
      title={config.hint}
      className="font-mono"
    >
      {config.label}
    </Badge>
  );
}
