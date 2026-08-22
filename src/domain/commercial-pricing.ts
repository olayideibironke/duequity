/**
 * DUEQUITY COMMERCIAL PRICING ENGINE
 *
 * Legal compliance and commercial pricing are deliberately separate.
 *
 * Jurisdiction rules answer:
 *   - May Duequity operate here?
 *   - Which fee models are permitted?
 *   - What legal percentage or dollar ceilings apply?
 *
 * Commercial fee policies answer:
 *   - What does Duequity choose to charge?
 *   - Which recovery tier applies?
 *   - What may ordinary staff quote?
 *   - When is manager review required?
 *   - Is the opportunity commercially viable?
 *
 * This module never decides entitlement and never interprets law. It applies
 * only the jurisdiction rules that have already been recorded and approved.
 *
 * PROVENANCE RULE
 *
 * Every production quote snapshots the exact approved jurisdiction legal-rule
 * version used during pricing. A later jurisdiction-rule revision must never
 * silently rewrite the legal basis of an existing quote or signed agreement.
 */

import type {
  Cents,
  CommercialFeePolicy,
  CommercialFeeQuote,
  CommercialFeeTier,
  FeeModel,
  IsoDate,
  IsoInstant,
  Jurisdiction,
  Opportunity,
  SaleType,
  SurplusCustodian,
} from "./types";

/* ========================================================================== */
/* Public result types                                                         */
/* ========================================================================== */

export type CommercialPricingGateOutcome =
  "allowed" | "manager_review" | "blocked";

export type CommercialApprovalLevel = "staff" | "manager" | "none";

export interface CommercialPolicyValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CommercialPricingGate {
  outcome: CommercialPricingGateOutcome;
  reason: string;
  requiredApproval: CommercialApprovalLevel;
}

export interface CommercialQuoteCalculation {
  quote?: CommercialFeeQuote;
  gate: CommercialPricingGate;
  policyValidation: CommercialPolicyValidation;
  legalMaximumFee: Cents;
  commercialMaximumFee: Cents;
  tier?: CommercialFeeTier;
}

export interface CommercialQuoteInput {
  opportunity: Opportunity;
  jurisdiction: Jurisdiction;
  policy: CommercialFeePolicy;

  /**
   * Exact quote identifier supplied by the persistence layer.
   */
  quoteId: string;

  /**
   * Staff user requesting the calculation.
   */
  createdByUserId: string;

  /**
   * Exact creation instant supplied by the caller.
   */
  createdAt: IsoInstant;

  /**
   * Calendar date used for policy-effective-date evaluation.
   */
  asOfDate: IsoDate;

  /**
   * Optional staff-selected percentage. When absent, the tier default is used.
   */
  requestedPercentage?: number;

  /**
   * Optional staff-selected flat fee. When absent, the tier default is used.
   */
  requestedFlatAmount?: Cents;
}

/* ========================================================================== */
/* Numeric helpers                                                             */
/* ========================================================================== */

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isValidPercentage(value: number): boolean {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isValidCents(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function percentageOf(amount: Cents, percentage: number): Cents {
  return Math.round(amount * percentage);
}

function minimumDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter(
    (value): value is number => value !== undefined,
  );

  if (defined.length === 0) {
    return undefined;
  }

  return Math.min(...defined);
}

function maximumDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter(
    (value): value is number => value !== undefined,
  );

  if (defined.length === 0) {
    return undefined;
  }

  return Math.max(...defined);
}

/* ========================================================================== */
/* Policy scope                                                                */
/* ========================================================================== */

function dateIsBefore(left: IsoDate, right: IsoDate): boolean {
  return left < right;
}

function dateIsAfter(left: IsoDate, right: IsoDate): boolean {
  return left > right;
}

function policyIsEffective(
  policy: CommercialFeePolicy,
  asOfDate: IsoDate,
): boolean {
  if (dateIsBefore(asOfDate, policy.effectiveFrom)) {
    return false;
  }

  if (
    policy.effectiveThrough &&
    dateIsAfter(asOfDate, policy.effectiveThrough)
  ) {
    return false;
  }

  return true;
}

function policyCoversSaleType(
  policy: CommercialFeePolicy,
  saleType: SaleType,
): boolean {
  if (!policy.saleTypes || policy.saleTypes.length === 0) {
    return true;
  }

  return policy.saleTypes.includes(saleType);
}

