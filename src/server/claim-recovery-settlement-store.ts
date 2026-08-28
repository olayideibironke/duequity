import "server-only";

import {
  randomUUID,
} from "node:crypto";

import type {
  IsoInstant,
} from "@/domain/types";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * CLAIM RECOVERY SETTLEMENT STORE
 *
 * Durable post-recovery accounting for:
 *
 * - actual recovered value;
 * - DueQuity earned service fee;
 * - claimant economic net;
 * - service-fee invoice;
 * - service-fee payments;
 * - payment corrections;
 * - approved fee waiver;
 * - final recovery reconciliation.
 *
 * The recovery settlement is NOT created from opportunity value, projected
 * recovery, quoted fee, claim readiness, submission, or authority approval.
 *
 * Supabase opens the settlement only when the durable authority lifecycle
 * records actual recovery.
 *
 * The database independently freezes:
 *
 * - authority-review provenance;
 * - submission provenance;
 * - filing-package provenance;
 * - commercial quote provenance;
 * - fee-agreement provenance;
 * - payment route;
 * - representative payment authority;
 * - fee collection method;
 * - actual recovered amount;
 * - locked fee calculation inputs;
 * - legal/internal fee caps;
 * - calculated DueQuity service fee.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type ClaimRecoverySettlementStatus =
  | "no_fee_due"
  | "awaiting_invoice"
  | "invoice_open"
  | "partially_paid"
  | "fee_settled"
  | "reconciled";

export type ClaimRecoveryFeeInvoiceStatus =
  | "open"
  | "partially_paid"
  | "paid"
  | "waived"
  | "settled";

export type ClaimRecoveryFeePaymentStatus =
  | "posted"
  | "voided";

export interface PersistedClaimRecoverySettlement {
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
    IsoInstant;

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
    ClaimRecoverySettlementStatus;

  openedByUserId:
    string;

  reconciledAt?:
    IsoInstant;

  reconciledByUserId?:
    string;

  reconciliationSummary?:
    string;

  rowVersion:
    number;

  createdAt:
    IsoInstant;

  updatedAt:
    IsoInstant;
}

export interface PersistedClaimRecoveryFeeInvoice {
  id:
    string;

  settlementId:
    string;

  claimId:
    string;

  invoiceNumber:
    string;

  issuedAt:
    IsoInstant;

  dueAt?:
    IsoInstant;

  invoiceAmountCents:
    number;

  amountPaidCents:
    number;

  amountWaivedCents:
    number;

  balanceDueCents:
    number;

  status:
    ClaimRecoveryFeeInvoiceStatus;

  issuedByUserId:
    string;

  lastActionByUserId:
    string;

  settledAt?:
    IsoInstant;

  waiverReason?:
    string;

  rowVersion:
    number;

  createdAt:
    IsoInstant;

  updatedAt:
    IsoInstant;
}

export interface PersistedClaimRecoveryFeePayment {
  id:
    string;

  invoiceId:
    string;

  settlementId:
    string;

  claimId:
    string;

  receivedAt:
    IsoInstant;

  amountCents:
    number;

  paymentMethod:
    string;

  paymentReference?:
    string;

  note?:
    string;

  status:
    ClaimRecoveryFeePaymentStatus;

  recordedByUserId:
    string;

  voidedAt?:
    IsoInstant;

  voidedByUserId?:
    string;

  voidReason?:
    string;

  createdAt:
    IsoInstant;

  updatedAt:
    IsoInstant;
}

export interface ClaimRecoveryAuditEntry {
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
    IsoInstant;

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
    IsoInstant;
}

/* ========================================================================== */
/* Mutation inputs                                                             */
/* ========================================================================== */

export interface IssueRecoveryFeeInvoiceInput {
  settlementId:
    string;

  actorUserId:
    string;

  issuedAt:
    IsoInstant;

  dueAt?:
    IsoInstant;
}

export interface RecordRecoveryFeePaymentInput {
  invoiceId:
    string;

  actorUserId:
    string;

  receivedAt:
    IsoInstant;

  amountCents:
    number;

  paymentMethod:
    string;

  paymentReference?:
    string;

  note?:
    string;
}

export interface WaiveRecoveryFeeBalanceInput {
  invoiceId:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  reason:
    string;
}

