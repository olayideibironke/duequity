/**
 * LEGAL COMPLEXITY MODEL
 *
 * The routing layer between what Duequity may lawfully do itself and what must go to an
 * independent licensed attorney.
 *
 * Duequity is not a law firm. It handles straightforward administrative surplus recovery
 * where that is legally permitted: research, verification, document coordination,
 * submission tracking, agency communication, recovery tracking and claimant support. When
 * a claim crosses into legal representation, legal interpretation, court proceedings or
 * disputed entitlement, it is escalated to independent counsel, and Duequity stays
 * operationally attached to the claim without performing the legal work.
 *
 * Three design rules govern this module:
 *
 * 1. It routes, it does not decide. The classifier proposes a lane from structured flags
 *    and the jurisdiction rule. A human compliance determination always overrides it and
 *    is the authoritative record. Nothing here draws a legal conclusion.
 *
 * 2. It extends rather than duplicates. Legal complexity flags derive from the existing
 *    RiskFlag vocabulary where the concepts already overlap, so a case does not carry two
 *    parallel and potentially contradictory flag sets.
 *
 * 3. It escalates but never de-escalates on its own. The classifier can raise a lane
 *    automatically; only a recorded human review can lower one.
 */

import type {
  ClaimStatus,
  IsoDate,
  Jurisdiction,
  RiskFlagKind,
  Cents,
} from "./types";
import type { Tone } from "./status";

/* ========================================================================== */
/* Lanes                                                                       */
/* ========================================================================== */

/**
 * The three legal lanes.
 *
 * `administrative` is not "simple". It means the work required falls inside what
 * Duequity may lawfully perform without a licensed attorney in this jurisdiction.
 */
export type LegalLane = "administrative" | "legal_review" | "attorney_required";

export interface LegalLaneDescriptor {
  lane: LegalLane;
  /** Internal operations label. */
  label: string;
  tone: Tone;
  /** Claimant facing label. Calm, non alarming, never implying legal services. */
  claimantLabel: string;
  /** Claimant facing explanation. */
  claimantExplanation: string;
  /** Internal meaning, shown in operations tooltips and legends. */
  internalMeaning: string;
}

export const LEGAL_LANE: Record<LegalLane, LegalLaneDescriptor> = {
  administrative: {
    lane: "administrative",
    label: "Administrative",
    tone: "positive",
    claimantLabel: "Administrative processing",
    claimantExplanation:
      "Your claim is being processed through Duequity's administrative recovery workflow.",
    internalMeaning:
      "Eligible for Duequity's administrative recovery workflow. No legal representation currently required and the jurisdiction permits administrative assistance.",
  },
  legal_review: {
    lane: "legal_review",
    label: "Legal review",
    tone: "caution",
    claimantLabel: "Additional review",
    claimantExplanation:
      "Your claim requires additional review because an issue has been identified that may require legal assistance.",
    internalMeaning:
      "A potential legal issue has been detected. Normal processing is held until a compliance determination is recorded. No legal conclusion has been reached.",
  },
  attorney_required: {
    lane: "attorney_required",
    label: "Attorney required",
    tone: "counsel",
    claimantLabel: "Independent legal assistance required",
    claimantExplanation:
      "Your claim requires independent legal representation. Duequity will continue coordinating the recovery process while legal matters are handled by licensed counsel.",
    internalMeaning:
      "Requires independent licensed counsel. Duequity remains operationally attached for research, documents and coordination, and performs no legal work.",
  },
};

/** Ordering used to take the most restrictive of several lane signals. */
const LANE_SEVERITY: Record<LegalLane, number> = {
  administrative: 0,
  legal_review: 1,
  attorney_required: 2,
};

export function mostRestrictiveLane(...lanes: LegalLane[]): LegalLane {
  return lanes.reduce(
    (worst, lane) =>
      LANE_SEVERITY[lane] > LANE_SEVERITY[worst] ? lane : worst,
    "administrative" as LegalLane,
  );
}

/* ========================================================================== */
/* Complexity flags                                                            */
/* ========================================================================== */