function policyCoversCustodian(
  policy: CommercialFeePolicy,
  custodian: SurplusCustodian,
): boolean {
  if (!policy.custodians || policy.custodians.length === 0) {
    return true;
  }

  return policy.custodians.includes(custodian);
}

/* ========================================================================== */
/* Tier selection                                                              */
/* ========================================================================== */

export function selectCommercialFeeTier(
  policy: CommercialFeePolicy,
  recoveryAmount: Cents,
): CommercialFeeTier | undefined {
  return policy.tiers.find((tier) => {
    if (!tier.active) {
      return false;
    }

    if (recoveryAmount < tier.minimumRecovery) {
      return false;
    }

    if (
      tier.maximumRecovery !== undefined &&
      recoveryAmount > tier.maximumRecovery
    ) {
      return false;
    }

    return true;
  });
}

/* ========================================================================== */
/* Legal ceiling                                                               */
/* ========================================================================== */

/**
 * Calculates the maximum fee permitted by the recorded jurisdiction rule for
 * the recovery amount.
 *
 * If both a percentage ceiling and an amount ceiling exist, the lower result
 * governs.
 *
 * If neither exists, the recovery amount itself is returned as the mathematical
 * upper bound. The commercial policy still controls the actual Duequity price.
 */
export function calculateLegalMaximumFee(
  jurisdiction: Jurisdiction,
  recoveryAmount: Cents,
): Cents {
  const limits: Cents[] = [];

  if (jurisdiction.feeCapPercent !== undefined) {
    limits.push(percentageOf(recoveryAmount, jurisdiction.feeCapPercent));
  }

  if (jurisdiction.feeCapAmount !== undefined) {
    limits.push(jurisdiction.feeCapAmount);
  }

  if (limits.length === 0) {
    return recoveryAmount;
  }

  return Math.min(...limits);
}

/* ========================================================================== */
/* Commercial ceiling                                                          */
/* ========================================================================== */

function tierMaximumPercentage(tier: CommercialFeeTier): number | undefined {
  return maximumDefined([
    tier.staffCeilingPercentage,
    tier.managerExceptionCeilingPercentage,
    tier.defaultPercentage,
  ]);
}

function tierMaximumFlatAmount(tier: CommercialFeeTier): Cents | undefined {
  return maximumDefined([
    tier.staffCeilingAmount,
    tier.managerExceptionCeilingAmount,
    tier.defaultFlatAmount,
  ]);
}

export function calculateCommercialMaximumFee(
  tier: CommercialFeeTier,
  recoveryAmount: Cents,
  legalMaximumFee: Cents,
): Cents {
  const limits: Cents[] = [legalMaximumFee];

  const maximumPercentage = tierMaximumPercentage(tier);

  if (maximumPercentage !== undefined) {
    limits.push(percentageOf(recoveryAmount, maximumPercentage));
  }

  const maximumFlatAmount = tierMaximumFlatAmount(tier);

  if (maximumFlatAmount !== undefined) {
    limits.push(maximumFlatAmount);
  }

  if (tier.internalFeeCapAmount !== undefined) {
    limits.push(tier.internalFeeCapAmount);
  }

  return Math.min(...limits);
}

/* ========================================================================== */
/* Policy validation                                                           */
/* ========================================================================== */

