/**
 * COMPLIANCE ENGINE
 *
 * Section 9 of the product standard: "Do not rely on employees remembering laws.
 * The product must enforce compliance operationally."
 *
 * This module is the single place that answers three questions:
 *
 *   1. May Duequity accept a claimant in this jurisdiction at all?
 *   2. Which fee structures are lawful here, and what is the ceiling?
 *   3. Which disclosures must this claimant receive before signing?
 *
 * Every gate returns a structured decision with a human readable reason, because a
 * refusal that a specialist cannot explain to a claimant is an operational
 * failure. Nothing here draws a legal conclusion about entitlement. It applies
 * recorded rules and defers to human review where the rules run out.
 *
 * These functions are pure and side effect free so the same logic runs on the
 * server for enforcement and on the client for immediate feedback. The server
 * result is the authoritative one. Section 14: authorisation and gating are
 * always enforced server side.
 */

import type {
  Cents,
  Claim,
  FeeModel,
  IsoDate,
  Jurisdiction,
  Opportunity,
  RiskFlag,
} from "./types";
import { resolveLegalPosition } from "./legal-position";
import { daysBetween } from "@/lib/format";

/* ========================================================================== */
/* Decision shape                                                              */
/* ========================================================================== */

export type GateOutcome = "permitted" | "conditional" | "blocked";

export interface GateDecision {
  outcome: GateOutcome;
  /** Short label suitable for a badge or inline status. */
  summary: string;
  /** Full explanation, written so a specialist can read it to a claimant. */
  reason: string;
  /** What a human must do to move from conditional or blocked to permitted. */
  requiredAction?: string;
  /** The statute or rule relied upon, where one is recorded. */
  authority?: string;
}

const permitted = (
  summary: string,
  reason: string,
  authority?: string,
): GateDecision => ({
  outcome: "permitted",
  summary,
  reason,
  authority,
});

const conditional = (
  summary: string,
  reason: string,
  requiredAction: string,
  authority?: string,
): GateDecision => ({
  outcome: "conditional",
  summary,
  reason,
  requiredAction,
  authority,
});

const blocked = (
  summary: string,
  reason: string,
  requiredAction?: string,
  authority?: string,
): GateDecision => ({
  outcome: "blocked",
  summary,
  reason,
  requiredAction,
  authority,
});

/* ========================================================================== */
/* Startup Green Lane context                                                  */
/* ========================================================================== */

/**
 * Launch payment-routing vocabulary.
 *
 * The server-side jurisdiction intelligence layer owns the authoritative
 * jurisdiction package. These matching string unions let this pure domain module
 * evaluate that package without importing a server-only module.
 */
export type LaunchPaymentRoute =
  | "claimant_only"
  | "authorized_representative"
  | "joint_payee"
  | "split_disbursement"
  | "assignee"
  | "unknown";

export type LaunchPaymentTrack =
  | "direct_claimant_recovery"
  | "managed_representative_recovery"
  | "future_acquisition"
  | "blocked";

export type LaunchFeeCollectionMethod =
  | "contractual_post_recovery"
  | "representative_disbursement"
  | "joint_payee_disbursement"
  | "split_disbursement"
  | "assignment_acquisition"
  | "unknown";

export type LaunchYesNoUnknown = "yes" | "no" | "unknown";

/**
 * The minimum payment-route facts required to decide whether a jurisdiction can
 * be used in Duequity's launch model.
 *
 * Launch model:
 *
 * - Direct Claimant Recovery: the agency pays the claimant or lawful estate
 *   representative directly. Duequity's fee is collected under the signed
 *   service agreement after recovery.
 *
 * - Managed Representative Recovery: only where the approved jurisdiction rule
 *   expressly permits representative payment, joint payee, or split
 *   disbursement without requiring Duequity to acquire the claim.
 *
 * - Acquisition Recovery is not enabled for launch.
 */
export interface StartupGreenLaneContext {
  paymentRoute: LaunchPaymentRoute;
  launchTrack: LaunchPaymentTrack;
  representativeMayFile: LaunchYesNoUnknown;
  representativeMayReceivePayment: LaunchYesNoUnknown;
  assignmentRequiredForRepresentativePayment: LaunchYesNoUnknown;
  feeCollectionMethod: LaunchFeeCollectionMethod;
  paymentRouteReady: boolean;

  /**
   * True only when the workflow is attempting to purchase, take an assignment
   * of, or otherwise acquire the claimant's surplus rights.
   *
   * Duequity launch must always pass false or omit this field.
   */
  acquisitionRequested?: boolean;
}

/* ========================================================================== */
/* Gate 1: intake                                                              */
/* ========================================================================== */

