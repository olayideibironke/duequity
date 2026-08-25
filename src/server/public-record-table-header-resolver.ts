import "server-only";

/**
 * NATIONAL PUBLIC-RECORD TABLE HEADER RESOLVER
 *
 * Government surplus tables use many different labels and layouts for the same
 * underlying facts.
 *
 * Some sources publish a conventional single-row header. Others, especially
 * PDFs, visually span a header across multiple rows. PDF text extraction may
 * also shift one fragment into a neighboring column even though the rendered
 * document clearly presents one logical header.
 *
 * Example:
 *
 *   row N-1:                                  TAX SALE
 *   row N:    PARCEL NUMBER | OWNER | SITUS | EXCESS FUNDS | ...
 *   row N+1:                               MONTH/YEAR
 *
 * In that situation DueQuity must preserve the source's month/year precision
 * without inventing a day. This resolver therefore:
 *
 *   - recognizes ordinary single-row headers
 *   - merges compatible semantic fields from nearby header rows
 *   - detects split sale-timing header fragments
 *   - uses the actual data pattern only to identify which column contains the
 *     already-signaled month/year field
 *
 * Data-pattern inference is deliberately narrow. It is used only when nearby
 * header text establishes sale + month/year context.
 *
 * This module does not:
 *
 *   - decide legal eligibility
 *   - infer a claimant
 *   - manufacture missing date precision
 *   - approve a source
 *   - activate a jurisdiction
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
  | "sale_month_year"
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
   * Zero-based index of the last row that belongs to the detected logical
   * header. Data parsing should begin after this row.
   */
  headerRowIndex: number;

  /**
   * Zero-based source column index for every recognized semantic field.
   */
  columns: Partial<Record<PublicRecordHeaderField, number>>;

  /**
   * Number of distinct semantic fields recognized in the logical header.
   */
  matchedFieldCount: number;

  /**
   * Fields bound only by a generic accounting label rather than by explicit
   * surplus vocabulary. These require corroborating source context before they
   * may be treated as surplus evidence.
   */
  weakFields: readonly PublicRecordHeaderField[];

  /**
   * Combined source header text for diagnostics.
   */
  sourceHeaders: readonly string[];
}

/* ========================================================================== */
/* Header aliases                                                              */
/* ========================================================================== */

const HEADER_ALIASES: Readonly<
  Record<PublicRecordHeaderField, readonly string[]>
