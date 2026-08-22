import { NextRequest, NextResponse } from "next/server";

import {
  calculateCommercialFeeQuote,
  type CommercialQuoteCalculation,
} from "@/domain/commercial-pricing";
import type {
  Cents,
  CommercialFeePolicy,
  CommercialFeeQuote,
  IsoDate,
  IsoInstant,
  Jurisdiction,
  Opportunity,
} from "@/domain/types";
import {
  approveCommercialQuote,
  getCommercialApprovalByQuoteId,
  saveCommercialQuote,
  verifyCommercialQuoteSnapshot,
} from "@/server/commercial-approval-store";
import { listCommercialFeePolicies } from "@/server/commercial-fee-policy-store";
import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";
import { getOpportunityById } from "@/server/opportunity-store";
import { resolveStaffSession } from "@/server/staff-session";
import { STAFF_AUTHENTICATION_REQUIRED_MESSAGE } from "@/lib/session";

interface ApprovalRequestBody {
  action: "approve_staff" | "request_manager_review" | "approve_manager";

  reason?: string;

  requestedPercentage?: number;
  requestedFlatAmount?: Cents;
}

interface PricingSuccess {
  ok: true;

  opportunity: Opportunity;
  jurisdiction: Jurisdiction;
  policy: CommercialFeePolicy;

  calculation: CommercialQuoteCalculation;
  quote: CommercialFeeQuote;
}

interface PricingFailure {
  ok: false;
  error: string;
  status: number;
}

type PricingResult = PricingSuccess | PricingFailure;

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function currentIsoInstant(): IsoInstant {
  return new Date().toISOString() as IsoInstant;
}

function quoteIdForOpportunity(
  opportunityId: string,
  policyVersion: number,
): string {
  return `fee-quote-${opportunityId}-v${policyVersion}`;
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
    },
  );
}

function validRequestedPercentage(value: number | undefined): boolean {
  return (
    value === undefined || (Number.isFinite(value) && value >= 0 && value <= 1)
  );
}