export interface VoidRecoveryFeePaymentInput {
  paymentId:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  reason:
    string;
}

export interface ReconcileRecoverySettlementInput {
  settlementId:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  summary:
    string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimRecoverySettlementRow {
  id:
    string;

  claim_id:
    string;

  claim_reference:
    string;

  authority_review_id:
    string;

  submission_id:
    string;

  filing_package_id:
    string;

  commercial_quote_id:
    string;

  fee_agreement_id:
    string;

  payment_route:
    string;

  launch_payment_track:
    string;

  representative_may_receive_payment:
    "yes" |
    "no";

  fee_collection_method:
    string;

  recovered_at:
    string;

  gross_recovery_cents:
    number;

  fee_model:
    "percentage" |
    "flat";

  selected_percentage:
    number |
    string |
    null;

  selected_flat_amount_cents:
    number |
    null;

  legal_fee_cap_percent_snapshot:
    number |
    string |
    null;

  legal_fee_cap_amount_snapshot_cents:
    number |
    null;

  internal_fee_cap_amount_snapshot_cents:
    number |
    null;

  calculated_service_fee_cents:
    number;

  claimant_economic_net_cents:
    number;

  status:
    ClaimRecoverySettlementStatus;

  opened_by_user_id:
    string;

  reconciled_at:
    string |
    null;

  reconciled_by_user_id:
    string |
    null;

  reconciliation_summary:
    string |
    null;

  row_version:
    number;

  created_at:
    string;

  updated_at:
    string;
}

interface ClaimRecoveryFeeInvoiceRow {
  id:
    string;

  settlement_id:
    string;

  claim_id:
    string;

  invoice_number:
    string;

  issued_at:
    string;

  due_at:
    string |
    null;

  invoice_amount_cents:
    number;

  amount_paid_cents:
    number;

  amount_waived_cents:
    number;

  balance_due_cents:
    number;

  status:
    ClaimRecoveryFeeInvoiceStatus;

  issued_by_user_id:
    string;

  last_action_by_user_id:
    string;

  settled_at:
    string |
    null;

  waiver_reason:
    string |
    null;

  row_version:
    number;

  created_at:
    string;

  updated_at:
    string;
}

interface ClaimRecoveryFeePaymentRow {
  id:
    string;

  invoice_id:
    string;

  settlement_id:
    string;

  claim_id:
    string;

  received_at:
    string;

  amount_cents:
    number;

  payment_method:
    string;

  payment_reference:
    string |
    null;

  note:
    string |
    null;

  status:
    ClaimRecoveryFeePaymentStatus;

  recorded_by_user_id:
    string;

  voided_at:
    string |
    null;

  voided_by_user_id:
    string |
    null;

  void_reason:
    string |
    null;

  created_at:
    string;

  updated_at:
    string;
}

interface ClaimRecoveryAuditRow {
  id:
    string;

  claim_id:
    string;

  settlement_id:
    string;

  invoice_id:
    string |
    null;

  payment_id:
    string |
    null;

  action:
    string;

  actor_user_id:
    string;

  occurred_at:
    string;

  amount_cents:
    number |
    null;

  external_reference:
    string |
    null;

  summary:
    string |
    null;

  detail:
    Record<
      string,
      unknown
    > |
    null;

  created_at:
    string;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function requireNonEmpty(
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

  return normalized;
}

function optionalText(
  value:
    string |
    undefined,
): string | undefined {
  const normalized =
    value?.trim();

  return normalized ||
    undefined;
}

function validateIsoInstant(
  value:
    string,
  label:
    string,
): IsoInstant {
  if (
    Number.isNaN(
      Date.parse(
        value,
      ),
    )
  ) {
    throw new Error(
      `${label} must be a valid ISO timestamp.`,
    );
  }

  return value;
}

function validateOptionalIsoInstant(
  value:
    string |
    undefined,
  label:
    string,
): IsoInstant | undefined {
  if (!value) {
    return undefined;
  }

  return validateIsoInstant(
    value,
    label,
  );
}

function validatePositiveCents(
  value:
    number,
  label:
    string,
): number {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      `${label} must be a positive whole-cent amount.`,
    );
  }

  return value;
}

