import "server-only";

/**
 * NATIONAL PUBLIC-RECORD TABLE HEADER RESOLVER
 *
 * Government surplus tables use many different labels for the same underlying
 * facts.
 *
 * Examples:
 *
 *   "Excess Proceeds"
 *   "Surplus Funds"
 *   "Balance Owed"
 *   "Excess Funds"
 *
 * may all represent the source-native surplus amount.
 *
 * This module recognizes common header terminology and resolves source columns
 * into normalized semantic fields.
 *
 * It does not:
 *
 *   - decide legal eligibility
 *   - infer missing values
 *   - decide whether an owner is a claimant
 *   - approve a source
 *   - activate a jurisdiction
 *
 * Header resolution is evidence extraction only.
 */

/* ========================================================================== */
/* Semantic fields                                                             */
/* ========================================================================== */

export type PublicRecordHeaderField =
  | "property_id"
  | "parcel_number"
  | "map_number"
  | "grid_number"
  | "first_name"
  | "last_name_or_company"
  | "full_owner_name"
  | "sale_date"
  | "transferred_date"
  | "address_line_1"
  | "city"
  | "postal_code"
  | "case_number"
  | "surplus"
  | "bid"
  | "deposit"
  | "legal_description"
  | "current_owner_name";

export interface PublicRecordResolvedHeaders {
  /**
   * Zero-based row index containing the detected source headers.
   */
  headerRowIndex: number;

  /**
   * Zero-based source column index for every recognized semantic field.
   */
  columns: Partial<
    Record<
      PublicRecordHeaderField,
      number
    >
  >;

  /**
   * Number of distinct semantic fields recognized in the selected header row.
   */
  matchedFieldCount: number;

  /**
   * Original source cells from the detected header row.
   */
  sourceHeaders: readonly string[];
}

/* ========================================================================== */
/* Header aliases                                                              */
/* ========================================================================== */

const HEADER_ALIASES: Readonly<
  Record<
    PublicRecordHeaderField,
    readonly string[]
  >
> = {
  property_id: [
    "property id",
    "property identifier",
    "property number",
    "property no",
    "property #",
    "tax account",
    "tax account number",
    "account number",
    "account no",
    "account #",
  ],

  parcel_number: [
    "parcel",
    "parcel number",
    "parcel no",
    "parcel #",
    "parcel id",
    "parcel identifier",
    "apn",
    "assessor parcel number",
  ],

  map_number: [
    "map",
    "map number",
    "map no",
    "map #",
  ],

  grid_number: [
    "grid",
    "grid number",
    "grid no",
    "grid #",
    "block",
    "block number",
    "blk",
  ],

  first_name: [
    "first name",
    "firstname",
    "owner first name",
    "former owner first name",
  ],

  last_name_or_company: [
    "last name company",
    "last name / company",
    "last name",
    "lastname",
    "company",
    "owner last name",
    "former owner last name",
  ],

  full_owner_name: [
    "former owner",
    "former owner name",
    "prior owner",
    "prior owner name",
    "previous owner",
    "previous owner name",
    "owner name",
    "taxpayer name",
    "record owner",
    "record owner name",
    "name of owner",
    "owner",
  ],

  sale_date: [
    "sale date",
    "date sold",
    "tax sale date",
    "foreclosure sale date",
    "auction date",
    "date of sale",
  ],

  transferred_date: [
    "date transferred",
    "transfer date",
    "transferred date",
    "date of transfer",
  ],

  address_line_1: [
    "property address",
    "premise",
    "premises",
    "street address",
    "site address",
    "situs address",
    "property location",
    "location address",
    "address",
  ],

  city: [
    "city",
    "property city",
    "situs city",
    "municipality",
  ],

  postal_code: [
    "zip",
    "zip code",
    "zipcode",
    "postal code",
    "property zip",
    "situs zip",
  ],

  case_number: [
    "case number",
    "case no",
    "case #",
    "court case",
    "court case number",
    "docket number",
    "docket no",
    "docket #",
  ],

  surplus: [
    "surplus",
    "surplus amount",
    "surplus funds",
    "surplus funds amount",
    "excess proceeds",
    "excess proceeds amount",
    "excess funds",
    "excess funds amount",
    "excess balance",
    "overage",
    "overage amount",
    "balance owed",
    "balance due",
    "amount available",
    "available balance",
    "unclaimed balance",
  ],

  bid: [
    "bid",
    "bid amount",
    "sale bid",
    "winning bid",
    "purchase price",
  ],

  deposit: [
    "deposit",
    "deposit amount",
    "amount deposited",
  ],

  legal_description: [
    "legal description",
    "legal desc",
    "property description",
  ],

  current_owner_name: [
    "current owner",
    "current owner name",
    "new owner",
    "new owner name",
    "purchaser",
    "purchaser name",
  ],
};

/* ========================================================================== */
/* Normalization                                                               */
/* ========================================================================== */