function validateTierPercentages(
  tier: CommercialFeeTier,
  jurisdiction: Jurisdiction,
  errors: string[],
): void {
  const percentageFields: Array<{
    label: string;
    value: number | undefined;
  }> = [
    {
      label: "default percentage",
      value: tier.defaultPercentage,
    },
    {
      label: "staff floor percentage",
      value: tier.staffFloorPercentage,
    },
    {
      label: "staff ceiling percentage",
      value: tier.staffCeilingPercentage,
    },
    {
      label: "manager exception ceiling percentage",
      value: tier.managerExceptionCeilingPercentage,
    },
  ];

  for (const field of percentageFields) {
    if (field.value !== undefined && !isValidPercentage(field.value)) {
      errors.push(`${tier.label}: ${field.label} must be between 0% and 100%.`);
    }

    if (
      field.value !== undefined &&
      jurisdiction.feeCapPercent !== undefined &&
      field.value > jurisdiction.feeCapPercent
    ) {
      errors.push(
        `${tier.label}: ${field.label} exceeds the recorded jurisdiction percentage ceiling.`,
      );
    }
  }

  if (
    tier.staffFloorPercentage !== undefined &&
    tier.staffCeilingPercentage !== undefined &&
    tier.staffFloorPercentage > tier.staffCeilingPercentage
  ) {
    errors.push(
      `${tier.label}: staff percentage floor exceeds the staff percentage ceiling.`,
    );
  }

  if (
    tier.staffCeilingPercentage !== undefined &&
    tier.managerExceptionCeilingPercentage !== undefined &&
    tier.staffCeilingPercentage > tier.managerExceptionCeilingPercentage
  ) {
    errors.push(
      `${tier.label}: staff percentage ceiling exceeds the manager exception ceiling.`,
    );
  }

  if (
    tier.defaultPercentage !== undefined &&
    tier.staffFloorPercentage !== undefined &&
    tier.defaultPercentage < tier.staffFloorPercentage
  ) {
    errors.push(
      `${tier.label}: default percentage is below the ordinary staff floor.`,
    );
  }

  if (
    tier.defaultPercentage !== undefined &&
    tier.staffCeilingPercentage !== undefined &&
    tier.defaultPercentage > tier.staffCeilingPercentage
  ) {
    errors.push(
      `${tier.label}: default percentage exceeds the ordinary staff ceiling.`,
    );
  }
}

function validateTierAmounts(
  tier: CommercialFeeTier,
  jurisdiction: Jurisdiction,
  errors: string[],
): void {
  const amountFields: Array<{
    label: string;
    value: Cents | undefined;
  }> = [
    {
      label: "default flat amount",
      value: tier.defaultFlatAmount,
    },
    {
      label: "staff floor amount",
      value: tier.staffFloorAmount,
    },
    {
      label: "staff ceiling amount",
      value: tier.staffCeilingAmount,
    },
    {
      label: "manager exception ceiling amount",
      value: tier.managerExceptionCeilingAmount,
    },
    {
      label: "minimum viable fee",
      value: tier.minimumViableFee,
    },
    {
      label: "internal fee cap",
      value: tier.internalFeeCapAmount,
    },
  ];

  for (const field of amountFields) {
    if (field.value !== undefined && !isValidCents(field.value)) {
      errors.push(
        `${tier.label}: ${field.label} must be a non-negative integer number of cents.`,
      );
    }
  }

  if (
    tier.staffFloorAmount !== undefined &&
    tier.staffCeilingAmount !== undefined &&
    tier.staffFloorAmount > tier.staffCeilingAmount
  ) {
    errors.push(
      `${tier.label}: staff flat-fee floor exceeds the staff flat-fee ceiling.`,
    );
  }

  if (
    tier.staffCeilingAmount !== undefined &&
    tier.managerExceptionCeilingAmount !== undefined &&
    tier.staffCeilingAmount > tier.managerExceptionCeilingAmount
  ) {
    errors.push(
      `${tier.label}: staff flat-fee ceiling exceeds the manager exception ceiling.`,
    );
  }

  if (
    tier.defaultFlatAmount !== undefined &&
    tier.staffFloorAmount !== undefined &&
    tier.defaultFlatAmount < tier.staffFloorAmount
  ) {
    errors.push(
      `${tier.label}: default flat fee is below the ordinary staff floor.`,
    );
  }

  if (
    tier.defaultFlatAmount !== undefined &&
    tier.staffCeilingAmount !== undefined &&
    tier.defaultFlatAmount > tier.staffCeilingAmount
  ) {
    errors.push(
      `${tier.label}: default flat fee exceeds the ordinary staff ceiling.`,
    );
  }

  if (
    tier.internalFeeCapAmount !== undefined &&
    jurisdiction.feeCapAmount !== undefined &&
    tier.internalFeeCapAmount > jurisdiction.feeCapAmount
  ) {
    errors.push(
      `${tier.label}: internal fee cap exceeds the recorded jurisdiction amount ceiling.`,
    );
  }
}

function validateTierModel(
  tier: CommercialFeeTier,
  jurisdiction: Jurisdiction,
  errors: string[],
): void {
  if (!jurisdiction.permittedFeeModels.includes(tier.model)) {
    errors.push(
      `${tier.label}: ${tier.model} is not a permitted fee model in this jurisdiction.`,
    );
  }

  if (
    (tier.model === "percentage" || tier.model === "capped_success") &&
    tier.defaultPercentage === undefined
  ) {
    errors.push(`${tier.label}: ${tier.model} requires a default percentage.`);
  }

  if (tier.model === "flat" && tier.defaultFlatAmount === undefined) {
    errors.push(`${tier.label}: flat pricing requires a default flat amount.`);
  }

  if (
    tier.model === "no_fee" &&
    (tier.defaultPercentage !== undefined ||
      tier.defaultFlatAmount !== undefined)
  ) {
    errors.push(
      `${tier.label}: a no-fee tier cannot define a percentage or flat fee.`,
    );
  }
}

