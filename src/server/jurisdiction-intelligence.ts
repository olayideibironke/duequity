import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

import { dirname, join } from "node:path";

import type { Jurisdiction, SaleType, StateCode } from "@/domain/types";

import {
  resolveAddressGeography,
  type ResolvedAddressGeography,
} from "@/server/geography-resolver";

/**
 * DUEQUITY NATIONAL JURISDICTION INTELLIGENCE
 *
 * Production-facing rule boundary for:
 *
 *   state FIPS
 *   + county GEOID
 *   + sale type
 *   = applicable jurisdiction rule package
 *
 * A real opportunity may proceed only when this layer resolves:
 *
 *   - an approved, source-backed jurisdiction rule
 *   - a known claim-submission rule
 *   - a known payment route
 *   - a launch-supported Duequity recovery track
 *
 * Geography alone never creates legal or operational clearance.
 *
 * Current Duequity launch model:
 *
 *   1. Direct Claimant Recovery
 *
 *      The government pays the lawful claimant or estate representative.
 *      Duequity earns its contractually agreed recovery fee under the signed
 *      service agreement after a successful recovery.
 *
 *   2. Managed Representative Recovery
 *
 *      The government expressly permits an authorized representative such as
 *      Duequity to receive, share in, or otherwise participate in the payment
 *      without acquiring ownership of the claimant's surplus rights.
 *
 * Future model, disabled for launch:
 *
 *   3. Acquisition Recovery
 *
 *      The claimant assigns or sells surplus rights to Duequity.
 *
 *      Duequity is not launching this model and this module always blocks it
 *      from operational intake even where assignment rules have been researched.
 */

/* ========================================================================== */
/* Status                                                                      */
/* ========================================================================== */

export type JurisdictionIntelligenceStatus =
  "unverified" | "review_required" | "conflict" | "approved";

/* ========================================================================== */
/* Rule scope                                                                  */
/* ========================================================================== */

export type JurisdictionRuleScope = "state" | "county";

/* ========================================================================== */
/* Authoritative sources                                                       */
/* ========================================================================== */

export type JurisdictionAuthoritySourceKind =
  | "statute"
  | "court_rule"
  | "judiciary"
  | "state_agency"
  | "county_agency"
  | "clerk"
  | "tax_collector"
  | "treasurer"
  | "sheriff"
  | "regulator"
  | "official_form"
  | "fee_schedule"
  | "other_official";

/**
 * One official source supporting a jurisdiction rule.
 *
 * A search result itself is never an authority source.
 *
 * The stored URL must identify the actual government, court, legislature,
 * regulator, official form, or other authoritative public source.
 */
export interface JurisdictionAuthoritySource {
  id: string;

  kind: JurisdictionAuthoritySourceKind;

  authorityName: string;

  url: string;

  title?: string;

  /**
   * ISO timestamp recording when Duequity retrieved the source.
   */
  retrievedAt: string;

  /**
   * Effective or publication date where the official source provides one.
   */
  effectiveDate?: string;

  /**
   * Optional SHA-256 of the retrieved source body.
   */
  contentHash?: string;
}

/* ========================================================================== */
/* Payment and representation intelligence                                     */
/* ========================================================================== */

/**
 * Exact government disbursement route supported by the jurisdiction.
 *
 * claimant_only
 *   The government pays only the claimant or lawful estate representative.
 *
 * authorized_representative
 *   The government permits an authorized representative to receive payment
 *   without requiring an assignment of the claimant's surplus rights.
 *
 * joint_payee
 *   The government permits claimant and authorized representative to be named
 *   together on the payment instrument.
 *
 * split_disbursement
 *   The government permits separate payments to claimant and representative.
 *
 * assignee
 *   Payment depends on an assignment or acquisition of claim rights.
 *   This is outside the Duequity launch model.
 *
 * unknown
 *   The government payment rule has not been established.
 */
export type JurisdictionPaymentRoute =
  | "claimant_only"
  | "authorized_representative"
  | "joint_payee"
  | "split_disbursement"
  | "assignee"
  | "unknown";

/**
 * Explicit yes/no/unknown values prevent missing research from silently
 * becoming a false assumption.
 */
export type JurisdictionYesNoUnknown = "yes" | "no" | "unknown";

/**
 * Current Duequity commercial operating tracks.
 */
