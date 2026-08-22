import "server-only";

import { createHash } from "node:crypto";

import type {
  IsoDate,
  IsoInstant,
  SaleType,
  SourceKind,
  StateCode,
  SurplusCustodian,
} from "@/domain/types";

import { getSupabaseAdmin } from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type DiscoveredRecordStatus =
  | "new"
  | "reviewed"
  | "promoted"
  | "dismissed";

export type DiscoveredRecordReviewDecision =
  | "reviewed"
  | "dismissed";

export interface DiscoveredRecord {
  id: string;

  adapterKey: string;

  recordKey: string;

  status: DiscoveredRecordStatus;

  sourceKind: SourceKind;

  sourceName: string;

  sourceUrl: string;

  sourceReference?: string;

  formerOwnerName: string;

  currentOwnerName?: string;

  propertyId?: string;

  addressLine1: string;

  city: string;

  county: string;

  state: StateCode;

  postalCode?: string;

  saleType: SaleType;

  saleDate: IsoDate;

  dateTransferred?: IsoDate;

  caseNumber?: string;

  parcelNumber?: string;

  mapNumber?: string;

  gridNumber?: string;

  legalDescription?: string;

  agencyName: string;

  agencyPhone?: string;

  custodian: SurplusCustodian;

  sourceListedBidCents?: number;

  sourceListedDepositCents?: number;

  sourceListedSurplusCents?: number;

  sourceListedBalanceCents?: number;

  discoveredAt: IsoInstant;

  lastSeenAt: IsoInstant;

  sourceRetrievedAt: IsoInstant;

  reviewedAt?: IsoInstant;

  reviewedByUserId?: string;

  reviewNote?: string;

  promotedOpportunityId?: string;
}

export interface SaveDiscoveredRecordInput {
  adapterKey: string;

  recordKey: string;

  sourceKind: SourceKind;

  sourceName: string;

  sourceUrl: string;

  sourceReference?: string;

  formerOwnerName: string;

  currentOwnerName?: string;

  propertyId?: string;

  addressLine1: string;

  city: string;

  county: string;

  state: StateCode;

  postalCode?: string;

  saleType: SaleType;

  saleDate: IsoDate;

  dateTransferred?: IsoDate;

  caseNumber?: string;

  parcelNumber?: string;

  mapNumber?: string;

  gridNumber?: string;

  legalDescription?: string;

  agencyName: string;

  agencyPhone?: string;

  custodian: SurplusCustodian;

  sourceListedBidCents?: number;

  sourceListedDepositCents?: number;

  sourceListedSurplusCents?: number;

  sourceListedBalanceCents?: number;

  sourceRetrievedAt: IsoInstant;
}

export interface ReviewDiscoveredRecordInput {
  id: string;

  decision: DiscoveredRecordReviewDecision;

  actorUserId: string;

  reviewNote?: string;
}

export interface PromoteDiscoveredRecordInput {
  id: string;

  opportunityId: string;
}

/* ========================================================================== */
/* Database row                                                                */
/* ========================================================================== */

interface DiscoveredRecordRow {
  id: string;

  adapter_key: string;

  record_key: string;

  status: DiscoveredRecordStatus;

  source_kind: string;

  source_name: string;

  source_url: string;

  source_reference: string | null;

  former_owner_name: string;

  property_id: string | null;

  address_line1: string;

  city: string;

  county: string;

  state_code: string;

  state_fips: string | null;

  county_geoid: string | null;

  postal_code: string | null;

  sale_type: string;

  sale_date: string;

  case_number: string | null;

  parcel_number: string | null;

  agency_name: string;

  agency_phone: string | null;

  custodian: string;

  source_listed_balance_cents:
    | number
    | string
    | null;

  discovered_at: string;

  last_seen_at: string;

  source_retrieved_at: string;

  reviewed_at: string | null;

  review_note: string | null;

  promoted_opportunity_id: string | null;