function validateTierRecoveryRange(
  tier: CommercialFeeTier,
  errors: string[],
): void {
  if (!isValidCents(tier.minimumRecovery)) {
    errors.push(
      `${tier.label}: minimum recovery must be a non-negative integer number of cents.`,
    );
  }

  if (
    tier.maximumRecovery !== undefined &&
    !isValidCents(tier.maximumRecovery)
  ) {
    errors.push(
      `${tier.label}: maximum recovery must be a non-negative integer number of cents.`,
    );
  }

  if (
    tier.maximumRecovery !== undefined &&
    tier.minimumRecovery > tier.maximumRecovery
  ) {
    errors.push(`${tier.label}: minimum recovery exceeds maximum recovery.`);
  }
}

function validateTierOverlap(
  tiers: CommercialFeeTier[],
  errors: string[],
): void {
  const active = tiers
    .filter((tier) => tier.active)
    .slice()
    .sort((left, right) => left.minimumRecovery - right.minimumRecovery);

  for (let index = 1; index < active.length; index += 1) {
    const previous = active[index - 1];
    const current = active[index];

    if (
      previous.maximumRecovery === undefined ||
      current.minimumRecovery <= previous.maximumRecovery
    ) {
      errors.push(
        `${previous.label} and ${current.label} have overlapping recovery ranges.`,
      );
    }
  }
}

