"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Badge,
  Identifier,
} from "@/components/ui/badge";

/**
 * CLAIM AUTHORITY REVIEW PANEL
 *
 * Post-submission operational workspace.
 *
 * This panel never creates or implies an external filing.
 *
 * Until a real durable claim submission exists, the panel remains dormant.
 *
 * Once the submission exists, the Supabase submission trigger opens the
 * authority-review lifecycle automatically. Staff may then record only
 * real-world authority events that actually occurred.
 *
 * UI action availability mirrors the server/database lifecycle:
 *
 * - review start: acknowledged only;
 * - information request: acknowledged, under review, or additional information;
 * - information response: open request only;
 * - information satisfied: responded request only;
 * - information withdrawn: open request only;
 * - approval/denial: acknowledged, under review, or additional information;
 * - payment issued: approved only;
 * - recovery: payment issued only;
 * - closure: approved, denied, payment issued, or recovered.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type AuthorityReviewStatus =
  | "awaiting_acknowledgment"
  | "acknowledged"
  | "under_review"
  | "additional_information_required"
  | "approved"
  | "denied"
  | "payment_issued"
  | "recovered"
  | "closed";

type InformationRequestStatus =
  | "open"
  | "responded"
  | "satisfied"
  | "withdrawn";

interface AuthoritySubmission {
  id:
    string;

  status:
    "submitted" |
    "acknowledged";

  submittedAt:
    string;

  acknowledgedAt?:
    string;

  externalReference?:
    string;

  acknowledgmentReference?:
    string;

  authorityName:
    string;

  submissionMethod:
    string;

  filingDestinationId:
    string;

  filingDestinationVersion:
    number;

  filingDestinationSnapshotHash:
    string;
}

interface AuthorityReview {
  id:
    string;

  claimId:
    string;

  claimReference:
    string;

  submissionId:
    string;

  filingPackageId:
    string;

  filingPackageVersion:
    number;

  filingDestinationId:
    string;

  filingDestinationVersion:
    number;

  filingDestinationSnapshotHash:
    string;

  authorityName:
    string;

  submissionMethod:
    string;

  status:
    AuthorityReviewStatus;

  openedAt:
    string;

  acknowledgedAt?:
    string;

  decisionAt?:
    string;

  decisionReference?:
    string;

  decisionSummary?:
    string;

  approvedAmountCents?:
    number;

  denialReason?:
    string;

  paymentIssuedAt?:
    string;

  paymentReference?:
    string;

  paymentAmountCents?:
    number;

  recoveredAt?:
    string;

  recoveredAmountCents?:
    number;

  closedAt?:
    string;

  closeSummary?:
    string;

  lastActionByUserId:
    string;

  rowVersion:
    number;

  createdAt:
    string;

  updatedAt:
    string;
}

interface InformationRequest {
  id:
    string;

  authorityReviewId:
    string;

  claimId:
    string;

  submissionId:
    string;

  requestReference?:
    string;

  requestSummary:
    string;

  requestedAt:
    string;

  dueAt?:
    string;

  status:
    InformationRequestStatus;

  responseReference?:
    string;

  responseSummary?:
    string;

  respondedAt?:
    string;

  satisfiedAt?:
    string;

  recordedByUserId:
    string;

  respondedByUserId?:
    string;

  rowVersion:
    number;

  createdAt:
    string;

  updatedAt:
    string;
}

interface AuthorityAuditEntry {
  id:
    string;

  claimId:
    string;

  authorityReviewId:
    string;

  submissionId:
    string;

  action:
    string;

  actorUserId:
    string;

  occurredAt:
    string;

  externalReference?:
    string;

  summary?:
    string;

  detail?:
    Record<
      string,
      unknown
    >;

  createdAt:
    string;
}

interface AuthorityApiPayload {
  ok:
    true;

  claim: {
    id:
      string;

    reference:
      string;
  };

  available:
    boolean;

  submission:
    AuthoritySubmission |
    null;

  review:
    AuthorityReview |
    null;

  informationRequests:
    InformationRequest[];

  audit:
    AuthorityAuditEntry[];

  permissions: {
    actorUserId:
      string;

    mayRead:
      boolean;

    mayRecordEvents:
      boolean;
  };
}

interface ApiErrorPayload {
  ok?:
    false;

  error?:
    string;
}

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

function statusLabel(
  status:
    AuthorityReviewStatus,
): string {
  switch (
    status
  ) {
    case "awaiting_acknowledgment":
      return "Awaiting acknowledgment";

    case "acknowledged":
      return "Acknowledged";

    case "under_review":
      return "Under authority review";

    case "additional_information_required":
      return "Additional information required";

    case "approved":
      return "Approved";

    case "denied":
      return "Denied";

    case "payment_issued":
      return "Payment issued";

    case "recovered":
      return "Recovered";

    case "closed":
      return "Closed";
  }
}

function statusTone(
  status:
    AuthorityReviewStatus,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  switch (
    status
  ) {
    case "approved":
    case "payment_issued":
    case "recovered":
    case "closed":
      return "positive";

    case "additional_information_required":
    case "awaiting_acknowledgment":
      return "caution";

    case "denied":
      return "critical";

    default:
      return "neutral";
  }
}

function informationStatusLabel(
  status:
    InformationRequestStatus,
): string {
  switch (
    status
  ) {
    case "open":
      return "Open";

    case "responded":
      return "Responded";

    case "satisfied":
      return "Satisfied";

    case "withdrawn":
      return "Withdrawn";
  }
}

function informationStatusTone(
  status:
    InformationRequestStatus,
):
  | "positive"
  | "caution"
  | "neutral" {
  switch (
    status
  ) {
    case "satisfied":
      return "positive";

    case "open":
    case "responded":
      return "caution";

    default:
      return "neutral";
  }
}

function formatTimestamp(
  value:
    string |
    undefined,
): string {
  if (!value) {
    return "Not recorded";
  }

  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    },
  ).format(
    parsed,
  );
}

function formatMoney(
  cents:
    number |
    undefined,
): string {
  if (
    cents ===
    undefined
  ) {
    return "Not recorded";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",
    },
  ).format(
    cents /
    100,
  );
}

function toIsoInstant(
  value:
    string,
  label:
    string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  const parsed =
    new Date(
      normalized,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      `${label} must be a valid date and time.`,
    );
  }

  return parsed.toISOString();
}

function dollarsToCents(
  value:
    string,
  label:
    string,
): number {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  const amount =
    Number(
      normalized,
    );

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <
      0
  ) {
    throw new Error(
      `${label} must be a non-negative amount.`,
    );
  }

  return Math.round(
    amount *
    100,
  );
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimAuthorityReviewPanel({
  claimId,
}: {
  claimId:
    string;
}) {
  const router =
    useRouter();

  const [
    data,
    setData,
  ] =
    useState<
      AuthorityApiPayload |
      null
    >(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    error,
    setError,
  ] =
    useState(
      "",
    );

  const [
    success,
    setSuccess,
  ] =
    useState(
      "",
    );

  const [
    action,
    setAction,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const [
    occurredAt,
    setOccurredAt,
  ] =
    useState(
      "",
    );

  const [
    externalReference,
    setExternalReference,
  ] =
    useState(
      "",
    );

  const [
    summary,
    setSummary,
  ] =
    useState(
      "",
    );

  const [
    requestSummary,
    setRequestSummary,
  ] =
    useState(
      "",
    );

  const [
    requestReference,
    setRequestReference,
  ] =
    useState(
      "",
    );

  const [
    requestedAt,
    setRequestedAt,
  ] =
    useState(
      "",
    );

  const [
    dueAt,
    setDueAt,
  ] =
    useState(
      "",
    );

  const [
    denialReason,
    setDenialReason,
  ] =
    useState(
      "",
    );

  const [
    approvedAmount,
    setApprovedAmount,
  ] =
    useState(
      "",
    );

  const [
    paymentAmount,
    setPaymentAmount,
  ] =
    useState(
      "",
    );

  const [
    paymentReference,
    setPaymentReference,
  ] =
    useState(
      "",
    );

  const [
    recoveredAmount,
    setRecoveredAmount,
  ] =
    useState(
      "",
    );

  const [
    closeSummary,
    setCloseSummary,
  ] =
    useState(
      "",
    );

  const [
    requestResponses,
    setRequestResponses,
  ] =
    useState<
      Record<
        string,
        {
          respondedAt:
            string;

          responseSummary:
            string;

          responseReference:
            string;
        }
      >
    >(
      {},
    );

  /* ======================================================================== */
  /* Load                                                                      */
  /* ======================================================================== */

  const load =
    useCallback(
      async (
        signal?:
          AbortSignal,
      ) => {
        const response =
          await fetch(
            `/api/pro/claims/${encodeURIComponent(
              claimId,
            )}/authority-review`,
            {
              method:
                "GET",

              cache:
                "no-store",

              signal,

              headers: {
                Accept:
                  "application/json",
              },
            },
          );

        const payload =
          (await response.json()) as
            | AuthorityApiPayload
            | ApiErrorPayload;

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            "error" in
              payload &&
            payload.error
              ? payload.error
              : "Authority-review state could not be loaded.",
          );
        }

        setData(
          payload,
        );

        setError(
          "",
        );

        return payload;
      },
      [
        claimId,
      ],
    );

  useEffect(
    () => {
      const controller =
        new AbortController();

      load(
        controller.signal,
      )
        .catch(
          (
            loadError:
              unknown,
          ) => {
            if (
              controller.signal.aborted
            ) {
              return;
            }

            setError(
              loadError instanceof
                Error
                ? loadError.message
                : "Authority-review state could not be loaded.",
            );
          },
        )
        .finally(
          () => {
            if (
              !controller.signal.aborted
            ) {
              setLoading(
                false,
              );
            }
          },
        );

      return () => {
        controller.abort();
      };
    },
    [
      load,
    ],
  );

  /* ======================================================================== */
  /* Mutation                                                                  */
  /* ======================================================================== */

  async function mutate(
    actionKey:
      string,
    body:
      Record<
        string,
        unknown
      >,
    successMessage:
      string,
  ) {
    setAction(
      actionKey,
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/pro/claims/${encodeURIComponent(
            claimId,
          )}/authority-review`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify(
                body,
              ),
          },
        );

      const payload =
        (await response.json()) as
          | AuthorityApiPayload
          | ApiErrorPayload;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          "error" in
            payload &&
          payload.error
            ? payload.error
            : "The authority-review event could not be recorded.",
        );
      }

      setData(
        payload,
      );

      setSuccess(
        successMessage,
      );

      router.refresh();
    } catch (
      mutationError
    ) {
      setError(
        mutationError instanceof
          Error
          ? mutationError.message
          : "The authority-review event could not be recorded.",
      );
    } finally {
      setAction(
        null,
      );
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
          Loading authority review
        </p>

        <p className="mt-1 text-xs text-ink-500">
          Reading durable submission and authority-review state.
        </p>
      </div>
    );
  }

  if (
    !data
  ) {
    return (
      <div className="rounded-md border border-critical-200 bg-critical-50 px-4 py-4">
        <p className="text-sm font-semibold text-critical-800">
          Authority review unavailable
        </p>

        <p className="mt-1 text-xs leading-relaxed text-critical-700">
          {
            error ||
            "The authority-review workspace could not be loaded."
          }
        </p>
      </div>
    );
  }

  /* ======================================================================== */
  /* Dormant state                                                             */
  /* ======================================================================== */

  if (
    !data.available ||
    !data.submission ||
    !data.review
  ) {
    return (
      <div className="rounded-lg border border-line bg-inset px-4 py-5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-ink-900">
              Authority Review
            </p>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
              This stage activates only after a real external claim submission
              has been durably recorded.
            </p>
          </div>

          <Badge tone="neutral">
            Not active
          </Badge>
        </div>

        <div className="mt-4 rounded-md border border-line bg-white px-4 py-3">
          <p className="text-xs font-semibold text-ink-700">
            No external submission recorded
          </p>

          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            DueQuity will not create an authority-review record from preparation,
            pre-filing approval, or Claim Initiation readiness alone. Record the
            authority lifecycle only after the permitted external filing actually
            occurs.
          </p>
        </div>
      </div>
    );
  }

  const {
    submission,
    review,
  } =
    data;

  const mayRecord =
    data.permissions
      .mayRecordEvents &&
    review.status !==
      "closed";

  const mayRecordInformationRequest =
    mayRecord &&
    (
      review.status ===
        "acknowledged" ||
      review.status ===
        "under_review" ||
      review.status ===
        "additional_information_required"
    );

  const mayRecordDecision =
    mayRecord &&
    (
      review.status ===
        "acknowledged" ||
      review.status ===
        "under_review" ||
      review.status ===
        "additional_information_required"
    );

  const mayCloseReview =
    mayRecord &&
    (
      review.status ===
        "approved" ||
      review.status ===
        "denied" ||
      review.status ===
        "payment_issued" ||
      review.status ===
        "recovered"
    );

  /* ======================================================================== */
  /* Active UI                                                                 */
  /* ======================================================================== */

  return (
    <div className="min-w-0 space-y-5">
      {
        error &&
        (
          <div
            role="alert"
            className="rounded-md border border-critical-200 bg-critical-50 px-4 py-3"
          >
            <p className="text-sm font-semibold text-critical-800">
              Action could not be completed
            </p>

            <p className="mt-1 text-xs text-critical-700">
              {
                error
              }
            </p>
          </div>
        )
      }

      {
        success &&
        (
          <div
            role="status"
            className="rounded-md border border-accent-200 bg-accent-50 px-4 py-3"
          >
            <p className="text-sm font-semibold text-accent-900">
              Saved
            </p>

            <p className="mt-1 text-xs text-accent-800">
              {
                success
              }
            </p>
          </div>
        )
      }

      {/* ================================================================== status */}

      <section className="rounded-lg border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-inset px-4 py-4 sm:px-5">
          <div>
            <p className="text-base font-semibold text-ink-900">
              Authority Review
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              Durable post-submission government review and payment lifecycle.
            </p>
          </div>

          <Badge
            tone={
              statusTone(
                review.status,
              )
            }
            size="md"
          >
            {
              statusLabel(
                review.status,
              )
            }
          </Badge>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          <div>
            <p className="text-xs text-ink-500">
              Authority
            </p>

            <p className="mt-1 text-sm font-semibold text-ink-900">
              {
                review.authorityName
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Submitted
            </p>

            <p className="mt-1 text-sm font-medium text-ink-800">
              {
                formatTimestamp(
                  submission.submittedAt,
                )
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Submission method
            </p>

            <p className="mt-1 text-sm font-medium capitalize text-ink-800">
              {
                review.submissionMethod.replaceAll(
                  "_",
                  " ",
                )
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Submission
            </p>

            <Identifier>
              {
                review.submissionId
              }
            </Identifier>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Filing package
            </p>

            <p className="mt-1 text-sm font-medium text-ink-800">
              Version {
                review.filingPackageVersion
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Filing destination
            </p>

            <p className="mt-1 text-sm font-medium text-ink-800">
              Version {
                review.filingDestinationVersion
              }
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================== major events */}

      {
        mayRecord &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Record authority event
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Record only an event that actually occurred outside DueQuity.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-ink-700">
                  Event date and time
                </span>

                <input
                  type="datetime-local"
                  value={
                    occurredAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setOccurredAt(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-ink-700">
                  External reference
                </span>

                <input
                  type="text"
                  value={
                    externalReference
                  }
                  onChange={(
                    event,
                  ) => {
                    setExternalReference(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Summary
              </span>

              <textarea
                rows={
                  2
                }
                value={
                  summary
                }
                onChange={(
                  event,
                ) => {
                  setSummary(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              {
                review.status ===
                  "acknowledged" &&
                (
                  <button
                    type="button"
                    disabled={
                      action !==
                      null
                    }
                    onClick={() => {
                      try {
                        const timestamp =
                          toIsoInstant(
                            occurredAt,
                            "Review started at",
                          );

                        void mutate(
                          "review_started",
                          {
                            action:
                              "record_review_started",

                            occurredAt:
                              timestamp,

                            externalReference:
                              externalReference.trim() ||
                              undefined,

                            summary:
                              summary.trim() ||
                              undefined,
                          },
                          "Authority review start recorded.",
                        );
                      } catch (
                        validationError
                      ) {
                        setError(
                          validationError instanceof
                            Error
                            ? validationError.message
                            : "Review start could not be recorded.",
                        );
                      }
                    }}
                    className="inline-flex min-h-10 items-center justify-center rounded-md bg-ink-950 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {
                      action ===
                      "review_started"
                        ? "Recording..."
                        : "Record review started"
                    }
                  </button>
                )
              }

              {
                mayRecordDecision &&
                (
                  <>
                    <button
                      type="button"
                      disabled={
                        action !==
                        null
                      }
                      onClick={() => {
                        try {
                          const timestamp =
                            toIsoInstant(
                              occurredAt,
                              "Approval timestamp",
                            );

                          if (
                            !summary.trim()
                          ) {
                            throw new Error(
                              "Approval summary is required.",
                            );
                          }

                          void mutate(
                            "approval",
                            {
                              action:
                                "record_approval",

                              occurredAt:
                                timestamp,

                              externalReference:
                                externalReference.trim() ||
                                undefined,

                              summary:
                                summary.trim(),

                              approvedAmountCents:
                                approvedAmount.trim()
                                  ? dollarsToCents(
                                      approvedAmount,
                                      "Approved amount",
                                    )
                                  : undefined,
                            },
                            "Authority approval recorded.",
                          );
                        } catch (
                          validationError
                        ) {
                          setError(
                            validationError instanceof
                              Error
                              ? validationError.message
                              : "Approval could not be recorded.",
                          );
                        }
                      }}
                      className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {
                        action ===
                        "approval"
                          ? "Recording..."
                          : "Record approval"
                      }
                    </button>

                    <button
                      type="button"
                      disabled={
                        action !==
                        null
                      }
                      onClick={() => {
                        try {
                          const timestamp =
                            toIsoInstant(
                              occurredAt,
                              "Denial timestamp",
                            );

                          if (
                            !denialReason.trim()
                          ) {
                            throw new Error(
                              "Denial reason is required.",
                            );
                          }

                          void mutate(
                            "denial",
                            {
                              action:
                                "record_denial",

                              occurredAt:
                                timestamp,

                              externalReference:
                                externalReference.trim() ||
                                undefined,

                              summary:
                                summary.trim() ||
                                undefined,

                              denialReason:
                                denialReason.trim(),
                            },
                            "Authority denial recorded.",
                          );
                        } catch (
                          validationError
                        ) {
                          setError(
                            validationError instanceof
                              Error
                              ? validationError.message
                              : "Denial could not be recorded.",
                          );
                        }
                      }}
                      className="inline-flex min-h-10 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2 text-xs font-semibold text-critical-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {
                        action ===
                        "denial"
                          ? "Recording..."
                          : "Record denial"
                      }
                    </button>
                  </>
                )
              }
            </div>

            {
              mayRecordDecision &&
              (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-ink-700">
                      Approved amount
                    </span>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        approvedAmount
                      }
                      onChange={(
                        event,
                      ) => {
                        setApprovedAmount(
                          event.target.value,
                        );
                      }}
                      placeholder="Optional"
                      className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-ink-700">
                      Denial reason
                    </span>

                    <input
                      type="text"
                      value={
                        denialReason
                      }
                      onChange={(
                        event,
                      ) => {
                        setDenialReason(
                          event.target.value,
                        );
                      }}
                      placeholder="Required only for denial"
                      className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900"
                    />
                  </label>
                </div>
              )
            }
          </section>
        )
      }

      {/* ================================================== information request */}

      {
        mayRecordInformationRequest &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Additional information request
            </p>

            <p className="mt-1 text-xs text-ink-500">
              Record a request only after the authority actually asks for
              additional information or documentation.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Requested at
                </span>

                <input
                  type="datetime-local"
                  value={
                    requestedAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setRequestedAt(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Due at
                </span>

                <input
                  type="datetime-local"
                  value={
                    dueAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setDueAt(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Request summary
              </span>

              <textarea
                rows={
                  2
                }
                value={
                  requestSummary
                }
                onChange={(
                  event,
                ) => {
                  setRequestSummary(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Request reference
              </span>

              <input
                type="text"
                value={
                  requestReference
                }
                onChange={(
                  event,
                ) => {
                  setRequestReference(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
              />
            </label>

            <button
              type="button"
              disabled={
                action !==
                null
              }
              onClick={() => {
                try {
                  const timestamp =
                    toIsoInstant(
                      requestedAt,
                      "Requested at",
                    );

                  if (
                    !requestSummary.trim()
                  ) {
                    throw new Error(
                      "Request summary is required.",
                    );
                  }

                  const resolvedDueAt =
                    dueAt.trim()
                      ? toIsoInstant(
                          dueAt,
                          "Due at",
                        )
                      : undefined;

                  void mutate(
                    "information_request",
                    {
                      action:
                        "record_information_request",

                      requestedAt:
                        timestamp,

                      requestSummary:
                        requestSummary.trim(),

                      requestReference:
                        requestReference.trim() ||
                        undefined,

                      dueAt:
                        resolvedDueAt,
                    },
                    "Authority information request recorded.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Information request could not be recorded.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-ink-950 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {
                action ===
                "information_request"
                  ? "Recording..."
                  : "Record information request"
              }
            </button>
          </section>
        )
      }

      {/* ======================================================== open requests */}

      {
        data.informationRequests.length >
          0 &&
        (
          <section className="space-y-3">
            <p className="text-sm font-semibold text-ink-900">
              Authority information requests
            </p>

            {
              data.informationRequests.map(
                (
                  request,
                ) => {
                  const response =
                    requestResponses[
                      request.id
                    ] ??
                    {
                      respondedAt:
                        "",

                      responseSummary:
                        "",

                      responseReference:
                        "",
                    };

                  return (
                    <div
                      key={
                        request.id
                      }
                      className="rounded-lg border border-line bg-white p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink-900">
                            {
                              request.requestSummary
                            }
                          </p>

                          <p className="mt-1 text-xs text-ink-500">
                            Requested {
                              formatTimestamp(
                                request.requestedAt,
                              )
                            }
                          </p>
                        </div>

                        <Badge
                          tone={
                            informationStatusTone(
                              request.status,
                            )
                          }
                        >
                          {
                            informationStatusLabel(
                              request.status,
                            )
                          }
                        </Badge>
                      </div>

                      {
                        request.requestReference &&
                        (
                          <p className="mt-3 text-xs text-ink-600">
                            Authority reference:{" "}
                            <span className="font-semibold text-ink-800">
                              {
                                request.requestReference
                              }
                            </span>
                          </p>
                        )
                      }

                      {
                        request.dueAt &&
                        (
                          <p className="mt-1 text-xs text-ink-600">
                            Due {
                              formatTimestamp(
                                request.dueAt,
                              )
                            }
                          </p>
                        )
                      }

                      {
                        request.responseSummary &&
                        (
                          <div className="mt-3 rounded-md border border-accent-200 bg-accent-50 px-3 py-3">
                            <p className="text-xs font-semibold text-accent-900">
                              Response recorded
                            </p>

                            <p className="mt-1 text-xs text-accent-800">
                              {
                                request.responseSummary
                              }
                            </p>
                          </div>
                        )
                      }

                      {
                        mayRecord &&
                        request.status ===
                          "open" &&
                        (
                          <div className="mt-4 border-t border-line pt-4">
                            <p className="text-xs font-semibold text-ink-700">
                              Respond to request
                            </p>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <input
                                type="datetime-local"
                                value={
                                  response.respondedAt
                                }
                                onChange={(
                                  event,
                                ) => {
                                  setRequestResponses(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      [
                                        request.id
                                      ]: {
                                        ...response,

                                        respondedAt:
                                          event.target.value,
                                      },
                                    }),
                                  );
                                }}
                                className="rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                              />

                              <input
                                type="text"
                                value={
                                  response.responseReference
                                }
                                onChange={(
                                  event,
                                ) => {
                                  setRequestResponses(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      [
                                        request.id
                                      ]: {
                                        ...response,

                                        responseReference:
                                          event.target.value,
                                      },
                                    }),
                                  );
                                }}
                                placeholder="Response reference"
                                className="rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                              />
                            </div>

                            <textarea
                              rows={
                                2
                              }
                              value={
                                response.responseSummary
                              }
                              onChange={(
                                event,
                              ) => {
                                setRequestResponses(
                                  (
                                    current,
                                  ) => ({
                                    ...current,

                                    [
                                      request.id
                                    ]: {
                                      ...response,

                                      responseSummary:
                                        event.target.value,
                                    },
                                  }),
                                );
                              }}
                              placeholder="Response summary"
                              className="mt-3 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                            />

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={
                                  action !==
                                  null
                                }
                                onClick={() => {
                                  try {
                                    const timestamp =
                                      toIsoInstant(
                                        response.respondedAt,
                                        "Responded at",
                                      );

                                    if (
                                      !response.responseSummary.trim()
                                    ) {
                                      throw new Error(
                                        "Response summary is required.",
                                      );
                                    }

                                    void mutate(
                                      `respond:${request.id}`,
                                      {
                                        action:
                                          "record_information_response",

                                        requestId:
                                          request.id,

                                        respondedAt:
                                          timestamp,

                                        responseSummary:
                                          response.responseSummary.trim(),

                                        responseReference:
                                          response.responseReference.trim() ||
                                          undefined,
                                      },
                                      "Authority information response recorded.",
                                    );
                                  } catch (
                                    validationError
                                  ) {
                                    setError(
                                      validationError instanceof
                                        Error
                                        ? validationError.message
                                        : "Response could not be recorded.",
                                    );
                                  }
                                }}
                                className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {
                                  action ===
                                  `respond:${request.id}`
                                    ? "Recording..."
                                    : "Record response"
                                }
                              </button>

                              <button
                                type="button"
                                disabled={
                                  action !==
                                  null
                                }
                                onClick={() => {
                                  try {
                                    const timestamp =
                                      toIsoInstant(
                                        occurredAt,
                                        "Withdrawal timestamp",
                                      );

                                    void mutate(
                                      `withdraw:${request.id}`,
                                      {
                                        action:
                                          "resolve_information_request",

                                        requestId:
                                          request.id,

                                        occurredAt:
                                          timestamp,

                                        resolution:
                                          "withdrawn",

                                        summary:
                                          summary.trim() ||
                                          undefined,
                                      },
                                      "Information request marked withdrawn.",
                                    );
                                  } catch (
                                    validationError
                                  ) {
                                    setError(
                                      validationError instanceof
                                        Error
                                        ? validationError.message
                                        : "Request withdrawal could not be recorded.",
                                    );
                                  }
                                }}
                                className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-700 disabled:opacity-50"
                              >
                                {
                                  action ===
                                  `withdraw:${request.id}`
                                    ? "Recording..."
                                    : "Mark withdrawn"
                                }
                              </button>
                            </div>

                            <p className="mt-2 text-2xs leading-relaxed text-ink-500">
                              Withdrawal uses the shared authority-event date and
                              time field above.
                            </p>
                          </div>
                        )
                      }

                      {
                        mayRecord &&
                        request.status ===
                          "responded" &&
                        (
                          <div className="mt-4 border-t border-line pt-4">
                            <p className="text-xs font-semibold text-ink-700">
                              Resolve authority request
                            </p>

                            <p className="mt-1 text-xs leading-relaxed text-ink-500">
                              Mark the request satisfied only after the authority
                              accepts the response or the request is otherwise
                              actually resolved.
                            </p>

                            <button
                              type="button"
                              disabled={
                                action !==
                                null
                              }
                              onClick={() => {
                                try {
                                  const timestamp =
                                    toIsoInstant(
                                      occurredAt,
                                      "Resolution timestamp",
                                    );

                                  void mutate(
                                    `satisfy:${request.id}`,
                                    {
                                      action:
                                        "resolve_information_request",

                                      requestId:
                                        request.id,

                                      occurredAt:
                                        timestamp,

                                      resolution:
                                        "satisfied",

                                      summary:
                                        summary.trim() ||
                                        undefined,
                                    },
                                    "Information request marked satisfied.",
                                  );
                                } catch (
                                  validationError
                                ) {
                                  setError(
                                    validationError instanceof
                                      Error
                                      ? validationError.message
                                      : "Request resolution could not be recorded.",
                                  );
                                }
                              }}
                              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {
                                action ===
                                `satisfy:${request.id}`
                                  ? "Recording..."
                                  : "Mark satisfied"
                              }
                            </button>

                            <p className="mt-2 text-2xs leading-relaxed text-ink-500">
                              Resolution uses the shared authority-event date and
                              time field above.
                            </p>
                          </div>
                        )
                      }
                    </div>
                  );
                },
              )
            }
          </section>
        )
      }

      {/* ==================================================== payment/recovery */}

      {
        mayRecord &&
        review.status ===
          "approved" &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Payment issuance
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  paymentAmount
                }
                onChange={(
                  event,
                ) => {
                  setPaymentAmount(
                    event.target.value,
                  );
                }}
                placeholder="Payment amount"
                className="rounded-md border border-line bg-white px-3 py-2.5 text-sm"
              />

              <input
                type="text"
                value={
                  paymentReference
                }
                onChange={(
                  event,
                ) => {
                  setPaymentReference(
                    event.target.value,
                  );
                }}
                placeholder="Payment reference"
                className="rounded-md border border-line bg-white px-3 py-2.5 text-sm"
              />
            </div>

            <button
              type="button"
              disabled={
                action !==
                null
              }
              onClick={() => {
                try {
                  const timestamp =
                    toIsoInstant(
                      occurredAt,
                      "Payment-issued timestamp",
                    );

                  void mutate(
                    "payment",
                    {
                      action:
                        "record_payment_issued",

                      occurredAt:
                        timestamp,

                      paymentAmountCents:
                        dollarsToCents(
                          paymentAmount,
                          "Payment amount",
                        ),

                      paymentReference:
                        paymentReference.trim() ||
                        undefined,

                      summary:
                        summary.trim() ||
                        undefined,
                    },
                    "Payment issuance recorded.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Payment issuance could not be recorded.",
                  );
                }
              }}
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {
                action ===
                "payment"
                  ? "Recording..."
                  : "Record payment issued"
              }
            </button>

            <p className="mt-2 text-2xs text-ink-500">
              Payment issuance uses the shared authority-event date and time
              field above.
            </p>
          </section>
        )
      }

      {
        mayRecord &&
        review.status ===
          "payment_issued" &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Recovery
            </p>

            <input
              type="number"
              min="0"
              step="0.01"
              value={
                recoveredAmount
              }
              onChange={(
                event,
              ) => {
                setRecoveredAmount(
                  event.target.value,
                );
              }}
              placeholder="Recovered amount"
              className="mt-3 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-xs"
            />

            <button
              type="button"
              disabled={
                action !==
                null
              }
              onClick={() => {
                try {
                  const timestamp =
                    toIsoInstant(
                      occurredAt,
                      "Recovery timestamp",
                    );

                  void mutate(
                    "recovery",
                    {
                      action:
                        "record_recovery",

                      occurredAt:
                        timestamp,

                      recoveredAmountCents:
                        dollarsToCents(
                          recoveredAmount,
                          "Recovered amount",
                        ),

                      summary:
                        summary.trim() ||
                        undefined,
                    },
                    "Recovery recorded.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Recovery could not be recorded.",
                  );
                }
              }}
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {
                action ===
                "recovery"
                  ? "Recording..."
                  : "Record recovery"
              }
            </button>

            <p className="mt-2 text-2xs text-ink-500">
              Recovery uses the shared authority-event date and time field above.
            </p>
          </section>
        )
      }

      {/* ============================================================ decision */}

      {
        (
          review.status ===
            "approved" ||
          review.status ===
            "denied" ||
          review.status ===
            "payment_issued" ||
          review.status ===
            "recovered" ||
          review.status ===
            "closed"
        ) &&
        (
          <section className="rounded-lg border border-line bg-inset p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Authority outcome
            </p>

            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-ink-500">
                  Decision
                </dt>

                <dd className="mt-1 font-medium text-ink-800">
                  {
                    review.denialReason
                      ? "Denied"
                      : review.decisionAt
                        ? "Approved"
                        : statusLabel(
                            review.status,
                          )
                  }
                </dd>
              </div>

              <div>
                <dt className="text-ink-500">
                  Decision date
                </dt>

                <dd className="mt-1 font-medium text-ink-800">
                  {
                    formatTimestamp(
                      review.decisionAt,
                    )
                  }
                </dd>
              </div>

              <div>
                <dt className="text-ink-500">
                  Decision reference
                </dt>

                <dd className="mt-1 font-medium text-ink-800">
                  {
                    review.decisionReference ??
                    "Not recorded"
                  }
                </dd>
              </div>

              <div>
                <dt className="text-ink-500">
                  Approved amount
                </dt>

                <dd className="mt-1 font-medium text-ink-800">
                  {
                    formatMoney(
                      review.approvedAmountCents,
                    )
                  }
                </dd>
              </div>

              <div>
                <dt className="text-ink-500">
                  Payment amount
                </dt>

                <dd className="mt-1 font-medium text-ink-800">
                  {
                    formatMoney(
                      review.paymentAmountCents,
                    )
                  }
                </dd>
              </div>

              <div>
                <dt className="text-ink-500">
                  Recovered amount
                </dt>

                <dd className="mt-1 font-medium text-ink-800">
                  {
                    formatMoney(
                      review.recoveredAmountCents,
                    )
                  }
                </dd>
              </div>

              {
                review.denialReason &&
                (
                  <div>
                    <dt className="text-ink-500">
                      Denial reason
                    </dt>

                    <dd className="mt-1 font-medium text-critical-800">
                      {
                        review.denialReason
                      }
                    </dd>
                  </div>
                )
              }

              {
                review.paymentReference &&
                (
                  <div>
                    <dt className="text-ink-500">
                      Payment reference
                    </dt>

                    <dd className="mt-1 font-medium text-ink-800">
                      {
                        review.paymentReference
                      }
                    </dd>
                  </div>
                )
              }
            </dl>

            {
              review.decisionSummary &&
              (
                <div className="mt-4 rounded-md border border-line bg-white px-3 py-3">
                  <p className="text-xs font-semibold text-ink-700">
                    Decision summary
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-600">
                    {
                      review.decisionSummary
                    }
                  </p>
                </div>
              )
            }

            {
              review.closeSummary &&
              (
                <div className="mt-3 rounded-md border border-line bg-white px-3 py-3">
                  <p className="text-xs font-semibold text-ink-700">
                    Closure summary
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-600">
                    {
                      review.closeSummary
                    }
                  </p>
                </div>
              )
            }
          </section>
        )
      }

      {/* ============================================================ closure */}

      {
        mayCloseReview &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Close authority review
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Close only when no further authority-review action is expected for
              this lifecycle.
            </p>

            <textarea
              rows={
                2
              }
              value={
                closeSummary
              }
              onChange={(
                event,
              ) => {
                setCloseSummary(
                  event.target.value,
                );
              }}
              placeholder="Closure summary"
              className="mt-3 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
            />

            <button
              type="button"
              disabled={
                action !==
                null
              }
              onClick={() => {
                try {
                  const timestamp =
                    toIsoInstant(
                      occurredAt,
                      "Closure timestamp",
                    );

                  if (
                    !closeSummary.trim()
                  ) {
                    throw new Error(
                      "Closure summary is required.",
                    );
                  }

                  void mutate(
                    "close",
                    {
                      action:
                        "close_review",

                      occurredAt:
                        timestamp,

                      closeSummary:
                        closeSummary.trim(),
                    },
                    "Authority review closed.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Authority review could not be closed.",
                  );
                }
              }}
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-ink-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {
                action ===
                "close"
                  ? "Closing..."
                  : "Close authority review"
              }
            </button>

            <p className="mt-2 text-2xs text-ink-500">
              Closure uses the shared authority-event date and time field above.
            </p>
          </section>
        )
      }

      {/* =============================================================== audit */}

      <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-ink-900">
          Authority history
        </p>

        {
          data.audit.length >
            0
            ? (
                <div className="mt-3 space-y-2">
                  {
                    data.audit.map(
                      (
                        entry,
                      ) => (
                        <div
                          key={
                            entry.id
                          }
                          className="rounded-md border border-line bg-inset px-3 py-3"
                        >
                          <p className="text-xs font-semibold capitalize text-ink-800">
                            {
                              entry.action.replaceAll(
                                "_",
                                " ",
                              )
                            }
                          </p>

                          <p className="mt-1 text-xs text-ink-500">
                            {
                              formatTimestamp(
                                entry.occurredAt,
                              )
                            }
                          </p>

                          {
                            entry.externalReference &&
                            (
                              <p className="mt-1 text-xs text-ink-600">
                                Reference:{" "}
                                <span className="font-semibold text-ink-800">
                                  {
                                    entry.externalReference
                                  }
                                </span>
                              </p>
                            )
                          }

                          {
                            entry.summary &&
                            (
                              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                                {
                                  entry.summary
                                }
                              </p>
                            )
                          }
                        </div>
                      ),
                    )
                  }
                </div>
              )
            : (
                <p className="mt-2 text-xs text-ink-500">
                  No authority-review events have been recorded.
                </p>
              )
        }
      </section>
    </div>
  );
}