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
 * FINAL CLAIM CLOSURE + RETENTION PANEL
 *
 * Final claim closure is separate from:
 *
 * - authority-review closure;
 * - recovery reconciliation;
 * - document disposition;
 * - retention scheduling.
 *
 * A claim may be finally closed only after:
 *
 * 1. the authority-review lifecycle exists;
 * 2. the authority-review lifecycle is closed;
 * 3. if actual recovery exists, the recovery settlement is reconciled.
 *
 * Final closure automatically creates a retention record in `policy_pending`.
 *
 * DueQuity does not invent a retention period. Retention scheduling requires an
 * explicit policy reference, policy basis, and retention-until date.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type ClaimFinalOutcome =
  | "recovered_reconciled"
  | "denied_final"
  | "closed_without_recovery";

type ClaimRetentionStatus =
  | "policy_pending"
  | "scheduled"
  | "legal_hold"
  | "eligible_for_disposition"
  | "disposed";

interface ClaimClosure {
  id:
    string;

  claimId:
    string;

  claimReference:
    string;

  authorityReviewId:
    string;

  recoverySettlementId?:
    string;

  finalOutcome:
    ClaimFinalOutcome;

  authorityClosedAt:
    string;

  recoveryReconciledAt?:
    string;

  closedAt:
    string;

  closedByUserId:
    string;

  closureSummary:
    string;

  rowVersion:
    number;

  createdAt:
    string;

  updatedAt:
    string;
}

interface ClaimRetentionRecord {
  id:
    string;

  closureId:
    string;

  claimId:
    string;

  status:
    ClaimRetentionStatus;

  policyReference?:
    string;

  policyBasis?:
    string;

  scheduledAt?:
    string;

  retentionUntil?:
    string;

  preHoldStatus?:
    Exclude<
      ClaimRetentionStatus,
      "legal_hold" |
      "disposed"
    >;

  activeHoldStartedAt?:
    string;

  activeHoldReason?:
    string;

  activeHoldByUserId?:
    string;

  eligibleAt?:
    string;

  disposedAt?:
    string;

  disposedByUserId?:
    string;

  dispositionMethod?:
    string;

  dispositionSummary?:
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

interface ClaimClosureAuditEntry {
  id:
    string;

  claimId:
    string;

  closureId:
    string;

  retentionId?:
    string;

  action:
    string;

  actorUserId:
    string;

  occurredAt:
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

interface ClaimClosureApiPayload {
  ok:
    true;

  claim: {
    id:
      string;

    reference:
      string;
  };

  prerequisites: {
    authorityReviewExists:
      boolean;

    authorityReviewStatus:
      string |
      null;

    authorityClosed:
      boolean;

    recoverySettlementExists:
      boolean;

    recoverySettlementStatus:
      string |
      null;

    recoveryReconciled:
      boolean;

    readyForFinalClosure:
      boolean;
  };

  closure:
    ClaimClosure |
    null;

  retention:
    ClaimRetentionRecord |
    null;

  audit:
    ClaimClosureAuditEntry[];

