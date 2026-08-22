import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * DUEQUITY NATIONAL GEOGRAPHY RESOLVER
 *
 * Resolves a U.S. property address through the official U.S. Census
 * Geocoding Services API, then verifies the returned state/county geography
 * against Duequity's locally generated national geography registry.
 *
 * This module establishes geography only.
 *
 * It does NOT:
 *
 *   - determine foreclosure law
 *   - determine tax-sale law
 *   - select a legal lane
 *   - approve a jurisdiction
 *   - determine deadlines
 *   - determine fee limits
 *
 * Those belong to the jurisdiction-intelligence layer that follows.
 */

/* ========================================================================== */
/* Census configuration                                                        */
/* ========================================================================== */

const CENSUS_GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

const CENSUS_BENCHMARK = "Public_AR_Current";

const CENSUS_VINTAGE = "Current_Current";

/* ========================================================================== */
/* Registry types                                                              */
/* ========================================================================== */

export interface DuequityCountyGeography {
  geoid: string;
  countyFips: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DuequityStateGeography {
  geoid: string;
  stateFips: string;
  postalCode: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  countyCount: number;
  counties: DuequityCountyGeography[];
}

export interface DuequityGeographyRegistry {
  schemaVersion: number;

  scope: {
    country: string;
    countryCode: string;
    includes: string;
    territoriesActivated: boolean;
  };

  source: {
    authority: string;
    dataset: string;
    format: string;
    statesUrl: string;
    countiesUrl: string;
    geographyIdentifier: string;
  };

  generatedAt: string;

  totals: {
    statesAndDc: number;
    countyEquivalents: number;
  };

  states: DuequityStateGeography[];
}

/* ========================================================================== */
/* Census response types                                                       */
/* ========================================================================== */

interface CensusCoordinates {
  x?: number;
  y?: number;
}

interface CensusAddressComponents {
  city?: string;
  state?: string;
  zip?: string;
}

interface CensusGeographyEntity {
  GEOID?: string;
  STATE?: string;
  COUNTY?: string;
  NAME?: string;
  [key: string]: unknown;
}

interface CensusAddressMatch {
  matchedAddress?: string;

  coordinates?: CensusCoordinates;

  addressComponents?: CensusAddressComponents;

  geographies?: Record<string, CensusGeographyEntity[]>;
}

interface CensusGeocoderResponse {
  result?: {
    input?: {
      benchmark?: {
        benchmarkName?: string;
      };

      vintage?: {
        vintageName?: string;
      };
    };

    addressMatches?: CensusAddressMatch[];
  };
}

/* ========================================================================== */
/* Public result                                                               */
/* ========================================================================== */

export interface ResolvedAddressGeography {
  queryAddress: string;

  matchedAddress: string;

  coordinates: {
    longitude: number | null;
    latitude: number | null;
  };

  state: {
    name: string;
    postalCode: string;
    stateFips: string;
    geoid: string;
  };

  county: {
    name: string;
    countyFips: string;
    geoid: string;
  };