/**
 * May Duequity open a claim in this jurisdiction?
 *
 * This is the gate that must never be bypassed by a hidden button. A specialist
 * who tries to convert an opportunity in an uncleared jurisdiction receives a
 * blocked decision with the reason and the escalation path.
 */
export function evaluateIntakeGate(jurisdiction: Jurisdiction): GateDecision {
  const where = jurisdictionLabel(jurisdiction);

  switch (jurisdiction.complianceStatus) {
    case "approved":
      return permitted(
        "Intake permitted",
        `${where} is cleared for administrative claims under recorded rules.`,
        jurisdiction.statuteReference,
      );

    case "attorney_only":
      return conditional(
        "Attorney required",
        `${where} permits surplus claims only through independent licensed counsel. Duequity may coordinate documentation and research, and the claimant engages an attorney directly.`,
        "Refer to an attorney licensed in this state before opening a claim.",
        jurisdiction.statuteReference,
      );

    case "under_legal_review":
      return blocked(
        "Under legal review",
        `${where} is under legal review. Intake is held until the review completes so no claimant is signed under rules that may change.`,
        "Wait for the compliance officer to publish a determination.",
      );

    case "research_required":
      return blocked(
        "Research required",
        `No legal review has been performed for ${where}. Duequity does not accept claimants in a jurisdiction whose rules are unrecorded.`,
        "Request a jurisdiction review from the compliance team.",
      );

    case "restricted":
      return blocked(
        "Restricted",
        `${where} carries a licensing, bonding or fee restriction that Duequity does not currently satisfy.`,
        restrictionAction(jurisdiction),
        jurisdiction.statuteReference,
      );

    case "paused":
      return blocked(
        "Paused",
        `Intake in ${where} has been paused by a compliance officer.`,
        "Contact the compliance officer who applied the pause.",
      );
  }
}

function restrictionAction(j: Jurisdiction): string {
  const missing: string[] = [];
  if (j.finderLicenseRequired) missing.push("a finder or locator license");
  if (j.bondRequired) missing.push("a surety bond");
  if (missing.length === 0)
    return "Review the recorded restriction with the compliance team.";
  return `Obtain ${missing.join(" and ")} for this jurisdiction, or refer the matter to counsel.`;
}

/**
 * Does an otherwise approved jurisdiction fit Duequity's startup Green Lane?
 *
 * This is deliberately stricter than evaluateIntakeGate(). A jurisdiction can
 * be legally reviewed yet still be unsuitable for Duequity's launch business
 * model because payment routing is unresolved, an assignment is required, or
 * the matter belongs in an attorney-required lane.
 *
 * Unknown payment facts fail closed.
 */
