import "server-only";

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

function enrichmentId(discoveredRecordId: string): string {
  return `enrichment:${discoveredRecordId}`;
}

function rowVersion(row: DiscoveredRecordEnrichmentRow): number {
  const value = Number(row.row_version);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      "Discovered record enrichment has an invalid database row version.",
    );
  }

  return value;
}

function parseSnapshot(value: unknown): EnrichmentSnapshot {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
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
  if (!row.updated_by_user_id?.trim()) {
    throw new Error(
      "Discovered record enrichment is missing its updating user.",
    );
  }

  return {
    discoveredRecordId: row.discovered_record_id,

    ...parseSnapshot(row.enrichment_snapshot),

    createdAt: row.created_at as IsoInstant,

    updatedAt: row.updated_at as IsoInstant,

    updatedByUserId: row.updated_by_user_id,
  };
}

function buildProvenanceSnapshot(
  snapshot: EnrichmentSnapshot,
): Record<string, Provenance> {
  const provenance: Record<string, Provenance> = {};

  const add = (
    key: string,
    value:
      | VerifiedFact<unknown>
      | VerifiedMonetaryFact
      | undefined,
  ): void => {
    if (value?.provenance) {
      provenance[key] = value.provenance;
    }
  };

  add("propertyType", snapshot.propertyType);

  add("salePrice", snapshot.salePrice);

  add("debtSatisfied", snapshot.debtSatisfied);

  add("taxesOwed", snapshot.taxesOwed);

  add("saleCosts", snapshot.saleCosts);

  add("juniorLiens", snapshot.juniorLiens);

  add("estimatedSurplus", snapshot.estimatedSurplus);

  add("confirmedSurplus", snapshot.confirmedSurplus);

  add("sellingEntity", snapshot.sellingEntity);

  add(
    "sourceBalanceInterpretation",
    snapshot.sourceBalanceInterpretation,
  );

  return provenance;
}

async function getEnrichmentRow(
  discoveredRecordId: string,
): Promise<DiscoveredRecordEnrichmentRow | undefined> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("discovered_record_enrichment")
    .select("*")
    .eq("discovered_record_id", discoveredRecordId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read discovered record enrichment: ${error.message}`,
    );
  }

  return data
    ? (data as DiscoveredRecordEnrichmentRow)
    : undefined;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function nowIsoInstant(): IsoInstant {
  return new Date().toISOString() as IsoInstant;
}

function assertProvenance(provenance: Provenance): void {
  if (!provenance.sourceName.trim()) {
    throw new Error(
      "Verified enrichment provenance requires a source name.",
    );
  }

  if (!provenance.sourceDate.trim()) {
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
  assertProvenance(input.provenance);

  if (
    !Number.isInteger(input.fact.amount) ||
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
  assertProvenance(input.provenance);
}

function assertInput(
  input: SaveDiscoveredRecordEnrichmentInput,
): void {
  if (!input.discoveredRecordId.trim()) {
    throw new Error(
      "Discovered record id is required for enrichment.",
    );
  }

  if (!input.actorUserId.trim()) {
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

  if (!hasMutation) {
    throw new Error(
      "At least one verified enrichment fact is required.",
    );
  }

  if (input.propertyType) {
    assertFact(input.propertyType);
  }

  if (input.salePrice) {
    assertMonetaryFact(input.salePrice);
  }

  if (input.debtSatisfied) {
    assertMonetaryFact(input.debtSatisfied);
  }

  if (input.taxesOwed) {
    assertMonetaryFact(input.taxesOwed);
  }

  if (input.saleCosts) {
    assertMonetaryFact(input.saleCosts);
  }

  if (input.juniorLiens) {
    assertMonetaryFact(input.juniorLiens);
  }

  if (input.estimatedSurplus) {
    assertMonetaryFact(input.estimatedSurplus);
  }

  if (input.confirmedSurplus) {
    assertMonetaryFact(input.confirmedSurplus);
  }

  if (input.sellingEntity) {
    assertFact(input.sellingEntity);

    if (!input.sellingEntity.value.trim()) {
      throw new Error(
        "Verified selling entity cannot be blank.",
      );
    }
  }

  if (input.sourceBalanceInterpretation) {
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

/* ========================================================================== */
/* Fact stamping                                                               */
/* ========================================================================== */

function verifiedFact<T>(
  input: VerifiedFactInput<T>,
  actorUserId: string,
  verifiedAt: IsoInstant,
): VerifiedFact<T> {
  return {
    value: input.value,

    provenance: input.provenance,

    verifiedAt,

    verifiedByUserId: actorUserId,
  };
}

function verifiedMoney(
  input: VerifiedMonetaryFactInput,
  actorUserId: string,
  verifiedAt: IsoInstant,
): VerifiedMonetaryFact {
  return {
    fact: input.fact,

    provenance: input.provenance,

    verifiedAt,

    verifiedByUserId: actorUserId,
  };
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listDiscoveredRecordEnrichments(): Promise<
  DiscoveredRecordEnrichment[]
> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("discovered_record_enrichment")
    .select("*")
    .order("updated_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `Unable to list discovered record enrichments: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    enrichmentFromRow(
      row as DiscoveredRecordEnrichmentRow,
    ),
  );
}

