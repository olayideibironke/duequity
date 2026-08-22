import "server-only";

import { evaluateIntakeGate, requiredDisclosures } from "@/domain/compliance";

import type {
  Address,
  ClaimSubmissionMethod,
  ComplianceStatus,
  DocumentKind,
  FeeModel,
  IsoDate,
  StateCode,
  SurplusCustodian,
} from "@/domain/types";

import { loadNationalGeography } from "@/server/geography-resolver";

import {
  evaluateJurisdictionPaymentRouting,
  listJurisdictionRulePackages,
  type DuequityLaunchPaymentTrack,
  type JurisdictionPaymentRoute,
} from "@/server/jurisdiction-intelligence";

/**
 * PUBLIC JURISDICTION COVERAGE
 *
 * The public projection of Duequity's operating footprint.
 *
 * WHAT THIS IS FOR
 *
 * The public site must be able to answer "where do you operate?" truthfully,
 * including when the honest answer is "nowhere yet". Claiming national coverage
 * on day one is the single most common misrepresentation in this industry, and
 * the coverage pages exist specifically to avoid it.
 *
 * WHAT IS PUBLISHED
 *
 * Only persisted jurisdiction rule packages appear here. A jurisdiction is
 * reported as open for claims only when all of the following hold:
 *
 *   1. The rule package status is `approved`.
 *   2. A normalized rule is attached to the package.
 *   3. The rule's own intake gate does not block intake.
 *   4. Payment routing resolves to a launch track Duequity actually operates.
 *
 * Any package that fails any of those is reported under its real status. No
 * jurisdiction becomes publicly "open" because a surplus exists there, because
 * evidence was harvested there, or because a review draft was started there.
 *
 * NATIONAL GEOGRAPHY IS NOT COVERAGE
 *
 * The national geography totals describe the size of the United States, not
 * Duequity's footprint. They are surfaced so the public pages can put a small
 * number of activated jurisdictions in honest proportion.
 */

/* ========================================================================== */
/* Public shapes                                                               */
/* ========================================================================== */

/**
 * How the public site should describe a jurisdiction's availability.
 *
 * Deliberately coarser than the internal compliance vocabulary. A member of the
 * public needs to know whether they can be helped here, not which internal
 * review stage a package sits in.
 */
export type PublicCoverageState =
  "open" | "attorney_required" | "under_review" | "not_available";

export interface PublicJurisdiction {
  /** Rule package identifier, stable across revisions of the same jurisdiction. */
  packageId: string;

  packageVersion: number;

  state: StateCode;

  stateName: string;

  /** Absent for a statewide rule such as an unclaimed property office. */
  county?: string;

  countyGeoid?: string;

  agencyName: string;

  custodian: SurplusCustodian;

  agencyWebsite?: string;

  agencyPhone?: string;

  agencyAddress?: Omit<Address, "id" | "county">;

  claimMethod: ClaimSubmissionMethod;

  claimFormUrl?: string;

  requiredDocuments: DocumentKind[];

  claimDeadlineDays?: number;

  statuteReference?: string;

  permittedFeeModels: FeeModel[];

  feeCapPercent?: number;

  feeCapAmount?: number;

  attorneyRequired: boolean;

  probateRequiredWhenDeceased: boolean;

  finderLicenseRequired: boolean;

  bondRequired: boolean;

  powerOfAttorneyAccepted: boolean;

  /**
   * Whether the jurisdiction permits assignment or purchase of a surplus claim.
   *
   * Published for completeness only. Duequity does not purchase, acquire or take
   * assignment of surplus rights in any jurisdiction under the launch model, so a
   * `true` here never means Duequity would do so.
   */
  assignmentPermitted: boolean;

  cancellationPeriodDays?: number;

  paymentRoutingNote?: string;

  /**
   * The disclosures a claimant in this jurisdiction receives before signing.
   *
   * Derived from the recorded rule by the same compliance engine that enforces
   * them during onboarding.
   */
  disclosures: {
    key: string;
    text: string;
    source: string;
    requiresAcknowledgement: boolean;
  }[];

  /** Internal compliance status, retained because the public pages show it. */
  complianceStatus: ComplianceStatus;

  lastLegalReview?: IsoDate;

  legalRuleVersion?: number;

  coverage: PublicCoverageState;

  /**
   * Plain-language reason the jurisdiction is not open, written for a member of
   * the public. Absent when coverage is "open".
   */
  coverageReason?: string;

