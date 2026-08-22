"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";

/**
 * CLAIM FILING PACKAGE PANEL
 *
 * Operational control for:
 *
 *   1. preparing a frozen filing-package snapshot,
 *   2. submitting that snapshot for independent human review,
 *   3. approving or returning it,
 *   4. preserving the explicit boundary that no court or agency submission
 *      occurs through this workflow.
 *
 * The server remains authoritative for:
 *
 *   - staff identity
 *   - permissions
 *   - state clearance
 *   - current jurisdiction approval
 *   - Startup Green Lane status
 *   - filing readiness
 *   - reviewer independence
 *   - package transition eligibility
 *
 * The client does not recalculate authorization or separation of duties.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type FilingPackageStatus =
  | "prepared"
  | "under_review"
  | "pre_filing_approved"
  | "returned_for_changes"
  | "superseded";

interface FilingPackageDocumentSnapshot {
  kind: string;

  documentId: string;

  originalFileName?: string;

  reviewedByUserId?: string;

  reviewedAt?: string;
}

interface FilingPackageReadinessControlSnapshot {
  key: string;

  label: string;

  complete: boolean;

  detail: string;
}

interface FilingPackageSnapshot {
  claimId: string;

  claimReference: string;

  opportunityId: string;

  jurisdictionId: string;

  jurisdictionPackageVersion: number;

  jurisdictionLegalRuleVersion: number;

  paymentRoute: string;

  launchPaymentTrack: string;

  representativeMayFile: string;

  representativeMayReceivePayment: string;

  assignmentRequiredForRepresentativePayment: string;

  feeCollectionMethod: string;

  claimantId: string;

  claimantLegalName: string;

  filingDeadline?: string;

  legalLane: string;

  legalRationale: string;

  legalHumanDetermined: boolean;

  legalReviewedBy?: string;

  legalLastReviewedAt?: string;

  commercialQuoteId: string;

  commercialSnapshotHash: string;

  commercialPolicyId: string;

  commercialPolicyVersion: number;

  commercialTierId: string;

  commercialRecoveryAmount: number;

  commercialProjectedFee: number;

  commercialQuoteLegalRuleVersionSnapshot: number;

  commercialLegalFeeCapPercentSnapshot?: number;

  commercialLegalFeeCapAmountSnapshot?: number;

  feeAgreementId: string;

  feeAgreementLegalRuleVersionSnapshot: number;

  feeAgreementDocumentId: string;

  serviceAgreementSignedAt: string;

  serviceAgreementCancellationDeadline?: string;

  acceptedDocuments: FilingPackageDocumentSnapshot[];

  readinessControls: FilingPackageReadinessControlSnapshot[];

  readinessCompletedCount: number;

  readinessTotalCount: number;
}

interface FilingPackage {
  id: string;

  claimId: string;

  claimReference: string;

  version: number;

  status: FilingPackageStatus;

  snapshot: FilingPackageSnapshot;

  snapshotHash: string;

  preparedByUserId: string;

  preparedAt: string;

  submittedForReviewByUserId?: string;

  submittedForReviewAt?: string;

  reviewedByUserId?: string;

  reviewedAt?: string;

  reviewNote?: string;

  preFilingApprovedAt?: string;

  returnedAt?: string;

  returnReason?: string;

  supersededAt?: string;

  supersededByPackageId?: string;
}

interface FilingPackageAuditEntry {
  id: string;

  claimId: string;

  packageId: string;

  action: string;

  actorUserId: string;

  occurredAt: string;

  detail?: string;
}

interface FilingReadiness {
  readyToPrepare: boolean;

  completedControlCount: number;

  outstandingControlCount: number;

  controls: Array<{
    key: string;

    label: string;

    complete: boolean;

    detail: string;
  }>;

  nextInternalAction: string;
}

interface FilingPackageApiPayload {
  ok: true;

  claim: {
    id: string;

    reference: string;

    jurisdictionId: string;

    filingDeadline?: string;
  };

  jurisdiction: {
    id: string;

    agencyName: string;

    stateCode: string;

    ruleVersion: number;
  };

  readiness: FilingReadiness;

  currentPackage: FilingPackage | null;

  packageHistory: FilingPackage[];

  audit: FilingPackageAuditEntry[];

  permissions: {
    actorUserId: string;

    mayRead: boolean;

    mayWrite: boolean;

    mayPerformPreFilingReview: boolean;

    reviewerIndependent: boolean;

    canPrepare: boolean;

    canSubmitForReview: boolean;

    canApproveOrReturn: boolean;

    canApprovePreFiling: boolean;

    canReturnForChanges: boolean;
  };

  submission: {
    submitted: boolean;

    message: string;
  };
}

interface ApiErrorPayload {
  ok?: false;

  error?: string;
}

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

function statusLabel(status: FilingPackageStatus): string {
  switch (status) {
    case "prepared":
      return "Prepared";

    case "under_review":
      return "Under review";

    case "pre_filing_approved":
      return "Pre-filing approved";

    case "returned_for_changes":
      return "Returned for changes";

    case "superseded":
      return "Superseded";

    default:
      return status;
  }
}

function statusTone(
  status: FilingPackageStatus,
): "positive" | "caution" | "critical" | "neutral" {
  switch (status) {
    case "pre_filing_approved":
      return "positive";

    case "under_review":
    case "prepared":
      return "caution";

    case "returned_for_changes":
      return "critical";

    default:
      return "neutral";
  }
}

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return "Not recorded";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",

    timeStyle: "short",
  }).format(parsed);
}

function documentKindLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function valueLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",

    currency: "USD",

    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "Not recorded";
  }

  return `${(value * 100).toFixed(Number.isInteger(value * 100) ? 0 : 1)}%`;
}

/* ========================================================================== */
/* Small UI                                                                    */
/* ========================================================================== */

