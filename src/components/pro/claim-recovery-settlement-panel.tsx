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
 * CLAIM RECOVERY SETTLEMENT PANEL
 *
 * Durable post-recovery accounting workspace.
 *
 * This panel never infers:
 *
 * - recovery from an opportunity amount;
 * - recovery from authority approval;
 * - claimant receipt from payment issuance;
 * - DueQuity fee payment from the service agreement;
 * - payment method or payment reference;
 * - settlement completion.
 *
 * It activates only after the authority-review lifecycle durably records actual
 * recovery.
 *
 * The panel then supports:
 *
 * - DueQuity service-fee invoice issuance;
 * - actual fee-payment recording;
 * - privileged payment correction;
 * - privileged unpaid-balance waiver;
 * - privileged final reconciliation.
 *
 * Claimant recovery funds remain separate from DueQuity fee settlement.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type SettlementStatus =
  | "no_fee_due"
  | "awaiting_invoice"
  | "invoice_open"
  | "partially_paid"
  | "fee_settled"
  | "reconciled";

type InvoiceStatus =
  | "open"
  | "partially_paid"
  | "paid"
  | "waived"
  | "settled";

type PaymentStatus =
  | "posted"
  | "voided";

interface RecoverySettlement {
  id:
    string;

  claimId:
    string;

  claimReference:
    string;

  authorityReviewId:
    string;

  submissionId:
    string;

  filingPackageId:
    string;

  commercialQuoteId:
    string;

  feeAgreementId:
    string;

  paymentRoute:
    string;

  launchPaymentTrack:
    string;

  representativeMayReceivePayment:
    "yes" |
    "no";

  feeCollectionMethod:
    string;

  recoveredAt:
    string;

  grossRecoveryCents:
    number;

  feeModel:
    "percentage" |
    "flat";

  selectedPercentage?:
    number;

  selectedFlatAmountCents?:
    number;

  legalFeeCapPercentSnapshot?:
    number;

  legalFeeCapAmountSnapshotCents?:
    number;

  internalFeeCapAmountSnapshotCents?:
    number;

  calculatedServiceFeeCents:
    number;

  claimantEconomicNetCents:
    number;

  status:
    SettlementStatus;

  openedByUserId:
    string;

  reconciledAt?:
    string;

  reconciledByUserId?:
    string;

  reconciliationSummary?:
    string;

  rowVersion:
    number;

  createdAt:
    string;

  updatedAt:
    string;
}

interface RecoveryInvoice {
  id:
    string;

  settlementId:
    string;

  claimId:
    string;

  invoiceNumber:
    string;

  issuedAt:
    string;

  dueAt?:
    string;

  invoiceAmountCents:
    number;

  amountPaidCents:
    number;

  amountWaivedCents:
    number;

  balanceDueCents:
    number;

  status:
    InvoiceStatus;

  issuedByUserId:
    string;

  lastActionByUserId:
    string;

  settledAt?:
    string;

  waiverReason?:
    string;

  rowVersion:
    number;

  createdAt:
    string;

  updatedAt:
    string;
}

interface RecoveryPayment {
  id:
    string;

  invoiceId:
    string;

  settlementId:
    string;

  claimId:
    string;

  receivedAt:
    string;

  amountCents:
    number;

  paymentMethod:
    string;

  paymentReference?:
    string;

  note?:
    string;

  status:
    PaymentStatus;

  recordedByUserId:
    string;

  voidedAt?:
    string;

  voidedByUserId?:
    string;

  voidReason?:
    string;

  createdAt:
    string;

  updatedAt:
    string;
}

interface RecoveryAuditEntry {
  id:
    string;

  claimId:
    string;

  settlementId:
    string;

  invoiceId?:
    string;

  paymentId?:
    string;

  action:
    string;

  actorUserId:
    string;

  occurredAt:
    string;

  amountCents?:
    number;

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

interface RecoveryApiPayload {
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

  settlement:
    RecoverySettlement |
    null;

  invoice:
    RecoveryInvoice |
    null;

  payments:
    RecoveryPayment[];

  audit:
    RecoveryAuditEntry[];