> = {
  property_id: [
    "property id",
    "property identifier",
    "property number",
    "property no",
    "property #",
    "property account",
    "property account number",
    "tax account",
    "tax account number",
    "tax account id",
    "account number",
    "account no",
    "account #",
    "account id",
    "acct",
    "acct number",
    "tax id",
    "tax id number",
    "tax bill number",
    "bill number",
    "receipt number",
  ],

  parcel_number: [
    "parcel",
    "parcel number",
    "parcel no",
    "parcel #",
    "parcel id",
    "parcel identifier",
    "parcel identification number",
    "parcel account",
    "parcel code",
    "pin",
    "pin number",
    "apn",
    "assessor parcel number",
    "tax map",
    "tax map number",
    "map parcel",
    "map parcel number",
    "property index number",
    "permanent index number",
    "folio",
    "folio number",
    "strap",
    "strap number",
    "geo number",
    "sidwell",
    "gpin",
  ],

  map_number: ["map", "map number", "map no", "map #"],

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
    "owner first",
    "former owner first name",
    "taxpayer first name",
    "grantor first name",
  ],

  last_name_or_company: [
    "last name company",
    "last name / company",
    "last name or company",
    "last name",
    "lastname",
    "surname",
    "company",
    "company name",
    "business name",
    "owner last name",
    "owner last",
    "former owner last name",
    "taxpayer last name",
    "grantor last name",
  ],

  full_owner_name: [
    "former owner",
    "former owner name",
    "former owner s name",
    "former property owner",
    "prior owner",
    "prior owner name",
    "previous owner",
    "previous owner name",
    "last known owner",
    "owner of record",
    "record owner",
    "record owner name",
    "assessed owner",
    "assessed owner name",
    "owner name",
    "owner s name",
    "property owner",
    "property owner name",
    "property owner s name",
    "name of owner",
    "taxpayer name",
    "taxpayer",
    "delinquent taxpayer",
    "delinquent owner",
    "defendant",
    "defendant name",
    "defendant in fifa",
    "fifa defendant",
    "grantor",
    "grantor name",
    "claimant",
    "claimant name",
    "party name",
    "payee",
    "payee name",
    "payor",
    "depositor",
    "depositor name",
    "depositors name",
    "owner",
    "name",
    "names",
  ],

  sale_date: [
    "sale date",
    "sale dt",
    "date sold",
    "sold date",
    "tax sale date",
    "date of tax sale",
    "tax deed sale date",
    "deed sale date",
    "foreclosure sale date",
    "date of foreclosure sale",
    "sheriff sale date",
    "trustee sale date",
    "certificate sale date",
    "auction date",
    "date of auction",
    "date of sale",
    "sale held",
  ],

  sale_month_year: [
    "sale month year",
    "sale month / year",
    "sale month/year",
    "sale month yr",
    "tax sale month year",
    "tax sale month / year",
    "tax sale month/year",
    "tax sale month and year",
    "month year of sale",
    "month/year of sale",
    "month and year of sale",
    "month of sale",
    "sale month",
    "sale period",
    "tax sale month",
  ],

  transferred_date: [
    "date transferred",
    "transfer date",
    "transferred date",
    "date of transfer",
    "deed date",
    "date deed recorded",
    "recorded date",
  ],

  address_line_1: [
    "property address",
    "address of property",
    "property street address",
    "prop address",
    "prop addr",
    "parcel address",
    "premise",
    "premise address",
    "premises",
    "street address",
    "street",
    "site address",
    "situs",
    "situs address",
    "situs street",
    "situs location",
    "property situs",
    "property situs address",
    "property location",
    "property location address",
    "location address",
    "location",
    "physical address",
    "address",
  ],

  city: [
    "city",
    "city name",
    "city town",
    "town",
    "property city",
    "situs city",
    "municipality",
  ],

  postal_code: [
    "zip",
    "zip code",
    "zipcode",
    "zip 5",
    "postal code",
    "property zip",
    "property zipcode",
    "situs zip",
    "situs zipcode",
  ],

  case_number: [
    "case number",
    "case no",
    "case #",
    "court case",
    "court case number",
    "court file number",
    "civil action number",
    "cause number",
    "suit number",
    "docket number",
    "docket no",
    "docket #",
    "tax sale number",
    "certificate number",
    "levy number",
    "file number",
  ],

  surplus: [
    "surplus",
    "surplus amount",
    "surplus funds",
    "surplus funds amount",
    "surplus proceeds",
    "surplus proceeds amount",
    "surplus balance",
    "surplus due",
    "amount of surplus",
    "tax sale surplus",
    "excess",
    "excess proceeds",
    "excess proceeds amount",
    "excess proceeds available",
    "excess funds",
    "excess funds amount",
    "excess funds available",
    "excess funds balance",
    "excess balance",
    "excess amount",
    "excess bid",
    "excess bid amount",
    "amount of excess",
    "amount of excess funds",
    "excess tax sale proceeds",
    "overbid",
    "overbid amount",
    "overage",
    "overage amount",
    "tax sale overage",
    "overplus",
    "overplus amount",
    "balance owed",
    "balance due",
    "balance of funds",
    "balance",
    "amount available",
    "funds available",
    "available funds",
    "available balance",
    "amount remaining",
    "remaining balance",
    "unclaimed balance",
    "unclaimed amount",
    "unclaimed funds",
    "amount held",
    "amount in escrow",
    "escrow balance",
    "due former owner",
    "amount due former owner",
    "owner refund",
    "refund amount",
    "net proceeds",
    "proceeds",
    "proceeds amount",
    "total proceeds",
    "sale proceeds",
    "tax sale proceeds",
    "funds held",
    "amount held in trust",
  ],

  bid: [
    "bid",
    "bid amount",
    "amount bid",
    "bid price",
    "sale bid",
    "high bid",
    "highest bid",
    "final bid",
    "winning bid",
    "winning bid amount",
    "successful bid",
    "opening bid",
    "purchase price",
    "sale price",
    "sale amount",
    "sold amount",
    "sold price",
  ],

  deposit: [
    "deposit",
    "deposit amount",
    "amount deposited",
    "deposit with court",
    "amount deposited with court",
  ],

  legal_description: [
    "legal description",
    "legal desc",
    "brief legal",
    "legal",
    "property description",
    "description",
  ],

  current_owner_name: [
    "current owner",
    "current owner name",
    "new owner",
    "new owner name",
    "purchaser",
    "purchaser name",
    "tax sale purchaser",
    "successful bidder",
    "bidder name",
    "buyer",
    "buyer name",
    "grantee",
    "grantee name",
  ],
};