/**
 * Structured legal complexity triggers.
 *
 * These are deliberately more specific than the general RiskFlag vocabulary, because the
 * distinctions that matter legally are finer. "Probate required" is administrative work
 * an attorney performs routinely; "probate dispute" is contested litigation. Collapsing
 * them into one flag would lose the only thing that determines the lane.
 */
export type LegalComplexityFlagKind =
  | "probate_required"
  | "probate_dispute"
  | "deceased_owner"
  | "multiple_heirs"
  | "competing_heirs"
  | "competing_claimant"
  | "bankruptcy"
  | "contested_ownership"
  | "lien_dispute"
  | "lien_priority_issue"
  | "trust_issue"
  | "dissolved_entity"
  | "court_petition_required"
  | "litigation"
  | "attorney_required_by_jurisdiction"
  | "unclear_entitlement"
  | "legal_interpretation_required";

/**
 * The lane each trigger proposes on its own.
 *
 * Note that several triggers propose only `legal_review` rather than
 * `attorney_required`. A deceased owner or several heirs is common and frequently
 * resolves administratively; it warrants a look, not an automatic referral. Reserving the
 * red lane for genuine legal work is what keeps the classification useful rather than
 * routing everything to counsel.
 */
export const LEGAL_FLAG_PROPOSES: Record<LegalComplexityFlagKind, LegalLane> = {
  // Conditions warranting a human look before normal processing continues.
  probate_required: "legal_review",
  deceased_owner: "legal_review",
  multiple_heirs: "legal_review",
  trust_issue: "legal_review",
  bankruptcy: "legal_review",
  lien_priority_issue: "legal_review",
  unclear_entitlement: "legal_review",
  dissolved_entity: "legal_review",

  // Conditions that are legal work by definition.
  probate_dispute: "attorney_required",
  competing_heirs: "attorney_required",
  competing_claimant: "attorney_required",
  contested_ownership: "attorney_required",
  lien_dispute: "attorney_required",
  court_petition_required: "attorney_required",
  litigation: "attorney_required",
  attorney_required_by_jurisdiction: "attorney_required",
  legal_interpretation_required: "attorney_required",
};

export const LEGAL_FLAG_LABEL: Record<LegalComplexityFlagKind, string> = {
  probate_required: "Probate required",
  probate_dispute: "Probate dispute",
  deceased_owner: "Deceased owner",
  multiple_heirs: "Multiple heirs",
  competing_heirs: "Competing heirs",
  competing_claimant: "Competing claimant",
  bankruptcy: "Bankruptcy",
  contested_ownership: "Contested ownership",
  lien_dispute: "Lien dispute",
  lien_priority_issue: "Lien priority issue",
  trust_issue: "Trust issue",
  dissolved_entity: "Dissolved entity",
  court_petition_required: "Court petition required",
  litigation: "Litigation",
  attorney_required_by_jurisdiction: "Attorney required by jurisdiction",
  unclear_entitlement: "Unclear entitlement",
  legal_interpretation_required: "Legal interpretation required",
};

/**
 * Plain language explanation of why each trigger matters, written for a specialist who
 * has to explain the position to a claimant without giving legal advice.
 */
