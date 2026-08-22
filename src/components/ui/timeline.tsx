import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

/**
 * TIMELINES AND PROGRESS
 *
 * The recovery timeline is the emotional centre of the claimant portal. A former
 * homeowner opening the portal is asking one question: where is my money and what
 * happens next. The timeline answers it without requiring them to read anything
 * else on the page.
 *
 * Design decisions:
 *
 * - Stages are supplied as data, never hard coded. Section 5.
 * - The current stage is visually dominant. Completed stages recede, future stages
 *   are visible but quiet, so the eye lands on "you are here".
 * - Progress is conveyed by icon and text as well as colour, so it survives
 *   greyscale and colour vision deficiency. Section 20.
 * - No stage claims a date it does not have. An undated future stage says nothing
 *   rather than inventing an estimate.
 */

export type StageState =
  "complete" | "current" | "upcoming" | "blocked" | "skipped";

export interface TimelineStage {
  key: string;
  label: string;
  description?: string;
  state: StageState;
  /** ISO date the stage completed or started. Omitted for future stages. */
  date?: string;
  /** What the claimant must do, shown only on the current stage. */
  actionRequired?: string;
}

export function RecoveryTimeline({
  stages,
  className,
}: {
  stages: TimelineStage[];
  className?: string;
}) {
  return (
    <ol className={cn("relative", className)}>
      {stages.map((stage, index) => {
        const isLast = index === stages.length - 1;
        return (
          <li key={stage.key} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* Connector. Drawn behind the marker, stopping at the last stage. */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-6 left-[11px] h-[calc(100%-1.5rem)] w-0.5",
                  stage.state === "complete" ? "bg-accent-300" : "bg-line",
                )}
              />
            )}

            <StageMarker state={stage.state} />

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p
                  className={cn(
                    "text-base",
                    stage.state === "current"
                      ? "font-semibold text-ink-900"
                      : stage.state === "upcoming"
                        ? "text-ink-500"
                        : stage.state === "blocked"
                          ? "font-semibold text-critical-700"
                          : "font-medium text-ink-700",
                  )}
                >
                  {stage.label}
                  {stage.state === "current" && (
                    <span className="sr-only"> (current stage)</span>
                  )}
                  {stage.state === "skipped" && (
                    <span className="ml-2 text-xs font-normal text-ink-400">
                      Not required
                    </span>
                  )}
                </p>
                {stage.date && (
                  <p className="tnum shrink-0 text-xs text-ink-500">
                    {formatDate(stage.date)}
                  </p>
                )}
              </div>

              {stage.description && (
                <p
                  className={cn(
                    "mt-1 text-sm",
                    stage.state === "upcoming"
                      ? "text-ink-400"
                      : "text-ink-600",
                  )}
                >
                  {stage.description}
                </p>
              )}

              {stage.actionRequired && (
                <div className="mt-2 rounded-md border border-caution-200 bg-caution-50 px-3 py-2">
                  <p className="text-2xs font-semibold tracking-wide text-caution-700 uppercase">
                    Action needed from you
                  </p>
                  <p className="mt-0.5 text-sm text-ink-800">
                    {stage.actionRequired}
                  </p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StageMarker({ state }: { state: StageState }) {
  const shared =
    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2";

  if (state === "complete") {
    return (
      <span
        aria-hidden="true"
        className={cn(shared, "border-accent-600 bg-accent-600 text-white")}
      >
        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
          <path
            d="M1 4.2L3.8 7 10 1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (state === "current") {
    return (
      <span
        aria-hidden="true"
        className={cn(shared, "border-accent-600 bg-paper")}
      >
        <span className="size-2 rounded-full bg-accent-600" />
      </span>
    );
  }

  if (state === "blocked") {
    return (
      <span
        aria-hidden="true"
        className={cn(shared, "border-critical-600 bg-paper text-critical-700")}
      >
        <span className="text-xs font-bold leading-none">!</span>
      </span>
    );
  }

  if (state === "skipped") {
    return (
      <span
        aria-hidden="true"
        className={cn(shared, "border-line-strong bg-sunken")}
      >
        <span className="h-0.5 w-2 rounded-full bg-ink-300" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(shared, "border-line-strong bg-paper")}
    />
  );
}

/* ========================================================================== */
/* Compact stage bar                                                           */
/* ========================================================================== */

/**
 * A horizontal stage indicator for headers and list rows, where the full timeline
 * does not fit. Communicates position without pretending to be a percentage: this
 * is stage 4 of 12, not 33% done, because claim progress is not linear in time.
 */
export function StageBar({
  stages,
  currentIndex,
  label,
  className,
}: {
  stages: { key: string; label: string }[];
  currentIndex: number;
  label: string;
  className?: string;
}) {
  const total = stages.length;
  const position = Math.min(Math.max(currentIndex, 0), total - 1);
  const current = stages[position];

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-medium text-ink-900">
          {current?.label}
        </p>
        <p className="tnum shrink-0 text-xs text-ink-500">
          Stage {position + 1} of {total}
        </p>
      </div>
      <div
        role="img"
        aria-label={`${label}: stage ${position + 1} of ${total}, ${current?.label}`}
        className="mt-1.5 flex gap-0.5"
      >
        {stages.map((stage, index) => (
          <span
            key={stage.key}
            className={cn(
              "h-1 flex-1 rounded-full",
              index < position
                ? "bg-accent-400"
                : index === position
                  ? "bg-accent-600"
                  : "bg-line",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Activity feed                                                               */
/* ========================================================================== */

/**
 * A chronological activity feed for the operations side: audit history, case
 * events, communications. Denser than the claimant timeline and does not imply
 * forward progress, only sequence.
 */
export function ActivityFeed({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ol className={cn("divide-y divide-line-subtle", className)}>{children}</ol>
  );
}

export function ActivityItem({
  title,
  detail,
  actor,
  date,
  tone = "neutral",
  children,
}: {
  title: ReactNode;
  detail?: ReactNode;
  actor?: string;
  date: string;
  tone?: "neutral" | "info" | "positive" | "caution" | "critical" | "counsel";
  children?: ReactNode;
}) {
  const dotTone = {
    neutral: "bg-ink-300",
    info: "bg-info-600",
    positive: "bg-accent-500",
    caution: "bg-caution-600",
    critical: "bg-critical-600",
    counsel: "bg-counsel-600",
  }[tone];

  return (
    <li className="flex gap-3 py-3">
      <span
        aria-hidden="true"
        className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dotTone)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium text-ink-900">{title}</p>
          <p className="tnum shrink-0 text-xs text-ink-500">
            {formatDate(date)}
          </p>
        </div>
        {detail && <p className="mt-0.5 text-sm text-ink-600">{detail}</p>}
        {actor && <p className="mt-0.5 text-xs text-ink-500">{actor}</p>}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
}

/* ========================================================================== */
/* Checklist                                                                   */
/* ========================================================================== */

/**
 * A readiness checklist, used for filing readiness and the closing checklist.
 *
 * Every unsatisfied blocking item states what is missing. A checklist that only
 * says "not ready" without saying why is an operational dead end.
 */
export function Checklist({
  items,
  className,
}: {
  items: {
    key: string;
    label: string;
    satisfied: boolean;
    blocking: boolean;
    detail?: string;
  }[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-0.5 shrink-0">
            {item.satisfied ? (
              <span className="flex size-4.5 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                <svg width="9" height="7" viewBox="0 0 11 8" fill="none">
                  <path
                    d="M1 4.2L3.8 7 10 1"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : (
              <span
                className={cn(
                  "flex size-4.5 items-center justify-center rounded-full text-2xs font-bold",
                  item.blocking
                    ? "bg-critical-100 text-critical-700"
                    : "bg-ink-100 text-ink-500",
                )}
              >
                {item.blocking ? "!" : "-"}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm",
                item.satisfied
                  ? "text-ink-600"
                  : item.blocking
                    ? "font-medium text-ink-900"
                    : "text-ink-700",
              )}
            >
              {item.label}
              <span className="sr-only">
                {item.satisfied
                  ? ": complete"
                  : item.blocking
                    ? ": required, outstanding"
                    : ": outstanding"}
              </span>
            </p>
            {item.detail && !item.satisfied && (
              <p className="mt-0.5 text-xs text-ink-600">{item.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
