import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "./badge";
import {
  LEGAL_FLAG_EXPLANATION,
  LEGAL_FLAG_LABEL,
  LEGAL_HANDOFF_STATUS,
  LEGAL_LANE,
  STAFF_BOUNDARY_NOTICE,
  STAFF_MAY,
  STAFF_MAY_NOT,
  type LegalComplexityFlag,
  type LegalHandoffStatus,
  type LegalLane,
} from "@/domain/legal";
import { IconAttorney, IconLock } from "./icon";
import { formatDate } from "@/lib/format";

/**
 * LEGAL LANE PRESENTATION
 *
 * One component set for the legal complexity lane, so administrative, legal review and
 * attorney required look identical on every surface and cannot drift.
 *
 * The design restraint matters here. The product standard is explicit that this should
 * feel like a sophisticated operational routing system, not a law firm interface plastered
 * with warning boxes. So:
 *
 * - The lane reads as a status, using the same badge vocabulary as every other status in
 *   the product. It gets no special visual weight.
 * - Attorney required uses the counsel tone (indigo), which the design system already
 *   reserves for legal involvement. It is not styled as an error, because it is a routing
 *   outcome rather than a failure.
 * - The staff boundary notice appears once per screen at most, and only where an operator
 *   is about to act on a legally complex claim.
 */

/* ========================================================================== */
/* The badge                                                                   */
/* ========================================================================== */

export function LegalLaneBadge({
  lane,
  audience = "internal",
  size = "sm",
  className,
}: {
  lane: LegalLane;
  audience?: "internal" | "claimant";
  size?: "sm" | "md";
  className?: string;
}) {
  const descriptor = LEGAL_LANE[lane];
  return (
    <Badge
      tone={descriptor.tone}
      size={size}
      dot
      title={audience === "internal" ? descriptor.internalMeaning : undefined}
      className={className}
    >
      {audience === "claimant" ? descriptor.claimantLabel : descriptor.label}
    </Badge>
  );
}

export function LegalHandoffBadge({
  status,
  audience = "internal",
  size = "sm",
}: {
  status: LegalHandoffStatus;
  audience?: "internal" | "claimant";
  size?: "sm" | "md";
}) {
  const descriptor = LEGAL_HANDOFF_STATUS[status];
  const label =
    audience === "claimant"
      ? (descriptor.claimantLabel ?? descriptor.label)
      : descriptor.label;
  return (
    <Badge tone={descriptor.tone} size={size} title={descriptor.hint}>
      {label}
    </Badge>
  );
}

/* ========================================================================== */
/* Lane summary                                                                */
/* ========================================================================== */

/**
 * A compact lane summary for detail screen headers and sidebars.
 *
 * Shows the lane, the rationale, and whether a human has reviewed it. The last of those is
 * the part operators most need: a lane nobody has reviewed is a machine proposal, and
 * saying so plainly is more useful than presenting it as settled.
 */