  source_snapshot: unknown;

  row_version: number | string;

  updated_by_user_id: string | null;

  updated_at: string;
}

/* ========================================================================== */
/* Source snapshot                                                             */
/* ========================================================================== */

interface DiscoveredRecordSourceSnapshot {
  currentOwnerName?: string;

  dateTransferred?: IsoDate;

  mapNumber?: string;

  gridNumber?: string;

  legalDescription?: string;

  sourceListedBidCents?: number;

  sourceListedDepositCents?: number;

  sourceListedSurplusCents?: number;
}

function sourceSnapshotFromUnknown(
  value: unknown,
): DiscoveredRecordSourceSnapshot {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as DiscoveredRecordSourceSnapshot;
}

function optionalSnapshotString(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed || undefined;
}

function optionalSnapshotMoney(
  value: unknown,
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return undefined;
  }

  return value;
}

function buildSourceSnapshot(
  input: SaveDiscoveredRecordInput,
): DiscoveredRecordSourceSnapshot {
  return {
    currentOwnerName:
      input.currentOwnerName?.trim() ||
      undefined,

    dateTransferred:
      input.dateTransferred,

    mapNumber:
      input.mapNumber?.trim() ||
      undefined,

    gridNumber:
      input.gridNumber?.trim() ||
      undefined,

    legalDescription:
      input.legalDescription?.trim() ||
      undefined,

    sourceListedBidCents:
      input.sourceListedBidCents,

    sourceListedDepositCents:
      input.sourceListedDepositCents,

    sourceListedSurplusCents:
      input.sourceListedSurplusCents,
  };
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function nowIsoInstant(): IsoInstant {
  return new Date().toISOString() as IsoInstant;
}

export function discoveredRecordId(
  adapterKey: string,
  recordKey: string,
): string {
  const digest = createHash("sha256")
    .update(
      `${adapterKey.trim()}:${recordKey.trim()}`,
    )
    .digest("hex")
    .slice(0, 24);

  return `dr-${digest}`;
}

function requiredInteger(
  value: number | string,
  fieldName: string,
): number {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new Error(
      `Discovered record ${fieldName} is invalid.`,
    );
  }

  return number;
}

function optionalInteger(
  value: number | string | null,
): number | undefined {
  if (value === null) {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    return undefined;
  }

  return number;
}

function rowVersion(
  row: DiscoveredRecordRow,
): number {
  const version = requiredInteger(
    row.row_version,
    "row version",
  );

  if (version < 1) {
    throw new Error(
      "Discovered record row version must be positive.",
    );
  }

  return version;
}