export const LEGAL_FLAG_EXPLANATION: Record<LegalComplexityFlagKind, string> = {
  probate_required:
    "An estate must be opened before the agency will disburse to heirs. Opening an estate is legal work performed by an attorney.",
  probate_dispute:
    "The estate itself is contested. Resolving who may act for it requires legal representation.",
  deceased_owner:
    "The owner of record has died, so entitlement passes through an estate rather than directly.",
  multiple_heirs:
    "More than one person may be entitled. Most agencies will not disburse a partial share, so all heirs must be accounted for.",
  competing_heirs:
    "Heirs disagree about entitlement or shares. Duequity does not adjudicate competing claims.",
  competing_claimant:
    "More than one party asserts a right to the same funds. This is a legal dispute, not an administrative question.",
  bankruptcy:
    "A bankruptcy may give a trustee an interest in the surplus. Determining that requires legal analysis.",
  contested_ownership:
    "Title or prior ownership is disputed. Establishing ownership is a legal determination.",
  lien_dispute: "A lienholder's claim against the surplus is contested.",
  lien_priority_issue:
    "The order in which recorded interests are paid is unclear and may change what reaches the former owner.",
  trust_issue:
    "The property was held in trust. Trustee authority and beneficiary rights turn on the trust instrument.",
  dissolved_entity:
    "The owner of record was a company that has been dissolved or forfeited. Reinstatement or a court process is generally required.",
  court_petition_required:
    "The jurisdiction requires a petition to a court to release the funds. Only an attorney may file it.",
  litigation: "The matter is in active litigation.",
  attorney_required_by_jurisdiction:
    "This jurisdiction requires a licensed attorney to file this type of claim, regardless of how straightforward the facts are.",
  unclear_entitlement:
    "Who is entitled, or in what share, cannot be determined from the records available.",
  legal_interpretation_required:
    "Proceeding requires interpreting a statute, an instrument or a court order. Duequity staff do not interpret law for claimants.",
};

export interface LegalComplexityFlag {
  kind: LegalComplexityFlagKind;
  /** Case specific detail, written for the reviewing human. */
  detail: string;
  raisedAt: IsoDate;
  raisedBy: string;
  /** Present once a human has addressed the issue. */
  resolvedAt?: IsoDate;
  resolutionNote?: string;
}

/**
 * Derive legal complexity flags from the general risk flags already on a record.
 *
 * This exists so the two vocabularies cannot drift. A case flagged
 * `competing_claimant` in the risk engine must not be classified administrative by the
 * legal engine because somebody forgot to add a second flag.
 *
 * Only mappings that are unambiguous are included. `missing_documentation` is a real risk
 * flag but is not a legal complexity signal, so it is deliberately absent.
 */
const RISK_TO_LEGAL: Partial<Record<RiskFlagKind, LegalComplexityFlagKind>> = {
  deceased_owner: "deceased_owner",
  probate_required: "probate_required",
  competing_claimant: "competing_claimant",
  bankruptcy: "bankruptcy",
  trust: "trust_issue",
  dissolved_entity: "dissolved_entity",
  court_petition_required: "court_petition_required",
  attorney_required: "attorney_required_by_jurisdiction",
  multiple_owners: "multiple_heirs",
  federal_tax_lien: "lien_priority_issue",
  judgment_lien: "lien_priority_issue",
  child_support_lien: "lien_priority_issue",
};

export function legalFlagFromRiskFlag(
  kind: RiskFlagKind,
): LegalComplexityFlagKind | undefined {
  return RISK_TO_LEGAL[kind];
}

/* ========================================================================== */
/* Jurisdiction legal rule                                                     */
/* ========================================================================== */

/**
 * How a jurisdiction treats administrative assistance.
 *
 * Distinct from ComplianceStatus, which answers "may Duequity operate here at all". This
 * answers "when we operate here, what must an attorney do". A jurisdiction can be fully
 * approved for intake and still require counsel to file.
 */
export type LegalProcessingRule =
  | "administrative_permitted"
  | "legal_review_recommended"
  | "attorney_mandatory"
  | "restricted"
  | "not_yet_approved";

export const LEGAL_PROCESSING_RULE: Record<
  LegalProcessingRule,
  { label: string; tone: Tone; detail: string }
> = {
  administrative_permitted: {
    label: "Administrative permitted",
    tone: "positive",
    detail:
      "Duequity may coordinate a claim administratively. Counsel is required only where the facts of a particular case call for it.",
  },
  legal_review_recommended: {
    label: "Legal review recommended",
    tone: "caution",
    detail:
      "The rules here are unsettled or unusually strict. Every claim receives a legal review before filing, even where the facts look straightforward.",
  },
  attorney_mandatory: {
    label: "Attorney mandatory",
    tone: "counsel",
    detail:
      "A licensed attorney must file this type of claim regardless of the facts. Duequity performs research and document coordination only.",
  },
  restricted: {
    label: "Restricted",
    tone: "critical",
    detail:
      "A licensing, bonding or regulatory barrier prevents Duequity from acting here at all.",
  },
  not_yet_approved: {
    label: "Not yet approved",
    tone: "neutral",
    detail:
      "No legal review has been performed for this jurisdiction. No claim may be processed until one is recorded.",
  },
};