/**
 * WEAK ALIASES
 *
 * Generic accounting labels used by county ledger publications where the
 * surrounding document, not the column name, says what the amount is.
 *
 * These are applied only as a second pass, for fields no strong alias matched,
 * so a list that labels its amount "Excess Funds" is never re-bound to a
 * neighbouring "Total" column.
 */
const WEAK_HEADER_ALIASES: Partial<
  Record<PublicRecordHeaderField, readonly string[]>
> = {
  surplus: ["total", "total amount", "amount", "amount held", "amount due"],
};

/* ========================================================================== */
/* Normalization                                                               */
/* ========================================================================== */

/**
 * Split camelCase and acronym boundaries before normalizing.
 *
 * JSON, ArcGIS, and database-exported columns arrive as "SaleDate",
 * "excessFunds", "PINNumber". Splitting these means the same national alias
 * vocabulary that reads an HTML or PDF header also reads a GIS field name,
 * instead of needing a second vocabulary per family.
 */
function splitWordBoundaries(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function normalizeHeader(value: string): string {
  return splitWordBoundaries(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[#]/g, " number ")
    .replace(/[/_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bno\b/g, " number")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Separator-free comparison form.
 *
 * Government field names are frequently published fully concatenated and
 * upper-cased — "PARCELID", "SITEADDRESS", "EXCESSFUNDS" — where no word
 * boundary exists to split on.
 */
function compactHeader(value: string): string {
  return value.replace(/\s+/g, "");
}

interface NormalizedAlias {
  field: PublicRecordHeaderField;
  alias: string;
  compact: string;
}

function normalizeAliasTable(
  table: Partial<Record<PublicRecordHeaderField, readonly string[]>>,
): NormalizedAlias[] {
  const aliases: NormalizedAlias[] = [];

  for (const [field, fieldAliases] of Object.entries(table) as Array<
    [PublicRecordHeaderField, readonly string[]]
  >) {
    for (const alias of fieldAliases) {
      const normalized = normalizeHeader(alias);

      aliases.push({
        field,
        alias: normalized,
        compact: compactHeader(normalized),
      });
    }
  }

  return aliases.sort((left, right) => right.alias.length - left.alias.length);
}

const NORMALIZED_ALIASES = normalizeAliasTable(HEADER_ALIASES);

const NORMALIZED_WEAK_ALIASES = normalizeAliasTable(WEAK_HEADER_ALIASES);

/* ========================================================================== */
/* Individual header matching                                                  */
/* ========================================================================== */

function matchAgainst(
  aliases: readonly NormalizedAlias[],
  normalized: string,
): PublicRecordHeaderField | undefined {
  const exact = aliases.find((candidate) => candidate.alias === normalized);

  if (exact) {
    return exact.field;
  }

  /*
   * Separator-free equality. Covers concatenated government field names such
   * as PARCELID, SITEADDRESS, and EXCESSFUNDS.
   */
  const compact = compactHeader(normalized);

  const compactExact = aliases.find(
    (candidate) => candidate.compact === compact,
  );

  if (compactExact) {
    return compactExact.field;
  }

  const contained = aliases.find(
    (candidate) =>
      candidate.alias.length >= 7 &&
      (normalized.startsWith(`${candidate.alias} `) ||
        normalized.endsWith(` ${candidate.alias}`)),
  );

  if (contained) {
    return contained.field;
  }

  /*
   * Separator-free prefix/suffix containment, held to a longer minimum length
   * because a concatenated comparison has no word boundary to anchor on.
   */
  const compactContained = aliases.find(
    (candidate) =>
      candidate.compact.length >= 9 &&
      candidate.compact !== compact &&
      (compact.startsWith(candidate.compact) ||
        compact.endsWith(candidate.compact)),
  );

  return compactContained?.field;
}

function matchHeaderField(header: string): PublicRecordHeaderField | undefined {
  const normalized = normalizeHeader(header);

  if (!normalized) {
    return undefined;
  }

  return matchAgainst(NORMALIZED_ALIASES, normalized);
}

function matchWeakHeaderField(
  header: string,
): PublicRecordHeaderField | undefined {
  const normalized = normalizeHeader(header);

  if (!normalized) {
    return undefined;
  }

  return matchAgainst(NORMALIZED_WEAK_ALIASES, normalized);
}

/* ========================================================================== */
/* Header-row scoring                                                          */
/* ========================================================================== */

interface HeaderRowCandidate {
  rowIndex: number;

  columns: Partial<Record<PublicRecordHeaderField, number>>;

  matchedFieldCount: number;

  weakFields: Set<PublicRecordHeaderField>;

  sourceHeaders: readonly string[];
}

function scoreHeaderRow(
  row: readonly string[],
  rowIndex: number,
): HeaderRowCandidate {
  const columns: Partial<Record<PublicRecordHeaderField, number>> = {};

  for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
    const field = matchHeaderField(row[columnIndex] ?? "");

    if (!field) {
      continue;
    }

    if (columns[field] === undefined) {
      columns[field] = columnIndex;
    }
  }

  /*
   * Second pass: generic accounting labels, only for fields the strong
   * vocabulary did not already bind. These are recorded as weak so the schema
   * rule can require corroborating surplus context before trusting them.
   */
  const weakFields = new Set<PublicRecordHeaderField>();

  for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
    const field = matchWeakHeaderField(row[columnIndex] ?? "");

    if (!field) {
      continue;
    }

    if (columns[field] === undefined) {
      columns[field] = columnIndex;

      weakFields.add(field);
    }
  }

  return {
    rowIndex,

    columns,

    matchedFieldCount: Object.keys(columns).length,

    weakFields,

    sourceHeaders: row,
  };
}

/* ========================================================================== */
/* Multi-row header helpers                                                    */
/* ========================================================================== */

function rowNormalizedText(row: readonly string[]): string {
  return normalizeHeader(row.join(" "));
}

function rowHasSaleContext(row: readonly string[]): boolean {
  const text = rowNormalizedText(row);

  return (
    text.includes("tax sale") ||
    text.includes("sale date") ||
    text.includes("sale month") ||
    text.includes("date of sale") ||
    text === "sale"
  );
}

function rowHasMonthYearContext(row: readonly string[]): boolean {
  const text = rowNormalizedText(row);

  return (
    text.includes("month year") ||
    text.includes("month and year") ||
    text.includes("month yyyy") ||
    text.includes("mm yyyy")
  );
}

function rowLooksLikeHeaderFragment(
  row: readonly string[],
  rowIndex: number,
): boolean {
  const scored = scoreHeaderRow(row, rowIndex);

  return (
    scored.matchedFieldCount > 0 ||
    rowHasSaleContext(row) ||
    rowHasMonthYearContext(row)
  );
}

function exactMonthYearValue(value: string): boolean {
  const text = value.trim();

  if (/^(?:0?[1-9]|1[0-2])\s*\/\s*\d{4}$/.test(text)) {
    return true;
  }

  if (/^\d{4}-(?:0?[1-9]|1[0-2])$/.test(text)) {
    return true;
  }

  return /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{4}$/i.test(
    text,
  );
}

function embeddedMonthYearValue(value: string): boolean {
  const text = value.trim();

  if (
    /\b(?:0?[1-9]|1[0-2])\s*\/\s*\d{4}\b/.test(text) ||
    /\b\d{4}-(?:0?[1-9]|1[0-2])\b/.test(text)
  ) {
    return true;
  }

  return /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{4}\b/i.test(
    text,
  );
}

function inferSaleMonthYearColumn(
  rows: readonly (readonly string[])[],
  logicalHeaderRows: readonly number[],
  winner: HeaderRowCandidate,
): number | undefined {
  const hasSaleContext = logicalHeaderRows.some((rowIndex) =>
    rowHasSaleContext(rows[rowIndex] ?? []),
  );

  const hasMonthYearContext = logicalHeaderRows.some((rowIndex) =>
    rowHasMonthYearContext(rows[rowIndex] ?? []),
  );

  if (!hasSaleContext || !hasMonthYearContext) {
    return undefined;
  }

  const lastHeaderRowIndex = Math.max(...logicalHeaderRows);

  const sampleRows = rows.slice(
    lastHeaderRowIndex + 1,
    lastHeaderRowIndex + 41,
  );

  const maximumColumnCount = Math.max(
    winner.sourceHeaders.length,
    ...sampleRows.map((row) => row.length),
  );

  const ranked: Array<{
    column: number;

    score: number;

    exactMatches: number;
  }> = [];

  for (let column = 0; column < maximumColumnCount; column += 1) {
    let score = 0;

    let exactMatches = 0;

    for (const row of sampleRows) {
      const value = row[column]?.trim() ?? "";

      if (!value) {
        continue;
      }

      if (exactMonthYearValue(value)) {
        exactMatches += 1;

        score += 4;

        continue;
      }

      if (embeddedMonthYearValue(value)) {
        score += 1;
      }
    }

    if (score > 0) {
      ranked.push({
        column,

        score,

        exactMatches,
      });
    }
  }

  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.exactMatches !== left.exactMatches) {
      return right.exactMatches - left.exactMatches;
    }

    return left.column - right.column;
  });

  const winnerColumn = ranked[0];

  if (!winnerColumn) {
    return undefined;
  }

  const runnerUp = ranked[1];

  if (
    runnerUp &&
    runnerUp.score === winnerColumn.score &&
    runnerUp.exactMatches === winnerColumn.exactMatches
  ) {
    return undefined;
  }

  return winnerColumn.column;
}

