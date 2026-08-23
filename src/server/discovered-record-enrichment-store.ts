import "server-only";

import { randomUUID } from "node:crypto";

import type {
  IsoInstant,
  MonetaryFact,
  PropertyType,
  Provenance,
} from "@/domain/types";

import { getSupabaseAdmin } from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type SourceBalanceInterpretation =
  | "unresolved"
  | "confirmed_surplus"
  | "estimated_surplus"
  | "other_balance"
  | "not_recovery_balance";

export type ClaimantLocatorCandidateKind =
  | "phone"
  | "email"
  | "mailing_address";

export type ClaimantLocatorIdentityKind =
  | "first_name"
  | "last_name"
  | "alias";

export type ClaimantLocatorCandidateStatus =
  | "candidate"
  | "verified"
  | "rejected";

export interface ClaimantLocatorSource {
  sourceName: string;

  sourceUrl?: string;

  sourceDate: string;
}

export interface ClaimantLocatorCandidate {
  id: string;

  kind: ClaimantLocatorCandidateKind;

  value: string;

  source: ClaimantLocatorSource;

  status: ClaimantLocatorCandidateStatus;

  foundAt: IsoInstant;

  foundByUserId: string;

  reviewedAt?: IsoInstant;

  reviewedByUserId?: string;

  reviewNote?: string;
}

export interface ClaimantLocatorIdentityCandidate {
  id: string;

  kind: ClaimantLocatorIdentityKind;

  value: string;

  source: ClaimantLocatorSource;

  status: ClaimantLocatorCandidateStatus;

  foundAt: IsoInstant;

  foundByUserId: string;

  reviewedAt?: IsoInstant;

  reviewedByUserId?: string;

  reviewNote?: string;
}

export interface ClaimantLocatorAssociatedContact {
  id: string;

  name: string;

  relationship?: string;

  phone?: string;

  email?: string;

  source: ClaimantLocatorSource;

  status: ClaimantLocatorCandidateStatus;

  foundAt: IsoInstant;

  foundByUserId: string;

  reviewedAt?: IsoInstant;

  reviewedByUserId?: string;

  reviewNote?: string;
}

export interface ClaimantLocatorSnapshot {
  candidates: ClaimantLocatorCandidate[];

  identities?: ClaimantLocatorIdentityCandidate[];

  associatedContacts?: ClaimantLocatorAssociatedContact[];
}

export interface VerifiedFact<T> {
  value: T;

  provenance: Provenance;

  verifiedAt: IsoInstant;

  verifiedByUserId: string;
}

export interface VerifiedMonetaryFact {
  fact: MonetaryFact;

  provenance: Provenance;

  verifiedAt: IsoInstant;

  verifiedByUserId: string;
}

export interface DiscoveredRecordEnrichment {
  discoveredRecordId: string;

  propertyType?: VerifiedFact<PropertyType>;

  salePrice?: VerifiedMonetaryFact;

  debtSatisfied?: VerifiedMonetaryFact;

  taxesOwed?: VerifiedMonetaryFact;

  saleCosts?: VerifiedMonetaryFact;

  juniorLiens?: VerifiedMonetaryFact;

  estimatedSurplus?: VerifiedMonetaryFact;

  confirmedSurplus?: VerifiedMonetaryFact;

  sellingEntity?: VerifiedFact<string>;

  sourceBalanceInterpretation?: VerifiedFact<SourceBalanceInterpretation>;

  claimantLocator?: ClaimantLocatorSnapshot;

  createdAt: IsoInstant;

  updatedAt: IsoInstant;

  updatedByUserId: string;
}

export interface VerifiedFactInput<T> {
  value: T;

  provenance: Provenance;
}

export interface VerifiedMonetaryFactInput {
  fact: MonetaryFact;

  provenance: Provenance;
}

export interface SaveDiscoveredRecordEnrichmentInput {
  discoveredRecordId: string;

  actorUserId: string;

  propertyType?: VerifiedFactInput<PropertyType>;

  salePrice?: VerifiedMonetaryFactInput;

  debtSatisfied?: VerifiedMonetaryFactInput;

  taxesOwed?: VerifiedMonetaryFactInput;

  saleCosts?: VerifiedMonetaryFactInput;

  juniorLiens?: VerifiedMonetaryFactInput;

  estimatedSurplus?: VerifiedMonetaryFactInput;

  confirmedSurplus?: VerifiedMonetaryFactInput;

  sellingEntity?: VerifiedFactInput<string>;

  sourceBalanceInterpretation?: VerifiedFactInput<SourceBalanceInterpretation>;
}

export interface AddClaimantLocatorCandidateInput {
  discoveredRecordId: string;

  actorUserId: string;

  kind: ClaimantLocatorCandidateKind;

  value: string;

  sourceName: string;

  sourceUrl?: string;

  sourceDate: string;
}

export interface AddClaimantLocatorIdentityInput {
  discoveredRecordId: string;

  actorUserId: string;

  kind: ClaimantLocatorIdentityKind;

  value: string;

  sourceName: string;

  sourceUrl?: string;

  sourceDate: string;
}

export interface AddClaimantLocatorAssociatedContactInput {
  discoveredRecordId: string;

  actorUserId: string;

  name: string;

  relationship?: string;

  phone?: string;

