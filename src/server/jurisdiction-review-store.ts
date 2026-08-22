import "server-only";

import { createHash } from "node:crypto";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

import { dirname, join } from "node:path";

import type {
  ComplianceStatus,
  Cents,
  ClaimSubmissionMethod,
  DocumentKind,
  FeeModel,
  Jurisdiction,
  SaleType,
  StateCode,
  SurplusCustodian,
} from "@/domain/types";

import type { LegalProcessingRule } from "@/domain/legal";

import {
  getJurisdictionEvidencePacket,
  type HarvestedDomainResult,
  type HarvestedEvidenceSource,
} from "@/server/jurisdiction-evidence-harvester";

import {
  getJurisdictionRulePackage,
  upsertJurisdictionRulePackage,
  type DuequityLaunchPaymentTrack,
  type JurisdictionAuthoritySource,
  type JurisdictionAuthoritySourceKind,
  type JurisdictionFeeCollectionMethod,
  type JurisdictionPaymentRoute,
  type JurisdictionPaymentRouting,
  type JurisdictionRulePackage,
  type JurisdictionRuleScope,
  type JurisdictionYesNoUnknown,
} from "@/server/jurisdiction-intelligence";

/**
 * DUEQUITY JURISDICTION REVIEW STORE
 *
 * Human-governed bridge between official-source evidence and an operational
 * jurisdiction rule.
 *
 * The evidence harvester discovers and preserves official material.
 *
 * This module creates a review workspace from that evidence, but it never:
 *
 *   - interprets unknown law automatically
 *   - converts unknown findings into permissive defaults
 *   - approves a jurisdiction automatically
 *   - authorizes claimant intake automatically
 *   - creates Opportunities
 *   - creates Claims
 *   - authorizes outreach
 *
 * Current Duequity launch recovery tracks:
 *
 *   DIRECT CLAIMANT RECOVERY
 *
 *   Government pays the lawful claimant or estate representative.
 *   Duequity earns its contractually agreed fee under an executed service
 *   agreement after successful recovery.
 *
 *   MANAGED REPRESENTATIVE RECOVERY
 *
 *   Government expressly permits Duequity, acting as an authorized
 *   representative, to receive or participate in the payment without Duequity
 *   acquiring ownership of the claimant's surplus rights.
 *
 * Future Acquisition Recovery may be researched and recorded but remains
 * outside the Duequity startup launch model.
 *
 * Human approval boundary:
 *
 *   evidence packet
 *     -> human review draft
 *     -> human records findings
 *     -> payment/representation route classified
 *     -> human marks every required finding reviewed
 *     -> separate compliance approval
 *     -> approved JurisdictionRulePackage
 *
 * Unknown is structurally different from:
 *
 *   - No
 *   - zero
 *   - empty list
 *   - permitted
 */

/* ========================================================================== */
/* Review status                                                               */
/* ========================================================================== */

export type JurisdictionReviewStatus =
  "draft" | "ready_for_approval" | "changes_required" | "approved";

/* ========================================================================== */
/* Finding keys                                                                */
/* ========================================================================== */

/**
 * A finding can be reviewed even when its value is legitimately absent.
 *
 * Example:
 *
 * feeCapPercent omitted + percentage_fee_cap reviewed
 *
 * means the reviewer concluded no percentage cap is recorded in the reviewed
 * authority.
 *
 * feeCapPercent omitted + percentage_fee_cap NOT reviewed
 *
 * means the question is still open.
 *
 * payment_routing is a composite reviewed finding. Its structured values are:
 *
 *   paymentRoute
 *   paymentLaunchTrack
 *   representativeMayFile
 *   representativeMayReceivePayment
 *   assignmentRequiredForRepresentativePayment
 *   feeCollectionMethod
 *
 * Keeping payment_routing as one finding key preserves compatibility with the
 * existing review workflow while giving Duequity a structured operational
 * payment model.
 */
export type JurisdictionReviewFindingKey =
  | "agency_contact"
  | "custodian"
  | "claim_method"
  | "required_documents"
  | "claim_deadline"
  | "controlling_authority"
  | "fee_models"
  | "percentage_fee_cap"
  | "amount_fee_cap"
  | "assignment"
  | "power_of_attorney"
  | "finder_license"
  | "bond"
  | "attorney_requirement"
  | "contract_language"
  | "cancellation_period"
  | "payment_routing"
  | "probate_requirement"
  | "compliance_status"
  | "legal_processing_rule";

export const REQUIRED_REVIEW_FINDINGS: readonly JurisdictionReviewFindingKey[] =
  [
    "agency_contact",
    "custodian",
    "claim_method",
    "required_documents",
    "claim_deadline",
    "controlling_authority",
    "fee_models",
    "percentage_fee_cap",
    "amount_fee_cap",
    "assignment",
    "power_of_attorney",
    "finder_license",
    "bond",
    "attorney_requirement",
    "contract_language",
    "cancellation_period",
    "payment_routing",
    "probate_requirement",
    "compliance_status",
    "legal_processing_rule",
  ] as const;

/* ========================================================================== */
/* Findings                                                                    */
/* ========================================================================== */

export interface JurisdictionReviewFindings {
  /**
   * Optional explicit jurisdiction id.
   *
   * If omitted, approval generates a stable id from geography + sale type.
   */
  jurisdictionId?: string;

