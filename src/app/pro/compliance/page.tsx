import type { Metadata } from "next";

import Link from "next/link";

import { evaluateIntakeGate, jurisdictionLabel } from "@/domain/compliance";

import {
  laneDistribution,
  resolveLegalPosition,
} from "@/domain/legal-position";

import { LEGAL_PROCESSING_RULE, jurisdictionLegalRule } from "@/domain/legal";

import { COMPLIANCE_STATUS } from "@/domain/status";

import type { IsoDate } from "@/domain/types";

import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  Stat,
  EmptyState,
} from "@/components/ui/surface";

import { Badge, StatusBadge } from "@/components/ui/badge";

import { ButtonLink } from "@/components/ui/button";

import {
  LegalHandoffBadge,
  LegalLaneBadge,
  StaffBoundaryNotice,
} from "@/components/ui/legal-lane";

import {
  daysBetween,
  formatCents,
  formatCount,
  formatDate,
  plural,
} from "@/lib/format";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { listOpportunities } from "@/server/opportunity-store";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Compliance",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function packageStatusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProCompliancePage() {
  /*
   * Server-side session gate.
   *
   * Resolved before any store read. The layout also withholds the operations
   * shell, but layout and page render in parallel, so the page must refuse to
   * read operational data on its own account.
   */
  if (!(await resolveStaffSession())) {
    return <StaffAuthenticationRequired />;
  }

  const today = currentIsoDate();

  const [jurisdictionPackages, opportunities, conversions] = await Promise.all([
    listJurisdictionRulePackages(),
    listOpportunities(),
    listOpportunityConversions(),
  ]);

  /*
   * Keep one operational rule package per jurisdiction.
   *
   * Prefer an approved package where one exists. If multiple records share
   * the same status, the later record returned by the repository becomes the
   * visible record.
   */
  const packageByJurisdictionId = new Map<
    string,
    (typeof jurisdictionPackages)[number]
  >();

  for (const rulePackage of jurisdictionPackages) {
    const rule = rulePackage.rule;

    if (!rule) {
      continue;
    }

    const existing = packageByJurisdictionId.get(rule.id);

    if (!existing) {
      packageByJurisdictionId.set(rule.id, rulePackage);

      continue;
    }

    if (rulePackage.status === "approved" && existing.status !== "approved") {
      packageByJurisdictionId.set(rule.id, rulePackage);

      continue;
    }

    if (rulePackage.status === existing.status) {
      packageByJurisdictionId.set(rule.id, rulePackage);
    }
  }

  const jurisdictionRecords = [...packageByJurisdictionId.values()].flatMap(
    (rulePackage) =>
      rulePackage.rule
        ? [
            {
              rulePackage,
              jurisdiction: rulePackage.rule,
            },
          ]
        : [],
  );

  const approvedJurisdictionById = new Map(
    jurisdictionRecords
      .filter(({ rulePackage }) => rulePackage.status === "approved")
      .map(({ jurisdiction }) => [jurisdiction.id, jurisdiction]),
  );

  const approvedCount = approvedJurisdictionById.size;

  /* ======================================================================== */
  /* Jurisdiction intake gates                                                */
  /* ======================================================================== */

  const blockedJurisdictions = jurisdictionRecords.filter(
    ({ rulePackage, jurisdiction }) =>
      rulePackage.status !== "approved" ||
      evaluateIntakeGate(jurisdiction).outcome === "blocked",
  );

  const needsReview = jurisdictionRecords.filter(({ jurisdiction }) => {
    if (!jurisdiction.lastLegalReview) {
      return true;
    }

    return daysBetween(jurisdiction.lastLegalReview, today) > 365;
  });

  /*
   * Opportunity intake is fail-closed.
   *
   * If no approved jurisdiction package exists, or the approved jurisdiction
   * itself blocks intake, the opportunity is counted as jurisdiction-gated.
   */
  const blockedOpportunities = opportunities.filter((opportunity) => {
    const jurisdiction = approvedJurisdictionById.get(
      opportunity.jurisdictionId,
    );

    if (!jurisdiction) {
      return true;
    }

    return evaluateIntakeGate(jurisdiction).outcome === "blocked";
  });

  /* ======================================================================== */
  /* Persisted claims                                                         */
  /* ======================================================================== */

  const resolvedClaims = await Promise.all(
    conversions.map((conversion) => resolveClaimRecord(conversion.claimId)),
  );

  const openClaims = resolvedClaims
    .flatMap((resolved) => (resolved ? [resolved.claim] : []))
    .filter(
      (claim) => claim.status !== "closed" && claim.status !== "withdrawn",
    );

  /*
   * Legal routing is only calculated against an approved jurisdiction rule.
   *
   * Claims without an approved rule remain unresolved rather than silently
   * inheriting draft jurisdiction logic.
   */
  const legalPositions = openClaims.flatMap((claim) => {
    const jurisdiction = approvedJurisdictionById.get(claim.jurisdictionId);

    if (!jurisdiction) {
      return [];
    }

    return [
      {
        claim,

        position: resolveLegalPosition(claim, jurisdiction, today),
      },
    ];
  });

  const claimsWithoutApprovedJurisdiction = openClaims.filter(
    (claim) => !approvedJurisdictionById.has(claim.jurisdictionId),
  );

  const lanes = laneDistribution(legalPositions.map((item) => item.position));

  const withConflicts = legalPositions.filter(
    (item) => item.position.conflicts.length > 0,
  );

  const awaitingDetermination = legalPositions.filter(
    (item) =>
      item.position.lane === "legal_review" &&
      (item.position.handoffStatus === "review_pending" ||
        !item.position.humanDetermined),
  );

  const legalAttentionCount =
    awaitingDetermination.length + claimsWithoutApprovedJurisdiction.length;

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Governance</p>

          <h1 className="mt-1.5 text-2xl">Compliance</h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Jurisdiction clearance, legal review currency and claim routing
            derived from persisted Duequity records. Intake remains gated by
            approved rules rather than staff memory.
          </p>
        </div>
      </div>

      {/* ================================================================= stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Jurisdictions recorded"
          value={formatCount(jurisdictionRecords.length)}
          context={`${formatCount(approvedCount)} approved rule ${plural(
            approvedCount,
            "package",
          )}`}
        />

        <Stat
          label="Intake blocked"
          value={formatCount(blockedJurisdictions.length)}
          tone={blockedJurisdictions.length > 0 ? "critical" : "positive"}
          context={`${formatCount(blockedOpportunities.length)} ${plural(
            blockedOpportunities.length,
            "opportunity",
            "opportunities",
          )} currently jurisdiction-gated`}
        />

        <Stat
          label="Review missing or stale"
          value={formatCount(needsReview.length)}
          tone={needsReview.length > 0 ? "caution" : "positive"}
          context="Legal reviews older than one year or not recorded"
        />

        <Stat
          label="Claims needing legal attention"
          value={formatCount(legalAttentionCount)}
          tone={legalAttentionCount > 0 ? "caution" : "positive"}
          context="Pending determination or missing an approved jurisdiction rule"
        />
      </div>

      {/* ================================================= blocked opportunities */}
      {blockedOpportunities.length > 0 && (
        <Callout
          tone="critical"
          title="Opportunities held by jurisdiction controls"
        >
          <p>
            {formatCount(blockedOpportunities.length)}{" "}
            {plural(
              blockedOpportunities.length,
              "opportunity",
              "opportunities",
            )}{" "}
            cannot proceed through normal intake because an approved
            jurisdiction rule is missing or the recorded compliance gate blocks
            intake. Duequity does not override that control from the opportunity
            workflow.
          </p>
        </Callout>
      )}

      {/* ================================================== jurisdiction panels */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* ------------------------------------------- blocked jurisdictions */}
        <Card>
          <CardHeader
            title="Blocked jurisdictions"
            description="Intake remains closed until the recorded jurisdiction controls permit it."
            actions={
              <ButtonLink href="/pro/jurisdictions" size="sm">
                Register
              </ButtonLink>
            }
          />

          <CardBody flush>
            {blockedJurisdictions.length === 0 ? (
              <EmptyState
                compact
                className="m-4 border-0 bg-transparent"
                title="No jurisdictions blocked"
                description="Every recorded approved jurisdiction currently passes its intake gate."
              />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {blockedJurisdictions.map(({ rulePackage, jurisdiction }) => {
                  const gate = evaluateIntakeGate(jurisdiction);

                  const packageBlocked = rulePackage.status !== "approved";

                  const reason = packageBlocked
                    ? `The jurisdiction rule package is ${packageStatusLabel(
                        rulePackage.status,
                      ).toLowerCase()}. Intake remains closed until an approved rule package is published.`
                    : gate.reason;

                  const requiredAction = packageBlocked
                    ? "Complete the jurisdiction legal review and publish an approved rule package."
                    : gate.requiredAction;

                  return (
                    <li key={jurisdiction.id}>
                      <Link
                        href={`/pro/jurisdictions/${jurisdiction.id}`}
                        className="block px-4 py-3 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink-900">
                              {jurisdictionLabel(jurisdiction)}
                            </p>

                            <p className="mt-0.5 text-2xs text-ink-500">
                              Rule package:{" "}
                              {packageStatusLabel(rulePackage.status)}
                            </p>
                          </div>

                          <StatusBadge
                            status={
                              COMPLIANCE_STATUS[jurisdiction.complianceStatus]
                            }
                          />
                        </div>

                        <p className="mt-1 text-xs leading-relaxed text-ink-600">
                          {reason}
                        </p>

                        {requiredAction && (
                          <p className="mt-1 text-xs leading-relaxed text-accent-700">
                            {requiredAction}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* ----------------------------------------------- review currency */}
        <Card>
          <CardHeader
            title="Review currency"
            description="Legal reviews older than one year, or never recorded."
          />

          <CardBody flush>
            {needsReview.length === 0 ? (
              <EmptyState
                compact
                className="m-4 border-0 bg-transparent"
                title="All reviews current"
                description="Every recorded jurisdiction has a legal review within the last year."
              />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {needsReview.map(({ rulePackage, jurisdiction }) => {
                  const age = jurisdiction.lastLegalReview
                    ? daysBetween(jurisdiction.lastLegalReview, today)
                    : undefined;

                  return (
                    <li key={jurisdiction.id}>
                      <Link
                        href={`/pro/jurisdictions/${jurisdiction.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-900">
                            {jurisdictionLabel(jurisdiction)}
                          </p>

                          <p className="mt-0.5 text-xs text-ink-500">
                            {jurisdiction.reviewedBy ?? "No reviewer recorded"}
                          </p>

                          <p className="mt-0.5 text-2xs text-ink-400">
                            Package{" "}
                            {packageStatusLabel(
                              rulePackage.status,
                            ).toLowerCase()}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          {jurisdiction.lastLegalReview ? (
                            <>
                              <p className="tnum text-xs text-ink-700">
                                {formatDate(jurisdiction.lastLegalReview)}
                              </p>

                              <p className="text-2xs text-caution-700">
                                {age} days old
                              </p>
                            </>
                          ) : (
                            <Badge tone="critical">Never</Badge>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ====================================================== legal routing */}
      <Card>
        <CardHeader
          title="Legal routing"
          description="Open persisted claims classified between Duequity's administrative workflow, legal review and independent counsel."
          actions={
            <ButtonLink href="/pro/claims" size="sm">
              Claims
            </ButtonLink>
          }
        />

        <CardBody>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-accent-200 bg-accent-50 px-3.5 py-3">
              <LegalLaneBadge lane="administrative" />

              <p className="mt-2 tnum text-2xl font-semibold text-ink-900">
                {formatCount(lanes.administrative)}
              </p>

              <p className="mt-0.5 text-xs leading-relaxed text-ink-600">
                Inside Duequity&apos;s administrative recovery workflow.
              </p>
            </div>

            <div className="rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3">
              <LegalLaneBadge lane="legal_review" />

              <p className="mt-2 tnum text-2xl font-semibold text-ink-900">
                {formatCount(lanes.legalReview)}
              </p>

              <p className="mt-0.5 text-xs leading-relaxed text-ink-600">
                Held pending a legal or compliance determination.
              </p>
            </div>

            <div className="rounded-md border border-counsel-200 bg-counsel-50 px-3.5 py-3">
              <LegalLaneBadge lane="attorney_required" />

              <p className="mt-2 tnum text-2xl font-semibold text-ink-900">
                {formatCount(lanes.attorneyRequired)}
              </p>

              <p className="mt-0.5 text-xs leading-relaxed text-ink-600">
                Independent counsel required. Duequity coordinates only.
              </p>
            </div>
          </div>

          {/* ---------------------------------- missing approved jurisdiction */}
          {claimsWithoutApprovedJurisdiction.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow text-critical-700">
                Missing approved jurisdiction rule (
                {claimsWithoutApprovedJurisdiction.length})
              </p>

              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                These claims cannot receive a current legal-lane determination
                because no approved jurisdiction rule is published.
              </p>

              <ul className="mt-2 divide-y divide-line-subtle">
                {claimsWithoutApprovedJurisdiction.map((claim) => (
                  <li key={claim.id}>
                    <Link
                      href={`/pro/claims/${claim.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 py-2.5 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500"
                    >
                      <span className="font-mono text-xs text-accent-700">
                        {claim.reference}
                      </span>

                      <span className="tnum text-sm font-medium text-ink-900">
                        {formatCents(
                          claim.confirmedRecovery?.amount ??
                            claim.estimatedRecovery.amount,
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* -------------------------------------- awaiting determination */}
          {awaitingDetermination.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow text-caution-700">
                Awaiting determination ({awaitingDetermination.length})
              </p>

              <ul className="mt-2 divide-y divide-line-subtle">
                {awaitingDetermination.map(({ claim, position }) => (
                  <li key={claim.id}>
                    <Link
                      href={`/pro/claims/${claim.id}#legal`}
                      className="block py-2.5 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-ink-600">
                              {claim.reference}
                            </span>

                            <LegalHandoffBadge
                              status={position.handoffStatus}
                            />

                            {!position.humanDetermined && (
                              <Badge tone="caution">Never reviewed</Badge>
                            )}
                          </p>

                          <p className="mt-1 text-sm leading-relaxed text-ink-700">
                            {position.rationale}
                          </p>

                          {position.legalDeadline && (
                            <p className="mt-1 text-2xs text-ink-500">
                              Determination targeted by{" "}
                              {formatDate(position.legalDeadline)}
                            </p>
                          )}
                        </div>

                        <p className="tnum shrink-0 text-sm font-medium text-ink-900">
                          {formatCents(
                            claim.confirmedRecovery?.amount ??
                              claim.estimatedRecovery.amount,
                          )}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ----------------------------------- classification conflicts */}
          {withConflicts.length > 0 && (
            <div className="mt-5 border-t border-line-subtle pt-4">
              <p className="eyebrow text-critical-700">
                Classification conflicts ({withConflicts.length})
              </p>

              <p className="mt-1 text-xs text-ink-600">
                Conflicting legal-routing facts require human review. The engine
                surfaces the conflict but does not resolve the legal conclusion
                itself.
              </p>

              <ul className="mt-2.5 space-y-2">
                {withConflicts.map(({ claim, position }) =>
                  position.conflicts.map((conflict) => (
                    <li
                      key={`${claim.id}-${conflict.kind}`}
                      className={
                        conflict.severity === "blocking"
                          ? "rounded-md border border-critical-200 bg-critical-50 px-3.5 py-2.5"
                          : "rounded-md border border-caution-200 bg-caution-50 px-3.5 py-2.5"
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-900">
                          {conflict.summary}
                        </p>

                        <Link
                          href={`/pro/claims/${claim.id}#legal`}
                          className="shrink-0 font-mono text-xs text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                        >
                          {claim.reference}
                        </Link>
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-ink-700">
                        {conflict.detail}
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-ink-800">
                        <span className="font-semibold">Required: </span>

                        {conflict.requiredAction}
                      </p>
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}

          <StaffBoundaryNotice expanded className="mt-5" />
        </CardBody>
      </Card>

      {/* ================================= jurisdiction legal processing rules */}
      <Card>
        <CardHeader
          title="Legal processing rules by jurisdiction"
          description="Recorded legal-processing requirements remain separate from whether intake is currently open."
        />

        <CardBody flush>
          {jurisdictionRecords.length === 0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="No jurisdiction rules recorded"
              description="Legal processing requirements will appear after jurisdiction rule records are created."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {jurisdictionRecords.map(({ rulePackage, jurisdiction }) => {
                const rule = jurisdictionLegalRule(jurisdiction);

                const descriptor = LEGAL_PROCESSING_RULE[rule];

                return (
                  <li key={jurisdiction.id}>
                    <Link
                      href={`/pro/jurisdictions/${jurisdiction.id}`}
                      className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">
                          {jurisdictionLabel(jurisdiction)}
                        </p>

                        <p className="mt-0.5 text-xs leading-relaxed text-ink-600">
                          {descriptor.detail}
                        </p>

                        <p className="mt-1 text-2xs text-ink-400">
                          Rule package{" "}
                          {packageStatusLabel(rulePackage.status).toLowerCase()}
                        </p>

                        {!jurisdiction.legalProcessingRule && (
                          <p className="mt-1 text-2xs text-caution-700">
                            Inferred from the recorded compliance status. No
                            explicit legal processing rule is recorded.
                          </p>
                        )}
                      </div>

                      <Badge
                        tone={descriptor.tone}
                        size="md"
                        className="shrink-0"
                      >
                        {descriptor.label}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ===================================================== enforcement note */}
      <Callout tone="neutral" title="What the platform enforces">
        <div className="space-y-2">
          <p>
            Duequity enforces the rules actually recorded in the jurisdiction
            and claim workflow. A missing approved jurisdiction rule closes the
            production path instead of allowing staff to guess.
          </p>

          <p>
            The platform cannot independently determine whether a legal rule
            entered by a reviewer is correct. That remains dependent on the
            research, source evidence and human approval behind each
            jurisdiction rule package.
          </p>

          <p>
            This screen intentionally does not fabricate compliance tasks, staff
            assignments or generic blocker records where no persisted production
            repository exists.
          </p>
        </div>
      </Callout>
    </div>
  );
}