  email?: string;

  sourceName: string;

  sourceUrl?: string;

  sourceDate: string;
}

export interface ReviewClaimantLocatorCandidateInput {
  discoveredRecordId: string;

  candidateId: string;

  actorUserId: string;

  status:
    | "verified"
    | "rejected";

  reviewNote?: string;
}

export interface ReviewClaimantLocatorIdentityInput {
  discoveredRecordId: string;

  candidateId: string;

  actorUserId: string;

  status:
    | "verified"
    | "rejected";

  reviewNote?: string;
}

export interface ReviewClaimantLocatorAssociatedContactInput {
  discoveredRecordId: string;

  candidateId: string;

  actorUserId: string;

  status:
    | "verified"
    | "rejected";

  reviewNote?: string;
}

export interface DiscoveredRecordEnrichmentReadiness {
  ready: boolean;

  missing: string[];

  cautions: string[];
}

/* ========================================================================== */
/* Database                                                                    */
/* ========================================================================== */

type EnrichmentSnapshot = Omit<
  DiscoveredRecordEnrichment,
  "discoveredRecordId" | "createdAt" | "updatedAt" | "updatedByUserId"
>;

interface DiscoveredRecordEnrichmentRow {
  id: string;

  discovered_record_id: string;

  enrichment_snapshot: unknown;

  provenance_snapshot: unknown;

  row_version: number | string;

  created_at: string;

  updated_at: string;

  updated_by_user_id: string | null;
}

function enrichmentId(
  discoveredRecordId: string,
): string {
  return `enrichment:${discoveredRecordId}`;
}

function rowVersion(
  row: DiscoveredRecordEnrichmentRow,
): number {
  const value =
    Number(
      row.row_version,
    );

  if (
    !Number.isInteger(
      value,
    ) ||
    value < 1
  ) {
    throw new Error(
      "Discovered record enrichment has an invalid database row version.",
    );
  }

  return value;
}

function parseSnapshot(
  value: unknown,
): EnrichmentSnapshot {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "Discovered record enrichment contains an invalid snapshot.",
    );
  }

  return value as EnrichmentSnapshot;
}

function enrichmentFromRow(
  row: DiscoveredRecordEnrichmentRow,
): DiscoveredRecordEnrichment {
  if (
    !row.updated_by_user_id?.trim()
  ) {
    throw new Error(
      "Discovered record enrichment is missing its updating user.",
    );
  }

  return {
    discoveredRecordId:
      row.discovered_record_id,

    ...parseSnapshot(
      row.enrichment_snapshot,
    ),

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,

    updatedByUserId:
      row.updated_by_user_id,
  };
}

function buildProvenanceSnapshot(
  snapshot: EnrichmentSnapshot,
): Record<string, Provenance> {
  const provenance: Record<
    string,
    Provenance
  > = {};

  const add = (
    key: string,
    value:
      | VerifiedFact<unknown>
      | VerifiedMonetaryFact
      | undefined,
  ): void => {
    if (
      value?.provenance
    ) {
      provenance[
        key
      ] =
        value.provenance;
    }
  };

  add(
    "propertyType",
    snapshot.propertyType,
  );

  add(
    "salePrice",
    snapshot.salePrice,
  );

  add(
    "debtSatisfied",
    snapshot.debtSatisfied,
  );

  add(
    "taxesOwed",
    snapshot.taxesOwed,
  );

  add(
    "saleCosts",
    snapshot.saleCosts,
  );

  add(
    "juniorLiens",
    snapshot.juniorLiens,
  );

  add(
    "estimatedSurplus",
    snapshot.estimatedSurplus,
  );

  add(
    "confirmedSurplus",
    snapshot.confirmedSurplus,
  );

  add(
    "sellingEntity",
    snapshot.sellingEntity,
  );

  add(
    "sourceBalanceInterpretation",
    snapshot.sourceBalanceInterpretation,
  );

  return provenance;
}

