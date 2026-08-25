import "server-only";
import { createHash } from "node:crypto";
import type { IsoDate } from "@/domain/types";
import type { OfficialPublicRecord } from "@/server/public-record-discovery";
import {
  resolvePublicRecordJsonProfile,
  publicRecordJsonProfileImplemented,
  type PublicRecordJsonDateFormat,
  type PublicRecordJsonMoneyPath,
  type PublicRecordJsonProfile,
  type PublicRecordJsonRecordKeyField,
} from "@/server/public-record-json-profile";
import {
  extractPublicRecordRows,
  extractPublicRecordTableCandidates,
} from "@/server/public-record-row-extractor";
import type {
  PublicRecordJsonPayload,
  PublicRecordSourcePayload,
} from "@/server/public-record-source-fetcher";
import {
  ingestionFailure,
  type PublicRecordIngestionFailure,
} from "@/server/public-record-source-family";
import type {
  PublicRecordSourceDefinition,
  PublicRecordSourceFormat,
} from "@/server/public-record-source-registry";
import {
  describePublicRecordSchemaCapability,
  describePublicRecordSchemaGap,
  resolvePublicRecordTableHeaders,
  type PublicRecordResolvedHeaders,
  type PublicRecordSchemaContext,
} from "@/server/public-record-table-header-resolver";
import {
  publicRecordTableProfileImplemented,
  resolvePublicRecordTableProfile,
  type PublicRecordRecordKeyField,
  type PublicRecordTableDateFormat,
  type PublicRecordTableMonthYearFormat,
  type PublicRecordTableProfile,
} from "@/server/public-record-table-profile";

export const PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY = "auto-header-table-v1";

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized || undefined;
}

function unknownText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return optionalText(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return undefined;
    }

    return String(value);
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function cellText(
  cells: readonly string[],
  index: number | undefined,
): string | undefined {
  if (index === undefined) {
    return undefined;
  }

  return optionalText(cells[index]);
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function makeIsoDate(
  year: number,
  month: number,
  day: number,
): IsoDate | undefined {
  if (!validCalendarDate(year, month, day)) {
    return undefined;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as IsoDate;
}

function parseUsSlashDate(value: string): IsoDate | undefined {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return undefined;
  }

  return makeIsoDate(Number(match[3]), Number(match[1]), Number(match[2]));
}

function parseIsoDate(value: string): IsoDate | undefined {
  const normalized = value.trim();

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return undefined;
  }

  return makeIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function parseTableDate(
  value: string | undefined,
  format: PublicRecordTableDateFormat,
): IsoDate | undefined {
  if (!value) {
    return undefined;
  }

  switch (format) {
    case "us_slash_date":
      return parseUsSlashDate(value);

    case "iso_date":
      return parseIsoDate(value);
  }
}

function parseJsonDate(
  value: unknown,
  format: PublicRecordJsonDateFormat,
): IsoDate | undefined {
  const text = unknownText(value);

  if (!text) {
    return undefined;
  }

  switch (format) {
    case "us_slash_date":
      return parseUsSlashDate(text);

    case "iso_date":
      return parseIsoDate(text);
  }
}

const MONTH_NAME_TO_NUMBER: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function makeIsoMonth(year: number, month: number): string | undefined {
  if (year < 1000 || month < 1 || month > 12) {
    return undefined;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function parseUsSlashMonthYear(value: string): string | undefined {
  const match = value.trim().match(/^(\d{1,2})\s*\/\s*(\d{4})$/);

  if (!match) {
    return undefined;
  }

  return makeIsoMonth(Number(match[2]), Number(match[1]));
}

function parseIsoMonth(value: string): string | undefined {
  const match = value.trim().match(/^(\d{4})-(\d{1,2})$/);

  if (!match) {
    return undefined;
  }

  return makeIsoMonth(Number(match[1]), Number(match[2]));
}

function parseMonthNameYear(value: string): string | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");

  const match = normalized.match(/^([a-z]+)\s+(\d{4})$/);

  if (!match) {
    return undefined;
  }

  const month = MONTH_NAME_TO_NUMBER[match[1]];

  if (!month) {
    return undefined;
  }

  return makeIsoMonth(Number(match[2]), month);
}

interface ParsedMonthYearEvidence {
  isoMonth: string;

  sourceText: string;
}

function extractUsSlashMonthYearEvidence(
  value: string,
): ParsedMonthYearEvidence | undefined {
  const match = value.match(/\b(0?[1-9]|1[0-2])\s*\/\s*(\d{4})\b/);

  if (!match) {
    return undefined;
  }

  const isoMonth = makeIsoMonth(Number(match[2]), Number(match[1]));

  if (!isoMonth) {
    return undefined;
  }

  return {
    isoMonth,

    sourceText: match[0].replace(/\s+/g, " ").trim(),
  };
}

function extractIsoMonthEvidence(
  value: string,
): ParsedMonthYearEvidence | undefined {
  const match = value.match(/\b(\d{4})-(0?[1-9]|1[0-2])\b/);

  if (!match) {
    return undefined;
  }

  const isoMonth = makeIsoMonth(Number(match[1]), Number(match[2]));

  if (!isoMonth) {
    return undefined;
  }

  return {
    isoMonth,

    sourceText: match[0].trim(),
  };
}

function extractMonthNameYearEvidence(
  value: string,
): ParsedMonthYearEvidence | undefined {
  const match = value.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{4})\b/i,
  );

  if (!match) {
    return undefined;
  }

  const monthToken = match[1].toLowerCase().replace(/\.$/, "");

  const month = MONTH_NAME_TO_NUMBER[monthToken];

  if (!month) {
    return undefined;
  }

  const isoMonth = makeIsoMonth(Number(match[2]), month);

  if (!isoMonth) {
    return undefined;
  }

  return {
    isoMonth,

    sourceText: match[0].replace(/\s+/g, " ").trim(),
  };
}