export function LegalLanePanel({
  lane,
  rationale,
  humanDetermined,
  lastReviewedAt,
  reviewedBy,
  handoffStatus,
  className,
}: {
  lane: LegalLane;
  rationale: string;
  humanDetermined: boolean;
  lastReviewedAt?: string;
  reviewedBy?: string;
  handoffStatus: LegalHandoffStatus;
  className?: string;
}) {
  const descriptor = LEGAL_LANE[lane];

  const surface =
    lane === "administrative"
      ? "border-accent-200 bg-accent-50"
      : lane === "legal_review"
        ? "border-caution-200 bg-caution-50"
        : "border-counsel-200 bg-counsel-50";

  return (
    <div className={cn("rounded-md border px-4 py-3.5", surface, className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow text-ink-600">Legal complexity</p>
        <LegalHandoffBadge status={handoffStatus} />
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-2 text-base font-semibold text-ink-900">
        {lane === "attorney_required" && (
          <IconAttorney size={17} className="text-counsel-700" />
        )}
        {descriptor.label}
      </p>

      <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{rationale}</p>

      <p className="mt-2.5 text-2xs text-ink-600">
        {humanDetermined ? (
          <>
            Human determination
            {reviewedBy && <> by {reviewedBy}</>}
            {lastReviewedAt && <> on {formatDate(lastReviewedAt)}</>}
          </>
        ) : (
          <>
            Derived classification, not yet reviewed by a person. Treat as a
            routing proposal.
          </>
        )}
      </p>
    </div>
  );
}

/* ========================================================================== */
/* Complexity flags                                                            */
/* ========================================================================== */

export function LegalFlagList({
  flags,
  className,
}: {
  flags: LegalComplexityFlag[];
  className?: string;
}) {
  if (flags.length === 0) {
    return (
      <p className={cn("text-sm text-ink-500", className)}>
        No legal complexity flags recorded.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-2.5", className)}>
      {flags.map((flag, index) => (
        <li
          key={`${flag.kind}-${index}`}
          className={cn(
            "rounded-md border px-3.5 py-2.5",
            flag.resolvedAt ? "border-line bg-inset opacity-75" : "border-line",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Badge
              tone={
                flag.resolvedAt
                  ? "neutral"
                  : LEGAL_LANE[
                      // The tone follows the lane this flag proposes, so a reader can see
                      // at a glance which flags are driving an escalation.
                      flagLane(flag)
                    ].tone
              }
            >
              {LEGAL_FLAG_LABEL[flag.kind]}
            </Badge>
            {flag.resolvedAt && <Badge tone="positive">Resolved</Badge>}
          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
            {flag.detail}
          </p>

          <p className="mt-1.5 text-2xs leading-relaxed text-ink-500">
            {LEGAL_FLAG_EXPLANATION[flag.kind]}
          </p>

          <p className="mt-1.5 text-2xs text-ink-500">
            Raised by {flag.raisedBy} on {formatDate(flag.raisedAt)}
            {flag.resolvedAt && <> / resolved {formatDate(flag.resolvedAt)}</>}
          </p>

          {flag.resolutionNote && (
            <p className="mt-1 text-xs text-accent-700">
              {flag.resolutionNote}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function flagLane(flag: LegalComplexityFlag): LegalLane {
  // Imported lazily through the map rather than the function to keep this module free of
  // a circular dependency on the classifier.
  const proposes: Record<string, LegalLane> = {
    probate_required: "legal_review",
    deceased_owner: "legal_review",
    multiple_heirs: "legal_review",
    trust_issue: "legal_review",
    bankruptcy: "legal_review",
    lien_priority_issue: "legal_review",
    unclear_entitlement: "legal_review",
    dissolved_entity: "legal_review",
    probate_dispute: "attorney_required",
    competing_heirs: "attorney_required",
    competing_claimant: "attorney_required",
    contested_ownership: "attorney_required",
    lien_dispute: "attorney_required",
    court_petition_required: "attorney_required",
    litigation: "attorney_required",
    attorney_required_by_jurisdiction: "attorney_required",
    legal_interpretation_required: "attorney_required",
  };
  return proposes[flag.kind] ?? "legal_review";
}

/* ========================================================================== */
/* Role separation                                                             */
/* ========================================================================== */

/**
 * The Duequity role against the attorney role, side by side.
 *
 * Used on both the operations claim detail and the claimant portal, because the single
 * most important thing to communicate about a referred claim is who does what. A claimant
 * who thinks Duequity is their lawyer has been misled, and an operator who forgets the
 * boundary creates real exposure.
 */
export function RoleSeparation({
  firmName,
  className,
  audience = "internal",
}: {
  firmName?: string;
  className?: string;
  audience?: "internal" | "claimant";
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div className="rounded-md border border-line bg-inset px-3.5 py-3">
        <p className="eyebrow text-accent-700">Duequity</p>
        <p className="mt-1 text-sm font-semibold text-ink-900">
          Recovery coordination
        </p>
        <ul className="mt-2 space-y-1">
          {(audience === "claimant"
            ? [
                "Research and verification of the record",
                "Helping you obtain the documents required",
                "Preparing and tracking the claim with the agency",
                "Keeping you informed at every stage",
              ]
            : [
                "Factual research and public record verification",
                "Document collection and organisation",
                "Agency communication and submission tracking",
                "Deadline tracking and claimant support",
              ]
          ).map((item) => (
            <li
              key={item}
              className="flex gap-2 text-xs leading-relaxed text-ink-700"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 size-1 shrink-0 rounded-full bg-accent-500"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-counsel-200 bg-counsel-50 px-3.5 py-3">
        <p className="eyebrow text-counsel-700">
          {firmName ?? "Independent attorney"}
        </p>
        <p className="mt-1 text-sm font-semibold text-ink-900">
          Legal representation
        </p>
        <ul className="mt-2 space-y-1">
          {[
            "Legal advice and interpretation",
            "Court filings and representation",
            "Resolving disputed entitlement",
            "Legal strategy on the matter",
          ].map((item) => (
            <li
              key={item}
              className="flex gap-2 text-xs leading-relaxed text-ink-700"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 size-1 shrink-0 rounded-full bg-counsel-600"
              />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-2xs leading-relaxed text-ink-600">
          {audience === "claimant"
            ? "You engage this firm directly under their own engagement letter. Duequity does not share in their fees."
            : "Engaged directly by the claimant. Duequity does not share in attorney fees and receives no referral compensation."}
        </p>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Staff boundary notice                                                       */
/* ========================================================================== */

/**
 * The internal boundary reminder.
 *
 * Deliberately understated and used sparingly: on the legal section of a complex claim and
 * on the compliance surface, not on every screen. A disclaimer that appears everywhere is
 * read nowhere.
 */
export function StaffBoundaryNotice({
  expanded = false,
  className,
}: {
  expanded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-inset px-3.5 py-2.5",
        className,
      )}
    >
      <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-600">
        <IconLock size={13} className="mt-0.5 shrink-0 text-ink-400" />
        <span>{STAFF_BOUNDARY_NOTICE}</span>
      </p>

      {expanded && (
        <div className="mt-3 grid gap-3 border-t border-line-subtle pt-3 sm:grid-cols-2">
          <div>
            <p className="text-2xs font-semibold tracking-wide text-accent-700 uppercase">
              Duequity staff may
            </p>
            <ul className="mt-1.5 space-y-1">
              {STAFF_MAY.map((item) => (
                <li
                  key={item}
                  className="text-2xs leading-relaxed text-ink-600"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-2xs font-semibold tracking-wide text-critical-700 uppercase">
              Duequity staff may not
            </p>
            <ul className="mt-1.5 space-y-1">
              {STAFF_MAY_NOT.map((item) => (
                <li
                  key={item}
                  className="text-2xs leading-relaxed text-ink-600"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Fee separation                                                              */
/* ========================================================================== */

/**
 * Duequity's service fee and any independent legal fee, presented side by side and never
 * summed.
 *
 * A combined figure would misrepresent the arrangement: the two fees are owed to different
 * parties under different agreements, and Duequity takes no part of the legal fee. Where
 * the firm has not quoted, this shows a neutral state rather than a number.
 */
export function SeparatedFees({
  serviceFee,
  serviceFeeBasis,
  legalFee,
  className,
}: {
  serviceFee: ReactNode;
  serviceFeeBasis?: string;
  legalFee?: {
    amount?: ReactNode;
    basisLabel?: string;
    firmName?: string;
    note?: string;
  };
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div className="rounded-md border border-line bg-paper px-3.5 py-3">
        <p className="eyebrow text-ink-500">Duequity service fee</p>
        <div className="mt-1.5">{serviceFee}</div>
        {serviceFeeBasis && (
          <p className="mt-1.5 text-2xs leading-relaxed text-ink-600">
            {serviceFeeBasis}
          </p>
        )}
        <p className="mt-1.5 text-2xs text-ink-500">
          Invoiced by Duequity after the agency pays the claimant.
        </p>
      </div>

      <div className="rounded-md border border-counsel-200 bg-counsel-50 px-3.5 py-3">
        <p className="eyebrow text-counsel-700">Independent legal fee</p>
        {legalFee?.amount ? (
          <div className="mt-1.5">{legalFee.amount}</div>
        ) : (
          <p className="mt-1.5 text-base font-medium text-ink-500">
            {legalFee?.basisLabel === "Not yet quoted" || !legalFee
              ? "Not yet quoted"
              : legalFee.basisLabel}
          </p>
        )}
        {legalFee?.basisLabel && legalFee.amount && (
          <p className="mt-1.5 text-2xs text-ink-600">{legalFee.basisLabel}</p>
        )}
        {legalFee?.note && (
          <p className="mt-1.5 text-2xs leading-relaxed text-ink-600">
            {legalFee.note}
          </p>
        )}
        <p className="mt-1.5 text-2xs text-ink-600">
          Billed directly by {legalFee?.firmName ?? "the firm"}. Separate from
          the Duequity fee and never combined with it.
        </p>
      </div>
    </div>
  );
}

/**
 * The standing fee separation statement, for use where both fees appear.
 */
export function FeeSeparationNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-2xs leading-relaxed text-ink-500", className)}>
      Duequity service fees and independent legal fees are separate obligations
      to separate parties. Duequity does not share in attorney fees, does not
      receive referral compensation, and does not invoice or collect legal fees
      on a firm&apos;s behalf.
    </p>
  );
}
