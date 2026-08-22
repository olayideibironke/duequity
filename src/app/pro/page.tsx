import type { Metadata } from "next";

import Link from "next/link";

import { evaluateIntakeGate, jurisdictionLabel } from "@/domain/compliance";

import {
  laneDistribution,
  resolveLegalPosition,
} from "@/domain/legal-position";

import { LEGAL_LANE } from "@/domain/legal";

import { COMPLIANCE_STATUS } from "@/domain/status";

import type { IsoDate } from "@/domain/types";

import { LegalLaneBadge } from "@/components/ui/legal-lane";

import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import { Badge, StatusBadge } from "@/components/ui/badge";

import { ButtonLink } from "@/components/ui/button";

import { CertaintyLabel } from "@/components/ui/money";

import { IconArrowRight } from "@/components/ui/icon";

import { formatCents, formatCount, formatDate, plural } from "@/lib/format";

import { listOpportunities, listProperties } from "@/server/opportunity-store";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { listClaimDocumentRequests } from "@/server/claim-document-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Operations overview",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function packagePreference(status: string): number {
  switch (status) {
    case "approved":
      return 3;

    case "draft":
      return 2;

    default:
      return 1;
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProOverviewPage() {
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

  const [opportunities, properties, conversions, jurisdictionPackages] =
    await Promise.all([
      listOpportunities(),
      listProperties(),
      listOpportunityConversions(),
      listJurisdictionRulePackages(),
    ]);

  /* ======================================================================== */
  /* Lookup maps                                                              */
  /* ======================================================================== */

  const propertyById = new Map(
    properties.map((property) => [property.id, property]),
  );

  const selectedJurisdictionPackageById = new Map<
    string,
    (typeof jurisdictionPackages)[number]
  >();

  for (const rulePackage of jurisdictionPackages) {
    if (!rulePackage.rule) {
      continue;
    }

    const jurisdictionId = rulePackage.rule.id;

    const existing = selectedJurisdictionPackageById.get(jurisdictionId);

    if (
      !existing ||
      packagePreference(rulePackage.status) >=
        packagePreference(existing.status)
    ) {
      selectedJurisdictionPackageById.set(jurisdictionId, rulePackage);
    }
  }

  const jurisdictionRecords = [
    ...selectedJurisdictionPackageById.values(),
  ].flatMap((rulePackage) =>
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

  /* ======================================================================== */
  /* Claims                                                                   */
  /* ======================================================================== */

  const claimRows = (
    await Promise.all(
      conversions.map(async (conversion) => {
        const resolved = await resolveClaimRecord(conversion.claimId);

        if (!resolved) {
          return undefined;
        }

        const claim = resolved.claim;

        const documentRequests = await listClaimDocumentRequests(claim.id);

        return {
          conversion,
          claim,
          property: propertyById.get(claim.propertyId),
          documentRequests,
        };
      }),
    )
  ).flatMap((row) => (row ? [row] : []));

  const openClaimRows = claimRows.filter(
    ({ claim }) => claim.status !== "closed" && claim.status !== "withdrawn",
  );

  const completedRecoveryRows = claimRows.filter(
    ({ claim }) =>
      (claim.status === "paid" || claim.status === "closed") &&
      Boolean(claim.confirmedRecovery),
  );

  /* ======================================================================== */
  /* Compliance                                                              */
  /* ======================================================================== */

  const blockedJurisdictions = jurisdictionRecords.filter(
    ({ rulePackage, jurisdiction }) =>
      rulePackage.status !== "approved" ||
      evaluateIntakeGate(jurisdiction).outcome === "blocked",
  );

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
  /* Documents                                                               */
  /* ======================================================================== */

  const outstandingDocumentRows = claimRows.flatMap((row) =>
    row.documentRequests
      .filter(
        (request) =>
          request.status === "outstanding" || request.status === "overdue",
      )
      .map((request) => ({
        request,
        claim: row.claim,
        property: row.property,
      })),
  );

  const overdueDocumentRows = outstandingDocumentRows.filter(
    ({ request }) =>
      request.status === "overdue" ||
      Boolean(request.dueBy && request.dueBy < today),
  );

  const claimsWithOutstandingDocuments = new Set(
    outstandingDocumentRows.map(({ claim }) => claim.id),
  );

  /* ======================================================================== */
  /* Legal routing                                                           */
  /* ======================================================================== */

  const legalPositions = openClaimRows.flatMap((row) => {
    const jurisdiction = approvedJurisdictionById.get(row.claim.jurisdictionId);

    if (!jurisdiction) {
      return [];
    }

    return [
      {
        ...row,

        jurisdiction,

        position: resolveLegalPosition(row.claim, jurisdiction, today),
      },
    ];
  });

  const claimsWithoutApprovedJurisdiction = openClaimRows.filter(
    ({ claim }) => !approvedJurisdictionById.has(claim.jurisdictionId),
  );

  const lanes = laneDistribution(legalPositions.map((row) => row.position));

  const legalAttention = legalPositions.filter(
    ({ position }) =>
      position.awaitingReferral ||
      position.blockingConflicts.length > 0 ||
      position.lane === "legal_review",
  );

  const legalAttentionCount =
    legalAttention.length + claimsWithoutApprovedJurisdiction.length;

  /* ======================================================================== */
  /* Capital                                                                  */
  /* ======================================================================== */

  const confirmedOpenAmount = openClaimRows.reduce(
    (total, { claim }) => total + (claim.confirmedRecovery?.amount ?? 0),
    0,
  );

  const confirmedOpenCount = openClaimRows.filter(({ claim }) =>
    Boolean(claim.confirmedRecovery),
  ).length;

  const estimatedOpenAmount = openClaimRows.reduce(
    (total, { claim }) =>
      total + (claim.confirmedRecovery ? 0 : claim.estimatedRecovery.amount),
    0,
  );

  const estimatedOpenCount = openClaimRows.filter(
    ({ claim }) => !claim.confirmedRecovery,
  ).length;

  const recoveredAmount = completedRecoveryRows.reduce(
    (total, { claim }) => total + (claim.confirmedRecovery?.amount ?? 0),
    0,
  );

  /* ======================================================================== */
  /* Pipeline                                                                 */
  /* ======================================================================== */

  const convertedOpportunityIds = new Set(
    conversions.map((conversion) => conversion.opportunityId),
  );

  const unconvertedOpportunities = opportunities.filter(
    (opportunity) => !convertedOpportunityIds.has(opportunity.id),
  );

  const approvedAwaitingPayment = claimRows.filter(
    ({ claim }) =>
      claim.status === "approved" && Boolean(claim.confirmedRecovery),
  );

  const attentionItems =
    blockedOpportunities.length +
    legalAttentionCount +
    overdueDocumentRows.length;

  return (
    <div className="space-y-6">
      {/* ================================================================ header */}
      <div>
        <p className="eyebrow text-ink-500">Operations overview</p>

        <h1 className="mt-1.5 text-2xl">Duequity command center</h1>

        <p className="mt-1 text-sm text-ink-600">
          National operating position as at {formatDate(today)}. Every figure
          below is derived from persisted workflow records.
        </p>
      </div>

      {/* ======================================================= top attention */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Attention items"
          value={formatCount(attentionItems)}
          tone={attentionItems > 0 ? "caution" : "positive"}
          context="Compliance blocks, legal attention and overdue documents"
        />

        <Stat
          label="Jurisdiction-gated opportunities"
          value={formatCount(blockedOpportunities.length)}
          tone={blockedOpportunities.length > 0 ? "critical" : "positive"}
          context="Cannot enter the normal intake path"
        />

        <Stat
          label="Claims needing legal attention"
          value={formatCount(legalAttentionCount)}
          tone={legalAttentionCount > 0 ? "caution" : "positive"}
          context="Legal review, referral, conflict, or missing approved rule"
        />

        <Stat
          label="Documents outstanding"
          value={formatCount(outstandingDocumentRows.length)}
          tone={outstandingDocumentRows.length > 0 ? "caution" : "positive"}
          context={`${formatCount(
            claimsWithOutstandingDocuments.size,
          )} affected ${plural(claimsWithOutstandingDocuments.size, "claim")}`}
        />
      </div>

      {/* ================================================= attention panels */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Compliance gating"
            description="Opportunities whose jurisdiction does not currently permit the normal intake path."
            actions={
              <ButtonLink href="/pro/compliance" size="sm">
                Compliance
              </ButtonLink>
            }
          />

          <CardBody flush>
            {blockedOpportunities.length === 0 ? (
              <EmptyState
                compact
                className="m-4 border-0 bg-transparent"
                title="No opportunity intake blocks"
                description="Every persisted opportunity currently has an approved jurisdiction path that permits intake."
              />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {blockedOpportunities.slice(0, 6).map((opportunity) => {
                  const property = propertyById.get(opportunity.propertyId);

                  const jurisdiction = approvedJurisdictionById.get(
                    opportunity.jurisdictionId,
                  );

                  const gate = jurisdiction
                    ? evaluateIntakeGate(jurisdiction)
                    : undefined;

                  return (
                    <li key={opportunity.id}>
                      <Link
                        href={`/pro/opportunities/${opportunity.id}`}
                        className="block px-4 py-3 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone="critical">Intake blocked</Badge>

                              <span className="font-mono text-xs text-ink-600">
                                {opportunity.reference}
                              </span>
                            </div>

                            <p className="mt-1 text-sm font-medium text-ink-900">
                              {property?.address.line1 ??
                                "Property not recorded"}
                            </p>

                            <p className="mt-1 text-xs leading-relaxed text-ink-600">
                              {gate?.reason ??
                                "No approved jurisdiction rule package is available."}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Legal attention"
            description="Open claims requiring a legal decision, independent counsel, conflict resolution, or an approved jurisdiction rule."
            actions={
              <ButtonLink href="/pro/attorneys" size="sm">
                Attorney coordination
              </ButtonLink>
            }
          />

          <CardBody flush>
            {legalAttentionCount === 0 ? (
              <EmptyState
                compact
                className="m-4 border-0 bg-transparent"
                title="No legal attention outstanding"
                description="Every open claim with an approved rule currently has a settled legal lane."
              />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {claimsWithoutApprovedJurisdiction
                  .slice(0, 3)
                  .map(({ claim, property }) => (
                    <li key={claim.id}>
                      <Link
                        href={`/pro/claims/${claim.id}#legal`}
                        className="block px-4 py-3 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="critical">Rule missing</Badge>

                          <span className="font-mono text-xs text-ink-600">
                            {claim.reference}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-ink-800">
                          {property?.address.line1 ?? "Property not recorded"}
                        </p>

                        <p className="mt-1 text-xs text-ink-600">
                          No approved jurisdiction rule is available for legal
                          routing.
                        </p>
                      </Link>
                    </li>
                  ))}

                {legalAttention
                  .slice(
                    0,
                    Math.max(
                      0,
                      6 - Math.min(3, claimsWithoutApprovedJurisdiction.length),
                    ),
                  )
                  .map(({ claim, property, position }) => (
                    <li key={claim.id}>
                      <Link
                        href={`/pro/claims/${claim.id}#legal`}
                        className="block px-4 py-3 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <LegalLaneBadge lane={position.lane} />

                          <span className="font-mono text-xs text-ink-600">
                            {claim.reference}
                          </span>

                          {position.awaitingReferral && (
                            <Badge tone="critical">Referral needed</Badge>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-ink-800">
                          {property?.address.line1 ?? "Property not recorded"}
                        </p>

                        {position.nextAction && (
                          <p className="mt-1 text-xs leading-relaxed text-ink-600">
                            {position.nextAction.action}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ============================================================ capital */}
      <Card>
        <CardHeader
          title="Recovery capital"
          description="Open claim value is separated by certainty. Completed recoveries are counted only from paid or closed claims with a confirmed recovery."
          actions={
            <ButtonLink href="/pro/recoveries" size="sm">
              Recoveries
            </ButtonLink>
          }
        />

        <CardBody>
          <div className="grid gap-5 sm:grid-cols-3">
            <CapitalBlock
              quality="confirmed"
              label="Confirmed open"
              amount={confirmedOpenAmount}
              count={confirmedOpenCount}
              note="Confirmed recovery value on claims still in progress."
            />

            <CapitalBlock
              quality="verified"
              label="Estimated open"
              amount={estimatedOpenAmount}
              count={estimatedOpenCount}
              note="Claim estimates where no confirmed recovery is recorded yet."
            />

            <div className="border-t border-line pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
              <p className="eyebrow text-accent-700">Confirmed recovered</p>

              <p className="mt-1.5 tnum text-2xl font-semibold text-accent-700">
                {formatCents(recoveredAmount)}
              </p>

              <p className="mt-1 text-xs text-ink-500">
                {formatCount(completedRecoveryRows.length)} completed{" "}
                {plural(completedRecoveryRows.length, "recovery", "recoveries")}
                .
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ================================================= pipeline + workload */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Pipeline snapshot"
            description="Current persisted progression from opportunity through claim and recovery."
            actions={
              <ButtonLink
                href="/pro/opportunities"
                size="sm"
                trailing={<IconArrowRight size={14} />}
              >
                Opportunities
              </ButtonLink>
            }
          />

          <CardBody>
            <dl className="space-y-3">
              <WorkloadRow
                label="Opportunities recorded"
                value={opportunities.length}
                tone="info"
                href="/pro/opportunities"
              />

              <WorkloadRow
                label="Not yet converted"
                value={unconvertedOpportunities.length}
                tone="caution"
                href="/pro/opportunities"
              />

              <WorkloadRow
                label="Open claims"
                value={openClaimRows.length}
                tone="info"
                href="/pro/claims"
              />

              <WorkloadRow
                label="Approved, awaiting payment"
                value={approvedAwaitingPayment.length}
                tone="caution"
                href="/pro/recoveries"
              />

              <WorkloadRow
                label="Completed recoveries"
                value={completedRecoveryRows.length}
                tone="positive"
                href="/pro/recoveries"
              />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Document readiness"
            description="Outstanding persisted document requirements across active claims."
            actions={
              <ButtonLink href="/pro/documents" size="sm">
                Documents
              </ButtonLink>
            }
          />

          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <Stat
                label="Outstanding"
                value={formatCount(outstandingDocumentRows.length)}
                tone={
                  outstandingDocumentRows.length > 0 ? "caution" : "positive"
                }
                context="Requirements not yet accepted"
              />

              <Stat
                label="Overdue"
                value={formatCount(overdueDocumentRows.length)}
                tone={overdueDocumentRows.length > 0 ? "critical" : "positive"}
                context="Past a recorded due date"
              />

              <Stat
                label="Claims affected"
                value={formatCount(claimsWithOutstandingDocuments.size)}
                context="Claims with at least one outstanding requirement"
              />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ======================================================= legal lanes */}
      <Card>
        <CardHeader
          title="Legal routing"
          description="Current distribution of open claims that have an approved jurisdiction rule."
          actions={
            <ButtonLink href="/pro/compliance" size="sm">
              Compliance
            </ButtonLink>
          }
        />

        <CardBody>
          <div className="grid gap-5 lg:grid-cols-3">
            <LaneRow
              lane="administrative"
              count={lanes.administrative}
              total={legalPositions.length}
            />

            <LaneRow
              lane="legal_review"
              count={lanes.legalReview}
              total={legalPositions.length}
            />

            <LaneRow
              lane="attorney_required"
              count={lanes.attorneyRequired}
              total={legalPositions.length}
            />
          </div>

          {claimsWithoutApprovedJurisdiction.length > 0 && (
            <Callout
              tone="critical"
              className="mt-5"
              title="Claims outside current legal routing"
            >
              <p>
                {formatCount(claimsWithoutApprovedJurisdiction.length)} open{" "}
                {plural(claimsWithoutApprovedJurisdiction.length, "claim")}{" "}
                cannot receive a current legal-lane determination because an
                approved jurisdiction rule is missing.
              </p>
            </Callout>
          )}
        </CardBody>
      </Card>

      {/* ====================================================== compliance */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Jurisdiction posture"
            description="The strongest persisted rule package currently available for each jurisdiction."
            actions={
              <ButtonLink href="/pro/jurisdictions" size="sm">
                Jurisdictions
              </ButtonLink>
            }
          />

          <CardBody flush>
            {jurisdictionRecords.length === 0 ? (
              <EmptyState
                compact
                className="m-4 border-0 bg-transparent"
                title="No jurisdiction rules recorded"
                description="Jurisdiction posture will appear after rule packages are created."
              />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {jurisdictionRecords
                  .slice(0, 8)
                  .map(({ rulePackage, jurisdiction }) => (
                    <li key={jurisdiction.id}>
                      <Link
                        href={`/pro/jurisdictions/${jurisdiction.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-900">
                            {jurisdictionLabel(jurisdiction)}
                          </p>

                          <p className="mt-0.5 text-xs text-ink-500">
                            Package {rulePackage.status.replaceAll("_", " ")}
                          </p>
                        </div>

                        <StatusBadge
                          status={
                            COMPLIANCE_STATUS[jurisdiction.complianceStatus]
                          }
                        />
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Compliance summary"
            description="Current jurisdiction and intake-control totals."
            actions={
              <ButtonLink href="/pro/compliance" size="sm">
                Review
              </ButtonLink>
            }
          />

          <CardBody>
            <dl className="space-y-3">
              <SummaryRow
                label="Jurisdictions recorded"
                value={jurisdictionRecords.length}
              />

              <SummaryRow
                label="Approved packages"
                value={approvedJurisdictionById.size}
              />

              <SummaryRow
                label="Blocked jurisdictions"
                value={blockedJurisdictions.length}
                caution={blockedJurisdictions.length > 0}
              />

              <SummaryRow
                label="Blocked opportunities"
                value={blockedOpportunities.length}
                caution={blockedOpportunities.length > 0}
              />
            </dl>

            {blockedOpportunities.length > 0 && (
              <Callout tone="critical" className="mt-4">
                <p>
                  Intake remains closed for{" "}
                  {formatCount(blockedOpportunities.length)}{" "}
                  {plural(
                    blockedOpportunities.length,
                    "opportunity",
                    "opportunities",
                  )}{" "}
                  until their jurisdiction controls permit progression.
                </p>
              </Callout>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ============================================================ boundary */}
      <Callout tone="neutral" title="What this overview does not infer">
        <p>
          The command center does not invent statutory deadlines, task
          assignments, agency payment instruments, fee receipts, security
          events, or jurisdiction approvals. Those facts appear only when their
          underlying production workflow actually persists them.
        </p>
      </Callout>
    </div>
  );
}

/* ========================================================================== */
/* Supporting components                                                       */
/* ========================================================================== */

function CapitalBlock({
  quality,
  label,
  amount,
  count,
  note,
}: {
  quality: "confirmed" | "verified" | "unverified";

  label: string;

  amount: number;

  count: number;

  note: string;
}) {
  return (
    <div className="border-t border-line pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5 first:sm:border-l-0 first:sm:pl-0">
      <CertaintyLabel quality={quality} />

      <p className="mt-1 text-xs font-medium text-ink-700">{label}</p>

      <p className="mt-1.5 tnum text-2xl font-semibold text-ink-900">
        {formatCents(amount)}
      </p>

      <p className="mt-1 text-xs text-ink-500">
        {formatCount(count)} {plural(count, "record")}. {note}
      </p>
    </div>
  );
}

function LaneRow({
  lane,
  count,
  total,
}: {
  lane: keyof typeof LEGAL_LANE;

  count: number;

  total: number;
}) {
  const descriptor = LEGAL_LANE[lane];

  const bar =
    descriptor.tone === "positive"
      ? "bg-accent-500"
      : descriptor.tone === "caution"
        ? "bg-caution-600"
        : "bg-counsel-600";

  const share = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <LegalLaneBadge lane={lane} />

          <p className="mt-1 text-xs text-ink-500">
            {descriptor.internalMeaning}
          </p>
        </div>

        <p className="tnum shrink-0 text-sm">
          <span className="font-semibold text-ink-900">
            {formatCount(count)}
          </span>

          <span className="ml-2 text-xs text-ink-500">{share}%</span>
        </p>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div
          className={`h-full rounded-full ${bar}`}
          style={{
            width: `${Math.max(share, count > 0 ? 4 : 0)}%`,
          }}
        />
      </div>
    </div>
  );
}

function WorkloadRow({
  label,
  value,
  tone,
  href,
}: {
  label: string;

  value: number;

  tone: "caution" | "info" | "positive";

  href: string;
}) {
  const bar = {
    caution: "bg-caution-600",

    info: "bg-info-600",

    positive: "bg-accent-500",
  }[tone];

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`h-6 w-0.5 shrink-0 rounded-full ${bar}`}
      />

      <dt className="min-w-0 flex-1">
        <Link
          href={href}
          className="rounded-xs text-sm text-ink-700 transition-colors hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          {label}
        </Link>
      </dt>

      <dd className="tnum shrink-0 text-base font-semibold text-ink-900">
        {formatCount(value)}
      </dd>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  caution = false,
}: {
  label: string;

  value: number;

  caution?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-ink-700">{label}</dt>

      <dd
        className={
          caution
            ? "tnum text-sm font-semibold text-critical-700"
            : "tnum text-sm font-semibold text-ink-900"
        }
      >
        {formatCount(value)}
      </dd>
    </div>
  );
}