export async function getDiscoveredRecordEnrichment(
  discoveredRecordId: string,
): Promise<DiscoveredRecordEnrichment | undefined> {
  const row = await getEnrichmentRow(
    discoveredRecordId.trim(),
  );

  return row
    ? enrichmentFromRow(row)
    : undefined;
}

/* ========================================================================== */
/* Save verified enrichment                                                    */
/* ========================================================================== */

export async function saveDiscoveredRecordEnrichment(
  input: SaveDiscoveredRecordEnrichmentInput,
): Promise<DiscoveredRecordEnrichment> {
  assertInput(input);

  const discoveredRecordId =
    input.discoveredRecordId.trim();

  const actorUserId =
    input.actorUserId.trim();

  const existingRow = await getEnrichmentRow(
    discoveredRecordId,
  );

  const existing = existingRow
    ? enrichmentFromRow(existingRow)
    : undefined;

  const timestamp = nowIsoInstant();

  const snapshot: EnrichmentSnapshot = {
    propertyType: input.propertyType
      ? verifiedFact(
          input.propertyType,
          actorUserId,
          timestamp,
        )
      : existing?.propertyType,

    salePrice: input.salePrice
      ? verifiedMoney(
          input.salePrice,
          actorUserId,
          timestamp,
        )
      : existing?.salePrice,

    debtSatisfied: input.debtSatisfied
      ? verifiedMoney(
          input.debtSatisfied,
          actorUserId,
          timestamp,
        )
      : existing?.debtSatisfied,

    taxesOwed: input.taxesOwed
      ? verifiedMoney(
          input.taxesOwed,
          actorUserId,
          timestamp,
        )
      : existing?.taxesOwed,

    saleCosts: input.saleCosts
      ? verifiedMoney(
          input.saleCosts,
          actorUserId,
          timestamp,
        )
      : existing?.saleCosts,

    juniorLiens: input.juniorLiens
      ? verifiedMoney(
          input.juniorLiens,
          actorUserId,
          timestamp,
        )
      : existing?.juniorLiens,

    estimatedSurplus: input.estimatedSurplus
      ? verifiedMoney(
          input.estimatedSurplus,
          actorUserId,
          timestamp,
        )
      : existing?.estimatedSurplus,

    confirmedSurplus: input.confirmedSurplus
      ? verifiedMoney(
          input.confirmedSurplus,
          actorUserId,
          timestamp,
        )
      : existing?.confirmedSurplus,

    sellingEntity: input.sellingEntity
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
  };

  const provenanceSnapshot =
    buildProvenanceSnapshot(snapshot);

  if (existingRow) {
    const expectedVersion =
      rowVersion(existingRow);

    const supabase =
      getSupabaseAdmin();

    const { data, error } = await supabase
      .from("discovered_record_enrichment")
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
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to update discovered record enrichment: ${error.message}`,
      );
    }

    if (!data) {
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

  const { data, error } = await supabase
    .from("discovered_record_enrichment")
    .insert({
      id: enrichmentId(
        discoveredRecordId,
      ),

      discovered_record_id:
        discoveredRecordId,

      enrichment_snapshot:
        snapshot,

      provenance_snapshot:
        provenanceSnapshot,

      row_version: 1,

      created_at:
        timestamp,

      updated_at:
        timestamp,

      updated_by_user_id:
        actorUserId,
    })
    .select("*")
    .single();

  if (error) {
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
  enrichment: DiscoveredRecordEnrichment | undefined,
  options?: {
    hasSourceListedBalance?: boolean;
  },
): DiscoveredRecordEnrichmentReadiness {
  const missing: string[] = [];

  const cautions: string[] = [];

  if (!enrichment?.propertyType) {
    missing.push(
      "Verified property type",
    );
  }

  if (!enrichment?.salePrice) {
    missing.push(
      "Verified sale price",
    );
  }

  if (!enrichment?.debtSatisfied) {
    missing.push(
      "Verified debt satisfied",
    );
  }

  if (!enrichment?.estimatedSurplus) {
    missing.push(
      "Verified estimated surplus",
    );
  }

  if (!enrichment?.sellingEntity) {
    missing.push(
      "Verified selling entity",
    );
  }

  if (
    options?.hasSourceListedBalance &&
    !enrichment?.sourceBalanceInterpretation
  ) {
    missing.push(
      "Verified interpretation of the source-listed balance",
    );
  }

  if (
    enrichment?.sourceBalanceInterpretation
      ?.value === "unresolved"
  ) {
    missing.push(
      "Resolved interpretation of the source-listed balance",
    );
  }

  if (
    enrichment?.sourceBalanceInterpretation
      ?.value === "confirmed_surplus" &&
    !enrichment.confirmedSurplus
  ) {
    missing.push(
      "Confirmed surplus amount",
    );
  }

  if (
    enrichment?.sourceBalanceInterpretation
      ?.value === "other_balance"
  ) {
    cautions.push(
      "The official source balance has been classified as a different financial value and must not be mapped to confirmed surplus.",
    );
  }

  if (
    enrichment?.sourceBalanceInterpretation
      ?.value === "not_recovery_balance"
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