  census: {
    benchmark: string;
    vintage: string;
  };
}

/* ========================================================================== */
/* Registry loading                                                            */
/* ========================================================================== */

let registryCache: DuequityGeographyRegistry | undefined;

async function loadRegistry(): Promise<DuequityGeographyRegistry> {
  if (registryCache) {
    return registryCache;
  }

  const registryPath = join(
    process.cwd(),
    "src",
    "data",
    "generated",
    "us-geography.json",
  );

  let raw: string;

  try {
    raw = await readFile(registryPath, "utf8");
  } catch {
    throw new Error(
      "Duequity national geography registry is missing. Run scripts/sync-us-geography.ps1 before resolving addresses.",
    );
  }

  /*
   * Windows PowerShell 5.1 may write UTF-8 text with a BOM.
   *
   * JSON.parse does not accept the BOM character when it remains at the
   * beginning of the decoded string, so remove only that optional marker.
   *
   * The registry contents themselves are not otherwise modified.
   */
  const normalizedRaw = raw.replace(/^\uFEFF/, "");

  let parsed: DuequityGeographyRegistry;

  try {
    parsed = JSON.parse(normalizedRaw) as DuequityGeographyRegistry;
  } catch {
    throw new Error(
      "Duequity national geography registry contains invalid JSON.",
    );
  }

  if (!Array.isArray(parsed.states) || parsed.states.length !== 51) {
    throw new Error(
      "Duequity national geography registry failed the state-count integrity check.",
    );
  }

  if (!parsed.totals || parsed.totals.countyEquivalents < 3000) {
    throw new Error(
      "Duequity national geography registry failed the county-count integrity check.",
    );
  }

  registryCache = parsed;

  return parsed;
}

/**
 * The validated national geography registry.
 *
 * Exposed so that surfaces which need to describe Duequity's national footprint
 * read the same integrity-checked registry the address resolver uses, rather than
 * hard-coding a state or county list of their own.
 *
 * This registry describes geography only. It carries no statement about whether
 * Duequity operates anywhere.
 */
export async function loadNationalGeography(): Promise<DuequityGeographyRegistry> {
  return loadRegistry();
}

/* ========================================================================== */
/* Registry lookup                                                             */
/* ========================================================================== */

function findState(
  registry: DuequityGeographyRegistry,
  stateFips: string,
): DuequityStateGeography | undefined {
  return registry.states.find((state) => state.stateFips === stateFips);
}

function findCounty(
  state: DuequityStateGeography,
  countyGeoid: string,
): DuequityCountyGeography | undefined {
  return state.counties.find((county) => county.geoid === countyGeoid);
}

/* ========================================================================== */
/* Census geography extraction                                                 */
/* ========================================================================== */

function extractStateAndCountyCodes(match: CensusAddressMatch): {
  stateFips: string;
  countyFips: string;
} {
  const geographies = match.geographies;

  if (!geographies) {
    throw new Error(
      "Census matched the address but returned no geographic entities.",
    );
  }

  /*
   * Census may return many geography layers.
   *
   * We deliberately do not depend on one presentation-layer name such as
   * "Counties" because the returned layer collection can vary by vintage.
   *
   * Any returned geography entity containing both STATE and COUNTY identifies
   * the same state/county pair for the matched coordinate.
   */
  for (const entities of Object.values(geographies)) {
    if (!Array.isArray(entities)) {
      continue;
    }

    for (const entity of entities) {
      const stateFips =
        typeof entity.STATE === "string" ? entity.STATE.trim() : "";

      const countyFips =
        typeof entity.COUNTY === "string" ? entity.COUNTY.trim() : "";

      if (/^\d{2}$/.test(stateFips) && /^\d{3}$/.test(countyFips)) {
        return {
          stateFips,
          countyFips,
        };
      }
    }
  }

  throw new Error(
    "Census matched the address but did not return a usable state/county geography pair.",
  );
}

/* ========================================================================== */
/* Census request                                                              */
/* ========================================================================== */

async function requestCensusGeography(
  address: string,
): Promise<CensusGeocoderResponse> {
  const parameters = new URLSearchParams({
    address,
    benchmark: CENSUS_BENCHMARK,
    vintage: CENSUS_VINTAGE,
    format: "json",
  });

  const url = `${CENSUS_GEOCODER_URL}?${parameters.toString()}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",

      cache: "no-store",

      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error("Duequity could not reach the U.S. Census Geocoder.");
  }

  if (!response.ok) {
    throw new Error(`U.S. Census Geocoder returned HTTP ${response.status}.`);
  }

  try {
    return (await response.json()) as CensusGeocoderResponse;
  } catch {
    throw new Error("U.S. Census Geocoder returned an unreadable response.");
  }
}

/* ========================================================================== */
/* Public resolver                                                             */
/* ========================================================================== */

export async function resolveAddressGeography(
  address: string,
): Promise<ResolvedAddressGeography> {
  const queryAddress = address.trim();

  if (queryAddress.length < 8) {
    throw new Error("A complete U.S. property address is required.");
  }

  if (queryAddress.length > 500) {
    throw new Error("Property address is too long.");
  }

  const [registry, censusResponse] = await Promise.all([
    loadRegistry(),
    requestCensusGeography(queryAddress),
  ]);

  const matches = censusResponse.result?.addressMatches ?? [];

  if (matches.length === 0) {
    throw new Error(
      "The U.S. Census Geocoder could not match this property address.",
    );
  }

  /*
   * Fail closed on ambiguity.
   *
   * Duequity should never silently select one geography when Census returns
   * multiple possible address matches.
   */
  if (matches.length !== 1) {
    throw new Error(
      `The U.S. Census Geocoder returned ${matches.length} possible matches. Address confirmation is required.`,
    );
  }

  const match = matches[0];

  const { stateFips, countyFips } = extractStateAndCountyCodes(match);

  const countyGeoid = `${stateFips}${countyFips}`;

  const state = findState(registry, stateFips);

  if (!state) {
    throw new Error(
      `Census resolved state FIPS ${stateFips}, but that state is outside Duequity's currently activated U.S. geography scope.`,
    );
  }

  const county = findCounty(state, countyGeoid);

  if (!county) {
    throw new Error(
      `Census resolved county GEOID ${countyGeoid}, but it was not found in Duequity's national geography registry.`,
    );
  }

  const componentState = match.addressComponents?.state?.trim().toUpperCase();

  if (componentState && componentState !== state.postalCode) {
    throw new Error(
      "Census returned conflicting state information for the matched address.",
    );
  }

  const longitude =
    typeof match.coordinates?.x === "number" ? match.coordinates.x : null;

  const latitude =
    typeof match.coordinates?.y === "number" ? match.coordinates.y : null;

  const matchedAddress = match.matchedAddress?.trim();

  if (!matchedAddress) {
    throw new Error(
      "Census matched the property but did not return a standardized address.",
    );
  }

  return {
    queryAddress,

    matchedAddress,

    coordinates: {
      longitude,
      latitude,
    },

    state: {
      name: state.name,

      postalCode: state.postalCode,

      stateFips: state.stateFips,

      geoid: state.geoid,
    },

    county: {
      name: county.name,

      countyFips: county.countyFips,

      geoid: county.geoid,
    },

    census: {
      benchmark:
        censusResponse.result?.input?.benchmark?.benchmarkName ??
        CENSUS_BENCHMARK,

      vintage:
        censusResponse.result?.input?.vintage?.vintageName ?? CENSUS_VINTAGE,
    },
  };
}
