"use client";

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
} from "@/components/ui/surface";

import {
  confirmLeadWorkbookAssignmentAction,
  preflightLeadWorkbookAction,
} from "@/app/pro/lead-distribution/actions";

interface StaffOption {
  id: string;
  name: string;
  email: string;
  title: string;
  role: string;
  statesCleared: string[];
}

interface WorkbookConflict {
  recordId: string;
  formerOwnerName: string;
  county: string;
  stateCode: string;
  assignedStaffUserId: string;
  assignedStaffName: string;
  assignedStaffEmail: string;
  assignedAt: string;
}

interface UnavailableRow {
  recordId: string;
  formerOwnerName: string;
  status: string;
  reason: string;
}

interface DuplicateWorkbook {
  batchId: string;
  batchReference: string;
  county: string;
  stateCode: string;
  sourceFileName?: string;
  createdAt: string;
  uploadedByName: string;
  uploadedByEmail: string;
}

interface WorkbookPreflight {
  fileName: string;
  fileSha256: string;
  sheetName: string;
  county: string;
  stateCode: string;
  staffUserId: string;
  staffName: string;
  staffEmail: string;
  sourceRowCount: number;
  availableRowCount: number;
  alreadyAssignedRowCount: number;
  unavailableRowCount: number;
  duplicateWorkbook?: DuplicateWorkbook;
  conflicts: WorkbookConflict[];
  unavailableRows: UnavailableRow[];
  canAssign: boolean;
  confirmationKey: string;
}