  permissions: {
    actorUserId:
      string;

    mayRead:
      boolean;

    mayCloseFinal:
      boolean;

    mayGovernRetention:
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

function humanize(
  value:
    string,
): string {
  return value
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (
        character,
      ) =>
        character.toUpperCase(),
    );
}

function finalOutcomeLabel(
  outcome:
    ClaimFinalOutcome,
): string {
  switch (
    outcome
  ) {
    case "recovered_reconciled":
      return "Recovered and reconciled";

    case "denied_final":
      return "Denied, final";

    case "closed_without_recovery":
      return "Closed without recovery";
  }
}

function finalOutcomeTone(
  outcome:
    ClaimFinalOutcome,
):
  | "positive"
  | "neutral"
  | "caution" {
  switch (
    outcome
  ) {
    case "recovered_reconciled":
      return "positive";

    case "denied_final":
      return "caution";

    case "closed_without_recovery":
      return "neutral";
  }
}

function retentionStatusLabel(
  status:
    ClaimRetentionStatus,
): string {
  switch (
    status
  ) {
    case "policy_pending":
      return "Policy pending";

    case "scheduled":
      return "Retention scheduled";

    case "legal_hold":
      return "Retention hold";

    case "eligible_for_disposition":
      return "Eligible for disposition";

    case "disposed":
      return "Disposition recorded";
  }
}

function retentionStatusTone(
  status:
    ClaimRetentionStatus,
):
  | "positive"
  | "neutral"
  | "caution"
  | "critical" {
  switch (
    status
  ) {
    case "policy_pending":
      return "caution";

    case "scheduled":
      return "neutral";

    case "legal_hold":
      return "critical";

    case "eligible_for_disposition":
      return "caution";

    case "disposed":
      return "positive";
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

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimClosurePanel({
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
      ClaimClosureApiPayload |
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
    finalClosedAt,
    setFinalClosedAt,
  ] =
    useState(
      "",
    );

  const [
    finalClosureSummary,
    setFinalClosureSummary,
  ] =
    useState(
      "",
    );

  const [
    retentionScheduledAt,
    setRetentionScheduledAt,
  ] =
    useState(
      "",
    );

  const [
    retentionUntil,
    setRetentionUntil,
  ] =
    useState(
      "",
    );

  const [
    policyReference,
    setPolicyReference,
  ] =
    useState(
      "",
    );

  const [
    policyBasis,
    setPolicyBasis,
  ] =
    useState(
      "",
    );

  const [
    holdOccurredAt,
    setHoldOccurredAt,
  ] =
    useState(
      "",
    );

  const [
    holdReason,
    setHoldReason,
  ] =
    useState(
      "",
    );

  const [
    holdReleaseAt,
    setHoldReleaseAt,
  ] =
    useState(
      "",
    );

  const [
    holdReleaseSummary,
    setHoldReleaseSummary,
  ] =
    useState(
      "",
    );

  const [
    eligibilityOccurredAt,
    setEligibilityOccurredAt,
  ] =
    useState(
      "",
    );

  const [
    eligibilitySummary,
    setEligibilitySummary,
  ] =
    useState(
      "",
    );

  const [
    dispositionOccurredAt,
    setDispositionOccurredAt,
  ] =
    useState(
      "",
    );

  const [
    dispositionMethod,
    setDispositionMethod,
  ] =
    useState(
      "",
    );

  const [
    dispositionSummary,
    setDispositionSummary,
  ] =
    useState(
      "",
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
            )}/closure`,
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
            | ClaimClosureApiPayload
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
              : "Final claim closure state could not be loaded.",
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
                : "Final claim closure state could not be loaded.",
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
          )}/closure`,
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
          | ClaimClosureApiPayload
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
            : "Final claim closure action could not be recorded.",
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
          : "Final claim closure action could not be recorded.",
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
          Loading final claim closure
        </p>

        <p className="mt-1 text-xs text-ink-500">
          Reading durable authority, recovery, final-closure and retention
          state.
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
          Final claim closure unavailable
        </p>

        <p className="mt-1 text-xs leading-relaxed text-critical-700">
          {
            error ||
            "Final claim closure state could not be loaded."
          }
        </p>
      </div>
    );
  }

  const {
    prerequisites,
    closure,
    retention,
    permissions,
  } =
    data;

  /* ======================================================================== */
  /* Active view                                                               */
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

      {/* ======================================================= closure header */}

      <section className="rounded-lg border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-inset px-4 py-4 sm:px-5">
          <div>
            <p className="text-base font-semibold text-ink-900">
              Final Claim Closure
            </p>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
              Final DueQuity operational closure occurs only after the external
              authority lifecycle is complete and, where recovery occurred,
              recovery accounting is reconciled.
            </p>
          </div>

          {
            closure
              ? (
                  <Badge
                    tone={
                      finalOutcomeTone(
                        closure.finalOutcome,
                      )
                    }
                    size="md"
                  >
                    Final closed
                  </Badge>
                )
              : prerequisites.readyForFinalClosure
                ? (
                    <Badge
                      tone="positive"
                      size="md"
                    >
                      Ready for final closure
                    </Badge>
                  )
                : (
                    <Badge
                      tone="neutral"
                      size="md"
                    >
                      Not ready
                    </Badge>
                  )
          }
        </div>