export type DuequityLaunchPaymentTrack =
  | "direct_claimant_recovery"
  | "managed_representative_recovery"
  | "future_acquisition"
  | "blocked";

/**
 * How Duequity expects its earned fee to be collected.
 */
export type JurisdictionFeeCollectionMethod =
  | "contractual_post_recovery"
  | "representative_disbursement"
  | "joint_payee_disbursement"
  | "split_disbursement"
  | "assignment_acquisition"
  | "unknown";

/**
 * Source-backed jurisdiction-level payment and representation policy.
 *
 * This is deliberately separate from the legal recovery rule because a
 * jurisdiction may legally allow a surplus claim while still being unsuitable
 * for Duequity's launch business model.
 */
export interface JurisdictionPaymentRouting {
  paymentRoute: JurisdictionPaymentRoute;

  launchTrack: DuequityLaunchPaymentTrack;

  /**
   * Whether an authorized administrative representative may submit or file
   * the recovery claim.
   *
   * "no" may still support Direct Claimant Recovery if Duequity prepares the
   * package and the claimant signs/submits it personally.
   *
   * "unknown" blocks operational activation.
   */
  representativeMayFile: JurisdictionYesNoUnknown;

  /**
   * Whether an authorized representative may actually receive the government
   * payment without acquiring ownership of the surplus rights.
   */
  representativeMayReceivePayment: JurisdictionYesNoUnknown;

  /**
   * Whether representative payment requires assignment/acquisition of the
   * claimant's underlying surplus rights.
   *
   * A "yes" places the structure outside the launch model.
   */
  assignmentRequiredForRepresentativePayment: JurisdictionYesNoUnknown;

  feeCollectionMethod: JurisdictionFeeCollectionMethod;

  /**
   * IDs of authority sources in the parent jurisdiction package that directly
   * support the payment-routing determination.
   */
  evidenceSourceIds: string[];

  /**
   * Human-readable operational notes.
   */
  notes?: string;
}

/* ========================================================================== */
/* Rule package                                                                */
/* ========================================================================== */

/**
 * One versioned legal/procedural package.
 *
 * State packages provide inherited rules.
 *
 * County packages override the state package only for the same sale type.
 */
export interface JurisdictionRulePackage {
  id: string;

  version: number;

  scope: JurisdictionRuleScope;

  stateFips: string;

  stateCode: StateCode;

  stateName: string;

  /**
   * Present only for county-scoped packages.
   */
  countyGeoid?: string;

  countyName?: string;

  saleType: SaleType;

  status: JurisdictionIntelligenceStatus;

  sources: JurisdictionAuthoritySource[];

  /**
   * Normalized legal and procedural rule.
   *
   * This must be present before status may become approved.
   */
  rule?: Jurisdiction;

  /**
   * Payment and representation intelligence.
   *
   * Older local validation packages may not contain this property. Missing
   * payment routing always fails closed during operational resolution.
   */
  paymentRouting?: JurisdictionPaymentRouting;

  /**
   * Plain-language reason the package cannot yet be activated.
   */
  reviewReason?: string;

  /**
   * Human-readable conflict description where official sources disagree.
   */
  conflictReason?: string;

  /**
   * Final activation approval.
   *
   * Automated discovery/extraction may build a package, but it cannot silently
   * activate a jurisdiction.
   */
  approvedByUserId?: string;

  approvedAt?: string;

  createdAt: string;

  updatedAt: string;
}

/* ========================================================================== */
/* Store                                                                       */
/* ========================================================================== */

interface JurisdictionIntelligenceStore {
  schemaVersion: 1;

  packages: JurisdictionRulePackage[];
}

const STORE_PATH = join(
  process.cwd(),
  ".duequity-data",
  "jurisdiction-intelligence.json",
);

const EMPTY_STORE: JurisdictionIntelligenceStore = {
  schemaVersion: 1,

  packages: [],
};

/**
 * Process-local mutation queue.
 *
 * This is sufficient for local validation.
 *
 * A deployed multi-instance production system must use transactional database
 * persistence rather than filesystem locking.
 */
let mutationQueue: Promise<void> = Promise.resolve();

/* ========================================================================== */
/* Store helpers                                                               */
/* ========================================================================== */