function combinedSourceHeaders(
  rows: readonly (readonly string[])[],
  headerRows: readonly number[],
): string[] {
  const maximumColumnCount = Math.max(
    0,
    ...headerRows.map((rowIndex) => rows[rowIndex]?.length ?? 0),
  );

  const combined: string[] = [];

  for (let column = 0; column < maximumColumnCount; column += 1) {
    const values: string[] = [];

    for (const rowIndex of headerRows) {
      const value = rows[rowIndex]?.[column]?.replace(/\s+/g, " ").trim();

      if (value && !values.includes(value)) {
        values.push(value);
      }
    }

    combined.push(values.join(" / "));
  }

  return combined;
}

/* ========================================================================== */
/* Public resolver                                                             */
/* ========================================================================== */

/**
 * Find the most likely logical header near the beginning of a tabular source.
 *
 * The strongest row remains the anchor. Nearby rows are included only when
 * they themselves contain recognizable header fields or sale-timing fragments.
 *
 * If the logical header says "sale" + "month/year" but PDF extraction shifts
 * those fragments away from the actual data column, the resolver inspects
 * subsequent values and selects the unique column with the strongest
 * month/year pattern.
 */
export function resolvePublicRecordTableHeaders(
  rows: readonly (readonly string[])[],
  options?: {
    maxRowsToInspect?: number;

    minimumMatchedFields?: number;
  },
): PublicRecordResolvedHeaders | undefined {
  const maxRowsToInspect = Math.max(1, options?.maxRowsToInspect ?? 20);

  const minimumMatchedFields = Math.max(1, options?.minimumMatchedFields ?? 3);

  const candidates = rows
    .slice(0, maxRowsToInspect)
    .map((row, rowIndex) => scoreHeaderRow(row, rowIndex))
    .sort((left, right) => {
      if (right.matchedFieldCount !== left.matchedFieldCount) {
        return right.matchedFieldCount - left.matchedFieldCount;
      }

      return left.rowIndex - right.rowIndex;
    });

  const winner = candidates[0];

  if (!winner || winner.matchedFieldCount < minimumMatchedFields) {
    return undefined;
  }

  const columns: Partial<Record<PublicRecordHeaderField, number>> = {
    ...winner.columns,
  };

  const weakFields = new Set<PublicRecordHeaderField>(winner.weakFields);

  const nearbyStart = Math.max(0, winner.rowIndex - 2);

  const nearbyEnd = Math.min(rows.length - 1, winner.rowIndex + 2);

  const logicalHeaderRows: number[] = [];

  for (let rowIndex = nearbyStart; rowIndex <= nearbyEnd; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];

    if (
      rowIndex !== winner.rowIndex &&
      !rowLooksLikeHeaderFragment(row, rowIndex)
    ) {
      continue;
    }

    logicalHeaderRows.push(rowIndex);

    const candidate = scoreHeaderRow(row, rowIndex);

    for (const [field, column] of Object.entries(candidate.columns) as Array<
      [PublicRecordHeaderField, number]
    >) {
      if (columns[field] === undefined) {
        columns[field] = column;

        if (candidate.weakFields.has(field)) {
          weakFields.add(field);
        }
      }
    }
  }

  if (!logicalHeaderRows.includes(winner.rowIndex)) {
    logicalHeaderRows.push(winner.rowIndex);
  }

  logicalHeaderRows.sort((left, right) => left - right);

  if (
    columns.sale_date === undefined &&
    columns.sale_month_year === undefined
  ) {
    const inferredSaleMonthYearColumn = inferSaleMonthYearColumn(
      rows,
      logicalHeaderRows,
      winner,
    );

    if (inferredSaleMonthYearColumn !== undefined) {
      columns.sale_month_year = inferredSaleMonthYearColumn;
    }
  }

  return {
    headerRowIndex: Math.max(...logicalHeaderRows),

    columns,

    matchedFieldCount: Object.keys(columns).length,

    weakFields: [...weakFields],

    sourceHeaders: combinedSourceHeaders(rows, logicalHeaderRows),
  };
}

