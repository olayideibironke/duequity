import type {
  Metadata,
} from "next";

import {
  Badge,
} from "@/components/ui/badge";

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

import {
  formatCents,
} from "@/lib/format";

import {
  listLeadDistributionStaffOptions,
  searchLeadDistributionDiscoveryRecords,
  type LeadDistributionDiscoveryRecord,
  type LeadDistributionStaffOption,
} from "@/server/lead-distribution-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  assignDiscoveryLeadAction,
  uploadAndAssignLeadWorkbookAction,
} from "./actions";

export const metadata: Metadata = {
  title:
    "Lead Distribution",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface LeadDistributionPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    savedLead?: string;
    batch?: string;
    county?: string;
    state?: string;
    staff?: string;
    rows?: string;
    assigned?: string;
    skipped?: string;
  }>;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formatTimestamp(
  value:
    string,
): string {
  const date =
    new Date(
      value,
    );

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
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    },
  ).format(
    date,
  );
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
    .filter(
      Boolean,
    )
    .join(
      ", ",
    );
}

function staffClearanceLabel(
  staff:
    LeadDistributionStaffOption,
): string {
  if (
    staff.statesCleared.length ===
    0
  ) {
    return "National";
  }

  return staff.statesCleared.join(
    ", ",
  );
}

/* ========================================================================== */
/* Status messages                                                             */
/* ========================================================================== */

function UploadStatus({
  status,
  batch,
  county,
  state,
  staff,
  rows,
  assigned,
  skipped,
}: {
  status?:
    string;

  batch?:
    string;

  county?:
    string;

  state?:
    string;

  staff?:
    string;

  rows?:
    string;

  assigned?:
    string;

  skipped?:
    string;
}) {
  if (
    status ===
    "upload-assigned"
  ) {
    return (
      <Callout
        tone="positive"
        title="County lead workbook assigned"
        role="status"
      >
        {county}, {state} was uploaded and assigned to{" "}
        <strong>
          {staff}
        </strong>
        .{" "}
        <strong>
          {assigned}
        </strong>{" "}
        of{" "}
        <strong>
          {rows}
        </strong>{" "}
        workbook leads were assigned.
        {Number(
          skipped ??
            "0",
        ) >
          0
          ? ` ${skipped} record(s) were skipped because they are no longer assignable at the Discovery stage.`
          : ""}{" "}
        Batch reference:{" "}
        <strong>
          {batch}
        </strong>
        .
      </Callout>
    );
  }

  if (
    status ===
    "upload-invalid"
  ) {
    return (
      <Callout
        tone="critical"
        title="Workbook and staff member required"
      >
        Choose an Excel workbook and the staff member who should receive the leads.
      </Callout>
    );
  }

  if (
    status ===
    "upload-too-large"
  ) {
    return (
      <Callout
        tone="critical"
        title="Workbook is too large"
      >
        Lead workbooks must be 15 MB or smaller.
      </Callout>
    );
  }

  if (
    status ===
    "upload-file-type"
  ) {
    return (
      <Callout
        tone="critical"
        title="Excel workbook required"
      >
        DueQuity currently accepts .xlsx lead workbooks.
      </Callout>
    );
  }

  if (
    status ===
    "upload-columns"
  ) {
    return (
      <Callout
        tone="critical"
        title="Required DueQuity columns were not found"
      >
        The workbook must contain DueQuity Record ID, County and State columns.
      </Callout>
    );
  }

  if (
    status ===
    "upload-mixed-county"
  ) {
    return (
      <Callout
        tone="critical"
        title="One county per workbook"
      >
        Upload a workbook containing leads from one county and one state only.
      </Callout>
    );
  }

  if (
    status ===
    "upload-records-missing"
  ) {
    return (
      <Callout
        tone="critical"
        title="Some recovery records could not be verified"
      >
        One or more DueQuity Record IDs in the workbook do not exist in the current Discovery database. The workbook was not distributed.
      </Callout>
    );
  }

  if (
    status ===
    "upload-duplicates"
  ) {
    return (
      <Callout
        tone="critical"
        title="Duplicate recovery records detected"
      >
        The workbook contains duplicate DueQuity Record IDs. Remove the duplicate rows before distribution.
      </Callout>
    );
  }

  if (
    status ===
    "upload-state-not-cleared"
  ) {
    return (
      <Callout
        tone="critical"
        title="Staff clearance does not permit this workbook"
      >
        The selected staff member is not cleared to work leads in the workbook&apos;s state.
      </Callout>
    );
  }

  if (
    status ===
    "upload-none-assignable"
  ) {
    return (
      <Callout
        tone="caution"
        title="No Discovery leads available for assignment"
      >
        None of the workbook records are currently in an assignable Discovery stage.
      </Callout>
    );
  }

  if (
    status ===
    "upload-failed"
  ) {
    return (
      <Callout
        tone="critical"
        title="Workbook could not be distributed"
      >
        DueQuity could not complete the workbook upload and assignment. No successful staff distribution was recorded.
      </Callout>
    );
  }

  return null;
}

