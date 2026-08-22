import type { Metadata } from "next";

import Link from "next/link";

import { jurisdictionLabel } from "@/domain/compliance";

import { resolveLegalPosition } from "@/domain/legal-position";

import { LEGAL_FEE_BASIS_LABEL } from "@/domain/legal";

import { MATTER_KIND_LABEL } from "@/domain/status";

import type { IsoDate } from "@/domain/types";

import {
  FeeSeparationNote,
  LegalHandoffBadge,
  LegalLaneBadge,
} from "@/components/ui/legal-lane";

import { Amount } from "@/components/ui/money";

import {
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DataItem,
  DataList,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import { Badge, Identifier, Tag } from "@/components/ui/badge";

import { formatCents, formatCount, formatDate, plural } from "@/lib/format";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { getPropertyById } from "@/server/opportunity-store";

import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Attorneys",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function assignmentStatusLabel(
  status:
    | "referred"
    | "conflict_check"
    | "engaged"
    | "declined"
    | "completed"
    | "withdrawn",
): string {
  switch (status) {
    case "referred":
      return "Referred";

    case "conflict_check":
      return "Conflict check";

    case "engaged":
      return "Engaged";

    case "declined":
      return "Declined";

    case "completed":
      return "Completed";

    case "withdrawn":
      return "Withdrawn";
  }
}