function parseTableMonthYearEvidence(
  value: string | undefined,
  format: PublicRecordTableMonthYearFormat,
): ParsedMonthYearEvidence | undefined {
  if (!value) {
    return undefined;
  }

  switch (format) {
    case "us_slash_month_year": {
      const exact = parseUsSlashMonthYear(value);

      if (exact) {
        return {
          isoMonth: exact,

          sourceText: value.trim(),
        };
      }

      return extractUsSlashMonthYearEvidence(value);
    }

    case "iso_month": {
      const exact = parseIsoMonth(value);

      if (exact) {
        return {
          isoMonth: exact,

          sourceText: value.trim(),
        };
      }

      return extractIsoMonthEvidence(value);
    }

    case "month_name_year": {
      const exact = parseMonthNameYear(value);

      if (exact) {
        return {
          isoMonth: exact,

          sourceText: value.trim(),
        };
      }

      return extractMonthNameYearEvidence(value);
    }
  }
}

function detectTableDateFormat(
  rows: readonly (readonly string[])[],
  column: number,
): PublicRecordTableDateFormat | undefined {
  let usSlashMatches = 0;
  let isoMatches = 0;

  for (const row of rows.slice(0, 40)) {
    const value = cellText(row, column);

    if (!value) {
      continue;
    }

    if (parseUsSlashDate(value)) {
      usSlashMatches += 1;
      continue;
    }

    if (parseIsoDate(value)) {
      isoMatches += 1;
    }
  }

  if (usSlashMatches === 0 && isoMatches === 0) {
    return undefined;
  }

  if (usSlashMatches === isoMatches) {
    return undefined;
  }

  return usSlashMatches > isoMatches ? "us_slash_date" : "iso_date";
}

function detectTableMonthYearFormat(
  rows: readonly (readonly string[])[],
  column: number,
): PublicRecordTableMonthYearFormat | undefined {
  let slashMatches = 0;
  let isoMatches = 0;
  let nameMatches = 0;

  for (const row of rows.slice(0, 40)) {
    const value = cellText(row, column);

    if (!value) {
      continue;
    }

    if (parseUsSlashMonthYear(value)) {
      slashMatches += 1;
      continue;
    }

    if (parseIsoMonth(value)) {
      isoMatches += 1;
      continue;
    }

    if (parseMonthNameYear(value)) {
      nameMatches += 1;
    }
  }

  const ranked = [
    {
      format: "us_slash_month_year" as const,

      count: slashMatches,
    },

    {
      format: "iso_month" as const,

      count: isoMatches,
    },

    {
      format: "month_name_year" as const,

      count: nameMatches,
    },
  ].sort((left, right) => right.count - left.count);

  if (ranked[0].count === 0) {
    return undefined;
  }

  if (ranked[0].count === ranked[1].count) {
    return undefined;
  }

  return ranked[0].format;
}

