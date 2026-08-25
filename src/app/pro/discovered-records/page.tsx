import type { Metadata } from "next";

import {
  CountySurplusHarvestControls,
  type StateHarvestOption,
} from "@/components/pro/county-surplus-harvest-controls";

import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
  NotRecorded,
} from "@/components/ui/surface";

import {
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

import { formatDate } from "@/lib/format";

import {
  can,
} from "@/lib/session";

import {
  listDiscoveredRecords,
  type DiscoveredRecord,
  type DiscoveredRecordStatus,
} from "@/server/discovered-record-store";

import {
  loadNationalGeography,
} from "@/server/geography-resolver";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const metadata: Metadata = {
  title: "Discovered Records",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",

  currency: "USD",

  minimumFractionDigits: 2,

  maximumFractionDigits: 2,
});

function formatSourceBalance(
  cents: number | undefined,
): string | undefined {
  if (
    cents === undefined
  ) {
    return undefined;
  }

  return USD.format(
    cents /
      100,
  );
}

function locationLabel(
  record: DiscoveredRecord,
): string {
  return [
    record.city,
    record.county,
    record.state,
    record.postalCode,
  ]
    .map(
      (value) =>
        value?.trim(),
    )
    .filter(
      (
        value,
      ): value is string =>
        Boolean(
          value,
        ),
    )
    .join(
      ", ",
    );
}

function propertyAddressLabel(
  record: DiscoveredRecord,
): string {
  const address =
    record.addressLine1
      ?.trim();

  if (
    address
  ) {
    return address;
  }

  if (
    record.parcelNumber
      ?.trim()
  ) {
    return `Parcel ${record.parcelNumber.trim()}`;
  }

  if (
    record.propertyId
      ?.trim()
  ) {
    return `Property ID ${record.propertyId.trim()}`;
  }

  if (
    record.caseNumber
      ?.trim()
  ) {
    return `Case ${record.caseNumber.trim()}`;
  }

  return "Property address not published";
}

function saleTimingLabel(
  record: DiscoveredRecord,
): string {
  if (
    record.saleDate
  ) {
    return formatDate(
      record.saleDate,
    );
  }

  const sourceTiming =
    record.sourceSaleTimingText
      ?.trim();

  if (
    sourceTiming
  ) {
    return sourceTiming;
  }

  const monthYear =
    record.saleMonthYear
      ?.trim();

  if (
    monthYear
  ) {
    return monthYear;
  }

  return "Not recorded";
}

function saleTimingPrecision(
  record: DiscoveredRecord,
): string | undefined {
  if (
    record.saleDate
  ) {
    return undefined;
  }

  if (
    record.saleMonthYear ||
    record.sourceSaleTimingText
  ) {
    return "Month / year";
  }

  return undefined;
}

function statusLabel(
  status: DiscoveredRecordStatus,
): string {
  switch (
    status
  ) {
    case "new":
      return "New";

    case "reviewed":
      return "Reviewed";

    case "promoted":
      return "Promoted";

    case "dismissed":
      return "Dismissed";

    default:
      return status;
  }
}

function statusClassName(
  status: DiscoveredRecordStatus,
): string {
  switch (
    status
  ) {
    case "new":
      return "border-accent-200 bg-accent-50 text-accent-800";

    case "reviewed":
      return "border-caution-200 bg-caution-50 text-caution-800";

    case "promoted":
      return "border-positive-200 bg-positive-50 text-positive-800";

    case "dismissed":
      return "border-line bg-inset text-ink-500";

    default:
      return "border-line bg-inset text-ink-600";
  }
}