async function getEnrichmentRow(
  discoveredRecordId: string,
): Promise<
  DiscoveredRecordEnrichmentRow | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "discovered_record_enrichment",
      )
      .select(
        "*",
      )
      .eq(
        "discovered_record_id",
        discoveredRecordId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read discovered record enrichment: ${error.message}`,
    );
  }

  return data
    ? data as DiscoveredRecordEnrichmentRow
    : undefined;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function nowIsoInstant(): IsoInstant {
  return new Date().toISOString() as IsoInstant;
}

function assertSource(
  sourceName: string,
  sourceDate: string,
): void {
  if (
    !sourceName.trim()
  ) {
    throw new Error(
      "Claimant locator source name is required.",
    );
  }

  if (
    !sourceDate.trim()
  ) {
    throw new Error(
      "Claimant locator source date is required.",
    );
  }
}

function assertPhone(
  value: string,
): void {
  const digits =
    value.replace(
      /\D/g,
      "",
    );

  if (
    digits.length < 10 ||
    digits.length > 15
  ) {
    throw new Error(
      "Claimant locator phone candidate is invalid.",
    );
  }
}

function assertEmail(
  value: string,
): void {
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value.trim(),
    )
  ) {
    throw new Error(
      "Claimant locator email candidate is invalid.",
    );
  }
}

function assertProvenance(
  provenance: Provenance,
): void {
  if (
    !provenance.sourceName.trim()
  ) {
    throw new Error(
      "Verified enrichment provenance requires a source name.",
    );
  }

  if (
    !provenance.sourceDate.trim()
  ) {
    throw new Error(
      "Verified enrichment provenance requires a source date.",
    );
  }

  if (
    provenance.quality !== "verified" &&
    provenance.quality !== "confirmed"
  ) {
    throw new Error(
      "Enrichment facts must have verified or confirmed data quality.",
    );
  }
}

function assertMonetaryFact(
  input: VerifiedMonetaryFactInput,
): void {
  assertProvenance(
    input.provenance,
  );

  if (
    !Number.isInteger(
      input.fact.amount,
    ) ||
    input.fact.amount < 0
  ) {
    throw new Error(
      "Verified monetary enrichment amounts must be non-negative integer cents.",
    );
  }

  if (
    input.fact.quality !== "verified" &&
    input.fact.quality !== "confirmed"
  ) {
    throw new Error(
      "Verified monetary enrichment facts must have verified or confirmed data quality.",
    );
  }
}

function assertFact<T>(
  input: VerifiedFactInput<T>,
): void {
  assertProvenance(
    input.provenance,
  );
}

function assertInput(
  input: SaveDiscoveredRecordEnrichmentInput,
): void {
  if (
    !input.discoveredRecordId.trim()
  ) {
    throw new Error(
      "Discovered record id is required for enrichment.",
    );
  }

  if (
    !input.actorUserId.trim()
  ) {
    throw new Error(
      "Enrichment actor user id is required.",
    );
  }

  const hasMutation =
    input.propertyType !== undefined ||
    input.salePrice !== undefined ||
    input.debtSatisfied !== undefined ||
    input.taxesOwed !== undefined ||
    input.saleCosts !== undefined ||
    input.juniorLiens !== undefined ||
    input.estimatedSurplus !== undefined ||
    input.confirmedSurplus !== undefined ||
    input.sellingEntity !== undefined ||
    input.sourceBalanceInterpretation !== undefined;

  if (
    !hasMutation
  ) {
    throw new Error(
      "At least one verified enrichment fact is required.",
    );
  }

  if (
    input.propertyType
  ) {
    assertFact(
      input.propertyType,
    );
  }

  if (
    input.salePrice
  ) {
    assertMonetaryFact(
      input.salePrice,
    );
  }

  if (
    input.debtSatisfied
  ) {
    assertMonetaryFact(
      input.debtSatisfied,
    );
  }

  if (
    input.taxesOwed
  ) {
    assertMonetaryFact(
      input.taxesOwed,
    );
  }

  if (
    input.saleCosts
  ) {
    assertMonetaryFact(
      input.saleCosts,
    );
  }

  if (
    input.juniorLiens
  ) {
    assertMonetaryFact(
      input.juniorLiens,
    );
  }

  if (
    input.estimatedSurplus
  ) {
    assertMonetaryFact(
      input.estimatedSurplus,
    );
  }

  if (
    input.confirmedSurplus
  ) {
    assertMonetaryFact(
      input.confirmedSurplus,
    );
  }

  if (
    input.sellingEntity
  ) {
    assertFact(
      input.sellingEntity,
    );

    if (
      !input.sellingEntity.value.trim()
    ) {
      throw new Error(
        "Verified selling entity cannot be blank.",
      );
    }
  }

  if (
    input.sourceBalanceInterpretation
  ) {
    assertFact(
      input.sourceBalanceInterpretation,
    );

    const allowed: SourceBalanceInterpretation[] = [
      "unresolved",
      "confirmed_surplus",
      "estimated_surplus",
      "other_balance",
      "not_recovery_balance",
    ];

    if (
      !allowed.includes(
        input.sourceBalanceInterpretation.value,
      )
    ) {
      throw new Error(
        "Source balance interpretation is invalid.",
      );
    }
  }
}

function assertLocatorCandidateInput(
  input: AddClaimantLocatorCandidateInput,
): void {
  if (
    !input.discoveredRecordId.trim()
  ) {
    throw new Error(
      "Discovered record id is required for claimant locating.",
    );
  }

  if (
    !input.actorUserId.trim()
  ) {
    throw new Error(
      "Claimant locator actor user id is required.",
    );
  }

  if (
    input.kind !== "phone" &&
    input.kind !== "email" &&
    input.kind !== "mailing_address"
  ) {
    throw new Error(
      "Claimant locator candidate kind is invalid.",
    );
  }

  if (
    !input.value.trim()
  ) {
    throw new Error(
      "Claimant locator candidate value is required.",
    );
  }

  assertSource(
    input.sourceName,
    input.sourceDate,
  );

  if (
    input.kind === "email"
  ) {
    assertEmail(
      input.value,
    );
  }

  if (
    input.kind === "phone"
  ) {
    assertPhone(
      input.value,
    );
  }
}

function assertLocatorIdentityInput(
  input: AddClaimantLocatorIdentityInput,
): void {
  if (
    !input.discoveredRecordId.trim() ||
    !input.actorUserId.trim()
  ) {
    throw new Error(
      "Claimant locator identity details are incomplete.",
    );
  }

  if (
    input.kind !== "first_name" &&
    input.kind !== "last_name" &&
    input.kind !== "alias"
  ) {
    throw new Error(
      "Claimant locator identity kind is invalid.",
    );
  }

  if (
    !input.value.trim()
  ) {
    throw new Error(
      "Claimant locator identity value is required.",
    );
  }

  assertSource(
    input.sourceName,
    input.sourceDate,
  );
}

function assertAssociatedContactInput(
  input: AddClaimantLocatorAssociatedContactInput,
): void {
  if (
    !input.discoveredRecordId.trim() ||
    !input.actorUserId.trim()
  ) {
    throw new Error(
      "Associated contact details are incomplete.",
    );
  }

  if (
    !input.name.trim()
  ) {
    throw new Error(
      "Associated contact name is required.",
    );
  }

  if (
    !input.phone?.trim() &&
    !input.email?.trim()
  ) {
    throw new Error(
      "Associated contact requires at least a phone number or email address.",
    );
  }

  if (
    input.phone?.trim()
  ) {
    assertPhone(
      input.phone,
    );
  }

  if (
    input.email?.trim()
  ) {
    assertEmail(
      input.email,
    );
  }

  assertSource(
    input.sourceName,
    input.sourceDate,
  );
}

function assertLocatorReviewInput(
  discoveredRecordId: string,
  candidateId: string,
  actorUserId: string,
  status: ClaimantLocatorCandidateStatus,
): void {
  if (
    !discoveredRecordId.trim() ||
    !candidateId.trim() ||
    !actorUserId.trim()
  ) {
    throw new Error(
      "Claimant locator review details are incomplete.",
    );
  }

  if (
    status !== "verified" &&
    status !== "rejected"
  ) {
    throw new Error(
      "Claimant locator review status is invalid.",
    );
  }
}

function normalizedCandidateValue(
  kind: ClaimantLocatorCandidateKind,
  value: string,
): string {
  const trimmed =
    value.trim();

  if (
    kind === "email"
  ) {
    return trimmed.toLowerCase();
  }

  if (
    kind === "phone"
  ) {
    return trimmed.replace(
      /\D/g,
      "",
    );
  }

  return trimmed
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    );
}

function normalizedIdentityValue(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    );
}

function normalizedAssociatedContact(
  input: {
    name: string;

    phone?: string;

    email?: string;
  },
): string {
  const name =
    input.name
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        " ",
      );

  const phone =
    input.phone
      ?.replace(
        /\D/g,
        "",
      ) ??
    "";

  const email =
    input.email
      ?.trim()
      .toLowerCase() ??
    "";

  return [
    name,
    phone,
    email,
  ].join("|");
}

/* ========================================================================== */
/* Fact stamping                                                               */
/* ========================================================================== */

function verifiedFact<T>(
  input: VerifiedFactInput<T>,
  actorUserId: string,
  verifiedAt: IsoInstant,
): VerifiedFact<T> {
  return {
    value:
      input.value,

    provenance:
      input.provenance,

    verifiedAt,

    verifiedByUserId:
      actorUserId,
  };
}

function verifiedMoney(
  input: VerifiedMonetaryFactInput,
  actorUserId: string,
  verifiedAt: IsoInstant,
): VerifiedMonetaryFact {
  return {
    fact:
      input.fact,

    provenance:
      input.provenance,

    verifiedAt,

    verifiedByUserId:
      actorUserId,
  };
}

/* ========================================================================== */
/* Snapshot helpers                                                            */
/* ========================================================================== */

function snapshotWithLocator(
  existing:
    | DiscoveredRecordEnrichment
    | undefined,
  claimantLocator: ClaimantLocatorSnapshot,
): EnrichmentSnapshot {
  return {
    propertyType:
      existing?.propertyType,

    salePrice:
      existing?.salePrice,

    debtSatisfied:
      existing?.debtSatisfied,

    taxesOwed:
      existing?.taxesOwed,

    saleCosts:
      existing?.saleCosts,

    juniorLiens:
      existing?.juniorLiens,

    estimatedSurplus:
      existing?.estimatedSurplus,

    confirmedSurplus:
      existing?.confirmedSurplus,

    sellingEntity:
      existing?.sellingEntity,

    sourceBalanceInterpretation:
      existing?.sourceBalanceInterpretation,

    claimantLocator,
  };
}

/* ========================================================================== */
/* Locator snapshot persistence                                                */
/* ========================================================================== */

async function saveLocatorSnapshot(
  discoveredRecordId: string,
  actorUserId: string,
  snapshot: EnrichmentSnapshot,
  existingRow:
    | DiscoveredRecordEnrichmentRow
    | undefined,
): Promise<DiscoveredRecordEnrichment> {
  const timestamp =
    nowIsoInstant();

  const provenanceSnapshot =
    buildProvenanceSnapshot(
      snapshot,
    );

  const supabase =
    getSupabaseAdmin();

  if (
    existingRow
  ) {
    const expectedVersion =
      rowVersion(
        existingRow,
      );

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "discovered_record_enrichment",
        )
        .update({
          enrichment_snapshot:
            snapshot,

          provenance_snapshot:
            provenanceSnapshot,

          row_version:
            expectedVersion + 1,

          updated_at:
            timestamp,

          updated_by_user_id:
            actorUserId,
        })
        .eq(
          "discovered_record_id",
          discoveredRecordId,
        )
        .eq(
          "row_version",
          expectedVersion,
        )
        .select(
          "*",
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to update claimant locator enrichment: ${error.message}`,
      );
    }

    if (
      !data
    ) {
      throw new Error(
        "Claimant locator data changed while this request was being processed. Reload and try again.",
      );
    }

    return enrichmentFromRow(
      data as DiscoveredRecordEnrichmentRow,
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "discovered_record_enrichment",
      )
      .insert({
        id:
          enrichmentId(
            discoveredRecordId,
          ),

        discovered_record_id:
          discoveredRecordId,

        enrichment_snapshot:
          snapshot,

        provenance_snapshot:
          provenanceSnapshot,

        row_version:
          1,

        created_at:
          timestamp,

        updated_at:
          timestamp,

        updated_by_user_id:
          actorUserId,
      })
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to save claimant locator enrichment: ${error.message}`,
    );
  }

  return enrichmentFromRow(
    data as DiscoveredRecordEnrichmentRow,
  );
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listDiscoveredRecordEnrichments(): Promise<
  DiscoveredRecordEnrichment[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "discovered_record_enrichment",
      )
      .select(
        "*",
      )
      .order(
        "updated_at",
        {
          ascending:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to list discovered record enrichments: ${error.message}`,
    );
  }

  return (
    data ?? []
  ).map(
    (row) =>
      enrichmentFromRow(
        row as DiscoveredRecordEnrichmentRow,
      ),
  );
}

