import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import type { Cents, DocumentKind, IsoDate, IsoInstant } from "@/domain/types";

import { resolveLegalPosition } from "@/domain/legal-position";

import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";

import {
  listClaimDocuments,
  resolveClaimDocumentReadiness,
} from "@/server/claim-document-store";

import { resolvePersistedClaimFilingReadiness } from "@/server/claim-filing-readiness";

import { resolveClaimRecord } from "@/server/claim-record";

import { getOpportunityConversionByClaimId } from "@/server/opportunity-conversion-store";

import {
  commercialQuoteHasLegalRuleProvenance,
  getCommercialApprovalByQuoteId,
  verifyCommercialQuoteSnapshot,
} from "@/server/commercial-approval-store";

import {
  listJurisdictionRulePackages,
  type JurisdictionPaymentRouting,
} from "@/server/jurisdiction-intelligence";

/**
 * CLAIM FILING PACKAGE STORE
 *
 * Local repository for the controlled package Duequity prepares only after
 * every filing-readiness control has passed.
 *
 * Workflow:
 *
 *   1. Claim satisfies filing readiness.
 *   2. Filing package is prepared and frozen as a snapshot.
 *   3. Package is explicitly submitted for independent human review.
 *   4. A different human reviewer approves or returns the package.
 *   5. Pre-filing approval does not mean the claim was externally submitted.
 *
 * No function in this file sends anything to a court, agency or custodian.
 *
 * SNAPSHOT PRINCIPLE
 *
 * The package captures the exact:
 *
 *   - claim
 *   - claimant
 *   - jurisdiction
 *   - approved jurisdiction-package version
 *   - jurisdiction legal-rule version
 *   - approved payment route and launch track
 *   - commercial pricing lock and immutable quote hash
 *   - commercial-policy version
 *   - quote legal-rule version snapshot
 *   - fee-agreement legal-rule version snapshot
 *   - signed service agreement
 *   - accepted document IDs
 *   - accepted document kinds
 *   - resolved legal lane and rationale
 *   - filing deadline
 *   - readiness controls
 *
 * used when the package was prepared.
 *
 * If accepted documents, jurisdiction rules, payment routing, pricing,
 * agreement provenance or other critical evidence later changes, the previous
 * package cannot silently inherit those changes. A new package must be prepared.
 *
 * STORED SNAPSHOT INTEGRITY
 *
 * Every persisted package carries a SHA-256 hash of its frozen snapshot.
 * Submission, return and approval transitions verify the stored snapshot before
 * mutation. Approval also rebuilds the live snapshot and requires the live hash
 * to remain identical to the prepared hash.
 *
 * RETURNED PACKAGE RULE
 *
 * A package returned for changes is never simply moved back under review.
 * Preparing after a return creates a new package version and supersedes the
 * returned package, even when the rebuilt snapshot is otherwise identical.
 *
 * LOCAL PERSISTENCE LIMITATION
 *
 * JSON persistence and the process-local mutation queue are suitable for the
 * current local build. Production deployment will require durable transactional
 * persistence and authenticated user identities.
 */

/* ========================================================================== */
/* Storage                                                                     */
/* ========================================================================== */

const DATA_DIRECTORY = path.join(process.cwd(), ".duequity-data");

const DATA_FILE = path.join(DATA_DIRECTORY, "claim-filing-packages.json");

const STORE_VERSION = 1;

/* ========================================================================== */
/* Status                                                                      */
/* ========================================================================== */

export type ClaimFilingPackageStatus =
  | "prepared"
  | "under_review"
  | "pre_filing_approved"
  | "returned_for_changes"
  | "superseded";

/* ========================================================================== */
/* Snapshot                                                                    */
/* ========================================================================== */

export interface ClaimFilingPackageDocumentSnapshot {
  kind: DocumentKind;

  documentId: string;

  originalFileName?: string;

  reviewedByUserId?: string;

  reviewedAt?: IsoInstant;
}

export interface ClaimFilingPackageReadinessSnapshot {
  key: string;

  label: string;

  complete: boolean;

  detail: string;
}

export interface ClaimFilingPackageSnapshot {
  claimId: string;

  claimReference: string;