export function evaluateStartupGreenLane(
  jurisdiction: Jurisdiction,
  context: StartupGreenLaneContext,
): GateDecision {
  const where = jurisdictionLabel(jurisdiction);
  const intake = evaluateIntakeGate(jurisdiction);

  if (intake.outcome !== "permitted") {
    return blocked(
      "Outside startup Green Lane",
      `${where} is not cleared for Duequity's administrative launch workflow. ${intake.reason}`,
      intake.requiredAction ??
        "Complete jurisdiction compliance review before launch processing.",
      intake.authority,
    );
  }

  if (jurisdiction.attorneyRequired) {
    return blocked(
      "Attorney-required jurisdiction",
      `${where} requires attorney involvement for this claim type. Duequity's startup Green Lane is limited to straightforward administrative recoveries.`,
      "Do not open this matter in the startup Green Lane. Escalate or skip the record.",
      jurisdiction.statuteReference,
    );
  }

  if (
    context.acquisitionRequested ||
    context.paymentRoute === "assignee" ||
    context.launchTrack === "future_acquisition" ||
    context.feeCollectionMethod === "assignment_acquisition"
  ) {
    return blocked(
      "Acquisition disabled for launch",
      "Duequity does not purchase, take assignment of, or acquire surplus-fund rights in the launch model.",
      "Use a non-acquisition recovery route or leave the record outside the launch pipeline.",
      jurisdiction.statuteReference,
    );
  }

  if (
    !context.paymentRouteReady ||
    context.paymentRoute === "unknown" ||
    context.launchTrack === "blocked" ||
    context.feeCollectionMethod === "unknown" ||
    context.representativeMayFile === "unknown" ||
    context.representativeMayReceivePayment === "unknown" ||
    context.assignmentRequiredForRepresentativePayment === "unknown"
  ) {
    return blocked(
      "Payment route unresolved",
      `${where} does not yet have a complete, approved payment-routing determination for Duequity's launch model.`,
      "Complete the jurisdiction payment-route review before claimant intake.",
      jurisdiction.statuteReference,
    );
  }

  if (context.assignmentRequiredForRepresentativePayment === "yes") {
    return blocked(
      "Assignment required",
      `${where} requires assignment for the representative-payment route. Duequity's acquisition pipeline is disabled for launch.`,
      "Use a claimant-payee route if legally available, or skip this jurisdiction for launch.",
      jurisdiction.statuteReference,
    );
  }

  if (context.paymentRoute === "claimant_only") {
    if (
      context.launchTrack !== "direct_claimant_recovery" ||
      context.representativeMayReceivePayment !== "no" ||
      context.feeCollectionMethod !== "contractual_post_recovery"
    ) {
      return blocked(
        "Claimant-payee route inconsistent",
        `${where} is classified as claimant-payee, but the recorded launch track or fee-collection method is inconsistent with Direct Claimant Recovery.`,
        "Correct the jurisdiction payment-routing record before intake.",
        jurisdiction.statuteReference,
      );
    }

    return permitted(
      "Startup Green Lane permitted",
      `${where} supports Direct Claimant Recovery. The agency pays the claimant or lawful estate representative directly, and Duequity's fee is collected under the signed service agreement after recovery.`,
      jurisdiction.statuteReference,
    );
  }

  const managedRoute =
    context.paymentRoute === "authorized_representative" ||
    context.paymentRoute === "joint_payee" ||
    context.paymentRoute === "split_disbursement";

  if (managedRoute) {
    if (
      context.launchTrack !== "managed_representative_recovery" ||
      context.representativeMayReceivePayment !== "yes"
    ) {
      return blocked(
        "Representative route inconsistent",
        `${where} has a representative-payment route, but the approved facts do not support Managed Representative Recovery.`,
        "Correct the jurisdiction payment-routing record before intake.",
        jurisdiction.statuteReference,
      );
    }

    const expectedFeeMethod: LaunchFeeCollectionMethod =
      context.paymentRoute === "authorized_representative"
        ? "representative_disbursement"
        : context.paymentRoute === "joint_payee"
          ? "joint_payee_disbursement"
          : "split_disbursement";

    if (context.feeCollectionMethod !== expectedFeeMethod) {
      return blocked(
        "Fee collection route inconsistent",
        `${where} has a representative-payment route, but the recorded fee-collection method does not match the approved government payment route.`,
        "Correct the payment-routing record before intake.",
        jurisdiction.statuteReference,
      );
    }

    return permitted(
      "Startup Green Lane permitted",
      `${where} supports Managed Representative Recovery without requiring acquisition of the claimant's surplus rights.`,
      jurisdiction.statuteReference,
    );
  }

  return blocked(
    "Unsupported launch route",
    `${where} does not have a payment route that Duequity's launch workflow supports.`,
    "Use Direct Claimant Recovery or an approved non-assignment representative-payee route.",
    jurisdiction.statuteReference,
  );
}

/* ========================================================================== */
/* Gate 2: fee structure                                                       */
/* ========================================================================== */

export interface FeeProposal {
  model: FeeModel;
  /** 0 to 1, for percentage and capped success models. */
  percentage?: number;
  flatAmount?: Cents;
  /** The recovery the fee would be computed against. */
  recoveryAmount?: Cents;
}

export interface FeeValidation extends GateDecision {
  /** The fee that would actually be charged after every cap is applied. */
  effectiveFee?: Cents;
  /** Which ceiling bound the result, when one did. */
  boundBy?: "percentage_cap" | "amount_cap" | "recovery_amount" | "none";
}

/**
 * Validate a proposed fee against the jurisdiction rule.
 *
 * Section 3: no fee structure is hard coded globally. A percentage that is lawful
 * in one state may exceed a statutory ceiling in the next, so the ceiling is read
 * from the jurisdiction record and applied here.
 */