async function readStore(): Promise<JurisdictionIntelligenceStore> {
  let raw: string;

  try {
    raw = await readFile(STORE_PATH, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      return {
        ...EMPTY_STORE,

        packages: [],
      };
    }

    throw error;
  }

  const normalized = raw.replace(/^\uFEFF/, "");

  let parsed: JurisdictionIntelligenceStore;

  try {
    parsed = JSON.parse(normalized) as JurisdictionIntelligenceStore;
  } catch {
    throw new Error(
      "Duequity jurisdiction intelligence store contains invalid JSON.",
    );
  }

  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.packages)) {
    throw new Error(
      "Duequity jurisdiction intelligence store failed schema validation.",
    );
  }

  return parsed;
}

async function writeStore(store: JurisdictionIntelligenceStore): Promise<void> {
  await mkdir(dirname(STORE_PATH), {
    recursive: true,
  });

  const tempPath = `${STORE_PATH}.tmp`;

  const json = JSON.stringify(store, null, 2);

  await writeFile(tempPath, json, "utf8");

  await rename(tempPath, STORE_PATH);
}

async function mutateStore<T>(
  mutation: (store: JurisdictionIntelligenceStore) => Promise<T> | T,
): Promise<T> {
  let result: T | undefined;

  let failure: unknown;

  const operation = mutationQueue.then(async () => {
    try {
      const store = await readStore();

      result = await mutation(store);

      await writeStore(store);
    } catch (error) {
      failure = error;
    }
  });

  mutationQueue = operation.then(
    () => undefined,

    () => undefined,
  );

  await operation;

  if (failure !== undefined) {
    throw failure;
  }

  return result as T;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function assertFips(stateFips: string): void {
  if (!/^\d{2}$/.test(stateFips)) {
    throw new Error(`Invalid state FIPS: ${stateFips}`);
  }
}

function assertCountyGeoid(countyGeoid: string, stateFips: string): void {
  if (!/^\d{5}$/.test(countyGeoid)) {
    throw new Error(`Invalid county GEOID: ${countyGeoid}`);
  }

  if (!countyGeoid.startsWith(stateFips)) {
    throw new Error(
      `County GEOID ${countyGeoid} does not belong to state FIPS ${stateFips}.`,
    );
  }
}

function validatePaymentRouting(
  paymentRouting: JurisdictionPaymentRouting,
  sources: JurisdictionAuthoritySource[],
): void {
  const sourceIds = new Set(sources.map((source) => source.id));

  for (const evidenceSourceId of paymentRouting.evidenceSourceIds) {
    if (!sourceIds.has(evidenceSourceId)) {
      throw new Error(
        `Payment-routing evidence source ${evidenceSourceId} is not present in the jurisdiction package sources.`,
      );
    }
  }

  if (
    paymentRouting.paymentRoute !== "unknown" &&
    paymentRouting.evidenceSourceIds.length === 0
  ) {
    throw new Error(
      "A known jurisdiction payment route requires at least one supporting authority source.",
    );
  }

  switch (paymentRouting.paymentRoute) {
    case "claimant_only":
      if (paymentRouting.launchTrack !== "direct_claimant_recovery") {
        throw new Error(
          "A claimant-only payment route must use the Direct Claimant Recovery launch track.",
        );
      }

      if (paymentRouting.representativeMayReceivePayment !== "no") {
        throw new Error(
          "A claimant-only payment route must record representativeMayReceivePayment as no.",
        );
      }

      if (paymentRouting.assignmentRequiredForRepresentativePayment !== "no") {
        throw new Error(
          "A claimant-only launch route must not require assignment of surplus rights.",
        );
      }

      if (paymentRouting.feeCollectionMethod !== "contractual_post_recovery") {
        throw new Error(
          "A claimant-only payment route must use contractual post-recovery fee collection.",
        );
      }

      break;

    case "authorized_representative":
      if (paymentRouting.launchTrack !== "managed_representative_recovery") {
        throw new Error(
          "An authorized-representative payment route must use the Managed Representative Recovery launch track.",
        );
      }

      if (paymentRouting.representativeMayReceivePayment !== "yes") {
        throw new Error(
          "An authorized-representative route must affirm that the representative may receive payment.",
        );
      }

      if (paymentRouting.assignmentRequiredForRepresentativePayment !== "no") {
        throw new Error(
          "Managed Representative Recovery cannot require assignment of the claimant's surplus rights.",
        );
      }

      if (
        paymentRouting.feeCollectionMethod !== "representative_disbursement"
      ) {
        throw new Error(
          "An authorized-representative payment route must use representative disbursement.",
        );
      }

      break;

    case "joint_payee":
      if (paymentRouting.launchTrack !== "managed_representative_recovery") {
        throw new Error(
          "A joint-payee route must use the Managed Representative Recovery launch track.",
        );
      }

      if (paymentRouting.representativeMayReceivePayment !== "yes") {
        throw new Error(
          "A joint-payee route must affirm that the representative may receive payment.",
        );
      }

      if (paymentRouting.assignmentRequiredForRepresentativePayment !== "no") {
        throw new Error(
          "A launch-supported joint-payee route cannot require assignment of surplus rights.",
        );
      }

      if (paymentRouting.feeCollectionMethod !== "joint_payee_disbursement") {
        throw new Error(
          "A joint-payee route must use joint-payee disbursement.",
        );
      }

      break;

    case "split_disbursement":
      if (paymentRouting.launchTrack !== "managed_representative_recovery") {
        throw new Error(
          "A split-disbursement route must use the Managed Representative Recovery launch track.",
        );
      }

      if (paymentRouting.representativeMayReceivePayment !== "yes") {
        throw new Error(
          "A split-disbursement route must affirm that the representative may receive payment.",
        );
      }

      if (paymentRouting.assignmentRequiredForRepresentativePayment !== "no") {
        throw new Error(
          "A launch-supported split-disbursement route cannot require assignment of surplus rights.",
        );
      }

      if (paymentRouting.feeCollectionMethod !== "split_disbursement") {
        throw new Error(
          "A split-disbursement route must use split disbursement fee collection.",
        );
      }

      break;

    case "assignee":
      if (paymentRouting.launchTrack !== "future_acquisition") {
        throw new Error(
          "An assignee payment route belongs only to the future Acquisition Recovery track.",
        );
      }

      if (paymentRouting.assignmentRequiredForRepresentativePayment !== "yes") {
        throw new Error(
          "An assignee payment route must record that assignment is required.",
        );
      }

      if (paymentRouting.feeCollectionMethod !== "assignment_acquisition") {
        throw new Error(
          "An assignee payment route must use assignment acquisition as its collection model.",
        );
      }

      break;

    case "unknown":
      if (paymentRouting.launchTrack !== "blocked") {
        throw new Error("An unknown payment route must remain blocked.");
      }

      if (paymentRouting.feeCollectionMethod !== "unknown") {
        throw new Error(
          "An unknown payment route must use an unknown fee collection method.",
        );
      }

      break;
  }
}

function validatePackage(rulePackage: JurisdictionRulePackage): void {
  assertFips(rulePackage.stateFips);

  if (rulePackage.version < 1 || !Number.isInteger(rulePackage.version)) {
    throw new Error(
      "Jurisdiction rule package version must be a positive integer.",
    );
  }

  if (rulePackage.scope === "county") {
    if (!rulePackage.countyGeoid || !rulePackage.countyName) {
      throw new Error(
        "County-scoped jurisdiction rules require county GEOID and county name.",
      );
    }

    assertCountyGeoid(rulePackage.countyGeoid, rulePackage.stateFips);
  }

  if (
    rulePackage.scope === "state" &&
    (rulePackage.countyGeoid || rulePackage.countyName)
  ) {
    throw new Error(
      "State-scoped jurisdiction rules must not contain county geography.",
    );
  }

  if (rulePackage.rule && rulePackage.rule.state !== rulePackage.stateCode) {
    throw new Error(
      "Jurisdiction rule state does not match its intelligence package.",
    );
  }

  if (rulePackage.paymentRouting) {
    validatePaymentRouting(rulePackage.paymentRouting, rulePackage.sources);
  }

  if (rulePackage.status === "approved") {
    if (!rulePackage.rule) {
      throw new Error(
        "An approved jurisdiction package must contain a normalized operational rule.",
      );
    }

    if (rulePackage.sources.length === 0) {
      throw new Error(
        "An approved jurisdiction package must contain at least one authoritative source.",
      );
    }

    if (!rulePackage.paymentRouting) {
      throw new Error(
        "An approved jurisdiction package must contain payment and representation routing intelligence.",
      );
    }

    if (rulePackage.paymentRouting.paymentRoute === "unknown") {
      throw new Error(
        "An approved jurisdiction package cannot have an unknown government payment route.",
      );
    }

    if (rulePackage.paymentRouting.representativeMayFile === "unknown") {
      throw new Error(
        "An approved jurisdiction package must establish whether an authorized representative may file the claim.",
      );
    }

    if (
      rulePackage.paymentRouting.assignmentRequiredForRepresentativePayment ===
      "unknown"
    ) {
      throw new Error(
        "An approved jurisdiction package must establish whether representative payment requires assignment of surplus rights.",
      );
    }

    if (!rulePackage.approvedByUserId || !rulePackage.approvedAt) {
      throw new Error(
        "An approved jurisdiction package requires final activation approval.",
      );
    }
  }
}

/* ========================================================================== */
/* Payment-route operational evaluation                                        */
/* ========================================================================== */

export interface JurisdictionPaymentRouteEvaluation {
  ready: boolean;

  launchTrack: DuequityLaunchPaymentTrack;

  reason: string;
}

export function evaluateJurisdictionPaymentRouting(
  paymentRouting: JurisdictionPaymentRouting | undefined,
): JurisdictionPaymentRouteEvaluation {
  if (!paymentRouting) {
    return {
      ready: false,

      launchTrack: "blocked",

      reason:
        "No payment and representation routing intelligence has been recorded for this jurisdiction.",
    };
  }

  if (paymentRouting.paymentRoute === "unknown") {
    return {
      ready: false,

      launchTrack: "blocked",

      reason: "The government payment route has not yet been verified.",
    };
  }

  if (paymentRouting.representativeMayFile === "unknown") {
    return {
      ready: false,

      launchTrack: paymentRouting.launchTrack,

      reason:
        "Duequity has not yet established whether an authorized representative may submit the recovery claim.",
    };
  }

  if (paymentRouting.assignmentRequiredForRepresentativePayment === "unknown") {
    return {
      ready: false,

      launchTrack: paymentRouting.launchTrack,

      reason:
        "Duequity has not yet established whether representative payment requires assignment of the claimant's surplus rights.",
    };
  }

  if (
    paymentRouting.paymentRoute === "assignee" ||
    paymentRouting.launchTrack === "future_acquisition" ||
    paymentRouting.assignmentRequiredForRepresentativePayment === "yes"
  ) {
    return {
      ready: false,

      launchTrack: "future_acquisition",

      reason:
        "This payment structure requires acquisition or assignment of surplus rights. Acquisition Recovery is intentionally disabled for the Duequity launch model.",
    };
  }

  if (paymentRouting.paymentRoute === "claimant_only") {
    return {
      ready: true,

      launchTrack: "direct_claimant_recovery",

      reason:
        "The government pays the lawful claimant or estate representative directly. Duequity may use the Direct Claimant Recovery track with a properly executed service-fee agreement.",
    };
  }

  if (
    paymentRouting.paymentRoute === "authorized_representative" ||
    paymentRouting.paymentRoute === "joint_payee" ||
    paymentRouting.paymentRoute === "split_disbursement"
  ) {
    if (paymentRouting.representativeMayReceivePayment !== "yes") {
      return {
        ready: false,

        launchTrack: paymentRouting.launchTrack,

        reason:
          "The selected managed-representative route does not yet establish that Duequity may lawfully receive or participate in the payment.",
      };
    }

    return {
      ready: true,

      launchTrack: "managed_representative_recovery",

      reason:
        "The jurisdiction supports a source-backed Managed Representative Recovery payment route without requiring Duequity to acquire the claimant's surplus rights.",
    };
  }

  return {
    ready: false,

    launchTrack: "blocked",

    reason:
      "The jurisdiction payment structure is not supported by the current Duequity launch model.",
  };
}

/* ========================================================================== */
/* Key                                                                         */
/* ========================================================================== */

export function jurisdictionRuleKey({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid?: string;

  saleType: SaleType;
}): string {
  return [stateFips, countyGeoid ?? "STATE", saleType].join(":");
}

/* ========================================================================== */
/* Read operations                                                             */
/* ========================================================================== */

export async function listJurisdictionRulePackages(): Promise<
  JurisdictionRulePackage[]
> {
  const store = await readStore();

  return [...store.packages];
}

export async function getJurisdictionRulePackage(
  id: string,
): Promise<JurisdictionRulePackage | undefined> {
  const store = await readStore();

  return store.packages.find((rulePackage) => rulePackage.id === id);
}

/* ========================================================================== */
/* Write operation                                                             */
/* ========================================================================== */

export async function upsertJurisdictionRulePackage(
  rulePackage: JurisdictionRulePackage,
): Promise<JurisdictionRulePackage> {
  validatePackage(rulePackage);

  return mutateStore((store) => {
    const existingIndex = store.packages.findIndex(
      (existing) => existing.id === rulePackage.id,
    );

    if (existingIndex >= 0) {
      store.packages[existingIndex] = rulePackage;
    } else {
      store.packages.push(rulePackage);
    }

    return rulePackage;
  });
}

/* ========================================================================== */
/* Resolution                                                                  */
/* ========================================================================== */

export interface JurisdictionRuleResolution {
  status: JurisdictionIntelligenceStatus;

  /**
   * Final national intake decision.
   *
   * true requires BOTH:
   *
   *   - a launch-supported approved legal rule
   *   - a launch-supported payment/representation route
   */
  intakeAllowed: boolean;

  /**
   * Independent payment-route readiness.
   */
  paymentRouteReady: boolean;

  launchPaymentTrack: DuequityLaunchPaymentTrack;

  paymentRouting?: JurisdictionPaymentRouting;

  sourceScope: "county" | "state" | "none";

  inheritedFromState: boolean;

  packageId?: string;

  packageVersion?: number;

  rule?: Jurisdiction;

  sources: JurisdictionAuthoritySource[];

  reason: string;
}

function resolutionFromPackage(
  rulePackage: JurisdictionRulePackage,
): JurisdictionRuleResolution {
  const paymentEvaluation = evaluateJurisdictionPaymentRouting(
    rulePackage.paymentRouting,
  );

  if (rulePackage.status !== "approved" || !rulePackage.rule) {
    return {
      status: rulePackage.status,

      intakeAllowed: false,

      paymentRouteReady: paymentEvaluation.ready,

      launchPaymentTrack: paymentEvaluation.launchTrack,

      paymentRouting: rulePackage.paymentRouting,

      sourceScope: rulePackage.scope,

      inheritedFromState: rulePackage.scope === "state",

      packageId: rulePackage.id,

      packageVersion: rulePackage.version,

      sources: rulePackage.sources,

      reason:
        rulePackage.conflictReason ??
        rulePackage.reviewReason ??
        "This jurisdiction rule has not been approved for live operation.",
    };
  }

  const complianceStatus = rulePackage.rule.complianceStatus;

  /*
   * Duequity's launch Green Lane is intentionally administrative.
   *
   * Attorney-only jurisdictions remain represented accurately in the legal
   * model, but they do not become live intake jurisdictions during the
   * startup launch phase.
   */
  const legalIntakeAllowed = complianceStatus === "approved";

  const intakeAllowed = legalIntakeAllowed && paymentEvaluation.ready;

  let reason: string;

  switch (complianceStatus) {
    case "approved":
      if (!paymentEvaluation.ready) {
        reason = `The jurisdiction legal rule is approved, but live intake remains closed because the payment and representation route is not operationally cleared. ${paymentEvaluation.reason}`;
      } else if (paymentEvaluation.launchTrack === "direct_claimant_recovery") {
        reason =
          rulePackage.scope === "county"
            ? "Approved county-specific legal rule and Direct Claimant Recovery payment route resolved. Administrative intake is cleared subject to the recorded rule, claimant verification, executed service agreement, and case-level compliance checks."
            : "Approved statewide legal rule and Direct Claimant Recovery payment route resolved. Administrative intake is cleared subject to the recorded rule, claimant verification, executed service agreement, and case-level compliance checks.";
      } else {
        reason =
          rulePackage.scope === "county"
            ? "Approved county-specific legal rule and Managed Representative Recovery payment route resolved. Administrative intake is cleared subject to the recorded authorization, claimant verification, executed service agreement, and case-level compliance checks."
            : "Approved statewide legal rule and Managed Representative Recovery payment route resolved. Administrative intake is cleared subject to the recorded authorization, claimant verification, executed service agreement, and case-level compliance checks.";
      }

      break;

    case "attorney_only":
      reason =
        "The jurisdiction requires an attorney workflow. Duequity's startup Green Lane is limited to straightforward administrative recoveries, so live intake remains closed.";

      break;

    case "restricted":
      reason =
        "The approved legal review records this jurisdiction as restricted. Intake remains closed.";

      break;

    case "paused":
      reason =
        "The approved jurisdiction rule is currently paused. Intake remains closed until the pause is lifted through a new reviewed rule version.";

      break;

    case "research_required":
      reason =
        "The approved package records unresolved legal research requirements. Intake remains closed.";

      break;

    case "under_legal_review":
      reason =
        "The approved package records that legal review is still required. Intake remains closed.";
      break;
  }

  return {
    status: "approved",

    intakeAllowed,

    paymentRouteReady: paymentEvaluation.ready,

    launchPaymentTrack: paymentEvaluation.launchTrack,

    paymentRouting: rulePackage.paymentRouting,

    sourceScope: rulePackage.scope,

    inheritedFromState: rulePackage.scope === "state",

    packageId: rulePackage.id,

    packageVersion: rulePackage.version,

    rule: rulePackage.rule,

    sources: rulePackage.sources,

    reason,
  };
}

export async function resolveJurisdictionRule({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): Promise<JurisdictionRuleResolution> {
  assertFips(stateFips);

  assertCountyGeoid(countyGeoid, stateFips);

  const store = await readStore();

  const countyMatches = store.packages.filter(
    (rulePackage) =>
      rulePackage.scope === "county" &&
      rulePackage.stateFips === stateFips &&
      rulePackage.countyGeoid === countyGeoid &&
      rulePackage.saleType === saleType,
  );

  /*
   * More than one package claiming to be current for the exact county +
   * sale type is itself a conflict.
   *
   * Never guess which package should control.
   */
  if (countyMatches.length > 1) {
    return {
      status: "conflict",

      intakeAllowed: false,

      paymentRouteReady: false,

      launchPaymentTrack: "blocked",

      sourceScope: "county",

      inheritedFromState: false,

      sources: countyMatches.flatMap((rulePackage) => rulePackage.sources),

      reason:
        "Multiple county rule packages exist for the same GEOID and sale type. Review is required.",
    };
  }

  if (countyMatches.length === 1) {
    return resolutionFromPackage(countyMatches[0]);
  }

  const stateMatches = store.packages.filter(
    (rulePackage) =>
      rulePackage.scope === "state" &&
      rulePackage.stateFips === stateFips &&
      rulePackage.saleType === saleType,
  );

  if (stateMatches.length > 1) {
    return {
      status: "conflict",

      intakeAllowed: false,

      paymentRouteReady: false,

      launchPaymentTrack: "blocked",

      sourceScope: "state",

      inheritedFromState: true,

      sources: stateMatches.flatMap((rulePackage) => rulePackage.sources),

      reason:
        "Multiple statewide rule packages exist for the same state and sale type. Review is required.",
    };
  }

  if (stateMatches.length === 1) {
    return resolutionFromPackage(stateMatches[0]);
  }

  /*
   * The essential nationwide safety behavior:
   *
   * Existing Census geography never implies legal, commercial, payment, or
   * claimant-intake clearance.
   */
  return {
    status: "unverified",

    intakeAllowed: false,

    paymentRouteReady: false,

    launchPaymentTrack: "blocked",

    sourceScope: "none",

    inheritedFromState: false,

    sources: [],

    reason:
      "No verified jurisdiction rule package exists for this county and sale type. Duequity must research and approve the legal, representation, fee, and payment-routing requirements before live intake.",
  };
}

/* ========================================================================== */
/* Address + sale type                                                         */
/* ========================================================================== */

export interface AddressJurisdictionIntelligence {
  geography: ResolvedAddressGeography;

  saleType: SaleType;

  jurisdiction: JurisdictionRuleResolution;
}

/**
 * Complete national decision boundary:
 *
 *   property address
 *     -> Census state/county geography
 *     -> county GEOID
 *     -> sale type
 *     -> approved county rule or inherited state rule
 *     -> approved representation/payment route
 *     -> launch-supported recovery track
 *
 * Unknown legal or payment rules fail closed.
 */
export async function resolveAddressJurisdictionIntelligence(
  address: string,
  saleType: SaleType,
): Promise<AddressJurisdictionIntelligence> {
  const geography = await resolveAddressGeography(address);

  const jurisdiction = await resolveJurisdictionRule({
    stateFips: geography.state.stateFips,

    countyGeoid: geography.county.geoid,

    saleType,
  });

  return {
    geography,

    saleType,

    jurisdiction,
  };
}
