import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SaleType } from "@/domain/types";

/**
 * DUEQUITY JURISDICTION SOURCE DISCOVERY
 *
 * Takes:
 *
 *   state FIPS
 *   + county GEOID
 *   + sale type
 *
 * and returns a small, tightly scoped set of trusted official government
 * domains that are likely to contain controlling legal or procedural material.
 *
 * SCOPE RULES:
 *
 *   - Exact target-county domains may be included.
 *   - Relevant state-level authorities may be included.
 *   - Other counties are excluded.
 *   - Federal agencies are excluded from this state/local discovery pass.
 *   - State agencies unrelated to the selected sale type are excluded.
 *   - Weak statewide matches are excluded even if they contain a generic word
 *     such as "claim", "sale" or "proceeds".
 *
 * This module performs discovery only.
 *
 * It does NOT:
 *
 *   - interpret statutes
 *   - create jurisdiction rules
 *   - approve legal conclusions
 *   - determine deadlines
 *   - determine fee limits
 *   - determine attorney requirements
 */

/* ========================================================================== */
/* Registry types                                                              */
/* ========================================================================== */

interface CountyCandidate {
  geoid: string;
  name: string;
}

interface GovernmentDomainRecord {
  domain: string;
  baseUrl: string;
  domainType: string;
  organizationName: string;
  suborganizationName: string;
  city: string;
  state: string;
  stateFips: string;
  likelyCountyDomain: boolean;
  countyCandidates: CountyCandidate[];
}

interface GovernmentDomainState {
  state: string;
  stateName: string;
  stateFips: string;
  domainCount: number;
  likelyCountyDomainCount: number;
  domains: GovernmentDomainRecord[];
}

interface GovernmentDomainRegistry {
  schemaVersion: number;

  totals: {
    sourceRecords: number;
    operationalGovDomains: number;
    stateRecords: number;
  };

  states: GovernmentDomainState[];
}

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type SourceCandidateScope = "county_exact" | "statewide_authority";

export interface JurisdictionSourceCandidate {
  domain: string;

  baseUrl: string;

  organizationName: string;

  suborganizationName?: string;

  domainType?: string;

  scope: SourceCandidateScope;

  score: number;

  matchedSignals: string[];
}

export interface JurisdictionSourceDiscoveryResult {
  stateFips: string;

  stateCode: string;

  stateName: string;

  countyGeoid: string;

  countyName?: string;

  saleType: SaleType;

  discoveryTerms: string[];

  candidates: JurisdictionSourceCandidate[];

  legalRulesResolved: false;

  message: string;
}

/* ========================================================================== */
/* Registry loading                                                            */
/* ========================================================================== */

let registryCache: GovernmentDomainRegistry | undefined;

async function loadRegistry(): Promise<GovernmentDomainRegistry> {
  if (registryCache) {
    return registryCache;
  }

  const path = join(
    process.cwd(),
    "src",
    "data",
    "generated",
    "us-government-domains.json",
  );

  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(
      "Duequity government-domain registry is missing. Run scripts/sync-us-government-domains.ps1 first.",
    );
  }

  const normalized = raw.replace(/^\uFEFF/, "");

  let parsed: GovernmentDomainRegistry;

  try {
    parsed = JSON.parse(normalized) as GovernmentDomainRegistry;
  } catch {
    throw new Error(
      "Duequity government-domain registry contains invalid JSON.",
    );
  }

  if (
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.states) ||
    parsed.states.length !== 51
  ) {
    throw new Error(
      "Duequity government-domain registry failed integrity validation.",
    );
  }

  registryCache = parsed;

  return parsed;
}

/* ========================================================================== */
/* Sale-type source signals                                                    */
/* ========================================================================== */

interface SaleTypeDiscoveryProfile {
  terms: string[];

  authoritySignals: string[];
}