export function validateFee(
  jurisdiction: Jurisdiction,
  proposal: FeeProposal,
): FeeValidation {
  const where = jurisdictionLabel(jurisdiction);

  if (!jurisdiction.permittedFeeModels.includes(proposal.model)) {
    const allowed = jurisdiction.permittedFeeModels.join(", ") || "none";
    return blocked(
      "Fee model not permitted",
      `${where} does not permit this fee model. Permitted models: ${allowed}.`,
      "Select a permitted fee model for this jurisdiction.",
      jurisdiction.statuteReference,
    );
  }

  if (proposal.model === "no_fee") {
    return {
      ...permitted(
        "No fee",
        "This claim is handled at no charge to the claimant.",
        jurisdiction.statuteReference,
      ),
      effectiveFee: 0,
      boundBy: "none",
    };
  }

  /* ---- percentage and capped success ---- */
  if (proposal.model === "percentage" || proposal.model === "capped_success") {
    const pct = proposal.percentage;
    if (pct === undefined) {
      return blocked(
        "Percentage missing",
        "A percentage fee requires a rate.",
        "Enter the proposed percentage.",
      );
    }

    const cap = jurisdiction.feeCapPercent;
    if (cap !== undefined && pct > cap) {
      return blocked(
        "Exceeds statutory cap",
        `The proposed rate of ${asPercent(pct)} exceeds the ${where} ceiling of ${asPercent(cap)}.`,
        `Reduce the rate to ${asPercent(cap)} or below.`,
        jurisdiction.statuteReference,
      );
    }

    if (proposal.recoveryAmount === undefined) {
      return {
        ...permitted(
          "Rate permitted",
          `A rate of ${asPercent(pct)} is within the ${where} ceiling${
            cap !== undefined ? ` of ${asPercent(cap)}` : ""
          }.`,
          jurisdiction.statuteReference,
        ),
        boundBy: "none",
      };
    }

    const rawFee = Math.round(proposal.recoveryAmount * pct);
    const amountCap = jurisdiction.feeCapAmount;
    const bounded =
      amountCap !== undefined ? Math.min(rawFee, amountCap) : rawFee;

    return {
      ...permitted(
        "Fee permitted",
        buildFeeExplanation(
          pct,
          proposal.recoveryAmount,
          rawFee,
          bounded,
          amountCap,
        ),
        jurisdiction.statuteReference,
      ),
      effectiveFee: bounded,
      boundBy: bounded < rawFee ? "amount_cap" : "none",
    };
  }

  /* ---- flat ---- */
  const flat = proposal.flatAmount;
  if (flat === undefined) {
    return blocked(
      "Amount missing",
      "A flat fee requires an amount.",
      "Enter the proposed flat fee.",
    );
  }

  const amountCap = jurisdiction.feeCapAmount;
  if (amountCap !== undefined && flat > amountCap) {
    return blocked(
      "Exceeds statutory cap",
      `The proposed flat fee exceeds the ${where} ceiling of ${dollars(amountCap)}.`,
      `Reduce the fee to ${dollars(amountCap)} or below.`,
      jurisdiction.statuteReference,
    );
  }

  // A fee may never exceed the recovery it is charged against.
  if (proposal.recoveryAmount !== undefined && flat > proposal.recoveryAmount) {
    return blocked(
      "Fee exceeds recovery",
      `A flat fee of ${dollars(flat)} exceeds the recovery of ${dollars(proposal.recoveryAmount)}. Duequity does not charge a fee greater than the amount recovered.`,
      "Reduce the fee below the recovery amount.",
    );
  }

  return {
    ...permitted(
      "Fee permitted",
      `A flat fee of ${dollars(flat)} is within the ${where} ceiling${
        amountCap !== undefined ? ` of ${dollars(amountCap)}` : ""
      }.`,
      jurisdiction.statuteReference,
    ),
    effectiveFee: flat,
    boundBy: "none",
  };
}

function buildFeeExplanation(
  pct: number,
  recovery: Cents,
  rawFee: Cents,
  bounded: Cents,
  amountCap?: Cents,
): string {
  const base = `${asPercent(pct)} of ${dollars(recovery)} is ${dollars(rawFee)}.`;
  if (bounded < rawFee && amountCap !== undefined) {
    return `${base} The statutory ceiling of ${dollars(amountCap)} applies, so the fee is ${dollars(bounded)}.`;
  }
  return base;
}

/**
 * Compute the fee actually chargeable on a settled recovery, with the plain
 * language basis string that is shown to the claimant on the recovery screen.
 *
 * Section 36: the claimant must always be able to see how a figure was derived.
 */
export function computeFee(
  jurisdiction: Jurisdiction,
  proposal: FeeProposal,
  recoveryAmount: Cents,
): { fee: Cents; netToClaimant: Cents; basis: string } {
  const result = validateFee(jurisdiction, { ...proposal, recoveryAmount });

  if (result.outcome === "blocked") {
    // A blocked fee is charged as zero. The operations surface surfaces the
    // blocking reason; the claimant is never billed against an invalid rule.
    return {
      fee: 0,
      netToClaimant: recoveryAmount,
      basis: `No fee charged. ${result.reason}`,
    };
  }

  const fee = result.effectiveFee ?? 0;
  return {
    fee,
    netToClaimant: recoveryAmount - fee,
    basis: result.reason,
  };
}

/* ========================================================================== */
/* Gate 3: required disclosures                                                */
/* ========================================================================== */

export interface Disclosure {
  key: string;
  /** The text the claimant reads. Written plainly, no legal intimidation. */
  text: string;
  /** Whether acknowledgement must be recorded before a signature is accepted. */
  requiresAcknowledgement: boolean;
  /** Where the requirement comes from. */
  source: "duequity_policy" | "jurisdiction_rule" | "federal";
}