/** The lane a jurisdiction rule imposes as a floor, regardless of case facts. */
export function laneFromJurisdictionRule(rule: LegalProcessingRule): LegalLane {
  switch (rule) {
    case "administrative_permitted":
      return "administrative";
    case "legal_review_recommended":
      return "legal_review";
    case "attorney_mandatory":
      return "attorney_required";
    case "restricted":
    case "not_yet_approved":
      // Not workable at all. Legal review is the correct holding lane: a human must look
      // before anything proceeds, rather than the case appearing routable to counsel.
      return "legal_review";
  }
}

/**
 * Derive the legal processing rule from a jurisdiction record.
 *
 * Jurisdictions may state their rule explicitly. Where they do not, it is inferred from
 * the compliance status and the attorney requirement already recorded, so no jurisdiction
 * silently defaults to permissive.
 */
export function jurisdictionLegalRule(
  jurisdiction: Jurisdiction,
): LegalProcessingRule {
  if (jurisdiction.legalProcessingRule) return jurisdiction.legalProcessingRule;

  switch (jurisdiction.complianceStatus) {
    case "restricted":
      return "restricted";
    case "research_required":
    case "under_legal_review":
    case "paused":
      return "not_yet_approved";
    case "attorney_only":
      return "attorney_mandatory";
    case "approved":
      return jurisdiction.attorneyRequired
        ? "attorney_mandatory"
        : "administrative_permitted";
  }
}

/* ========================================================================== */
/* Handoff status                                                              */
/* ========================================================================== */

/**
 * Where a claim sits in the legal handoff sequence.
 *
 * `returned_to_administrative` matters as much as the escalation states: a legal issue
 * that has been resolved should hand the case back to the administrative workflow rather
 * than leaving it parked with counsel indefinitely.
 */
export type LegalHandoffStatus =
  | "not_required"
  | "review_pending"
  | "counsel_recommended"
  | "counsel_required"
  | "referral_ready"
  | "referred"
  | "attorney_engaged"
  | "legal_work_in_progress"
  | "returned_to_administrative"
  | "legal_matter_completed";

export const LEGAL_HANDOFF_STATUS: Record<
  LegalHandoffStatus,
  { label: string; tone: Tone; claimantLabel?: string; hint: string }
> = {
  not_required: {
    label: "Not required",
    tone: "positive",
    hint: "No legal escalation is needed on this claim.",
  },
  review_pending: {
    label: "Review pending",
    tone: "caution",
    claimantLabel: "Under review",
    hint: "Awaiting a compliance determination on whether counsel is needed.",
  },
  counsel_recommended: {
    label: "Counsel recommended",
    tone: "caution",
    claimantLabel: "Legal assistance recommended",
    hint: "Review concluded that counsel is advisable. The claimant decides whether to engage.",
  },
  counsel_required: {
    label: "Counsel required",
    tone: "counsel",
    claimantLabel: "Legal assistance required",
    hint: "The claim cannot proceed without an attorney. No referral has been prepared yet.",
  },
  referral_ready: {
    label: "Referral ready",
    tone: "counsel",
    claimantLabel: "Attorney being identified",
    hint: "A suitable attorney has been identified and the handoff package is prepared.",
  },
  referred: {
    label: "Referred",
    tone: "counsel",
    claimantLabel: "Referred to an attorney",
    hint: "Referred to counsel. Awaiting conflict check and engagement by the claimant.",
  },
  attorney_engaged: {
    label: "Attorney engaged",
    tone: "counsel",
    claimantLabel: "Attorney engaged",
    hint: "The claimant has engaged counsel directly under a separate engagement letter.",
  },
  legal_work_in_progress: {
    label: "Legal work in progress",
    tone: "counsel",
    claimantLabel: "Legal matter in progress",
    hint: "Counsel is handling the legal matter. Duequity continues research, documents and coordination.",
  },
  returned_to_administrative: {
    label: "Returned to administrative",
    tone: "positive",
    claimantLabel: "Back to standard processing",
    hint: "The legal issue is resolved and the claim has returned to Duequity's administrative workflow.",
  },
  legal_matter_completed: {
    label: "Legal matter completed",
    tone: "positive",
    claimantLabel: "Legal matter completed",
    hint: "Counsel has completed their work on this matter.",
  },
};