function assertOptionalMoney(
  value: number | undefined,
  fieldName: string,
): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) ||
      value < 0)
  ) {
    throw new Error(
      `Discovered record ${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertInput(
  input: SaveDiscoveredRecordInput,
): void {
  if (!input.adapterKey.trim()) {
    throw new Error(
      "Discovered record adapterKey is required.",
    );
  }

  if (!input.recordKey.trim()) {
    throw new Error(
      "Discovered record recordKey is required.",
    );
  }

  if (!input.sourceName.trim()) {
    throw new Error(
      "Discovered record sourceName is required.",
    );
  }

  if (!input.sourceUrl.trim()) {
    throw new Error(
      "Discovered record sourceUrl is required.",
    );
  }

  if (!input.formerOwnerName.trim()) {
    throw new Error(
      "Discovered record formerOwnerName is required.",
    );
  }

  if (!input.addressLine1.trim()) {
    throw new Error(
      "Discovered record addressLine1 is required.",
    );
  }

  if (!input.city.trim()) {
    throw new Error(
      "Discovered record city is required.",
    );
  }

  if (!input.county.trim()) {
    throw new Error(
      "Discovered record county is required.",
    );
  }

  if (!input.agencyName.trim()) {
    throw new Error(
      "Discovered record agencyName is required.",
    );
  }

  assertOptionalMoney(
    input.sourceListedBidCents,
    "sourceListedBidCents",
  );

  assertOptionalMoney(
    input.sourceListedDepositCents,
    "sourceListedDepositCents",
  );

  assertOptionalMoney(
    input.sourceListedSurplusCents,
    "sourceListedSurplusCents",
  );

  assertOptionalMoney(
    input.sourceListedBalanceCents,
    "sourceListedBalanceCents",
  );
}

function assertReviewInput(
  input: ReviewDiscoveredRecordInput,
): void {
  if (!input.id.trim()) {
    throw new Error(
      "Discovered record id is required.",
    );
  }

  if (!input.actorUserId.trim()) {
    throw new Error(
      "Discovered record review actorUserId is required.",
    );
  }

  if (
    input.decision !== "reviewed" &&
    input.decision !== "dismissed"
  ) {
    throw new Error(
      "Discovered record review decision must be reviewed or dismissed.",
    );
  }

  const note =
    input.reviewNote?.trim();

  if (
    input.decision === "dismissed" &&
    !note
  ) {
    throw new Error(
      "A review note is required when dismissing a discovered record.",
    );
  }
}

function assertPromotionInput(
  input: PromoteDiscoveredRecordInput,
): void {
  if (!input.id.trim()) {
    throw new Error(
      "Discovered record id is required.",
    );
  }

  if (!input.opportunityId.trim()) {
    throw new Error(
      "Promoted opportunity id is required.",
    );
  }
}

/* ========================================================================== */
/* Row mapping                                                                 */
/* ========================================================================== */

function discoveredRecordFromRow(
  row: DiscoveredRecordRow,
): DiscoveredRecord {
  const snapshot =
    sourceSnapshotFromUnknown(
      row.source_snapshot,
    );

  return {
    id: row.id,

    adapterKey:
      row.adapter_key,

    recordKey:
      row.record_key,

    status:
      row.status,

    sourceKind:
      row.source_kind as SourceKind,

    sourceName:
      row.source_name,

    sourceUrl:
      row.source_url,

    sourceReference:
      row.source_reference ??
      undefined,

    formerOwnerName:
      row.former_owner_name,

    currentOwnerName:
      optionalSnapshotString(
        snapshot.currentOwnerName,
      ),

    propertyId:
      row.property_id ??
      undefined,

    addressLine1:
      row.address_line1,

    city:
      row.city,

    county:
      row.county,

    state:
      row.state_code as StateCode,

    postalCode:
      row.postal_code ??
      undefined,

    saleType:
      row.sale_type as SaleType,

    saleDate:
      row.sale_date as IsoDate,

    dateTransferred:
      optionalSnapshotString(
        snapshot.dateTransferred,
      ) as IsoDate | undefined,

    caseNumber:
      row.case_number ??
      undefined,

    parcelNumber:
      row.parcel_number ??
      undefined,

    mapNumber:
      optionalSnapshotString(
        snapshot.mapNumber,
      ),

    gridNumber:
      optionalSnapshotString(
        snapshot.gridNumber,
      ),

    legalDescription:
      optionalSnapshotString(
        snapshot.legalDescription,
      ),

    agencyName:
      row.agency_name,

    agencyPhone:
      row.agency_phone ??
      undefined,

    custodian:
      row.custodian as SurplusCustodian,

    sourceListedBidCents:
      optionalSnapshotMoney(
        snapshot.sourceListedBidCents,
      ),

    sourceListedDepositCents:
      optionalSnapshotMoney(
        snapshot.sourceListedDepositCents,
      ),

    sourceListedSurplusCents:
      optionalSnapshotMoney(
        snapshot.sourceListedSurplusCents,
      ),

    sourceListedBalanceCents:
      optionalInteger(
        row.source_listed_balance_cents,
      ),

    discoveredAt:
      row.discovered_at as IsoInstant,

    lastSeenAt:
      row.last_seen_at as IsoInstant,

    sourceRetrievedAt:
      row.source_retrieved_at as IsoInstant,

    reviewedAt:
      (row.reviewed_at as
        | IsoInstant
        | null) ??
      undefined,

    reviewedByUserId:
      row.reviewed_at
        ? row.updated_by_user_id ??
          undefined
        : undefined,

    reviewNote:
      row.review_note ??
      undefined,

    promotedOpportunityId:
      row.promoted_opportunity_id ??
      undefined,
  };
}

/* ========================================================================== */
/* Database helpers                                                            */
/* ========================================================================== */

async function getDiscoveredRecordRowById(
  id: string,
): Promise<
  DiscoveredRecordRow | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("discovered_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read discovered record: ${error.message}`,
    );
  }

  return data
    ? (data as DiscoveredRecordRow)
    : undefined;
}

