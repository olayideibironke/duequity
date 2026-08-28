"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";

/**
 * CLAIM FILING PACKAGE PANEL
 *
 * Controlled workflow:
 *
 *   1. live filing readiness
 *   2. frozen filing-package preparation
 *   3. independent human pre-filing review
 *   4. jurisdiction-controlled Claim Initiation
 *   5. verified operational filing destination
 *   6. recording a real-world external submission
 *   7. recording authority acknowledgment
 *
 * IMPORTANT
 *
 * Recording an external submission does not send anything.
 *
 * This client never:
 *
 *   - emails an authority
 *   - files with a court
 *   - uploads to an agency portal
 *   - changes the filing party
 *
 * The server determines:
 *
 *   - staff permissions
 *   - state clearance
 *   - current jurisdiction rule
 *   - payment route
 *   - representative filing authority
 *   - active claim-specific documents
 *   - filing-package integrity
 *   - verified operational filing destination
 *   - whether Claim Initiation may proceed
 *
 * In claimant-controlled jurisdictions, DueQuity may prepare and coordinate
 * the claimant-ready package but must never be recorded as the filer.
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

type ClaimInitiationRouteMode =
  | "claimant_controlled"
  | "representative_controlled"
  | "blocked";

type ClaimInitiationStatus =
  | "awaiting_pre_filing_package"
  | "awaiting_pre_filing_approval"
  | "ready_for_claim_initiation"
  | "counsel_required"
  | "blocked";

type SubmissionStatus =
  | "submitted"
  | "acknowledged";

type FilingDestinationStatus =
  | "verified"
  | "missing"
  | "unsupported_method";

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

  requiredDocumentKinds: string[];

  nextInternalAction: string;
}

interface ClaimInitiationRoute {
  mode: ClaimInitiationRouteMode;

  status: ClaimInitiationStatus;

  ready: boolean;

  filingParty:
    | "claimant"
    | "authorized_representative"
    | "unresolved";

  agencyName: string;

  custodian: string;

  claimMethod: string;

  claimFormUrl?: string;

  attorneyRequired: boolean;

  requiredDocuments: string[];

  representativeMayFile: string;

  representativeMayReceivePayment: string;

  paymentRoute: string;

  launchPaymentTrack: string;

  feeCollectionMethod: string;

  message: string;
}

interface FilingDestination {
  status: FilingDestinationStatus;

  complete: boolean;

  submissionMethod: string;

  message: string;

  id?: string;

  destinationVersion?: number;

  agencyName?: string;

  departmentName?: string;

  attentionLine?: string;

  filingEmail?: string;

  mailingAddressLines?: string[];

  physicalAddressLines?: string[];

  portalUrl?: string;

  phone?: string;

  filingInstructions?: string[];

  officialSourceUrl?: string;

  officialSourceTitle?: string;

  verifiedAt?: string;
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

    custodian: string;

    claimMethod: string;

    claimFormUrl?: string;

    attorneyRequired: boolean;

    requiredDocuments: string[];
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

  claimInitiationRoute: ClaimInitiationRoute;

  filingDestination: FilingDestination;

  submission: {
    submitted: boolean;

    message: string;
  };
}

interface PersistedSubmission {
  id: string;

  claimId: string;

  claimReference: string;

  filingPackageId: string;

  filingPackageVersion: number;

  routeMode:
    | "claimant_controlled"
    | "representative_controlled";

  filingParty:
    | "claimant"
    | "authorized_representative";

  authorityName: string;

  custodian: string;

  submissionMethod: string;

  status: SubmissionStatus;

  submittedAt: string;

  recordedByUserId: string;

  externalReference?: string;

  submissionNote?: string;

  acknowledgedAt?: string;

  acknowledgmentRecordedByUserId?: string;

  acknowledgmentSummary?: string;

  rowVersion: number;

  createdAt: string;

  updatedAt: string;
}

interface SubmissionAuditEntry {
  id: string;

  claimId: string;

  submissionId: string;

  action: string;

  actorUserId: string;

  occurredAt: string;

  detail?: string;
}

interface SubmissionApiPayload {
  ok: true;

  claim: {
    id: string;

    reference: string;
  };

  filingPackage: {
    id: string;

    version: number;

    status: string;

    snapshotHash: string;

    preFilingApprovedAt?: string;
  };

  route: {
    mode:
      | "claimant_controlled"
      | "representative_controlled";

    filingParty:
      | "claimant"
      | "authorized_representative";

    agencyName: string;

    custodian: string;

    submissionMethod: string;

    representativeMayFile: string;

    representativeMayReceivePayment: string;

    paymentRoute: string;

    launchTrack: string;

    feeCollectionMethod: string;
  };

  permissions: {
    actorUserId: string;

    mayRecordSubmission: boolean;

    mayRecordAcknowledgment: boolean;
  };

  submission: PersistedSubmission | null;

  audit: SubmissionAuditEntry[];
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

    case "superseded":
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

  return `${(value * 100).toFixed(
    Number.isInteger(value * 100) ? 0 : 1,
  )}%`;
}

function isoFromLocalInput(
  value: string,
  label: string,
): string {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }

  return parsed.toISOString();
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
          complete
            ? "text-xs font-medium text-ink-800"
            : "text-xs text-ink-500"
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

  children: ReactNode;
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

export function ClaimFilingPackagePanel({
  claimId,
}: {
  claimId: string;
}) {
  const router = useRouter();

  const [data, setData] =
    useState<FilingPackageApiPayload | null>(null);

  const [submissionData, setSubmissionData] =
    useState<SubmissionApiPayload | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [submissionLoading, setSubmissionLoading] =
    useState(false);

  const [action, setAction] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [submissionError, setSubmissionError] =
    useState("");

  const [submissionSuccess, setSubmissionSuccess] =
    useState("");

  const [reviewNote, setReviewNote] =
    useState("");

  const [returnReason, setReturnReason] =
    useState("");

  const [submittedAt, setSubmittedAt] =
    useState("");

  const [submissionReference, setSubmissionReference] =
    useState("");

  const [submissionNote, setSubmissionNote] =
    useState("");

  const [acknowledgedAt, setAcknowledgedAt] =
    useState("");

  const [acknowledgmentReference, setAcknowledgmentReference] =
    useState("");

  const [acknowledgmentSummary, setAcknowledgmentSummary] =
    useState("");

  /* ======================================================================== */
  /* Filing-package load                                                       */
  /* ======================================================================== */

  const fetchFilingPackage = useCallback(
    async (
      signal?: AbortSignal,
    ): Promise<FilingPackageApiPayload> => {
      const response = await fetch(
        `/api/pro/claims/${encodeURIComponent(
          claimId,
        )}/filing-package`,
        {
          method: "GET",

          cache: "no-store",

          signal,

          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload =
        (await response.json()) as
          | FilingPackageApiPayload
          | ApiErrorPayload;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          "error" in payload &&
            payload.error
            ? payload.error
            : "Filing package state could not be loaded.",
        );
      }

      return payload;
    },
    [claimId],
  );

  const load = useCallback(
    async () => {
      try {
        setData(
          await fetchFilingPackage(),
        );

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
    },
    [fetchFilingPackage],
  );

  useEffect(() => {
    const controller =
      new AbortController();

    fetchFilingPackage(
      controller.signal,
    )
      .then((payload) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setData(payload);

        setError("");

        setLoading(false);
      })
      .catch(
        (loadError: unknown) => {
          if (
            controller.signal
              .aborted
          ) {
            return;
          }

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Filing package state could not be loaded.",
          );

          setLoading(false);
        },
      );

    return () => {
      controller.abort();
    };
  }, [fetchFilingPackage]);

  /* ======================================================================== */
  /* Submission load                                                           */
  /* ======================================================================== */

  const fetchSubmissionState =
    useCallback(
      async (
        signal?: AbortSignal,
      ): Promise<SubmissionApiPayload> => {
        const response =
          await fetch(
            `/api/pro/claims/${encodeURIComponent(
              claimId,
            )}/submission`,
            {
              method: "GET",

              cache: "no-store",

              signal,

              headers: {
                Accept:
                  "application/json",
              },
            },
          );

        const payload =
          (await response.json()) as
            | SubmissionApiPayload
            | ApiErrorPayload;

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            "error" in payload &&
              payload.error
              ? payload.error
              : "Claim-submission state could not be loaded.",
          );
        }

        return payload;
      },
      [claimId],
    );

  useEffect(() => {
    if (
      !data?.claimInitiationRoute
        .ready
    ) {
      setSubmissionData(null);

      setSubmissionError("");

      return;
    }

    const controller =
      new AbortController();

    setSubmissionLoading(true);

    fetchSubmissionState(
      controller.signal,
    )
      .then((payload) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setSubmissionData(
          payload,
        );

        setSubmissionError("");

        setSubmissionLoading(
          false,
        );
      })
      .catch(
        (
          loadError: unknown,
        ) => {
          if (
            controller.signal
              .aborted
          ) {
            return;
          }

          setSubmissionData(
            null,
          );

          setSubmissionError(
            loadError instanceof Error
              ? loadError.message
              : "Claim-submission state could not be loaded.",
          );

          setSubmissionLoading(
            false,
          );
        },
      );

    return () => {
      controller.abort();
    };
  }, [
    data?.claimInitiationRoute.ready,
    fetchSubmissionState,
  ]);

  /* ======================================================================== */
  /* Filing-package action                                                     */
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
      if (
        actionName ===
          "return_for_changes" &&
        !returnReason.trim()
      ) {
        throw new Error(
          "Enter a return reason before returning the filing package.",
        );
      }

      const response =
        await fetch(
          `/api/pro/claims/${encodeURIComponent(
            claimId,
          )}/filing-package`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body: JSON.stringify({
              action:
                actionName,

              reviewNote:
                actionName ===
                "approve_pre_filing"
                  ? reviewNote.trim() ||
                    undefined
                  : undefined,

              returnReason:
                actionName ===
                "return_for_changes"
                  ? returnReason.trim()
                  : undefined,
            }),
          },
        );

      const payload =
        (await response.json()) as
          | FilingPackageApiPayload
          | ApiErrorPayload;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          "error" in payload &&
            payload.error
            ? payload.error
            : "The filing-package action could not be completed.",
        );
      }

      setSuccess(
        successMessage,
      );

      if (
        actionName ===
        "return_for_changes"
      ) {
        setReturnReason("");
      }

      if (
        actionName ===
        "approve_pre_filing"
      ) {
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
  /* Submission action                                                         */
  /* ======================================================================== */

  async function runSubmissionAction(
    actionName:
      | "record_submission"
      | "record_acknowledgment",
  ) {
    setAction(actionName);

    setSubmissionError("");

    setSubmissionSuccess("");

    try {
      const requestBody =
        actionName ===
        "record_submission"
          ? {
              action:
                "record_submission",

              submittedAt:
                isoFromLocalInput(
                  submittedAt,
                  "Submission date and time",
                ),

              externalReference:
                submissionReference.trim() ||
                undefined,

              submissionNote:
                submissionNote.trim() ||
                undefined,
            }
          : {
              action:
                "record_acknowledgment",

              acknowledgedAt:
                isoFromLocalInput(
                  acknowledgedAt,
                  "Acknowledgment date and time",
                ),

              externalReference:
                acknowledgmentReference.trim() ||
                undefined,

              acknowledgmentSummary:
                acknowledgmentSummary.trim() ||
                undefined,
            };

      const response =
        await fetch(
          `/api/pro/claims/${encodeURIComponent(
            claimId,
          )}/submission`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify(
                requestBody,
              ),
          },
        );

      const payload =
        (await response.json()) as
          | SubmissionApiPayload
          | ApiErrorPayload;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          "error" in payload &&
            payload.error
            ? payload.error
            : "The claim-submission action could not be completed.",
        );
      }

      setSubmissionData(
        payload,
      );

      if (
        actionName ===
        "record_submission"
      ) {
        setSubmissionSuccess(
          "The real-world external submission was recorded. No submission was sent by DueQuity through this action.",
        );

        setSubmittedAt("");

        setSubmissionReference("");

        setSubmissionNote("");
      } else {
        setSubmissionSuccess(
          "Authority acknowledgment was recorded separately from the original submission.",
        );

        setAcknowledgedAt("");

        setAcknowledgmentReference("");

        setAcknowledgmentSummary("");
      }

      router.refresh();
    } catch (
      actionError
    ) {
      setSubmissionError(
        actionError instanceof Error
          ? actionError.message
          : "The claim-submission action could not be completed.",
      );
    } finally {
      setAction(null);
    }
  }

  /* ======================================================================== */
  /* Loading                                                                   */
  /* ======================================================================== */

  if (
    loading &&
    !data
  ) {
    return (
      <div className="rounded-md border border-line bg-inset px-4 py-5">
        <p className="text-sm font-medium text-ink-700">
          Loading filing package
        </p>

        <p className="mt-1 text-xs text-ink-500">
          Reading live filing
          readiness and persisted
          package-review state.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-md border border-critical-200 bg-critical-50 px-4 py-4">
        <p className="text-sm font-semibold text-critical-800">
          Filing package
          unavailable
        </p>

        <p className="mt-1 text-xs leading-relaxed text-critical-700">
          {error ||
            "The filing-package workflow could not be loaded."}
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

  /* ======================================================================== */
  /* Derived state                                                             */
  /* ======================================================================== */

  const currentPackage =
    data.currentPackage;

  const prepared =
    Boolean(
      currentPackage,
    );

  const submittedForReview =
    Boolean(
      currentPackage &&
        (currentPackage.status ===
          "under_review" ||
          currentPackage.status ===
            "pre_filing_approved"),
    );

  const preFilingApproved =
    currentPackage?.status ===
    "pre_filing_approved";

  const claimInitiationReady =
    data.claimInitiationRoute
      .ready;

  const externalSubmitted =
    Boolean(
      submissionData?.submission,
    );

  const authorityAcknowledged =
    submissionData?.submission
      ?.status ===
    "acknowledged";

  const reviewerIndependent =
    data.permissions
      .reviewerIndependent;

  const reviewerDisplay =
    !data.permissions
      .mayPerformPreFilingReview
      ? "Current role cannot perform pre-filing review"
      : reviewerIndependent
        ? data.permissions
            .actorUserId
        : "Independent reviewer required";

  const currentSnapshot =
    currentPackage?.snapshot;

  const initiation =
    data.claimInitiationRoute;

  const filingDestination =
    data.filingDestination;

  const submission =
    submissionData?.submission ??
    null;

  /* ======================================================================== */
  /* UI                                                                        */
  /* ======================================================================== */

  return (
    <div className="min-w-0 space-y-5">
      <div className="rounded-md border border-caution-200 bg-caution-50 px-4 py-4">
        <p className="text-sm font-semibold text-caution-900">
          Controlled filing workflow
        </p>

        <p className="mt-1 text-xs leading-relaxed text-caution-800">
          Preparing or approving a filing package does not submit a claim to
          any external authority. Claim Initiation becomes available only
          after independent pre-filing approval. External submission and
          authority acknowledgment are recorded as separate real-world events.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <Gate
          complete={data.readiness.readyToPrepare}
          label={`${data.readiness.completedControlCount}/${data.readiness.controls.length} readiness passed`}
        />

        <Gate
          complete={prepared}
          label="Package prepared"
        />

        <Gate
          complete={submittedForReview}
          label="Independent review"
        />

        <Gate
          complete={preFilingApproved}
          label="Pre-filing approved"
        />

        <Gate
          complete={externalSubmitted}
          label="Claim submitted"
        />

        <Gate
          complete={authorityAcknowledged}
          label="Authority acknowledged"
        />
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
          <p className="text-sm font-semibold text-accent-900">
            Saved
          </p>

          <p className="mt-1 text-xs leading-relaxed text-accent-800">
            {success}
          </p>
        </div>
      )}

      <section className="rounded-lg border border-line bg-inset p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-ink-500">
              Current staff session
            </p>

            <p className="mt-1 font-mono text-xs font-semibold text-ink-800">
              {data.permissions.actorUserId}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              tone={
                data.permissions.mayWrite
                  ? "positive"
                  : "neutral"
              }
            >
              {data.permissions.mayWrite
                ? "Package write access"
                : "Read only"}
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

      <section className="rounded-lg border border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-ink-500">
              Live gate
            </p>

            <h3 className="mt-1 text-base font-semibold text-ink-900">
              Current filing readiness
            </h3>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
              These are live controls, not the frozen package snapshot.
              Progress is blocked if current readiness no longer supports the
              approved filing route.
            </p>
          </div>

          <Badge
            tone={
              data.readiness.readyToPrepare
                ? "positive"
                : "caution"
            }
            size="md"
          >
            {data.readiness.readyToPrepare
              ? "Ready"
              : `${data.readiness.outstandingControlCount} outstanding`}
          </Badge>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.readiness.controls.map(
            (control) => (
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
            ),
          )}
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

      {!currentPackage && (
        <section className="rounded-lg border border-line bg-inset p-4 sm:p-5">
          <p className="eyebrow text-ink-500">
            Step 1
          </p>

          <h3 className="mt-1 text-base font-semibold text-ink-900">
            Prepare filing package
          </h3>

          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
            DueQuity will freeze the current claimant, approved jurisdiction
            version, payment route, legal position, commercial provenance,
            signed agreement, accepted agency documents, deadline and
            readiness controls into a hashed package snapshot.
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
            disabled={
              action !== null ||
              !data.permissions.canPrepare
            }
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

      {currentPackage &&
        currentSnapshot && (
          <>
            <section className="rounded-lg border border-line p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-ink-500">
                    Current package
                  </p>

                  <h3 className="mt-1 text-base font-semibold text-ink-900">
                    Version {currentPackage.version}
                  </h3>

                  <p className="mt-1 font-mono text-2xs text-ink-500">
                    {currentPackage.id}
                  </p>
                </div>

                <Badge
                  tone={statusTone(
                    currentPackage.status,
                  )}
                  size="md"
                >
                  {statusLabel(
                    currentPackage.status,
                  )}
                </Badge>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SnapshotFact label="Claimant">
                  {currentSnapshot.claimantLegalName}
                </SnapshotFact>

                <SnapshotFact label="Legal lane">
                  {valueLabel(
                    currentSnapshot.legalLane,
                  )}
                </SnapshotFact>

                <SnapshotFact label="Agency documents">
                  {currentSnapshot.acceptedDocuments.length}
                </SnapshotFact>

                <SnapshotFact label="Readiness frozen">
                  {currentSnapshot.readinessCompletedCount} of{" "}
                  {currentSnapshot.readinessTotalCount}
                </SnapshotFact>

                <SnapshotFact label="Prepared">
                  {formatTimestamp(
                    currentPackage.preparedAt,
                  )}
                </SnapshotFact>

                <SnapshotFact label="Prepared by">
                  <span className="font-mono text-xs">
                    {currentPackage.preparedByUserId}
                  </span>
                </SnapshotFact>
              </dl>

              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="eyebrow text-ink-500">
                    Frozen jurisdiction and payment provenance
                  </p>

                  <Badge tone="neutral">
                    Rule v
                    {currentSnapshot.jurisdictionLegalRuleVersion}
                  </Badge>
                </div>

                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <SnapshotFact label="Jurisdiction package">
                    Version{" "}
                    {currentSnapshot.jurisdictionPackageVersion}
                  </SnapshotFact>

                  <SnapshotFact label="Legal-rule version">
                    {currentSnapshot.jurisdictionLegalRuleVersion}
                  </SnapshotFact>

                  <SnapshotFact label="Payment route">
                    {valueLabel(
                      currentSnapshot.paymentRoute,
                    )}
                  </SnapshotFact>

                  <SnapshotFact label="Launch track">
                    {valueLabel(
                      currentSnapshot.launchPaymentTrack,
                    )}
                  </SnapshotFact>

                  <SnapshotFact label="Representative may file">
                    {valueLabel(
                      currentSnapshot.representativeMayFile,
                    )}
                  </SnapshotFact>

                  <SnapshotFact label="Representative may receive">
                    {valueLabel(
                      currentSnapshot.representativeMayReceivePayment,
                    )}
                  </SnapshotFact>

                  <SnapshotFact label="Assignment required">
                    {valueLabel(
                      currentSnapshot.assignmentRequiredForRepresentativePayment,
                    )}
                  </SnapshotFact>

                  <SnapshotFact label="Fee collection">
                    {valueLabel(
                      currentSnapshot.feeCollectionMethod,
                    )}
                  </SnapshotFact>

                  <SnapshotFact label="Current API rule version">
                    {data.jurisdiction.ruleVersion}
                  </SnapshotFact>
                </dl>
              </div>

              <div className="mt-5 rounded-md border border-line bg-inset px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow text-ink-500">
                      Frozen legal position
                    </p>

                    <p className="mt-1 text-sm font-semibold text-ink-900">
                      {valueLabel(
                        currentSnapshot.legalLane,
                      )}
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
              </div>

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
                    {formatCents(
                      currentSnapshot.commercialRecoveryAmount,
                    )}
                  </SnapshotFact>

                  <SnapshotFact label="Projected DueQuity fee">
                    {formatCents(
                      currentSnapshot.commercialProjectedFee,
                    )}
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

              <div className="mt-5">
                <p className="eyebrow text-ink-500">
                  Frozen accepted agency documents
                </p>

                {currentSnapshot.acceptedDocuments.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {currentSnapshot.acceptedDocuments.map(
                      (document) => (
                        <div
                          key={document.documentId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink-800">
                              {documentKindLabel(
                                document.kind,
                              )}
                            </p>

                            <p className="mt-0.5 break-all font-mono text-2xs text-ink-500">
                              {document.documentId}
                            </p>
                          </div>

                          <Badge tone="positive">
                            Accepted
                          </Badge>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-ink-500">
                    The approved jurisdiction required no agency filing
                    documents in this frozen package.
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

            {currentPackage.status ===
              "prepared" && (
              <section className="rounded-lg border border-line bg-inset p-4 sm:p-5">
                <p className="eyebrow text-ink-500">
                  Step 2
                </p>

                <h3 className="mt-1 text-base font-semibold text-ink-900">
                  Submit for independent review
                </h3>

                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
                  The prepared snapshot enters an internal human review queue.
                  Submission here is not an agency filing.
                </p>

                <button
                  type="button"
                  disabled={
                    action !== null ||
                    !data.permissions.canSubmitForReview
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

            {currentPackage.status ===
              "under_review" && (
              <section className="rounded-lg border border-caution-200 bg-caution-50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow text-caution-700">
                      Step 3
                    </p>

                    <h3 className="mt-1 text-base font-semibold text-caution-950">
                      Human pre-filing review
                    </h3>

                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-caution-800">
                      A different authorized reviewer must inspect the frozen
                      package before Claim Initiation.
                    </p>
                  </div>

                  <Badge
                    tone="caution"
                    size="md"
                  >
                    Under review
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-caution-200 bg-white px-4 py-3">
                    <dt className="text-xs text-ink-500">
                      Submitted
                    </dt>

                    <dd className="mt-0.5 text-sm font-medium text-ink-800">
                      {formatTimestamp(
                        currentPackage.submittedForReviewAt,
                      )}
                    </dd>
                  </div>

                  <div className="rounded-md border border-caution-200 bg-white px-4 py-3">
                    <dt className="text-xs text-ink-500">
                      Current review actor
                    </dt>

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
                      The current staff role does not have permission to
                      approve or return filing packages.
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
                    <div className="mt-4 rounded-md border border-caution-200 bg-white p-4">
                      <label className="block text-xs font-semibold text-ink-700">
                        Approval review note
                      </label>

                      <textarea
                        rows={3}
                        value={reviewNote}
                        onChange={(event) => {
                          setReviewNote(
                            event.target.value,
                          );
                        }}
                        placeholder="Optional internal review note"
                        className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                      />

                      <button
                        type="button"
                        disabled={
                          action !== null ||
                          !data.permissions.canApprovePreFiling
                        }
                        onClick={() => {
                          void runAction(
                            "approve_pre_filing",
                            "Independent human review approved the frozen filing package for Claim Initiation.",
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
                      <label className="block text-xs font-semibold text-ink-700">
                        Return reason
                      </label>

                      <textarea
                        rows={3}
                        value={returnReason}
                        onChange={(event) => {
                          setReturnReason(
                            event.target.value,
                          );
                        }}
                        placeholder="Required when returning the package"
                        className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-critical-400 focus:ring-2 focus:ring-critical-100"
                      />

                      <button
                        type="button"
                        disabled={
                          action !== null ||
                          !data.permissions.canReturnForChanges
                        }
                        onClick={() => {
                          void runAction(
                            "return_for_changes",
                            "The package was returned for changes and must be prepared as a new frozen version before review can resume.",
                          );
                        }}
                        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2.5 text-sm font-semibold text-critical-800 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {action === "return_for_changes"
                          ? "Returning..."
                          : "Return for changes"}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            {preFilingApproved && (
              <section className="rounded-lg border border-accent-200 bg-accent-50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow text-accent-700">
                      Pre-filing review approved
                    </p>

                    <h3 className="mt-1 text-base font-semibold text-accent-950">
                      Independent approval complete
                    </h3>

                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-accent-800">
                      An independent human reviewer approved the frozen
                      package. The claim may now enter the
                      jurisdiction-controlled Claim Initiation stage.
                    </p>
                  </div>

                  <Badge
                    tone="positive"
                    size="md"
                  >
                    Approved
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <SnapshotFact label="Approved">
                    {formatTimestamp(
                      currentPackage.preFilingApprovedAt,
                    )}
                  </SnapshotFact>

                  <SnapshotFact label="Reviewer">
                    <span className="font-mono text-xs">
                      {currentPackage.reviewedByUserId ||
                        "Not recorded"}
                    </span>
                  </SnapshotFact>

                  <SnapshotFact label="Review note">
                    {currentPackage.reviewNote ||
                      "No review note recorded"}
                  </SnapshotFact>
                </dl>
              </section>
            )}
          </>
        )}

      {preFilingApproved && (
        <section className="rounded-lg border border-line p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow text-ink-500">
                Step 4
              </p>

              <h3 className="mt-1 text-base font-semibold text-ink-900">
                Claim Initiation
              </h3>

              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
                The approved jurisdiction rule determines who submits, where
                the package goes, how it is delivered, and how DueQuity may
                participate.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge
                tone={
                  claimInitiationReady
                    ? "positive"
                    : "critical"
                }
                size="md"
              >
                {claimInitiationReady
                  ? "Ready"
                  : "Blocked"}
              </Badge>

              <Badge tone="neutral">
                {initiation.mode === "claimant_controlled"
                  ? "Claimant-controlled"
                  : initiation.mode === "representative_controlled"
                    ? "Representative-controlled"
                    : "Unresolved"}
              </Badge>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-line bg-inset px-4 py-3">
            <p className="text-xs font-semibold text-ink-800">
              Submission route
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {initiation.message}
            </p>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SnapshotFact label="Holding authority">
              {initiation.agencyName}
            </SnapshotFact>

            <SnapshotFact label="Custodian">
              {valueLabel(
                initiation.custodian,
              )}
            </SnapshotFact>

            <SnapshotFact label="Submission method">
              {valueLabel(
                initiation.claimMethod,
              )}
            </SnapshotFact>

            <SnapshotFact label="Filing party">
              {initiation.mode === "claimant_controlled"
                ? "Claimant / lawful estate representative"
                : initiation.mode === "representative_controlled"
                  ? "Authorized representative"
                  : "Unresolved"}
            </SnapshotFact>

            <SnapshotFact label="DueQuity may file">
              {initiation.representativeMayFile === "yes"
                ? "Yes"
                : initiation.representativeMayFile === "no"
                  ? "No"
                  : "Unknown"}
            </SnapshotFact>

            <SnapshotFact label="Attorney required">
              {initiation.attorneyRequired
                ? "Yes"
                : "No"}
            </SnapshotFact>

            <SnapshotFact label="Payment route">
              {valueLabel(
                initiation.paymentRoute,
              )}
            </SnapshotFact>

            <SnapshotFact label="Recovery track">
              {valueLabel(
                initiation.launchPaymentTrack,
              )}
            </SnapshotFact>

            <SnapshotFact label="Fee collection">
              {valueLabel(
                initiation.feeCollectionMethod,
              )}
            </SnapshotFact>
          </dl>

          <div className="mt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-ink-500">
                  Verified filing destination
                </p>

                <p className="mt-1 text-sm font-semibold text-ink-900">
                  Where this claim must be sent
                </p>
              </div>

              <Badge
                tone={
                  filingDestination.complete
                    ? "positive"
                    : "critical"
                }
              >
                {filingDestination.complete
                  ? "Verified"
                  : "Destination incomplete"}
              </Badge>
            </div>

            {filingDestination.status === "verified" &&
            filingDestination.complete ? (
              <div className="mt-3 rounded-lg border border-accent-200 bg-accent-50 p-4">
                <p className="text-xs leading-relaxed text-accent-800">
                  {filingDestination.message}
                </p>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filingDestination.filingEmail && (
                    <SnapshotFact label="Send to">
                      <a
                        href={`mailto:${filingDestination.filingEmail}`}
                        className="break-all text-accent-700 underline underline-offset-4 hover:text-accent-900"
                      >
                        {filingDestination.filingEmail}
                      </a>
                    </SnapshotFact>
                  )}

                  {filingDestination.departmentName && (
                    <SnapshotFact label="Department">
                      {filingDestination.departmentName}
                    </SnapshotFact>
                  )}

                  {filingDestination.attentionLine && (
                    <SnapshotFact label="Attention">
                      {filingDestination.attentionLine}
                    </SnapshotFact>
                  )}

                  {filingDestination.phone && (
                    <SnapshotFact label="Phone">
                      <a
                        href={`tel:${filingDestination.phone}`}
                        className="text-accent-700 underline underline-offset-4 hover:text-accent-900"
                      >
                        {filingDestination.phone}
                      </a>
                    </SnapshotFact>
                  )}

                  {filingDestination.destinationVersion !== undefined && (
                    <SnapshotFact label="Destination version">
                      Version {filingDestination.destinationVersion}
                    </SnapshotFact>
                  )}

                  {filingDestination.verifiedAt && (
                    <SnapshotFact label="Verified">
                      {formatTimestamp(
                        filingDestination.verifiedAt,
                      )}
                    </SnapshotFact>
                  )}
                </dl>

                {filingDestination.mailingAddressLines &&
                  filingDestination.mailingAddressLines.length > 0 && (
                    <div className="mt-4 rounded-md border border-accent-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold text-ink-700">
                        Mailing address
                      </p>

                      <div className="mt-2 text-sm leading-relaxed text-ink-800">
                        {filingDestination.mailingAddressLines.map(
                          (line) => (
                            <div key={line}>
                              {line}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                {filingDestination.physicalAddressLines &&
                  filingDestination.physicalAddressLines.length > 0 && (
                    <div className="mt-4 rounded-md border border-accent-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold text-ink-700">
                        Physical filing address
                      </p>

                      <div className="mt-2 text-sm leading-relaxed text-ink-800">
                        {filingDestination.physicalAddressLines.map(
                          (line) => (
                            <div key={line}>
                              {line}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                {filingDestination.portalUrl && (
                  <div className="mt-4 rounded-md border border-accent-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold text-ink-700">
                      Official filing portal
                    </p>

                    <a
                      href={filingDestination.portalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex break-all text-sm font-semibold text-accent-700 underline underline-offset-4 hover:text-accent-900"
                    >
                      Open official filing portal
                    </a>
                  </div>
                )}

                {filingDestination.filingInstructions &&
                  filingDestination.filingInstructions.length > 0 && (
                    <div className="mt-4 rounded-md border border-accent-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold text-ink-700">
                        Filing instructions
                      </p>

                      <ol className="mt-2 space-y-2 pl-5 text-xs leading-relaxed text-ink-700">
                        {filingDestination.filingInstructions.map(
                          (instruction, index) => (
                            <li
                              key={`${index}-${instruction}`}
                              className="list-decimal"
                            >
                              {instruction}
                            </li>
                          ),
                        )}
                      </ol>
                    </div>
                  )}

                {filingDestination.officialSourceUrl && (
                  <div className="mt-4 border-t border-accent-200 pt-3">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                      Official verification source
                    </p>

                    <a
                      href={filingDestination.officialSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex text-xs font-semibold text-accent-700 underline underline-offset-4 hover:text-accent-900"
                    >
                      {filingDestination.officialSourceTitle ||
                        "Open official government source"}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-critical-200 bg-critical-50 px-4 py-4">
                <p className="text-sm font-semibold text-critical-900">
                  Verified filing destination unavailable
                </p>

                <p className="mt-1 text-xs leading-relaxed text-critical-800">
                  {filingDestination.message}
                </p>

                <p className="mt-2 text-xs leading-relaxed text-critical-700">
                  Staff should not independently search for, guess, or substitute
                  a filing address, email address or government portal.
                </p>
              </div>
            )}
          </div>

          <div className="mt-5">
            <p className="eyebrow text-ink-500">
              Required submission documents
            </p>

            {initiation.requiredDocuments.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {initiation.requiredDocuments.map(
                  (kind) => (
                    <Badge
                      key={kind}
                      tone="positive"
                    >
                      ✓{" "}
                      {documentKindLabel(
                        kind,
                      )}
                    </Badge>
                  ),
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-500">
                No additional jurisdiction-required submission documents are
                active for this claim.
              </p>
            )}
          </div>

          <div className="mt-5">
            <p className="eyebrow text-ink-500">
              Official claim form
            </p>

            {initiation.claimFormUrl ? (
              <a
                href={initiation.claimFormUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-sm font-semibold text-accent-700 underline underline-offset-4 hover:text-accent-900"
              >
                Open official claim form
              </a>
            ) : (
              <>
                <p className="mt-2 text-sm font-semibold text-ink-800">
                  No official form recorded
                </p>

                <p className="mt-1 text-xs text-ink-500">
                  The current approved jurisdiction rule does not identify a
                  separate required claim-form URL.
                </p>
              </>
            )}
          </div>

          {initiation.mode ===
            "claimant_controlled" && (
            <div className="mt-5 rounded-md border border-caution-200 bg-caution-50 px-4 py-4">
              <p className="text-sm font-semibold text-caution-900">
                Claimant-controlled submission
              </p>

              <p className="mt-1 text-xs leading-relaxed text-caution-800">
                DueQuity may prepare, organize and coordinate the claimant-ready
                package. The actual submission must remain under the claimant
                or lawful estate representative&apos;s control. Staff must not
                record DueQuity as the filer.
              </p>
            </div>
          )}

          {initiation.mode ===
            "representative_controlled" && (
            <div className="mt-5 rounded-md border border-accent-200 bg-accent-50 px-4 py-4">
              <p className="text-sm font-semibold text-accent-900">
                Authorized representative route
              </p>

              <p className="mt-1 text-xs leading-relaxed text-accent-800">
                The approved rule permits an authorized representative filing
                route. Any actual submission remains subject to the recorded
                authorization and server-side submission controls.
              </p>
            </div>
          )}

          {claimInitiationReady && (
            <div className="mt-6 border-t border-line pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-ink-500">
                    External event tracking
                  </p>

                  <h4 className="mt-1 text-sm font-semibold text-ink-900">
                    Submission and acknowledgment
                  </h4>

                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
                    These controls record events that actually occurred outside
                    DueQuity. They do not send the package or contact the
                    authority.
                  </p>
                </div>

                {submission && (
                  <Badge
                    tone={
                      submission.status === "acknowledged"
                        ? "positive"
                        : "caution"
                    }
                    size="md"
                  >
                    {submission.status === "acknowledged"
                      ? "Authority acknowledged"
                      : "Submission recorded"}
                  </Badge>
                )}
              </div>

              {submissionError && (
                <div
                  role="alert"
                  className="mt-4 rounded-md border border-critical-200 bg-critical-50 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-critical-800">
                    Submission action could not be completed
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-critical-700">
                    {submissionError}
                  </p>
                </div>
              )}

              {submissionSuccess && (
                <div
                  role="status"
                  className="mt-4 rounded-md border border-accent-200 bg-accent-50 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-accent-900">
                    Saved
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-accent-800">
                    {submissionSuccess}
                  </p>
                </div>
              )}

              {submissionLoading && (
                <div className="mt-4 rounded-md border border-line bg-inset px-4 py-4">
                  <p className="text-xs font-medium text-ink-700">
                    Loading external submission state...
                  </p>
                </div>
              )}

              {!submissionLoading &&
                !submissionData &&
                submissionError && (
                  <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
                    <p className="text-xs leading-relaxed text-caution-800">
                      Submission controls are unavailable for the current staff
                      session until the server-side submission gate authorizes
                      access.
                    </p>
                  </div>
                )}

              {!submissionLoading &&
                submissionData &&
                !submission && (
                  <div className="mt-4 rounded-lg border border-line bg-inset p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink-900">
                          Record actual submission
                        </p>

                        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-600">
                          Record this only after the approved package was
                          actually submitted through the permitted jurisdiction
                          route.
                        </p>
                      </div>

                      <Badge tone="neutral">
                        {submissionData.route.mode === "claimant_controlled"
                          ? "Filer: claimant"
                          : "Filer: authorized representative"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-ink-700">
                          Submission date and time
                        </label>

                        <input
                          type="datetime-local"
                          value={submittedAt}
                          onChange={(event) => {
                            setSubmittedAt(
                              event.target.value,
                            );
                          }}
                          className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-ink-700">
                          External reference
                        </label>

                        <input
                          type="text"
                          value={submissionReference}
                          onChange={(event) => {
                            setSubmissionReference(
                              event.target.value,
                            );
                          }}
                          placeholder="Optional confirmation, tracking or reference number"
                          className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-semibold text-ink-700">
                        Submission note
                      </label>

                      <textarea
                        rows={3}
                        value={submissionNote}
                        onChange={(event) => {
                          setSubmissionNote(
                            event.target.value,
                          );
                        }}
                        placeholder={
                          submissionData.route.mode === "claimant_controlled"
                            ? "Optional note describing how the claimant confirmed submission."
                            : "Optional internal note describing the authorized representative submission."
                        }
                        className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                      />
                    </div>

                    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                      <SnapshotFact label="Authority">
                        {submissionData.route.agencyName}
                      </SnapshotFact>

                      <SnapshotFact label="Method">
                        {valueLabel(
                          submissionData.route.submissionMethod,
                        )}
                      </SnapshotFact>

                      <SnapshotFact label="Filing party">
                        {submissionData.route.mode === "claimant_controlled"
                          ? "Claimant / lawful estate representative"
                          : "Authorized representative"}
                      </SnapshotFact>
                    </dl>

                    {submissionData.route.mode === "claimant_controlled" && (
                      <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
                        <p className="text-xs font-semibold text-caution-900">
                          DueQuity is not the filer
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-caution-800">
                          The server will store the filing party as the
                          claimant / lawful estate representative. This form
                          cannot override that route.
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={
                        action !== null ||
                        !submissionData.permissions.mayRecordSubmission
                      }
                      onClick={() => {
                        void runSubmissionAction(
                          "record_submission",
                        );
                      }}
                      className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {action === "record_submission"
                        ? "Recording submission..."
                        : "Record external submission"}
                    </button>
                  </div>
                )}

              {submission && (
                <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-accent-950">
                        External submission recorded
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-accent-800">
                        This record confirms an external submission was reported
                        as having actually occurred. It does not mean the
                        submission was sent by this software.
                      </p>
                    </div>

                    <Badge tone="positive">
                      Submitted
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <SnapshotFact label="Submitted">
                      {formatTimestamp(
                        submission.submittedAt,
                      )}
                    </SnapshotFact>

                    <SnapshotFact label="Filing party">
                      {submission.routeMode === "claimant_controlled"
                        ? "Claimant / lawful estate representative"
                        : "Authorized representative"}
                    </SnapshotFact>

                    <SnapshotFact label="Method">
                      {valueLabel(
                        submission.submissionMethod,
                      )}
                    </SnapshotFact>

                    <SnapshotFact label="Authority">
                      {submission.authorityName}
                    </SnapshotFact>

                    <SnapshotFact label="External reference">
                      {submission.externalReference ||
                        "Not recorded"}
                    </SnapshotFact>

                    <SnapshotFact label="Recorded by">
                      <span className="font-mono text-xs">
                        {submission.recordedByUserId}
                      </span>
                    </SnapshotFact>
                  </dl>

                  {submission.submissionNote && (
                    <div className="mt-4 rounded-md border border-accent-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold text-ink-700">
                        Submission note
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-ink-600">
                        {submission.submissionNote}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {submission &&
                submission.status === "submitted" &&
                submissionData?.permissions.mayRecordAcknowledgment && (
                  <div className="mt-4 rounded-lg border border-caution-200 bg-caution-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-caution-950">
                        Record authority acknowledgment
                      </p>

                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-caution-800">
                        Record this only after the authority has actually
                        acknowledged receipt or provided an identifiable
                        response.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-ink-700">
                          Acknowledgment date and time
                        </label>

                        <input
                          type="datetime-local"
                          value={acknowledgedAt}
                          onChange={(event) => {
                            setAcknowledgedAt(
                              event.target.value,
                            );
                          }}
                          className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-ink-700">
                          Authority reference
                        </label>

                        <input
                          type="text"
                          value={acknowledgmentReference}
                          onChange={(event) => {
                            setAcknowledgmentReference(
                              event.target.value,
                            );
                          }}
                          placeholder="Optional agency reference, case number or confirmation"
                          className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-semibold text-ink-700">
                        Acknowledgment summary
                      </label>

                      <textarea
                        rows={3}
                        value={acknowledgmentSummary}
                        onChange={(event) => {
                          setAcknowledgmentSummary(
                            event.target.value,
                          );
                        }}
                        placeholder="Optional summary of what the authority confirmed."
                        className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={action !== null}
                      onClick={() => {
                        void runSubmissionAction(
                          "record_acknowledgment",
                        );
                      }}
                      className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {action === "record_acknowledgment"
                        ? "Recording acknowledgment..."
                        : "Record authority acknowledgment"}
                    </button>
                  </div>
                )}

              {submission?.status === "acknowledged" && (
                <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-accent-950">
                        Authority acknowledgment recorded
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-accent-800">
                        Submission and receipt are now recorded as two separate
                        external facts.
                      </p>
                    </div>

                    <Badge
                      tone="positive"
                      size="md"
                    >
                      Acknowledged
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <SnapshotFact label="Acknowledged">
                      {formatTimestamp(
                        submission.acknowledgedAt,
                      )}
                    </SnapshotFact>

                    <SnapshotFact label="Authority reference">
                      {submission.externalReference ||
                        "Not recorded"}
                    </SnapshotFact>

                    <SnapshotFact label="Recorded by">
                      <span className="font-mono text-xs">
                        {submission.acknowledgmentRecordedByUserId ||
                          "Not recorded"}
                      </span>
                    </SnapshotFact>
                  </dl>

                  {submission.acknowledgmentSummary && (
                    <div className="mt-4 rounded-md border border-accent-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold text-ink-700">
                        Acknowledgment summary
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-ink-600">
                        {submission.acknowledgmentSummary}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {data.packageHistory.length > 0 && (
        <section className="rounded-lg border border-line p-4 sm:p-5">
          <p className="eyebrow text-ink-500">
            Package history
          </p>

          <div className="mt-3 space-y-2">
            {data.packageHistory.map(
              (filingPackage) => (
                <div
                  key={filingPackage.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-3"
                >
                  <div>
                    <p className="text-xs font-semibold text-ink-800">
                      Version{" "}
                      {filingPackage.version}
                    </p>

                    <p className="mt-0.5 font-mono text-2xs text-ink-500">
                      {filingPackage.id}
                    </p>

                    <p className="mt-1 text-2xs text-ink-500">
                      Prepared{" "}
                      {formatTimestamp(
                        filingPackage.preparedAt,
                      )}
                    </p>
                  </div>

                  <Badge
                    tone={statusTone(
                      filingPackage.status,
                    )}
                  >
                    {statusLabel(
                      filingPackage.status,
                    )}
                  </Badge>
                </div>
              ),
            )}
          </div>
        </section>
      )}
    </div>
  );
}