/* ========================================================================== */
/* The review record                                                           */
/* ========================================================================== */

/**
 * The authoritative legal complexity record on a claim.
 *
 * `lane` is the human determination and is what the product acts on. The classifier's
 * proposal is recorded separately as `proposedLane` so a divergence between the two is
 * visible rather than silently overwritten: an operator seeing "classifier says attorney
 * required, review says administrative" is looking at a decision somebody made and can be
 * asked to justify.
 */
export interface LegalReviewRecord {
  /** The authoritative lane. Set by a human reviewer, or the classifier at intake. */
  lane: LegalLane;
  /** What the classifier derived from flags and the jurisdiction rule. */
  proposedLane: LegalLane;
  /** Why the claim sits in this lane, in plain language. */
  rationale: string;
  flags: LegalComplexityFlag[];
  handoffStatus: LegalHandoffStatus;
  /** When a human last reviewed the classification. */
  lastReviewedAt?: IsoDate;
  reviewedBy?: string;
  /** True where the lane was set by a human rather than derived. */
  humanDetermined: boolean;
  /** Deadline attached to the legal work, distinct from the statutory claim deadline. */
  legalDeadline?: IsoDate;
  legalDeadlineNote?: string;
  /**
   * The Duequity operator who remains responsible for coordination while counsel handles
   * the legal work. A referred claim never becomes nobody's responsibility.
   */
  operationalOwnerId?: string;
  notes?: string;
}

/* ========================================================================== */
/* The classifier                                                              */
/* ========================================================================== */

export interface Classification {
  /** The lane the evidence supports. */
  lane: LegalLane;
  /** Human readable reason, assembled from the contributing signals. */
  rationale: string;
  /** Flags that drove the result, most severe first. */
  drivingFlags: LegalComplexityFlagKind[];
  /** The floor imposed by the jurisdiction, independent of case facts. */
  jurisdictionFloor: LegalLane;
  jurisdictionRule: LegalProcessingRule;
}

/**
 * Propose a lane from structured evidence.
 *
 * Takes the most restrictive of: the jurisdiction floor, and the lane proposed by each
 * unresolved complexity flag. Never returns a lane less restrictive than the jurisdiction
 * requires, which is the specific failure the product standard calls out: a claim that
 * looks administrative on its facts must not stay green in a jurisdiction that mandates
 * counsel.
 *
 * This is a routing proposal. It is not a legal determination and it does not decide
 * anything on its own.
 */
export function classifyLegalComplexity(
  flags: LegalComplexityFlag[],
  jurisdiction: Jurisdiction,
): Classification {
  const rule = jurisdictionLegalRule(jurisdiction);
  const floor = laneFromJurisdictionRule(rule);

  const open = flags.filter((f) => !f.resolvedAt);
  const flagLanes = open.map((f) => ({
    kind: f.kind,
    lane: LEGAL_FLAG_PROPOSES[f.kind],
  }));

  const lane = mostRestrictiveLane(floor, ...flagLanes.map((f) => f.lane));

  const driving = flagLanes
    .filter((f) => LANE_SEVERITY[f.lane] >= LANE_SEVERITY[lane])
    .sort((a, b) => LANE_SEVERITY[b.lane] - LANE_SEVERITY[a.lane])
    .map((f) => f.kind);

  return {
    lane,
    rationale: buildRationale(lane, driving, rule, floor),
    drivingFlags: driving,
    jurisdictionFloor: floor,
    jurisdictionRule: rule,
  };
}