export async function getDiscoveredRecordEnrichment(
  discoveredRecordId: string,
): Promise<
  DiscoveredRecordEnrichment | undefined
> {
  const row =
    await getEnrichmentRow(
      discoveredRecordId.trim(),
    );

  return row
    ? enrichmentFromRow(
        row,
      )
    : undefined;
}

/* ========================================================================== */
/* Claimant locator contact candidates                                         */
/* ========================================================================== */

export async function addClaimantLocatorCandidate(
  input: AddClaimantLocatorCandidateInput,
): Promise<DiscoveredRecordEnrichment> {
  assertLocatorCandidateInput(
    input,
  );

  const discoveredRecordId =
    input.discoveredRecordId.trim();

  const actorUserId =
    input.actorUserId.trim();

  const existingRow =
    await getEnrichmentRow(
      discoveredRecordId,
    );

  const existing =
    existingRow
      ? enrichmentFromRow(
          existingRow,
        )
      : undefined;

  const locator =
    existing?.claimantLocator;

  const candidates =
    locator?.candidates ??
    [];

  const normalizedValue =
    normalizedCandidateValue(
      input.kind,
      input.value,
    );

  const duplicate =
    candidates.some(
      (candidate) =>
        candidate.kind ===
          input.kind &&
        normalizedCandidateValue(
          candidate.kind,
          candidate.value,
        ) ===
          normalizedValue &&
        candidate.status !==
          "rejected",
    );

  if (
    duplicate
  ) {
    throw new Error(
      "This claimant locator candidate is already recorded.",
    );
  }

  const timestamp =
    nowIsoInstant();

  const candidate: ClaimantLocatorCandidate = {
    id:
      `locator:${randomUUID()}`,

    kind:
      input.kind,

    value:
      input.value.trim(),

    source: {
      sourceName:
        input.sourceName.trim(),

      sourceUrl:
        input.sourceUrl?.trim() ||
        undefined,

      sourceDate:
        input.sourceDate.trim(),
    },

    status:
      "candidate",

    foundAt:
      timestamp,

    foundByUserId:
      actorUserId,
  };

  const snapshot =
    snapshotWithLocator(
      existing,
      {
        candidates: [
          ...candidates,
          candidate,
        ],

        identities:
          locator?.identities ??
          [],

        associatedContacts:
          locator?.associatedContacts ??
          [],
      },
    );

  return saveLocatorSnapshot(
    discoveredRecordId,
    actorUserId,
    snapshot,
    existingRow,
  );
}