async function updateDiscoveredRecordWithVersion(
  id: string,
  expectedRowVersion: number,
  values: Record<string, unknown>,
): Promise<DiscoveredRecordRow> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("discovered_records")
      .update({
        ...values,

        row_version:
          expectedRowVersion + 1,

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .eq(
        "row_version",
        expectedRowVersion,
      )
      .select("*")
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to update discovered record: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Discovered record changed while this request was being processed. Reload and try again.",
    );
  }

  return data as DiscoveredRecordRow;
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listDiscoveredRecords(): Promise<
  DiscoveredRecord[]
> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("discovered_records")
      .select("*")
      .order("last_seen_at", {
        ascending: false,
      });

  if (error) {
    throw new Error(
      `Unable to list discovered records: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    discoveredRecordFromRow(
      row as DiscoveredRecordRow,
    ),
  );
}

export async function getDiscoveredRecordById(
  id: string,
): Promise<
  DiscoveredRecord | undefined
> {
  const row =
    await getDiscoveredRecordRowById(
      id,
    );

  return row
    ? discoveredRecordFromRow(row)
    : undefined;
}

export async function getDiscoveredRecordBySourceKey(
  adapterKey: string,
  recordKey: string,
): Promise<
  DiscoveredRecord | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("discovered_records")
      .select("*")
      .eq(
        "adapter_key",
        adapterKey.trim(),
      )
      .eq(
        "record_key",
        recordKey.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read discovered record by source key: ${error.message}`,
    );
  }

  return data
    ? discoveredRecordFromRow(
        data as DiscoveredRecordRow,
      )
    : undefined;
}

/* ========================================================================== */
/* Harvest upsert                                                              */
/* ========================================================================== */

export async function saveDiscoveredRecord(
  input: SaveDiscoveredRecordInput,
): Promise<DiscoveredRecord> {
  assertInput(input);

  const id =
    discoveredRecordId(
      input.adapterKey,
      input.recordKey,
    );

  const existingRow =
    await getDiscoveredRecordRowById(
      id,
    );

  const seenAt =
    nowIsoInstant();

  const sourceSnapshot =
    buildSourceSnapshot(input);

  const payload = {
    adapter_key:
      input.adapterKey.trim(),

    record_key:
      input.recordKey.trim(),

    source_kind:
      input.sourceKind,

    source_name:
      input.sourceName.trim(),

    source_url:
      input.sourceUrl.trim(),

    source_reference:
      input.sourceReference?.trim() ||
      null,

    former_owner_name:
      input.formerOwnerName.trim(),

    property_id:
      input.propertyId?.trim() ||
      null,

    address_line1:
      input.addressLine1.trim(),

    city:
      input.city.trim(),

    county:
      input.county.trim(),

    state_code:
      input.state,

    postal_code:
      input.postalCode?.trim() ||
      null,

    sale_type:
      input.saleType,

    sale_date:
      input.saleDate,

    case_number:
      input.caseNumber?.trim() ||
      null,

    parcel_number:
      input.parcelNumber?.trim() ||
      null,

    agency_name:
      input.agencyName.trim(),

    agency_phone:
      input.agencyPhone?.trim() ||
      null,

    custodian:
      input.custodian,

    source_listed_balance_cents:
      input.sourceListedBalanceCents ??
      null,

    last_seen_at:
      seenAt,

    source_retrieved_at:
      input.sourceRetrievedAt,

    source_snapshot:
      sourceSnapshot,
  };

  if (existingRow) {
    const updatedRow =
      await updateDiscoveredRecordWithVersion(
        id,

        rowVersion(existingRow),

        payload,
      );

    return discoveredRecordFromRow(
      updatedRow,
    );
  }

  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("discovered_records")
      .insert({
        id,

        ...payload,

        status: "new",

        state_fips: null,

        county_geoid: null,

        discovered_at:
          seenAt,

        reviewed_at: null,

        review_note: null,

        promoted_opportunity_id:
          null,

        row_version: 1,

        updated_by_user_id:
          null,
      })
      .select("*")
      .single();

  if (error) {
    throw new Error(
      `Unable to save discovered record: ${error.message}`,
    );
  }

  return discoveredRecordFromRow(
    data as DiscoveredRecordRow,
  );
}

