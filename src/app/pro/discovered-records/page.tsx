import type { Metadata } from "next";

import {
  Card,
  CardBody,
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
  listDiscoveredRecords,
  type DiscoveredRecord,
  type DiscoveredRecordStatus,
} from "@/server/discovered-record-store";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

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

function formatSourceBalance(cents: number | undefined): string | undefined {
  if (cents === undefined) {
    return undefined;
  }

  return USD.format(cents / 100);
}

function locationLabel(record: DiscoveredRecord): string {
  return [record.city, record.county, record.state, record.postalCode]
    .filter(Boolean)
    .join(", ");
}

function statusLabel(status: DiscoveredRecordStatus): string {
  switch (status) {
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

function statusClassName(status: DiscoveredRecordStatus): string {
  switch (status) {
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

function StatusPill({ status }: { status: DiscoveredRecordStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-semibold ${statusClassName(
        status,
      )}`}
    >
      {statusLabel(status)}
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
   * Resolved before any store read. The layout also withholds the operations
   * shell, but layout and page render in parallel, so the page must refuse to
   * read operational data on its own account.
   */
  if (!(await resolveStaffSession())) {
    return <StaffAuthenticationRequired />;
  }

  const records = await listDiscoveredRecords();

  const newCount = records.filter((record) => record.status === "new").length;

  const reviewedCount = records.filter(
    (record) => record.status === "reviewed",
  ).length;

  const promotedCount = records.filter(
    (record) => record.status === "promoted",
  ).length;

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Pipeline</p>

          <h1 className="mt-1.5 text-2xl">Discovered Records</h1>

          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
            Official public-source records staged for review before they enter
            Duequity&apos;s operational opportunity pipeline.
          </p>
        </div>

        {records.length > 0 && (
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

      <Callout tone="neutral" title="Discovery is not an opportunity">
        <p>
          These records preserve facts collected from an official source. Their
          presence here does not approve a jurisdiction, authorize claimant
          intake, authorize outreach, create a claim, or establish that every
          fact required for an operational opportunity has been verified.
        </p>
      </Callout>

      {records.length === 0 ? (
        <EmptyState
          title="No discovered records yet"
          description="Records will appear here after an authorized official-source harvest stages them for review."
        />
      ) : (
        <Card className="overflow-hidden">
          <TableToolbar
            count={records.length}
            noun={{
              one: "discovered record",

              many: "discovered records",
            }}
          />

          {/* ============================================================ desktop */}
          <div className="hidden lg:block">
            <TableRegion label="Discovered record queue">
              <Table caption="Official public-source records staged for Duequity review">
                <THead>
                  <TH width="22%">Former owner</TH>

                  <TH width="24%">Property</TH>

                  <TH width="13%">Case</TH>

                  <TH width="10%">Sale date</TH>

                  <TH width="12%" align="right">
                    Source-listed balance
                  </TH>

                  <TH width="12%">Source</TH>

                  <TH width="7%">Status</TH>
                </THead>

                <TBody>
                  {records.map((record) => {
                    const balance = formatSourceBalance(
                      record.sourceListedBalanceCents,
                    );

                    return (
                      <TR key={record.id}>
                        <TDPrimary
                          href={`/pro/discovered-records/${record.id}`}
                          secondary={
                            record.propertyId
                              ? `Property ID ${record.propertyId}`
                              : "No property identifier recorded"
                          }
                        >
                          {record.formerOwnerName}
                        </TDPrimary>

                        <TD>
                          <p className="text-xs font-medium text-ink-800">
                            {record.addressLine1}
                          </p>

                          <p className="mt-0.5 text-2xs text-ink-500">
                            {locationLabel(record)}
                          </p>
                        </TD>

                        <TD>
                          {record.caseNumber ? (
                            <span className="font-mono text-2xs break-all text-ink-700">
                              {record.caseNumber}
                            </span>
                          ) : (
                            <NotRecorded />
                          )}

                          {record.parcelNumber && (
                            <span className="mt-1 block font-mono text-2xs break-all text-ink-400">
                              {record.parcelNumber}
                            </span>
                          )}
                        </TD>

                        <TD>
                          <span className="text-xs text-ink-700">
                            {formatDate(record.saleDate)}
                          </span>
                        </TD>

                        <TD align="right">
                          {balance ? (
                            <>
                              <span className="tnum text-sm font-semibold text-ink-900">
                                {balance}
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
                            href={record.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-2 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                          >
                            {record.sourceName}
                          </a>

                          {record.sourceReference && (
                            <span className="mt-1 block line-clamp-2 font-mono text-2xs text-ink-400">
                              {record.sourceReference}
                            </span>
                          )}
                        </TD>

                        <TD>
                          <StatusPill status={record.status} />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableRegion>
          </div>

          {/* ============================================================= mobile */}
          <div className="divide-y divide-line lg:hidden">
            {records.map((record) => {
              const balance = formatSourceBalance(
                record.sourceListedBalanceCents,
              );

              return (
                <a
                  key={record.id}
                  href={`/pro/discovered-records/${record.id}`}
                  className="block p-4 transition-colors hover:bg-inset"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">
                        {record.formerOwnerName}
                      </p>

                      <p className="mt-1 text-sm text-ink-700">
                        {record.addressLine1}
                      </p>

                      <p className="mt-0.5 text-xs text-ink-500">
                        {locationLabel(record)}
                      </p>
                    </div>

                    <StatusPill status={record.status} />
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-subtle pt-4">
                    <div>
                      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">
                        Case
                      </dt>

                      <dd className="mt-1 font-mono text-xs text-ink-700">
                        {record.caseNumber ?? "Not recorded"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">
                        Sale date
                      </dt>

                      <dd className="mt-1 text-xs text-ink-700">
                        {formatDate(record.saleDate)}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">
                        Property ID
                      </dt>

                      <dd className="mt-1 font-mono text-xs text-ink-700">
                        {record.propertyId ?? "Not recorded"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-400">
                        Source-listed balance
                      </dt>

                      <dd className="tnum mt-1 text-xs font-semibold text-ink-900">
                        {balance ?? "Not recorded"}
                      </dd>
                    </div>
                  </dl>
                </a>
              );
            })}
          </div>
        </Card>
      )}

      {records.length > 0 && (
        <Card>
          <CardBody>
            <p className="text-sm leading-relaxed text-ink-600">
              A source-listed balance is preserved exactly as a financial value
              reported by the source adapter. Duequity does not automatically
              treat that value as an operational recovery amount until the
              record has completed the required review and enrichment process.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}