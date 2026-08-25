import type { Metadata } from "next";

import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import { Badge, Tag } from "@/components/ui/badge";

import { FilterLinks } from "@/components/ui/tabs";

import { formatCount, formatDate } from "@/lib/format";

import { can } from "@/lib/session";

import { resolveStaffSession } from "@/server/staff-session";

import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

import {
  commercialApprovalAudit,
  type CommercialApprovalAuditEntry,
} from "@/server/commercial-approval-store";

import {
  claimantOnboardingAuditForStaff,
  type ClaimantOnboardingAuditEntry,
} from "@/server/claimant-onboarding-store";

import {
  claimFilingPackageAudit,
  type ClaimFilingPackageAuditEntry,
} from "@/server/claim-filing-package-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

export const metadata: Metadata = {
  title: "Audit",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type AuditCategory = "commercial" | "claimant" | "filing";

interface OperationalAuditEvent {
  id: string;

  category: AuditCategory;

  action: string;

  actionLabel: string;

  actorUserId: string;

  occurredAt: string;

  targetType: string;

  targetId: string;

  targetLabel: string;

  href?: string;

  detail?: string;
}

/* ========================================================================== */
/* Labels                                                                      */
/* ========================================================================== */

function commercialActionLabel(
  action: CommercialApprovalAuditEntry["action"],
): string {
  switch (action) {
    case "quote_saved":
      return "Commercial quote saved";

    case "staff_approved":
      return "Commercial quote staff approved";

    case "manager_review_requested":
      return "Manager review requested";

    case "manager_approved":
      return "Commercial quote manager approved";

    case "quote_rejected":
      return "Commercial quote rejected";

    case "quote_locked":
      return "Commercial quote locked";
  }
}

function claimantActionLabel(
  action: ClaimantOnboardingAuditEntry["action"],
): string {
  switch (action) {
    case "onboarding_started":
      return "Claimant onboarding started";

    case "contact_updated":
      return "Claimant contact updated";

    case "contact_verified":
      return "Claimant contact verified";

    case "contact_consent_recorded":
      return "Contact consent recorded";

    case "identity_status_changed":
      return "Identity status changed";

    case "disclosures_acknowledged":
      return "Disclosures acknowledged";

    case "service_agreement_signed":
      return "Service agreement signed";
  }
}

function filingActionLabel(
  action: ClaimFilingPackageAuditEntry["action"],
): string {
  switch (action) {
    case "filing_package_prepared":
      return "Filing package prepared";

    case "filing_package_submitted_for_review":
      return "Filing package submitted for review";

    case "filing_package_pre_filing_approved":
      return "Pre-filing review approved";

    case "filing_package_returned":
      return "Filing package returned";

    case "filing_package_superseded":
      return "Filing package superseded";
  }
}

function categoryLabel(category: AuditCategory): string {
  switch (category) {
    case "commercial":
      return "Commercial";

    case "claimant":
      return "Claimant";

    case "filing":
      return "Filing";
  }
}

function categoryTone(
  category: AuditCategory,
): "neutral" | "positive" | "caution" {
  switch (category) {
    case "commercial":
      return "neutral";

    case "claimant":
      return "positive";

    case "filing":
      return "caution";
  }
}

/* ========================================================================== */
/* Normalizers                                                                 */
/* ========================================================================== */

function commercialEvent(
  entry: CommercialApprovalAuditEntry,
): OperationalAuditEvent {
  const statusDetail = entry.previousStatus
    ? `${entry.previousStatus.replaceAll(
        "_",
        " ",
      )} → ${entry.nextStatus.replaceAll("_", " ")}`
    : `Status: ${entry.nextStatus.replaceAll("_", " ")}`;

  const detail = entry.reason
    ? `${statusDetail}. ${entry.reason}`
    : statusDetail;

  return {
    id: `commercial-${entry.id}`,

    category: "commercial",

    action: entry.action,

    actionLabel: commercialActionLabel(entry.action),

    actorUserId: entry.actorUserId,

    occurredAt: entry.occurredAt,

    targetType: "Commercial quote",

    targetId: entry.quoteId,

    targetLabel: entry.quoteId,

    href: `/pro/opportunities/${entry.opportunityId}`,

    detail,
  };
}

function claimantEvent(
  entry: ClaimantOnboardingAuditEntry,
): OperationalAuditEvent {
  return {
    id: `claimant-${entry.id}`,

    category: "claimant",

    action: entry.action,

    actionLabel: claimantActionLabel(entry.action),

    actorUserId: entry.actorUserId,

    occurredAt: entry.occurredAt,

    targetType: "Claimant onboarding",

    targetId: entry.claimantId,

    targetLabel: entry.claimantId,

    href: `/pro/claims/${entry.claimId}`,

    detail: entry.detail,
  };
}

function filingEvent(
  entry: ClaimFilingPackageAuditEntry,
): OperationalAuditEvent {
  return {
    id: `filing-${entry.id}`,

    category: "filing",

    action: entry.action,

    actionLabel: filingActionLabel(entry.action),

    actorUserId: entry.actorUserId,

    occurredAt: entry.occurredAt,

    targetType: "Filing package",

    targetId: entry.packageId,

    targetLabel: entry.packageId,

    href: `/pro/claims/${entry.claimId}`,

    detail: entry.detail,
  };
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProAuditPage({
  searchParams,
}: PageProps<"/pro/audit">) {
  const params = await searchParams;

  const filter =
    (Array.isArray(params.filter) ? params.filter[0] : params.filter) ?? "all";

  const session = await resolveStaffSession();

  if (!session) {
    return <StaffAuthenticationRequired />;
  }

  const canReadAudit = can(session, "audit.read");

  if (!canReadAudit) {
    return (
      <div className="space-y-5">
        <div>
          <p className="eyebrow text-ink-500">Governance</p>

          <h1 className="mt-1.5 text-2xl">Audit</h1>
        </div>

        <Callout tone="critical" title="Access not permitted" role="alert">
          <p>Your current role does not hold the audit.read permission.</p>
        </Callout>
      </div>
    );
  }

  /* ======================================================================== */
  /* Load persisted subsystem audit trails                                    */
  /* ======================================================================== */

  const [
    commercialAudit,
    onboardingAudit,
    allFilingAudit,
  ] = await Promise.all([
    commercialApprovalAudit(),

    claimantOnboardingAuditForStaff(
      session,
    ),

    claimFilingPackageAudit(),
  ]);

  /*
   * Filing audit entries are claimant-linked through their Claim.
   *
   * Reuse the central Claim resolver so ordinary staff never receive another
   * staff member's filing history. Super Admin still resolves every Claim.
   */
  const filingAudit = (
    await Promise.all(
      allFilingAudit.map(
        async (
          entry,
        ) =>
          (
            await resolveClaimRecord(
              entry.claimId,
            )
          )
            ? entry
            : undefined,
      ),
    )
  ).flatMap(
    (
      entry,
    ) =>
      entry
        ? [
            entry,
          ]
        : [],
  );

  const events: OperationalAuditEvent[] = [
    ...commercialAudit.map(commercialEvent),

    ...onboardingAudit.map(claimantEvent),

    ...filingAudit.map(filingEvent),
  ].sort((first, second) => second.occurredAt.localeCompare(first.occurredAt));

  /* ======================================================================== */
  /* Filters                                                                  */
  /* ======================================================================== */

  function apply(key: string): OperationalAuditEvent[] {
    switch (key) {
      case "commercial":
        return events.filter((event) => event.category === "commercial");

      case "claimant":
        return events.filter((event) => event.category === "claimant");

      case "filing":
        return events.filter((event) => event.category === "filing");

      case "all":
      default:
        return events;
    }
  }

  const visibleEvents = apply(filter);

  const filters = [
    {
      key: "all",

      label: "All",
    },

    {
      key: "commercial",

      label: "Commercial",
    },

    {
      key: "claimant",

      label: "Claimant",
    },

    {
      key: "filing",

      label: "Filing",
    },
  ].map((item) => ({
    href: `/pro/audit?filter=${item.key}`,

    label: item.label,

    count: apply(item.key).length,

    active: filter === item.key,
  }));

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-ink-500">Governance</p>

        <h1 className="mt-1.5 text-2xl">Audit</h1>

        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
          Persisted operational history from Duequity workflows that currently
          maintain their own audit records. Entries show the actor identifier,
          action, target and time without exposing claimant document content or
          other sensitive payloads.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Entries recorded"
          value={formatCount(events.length)}
          context="Across persisted audit-capable workflows"
        />

        <Stat
          label="Commercial"
          value={formatCount(commercialAudit.length)}
          context="Pricing calculation and approval history"
        />

        <Stat
          label="Claimant onboarding"
          value={formatCount(onboardingAudit.length)}
          context="Identity, consent, disclosure and agreement actions"
        />

        <Stat
          label="Filing packages"
          value={formatCount(filingAudit.length)}
          context="Preparation and independent review history"
        />
      </div>

      <Callout
        tone="neutral"
        title="Audit coverage is currently workflow-specific"
      >
        <p>
          This register contains only events that the current persisted stores
          actually record. It does not invent login history, denied access
          attempts, IP addresses, document-view events, recovery transactions,
          or other security telemetry that Duequity does not yet persist.
        </p>
      </Callout>

      <FilterLinks filters={filters} label="Filter audit entries" />

      <Card className="overflow-hidden">
        <CardHeader
          title="Audit entries"
          description={`${formatCount(visibleEvents.length)} recorded ${
            visibleEvents.length === 1 ? "event" : "events"
          }, most recent first.`}
        />

        <CardBody flush>
          {visibleEvents.length === 0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="No audit entries"
              description="No persisted events match this filter."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {visibleEvents.map((event) => (
                <li key={event.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={categoryTone(event.category)}>
                          {categoryLabel(event.category)}
                        </Badge>

                        <Tag>{event.targetType}</Tag>
                      </div>

                      <p className="mt-2 text-sm font-semibold text-ink-900">
                        {event.actionLabel}
                      </p>

                      <p className="mt-1 text-xs text-ink-500">
                        Actor{" "}
                        <span className="font-mono text-ink-700">
                          {event.actorUserId}
                        </span>
                      </p>

                      {event.detail && (
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                          {event.detail}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                        <span>Target:</span>

                        {event.href ? (
                          <Link
                            href={event.href}
                            className="break-all font-mono text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                          >
                            {event.targetLabel}
                          </Link>
                        ) : (
                          <span className="break-all font-mono">
                            {event.targetLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="tnum text-xs text-ink-700">
                        {formatDate(event.occurredAt.slice(0, 10))}
                      </p>

                      <p className="tnum mt-0.5 text-2xs text-ink-500">
                        {event.occurredAt.slice(11, 19)} UTC
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Callout tone="neutral" title="Production audit requirement">
        <div className="space-y-2">
          <p>
            Before deployment, authentication, authorization failures, document
            access events and security-sensitive operations will need a durable
            production audit boundary rather than local JSON files.
          </p>

          <p>
            Sensitive contents should remain outside that audit stream. The
            audit record should identify the action and affected record, not
            duplicate identity documents, government identifiers, banking data,
            passwords, or authentication secrets.
          </p>
        </div>
      </Callout>
    </div>
  );
}