  permissions: {
    actorUserId:
      string;

    mayRead:
      boolean;

    mayWrite:
      boolean;

    mayApprove:
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

function settlementStatusLabel(
  status:
    SettlementStatus,
): string {
  switch (
    status
  ) {
    case "no_fee_due":
      return "No fee due";

    case "awaiting_invoice":
      return "Awaiting invoice";

    case "invoice_open":
      return "Invoice open";

    case "partially_paid":
      return "Partially paid";

    case "fee_settled":
      return "Fee settled";

    case "reconciled":
      return "Reconciled";
  }
}

function settlementStatusTone(
  status:
    SettlementStatus,
):
  | "positive"
  | "caution"
  | "neutral" {
  switch (
    status
  ) {
    case "no_fee_due":
    case "fee_settled":
    case "reconciled":
      return "positive";

    case "awaiting_invoice":
    case "invoice_open":
    case "partially_paid":
      return "caution";

    default:
      return "neutral";
  }
}

function invoiceStatusLabel(
  status:
    InvoiceStatus,
): string {
  switch (
    status
  ) {
    case "open":
      return "Open";

    case "partially_paid":
      return "Partially paid";

    case "paid":
      return "Paid";

    case "waived":
      return "Waived";

    case "settled":
      return "Settled";
  }
}

function invoiceStatusTone(
  status:
    InvoiceStatus,
):
  | "positive"
  | "caution"
  | "neutral" {
  switch (
    status
  ) {
    case "paid":
    case "waived":
    case "settled":
      return "positive";

    case "open":
    case "partially_paid":
      return "caution";

    default:
      return "neutral";
  }
}

function paymentStatusTone(
  status:
    PaymentStatus,
):
  | "positive"
  | "neutral" {
  return status ===
    "posted"
    ? "positive"
    : "neutral";
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

function formatPercent(
  value:
    number |
    undefined,
): string {
  if (
    value ===
    undefined
  ) {
    return "Not recorded";
  }

  const percentage =
    value *
    100;

  return Number.isInteger(
    percentage,
  )
    ? `${percentage.toFixed(
        0,
      )}%`
    : `${percentage.toFixed(
        2,
      )}%`;
}

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

function optionalIsoInstant(
  value:
    string,
  label:
    string,
): string | undefined {
  if (
    !value.trim()
  ) {
    return undefined;
  }

  return toIsoInstant(
    value,
    label,
  );
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
    amount <=
      0
  ) {
    throw new Error(
      `${label} must be greater than zero.`,
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

export function ClaimRecoverySettlementPanel({
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
      RecoveryApiPayload |
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
    issuedAt,
    setIssuedAt,
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
    receivedAt,
    setReceivedAt,
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
    paymentMethod,
    setPaymentMethod,
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
    paymentNote,
    setPaymentNote,
  ] =
    useState(
      "",
    );

  const [
    correctionOccurredAt,
    setCorrectionOccurredAt,
  ] =
    useState(
      "",
    );

  const [
    correctionReason,
    setCorrectionReason,
  ] =
    useState(
      "",
    );

  const [
    waiverOccurredAt,
    setWaiverOccurredAt,
  ] =
    useState(
      "",
    );

  const [
    waiverReason,
    setWaiverReason,
  ] =
    useState(
      "",
    );

  const [
    reconciliationOccurredAt,
    setReconciliationOccurredAt,
  ] =
    useState(
      "",
    );

  const [
    reconciliationSummary,
    setReconciliationSummary,
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
            )}/recovery-settlement`,
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
            | RecoveryApiPayload
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
              : "Recovery settlement state could not be loaded.",
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
                : "Recovery settlement state could not be loaded.",
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
          )}/recovery-settlement`,
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
          | RecoveryApiPayload
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
            : "Recovery accounting action could not be recorded.",
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
          : "Recovery accounting action could not be recorded.",
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
          Loading recovery settlement
        </p>

        <p className="mt-1 text-xs text-ink-500">
          Reading durable recovery, service-fee, payment and reconciliation
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
          Recovery settlement unavailable
        </p>

        <p className="mt-1 text-xs leading-relaxed text-critical-700">
          {
            error ||
            "The recovery settlement workspace could not be loaded."
          }
        </p>
      </div>
    );
  }

  /* ======================================================================== */
  /* Dormant                                                                   */
  /* ======================================================================== */

  if (
    !data.available ||
    !data.settlement
  ) {
    return (
      <div className="rounded-lg border border-line bg-inset px-4 py-5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-ink-900">
              Recovery Settlement
            </p>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
              This stage activates only after actual recovery has been durably
              recorded in the authority-review lifecycle.
            </p>
          </div>

          <Badge tone="neutral">
            Not active
          </Badge>
        </div>

        <div className="mt-4 rounded-md border border-line bg-white px-4 py-3">
          <p className="text-xs font-semibold text-ink-700">
            No recovery recorded
          </p>

          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            DueQuity does not create a fee invoice, fee-payment record, or
            settlement ledger from projected recovery, authority approval, or
            payment issuance alone. Actual recovery must occur first.
          </p>
        </div>
      </div>
    );
  }

  const settlement =
    data.settlement;

  const invoice =
    data.invoice;

  const mayWrite =
    data.permissions
      .mayWrite &&
    settlement.status !==
      "reconciled";

  const mayApprove =
    data.permissions
      .mayApprove &&
    settlement.status !==
      "reconciled";

  const mayIssueInvoice =
    mayWrite &&
    settlement.calculatedServiceFeeCents >
      0 &&
    !invoice;

  const mayRecordPayment =
    mayWrite &&
    Boolean(
      invoice,
    ) &&
    Boolean(
      invoice &&
      (
        invoice.status ===
          "open" ||
        invoice.status ===
          "partially_paid"
      ) &&
      invoice.balanceDueCents >
        0,
    );

  const mayWaive =
    mayApprove &&
    Boolean(
      invoice &&
      invoice.balanceDueCents >
        0 &&
      (
        invoice.status ===
          "open" ||
        invoice.status ===
          "partially_paid"
      ),
    );

  const mayReconcile =
    mayApprove &&
    settlement.status !==
      "reconciled" &&
    (
      settlement.calculatedServiceFeeCents ===
        0 ||
      Boolean(
        invoice &&
        invoice.balanceDueCents ===
          0 &&
        (
          invoice.status ===
            "paid" ||
          invoice.status ===
            "waived" ||
          invoice.status ===
            "settled"
        ),
      )
    );

  /* ======================================================================== */
  /* Active                                                                    */
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

      {/* =========================================================== settlement */}

      <section className="rounded-lg border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-inset px-4 py-4 sm:px-5">
          <div>
            <p className="text-base font-semibold text-ink-900">
              Recovery Settlement
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              Actual recovery, DueQuity contractual fee settlement, and final
              reconciliation.
            </p>
          </div>

          <Badge
            tone={
              settlementStatusTone(
                settlement.status,
              )
            }
            size="md"
          >
            {
              settlementStatusLabel(
                settlement.status,
              )
            }
          </Badge>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          <div>
            <p className="text-xs text-ink-500">
              Actual recovery
            </p>

            <p className="mt-1 text-xl font-semibold text-ink-900">
              {
                formatMoney(
                  settlement.grossRecoveryCents,
                )
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              DueQuity service fee
            </p>

            <p className="mt-1 text-xl font-semibold text-ink-900">
              {
                formatMoney(
                  settlement.calculatedServiceFeeCents,
                )
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Claimant economic net
            </p>

            <p className="mt-1 text-xl font-semibold text-ink-900">
              {
                formatMoney(
                  settlement.claimantEconomicNetCents,
                )
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Recovered
            </p>

            <p className="mt-1 text-sm font-medium text-ink-800">
              {
                formatTimestamp(
                  settlement.recoveredAt,
                )
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Payment route
            </p>

            <p className="mt-1 text-sm font-medium text-ink-800">
              {
                humanize(
                  settlement.paymentRoute,
                )
              }
            </p>
          </div>

          <div>
            <p className="text-xs text-ink-500">
              Fee collection
            </p>

            <p className="mt-1 text-sm font-medium text-ink-800">
              {
                humanize(
                  settlement.feeCollectionMethod,
                )
              }
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================ economics */}

      <section className="rounded-lg border border-line bg-inset p-4 sm:p-5">
        <p className="text-sm font-semibold text-ink-900">
          Frozen recovery economics
        </p>

        <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-ink-500">
              Fee model
            </dt>

            <dd className="mt-1 font-medium text-ink-800">
              {
                humanize(
                  settlement.feeModel,
                )
              }
            </dd>
          </div>

          <div>
            <dt className="text-ink-500">
              Locked percentage
            </dt>

            <dd className="mt-1 font-medium text-ink-800">
              {
                formatPercent(
                  settlement.selectedPercentage,
                )
              }
            </dd>
          </div>

          <div>
            <dt className="text-ink-500">
              Locked flat amount
            </dt>

            <dd className="mt-1 font-medium text-ink-800">
              {
                settlement.selectedFlatAmountCents ===
                  undefined
                  ? "Not recorded"
                  : formatMoney(
                      settlement.selectedFlatAmountCents,
                    )
              }
            </dd>
          </div>

          <div>
            <dt className="text-ink-500">
              Legal percentage ceiling
            </dt>

            <dd className="mt-1 font-medium text-ink-800">
              {
                formatPercent(
                  settlement.legalFeeCapPercentSnapshot,
                )
              }
            </dd>
          </div>

          <div>
            <dt className="text-ink-500">
              Legal amount ceiling
            </dt>

            <dd className="mt-1 font-medium text-ink-800">
              {
                settlement.legalFeeCapAmountSnapshotCents ===
                  undefined
                  ? "Not recorded"
                  : formatMoney(
                      settlement.legalFeeCapAmountSnapshotCents,
                    )
              }
            </dd>
          </div>

          <div>
            <dt className="text-ink-500">
              Internal fee ceiling
            </dt>

            <dd className="mt-1 font-medium text-ink-800">
              {
                settlement.internalFeeCapAmountSnapshotCents ===
                  undefined
                  ? "Not recorded"
                  : formatMoney(
                      settlement.internalFeeCapAmountSnapshotCents,
                    )
              }
            </dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs leading-relaxed text-ink-600">
            The earned DueQuity service fee is calculated from the actual
            recovered amount using the frozen commercial agreement and applicable
            recorded fee ceilings. It is not automatically treated as paid.
          </p>
        </div>
      </section>

      {/* ============================================================= invoice */}

      {
        settlement.calculatedServiceFeeCents ===
          0 &&
        (
          <section className="rounded-lg border border-accent-200 bg-accent-50 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-accent-900">
                  No DueQuity service fee due
                </p>

                <p className="mt-1 text-xs leading-relaxed text-accent-800">
                  The actual recovery produced a $0 service fee. No invoice is
                  created solely for bookkeeping.
                </p>
              </div>

              <Badge tone="positive">
                $0 fee
              </Badge>
            </div>
          </section>
        )
      }

      {
        mayIssueInvoice &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Issue DueQuity service-fee invoice
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Issue the contractual fee invoice only after actual recovery has
              been recorded.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Issued at
                </span>

                <input
                  type="datetime-local"
                  value={
                    issuedAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setIssuedAt(
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

            <button
              type="button"
              disabled={
                action !==
                null
              }
              onClick={() => {
                try {
                  void mutate(
                    "issue_invoice",
                    {
                      action:
                        "issue_invoice",

                      issuedAt:
                        toIsoInstant(
                          issuedAt,
                          "Invoice issued at",
                        ),

                      dueAt:
                        optionalIsoInstant(
                          dueAt,
                          "Invoice due at",
                        ),
                    },
                    "DueQuity service-fee invoice issued.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Invoice could not be issued.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-ink-950 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {
                action ===
                "issue_invoice"
                  ? "Issuing..."
                  : "Issue fee invoice"
              }
            </button>
          </section>
        )
      }

      {
        invoice &&
        (
          <section className="rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-inset px-4 py-4 sm:px-5">
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  DueQuity service-fee invoice
                </p>

                <div className="mt-1">
                  <Identifier>
                    {
                      invoice.invoiceNumber
                    }
                  </Identifier>
                </div>
              </div>

              <Badge
                tone={
                  invoiceStatusTone(
                    invoice.status,
                  )
                }
              >
                {
                  invoiceStatusLabel(
                    invoice.status,
                  )
                }
              </Badge>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
              <div>
                <p className="text-xs text-ink-500">
                  Invoice amount
                </p>

                <p className="mt-1 text-lg font-semibold text-ink-900">
                  {
                    formatMoney(
                      invoice.invoiceAmountCents,
                    )
                  }
                </p>
              </div>

              <div>
                <p className="text-xs text-ink-500">
                  Paid
                </p>

                <p className="mt-1 text-lg font-semibold text-ink-900">
                  {
                    formatMoney(
                      invoice.amountPaidCents,
                    )
                  }
                </p>
              </div>

              <div>
                <p className="text-xs text-ink-500">
                  Waived
                </p>

                <p className="mt-1 text-lg font-semibold text-ink-900">
                  {
                    formatMoney(
                      invoice.amountWaivedCents,
                    )
                  }
                </p>
              </div>

              <div>
                <p className="text-xs text-ink-500">
                  Balance due
                </p>

                <p className="mt-1 text-lg font-semibold text-ink-900">
                  {
                    formatMoney(
                      invoice.balanceDueCents,
                    )
                  }
                </p>
              </div>

              <div>
                <p className="text-xs text-ink-500">
                  Issued
                </p>

                <p className="mt-1 text-sm font-medium text-ink-800">
                  {
                    formatTimestamp(
                      invoice.issuedAt,
                    )
                  }
                </p>
              </div>

              <div>
                <p className="text-xs text-ink-500">
                  Due
                </p>

                <p className="mt-1 text-sm font-medium text-ink-800">
                  {
                    formatTimestamp(
                      invoice.dueAt,
                    )
                  }
                </p>
              </div>

              <div>
                <p className="text-xs text-ink-500">
                  Settled
                </p>

                <p className="mt-1 text-sm font-medium text-ink-800">
                  {
                    formatTimestamp(
                      invoice.settledAt,
                    )
                  }
                </p>
              </div>

              {
                invoice.waiverReason &&
                (
                  <div>
                    <p className="text-xs text-ink-500">
                      Waiver reason
                    </p>

                    <p className="mt-1 text-sm font-medium text-ink-800">
                      {
                        invoice.waiverReason
                      }
                    </p>
                  </div>
                )
              }
            </div>
          </section>
        )
      }

      {/* ======================================================== fee payment */}

      {
        mayRecordPayment &&
        invoice &&
        (
          <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-ink-900">
              Record DueQuity fee payment
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Record only money DueQuity actually received toward this service
              fee invoice.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Received at
                </span>

                <input
                  type="datetime-local"
                  value={
                    receivedAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setReceivedAt(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Amount
                </span>

                <input
                  type="number"
                  min="0.01"
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
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Payment method
                </span>

                <input
                  type="text"
                  value={
                    paymentMethod
                  }
                  onChange={(
                    event,
                  ) => {
                    setPaymentMethod(
                      event.target.value,
                    );
                  }}
                  placeholder="Actual method used"
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>

              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Payment reference
                </span>

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
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Payment note
              </span>

              <textarea
                rows={
                  2
                }
                value={
                  paymentNote
                }
                onChange={(
                  event,
                ) => {
                  setPaymentNote(
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
                  const amountCents =
                    dollarsToCents(
                      paymentAmount,
                      "Payment amount",
                    );

                  if (
                    amountCents >
                    invoice.balanceDueCents
                  ) {
                    throw new Error(
                      "Payment amount cannot exceed the current invoice balance.",
                    );
                  }

                  if (
                    !paymentMethod.trim()
                  ) {
                    throw new Error(
                      "Payment method is required.",
                    );
                  }

                  void mutate(
                    "record_payment",
                    {
                      action:
                        "record_payment",

                      invoiceId:
                        invoice.id,

                      receivedAt:
                        toIsoInstant(
                          receivedAt,
                          "Payment received at",
                        ),

                      amountCents,

                      paymentMethod:
                        paymentMethod.trim(),

                      paymentReference:
                        paymentReference.trim() ||
                        undefined,

                      note:
                        paymentNote.trim() ||
                        undefined,
                    },
                    "DueQuity fee payment recorded.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Payment could not be recorded.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {
                action ===
                "record_payment"
                  ? "Recording..."
                  : "Record fee payment"
              }
            </button>
          </section>
        )
      }

      {/* =========================================================== payments */}

      {
        data.payments.length >
          0 &&
        invoice &&
        (
          <section className="space-y-3">
            <p className="text-sm font-semibold text-ink-900">
              Fee payment history
            </p>

            {
              data.payments.map(
                (
                  payment,
                ) => (
                  <div
                    key={
                      payment.id
                    }
                    className="rounded-lg border border-line bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-ink-900">
                          {
                            formatMoney(
                              payment.amountCents,
                            )
                          }
                        </p>

                        <p className="mt-1 text-xs text-ink-500">
                          {
                            formatTimestamp(
                              payment.receivedAt,
                            )
                          }
                          {" / "}
                          {
                            humanize(
                              payment.paymentMethod,
                            )
                          }
                        </p>
                      </div>

                      <Badge
                        tone={
                          paymentStatusTone(
                            payment.status,
                          )
                        }
                      >
                        {
                          payment.status ===
                            "posted"
                            ? "Posted"
                            : "Voided"
                        }
                      </Badge>
                    </div>

                    {
                      payment.paymentReference &&
                      (
                        <p className="mt-3 text-xs text-ink-600">
                          Reference:{" "}
                          <span className="font-semibold text-ink-800">
                            {
                              payment.paymentReference
                            }
                          </span>
                        </p>
                      )
                    }

                    {
                      payment.note &&
                      (
                        <p className="mt-1 text-xs leading-relaxed text-ink-600">
                          {
                            payment.note
                          }
                        </p>
                      )
                    }

                    {
                      payment.status ===
                        "voided" &&
                      (
                        <div className="mt-3 rounded-md border border-line bg-inset px-3 py-3">
                          <p className="text-xs font-semibold text-ink-700">
                            Payment voided
                          </p>

                          <p className="mt-1 text-xs text-ink-600">
                            {
                              formatTimestamp(
                                payment.voidedAt,
                              )
                            }
                          </p>

                          {
                            payment.voidReason &&
                            (
                              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                                {
                                  payment.voidReason
                                }
                              </p>
                            )
                          }
                        </div>
                      )
                    }

                    {
                      mayApprove &&
                      payment.status ===
                        "posted" &&
                      (
                        <div className="mt-4 border-t border-line pt-4">
                          <p className="text-xs font-semibold text-ink-700">
                            Correct payment
                          </p>

                          <p className="mt-1 text-xs leading-relaxed text-ink-500">
                            Voiding reverses this recorded fee payment from the
                            settlement balance. Use only for a genuine accounting
                            correction.
                          </p>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <input
                              type="datetime-local"
                              value={
                                correctionOccurredAt
                              }
                              onChange={(
                                event,
                              ) => {
                                setCorrectionOccurredAt(
                                  event.target.value,
                                );
                              }}
                              className="rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                            />

                            <input
                              type="text"
                              value={
                                correctionReason
                              }
                              onChange={(
                                event,
                              ) => {
                                setCorrectionReason(
                                  event.target.value,
                                );
                              }}
                              placeholder="Correction reason"
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
                                if (
                                  !correctionReason.trim()
                                ) {
                                  throw new Error(
                                    "Payment void reason is required.",
                                  );
                                }

                                void mutate(
                                  `void:${payment.id}`,
                                  {
                                    action:
                                      "void_payment",

                                    invoiceId:
                                      invoice.id,

                                    paymentId:
                                      payment.id,

                                    occurredAt:
                                      toIsoInstant(
                                        correctionOccurredAt,
                                        "Payment void timestamp",
                                      ),

                                    reason:
                                      correctionReason.trim(),
                                  },
                                  "Recovery fee payment voided.",
                                );
                              } catch (
                                validationError
                              ) {
                                setError(
                                  validationError instanceof
                                    Error
                                    ? validationError.message
                                    : "Payment could not be voided.",
                                );
                              }
                            }}
                            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2 text-xs font-semibold text-critical-800 disabled:opacity-50"
                          >
                            {
                              action ===
                              `void:${payment.id}`
                                ? "Voiding..."
                                : "Void payment"
                            }
                          </button>
                        </div>
                      )
                    }
                  </div>
                ),
              )
            }
          </section>
        )
      }

      {/* ============================================================= waiver */}

      {
        mayWaive &&
        invoice &&
        (
          <section className="rounded-lg border border-caution-200 bg-caution-50 p-4 sm:p-5">
            <p className="text-sm font-semibold text-caution-900">
              Waive remaining DueQuity fee balance
            </p>

            <p className="mt-1 text-xs leading-relaxed text-caution-800">
              This is an approval-level financial action. It records that the
              remaining contractual service-fee balance will not be collected.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-ink-700">
                  Waiver date and time
                </span>

                <input
                  type="datetime-local"
                  value={
                    waiverOccurredAt
                  }
                  onChange={(
                    event,
                  ) => {
                    setWaiverOccurredAt(
                      event.target.value,
                    );
                  }}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm"
                />
              </label>

              <div>
                <p className="text-xs font-semibold text-ink-700">
                  Current balance
                </p>

                <p className="mt-2 text-lg font-semibold text-ink-900">
                  {
                    formatMoney(
                      invoice.balanceDueCents,
                    )
                  }
                </p>
              </div>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-ink-700">
                Waiver reason
              </span>

              <textarea
                rows={
                  2
                }
                value={
                  waiverReason
                }
                onChange={(
                  event,
                ) => {
                  setWaiverReason(
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
                    !waiverReason.trim()
                  ) {
                    throw new Error(
                      "Waiver reason is required.",
                    );
                  }

                  void mutate(
                    "waive_balance",
                    {
                      action:
                        "waive_balance",

                      invoiceId:
                        invoice.id,

                      occurredAt:
                        toIsoInstant(
                          waiverOccurredAt,
                          "Fee waiver timestamp",
                        ),

                      reason:
                        waiverReason.trim(),
                    },
                    "Remaining DueQuity fee balance waived.",
                  );
                } catch (
                  validationError
                ) {
                  setError(
                    validationError instanceof
                      Error
                      ? validationError.message
                      : "Fee balance could not be waived.",
                  );
                }
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-caution-400 bg-white px-4 py-2 text-xs font-semibold text-caution-900 disabled:opacity-50"
            >
              {
                action ===
                "waive_balance"
                  ? "Recording..."
                  : "Waive remaining balance"
              }
            </button>
          </section>
        )
      }

      {/* ======================================================= reconciliation */}

      {
        settlement.status ===
          "reconciled"
          ? (
              <section className="rounded-lg border border-accent-200 bg-accent-50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-accent-900">
                      Recovery reconciled
                    </p>

                    <p className="mt-1 text-xs text-accent-800">
                      {
                        formatTimestamp(
                          settlement.reconciledAt,
                        )
                      }
                    </p>
                  </div>

                  <Badge tone="positive">
                    Final
                  </Badge>
                </div>

                {
                  settlement.reconciliationSummary &&
                  (
                    <p className="mt-3 text-xs leading-relaxed text-accent-800">
                      {
                        settlement.reconciliationSummary
                      }
                    </p>
                  )
                }
              </section>
            )
          : mayReconcile
            ? (
                <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
                  <p className="text-sm font-semibold text-ink-900">
                    Final recovery reconciliation
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Final reconciliation is an approval-level action. Complete it
                    only when the recorded recovery and DueQuity fee accounting
                    are operationally complete.
                  </p>

                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-ink-700">
                      Reconciled at
                    </span>

                    <input
                      type="datetime-local"
                      value={
                        reconciliationOccurredAt
                      }
                      onChange={(
                        event,
                      ) => {
                        setReconciliationOccurredAt(
                          event.target.value,
                        );
                      }}
                      className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm sm:max-w-md"
                    />
                  </label>

                  <label className="mt-3 block">
                    <span className="text-xs font-semibold text-ink-700">
                      Reconciliation summary
                    </span>

                    <textarea
                      rows={
                        3
                      }
                      value={
                        reconciliationSummary
                      }
                      onChange={(
                        event,
                      ) => {
                        setReconciliationSummary(
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
                          !reconciliationSummary.trim()
                        ) {
                          throw new Error(
                            "Reconciliation summary is required.",
                          );
                        }

                        void mutate(
                          "reconcile",
                          {
                            action:
                              "reconcile",

                            occurredAt:
                              toIsoInstant(
                                reconciliationOccurredAt,
                                "Reconciliation timestamp",
                              ),

                            summary:
                              reconciliationSummary.trim(),
                          },
                          "Recovery settlement reconciled.",
                        );
                      } catch (
                        validationError
                      ) {
                        setError(
                          validationError instanceof
                            Error
                            ? validationError.message
                            : "Recovery settlement could not be reconciled.",
                        );
                      }
                    }}
                    className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-ink-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {
                      action ===
                        "reconcile"
                        ? "Reconciling..."
                        : "Reconcile recovery"
                    }
                  </button>
                </section>
              )
            : null
      }

      {/* =============================================================== audit */}

      <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-ink-900">
          Recovery accounting history
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

                            {
                              entry.amountCents !==
                                undefined &&
                              (
                                <p className="text-sm font-semibold text-ink-900">
                                  {
                                    formatMoney(
                                      entry.amountCents,
                                    )
                                  }
                                </p>
                              )
                            }
                          </div>

                          {
                            entry.externalReference &&
                            (
                              <p className="mt-2 text-xs text-ink-600">
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
                  No recovery accounting events have been recorded.
                </p>
              )
        }
      </section>
    </div>
  );
}