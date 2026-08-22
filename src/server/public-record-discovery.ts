import "server-only";

import type {
  IsoDate,
  SaleType,
  StateCode,
  SurplusCustodian,
} from "@/domain/types";

import { resolveAddressGeography } from "@/server/geography-resolver";

/**
 * OFFICIAL PUBLIC RECORD DISCOVERY
 *
 * Read-only source-adapter layer for official government records.
 *
 * The adapter may preserve more evidence than the operational Opportunity
 * model requires so Duequity can review and enrich records without losing
 * source-native facts.
 *
 * Discovery does NOT:
 *
 *   - create an Opportunity
 *   - create a Claim
 *   - approve a jurisdiction
 *   - determine legal rules
 *   - authorize claimant intake
 *   - authorize outreach
 *   - approve commercial pricing
 */

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export interface OfficialPublicRecord {
  adapterKey: string;

  recordKey: string;

  /**
   * Source-native property or tax-account identifier.
   */
  propertyId?: string;

  formerOwnerName: string;

  addressLine1: string;

  city: string;

  county: string;

  state: StateCode;

  postalCode?: string;

  saleType: SaleType;

  saleDate: IsoDate;

  /**
   * Date the tax-sale interest or related property record was transferred,
   * where the official source provides one.
   */
  dateTransferred?: IsoDate;

  caseNumber?: string;

  /**
   * Source table parcel value.
   *
   * This remains distinct from propertyId because Carroll County publishes
   * separate Property ID, Map, Grid and Parcel columns.
   */
  parcelNumber?: string;

  mapNumber?: string;

  gridNumber?: string;

  legalDescription?: string;

  currentOwnerName?: string;

  /**
   * Source-native tax-sale bid.
   */
  bidCents?: number;

  /**
   * Source-native amount shown in the Deposit column.
   */
  depositCents?: number;

  /**
   * Financial amount published by the source on its surplus-funds list.
   *
   * Carroll County currently labels the table column "Balance Owed" while its
   * surplus-funds FAQ describes the list as supplying the amount of surplus.
   *
   * This remains source evidence. It must not be mapped automatically into
   * Opportunity.confirmedSurplus without the enrichment and promotion gates.
   */
  sourceListedSurplusCents?: number;

  /**
   * Backward-compatible alias for the exact Carroll table column currently
   * labeled "Balance Owed".
   *
   * Existing public-search and harvest code may continue reading this field
   * while the broader staging model migrates to the richer evidence fields.
   */
  balanceOwedCents?: number;

  agencyName: string;

  agencyPhone?: string;

  custodian: SurplusCustodian;

  sourceName: string;

  sourceUrl: string;

  sourceReference?: string;

  /**
   * Legacy source-level signal retained for downstream compatibility.
   *
   * true means the government itself publishes the record on an official
   * surplus-funds list. It does NOT mean Duequity has created or populated
   * Opportunity.confirmedSurplus.
   */
  confirmedSurplus: boolean;
}

export interface OfficialRecordSearchQuery {
  address?: string;

  ownerName?: string;

  state?: string;

  county?: string;
}

export type OfficialRecordDiscoveryResult =
  | {
      status: "supported";

      sourceName: string;

      records: OfficialPublicRecord[];
    }
  | {
      status: "unsupported";

      records: [];

      message: string;
    }
  | {
      status: "error";

      records: [];

      sourceName: string;

      message: string;
    };

/* ========================================================================== */
/* Carroll County adapter                                                      */
/* ========================================================================== */

const CARROLL_SOURCE_URL =
  "https://www.carrollcountymd.gov/government/directory/comptroller/collectionstaxes/surplus-funds-list/";

const CARROLL_SOURCE_NAME = "Carroll County Tax Sale Surplus Funds List";

const CARROLL_ADAPTER_KEY = "md-carroll-tax-sale-surplus";

const CARROLL_AGENCY_PHONE = "4103862971";

/* ========================================================================== */
/* General text helpers                                                        */
/* ========================================================================== */

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized || undefined;
}

function canonicalToken(token: string): string {
  switch (token) {
    case "road":
      return "rd";

    case "street":
      return "st";

    case "avenue":
      return "ave";

    case "drive":
      return "dr";

    case "lane":
      return "ln";

    case "boulevard":
      return "blvd";

    case "highway":
      return "hwy";

    case "route":
      return "rte";

    case "court":
      return "ct";

    case "circle":
      return "cir";

    case "terrace":
      return "ter";

    case "place":
      return "pl";

    case "parkway":
      return "pkwy";

    case "trail":
      return "trl";

    default:
      return token;
  }
}

function searchableTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => canonicalToken(token))
    .filter((token) => token.length > 2 || /^\d+$/.test(token));
}

function normalizedSearchText(value: string): string {
  return searchableTokens(value).join(" ");
}