/**
 * The disclosures a claimant must receive before signing in this jurisdiction.
 *
 * The first two are Duequity policy on every claim in every state, not a
 * jurisdiction requirement. Section 4: the free claim option is never hidden.
 */
export function requiredDisclosures(jurisdiction: Jurisdiction): Disclosure[] {
  const list: Disclosure[] = [
    {
      key: "not_government",
      text: "Duequity is not a government agency and is not affiliated with any government agency.",
      requiresAcknowledgement: true,
      source: "duequity_policy",
    },
    {
      key: "free_claim_option",
      text: `You may be able to claim these funds directly from ${jurisdiction.agencyName} without using Duequity and without paying a service fee.`,
      requiresAcknowledgement: true,
      source: "duequity_policy",
    },
    {
      key: "no_guarantee",
      text: "Duequity does not guarantee that a claim will be approved or that any amount will be recovered.",
      requiresAcknowledgement: true,
      source: "duequity_policy",
    },
    {
      key: "payment_route",
      text: "Duequity follows the payment route approved for your jurisdiction. Unless that approved rule expressly permits a representative-payee, joint-payee, or split-disbursement route, the responsible agency pays you or your lawful estate representative directly.",
      requiresAcknowledgement: true,
      source: "duequity_policy",
    },
    {
      key: "no_claim_purchase",
      text: "Duequity does not purchase, take assignment of, or acquire your surplus-fund rights as part of its launch recovery service.",
      requiresAcknowledgement: true,
      source: "duequity_policy",
    },
    {
      key: "not_legal_advice",
      text: "Duequity is not a law firm and does not provide legal advice. If your matter requires legal representation, Duequity can refer you to an independent attorney whom you engage directly.",
      requiresAcknowledgement: true,
      source: "duequity_policy",
    },
  ];

  if (jurisdiction.cancellationPeriodDays !== undefined) {
    list.push({
      key: "cancellation_right",
      text: `You may cancel this agreement within ${jurisdiction.cancellationPeriodDays} days of signing at no cost.`,
      requiresAcknowledgement: true,
      source: "jurisdiction_rule",
    });
  }

  if (jurisdiction.attorneyRequired) {
    list.push({
      key: "attorney_required",
      text: `${jurisdictionLabel(jurisdiction)} requires that this type of claim be filed by a licensed attorney. You will engage an attorney directly, and Duequity does not share in attorney fees.`,
      requiresAcknowledgement: true,
      source: "jurisdiction_rule",
    });
  }

  if (jurisdiction.probateRequiredWhenDeceased) {
    list.push({
      key: "probate_notice",
      text: "If the former owner is deceased, this jurisdiction may require an opened estate before a claim can be paid. Duequity will explain what is needed.",
      requiresAcknowledgement: false,
      source: "jurisdiction_rule",
    });
  }

  if (!jurisdiction.assignmentPermitted) {
    list.push({
      key: "no_assignment",
      text: "This jurisdiction does not permit the sale or assignment of a surplus claim. Duequity does not purchase claims.",
      requiresAcknowledgement: false,
      source: "jurisdiction_rule",
    });
  }

  for (const mandated of jurisdiction.mandatoryContractLanguage ?? []) {
    list.push({
      key: `mandated_${hashKey(mandated)}`,
      text: mandated,
      requiresAcknowledgement: true,
      source: "jurisdiction_rule",
    });
  }

  return list;
}

/* ========================================================================== */
/* Deadlines                                                                   */
/* ========================================================================== */

/**
 * Compute the statutory filing deadline from the sale date and jurisdiction rule.
 * Returns undefined where the jurisdiction records no deadline, which is itself a
 * research gap rather than an absence of risk.
 */
export function computeClaimDeadline(
  saleDate: IsoDate,
  jurisdiction: Jurisdiction,
): IsoDate | undefined {
  if (jurisdiction.claimDeadlineDays === undefined) return undefined;
  return addDays(saleDate, jurisdiction.claimDeadlineDays);
}

/** Add whole days to an ISO calendar date without timezone drift. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const shifted = new Date(utc + days * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type DeadlineRisk =
  "expired" | "critical" | "elevated" | "monitor" | "clear" | "unknown";

/**
 * Deadline exposure for a claim or opportunity.
 *
 * `today` is always passed in rather than read from the clock so that server and
 * client renders agree and the logic remains testable.
 */
export function assessDeadline(
  deadline: IsoDate | undefined,
  today: IsoDate,
): { risk: DeadlineRisk; days?: number; label: string } {
  if (!deadline) {
    return {
      risk: "unknown",
      label: "Deadline not recorded",
    };
  }

  const days = daysBetween(today, deadline);
  if (days < 0) return { risk: "expired", days, label: "Deadline passed" };
  if (days <= 14)
    return { risk: "critical", days, label: `${days} days remaining` };
  if (days <= 45)
    return { risk: "elevated", days, label: `${days} days remaining` };
  if (days <= 120)
    return { risk: "monitor", days, label: `${days} days remaining` };
  return { risk: "clear", days, label: `${days} days remaining` };
}