export async function reviewClaimantLocatorCandidate(
  input: ReviewClaimantLocatorCandidateInput,
): Promise<DiscoveredRecordEnrichment> {
  assertLocatorReviewInput(
    input.discoveredRecordId,
    input.candidateId,
    input.actorUserId,
    input.status,
  );

  const discoveredRecordId =
    input.discoveredRecordId.trim();

  const actorUserId =
    input.actorUserId.trim();

  const existingRow =
    await getEnrichmentRow(
      discoveredRecordId,
    );

  if (
    !existingRow
  ) {
    throw new Error(
      "No claimant locator candidates are recorded for this discovered record.",
    );
  }

  const existing =
    enrichmentFromRow(
      existingRow,
    );

  const locator =
    existing.claimantLocator;

  const candidates =
    locator?.candidates ??
    [];

  const candidateIndex =
    candidates.findIndex(
      (candidate) =>
        candidate.id ===
        input.candidateId.trim(),
    );

  if (
    candidateIndex < 0
  ) {
    throw new Error(
      "Claimant locator candidate was not found.",
    );
  }

  const timestamp =
    nowIsoInstant();

  const reviewedCandidate: ClaimantLocatorCandidate = {
    ...candidates[
      candidateIndex
    ],

    status:
      input.status,

    reviewedAt:
      timestamp,

    reviewedByUserId:
      actorUserId,

    reviewNote:
      input.reviewNote?.trim() ||
      undefined,
  };

  const nextCandidates =
    candidates.map(
      (
        candidate,
        index,
      ) =>
        index ===
        candidateIndex
          ? reviewedCandidate
          : candidate,
    );

  const snapshot =
    snapshotWithLocator(
      existing,
      {
        candidates:
          nextCandidates,

        identities:
          locator?.identities ??
          [],

        associatedContacts:
          locator?.associatedContacts ??
          [],
      },
    );

  return saveLocatorSnapshot(
    discoveredRecordId,
    actorUserId,
    snapshot,
    existingRow,
  );
}