  opportunityId: string;

  jurisdictionId: string;

  jurisdictionPackageVersion: number;

  jurisdictionLegalRuleVersion: number;

  paymentRoute: JurisdictionPaymentRouting["paymentRoute"];

  launchPaymentTrack: JurisdictionPaymentRouting["launchTrack"];

  representativeMayFile: JurisdictionPaymentRouting["representativeMayFile"];

  representativeMayReceivePayment: JurisdictionPaymentRouting["representativeMayReceivePayment"];

  assignmentRequiredForRepresentativePayment: JurisdictionPaymentRouting["assignmentRequiredForRepresentativePayment"];

  feeCollectionMethod: JurisdictionPaymentRouting["feeCollectionMethod"];

  claimantId: string;

  claimantLegalName: string;

  filingDeadline?: IsoDate;

  legalLane: string;

  legalRationale: string;

  legalHumanDetermined: boolean;

  legalReviewedBy?: string;

  legalLastReviewedAt?: IsoDate;

  commercialQuoteId: string;

  commercialSnapshotHash: string;

  commercialPolicyId: string;

  commercialPolicyVersion: number;

  commercialTierId: string;

  commercialRecoveryAmount: Cents;

  commercialProjectedFee: Cents;

  commercialQuoteLegalRuleVersionSnapshot: number;

  commercialLegalFeeCapPercentSnapshot?: number;

  commercialLegalFeeCapAmountSnapshot?: Cents;

  feeAgreementId: string;

  feeAgreementLegalRuleVersionSnapshot: number;

  feeAgreementDocumentId: string;

  serviceAgreementSignedAt: IsoDate;

  serviceAgreementCancellationDeadline?: IsoDate;

  acceptedDocuments: ClaimFilingPackageDocumentSnapshot[];

  readinessControls: ClaimFilingPackageReadinessSnapshot[];

  readinessCompletedCount: number;

  readinessTotalCount: number;
}

/* ========================================================================== */
/* Filing package                                                              */
/* ========================================================================== */

export interface PersistedClaimFilingPackage {
  id: string;

  claimId: string;

  claimReference: string;

  version: number;

  status: ClaimFilingPackageStatus;

  snapshot: ClaimFilingPackageSnapshot;

  snapshotHash: string;

  preparedByUserId: string;

  preparedAt: IsoInstant;

  submittedForReviewByUserId?: string;

  submittedForReviewAt?: IsoInstant;

  reviewedByUserId?: string;

  reviewedAt?: IsoInstant;

  reviewNote?: string;

  preFilingApprovedAt?: IsoInstant;

  returnedAt?: IsoInstant;

  returnReason?: string;

  supersededAt?: IsoInstant;

  supersededByPackageId?: string;
}

/* ========================================================================== */
/* Audit                                                                       */
/* ========================================================================== */

export type ClaimFilingPackageAuditAction =
  | "filing_package_prepared"
  | "filing_package_submitted_for_review"
  | "filing_package_pre_filing_approved"
  | "filing_package_returned"
  | "filing_package_superseded";

export interface ClaimFilingPackageAuditEntry {
  id: string;

  claimId: string;

  packageId: string;

  action: ClaimFilingPackageAuditAction;

  actorUserId: string;

  occurredAt: IsoInstant;

  detail?: string;
}

/* ========================================================================== */
/* Repository state                                                            */
/* ========================================================================== */

interface ClaimFilingPackageStoreState {
  version: number;

  packages: PersistedClaimFilingPackage[];

  audit: ClaimFilingPackageAuditEntry[];
}

/* ========================================================================== */
/* Inputs                                                                      */
/* ========================================================================== */

export interface PrepareClaimFilingPackageInput {
  claimId: string;

  actorUserId: string;

  occurredAt: IsoInstant;
}

export interface SubmitClaimFilingPackageForReviewInput {
  packageId: string;

  actorUserId: string;

  occurredAt: IsoInstant;
}

export interface ApproveClaimFilingPackageInput {
  packageId: string;

  reviewerUserId: string;

  occurredAt: IsoInstant;

  reviewNote?: string;
}

export interface ReturnClaimFilingPackageInput {
  packageId: string;

