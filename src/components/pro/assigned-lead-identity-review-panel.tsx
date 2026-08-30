"use client";

import {
  useState,
} from "react";

import {
  Badge,
} from "@/components/ui/badge";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type DocumentStatus =
  | "uploaded"
  | "scanning"
  | "under_review"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

type SafetyStatus =
  | "pending"
  | "clean"
  | "rejected"
  | "unsafe";

interface IdentityReviewItem {
  documentId:
    string;

  workcaseId:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  legalName:
    string;

  assignedStaffUserId:
    string;

  assignedStaffName:
    string;

  identityVerification:
    string;

  identityVerifiedAt?:
    string;

  requestStatus?:
    string;

  governmentIdType:
    string;

  governmentIdTypeLabel:
    string;

  title:
    string;

  originalFileName:
    string;

  mimeType:
    string;

  byteSize:
    number;

  status:
    DocumentStatus;

  safetyStatus:
    SafetyStatus;

  safetyScannedAt?:
    string;

  safetyDetail?:
    string;

  uploadedAt:
    string;

  reviewedAt?:
    string;

  reviewedByStaffUserId?:
    string;

  reviewedByStaffName?:
    string;

  rejectionReason?:
    string;

  canRunSafetyScan:
    boolean;

  canReview:
    boolean;

  canOpenFile:
    boolean;
}

interface ApiPayload {
  ok?:
    boolean;

  item?:
    IdentityReviewItem;

  error?:
    string;
}

interface ReviewChecks {
  documentType:
    boolean;

  legibility:
    boolean;