function parseMoneyCents(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const text = value.replace(/\u00a0/g, " ").trim();

  if (!text) {
    return undefined;
  }

  /*
   * PDF extraction can merge neighboring cells.
   *
   * Example:
   *
   *   "$3,603.94 August 2021"
   *
   * Extract only the monetary token. Do not append the year to the amount.
   */
  const strongMoneyMatch = text.match(
    /(?:\$\s*)?-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|(?:\$\s*)?-?\d+\.\d{1,2}|\$\s*-?\d+/,
  );

  /*
   * Permit a plain numeric value only when the entire cell is numeric.
   *
   * This prevents "August 2021" from becoming $2,021.
   */
  const plainNumericMatch = !strongMoneyMatch
    ? text.match(/^\s*(-?\d+(?:\.\d{1,2})?)\s*$/)
    : undefined;

  const token = strongMoneyMatch?.[0] ?? plainNumericMatch?.[1];

  if (!token) {
    return undefined;
  }

  const normalized = token.replace(/[^0-9.-]/g, "");

  if (!normalized) {
    return undefined;
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const cents = Math.round(amount * 100);

  if (cents < 0) {
    return undefined;
  }

  return cents;
}

function parseJsonMoney(
  value: unknown,
  rule: PublicRecordJsonMoneyPath | undefined,
): number | undefined {
  if (!rule || value === null || value === undefined) {
    return undefined;
  }

  if (rule.format === "dollars") {
    const text = unknownText(value);

    return parseMoneyCents(text);
  }

  const text = unknownText(value);

  if (!text) {
    return undefined;
  }

  const normalized = text.replace(/[^0-9.-]/g, "");

  if (!normalized) {
    return undefined;
  }

  const cents = Number(normalized);

  if (!Number.isFinite(cents) || cents < 0) {
    return undefined;
  }

  return Math.round(cents);
}

interface ParsedOwner {
  formerOwnerName: string;

  sourceFirstName?: string;

  sourceLastNameOrCompany?: string;
}

function parseOwner(
  cells: readonly string[],
  profile: PublicRecordTableProfile,
): ParsedOwner | undefined {
  const sourceFirstName = cellText(cells, profile.owner.firstName);

  const sourceMiddleName = cellText(cells, profile.owner.middleName);

  const sourceLastNameOrCompany = cellText(
    cells,
    profile.owner.lastNameOrCompany,
  );

  const fullName = cellText(cells, profile.owner.fullName);

  const formerOwnerName =
    fullName ??
    [sourceFirstName, sourceMiddleName, sourceLastNameOrCompany]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  if (!formerOwnerName) {
    return undefined;
  }

  return {
    formerOwnerName,

    sourceFirstName,

    sourceLastNameOrCompany,
  };
}

function parseCaseNumber(
  cells: readonly string[],
  profile: PublicRecordTableProfile,
): string | undefined {
  const rule = profile.caseNumber;

  if (!rule) {
    return undefined;
  }

  const value = cellText(cells, rule.column);

  if (!value) {
    return undefined;
  }

  if (!rule.pattern) {
    return value;
  }

  rule.pattern.lastIndex = 0;

  const match = value.match(rule.pattern);

  if (!match) {
    return undefined;
  }

  return optionalText(match[1]);
}

interface ParsedAddress {
  addressLine1?: string;

  city?: string;

  postalCode?: string;
}

function extractPostalCode(value: string): string | undefined {
  const match = value.match(/\b(\d{5})(?:-\d{4})?\b/);

  return match?.[1];
}

function titleCaseLocality(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCombinedUsPremiseAddress(
  premise: string,
  knownCities: readonly string[],
  fallbackCity: string | undefined,
): ParsedAddress | undefined {
  const normalizedPremise = premise.replace(/\s+/g, " ").trim();

  if (!normalizedPremise) {
    return undefined;
  }

  const postalCode = extractPostalCode(normalizedPremise);

  const withoutZip = normalizedPremise
    .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const cityMatch = [...knownCities]
    .sort((left, right) => right.length - left.length)
    .find((city) => {
      const cityPattern = new RegExp(
        `(?:^|\\s)${escapeRegExp(city).replace(/\\ /g, "\\s+")}$`,
        "i",
      );

      return cityPattern.test(withoutZip);
    });

  const city = cityMatch ? titleCaseLocality(cityMatch) : fallbackCity;

  let addressLine1 = withoutZip;

  if (cityMatch) {
    const cityPattern = new RegExp(
      `\\s+${escapeRegExp(cityMatch).replace(/\\ /g, "\\s+")}$`,
      "i",
    );

    addressLine1 = addressLine1.replace(cityPattern, "").trim();
  }

  if (!addressLine1) {
    return {
      city,

      postalCode,
    };
  }

  return {
    addressLine1,

    city,

    postalCode,
  };
}

function parseAddress(
  cells: readonly string[],
  profile: PublicRecordTableProfile,
): ParsedAddress {
  switch (profile.address.mode) {
    case "structured": {
      return {
        addressLine1: cellText(cells, profile.address.addressLine1),

        city: cellText(cells, profile.address.city),

        postalCode: cellText(cells, profile.address.postalCode),
      };
    }

    case "combined_us_premise": {
      const premise = cellText(cells, profile.address.premise);

      if (!premise) {
        return {};
      }

      return (
        parseCombinedUsPremiseAddress(
          premise,
          profile.address.knownCities ?? [],
          profile.address.fallbackCity,
        ) ?? {}
      );
    }
  }
}

function rowMatchesIdentityRule(
  cells: readonly string[],
  profile: PublicRecordTableProfile,
): boolean {
  if (cells.length < profile.minimumColumns) {
    return false;
  }

  const value = cellText(cells, profile.rowIdentity.column);

  if (!value) {
    return false;
  }

  if (!profile.rowIdentity.pattern) {
    return true;
  }

  profile.rowIdentity.pattern.lastIndex = 0;

  return profile.rowIdentity.pattern.test(value);
}

interface RecordKeyValues {
  propertyId?: string;

  caseNumber?: string;

  saleDate?: IsoDate;

  saleMonthYear?: string;

  sourceSaleTimingText?: string;
}

function recordKeyValue(
  field: PublicRecordRecordKeyField,
  values: RecordKeyValues,
): string {
  switch (field) {
    case "property_id":
      return values.propertyId ?? "";

    case "case_number":
      return values.caseNumber ?? "";

    case "sale_date":
      return (
        values.saleDate ??
        values.saleMonthYear ??
        values.sourceSaleTimingText ??
        ""
      );
  }
}

function buildRecordKey(
  profile: PublicRecordTableProfile,
  values: RecordKeyValues,
): string {
  return profile.recordKey
    .map((field) => recordKeyValue(field, values))
    .join(":");
}

function buildAutomaticRecordKey(
  source: PublicRecordSourceDefinition,
  cells: readonly string[],
): string {
  const stableRow = cells
    .map((cell) => cell.replace(/\s+/g, " ").trim())
    .join("\u001f");

  const hash = createHash("sha256")
    .update(`${source.key}\u001e${stableRow}`, "utf8")
    .digest("hex")
    .slice(0, 32);

  return `auto:${hash}`;
}

function buildSourceReference(
  profile: PublicRecordTableProfile,
  propertyId: string | undefined,
  caseNumber: string | undefined,
): string | undefined {
  const parts: string[] = [];

  if (profile.sourceReference.propertyId && propertyId) {
    parts.push(`Property ID ${propertyId}`);
  }

  if (profile.sourceReference.caseNumber && caseNumber) {
    parts.push(`Case ${caseNumber}`);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join("; ");
}

function parseTableRow(
  cells: readonly string[],
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
): OfficialPublicRecord | undefined {
  if (!rowMatchesIdentityRule(cells, profile)) {
    return undefined;
  }

  const automaticProfile = profile.key.startsWith("auto-header:");

  const owner = parseOwner(cells, profile);

  /*
   * Explicit/configured profiles keep their previously validated owner
   * requirement.
   *
   * The automatic national discovery path may stage a real official surplus
   * row without an owner when the source itself omits claimant identity.
   * Missing identity remains blank here and is persisted as NULL downstream.
   * It is never replaced with a fabricated "unknown owner" value.
   */
  if (!owner && !automaticProfile) {
    return undefined;
  }

  const primarySaleDateText = cellText(cells, profile.dates.saleDate);

  const fallbackSaleDateText = cellText(cells, profile.dates.saleDateFallback);

  const primarySaleDate = parseTableDate(
    primarySaleDateText,
    profile.dates.format,
  );

  const fallbackSaleDate = parseTableDate(
    fallbackSaleDateText,
    profile.dates.format,
  );

  const saleDate = primarySaleDate ?? fallbackSaleDate;

  const primarySaleMonthYearText = cellText(cells, profile.dates.saleMonthYear);

  const fallbackSaleMonthYearText = cellText(
    cells,
    profile.dates.saleMonthYearFallback,
  );

  const monthYearFormat = profile.dates.monthYearFormat;

  const primarySaleMonthYearEvidence = monthYearFormat
    ? parseTableMonthYearEvidence(primarySaleMonthYearText, monthYearFormat)
    : undefined;

  const fallbackSaleMonthYearEvidence = monthYearFormat
    ? parseTableMonthYearEvidence(fallbackSaleMonthYearText, monthYearFormat)
    : undefined;

  const saleMonthYear =
    primarySaleMonthYearEvidence?.isoMonth ??
    fallbackSaleMonthYearEvidence?.isoMonth;

  const sourceSaleTimingText = primarySaleDate
    ? primarySaleDateText
    : fallbackSaleDate
      ? fallbackSaleDateText
      : (primarySaleMonthYearEvidence?.sourceText ??
        fallbackSaleMonthYearEvidence?.sourceText);

  /*
   * Explicitly configured profiles keep their previously validated behavior,
   * where sale timing is a required part of the row contract.
   *
   * The automatic national path does not require it: a government list that
   * publishes no sale date must stage with sale timing unknown rather than
   * discard the record.
   */
  if (!automaticProfile && !saleDate && !saleMonthYear) {
    return undefined;
  }

  const dateTransferred = parseTableDate(
    cellText(cells, profile.dates.transferredDate),
    profile.dates.format,
  );

  const address = parseAddress(cells, profile);

  const propertyId = cellText(cells, profile.columns?.propertyId);

  const parcelNumber = cellText(cells, profile.columns?.parcelNumber);

  const mapNumber = cellText(cells, profile.columns?.mapNumber);

  const gridNumber = cellText(cells, profile.columns?.gridNumber);

  const legalDescription = cellText(cells, profile.columns?.legalDescription);

  const currentOwnerName = cellText(cells, profile.columns?.currentOwnerName);

  const caseNumber = parseCaseNumber(cells, profile);

  const bidCents = parseMoneyCents(cellText(cells, profile.money?.bid));

  const depositCents = parseMoneyCents(cellText(cells, profile.money?.deposit));

  const sourceListedSurplusCents = parseMoneyCents(
    cellText(cells, profile.money?.surplus),
  );

  /*
   * A staged discovery record must carry at least one substantive official
   * fact beyond a name: a published balance, a property identifier, or sale
   * timing. This rejects footnote, legend, and total rows without inventing
   * anything and without demanding a complete record.
   */
  const hasSubstantiveFact =
    sourceListedSurplusCents !== undefined ||
    propertyId !== undefined ||
    parcelNumber !== undefined ||
    address.addressLine1 !== undefined ||
    caseNumber !== undefined ||
    saleDate !== undefined ||
    saleMonthYear !== undefined;

  if (!hasSubstantiveFact) {
    return undefined;
  }

  /*
   * When claimant identity is absent, require an actual row-level surplus
   * amount before staging the row.
   *
   * A parcel appearing on a surplus-themed document is not enough by itself to
   * establish that the specific row carries recoverable proceeds. This keeps
   * ownerless discovery conservative while still allowing sources such as Los
   * Angeles that publish Parcel + Excess Proceeds without an owner column.
   */
  if (!owner && sourceListedSurplusCents === undefined) {
    return undefined;
  }

  const recordKey = automaticProfile
    ? buildAutomaticRecordKey(source, cells)
    : buildRecordKey(profile, {
        propertyId,

        caseNumber,

        saleDate,

        saleMonthYear,

        sourceSaleTimingText,
      });

  const sourceReference = buildSourceReference(profile, propertyId, caseNumber);

  return {
    adapterKey: source.key,

    recordKey,

    propertyId,

    formerOwnerName: owner?.formerOwnerName ?? "",

    sourceFirstName: owner?.sourceFirstName,

    sourceLastNameOrCompany: owner?.sourceLastNameOrCompany,

    addressLine1: address.addressLine1,

    city: address.city,

    county: source.countyName ?? source.state,

    state: source.state,

    postalCode: address.postalCode,

    saleType: source.saleType,

    saleDate,

    saleMonthYear,

    sourceSaleTimingText,

    dateTransferred,

    caseNumber,

    parcelNumber,

    mapNumber,

    gridNumber,

    legalDescription,

    currentOwnerName,

    bidCents,

    depositCents,

    sourceListedSurplusCents,

    balanceOwedCents: sourceListedSurplusCents,

    agencyName: source.agencyName,

    agencyPhone: source.agencyPhone,

    custodian: source.custodian,

    sourceName: source.sourceName,

    sourceUrl: source.sourceUrl,

    sourceReference,

    confirmedSurplus: true,
  };
}

function parseRowsWithProfileOrEmpty(
  rows: readonly (readonly string[])[],
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
): OfficialPublicRecord[] {
  return rows
    .map((cells) => parseTableRow(cells, source, profile))
    .filter((record): record is OfficialPublicRecord => Boolean(record));
}

function parseRowsWithProfile(
  rows: readonly (readonly string[])[],
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
): OfficialPublicRecord[] {
  const records = rows
    .map((cells) => parseTableRow(cells, source, profile))
    .filter((record): record is OfficialPublicRecord => Boolean(record));

  if (records.length === 0) {
    throw ingestionFailure({
      reason: "NO_RECORDS_PARSED",

      message: `${source.sourceName} was reachable, but table profile ${profile.key} could not produce any surplus records from the current source structure.`,
    });
  }

  return records;
}

async function parseConfiguredTableSource(
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
  payload: PublicRecordSourcePayload,
): Promise<OfficialPublicRecord[]> {
  const rows = await extractPublicRecordRows(source, profile, payload);

  return parseRowsWithProfile(rows, source, profile);
}

/**
 * Every structured family reaches the automatic table pipeline.
 *
 * JSON and ArcGIS responses are flattened into the same header-plus-rows shape
 * by the row extractor, so schema interpretation, sale-timing precision, money
 * parsing, and record keys keep exactly one national implementation.
 */
function familySupportsAutomaticTableParsing(
  format: PublicRecordSourceFormat,
): boolean {
  return (
    format === "html_table" ||
    format === "csv" ||
    format === "xlsx" ||
    format === "pdf_table" ||
    format === "json_api" ||
    format === "arcgis"
  );
}

/**
 * Whether a resolved header set can be mapped into an automatic profile.
 *
 * This intentionally mirrors the discovery-layer admission rule rather than
 * demanding a complete record. Absent columns stay absent; they are never
 * substituted or reconstructed.
 */
function requiredAutoProfileColumnsPresent(
  resolution: PublicRecordResolvedHeaders,
  context: PublicRecordSchemaContext,
): boolean {
  const capability = describePublicRecordSchemaCapability(resolution, context);

  /*
   * National discovery may retain a genuine official surplus row before the
   * former owner is known.
   *
   * Examples such as Los Angeles publish a parcel identifier plus an explicit
   * Excess Proceeds amount but omit the former-owner name from the list.
   *
   * That is still actionable source evidence for discovery and later identity
   * enrichment. Promotion remains a separate, stricter downstream decision.
   */
  return (
    capability.looksLikeSurplusTable ||
    (capability.hasSurplus && capability.hasPropertyIdentity)
  );
}

function schemaContextForSource(
  source: PublicRecordSourceDefinition,
): PublicRecordSchemaContext {
  return {
    sourceName: source.sourceName,

    sourceUrl: source.sourceUrl,
  };
}

function buildAutomaticTableProfile(
  source: PublicRecordSourceDefinition,
  resolution: PublicRecordResolvedHeaders,
  dataRows: readonly (readonly string[])[],
  sourceFormat: PublicRecordSourceFormat,
): PublicRecordTableProfile | undefined {
  if (
    !requiredAutoProfileColumnsPresent(
      resolution,
      schemaContextForSource(source),
    )
  ) {
    return undefined;
  }

  const columns = resolution.columns;

  const propertyIdColumn = columns.property_id ?? columns.parcel_number;

  const addressColumn = columns.address_line_1;

  const saleDateColumn = columns.sale_date;

  const saleMonthYearColumn = columns.sale_month_year;

  const surplusColumn = columns.surplus;

  const exactDateFormat =
    saleDateColumn !== undefined
      ? detectTableDateFormat(dataRows, saleDateColumn)
      : undefined;

  const monthYearFormat =
    saleMonthYearColumn !== undefined
      ? detectTableMonthYearFormat(dataRows, saleMonthYearColumn)
      : undefined;

  /*
   * Sale timing is preserved when the government publishes it and left
   * unknown when it does not.
   *
   * A published excess-funds list with no sale-date column is still a valid
   * official surplus record set. Refusing it here was the single largest
   * cause of per-county parser work: sale timing is simply absent from a
   * large share of official lists.
   *
   * The only hard requirement is that the schema describes surplus records,
   * which requiredAutoProfileColumnsPresent() already established.
   */
  const timingUsable = Boolean(exactDateFormat) || Boolean(monthYearFormat);

  if (surplusColumn === undefined && !timingUsable) {
    /*
     * With neither a balance nor readable timing there is no substantive
     * surplus fact to stage.
     */
    return undefined;
  }

  const ownerIdentityColumn =
    columns.full_owner_name ??
    columns.last_name_or_company ??
    columns.first_name;

  const rowIdentityColumn =
    propertyIdColumn ??
    addressColumn ??
    columns.case_number ??
    ownerIdentityColumn;

  if (rowIdentityColumn === undefined) {
    return undefined;
  }

  const requiredIndexes = [rowIdentityColumn];

  if (surplusColumn !== undefined) {
    requiredIndexes.push(surplusColumn);
  }

  if (saleDateColumn !== undefined) {
    requiredIndexes.push(saleDateColumn);
  }

  if (saleMonthYearColumn !== undefined) {
    requiredIndexes.push(saleMonthYearColumn);
  }

  if (columns.full_owner_name !== undefined) {
    requiredIndexes.push(columns.full_owner_name);
  } else {
    if (columns.first_name !== undefined) {
      requiredIndexes.push(columns.first_name);
    }

    if (columns.last_name_or_company !== undefined) {
      requiredIndexes.push(columns.last_name_or_company);
    }
  }

  const recordKey: PublicRecordRecordKeyField[] = [];

  if (propertyIdColumn !== undefined) {
    recordKey.push("property_id");
  }

  if (columns.case_number !== undefined) {
    recordKey.push("case_number");
  }

  recordKey.push("sale_date");

  const dates: PublicRecordTableProfile["dates"] = {
    format: exactDateFormat ?? "us_slash_date",

    ...(saleDateColumn !== undefined && exactDateFormat
      ? {
          saleDate: saleDateColumn,
        }
      : {}),

    ...(saleMonthYearColumn !== undefined && monthYearFormat
      ? {
          saleMonthYear: saleMonthYearColumn,

          /*
           * PDF tables can occasionally merge the month/year into the
           * neighboring surplus cell. Use the surplus column only as a
           * fallback source of month/year evidence.
           *
           * parseTableMonthYearEvidence() still requires an actual
           * recognized month/year token.
           */
          ...(surplusColumn !== undefined &&
          surplusColumn !== saleMonthYearColumn
            ? {
                saleMonthYearFallback: surplusColumn,
              }
            : {}),

          monthYearFormat,
        }
      : {}),

    ...(columns.transferred_date !== undefined
      ? {
          transferredDate: columns.transferred_date,
        }
      : {}),
  };

  return {
    key: `auto-header:${source.key}`,

    parserKey: source.parserKey,

    supportedSourceFormats: [sourceFormat],

    minimumColumns: Math.max(...requiredIndexes) + 1,

    rowIdentity: {
      column: rowIdentityColumn,
    },

    owner: {
      ...(columns.full_owner_name !== undefined
        ? {
            fullName: columns.full_owner_name,
          }
        : {}),

      ...(columns.first_name !== undefined
        ? {
            firstName: columns.first_name,
          }
        : {}),

      ...(columns.last_name_or_company !== undefined
        ? {
            lastNameOrCompany: columns.last_name_or_company,
          }
        : {}),
    },

    dates,

    address: {
      mode: "structured",

      ...(addressColumn !== undefined
        ? {
            addressLine1: addressColumn,
          }
        : {}),

      ...(columns.city !== undefined
        ? {
            city: columns.city,
          }
        : {}),

      ...(columns.postal_code !== undefined
        ? {
            postalCode: columns.postal_code,
          }
        : {}),
    },

    money: {
      ...(surplusColumn !== undefined
        ? {
            surplus: surplusColumn,
          }
        : {}),

      ...(columns.bid !== undefined
        ? {
            bid: columns.bid,
          }
        : {}),

      ...(columns.deposit !== undefined
        ? {
            deposit: columns.deposit,
          }
        : {}),
    },

    columns: {
      ...(propertyIdColumn !== undefined
        ? {
            propertyId: propertyIdColumn,
          }
        : {}),

      ...(columns.parcel_number !== undefined
        ? {
            parcelNumber: columns.parcel_number,
          }
        : {}),

      ...(columns.map_number !== undefined
        ? {
            mapNumber: columns.map_number,
          }
        : {}),

      ...(columns.grid_number !== undefined
        ? {
            gridNumber: columns.grid_number,
          }
        : {}),

      ...(columns.legal_description !== undefined
        ? {
            legalDescription: columns.legal_description,
          }
        : {}),

      ...(columns.current_owner_name !== undefined
        ? {
            currentOwnerName: columns.current_owner_name,
          }
        : {}),
    },

    ...(columns.case_number !== undefined
      ? {
          caseNumber: {
            column: columns.case_number,
          },
        }
      : {}),

    recordKey,

    sourceReference: {
      propertyId: propertyIdColumn !== undefined,

      caseNumber: columns.case_number !== undefined,
    },
  };
}

interface AutomaticCandidateOutcome {
  label: string;

  records: OfficialPublicRecord[];

  failure?: PublicRecordIngestionFailure;
}

/**
 * Attempt automatic schema interpretation on one candidate table.
 *
 * Returns a failure description rather than throwing, so a payload containing
 * several candidate tables can be evaluated without one weak candidate
 * discarding the whole source.
 */
function parseAutomaticCandidate({
  source,
  sourceFormat,
  label,
  rows,
}: {
  source: PublicRecordSourceDefinition;

  sourceFormat: PublicRecordSourceFormat;

  label: string;

  rows: readonly (readonly string[])[];
}): AutomaticCandidateOutcome {
  const resolution = resolvePublicRecordTableHeaders(rows);

  if (!resolution) {
    return {
      label,

      records: [],

      failure: {
        reason: "UNRECOGNIZED_TABLE_STRUCTURE",

        message: `${source.sourceName} (${label}) did not contain a sufficiently recognizable surplus-table header.`,

        detectedFamily: sourceFormat,
      },
    };
  }

  const schemaContext = schemaContextForSource(source);

  if (!requiredAutoProfileColumnsPresent(resolution, schemaContext)) {
    return {
      label,

      records: [],

      failure: {
        reason: "INCOMPLETE_SURPLUS_SCHEMA",

        message: `${source.sourceName} (${label}): ${describePublicRecordSchemaGap(
          resolution,
          schemaContext,
        )}`,

        detectedFamily: sourceFormat,
      },
    };
  }

  const dataRows = rows.slice(resolution.headerRowIndex + 1);

  const generatedProfile = buildAutomaticTableProfile(
    source,
    resolution,
    dataRows,
    sourceFormat,
  );

  if (!generatedProfile) {
    return {
      label,

      records: [],

      failure: {
        reason: "INCOMPLETE_SURPLUS_SCHEMA",

        message: `${source.sourceName} (${label}) could not be mapped safely into DueQuity's automatic surplus-table profile.`,

        detectedFamily: sourceFormat,
      },
    };
  }

  const records = parseRowsWithProfileOrEmpty(
    dataRows,
    source,
    generatedProfile,
  );

  if (records.length === 0) {
    return {
      label,

      records: [],

      failure: {
        reason: "NO_RECORDS_PARSED",

        message: `${source.sourceName} (${label}) was read and its schema was understood, but no data row produced a surplus record.`,

        detectedFamily: sourceFormat,
      },
    };
  }

  return {
    label,

    records,
  };
}

/**
 * Automatic national parsing.
 *
 * Every candidate table in the payload is evaluated and the one producing the
 * most official records wins. That is what lets one engine handle a page with
 * a table per sale year, a workbook with a cover sheet, and a single-table PDF
 * without jurisdiction-specific configuration.
 */
async function parseAutomaticHeaderTableSource(
  source: PublicRecordSourceDefinition,
  payload: PublicRecordSourcePayload,
): Promise<OfficialPublicRecord[]> {
  if (!familySupportsAutomaticTableParsing(payload.format)) {
    throw ingestionFailure({
      reason: "UNSUPPORTED_SOURCE_FAMILY",

      message: `Automatic parsing is not available for source family ${payload.format}. Review required.`,

      detectedFamily: payload.format,
    });
  }

  const candidates = await extractPublicRecordTableCandidates(source, payload);

  const outcomes = candidates.map((candidate) =>
    parseAutomaticCandidate({
      source,

      sourceFormat: payload.format,

      label: candidate.label,

      rows: candidate.rows,
    }),
  );

  const best = outcomes
    .filter((outcome) => outcome.records.length > 0)
    .sort((left, right) => right.records.length - left.records.length)[0];

  if (best) {
    return best.records;
  }

  /*
   * Report the most informative failure. A schema gap tells a reviewer more
   * than "no header found" on an unrelated layout table.
   */
  const reported =
    outcomes.find(
      (outcome) => outcome.failure?.reason === "NO_RECORDS_PARSED",
    ) ??
    outcomes.find(
      (outcome) => outcome.failure?.reason === "INCOMPLETE_SURPLUS_SCHEMA",
    ) ??
    outcomes[0];

  throw ingestionFailure(
    reported?.failure ?? {
      reason: "UNRECOGNIZED_TABLE_STRUCTURE",

      message: `${source.sourceName} did not contain a recognizable surplus table. Review required.`,

      detectedFamily: payload.format,
    },
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveJsonPath(value: unknown, path: string): unknown {
  const parts = path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  let current: unknown = value;

  for (const part of parts) {
    if (!isJsonObject(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function jsonField(
  record: Record<string, unknown>,
  path: string | undefined,
): unknown {
  if (!path) {
    return undefined;
  }

  return resolveJsonPath(record, path);
}

function resolveJsonRecords(
  profile: PublicRecordJsonProfile,
  payload: PublicRecordJsonPayload,
): Record<string, unknown>[] {
  const rawRecords =
    profile.recordsPath === null
      ? payload.value
      : resolveJsonPath(payload.value, profile.recordsPath);

  if (!Array.isArray(rawRecords)) {
    throw new Error(
      `JSON profile ${profile.key} could not resolve its configured records array.`,
    );
  }

  const records = rawRecords.filter((value): value is Record<string, unknown> =>
    isJsonObject(value),
  );

  if (records.length === 0) {
    throw new Error(
      `JSON profile ${profile.key} did not contain any readable record objects.`,
    );
  }

  return records;
}

function parseJsonOwner(
  record: Record<string, unknown>,
  profile: PublicRecordJsonProfile,
): ParsedOwner | undefined {
  const sourceFirstName = unknownText(
    jsonField(record, profile.owner.firstName),
  );

  const sourceLastNameOrCompany = unknownText(
    jsonField(record, profile.owner.lastNameOrCompany),
  );

  const fullName = unknownText(jsonField(record, profile.owner.fullName));

  const formerOwnerName =
    fullName ??
    [sourceFirstName, sourceLastNameOrCompany]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  if (!formerOwnerName) {
    return undefined;
  }

  return {
    formerOwnerName,

    sourceFirstName,

    sourceLastNameOrCompany,
  };
}

function jsonRecordKeyValue(
  field: PublicRecordJsonRecordKeyField,
  values: RecordKeyValues,
): string {
  switch (field) {
    case "property_id":
      return values.propertyId ?? "";

    case "case_number":
      return values.caseNumber ?? "";

    case "sale_date":
      return (
        values.saleDate ??
        values.saleMonthYear ??
        values.sourceSaleTimingText ??
        ""
      );
  }
}

function buildJsonRecordKey(
  profile: PublicRecordJsonProfile,
  values: RecordKeyValues,
): string {
  return profile.recordKey
    .map((field) => jsonRecordKeyValue(field, values))
    .join(":");
}

function buildJsonSourceReference(
  profile: PublicRecordJsonProfile,
  propertyId: string | undefined,
  caseNumber: string | undefined,
): string | undefined {
  const parts: string[] = [];

  if (profile.sourceReference.propertyId && propertyId) {
    parts.push(`Property ID ${propertyId}`);
  }

  if (profile.sourceReference.caseNumber && caseNumber) {
    parts.push(`Case ${caseNumber}`);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join("; ");
}

function parseJsonRecord(
  record: Record<string, unknown>,
  source: PublicRecordSourceDefinition,
  profile: PublicRecordJsonProfile,
): OfficialPublicRecord | undefined {
  const owner = parseJsonOwner(record, profile);

  if (!owner) {
    return undefined;
  }

  const primarySaleDate = parseJsonDate(
    jsonField(record, profile.dates.saleDate),
    profile.dates.format,
  );

  const fallbackSaleDate = parseJsonDate(
    jsonField(record, profile.dates.saleDateFallback),
    profile.dates.format,
  );

  const saleDate = primarySaleDate ?? fallbackSaleDate;

  if (!saleDate) {
    return undefined;
  }

  const dateTransferred = parseJsonDate(
    jsonField(record, profile.dates.transferredDate),
    profile.dates.format,
  );

  const addressLine1 = unknownText(
    jsonField(record, profile.address.addressLine1),
  );

  if (!addressLine1) {
    return undefined;
  }

  const city = unknownText(jsonField(record, profile.address.city));

  const postalCode = unknownText(jsonField(record, profile.address.postalCode));

  const propertyId = unknownText(jsonField(record, profile.fields?.propertyId));

  const parcelNumber = unknownText(
    jsonField(record, profile.fields?.parcelNumber),
  );

  const mapNumber = unknownText(jsonField(record, profile.fields?.mapNumber));

  const gridNumber = unknownText(jsonField(record, profile.fields?.gridNumber));

  const legalDescription = unknownText(
    jsonField(record, profile.fields?.legalDescription),
  );

  const currentOwnerName = unknownText(
    jsonField(record, profile.fields?.currentOwnerName),
  );

  const caseNumber = unknownText(jsonField(record, profile.fields?.caseNumber));

  const bidCents = parseJsonMoney(
    jsonField(record, profile.money?.bid?.path),
    profile.money?.bid,
  );

  const depositCents = parseJsonMoney(
    jsonField(record, profile.money?.deposit?.path),
    profile.money?.deposit,
  );

  const sourceListedSurplusCents = parseJsonMoney(
    jsonField(record, profile.money?.surplus?.path),
    profile.money?.surplus,
  );

  const recordKey = buildJsonRecordKey(profile, {
    propertyId,

    caseNumber,

    saleDate,
  });

  const sourceReference = buildJsonSourceReference(
    profile,
    propertyId,
    caseNumber,
  );

  return {
    adapterKey: source.key,

    recordKey,

    propertyId,

    formerOwnerName: owner.formerOwnerName,

    sourceFirstName: owner.sourceFirstName,

    sourceLastNameOrCompany: owner.sourceLastNameOrCompany,

    addressLine1,

    city,

    county: source.countyName ?? source.state,

    state: source.state,

    postalCode,

    saleType: source.saleType,

    saleDate,

    sourceSaleTimingText: saleDate,

    dateTransferred,

    caseNumber,

    parcelNumber,

    mapNumber,

    gridNumber,

    legalDescription,

    currentOwnerName,

    bidCents,

    depositCents,

    sourceListedSurplusCents,

    balanceOwedCents: sourceListedSurplusCents,

    agencyName: source.agencyName,

    agencyPhone: source.agencyPhone,

    custodian: source.custodian,

    sourceName: source.sourceName,

    sourceUrl: source.sourceUrl,

    sourceReference,

    confirmedSurplus: true,
  };
}

function parseConfiguredJsonSource(
  source: PublicRecordSourceDefinition,
  profile: PublicRecordJsonProfile,
  payload: PublicRecordSourcePayload,
): OfficialPublicRecord[] {
  if (source.sourceFormat !== "json_api") {
    throw new Error(
      `JSON profile ${profile.key} cannot parse source format ${source.sourceFormat}.`,
    );
  }

  if (payload.kind !== "json" || payload.format !== "json_api") {
    throw new Error(
      `Source ${source.key} did not return the expected JSON/API payload.`,
    );
  }

  const sourceRecords = resolveJsonRecords(profile, payload);

  const records = sourceRecords
    .map((record) => parseJsonRecord(record, source, profile))
    .filter((record): record is OfficialPublicRecord => Boolean(record));

  if (records.length === 0) {
    throw new Error(
      `${source.sourceName} was reachable, but JSON profile ${profile.key} could not produce any surplus records from the current response structure.`,
    );
  }

  return records;
}

export async function parsePublicRecordSourcePayload(
  source: PublicRecordSourceDefinition,
  payload: PublicRecordSourcePayload,
): Promise<OfficialPublicRecord[]> {
  if (payload.sourceKey !== source.key) {
    throw ingestionFailure({
      reason: "SOURCE_CONFIGURATION_MISMATCH",

      message: `Source payload ${payload.sourceKey} does not belong to source ${source.key}.`,
    });
  }

  const explicitTableProfile = resolvePublicRecordTableProfile(
    source.parserKey,
  );

  /*
   * A configured profile only applies while the jurisdiction still publishes
   * the family that profile was written against.
   *
   * When a county switches publication format, the automatic national engine
   * takes over instead of reporting a configuration mismatch. County-specific
   * configuration therefore degrades gracefully rather than becoming a
   * maintenance obligation.
   */
  if (
    explicitTableProfile &&
    explicitTableProfile.supportedSourceFormats.includes(payload.format)
  ) {
    return parseConfiguredTableSource(source, explicitTableProfile, payload);
  }

  const jsonProfile = resolvePublicRecordJsonProfile(source.parserKey);

  if (jsonProfile && payload.kind === "json") {
    return parseConfiguredJsonSource(source, jsonProfile, payload);
  }

  if (
    source.parserKey === PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY ||
    explicitTableProfile ||
    jsonProfile
  ) {
    return parseAutomaticHeaderTableSource(source, payload);
  }

  throw ingestionFailure({
    reason: "SOURCE_CONFIGURATION_MISMATCH",

    message: `DueQuity parser profile ${source.parserKey} is not implemented.`,
  });
}

export function publicRecordParserImplemented(parserKey: string): boolean {
  return (
    publicRecordTableProfileImplemented(parserKey) ||
    parserKey === PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY ||
    publicRecordJsonProfileImplemented(parserKey)
  );
}