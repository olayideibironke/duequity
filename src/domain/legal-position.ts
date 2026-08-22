/**
 * RESOLVED LEGAL POSITION
 *
 * One function that answers "where does this claim stand legally" for every
 * operational surface.
 *
 * The alternative is allowing each screen to independently assemble the lane,
 * classifier proposal, jurisdiction floor, conflicts and next action. That can
 * cause the claim list and claim detail to disagree about whether a claim
 * requires legal review or independent counsel.
 *
 * Claims without a recorded legalReview remain provisionally classified. The
 * provisional position is derived from the structured jurisdiction rule and
 * the claim's existing risk signals.
 *
 * IMPORTANT
 *
 * An absent human legal review does not automatically mean every claim requires
 * legal review before filing.
 *
 * The structured jurisdiction rule controls the minimum legal-processing lane:
 *
 *   administrative_permitted
 *     Straightforward claims may remain administrative.
 *
 *   legal_review_recommended
 *     Legal review is required before filing.
 *
 *   attorney_mandatory
 *     Independent counsel is required.
 *
 * Claim-specific complexity signals may raise a matter above its jurisdiction
 * floor, but a provisional classification may never lower it below that floor.
 */

import type { Claim, IsoDate, Jurisdiction } from "./types";
import {
  classifyLegalComplexity,
  detectLegalConflicts,
  jurisdictionLegalRule,
  laneFromJurisdictionRule,
  legalFlagFromRiskFlag,
  nextLegalAction,
  type Classification,
  type LegalComplexityFlag,
  type LegalConflict,
  type LegalHandoffStatus,
  type LegalLane,
  type LegalProcessingRule,
  type LegalReviewRecord,
} from "./legal";

export interface LegalPosition {
  /** The lane the product acts on. */
  lane: LegalLane;

  /** True when no human legal review record exists yet. */
  unclassified: boolean;

  rationale: string;

  handoffStatus: LegalHandoffStatus;

  flags: LegalComplexityFlag[];

  openFlags: LegalComplexityFlag[];

  humanDetermined: boolean;

  lastReviewedAt?: IsoDate;

  reviewedBy?: string;

  legalDeadline?: IsoDate;

  legalDeadlineNote?: string;

  operationalOwnerId?: string;

  notes?: string;

  /** What the classifier derives independently of the recorded lane. */
  classification: Classification;

  jurisdictionRule: LegalProcessingRule;

  jurisdictionFloor: LegalLane;

  conflicts: LegalConflict[];

  blockingConflicts: LegalConflict[];

  nextAction?: {
    action: string;
    owner: "operations" | "compliance" | "claimant" | "attorney";
  };

  /** Whether counsel must be involved for this claim to proceed. */
  attorneyRequired: boolean;

  attorneyEngaged: boolean;

  /** Attorney required but nobody referred yet. */
  awaitingReferral: boolean;
}

/* ========================================================================== */
/* Lane ordering                                                               */
/* ========================================================================== */

/**
 * Legal lanes only move upward in complexity.
 *
 * A provisional classifier may raise a claim above the jurisdiction floor, but
 * it may never lower the claim beneath that floor.
 */
const LEGAL_LANE_RANK: Record<LegalLane, number> = {
  administrative: 1,
  legal_review: 2,
  attorney_required: 3,
};

function enforceJurisdictionFloor(
  proposedLane: LegalLane,
  jurisdictionFloor: LegalLane,
): LegalLane {
  return LEGAL_LANE_RANK[proposedLane] >= LEGAL_LANE_RANK[jurisdictionFloor]
    ? proposedLane
    : jurisdictionFloor;
}

/* ========================================================================== */
/* Resolve                                                                     */
/* ========================================================================== */

/**
 * Resolve the legal position of a claim.
 *
 * `today` is passed in rather than read from the clock so server and client
 * renders agree and review staleness stays testable.
 */
export function resolveLegalPosition(
  claim: Claim,
  jurisdiction: Jurisdiction,
  today: IsoDate,
): LegalPosition {
  const rule = jurisdictionLegalRule(jurisdiction);

  const floor = laneFromJurisdictionRule(rule);

  const attorneyEngaged = claim.attorneyAssignment?.status === "engaged";

  const hasAssignment = Boolean(claim.attorneyAssignment);

  /*
   * A recorded legal review remains authoritative.
   *
   * When no review exists, build a provisional position from the structured
   * jurisdiction floor plus the risk signals already recorded on the claim.
   */
  let review: LegalReviewRecord;
  let classification: Classification;

  if (claim.legalReview) {
    review = claim.legalReview;

    classification = classifyLegalComplexity(review.flags, jurisdiction);
  } else {
    const provisional = deriveProvisionalReview(claim, jurisdiction, floor);

    review = provisional.review;

    classification = provisional.classification;
  }

  const conflicts = detectLegalConflicts(
    review,
    jurisdiction,
    hasAssignment,
    attorneyEngaged,
    claim.status,
    today,
  );

  const nextAction = nextLegalAction(
    review,
    jurisdiction,
    hasAssignment,
    attorneyEngaged,
  );

  return {
    lane: review.lane,

    unclassified: !claim.legalReview,

    rationale: review.rationale,

    handoffStatus: review.handoffStatus,

    flags: review.flags,

    openFlags: review.flags.filter((flag) => !flag.resolvedAt),

    humanDetermined: review.humanDetermined,

    lastReviewedAt: review.lastReviewedAt,

    reviewedBy: review.reviewedBy,

    legalDeadline: review.legalDeadline,

    legalDeadlineNote: review.legalDeadlineNote,

    operationalOwnerId: review.operationalOwnerId ?? claim.assignedSpecialistId,

    notes: review.notes,

    classification,

    jurisdictionRule: rule,

    jurisdictionFloor: floor,

    conflicts,

    blockingConflicts: conflicts.filter(
      (conflict) => conflict.severity === "blocking",
    ),

    nextAction,

    attorneyRequired: review.lane === "attorney_required",

    attorneyEngaged,

    awaitingReferral: review.lane === "attorney_required" && !hasAssignment,
  };
}

