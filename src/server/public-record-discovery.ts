import "server-only";

import type {
  IsoDate,
  SaleType,
  StateCode,
  SurplusCustodian,
} from "@/domain/types";

import { resolveAddressGeography } from "@/server/geography-resolver";

import { fetchPublicRecordSourcePayload } from "@/server/public-record-source-fetcher";

import { parsePublicRecordSourcePayload } from "@/server/public-record-source-parser";

import {
  toIngestionFailure,
  type PublicRecordIngestionFailureReason,
} from "@/server/public-record-source-family";

import {
  listActivePublicRecordSources,
  type PublicRecordSourceDefinition,
  type PublicRecordSourceFormat,
} from "@/server/public-record-source-registry";

import { resolvePublicRecordSourceWithDiagnostics } from "@/server/public-record-source-auto-discovery";

/**
 * OFFICIAL PUBLIC RECORD DISCOVERY
 *
 * National read-only orchestrator for official government surplus records.
 *
 * Flow:
 *
 *   Geography
 *      ↓
 *   Configured source registry
 *      ↓
 *   National automatic official-source discovery when no configured source
 *      ↓
 *   Standardized source fetcher
 *      ↓
 *   Parser profile / automatic header mapper
 *      ↓
 *   Normalized official records
 *      ↓
 *   Query filtering
 *
 * IMPORTANT NATIONAL DATA RULE:
 *
 * Government sources are allowed to be incomplete.
 *
 * A valid source record may publish:
 *
 *   - a parcel but no situs street address
 *   - a sale month/year but no exact sale day
 *   - an owner and surplus amount but no phone/email
 *
 * DueQuity preserves exactly what the source publishes. Missing facts remain
 * missing and may later be enriched from other authoritative sources.
 *
 * This module deliberately does not contain:
 *
 *   - jurisdiction-specific routing
 *   - county-specific parsers
 *   - source-specific HTTP logic
 *   - staging logic
 *   - claimant research
 *   - legal approval
 *   - intake authorization
 *   - outreach authorization
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

  /**
   * Exact combined former-owner name as represented by the official source.
   */
  formerOwnerName: string;

  /**
   * Exact value from an official source's First Name column, when supplied.
   */
  sourceFirstName?: string;

  /**
   * Exact value from an official source's Last Name / Company column, when
   * supplied.
   *
   * This field deliberately preserves source meaning. It must not be treated
   * automatically as a person's last name when sourceFirstName is absent,
   * because the source may contain a company, trust, estate or another
   * non-person owner.
   */
  sourceLastNameOrCompany?: string;

  /**
   * Source-published situs/property street address.
   *
   * Optional nationally. A government surplus list may identify the property
   * only by parcel, account or case number.
   */
  addressLine1?: string;

  /**
   * Source-published property city/locality.
   *
   * Optional. The county name is not substituted here because county and city
   * are different facts.
   */
  city?: string;

  county: string;

  state: StateCode;

  postalCode?: string;

  saleType: SaleType;

  /**
   * Exact sale date only when the source publishes day-level precision.
   *
   * DueQuity must not manufacture an exact date from month/year data.
   */
  saleDate?: IsoDate;

  /**
   * Normalized government-published sale month/year in YYYY-MM form when the
   * source provides only month precision.
   *
   * Example:
   *
   *   source: "08/2024"
   *   normalized: "2024-08"
   *
   * This does NOT mean August 1, August 31, or any other specific day.
   */
  saleMonthYear?: string;

  /**
   * Exact source-native sale timing text.
   *
   * Examples:
   *
   *   "08/2024"
   *   "August 2024"
   *   "2024-08"
   *
   * This preserves source evidence even after normalization.
   */
  sourceSaleTimingText?: string;

  /**
   * Date the tax-sale interest or related property record was transferred,
   * where the official source provides one.
   */
  dateTransferred?: IsoDate;

  caseNumber?: string;

  /**
   * Source-native parcel identifier.
   */
  parcelNumber?: string;

  mapNumber?: string;

  gridNumber?: string;

  legalDescription?: string;

  currentOwnerName?: string;

  /**
   * Source-native sale or tax-sale bid.
   */
  bidCents?: number;

  /**
   * Source-native deposit amount.
   */
  depositCents?: number;

  /**
   * Financial amount published by the source as surplus, excess proceeds,
   * balance owed or another source-native surplus-related amount.
   *
   * This remains source evidence and must not be mapped automatically into
   * Opportunity.confirmedSurplus.
   */
  sourceListedSurplusCents?: number;

  /**
   * Backward-compatible source balance field retained for existing staging,
   * search and harvest consumers.
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
   * surplus-related source. It does not mean Duequity has populated
   * Opportunity.confirmedSurplus.
   */
  confirmedSurplus: boolean;
}

export interface OfficialRecordSearchQuery {
  address?: string;

  ownerName?: string;

  state?: string;

  county?: string;

  countyGeoid?: string;
}