function assignmentStatusTone(
  status:
    | "referred"
    | "conflict_check"
    | "engaged"
    | "declined"
    | "completed"
    | "withdrawn",
): "neutral" | "positive" | "caution" | "critical" | "counsel" {
  switch (status) {
    case "engaged":
      return "counsel";

    case "completed":
      return "positive";

    case "referred":
    case "conflict_check":
      return "caution";

    case "declined":
      return "critical";

    case "withdrawn":
      return "neutral";
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProAttorneysPage() {
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

  const [conversions, jurisdictionPackages] = await Promise.all([
    listOpportunityConversions(),
    listJurisdictionRulePackages(),
  ]);

  /* ======================================================================== */
  /* Approved jurisdiction rules                                              */
  /* ======================================================================== */

  const approvedJurisdictionById = new Map<
    string,
    NonNullable<(typeof jurisdictionPackages)[number]["rule"]>
  >();

  for (const rulePackage of jurisdictionPackages) {
    if (rulePackage.status !== "approved" || !rulePackage.rule) {
      continue;
    }

    approvedJurisdictionById.set(rulePackage.rule.id, rulePackage.rule);
  }

  const attorneyRequiredJurisdictions = [
    ...approvedJurisdictionById.values(),
  ].filter(
    (jurisdiction) =>
      jurisdiction.attorneyRequired ||
      jurisdiction.complianceStatus === "attorney_only",
  );

  /* ======================================================================== */
  /* Persisted claims                                                         */
  /* ======================================================================== */

  const claimRows = (
    await Promise.all(
      conversions.map(async (conversion) => {
        const resolved = await resolveClaimRecord(conversion.claimId);

        if (!resolved) {
          return undefined;
        }

        const claim = resolved.claim;

        const [property, onboarding] = await Promise.all([
          getPropertyById(claim.propertyId),

          getClaimantOnboarding(claim.id),
        ]);

        const jurisdiction = approvedJurisdictionById.get(claim.jurisdictionId);

        const position = jurisdiction
          ? resolveLegalPosition(claim, jurisdiction, today)
          : undefined;

        return {
          claim,
          property,
          onboarding,
          jurisdiction,
          position,
        };
      }),
    )
  ).flatMap((row) => (row ? [row] : []));

  /* ======================================================================== */
  /* Attorney assignment state                                                */
  /* ======================================================================== */

  const assignments = claimRows.filter((row) =>
    Boolean(row.claim.attorneyAssignment),
  );

  const engagedAssignments = assignments.filter(
    (row) => row.claim.attorneyAssignment?.status === "engaged",
  );

  const activeAssignments = assignments.filter((row) => {
    const status = row.claim.attorneyAssignment?.status;

    return (
      status === "referred" ||
      status === "conflict_check" ||
      status === "engaged"
    );
  });

  /*
   * A referral need is derived from the legal-position engine, not from a
   * separate attorney-network queue.
   */
  const awaitingReferral = claimRows.filter(
    (row) =>
      row.claim.status !== "closed" &&
      row.claim.status !== "withdrawn" &&
      !row.claim.attorneyAssignment &&
      row.position?.awaitingReferral === true,
  );

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div>
        <p className="eyebrow text-ink-500">Governance</p>

        <h1 className="mt-1.5 text-2xl">Attorney coordination</h1>

        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
          Independent-counsel referrals and active legal handoffs attached to
          persisted claims. Duequity coordinates the administrative recovery
          workflow but does not operate a law practice.
        </p>
      </div>

      {/* ======================================================== relationship */}
      <Callout tone="counsel" title="Independent counsel remains separate">
        <div className="space-y-2">
          <p>
            <span className="font-semibold text-ink-900">
              Duequity does not share attorney fees.
            </span>{" "}
            The claimant engages counsel separately, and any legal fee belongs
            to that claimant-attorney relationship.
          </p>

          <p>
            Duequity may continue research, document collection, administrative
            coordination, and permitted agency communication while counsel
            performs the legal work.
          </p>
        </div>
      </Callout>

      {/* ================================================================= stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Active handoffs"
          value={formatCount(activeAssignments.length)}
          context="Referred, conflict check, or engaged"
        />

        <Stat
          label="Engaged counsel"
          value={formatCount(engagedAssignments.length)}
          tone={engagedAssignments.length > 0 ? "positive" : "default"}
          context="Separate claimant engagement recorded"
        />

        <Stat
          label="Awaiting referral"
          value={formatCount(awaitingReferral.length)}
          tone={awaitingReferral.length > 0 ? "critical" : "positive"}
          context="Attorney-required claims without an assignment"
        />

        <Stat
          label="Counsel-required jurisdictions"
          value={formatCount(attorneyRequiredJurisdictions.length)}
          tone={
            attorneyRequiredJurisdictions.length > 0 ? "caution" : "default"
          }
          context="Approved rules that require attorney handling"
        />
      </div>

      {/* ================================================= awaiting referral */}
      <Card>
        <CardHeader
          title="Awaiting referral"
          description="Claims classified as requiring independent counsel with no attorney assignment currently recorded."
          actions={
            awaitingReferral.length > 0 ? (
              <Badge tone="critical" size="md">
                {formatCount(awaitingReferral.length)} outstanding
              </Badge>
            ) : undefined
          }
        />

        <CardBody flush>
          {awaitingReferral.length === 0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="No referrals waiting"
              description="No persisted claim currently requires counsel without an attorney assignment."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {awaitingReferral.map(
                ({ claim, property, onboarding, jurisdiction, position }) => {
                  if (!position) {
                    return null;
                  }

                  return (
                    <li
                      key={claim.id}
                      className="px-4 py-3.5 shadow-[inset_2px_0_0_0_var(--color-critical-600)] sm:px-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/pro/claims/${claim.id}#legal`}
                              className="font-mono text-xs text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                            >
                              {claim.reference}
                            </Link>

                            <LegalLaneBadge lane={position.lane} />

                            {jurisdiction && (
                              <Tag>{jurisdictionLabel(jurisdiction)}</Tag>
                            )}
                          </div>

                          <p className="mt-1.5 text-sm font-medium text-ink-900">
                            {property?.address.line1 ?? "Property not recorded"}
                          </p>

                          {onboarding?.claimant.legalName && (
                            <p className="mt-0.5 text-xs text-ink-500">
                              {onboarding.claimant.legalName}
                            </p>
                          )}

                          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                            {position.rationale}
                          </p>

                          {position.nextAction && (
                            <p className="mt-1.5 text-xs leading-relaxed text-critical-700">
                              {position.nextAction.action}
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
                    </li>
                  );
                },
              )}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ==================================================== assignments */}
      <Card>
        <CardHeader
          title="Attorney assignments"
          description="Persisted independent-counsel handoffs attached to recovery claims."
          actions={
            <Badge tone="neutral" size="md">
              {formatCount(assignments.length)}{" "}
              {plural(assignments.length, "assignment")}
            </Badge>
          }
        />

        <CardBody flush>
          {assignments.length === 0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="No attorney assignments"
              description="Independent-counsel handoffs will appear here when they are recorded on a claim."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {assignments.map(({ claim, property, onboarding, position }) => {
                const assignment = claim.attorneyAssignment;

                if (!assignment) {
                  return null;
                }

                const firmName =
                  assignment.independentLegalFee?.billedByFirmName;

                return (
                  <li key={assignment.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/pro/claims/${claim.id}#legal`}
                            className="font-mono text-xs text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                          >
                            {claim.reference}
                          </Link>

                          {position && (
                            <LegalHandoffBadge
                              status={position.handoffStatus}
                            />
                          )}

                          <Tag>{MATTER_KIND_LABEL[assignment.matterKind]}</Tag>

                          <Badge tone={assignmentStatusTone(assignment.status)}>
                            {assignmentStatusLabel(assignment.status)}
                          </Badge>
                        </div>

                        <p className="mt-2 text-base font-medium text-ink-900">
                          {firmName ?? "Independent counsel"}
                        </p>

                        <p className="mt-0.5 text-xs text-ink-500">
                          Attorney record{" "}
                          <span className="font-mono">
                            {assignment.attorneyId}
                          </span>
                        </p>

                        <p className="mt-1 text-xs text-ink-500">
                          {property?.address.line1 ?? "Property not recorded"}

                          {onboarding?.claimant.legalName && (
                            <>
                              {" / "}
                              {onboarding.claimant.legalName}
                            </>
                          )}
                        </p>

                        <p className="mt-2 text-sm leading-relaxed text-ink-600">
                          {assignment.escalationReason}
                        </p>

                        {assignment.note && (
                          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                            {assignment.note}
                          </p>
                        )}

                        {position?.legalDeadline && (
                          <p className="mt-2 text-xs text-caution-700">
                            Legal target date:{" "}
                            {formatDate(position.legalDeadline)}
                          </p>
                        )}
                      </div>

                      <div className="w-full shrink-0 sm:w-72">
                        <DataList>
                          <DataItem label="Attorney ID">
                            <Identifier>{assignment.attorneyId}</Identifier>
                          </DataItem>

                          <DataItem label="Referred">
                            {formatDate(assignment.referredAt)}
                          </DataItem>

                          <DataItem label="Engagement">
                            {assignment.engagementSignedAt
                              ? formatDate(assignment.engagementSignedAt)
                              : "Not recorded"}
                          </DataItem>

                          <DataItem label="Conflict check">
                            {assignment.conflictCheckedAt
                              ? formatDate(assignment.conflictCheckedAt)
                              : "Not recorded"}
                          </DataItem>

                          <DataItem label="Separate engagement disclosed">
                            {assignment.separateEngagementDisclosedAt
                              ? formatDate(
                                  assignment.separateEngagementDisclosedAt,
                                )
                              : "Not recorded"}
                          </DataItem>

                          <DataItem label="Handoff documents">
                            {formatCount(
                              assignment.handoffDocumentIds?.length ?? 0,
                            )}
                          </DataItem>
                        </DataList>

                        <div className="mt-3 rounded-md border border-counsel-200 bg-counsel-50 px-3.5 py-3">
                          <p className="eyebrow text-counsel-700">
                            Independent legal fee
                          </p>

                          {assignment.independentLegalFee?.amount ? (
                            <div className="mt-1.5">
                              <Amount
                                cents={assignment.independentLegalFee.amount}
                                size="md"
                              />
                            </div>
                          ) : (
                            <p className="mt-1.5 text-sm text-ink-600">
                              {assignment.independentLegalFee?.basis
                                ? LEGAL_FEE_BASIS_LABEL[
                                    assignment.independentLegalFee.basis
                                  ]
                                : "No fee amount recorded"}
                            </p>
                          )}

                          {assignment.independentLegalFee?.billedByFirmName && (
                            <p className="mt-1 text-xs text-ink-600">
                              Billed by{" "}
                              {assignment.independentLegalFee.billedByFirmName}
                            </p>
                          )}

                          <p className="mt-1.5">
                            <Badge tone="positive">No fee sharing</Badge>
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>

        <CardFooter>
          <FeeSeparationNote />
        </CardFooter>
      </Card>

      {/* ============================================= counsel jurisdictions */}
      <Card>
        <CardHeader
          title="Jurisdictions requiring counsel"
          description="Approved jurisdiction rules where legal handling cannot remain entirely inside Duequity's administrative workflow."
        />

        <CardBody flush>
          {attorneyRequiredJurisdictions.length === 0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="No approved attorney-only jurisdictions"
              description="No currently approved jurisdiction rule requires attorney handling."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {attorneyRequiredJurisdictions.map((jurisdiction) => (
                <li
                  key={jurisdiction.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/pro/jurisdictions/${jurisdiction.id}`}
                      className="text-sm font-medium text-ink-900 hover:text-accent-700"
                    >
                      {jurisdictionLabel(jurisdiction)}
                    </Link>

                    <p className="mt-0.5 text-xs text-ink-500">
                      {jurisdiction.agencyName}
                    </p>
                  </div>

                  <Badge tone="counsel">Attorney handling required</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ============================================================ boundary */}
      <Callout tone="neutral" title="No attorney directory is persisted yet">
        <p>
          Duequity currently persists attorney assignments on claims, but it
          does not yet maintain a production attorney-directory repository
          containing lawyer names, bar numbers, licenses, availability, counties
          served, disciplinary checks, insurance verification, phone numbers, or
          performance metrics. This page therefore does not invent those
          records.
        </p>
      </Callout>
    </div>
  );
}