  agencyName?: string;

  agencyWebsite?: string;

  agencyPhone?: string;

  agencyAddress?: Jurisdiction["agencyAddress"];

  custodian?: SurplusCustodian;

  claimMethod?: ClaimSubmissionMethod;

  claimFormUrl?: string;

  requiredDocuments?: DocumentKind[];

  claimDeadlineDays?: number;

  statuteReference?: string;

  permittedFeeModels?: FeeModel[];

  feeCapPercent?: number;

  feeCapAmount?: Cents;

  assignmentPermitted?: boolean;

  powerOfAttorneyAccepted?: boolean;

  finderLicenseRequired?: boolean;

  bondRequired?: boolean;

  attorneyRequired?: boolean;

  mandatoryContractLanguage?: string[];

  cancellationPeriodDays?: number;

  /**
   * Legacy human-readable operational payment note retained on Jurisdiction.
   */
  paymentRoutingNote?: string;

  /**
   * Structured government payment route.
   *
   * This answers:
   *
   * Who receives the government recovery?
   */
  paymentRoute?: JurisdictionPaymentRoute;

  /**
   * Duequity commercial track selected from the verified government route.
   */
  paymentLaunchTrack?: DuequityLaunchPaymentTrack;

  /**
   * Whether an authorized administrative representative may file or submit
   * the claim.
   */
  representativeMayFile?: JurisdictionYesNoUnknown;

  /**
   * Whether an authorized representative may receive or participate in the
   * government payment without acquiring the claimant's surplus rights.
   */
  representativeMayReceivePayment?: JurisdictionYesNoUnknown;

  /**
   * Whether payment to a representative requires assignment or acquisition of
   * the claimant's surplus rights.
   */
  assignmentRequiredForRepresentativePayment?: JurisdictionYesNoUnknown;

  /**
   * Duequity fee collection method supported by the verified payment route.
   */
  feeCollectionMethod?: JurisdictionFeeCollectionMethod;

  probateRequiredWhenDeceased?: boolean;

  complianceStatus?: ComplianceStatus;

  legalProcessingRule?: LegalProcessingRule;

  legalRuleEffectiveFrom?: string;

  legalRuleEffectiveThrough?: string;

  legalReviewDueAt?: string;

  internalNotes?: string;
}

/* ========================================================================== */
/* Review record                                                               */
/* ========================================================================== */

export interface JurisdictionReviewDraft {
  schemaVersion: 1;

  id: string;

  revision: number;

  stateFips: string;

  stateCode: StateCode;

  stateName: string;

  countyGeoid: string;

  countyName?: string;

  saleType: SaleType;

  /**
   * The evidence packet is county-targeted for research.
   *
   * The human reviewer separately determines whether the resulting rule is
   * statewide or county specific.
   */
  scope?: JurisdictionRuleScope;

  status: JurisdictionReviewStatus;

  evidencePacketId: string;

  evidencePacketHash: string;

  evidenceStatus: "complete" | "partial" | "failed";

  evidenceHarvestedAt: string;

  /**
   * Official-source records imported from the evidence packet.
   *
   * Importing a source is not acceptance of a legal proposition.
   */
  sourceCandidates: JurisdictionAuthoritySource[];

  /**
   * Additional official sources a reviewer adds during legal research.
   */
  additionalSources: JurisdictionAuthoritySource[];

  /**
   * Sources the human reviewer affirmatively relies upon for the rule package.
   */
  selectedSourceIds: string[];

  findings: JurisdictionReviewFindings;

  /**
   * Which legal/operational questions the human has actually reviewed.
   *
   * This is deliberately separate from values so unknown cannot silently
   * become false, zero, an empty list, or permissive.
   */
  reviewedFindings: JurisdictionReviewFindingKey[];

  /**
   * Field-level provenance.
   *
   * payment_routing source ids become the evidenceSourceIds stored in the
   * approved JurisdictionPaymentRouting object.
   */
  findingSourceIds: Partial<Record<JurisdictionReviewFindingKey, string[]>>;

  reviewReason?: string;

  conflictReason?: string;

  reviewNotes?: string;

  createdByUserId: string;

  createdByName: string;

  createdAt: string;

  updatedByUserId: string;

  updatedByName: string;

  updatedAt: string;

  approvedPackageId?: string;

  approvedPackageVersion?: number;

  approvedByUserId?: string;

  approvedByName?: string;

  approvedAt?: string;
}

/* ========================================================================== */
/* Store                                                                       */
/* ========================================================================== */

interface JurisdictionReviewStore {
  schemaVersion: 1;

  drafts: JurisdictionReviewDraft[];
}

const STORE_PATH = join(
  process.cwd(),
  ".duequity-data",
  "jurisdiction-reviews.json",
);

const EMPTY_STORE: JurisdictionReviewStore = {
  schemaVersion: 1,

  drafts: [],
};

let mutationQueue: Promise<void> = Promise.resolve();

/* ========================================================================== */
/* Store helpers                                                               */
/* ========================================================================== */