export function validateCommercialFeePolicy(
  policy: CommercialFeePolicy,
  jurisdiction: Jurisdiction,
  asOfDate: IsoDate,
): CommercialPolicyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (policy.jurisdictionId !== jurisdiction.id) {
    errors.push(
      "The commercial policy does not belong to the supplied jurisdiction.",
    );
  }

  if (policy.status !== "approved") {
    errors.push(
      `Commercial policy status is ${policy.status}. Only approved policies may produce outreach-ready quotes.`,
    );
  }

  if (!policyIsEffective(policy, asOfDate)) {
    errors.push(
      "The commercial policy is not effective on the requested calculation date.",
    );
  }

  if (policy.version < 1 || !Number.isInteger(policy.version)) {
    errors.push("Commercial policy version must be a positive integer.");
  }

  /*
   * Production quote provenance requires a real approved legal-rule version.
   *
   * Legacy/local records may omit the field at the domain type level, but they
   * are intentionally not allowed to produce a new commercial quote until the
   * jurisdiction review has published a versioned legal rule.
   */
  if (
    jurisdiction.legalRuleVersion === undefined ||
    !Number.isInteger(jurisdiction.legalRuleVersion) ||
    jurisdiction.legalRuleVersion < 1
  ) {
    errors.push(
      "Jurisdiction legal rule version is not recorded. Commercial pricing is blocked until a versioned legal rule is published.",
    );
  }

  if (policy.tiers.length === 0) {
    errors.push("Commercial policy contains no recovery tiers.");
  }

  if (
    jurisdiction.complianceStatus !== "approved" &&
    jurisdiction.complianceStatus !== "attorney_only"
  ) {
    errors.push(
      `Jurisdiction compliance status is ${jurisdiction.complianceStatus}. Commercial pricing cannot authorize outreach in a blocked jurisdiction.`,
    );
  }

  for (const tier of policy.tiers) {
    validateTierRecoveryRange(tier, errors);
    validateTierModel(tier, jurisdiction, errors);
    validateTierPercentages(tier, jurisdiction, errors);
    validateTierAmounts(tier, jurisdiction, errors);
  }

  validateTierOverlap(policy.tiers, errors);

  const activeTiers = policy.tiers.filter((tier) => tier.active);

  if (activeTiers.length === 0) {
    errors.push("Commercial policy has no active recovery tiers.");
  }

  if (policy.reviewDueAt && dateIsAfter(asOfDate, policy.reviewDueAt)) {
    warnings.push("Commercial policy review date has passed.");
  }

  if (
    jurisdiction.legalReviewDueAt &&
    dateIsAfter(asOfDate, jurisdiction.legalReviewDueAt)
  ) {
    errors.push(
      "Jurisdiction legal review has expired. Pricing is blocked until compliance renews the legal record.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/* ========================================================================== */
/* Quote calculation                                                           */
/* ========================================================================== */

function resolveRecovery(opportunity: Opportunity): {
  amount: Cents;
  basis: "estimated" | "confirmed";
} {
  if (opportunity.confirmedSurplus) {
    return {
      amount: opportunity.confirmedSurplus.amount,
      basis: "confirmed",
    };
  }

  return {
    amount: opportunity.estimatedSurplus.amount,
    basis: "estimated",
  };
}

function calculateSelectedFee(
  model: FeeModel,
  recoveryAmount: Cents,
  percentage: number | undefined,
  flatAmount: Cents | undefined,
): Cents {
  switch (model) {
    case "percentage":
    case "capped_success": {
      if (percentage === undefined) {
        return 0;
      }

      return percentageOf(recoveryAmount, percentage);
    }

    case "flat": {
      return flatAmount ?? 0;
    }

    case "no_fee": {
      return 0;
    }
  }
}

function applyFeeCaps(
  proposedFee: Cents,
  legalMaximumFee: Cents,
  tier: CommercialFeeTier,
): Cents {
  const caps: Cents[] = [proposedFee, legalMaximumFee];

  if (tier.internalFeeCapAmount !== undefined) {
    caps.push(tier.internalFeeCapAmount);
  }

  return Math.min(...caps);
}

/* ========================================================================== */
/* Approval routing                                                            */
/* ========================================================================== */

function percentageRequiresManager(
  tier: CommercialFeeTier,
  percentage: number,
): boolean {
  if (
    tier.staffFloorPercentage !== undefined &&
    percentage < tier.staffFloorPercentage
  ) {
    return true;
  }

  if (
    tier.staffCeilingPercentage !== undefined &&
    percentage > tier.staffCeilingPercentage
  ) {
    return true;
  }

  return false;
}

function percentageExceedsManagerAuthority(
  tier: CommercialFeeTier,
  percentage: number,
): boolean {
  return (
    tier.managerExceptionCeilingPercentage !== undefined &&
    percentage > tier.managerExceptionCeilingPercentage
  );
}

function flatAmountRequiresManager(
  tier: CommercialFeeTier,
  amount: Cents,
): boolean {
  if (tier.staffFloorAmount !== undefined && amount < tier.staffFloorAmount) {
    return true;
  }

  if (
    tier.staffCeilingAmount !== undefined &&
    amount > tier.staffCeilingAmount
  ) {
    return true;
  }

  return false;
}

function flatAmountExceedsManagerAuthority(
  tier: CommercialFeeTier,
  amount: Cents,
): boolean {
  return (
    tier.managerExceptionCeilingAmount !== undefined &&
    amount > tier.managerExceptionCeilingAmount
  );
}

function buildPricingGate(
  tier: CommercialFeeTier,
  selectedPercentage: number | undefined,
  selectedFlatAmount: Cents | undefined,
  projectedFee: Cents,
  legalMaximumFee: Cents,
): CommercialPricingGate {
  if (projectedFee > legalMaximumFee) {
    return {
      outcome: "blocked",
      requiredApproval: "none",
      reason:
        "The proposed Duequity fee exceeds the recorded jurisdiction ceiling.",
    };
  }

  if (
    tier.internalFeeCapAmount !== undefined &&
    projectedFee > tier.internalFeeCapAmount
  ) {
    return {
      outcome: "blocked",
      requiredApproval: "none",
      reason: "The proposed Duequity fee exceeds Duequity's internal fee cap.",
    };
  }

  if (
    selectedPercentage !== undefined &&
    percentageExceedsManagerAuthority(tier, selectedPercentage)
  ) {
    return {
      outcome: "blocked",
      requiredApproval: "none",
      reason:
        "The proposed percentage exceeds the maximum commercial authority available under this policy.",
    };
  }

  if (
    selectedFlatAmount !== undefined &&
    flatAmountExceedsManagerAuthority(tier, selectedFlatAmount)
  ) {
    return {
      outcome: "blocked",
      requiredApproval: "none",
      reason:
        "The proposed flat fee exceeds the maximum commercial authority available under this policy.",
    };
  }

  if (
    tier.minimumViableFee !== undefined &&
    projectedFee < tier.minimumViableFee
  ) {
    return {
      outcome: "manager_review",
      requiredApproval: "manager",
      reason:
        "Projected Duequity revenue is below the ordinary commercial viability threshold.",
    };
  }

  if (
    selectedPercentage !== undefined &&
    percentageRequiresManager(tier, selectedPercentage)
  ) {
    return {
      outcome: "manager_review",
      requiredApproval: "manager",
      reason:
        "The proposed percentage is outside ordinary staff pricing authority but remains within manager authority.",
    };
  }

  if (
    selectedFlatAmount !== undefined &&
    flatAmountRequiresManager(tier, selectedFlatAmount)
  ) {
    return {
      outcome: "manager_review",
      requiredApproval: "manager",
      reason:
        "The proposed flat fee is outside ordinary staff pricing authority but remains within manager authority.",
    };
  }

  return {
    outcome: "allowed",
    requiredApproval: "staff",
    reason:
      "The proposed fee is within the recorded jurisdiction ceiling and Duequity staff pricing authority.",
  };
}

/* ========================================================================== */
/* Main calculation                                                            */
/* ========================================================================== */

/**
 * Calculates a case-specific Duequity commercial fee quote.
 *
 * This function does not mark a quote approved. Approval remains an explicit
 * staff or manager action so an automated calculator never impersonates a human
 * decision.
 */
export function calculateCommercialFeeQuote(
  input: CommercialQuoteInput,
): CommercialQuoteCalculation {
  const {
    opportunity,
    jurisdiction,
    policy,
    quoteId,
    createdByUserId,
    createdAt,
    asOfDate,
  } = input;

  const policyValidation = validateCommercialFeePolicy(
    policy,
    jurisdiction,
    asOfDate,
  );

  const recovery = resolveRecovery(opportunity);

  const legalMaximumFee = calculateLegalMaximumFee(
    jurisdiction,
    recovery.amount,
  );

  if (!policyValidation.valid) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason:
          policyValidation.errors[0] ?? "Commercial policy validation failed.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee: 0,
    };
  }

  if (opportunity.jurisdictionId !== jurisdiction.id) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason: "The opportunity does not belong to the supplied jurisdiction.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee: 0,
    };
  }

  if (!policyCoversSaleType(policy, opportunity.sale.saleType)) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason: "The approved commercial policy does not cover this sale type.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee: 0,
    };
  }

  if (!policyCoversCustodian(policy, opportunity.custodian)) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason:
          "The approved commercial policy does not cover this surplus custodian.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee: 0,
    };
  }

  const tier = selectCommercialFeeTier(policy, recovery.amount);

  if (!tier) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason:
          "No active Duequity commercial pricing tier covers this recovery amount.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee: 0,
    };
  }

  const commercialMaximumFee = calculateCommercialMaximumFee(
    tier,
    recovery.amount,
    legalMaximumFee,
  );

  const selectedPercentage =
    input.requestedPercentage ?? tier.defaultPercentage;

  const selectedFlatAmount =
    input.requestedFlatAmount ?? tier.defaultFlatAmount;

  if (
    selectedPercentage !== undefined &&
    !isValidPercentage(selectedPercentage)
  ) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason: "The proposed percentage is invalid.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee,
      tier,
    };
  }

  if (selectedFlatAmount !== undefined && !isValidCents(selectedFlatAmount)) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason: "The proposed flat fee is invalid.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee,
      tier,
    };
  }

  if (
    (tier.model === "percentage" || tier.model === "capped_success") &&
    selectedPercentage === undefined
  ) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason: "This pricing model requires a percentage.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee,
      tier,
    };
  }

  if (tier.model === "flat" && selectedFlatAmount === undefined) {
    return {
      gate: {
        outcome: "blocked",
        requiredApproval: "none",
        reason: "This pricing model requires a flat fee.",
      },
      policyValidation,
      legalMaximumFee,
      commercialMaximumFee,
      tier,
    };
  }

  const rawFee = calculateSelectedFee(
    tier.model,
    recovery.amount,
    selectedPercentage,
    selectedFlatAmount,
  );

  const projectedFee = applyFeeCaps(rawFee, legalMaximumFee, tier);

  const gate = buildPricingGate(
    tier,
    selectedPercentage,
    selectedFlatAmount,
    rawFee,
    legalMaximumFee,
  );

  const viabilityStatus =
    tier.minimumViableFee !== undefined && projectedFee < tier.minimumViableFee
      ? "below_minimum_revenue"
      : "viable";

  const quote: CommercialFeeQuote = {
    id: quoteId,

    opportunityId: opportunity.id,
    jurisdictionId: jurisdiction.id,

    commercialPolicyId: policy.id,
    commercialPolicyVersion: policy.version,
    commercialTierId: tier.id,

    recoveryAmount: recovery.amount,
    recoveryBasis: recovery.basis,

    model: tier.model,

    selectedPercentage:
      tier.model === "percentage" || tier.model === "capped_success"
        ? selectedPercentage
        : undefined,

    selectedFlatAmount: tier.model === "flat" ? selectedFlatAmount : undefined,

    projectedFee,

    projectedClaimantNet: Math.max(0, recovery.amount - projectedFee),

    /*
     * Historical legal provenance.
     *
     * validateCommercialFeePolicy() has already guaranteed this is a positive
     * integer before quote construction.
     */
    legalRuleVersionSnapshot: jurisdiction.legalRuleVersion,

    legalFeeCapPercentSnapshot: jurisdiction.feeCapPercent,

    legalFeeCapAmountSnapshot: jurisdiction.feeCapAmount,

    commercialStaffFloorPercentSnapshot: tier.staffFloorPercentage,

    commercialStaffCeilingPercentSnapshot: tier.staffCeilingPercentage,

    commercialManagerCeilingPercentSnapshot:
      tier.managerExceptionCeilingPercentage,

    commercialStaffFloorAmountSnapshot: tier.staffFloorAmount,

    commercialStaffCeilingAmountSnapshot: tier.staffCeilingAmount,

    commercialManagerCeilingAmountSnapshot: tier.managerExceptionCeilingAmount,

    internalFeeCapAmountSnapshot: tier.internalFeeCapAmount,

    minimumViableFeeSnapshot: tier.minimumViableFee,

    viabilityStatus,

    approvalStatus:
      gate.outcome === "manager_review" ? "manager_review" : "draft",

    approvalReason: gate.outcome === "manager_review" ? gate.reason : undefined,

    createdByUserId,
    createdAt,
  };

  return {
    quote,
    gate,
    policyValidation,
    legalMaximumFee,
    commercialMaximumFee,
    tier,
  };
}

