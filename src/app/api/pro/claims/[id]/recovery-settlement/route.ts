import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  Permission,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
  type StaffSession,
} from "@/lib/session";

import {
  claimRecoveryAudit,
  getClaimRecoverySettlementByClaimId,
  getRecoveryFeeInvoice,
  getRecoveryFeeInvoiceBySettlementId,
  issueRecoveryFeeInvoice,
  listRecoveryFeePayments,
  reconcileRecoverySettlement,
  recordRecoveryFeePayment,
  voidRecoveryFeePayment,
  waiveRecoveryFeeBalance,
} from "@/server/claim-recovery-settlement-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  listJurisdictionRulePackages,
} from "@/server/jurisdiction-intelligence";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/**
 * CLAIM RECOVERY SETTLEMENT API
 *
 * Durable post-recovery accounting.
 *
 * This endpoint does NOT:
 *
 * - create an authority recovery event;
 * - infer a recovery from opportunity value;
 * - infer claimant payment from authority approval;
 * - infer a DueQuity fee receipt;
 * - create claimant-fund custody;
 * - create a payment instrument;
 * - charge a card or bank account.
 *
 * A settlement exists only after the durable authority-review lifecycle records
 * actual recovery. Supabase creates and freezes the settlement from trusted
 * authority, submission, filing-package, commercial and payment-route
 * provenance.
 *
 * Permission design:
 *
 * recovery.read
 *   Read settlement, invoice, fee-payment and recovery audit state.
 *
 * recovery.write
 *   Issue the contractual DueQuity fee invoice and record an actual fee payment.
 *
 * recovery.approve
 *   Void/correct a recorded payment, waive an unpaid fee balance, and perform
 *   final recovery reconciliation.
 *
 * Browser supplied settlement, invoice and payment identifiers are never trusted
 * for ownership. The server independently proves that each requested record
 * belongs to the current claim's durable recovery settlement.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type RecoverySettlementAction =
  | "issue_invoice"
  | "record_payment"
  | "void_payment"
  | "waive_balance"
  | "reconcile";

interface RecoverySettlementActionBody {
  action?:
    RecoverySettlementAction;

  issuedAt?:
    string;

  dueAt?:
    string;

  invoiceId?:
    string;

  receivedAt?:
    string;

  amountCents?:
    unknown;

  paymentMethod?:
    string;

  paymentReference?:
    string;

  note?:
    string;

  paymentId?:
    string;

  occurredAt?:
    string;

  reason?:
    string;

  summary?:
    string;
}

interface ResolvedRecoveryContext {
  session:
    StaffSession;

  actorUserId:
    string;

  claim:
    NonNullable<
      Awaited<
        ReturnType<
          typeof resolveClaimRecord
        >
      >
    >["claim"];

  jurisdictionPackage:
    Awaited<
      ReturnType<
        typeof listJurisdictionRulePackages
      >
    >[number];

  settlement:
    Awaited<
      ReturnType<
        typeof getClaimRecoverySettlementByClaimId
      >
    >;
}

/* ========================================================================== */
/* Route errors                                                                */
/* ========================================================================== */

class RecoverySettlementRouteError extends Error {
  status:
    number;

  constructor(
    message:
      string,
    status:
      number,
  ) {
    super(
      message,
    );

    this.name =
      "RecoverySettlementRouteError";

    this.status =
      status;
  }
}

function errorResponse(
  message:
    string,
  status =
    400,
) {
  return NextResponse.json(
    {
      ok:
        false,

      error:
        message,
    },
    {
      status,
    },
  );
}