function buildRationale(
  lane: LegalLane,
  driving: LegalComplexityFlagKind[],
  rule: LegalProcessingRule,
  floor: LegalLane,
): string {
  const parts: string[] = [];

  // The jurisdiction reason comes first when it is what sets the lane, because it applies
  // regardless of how clean the facts are and staff need to understand that.
  if (
    LANE_SEVERITY[floor] >= LANE_SEVERITY[lane] &&
    floor !== "administrative"
  ) {
    parts.push(
      `${LEGAL_PROCESSING_RULE[rule].label} in this jurisdiction. ${LEGAL_PROCESSING_RULE[rule].detail}`,
    );
  }

  if (driving.length > 0) {
    const named = driving.map((kind) => LEGAL_FLAG_LABEL[kind].toLowerCase());
    const list =
      named.length === 1
        ? named[0]
        : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
    parts.push(
      lane === "attorney_required"
        ? `Requires legal work: ${list}.`
        : `Requires review: ${list}.`,
    );
  }

  if (parts.length === 0) {
    return "No legal complexity signals recorded. The claim falls within Duequity's administrative recovery workflow in this jurisdiction.";
  }

  return parts.join(" ");
}

/* ========================================================================== */
/* Conflict detection                                                          */
/* ========================================================================== */

export type LegalConflictKind =
  | "lane_below_jurisdiction_floor"
  | "lane_below_classifier"
  | "attorney_required_without_assignment"
  | "attorney_engaged_but_lane_administrative"
  | "review_never_performed"
  | "review_stale"
  | "handoff_inconsistent_with_lane";

export interface LegalConflict {
  kind: LegalConflictKind;
  severity: "attention" | "blocking";
  summary: string;
  detail: string;
  requiredAction: string;
}

/**
 * Surface disagreements between the recorded lane, the classifier, the jurisdiction rule
 * and the attorney assignment.
 *
 * This is the safety net. Each individual field can be set correctly and the combination
 * still be wrong, for example a claim marked administrative in a jurisdiction that
 * mandates counsel, or a claim marked attorney required with no referral after weeks.
 * Those combinations are what this function finds.
 */
