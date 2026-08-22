import type { Metadata } from "next";

import Link from "next/link";

import { DATA_QUALITY, PROPERTY_TYPE_LABEL } from "@/domain/status";

import { Card, Callout, EmptyState } from "@/components/ui/surface";

import { StatusBadge } from "@/components/ui/badge";

import {
  RecordList,
  RecordListItem,
  Table,
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

import { daysBetween, formatDate, formatElapsed } from "@/lib/format";

import { listOpportunities, listProperties } from "@/server/opportunity-store";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Properties",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function propertyLocation(
  property: Awaited<ReturnType<typeof listProperties>>[number],
): string {
  return [
    property.address.city,
    property.address.county ? `${property.address.county} County` : undefined,
    property.address.state,
    property.address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProPropertiesPage() {
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

  const [properties, opportunities, conversions] = await Promise.all([
    listProperties(),
    listOpportunities(),
    listOpportunityConversions(),
  ]);

  const today = currentDate();

  const opportunityByPropertyId = new Map(
    opportunities.map((opportunity) => [opportunity.propertyId, opportunity]),
  );

  const conversionByOpportunityId = new Map(
    conversions.map((conversion) => [conversion.opportunityId, conversion]),
  );

  const claimByOpportunityId = new Map<
    string,
    Awaited<ReturnType<typeof resolveClaimRecord>>
  >();

  await Promise.all(
    conversions.map(async (conversion) => {
      const resolved = await resolveClaimRecord(conversion.claimId);

      claimByOpportunityId.set(conversion.opportunityId, resolved);
    }),
  );

  const unverified = properties.filter(
    (property) =>
      !property.provenance.lastVerified ||
      property.provenance.quality === "unverified",
  );

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Work</p>

          <h1 className="mt-1.5 text-2xl">Properties</h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Persisted property records with source provenance and verification
            currency. Externally derived facts retain where they came from and
            when they were last checked.
          </p>
        </div>
      </div>

      {/* ================================================= verification warning */}
      {unverified.length > 0 && (
        <Callout tone="caution" title="Records requiring verification">
          <p>
            {unverified.length} property{" "}
            {unverified.length === 1 ? "record has" : "records have"} not been
            verified against a source document. Recovery estimates derived from
            unverified property data must remain clearly identified as
            estimates.
          </p>
        </Callout>
      )}

      {/* ================================================================= register */}
      {properties.length === 0 ? (
        <EmptyState
          title="No production properties yet"
          description="Properties will appear here when they are persisted through the opportunity intake and recovery workflow."
        />
      ) : (
        <Card className="overflow-hidden">
          <TableToolbar
            count={properties.length}
            noun={{
              one: "property",

              many: "properties",
            }}
          />

          {/* ============================================================ desktop */}
          <div className="hidden lg:block">
            <TableRegion label="Property register">
              <Table caption="Persisted property records with parcel identifiers, provenance and verification currency">
                <THead>
                  <TH>Property</TH>

                  <TH width="12%">Type</TH>

                  <TH width="14%">Parcel</TH>

                  <TH width="12%" align="right">
                    Assessed
                  </TH>

                  <TH width="14%">Source</TH>

                  <TH width="12%">Quality</TH>

                  <TH width="12%">Linked</TH>
                </THead>

                <TBody>
                  {properties.map((property) => {
                    const opportunity = opportunityByPropertyId.get(
                      property.id,
                    );

                    const conversion = opportunity
                      ? conversionByOpportunityId.get(opportunity.id)
                      : undefined;

                    const resolvedClaim = opportunity
                      ? claimByOpportunityId.get(opportunity.id)
                      : undefined;

                    const claim = resolvedClaim?.claim;

                    const age = property.provenance.lastVerified
                      ? daysBetween(property.provenance.lastVerified, today)
                      : undefined;

                    const stale = age === undefined || age > 180;

                    return (
                      <TR
                        key={property.id}
                        tone={stale ? "caution" : undefined}
                      >
                        <TDPrimary
                          href={
                            opportunity
                              ? `/pro/opportunities/${opportunity.id}`
                              : undefined
                          }
                          secondary={propertyLocation(property)}
                        >
                          {property.address.line1}
                        </TDPrimary>

                        <TD>
                          <span className="text-xs text-ink-600">
                            {PROPERTY_TYPE_LABEL[property.propertyType]}
                          </span>

                          {property.yearBuilt && (
                            <span className="mt-0.5 block text-2xs text-ink-400">
                              Built {property.yearBuilt}
                            </span>
                          )}
                        </TD>

                        <TD>
                          {property.parcelNumber ? (
                            <span className="font-mono text-2xs break-all text-ink-600">
                              {property.parcelNumber}
                            </span>
                          ) : (
                            <span className="text-2xs text-ink-400">
                              Not recorded
                            </span>
                          )}
                        </TD>

                        <TD align="right">
                          {property.assessedValue ? (
                            <MoneyInline fact={property.assessedValue} whole />
                          ) : (
                            <span className="text-2xs text-ink-400">
                              Not recorded
                            </span>
                          )}
                        </TD>

                        <TD>
                          <span className="line-clamp-2 text-xs text-ink-600">
                            {property.provenance.sourceName}
                          </span>

                          <span className="mt-0.5 block text-2xs text-ink-400">
                            {property.provenance.sourceKind.replaceAll(
                              "_",
                              " ",
                            )}
                          </span>
                        </TD>

                        <TD>
                          <StatusBadge
                            status={DATA_QUALITY[property.provenance.quality]}
                          />

                          <span
                            className={
                              stale
                                ? "mt-0.5 block text-2xs font-medium text-caution-700"
                                : "mt-0.5 block text-2xs text-ink-400"
                            }
                          >
                            {property.provenance.lastVerified
                              ? formatElapsed(
                                  property.provenance.lastVerified,
                                  today,
                                )
                              : "Never verified"}
                          </span>
                        </TD>

                        <TD>
                          <div className="flex flex-col gap-1">
                            {opportunity && (
                              <Link
                                href={`/pro/opportunities/${opportunity.id}`}
                                className="font-mono text-2xs text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                              >
                                {opportunity.reference}
                              </Link>
                            )}

                            {conversion && claim && (
                              <Link
                                href={`/pro/claims/${claim.id}`}
                                className="font-mono text-2xs text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                              >
                                {claim.reference}
                              </Link>
                            )}

                            {!opportunity && !claim && (
                              <span className="text-2xs text-ink-400">
                                None
                              </span>
                            )}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableRegion>
          </div>

          {/* ============================================================= mobile */}
          <div className="lg:hidden">
            <RecordList>
              {properties.map((property) => {
                const opportunity = opportunityByPropertyId.get(property.id);

                const resolvedClaim = opportunity
                  ? claimByOpportunityId.get(opportunity.id)
                  : undefined;

                const claim = resolvedClaim?.claim;

                const age = property.provenance.lastVerified
                  ? daysBetween(property.provenance.lastVerified, today)
                  : undefined;

                const stale = age === undefined || age > 180;

                return (
                  <RecordListItem
                    key={property.id}
                    href={
                      opportunity
                        ? `/pro/opportunities/${opportunity.id}`
                        : undefined
                    }
                    title={property.address.line1}
                    subtitle={propertyLocation(property)}
                    status={
                      <StatusBadge
                        status={DATA_QUALITY[property.provenance.quality]}
                      />
                    }
                    tone={stale ? "caution" : undefined}
                    facts={[
                      {
                        label: "Type",

                        value: PROPERTY_TYPE_LABEL[property.propertyType],
                      },
                      {
                        label: "Last verified",

                        value: property.provenance.lastVerified
                          ? formatDate(property.provenance.lastVerified)
                          : "Never",
                      },
                      {
                        label: "Parcel",

                        value: property.parcelNumber ?? "Not recorded",
                      },
                      {
                        label: "Opportunity",

                        value: opportunity?.reference ?? "None",
                      },
                      {
                        label: "Claim",

                        value: claim?.reference ?? "None",
                      },
                    ]}
                  />
                );
              })}
            </RecordList>
          </div>
        </Card>
      )}
    </div>
  );
}