interface AssignmentSuccess {
  batchReference: string;
  county: string;
  stateCode: string;
  assignedStaffName: string;
  sourceRowCount: number;
  assignedRowCount: number;
  skippedRowCount: number;
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

function staffClearanceLabel(
  staff: StaffOption,
): string {
  return staff.statesCleared.length === 0
    ? "National"
    : staff.statesCleared.join(", ");
}

export function LeadWorkbookDistributionPanel({
  staffOptions,
}: {
  staffOptions: StaffOption[];
}) {
  const router =
    useRouter();

  const formRef =
    useRef<HTMLFormElement>(null);

  const [
    preflight,
    setPreflight,
  ] =
    useState<WorkbookPreflight | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState<AssignmentSuccess | null>(
      null,
    );

  const [
    isPending,
    startTransition,
  ] =
    useTransition();

  function clearInspection() {
    setPreflight(null);
    setError("");
    setSuccess(null);
  }

  function runPreflight(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const form =
      event.currentTarget;

    const formData =
      new FormData(form);

    setError("");
    setSuccess(null);
    setPreflight(null);

    startTransition(
      async () => {
        const result =
          await preflightLeadWorkbookAction(
            formData,
          );

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setPreflight(
          result.preflight as
            WorkbookPreflight,
        );
      },
    );
  }

  function confirmAssignment() {
    const form =
      formRef.current;

    if (
      !form ||
      !preflight ||
      !preflight.canAssign
    ) {
      return;
    }

    const formData =
      new FormData(form);

    formData.set(
      "confirmationKey",
      preflight.confirmationKey,
    );

    setError("");
    setSuccess(null);

    startTransition(
      async () => {
        const result =
          await confirmLeadWorkbookAssignmentAction(
            formData,
          );

        if (!result.ok) {
          setError(result.error);
          setPreflight(null);
          return;
        }

        setSuccess({
          batchReference:
            result.result.batchReference,
          county:
            result.result.county,
          stateCode:
            result.result.stateCode,
          assignedStaffName:
            result.result.assignedStaffName,
          sourceRowCount:
            result.result.sourceRowCount,
          assignedRowCount:
            result.result.assignedRowCount,
          skippedRowCount:
            result.result.skippedRowCount,
        });

        setPreflight(null);
        form.reset();
        router.refresh();
      },
    );
  }

  return (
    <Card>
      <CardHeader
        title="Upload county leads"
        description="Every workbook is checked against DueQuity's live assignment ledger before distribution. Already-owned leads and exact duplicate files are blocked."
      />

      <CardBody>
        <form
          ref={formRef}
          onSubmit={runPreflight}
          className="space-y-5"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="leadWorkbook"
                className="block text-sm font-semibold text-ink-900"
              >
                County lead workbook
              </label>

              <input
                id="leadWorkbook"
                name="leadWorkbook"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                onChange={clearInspection}
                className="block w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink-800 file:mr-4 file:rounded-lg file:border-0 file:bg-ink-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />

              <p className="text-xs leading-relaxed text-ink-500">
                Maximum 15 MB. Workbook must include DueQuity Record ID, County and State. One county per workbook.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="staffUserId"
                className="block text-sm font-semibold text-ink-900"
              >
                Assign workbook to
              </label>

              <select
                id="staffUserId"
                name="staffUserId"
                required
                defaultValue=""
                onChange={clearInspection}
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

              <p className="text-xs leading-relaxed text-ink-500">
                No staff access changes occur during preflight. Assignment happens only after a clean inspection and your confirmation.
              </p>
            </div>
          </div>

          <Callout
            tone="neutral"
            title="Duplicate-safe distribution"
          >
            DueQuity checks the exact workbook fingerprint and every DueQuity Record ID before assignment. A workbook cannot silently transfer an active lead from one staff member to another.
          </Callout>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              Step 1 of 2 · Inspect before sending
            </p>

            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending
                ? "Checking workbook..."
                : "Check workbook"}
            </button>
          </div>
        </form>

        {error ? (
          <Callout
            tone="critical"
            className="mt-5"
            title="Distribution blocked"
            role="alert"
          >
            {error}
          </Callout>
        ) : null}

        {success ? (
          <Callout
            tone="positive"
            className="mt-5"
            title="County workbook assigned and stamped"
            role="status"
          >
            <strong>
              {success.assignedRowCount}
            </strong>{" "}
            lead{success.assignedRowCount === 1 ? "" : "s"} from{" "}
            {success.county}, {success.stateCode} were assigned to{" "}
            <strong>
              {success.assignedStaffName}
            </strong>
            . Batch{" "}
            <strong>
              {success.batchReference}
            </strong>{" "}
            is now recorded in the Assignment Ledger.
            {success.skippedRowCount > 0
              ? ` ${success.skippedRowCount} non-assignable record(s) were skipped.`
              : ""}
          </Callout>
        ) : null}

        {preflight ? (
          <div className="mt-6 space-y-5 rounded-2xl border border-line bg-inset p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-ink-500">
                  Preflight result
                </p>

                <h3 className="mt-1.5 text-lg font-semibold text-ink-950">
                  {preflight.county}, {preflight.stateCode}
                </h3>

                <p className="mt-1 text-sm text-ink-600">
                  {preflight.fileName} · assigning to {preflight.staffName}
                </p>
              </div>

              <Badge
                tone={
                  preflight.canAssign
                    ? "positive"
                    : "critical"
                }
                size="md"
              >
                {preflight.canAssign
                  ? "Clear to assign"
                  : "Blocked"}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-line bg-white p-4">
                <p className="text-xs font-medium text-ink-500">
                  Workbook rows
                </p>

                <p className="mt-1 tnum text-2xl font-semibold text-ink-950">
                  {preflight.sourceRowCount}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-white p-4">
                <p className="text-xs font-medium text-ink-500">
                  Available
                </p>

                <p className="mt-1 tnum text-2xl font-semibold text-accent-700">
                  {preflight.availableRowCount}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-white p-4">
                <p className="text-xs font-medium text-ink-500">
                  Already assigned
                </p>

                <p className="mt-1 tnum text-2xl font-semibold text-critical-700">
                  {preflight.alreadyAssignedRowCount}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-white p-4">
                <p className="text-xs font-medium text-ink-500">
                  Unavailable stage
                </p>

                <p className="mt-1 tnum text-2xl font-semibold text-ink-700">
                  {preflight.unavailableRowCount}
                </p>
              </div>
            </div>

            {preflight.duplicateWorkbook ? (
              <Callout
                tone="critical"
                title="Exact workbook already distributed"
              >
                This file has the same SHA-256 fingerprint as batch{" "}
                <strong>
                  {preflight.duplicateWorkbook.batchReference}
                </strong>
                , recorded {formatTimestamp(
                  preflight.duplicateWorkbook.createdAt,
                )} by {preflight.duplicateWorkbook.uploadedByName}. DueQuity will not create a duplicate batch.
              </Callout>
            ) : null}

            {preflight.conflicts.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-critical-200 bg-white">
                <div className="border-b border-critical-100 bg-critical-50 px-4 py-3">
                  <p className="text-sm font-semibold text-critical-800">
                    Active assignment conflicts
                  </p>

                  <p className="mt-1 text-xs text-critical-700">
                    These records already belong to staff. Bulk upload cannot transfer them.
                  </p>
                </div>

                <div className="divide-y divide-line-subtle">
                  {preflight.conflicts
                    .slice(0, 12)
                    .map(
                      (conflict) => (
                        <div
                          key={conflict.recordId}
                          className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink-900">
                              {conflict.formerOwnerName}
                            </p>

                            <p className="mt-0.5 break-all font-mono text-2xs text-ink-500">
                              {conflict.recordId}
                            </p>
                          </div>

                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-critical-700">
                              ASSIGNED · {conflict.assignedStaffName}
                            </p>

                            <p className="mt-0.5 text-xs text-ink-500">
                              {conflict.assignedStaffEmail}
                            </p>
                          </div>

                          <p className="text-xs text-ink-500">
                            {formatTimestamp(
                              conflict.assignedAt,
                            )}
                          </p>
                        </div>
                      ),
                    )}
                </div>

                {preflight.conflicts.length > 12 ? (
                  <p className="border-t border-line-subtle px-4 py-3 text-xs text-ink-500">
                    + {preflight.conflicts.length - 12} additional assigned conflict(s).
                  </p>
                ) : null}
              </div>
            ) : null}

            {preflight.unavailableRows.length > 0 ? (
              <details className="rounded-xl border border-line bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-800">
                  {preflight.unavailableRows.length} record(s) are no longer assignable at Discovery stage
                </summary>

                <div className="divide-y divide-line-subtle border-t border-line-subtle">
                  {preflight.unavailableRows
                    .slice(0, 20)
                    .map(
                      (row) => (
                        <div
                          key={row.recordId}
                          className="px-4 py-3"
                        >
                          <p className="text-sm font-medium text-ink-900">
                            {row.formerOwnerName}
                          </p>

                          <p className="mt-1 text-xs text-ink-500">
                            {row.recordId} · {row.reason}
                          </p>
                        </div>
                      ),
                    )}
                </div>
              </details>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="max-w-2xl text-xs leading-relaxed text-ink-500">
                Step 2 of 2 · Confirming creates an immutable batch record and individual lead assignment stamps. If ownership changes after this preflight, the database blocks the batch.
              </p>

              <button
                type="button"
                disabled={
                  isPending ||
                  !preflight.canAssign
                }
                onClick={confirmAssignment}
                className="rounded-xl bg-accent-700 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending
                  ? "Assigning..."
                  : preflight.canAssign
                    ? `Confirm & assign ${preflight.availableRowCount} lead${preflight.availableRowCount === 1 ? "" : "s"}`
                    : "Assignment blocked"}
              </button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}