function optionalNumber(
  value:
    number |
    string |
    null,
): number | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : undefined;
}

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function settlementFromRow(
  row:
    ClaimRecoverySettlementRow,
): PersistedClaimRecoverySettlement {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    authorityReviewId:
      row.authority_review_id,

    submissionId:
      row.submission_id,

    filingPackageId:
      row.filing_package_id,

    commercialQuoteId:
      row.commercial_quote_id,

    feeAgreementId:
      row.fee_agreement_id,

    paymentRoute:
      row.payment_route,

    launchPaymentTrack:
      row.launch_payment_track,

    representativeMayReceivePayment:
      row.representative_may_receive_payment,

    feeCollectionMethod:
      row.fee_collection_method,

    recoveredAt:
      row.recovered_at as IsoInstant,

    grossRecoveryCents:
      Number(
        row.gross_recovery_cents,
      ),

    feeModel:
      row.fee_model,

    selectedPercentage:
      optionalNumber(
        row.selected_percentage,
      ),

    selectedFlatAmountCents:
      row.selected_flat_amount_cents ??
      undefined,

    legalFeeCapPercentSnapshot:
      optionalNumber(
        row.legal_fee_cap_percent_snapshot,
      ),

    legalFeeCapAmountSnapshotCents:
      row.legal_fee_cap_amount_snapshot_cents ??
      undefined,

    internalFeeCapAmountSnapshotCents:
      row.internal_fee_cap_amount_snapshot_cents ??
      undefined,

    calculatedServiceFeeCents:
      Number(
        row.calculated_service_fee_cents,
      ),

    claimantEconomicNetCents:
      Number(
        row.claimant_economic_net_cents,
      ),

    status:
      row.status,

    openedByUserId:
      row.opened_by_user_id,

    reconciledAt:
      row.reconciled_at
        ? row.reconciled_at as IsoInstant
        : undefined,

    reconciledByUserId:
      row.reconciled_by_user_id ??
      undefined,

    reconciliationSummary:
      row.reconciliation_summary ??
      undefined,

    rowVersion:
      Number(
        row.row_version,
      ),

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,
  };
}

function invoiceFromRow(
  row:
    ClaimRecoveryFeeInvoiceRow,
): PersistedClaimRecoveryFeeInvoice {
  return {
    id:
      row.id,

    settlementId:
      row.settlement_id,

    claimId:
      row.claim_id,

    invoiceNumber:
      row.invoice_number,

    issuedAt:
      row.issued_at as IsoInstant,

    dueAt:
      row.due_at
        ? row.due_at as IsoInstant
        : undefined,

    invoiceAmountCents:
      Number(
        row.invoice_amount_cents,
      ),

    amountPaidCents:
      Number(
        row.amount_paid_cents,
      ),

    amountWaivedCents:
      Number(
        row.amount_waived_cents,
      ),

    balanceDueCents:
      Number(
        row.balance_due_cents,
      ),

    status:
      row.status,

    issuedByUserId:
      row.issued_by_user_id,

    lastActionByUserId:
      row.last_action_by_user_id,

    settledAt:
      row.settled_at
        ? row.settled_at as IsoInstant
        : undefined,

    waiverReason:
      row.waiver_reason ??
      undefined,

    rowVersion:
      Number(
        row.row_version,
      ),

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,
  };
}

function paymentFromRow(
  row:
    ClaimRecoveryFeePaymentRow,
): PersistedClaimRecoveryFeePayment {
  return {
    id:
      row.id,

    invoiceId:
      row.invoice_id,

    settlementId:
      row.settlement_id,

    claimId:
      row.claim_id,

    receivedAt:
      row.received_at as IsoInstant,

    amountCents:
      Number(
        row.amount_cents,
      ),

    paymentMethod:
      row.payment_method,

    paymentReference:
      row.payment_reference ??
      undefined,

    note:
      row.note ??
      undefined,

    status:
      row.status,

    recordedByUserId:
      row.recorded_by_user_id,

    voidedAt:
      row.voided_at
        ? row.voided_at as IsoInstant
        : undefined,

    voidedByUserId:
      row.voided_by_user_id ??
      undefined,

    voidReason:
      row.void_reason ??
      undefined,

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,
  };
}