function getSaleTypeProfile(saleType: SaleType): SaleTypeDiscoveryProfile {
  switch (saleType) {
    case "judicial_foreclosure":
      return {
        terms: [
          "foreclosure",
          "surplus",
          "excess proceeds",
          "sale",
          "claim",
          "auditor",
        ],

        authoritySignals: [
          "court",
          "courts",
          "judiciary",
          "judicial",
          "clerk",
          "circuit",
          "superior court",
          "district court",
          "auditor",
        ],
      };

    case "nonjudicial_foreclosure":
      return {
        terms: [
          "foreclosure",
          "trustee",
          "surplus",
          "excess proceeds",
          "mortgage",
          "deed of trust",
        ],

        authoritySignals: [
          "financial regulation",
          "banking",
          "mortgage",
          "recorder",
          "trustee",
          "attorney general",
          "consumer protection",
        ],
      };

    case "tax_deed_sale":
    case "tax_lien_foreclosure":
      return {
        terms: [
          "tax sale",
          "tax deed",
          "tax lien",
          "surplus",
          "excess proceeds",
          "claim",
        ],

        authoritySignals: [
          "tax",
          "taxation",
          "treasurer",
          "collector",
          "tax collector",
          "finance",
          "revenue",
          "clerk",
        ],
      };

    case "sheriff_sale":
      return {
        terms: [
          "sheriff sale",
          "foreclosure",
          "surplus",
          "excess proceeds",
          "claim",
        ],

        authoritySignals: ["sheriff", "court", "courts", "clerk", "judiciary"],
      };

    case "hoa_foreclosure":
      return {
        terms: [
          "hoa foreclosure",
          "association foreclosure",
          "condominium foreclosure",
          "surplus",
          "excess proceeds",
          "claim",
        ],

        authoritySignals: [
          "court",
          "courts",
          "judiciary",
          "clerk",
          "consumer protection",
          "real estate",
          "condominium",
          "homeowners association",
        ],
      };

    case "trustee_sale":
      return {
        terms: [
          "trustee sale",
          "foreclosure",
          "surplus",
          "excess proceeds",
          "claim",
        ],

        authoritySignals: [
          "trustee",
          "recorder",
          "court",
          "clerk",
          "financial regulation",
          "real estate",
        ],
      };

    case "municipal_lien_foreclosure":
      return {
        terms: [
          "municipal lien foreclosure",
          "municipal lien",
          "lien foreclosure",
          "foreclosure sale",
          "surplus",
          "excess proceeds",
          "claim",
        ],

        authoritySignals: [
          "municipal",
          "municipality",
          "court",
          "courts",
          "judiciary",
          "clerk",
          "finance",
          "treasurer",
          "collector",
        ],
      };

    case "partition_sale":
      return {
        terms: [
          "partition sale",
          "partition action",
          "sale in lieu of partition",
          "judicial sale",
          "sale proceeds",
          "distribution of proceeds",
          "claim",
        ],

        authoritySignals: [
          "court",
          "courts",
          "judiciary",
          "clerk",
          "civil",
          "real estate",
          "recorder",
          "trustee",
        ],
      };

    default:
      return {
        terms: ["surplus", "excess proceeds", "claim"],

        authoritySignals: [
          "court",
          "courts",
          "judiciary",
          "clerk",
          "treasurer",
          "collector",
          "finance",
        ],
      };
  }
}

/* ========================================================================== */
/* Text helpers                                                                */
/* ========================================================================== */

function normalizedText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsSignal(text: string, signal: string): boolean {
  const normalizedSignal = normalizedText(signal);

  if (!normalizedSignal) {
    return false;
  }

  return text.includes(normalizedSignal);
}

/* ========================================================================== */
/* Scope helpers                                                               */
/* ========================================================================== */

function belongsToTargetCounty(
  domain: GovernmentDomainRecord,
  countyGeoid: string,
): boolean {
  return domain.countyCandidates.some(
    (candidate) => candidate.geoid === countyGeoid,
  );
}

function belongsToAnotherCounty(
  domain: GovernmentDomainRecord,
  countyGeoid: string,
): boolean {
  if (belongsToTargetCounty(domain, countyGeoid)) {
    return false;
  }

  return domain.likelyCountyDomain || domain.countyCandidates.length > 0;
}

function isFederalDomain(domain: GovernmentDomainRecord): boolean {
  return normalizedText(domain.domainType).includes("federal");
}

function isStateLevelDomain(domain: GovernmentDomainRecord): boolean {
  const type = normalizedText(domain.domainType);

  return type.includes("state or territory") || type === "state";
}

/* ========================================================================== */
/* Candidate scoring                                                           */
/* ========================================================================== */