        {/* ================================================= prerequisites */}

        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          <div
            className={
              prerequisites.authorityReviewExists
                ? "rounded-md border border-accent-200 bg-accent-50 px-3.5 py-3"
                : "rounded-md border border-line bg-inset px-3.5 py-3"
            }
          >
            <p className="text-xs font-semibold text-ink-800">
              Authority lifecycle
            </p>

            <p className="mt-1 text-xs text-ink-600">
              {
                prerequisites.authorityReviewExists
                  ? humanize(
                      prerequisites.authorityReviewStatus ??
                      "unknown",
                    )
                  : "No authority review exists"
              }
            </p>
          </div>

          <div
            className={
              prerequisites.authorityClosed
                ? "rounded-md border border-accent-200 bg-accent-50 px-3.5 py-3"
                : "rounded-md border border-line bg-inset px-3.5 py-3"
            }
          >
            <p className="text-xs font-semibold text-ink-800">
              Authority review closed
            </p>

            <p className="mt-1 text-xs text-ink-600">
              {
                prerequisites.authorityClosed
                  ? "Complete"
                  : "Required before final claim closure"
              }
            </p>
          </div>

          <div
            className={
              prerequisites.recoveryReconciled
                ? "rounded-md border border-accent-200 bg-accent-50 px-3.5 py-3"
                : "rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3"
            }
          >
            <p className="text-xs font-semibold text-ink-800">
              Recovery accounting
            </p>

            <p className="mt-1 text-xs text-ink-600">
              {
                !prerequisites.recoverySettlementExists
                  ? "No recovery settlement exists"
                  : prerequisites.recoveryReconciled
                    ? "Recovery reconciled"
                    : `Recovery settlement is ${humanize(
                        prerequisites.recoverySettlementStatus ??
                        "unknown",
                      )}`
              }
            </p>
          </div>
        </div>

        {
          !closure &&
          !prerequisites.readyForFinalClosure &&
          (
            <div className="border-t border-line px-4 py-4 sm:px-5">
              <div className="rounded-md border border-line bg-inset px-4 py-3">
                <p className="text-xs font-semibold text-ink-700">
                  Final closure remains blocked
                </p>

                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  DueQuity will not finally close this claim merely because
                  onboarding, filing preparation, submission, authority
                  approval, or payment issuance has occurred. The authority
                  lifecycle must itself be closed. If actual recovery exists,
                  recovery accounting must also be reconciled.
                </p>
              </div>
            </div>
          )
        }
      </section>

      {/* ======================================================== close action */}