function auditFromRow(
  row:
    ClaimRecoveryAuditRow,
): ClaimRecoveryAuditEntry {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    settlementId:
      row.settlement_id,

    invoiceId:
      row.invoice_id ??
      undefined,

    paymentId:
      row.payment_id ??
      undefined,

    action:
      row.action,

    actorUserId:
      row.actor_user_id,

    occurredAt:
      row.occurred_at as IsoInstant,

    amountCents:
      row.amount_cents ??
      undefined,

    externalReference:
      row.external_reference ??
      undefined,

    summary:
      row.summary ??
      undefined,

    detail:
      row.detail ??
      undefined,

    createdAt:
      row.created_at as IsoInstant,
  };
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function getClaimRecoverySettlement(
  settlementId:
    string,
): Promise<
  PersistedClaimRecoverySettlement |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_recovery_settlements",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        settlementId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read recovery settlement: ${error.message}`,
    );
  }

  return data
    ? settlementFromRow(
        data as unknown as
          ClaimRecoverySettlementRow,
      )
    : undefined;
}

export async function getClaimRecoverySettlementByClaimId(
  claimId:
    string,
): Promise<
  PersistedClaimRecoverySettlement |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_recovery_settlements",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read recovery settlement: ${error.message}`,
    );
  }

  return data
    ? settlementFromRow(
        data as unknown as
          ClaimRecoverySettlementRow,
      )
    : undefined;
}

export async function getRecoveryFeeInvoiceBySettlementId(
  settlementId:
    string,
): Promise<
  PersistedClaimRecoveryFeeInvoice |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_recovery_fee_invoices",
      )
      .select(
        "*",
      )
      .eq(
        "settlement_id",
        settlementId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read recovery fee invoice: ${error.message}`,
    );
  }

  return data
    ? invoiceFromRow(
        data as unknown as
          ClaimRecoveryFeeInvoiceRow,
      )
    : undefined;
}

export async function getRecoveryFeeInvoice(
  invoiceId:
    string,
): Promise<
  PersistedClaimRecoveryFeeInvoice |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_recovery_fee_invoices",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        invoiceId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read recovery fee invoice: ${error.message}`,
    );
  }

  return data
    ? invoiceFromRow(
        data as unknown as
          ClaimRecoveryFeeInvoiceRow,
      )
    : undefined;
}

export async function listRecoveryFeePayments(
  invoiceId:
    string,
): Promise<
  PersistedClaimRecoveryFeePayment[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_recovery_fee_payments",
      )
      .select(
        "*",
      )
      .eq(
        "invoice_id",
        invoiceId.trim(),
      )
      .order(
        "received_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to read recovery fee payments: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      paymentFromRow(
        row as unknown as
          ClaimRecoveryFeePaymentRow,
      ),
  );
}

export async function claimRecoveryAudit(
  settlementId:
    string,
): Promise<
  ClaimRecoveryAuditEntry[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_recovery_audit",
      )
      .select(
        "*",
      )
      .eq(
        "settlement_id",
        settlementId.trim(),
      )
      .order(
        "occurred_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to read recovery audit: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      auditFromRow(
        row as unknown as
          ClaimRecoveryAuditRow,
      ),
  );
}

/* ========================================================================== */
/* Invoice                                                                     */
/* ========================================================================== */

export async function issueRecoveryFeeInvoice(
  input:
    IssueRecoveryFeeInvoiceInput,
): Promise<
  PersistedClaimRecoveryFeeInvoice