/* ========================================================================== */
/* Claimant locator identity                                                   */
/* ========================================================================== */

export async function addClaimantLocatorIdentity(
  input: AddClaimantLocatorIdentityInput,
): Promise<DiscoveredRecordEnrichment> {
  assertLocatorIdentityInput(
    input,
  );

  const discoveredRecordId =
    input.discoveredRecordId.trim();

  const actorUserId =
    input.actorUserId.trim();

  const existingRow =
    await getEnrichmentRow(
      discoveredRecordId,
    );

  const existing =
    existingRow
      ? enrichmentFromRow(
          existingRow,
        )
      : undefined;

  const locator =
    existing?.claimantLocator;

  const identities =
    locator?.identities ??
    [];

  const normalizedValue =
    normalizedIdentityValue(
      input.value,
    );

  const duplicate =
    identities.some(
      (candidate) =>
        candidate.kind ===
          input.kind &&
        normalizedIdentityValue(
          candidate.value,
        ) ===
          normalizedValue &&
        candidate.status !==
          "rejected",
    );

  if (
    duplicate
  ) {
    throw new Error(
      "This claimant identity finding is already recorded.",
    );
  }

  const timestamp =
    nowIsoInstant();

  const candidate: ClaimantLocatorIdentityCandidate = {
    id:
      `identity:${randomUUID()}`,

    kind:
      input.kind,

    value:
      input.value.trim(),

    source: {
      sourceName:
        input.sourceName.trim(),

      sourceUrl:
        input.sourceUrl?.trim() ||
        undefined,

      sourceDate:
        input.sourceDate.trim(),
    },

    status:
      "candidate",

    foundAt:
      timestamp,

    foundByUserId:
      actorUserId,
  };

  const snapshot =
    snapshotWithLocator(
      existing,
      {
        candidates:
          locator?.candidates ??
          [],

        identities: [
          ...identities,
          candidate,
        ],

        associatedContacts:
          locator?.associatedContacts ??
          [],
      },
    );

  return saveLocatorSnapshot(
    discoveredRecordId,
    actorUserId,
    snapshot,
    existingRow,
  );
}

export async function reviewClaimantLocatorIdentity(
  input: ReviewClaimantLocatorIdentityInput,
): Promise<DiscoveredRecordEnrichment> {
  assertLocatorReviewInput(
    input.discoveredRecordId,
    input.candidateId,
    input.actorUserId,
    input.status,
  );

  const discoveredRecordId =
    input.discoveredRecordId.trim();

  const actorUserId =
    input.actorUserId.trim();

  const existingRow =
    await getEnrichmentRow(
      discoveredRecordId,
    );

  if (
    !existingRow
  ) {
    throw new Error(
      "No claimant locator identity findings are recorded for this discovered record.",
    );
  }

  const existing =
    enrichmentFromRow(
      existingRow,
    );

  const locator =
    existing.claimantLocator;

  const identities =
    locator?.identities ??
    [];

  const candidateIndex =
    identities.findIndex(
      (candidate) =>
        candidate.id ===
        input.candidateId.trim(),
    );

  if (
    candidateIndex < 0
  ) {
    throw new Error(
      "Claimant locator identity finding was not found.",
    );
  }

  const timestamp =
    nowIsoInstant();

  const reviewedCandidate: ClaimantLocatorIdentityCandidate = {
    ...identities[
      candidateIndex
    ],

    status:
      input.status,

    reviewedAt:
      timestamp,

    reviewedByUserId:
      actorUserId,

    reviewNote:
      input.reviewNote?.trim() ||
      undefined,
  };

  const nextIdentities =
    identities.map(
      (
        candidate,
        index,
      ) =>
        index ===
        candidateIndex
          ? reviewedCandidate
          : candidate,
    );

  const snapshot =
    snapshotWithLocator(
      existing,
      {
        candidates:
          locator?.candidates ??
          [],

        identities:
          nextIdentities,

        associatedContacts:
          locator?.associatedContacts ??
          [],
      },
    );

  return saveLocatorSnapshot(
    discoveredRecordId,
    actorUserId,
    snapshot,
    existingRow,
  );
}

/* ========================================================================== */
/* Claimant locator associated contacts                                        */
/* ========================================================================== */

