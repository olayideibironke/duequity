import "server-only";

import type {
  SaleType,
  StateCode,
  SurplusCustodian,
} from "@/domain/types";

/**
 * NATIONAL PUBLIC-RECORD SOURCE REGISTRY
 *
 * This registry separates jurisdiction/source configuration from record
 * extraction logic.
 *
 * A county or county-equivalent should not require a new discovery engine.
 * Instead, DueQuity resolves the jurisdiction to an approved official source
 * definition and dispatches that source to a reusable parser/extractor.
 *
 * Current implementation:
 *
 *   - Carroll County, Maryland is the first activated source.
 *
 * Future implementation:
 *
 *   - source discovery proposes official government sources
 *   - staff/research review validates the source
 *   - approved definitions are activated here or in the future persisted
 *     source registry
 *   - reusable HTML/PDF/CSV/XLSX/API extractors consume the definition
 *
 * Unsupported jurisdictions fail closed.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type PublicRecordSourceFormat =
  | "html_table"
  | "pdf_table"
  | "csv"
  | "xlsx"
  | "json_api"
  | "web_portal";

export type PublicRecordSourceStatus =
  | "active"
  | "research_required"
  | "disabled";

export type PublicRecordSourceLevel =
  | "county"
  | "state";

export interface PublicRecordSourceDefinition {
  /**
   * Stable DueQuity source identifier.
   *
   * This is configuration identity, not a government record ID.
   */
  key: string;

  /**
   * State in which this source operates.
   */
  state: StateCode;

  /**
   * Census county/county-equivalent GEOID when this is a county-level source.
   *
   * State-level sources may omit this because they may serve multiple counties.
   */
  countyGeoid?: string;

  countyName?: string;

  sourceLevel: PublicRecordSourceLevel;

  /**
   * Human-readable government source name.
   */
  sourceName: string;

  /**
   * Official government URL only.
   */
  sourceUrl: string;

  /**
   * Source transport/format. Reusable extraction engines will dispatch from
   * this value rather than from county-specific conditionals.
   */
  sourceFormat: PublicRecordSourceFormat;

  /**
   * Parser/extraction profile.
   *
   * Parser profiles are reusable. A profile may serve multiple jurisdictions
   * that publish the same source structure.
   *
   * Carroll currently uses its proven parser while the generic HTML-table
   * extractor is introduced around it.
   */
  parserKey: string;

  agencyName: string;

  agencyPhone?: string;

  custodian: SurplusCustodian;

  saleType: SaleType;

  /**
   * Only active sources may be used by the operational county pull.
   *
   * Research-required and disabled sources remain unavailable to harvesting.
   */
  status: PublicRecordSourceStatus;

  /**
   * Whether the source supports pulling the full published jurisdiction list
   * rather than requiring a person/address query.
   */
  supportsBulkPull: boolean;
}

export interface PublicRecordJurisdictionLookup {
  state: string;

  county?: string;

  countyGeoid?: string;
}

/* ========================================================================== */
/* Activated registry                                                          */
/* ========================================================================== */

const PUBLIC_RECORD_SOURCE_REGISTRY: readonly PublicRecordSourceDefinition[] = [
  {
    key:
      "md-carroll-tax-sale-surplus",

    state:
      "MD",

    countyGeoid:
      "24013",

    countyName:
      "Carroll County",

    sourceLevel:
      "county",

    sourceName:
      "Carroll County Tax Sale Surplus Funds List",

    sourceUrl:
      "https://www.carrollcountymd.gov/government/directory/comptroller/collectionstaxes/surplus-funds-list/",

    sourceFormat:
      "html_table",

    parserKey:
      "md-carroll-tax-sale-surplus-v1",

    agencyName:
      "Carroll County Government",

    agencyPhone:
      "4103862971",

    custodian:
      "county_tax_collector",

    saleType:
      "tax_lien_foreclosure",

    status:
      "active",

    supportsBulkPull:
      true,
  },
];