/* ========================================================================== */
/* Outreach gate                                                               */
/* ========================================================================== */

/**
 * Commercial approval alone does not authorize outreach.
 *
 * The caller must also check jurisdiction compliance, contact rules and any
 * case-specific blocking flags. This helper answers only whether commercial
 * pricing itself is ready.
 */
export function commercialQuoteAllowsOutreach(
  quote: CommercialFeeQuote,
): boolean {
  if (quote.viabilityStatus !== "viable") {
    return false;
  }

  return (
    quote.approvalStatus === "staff_approved" ||
    quote.approvalStatus === "manager_approved"
  );
}

/* ========================================================================== */
/* Agreement lock                                                              */
/* ========================================================================== */

/**
 * Returns a locked copy of a commercial quote after a service agreement is
 * signed.
 *
 * Persistence and audit logging are performed by the caller.
 */
export function lockCommercialQuote(
  quote: CommercialFeeQuote,
  feeAgreementId: string,
  lockedAt: IsoInstant,
): CommercialFeeQuote {
  if (
    quote.approvalStatus !== "staff_approved" &&
    quote.approvalStatus !== "manager_approved"
  ) {
    throw new Error(
      "Only an approved commercial fee quote may be locked to an agreement.",
    );
  }

  return {
    ...quote,
    approvalStatus: "locked",
    lockedAt,
    lockedFeeAgreementId: feeAgreementId,
  };
}

/* ========================================================================== */
/* Internal diagnostic helpers                                                 */
/* ========================================================================== */

/**
 * Returns the ordinary staff percentage range for UI presentation.
 */
export function staffPercentageRange(tier: CommercialFeeTier): {
  minimum?: number;
  maximum?: number;
} {
  return {
    minimum: tier.staffFloorPercentage,
    maximum: tier.staffCeilingPercentage,
  };
}

/**
 * Returns the absolute percentage available under commercial policy.
 */
export function managerPercentageCeiling(
  tier: CommercialFeeTier,
): number | undefined {
  return minimumDefined([
    tier.managerExceptionCeilingPercentage,
    tier.staffCeilingPercentage,
  ]);
}
