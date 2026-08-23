import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/ui/tabs";

import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  DataItem,
  DataList,
  NotRecorded,
} from "@/components/ui/surface";

import { TextLink } from "@/components/ui/button";

import { ClaimantLocatorControls } from "@/components/pro/claimant-locator-controls";

import { DiscoveredRecordPromotionControl } from "@/components/pro/discovered-record-promotion-control";

import { DiscoveredRecordReviewControls } from "@/components/pro/discovered-record-review-controls";

import { formatDate, formatPhone } from "@/lib/format";

import { can, clearedForState } from "@/lib/session";

import { resolveStaffSession } from "@/server/staff-session";

import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

import { getDiscoveredRecordById } from "@/server/discovered-record-store";

import {
  evaluateDiscoveredRecordEnrichmentReadiness,
  getDiscoveredRecordEnrichment,
} from "@/server/discovered-record-enrichment-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",

  currency: "USD",

  minimumFractionDigits: 2,

  maximumFractionDigits: 2,
});

function normalizeCounty(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bcounty\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBalance(cents: number | undefined): string | undefined {
  if (cents === undefined) {
    return undefined;
  }

  return USD.format(cents / 100);
}

function phoneHref(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `tel:+1${digits}`;
  }

  return `tel:${digits}`;
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function webSearchHref(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function DiscoveredRecordDetailPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const session = await resolveStaffSession();

  if (!session) {
    return <StaffAuthenticationRequired />;
  }

  const { id } = await params;

  const [record, rulePackages, enrichment] = await Promise.all([
    getDiscoveredRecordById(id),

    listJurisdictionRulePackages(),

    getDiscoveredRecordEnrichment(id),
  ]);

  if (!record) {
    notFound();
  }

  const isPromoted =
    record.status === "promoted" ||
    Boolean(record.promotedOpportunityId);

  const canLocate =
    can(session, "opportunity.write") &&
    clearedForState(session, record.state);

  const canReview =
    canLocate &&
    !isPromoted;

  const approvedJurisdiction = rulePackages.find(
    (rulePackage) =>
      rulePackage.status === "approved" &&
      Boolean(rulePackage.rule) &&
      rulePackage.rule?.state === record.state &&
      normalizeCounty(rulePackage.rule?.county ?? "") ===
        normalizeCounty(record.county),
  )?.rule;

  const balance = formatBalance(record.sourceListedBalanceCents);

  const enrichmentReadiness = evaluateDiscoveredRecordEnrichmentReadiness(
    enrichment,
    {
      hasSourceListedBalance: record.sourceListedBalanceCents !== undefined,
    },
  );

  const workflowReady =
    !isPromoted &&
    record.status === "reviewed" &&
    Boolean(approvedJurisdiction) &&
    enrichmentReadiness.ready;

  const promotionBlockers = isPromoted
    ? []
    : [
        record.status !== "reviewed"
          ? "The discovered record must complete operational review."
          : undefined,

        !approvedJurisdiction
          ? "No approved Duequity jurisdiction rule is available for this county."
          : undefined,

        ...enrichmentReadiness.missing,
      ].filter((value): value is string => Boolean(value));

  const ownerLocationResearchUrl =
    webSearchHref(
      [
        `"${record.formerOwnerName}"`,
        `"${record.county}"`,
        record.state,
        "address phone email",
      ].join(" "),
    );

  const ownerPropertyResearchUrl =
    webSearchHref(
      [
        `"${record.formerOwnerName}"`,
        `"${record.addressLine1}"`,
        record.city,
        record.state,
      ].join(" "),
    );

  const identifierResearchTerms = [
    record.caseNumber
      ? `"${record.caseNumber}"`
      : undefined,

    record.propertyId
      ? `"${record.propertyId}"`
      : undefined,

    record.parcelNumber
      ? `"${record.parcelNumber}"`
      : undefined,

    `"${record.formerOwnerName}"`,

    record.county,

    record.state,
  ].filter((value): value is string => Boolean(value));

  const identifierResearchUrl =
    webSearchHref(
      identifierResearchTerms.join(" "),
    );

  return (
    <div className="space-y-5">
      {/* ============================================================ breadcrumb */}
      <Breadcrumbs
        trail={[
          {
            href: "/pro/discovered-records",

            label: "Discovered Records",
          },

          {
            label: record.formerOwnerName,
          },
        ]}
      />

      {/* ================================================================ header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Discovered record</p>

          <h1 className="mt-1.5 text-2xl">{record.formerOwnerName}</h1>

          <p className="mt-1 text-sm text-ink-600">
            {record.addressLine1}, {record.city}, {record.state}{" "}
            {record.postalCode}
          </p>
        </div>

        <span className="rounded-full border border-accent-200 bg-accent-50 px-2.5 py-1 text-xs font-semibold capitalize text-accent-800">
          {record.status}
        </span>
      </div>

      {/* ========================================================== operational gate */}
      {isPromoted ? (
        <Callout tone="positive" title="Promoted to operational workflow">
          <p>
            This discovery record has already been promoted to an Opportunity.
            Discovery review and promotion are now closed for this record.
            Claimant-location research may continue without creating a claimant
            or authorizing outreach automatically.
          </p>
        </Callout>
      ) : workflowReady ? (
        <Callout tone="positive" title="Enrichment requirements complete">
          <p>
            The discovery record has completed review, verified enrichment is
            complete, and an approved jurisdiction rule is available. This means
            the record has satisfied the current promotion prerequisites. It has
            not been promoted automatically.
          </p>
        </Callout>
      ) : (
        <Callout tone="caution" title="Not ready for operational promotion">
          <p>
            This record remains in the discovery layer. Duequity will not create
            an Opportunity until the required review, verified enrichment, and
            jurisdiction clearance are complete.
          </p>
        </Callout>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {/* =================================================== source record */}
          <Card>
            <CardHeader
              title="Official source record"
              description="Facts retained from the government source without filling missing fields by assumption."
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Former owner">
                  {record.formerOwnerName}
                </DataItem>

                <DataItem label="Property ID">
                  {record.propertyId ? (
                    <span className="font-mono text-xs">
                      {record.propertyId}
                    </span>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Property address" span>
                  {record.addressLine1}, {record.city}, {record.county},{" "}
                  {record.state} {record.postalCode}
                </DataItem>

                <DataItem label="Sale date">
                  {formatDate(record.saleDate)}
                </DataItem>

                <DataItem label="Sale type">
                  {humanize(record.saleType)}
                </DataItem>

                <DataItem label="Case number">
                  {record.caseNumber ? (
                    <span className="font-mono text-xs">
                      {record.caseNumber}
                    </span>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Parcel / property ID">
                  {record.parcelNumber ? (
                    <span className="font-mono text-xs">
                      {record.parcelNumber}
                    </span>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Source-listed balance" span>
                  {balance ? (
                    <div>
                      <span className="tnum text-lg font-semibold text-ink-900">
                        {balance}
                      </span>

                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
                        This is the value reported by the official source. It
                        remains separate from Duequity&apos;s confirmed-surplus
                        field until its financial meaning is verified.
                      </p>
                    </div>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          {/* ================================================= enrichment gate */}
          <Card>
            <CardHeader
              title="Verified enrichment"
              description="Facts required by the operational Opportunity model must be verified before promotion."
            />

            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line bg-inset p-3.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                    Property type
                  </p>

                  {enrichment?.propertyType ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-positive-800">
                        {humanize(enrichment.propertyType.value)}
                      </p>

                      <p className="mt-1 text-2xs text-ink-500">
                        Verified from{" "}
                        {enrichment.propertyType.provenance.sourceName}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-caution-800">
                      Verification required
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-line bg-inset p-3.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                    Sale price
                  </p>

                  {enrichment?.salePrice ? (
                    <>
                      <p className="tnum mt-1 text-sm font-semibold text-positive-800">
                        {formatBalance(enrichment.salePrice.fact.amount)}
                      </p>

                      <p className="mt-1 text-2xs text-ink-500">
                        {enrichment.salePrice.provenance.sourceName}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-caution-800">
                      Verification required
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-line bg-inset p-3.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                    Debt satisfied
                  </p>

                  {enrichment?.debtSatisfied ? (
                    <>
                      <p className="tnum mt-1 text-sm font-semibold text-positive-800">
                        {formatBalance(enrichment.debtSatisfied.fact.amount)}
                      </p>

                      <p className="mt-1 text-2xs text-ink-500">
                        {enrichment.debtSatisfied.provenance.sourceName}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-caution-800">
                      Verification required
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-line bg-inset p-3.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                    Estimated surplus
                  </p>

                  {enrichment?.estimatedSurplus ? (
                    <>
                      <p className="tnum mt-1 text-sm font-semibold text-positive-800">
                        {formatBalance(enrichment.estimatedSurplus.fact.amount)}
                      </p>

                      <p className="mt-1 text-2xs text-ink-500">
                        {enrichment.estimatedSurplus.provenance.sourceName}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-caution-800">
                      Verification required
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-line bg-inset p-3.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                    Selling entity
                  </p>

                  {enrichment?.sellingEntity ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-positive-800">
                        {enrichment.sellingEntity.value}
                      </p>

                      <p className="mt-1 text-2xs text-ink-500">
                        {enrichment.sellingEntity.provenance.sourceName}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-caution-800">
                      Verification required
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-line bg-inset p-3.5">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                    Source balance meaning
                  </p>

                  {enrichment?.sourceBalanceInterpretation ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-positive-800">
                        {humanize(enrichment.sourceBalanceInterpretation.value)}
                      </p>

                      <p className="mt-1 text-2xs text-ink-500">
                        {
                          enrichment.sourceBalanceInterpretation.provenance
                            .sourceName
                        }
                      </p>
                    </>
                  ) : record.sourceListedBalanceCents !== undefined ? (
                    <p className="mt-1 text-sm font-medium text-caution-800">
                      Verification required
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-ink-500">
                      No source balance supplied
                    </p>
                  )}
                </div>
              </div>

              {enrichment?.confirmedSurplus && (
                <div className="mt-4 rounded-md border border-positive-200 bg-positive-50 p-4">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-positive-700">
                    Confirmed surplus
                  </p>

                  <p className="tnum mt-1 text-lg font-semibold text-positive-900">
                    {formatBalance(enrichment.confirmedSurplus.fact.amount)}
                  </p>

                  <p className="mt-1 text-xs text-positive-800">
                    Verified from{" "}
                    {enrichment.confirmedSurplus.provenance.sourceName}
                  </p>
                </div>
              )}

              {enrichmentReadiness.cautions.length > 0 && (
                <div className="mt-4 space-y-2">
                  {enrichmentReadiness.cautions.map((caution) => (
                    <div
                      key={caution}
                      className="rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3"
                    >
                      <p className="text-sm leading-relaxed text-caution-800">
                        {caution}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-line pt-4">
                <p className="text-xs text-ink-500">
                  Last enrichment update:{" "}
                  {enrichment
                    ? new Date(enrichment.updatedAt).toLocaleString("en-US")
                    : "No verified enrichment recorded"}
                </p>
              </div>
            </CardBody>
          </Card>

          {/* ================================================= claimant locator */}
          <Card>
            <CardHeader
              title="Claimant Locator"
              description="Research and verify candidate identity and contact information without creating a claimant or authorizing outreach."
            />

            <CardBody>
              {canLocate ? (
                <>
                  <div className="mb-5 rounded-md border border-line bg-inset p-4">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        Research starting points
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-ink-500">
                        Launch targeted public-web research using the exact facts
                        already retained from the official county record. Search
                        results are research leads only and are never saved,
                        verified, or treated as claimant contact information
                        automatically.
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={ownerLocationResearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-paper px-3.5 py-2 text-sm font-semibold text-ink-700 transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800"
                      >
                        Search owner + location
                      </a>

                      <a
                        href={ownerPropertyResearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-paper px-3.5 py-2 text-sm font-semibold text-ink-700 transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800"
                      >
                        Search owner + property
                      </a>

                      <a
                        href={identifierResearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-paper px-3.5 py-2 text-sm font-semibold text-ink-700 transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800"
                      >
                        Search case / property IDs
                      </a>
                    </div>

                    <div className="mt-4 grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
                      <p>
                        Owner:{" "}
                        <span className="font-medium text-ink-700">
                          {record.formerOwnerName}
                        </span>
                      </p>

                      <p>
                        Jurisdiction:{" "}
                        <span className="font-medium text-ink-700">
                          {record.county}, {record.state}
                        </span>
                      </p>

                      <p className="sm:col-span-2">
                        Property:{" "}
                        <span className="font-medium text-ink-700">
                          {record.addressLine1}, {record.city}, {record.state}{" "}
                          {record.postalCode}
                        </span>
                      </p>

                      <p>
                        Case:{" "}
                        <span className="font-mono text-ink-700">
                          {record.caseNumber ?? "Not recorded"}
                        </span>
                      </p>

                      <p>
                        Property ID:{" "}
                        <span className="font-mono text-ink-700">
                          {record.propertyId ?? "Not recorded"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <ClaimantLocatorControls
                    recordId={record.id}
                    candidates={
                      enrichment?.claimantLocator?.candidates ??
                      []
                    }
                    identities={
                      enrichment?.claimantLocator?.identities ??
                      []
                    }
                    associatedContacts={
                      enrichment?.claimantLocator?.associatedContacts ??
                      []
                    }
                  />
                </>
              ) : (
                <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                  <p className="text-sm font-medium text-ink-700">
                    Claimant Locator unavailable
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Your current staff permissions or state clearance do not
                    authorize claimant-location research for this record.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {(record.reviewedAt ||
            record.reviewNote ||
            record.reviewedByUserId) && (
            <Card>
              <CardHeader
                title="Review history"
                description="Persisted discovery-review information."
              />

              <CardBody>
                <DataList columns={2}>
                  <DataItem label="Review status">
                    <span className="capitalize">{record.status}</span>
                  </DataItem>

                  <DataItem label="Reviewed at">
                    {record.reviewedAt ? (
                      new Date(record.reviewedAt).toLocaleString("en-US")
                    ) : (
                      <NotRecorded />
                    )}
                  </DataItem>

                  <DataItem label="Reviewed by">
                    {record.reviewedByUserId ? (
                      <span className="font-mono text-xs">
                        {record.reviewedByUserId}
                      </span>
                    ) : (
                      <NotRecorded />
                    )}
                  </DataItem>

                  <DataItem label="Review note" span>
                    {record.reviewNote ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                        {record.reviewNote}
                      </p>
                    ) : (
                      <NotRecorded />
                    )}
                  </DataItem>
                </DataList>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Promotion readiness"
              description="Every blocking requirement must be resolved before this discovery can become an operational Opportunity."
            />

            <CardBody>
              {isPromoted ? (
                <div className="rounded-md border border-positive-200 bg-positive-50 px-4 py-3.5">
                  <p className="text-sm font-semibold text-positive-900">
                    Record already promoted
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-positive-800">
                    This discovery has already entered the operational
                    Opportunity workflow. It cannot be promoted again.
                  </p>

                  {record.promotedOpportunityId && (
                    <p className="mt-3 text-sm">
                      <TextLink
                        href={`/pro/opportunities/${record.promotedOpportunityId}`}
                      >
                        Open Opportunity
                      </TextLink>
                    </p>
                  )}
                </div>
              ) : promotionBlockers.length > 0 ? (
                <ol className="space-y-3">
                  {promotionBlockers.map((blocker, index) => (
                    <li
                      key={blocker}
                      className="flex gap-3 rounded-md border border-line bg-inset px-3.5 py-3"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper font-mono text-2xs text-ink-500">
                        {index + 1}
                      </span>

                      <p className="text-sm leading-relaxed text-ink-700">
                        {blocker}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-positive-200 bg-positive-50 px-4 py-3.5">
                    <p className="text-sm font-semibold text-positive-900">
                      Current promotion prerequisites are complete.
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-positive-800">
                      No Opportunity has been created. Promotion remains a
                      separate, controlled operational action.
                    </p>
                  </div>

                  {canReview && workflowReady ? (
                    <DiscoveredRecordPromotionControl
                      recordId={record.id}
                    />
                  ) : null}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Source" />

            <CardBody>
              <DataList>
                <DataItem label="Source name">{record.sourceName}</DataItem>

                <DataItem label="Reference">
                  {record.sourceReference ? (
                    <span className="font-mono text-xs">
                      {record.sourceReference}
                    </span>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Agency">{record.agencyName}</DataItem>

                <DataItem label="Agency phone">
                  {record.agencyPhone ? (
                    <a
                      href={phoneHref(record.agencyPhone)}
                      className="text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                    >
                      {formatPhone(record.agencyPhone)}
                    </a>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="First discovered">
                  {new Date(record.discoveredAt).toLocaleString("en-US")}
                </DataItem>

                <DataItem label="Last seen">
                  {new Date(record.lastSeenAt).toLocaleString("en-US")}
                </DataItem>
              </DataList>

              <p className="mt-4 text-sm">
                <TextLink href={record.sourceUrl} external>
                  Open official source
                </TextLink>
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Jurisdiction" />

            <CardBody>
              {approvedJurisdiction ? (
                <>
                  <p className="text-sm font-medium text-positive-800">
                    Approved rule found
                  </p>

                  <p className="mt-1 text-sm leading-relaxed text-ink-600">
                    {approvedJurisdiction.county},{" "}
                    {approvedJurisdiction.stateName}
                  </p>

                  <p className="mt-3 text-sm">
                    <TextLink
                      href={`/pro/jurisdictions/${approvedJurisdiction.id}`}
                    >
                      Open jurisdiction
                    </TextLink>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-caution-800">
                    Not operationally approved
                  </p>

                  <p className="mt-1 text-sm leading-relaxed text-ink-600">
                    Research may continue, but operational promotion, claimant
                    intake, and outreach remain blocked until the jurisdiction
                    requirements are approved.
                  </p>

                  <p className="mt-3 text-sm">
                    <TextLink href="/pro/jurisdictions">
                      Review jurisdictions
                    </TextLink>
                  </p>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Record review"
              description="Operational review controls are permission restricted."
            />

            <CardBody>
              {isPromoted ? (
                <div className="rounded-md border border-positive-200 bg-positive-50 px-3.5 py-3">
                  <p className="text-sm font-medium text-positive-900">
                    Record already promoted
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-positive-800">
                    Discovery review is closed because this record has already
                    been promoted to the operational Opportunity workflow.
                  </p>
                </div>
              ) : canReview ? (
                <DiscoveredRecordReviewControls
                  recordId={record.id}
                  currentStatus={
                    record.status === "dismissed"
                      ? "dismissed"
                      : record.status === "reviewed"
                        ? "reviewed"
                        : "new"
                  }
                  existingNote={record.reviewNote}
                />
              ) : (
                <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                  <p className="text-sm font-medium text-ink-700">
                    Review actions unavailable
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Your current staff permissions or state clearance do not
                    authorize operational review of this discovered record.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}