  paymentRoute: JurisdictionPaymentRoute;

  paymentLaunchTrack: DuequityLaunchPaymentTrack;
}

export interface PublicStateCoverage {
  state: StateCode;
  stateName: string;
  jurisdictions: PublicJurisdiction[];
}

export interface PublicCoverage {
  /** Every state that has at least one persisted jurisdiction rule package. */
  states: PublicStateCoverage[];

  totals: {
    open: number;
    attorneyRequired: number;
    underReview: number;
    notAvailable: number;
    /** Count of persisted county-scoped jurisdictions, of any coverage state. */
    counties: number;
  };

  /** The size of the United States, for honest proportion. Not coverage. */
  nation: {
    statesAndDc: number;
    countyEquivalents: number;
    geographySource: string;
    geographyGeneratedAt: string;
  };
}

/* ========================================================================== */
/* Coverage classification                                                     */
/* ========================================================================== */

function classifyCoverage(
  rulePackage: Awaited<ReturnType<typeof listJurisdictionRulePackages>>[number],
): {
  coverage: PublicCoverageState;
  reason?: string;
} {
  const rule = rulePackage.rule;

  if (!rule) {
    return {
      coverage: "under_review",

      reason:
        "The rules for this jurisdiction are still being researched and recorded. Intake is closed here.",
    };
  }

  if (rulePackage.status !== "approved") {
    if (rulePackage.status === "conflict") {
      return {
        coverage: "not_available",

        reason:
          "Our sources disagree about the rules that apply here, so we are not accepting claims in this jurisdiction.",
      };
    }

    return {
      coverage: "under_review",

      reason:
        "This jurisdiction has not completed legal review. Intake stays closed until it does.",
    };
  }

  if (rule.attorneyRequired || rule.complianceStatus === "attorney_only") {
    return {
      coverage: "attorney_required",

      reason:
        "A claim here must be filed by an attorney. Duequity coordinates the work; an independent attorney files it and is engaged directly by you.",
    };
  }

  const gate = evaluateIntakeGate(rule);

  if (gate.outcome === "blocked") {
    return {
      coverage: "not_available",

      reason: gate.reason,
    };
  }

  /*
   * Payment routing is a separate gate from legal clearance.
   *
   * A jurisdiction may permit a surplus claim and still be unusable under
   * Duequity's launch model, most commonly where the recorded payment route is
   * unknown or depends on acquiring the claimant's rights.
   */
  const routing = evaluateJurisdictionPaymentRouting(
    rulePackage.paymentRouting,
  );

  if (!routing.ready) {
    return {
      coverage: "not_available",

      reason:
        "We have not established how the agency here issues payment on a claim we assist with, so we are not accepting claims in this jurisdiction.",
    };
  }

  return {
    coverage: "open",
  };
}

/* ========================================================================== */
/* Projection                                                                  */
/* ========================================================================== */