function Gate({
  complete,
  label,
}: {
  complete: boolean;

  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-inset px-3 py-2.5">
      <span
        aria-hidden
        className={
          complete
            ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-600 text-[11px] font-bold text-white"
            : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[11px] font-bold text-ink-400"
        }
      >
        {complete ? "✓" : "·"}
      </span>

      <span
        className={
          complete ? "text-xs font-medium text-ink-800" : "text-xs text-ink-500"
        }
      >
        {label}
      </span>
    </div>
  );
}

function SnapshotFact({
  label,
  children,
}: {
  label: string;

  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-inset px-3 py-3">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </dt>

      <dd className="mt-1 break-words text-sm font-medium text-ink-800">
        {children}
      </dd>
    </div>
  );
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimFilingPackagePanel({ claimId }: { claimId: string }) {
  const router = useRouter();

  const [data, setData] = useState<FilingPackageApiPayload | null>(null);

  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState<string | null>(null);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [reviewNote, setReviewNote] = useState("");

  const [returnReason, setReturnReason] = useState("");

  /* ======================================================================== */
  /* Load                                                                      */
  /* ======================================================================== */

  /**
   * Fetch current state.
   *
   * Contains no state write, so calling it directly from an effect body cannot
   * cascade a render before the browser has painted. The caller decides what to
   * do with the payload.
   */
  const fetchFilingPackage = useCallback(
    async (signal?: AbortSignal): Promise<FilingPackageApiPayload> => {
      const response = await fetch(
        `/api/pro/claims/${encodeURIComponent(claimId)}/filing-package`,
        {
          method: "GET",
          cache: "no-store",
          signal,
          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload = (await response.json()) as
        FilingPackageApiPayload | ApiErrorPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Filing package state could not be loaded.",
        );
      }

      return payload;
    },
    [claimId],
  );

  /**
   * Reload after a mutation.
   *
   * Only ever called from an event handler, so a synchronous state write here is
   * correct and expected.
   */
  const load = useCallback(async () => {
    try {
      setData(await fetchFilingPackage());
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Filing package state could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchFilingPackage]);

  /*
   * Initial load.
   *
   * The effect body calls only the setState-free fetch. State is applied in the
   * promise callback, and the request is aborted if the panel unmounts first so
   * nothing writes to an unmounted component.
   */
  useEffect(() => {
    const controller = new AbortController();

    fetchFilingPackage(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;

        setData(payload);
        setError("");
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Filing package state could not be loaded.",
        );

        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [fetchFilingPackage]);

  /* ======================================================================== */
  /* Action                                                                    */
  /* ======================================================================== */

  async function runAction(
    actionName:
      | "prepare"
      | "submit_for_review"
      | "approve_pre_filing"
      | "return_for_changes",
    successMessage: string,
  ) {
    setAction(actionName);

    setError("");

    setSuccess("");

    try {
      if (actionName === "return_for_changes" && !returnReason.trim()) {
        throw new Error(
          "Enter a return reason before returning the filing package.",
        );
      }

      const response = await fetch(
        `/api/pro/claims/${encodeURIComponent(claimId)}/filing-package`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            Accept: "application/json",
          },

          body: JSON.stringify({
            action: actionName,

            reviewNote:
              actionName === "approve_pre_filing"
                ? reviewNote.trim() || undefined
                : undefined,

            returnReason:
              actionName === "return_for_changes"
                ? returnReason.trim()
                : undefined,
          }),
        },
      );

      const payload = (await response.json()) as
        FilingPackageApiPayload | ApiErrorPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "The filing-package action could not be completed.",
        );
      }

      setSuccess(successMessage);

      if (actionName === "return_for_changes") {
        setReturnReason("");
      }

      if (actionName === "approve_pre_filing") {
        setReviewNote("");
      }

      setData(payload);

      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The filing-package action could not be completed.",
      );
    } finally {
      setAction(null);
    }
  }

  /* ======================================================================== */
  /* Loading                                                                   */
  /* ======================================================================== */

  if (loading && !data) {
    return (
      <div className="rounded-md border border-line bg-inset px-4 py-5">
        <p className="text-sm font-medium text-ink-700">
          Loading filing package
        </p>

        <p className="mt-1 text-xs text-ink-500">
          Reading live filing readiness and persisted package-review state.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-md border border-critical-200 bg-critical-50 px-4 py-4">
        <p className="text-sm font-semibold text-critical-800">
          Filing package unavailable
        </p>

        <p className="mt-1 text-xs leading-relaxed text-critical-700">
          {error || "The filing-package workflow could not be loaded."}
        </p>

        <button
          type="button"
          onClick={() => {
            void load();
          }}
          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2 text-sm font-semibold text-critical-800 transition hover:bg-critical-50"
        >
          Try again
        </button>
      </div>
    );
  }

  const currentPackage = data.currentPackage;

  const prepared = Boolean(currentPackage);

  const submittedForReview = Boolean(
    currentPackage &&
    (currentPackage.status === "under_review" ||
      currentPackage.status === "pre_filing_approved"),
  );

  const preFilingApproved = currentPackage?.status === "pre_filing_approved";

  const reviewerIndependent = data.permissions.reviewerIndependent;

  const reviewerDisplay = !data.permissions.mayPerformPreFilingReview
    ? "Current role cannot perform pre-filing review"
    : reviewerIndependent
      ? data.permissions.actorUserId
      : "Independent reviewer required";

  const currentSnapshot = currentPackage?.snapshot;

  /* ======================================================================== */
  /* UI                                                                        */
  /* ======================================================================== */

  return (
    <div className="min-w-0 space-y-5">
      {/* ================================================================== boundary */}
      <div className="rounded-md border border-caution-200 bg-caution-50 px-4 py-4">
        <p className="text-sm font-semibold text-caution-900">
          Pre-filing workflow only
        </p>

        <p className="mt-1 text-xs leading-relaxed text-caution-800">
          Preparing or approving this package does not submit a claim to a
          court, clerk, county, tax collector, trustee, agency or other
          custodian. Actual filing is a separate controlled stage that does not
          exist in this workflow yet.
        </p>
      </div>

      {/* ================================================================== gates */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Gate
          complete={data.readiness.readyToPrepare}
          label={`${data.readiness.completedControlCount}/${data.readiness.controls.length} readiness passed`}
        />

        <Gate complete={prepared} label="Package prepared" />

        <Gate complete={submittedForReview} label="Independent review" />

        <Gate complete={preFilingApproved} label="Pre-filing approved" />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-critical-200 bg-critical-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-critical-800">
            Action could not be completed
          </p>

          <p className="mt-1 text-xs leading-relaxed text-critical-700">
            {error}
          </p>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-md border border-accent-200 bg-accent-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-accent-900">Saved</p>

          <p className="mt-1 text-xs leading-relaxed text-accent-800">
            {success}
          </p>
        </div>
      )}

      {/* ================================================================== permissions */}
      <section className="rounded-lg border border-line bg-inset p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-ink-500">Current staff session</p>

            <p className="mt-1 font-mono text-xs font-semibold text-ink-800">
              {data.permissions.actorUserId}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone={data.permissions.mayWrite ? "positive" : "neutral"}>
              {data.permissions.mayWrite ? "Package write access" : "Read only"}
            </Badge>

            <Badge
              tone={
                data.permissions.mayPerformPreFilingReview
                  ? "positive"
                  : "neutral"
              }
            >
              {data.permissions.mayPerformPreFilingReview
                ? "Review authority"
                : "No review authority"}
            </Badge>
          </div>
        </div>
      </section>

      {/* ================================================================== readiness */}
      <section className="rounded-lg border border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-ink-500">Live gate</p>

            <h3 className="mt-1 text-base font-semibold text-ink-900">
              Current filing readiness
            </h3>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
              These are live controls, not the frozen package snapshot. Approval
              is blocked if current readiness changes while a package is under
              review.
            </p>
          </div>

          <Badge
            tone={data.readiness.readyToPrepare ? "positive" : "caution"}
            size="md"
          >
            {data.readiness.readyToPrepare
              ? "Ready"
              : `${data.readiness.outstandingControlCount} outstanding`}
          </Badge>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.readiness.controls.map((control) => (
            <div
              key={control.key}
              className={
                control.complete
                  ? "rounded-md border border-accent-200 bg-accent-50 px-3.5 py-3"
                  : "rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3"
              }
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={
                    control.complete
                      ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-600 text-[11px] font-bold text-white"
                      : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-caution-300 bg-white text-[11px] font-bold text-caution-700"
                  }
                >
                  {control.complete ? "✓" : "!"}
                </span>

                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink-900">
                    {control.label}
                  </p>

                  <p className="mt-1 text-2xs leading-relaxed text-ink-600">
                    {control.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!data.readiness.readyToPrepare && (
          <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
            <p className="text-xs font-semibold text-caution-900">
              Current workflow is blocked
            </p>

            <p className="mt-1 text-xs leading-relaxed text-caution-800">
              {data.readiness.nextInternalAction}
            </p>
          </div>
        )}
      </section>

      {/* ================================================================== no package */}
      {!currentPackage && (
        <section className="rounded-lg border border-line bg-inset p-4 sm:p-5">
          <p className="eyebrow text-ink-500">Step 1</p>

          <h3 className="mt-1 text-base font-semibold text-ink-900">
            Prepare filing package
          </h3>

          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
            Duequity will freeze the current claimant, approved jurisdiction
            version, payment route, legal position, commercial provenance,
            service agreement, accepted agency documents, deadline and readiness
            controls into a hashed package snapshot.
          </p>

          {!data.permissions.canPrepare && (
            <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
              <p className="text-xs font-semibold text-caution-900">
                Preparation unavailable
              </p>

              <p className="mt-1 text-xs leading-relaxed text-caution-800">
                {data.permissions.mayWrite
                  ? data.readiness.nextInternalAction
                  : "Your current staff role does not have permission to prepare filing packages."}
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={action !== null || !data.permissions.canPrepare}
            onClick={() => {
              void runAction(
                "prepare",
                "The filing package was prepared and its current evidence and provenance were frozen.",
              );
            }}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action === "prepare"
              ? "Preparing package..."
              : "Prepare filing package"}
          </button>
        </section>
      )}

      {/* ================================================================== current package */}
      {currentPackage && currentSnapshot && (
        <>
          <section className="rounded-lg border border-line p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-ink-500">Current package</p>

                <h3 className="mt-1 text-base font-semibold text-ink-900">
                  Version {currentPackage.version}
                </h3>

                <p className="mt-1 font-mono text-2xs text-ink-500">
                  {currentPackage.id}
                </p>
              </div>

              <Badge tone={statusTone(currentPackage.status)} size="md">
                {statusLabel(currentPackage.status)}
              </Badge>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SnapshotFact label="Claimant">
                {currentSnapshot.claimantLegalName}
              </SnapshotFact>

              <SnapshotFact label="Legal lane">
                {valueLabel(currentSnapshot.legalLane)}
              </SnapshotFact>

              <SnapshotFact label="Agency documents">
                {currentSnapshot.acceptedDocuments.length}
              </SnapshotFact>

              <SnapshotFact label="Readiness frozen">
                {currentSnapshot.readinessCompletedCount} of{" "}
                {currentSnapshot.readinessTotalCount}
              </SnapshotFact>

              <SnapshotFact label="Prepared">
                {formatTimestamp(currentPackage.preparedAt)}
              </SnapshotFact>

              <SnapshotFact label="Prepared by">
                <span className="font-mono text-xs">
                  {currentPackage.preparedByUserId}
                </span>
              </SnapshotFact>
            </dl>

            {/* ---------------------------------------------------------- jurisdiction provenance */}
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="eyebrow text-ink-500">
                  Frozen jurisdiction and payment provenance
                </p>

                <Badge tone="neutral">
                  Rule v{currentSnapshot.jurisdictionLegalRuleVersion}
                </Badge>
              </div>

              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SnapshotFact label="Jurisdiction package">
                  Version {currentSnapshot.jurisdictionPackageVersion}
                </SnapshotFact>

                <SnapshotFact label="Legal-rule version">
                  {currentSnapshot.jurisdictionLegalRuleVersion}
                </SnapshotFact>

                <SnapshotFact label="Payment route">
                  {valueLabel(currentSnapshot.paymentRoute)}
                </SnapshotFact>

                <SnapshotFact label="Launch track">
                  {valueLabel(currentSnapshot.launchPaymentTrack)}
                </SnapshotFact>

                <SnapshotFact label="Representative may file">
                  {valueLabel(currentSnapshot.representativeMayFile)}
                </SnapshotFact>

                <SnapshotFact label="Representative may receive">
                  {valueLabel(currentSnapshot.representativeMayReceivePayment)}
                </SnapshotFact>

                <SnapshotFact label="Assignment required">
                  {valueLabel(
                    currentSnapshot.assignmentRequiredForRepresentativePayment,
                  )}
                </SnapshotFact>

                <SnapshotFact label="Fee collection">
                  {valueLabel(currentSnapshot.feeCollectionMethod)}
                </SnapshotFact>

                <SnapshotFact label="Current API rule version">
                  {data.jurisdiction.ruleVersion}
                </SnapshotFact>
              </dl>
            </div>

            {/* ---------------------------------------------------------- legal provenance */}
            <div className="mt-5 rounded-md border border-line bg-inset px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-ink-500">Frozen legal position</p>

                  <p className="mt-1 text-sm font-semibold text-ink-900">
                    {valueLabel(currentSnapshot.legalLane)}
                  </p>
                </div>

                <Badge
                  tone={
                    currentSnapshot.legalHumanDetermined
                      ? "positive"
                      : "neutral"
                  }
                >
                  {currentSnapshot.legalHumanDetermined
                    ? "Human determination"
                    : "Structured determination"}
                </Badge>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-ink-600">
                {currentSnapshot.legalRationale}
              </p>

              {currentSnapshot.legalReviewedBy && (
                <p className="mt-2 text-2xs text-ink-500">
                  Reviewed by{" "}
                  <span className="font-mono">
                    {currentSnapshot.legalReviewedBy}
                  </span>
                  {currentSnapshot.legalLastReviewedAt
                    ? ` on ${currentSnapshot.legalLastReviewedAt}`
                    : ""}
                </p>
              )}
            </div>

            {/* ---------------------------------------------------------- commercial provenance */}
            <div className="mt-5">
              <p className="eyebrow text-ink-500">
                Frozen commercial and agreement provenance
              </p>

              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SnapshotFact label="Commercial policy">
                  {currentSnapshot.commercialPolicyId} v
                  {currentSnapshot.commercialPolicyVersion}
                </SnapshotFact>

                <SnapshotFact label="Commercial tier">
                  {currentSnapshot.commercialTierId}
                </SnapshotFact>

                <SnapshotFact label="Recovery amount">
                  {formatCents(currentSnapshot.commercialRecoveryAmount)}
                </SnapshotFact>

                <SnapshotFact label="Projected Duequity fee">
                  {formatCents(currentSnapshot.commercialProjectedFee)}
                </SnapshotFact>

                <SnapshotFact label="Quote legal-rule snapshot">
                  {currentSnapshot.commercialQuoteLegalRuleVersionSnapshot}
                </SnapshotFact>

                <SnapshotFact label="Agreement legal-rule snapshot">
                  {currentSnapshot.feeAgreementLegalRuleVersionSnapshot}
                </SnapshotFact>

                <SnapshotFact label="Legal percentage ceiling">
                  {formatPercent(
                    currentSnapshot.commercialLegalFeeCapPercentSnapshot,
                  )}
                </SnapshotFact>

                <SnapshotFact label="Legal amount ceiling">
                  {currentSnapshot.commercialLegalFeeCapAmountSnapshot !==
                  undefined
                    ? formatCents(
                        currentSnapshot.commercialLegalFeeCapAmountSnapshot,
                      )
                    : "Not recorded"}
                </SnapshotFact>

                <SnapshotFact label="Agreement document">
                  <span className="font-mono text-xs">
                    {currentSnapshot.feeAgreementDocumentId}
                  </span>
                </SnapshotFact>
              </dl>
            </div>

            {/* ---------------------------------------------------------- agency docs */}
            <div className="mt-5">
              <p className="eyebrow text-ink-500">
                Frozen accepted agency documents
              </p>

              {currentSnapshot.acceptedDocuments.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {currentSnapshot.acceptedDocuments.map((document) => (
                    <div
                      key={document.documentId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink-800">
                          {documentKindLabel(document.kind)}
                        </p>

                        <p className="mt-0.5 break-all font-mono text-2xs text-ink-500">
                          {document.documentId}
                        </p>
                      </div>

                      <Badge tone="positive">Accepted</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-ink-500">
                  The approved jurisdiction required no agency filing documents
                  in this frozen package snapshot.
                </p>
              )}
            </div>

            <div className="mt-5 rounded-md border border-line bg-inset px-3 py-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                Package snapshot integrity
              </p>

              <p className="mt-1 break-all font-mono text-2xs text-ink-700">
                {currentPackage.snapshotHash}
              </p>
            </div>
          </section>

          {/* ============================================================ prepared */}
          {currentPackage.status === "prepared" && (
            <section className="rounded-lg border border-line bg-inset p-4 sm:p-5">
              <p className="eyebrow text-ink-500">Step 2</p>

              <h3 className="mt-1 text-base font-semibold text-ink-900">
                Submit for independent review
              </h3>

              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
                The prepared snapshot enters an internal human review queue.
                Submission here is not an agency filing.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line bg-white px-4 py-3">
                  <p className="text-xs text-ink-500">Current actor</p>

                  <p className="mt-0.5 font-mono text-xs font-semibold text-ink-800">
                    {data.permissions.actorUserId}
                  </p>
                </div>

                <div className="rounded-md border border-line bg-white px-4 py-3">
                  <p className="text-xs text-ink-500">
                    Review status for current actor
                  </p>

                  <p
                    className={
                      reviewerIndependent &&
                      data.permissions.mayPerformPreFilingReview
                        ? "mt-0.5 font-mono text-xs font-semibold text-ink-800"
                        : "mt-0.5 text-xs font-semibold text-caution-800"
                    }
                  >
                    {reviewerDisplay}
                  </p>
                </div>
              </div>

              {!data.permissions.canSubmitForReview && (
                <div className="mt-3 rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
                  <p className="text-xs font-semibold text-caution-900">
                    Submission unavailable
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-caution-800">
                    {data.permissions.mayWrite
                      ? data.readiness.nextInternalAction
                      : "Your current staff role does not have permission to submit filing packages for internal review."}
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={
                  action !== null || !data.permissions.canSubmitForReview
                }
                onClick={() => {
                  void runAction(
                    "submit_for_review",
                    "The frozen filing package was submitted for independent human pre-filing review.",
                  );
                }}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action === "submit_for_review"
                  ? "Submitting for review..."
                  : "Submit for review"}
              </button>
            </section>
          )}

          {/* ============================================================ review */}
          {currentPackage.status === "under_review" && (
            <section className="rounded-lg border border-caution-200 bg-caution-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-caution-700">Step 3</p>

                  <h3 className="mt-1 text-base font-semibold text-caution-950">
                    Human pre-filing review
                  </h3>

                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-caution-800">
                    A different authorized reviewer must inspect the frozen
                    package. Return remains available to an authorized
                    independent reviewer even if live readiness later changes,
                    but approval does not.
                  </p>
                </div>

                <Badge tone="caution" size="md">
                  Under review
                </Badge>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-caution-200 bg-white px-4 py-3">
                  <dt className="text-xs text-ink-500">Submitted</dt>

                  <dd className="mt-0.5 text-sm font-medium text-ink-800">
                    {formatTimestamp(currentPackage.submittedForReviewAt)}
                  </dd>
                </div>

                <div className="rounded-md border border-caution-200 bg-white px-4 py-3">
                  <dt className="text-xs text-ink-500">Current review actor</dt>

                  <dd
                    className={
                      reviewerIndependent &&
                      data.permissions.mayPerformPreFilingReview
                        ? "mt-0.5 font-mono text-xs font-semibold text-ink-800"
                        : "mt-0.5 text-xs font-semibold text-critical-800"
                    }
                  >
                    {reviewerDisplay}
                  </dd>
                </div>
              </dl>

              {!data.permissions.mayPerformPreFilingReview ? (
                <div className="mt-4 rounded-md border border-critical-200 bg-white p-4">
                  <p className="text-sm font-semibold text-critical-900">
                    Review authority required
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-critical-700">
                    The current staff role does not have permission to approve
                    or return filing packages.
                  </p>
                </div>
              ) : !reviewerIndependent ? (
                <div className="mt-4 rounded-md border border-critical-200 bg-white p-4">
                  <p className="text-sm font-semibold text-critical-900">
                    Independent reviewer required
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-critical-700">
                    Separation of duties prevents the package preparer or
                    submitter from reviewing their own package.
                  </p>
                </div>
              ) : (
                <>
                  {!data.permissions.canApprovePreFiling && (
                    <div className="mt-4 rounded-md border border-caution-200 bg-white p-4">
                      <p className="text-sm font-semibold text-caution-900">
                        Approval currently blocked
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-caution-800">
                        The Claim no longer satisfies current filing readiness.
                        Approval is disabled. Return the package for changes if
                        the frozen package needs to be refreshed.
                      </p>

                      <p className="mt-2 text-xs text-ink-600">
                        {data.readiness.nextInternalAction}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 rounded-md border border-caution-200 bg-white p-4">
                    <label className="block text-xs font-semibold text-ink-700">
                      Approval review note
                    </label>

                    <textarea
                      rows={3}
                      value={reviewNote}
                      onChange={(event) => {
                        setReviewNote(event.target.value);
                      }}
                      placeholder="Optional internal review note"
                      className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                    />

                    <button
                      type="button"
                      disabled={
                        action !== null || !data.permissions.canApprovePreFiling
                      }
                      onClick={() => {
                        void runAction(
                          "approve_pre_filing",
                          "Independent human review approved the frozen filing package for the next controlled stage.",
                        );
                      }}
                      className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {action === "approve_pre_filing"
                        ? "Approving..."
                        : "Approve pre-filing package"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-md border border-critical-200 bg-white p-4">
                    <label className="block text-xs font-semibold text-critical-800">
                      Return reason
                    </label>

                    <textarea
                      rows={3}
                      value={returnReason}
                      onChange={(event) => {
                        setReturnReason(event.target.value);
                      }}
                      placeholder="Example: Accepted ownership evidence does not clearly show the claimant's name."
                      className="mt-1.5 w-full resize-y rounded-md border border-critical-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-critical-400 focus:ring-2 focus:ring-critical-100"
                    />

                    <button
                      type="button"
                      disabled={
                        action !== null ||
                        !data.permissions.canReturnForChanges ||
                        !returnReason.trim()
                      }
                      onClick={() => {
                        void runAction(
                          "return_for_changes",
                          "The filing package was returned for changes. A new package version must be prepared before another review cycle.",
                        );
                      }}
                      className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2.5 text-sm font-semibold text-critical-800 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {action === "return_for_changes"
                        ? "Returning package..."
                        : "Return for changes"}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ============================================================ returned */}
          {currentPackage.status === "returned_for_changes" && (
            <section className="rounded-lg border border-critical-200 bg-critical-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-critical-900">
                    Package returned for changes
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-critical-800">
                    Correct the underlying Claim evidence where necessary, then
                    prepare a fresh filing-package version. The returned
                    snapshot cannot be resubmitted directly.
                  </p>
                </div>

                <Badge tone="critical" size="md">
                  Returned
                </Badge>
              </div>

              <div className="mt-4 rounded-md border border-critical-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold text-critical-800">
                  Return reason
                </p>

                <p className="mt-1 text-xs leading-relaxed text-critical-700">
                  {currentPackage.returnReason ?? "No reason recorded."}
                </p>
              </div>

              {!data.permissions.canPrepare && (
                <div className="mt-4 rounded-md border border-caution-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-caution-900">
                    Fresh preparation unavailable
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-caution-800">
                    {data.permissions.mayWrite
                      ? data.readiness.nextInternalAction
                      : "Your current staff role does not have permission to prepare the replacement package."}
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={action !== null || !data.permissions.canPrepare}
                onClick={() => {
                  void runAction(
                    "prepare",
                    "A fresh filing-package version was prepared from the current Claim evidence.",
                  );
                }}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action === "prepare"
                  ? "Preparing fresh version..."
                  : "Prepare fresh package version"}
              </button>
            </section>
          )}

          {/* ============================================================ approved */}
          {currentPackage.status === "pre_filing_approved" && (
            <section className="rounded-lg border border-accent-200 bg-accent-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-accent-900">
                    Pre-filing review approved
                  </p>

                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-accent-800">
                    An independent human reviewer approved the frozen package
                    snapshot. The Claim has not been filed or submitted to any
                    external recipient.
                  </p>
                </div>

                <Badge tone="positive" size="md">
                  Approved
                </Badge>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-accent-200 bg-white px-4 py-3">
                  <dt className="text-xs text-ink-500">Approved</dt>

                  <dd className="mt-0.5 text-sm font-medium text-ink-800">
                    {formatTimestamp(currentPackage.preFilingApprovedAt)}
                  </dd>
                </div>

                <div className="rounded-md border border-accent-200 bg-white px-4 py-3">
                  <dt className="text-xs text-ink-500">Reviewer</dt>

                  <dd className="mt-0.5 font-mono text-xs font-semibold text-ink-800">
                    {currentPackage.reviewedByUserId}
                  </dd>
                </div>
              </dl>

              {currentPackage.reviewNote && (
                <div className="mt-4 rounded-md border border-accent-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-ink-700">
                    Review note
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-600">
                    {currentPackage.reviewNote}
                  </p>
                </div>
              )}

              <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
                <p className="text-xs font-semibold text-caution-900">
                  Not submitted
                </p>

                <p className="mt-1 text-xs leading-relaxed text-caution-800">
                  No court, county, agency, custodian or trustee submission has
                  occurred. External submission remains outside this workflow.
                </p>
              </div>
            </section>
          )}
        </>
      )}

      {/* ================================================================== history */}
      {data.packageHistory.length > 0 && (
        <section className="rounded-lg border border-line p-4 sm:p-5">
          <p className="eyebrow text-ink-500">Package history</p>

          <div className="mt-3 space-y-2">
            {data.packageHistory.map((filingPackage) => (
              <div
                key={filingPackage.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3.5 py-3"
              >
                <div>
                  <p className="text-xs font-semibold text-ink-800">
                    Version {filingPackage.version}
                  </p>

                  <p className="mt-0.5 font-mono text-2xs text-ink-500">
                    {filingPackage.id}
                  </p>

                  <p className="mt-1 text-2xs text-ink-500">
                    Prepared {formatTimestamp(filingPackage.preparedAt)}
                  </p>
                </div>

                <Badge tone={statusTone(filingPackage.status)}>
                  {statusLabel(filingPackage.status)}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================================================================== submission */}
      <section className="rounded-lg border border-line bg-inset p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-white text-xs font-bold text-ink-500"
          >
            !
          </span>

          <div>
            <p className="text-sm font-semibold text-ink-900">
              External submission status
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {data.submission.message}
            </p>

            <p className="mt-2 text-xs font-semibold text-ink-700">
              Submitted: {data.submission.submitted ? "Yes" : "No"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