/* ========================================================================== */
/* Surplus arithmetic                                                          */
/* ========================================================================== */

/**
 * Derive the estimated surplus from a sale record.
 *
 * This is arithmetic, not a determination. The result is always labelled as an
 * estimate until the responsible agency confirms a figure in writing, and the
 * component layer enforces that labelling. Section 24.
 */
export function deriveEstimatedSurplus(opportunity: Opportunity): {
  amount: Cents;
  workings: { label: string; amount: Cents; sign: "add" | "subtract" }[];
} {
  const s = opportunity.sale;
  const workings: { label: string; amount: Cents; sign: "add" | "subtract" }[] =
    [
      { label: "Sale proceeds", amount: s.salePrice.amount, sign: "add" },
      {
        label: "Debt satisfied",
        amount: s.debtSatisfied.amount,
        sign: "subtract",
      },
    ];

  if (s.taxesOwed) {
    workings.push({
      label: "Delinquent taxes",
      amount: s.taxesOwed.amount,
      sign: "subtract",
    });
  }
  if (s.saleCosts) {
    workings.push({
      label: "Sale costs and fees",
      amount: s.saleCosts.amount,
      sign: "subtract",
    });
  }
  if (s.juniorLiens) {
    workings.push({
      label: "Recorded junior liens",
      amount: s.juniorLiens.amount,
      sign: "subtract",
    });
  }

  const amount = workings.reduce(
    (total, row) =>
      row.sign === "add" ? total + row.amount : total - row.amount,
    0,
  );

  return { amount: Math.max(0, amount), workings };
}

/* ========================================================================== */
/* Claim readiness                                                             */
/* ========================================================================== */

export interface ReadinessCheck {
  key: string;
  label: string;
  satisfied: boolean;
  /** Whether the claim cannot be filed without this. */
  blocking: boolean;
  detail?: string;
}

/**
 * Can this claim be submitted to the agency?
 *
 * Aggregates the jurisdiction rule, the fee agreement state, the document set and
 * the open blocking flags into one answer with an itemised checklist. The
 * checklist is what a specialist actually needs: not "no", but "no, and here are
 * the four things missing".
 */