export async function addClaimantLocatorAssociatedContact(
  input: AddClaimantLocatorAssociatedContactInput,
): Promise<DiscoveredRecordEnrichment> {
  assertAssociatedContactInput(
    input,
  );

  const discoveredRecordId =
    input.discoveredRecordId.trim();

  const actorUserId =
    input.actorUserId.trim();

  const existingRow =
    await getEnrichmentRow(
      discoveredRecordId,
    );

  const existing =
    existingRow
      ? enrichmentFromRow(
          existingRow,
        )
      : undefined;

  const locator =
    existing?.claimantLocator;

  const associatedContacts =
    locator?.associatedContacts ??
    [];

  const normalizedValue =
    normalizedAssociatedContact({
      name:
        input.name,

      phone:
        input.phone,

      email:
        input.email,
    });

  const duplicate =
    associatedContacts.some(
      (candidate) =>
        normalizedAssociatedContact({
          name:
            candidate.name,

          phone:
            candidate.phone,

          email:
            candidate.email,
        }) ===
          normalizedValue &&
        candidate.status !==
          "rejected",
    );

  if (
    duplicate
  ) {
    throw new Error(
      "This associated contact finding is already recorded.",
    );
  }

  const timestamp =
    nowIsoInstant();

  const candidate: ClaimantLocatorAssociatedContact = {
    id:
      `associate:${randomUUID()}`,

    name:
      input.name.trim(),

    relationship:
      input.relationship?.trim() ||
      undefined,

    phone:
      input.phone?.trim() ||
      undefined,

    email:
      input.email?.trim() ||
      undefined,

    source: {
      sourceName:
        input.sourceName.trim(),

      sourceUrl:
        input.sourceUrl?.trim() ||
        undefined,

      sourceDate:
        input.sourceDate.trim(),
    },

    status:
      "candidate",

    foundAt:
      timestamp,

    foundByUserId:
      actorUserId,
  };

  const snapshot =
    snapshotWithLocator(
      existing,
      {
        candidates:
          locator?.candidates ??
          [],

        identities:
          locator?.identities ??
          [],

        associatedContacts: [
          ...associatedContacts,
          candidate,
        ],
      },
    );

  return saveLocatorSnapshot(
    discoveredRecordId,
    actorUserId,
    snapshot,
    existingRow,
  );
}

export async function reviewClaimantLocatorAssociatedContact(
  input: ReviewClaimantLocatorAssociatedContactInput,
): Promise<DiscoveredRecordEnrichment> {
  assertLocatorReviewInput(
    input.discoveredRecordId,
    input.candidateId,
    input.actorUserId,
    input.status,
  );

  const discoveredRecordId =
    input.discoveredRecordId.trim();

  const actorUserId =
    input.actorUserId.trim();

  const existingRow =
    await getEnrichmentRow(
      discoveredRecordId,
    );

  if (
    !existingRow
  ) {
    throw new Error(
      "No associated contact findings are recorded for this discovered record.",
    );
  }

  const existing =
    enrichmentFromRow(
      existingRow,
    );

  const locator =
    existing.claimantLocator;

  const contacts =
    locator?.associatedContacts ??
    [];

  const candidateIndex =
    contacts.findIndex(
      (candidate) =>
        candidate.id ===
        input.candidateId.trim(),
    );

  if (
    candidateIndex < 0
  ) {
    throw new Error(
      "Associated contact finding was not found.",
    );
  }

  const timestamp =
    nowIsoInstant();

  const reviewedCandidate: ClaimantLocatorAssociatedContact = {
    ...contacts[
      candidateIndex
    ],

    status:
      input.status,

    reviewedAt:
      timestamp,

    reviewedByUserId:
      actorUserId,

    reviewNote:
      input.reviewNote?.trim() ||
      undefined,
  };

  const nextContacts =
    contacts.map(
      (
        candidate,
        index,
      ) =>
        index ===
        candidateIndex
          ? reviewedCandidate
          : candidate,
    );

  const snapshot =
    snapshotWithLocator(
      existing,
      {
        candidates:
          locator?.candidates ??
          [],

        identities:
          locator?.identities ??
          [],

        associatedContacts:
          nextContacts,
      },
    );

  return saveLocatorSnapshot(
    discoveredRecordId,
    actorUserId,
    snapshot,
    existingRow,
  );
}

/* ========================================================================== */
/* Save verified enrichment                                                    */
/* ========================================================================== */