  reviewerUserId: string;

  occurredAt: IsoInstant;

  reason: string;
}

/* ========================================================================== */
/* Mutation queue                                                              */
/* ========================================================================== */

let mutationQueue: Promise<void> = Promise.resolve();

async function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const pending = mutationQueue.then(operation);

  mutationQueue = pending.then(
    () => undefined,
    () => undefined,
  );

  return pending;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function validateIsoInstant(value: string, label: string): IsoInstant {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }

  return value;
}

function assertIndependentReviewer(
  filingPackage: PersistedClaimFilingPackage,
  reviewerUserId: string,
) {
  if (filingPackage.preparedByUserId === reviewerUserId) {
    throw new Error(
      "The user who prepared the filing package cannot perform its independent pre-filing review.",
    );
  }

  if (filingPackage.submittedForReviewByUserId === reviewerUserId) {
    throw new Error(
      "The user who submitted the filing package for review cannot perform its independent pre-filing review.",
    );
  }
}

/* ========================================================================== */
/* Repository                                                                  */
/* ========================================================================== */

function emptyState(): ClaimFilingPackageStoreState {
  return {
    version: STORE_VERSION,

    packages: [],

    audit: [],
  };
}

async function ensureDirectory() {
  await fs.mkdir(DATA_DIRECTORY, {
    recursive: true,
  });
}

async function readState(): Promise<ClaimFilingPackageStoreState> {
  await ensureDirectory();

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");

    const parsed = JSON.parse(raw) as Partial<ClaimFilingPackageStoreState>;

    if (
      parsed.version !== STORE_VERSION ||
      !Array.isArray(parsed.packages) ||
      !Array.isArray(parsed.audit)
    ) {
      throw new Error(
        "Claim filing package store has an invalid or unsupported structure.",
      );
    }

    return {
      version: STORE_VERSION,

      packages: parsed.packages,

      audit: parsed.audit,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return emptyState();
    }

    throw error;
  }
}

async function writeState(state: ClaimFilingPackageStoreState) {
  await ensureDirectory();

  const temporaryFile = `${DATA_FILE}.tmp`;

  await fs.writeFile(
    temporaryFile,
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );

  await fs.rename(temporaryFile, DATA_FILE);
}

function clonePackage(
  filingPackage: PersistedClaimFilingPackage,
): PersistedClaimFilingPackage {
  return JSON.parse(
    JSON.stringify(filingPackage),
  ) as PersistedClaimFilingPackage;
}

/* ========================================================================== */
/* Hash                                                                        */
/* ========================================================================== */

function hashSnapshot(snapshot: ClaimFilingPackageSnapshot): string {
  return createHash("sha256")
    .update(JSON.stringify(snapshot), "utf8")
    .digest("hex");
}

export function verifyClaimFilingPackageSnapshot(
  filingPackage: PersistedClaimFilingPackage,
): boolean {
  return hashSnapshot(filingPackage.snapshot) === filingPackage.snapshotHash;
}

function assertStoredPackageSnapshotIntegrity(
  filingPackage: PersistedClaimFilingPackage,
): void {
  if (!verifyClaimFilingPackageSnapshot(filingPackage)) {
    throw new Error(
      "Filing package snapshot integrity verification failed. The package cannot progress until the persisted record is reviewed.",
    );
  }
}

/* ========================================================================== */
/* Audit                                                                       */
/* ========================================================================== */