/* ========================================================================== */
/* Normalization                                                               */
/* ========================================================================== */

function normalizeState(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    normalized ===
    "MARYLAND"
  ) {
    return "MD";
  }

  return normalized;
}

function normalizeCounty(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /\bcounty\b/g,
      "",
    )
    .replace(
      /\bparish\b/g,
      "",
    )
    .replace(
      /\bborough\b/g,
      "",
    )
    .replace(
      /\bcensus area\b/g,
      "",
    )
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

/**
 * All configured public-record sources.
 *
 * Returned as a copy so callers cannot mutate registry state.
 */
export function listPublicRecordSources(): PublicRecordSourceDefinition[] {
  return PUBLIC_RECORD_SOURCE_REGISTRY.map(
    (source) => ({
      ...source,
    }),
  );
}

/**
 * Sources that are currently authorized for operational harvesting.
 */
export function listActivePublicRecordSources(): PublicRecordSourceDefinition[] {
  return PUBLIC_RECORD_SOURCE_REGISTRY
    .filter(
      (source) =>
        source.status ===
        "active",
    )
    .map(
      (source) => ({
        ...source,
      }),
    );
}

/**
 * Active sources for one state.
 */
export function listActivePublicRecordSourcesForState(
  state: string,
): PublicRecordSourceDefinition[] {
  const stateCode =
    normalizeState(
      state,
    );

  return PUBLIC_RECORD_SOURCE_REGISTRY
    .filter(
      (source) =>
        source.status ===
          "active" &&
        source.state ===
          stateCode,
    )
    .map(
      (source) => ({
        ...source,
      }),
    );
}

/**
 * Resolve the activated official source for a jurisdiction.
 *
 * Resolution priority:
 *
 *   1. exact Census county GEOID
 *   2. normalized state + county name
 *   3. activated state-level source
 *
 * If nothing matches, return undefined. Callers must fail closed.
 */
export function resolvePublicRecordSource(
  lookup: PublicRecordJurisdictionLookup,
): PublicRecordSourceDefinition | undefined {
  const state =
    normalizeState(
      lookup.state,
    );

  const countyGeoid =
    lookup.countyGeoid
      ?.trim();

  const county =
    normalizeCounty(
      lookup.county ??
        "",
    );

  if (
    countyGeoid
  ) {
    const byGeoid =
      PUBLIC_RECORD_SOURCE_REGISTRY.find(
        (source) =>
          source.status ===
            "active" &&
          source.state ===
            state &&
          source.countyGeoid ===
            countyGeoid,
      );

    if (
      byGeoid
    ) {
      return {
        ...byGeoid,
      };
    }
  }

  if (
    county
  ) {
    const byCountyName =
      PUBLIC_RECORD_SOURCE_REGISTRY.find(
        (source) =>
          source.status ===
            "active" &&
          source.state ===
            state &&
          source.sourceLevel ===
            "county" &&
          Boolean(
            source.countyName,
          ) &&
          normalizeCounty(
            source.countyName ??
              "",
          ) ===
            county,
      );

    if (
      byCountyName
    ) {
      return {
        ...byCountyName,
      };
    }
  }

  const stateLevel =
    PUBLIC_RECORD_SOURCE_REGISTRY.find(
      (source) =>
        source.status ===
          "active" &&
        source.state ===
          state &&
        source.sourceLevel ===
          "state",
    );

  return stateLevel
    ? {
        ...stateLevel,
      }
    : undefined;
}

/**
 * Whether DueQuity currently has an activated bulk source for the supplied
 * jurisdiction.
 */
export function publicRecordBulkPullAvailable(
  lookup: PublicRecordJurisdictionLookup,
): boolean {
  const source =
    resolvePublicRecordSource(
      lookup,
    );

  return Boolean(
    source?.supportsBulkPull,
  );
}