import type { Metadata } from "next";

import { assessDeadline } from "@/domain/compliance";
import { CLAIM_STATUS } from "@/domain/status";
import type { Claim, IsoDate } from "@/domain/types";
import {
  resolveLegalPosition,
  laneDistribution,
} from "@/domain/legal-position";
import { LEGAL_LANE } from "@/domain/legal";

import { Card, EmptyState } from "@/components/ui/surface";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { FilterLinks } from "@/components/ui/tabs";
import {
  RecordList,
  RecordListItem,
  Table,
  TableFooter,
  TableRegion,
  TableToolbar,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { MoneyInline } from "@/components/ui/money";
import { LegalLaneBadge } from "@/components/ui/legal-lane";
import { formatCents, formatCount, formatDate } from "@/lib/format";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";
import { resolveClaimRecord } from "@/server/claim-record";
import {
  getPropertyById,
  listOpportunities,
} from "@/server/opportunity-store";
import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Claims",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function claimStageLabel(stageKey: string): string {
  return stageKey
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function claimMatchesFilter(claim: Claim, status: string): boolean {
  switch (status) {
    case "all":
      return true;

    case "open":
      return claim.status !== "paid";

    case "attention":
      return (
        claim.status === "action_required" ||
        claim.participants.length === 0 ||
        claim.flags.some(
          (flag) => !flag.resolvedAt && flag.severity === "blocking",
        ) ||
        !claim.feeAgreement?.signedAt
      );

    case "documentation":
      return claim.status === "documentation";

    case "ready_to_file":
      return (
        claim.status === "ready_to_file" &&
        claim.participants.length > 0 &&
        Boolean(claim.feeAgreement?.signedAt)
      );

    case "under_review":
      return claim.status === "under_review";

    case "attorney":
      return Boolean(claim.attorneyAssignment);

    case "paid":
      return claim.status === "paid";

    default:
      return claim.status === status;
  }
}

/* ========================================================================== */
/* Production claims                                                           */
/* ========================================================================== */

async function loadClaims(): Promise<Claim[]> {
  /*
   * listOpportunities() is the canonical operational-list boundary.
   *
   * Conversion history is broader because direct-access QA/training records
   * retain their durable conversion provenance. Such records may still be
   * opened through an explicitly permitted direct URL, but they must never
   * appear in production pipeline lists, counts or totals.
   */
  const [opportunities, conversions] = await Promise.all([
    listOpportunities(),
    listOpportunityConversions(),
  ]);

  const operationalOpportunityIds = new Set(
    opportunities.map((opportunity) => opportunity.id),
  );

  const operationalConversions = conversions.filter((conversion) =>
    operationalOpportunityIds.has(conversion.opportunityId),
  );

  const resolved = await Promise.all(
    operationalConversions.map((conversion) =>
      resolveClaimRecord(conversion.claimId),
    ),
  );

  return resolved
    .flatMap((record) => (record ? [record.claim] : []))
    .sort((left, right) =>
      right.lastActivityAt.localeCompare(left.lastActivityAt),
    );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProClaimsPage({
  searchParams,
}: PageProps<"/pro/claims">) {
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

  const params = await searchParams;

  const status =
    (Array.isArray(params.status) ? params.status[0] : params.status) ?? "open";

  const today = currentIsoDate();

  const [allClaims, jurisdictionPackages] = await Promise.all([
    loadClaims(),
    listJurisdictionRulePackages(),
  ]);

  const jurisdictionById = new Map(
    jurisdictionPackages
      .filter(
        (rulePackage) =>
          rulePackage.status === "approved" && Boolean(rulePackage.rule),
      )
      .map((rulePackage) => [rulePackage.rule!.id, rulePackage.rule!]),
  );

  const properties = await Promise.all(
    allClaims.map((claim) => getPropertyById(claim.propertyId)),
  );

  const propertyById = new Map(
    properties.flatMap((property) =>
      property ? [[property.id, property] as const] : [],
    ),
  );

  function claimsForFilter(filterStatus: string): Claim[] {
    return allClaims.filter((claim) => claimMatchesFilter(claim, filterStatus));
  }

  const claims = claimsForFilter(status);

  const filters = [
    {
      key: "open",
      label: "Open",
    },
    {
      key: "all",
      label: "All",
    },
    {
      key: "attention",
      label: "Needs attention",
    },
    {
      key: "documentation",
      label: "Awaiting documents",
    },
    {
      key: "ready_to_file",
      label: "Ready to file",
    },
    {
      key: "under_review",
      label: "Agency review",
    },
    {
      key: "attorney",
      label: "Attorney involved",
    },
    {
      key: "paid",
      label: "Paid",
    },
  ].map((filter) => ({
    href: `/pro/claims?status=${filter.key}`,

    label: filter.label,

    count: claimsForFilter(filter.key).length,

    active: status === filter.key,
  }));

  const totalValue = claims.reduce(
    (sum, claim) =>
      sum + (claim.confirmedRecovery?.amount ?? claim.estimatedRecovery.amount),
    0,
  );

  const positions = new Map<string, ReturnType<typeof resolveLegalPosition>>();

  for (const claim of claims) {
    const jurisdiction = jurisdictionById.get(claim.jurisdictionId);

    if (!jurisdiction) {
      continue;
    }

    positions.set(claim.id, resolveLegalPosition(claim, jurisdiction, today));
  }

  const lanes = laneDistribution([...positions.values()]);

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Pipeline</p>

          <h1 className="mt-1.5 text-2xl">Claims</h1>

          <p className="mt-1 text-sm text-ink-600">
            Active recovery claims created through DueQuity&apos;s approved
            opportunity conversion workflow. Filing readiness, legal handling
            and commercial terms remain governed by persisted records and
            approved jurisdiction rules.
          </p>
        </div>
      </div>

      <FilterLinks filters={filters} label="Filter claims" />

      {/* =========================================================== legal lanes */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-line bg-paper px-4 py-2.5">
        <p className="eyebrow text-ink-500">Legal lanes</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <LaneCount lane="administrative" count={lanes.administrative} />

          <LaneCount lane="legal_review" count={lanes.legalReview} />

          <LaneCount lane="attorney_required" count={lanes.attorneyRequired} />
        </div>

        {(lanes.awaitingReferral > 0 || lanes.blockedByConflict > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-l border-line pl-4">
            {lanes.awaitingReferral > 0 && (
              <span className="text-xs font-medium text-critical-700">
                {formatCount(lanes.awaitingReferral)} awaiting referral
              </span>
            )}

            {lanes.blockedByConflict > 0 && (
              <span className="text-xs font-medium text-critical-700">
                {formatCount(lanes.blockedByConflict)} with blocking conflict
              </span>
            )}
          </div>
        )}
      </div>

      {/* ================================================================ queue */}
      <Card className="overflow-hidden">
        <TableToolbar
          count={claims.length}
          noun={{
            one: "claim",
            many: "claims",
          }}
        >
          <p className="tnum text-sm text-ink-600">
            <span className="text-xs text-ink-500">Value at stake </span>

            <span className="font-semibold text-ink-900">
              {formatCents(totalValue)}
            </span>
          </p>
        </TableToolbar>

        {claims.length === 0 ? (
          <EmptyState
            className="m-4 border-0 bg-transparent"
            title={
              allClaims.length === 0
                ? "No production claims yet"
                : "No claims match this filter"
            }
            description={
              allClaims.length === 0
                ? "Claims will appear here after an opportunity passes compliance, receives approved commercial pricing and is converted."
                : "Adjust the filter above to see other claims."
            }
          />
        ) : (
          <>
            {/* ========================================================= desktop */}
            <div className="hidden lg:block">
              <TableRegion label="Active claims">
                <Table caption="Active production claims with status, legal lane, readiness, value and deadline">
                  <THead>
                    <TH>Claim</TH>

                    <TH width="12%">Claimant</TH>

                    <TH width="12%">Status</TH>

                    <TH width="13%">Legal lane</TH>

                    <TH width="13%">Stage</TH>

                    <TH width="11%">Ready to file</TH>

                    <TH width="10%" align="right">
                      Value
                    </TH>

                    <TH width="10%">Deadline</TH>

                    <TH width="9%">Assignment</TH>
                  </THead>

                  <TBody>
                    {claims.map((claim) => {
                      const property = propertyById.get(claim.propertyId);

                      const deadline = assessDeadline(
                        claim.filingDeadline,
                        today,
                      );

                      const legal = positions.get(claim.id);

                      const blocking = claim.flags.filter(
                        (flag) =>
                          flag.severity === "blocking" && !flag.resolvedAt,
                      );

                      const claimantLinked = claim.participants.length > 0;

                      const readyToFile =
                        claim.status === "ready_to_file" &&
                        claimantLinked &&
                        Boolean(claim.feeAgreement?.signedAt);

                      const value =
                        claim.confirmedRecovery ?? claim.estimatedRecovery;

                      const critical =
                        deadline.risk === "expired" ||
                        deadline.risk === "critical" ||
                        !legal ||
                        Boolean(legal?.awaitingReferral) ||
                        (legal?.blockingConflicts.length ?? 0) > 0;

                      const caution =
                        claim.status === "action_required" ||
                        blocking.length > 0 ||
                        legal?.lane === "legal_review" ||
                        !claimantLinked;

                      return (
                        <TR
                          key={claim.id}
                          tone={
                            critical
                              ? "critical"
                              : caution
                                ? "caution"
                                : undefined
                          }
                        >
                          <TDPrimary
                            href={`/pro/claims/${claim.id}`}
                            secondary={
                              property
                                ? `${property.address.line1}, ${property.address.city}, ${property.address.state}`
                                : "Property record unavailable"
                            }
                          >
                            <span className="font-mono text-xs">
                              {claim.reference}
                            </span>
                          </TDPrimary>

                          <TD nowrap>
                            {claimantLinked ? (
                              <span className="text-xs text-ink-700">
                                {claim.participants.length === 1
                                  ? "Linked"
                                  : `${claim.participants.length} participants`}
                              </span>
                            ) : (
                              <Badge tone="caution">Not linked</Badge>
                            )}
                          </TD>

                          <TD>
                            <StatusBadge status={CLAIM_STATUS[claim.status]} />
                          </TD>

                          <TD>
                            {legal ? (
                              <>
                                <LegalLaneBadge lane={legal.lane} />

                                {legal.awaitingReferral && (
                                  <span className="mt-1 block">
                                    <Badge tone="critical">
                                      Referral needed
                                    </Badge>
                                  </span>
                                )}

                                {legal.attorneyEngaged && (
                                  <span className="mt-1 block text-2xs text-counsel-700">
                                    Counsel engaged
                                  </span>
                                )}

                                {legal.blockingConflicts.length > 0 && (
                                  <span className="mt-1 block">
                                    <Badge
                                      tone="critical"
                                      title={legal.blockingConflicts[0].summary}
                                    >
                                      Conflict
                                    </Badge>
                                  </span>
                                )}
                              </>
                            ) : (
                              <Badge tone="critical">Not classified</Badge>
                            )}
                          </TD>

                          <TD>
                            <span className="text-xs text-ink-600">
                              {claimStageLabel(claim.stageKey)}
                            </span>
                          </TD>

                          <TD>
                            {readyToFile ? (
                              <Badge tone="positive">Ready</Badge>
                            ) : (
                              <Badge tone="caution">Outstanding</Badge>
                            )}
                          </TD>

                          <TD align="right">
                            <MoneyInline fact={value} whole />
                          </TD>

                          <TD nowrap>
                            {claim.filingDeadline ? (
                              <>
                                <span className="tnum text-xs text-ink-700">
                                  {formatDate(claim.filingDeadline)}
                                </span>

                                <span
                                  className={
                                    deadline.risk === "expired" ||
                                    deadline.risk === "critical"
                                      ? "mt-0.5 block text-2xs font-medium text-critical-700"
                                      : deadline.risk === "elevated"
                                        ? "mt-0.5 block text-2xs text-caution-700"
                                        : "mt-0.5 block text-2xs text-ink-400"
                                  }
                                >
                                  {deadline.label}
                                </span>
                              </>
                            ) : (
                              <Badge tone="caution">Not recorded</Badge>
                            )}
                          </TD>

                          <TD nowrap>
                            <span className="text-xs text-ink-600">
                              {claim.assignedSpecialistId
                                ? "Assigned"
                                : "Unassigned"}
                            </span>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableRegion>

              <TableFooter
                shown={claims.length}
                total={allClaims.length}
                noun="claims"
              />
            </div>

            {/* ========================================================== mobile */}
            <div className="lg:hidden">
              <RecordList>
                {claims.map((claim) => {
                  const property = propertyById.get(claim.propertyId);

                  const deadline = assessDeadline(claim.filingDeadline, today);

                  const legal = positions.get(claim.id);

                  const claimantLinked = claim.participants.length > 0;

                  const readyToFile =
                    claim.status === "ready_to_file" &&
                    claimantLinked &&
                    Boolean(claim.feeAgreement?.signedAt);

                  const value =
                    claim.confirmedRecovery ?? claim.estimatedRecovery;

                  const blocking = claim.flags.some(
                    (flag) => flag.severity === "blocking" && !flag.resolvedAt,
                  );

                  const critical =
                    deadline.risk === "expired" ||
                    deadline.risk === "critical" ||
                    !legal ||
                    Boolean(legal?.awaitingReferral);

                  const caution =
                    claim.status === "action_required" ||
                    blocking ||
                    legal?.lane === "legal_review" ||
                    !claimantLinked;

                  return (
                    <RecordListItem
                      key={claim.id}
                      href={`/pro/claims/${claim.id}`}
                      title={claim.reference}
                      subtitle={
                        property
                          ? `${property.address.line1}, ${property.address.city}, ${property.address.state}`
                          : "Property record unavailable"
                      }
                      status={
                        <StatusBadge status={CLAIM_STATUS[claim.status]} />
                      }
                      tone={
                        critical ? "critical" : caution ? "caution" : undefined
                      }
                      facts={[
                        {
                          label: "Legal lane",

                          value: legal ? (
                            <span className="inline-flex">
                              <LegalLaneBadge lane={legal.lane} />
                            </span>
                          ) : (
                            "Not classified"
                          ),
                        },
                        {
                          label:
                            value.quality === "confirmed"
                              ? "Confirmed"
                              : "Estimated",

                          value: formatCents(value.amount),
                        },
                        {
                          label: "Ready to file",

                          value:
                            legal?.lane === "attorney_required" &&
                            !legal.attorneyEngaged
                              ? "Attorney must file"
                              : readyToFile
                                ? "Yes"
                                : !claimantLinked
                                  ? "Claimant onboarding"
                                  : "No",
                        },
                        {
                          label: "Deadline",

                          value: deadline.label,
                        },
                      ]}
                    />
                  );
                })}
              </RecordList>
            </div>
          </>
        )}
      </Card>

      <p className="text-xs leading-relaxed text-ink-500">
        DueQuity handles administrative recovery where legally permitted. Claims
        requiring legal representation, legal interpretation or court
        proceedings are escalated to independent licensed counsel. DueQuity
        remains operationally attached for research, documents and coordination
        and does not share in attorney fees.
      </p>
    </div>
  );
}

/* ========================================================================== */
/* Lane count                                                                  */
/* ========================================================================== */

function LaneCount({
  lane,
  count,
}: {
  lane: keyof typeof LEGAL_LANE;

  count: number;
}) {
  const descriptor = LEGAL_LANE[lane];

  const dot =
    descriptor.tone === "positive"
      ? "bg-accent-500"
      : descriptor.tone === "caution"
        ? "bg-caution-600"
        : "bg-counsel-600";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-ink-600"
      title={descriptor.internalMeaning}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${dot}`}
      />

      <span className="tnum font-semibold text-ink-900">
        {formatCount(count)}
      </span>

      {descriptor.label}
    </span>
  );
}