export function detectLegalConflicts(
  review: LegalReviewRecord,
  jurisdiction: Jurisdiction,
  hasAttorneyAssignment: boolean,
  attorneyEngaged: boolean,
  claimStatus: ClaimStatus,
  today: IsoDate,
): LegalConflict[] {
  const conflicts: LegalConflict[] = [];
  const rule = jurisdictionLegalRule(jurisdiction);
  const floor = laneFromJurisdictionRule(rule);

  // The most important check: a lane below what the jurisdiction requires.
  if (LANE_SEVERITY[review.lane] < LANE_SEVERITY[floor]) {
    conflicts.push({
      kind: "lane_below_jurisdiction_floor",
      severity: "blocking",
      summary: "Lane is below the jurisdiction requirement",
      detail: `This claim is classified ${LEGAL_LANE[review.lane].label.toLowerCase()}, but this jurisdiction requires ${LEGAL_LANE[floor].label.toLowerCase()}. ${LEGAL_PROCESSING_RULE[rule].detail}`,
      requiredAction: `Reclassify to ${LEGAL_LANE[floor].label.toLowerCase()} or escalate to compliance.`,
    });
  }

  // A human may lower a lane below the classifier's proposal, but it must be deliberate.
  if (
    LANE_SEVERITY[review.lane] < LANE_SEVERITY[review.proposedLane] &&
    !review.humanDetermined
  ) {
    conflicts.push({
      kind: "lane_below_classifier",
      severity: "blocking",
      summary: "Lane is below the classified level without a recorded review",
      detail: `The recorded lane is ${LEGAL_LANE[review.lane].label.toLowerCase()} but the complexity flags support ${LEGAL_LANE[review.proposedLane].label.toLowerCase()}. Lowering a lane requires a recorded human determination.`,
      requiredAction:
        "Record a compliance review with a rationale, or restore the classified lane.",
    });
  }

  if (review.lane === "attorney_required" && !hasAttorneyAssignment) {
    const filed =
      claimStatus === "submitted" ||
      claimStatus === "under_review" ||
      claimStatus === "approved" ||
      claimStatus === "paid";
    conflicts.push({
      kind: "attorney_required_without_assignment",
      severity: filed ? "blocking" : "attention",
      summary: "Attorney required with no referral",
      detail:
        "This claim requires independent counsel and no attorney has been referred. Duequity may not perform the legal work itself.",
      requiredAction: "Prepare a referral from the attorney network.",
    });
  }

  if (attorneyEngaged && review.lane === "administrative") {
    conflicts.push({
      kind: "attorney_engaged_but_lane_administrative",
      severity: "attention",
      summary: "Counsel engaged on an administrative claim",
      detail:
        "An attorney is engaged but the claim is classified administrative. Either the classification is stale or the legal matter has concluded.",
      requiredAction:
        "Confirm whether the legal matter is complete and update the handoff status.",
    });
  }

  if (review.lane !== "administrative" && !review.lastReviewedAt) {
    conflicts.push({
      kind: "review_never_performed",
      severity: "attention",
      summary: "No human review recorded",
      detail:
        "This claim has been flagged for legal complexity but no compliance review is on record. The classification is a machine proposal only.",
      requiredAction: "Record a compliance review of the classification.",
    });
  }

  if (review.lastReviewedAt) {
    const age = daysBetweenIso(review.lastReviewedAt, today);
    if (review.lane !== "administrative" && age > 90) {
      conflicts.push({
        kind: "review_stale",
        severity: "attention",
        summary: "Legal review is more than 90 days old",
        detail: `The last review was ${age} days ago. Facts change, and a lane that was correct then may not be correct now.`,
        requiredAction: "Re-review the classification.",
      });
    }
  }

  // Handoff status must be coherent with the lane.
  if (review.lane === "administrative") {
    const escalated: LegalHandoffStatus[] = [
      "counsel_required",
      "referral_ready",
      "referred",
    ];
    if (escalated.includes(review.handoffStatus)) {
      conflicts.push({
        kind: "handoff_inconsistent_with_lane",
        severity: "attention",
        summary: "Handoff status implies escalation on an administrative claim",
        detail: `The claim is administrative but the handoff status is "${LEGAL_HANDOFF_STATUS[review.handoffStatus].label}".`,
        requiredAction: "Align the handoff status with the recorded lane.",
      });
    }
  }

  if (
    review.lane === "attorney_required" &&
    review.handoffStatus === "not_required"
  ) {
    conflicts.push({
      kind: "handoff_inconsistent_with_lane",
      severity: "blocking",
      summary: "Attorney required but handoff marked not required",
      detail:
        "The claim requires counsel and the handoff status says no escalation is needed. These cannot both be correct.",
      requiredAction:
        "Set the handoff status to reflect the referral position.",
    });
  }

  return conflicts;
}

/** Local ISO date difference, kept here so this module has no import cycle with format. */
function daysBetweenIso(from: IsoDate, to: IsoDate): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to);
  if (!a || !b) return 0;
  const utcA = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const utcB = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((utcB - utcA) / 86_400_000);
}

/* ========================================================================== */
/* Next action                                                                 */
/* ========================================================================== */

/**
 * The single next legal action on a claim.
 *
 * A lane without a next action is a label. This turns the classification into work: the
 * operations surfaces show one instruction rather than requiring a specialist to infer
 * what a yellow lane means for them today.
 */