function validRequestedFlatAmount(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

function policyEffectiveOn(
  policy: CommercialFeePolicy,
  asOfDate: IsoDate,
): boolean {
  if (asOfDate < policy.effectiveFrom) {
    return false;
  }

  if (policy.effectiveThrough && asOfDate > policy.effectiveThrough) {
    return false;
  }

  return true;
}

function policyCoversOpportunity(
  policy: CommercialFeePolicy,
  opportunity: Opportunity,
): boolean {
  const saleTypeCovered =
    !policy.saleTypes ||
    policy.saleTypes.length === 0 ||
    policy.saleTypes.includes(opportunity.sale.saleType);

  const custodianCovered =
    !policy.custodians ||
    policy.custodians.length === 0 ||
    policy.custodians.includes(opportunity.custodian);

  return saleTypeCovered && custodianCovered;
}

function selectCommercialPolicy(
  policies: CommercialFeePolicy[],
  opportunity: Opportunity,
  asOfDate: IsoDate,
): CommercialFeePolicy | undefined {
  return policies
    .filter(
      (policy) =>
        policy.status === "approved" &&
        policy.jurisdictionId === opportunity.jurisdictionId &&
        policyEffectiveOn(policy, asOfDate) &&
        policyCoversOpportunity(policy, opportunity),
    )
    .slice()
    .sort((left, right) => right.version - left.version)[0];
}

/* ========================================================================== */
/* Server-side pricing                                                         */
/* ========================================================================== */

async function calculateOpportunityPricing(
  opportunityId: string,
  createdByUserId: string,
  options?: {
    requestedPercentage?: number;
    requestedFlatAmount?: Cents;
  },
): Promise<PricingResult> {
  const opportunity = await getOpportunityById(opportunityId);

  if (!opportunity) {
    return {
      ok: false,
      error: "Opportunity not found.",
      status: 404,
    };
  }

  const [rulePackages, policies] = await Promise.all([
    listJurisdictionRulePackages(),
    listCommercialFeePolicies(),
  ]);

  const jurisdictionPackage = rulePackages.find(
    (rulePackage) =>
      rulePackage.status === "approved" &&
      rulePackage.rule?.id === opportunity.jurisdictionId,
  );

  const jurisdiction = jurisdictionPackage?.rule;

  if (!jurisdiction) {
    return {
      ok: false,
      error: "No approved jurisdiction rule is published for this opportunity.",
      status: 409,
    };
  }

  const asOfDate = currentIsoDate();

  const policy = selectCommercialPolicy(policies, opportunity, asOfDate);

  if (!policy) {
    return {
      ok: false,
      error:
        "No current approved commercial fee policy applies to this opportunity.",
      status: 409,
    };
  }

  const calculation = calculateCommercialFeeQuote({
    opportunity,
    jurisdiction,
    policy,

    quoteId: quoteIdForOpportunity(opportunity.id, policy.version),

    createdByUserId,

    createdAt: currentIsoInstant(),

    asOfDate,

    requestedPercentage: options?.requestedPercentage,

    requestedFlatAmount: options?.requestedFlatAmount,
  });

  const quote = calculation.quote;

  if (!quote) {
    return {
      ok: false,
      error:
        calculation.gate.reason ||
        "Commercial pricing did not produce a quote.",
      status: 409,
    };
  }

  if (calculation.gate.outcome === "blocked") {
    return {
      ok: false,
      error: calculation.gate.reason,
      status: 409,
    };
  }

  return {
    ok: true,
    opportunity,
    jurisdiction,
    policy,
    calculation,
    quote,
  };
}

/* ========================================================================== */
/* Persisted quote consistency                                                 */
/* ========================================================================== */

function persistedQuoteStillMatches(
  stored: Awaited<ReturnType<typeof getCommercialApprovalByQuoteId>>,
  result: PricingSuccess,
): string | undefined {
  if (!stored) {
    return undefined;
  }

  if (stored.opportunityId !== result.opportunity.id) {
    return "The persisted commercial quote belongs to a different opportunity.";
  }

  if (stored.jurisdictionId !== result.jurisdiction.id) {
    return "The persisted commercial quote belongs to a different jurisdiction.";
  }

  if (
    stored.commercialPolicyId !== result.policy.id ||
    stored.commercialPolicyVersion !== result.policy.version
  ) {
    return "The commercial policy changed after this pricing record was created. Recalculate before approval.";
  }

  if (stored.quoteSnapshot.recoveryAmount !== result.quote.recoveryAmount) {
    return "The recovery amount changed after this pricing record was created. Recalculate before approval.";
  }

  return undefined;
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      opportunityId: string;
    }>;
  },
) {
  const { opportunityId } = await context.params;

  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  const result = await calculateOpportunityPricing(
    opportunityId,
    session.user.id,
  );

  if (!result.ok) {
    return errorResponse(result.error, result.status);
  }

  const persistedApproval = await getCommercialApprovalByQuoteId(
    result.quote.id,
  );

  const persistedMismatch = persistedQuoteStillMatches(
    persistedApproval,
    result,
  );

  const usableApproval = persistedMismatch ? undefined : persistedApproval;

  return NextResponse.json({
    ok: true,

    opportunityId,

    pricing: {
      gate: result.calculation.gate,

      legalMaximumFee: result.calculation.legalMaximumFee,

      commercialMaximumFee: result.calculation.commercialMaximumFee,

      quote: result.quote,

      tier: result.calculation.tier,

      policy: {
        id: result.policy.id,

        version: result.policy.version,

        status: result.policy.status,
      },
    },

    approval: usableApproval ?? null,

    approvalWarning: persistedMismatch ?? null,
  });
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      opportunityId: string;
    }>;
  },
) {
  const { opportunityId } = await context.params;

  let body: ApprovalRequestBody;

  try {
    body = (await request.json()) as ApprovalRequestBody;
  } catch {
    return errorResponse("Invalid JSON request.");
  }

  if (
    body.action !== "approve_staff" &&
    body.action !== "request_manager_review" &&
    body.action !== "approve_manager"
  ) {
    return errorResponse("Unsupported approval action.");
  }

  if (!validRequestedPercentage(body.requestedPercentage)) {
    return errorResponse(
      "Requested percentage must be a number between 0 and 1.",
    );
  }

  if (!validRequestedFlatAmount(body.requestedFlatAmount)) {
    return errorResponse(
      "Requested flat amount must be a non-negative integer number of cents.",
    );
  }

  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  const actorUserId = session.user.id;

  const occurredAt = currentIsoInstant();

  /* ======================================================================== */
  /* Manager exception request                                                 */
  /* ======================================================================== */

  if (body.action === "request_manager_review") {
    if (
      body.requestedPercentage === undefined &&
      body.requestedFlatAmount === undefined
    ) {
      return errorResponse(
        "A manager-review request must include a requested percentage or flat fee.",
      );
    }

    const exceptionResult = await calculateOpportunityPricing(
      opportunityId,
      actorUserId,
      {
        requestedPercentage: body.requestedPercentage,

        requestedFlatAmount: body.requestedFlatAmount,
      },
    );

    if (!exceptionResult.ok) {
      return errorResponse(exceptionResult.error, exceptionResult.status);
    }

    if (exceptionResult.calculation.gate.outcome !== "manager_review") {
      if (exceptionResult.calculation.gate.outcome === "allowed") {
        return errorResponse(
          "The requested pricing is within ordinary staff authority and does not require manager review.",
          409,
        );
      }

      return errorResponse(exceptionResult.calculation.gate.reason, 409);
    }

    try {
      const stored = await saveCommercialQuote({
        quote: exceptionResult.quote,

        actorUserId,

        occurredAt,
      });

      return NextResponse.json({
        ok: true,

        approval: stored,

        managerReviewRequested: true,

        pricing: {
          gate: exceptionResult.calculation.gate,

          quote: exceptionResult.quote,
        },
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error
          ? error.message
          : "Manager review request failed.",
        409,
      );
    }
  }

  /* ======================================================================== */
  /* Standard pricing context                                                  */
  /* ======================================================================== */

  const result = await calculateOpportunityPricing(opportunityId, actorUserId);

  if (!result.ok) {
    return errorResponse(result.error, result.status);
  }

  let stored = await getCommercialApprovalByQuoteId(result.quote.id);

  const mismatch = persistedQuoteStillMatches(stored, result);

  if (mismatch) {
    return errorResponse(mismatch, 409);
  }

  /* ======================================================================== */
  /* Manager approval                                                          */
  /* ======================================================================== */

  if (body.action === "approve_manager") {
    if (!stored) {
      return errorResponse(
        "No manager-review pricing request exists for this opportunity.",
        409,
      );
    }

    if (!verifyCommercialQuoteSnapshot(stored)) {
      return errorResponse(
        "Commercial quote snapshot integrity verification failed. Approval is blocked.",
        409,
      );
    }

    if (
      stored.approvalStatus !== "manager_review" &&
      stored.approvalStatus !== "manager_approved" &&
      stored.approvalStatus !== "locked"
    ) {
      return errorResponse(
        "This pricing record is not awaiting manager approval.",
        409,
      );
    }

    if (
      stored.approvalStatus === "manager_approved" ||
      stored.approvalStatus === "locked"
    ) {
      return NextResponse.json({
        ok: true,
        approval: stored,
        alreadyApproved: true,
      });
    }

    try {
      const approved = await approveCommercialQuote({
        quoteId: stored.quoteId,

        actorUserId,

        approvalLevel: "manager",

        occurredAt,

        reason: body.reason?.trim() || "Manager pricing exception approved.",
      });

      return NextResponse.json({
        ok: true,
        approval: approved,
        alreadyApproved: false,
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error
          ? error.message
          : "Manager pricing approval failed.",
        409,
      );
    }
  }

  /* ======================================================================== */
  /* Staff approval                                                            */
  /* ======================================================================== */

  if (result.calculation.gate.outcome !== "allowed") {
    return errorResponse(
      result.calculation.gate.outcome === "manager_review"
        ? "This quote requires manager approval."
        : result.calculation.gate.reason,
      409,
    );
  }

  if (stored?.approvalStatus === "manager_review") {
    return errorResponse(
      "This pricing record requires manager approval and cannot be approved by staff.",
      409,
    );
  }

  if (
    stored?.approvalStatus === "staff_approved" ||
    stored?.approvalStatus === "manager_approved" ||
    stored?.approvalStatus === "locked"
  ) {
    return NextResponse.json({
      ok: true,
      approval: stored,
      alreadyApproved: true,
    });
  }

  /*
   * A draft or rejected record is refreshed from the current server-side
   * calculation before approval. This prevents stale pricing from surviving a
   * recovery or policy change.
   */
  try {
    stored = await saveCommercialQuote({
      quote: result.quote,

      actorUserId,

      occurredAt,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Commercial pricing could not be saved.",
      409,
    );
  }

  try {
    const approved = await approveCommercialQuote({
      quoteId: stored.quoteId,

      actorUserId,

      approvalLevel: "staff",

      occurredAt,

      reason: body.reason?.trim() || undefined,
    });

    return NextResponse.json({
      ok: true,
      approval: approved,
      alreadyApproved: false,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Commercial pricing approval failed.",
      409,
    );
  }
}