/* ========================================================================== */
/* Lead card                                                                   */
/* ========================================================================== */

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

  query:
    string;

  recentlySaved:
    boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="border-b border-line-subtle px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-xs font-semibold text-white">
                {
                  record.id
                }
              </span>

              <Badge
                tone={
                  record.status ===
                  "reviewed"
                    ? "info"
                    : "caution"
                }
              >
                {
                  record.status ===
                  "reviewed"
                    ? "Reviewed"
                    : "New"
                }
              </Badge>

              {record.activeAssignment ? (
                <Badge tone="positive">
                  Assigned
                </Badge>
              ) : (
                <Badge tone="neutral">
                  Unassigned
                </Badge>
              )}
            </div>

            <h3 className="mt-3 text-lg font-semibold text-ink-950">
              {
                record.formerOwnerName
              }
            </h3>

            <p className="mt-1 text-sm leading-relaxed text-ink-600">
              {propertyAddress(
                record,
              )}
            </p>
          </div>

          {record.sourceListedBalanceCents !==
            undefined && (
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
          )}
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
                {
                  record.formerOwnerName
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                County / state
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {
                  record.county
                },{" "}
                {
                  record.stateCode
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Parcel
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  record.parcelNumber ??
                  "Not recorded"
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Case number
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  record.caseNumber ??
                  "Not recorded"
                }
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-ink-500">
                Source
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  record.sourceName
                }
              </dd>
            </div>
          </dl>
        </div>

        <div className="px-5 py-5">
          <p className="eyebrow text-ink-500">
            Staff assignment
          </p>

          {record.activeAssignment ? (
            <div className="mt-4">
              <Callout
                tone="positive"
                title="Currently assigned"
              >
                This lead is assigned to{" "}
                <strong>
                  {
                    record.activeAssignment.staffName
                  }
                </strong>{" "}
                ({record.activeAssignment.staffEmail}).
              </Callout>

              <p className="mt-3 text-xs text-ink-500">
                Assigned{" "}
                {formatTimestamp(
                  record.activeAssignment.assignedAt,
                )}
              </p>

              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Selecting another staff member below will create a controlled reassignment. DueQuity preserves the previous assignment in permanent assignment history.
              </p>
            </div>
          ) : (
            <Callout
              className="mt-4"
              tone="neutral"
              title="Not assigned"
            >
              No ordinary staff member currently has access to this lead through the assignment workflow.
            </Callout>
          )}

          <form
            action={
              assignDiscoveryLeadAction
            }
            className="mt-5 space-y-4"
          >
            <input
              type="hidden"
              name="discoveredRecordId"
              value={
                record.id
              }
            />

            <input
              type="hidden"
              name="q"
              value={
                query
              }
            />

            <div className="space-y-2">
              <label
                htmlFor={`staff-${record.id}`}
                className="block text-sm font-semibold text-ink-800"
              >
                Assign lead to
              </label>

              <select
                id={`staff-${record.id}`}
                name="staffUserId"
                required
                defaultValue={
                  record.activeAssignment
                    ?.staffUserId ??
                  ""
                }
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              >
                <option value="">
                  Select staff member
                </option>

                {staffOptions.map(
                  (
                    staff,
                  ) => (
                    <option
                      key={
                        staff.id
                      }
                      value={
                        staff.id
                      }
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
                  {record.activeAssignment
                    ? "Save assignment"
                    : "Assign lead"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

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
      .slice(
        0,
        200,
      ) ??
    "";

  const savedLead =
    params.savedLead
      ?.trim() ??
    "";

  const shouldSearch =
    query.length >=
      2;

  const [
    staffOptions,
    searchResult,
  ] =
    await Promise.all([
      listLeadDistributionStaffOptions(
        session,
      ),

      shouldSearch
        ? searchLeadDistributionDiscoveryRecords({
            session,

            query,
          })
        : Promise.resolve({
            query,

            totalMatches:
              0,

            records:
              [],
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

        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-600">
          Upload county lead workbooks or distribute individual recovery records. Staff access remains limited to the exact records assigned to them.
        </p>
      </div>

      <UploadStatus
        status={
          params.status
        }
        batch={
          params.batch
        }
        county={
          params.county
        }
        state={
          params.state
        }
        staff={
          params.staff
        }
        rows={
          params.rows
        }
        assigned={
          params.assigned
        }
        skipped={
          params.skipped
        }
      />

      {params.status ===
        "assigned" && (
        <Callout
          tone="positive"
          title="Lead assignment saved"
          role="status"
        >
          The selected staff member now has controlled access to this recovery lead. Previous assignment history, if any, was preserved.
        </Callout>
      )}

      {params.status ===
        "invalid" && (
        <Callout
          tone="critical"
          title="Select a staff member"
          role="alert"
        >
          Choose the staff member who should receive this lead.
        </Callout>
      )}

      {params.status ===
        "state-not-cleared" && (
        <Callout
          tone="critical"
          title="Staff clearance does not permit assignment"
          role="alert"
        >
          The selected staff member is not cleared to work leads in this state.
        </Callout>
      )}

      {params.status ===
        "already-promoted" && (
        <Callout
          tone="caution"
          title="Lead already promoted"
          role="alert"
        >
          This recovery has already moved to Opportunity. Manage its assignment through the Opportunity workflow.
        </Callout>
      )}

      {params.status ===
        "not-authorized" && (
        <Callout
          tone="critical"
          title="Administrator access required"
          role="alert"
        >
          Your account is not authorized to distribute DueQuity leads.
        </Callout>
      )}

      {params.status ===
        "unavailable" && (
        <Callout
          tone="critical"
          title="Assignment could not be saved"
          role="alert"
        >
          DueQuity could not complete the lead assignment. No access change was made.
        </Callout>
      )}

      {/* ================================================================== */}
      {/* County workbook upload                                              */}
      {/* ================================================================== */}

      <Card>
        <CardHeader
          title="Upload county leads"
          description="Upload a DueQuity .xlsx workbook for one county and assign its eligible Discovery records to one staff member."
        />

        <CardBody>
          <form
            action={
              uploadAndAssignLeadWorkbookAction
            }
            className="space-y-5"
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="leadWorkbook"
                  className="block text-sm font-semibold text-ink-800"
                >
                  County lead workbook
                </label>

                <input
                  id="leadWorkbook"
                  name="leadWorkbook"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  className="block w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-800 file:mr-4 file:rounded-lg file:border-0 file:bg-ink-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                />

                <p className="text-xs leading-relaxed text-ink-500">
                  Maximum 15 MB. Workbook must include DueQuity Record ID, County and State. One county per workbook.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="uploadStaffUserId"
                  className="block text-sm font-semibold text-ink-800"
                >
                  Assign workbook to
                </label>

                <select
                  id="uploadStaffUserId"
                  name="staffUserId"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                >
                  <option value="">
                    Select staff member
                  </option>

                  {staffOptions.map(
                    (
                      staff,
                    ) => (
                      <option
                        key={
                          staff.id
                        }
                        value={
                          staff.id
                        }
                      >
                        {staff.name} · {staff.title} · {staffClearanceLabel(
                          staff,
                        )}
                      </option>
                    ),
                  )}
                </select>

                <p className="text-xs leading-relaxed text-ink-500">
                  The selected staff member receives exact record-level access to the eligible leads inside this workbook.
                </p>
              </div>
            </div>

            <Callout
              tone="neutral"
              title="Assignment-scoped staff download"
            >
              DueQuity preserves each uploaded row with its assignment batch. Staff download access will contain only the recovery leads currently assigned to that staff member, never an unrelated county-wide workbook.
            </Callout>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-accent-700 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Upload &amp; assign workbook
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* ================================================================== */}
      {/* Manual individual assignment                                       */}
      {/* ================================================================== */}

      <Card>
        <CardHeader
          title="Find individual recovery lead"
          description="Search an existing Discovery record when you need to assign or reassign one specific lead."
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
                defaultValue={
                  query
                }
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

      {query.length ===
        1 && (
        <Callout
          tone="caution"
          title="Enter more information"
        >
          Enter at least two characters to search recovery leads.
        </Callout>
      )}

      {shouldSearch &&
        searchResult.totalMatches ===
          0 && (
          <EmptyState
            title="No matching Discovery lead"
            description="No active Discovery-stage recovery record matched this search."
          />
        )}

      {searchResult.totalMatches >
        0 && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {
                  searchResult.totalMatches
                }{" "}
                matching{" "}
                {searchResult.totalMatches ===
                1
                  ? "lead"
                  : "leads"}
              </p>

              <p className="mt-0.5 text-xs text-ink-500">
                Assign only the exact recovery records the staff member should work.
              </p>
            </div>

            <Badge tone="info">
              Admin distribution
            </Badge>
          </div>

          {searchResult.records.map(
            (
              record,
            ) => (
              <DistributionLeadCard
                key={
                  record.id
                }
                record={
                  record
                }
                staffOptions={
                  staffOptions
                }
                query={
                  query
                }
                recentlySaved={
                  params.status ===
                    "assigned" &&
                  savedLead ===
                    record.id
                }
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}