export type OfficialRecordDiscoveryResult =
  | {
      status: "supported";

      sourceName: string;

      sourceUrl: string;

      sourceFormat: PublicRecordSourceFormat;

      records: OfficialPublicRecord[];
    }
  | {
      status: "unsupported";

      records: [];

      /**
       * Machine-readable review reason. Never a silent empty result.
       */
      reason?: PublicRecordIngestionFailureReason;

      message: string;
    }
  | {
      status: "error";

      records: [];

      sourceName: string;

      reason: PublicRecordIngestionFailureReason;

      message: string;
    };

/* ========================================================================== */
/* Search helpers                                                              */
/* ========================================================================== */

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

function normalizeState(value: string): string {
  const normalized = value.trim().toUpperCase();

  if (normalized === "MARYLAND") {
    return "MD";
  }

  return normalized;
}

/* ========================================================================== */
/* Source execution                                                           */
/* ========================================================================== */

/**
 * Retrieve and parse one official source.
 *
 * Discovery does not know whether the source is HTML, CSV, XLSX, PDF, JSON or
 * a portal. The source definition, fetcher and parser layers own those
 * responsibilities.
 */
async function loadRecordsForSource(
  source: PublicRecordSourceDefinition,
): Promise<OfficialPublicRecord[]> {
  const payload = await fetchPublicRecordSourcePayload(source);

  return parsePublicRecordSourcePayload(source, payload);
}

/* ========================================================================== */
/* Jurisdiction resolution                                                     */
/* ========================================================================== */

interface ResolvedQueryLocation {
  state: string;

  county: string;

  countyGeoid?: string;
}

async function resolveQueryLocation(
  query: OfficialRecordSearchQuery,
): Promise<ResolvedQueryLocation> {
  const rawAddress = query.address?.trim() ?? "";

  if (rawAddress.length >= 8) {
    try {
      const geography = await resolveAddressGeography(rawAddress);

      return {
        state: geography.state.postalCode,

        county: geography.county.name,

        countyGeoid: geography.county.geoid,
      };
    } catch {
      /*
       * Fall through to form-supplied geography.
       *
       * A temporary Census-resolution failure does not invent a jurisdiction.
       * National source resolution still fails closed if the supplied
       * geography cannot be tied to a trusted official source.
       */
    }
  }

  return {
    state: normalizeState(query.state ?? ""),

    county: query.county ?? "",

    countyGeoid: query.countyGeoid?.trim() || undefined,
  };
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
        record.addressLine1 ?? "",
        record.city ?? "",
        record.state,
        record.postalCode ?? "",
      ].join(" "),
    )
  ) {
    return false;
  }

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

  /*
   * Resolution order:
   *
   *   1. configured activated source
   *   2. national trusted-government source discovery
   *
   * An automatically discovered source must successfully retrieve and parse
   * real surplus records before it is accepted.
   */
  const resolution = await resolvePublicRecordSourceWithDiagnostics({
    state: location.state,

    county: location.county,

    countyGeoid: location.countyGeoid,
  });

  const source = resolution.source;

  if (!source) {
    return {
      status: "unsupported",

      records: [],

      ...(resolution.reviewReason
        ? {
            reason: resolution.reviewReason,
          }
        : {}),

      message: resolution.message,
    };
  }

  try {
    const records = await loadRecordsForSource(source);

    return {
      status: "supported",

      sourceName: source.sourceName,

      sourceUrl: source.sourceUrl,

      sourceFormat: source.sourceFormat,

      records: records.filter((record) => recordMatchesQuery(record, query)),
    };
  } catch (error) {
    const failure = toIngestionFailure(
      error,
      `DueQuity could not search ${source.sourceName}.`,
    );

    return {
      status: "error",

      records: [],

      sourceName: source.sourceName,

      reason: failure.reason,

      message: `${failure.reason}${
        failure.variant ? ` (${failure.variant})` : ""
      }: ${failure.message}`,
    };
  }
}

/* ========================================================================== */
/* Harvest support                                                             */
/* ========================================================================== */

/**
 * Return records from every permanently activated bulk-capable official source.
 *
 * Runtime-discovered sources are intentionally county-selective and are not
 * included in this global registry harvest. A runtime source is validated when
 * a staff operator requests that jurisdiction.
 *
 * One activated-source failure does not erase successful records from another
 * source.
 */
export async function listSupportedOfficialPublicRecords(): Promise<
  OfficialPublicRecord[]
> {
  const sources = listActivePublicRecordSources().filter(
    (source) => source.supportsBulkPull,
  );

  const records: OfficialPublicRecord[] = [];

  for (const source of sources) {
    try {
      const sourceRecords = await loadRecordsForSource(source);

      records.push(...sourceRecords);
    } catch {
      /*
       * Preserve aggregate-harvest isolation.
       *
       * A temporarily unavailable government source must not discard records
       * successfully retrieved from other activated sources.
       */
    }
  }

  return records;
}
