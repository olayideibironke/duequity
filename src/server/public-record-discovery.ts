import "server-only";

import type {
  IsoDate,
  SaleType,
  StateCode,
  SurplusCustodian,
} from "@/domain/types";

import {
  resolveAddressGeography,
} from "@/server/geography-resolver";

import {
  fetchPublicRecordSourcePayload,
} from "@/server/public-record-source-fetcher";

import {
  parsePublicRecordSourcePayload,
} from "@/server/public-record-source-parser";

import {
  listActivePublicRecordSources,
  resolvePublicRecordSource,
  type PublicRecordSourceDefinition,
} from "@/server/public-record-source-registry";

/**
 * OFFICIAL PUBLIC RECORD DISCOVERY
 *
 * National read-only orchestrator for official government surplus records.
 *
 * Flow:
 *
 *   Geography
 *      ↓
 *   National source registry
 *      ↓
 *   Standardized source fetcher
 *      ↓
 *   Parser profile
 *      ↓
 *   Normalized official records
 *      ↓
 *   Query filtering
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
   *
   * This is preserved separately so downstream reporting never has to split or
   * infer a person's first name from formerOwnerName.
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
/* Search helpers                                                              */
/* ========================================================================== */

function canonicalToken(
  token: string,
): string {
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

function searchableTokens(
  value: string,
): string[] {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .split(
      /\s+/,
    )
    .map(
      (token) =>
        canonicalToken(
          token,
        ),
    )
    .filter(
      (token) =>
        token.length > 2 ||
        /^\d+$/.test(
          token,
        ),
    );
}

function normalizedSearchText(
  value: string,
): string {
  return searchableTokens(
    value,
  ).join(
    " ",
  );
}

function queryMatchesText(
  query: string,
  candidate: string,
): boolean {
  const queryTokens =
    searchableTokens(
      query,
    );

  if (
    queryTokens.length ===
    0
  ) {
    return true;
  }

  const candidateText =
    normalizedSearchText(
      candidate,
    );

  return queryTokens.every(
    (token) =>
      candidateText.includes(
        token,
      ),
  );
}

function normalizeState(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .toUpperCase();

  /*
   * Retain the existing public-search compatibility for Maryland.
   *
   * National form controls normally supply USPS postal codes. Additional
   * human-readable state-name normalization belongs in the geography layer,
   * not in jurisdiction-specific source routing.
   */
  if (
    normalized ===
    "MARYLAND"
  ) {
    return "MD";
  }

  return normalized;
}

/* ========================================================================== */
/* Source execution                                                           */
/* ========================================================================== */

/**
 * Retrieve and parse one activated official source.
 *
 * Discovery does not know whether the source is HTML, CSV, XLSX, PDF, JSON or
 * a portal. The registry, fetcher and parser layers own those responsibilities.
 */
async function loadRecordsForSource(
  source: PublicRecordSourceDefinition,
): Promise<OfficialPublicRecord[]> {
  const payload =
    await fetchPublicRecordSourcePayload(
      source,
    );

  return parsePublicRecordSourcePayload(
    source,
    payload,
  );
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
  const rawAddress =
    query.address
      ?.trim() ??
    "";

  if (
    rawAddress.length >=
    8
  ) {
    try {
      const geography =
        await resolveAddressGeography(
          rawAddress,
        );

      return {
        state:
          geography.state.postalCode,

        county:
          geography.county.name,

        countyGeoid:
          geography.county.geoid,
      };
    } catch {
      /*
       * Fall through to form-supplied geography.
       *
       * A temporary Census-resolution failure does not invent a jurisdiction.
       * Registry resolution still fails closed if the supplied state/county
       * does not identify an activated official source.
       */
    }
  }

  return {
    state:
      normalizeState(
        query.state ??
          "",
      ),

    county:
      query.county ??
      "",

    countyGeoid:
      query.countyGeoid
        ?.trim() ||
      undefined,
  };
}

/* ========================================================================== */
/* Query matching                                                              */
/* ========================================================================== */

function recordMatchesQuery(
  record: OfficialPublicRecord,
  query: OfficialRecordSearchQuery,
): boolean {
  const address =
    query.address
      ?.trim() ??
    "";

  const ownerName =
    query.ownerName
      ?.trim() ??
    "";

  if (
    address &&
    !queryMatchesText(
      address,
      [
        record.addressLine1,
        record.city,
        record.state,
        record.postalCode ??
          "",
      ].join(
        " ",
      ),
    )
  ) {
    return false;
  }

  /*
   * Public owner search remains tied to the former owner of record.
   *
   * Current-owner data may be preserved as official evidence but is not used
   * to make a claimant-facing former-owner match.
   */
  if (
    ownerName &&
    !queryMatchesText(
      ownerName,
      record.formerOwnerName,
    )
  ) {
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
  const location =
    await resolveQueryLocation(
      query,
    );

  /*
   * National jurisdiction routing occurs only through the source registry.
   *
   * There are no county-specific or state-specific routing conditions in this
   * discovery orchestrator.
   */
  const source =
    resolvePublicRecordSource({
      state:
        location.state,

      county:
        location.county,

      countyGeoid:
        location.countyGeoid,
    });

  if (
    !source
  ) {
    return {
      status:
        "unsupported",

      records:
        [],

      message:
        "Duequity does not yet have an activated official-record source for this jurisdiction.",
    };
  }

  try {
    const records =
      await loadRecordsForSource(
        source,
      );

    return {
      status:
        "supported",

      sourceName:
        source.sourceName,

      records:
        records.filter(
          (record) =>
            recordMatchesQuery(
              record,
              query,
            ),
        ),
    };
  } catch (
    error
  ) {
    return {
      status:
        "error",

      records:
        [],

      sourceName:
        source.sourceName,

      message:
        error instanceof Error
          ? error.message
          : `Duequity could not search ${source.sourceName}.`,
    };
  }
}

/* ========================================================================== */
/* Harvest support                                                             */
/* ========================================================================== */

/**
 * Return records from every active bulk-capable official source.
 *
 * This is registry driven. Adding an activated source to the national registry
 * automatically makes it eligible for this aggregate harvest when
 * supportsBulkPull is true and its parser profile is implemented.
 *
 * One source failure does not erase successful records from another source.
 * County-specific discovery continues to surface its own source error.
 */
export async function listSupportedOfficialPublicRecords(): Promise<
  OfficialPublicRecord[]
> {
  const sources =
    listActivePublicRecordSources()
      .filter(
        (source) =>
          source.supportsBulkPull,
      );

  const records:
    OfficialPublicRecord[] =
    [];

  for (
    const source of sources
  ) {
    try {
      const sourceRecords =
        await loadRecordsForSource(
          source,
        );

      records.push(
        ...sourceRecords,
      );
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