function normalizeHeader(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /&/g,
      " and ",
    )
    .replace(
      /[#]/g,
      " number ",
    )
    .replace(
      /[/_-]+/g,
      " ",
    )
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\bno\b/g,
      " number",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function normalizedAliases(): Array<{
  field: PublicRecordHeaderField;

  alias: string;
}> {
  const aliases: Array<{
    field: PublicRecordHeaderField;

    alias: string;
  }> = [];

  for (
    const [
      field,
      fieldAliases,
    ] of Object.entries(
      HEADER_ALIASES,
    ) as Array<
      [
        PublicRecordHeaderField,
        readonly string[],
      ]
    >
  ) {
    for (
      const alias of fieldAliases
    ) {
      aliases.push({
        field,

        alias:
          normalizeHeader(
            alias,
          ),
      });
    }
  }

  /*
   * More-specific labels are evaluated before shorter labels.
   *
   * For example:
   *
   *   "current owner"
   *
   * must be considered before:
   *
   *   "owner"
   */
  return aliases.sort(
    (
      left,
      right,
    ) =>
      right.alias.length -
      left.alias.length,
  );
}

const NORMALIZED_ALIASES =
  normalizedAliases();

/* ========================================================================== */
/* Individual header matching                                                  */
/* ========================================================================== */

function matchHeaderField(
  header: string,
): PublicRecordHeaderField | undefined {
  const normalized =
    normalizeHeader(
      header,
    );

  if (
    !normalized
  ) {
    return undefined;
  }

  /*
   * Prefer an exact semantic-label match.
   */
  const exact =
    NORMALIZED_ALIASES.find(
      (candidate) =>
        candidate.alias ===
        normalized,
    );

  if (
    exact
  ) {
    return exact.field;
  }

  /*
   * Government exports sometimes decorate labels:
   *
   *   "Excess Proceeds Amount ($)"
   *   "Property Address / Location"
   *
   * Permit contained aliases only when the alias is sufficiently descriptive.
   */
  const contained =
    NORMALIZED_ALIASES.find(
      (candidate) =>
        candidate.alias.length >=
          7 &&
        (
          normalized.startsWith(
            `${candidate.alias} `,
          ) ||
          normalized.endsWith(
            ` ${candidate.alias}`,
          )
        ),
    );

  return contained
    ?.field;
}

/* ========================================================================== */
/* Header-row scoring                                                          */
/* ========================================================================== */

interface HeaderRowCandidate {
  rowIndex: number;

  columns: Partial<
    Record<
      PublicRecordHeaderField,
      number
    >
  >;

  matchedFieldCount: number;

  sourceHeaders: readonly string[];
}

function scoreHeaderRow(
  row: readonly string[],
  rowIndex: number,
): HeaderRowCandidate {
  const columns: Partial<
    Record<
      PublicRecordHeaderField,
      number
    >
  > = {};

  for (
    let columnIndex = 0;
    columnIndex < row.length;
    columnIndex += 1
  ) {
    const field =
      matchHeaderField(
        row[
          columnIndex
        ] ??
          "",
      );

    if (
      !field
    ) {
      continue;
    }

    /*
     * Preserve the first match for a semantic field.
     *
     * A source containing duplicate labels must not silently replace an
     * earlier column with a later one.
     */
    if (
      columns[
        field
      ] ===
      undefined
    ) {
      columns[
        field
      ] =
        columnIndex;
    }
  }

  return {
    rowIndex,

    columns,

    matchedFieldCount:
      Object.keys(
        columns,
      ).length,

    sourceHeaders:
      row,
  };
}

/* ========================================================================== */
/* Public resolver                                                             */
/* ========================================================================== */

/**
 * Find the most likely header row within the beginning of a tabular source.
 *
 * A minimum of three recognized semantic fields is required before a row is
 * accepted as a header. This prevents ordinary data rows from being mistaken
 * for metadata.
 */
export function resolvePublicRecordTableHeaders(
  rows: readonly (readonly string[])[],
  options?: {
    maxRowsToInspect?: number;

    minimumMatchedFields?: number;
  },
): PublicRecordResolvedHeaders | undefined {
  const maxRowsToInspect =
    Math.max(
      1,
      options
        ?.maxRowsToInspect ??
        20,
    );

  const minimumMatchedFields =
    Math.max(
      1,
      options
        ?.minimumMatchedFields ??
        3,
    );

  const candidates =
    rows
      .slice(
        0,
        maxRowsToInspect,
      )
      .map(
        (
          row,
          rowIndex,
        ) =>
          scoreHeaderRow(
            row,
            rowIndex,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.matchedFieldCount -
          left.matchedFieldCount,
      );

  const winner =
    candidates[0];

  if (
    !winner ||
    winner.matchedFieldCount <
      minimumMatchedFields
  ) {
    return undefined;
  }

  return {
    headerRowIndex:
      winner.rowIndex,

    columns:
      winner.columns,

    matchedFieldCount:
      winner.matchedFieldCount,

    sourceHeaders:
      winner.sourceHeaders,
  };
}

/* ========================================================================== */
/* Capability helpers                                                          */
/* ========================================================================== */

/**
 * Determine whether the resolved headers contain enough basic evidence for a
 * generic surplus-table parser to attempt normalization.
 *
 * This does not mean the source is approved or operational.
 */
export function publicRecordHeadersLookLikeSurplusTable(
  resolution: PublicRecordResolvedHeaders,
): boolean {
  const columns =
    resolution.columns;

  const hasOwner =
    columns.full_owner_name !==
      undefined ||
    columns.first_name !==
      undefined ||
    columns.last_name_or_company !==
      undefined;

  const hasDate =
    columns.sale_date !==
    undefined;

  const hasPropertyIdentity =
    columns.property_id !==
      undefined ||
    columns.parcel_number !==
      undefined ||
    columns.address_line_1 !==
      undefined;

  const hasSurplus =
    columns.surplus !==
    undefined;

  return (
    hasOwner &&
    hasDate &&
    hasPropertyIdentity &&
    hasSurplus
  );
}