export function nextLegalAction(
  review: LegalReviewRecord,
  jurisdiction: Jurisdiction,
  hasAttorneyAssignment: boolean,
  attorneyEngaged: boolean,
):
  | {
      action: string;
      owner: "operations" | "compliance" | "claimant" | "attorney";
    }
  | undefined {
  if (review.lane === "administrative") {
    if (review.handoffStatus === "returned_to_administrative") {
      return {
        action:
          "Resume administrative processing. The legal matter has concluded.",
        owner: "operations",
      };
    }
    return undefined;
  }

  if (review.lane === "legal_review") {
    switch (review.handoffStatus) {
      case "review_pending":
      case "not_required":
        return {
          action: "Complete the compliance review and record a determination.",
          owner: "compliance",
        };
      case "counsel_recommended":
        return {
          action:
            "Explain to the claimant that counsel is recommended and let them decide. Do not advise on the legal merits.",
          owner: "operations",
        };
      default:
        return {
          action: "Confirm whether the review is complete and update the lane.",
          owner: "compliance",
        };
    }
  }

  // attorney_required
  switch (review.handoffStatus) {
    case "not_required":
    case "review_pending":
      return {
        action: "Record the determination that counsel is required.",
        owner: "compliance",
      };
    case "counsel_required":
      return {
        action: `Identify an attorney licensed in ${jurisdiction.stateName} from the network and prepare the handoff package.`,
        owner: "operations",
      };
    case "referral_ready":
      return {
        action: "Send the referral and confirm the conflict check.",
        owner: "operations",
      };
    case "referred":
      return attorneyEngaged
        ? {
            action: "Update the handoff status to attorney engaged.",
            owner: "operations",
          }
        : {
            action:
              "Claimant to sign an engagement letter directly with the firm. Duequity is not a party to it.",
            owner: "claimant",
          };
    case "attorney_engaged":
      return {
        action:
          "Confirm the scope with counsel and continue document coordination.",
        owner: "operations",
      };
    case "legal_work_in_progress":
      return {
        action:
          "Counsel handling the legal matter. Maintain research and document support.",
        owner: "attorney",
      };
    case "legal_matter_completed":
      return {
        action:
          "Return the claim to administrative processing and update the lane if appropriate.",
        owner: "operations",
      };
    case "returned_to_administrative":
      return {
        action:
          "Lane still reads attorney required. Reconcile with the handoff status.",
        owner: "compliance",
      };
    default:
      return undefined;
  }
}

/* ========================================================================== */
/* Financial separation                                                        */
/* ========================================================================== */

/**
 * Independent legal fees.
 *
 * Held as a separate concept from the Duequity service fee, never summed into a single
 * figure. Duequity does not share in attorney fees, does not receive referral
 * compensation, and does not invoice or collect legal fees on an attorney's behalf. The
 * claimant is billed by the firm directly.
 *
 * `amount` is optional on purpose. Where the firm has not quoted, the product shows a
 * neutral state rather than inventing a number.
 */
export interface IndependentLegalFee {
  /** Known amount, where the firm has quoted or invoiced one. */
  amount?: Cents;
  /** How the firm charges, where known. */
  basis?: "hourly" | "flat" | "contingency" | "not_quoted";
  /** Firm the claimant is billed by. Never Duequity. */
  billedByFirmName?: string;
  /** Free text explanation shown where no amount is available. */
  note?: string;
  /**
   * Always false. Retained as an explicit auditable statement that Duequity takes no part
   * of any legal fee on any matter.
   */
  sharedWithDuequity: false;
}

export const LEGAL_FEE_BASIS_LABEL: Record<
  NonNullable<IndependentLegalFee["basis"]>,
  string
> = {
  hourly: "Hourly",
  flat: "Flat fee",
  contingency: "Contingency",
  not_quoted: "Not yet quoted",
};

/* ========================================================================== */
/* Staff boundary guidance                                                     */
/* ========================================================================== */

/**
 * What Duequity staff may and may not do.
 *
 * Surfaced in the interface where an operator is about to act on a legally complex claim,
 * which is the moment the boundary actually matters. Not repeated on every screen.
 */
export const STAFF_MAY = [
  "Factual research and public record verification",
  "Collecting and organising documents",
  "Administrative claim coordination and submission",
  "Communicating factual status and agency requirements",
  "Tracking deadlines",
  "Claimant support and explanation of process",
] as const;

export const STAFF_MAY_NOT = [
  "Legal representation or court advocacy",
  "Interpreting law for a claimant",
  "Advising on legal strategy or the merits of a position",
  "Determining contested legal rights",
  "Preparing legal arguments or pleadings",
  "Resolving competing legal claims",
] as const;

export const STAFF_BOUNDARY_NOTICE =
  "Duequity provides recovery coordination, not legal representation. Escalate matters requiring legal advice or representation to licensed counsel.";