function scoreDomain({
  domain,
  countyGeoid,
  profile,
}: {
  domain: GovernmentDomainRecord;

  countyGeoid: string;

  profile: SaleTypeDiscoveryProfile;
}): JurisdictionSourceCandidate | null {
  const countyExact = belongsToTargetCounty(domain, countyGeoid);

  const stateLevel = isStateLevelDomain(domain);

  if (!countyExact && !stateLevel) {
    return null;
  }

  const domainText = normalizedText(domain.domain);

  const organizationText = normalizedText(
    [domain.organizationName, domain.suborganizationName, domain.domainType]
      .filter(Boolean)
      .join(" "),
  );

  let score = countyExact ? 100 : 0;

  const matchedSignals: string[] = [];

  if (countyExact) {
    matchedSignals.push("exact county GEOID");
  }

  let authorityMatchCount = 0;

  let saleTypeMatchCount = 0;

  for (const signal of profile.authoritySignals) {
    if (containsSignal(organizationText, signal)) {
      score += 14;

      authorityMatchCount += 1;

      matchedSignals.push(`authority organization match: ${signal}`);
    }

    if (containsSignal(domainText, signal)) {
      score += 8;

      authorityMatchCount += 1;

      matchedSignals.push(`authority domain match: ${signal}`);
    }
  }

  for (const term of profile.terms) {
    if (containsSignal(organizationText, term)) {
      score += 8;

      saleTypeMatchCount += 1;

      matchedSignals.push(`sale-type organization match: ${term}`);
    }

    if (containsSignal(domainText, term)) {
      score += 5;

      saleTypeMatchCount += 1;

      matchedSignals.push(`sale-type domain match: ${term}`);
    }
  }

  /*
   * Exact county domains survive because they are already tied to the target
   * GEOID.
   *
   * A statewide domain must demonstrate enough relevance to avoid weak generic
   * matches such as a domain containing only the word "claim".
   */
  if (!countyExact && authorityMatchCount === 0 && saleTypeMatchCount === 0) {
    return null;
  }

  if (!countyExact && score < 12) {
    return null;
  }

  return {
    domain: domain.domain,

    baseUrl: domain.baseUrl,

    organizationName: domain.organizationName,

    suborganizationName: domain.suborganizationName || undefined,

    domainType: domain.domainType || undefined,

    scope: countyExact ? "county_exact" : "statewide_authority",

    score,

    matchedSignals: [...new Set(matchedSignals)],
  };
}

/* ========================================================================== */
/* Public discovery                                                            */
/* ========================================================================== */

export async function discoverJurisdictionSources({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): Promise<JurisdictionSourceDiscoveryResult> {
  if (!/^\d{2}$/.test(stateFips)) {
    throw new Error(`Invalid state FIPS: ${stateFips}`);
  }

  if (!/^\d{5}$/.test(countyGeoid) || !countyGeoid.startsWith(stateFips)) {
    throw new Error(
      `Invalid county GEOID ${countyGeoid} for state FIPS ${stateFips}.`,
    );
  }

  const registry = await loadRegistry();

  const state = registry.states.find(
    (candidate) => candidate.stateFips === stateFips,
  );

  if (!state) {
    throw new Error(
      `State FIPS ${stateFips} is outside Duequity's current U.S. scope.`,
    );
  }

  const countyMatch = state.domains
    .flatMap((domain) => domain.countyCandidates)
    .find((candidate) => candidate.geoid === countyGeoid);

  const profile = getSaleTypeProfile(saleType);

  const eligibleDomains = state.domains.filter(
    (domain) =>
      !belongsToAnotherCounty(domain, countyGeoid) && !isFederalDomain(domain),
  );

  const candidates = eligibleDomains
    .map((domain) =>
      scoreDomain({
        domain,
        countyGeoid,
        profile,
      }),
    )
    .filter(
      (candidate): candidate is JurisdictionSourceCandidate =>
        candidate !== null,
    )
    .sort((left, right) => {
      if (left.scope === "county_exact" && right.scope !== "county_exact") {
        return -1;
      }

      if (right.scope === "county_exact" && left.scope !== "county_exact") {
        return 1;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.domain.localeCompare(right.domain);
    })
    .slice(0, 12);

  return {
    stateFips,

    stateCode: state.state,

    stateName: state.stateName,

    countyGeoid,

    countyName: countyMatch?.name,

    saleType,

    discoveryTerms: [...profile.authoritySignals, ...profile.terms],

    candidates,

    legalRulesResolved: false,

    message:
      candidates.length > 0
        ? "Exact target-county and strongly relevant statewide government sources discovered. Other counties, federal agencies and weak generic matches were excluded. No legal rule has been inferred or approved."
        : "No trusted source candidate met the discovery requirements. Jurisdiction research remains blocked pending additional official-source discovery.",
  };
}