function StatusPill({
  status,
}: {
  status: DiscoveredRecordStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-semibold ${statusClassName(
        status,
      )}`}
    >
      {statusLabel(
        status,
      )}
    </span>
  );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProDiscoveredRecordsPage() {
  /*
   * Server-side session gate.
   *
   * Resolved before any operational store read. The layout also withholds the
   * operations shell, but the page independently refuses unauthorized
   * operational data access.
   */
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const [
    records,
    geography,
  ] =
    await Promise.all([
      listDiscoveredRecords(),

      loadNationalGeography(),
    ]);

  const canHarvest =
    can(
      session,
      "opportunity.write",
    );

  /*
   * The discovery selector is intentionally national.
   *
   * Every state and county from the national geography registry is visible to
   * an authorized discovery user so the interface accurately represents the
   * national source engine.
   *
   * Visibility is not authorization.
   *
   * The county-harvest API independently verifies:
   *
   *   - staff authentication
   *   - opportunity.write permission
   *   - state clearance
   *   - valid national geography
   *   - activated or validated official source
   *
   * A state or county appearing here therefore does not mean the current staff
   * user may harvest it or that a usable official source will necessarily be
   * available online.
   */
  const harvestStates:
    StateHarvestOption[] =
    canHarvest
      ? geography.states.map(
          (state) => ({
            postalCode:
              state.postalCode,

            name:
              state.name,

            counties:
              state.counties.map(
                (county) => ({
                  geoid:
                    county.geoid,

                  name:
                    county.name,
                }),
              ),
          }),
        )
      : [];

  const newCount =
    records.filter(
      (record) =>
        record.status ===
        "new",
    ).length;

  const reviewedCount =
    records.filter(
      (record) =>
        record.status ===
        "reviewed",
    ).length;

  const promotedCount =
    records.filter(
      (record) =>
        record.status ===
        "promoted",
    ).length;

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">
            Pipeline
          </p>

          <h1 className="mt-1.5 text-2xl">
            Discovered Records
          </h1>

          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
            Pull official county surplus records, preserve the government facts
            actually published, and prepare each lead for claimant-location
            research, enrichment, and operational review.
          </p>
        </div>

        {records.length >
          0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-ink-600">
              New{" "}
              <span className="tnum font-semibold text-ink-900">
                {newCount}
              </span>
            </span>

            <span className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-ink-600">
              Reviewed{" "}
              <span className="tnum font-semibold text-ink-900">
                {reviewedCount}
              </span>
            </span>

            <span className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-ink-600">
              Promoted{" "}
              <span className="tnum font-semibold text-ink-900">
                {promotedCount}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* ====================================================== county discovery */}
      <Card>
        <CardHeader
          title="County Surplus Discovery"
          description="Select a state and county to search for available surplus records from an official government source."
        />

        <CardBody>
          {canHarvest &&
          harvestStates.length >
            0 ? (
            <CountySurplusHarvestControls
              states={
                harvestStates
              }
            />
          ) : (
            <div className="rounded-md border border-line bg-inset px-4 py-4">
              <p className="text-sm font-semibold text-ink-800">
                County discovery unavailable
              </p>

              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Your current staff role does not authorize official
                public-record harvesting.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <Callout
        tone="neutral"
        title="Discovery records may be incomplete"
      >
        <p>
          County sources do not all publish the same fields. Duequity preserves
          legitimate records even when a source provides only parcel identity,
          month/year sale timing, or other partial government evidence. Missing
          fields remain missing until verified enrichment establishes them.
        </p>
      </Callout>

      <Callout
        tone="neutral"
        title="Discovery is not an opportunity"
      >
        <p>
          County pulls create discovery leads only. A former owner appearing in
          an official surplus source is not automatically a claimant or client.
          Duequity does not authorize outreach, create an Opportunity, create a
          Claim, create a claimant account, or begin onboarding from the county
          pull alone.
        </p>
      </Callout>

      {/* ========================================================== record queue */}
      {records.length ===
      0 ? (
        <EmptyState
          title="No discovered records yet"
          description="Select a state and county above, then pull available surplus records from the official-source discovery engine."
        />
      ) : (
        <Card className="overflow-hidden">
          <TableToolbar
            count={
              records.length
            }
            noun={{
              one:
                "discovered record",

              many:
                "discovered records",
            }}
          />

          {/* ============================================================ desktop */}
          <div className="hidden lg:block">
            <TableRegion label="Discovered record queue">
              <Table caption="Official public-source records staged for Duequity review">
                <THead>
                  <TH width="22%">
                    Former owner
                  </TH>

                  <TH width="24%">
                    Property
                  </TH>

                  <TH width="13%">
                    Case
                  </TH>

                  <TH width="10%">
                    Sale timing
                  </TH>

                  <TH
                    width="12%"
                    align="right"
                  >
                    Source-listed amount
                  </TH>

                  <TH width="12%">
                    Source
                  </TH>

                  <TH width="7%">
                    Status
                  </TH>
                </THead>

                <TBody>
                  {records.map(
                    (record) => {
                      const balance =
                        formatSourceBalance(
                          record.sourceListedSurplusCents ??
                          record.sourceListedBalanceCents,
                        );

                      const location =
                        locationLabel(
                          record,
                        );

                      const timing =
                        saleTimingLabel(
                          record,
                        );

                      const precision =
                        saleTimingPrecision(
                          record,
                        );

                      return (
                        <TR
                          key={
                            record.id
                          }
                        >
                          <TDPrimary
                            href={`/pro/discovered-records/${record.id}`}
                            secondary={
                              record.propertyId
                                ? `Property ID ${record.propertyId}`
                                : record.parcelNumber
                                  ? `Parcel ${record.parcelNumber}`
                                  : "No property identifier recorded"
                            }
                          >
                            {
                              record.formerOwnerName
                            }
                          </TDPrimary>

                          <TD>
                            <p className="text-xs font-medium text-ink-800">
                              {propertyAddressLabel(
                                record,
                              )}
                            </p>

                            <p className="mt-0.5 text-2xs text-ink-500">
                              {location ||
                                "Location not published"}
                            </p>
                          </TD>

                          <TD>
                            {record.caseNumber ? (
                              <span className="break-all font-mono text-2xs text-ink-700">
                                {
                                  record.caseNumber
                                }
                              </span>
                            ) : (
                              <NotRecorded />
                            )}

                            {record.parcelNumber && (
                              <span className="mt-1 block break-all font-mono text-2xs text-ink-400">
                                Parcel{" "}
                                {
                                  record.parcelNumber
                                }
                              </span>
                            )}
                          </TD>

                          <TD>
                            <span className="text-xs text-ink-700">
                              {timing}
                            </span>

                            {precision && (
                              <span className="mt-0.5 block text-2xs text-ink-400">
                                {precision}
                              </span>
                            )}
                          </TD>

                          <TD align="right">
                            {balance ? (
                              <>
                                <span className="tnum text-sm font-semibold text-ink-900">
                                  {
                                    balance
                                  }
                                </span>

                                <span className="mt-0.5 block text-2xs text-ink-400">
                                  Source-listed
                                </span>
                              </>
                            ) : (
                              <NotRecorded />
                            )}
                          </TD>

                          <TD>
                            <a
                              href={
                                record.sourceUrl
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="line-clamp-2 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                            >
                              {
                                record.sourceName
                              }
                            </a>

                            {record.sourceReference && (
                              <span className="mt-1 block line-clamp-2 font-mono text-2xs text-ink-400">
                                {
                                  record.sourceReference
                                }
                              </span>
                            )}
                          </TD>

                          <TD>
                            <StatusPill
                              status={
                                record.status
                              }
                            />
                          </TD>
                        </TR>
                      );
                    },
                  )}
                </TBody>
              </Table>
            </TableRegion>
          </div>

          {/* ============================================================= mobile */}
          <div className="divide-y divide-line lg:hidden">
            {records.map(
              (record) => {
                const balance =
                  formatSourceBalance(
                    record.sourceListedSurplusCents ??
                    record.sourceListedBalanceCents,
                  );

                const location =
                  locationLabel(
                    record,
                  );

                const timing =
                  saleTimingLabel(
                    record,
                  );

                const precision =
                  saleTimingPrecision(
                    record,
                  );

                return (
                  <a
                    key={
                      record.id
                    }
                    href={`/pro/discovered-records/${record.id}`}
                    className="block p-4 transition-colors hover:bg-inset"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">
                          {
                            record.formerOwnerName
                          }
                        </p>

                        <p className="mt-1 text-sm text-ink-700">
                          {propertyAddressLabel(
                            record,
                          )}
                        </p>

                        <p className="mt-0.5 text-xs text-ink-500">
                          {location ||
                            "Location not published"}
                        </p>
                      </div>

                      <StatusPill
                        status={
                          record.status
                        }
                      />
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-subtle pt-4">
                      <div>
                        <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">
                          Case
                        </dt>

                        <dd className="mt-1 font-mono text-xs text-ink-700">
                          {
                            record.caseNumber ??
                            "Not recorded"
                          }
                        </dd>
                      </div>

                      <div>
                        <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">
                          Sale timing
                        </dt>

                        <dd className="mt-1 text-xs text-ink-700">
                          {timing}

                          {precision && (
                            <span className="mt-0.5 block text-2xs text-ink-400">
                              {
                                precision
                              }
                            </span>
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">
                          Property ID
                        </dt>

                        <dd className="mt-1 font-mono text-xs text-ink-700">
                          {
                            record.propertyId ??
                            record.parcelNumber ??
                            "Not recorded"
                          }
                        </dd>
                      </div>

                      <div>
                        <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">
                          Source-listed amount
                        </dt>

                        <dd className="tnum mt-1 text-xs font-semibold text-ink-900">
                          {
                            balance ??
                            "Not recorded"
                          }
                        </dd>
                      </div>
                    </dl>
                  </a>
                );
              },
            )}
          </div>
        </Card>
      )}

      {records.length >
        0 && (
        <Card>
          <CardBody>
            <p className="text-sm leading-relaxed text-ink-600">
              A source-listed surplus or balance is preserved exactly as a
              financial value reported by the official source. Duequity does
              not automatically treat that value as an operational recovery
              amount. Each discovery lead must continue through claimant
              location, contact enrichment, verification, jurisdiction review,
              and engagement controls.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}