function appendAudit(
  state: ClaimFilingPackageStoreState,
  input: {
    claimId: string;

    packageId: string;

    action: ClaimFilingPackageAuditAction;

    actorUserId: string;

    occurredAt: IsoInstant;

    detail?: string;
  },
) {
  state.audit.push({
    id: randomUUID(),

    claimId: input.claimId,

    packageId: input.packageId,

    action: input.action,

    actorUserId: input.actorUserId,

    occurredAt: input.occurredAt,

    detail: input.detail,
  });
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listClaimFilingPackages(
  claimId?: string,
): Promise<PersistedClaimFilingPackage[]> {
  const state = await readState();

  return state.packages
    .filter((filingPackage) => !claimId || filingPackage.claimId === claimId)
    .map(clonePackage)
    .sort((left, right) => right.preparedAt.localeCompare(left.preparedAt));
}

export async function getClaimFilingPackage(
  packageId: string,
): Promise<PersistedClaimFilingPackage | undefined> {
  const state = await readState();

  const filingPackage = state.packages.find(
    (candidate) => candidate.id === packageId,
  );

  return filingPackage ? clonePackage(filingPackage) : undefined;
}

export async function getCurrentClaimFilingPackage(
  claimId: string,
): Promise<PersistedClaimFilingPackage | undefined> {
  const packages = await listClaimFilingPackages(claimId);

  return packages.find(
    (filingPackage) => filingPackage.status !== "superseded",
  );
}

export async function claimFilingPackageAudit(
  claimId?: string,
): Promise<ClaimFilingPackageAuditEntry[]> {
  const state = await readState();

  return state.audit
    .filter((entry) => !claimId || entry.claimId === claimId)
    .map((entry) => ({
      ...entry,
    }))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

/* ========================================================================== */
/* Live snapshot builder                                                       */
/* ========================================================================== */

async function buildLiveSnapshot(
  claimId: string,
): Promise<ClaimFilingPackageSnapshot> {
  const resolved = await resolveClaimRecord(claimId);

  if (!resolved) {
    throw new Error("Claim not found.");
  }

  const claim = resolved.claim;

  const jurisdictionPackages = await listJurisdictionRulePackages();

  const jurisdictionPackage = jurisdictionPackages
    .filter(
      (rulePackage) =>
        rulePackage.status === "approved" &&
        rulePackage.rule?.id === claim.jurisdictionId,
    )
    .slice()
    .sort((left, right) => right.version - left.version)[0];

  const jurisdiction = jurisdictionPackage?.rule;

  if (!jurisdictionPackage || !jurisdiction) {
    throw new Error(
      "No current approved jurisdiction rule is published for this claim.",
    );
  }

  const jurisdictionLegalRuleVersion = jurisdiction.legalRuleVersion;

  if (
    jurisdictionLegalRuleVersion === undefined ||
    !Number.isInteger(jurisdictionLegalRuleVersion) ||
    jurisdictionLegalRuleVersion < 1
  ) {
    throw new Error(
      "The current approved jurisdiction does not have a valid legal-rule version. Filing-package preparation is blocked.",
    );
  }

  const paymentRouting = jurisdictionPackage.paymentRouting;

  if (!paymentRouting) {
    throw new Error(
      "The current approved jurisdiction does not have a frozen payment-routing determination. Filing-package preparation is blocked.",
    );
  }

  const today = currentIsoDate();

  const readiness = await resolvePersistedClaimFilingReadiness(
    claim,
    jurisdiction,
    today,
  );

  if (!readiness.readyToPrepare) {
    throw new Error(
      `Claim is not ready to prepare. ${readiness.outstandingControlCount} filing-readiness control${readiness.outstandingControlCount === 1 ? " remains" : "s remain"} outstanding.`,
    );
  }

  const onboarding = await getClaimantOnboarding(claim.id);

  if (!onboarding) {
    throw new Error("Persisted claimant onboarding could not be resolved.");
  }

  if (onboarding.claimant.identityVerification !== "verified") {
    throw new Error("Claimant identity is not verified.");
  }

  if (!onboarding.serviceAgreement) {
    throw new Error(
      "A signed claimant service agreement is required before preparing the filing package.",
    );
  }

  const conversion = await getOpportunityConversionByClaimId(claim.id);

  if (!conversion) {
    throw new Error("Opportunity conversion could not be resolved.");
  }

  const commercialApproval = await getCommercialApprovalByQuoteId(
    conversion.commercialQuoteId,
  );

  if (!commercialApproval || commercialApproval.approvalStatus !== "locked") {
    throw new Error("The commercial pricing snapshot is not locked.");
  }

  if (!verifyCommercialQuoteSnapshot(commercialApproval)) {
    throw new Error(
      "Commercial pricing snapshot integrity verification failed.",
    );
  }

  if (commercialApproval.snapshotHash !== conversion.commercialSnapshotHash) {
    throw new Error(
      "Commercial pricing snapshot does not match the conversion record.",
    );
  }

  if (commercialApproval.lockedFeeAgreementId !== conversion.feeAgreementId) {
    throw new Error(
      "Commercial pricing lock is not bound to the expected fee agreement record.",
    );
  }

  const commercialQuote = commercialApproval.quoteSnapshot;

  if (!commercialQuoteHasLegalRuleProvenance(commercialQuote)) {
    throw new Error(
      "The locked commercial quote does not contain a valid legal-rule version snapshot.",
    );
  }

  const commercialQuoteLegalRuleVersionSnapshot =
    commercialQuote.legalRuleVersionSnapshot;

  if (commercialQuoteLegalRuleVersionSnapshot === undefined) {
    throw new Error(
      "The locked commercial quote legal-rule version could not be resolved.",
    );
  }

  const feeAgreement = claim.feeAgreement;

  if (!feeAgreement) {
    throw new Error("The Claim fee agreement could not be resolved.");
  }

  const feeAgreementLegalRuleVersionSnapshot =
    feeAgreement.legalRuleVersionSnapshot;

  if (
    feeAgreementLegalRuleVersionSnapshot === undefined ||
    !Number.isInteger(feeAgreementLegalRuleVersionSnapshot) ||
    feeAgreementLegalRuleVersionSnapshot < 1
  ) {
    throw new Error(
      "The Claim fee agreement does not contain a valid legal-rule version snapshot.",
    );
  }

  if (
    commercialQuoteLegalRuleVersionSnapshot !==
    feeAgreementLegalRuleVersionSnapshot
  ) {
    throw new Error(
      "The locked commercial quote and Claim fee agreement do not reference the same legal-rule version.",
    );
  }

  if (
    commercialQuoteLegalRuleVersionSnapshot !== jurisdictionLegalRuleVersion
  ) {
    throw new Error(
      "The jurisdiction legal rule changed after commercial pricing or agreement creation. Prepare a new compliant pricing and agreement workflow before filing.",
    );
  }

  if (
    feeAgreement.commercialFeeQuoteId !== conversion.commercialQuoteId ||
    feeAgreement.id !== conversion.feeAgreementId
  ) {
    throw new Error(
      "The Claim fee agreement does not match the persisted opportunity conversion.",
    );
  }

  if (
    feeAgreement.commercialPolicyId !== commercialQuote.commercialPolicyId ||
    feeAgreement.commercialPolicyVersion !==
      commercialQuote.commercialPolicyVersion
  ) {
    throw new Error(
      "The Claim fee agreement commercial-policy snapshot does not match the locked quote.",
    );
  }

  const feeAgreementDocumentId = onboarding.serviceAgreement.documentId?.trim();

  if (!feeAgreementDocumentId) {
    throw new Error(
      "The executed service-agreement document could not be resolved.",
    );
  }

  const documentReadiness = await resolveClaimDocumentReadiness(claim.id);

  const documents = await listClaimDocuments(claim.id);

  const acceptedDocumentSnapshots: ClaimFilingPackageDocumentSnapshot[] = [];

  for (const kind of jurisdiction.requiredDocuments) {
    const request = documentReadiness.requiredRequests.find(
      (candidate) => candidate.kind === kind,
    );

    if (
      !request ||
      request.status !== "accepted" ||
      !request.fulfilledByDocumentId
    ) {
      throw new Error(
        `Accepted evidence is missing for ${kind.replaceAll("_", " ")}.`,
      );
    }

    const document = documents.find(
      (candidate) =>
        candidate.id === request.fulfilledByDocumentId &&
        candidate.kind === kind &&
        candidate.status === "accepted",
    );

    if (!document) {
      throw new Error(
        `The accepted ${kind.replaceAll(
          "_",
          " ",
        )} document could not be resolved.`,
      );
    }

    acceptedDocumentSnapshots.push({
      kind,

      documentId: document.id,

      originalFileName: document.originalFileName,

      reviewedByUserId: document.reviewedByUserId,

      reviewedAt: document.reviewedAt,
    });
  }

  acceptedDocumentSnapshots.sort((left, right) =>
    left.kind.localeCompare(right.kind),
  );

  const legalPosition = resolveLegalPosition(claim, jurisdiction, today);

  return {
    claimId: claim.id,

    claimReference: claim.reference,

    opportunityId: claim.opportunityId,

    jurisdictionId: claim.jurisdictionId,

    jurisdictionPackageVersion: jurisdictionPackage.version,

    jurisdictionLegalRuleVersion,

    paymentRoute: paymentRouting.paymentRoute,

    launchPaymentTrack: paymentRouting.launchTrack,

    representativeMayFile: paymentRouting.representativeMayFile,

    representativeMayReceivePayment:
      paymentRouting.representativeMayReceivePayment,

    assignmentRequiredForRepresentativePayment:
      paymentRouting.assignmentRequiredForRepresentativePayment,

    feeCollectionMethod: paymentRouting.feeCollectionMethod,

    claimantId: onboarding.claimant.id,

    claimantLegalName: onboarding.claimant.legalName,

    filingDeadline: claim.filingDeadline,

    legalLane: legalPosition.lane,

    legalRationale: legalPosition.rationale,

    legalHumanDetermined: legalPosition.humanDetermined,

    legalReviewedBy: legalPosition.reviewedBy,

    legalLastReviewedAt: legalPosition.lastReviewedAt,

    commercialQuoteId: conversion.commercialQuoteId,

    commercialSnapshotHash: conversion.commercialSnapshotHash,

    commercialPolicyId: commercialQuote.commercialPolicyId,

    commercialPolicyVersion: commercialQuote.commercialPolicyVersion,

    commercialTierId: commercialQuote.commercialTierId,

    commercialRecoveryAmount: commercialQuote.recoveryAmount,

    commercialProjectedFee: commercialQuote.projectedFee,

    commercialQuoteLegalRuleVersionSnapshot,

    commercialLegalFeeCapPercentSnapshot:
      commercialQuote.legalFeeCapPercentSnapshot,

    commercialLegalFeeCapAmountSnapshot:
      commercialQuote.legalFeeCapAmountSnapshot,

    feeAgreementId: conversion.feeAgreementId,

    feeAgreementLegalRuleVersionSnapshot,

    feeAgreementDocumentId,

    serviceAgreementSignedAt: onboarding.serviceAgreement.signedAt,

    serviceAgreementCancellationDeadline:
      onboarding.serviceAgreement.cancellationDeadline,

    acceptedDocuments: acceptedDocumentSnapshots,

    readinessControls: readiness.controls.map((control) => ({
      key: control.key,

      label: control.label,

      complete: control.complete,

      detail: control.detail,
    })),

    readinessCompletedCount: readiness.completedControlCount,

    readinessTotalCount: readiness.controls.length,
  };
}

/* ========================================================================== */
/* Current snapshot verification                                               */
/* ========================================================================== */

async function assertPackageStillCurrent(
  filingPackage: PersistedClaimFilingPackage,
) {
  assertStoredPackageSnapshotIntegrity(filingPackage);

  const liveSnapshot = await buildLiveSnapshot(filingPackage.claimId);

  const liveHash = hashSnapshot(liveSnapshot);

  if (liveHash !== filingPackage.snapshotHash) {
    throw new Error(
      "The claim evidence changed after this filing package was prepared. Prepare a new filing package before approval.",
    );
  }
}

/* ========================================================================== */
/* Prepare                                                                     */
/* ========================================================================== */

export async function prepareClaimFilingPackage(
  input: PrepareClaimFilingPackageInput,
): Promise<PersistedClaimFilingPackage> {
  return mutate(async () => {
    const state = await readState();

    const actorUserId = requireNonEmpty(input.actorUserId, "Actor user ID");

    const occurredAt = validateIsoInstant(input.occurredAt, "Occurred at");

    const snapshot = await buildLiveSnapshot(input.claimId);

    const snapshotHash = hashSnapshot(snapshot);

    const activePackages = state.packages
      .filter(
        (filingPackage) =>
          filingPackage.claimId === snapshot.claimId &&
          filingPackage.status !== "superseded",
      )
      .slice()
      .sort((left, right) => right.version - left.version);

    if (activePackages.length > 1) {
      throw new Error(
        "Multiple active filing packages exist for this claim. Filing-package preparation is blocked pending repository cleanup.",
      );
    }

    const activePackage = activePackages[0];

    if (activePackage) {
      assertStoredPackageSnapshotIntegrity(activePackage);

      if (
        activePackage.status === "prepared" &&
        activePackage.snapshotHash === snapshotHash
      ) {
        return clonePackage(activePackage);
      }

      if (activePackage.status !== "returned_for_changes") {
        throw new Error(
          "A current filing package already exists. Only a package returned for changes may be prepared again.",
        );
      }
    }

    const existingVersions = state.packages
      .filter((filingPackage) => filingPackage.claimId === snapshot.claimId)
      .map((filingPackage) => filingPackage.version);

    const nextVersion =
      (existingVersions.length > 0 ? Math.max(...existingVersions) : 0) + 1;

    const packageId = `filing-package-${snapshot.claimId}-v${nextVersion}`;

    if (activePackage) {
      activePackage.status = "superseded";

      activePackage.supersededAt = occurredAt;

      activePackage.supersededByPackageId = packageId;

      appendAudit(state, {
        claimId: activePackage.claimId,

        packageId: activePackage.id,

        action: "filing_package_superseded",

        actorUserId,

        occurredAt,

        detail: `Superseded by ${packageId} after the prior package was returned for changes and a new frozen package version was prepared.`,
      });
    }

    const filingPackage: PersistedClaimFilingPackage = {
      id: packageId,

      claimId: snapshot.claimId,

      claimReference: snapshot.claimReference,

      version: nextVersion,

      status: "prepared",

      snapshot,

      snapshotHash,

      preparedByUserId: actorUserId,

      preparedAt: occurredAt,
    };

    state.packages.push(filingPackage);

    appendAudit(state, {
      claimId: filingPackage.claimId,

      packageId: filingPackage.id,

      action: "filing_package_prepared",

      actorUserId,

      occurredAt,

      detail: `${snapshot.readinessCompletedCount} of ${snapshot.readinessTotalCount} filing-readiness controls were captured as complete. ${snapshot.acceptedDocuments.length} accepted document${snapshot.acceptedDocuments.length === 1 ? "" : "s"} frozen into package version ${filingPackage.version}.`,
    });

    await writeState(state);

    return clonePackage(filingPackage);
  });
}

/* ========================================================================== */
/* Submit for human review                                                     */
/* ========================================================================== */

export async function submitClaimFilingPackageForReview(
  input: SubmitClaimFilingPackageForReviewInput,
): Promise<PersistedClaimFilingPackage> {
  return mutate(async () => {
    const state = await readState();

    const actorUserId = requireNonEmpty(input.actorUserId, "Actor user ID");

    const occurredAt = validateIsoInstant(input.occurredAt, "Occurred at");

    const filingPackage = state.packages.find(
      (candidate) => candidate.id === input.packageId,
    );

    if (!filingPackage) {
      throw new Error("Filing package not found.");
    }

    if (filingPackage.status === "superseded") {
      throw new Error(
        "A superseded filing package cannot be submitted for review.",
      );
    }

    if (filingPackage.status === "under_review") {
      assertStoredPackageSnapshotIntegrity(filingPackage);

      return clonePackage(filingPackage);
    }

    if (filingPackage.status === "pre_filing_approved") {
      assertStoredPackageSnapshotIntegrity(filingPackage);

      return clonePackage(filingPackage);
    }

    if (filingPackage.status !== "prepared") {
      throw new Error(
        filingPackage.status === "returned_for_changes"
          ? "A package returned for changes must be prepared as a new package version before it can be submitted for review again."
          : "Only a prepared filing package may be submitted for review.",
      );
    }

    await assertPackageStillCurrent(filingPackage);

    filingPackage.status = "under_review";

    filingPackage.submittedForReviewByUserId = actorUserId;

    filingPackage.submittedForReviewAt = occurredAt;

    filingPackage.reviewedByUserId = undefined;

    filingPackage.reviewedAt = undefined;

    filingPackage.reviewNote = undefined;

    filingPackage.preFilingApprovedAt = undefined;

    filingPackage.returnedAt = undefined;

    filingPackage.returnReason = undefined;

    appendAudit(state, {
      claimId: filingPackage.claimId,

      packageId: filingPackage.id,

      action: "filing_package_submitted_for_review",

      actorUserId,

      occurredAt,

      detail: "Package submitted for independent human pre-filing review.",
    });

    await writeState(state);

    return clonePackage(filingPackage);
  });
}

/* ========================================================================== */
/* Approve                                                                     */
/* ========================================================================== */

export async function approveClaimFilingPackage(
  input: ApproveClaimFilingPackageInput,
): Promise<PersistedClaimFilingPackage> {
  return mutate(async () => {
    const state = await readState();

    const reviewerUserId = requireNonEmpty(
      input.reviewerUserId,
      "Reviewer user ID",
    );

    const occurredAt = validateIsoInstant(input.occurredAt, "Occurred at");

    const filingPackage = state.packages.find(
      (candidate) => candidate.id === input.packageId,
    );

    if (!filingPackage) {
      throw new Error("Filing package not found.");
    }

    if (filingPackage.status === "superseded") {
      throw new Error("A superseded filing package cannot be approved.");
    }

    if (filingPackage.status === "pre_filing_approved") {
      return clonePackage(filingPackage);
    }

    if (filingPackage.status !== "under_review") {
      throw new Error(
        "The filing package must be under human review before it can receive pre-filing approval.",
      );
    }

    assertIndependentReviewer(filingPackage, reviewerUserId);

    await assertPackageStillCurrent(filingPackage);

    filingPackage.status = "pre_filing_approved";

    filingPackage.reviewedByUserId = reviewerUserId;

    filingPackage.reviewedAt = occurredAt;

    filingPackage.reviewNote = input.reviewNote?.trim() || undefined;

    filingPackage.preFilingApprovedAt = occurredAt;

    filingPackage.returnedAt = undefined;

    filingPackage.returnReason = undefined;

    appendAudit(state, {
      claimId: filingPackage.claimId,

      packageId: filingPackage.id,

      action: "filing_package_pre_filing_approved",

      actorUserId: reviewerUserId,

      occurredAt,

      detail:
        input.reviewNote?.trim() ||
        "Independent human pre-filing review approved the frozen package snapshot.",
    });

    await writeState(state);

    return clonePackage(filingPackage);
  });
}

/* ========================================================================== */
/* Return for changes                                                          */
/* ========================================================================== */

export async function returnClaimFilingPackage(
  input: ReturnClaimFilingPackageInput,
): Promise<PersistedClaimFilingPackage> {
  return mutate(async () => {
    const state = await readState();

    const reviewerUserId = requireNonEmpty(
      input.reviewerUserId,
      "Reviewer user ID",
    );

    const occurredAt = validateIsoInstant(input.occurredAt, "Occurred at");

    const reason = requireNonEmpty(input.reason, "Return reason");

    const filingPackage = state.packages.find(
      (candidate) => candidate.id === input.packageId,
    );

    if (!filingPackage) {
      throw new Error("Filing package not found.");
    }

    if (filingPackage.status === "superseded") {
      throw new Error("A superseded filing package cannot be returned.");
    }

    if (filingPackage.status !== "under_review") {
      throw new Error(
        "Only a package currently under review can be returned for changes.",
      );
    }

    assertStoredPackageSnapshotIntegrity(filingPackage);

    assertIndependentReviewer(filingPackage, reviewerUserId);

    filingPackage.status = "returned_for_changes";

    filingPackage.reviewedByUserId = reviewerUserId;

    filingPackage.reviewedAt = occurredAt;

    filingPackage.returnedAt = occurredAt;

    filingPackage.returnReason = reason;

    filingPackage.reviewNote = undefined;

    filingPackage.preFilingApprovedAt = undefined;

    appendAudit(state, {
      claimId: filingPackage.claimId,

      packageId: filingPackage.id,

      action: "filing_package_returned",

      actorUserId: reviewerUserId,

      occurredAt,

      detail: `Returned for changes. Reason: ${reason}`,
    });

    await writeState(state);

    return clonePackage(filingPackage);
  });
}