/* ========================================================================== */
/* Capability helpers                                                          */
/* ========================================================================== */

export interface PublicRecordSchemaCapability {
  hasOwner: boolean;

  hasSaleTiming: boolean;

  hasPropertyIdentity: boolean;

  hasSurplus: boolean;

  /**
   * Whether the source itself is published as surplus/excess-funds material.
   */
  hasSurplusContext: boolean;

  /**
   * Whether the resolved header set describes surplus/excess-funds records at
   * all. Column completeness is a separate concern.
   */
  looksLikeSurplusTable: boolean;
}

/**
 * Context describing where the table came from.
 *
 * A published amount column is the strongest evidence a table holds surplus
 * records. When a jurisdiction publishes the amount separately, the source's
 * own surplus terminology is what distinguishes an excess-funds list from an
 * ordinary assessor sales table with the same columns.
 */
export interface PublicRecordSchemaContext {
  sourceName?: string;

  sourceUrl?: string;
}

const SURPLUS_CONTEXT_PATTERN =
  /excess|surplus|overage|overbid|overplus|unclaimed|proceeds/i;

function hasSurplusContext(
  resolution: PublicRecordResolvedHeaders,
  context?: PublicRecordSchemaContext,
): boolean {
  const text = [
    ...resolution.sourceHeaders,
    context?.sourceName ?? "",
    context?.sourceUrl ?? "",
  ].join(" ");

  return SURPLUS_CONTEXT_PATTERN.test(text);
}

