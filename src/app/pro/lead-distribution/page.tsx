import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";

import {
  LeadWorkbookDistributionPanel,
} from "@/components/pro/lead-workbook-distribution-panel";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@/components/ui/surface";

import { formatCents } from "@/lib/format";

import {
  listLeadDistributionLedger,
  listLeadDistributionStaffOptions,
  searchLeadDistributionDiscoveryRecords,
  type LeadDistributionDiscoveryRecord,
  type LeadDistributionLedger,
  type LeadDistributionLedgerBatch,
  type LeadDistributionLedgerLead,
  type LeadDistributionStaffOption,
} from "@/server/lead-distribution-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  assignDiscoveryLeadAction,
  reassignDiscoveryLeadAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Lead Distribution",
};

export const dynamic =
  "force-dynamic";

interface LeadDistributionPageProps {
  searchParams: Promise<{
    q?: string;
    staff?: string;
    status?: string;
    savedLead?: string;
  }>;
}

function formatTimestamp(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function propertyAddress(
  record:
    LeadDistributionDiscoveryRecord,
): string {
  return [
    record.addressLine1,
    record.city,
    record.stateCode,
    record.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function staffClearanceLabel(
  staff:
    LeadDistributionStaffOption,
): string {
  return staff.statesCleared.length ===
    0
    ? "National"
    : staff.statesCleared.join(", ");
}

function batchTone(
  status:
    LeadDistributionLedgerBatch["status"],
):
  | "positive"
  | "neutral"
  | "critical" {
  switch (status) {
    case "active":
      return "positive";

    case "cancelled":
      return "critical";

    default:
      return "neutral";
  }
}

function normalizeStaffSearch(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function recipientMatchesStaff(
  recipient: {
    name: string;
    email: string;
  },
  staffQuery: string,
): boolean {
  const query =
    normalizeStaffSearch(
      staffQuery,
    );

  if (!query) {
    return true;
  }

  return (
    recipient.name
      .toLowerCase()
      .includes(query) ||
    recipient.email
      .toLowerCase()
      .includes(query)
  );
}

function batchMatchesStaff(
  batch:
    LeadDistributionLedgerBatch,
  staffQuery: string,
): boolean {
  if (
    !normalizeStaffSearch(
      staffQuery,
    )
  ) {
    return true;
  }

  return batch.assignedTo.some(
    (recipient) =>
      recipientMatchesStaff(
        recipient,
        staffQuery,
      ),
  );
}

function manualAssignmentMatchesStaff(
  assignment:
    LeadDistributionLedgerLead,
  staffQuery: string,
): boolean {
  return recipientMatchesStaff(
    {
      name:
        assignment.assignedToName,
      email:
        assignment.assignedToEmail,
    },
    staffQuery,
  );
}

function batchLeadCountForStaff({
  batch,
  staffQuery,
}: {
  batch:
    LeadDistributionLedgerBatch;
  staffQuery: string;
}): number {
  const query =
    normalizeStaffSearch(
      staffQuery,
    );

  if (!query) {
    return batch.sourceRecordCount;
  }

  return batch.assignedTo
    .filter(
      (recipient) =>
        recipientMatchesStaff(
          recipient,
          staffQuery,
        ),
    )
    .reduce(
      (
        total,
        recipient,
      ) =>
        total +
        recipient.count,
      0,
    );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-4 shadow-sm">
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">
        {label}
      </p>

      <p className="mt-2 tnum text-2xl font-semibold text-ink-950">
        {value}
      </p>

      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        {note}
      </p>
    </div>
  );
}

function AssignmentStatus({
  status,
}: {
  status?: string;
}) {
  switch (status) {
    case "assigned":
      return (
        <Callout
          tone="positive"
          title="Lead assignment saved"
          role="status"
        >
          The lead was assigned and stamped in the DueQuity assignment ledger.
        </Callout>
      );

    case "reassigned":
      return (
        <Callout
          tone="positive"
          title="Lead reassignment completed"
          role="status"
        >
          The prior assignment remains preserved in history and the new active owner is now stamped on the lead.
        </Callout>
      );

    case "already-assigned":
      return (
        <Callout
          tone="caution"
          title="Lead is already assigned"
          role="alert"
        >
          DueQuity blocked the ordinary assignment. Use the explicit Reassign Lead control on the stamped lead only if you intentionally want to transfer ownership.
        </Callout>
      );

    case "reassign-confirmation-required":
      return (
        <Callout
          tone="caution"
          title="Reassignment confirmation required"
          role="alert"
        >
          Select a replacement staff member and confirm that you intend to end the current active assignment.
        </Callout>
      );

    case "reassign-stale":
      return (
        <Callout
          tone="caution"
          title="Assignment changed before reassignment"
          role="alert"
        >
          DueQuity did not transfer the lead because the active assignment changed after this page loaded. Refresh and review the current stamp before trying again.
        </Callout>
      );

    case "reassign-failed":
      return (
        <Callout
          tone="critical"
          title="Lead could not be reassigned"
          role="alert"
        >
          No intentional reassignment was completed. Refresh the page and review the current assignment stamp.
        </Callout>
      );

    case "invalid":
      return (
        <Callout
          tone="critical"
          title="Select a staff member"
          role="alert"
        >
          Choose the staff member who should receive this lead.
        </Callout>
      );

    case "state-not-cleared":
      return (
        <Callout
          tone="critical"
          title="Staff clearance does not permit assignment"
          role="alert"
        >
          The selected staff member is not cleared to work leads in this state.
        </Callout>
      );

    case "already-promoted":
      return (
        <Callout
          tone="caution"
          title="Lead already promoted"
          role="alert"
        >
          This recovery has already moved to Opportunity. Manage its assignment through the Opportunity workflow.
        </Callout>
      );

    case "not-authorized":
      return (
        <Callout
          tone="critical"
          title="Administrator access required"
          role="alert"
        >
          Your account is not authorized to distribute DueQuity leads.
        </Callout>
      );

    case "unavailable":
      return (
        <Callout
          tone="critical"
          title="Assignment could not be saved"
          role="alert"
        >
          DueQuity could not complete the lead assignment. No access change was made.
        </Callout>
      );

    default:
      return null;
  }
}

function ActiveAssignmentStamp({
  record,
}: {
  record:
    LeadDistributionDiscoveryRecord;
}) {
  const assignment =
    record.activeAssignment;

  if (!assignment) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-accent-200 bg-accent-50 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xs font-bold uppercase tracking-[0.16em] text-accent-800">
            Assignment stamp
          </p>

          <p className="mt-1 text-base font-semibold text-ink-950">
            ASSIGNED TO {assignment.staffName}
          </p>

          <p className="mt-0.5 text-xs text-ink-600">
            {assignment.staffEmail}
          </p>
        </div>

        <Badge tone="positive">
          Active
        </Badge>
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium text-ink-500">
            Date sent
          </dt>

          <dd className="mt-1 font-semibold text-ink-900">
            {formatTimestamp(
              assignment.assignedAt,
            )}
          </dd>
        </div>

        <div>
          <dt className="font-medium text-ink-500">
            Sent by
          </dt>

          <dd className="mt-1 font-semibold text-ink-900">
            {assignment.assignedByName ??
              "DueQuity Administrator"}
          </dd>

          {assignment.assignedByEmail ? (
            <dd className="mt-0.5 text-ink-500">
              {assignment.assignedByEmail}
            </dd>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <dt className="font-medium text-ink-500">
            Staff receipt
          </dt>

          <dd className="mt-1 font-semibold text-ink-900">
            {assignment.firstSeenAt
              ? `Viewed ${formatTimestamp(
                  assignment.firstSeenAt,
                )}`
              : "Not viewed yet"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function DistributionLeadCard({
  record,
  staffOptions,
  query,
  recentlySaved,
}: {
  record:
    LeadDistributionDiscoveryRecord;
  staffOptions:
    LeadDistributionStaffOption[];
  query: string;
  recentlySaved: boolean;
}) {
  const assignment =
    record.activeAssignment;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="border-b border-line-subtle px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-xs font-semibold text-white">
                {record.id}
              </span>

              <Badge
                tone={
                  record.status ===
                  "reviewed"
                    ? "info"
                    : "caution"
                }
              >
                {record.status ===
                "reviewed"
                  ? "Reviewed"
                  : "New"}
              </Badge>

              <Badge
                tone={
                  assignment
                    ? "positive"
                    : "neutral"
                }
              >
                {assignment
                  ? "Assigned"
                  : "Unassigned"}
              </Badge>
            </div>

            <h3 className="mt-3 text-lg font-semibold text-ink-950">
              {record.formerOwnerName}
            </h3>

            <p className="mt-1 text-sm leading-relaxed text-ink-600">
              {propertyAddress(record)}
            </p>
          </div>

          {record.sourceListedBalanceCents !==
          undefined ? (
            <div className="text-right">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                Source-listed surplus
              </p>

              <p className="mt-1 tnum text-lg font-semibold text-ink-950">
                {formatCents(
                  record.sourceListedBalanceCents,
                )}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_1fr]">
        <div className="border-b border-line-subtle px-5 py-5 lg:border-b-0 lg:border-r">
          <p className="eyebrow text-ink-500">
            Recovery lead
          </p>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-ink-500">
                Former owner
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {record.formerOwnerName}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                County / state
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {record.county}, {record.stateCode}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Parcel
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {record.parcelNumber ??
                  "Not recorded"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Case
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {record.caseNumber ??
                  "Not recorded"}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-ink-500">
                Source
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {record.sourceName}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 px-5 py-5">
          {assignment ? (
            <>
              <ActiveAssignmentStamp
                record={record}
              />

              <Callout
                tone="caution"
                title="Explicit reassignment only"
              >
                This lead already has an active owner. Ordinary assignment is blocked. Use this control only when you deliberately intend to transfer the lead to another staff member.
              </Callout>

              <form
                action={
                  reassignDiscoveryLeadAction
                }
                className="space-y-4"
              >
                <input
                  type="hidden"
                  name="discoveredRecordId"
                  value={record.id}
                />

                <input
                  type="hidden"
                  name="expectedCurrentAssignmentId"
                  value={assignment.id}
                />

                <input
                  type="hidden"
                  name="q"
                  value={query}
                />

                <div className="space-y-2">
                  <label
                    htmlFor={`reassign-${record.id}`}
                    className="block text-sm font-medium text-ink-800"
                  >
                    Reassign to
                  </label>

                  <select
                    id={`reassign-${record.id}`}
                    name="staffUserId"
                    required
                    defaultValue=""
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  >
                    <option value="">
                      Select replacement staff member
                    </option>

                    {staffOptions
                      .filter(
                        (staff) =>
                          staff.id !==
                          assignment.staffUserId,
                      )
                      .map(
                        (staff) => (
                          <option
                            key={staff.id}
                            value={staff.id}
                          >
                            {staff.name} · {staff.title} · {staffClearanceLabel(
                              staff,
                            )}
                          </option>
                        ),
                      )}
                  </select>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-line bg-inset px-4 py-3 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="confirmReassign"
                    value="yes"
                    required
                    className="mt-0.5 h-4 w-4"
                  />

                  <span>
                    I understand this will end the current active assignment to{" "}
                    <strong>
                      {assignment.staffName}
                    </strong>{" "}
                    and create a new auditable assignment for the selected staff member.
                  </span>
                </label>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-xl border border-critical-300 bg-white px-5 py-3 text-sm font-semibold text-critical-700 transition hover:bg-critical-50"
                  >
                    Reassign lead
                  </button>
                </div>
              </form>
            </>
          ) : (
            <form
              action={
                assignDiscoveryLeadAction
              }
              className="space-y-4"
            >
              <input
                type="hidden"
                name="discoveredRecordId"
                value={record.id}
              />

              <input
                type="hidden"
                name="q"
                value={query}
              />

              <div className="space-y-2">
                <label
                  htmlFor={`assign-${record.id}`}
                  className="block text-sm font-medium text-ink-800"
                >
                  Assign to staff member
                </label>

                <select
                  id={`assign-${record.id}`}
                  name="staffUserId"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                >
                  <option value="">
                    Select staff member
                  </option>

                  {staffOptions.map(
                    (staff) => (
                      <option
                        key={staff.id}
                        value={staff.id}
                      >
                        {staff.name} · {staff.title} · {staffClearanceLabel(
                          staff,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <Callout
                tone="neutral"
                title="Record-level access"
              >
                Assignment gives the selected staff member access to this specific recovery lead. It does not grant access to every lead in {record.county}.
              </Callout>

              <div className="flex justify-end">
                {recentlySaved ? (
                  <button
                    type="button"
                    disabled
                    className="rounded-xl bg-accent-700 px-5 py-3 text-sm font-semibold text-white opacity-90"
                  >
                    ✓ Saved
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                  >
                    Assign lead
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function BatchLedger({
  batch,
}: {
  batch:
    LeadDistributionLedgerBatch;
}) {
  const recipientLabel =
    batch.assignedTo.length === 0
      ? "No active recipient"
      : batch.assignedTo
          .map(
            (recipient) =>
              `${recipient.name} (${recipient.count})`,
          )
          .join(", ");

  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={batchTone(
                batch.status,
              )}
            >
              {batch.status.toUpperCase()}
            </Badge>

            <span className="text-xs font-medium text-ink-500">
              {batch.sourceRecordCount}{" "}
              lead
              {batch.sourceRecordCount === 1
                ? ""
                : "s"}
            </span>
          </div>

          <h3 className="mt-3 text-lg font-semibold text-ink-950">
            {batch.county}, {batch.stateCode}
          </h3>

          <p className="mt-2 break-all text-sm font-semibold text-ink-800">
            {batch.sourceFileName ??
              "Manual lead distribution"}
          </p>

          <p className="mt-2 text-sm text-ink-600">
            Assigned to {recipientLabel}
          </p>

          <p className="mt-1 text-xs text-ink-500">
            Sent{" "}
            {formatTimestamp(
              batch.firstAssignedAt ??
                batch.createdAt,
            )}{" "}
            by {batch.uploadedByName}
          </p>
        </div>

        <div className="grid min-w-[210px] grid-cols-2 gap-4 text-right">
          <div className="rounded-xl bg-inset px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">
              Active
            </p>

            <p className="mt-1 tnum text-xl font-semibold text-ink-950">
              {batch.activeAssignmentCount}
            </p>
          </div>

          <div className="rounded-xl bg-inset px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">
              Viewed
            </p>

            <p className="mt-1 tnum text-xl font-semibold text-ink-950">
              {batch.viewedAssignmentCount}/
              {batch.activeAssignmentCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignmentLedger({
  ledger,
  staffQuery,
}: {
  ledger:
    LeadDistributionLedger;
  staffQuery: string;
}) {
  const normalizedQuery =
    normalizeStaffSearch(
      staffQuery,
    );

  const filteredBatches =
    ledger.batches.filter(
      (batch) =>
        batchMatchesStaff(
          batch,
          staffQuery,
        ),
    );

  const filteredManualAssignments =
    ledger.manualAssignments.filter(
      (assignment) =>
        manualAssignmentMatchesStaff(
          assignment,
          staffQuery,
        ),
    );

  const workbookLeadCount =
    filteredBatches.reduce(
      (
        total,
        batch,
      ) =>
        total +
        batchLeadCountForStaff({
          batch,
          staffQuery,
        }),
      0,
    );

  const historicalAssignmentCount =
    workbookLeadCount +
    filteredManualAssignments.length;

  return (
    <Card>
      <CardHeader
        title="Assignment ledger"
        description="Compact distribution history by county and source workbook. Search a staff member to see every historical distribution tied to that person."
        actions={
          <Badge tone="info">
            System of record
          </Badge>
        }
      />

      <CardBody>
        <div className="rounded-2xl border border-line bg-inset p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-950">
                Search staff distribution history
              </p>

              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Type a staff name or DueQuity email to find every county workbook historically assigned to that staff member.
              </p>
            </div>

            {normalizedQuery ? (
              <Badge tone="info">
                Staff history filter
              </Badge>
            ) : null}
          </div>

          <form
            method="get"
            action="/pro/lead-distribution"
            className="mt-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                name="staff"
                type="search"
                defaultValue={
                  staffQuery
                }
                placeholder="Example: Tolulope Ladejebi"
                className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />

              <button
                type="submit"
                className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                Search staff history
              </button>

              {normalizedQuery ? (
                <a
                  href="/pro/lead-distribution"
                  className="rounded-xl border border-line bg-white px-5 py-3 text-center text-sm font-semibold text-ink-700 transition hover:bg-inset"
                >
                  Clear
                </a>
              ) : null}
            </div>
          </form>
        </div>

        <Callout
          tone="neutral"
          className="mt-5"
          title="Duplicate-control visibility"
        >
          County workbook preflight still checks the full assignment history behind the scenes. The ledger intentionally shows county and file summaries instead of expanding every individual lead.
        </Callout>

        {normalizedQuery ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                Matching files
              </p>

              <p className="mt-1 tnum text-xl font-semibold text-ink-950">
                {
                  filteredBatches.length
                }
              </p>
            </div>

            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                Historical lead assignments
              </p>

              <p className="mt-1 tnum text-xl font-semibold text-ink-950">
                {
                  historicalAssignmentCount
                }
              </p>
            </div>

            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                Staff search
              </p>

              <p className="mt-1 truncate text-sm font-semibold text-ink-950">
                {staffQuery}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          {filteredBatches.length >
          0 ? (
            filteredBatches.map(
              (batch) => (
                <BatchLedger
                  key={batch.id}
                  batch={batch}
                />
              ),
            )
          ) : normalizedQuery ? (
            <EmptyState
              title="No staff distribution history found"
              description={`No county workbook assignment history matched "${staffQuery}". Try the staff member's full name or DueQuity email address.`}
            />
          ) : (
            <EmptyState
              title="No assignment batches yet"
              description="County workbook distributions will appear here after they are confirmed."
            />
          )}
        </div>

        {filteredManualAssignments.length >
        0 ? (
          <div className="mt-5 rounded-2xl border border-line bg-inset px-5 py-4">
            <p className="text-sm font-semibold text-ink-900">
              Individual assignment history
            </p>

            <p className="mt-1 text-xs text-ink-500">
              {
                filteredManualAssignments.length
              }{" "}
              historical individual assignment
              {filteredManualAssignments.length ===
              1
                ? ""
                : "s"}{" "}
              {normalizedQuery
                ? `also tied to ${staffQuery}.`
                : "recorded."}{" "}
              Lead-level contents remain available through individual lead search rather than expanding inside the ledger.
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export default async function LeadDistributionPage({
  searchParams,
}: LeadDistributionPageProps) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const isAdmin =
    session.user.role ===
      "super_admin" ||
    session.user.role ===
      "administrator";

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        <div>
          <p className="eyebrow text-ink-500">
            Administration
          </p>

          <h1 className="mt-1.5 text-2xl sm:text-3xl">
            Lead Distribution
          </h1>
        </div>

        <Callout
          tone="critical"
          title="Administrator access required"
        >
          Lead upload, assignment and reassignment are restricted to DueQuity Administrators.
        </Callout>
      </div>
    );
  }

  const params =
    await searchParams;

  const query =
    params.q
      ?.trim()
      .slice(0, 200) ??
    "";

  const staffQuery =
    params.staff
      ?.trim()
      .slice(0, 200) ??
    "";

  const savedLead =
    params.savedLead
      ?.trim() ??
    "";

  const shouldSearch =
    query.length >= 2;

  const [
    staffOptions,
    ledger,
    searchResult,
  ] =
    await Promise.all([
      listLeadDistributionStaffOptions(
        session,
      ),

      listLeadDistributionLedger(
        session,
      ),

      shouldSearch
        ? searchLeadDistributionDiscoveryRecords({
            session,
            query,
          })
        : Promise.resolve({
            query,
            totalMatches: 0,
            records: [],
          }),
    ]);

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-ink-500">
          Administration
        </p>

        <h1 className="mt-1.5 text-2xl sm:text-3xl">
          Lead Distribution
        </h1>

        <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-ink-600">
          Preflight county workbooks, prevent accidental duplicate distribution, stamp every active assignment, and review the complete staff distribution history from one controlled workspace.
        </p>
      </div>

      <AssignmentStatus
        status={params.status}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Active distributed leads"
          value={
            ledger.activeAssignmentRecords
          }
          note="Exactly one active owner is permitted per recovery lead."
        />

        <Metric
          label="Viewed by staff"
          value={`${ledger.viewedActiveAssignments}/${ledger.activeAssignmentRecords}`}
          note="First-view receipts recorded by My Leads."
        />

        <Metric
          label="Assignment batches"
          value={ledger.batchCount}
          note="County workbook batches preserved with file fingerprints."
        />

        <Metric
          label="Historical assignments"
          value={
            ledger.totalAssignmentRecords
          }
          note="Active and ended assignment records remain auditable."
        />
      </div>

      <LeadWorkbookDistributionPanel
        staffOptions={staffOptions}
      />

      <AssignmentLedger
        ledger={ledger}
        staffQuery={
          staffQuery
        }
      />

      <Card>
        <CardHeader
          title="Find individual recovery lead"
          description="Search an existing Discovery record to see its assignment stamp, assign it if unowned, or explicitly reassign it when a deliberate transfer is required."
        />

        <CardBody>
          <form
            method="get"
            action="/pro/lead-distribution"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Example: Charles Cooper"
                className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />

              <button
                type="submit"
                className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                Find lead
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {query.length === 1 ? (
        <Callout
          tone="caution"
          title="Enter more information"
        >
          Enter at least two characters to search recovery leads.
        </Callout>
      ) : null}

      {shouldSearch &&
      searchResult.totalMatches === 0 ? (
        <EmptyState
          title="No matching Discovery lead"
          description="No active Discovery-stage recovery record matched this search."
        />
      ) : null}

      {searchResult.totalMatches > 0 ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {searchResult.totalMatches}{" "}
                matching{" "}
                {searchResult.totalMatches ===
                1
                  ? "lead"
                  : "leads"}
              </p>

              <p className="mt-0.5 text-xs text-ink-500">
                Every currently assigned record carries its staff, date and view stamp. Ordinary assignment cannot overwrite it.
              </p>
            </div>

            <Badge tone="info">
              Admin distribution
            </Badge>
          </div>

          {searchResult.records.map(
            (record) => (
              <DistributionLeadCard
                key={record.id}
                record={record}
                staffOptions={
                  staffOptions
                }
                query={query}
                recentlySaved={
                  (params.status ===
                    "assigned" ||
                    params.status ===
                      "reassigned") &&
                  savedLead === record.id
                }
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}