> {
  const settlement =
    await getClaimRecoverySettlement(
      requireNonEmpty(
        input.settlementId,
        "Recovery settlement ID",
      ),
    );

  if (!settlement) {
    throw new Error(
      "Recovery settlement not found.",
    );
  }

  const issuedAt =
    validateIsoInstant(
      input.issuedAt,
      "Invoice issued at",
    );

  const dueAt =
    validateOptionalIsoInstant(
      input.dueAt,
      "Invoice due at",
    );

  const invoiceId =
    `recovery-fee-invoice-${randomUUID()}`;

  const datePart =
    issuedAt
      .slice(
        0,
        10,
      )
      .replaceAll(
        "-",
        "",
      );

  const referencePart =
    settlement.claimReference
      .replace(
        /[^A-Za-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )
      .toUpperCase();

  const invoiceNumber =
    `DQF-${referencePart}-${datePart}-${randomUUID()
      .slice(
        0,
        8,
      )
      .toUpperCase()}`;

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "issue_claim_recovery_fee_invoice",
        {
          p_settlement_id:
            settlement.id,

          p_invoice_id:
            invoiceId,

          p_invoice_number:
            invoiceNumber,

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_issued_at:
            issuedAt,

          p_due_at:
            dueAt ??
            null,
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to issue recovery fee invoice: ${error.message}`,
    );
  }

  return invoiceFromRow(
    data as unknown as
      ClaimRecoveryFeeInvoiceRow,
  );
}

/* ========================================================================== */
/* Fee payment                                                                */
/* ========================================================================== */

export async function recordRecoveryFeePayment(
  input:
    RecordRecoveryFeePaymentInput,
): Promise<
  PersistedClaimRecoveryFeeInvoice
> {
  const supabase =
    getSupabaseAdmin();

  const paymentId =
    `recovery-fee-payment-${randomUUID()}`;

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "record_claim_recovery_fee_payment",
        {
          p_invoice_id:
            requireNonEmpty(
              input.invoiceId,
              "Fee invoice ID",
            ),

          p_payment_id:
            paymentId,

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_received_at:
            validateIsoInstant(
              input.receivedAt,
              "Payment received at",
            ),

          p_amount_cents:
            validatePositiveCents(
              input.amountCents,
              "Payment amount",
            ),

          p_payment_method:
            requireNonEmpty(
              input.paymentMethod,
              "Payment method",
            ),

          p_payment_reference:
            optionalText(
              input.paymentReference,
            ) ??
            null,

          p_note:
            optionalText(
              input.note,
            ) ??
            null,
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to record recovery fee payment: ${error.message}`,
    );
  }

  return invoiceFromRow(
    data as unknown as
      ClaimRecoveryFeeInvoiceRow,
  );
}

/* ========================================================================== */
/* Fee waiver                                                                 */
/* ========================================================================== */

export async function waiveRecoveryFeeBalance(
  input:
    WaiveRecoveryFeeBalanceInput,
): Promise<
  PersistedClaimRecoveryFeeInvoice
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "waive_claim_recovery_fee_balance",
        {
          p_invoice_id:
            requireNonEmpty(
              input.invoiceId,
              "Fee invoice ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Waiver timestamp",
            ),

          p_reason:
            requireNonEmpty(
              input.reason,
              "Waiver reason",
            ),
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to waive recovery fee balance: ${error.message}`,
    );
  }

  return invoiceFromRow(
    data as unknown as
      ClaimRecoveryFeeInvoiceRow,
  );
}

/* ========================================================================== */
/* Payment correction                                                         */
/* ========================================================================== */

export async function voidRecoveryFeePayment(
  input:
    VoidRecoveryFeePaymentInput,
): Promise<
  PersistedClaimRecoveryFeeInvoice
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "void_claim_recovery_fee_payment",
        {
          p_payment_id:
            requireNonEmpty(
              input.paymentId,
              "Fee payment ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Payment void timestamp",
            ),

          p_reason:
            requireNonEmpty(
              input.reason,
              "Payment void reason",
            ),
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to void recovery fee payment: ${error.message}`,
    );
  }

  return invoiceFromRow(
    data as unknown as
      ClaimRecoveryFeeInvoiceRow,
  );
}

/* ========================================================================== */
/* Reconciliation                                                             */
/* ========================================================================== */

export async function reconcileRecoverySettlement(
  input:
    ReconcileRecoverySettlementInput,
): Promise<
  PersistedClaimRecoverySettlement
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "reconcile_claim_recovery_settlement",
        {
          p_settlement_id:
            requireNonEmpty(
              input.settlementId,
              "Recovery settlement ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Reconciliation timestamp",
            ),

          p_summary:
            requireNonEmpty(
              input.summary,
              "Reconciliation summary",
            ),
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to reconcile recovery settlement: ${error.message}`,
    );
  }

  return settlementFromRow(
    data as unknown as
      ClaimRecoverySettlementRow,
  );
}