export function describePublicRecordSchemaCapability(
  resolution: PublicRecordResolvedHeaders,
  context?: PublicRecordSchemaContext,
): PublicRecordSchemaCapability {
  const columns = resolution.columns;

  const hasOwner =
    columns.full_owner_name !== undefined ||
    columns.first_name !== undefined ||
    columns.last_name_or_company !== undefined;

  const hasSaleTiming =
    columns.sale_date !== undefined || columns.sale_month_year !== undefined;

  const hasPropertyIdentity =
    columns.property_id !== undefined ||
    columns.parcel_number !== undefined ||
    columns.address_line_1 !== undefined;

  const surplusContext = hasSurplusContext(resolution, context);

  /*
   * A surplus column bound only by a generic accounting label ("Total",
   * "Amount") counts as surplus evidence only when the source itself is
   * published as surplus/excess-funds material. Without that gate the same
   * label would be read as a surplus balance on any ordinary financial table.
   */
  const surplusIsWeak = resolution.weakFields.includes("surplus");

  const hasSurplus =
    columns.surplus !== undefined && (!surplusIsWeak || surplusContext);

  /*
   * DISCOVERY-LAYER ADMISSION RULE
   *
   * A former owner plus a published surplus balance is already a complete,
   * useful official surplus record. Also requiring sale timing and a
   * parcel/address is what forced county-by-county parser work: government
   * lists routinely publish only some of those columns.
   *
   * A list that names former owners against identified parcels and sale timing
   * is also a genuine surplus record set when the amount is published
   * separately — but only when the source itself is surplus material. Without
   * that requirement the same column shape would admit any assessor sales
   * table, which would be incorrect data rather than a missing field.
   *
   * Missing fields stay unknown. They are never reconstructed, and promotion
   * into operational Opportunities remains strict downstream.
   */
  const looksLikeSurplusTable =
    hasOwner &&
    (hasSurplus || (hasPropertyIdentity && hasSaleTiming && surplusContext));

  return {
    hasOwner,

    hasSaleTiming,

    hasPropertyIdentity,

    hasSurplus,

    hasSurplusContext: surplusContext,

    looksLikeSurplusTable,
  };
}