function routeErrorResponse(
  error:
    unknown,
  fallbackMessage:
    string,
  fallbackStatus =
    409,
) {
  if (
    error instanceof
    RecoverySettlementRouteError
  ) {
    return errorResponse(
      error.message,
      error.status,
    );
  }

  return errorResponse(
    error instanceof Error
      ? error.message
      : fallbackMessage,
    fallbackStatus,
  );
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function requiredString(
  value:
    string |
    undefined,
  label:
    string,
): string {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new RecoverySettlementRouteError(
      `${label} is required.`,
      400,
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

function requiredPositiveWholeCents(
  value:
    unknown,
  label:
    string,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new RecoverySettlementRouteError(
      `${label} must be a positive whole-cent amount.`,
      400,
    );
  }

  return value;
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function actionPermission(
  action:
    RecoverySettlementAction,
): Permission {
  switch (
    action
  ) {
    case "issue_invoice":
    case "record_payment":
      return "recovery.write";

    case "void_payment":
    case "waive_balance":
    case "reconcile":
      return "recovery.approve";
  }
}

function requireReadPermission(
  session:
    StaffSession,
): void {
  if (
    !can(
      session,
      "claim.read",
    )
  ) {
    throw new RecoverySettlementRouteError(
      "You do not have permission to read this claim.",
      403,
    );
  }

  if (
    !can(
      session,
      "recovery.read",
    )
  ) {
    throw new RecoverySettlementRouteError(
      "You do not have permission to read recovery accounting.",
      403,
    );
  }
}

function requireActionPermission(
  session:
    StaffSession,
  action:
    RecoverySettlementAction,
): void {
  requireReadPermission(
    session,
  );

  const permission =
    actionPermission(
      action,
    );

  if (
    !can(
      session,
      permission,
    )
  ) {
    throw new RecoverySettlementRouteError(
      permission ===
        "recovery.approve"
        ? "You do not have approval authority for this recovery accounting action."
        : "You do not have permission to record recovery accounting activity.",
      403,
    );
  }
}

/* ========================================================================== */
/* Context                                                                     */
/* ========================================================================== */

async function resolveRecoveryContext(
  claimId:
    string,
  session:
    StaffSession,
): Promise<
  ResolvedRecoveryContext
> {
  requireReadPermission(
    session,
  );

  const resolved =
    await resolveClaimRecord(
      claimId,
    );

  if (!resolved) {
    throw new RecoverySettlementRouteError(
      "Claim not found.",
      404,
    );
  }

  const claim =
    resolved.claim;

  const jurisdictionPackages =
    await listJurisdictionRulePackages();

  const jurisdictionPackage =
    jurisdictionPackages
      .filter(
        (
          candidate,
        ) =>
          candidate.status ===
            "approved" &&
          candidate.rule?.id ===
            claim.jurisdictionId,
      )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          right.version -
          left.version,
      )[0];

  if (
    !jurisdictionPackage ||
    !jurisdictionPackage.rule
  ) {
    throw new RecoverySettlementRouteError(
      "No current approved jurisdiction rule is published for this claim.",
      409,
    );
  }

  if (
    !clearedForState(
      session,
      jurisdictionPackage.stateCode,
    )
  ) {
    throw new RecoverySettlementRouteError(
      `You are not cleared to work on recoveries in ${jurisdictionPackage.stateCode}.`,
      403,
    );
  }

  const settlement =
    await getClaimRecoverySettlementByClaimId(
      claim.id,
    );

  return {
    session,

    actorUserId:
      session.user.id,

    claim,

    jurisdictionPackage,

    settlement,
  };
}

/* ========================================================================== */
/* Record ownership                                                            */
/* ========================================================================== */

async function requireInvoiceForSettlement({
  settlementId,
  invoiceId,
}: {
  settlementId:
    string;

  invoiceId:
    string;
}) {
  const normalizedInvoiceId =
    requiredString(
      invoiceId,
      "Recovery fee invoice ID",
    );

  const invoice =
    await getRecoveryFeeInvoice(
      normalizedInvoiceId,
    );

  if (
    !invoice ||
    invoice.settlementId !==
      settlementId
  ) {
    throw new RecoverySettlementRouteError(
      "The recovery fee invoice does not belong to this claim's current recovery settlement.",
      404,
    );
  }

  return invoice;
}

async function requirePaymentForInvoice({
  invoiceId,
  paymentId,
}: {
  invoiceId:
    string;

  paymentId:
    string;
}) {
  const normalizedPaymentId =
    requiredString(
      paymentId,
      "Recovery fee payment ID",
    );

  const payments =
    await listRecoveryFeePayments(
      invoiceId,
    );

  const payment =
    payments.find(
      (
        candidate,
      ) =>
        candidate.id ===
        normalizedPaymentId,
    );

  if (!payment) {
    throw new RecoverySettlementRouteError(
      "The recovery fee payment does not belong to this claim's current recovery fee invoice.",
      404,
    );
  }

  return payment;
}

/* ========================================================================== */
/* Current state                                                               */
/* ========================================================================== */

async function recoveryStateResponse(
  claimId:
    string,
  session:
    StaffSession,
) {
  const context =
    await resolveRecoveryContext(
      claimId,
      session,
    );

  const {
    actorUserId,
    claim,
    settlement,
  } =
    context;

  if (!settlement) {
    return {
      ok:
        true,

      claim: {
        id:
          claim.id,

        reference:
          claim.reference,
      },

      available:
        false,

      settlement:
        null,

      invoice:
        null,

      payments:
        [],

      audit:
        [],

      permissions: {
        actorUserId,

        mayRead:
          true,

        mayWrite:
          can(
            session,
            "recovery.write",
          ),

        mayApprove:
          can(
            session,
            "recovery.approve",
          ),
      },
    };
  }

  const invoice =
    await getRecoveryFeeInvoiceBySettlementId(
      settlement.id,
    );

  const [
    payments,
    audit,
  ] =
    await Promise.all([
      invoice
        ? listRecoveryFeePayments(
            invoice.id,
          )
        : Promise.resolve(
            [],
          ),

      claimRecoveryAudit(
        settlement.id,
      ),
    ]);

  return {
    ok:
      true,

    claim: {
      id:
        claim.id,

      reference:
        claim.reference,
    },

    available:
      true,

    settlement,

    invoice:
      invoice ??
      null,

    payments,

    audit,

    permissions: {
      actorUserId,

      mayRead:
        true,

      mayWrite:
        can(
          session,
          "recovery.write",
        ),

      mayApprove:
        can(
          session,
          "recovery.approve",
        ),
    },
  };
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request:
    NextRequest,
  context: {
    params: Promise<{
      id:
        string;
    }>;
  },
) {
  const {
    id,
  } =
    await context.params;

  const session =
    await resolveStaffSession();

  if (!session) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  try {
    return NextResponse.json(
      await recoveryStateResponse(
        id,
        session,
      ),
    );
  } catch (
    error
  ) {
    return routeErrorResponse(
      error,
      "Recovery settlement state could not be loaded.",
      409,
    );
  }
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request:
    NextRequest,
  context: {
    params: Promise<{
      id:
        string;
    }>;
  },
) {
  const {
    id,
  } =
    await context.params;

  const session =
    await resolveStaffSession();

  if (!session) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  try {
    let body:
      RecoverySettlementActionBody;

    try {
      body =
        (await request.json()) as
          RecoverySettlementActionBody;
    } catch {
      return errorResponse(
        "Invalid JSON request.",
        400,
      );
    }

    if (!body.action) {
      return errorResponse(
        "Recovery settlement action is required.",
        400,
      );
    }

    requireActionPermission(
      session,
      body.action,
    );

    const recoveryContext =
      await resolveRecoveryContext(
        id,
        session,
      );

    const {
      actorUserId,
      settlement,
    } =
      recoveryContext;

    if (!settlement) {
      return errorResponse(
        "Recovery settlement becomes available only after actual recovery has been durably recorded in the authority-review lifecycle.",
        409,
      );
    }

    /* ====================================================================== */
    /* Issue DueQuity fee invoice                                             */
    /* ====================================================================== */

    if (
      body.action ===
      "issue_invoice"
    ) {
      if (
        settlement.calculatedServiceFeeCents ===
        0
      ) {
        return errorResponse(
          "No DueQuity service fee is due for this recovery, so no fee invoice may be issued.",
          409,
        );
      }

      const existingInvoice =
        await getRecoveryFeeInvoiceBySettlementId(
          settlement.id,
        );

      if (existingInvoice) {
        return errorResponse(
          "A recovery fee invoice already exists for this settlement.",
          409,
        );
      }

      await issueRecoveryFeeInvoice({
        settlementId:
          settlement.id,

        actorUserId,

        issuedAt:
          requiredString(
            body.issuedAt,
            "Invoice issued at",
          ),

        dueAt:
          optionalText(
            body.dueAt,
          ),
      });

      return NextResponse.json(
        await recoveryStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Record actual DueQuity fee payment                                     */
    /* ====================================================================== */

    if (
      body.action ===
      "record_payment"
    ) {
      const invoice =
        await requireInvoiceForSettlement({
          settlementId:
            settlement.id,

          invoiceId:
            requiredString(
              body.invoiceId,
              "Recovery fee invoice ID",
            ),
        });

      if (
        invoice.status ===
          "paid" ||
        invoice.status ===
          "waived" ||
        invoice.status ===
          "settled"
      ) {
        return errorResponse(
          "The recovery fee invoice does not have an open balance that may receive another payment.",
          409,
        );
      }

      const amountCents =
        requiredPositiveWholeCents(
          body.amountCents,
          "Payment amount",
        );

      if (
        amountCents >
        invoice.balanceDueCents
      ) {
        return errorResponse(
          "Payment amount cannot exceed the current recovery fee balance.",
          409,
        );
      }

      await recordRecoveryFeePayment({
        invoiceId:
          invoice.id,

        actorUserId,

        receivedAt:
          requiredString(
            body.receivedAt,
            "Payment received at",
          ),

        amountCents,

        paymentMethod:
          requiredString(
            body.paymentMethod,
            "Payment method",
          ),

        paymentReference:
          optionalText(
            body.paymentReference,
          ),

        note:
          optionalText(
            body.note,
          ),
      });

      return NextResponse.json(
        await recoveryStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Void / correct fee payment                                             */
    /* ====================================================================== */

    if (
      body.action ===
      "void_payment"
    ) {
      const invoice =
        await requireInvoiceForSettlement({
          settlementId:
            settlement.id,

          invoiceId:
            requiredString(
              body.invoiceId,
              "Recovery fee invoice ID",
            ),
        });

      const payment =
        await requirePaymentForInvoice({
          invoiceId:
            invoice.id,

          paymentId:
            requiredString(
              body.paymentId,
              "Recovery fee payment ID",
            ),
        });

      if (
        payment.status !==
        "posted"
      ) {
        return errorResponse(
          "Only a currently posted recovery fee payment may be voided.",
          409,
        );
      }

      await voidRecoveryFeePayment({
        paymentId:
          payment.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Payment void timestamp",
          ),

        reason:
          requiredString(
            body.reason,
            "Payment void reason",
          ),
      });

      return NextResponse.json(
        await recoveryStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Waive remaining fee balance                                            */
    /* ====================================================================== */

    if (
      body.action ===
      "waive_balance"
    ) {
      const invoice =
        await requireInvoiceForSettlement({
          settlementId:
            settlement.id,

          invoiceId:
            requiredString(
              body.invoiceId,
              "Recovery fee invoice ID",
            ),
        });

      if (
        invoice.balanceDueCents <=
        0
      ) {
        return errorResponse(
          "The recovery fee invoice has no remaining balance to waive.",
          409,
        );
      }

      if (
        invoice.status ===
          "waived" ||
        invoice.status ===
          "settled"
      ) {
        return errorResponse(
          "The recovery fee invoice is already terminal.",
          409,
        );
      }

      await waiveRecoveryFeeBalance({
        invoiceId:
          invoice.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Fee waiver timestamp",
          ),

        reason:
          requiredString(
            body.reason,
            "Fee waiver reason",
          ),
      });

      return NextResponse.json(
        await recoveryStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Final recovery reconciliation                                          */
    /* ====================================================================== */

    if (
      body.action ===
      "reconcile"
    ) {
      if (
        settlement.status ===
        "reconciled"
      ) {
        return errorResponse(
          "This recovery settlement is already reconciled.",
          409,
        );
      }

      if (
        settlement.calculatedServiceFeeCents >
        0
      ) {
        const invoice =
          await getRecoveryFeeInvoiceBySettlementId(
            settlement.id,
          );

        if (!invoice) {
          return errorResponse(
            "A DueQuity fee invoice must exist before a fee-bearing recovery may be reconciled.",
            409,
          );
        }

        if (
          invoice.balanceDueCents !==
          0
        ) {
          return errorResponse(
            "The DueQuity service-fee balance must be fully settled or formally waived before final recovery reconciliation.",
            409,
          );
        }

        if (
          invoice.status !==
            "paid" &&
          invoice.status !==
            "waived" &&
          invoice.status !==
            "settled"
        ) {
          return errorResponse(
            "The recovery fee invoice has not reached a settlement state.",
            409,
          );
        }
      }

      await reconcileRecoverySettlement({
        settlementId:
          settlement.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Reconciliation timestamp",
          ),

        summary:
          requiredString(
            body.summary,
            "Reconciliation summary",
          ),
      });

      return NextResponse.json(
        await recoveryStateResponse(
          id,
          session,
        ),
      );
    }

    return errorResponse(
      "Unsupported recovery settlement action.",
      400,
    );
  } catch (
    error
  ) {
    return routeErrorResponse(
      error,
      "Recovery settlement action failed.",
      409,
    );
  }
}