  identityMatch:
    boolean;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formatBytes(
  bytes:
    number,
): string {
  if (
    bytes <
    1024
  ) {
    return `${bytes} B`;
  }

  const kilobytes =
    bytes /
    1024;

  if (
    kilobytes <
    1024
  ) {
    return `${kilobytes.toFixed(
      1,
    )} KB`;
  }

  return `${(
    kilobytes /
    1024
  ).toFixed(
    1,
  )} MB`;
}

function formatTimestamp(
  value:
    string | undefined,
): string {
  if (
    !value
  ) {
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

function documentStatusLabel(
  item:
    IdentityReviewItem,
): string {
  if (
    item.status ===
      "accepted"
  ) {
    return "Identity verified";
  }

  if (
    item.status ===
      "rejected"
  ) {
    return item.safetyStatus ===
      "unsafe"
      ? "Unsafe file blocked"
      : "Replacement required";
  }

  if (
    item.status ===
      "under_review" &&
    item.safetyStatus ===
      "clean"
  ) {
    return "Ready for human review";
  }

  if (
    item.status ===
      "scanning"
  ) {
    return "Safety check running";
  }

  return "Safety check required";
}

function documentStatusTone(
  item:
    IdentityReviewItem,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  if (
    item.status ===
      "accepted"
  ) {
    return "positive";
  }

  if (
    item.status ===
      "rejected"
  ) {
    return "critical";
  }

  if (
    item.status ===
      "under_review" ||
    item.status ===
      "uploaded" ||
    item.status ===
      "scanning"
  ) {
    return "caution";
  }

  return "neutral";
}

function safetyLabel(
  safetyStatus:
    SafetyStatus,
): string {
  switch (
    safetyStatus
  ) {
    case "clean":
      return "Safety check passed";

    case "unsafe":
      return "Unsafe";

    case "rejected":
      return "No clean result";

    default:
      return "Pending";
  }
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function AssignedLeadIdentityReviewPanel({
  initialItems,
}: {
  initialItems:
    IdentityReviewItem[];
}) {
  const [
    items,
    setItems,
  ] =
    useState<
      IdentityReviewItem[]
    >(
      initialItems,
    );

  const [
    busy,
    setBusy,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    checks,
    setChecks,
  ] =
    useState<
      Record<
        string,
        ReviewChecks
      >
    >(
      {},
    );

  const [
    rejectionReasons,
    setRejectionReasons,
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {},
    );

  const [
    errors,
    setErrors,
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {},
    );

  const [
    notices,
    setNotices,
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {},
    );

  function replaceItem(
    next:
      IdentityReviewItem,
  ) {
    setItems(
      (
        current,
      ) =>
        current.map(
          (
            item,
          ) =>
            item.documentId ===
            next.documentId
              ? next
              : item,
        ),
    );
  }

  async function performAction(
    item:
      IdentityReviewItem,
    action:
      Record<
        string,
        unknown
      >,
    successMessage:
      string,
  ) {
    setBusy(
      item.documentId,
    );

    setErrors(
      (
        current,
      ) => ({
        ...current,

        [
          item.documentId
        ]:
          "",
      }),
    );

    try {
      const response =
        await fetch(
          `/api/pro/claimants/identity-documents/${encodeURIComponent(
            item.documentId,
          )}`,
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
                action,
              ),
          },
        );

      const payload =
        await response.json() as
          ApiPayload;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.item
      ) {
        throw new Error(
          payload.error ||
          "The identity-review action could not be completed.",
        );
      }

      replaceItem(
        payload.item,
      );

      setNotices(
        (
          current,
        ) => ({
          ...current,

          [
            item.documentId
          ]:
            successMessage,
        }),
      );
    } catch (
      error
    ) {
      setErrors(
        (
          current,
        ) => ({
          ...current,

          [
            item.documentId
          ]:
            error instanceof Error
              ? error.message
              : "The identity-review action could not be completed.",
        }),
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  if (
    items.length ===
    0
  ) {
    return (
      <section className="rounded-xl border border-line bg-white shadow-sm">
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <p className="eyebrow text-ink-500">
            Assigned claimant identity
          </p>

          <h2 className="mt-1 text-lg font-semibold text-ink-950">
            Government ID review
          </h2>
        </div>

        <div className="px-5 py-8 text-center">
          <p className="text-sm font-semibold text-ink-800">
            Identity review queue clear
          </p>

          <p className="mt-1 text-xs text-ink-500">
            No assigned pre-Claim government ID is currently waiting for your review.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-inset px-4 py-4 sm:px-5">
        <div>
          <p className="eyebrow text-ink-500">
            Assigned claimant identity
          </p>

          <h2 className="mt-1 text-lg font-semibold text-ink-950">
            Government ID review
          </h2>

          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
            Restricted identity evidence for claimants assigned to you. A file must
            pass the configured safety scan before it can be opened or approved.
          </p>
        </div>

        <Badge
          tone={
            items.some(
              (
                item,
              ) =>
                item.status !==
                  "accepted" &&
                item.status !==
                  "rejected",
            )
              ? "caution"
              : "positive"
          }
          size="md"
        >
          {
            items.length
          }{" "}
          {
            items.length ===
            1
              ? "claimant"
              : "claimants"
          }
        </Badge>
      </div>

      <div className="divide-y divide-line-subtle">
        {
          items.map(
            (
              item,
            ) => {
              const currentChecks =
                checks[
                  item.documentId
                ] ?? {
                  documentType:
                    false,

                  legibility:
                    false,

                  identityMatch:
                    false,
                };

              const allConfirmed =
                currentChecks
                  .documentType &&
                currentChecks
                  .legibility &&
                currentChecks
                  .identityMatch;

              const rejectionReason =
                rejectionReasons[
                  item.documentId
                ] ??
                "";

              const actionBusy =
                busy ===
                item.documentId;

              return (
                <article
                  key={
                    item.documentId
                  }
                  className="px-4 py-5 sm:px-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-xs font-semibold text-white">
                          {
                            item.claimantReference
                          }
                        </span>

                        <h3 className="text-base font-semibold text-ink-950">
                          {
                            item.legalName
                          }
                        </h3>
                      </div>

                      <p className="mt-2 text-xs text-ink-500">
                        Managed by{" "}
                        <span className="font-semibold text-ink-700">
                          {
                            item.assignedStaffName
                          }
                        </span>
                      </p>
                    </div>

                    <Badge
                      tone={
                        documentStatusTone(
                          item,
                        )
                      }
                      size="md"
                    >
                      {
                        documentStatusLabel(
                          item,
                        )
                      }
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-lg border border-line bg-inset p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                        ID type
                      </p>

                      <p className="mt-1 text-sm font-semibold text-ink-800">
                        {
                          item.governmentIdTypeLabel
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                        File
                      </p>

                      <p className="mt-1 break-words text-sm font-medium text-ink-800">
                        {
                          item.originalFileName
                        }
                      </p>

                      <p className="mt-0.5 text-xs text-ink-500">
                        {
                          formatBytes(
                            item.byteSize,
                          )
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                        Uploaded
                      </p>

                      <p className="mt-1 text-sm font-medium text-ink-800">
                        {
                          formatTimestamp(
                            item.uploadedAt,
                          )
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                        Safety
                      </p>

                      <p
                        className={
                          item.safetyStatus ===
                          "clean"
                            ? "mt-1 text-sm font-semibold text-positive-800"
                            : item.safetyStatus ===
                                "unsafe"
                              ? "mt-1 text-sm font-semibold text-critical-800"
                              : "mt-1 text-sm font-semibold text-caution-800"
                        }
                      >
                        {
                          safetyLabel(
                            item.safetyStatus,
                          )
                        }
                      </p>
                    </div>
                  </div>

                  {
                    errors[
                      item.documentId
                    ] &&
                    (
                      <div
                        role="alert"
                        className="mt-4 rounded-lg border border-critical-200 bg-critical-50 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-critical-800">
                          Action could not be completed
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-critical-700">
                          {
                            errors[
                              item.documentId
                            ]
                          }
                        </p>
                      </div>
                    )
                  }

                  {
                    notices[
                      item.documentId
                    ] &&
                    item.status !==
                      "accepted" &&
                    item.status !==
                      "rejected" &&
                    (
                      <div className="mt-4 rounded-lg border border-positive-200 bg-positive-50 px-4 py-3">
                        <p className="text-sm font-semibold text-positive-900">
                          {
                            notices[
                              item.documentId
                            ]
                          }
                        </p>
                      </div>
                    )
                  }

                  {/* ====================================================== safety */}

                  {
                    item.status ===
                      "uploaded" &&
                    (
                      <div className="mt-4 rounded-lg border border-caution-200 bg-caution-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-caution-900">
                              Safety check required
                            </p>

                            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-caution-800">
                              The restricted file cannot be opened or approved until
                              the configured Microsoft Defender check establishes a
                              clean result.
                            </p>

                            {
                              item.safetyDetail &&
                              (
                                <p className="mt-2 text-xs text-caution-800">
                                  {
                                    item.safetyDetail
                                  }
                                </p>
                              )
                            }
                          </div>

                          <button
                            type="button"
                            disabled={
                              actionBusy ||
                              !item.canRunSafetyScan
                            }
                            onClick={() => {
                              void performAction(
                                item,
                                {
                                  action:
                                    "run_safety_scan",
                                },
                                "✓ Safety check passed and saved.",
                              );
                            }}
                            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-ink-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500"
                          >
                            {
                              actionBusy
                                ? "Running safety check..."
                                : "Run Safety Check"
                            }
                          </button>
                        </div>
                      </div>
                    )
                  }

                  {/* ======================================================== unsafe */}

                  {
                    item.status ===
                      "rejected" &&
                    item.safetyStatus ===
                      "unsafe" &&
                    (
                      <div className="mt-4 rounded-lg border border-critical-200 bg-critical-50 p-4">
                        <p className="text-sm font-semibold text-critical-900">
                          Unsafe file blocked
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-critical-800">
                          The uploaded file failed the automated security control.
                          It cannot be opened or used. The claimant must provide a
                          replacement through My DueQuity.
                        </p>

                        {
                          item.rejectionReason &&
                          (
                            <p className="mt-2 text-xs font-medium text-critical-800">
                              {
                                item.rejectionReason
                              }
                            </p>
                          )
                        }
                      </div>
                    )
                  }

                  {/* ======================================================== human review */}

                  {
                    item.canReview &&
                    (
                      <div className="mt-4 rounded-lg border border-positive-200 bg-positive-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-positive-900">
                              ✓ Safety check passed
                            </p>

                            <p className="mt-1 text-xs leading-relaxed text-positive-800">
                              The file may now be opened for the controlled human
                              identity review.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <a
                              href={`/api/pro/claimants/identity-documents/${encodeURIComponent(
                                item.documentId,
                              )}/file`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-800 hover:bg-inset"
                            >
                              Open secure ID
                            </a>

                            <a
                              href={`/api/pro/claimants/identity-documents/${encodeURIComponent(
                                item.documentId,
                              )}/file?download=1`}
                              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-800 hover:bg-inset"
                            >
                              Download
                            </a>
                          </div>
                        </div>

                        <div className="mt-4 rounded-lg border border-line bg-white p-4">
                          <p className="text-sm font-semibold text-ink-900">
                            Review confirmations
                          </p>

                          <p className="mt-1 text-xs leading-relaxed text-ink-500">
                            Approval remains disabled until all required checks are
                            confirmed.
                          </p>

                          <div className="mt-3 space-y-3">
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={
                                  currentChecks.documentType
                                }
                                disabled={
                                  actionBusy
                                }
                                onChange={(
                                  event,
                                ) => {
                                  setChecks(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      [
                                        item.documentId
                                      ]: {
                                        ...currentChecks,

                                        documentType:
                                          event.target.checked,
                                      },
                                    }),
                                  );
                                }}
                                className="mt-1"
                              />

                              <span className="text-sm text-ink-700">
                                The selected ID type matches the actual document
                                submitted.
                              </span>
                            </label>

                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={
                                  currentChecks.legibility
                                }
                                disabled={
                                  actionBusy
                                }
                                onChange={(
                                  event,
                                ) => {
                                  setChecks(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      [
                                        item.documentId
                                      ]: {
                                        ...currentChecks,

                                        legibility:
                                          event.target.checked,
                                      },
                                    }),
                                  );
                                }}
                                className="mt-1"
                              />

                              <span className="text-sm text-ink-700">
                                The government photo ID is readable enough to
                                review.
                              </span>
                            </label>

                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={
                                  currentChecks.identityMatch
                                }
                                disabled={
                                  actionBusy
                                }
                                onChange={(
                                  event,
                                ) => {
                                  setChecks(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      [
                                        item.documentId
                                      ]: {
                                        ...currentChecks,

                                        identityMatch:
                                          event.target.checked,
                                      },
                                    }),
                                  );
                                }}
                                className="mt-1"
                              />

                              <span className="text-sm text-ink-700">
                                The name on the ID reasonably matches the confirmed
                                claimant identity:{" "}
                                <strong>
                                  {
                                    item.legalName
                                  }
                                </strong>
                                .
                              </span>
                            </label>
                          </div>

                          <button
                            type="button"
                            disabled={
                              actionBusy ||
                              !allConfirmed
                            }
                            onClick={() => {
                              void performAction(
                                item,
                                {
                                  action:
                                    "accept",

                                  documentTypeConfirmed:
                                    currentChecks.documentType,

                                  legibilityConfirmed:
                                    currentChecks.legibility,

                                  identityMatchConfirmed:
                                    currentChecks.identityMatch,
                                },
                                "✓ Identity verified and saved.",
                              );
                            }}
                            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-accent-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500"
                          >
                            {
                              actionBusy
                                ? "Saving approval..."
                                : "Approve Identity"
                            }
                          </button>
                        </div>

                        <div className="mt-4 rounded-lg border border-line bg-white p-4">
                          <p className="text-sm font-semibold text-ink-900">
                            Reject / request replacement
                          </p>

                          <p className="mt-1 text-xs leading-relaxed text-ink-500">
                            Enter a clear claimant-safe reason. Rejection reopens
                            the secure ID upload requirement.
                          </p>

                          <textarea
                            rows={
                              3
                            }
                            value={
                              rejectionReason
                            }
                            disabled={
                              actionBusy
                            }
                            onChange={(
                              event,
                            ) => {
                              setRejectionReasons(
                                (
                                  current,
                                ) => ({
                                  ...current,

                                  [
                                    item.documentId
                                  ]:
                                    event.target.value,
                                }),
                              );
                            }}
                            placeholder="Example: The image is cropped and the claimant name cannot be verified."
                            className="mt-3 w-full resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                          />

                          <button
                            type="button"
                            disabled={
                              actionBusy ||
                              !rejectionReason.trim()
                            }
                            onClick={() => {
                              void performAction(
                                item,
                                {
                                  action:
                                    "reject",

                                  rejectionReason:
                                    rejectionReason.trim(),
                                },
                                "✓ Rejection saved. Replacement required.",
                              );
                            }}
                            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-critical-300 bg-white px-4 py-2 text-sm font-semibold text-critical-800 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400"
                          >
                            {
                              actionBusy
                                ? "Saving rejection..."
                                : "Reject / Request Replacement"
                            }
                          </button>
                        </div>
                      </div>
                    )
                  }

                  {/* ======================================================= accepted */}

                  {
                    item.status ===
                      "accepted" &&
                    (
                      <div className="mt-4 rounded-lg border border-positive-200 bg-positive-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-positive-900">
                              ✓ Identity verified and saved
                            </p>

                            <p className="mt-1 text-xs leading-relaxed text-positive-800">
                              This government ID was accepted through the controlled
                              human-review workflow.
                            </p>
                          </div>

                          <Badge
                            tone="positive"
                            size="md"
                          >
                            Verified
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          {
                            [
                              "✓ Document type confirmed",
                              "✓ Legibility confirmed",
                              "✓ Claimant identity match confirmed",
                            ].map(
                              (
                                confirmation,
                              ) => (
                                <div
                                  key={
                                    confirmation
                                  }
                                  className="rounded-md border border-positive-200 bg-white px-3 py-2.5 text-xs font-semibold text-positive-900"
                                >
                                  {
                                    confirmation
                                  }
                                </div>
                              ),
                            )
                          }
                        </div>

                        <p className="mt-3 text-xs text-positive-800">
                          Reviewed by{" "}
                          <strong>
                            {
                              item.reviewedByStaffName ??
                              "Authorized DueQuity staff"
                            }
                          </strong>
                          {" on "}
                          {
                            formatTimestamp(
                              item.reviewedAt,
                            )
                          }
                          .
                        </p>

                        {
                          item.canOpenFile &&
                          (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <a
                                href={`/api/pro/claimants/identity-documents/${encodeURIComponent(
                                  item.documentId,
                                )}/file`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-positive-300 bg-white px-4 py-2 text-xs font-semibold text-positive-900 hover:bg-positive-50"
                              >
                                View accepted ID
                              </a>
                            </div>
                          )
                        }
                      </div>
                    )
                  }

                  {/* ======================================================= human rejection */}

                  {
                    item.status ===
                      "rejected" &&
                    item.safetyStatus !==
                      "unsafe" &&
                    (
                      <div className="mt-4 rounded-lg border border-critical-200 bg-critical-50 p-4">
                        <p className="text-sm font-semibold text-critical-900">
                          ✓ Rejection saved. Replacement required.
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-critical-800">
                          The claimant&apos;s secure government-ID requirement has
                          been reopened. The claimant may upload a replacement in
                          My DueQuity.
                        </p>

                        {
                          item.rejectionReason &&
                          (
                            <div className="mt-3 rounded-md border border-critical-200 bg-white px-3 py-2.5">
                              <p className="text-2xs font-semibold uppercase tracking-wide text-critical-600">
                                Saved reason
                              </p>

                              <p className="mt-1 text-sm text-critical-800">
                                {
                                  item.rejectionReason
                                }
                              </p>
                            </div>
                          )
                        }
                      </div>
                    )
                  }
                </article>
              );
            },
          )
        }
      </div>
    </section>
  );
}