      {
        !closure &&
        prerequisites.readyForFinalClosure &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  Record final claim closure
                </p>

                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
                  This closes the DueQuity operational claim record. It does not
                  delete documents or perform record disposition. A separate
                  retention record will be created automatically.
                </p>
              </div>

              {
                permissions.mayCloseFinal
                  ? (
                      <Badge tone="positive">
                        Authorized
                      </Badge>
                    )
                  : (
                      <Badge tone="neutral">
                        Approval required
                      </Badge>
                    )
              }
            </div>

            {
              permissions.mayCloseFinal &&
              (
                <>
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-ink-700">
                      Final closure date and time
                    </span>

                    <input
                      type="datetime-local"
                      value={
                        finalClosedAt
                      }
                      onChange={(
                        event,
                      ) => {
                        setFinalClosedAt(
                          event.target.value,
                        );
                      }}
                      className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-md"
                    />
                  </label>

                  <label className="mt-3 block">
                    <span className="text-xs font-semibold text-ink-700">
                      Final closure summary
                    </span>

                    <textarea
                      rows={
                        3
                      }
                      value={
                        finalClosureSummary
                      }
                      onChange={(
                        event,
                      ) => {
                        setFinalClosureSummary(
                          event.target.value,
                        );
                      }}
                      className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
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
                        if (
                          !finalClosureSummary.trim()
                        ) {
                          throw new Error(
                            "Final claim closure summary is required.",
                          );
                        }

                        void mutate(
                          "close_final",
                          {
                            action:
                              "close_final",

                            closedAt:
                              toIsoInstant(
                                finalClosedAt,
                                "Final claim closure timestamp",
                              ),

                            summary:
                              finalClosureSummary.trim(),
                          },
                          "Final claim closure recorded.",
                        );
                      } catch (
                        validationError
                      ) {
                        setError(
                          validationError instanceof
                            Error
                            ? validationError.message
                            : "Final claim closure could not be recorded.",
                        );
                      }
                    }}
                    className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-ink-950 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {
                      action ===
                        "close_final"
                        ? "Closing..."
                        : "Close claim finally"
                    }
                  </button>
                </>
              )
            }
          </section>
        )
      }

      {/* ======================================================== closure data */}

      {
        closure &&
        (
          <section className="rounded-lg border border-accent-200 bg-accent-50">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-accent-200 px-4 py-4 sm:px-5">
              <div>
                <p className="text-sm font-semibold text-accent-950">
                  Final claim closure recorded
                </p>

                <p className="mt-1 text-xs text-accent-800">
                  {
                    formatTimestamp(
                      closure.closedAt,
                    )
                  }
                </p>
              </div>

              <Badge
                tone={
                  finalOutcomeTone(
                    closure.finalOutcome,
                  )
                }
              >
                {
                  finalOutcomeLabel(
                    closure.finalOutcome,
                  )
                }
              </Badge>
            </div>

            <div className="grid gap-4 p-4 text-xs sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
              <div>
                <p className="text-accent-700">
                  Closure record
                </p>

                <div className="mt-1">
                  <Identifier>
                    {
                      closure.id
                    }
                  </Identifier>
                </div>
              </div>

              <div>
                <p className="text-accent-700">
                  Authority closed
                </p>

                <p className="mt-1 font-medium text-accent-950">
                  {
                    formatTimestamp(
                      closure.authorityClosedAt,
                    )
                  }
                </p>
              </div>

              <div>
                <p className="text-accent-700">
                  Recovery reconciled
                </p>

                <p className="mt-1 font-medium text-accent-950">
                  {
                    formatTimestamp(
                      closure.recoveryReconciledAt,
                    )
                  }
                </p>
              </div>

              <div>
                <p className="text-accent-700">
                  Closed by
                </p>

                <div className="mt-1">
                  <Identifier>
                    {
                      closure.closedByUserId
                    }
                  </Identifier>
                </div>
              </div>

              <div className="sm:col-span-2">
                <p className="text-accent-700">
                  Final closure summary
                </p>

                <p className="mt-1 leading-relaxed text-accent-950">
                  {
                    closure.closureSummary
                  }
                </p>
              </div>
            </div>
          </section>
        )
      }

      {/* ========================================================== retention */}

      {
        closure &&
        retention &&
        (
          <section className="rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-inset px-4 py-4 sm:px-5">
              <div>
                <p className="text-base font-semibold text-ink-900">
                  Records Retention
                </p>

                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
                  Retention governs how long the closed claim record must be
                  preserved before any later disposition may be considered.
                </p>
              </div>

              <Badge
                tone={
                  retentionStatusTone(
                    retention.status,
                  )
                }
                size="md"
              >
                {
                  retentionStatusLabel(
                    retention.status,
                  )
                }
              </Badge>
            </div>

            <div className="grid gap-4 p-4 text-xs sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
              <div>
                <p className="text-ink-500">
                  Retention record
                </p>

                <div className="mt-1">
                  <Identifier>
                    {
                      retention.id
                    }
                  </Identifier>
                </div>
              </div>

              <div>
                <p className="text-ink-500">
                  Policy reference
                </p>

                <p className="mt-1 font-medium text-ink-800">
                  {
                    retention.policyReference ??
                    "Not yet scheduled"
                  }
                </p>
              </div>

              <div>
                <p className="text-ink-500">
                  Retain until
                </p>

                <p className="mt-1 font-medium text-ink-800">
                  {
                    formatTimestamp(
                      retention.retentionUntil,
                    )
                  }
                </p>
              </div>

              {
                retention.policyBasis &&
                (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <p className="text-ink-500">
                      Policy basis
                    </p>

                    <p className="mt-1 leading-relaxed text-ink-800">
                      {
                        retention.policyBasis
                      }
                    </p>
                  </div>
                )
              }
            </div>

            {
              retention.status ===
                "policy_pending" &&
              (
                <div className="border-t border-line px-4 py-4 sm:px-5">
                  <div className="rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
                    <p className="text-xs font-semibold text-caution-900">
                      Retention policy required
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-caution-800">
                      DueQuity has intentionally not invented a retention
                      duration. An authorized compliance decision must cite the
                      governing retention policy before a retention-until date
                      is recorded.
                    </p>
                  </div>
                </div>
              )
            }

            {
              retention.status ===
                "legal_hold" &&
              (
                <div className="border-t border-critical-200 bg-critical-50 px-4 py-4 sm:px-5">
                  <p className="text-sm font-semibold text-critical-900">
                    Active preservation hold
                  </p>

                  <p className="mt-1 text-xs text-critical-700">
                    Started{" "}
                    {
                      formatTimestamp(
                        retention.activeHoldStartedAt,
                      )
                    }
                  </p>

                  {
                    retention.activeHoldReason &&
                    (
                      <p className="mt-2 text-xs leading-relaxed text-critical-800">
                        {
                          retention.activeHoldReason
                        }
                      </p>
                    )
                  }

                  <p className="mt-2 text-xs leading-relaxed text-critical-700">
                    Record disposition remains blocked while this hold is
                    active.
                  </p>
                </div>
              )
            }

            {
              retention.status ===
                "disposed" &&
              (
                <div className="border-t border-accent-200 bg-accent-50 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-accent-900">
                        Retention disposition recorded
                      </p>

                      <p className="mt-1 text-xs text-accent-800">
                        {
                          formatTimestamp(
                            retention.disposedAt,
                          )
                        }
                      </p>
                    </div>

                    <Badge tone="positive">
                      Final
                    </Badge>
                  </div>

                  {
                    retention.dispositionMethod &&
                    (
                      <p className="mt-3 text-xs text-accent-800">
                        Method:{" "}
                        <span className="font-semibold">
                          {
                            retention.dispositionMethod
                          }
                        </span>
                      </p>
                    )
                  }

                  {
                    retention.dispositionSummary &&
                    (
                      <p className="mt-1 text-xs leading-relaxed text-accent-800">
                        {
                          retention.dispositionSummary
                        }
                      </p>
                    )
                  }
                </div>
              )
            }
          </section>
        )
      }

      {/* ===================================================== schedule policy */}

      {
        closure &&
        retention &&
        permissions.mayGovernRetention &&
        retention.status ===
          "policy_pending" &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Schedule records retention
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Record only an actual approved retention rule. The policy
              reference and policy basis must identify where the retention
              period comes from.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Scheduled at
                </span>

                <input
                  type="datetime-local"
                  value={
                    retentionScheduledAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setRetentionScheduledAt(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Retain until
                </span>

                <input
                  type="datetime-local"
                  value={
                    retentionUntil
                  }
                  onChange={(
                    event,
                  ) => {
                    setRetentionUntil(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Policy reference
                </span>

                <input
                  type="text"
                  value={
                    policyReference
                  }
                  onChange={(
                    event,
                  ) => {
                    setPolicyReference(
                      event.target.value,
                    );
                  }}
                  placeholder="Approved policy, schedule, rule or authority"
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Policy basis
              </span>

              <textarea
                rows={
                  3
                }
                value={
                  policyBasis
                }
                onChange={(
                  event,
                ) => {
                  setPolicyBasis(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
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
                  if (
                    !policyReference.trim()
                  ) {
                    throw new Error(
                      "Retention policy reference is required.",
                    );
                  }

                  if (
                    !policyBasis.trim()
                  ) {
                    throw new Error(
                      "Retention policy basis is required.",
                    );
                  }

                  const scheduled =
                    toIsoInstant(
                      retentionScheduledAt,
                      "Retention scheduling timestamp",
                    );

                  const retainUntil =
                    toIsoInstant(
                      retentionUntil,
                      "Retention-until timestamp",
                    );

                  if (
                    Date.parse(
                      retainUntil,
                    ) <=
                    Date.parse(
                      scheduled,
                    )
                  ) {
                    throw new Error(
                      "Retention-until timestamp must be later than the scheduling timestamp.",
                    );
                  }

                  void mutate(
                    "schedule_retention",
                    {
                      action:
                        "schedule_retention",

                      scheduledAt:
                        scheduled,

                      retentionUntil:
                        retainUntil,

                      policyReference:
                        policyReference.trim(),

                      policyBasis:
                        policyBasis.trim(),
                    },
                    "Claim retention schedule recorded.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Retention schedule could not be recorded.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-ink-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {
                action ===
                  "schedule_retention"
                  ? "Scheduling..."
                  : "Schedule retention"
              }
            </button>
          </section>
        )
      }

      {/* ========================================================= place hold */}

      {
        closure &&
        retention &&
        permissions.mayGovernRetention &&
        retention.status !==
          "legal_hold" &&
        retention.status !==
          "disposed" &&
        (
          <section className="rounded-lg border border-line bg-inset p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Preservation hold
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Place a hold when litigation, investigation, dispute, regulatory
              request, audit, preservation duty, or another legitimate reason
              requires the closed claim record to remain preserved.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Hold date and time
                </span>

                <input
                  type="datetime-local"
                  value={
                    holdOccurredAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setHoldOccurredAt(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Hold reason
              </span>

              <textarea
                rows={
                  2
                }
                value={
                  holdReason
                }
                onChange={(
                  event,
                ) => {
                  setHoldReason(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
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
                  if (
                    !holdReason.trim()
                  ) {
                    throw new Error(
                      "Retention-hold reason is required.",
                    );
                  }

                  void mutate(
                    "place_retention_hold",
                    {
                      action:
                        "place_retention_hold",

                      occurredAt:
                        toIsoInstant(
                          holdOccurredAt,
                          "Retention-hold timestamp",
                        ),

                      reason:
                        holdReason.trim(),
                    },
                    "Claim retention hold placed.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Retention hold could not be placed.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2 text-xs font-semibold text-critical-800 disabled:opacity-50"
            >
              {
                action ===
                  "place_retention_hold"
                  ? "Placing hold..."
                  : "Place retention hold"
              }
            </button>
          </section>
        )
      }

      {/* ======================================================= release hold */}

      {
        closure &&
        retention &&
        permissions.mayGovernRetention &&
        retention.status ===
          "legal_hold" &&
        (
          <section className="rounded-lg border border-critical-200 bg-critical-50 p-4 sm:p-5">
            <p className="text-sm font-semibold text-critical-900">
              Release preservation hold
            </p>

            <p className="mt-1 text-xs leading-relaxed text-critical-700">
              Release this hold only after the preservation reason has actually
              ended. The retention record will return to its recorded pre-hold
              lifecycle state.
            </p>

            <label className="mt-4 block">
              <span className="text-xs font-semibold text-ink-700">
                Released at
              </span>

              <input
                type="datetime-local"
                value={
                  holdReleaseAt
                }
                onChange={(
                  event,
                ) => {
                  setHoldReleaseAt(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-md"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Release summary
              </span>

              <textarea
                rows={
                  2
                }
                value={
                  holdReleaseSummary
                }
                onChange={(
                  event,
                ) => {
                  setHoldReleaseSummary(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
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
                  if (
                    !holdReleaseSummary.trim()
                  ) {
                    throw new Error(
                      "Retention-hold release summary is required.",
                    );
                  }

                  void mutate(
                    "release_retention_hold",
                    {
                      action:
                        "release_retention_hold",

                      occurredAt:
                        toIsoInstant(
                          holdReleaseAt,
                          "Retention-hold release timestamp",
                        ),

                      summary:
                        holdReleaseSummary.trim(),
                    },
                    "Claim retention hold released.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Retention hold could not be released.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-critical-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {
                action ===
                  "release_retention_hold"
                  ? "Releasing..."
                  : "Release retention hold"
              }
            </button>
          </section>
        )
      }

      {/* ============================================== eligibility transition */}

      {
        closure &&
        retention &&
        permissions.mayGovernRetention &&
        retention.status ===
          "scheduled" &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Retention eligibility review
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Reaching the retention date does not automatically delete or
              dispose of anything. An authorized review must separately mark the
              record eligible for disposition.
            </p>

            <div className="mt-3 rounded-md border border-line bg-inset px-3.5 py-3">
              <p className="text-xs text-ink-500">
                Current retention deadline
              </p>

              <p className="mt-1 text-sm font-semibold text-ink-900">
                {
                  formatTimestamp(
                    retention.retentionUntil,
                  )
                }
              </p>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold text-ink-700">
                Eligibility decision date and time
              </span>

              <input
                type="datetime-local"
                value={
                  eligibilityOccurredAt
                }
                onChange={(
                  event,
                ) => {
                  setEligibilityOccurredAt(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-md"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Eligibility review summary
              </span>

              <textarea
                rows={
                  2
                }
                value={
                  eligibilitySummary
                }
                onChange={(
                  event,
                ) => {
                  setEligibilitySummary(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
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
                  if (
                    !eligibilitySummary.trim()
                  ) {
                    throw new Error(
                      "Retention eligibility summary is required.",
                    );
                  }

                  void mutate(
                    "mark_retention_eligible",
                    {
                      action:
                        "mark_retention_eligible",

                      occurredAt:
                        toIsoInstant(
                          eligibilityOccurredAt,
                          "Retention eligibility timestamp",
                        ),

                      summary:
                        eligibilitySummary.trim(),
                    },
                    "Claim record marked eligible for disposition.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Retention eligibility could not be recorded.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-caution-400 bg-white px-4 py-2 text-xs font-semibold text-caution-900 disabled:opacity-50"
            >
              {
                action ===
                  "mark_retention_eligible"
                  ? "Recording..."
                  : "Mark eligible for disposition"
              }
            </button>
          </section>
        )
      }

      {/* ====================================================== disposition */}

      {
        closure &&
        retention &&
        permissions.mayGovernRetention &&
        retention.status ===
          "eligible_for_disposition" &&
        (
          <section className="rounded-lg border border-caution-200 bg-caution-50 p-4 sm:p-5">
            <p className="text-sm font-semibold text-caution-900">
              Record retention disposition
            </p>

            <p className="mt-1 text-xs leading-relaxed text-caution-800">
              This records an actual completed records-disposition event. It
              does not itself delete files from storage. Do not record this
              action before the authorized disposition has actually occurred.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Disposition date and time
                </span>

                <input
                  type="datetime-local"
                  value={
                    dispositionOccurredAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setDispositionOccurredAt(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Disposition method
                </span>

                <input
                  type="text"
                  value={
                    dispositionMethod
                  }
                  onChange={(
                    event,
                  ) => {
                    setDispositionMethod(
                      event.target.value,
                    );
                  }}
                  placeholder="Actual authorized method"
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Disposition summary
              </span>

              <textarea
                rows={
                  3
                }
                value={
                  dispositionSummary
                }
                onChange={(
                  event,
                ) => {
                  setDispositionSummary(
                    event.target.value,
                  );
                }}
                className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm"
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
                  if (
                    !dispositionMethod.trim()
                  ) {
                    throw new Error(
                      "Retention disposition method is required.",
                    );
                  }

                  if (
                    !dispositionSummary.trim()
                  ) {
                    throw new Error(
                      "Retention disposition summary is required.",
                    );
                  }

                  void mutate(
                    "record_retention_disposition",
                    {
                      action:
                        "record_retention_disposition",

                      occurredAt:
                        toIsoInstant(
                          dispositionOccurredAt,
                          "Retention disposition timestamp",
                        ),

                      dispositionMethod:
                        dispositionMethod.trim(),

                      summary:
                        dispositionSummary.trim(),
                    },
                    "Claim retention disposition recorded.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Retention disposition could not be recorded.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-caution-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {
                action ===
                  "record_retention_disposition"
                  ? "Recording..."
                  : "Record completed disposition"
              }
            </button>
          </section>
        )
      }

      {/* =============================================================== audit */}

      {
        closure &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Final closure and retention history
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
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold text-ink-800">
                                    {
                                      humanize(
                                        entry.action,
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
                                </div>

                                <Identifier>
                                  {
                                    entry.actorUserId
                                  }
                                </Identifier>
                              </div>

                              {
                                entry.summary &&
                                (
                                  <p className="mt-2 text-xs leading-relaxed text-ink-600">
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
                      No final-closure audit events have been recorded.
                    </p>
                  )
            }
          </section>
        )
      }
    </div>
  );
}