export async function resolvePublicCoverage(): Promise<PublicCoverage> {
  const [rulePackages, geography] = await Promise.all([
    listJurisdictionRulePackages(),
    loadNationalGeography(),
  ]);

  /*
   * A jurisdiction may have several persisted package versions. The public site
   * shows the highest-versioned package per jurisdiction rule key so it never
   * advertises a superseded rule.
   */
  const newestByKey = new Map<string, (typeof rulePackages)[number]>();

  for (const rulePackage of rulePackages) {
    const key = [
      rulePackage.stateFips,
      rulePackage.countyGeoid ?? "state",
      rulePackage.saleType,
    ].join("::");

    const existing = newestByKey.get(key);

    if (!existing || rulePackage.version > existing.version) {
      newestByKey.set(key, rulePackage);
    }
  }

  const byState = new Map<StateCode, PublicStateCoverage>();

  const totals = {
    open: 0,
    attorneyRequired: 0,
    underReview: 0,
    notAvailable: 0,
    counties: 0,
  };

  for (const rulePackage of newestByKey.values()) {
    const rule = rulePackage.rule;

    const { coverage, reason } = classifyCoverage(rulePackage);

    const routing = evaluateJurisdictionPaymentRouting(
      rulePackage.paymentRouting,
    );

    const projected: PublicJurisdiction = {
      packageId: rulePackage.id,

      packageVersion: rulePackage.version,

      state: rulePackage.stateCode,

      stateName: rulePackage.stateName,

      county: rulePackage.countyName,

      countyGeoid: rulePackage.countyGeoid,

      agencyName: rule?.agencyName ?? "Agency not yet recorded",

      custodian: rule?.custodian ?? "unknown",

      agencyWebsite: rule?.agencyWebsite,

      agencyPhone: rule?.agencyPhone,

      agencyAddress: rule?.agencyAddress,

      claimMethod: rule?.claimMethod ?? "mail",

      claimFormUrl: rule?.claimFormUrl,

      requiredDocuments: rule?.requiredDocuments ?? [],

      claimDeadlineDays: rule?.claimDeadlineDays,

      statuteReference: rule?.statuteReference,

      permittedFeeModels: rule?.permittedFeeModels ?? [],

      feeCapPercent: rule?.feeCapPercent,

      feeCapAmount: rule?.feeCapAmount,

      attorneyRequired: rule?.attorneyRequired ?? false,

      probateRequiredWhenDeceased: rule?.probateRequiredWhenDeceased ?? false,

      finderLicenseRequired: rule?.finderLicenseRequired ?? false,

      bondRequired: rule?.bondRequired ?? false,

      powerOfAttorneyAccepted: rule?.powerOfAttorneyAccepted ?? false,

      assignmentPermitted: rule?.assignmentPermitted ?? false,

      cancellationPeriodDays: rule?.cancellationPeriodDays,

      paymentRoutingNote: rule?.paymentRoutingNote,

      /*
       * Disclosures are derived, never copied from the package.
       *
       * `internalNotes` and `reviewedBy` are deliberately not projected onto the
       * public shape. Internal review commentary is not published.
       */
      disclosures: rule
        ? requiredDisclosures(rule).map((disclosure) => ({
            key: disclosure.key,

            text: disclosure.text,

            source: disclosure.source,

            requiresAcknowledgement: disclosure.requiresAcknowledgement,
          }))
        : [],

      complianceStatus: rule?.complianceStatus ?? "research_required",

      lastLegalReview: rule?.lastLegalReview,

      legalRuleVersion: rule?.legalRuleVersion,

      coverage,

      coverageReason: reason,

      paymentRoute: rulePackage.paymentRouting?.paymentRoute ?? "unknown",

      paymentLaunchTrack: routing.launchTrack,
    };

    if (coverage === "open") totals.open += 1;
    if (coverage === "attorney_required") totals.attorneyRequired += 1;
    if (coverage === "under_review") totals.underReview += 1;
    if (coverage === "not_available") totals.notAvailable += 1;

    if (projected.county) totals.counties += 1;

    const existing = byState.get(projected.state);

    if (existing) {
      existing.jurisdictions.push(projected);
    } else {
      byState.set(projected.state, {
        state: projected.state,

        stateName: projected.stateName,

        jurisdictions: [projected],
      });
    }
  }

  const states = [...byState.values()]
    .map((entry) => ({
      ...entry,

      jurisdictions: entry.jurisdictions
        .slice()
        .sort((left, right) =>
          (left.county ?? "").localeCompare(right.county ?? ""),
        ),
    }))
    .sort((left, right) => left.stateName.localeCompare(right.stateName));

  return {
    states,

    totals,

    nation: {
      statesAndDc: geography.totals.statesAndDc,

      countyEquivalents: geography.totals.countyEquivalents,

      geographySource: `${geography.source.authority} / ${geography.source.dataset}`,

      geographyGeneratedAt: geography.generatedAt,
    },
  };
}

/* ========================================================================== */
/* Lookup                                                                      */
/* ========================================================================== */

export async function findPublicJurisdiction(
  stateSlug: string,
  countySlug: string,
): Promise<PublicJurisdiction | undefined> {
  const coverage = await resolvePublicCoverage();

  const normalizedState = stateSlug.trim().toUpperCase();

  const state = coverage.states.find(
    (entry) => entry.state === normalizedState,
  );

  if (!state) {
    return undefined;
  }

  const normalizedCounty = countySlug.trim().toLowerCase();

  return state.jurisdictions.find((jurisdiction) => {
    const slug = (jurisdiction.county ?? "statewide")
      .toLowerCase()
      .replace(/\s+county$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug === normalizedCounty;
  });
}

export async function publicStateCoverage(
  stateSlug: string,
): Promise<PublicStateCoverage | undefined> {
  const coverage = await resolvePublicCoverage();

  const normalizedState = stateSlug.trim().toUpperCase();

  return coverage.states.find((entry) => entry.state === normalizedState);
}