/* ========================================================================== */
/* Provisional review                                                          */
/* ========================================================================== */

interface ProvisionalReviewResult {
  review: LegalReviewRecord;
  classification: Classification;
}

/**
 * Build a provisional legal position for a claim that has never received a
 * recorded human legal review.
 *
 * The existing claim risk flags feed the same classifier used elsewhere in the
 * product. The resulting lane is then checked against the structured
 * jurisdiction floor.
 */
function deriveProvisionalReview(
  claim: Claim,
  jurisdiction: Jurisdiction,
  floor: LegalLane,
): ProvisionalReviewResult {
  const derived = deriveClaimLegalFlags(claim);

  const classification = classifyLegalComplexity(derived, jurisdiction);

  const lane = enforceJurisdictionFloor(classification.lane, floor);

  const rationale = provisionalRationale({
    derivedFlags: derived,
    lane,
    floor,
  });

  const review: LegalReviewRecord = {
    lane,

    proposedLane: lane,

    rationale,

    flags: derived,

    /*
     * There is no human review record yet. This remains a provisional system
     * classification even when the structured rules permit an administrative
     * lane.
     */
    handoffStatus: "review_pending",

    humanDetermined: false,

    operationalOwnerId: claim.assignedSpecialistId,
  };

  return {
    review,
    classification,
  };
}

/* ========================================================================== */
/* Risk flag translation                                                       */
/* ========================================================================== */

/**
 * Translate the general claim risk flags into legal-complexity signals.
 *
 * Resolved risk flags are ignored because they no longer represent an active
 * reason to elevate legal handling.
 */
function deriveClaimLegalFlags(claim: Claim): LegalComplexityFlag[] {
  const derived: LegalComplexityFlag[] = [];

  for (const risk of claim.flags) {
    if (risk.resolvedAt) {
      continue;
    }

    const kind = legalFlagFromRiskFlag(risk.kind);

    if (!kind) {
      continue;
    }

    if (derived.some((flag) => flag.kind === kind)) {
      continue;
    }

    derived.push({
      kind,

      detail: risk.detail,

      raisedAt: risk.raisedAt,

      raisedBy: risk.raisedBy,
    });
  }

  return derived;
}

/* ========================================================================== */
/* Provisional rationale                                                       */
/* ========================================================================== */

function provisionalRationale({
  derivedFlags,
  lane,
  floor,
}: {
  derivedFlags: LegalComplexityFlag[];

  lane: LegalLane;

  floor: LegalLane;
}): string {
  /*
   * Claim-specific complexity signals take priority in the explanation because
   * they explain why an otherwise straightforward matter has been elevated.
   */
  if (derivedFlags.length > 0) {
    if (lane === "attorney_required") {
      return "No human legal review has been recorded. Existing claim complexity signals place this matter in the attorney-required lane. Independent counsel must handle the legal work before the claim can proceed.";
    }

    return "No human legal review has been recorded. Existing claim complexity signals require legal review before filing. A person must review the flagged issues before the claim proceeds.";
  }

  /*
   * No claim-specific complexity signals exist. The structured jurisdiction
   * floor therefore controls the provisional explanation.
   */
  if (floor === "attorney_required") {
    return "No human legal review has been recorded. The recorded jurisdiction rule requires independent counsel for this claim type. Duequity may coordinate research, documents and operations, but the claimant must engage counsel directly for legal work.";
  }

  if (floor === "legal_review") {
    return "No human legal review has been recorded. The recorded jurisdiction rule requires legal review before filing even though no claim-specific complexity signals are currently present.";
  }

  return "No human legal review has been recorded. No complexity signals are currently present, and the recorded jurisdiction rule permits administrative handling. A separate legal review is not required solely because the claim has no recorded human legal review. Ordinary compliance and filing-readiness controls still apply.";
}

/* ========================================================================== */
/* Aggregates                                                                  */
/* ========================================================================== */

export interface LegalLaneDistribution {
  administrative: number;

  legalReview: number;

  attorneyRequired: number;

  unclassified: number;

  /** Claims requiring counsel with no referral prepared. */
  awaitingReferral: number;

  /** Claims whose recorded position conflicts with the rules or evidence. */
  withConflicts: number;

  blockedByConflict: number;
}

export function laneDistribution(
  positions: LegalPosition[],
): LegalLaneDistribution {
  return {
    administrative: positions.filter(
      (position) => position.lane === "administrative",
    ).length,

    legalReview: positions.filter(
      (position) => position.lane === "legal_review",
    ).length,

    attorneyRequired: positions.filter(
      (position) => position.lane === "attorney_required",
    ).length,

    unclassified: positions.filter((position) => position.unclassified).length,

    awaitingReferral: positions.filter((position) => position.awaitingReferral)
      .length,

    withConflicts: positions.filter((position) => position.conflicts.length > 0)
      .length,

    blockedByConflict: positions.filter(
      (position) => position.blockingConflicts.length > 0,
    ).length,
  };
}