function queryMatchesText(query: string, candidate: string): boolean {
  const queryTokens = searchableTokens(query);

  if (queryTokens.length === 0) {
    return true;
  }

  const candidateText = normalizedSearchText(candidate);

  return queryTokens.every((token) => candidateText.includes(token));
}

function normalizeCounty(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bcounty\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeState(value: string): string {
  const normalized = value.trim().toUpperCase();

  if (normalized === "MARYLAND") {
    return "MD";
  }

  return normalized;
}

/* ========================================================================== */
/* HTML table helpers                                                          */
/* ========================================================================== */

function extractRows(html: string): string[][] {
  const rows: string[][] = [];

  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    const cells: string[] = [];

    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push(htmlToText(cellMatch[1]));
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

/* ========================================================================== */
/* Carroll parsing                                                             */
/* ========================================================================== */

function parseDate(value: string): IsoDate | undefined {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return undefined;
  }

  const month = match[1].padStart(2, "0");

  const day = match[2].padStart(2, "0");

  return `${match[3]}-${month}-${day}` as IsoDate;
}

function parseMoneyCents(value: string): number | undefined {
  const normalized = value.replace(/[^0-9.-]/g, "");

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

function extractCaseNumber(comment: string): string | undefined {
  const match = comment.match(/\bCASE\s*:?\s*([A-Z0-9-]+)/i);

  return match?.[1]?.trim();
}

function extractPostalCode(premise: string): string | undefined {
  const match = premise.match(/\b(\d{5})(?:-\d{4})?\b/);

  return match?.[1];
}

function guessCity(premise: string): string {
  const withoutZip = premise
    .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const knownCities = [
    "WESTMINSTER",
    "TANEYTOWN",
    "MANCHESTER",
    "HAMPSTEAD",
    "FINKSBURG",
    "SYKESVILLE",
    "MOUNT AIRY",
    "NEW WINDSOR",
    "UNION BRIDGE",
    "WOODBINE",
    "ELDERSBURG",
    "MARRIOTTSVILLE",
  ];

  const match = knownCities.find((city) =>
    withoutZip.toUpperCase().includes(city),
  );

  if (match) {
    return match
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  return "Carroll County";
}

function streetLineFromPremise(premise: string): string {
  let value = premise
    .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const city = guessCity(premise);

  if (city !== "Carroll County") {
    const cityPattern = new RegExp(`\\s+${city.replace(/\s+/g, "\\s+")}$`, "i");

    value = value.replace(cityPattern, "");
  }

  return value.trim();
}

function parseCarrollRows(html: string): OfficialPublicRecord[] {
  const rows = extractRows(html);

  const records: OfficialPublicRecord[] = [];

  for (const cells of rows) {
    /*
     * Current official Carroll County column order:
     *
     *  0 No.
     *  1 Property ID
     *  2 Map
     *  3 Blk (Grid)
     *  4 Par
     *  5 First Name
     *  6 Last Name / Company
     *  7 Date Sold
     *  8 Date Transferred
     *  9 Bid
     * 10 Deposit
     * 11 Balance Owed
     * 12 Liber
     * 13 Folio
     * 14 Premise
     * 15 Legal Desc
     * 16 Current Owner
     * 17 Current Liber
     * 18 Current Folio
     * 19 Comment
     *
     * The adapter preserves source-native evidence but does not infer the
     * operational Opportunity financial model.
     */

    if (cells.length < 20) {
      continue;
    }

    const propertyId = optionalText(cells[1]);

    if (!propertyId || !/^[0-9]{2}-/.test(propertyId)) {
      continue;
    }

    const dateSold = parseDate(cells[7] ?? "");

    const dateTransferred = parseDate(cells[8] ?? "");

    const saleDate = dateSold ?? dateTransferred;

    if (!saleDate) {
      continue;
    }

    const premise = optionalText(cells[14]);

    if (!premise) {
      continue;
    }

    const formerOwnerName = [optionalText(cells[5]), optionalText(cells[6])]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!formerOwnerName) {
      continue;
    }

    const comment = cells[19] ?? "";

    const caseNumber = extractCaseNumber(comment);

    const mapNumber = optionalText(cells[2]);

    const gridNumber = optionalText(cells[3]);

    const parcelNumber = optionalText(cells[4]);

    const legalDescription = optionalText(cells[15]);

    const currentOwnerName = optionalText(cells[16]);

    const bidCents = parseMoneyCents(cells[9] ?? "");

    const depositCents = parseMoneyCents(cells[10] ?? "");

    const sourceListedSurplusCents = parseMoneyCents(cells[11] ?? "");

    const recordKey = [propertyId, caseNumber ?? "", saleDate].join(":");

    const sourceReference = caseNumber
      ? `Property ID ${propertyId}; Case ${caseNumber}`
      : `Property ID ${propertyId}`;

    records.push({
      adapterKey: CARROLL_ADAPTER_KEY,

      recordKey,

      propertyId,

      formerOwnerName,

      addressLine1: streetLineFromPremise(premise),

      city: guessCity(premise),

      county: "Carroll County",

      state: "MD",

      postalCode: extractPostalCode(premise),

      saleType: "tax_lien_foreclosure",

      saleDate,

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

      /*
       * Preserve the exact source-column meaning for existing consumers.
       * This is intentionally not mapped directly to Opportunity.confirmedSurplus.
       */
      balanceOwedCents: sourceListedSurplusCents,

      agencyName: "Carroll County Government",

      agencyPhone: CARROLL_AGENCY_PHONE,

      custodian: "county_tax_collector",

      sourceName: CARROLL_SOURCE_NAME,

      sourceUrl: CARROLL_SOURCE_URL,

      sourceReference,

      /*
       * Source-level only:
       * Carroll County itself publishes this record on its Surplus Funds List.
       *
       * Operational confirmation remains a separate enrichment/promotion gate.
       */
      confirmedSurplus: true,
    });
  }

  return records;
}

async function fetchCarrollRecords(): Promise<OfficialPublicRecord[]> {
  let response: Response;

  try {
    response = await fetch(CARROLL_SOURCE_URL, {
      method: "GET",

      cache: "no-store",

      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    throw new Error(
      "Duequity could not reach the Carroll County surplus-funds source.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Carroll County surplus source returned HTTP ${response.status}.`,
    );
  }

  const html = await response.text();

  const records = parseCarrollRows(html);

  if (records.length === 0) {
    throw new Error(
      "Carroll County surplus source was reachable, but Duequity could not parse any surplus records from the current page structure.",
    );
  }

  return records;
}

/* ========================================================================== */
/* Adapter selection                                                           */
/* ========================================================================== */

async function resolveQueryLocation(query: OfficialRecordSearchQuery): Promise<{
  state: string;

  county: string;
}> {
  const rawAddress = query.address?.trim() ?? "";

  if (rawAddress.length >= 8) {
    try {
      const geography = await resolveAddressGeography(rawAddress);

      return {
        state: geography.state.postalCode,

        county: geography.county.name,
      };
    } catch {
      /*
       * Fall through to the form-supplied state/county.
       *
       * Address autocomplete already populates those fields in normal public
       * use, so a temporary Census failure does not automatically destroy the
       * ability to select an official source adapter.
       */
    }
  }

  return {
    state: normalizeState(query.state ?? ""),

    county: query.county ?? "",
  };
}

function isCarrollCountyMaryland({
  state,
  county,
}: {
  state: string;

  county: string;
}): boolean {
  return (
    normalizeState(state) === "MD" && normalizeCounty(county) === "carroll"
  );
}

/* ========================================================================== */
/* Query matching                                                              */
/* ========================================================================== */

function recordMatchesQuery(
  record: OfficialPublicRecord,
  query: OfficialRecordSearchQuery,
): boolean {
  const address = query.address?.trim() ?? "";

  const ownerName = query.ownerName?.trim() ?? "";

  if (
    address &&
    !queryMatchesText(
      address,
      [
        record.addressLine1,
        record.city,
        record.state,
        record.postalCode ?? "",
      ].join(" "),
    )
  ) {
    return false;
  }

  /*
   * Public owner search remains tied to the former owner of record.
   *
   * Current-owner data is preserved as evidence but is not used to make a
   * claimant-facing former-owner match.
   */
  if (ownerName && !queryMatchesText(ownerName, record.formerOwnerName)) {
    return false;
  }

  return true;
}

/* ========================================================================== */
/* Public discovery                                                            */
/* ========================================================================== */

export async function discoverOfficialPublicRecords(
  query: OfficialRecordSearchQuery,
): Promise<OfficialRecordDiscoveryResult> {
  const location = await resolveQueryLocation(query);

  if (!isCarrollCountyMaryland(location)) {
    return {
      status: "unsupported",

      records: [],

      message:
        "Duequity does not yet have a live official-record adapter for this jurisdiction.",
    };
  }

  try {
    const records = await fetchCarrollRecords();

    return {
      status: "supported",

      sourceName: CARROLL_SOURCE_NAME,

      records: records.filter((record) => recordMatchesQuery(record, query)),
    };
  } catch (error) {
    return {
      status: "error",

      records: [],

      sourceName: CARROLL_SOURCE_NAME,

      message:
        error instanceof Error
          ? error.message
          : "Duequity could not search the Carroll County official surplus source.",
    };
  }
}

/* ========================================================================== */
/* Harvest support                                                             */
/* ========================================================================== */

export async function listSupportedOfficialPublicRecords(): Promise<
  OfficialPublicRecord[]
> {
  try {
    return await fetchCarrollRecords();
  } catch {
    return [];
  }
}