export function publicRecordHeadersLookLikeSurplusTable(
  resolution: PublicRecordResolvedHeaders,
  context?: PublicRecordSchemaContext,
): boolean {
  return describePublicRecordSchemaCapability(resolution, context)
    .looksLikeSurplusTable;
}

/**
 * Explain, in reviewer terms, why a recognized header set is not usable.
 */
export function describePublicRecordSchemaGap(
  resolution: PublicRecordResolvedHeaders,
  context?: PublicRecordSchemaContext,
): string {
  const capability = describePublicRecordSchemaCapability(resolution, context);

  const missing: string[] = [];

  if (!capability.hasOwner) {
    missing.push("a former-owner/taxpayer name column");
  }

  if (!capability.hasSurplus) {
    missing.push("a surplus/excess-funds balance column");
  }

  if (!capability.hasPropertyIdentity) {
    missing.push("a parcel/account/address column");
  }

  if (!capability.hasSaleTiming) {
    missing.push("a sale date or sale month/year column");
  }

  if (!capability.hasSurplusContext) {
    missing.push(
      "any surplus/excess-funds terminology identifying this as surplus material",
    );
  }

  const recognized = resolution.sourceHeaders
    .filter((header) => header.trim().length > 0)
    .slice(0, 12)
    .join(" | ");

  return `The table was read, but it does not describe surplus records: missing ${missing.join(
    ", ",
  )}. Recognized headers: ${recognized || "none"}.`;
}