async function readStore(): Promise<JurisdictionReviewStore> {
  let raw: string;

  try {
    raw = await readFile(STORE_PATH, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      return {
        ...EMPTY_STORE,

        drafts: [],
      };
    }

    throw error;
  }

  const normalized = raw.replace(/^\uFEFF/, "");

  let parsed: JurisdictionReviewStore;

  try {
    parsed = JSON.parse(normalized) as JurisdictionReviewStore;
  } catch {
    throw new Error(
      "Duequity jurisdiction review store contains invalid JSON.",
    );
  }

  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.drafts)) {
    throw new Error(
      "Duequity jurisdiction review store failed schema validation.",
    );
  }

  return parsed;
}

async function writeStore(store: JurisdictionReviewStore): Promise<void> {
  await mkdir(dirname(STORE_PATH), {
    recursive: true,
  });

  const tempPath = `${STORE_PATH}.tmp`;

  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");

  await rename(tempPath, STORE_PATH);
}

async function mutateStore<T>(
  mutation: (store: JurisdictionReviewStore) => Promise<T> | T,
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
/* Helpers                                                                     */
/* ========================================================================== */

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function stableSourceId(url: string): string {
  return `jsrc-${sha256(url).slice(0, 20)}`;
}

function stableReviewPrefix({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): string {
  return ["jrev", stateFips, countyGeoid, saleType].join("-");
}

function reviewId({
  stateFips,
  countyGeoid,
  saleType,
  revision,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;

  revision: number;
}): string {
  return `${stableReviewPrefix({
    stateFips,
    countyGeoid,
    saleType,
  })}-r${revision}`;
}

function normalizedOrganizationText(domain: HarvestedDomainResult): string {
  return `${domain.domain} ${domain.organizationName}`.toLowerCase();
}

function authorityKindForEvidence(
  domain: HarvestedDomainResult,
  source: HarvestedEvidenceSource,
): JurisdictionAuthoritySourceKind {
  const text = `${normalizedOrganizationText(
    domain,
  )} ${source.url} ${source.title ?? ""}`.toLowerCase();

  if (text.includes("official form") || /\/forms?\//.test(text)) {
    return "official_form";
  }

  if (text.includes("court rule")) {
    return "court_rule";
  }

  if (
    text.includes("statute") ||
    text.includes("legislature") ||
    text.includes("code of maryland")
  ) {
    return "statute";
  }

  if (
    text.includes("court") ||
    text.includes("judiciary") ||
    text.includes("mdcourts") ||
    text.includes("appellate")
  ) {
    return "judiciary";
  }

  if (text.includes("clerk")) {
    return "clerk";
  }

  if (text.includes("tax collector")) {
    return "tax_collector";
  }

  if (text.includes("treasurer")) {
    return "treasurer";
  }

  if (text.includes("sheriff")) {
    return "sheriff";
  }

  if (text.includes("fee") && text.includes("schedule")) {
    return "fee_schedule";
  }

  if (text.includes("regulator") || text.includes("regulation")) {
    return "regulator";
  }

  if (domain.scope === "county_exact") {
    return "county_agency";
  }

  if (domain.scope === "statewide_authority") {
    return "state_agency";
  }

  return "other_official";
}

function evidenceSourcesFromPacket(
  domains: HarvestedDomainResult[],
  fallbackRetrievedAt: string,
): JurisdictionAuthoritySource[] {
  const byUrl = new Map<string, JurisdictionAuthoritySource>();

  for (const domain of domains) {
    const evidence = [...domain.pages, ...domain.documents];

    for (const source of evidence) {
      if (source.retrievalStatus !== "retrieved" || !source.url) {
        continue;
      }

      if (byUrl.has(source.url)) {
        continue;
      }

      byUrl.set(source.url, {
        id: stableSourceId(source.url),

        kind: authorityKindForEvidence(domain, source),

        authorityName: domain.organizationName || domain.domain,

        url: source.url,

        title: source.title,

        retrievedAt: source.retrievedAt ?? fallbackRetrievedAt,

        contentHash: source.contentHash,
      });
    }
  }

  return [...byUrl.values()];
}

function allSources(
  draft: JurisdictionReviewDraft,
): JurisdictionAuthoritySource[] {
  return [...draft.sourceCandidates, ...draft.additionalSources];
}

function selectedSources(
  draft: JurisdictionReviewDraft,
): JurisdictionAuthoritySource[] {
  const ids = new Set(draft.selectedSourceIds);

  return allSources(draft).filter((source) => ids.has(source.id));
}

function assertFiniteNonNegative(
  value: number | undefined,
  label: string,
): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number when recorded.`);
  }
}

/* ========================================================================== */
/* Structured payment validation                                               */
/* ========================================================================== */

const PAYMENT_ROUTES: readonly JurisdictionPaymentRoute[] = [
  "claimant_only",
  "authorized_representative",
  "joint_payee",
  "split_disbursement",
  "assignee",
  "unknown",
];

const PAYMENT_TRACKS: readonly DuequityLaunchPaymentTrack[] = [
  "direct_claimant_recovery",
  "managed_representative_recovery",
  "future_acquisition",
  "blocked",
];

const YES_NO_UNKNOWN_VALUES: readonly JurisdictionYesNoUnknown[] = [
  "yes",
  "no",
  "unknown",
];

const FEE_COLLECTION_METHODS: readonly JurisdictionFeeCollectionMethod[] = [
  "contractual_post_recovery",
  "representative_disbursement",
  "joint_payee_disbursement",
  "split_disbursement",
  "assignment_acquisition",
  "unknown",
];

function validatePaymentFindingValues(
  findings: JurisdictionReviewFindings,
): void {
  if (
    findings.paymentRoute !== undefined &&
    !PAYMENT_ROUTES.includes(findings.paymentRoute)
  ) {
    throw new Error("Jurisdiction paymentRoute contains an unsupported value.");
  }

  if (
    findings.paymentLaunchTrack !== undefined &&
    !PAYMENT_TRACKS.includes(findings.paymentLaunchTrack)
  ) {
    throw new Error(
      "Jurisdiction paymentLaunchTrack contains an unsupported value.",
    );
  }

  if (
    findings.representativeMayFile !== undefined &&
    !YES_NO_UNKNOWN_VALUES.includes(findings.representativeMayFile)
  ) {
    throw new Error("representativeMayFile must be yes, no, or unknown.");
  }

  if (
    findings.representativeMayReceivePayment !== undefined &&
    !YES_NO_UNKNOWN_VALUES.includes(findings.representativeMayReceivePayment)
  ) {
    throw new Error(
      "representativeMayReceivePayment must be yes, no, or unknown.",
    );
  }

  if (
    findings.assignmentRequiredForRepresentativePayment !== undefined &&
    !YES_NO_UNKNOWN_VALUES.includes(
      findings.assignmentRequiredForRepresentativePayment,
    )
  ) {
    throw new Error(
      "assignmentRequiredForRepresentativePayment must be yes, no, or unknown.",
    );
  }

  if (
    findings.feeCollectionMethod !== undefined &&
    !FEE_COLLECTION_METHODS.includes(findings.feeCollectionMethod)
  ) {
    throw new Error(
      "Jurisdiction feeCollectionMethod contains an unsupported value.",
    );
  }
}

function assertPaymentRoutingConsistency(
  findings: JurisdictionReviewFindings,
): void {
  const paymentRoute = findings.paymentRoute!;

  const launchTrack = findings.paymentLaunchTrack!;

  const representativeMayReceivePayment =
    findings.representativeMayReceivePayment!;

  const assignmentRequired =
    findings.assignmentRequiredForRepresentativePayment!;

  const feeCollectionMethod = findings.feeCollectionMethod!;

  switch (paymentRoute) {
    case "claimant_only":
      if (launchTrack !== "direct_claimant_recovery") {
        throw new Error(
          "Claimant-only payment must use the Direct Claimant Recovery track.",
        );
      }

      if (representativeMayReceivePayment !== "no") {
        throw new Error(
          "Claimant-only payment requires representativeMayReceivePayment to be no.",
        );
      }

      if (assignmentRequired !== "no") {
        throw new Error(
          "Claimant-only recovery must not require assignment of surplus rights.",
        );
      }

      if (feeCollectionMethod !== "contractual_post_recovery") {
        throw new Error(
          "Claimant-only recovery must use contractual post-recovery fee collection.",
        );
      }

      break;

    case "authorized_representative":
      if (launchTrack !== "managed_representative_recovery") {
        throw new Error(
          "Authorized-representative payment must use Managed Representative Recovery.",
        );
      }

      if (representativeMayReceivePayment !== "yes") {
        throw new Error(
          "Authorized-representative payment requires representativeMayReceivePayment to be yes.",
        );
      }

      if (assignmentRequired !== "no") {
        throw new Error(
          "Managed Representative Recovery cannot require assignment of surplus rights.",
        );
      }

      if (feeCollectionMethod !== "representative_disbursement") {
        throw new Error(
          "Authorized-representative payment must use representative disbursement.",
        );
      }

      break;

    case "joint_payee":
      if (launchTrack !== "managed_representative_recovery") {
        throw new Error(
          "Joint-payee payment must use Managed Representative Recovery.",
        );
      }

      if (representativeMayReceivePayment !== "yes") {
        throw new Error(
          "Joint-payee payment requires representativeMayReceivePayment to be yes.",
        );
      }

      if (assignmentRequired !== "no") {
        throw new Error(
          "A launch-supported joint-payee route cannot require assignment of surplus rights.",
        );
      }

      if (feeCollectionMethod !== "joint_payee_disbursement") {
        throw new Error(
          "Joint-payee payment must use joint-payee disbursement.",
        );
      }

      break;

    case "split_disbursement":
      if (launchTrack !== "managed_representative_recovery") {
        throw new Error(
          "Split disbursement must use Managed Representative Recovery.",
        );
      }

      if (representativeMayReceivePayment !== "yes") {
        throw new Error(
          "Split disbursement requires representativeMayReceivePayment to be yes.",
        );
      }

      if (assignmentRequired !== "no") {
        throw new Error(
          "A launch-supported split-disbursement route cannot require assignment of surplus rights.",
        );
      }

      if (feeCollectionMethod !== "split_disbursement") {
        throw new Error(
          "Split-disbursement payment must use split-disbursement fee collection.",
        );
      }

      break;

    case "assignee":
      if (launchTrack !== "future_acquisition") {
        throw new Error(
          "An assignee payment route belongs only to the future Acquisition Recovery track.",
        );
      }

      if (assignmentRequired !== "yes") {
        throw new Error(
          "An assignee payment route must require assignment of surplus rights.",
        );
      }

      if (feeCollectionMethod !== "assignment_acquisition") {
        throw new Error("An assignee route must use assignment acquisition.");
      }

      break;

    case "unknown":
      if (launchTrack !== "blocked") {
        throw new Error("An unknown payment route must remain blocked.");
      }

      if (feeCollectionMethod !== "unknown") {
        throw new Error(
          "An unknown payment route must use an unknown fee collection method.",
        );
      }

      break;
  }
}

/* ========================================================================== */
/* Review validation                                                           */
/* ========================================================================== */

function validateFindings(findings: JurisdictionReviewFindings): void {
  assertFiniteNonNegative(findings.claimDeadlineDays, "Claim deadline days");

  assertFiniteNonNegative(findings.feeCapAmount, "Fee cap amount");

  assertFiniteNonNegative(
    findings.cancellationPeriodDays,
    "Cancellation period days",
  );

  if (findings.feeCapPercent !== undefined) {
    if (
      !Number.isFinite(findings.feeCapPercent) ||
      findings.feeCapPercent < 0 ||
      findings.feeCapPercent > 1
    ) {
      throw new Error("Fee cap percent must be between 0 and 1 when recorded.");
    }
  }

  validatePaymentFindingValues(findings);
}

function assertSelectedSourceIds(draft: JurisdictionReviewDraft): void {
  const available = new Set(allSources(draft).map((source) => source.id));

  for (const sourceId of draft.selectedSourceIds) {
    if (!available.has(sourceId)) {
      throw new Error(
        `Selected jurisdiction source ${sourceId} is not available on this review.`,
      );
    }
  }

  for (const [finding, sourceIds] of Object.entries(draft.findingSourceIds)) {
    for (const sourceId of sourceIds ?? []) {
      if (!available.has(sourceId)) {
        throw new Error(
          `Finding ${finding} references unavailable source ${sourceId}.`,
        );
      }
    }
  }
}

function paymentRoutingEvidenceSourceIds(
  draft: JurisdictionReviewDraft,
): string[] {
  return [...new Set(draft.findingSourceIds.payment_routing ?? [])];
}

function assertPaymentRoutingEvidence(draft: JurisdictionReviewDraft): void {
  const evidenceSourceIds = paymentRoutingEvidenceSourceIds(draft);

  if (evidenceSourceIds.length === 0) {
    throw new Error(
      "Payment routing requires at least one official supporting source.",
    );
  }

  const selected = new Set(draft.selectedSourceIds);

  for (const sourceId of evidenceSourceIds) {
    if (!selected.has(sourceId)) {
      throw new Error(
        `Payment-routing evidence source ${sourceId} must also be selected as an authority source for the approved jurisdiction package.`,
      );
    }
  }
}

function missingReviewedFindings(
  draft: JurisdictionReviewDraft,
): JurisdictionReviewFindingKey[] {
  const reviewed = new Set(draft.reviewedFindings);

  return REQUIRED_REVIEW_FINDINGS.filter((finding) => !reviewed.has(finding));
}

function assertRequiredCanonicalValues(draft: JurisdictionReviewDraft): void {
  const findings = draft.findings;

  const missing: string[] = [];

  if (!findings.agencyName?.trim()) {
    missing.push("agencyName");
  }

  if (!findings.custodian) {
    missing.push("custodian");
  }

  if (!findings.claimMethod) {
    missing.push("claimMethod");
  }

  if (!Array.isArray(findings.requiredDocuments)) {
    missing.push("requiredDocuments");
  }

  if (!Array.isArray(findings.permittedFeeModels)) {
    missing.push("permittedFeeModels");
  }

  const requiredBooleans: Array<keyof JurisdictionReviewFindings> = [
    "assignmentPermitted",
    "powerOfAttorneyAccepted",
    "finderLicenseRequired",
    "bondRequired",
    "attorneyRequired",
    "probateRequiredWhenDeceased",
  ];

  for (const key of requiredBooleans) {
    if (typeof findings[key] !== "boolean") {
      missing.push(String(key));
    }
  }

  if (!findings.paymentRoute) {
    missing.push("paymentRoute");
  }

  if (!findings.paymentLaunchTrack) {
    missing.push("paymentLaunchTrack");
  }

  if (!findings.representativeMayFile) {
    missing.push("representativeMayFile");
  }

  if (!findings.representativeMayReceivePayment) {
    missing.push("representativeMayReceivePayment");
  }

  if (!findings.assignmentRequiredForRepresentativePayment) {
    missing.push("assignmentRequiredForRepresentativePayment");
  }

  if (!findings.feeCollectionMethod) {
    missing.push("feeCollectionMethod");
  }

  if (!findings.complianceStatus) {
    missing.push("complianceStatus");
  }

  if (!findings.legalProcessingRule) {
    missing.push("legalProcessingRule");
  }

  if (missing.length > 0) {
    throw new Error(
      `Jurisdiction review is missing required operational values: ${missing.join(
        ", ",
      )}.`,
    );
  }

  /*
   * Approval requires actual determinations, not "unknown".
   *
   * Unknown routes belong in draft / changes-required review state.
   */
  if (findings.paymentRoute === "unknown") {
    throw new Error(
      "A jurisdiction review cannot be approved while the government payment route is unknown.",
    );
  }

  if (findings.representativeMayFile === "unknown") {
    throw new Error(
      "A jurisdiction review cannot be approved until representative filing authority is determined.",
    );
  }

  if (findings.representativeMayReceivePayment === "unknown") {
    throw new Error(
      "A jurisdiction review cannot be approved until representative payment authority is determined.",
    );
  }

  if (findings.assignmentRequiredForRepresentativePayment === "unknown") {
    throw new Error(
      "A jurisdiction review cannot be approved until assignment requirements for representative payment are determined.",
    );
  }

  if (findings.feeCollectionMethod === "unknown") {
    throw new Error(
      "A jurisdiction review cannot be approved while Duequity's fee collection method is unknown.",
    );
  }

  if (findings.paymentLaunchTrack === "blocked") {
    throw new Error(
      "A jurisdiction review with a blocked launch payment track cannot be activated.",
    );
  }

  assertPaymentRoutingConsistency(findings);

  assertPaymentRoutingEvidence(draft);
}

/* ========================================================================== */
/* Stable identifiers                                                          */
/* ========================================================================== */

function stableJurisdictionId(draft: JurisdictionReviewDraft): string {
  if (draft.findings.jurisdictionId?.trim()) {
    return draft.findings.jurisdictionId.trim();
  }

  const scopePart = draft.scope === "county" ? draft.countyGeoid : "state";

  return ["jur", draft.stateCode.toLowerCase(), scopePart, draft.saleType].join(
    "-",
  );
}

function stablePackageId(draft: JurisdictionReviewDraft): string {
  const scopePart = draft.scope === "county" ? draft.countyGeoid : "state";

  return ["jurpkg", draft.stateFips, scopePart, draft.saleType].join("-");
}

/* ========================================================================== */
/* Payment-routing builder                                                     */
/* ========================================================================== */

function buildPaymentRouting(
  draft: JurisdictionReviewDraft,
): JurisdictionPaymentRouting {
  assertRequiredCanonicalValues(draft);

  const findings = draft.findings;

  return {
    paymentRoute: findings.paymentRoute!,

    launchTrack: findings.paymentLaunchTrack!,

    representativeMayFile: findings.representativeMayFile!,

    representativeMayReceivePayment: findings.representativeMayReceivePayment!,

    assignmentRequiredForRepresentativePayment:
      findings.assignmentRequiredForRepresentativePayment!,

    feeCollectionMethod: findings.feeCollectionMethod!,

    evidenceSourceIds: paymentRoutingEvidenceSourceIds(draft),

    notes: findings.paymentRoutingNote?.trim() || undefined,
  };
}

/* ========================================================================== */
/* Read operations                                                             */
/* ========================================================================== */

export async function listJurisdictionReviewDrafts(): Promise<
  JurisdictionReviewDraft[]
> {
  const store = await readStore();

  return [...store.drafts].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function getJurisdictionReviewDraft(
  id: string,
): Promise<JurisdictionReviewDraft | undefined> {
  const store = await readStore();

  return store.drafts.find((draft) => draft.id === id);
}

export async function getLatestJurisdictionReviewDraft({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): Promise<JurisdictionReviewDraft | undefined> {
  const store = await readStore();

  return store.drafts
    .filter(
      (draft) =>
        draft.stateFips === stateFips &&
        draft.countyGeoid === countyGeoid &&
        draft.saleType === saleType,
    )
    .sort((a, b) => b.revision - a.revision)[0];
}

/* ========================================================================== */
/* Create from evidence                                                        */
/* ========================================================================== */

export async function createJurisdictionReviewDraftFromEvidence({
  stateFips,
  countyGeoid,
  saleType,
  actorUserId,
  actorName,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;

  actorUserId: string;

  actorName: string;
}): Promise<JurisdictionReviewDraft> {
  const packet = await getJurisdictionEvidencePacket({
    stateFips,
    countyGeoid,
    saleType,
  });

  if (!packet) {
    throw new Error(
      "No jurisdiction evidence packet exists for this geography and sale type.",
    );
  }

  if (packet.evidenceStatus !== "complete") {
    throw new Error(
      `Jurisdiction evidence must be complete before a legal review draft is created. Current evidence status: ${packet.evidenceStatus}.`,
    );
  }

  return mutateStore((store) => {
    const existing = store.drafts
      .filter(
        (draft) =>
          draft.stateFips === stateFips &&
          draft.countyGeoid === countyGeoid &&
          draft.saleType === saleType,
      )
      .sort((a, b) => b.revision - a.revision)[0];

    if (existing && existing.evidencePacketHash === packet.packetHash) {
      return existing;
    }

    const revision = (existing?.revision ?? 0) + 1;

    const now = nowIso();

    const draft: JurisdictionReviewDraft = {
      schemaVersion: 1,

      id: reviewId({
        stateFips,
        countyGeoid,
        saleType,
        revision,
      }),

      revision,

      stateFips: packet.stateFips,

      stateCode: packet.stateCode as StateCode,

      stateName: packet.stateName,

      countyGeoid: packet.countyGeoid,

      countyName: packet.countyName,

      saleType: packet.saleType,

      status: "draft",

      evidencePacketId: packet.id,

      evidencePacketHash: packet.packetHash,

      evidenceStatus: packet.evidenceStatus,

      evidenceHarvestedAt: packet.harvestedAt,

      sourceCandidates: evidenceSourcesFromPacket(
        packet.domains,
        packet.harvestedAt,
      ),

      additionalSources: [],

      selectedSourceIds: [],

      findings: {},

      reviewedFindings: [],

      findingSourceIds: {},

      reviewReason:
        "Official-source evidence is complete. Human legal, payment-routing, and compliance review is required before any jurisdiction rule may be activated.",

      createdByUserId: actorUserId,

      createdByName: actorName,

      createdAt: now,

      updatedByUserId: actorUserId,

      updatedByName: actorName,

      updatedAt: now,
    };

    store.drafts.push(draft);

    return draft;
  });
}

/* ========================================================================== */
/* Save review                                                                 */
/* ========================================================================== */

export interface JurisdictionReviewUpdate {
  scope?: JurisdictionRuleScope;

  findings?: JurisdictionReviewFindings;

  reviewedFindings?: JurisdictionReviewFindingKey[];

  selectedSourceIds?: string[];

  additionalSources?: JurisdictionAuthoritySource[];

  findingSourceIds?: Partial<Record<JurisdictionReviewFindingKey, string[]>>;

  status?: Exclude<JurisdictionReviewStatus, "approved">;

  reviewReason?: string;

  conflictReason?: string;

  reviewNotes?: string;
}

export async function updateJurisdictionReviewDraft({
  id,
  update,
  actorUserId,
  actorName,
}: {
  id: string;

  update: JurisdictionReviewUpdate;

  actorUserId: string;

  actorName: string;
}): Promise<JurisdictionReviewDraft> {
  return mutateStore((store) => {
    const index = store.drafts.findIndex((draft) => draft.id === id);

    if (index < 0) {
      throw new Error(`Jurisdiction review draft not found: ${id}`);
    }

    const current = store.drafts[index];

    if (current.status === "approved") {
      throw new Error(
        "An approved jurisdiction review is immutable. Harvest new evidence to create a new revision.",
      );
    }

    const next: JurisdictionReviewDraft = {
      ...current,

      scope: update.scope ?? current.scope,

      findings:
        update.findings !== undefined ? update.findings : current.findings,

      reviewedFindings:
        update.reviewedFindings !== undefined
          ? [...new Set(update.reviewedFindings)]
          : current.reviewedFindings,

      selectedSourceIds:
        update.selectedSourceIds !== undefined
          ? [...new Set(update.selectedSourceIds)]
          : current.selectedSourceIds,

      additionalSources:
        update.additionalSources !== undefined
          ? update.additionalSources
          : current.additionalSources,

      findingSourceIds:
        update.findingSourceIds !== undefined
          ? update.findingSourceIds
          : current.findingSourceIds,

      status: update.status ?? current.status,

      reviewReason:
        update.reviewReason !== undefined
          ? update.reviewReason
          : current.reviewReason,

      conflictReason:
        update.conflictReason !== undefined
          ? update.conflictReason
          : current.conflictReason,

      reviewNotes:
        update.reviewNotes !== undefined
          ? update.reviewNotes
          : current.reviewNotes,

      updatedByUserId: actorUserId,

      updatedByName: actorName,

      updatedAt: nowIso(),
    };

    validateFindings(next.findings);

    assertSelectedSourceIds(next);

    if (next.status === "ready_for_approval") {
      const missing = missingReviewedFindings(next);

      if (missing.length > 0) {
        throw new Error(
          `Review cannot be marked ready for approval until every required finding has been reviewed. Missing: ${missing.join(
            ", ",
          )}.`,
        );
      }

      if (!next.scope) {
        throw new Error("Review scope must be selected before approval.");
      }

      if (next.selectedSourceIds.length === 0) {
        throw new Error(
          "At least one official source must be selected before approval.",
        );
      }

      assertRequiredCanonicalValues(next);

      /*
       * Build once here as an additional validation pass.
       *
       * This ensures the draft cannot reach ready-for-approval with a
       * malformed structured payment route.
       */
      buildPaymentRouting(next);
    }

    store.drafts[index] = next;

    return next;
  });
}

/* ========================================================================== */
/* Approval                                                                    */
/* ========================================================================== */

function buildJurisdictionRule({
  draft,
  approvedByUserId,
  approvedByName,
  approvedAt,
  version,
  sources,
}: {
  draft: JurisdictionReviewDraft;

  approvedByUserId: string;

  approvedByName: string;

  approvedAt: string;

  version: number;

  sources: JurisdictionAuthoritySource[];
}): Jurisdiction {
  assertRequiredCanonicalValues(draft);

  const findings = draft.findings;

  return {
    id: stableJurisdictionId(draft),

    state: draft.stateCode,

    stateName: draft.stateName,

    county: draft.scope === "county" ? draft.countyName : undefined,

    agencyName: findings.agencyName!,

    custodian: findings.custodian!,

    agencyWebsite: findings.agencyWebsite,

    agencyPhone: findings.agencyPhone,

    agencyAddress: findings.agencyAddress,

    claimMethod: findings.claimMethod!,

    claimFormUrl: findings.claimFormUrl,

    requiredDocuments: findings.requiredDocuments!,

    claimDeadlineDays: findings.claimDeadlineDays,

    statuteReference: findings.statuteReference,

    permittedFeeModels: findings.permittedFeeModels!,

    feeCapPercent: findings.feeCapPercent,

    feeCapAmount: findings.feeCapAmount,

    assignmentPermitted: findings.assignmentPermitted!,

    powerOfAttorneyAccepted: findings.powerOfAttorneyAccepted!,

    finderLicenseRequired: findings.finderLicenseRequired!,

    bondRequired: findings.bondRequired!,

    attorneyRequired: findings.attorneyRequired!,

    mandatoryContractLanguage: findings.mandatoryContractLanguage,

    cancellationPeriodDays: findings.cancellationPeriodDays,

    paymentRoutingNote: findings.paymentRoutingNote,

    probateRequiredWhenDeceased: findings.probateRequiredWhenDeceased!,

    complianceStatus: findings.complianceStatus!,

    lastLegalReview: todayIso(),

    reviewedBy: approvedByName,

    internalNotes: findings.internalNotes,

    legalRuleVersion: version,

    legalRuleEffectiveFrom: findings.legalRuleEffectiveFrom,

    legalRuleEffectiveThrough: findings.legalRuleEffectiveThrough,

    legalReviewDueAt: findings.legalReviewDueAt,

    legalSourceUrls: sources.map((source) => source.url),

    legalApprovedByUserId: approvedByUserId,

    legalApprovedAt: approvedAt,

    legalProcessingRule: findings.legalProcessingRule!,
  };
}

export async function approveJurisdictionReviewDraft({
  id,
  actorUserId,
  actorName,
}: {
  id: string;

  actorUserId: string;

  actorName: string;
}): Promise<{
  review: JurisdictionReviewDraft;

  package: JurisdictionRulePackage;
}> {
  const draft = await getJurisdictionReviewDraft(id);

  if (!draft) {
    throw new Error(`Jurisdiction review draft not found: ${id}`);
  }

  if (draft.status !== "ready_for_approval") {
    throw new Error(
      "Jurisdiction review must be marked ready for approval before activation.",
    );
  }

  if (!draft.scope) {
    throw new Error("Jurisdiction review scope has not been selected.");
  }

  const missing = missingReviewedFindings(draft);

  if (missing.length > 0) {
    throw new Error(
      `Jurisdiction review is incomplete. Missing reviewed findings: ${missing.join(
        ", ",
      )}.`,
    );
  }

  validateFindings(draft.findings);

  assertRequiredCanonicalValues(draft);

  assertSelectedSourceIds(draft);

  const sources = selectedSources(draft);

  if (sources.length === 0) {
    throw new Error(
      "An approved jurisdiction rule requires at least one selected official source.",
    );
  }

  if (draft.scope === "county" && !draft.countyName) {
    throw new Error(
      "County-scoped jurisdiction approval requires a county name.",
    );
  }

  const paymentRouting = buildPaymentRouting(draft);

  const packageId = stablePackageId(draft);

  const existingPackage = await getJurisdictionRulePackage(packageId);

  const packageVersion = (existingPackage?.version ?? 0) + 1;

  const approvedAt = nowIso();

  const rule = buildJurisdictionRule({
    draft,

    approvedByUserId: actorUserId,

    approvedByName: actorName,

    approvedAt,

    version: packageVersion,

    sources,
  });

  const rulePackage: JurisdictionRulePackage = {
    id: packageId,

    version: packageVersion,

    scope: draft.scope,

    stateFips: draft.stateFips,

    stateCode: draft.stateCode,

    stateName: draft.stateName,

    countyGeoid: draft.scope === "county" ? draft.countyGeoid : undefined,

    countyName: draft.scope === "county" ? draft.countyName : undefined,

    saleType: draft.saleType,

    status: "approved",

    sources,

    rule,

    paymentRouting,

    approvedByUserId: actorUserId,

    approvedAt,

    createdAt: existingPackage?.createdAt ?? draft.createdAt,

    updatedAt: approvedAt,
  };

  /*
   * The national intelligence store performs another independent validation
   * pass before persisting the package.
   *
   * That means neither this review store nor a UI mistake can silently bypass
   * the payment-route safety rules.
   */
  const persistedPackage = await upsertJurisdictionRulePackage(rulePackage);

  const review = await mutateStore((store) => {
    const index = store.drafts.findIndex((record) => record.id === id);

    if (index < 0) {
      throw new Error(
        `Jurisdiction review draft disappeared during approval: ${id}`,
      );
    }

    const current = store.drafts[index];

    const approved: JurisdictionReviewDraft = {
      ...current,

      status: "approved",

      approvedPackageId: persistedPackage.id,

      approvedPackageVersion: persistedPackage.version,

      approvedByUserId: actorUserId,

      approvedByName: actorName,

      approvedAt,

      updatedByUserId: actorUserId,

      updatedByName: actorName,

      updatedAt: approvedAt,
    };

    store.drafts[index] = approved;

    return approved;
  });

  return {
    review,

    package: persistedPackage,
  };
}