/* ========================================================================== */
/* Analyst review                                                              */
/* ========================================================================== */

export async function reviewDiscoveredRecord(
  input: ReviewDiscoveredRecordInput,
): Promise<DiscoveredRecord> {
  assertReviewInput(input);

  const id =
    input.id.trim();

  const currentRow =
    await getDiscoveredRecordRowById(
      id,
    );

  if (!currentRow) {
    throw new Error(
      "Discovered record not found.",
    );
  }

  const current =
    discoveredRecordFromRow(
      currentRow,
    );

  if (
    current.status === "promoted" ||
    current.promotedOpportunityId
  ) {
    throw new Error(
      "A promoted discovered record cannot be reviewed or dismissed.",
    );
  }

  const reviewedAt =
    nowIsoInstant();

  const updatedRow =
    await updateDiscoveredRecordWithVersion(
      id,

      rowVersion(currentRow),

      {
        status:
          input.decision,

        reviewed_at:
          reviewedAt,

        review_note:
          input.reviewNote?.trim() ||
          null,

        updated_by_user_id:
          input.actorUserId.trim(),
      },
    );

  return discoveredRecordFromRow(
    updatedRow,
  );
}

/* ========================================================================== */
/* Promotion                                                                   */
/* ========================================================================== */

export async function promoteDiscoveredRecord(
  input: PromoteDiscoveredRecordInput,
): Promise<DiscoveredRecord> {
  assertPromotionInput(input);

  const id =
    input.id.trim();

  const opportunityId =
    input.opportunityId.trim();

  const currentRow =
    await getDiscoveredRecordRowById(
      id,
    );

  if (!currentRow) {
    throw new Error(
      "Discovered record not found.",
    );
  }

  const current =
    discoveredRecordFromRow(
      currentRow,
    );

  /*
   * Promotion is retry-safe when the record is already linked to the same
   * Opportunity.
   */
  if (
    current.status === "promoted" &&
    current.promotedOpportunityId ===
      opportunityId
  ) {
    return current;
  }

  if (
    current.status === "promoted" ||
    current.promotedOpportunityId
  ) {
    throw new Error(
      "Discovered record is already promoted to a different Opportunity.",
    );
  }

  if (
    current.status !== "reviewed" ||
    !current.reviewedAt
  ) {
    throw new Error(
      "Discovered record must complete operational review before promotion.",
    );
  }

  const updatedRow =
    await updateDiscoveredRecordWithVersion(
      id,

      rowVersion(currentRow),

      {
        status:
          "promoted",

        promoted_opportunity_id:
          opportunityId,
      },
    );

  return discoveredRecordFromRow(
    updatedRow,
  );
}