export function assessFilingReadiness(
  claim: Claim,
  jurisdiction: Jurisdiction,
  outstandingRequiredDocuments: string[],
  today: IsoDate,
  startupGreenLane?: StartupGreenLaneContext,
): { ready: boolean; checks: ReadinessCheck[] } {
  const checks: ReadinessCheck[] = [];

  const intake = evaluateIntakeGate(jurisdiction);
  checks.push({
    key: "jurisdiction_cleared",
    label: "Jurisdiction cleared for administrative filing",
    satisfied: intake.outcome === "permitted",
    blocking: true,
    detail: intake.outcome === "permitted" ? intake.summary : intake.reason,
  });

  const launchGate = startupGreenLane
    ? evaluateStartupGreenLane(jurisdiction, startupGreenLane)
    : blocked(
        "Launch payment route missing",
        "No approved launch payment-routing context was supplied for this filing decision.",
        "Resolve the jurisdiction through the national payment-routing layer before filing.",
        jurisdiction.statuteReference,
      );

  checks.push({
    key: "startup_green_lane",
    label: "Startup Green Lane cleared",
    satisfied: launchGate.outcome === "permitted",
    blocking: true,
    detail:
      launchGate.outcome === "permitted"
        ? launchGate.reason
        : `${launchGate.reason}${
            launchGate.requiredAction ? ` ${launchGate.requiredAction}` : ""
          }`,
  });

  /*
   * Legal-position semantics are authoritative here.
   *
   * A straightforward claim does NOT require a separate human legal-review
   * record merely because claim.legalReview is absent. The approved
   * jurisdiction's legal-processing floor plus the claim's unresolved risk
   * signals determine the provisional lane.
   *
   * If either the jurisdiction floor or claim-specific complexity raises the
   * matter to legal_review or attorney_required, filing fails closed. A recorded
   * human review remains authoritative whenever one exists.
   */
  const legalPosition = resolveLegalPosition(claim, jurisdiction, today);

  const legalLaneCleared =
    legalPosition.lane === "administrative" &&
    legalPosition.blockingConflicts.length === 0 &&
    !legalPosition.awaitingReferral;

  checks.push({
    key: "administrative_legal_lane",
    label: "Case cleared as straightforward administrative recovery",
    satisfied: legalLaneCleared,
    blocking: true,
    detail: legalLaneCleared
      ? legalPosition.unclassified
        ? "The current approved jurisdiction rule permits administrative handling, no active claim-specific complexity signal raises the matter, and no blocking legal conflict is recorded."
        : legalPosition.humanDetermined
          ? "The recorded human legal review confirms the administrative lane and no blocking legal conflict is open."
          : "The recorded legal position remains administrative and no blocking legal conflict is open."
      : legalPosition.lane !== "administrative"
        ? `This claim is classified ${legalPosition.lane
            .split("_")
            .join(
              " ",
            )}. Duequity's startup Green Lane files straightforward administrative recoveries only. ${legalPosition.rationale}`
        : legalPosition.blockingConflicts.length > 0
          ? `${legalPosition.blockingConflicts.length} blocking legal conflict${
              legalPosition.blockingConflicts.length === 1
                ? " remains"
                : "s remain"
            } unresolved.`
          : legalPosition.awaitingReferral
            ? "Independent counsel is required, but an attorney referral has not yet been prepared."
            : legalPosition.rationale,
  });

  checks.push({
    key: "no_attorney_requirement",
    label: "No attorney required for Duequity filing",
    satisfied: !jurisdiction.attorneyRequired,
    blocking: true,
    detail: jurisdiction.attorneyRequired
      ? "This jurisdiction requires attorney involvement, which is outside Duequity's startup Green Lane."
      : undefined,
  });

  const agreement = claim.feeAgreement;

  const feeSigned = Boolean(agreement?.signedAt);

  checks.push({
    key: "fee_agreement",
    label: "Service agreement signed",
    satisfied: feeSigned,
    blocking: true,
    detail: feeSigned
      ? undefined
      : "The claimant has not signed a service agreement.",
  });

  const agreementActive = Boolean(
    agreement?.signedAt && !agreement.cancelledAt,
  );

  checks.push({
    key: "fee_agreement_active",
    label: "Service agreement active",
    satisfied: agreementActive,
    blocking: true,
    detail: !agreement?.signedAt
      ? "No signed service agreement is recorded."
      : agreement.cancelledAt
        ? `The service agreement was cancelled on ${agreement.cancelledAt}.`
        : undefined,
  });

  const agreementJurisdictionMatches = Boolean(
    agreement &&
    agreement.jurisdictionId === claim.jurisdictionId &&
    agreement.jurisdictionId === jurisdiction.id,
  );

  checks.push({
    key: "agreement_jurisdiction",
    label: "Agreement matches current jurisdiction rule",
    satisfied: agreementJurisdictionMatches,
    blocking: true,
    detail: agreementJurisdictionMatches
      ? undefined
      : "The signed agreement is not tied to the same jurisdiction rule as this claim.",
  });

  const executedAgreementRetained = Boolean(agreement?.documentId);

  checks.push({
    key: "executed_agreement_document",
    label: "Executed agreement retained",
    satisfied: executedAgreementRetained,
    blocking: true,
    detail: executedAgreementRetained
      ? undefined
      : "The signed agreement document is not linked to the claim record.",
  });

  if (agreement?.signedAt && !agreement.freeClaimOptionDisclosedAt) {
    checks.push({
      key: "free_claim_disclosed",
      label: "Free claim option disclosed",
      satisfied: false,
      blocking: true,
      detail:
        "There is no record that the claimant was told they may claim directly at no cost.",
    });
  } else {
    checks.push({
      key: "free_claim_disclosed",
      label: "Free claim option disclosed",
      satisfied: Boolean(agreement?.freeClaimOptionDisclosedAt),
      blocking: true,
      detail: agreement?.freeClaimOptionDisclosedAt
        ? undefined
        : "The free direct-claim option has not been recorded as disclosed.",
    });
  }

  const requiredAcknowledgements = requiredDisclosures(jurisdiction)
    .filter((disclosure) => disclosure.requiresAcknowledgement)
    .map((disclosure) => disclosure.key);

  const acknowledged = new Set(agreement?.disclosuresAcknowledged ?? []);

  const missingAcknowledgements = requiredAcknowledgements.filter(
    (key) => !acknowledged.has(key),
  );

  checks.push({
    key: "required_disclosures",
    label: "Required disclosures acknowledged",
    satisfied: Boolean(agreement) && missingAcknowledgements.length === 0,
    blocking: true,
    detail: !agreement
      ? "No agreement exists from which disclosure acknowledgements can be verified."
      : missingAcknowledgements.length > 0
        ? `Missing acknowledgement for: ${missingAcknowledgements.join(", ")}.`
        : undefined,
  });

  const pricingSnapshotComplete = Boolean(
    agreement?.commercialFeeQuoteId &&
    agreement.commercialPolicyId &&
    agreement.commercialPolicyVersion !== undefined &&
    agreement.legalRuleVersionSnapshot !== undefined,
  );

  checks.push({
    key: "pricing_snapshot",
    label: "Commercial and legal pricing snapshots retained",
    satisfied: pricingSnapshotComplete,
    blocking: true,
    detail: pricingSnapshotComplete
      ? undefined
      : "The agreement is missing the approved commercial quote, policy version, or legal rule version snapshot.",
  });

  const legalRuleVersionMatches = Boolean(
    agreement &&
    jurisdiction.legalRuleVersion !== undefined &&
    agreement.legalRuleVersionSnapshot === jurisdiction.legalRuleVersion,
  );

  checks.push({
    key: "legal_rule_snapshot",
    label: "Agreement uses the current approved legal rule",
    satisfied: legalRuleVersionMatches,
    blocking: true,
    detail: legalRuleVersionMatches
      ? undefined
      : jurisdiction.legalRuleVersion === undefined
        ? "The jurisdiction does not have a production legal-rule version."
        : "The agreement legal-rule snapshot does not match the current approved jurisdiction rule.",
  });

  const legalCapsMatch = Boolean(
    agreement &&
    agreement.legalFeeCapPercentSnapshot === jurisdiction.feeCapPercent &&
    agreement.legalFeeCapAmountSnapshot === jurisdiction.feeCapAmount,
  );

  checks.push({
    key: "legal_fee_caps_snapshot",
    label: "Legal fee ceilings unchanged since agreement",
    satisfied: legalCapsMatch,
    blocking: true,
    detail: legalCapsMatch
      ? undefined
      : "The recorded legal fee ceilings differ from the values stored with the signed agreement.",
  });

  const feeValidation = agreement
    ? validateFee(jurisdiction, {
        model: agreement.model,
        percentage: agreement.percentage,
        flatAmount: agreement.flatAmount,
        recoveryAmount:
          claim.confirmedRecovery?.amount ?? claim.estimatedRecovery.amount,
      })
    : blocked(
        "Agreement missing",
        "A fee cannot be validated without a service agreement.",
      );

  checks.push({
    key: "fee_legally_valid",
    label: "Signed fee remains within recorded legal rules",
    satisfied: feeValidation.outcome === "permitted",
    blocking: true,
    detail:
      feeValidation.outcome === "permitted"
        ? feeValidation.reason
        : feeValidation.reason,
  });

  const cancellationWindowRequired =
    (jurisdiction.cancellationPeriodDays ?? 0) > 0;

  const cancellationWindowClosed =
    !cancellationWindowRequired ||
    Boolean(
      agreement?.cancellationDeadline &&
      daysBetween(today, agreement.cancellationDeadline) < 0,
    );

  checks.push({
    key: "cancellation_window",
    label: "Cancellation window cleared before filing",
    satisfied: cancellationWindowClosed,
    blocking: true,
    detail: !cancellationWindowRequired
      ? undefined
      : !agreement?.cancellationDeadline
        ? "This jurisdiction records a cancellation period, but the agreement has no cancellation deadline."
        : cancellationWindowClosed
          ? undefined
          : `The claimant's cancellation window remains open through ${agreement.cancellationDeadline}.`,
  });

  checks.push({
    key: "documents_complete",
    label: "Required documents received",
    satisfied: outstandingRequiredDocuments.length === 0,
    blocking: true,
    detail:
      outstandingRequiredDocuments.length === 0
        ? undefined
        : `${outstandingRequiredDocuments.length} required ${
            outstandingRequiredDocuments.length === 1 ? "document" : "documents"
          } outstanding.`,
  });

  const blockingFlags = claim.flags.filter(
    (f) => f.severity === "blocking" && !f.resolvedAt,
  );
  checks.push({
    key: "no_blocking_flags",
    label: "No blocking review flags",
    satisfied: blockingFlags.length === 0,
    blocking: true,
    detail:
      blockingFlags.length === 0 ? undefined : summariseFlags(blockingFlags),
  });

  const deadline = assessDeadline(claim.filingDeadline, today);
  checks.push({
    key: "within_deadline",
    label: "Within the statutory deadline",
    satisfied: deadline.risk !== "expired",
    blocking: true,
    detail:
      deadline.risk === "unknown"
        ? "Deadline not recorded for this jurisdiction."
        : deadline.label,
  });

  const ready = checks.every((c) => c.satisfied || !c.blocking);
  return { ready, checks };
}

function summariseFlags(flags: RiskFlag[]): string {
  return flags.map((f) => f.detail).join(" ");
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

export function jurisdictionLabel(j: Jurisdiction): string {
  return j.county ? `${j.county} County, ${j.stateName}` : j.stateName;
}

function asPercent(ratio: number): string {
  const pct = ratio * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

function dollars(cents: Cents): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Small stable key for mandated language, so disclosure keys stay deterministic. */
function hashKey(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}