export async function saveDiscoveredRecordEnrichment(
  input: SaveDiscoveredRecordEnrichmentInput,
): Promise<DiscoveredRecordEnrichment> {
  assertInput(
    input,
  );

  const discoveredRecordId =
    input.discoveredRecordId.trim();

  const actorUserId =
    input.actorUserId.trim();

  const existingRow =
    await getEnrichmentRow(
      discoveredRecordId,
    );

  const existing =
    existingRow
      ? enrichmentFromRow(
          existingRow,
        )
      : undefined;

  const timestamp =
    nowIsoInstant();

  const snapshot: EnrichmentSnapshot = {
    propertyType:
      input.propertyType
        ? verifiedFact(
            input.propertyType,
            actorUserId,
            timestamp,
          )
        : existing?.propertyType,

    salePrice:
      input.salePrice
        ? verifiedMoney(
            input.salePrice,
            actorUserId,
            timestamp,
          )
        : existing?.salePrice,

    debtSatisfied:
      input.debtSatisfied
        ? verifiedMoney(
            input.debtSatisfied,
            actorUserId,
            timestamp,
          )
        : existing?.debtSatisfied,

    taxesOwed:
      input.taxesOwed
        ? verifiedMoney(
            input.taxesOwed,
            actorUserId,
            timestamp,
          )
        : existing?.taxesOwed,

    saleCosts:
      input.saleCosts
        ? verifiedMoney(
            input.saleCosts,
            actorUserId,
            timestamp,
          )
        : existing?.saleCosts,

    juniorLiens:
      input.juniorLiens
        ? verifiedMoney(
            input.juniorLiens,
            actorUserId,
            timestamp,
          )
        : existing?.juniorLiens,

    estimatedSurplus:
      input.estimatedSurplus
        ? verifiedMoney(
            input.estimatedSurplus,
            actorUserId,
            timestamp,
          )
        : existing?.estimatedSurplus,

    confirmedSurplus:
      input.confirmedSurplus
        ? verifiedMoney(
            input.confirmedSurplus,
            actorUserId,
            timestamp,
          )
        : existing?.confirmedSurplus,

    sellingEntity:
      input.sellingEntity
        ? verifiedFact(
            input.sellingEntity,
            actorUserId,
            timestamp,
          )
        : existing?.sellingEntity,

    sourceBalanceInterpretation:
      input.sourceBalanceInterpretation
        ? verifiedFact(
            input.sourceBalanceInterpretation,
            actorUserId,
            timestamp,
          )
        : existing?.sourceBalanceInterpretation,

    claimantLocator:
      existing?.claimantLocator,
  };

  const provenanceSnapshot =
    buildProvenanceSnapshot(
      snapshot,
    );

  if (
    existingRow
  ) {
    const expectedVersion =
      rowVersion(
        existingRow,
      );

    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "discovered_record_enrichment",
        )
        .update({
          enrichment_snapshot:
            snapshot,

          provenance_snapshot:
            provenanceSnapshot,

          row_version:
            expectedVersion + 1,

          updated_at:
            timestamp,

          updated_by_user_id:
            actorUserId,
        })
        .eq(
          "discovered_record_id",
          discoveredRecordId,
        )
        .eq(
          "row_version",
          expectedVersion,
        )
        .select(
          "*",
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to update discovered record enrichment: ${error.message}`,
      );
    }

    if (
      !data
    ) {
      throw new Error(
        "Discovered record enrichment changed while this request was being processed. Reload and try again.",
      );
    }

    return enrichmentFromRow(
      data as DiscoveredRecordEnrichmentRow,
    );
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "discovered_record_enrichment",
      )
      .insert({
        id:
          enrichmentId(
            discoveredRecordId,
          ),

        discovered_record_id:
          discoveredRecordId,

        enrichment_snapshot:
          snapshot,

        provenance_snapshot:
          provenanceSnapshot,

        row_version:
          1,

        created_at:
          timestamp,

        updated_at:
          timestamp,

        updated_by_user_id:
          actorUserId,
      })
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to save discovered record enrichment: ${error.message}`,
    );
  }

  return enrichmentFromRow(
    data as DiscoveredRecordEnrichmentRow,
  );
}

/* ========================================================================== */
/* Promotion-readiness evaluation                                              */
/* ========================================================================== */

export function evaluateDiscoveredRecordEnrichmentReadiness(
  enrichment:
    | DiscoveredRecordEnrichment
    | undefined,
  options?: {
    hasSourceListedBalance?: boolean;
  },
): DiscoveredRecordEnrichmentReadiness {
  const missing: string[] = [];

  const cautions: string[] = [];

  if (
    !enrichment?.propertyType
  ) {
    missing.push(
      "Verified property type",
    );
  }

  if (
    !enrichment?.salePrice
  ) {
    missing.push(
      "Verified sale price",
    );
  }

  if (
    !enrichment?.debtSatisfied
  ) {
    missing.push(
      "Verified debt satisfied",
    );
  }

  if (
    !enrichment?.estimatedSurplus
  ) {
    missing.push(
      "Verified estimated surplus",
    );
  }

  if (
    !enrichment?.sellingEntity
  ) {
    missing.push(
      "Verified selling entity",
    );
  }

  if (
    options
      ?.hasSourceListedBalance &&
    !enrichment
      ?.sourceBalanceInterpretation
  ) {
    missing.push(
      "Verified interpretation of the source-listed balance",
    );
  }

  if (
    enrichment
      ?.sourceBalanceInterpretation
      ?.value ===
    "unresolved"
  ) {
    missing.push(
      "Resolved interpretation of the source-listed balance",
    );
  }

  if (
    enrichment
      ?.sourceBalanceInterpretation
      ?.value ===
      "confirmed_surplus" &&
    !enrichment.confirmedSurplus
  ) {
    missing.push(
      "Confirmed surplus amount",
    );
  }

  if (
    enrichment
      ?.sourceBalanceInterpretation
      ?.value ===
    "other_balance"
  ) {
    cautions.push(
      "The official source balance has been classified as a different financial value and must not be mapped to confirmed surplus.",
    );
  }

  if (
    enrichment
      ?.sourceBalanceInterpretation
      ?.value ===
    "not_recovery_balance"
  ) {
    cautions.push(
      "The official source balance has been determined not to represent a recoverable surplus amount.",
    );
  }

  return {
    ready:
      missing.length === 0,

    missing,

    cautions,
  };
}