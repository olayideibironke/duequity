import "server-only";

import { createHash } from "node:crypto";

import type { SaleType, StateCode, SurplusCustodian } from "@/domain/types";

import { loadNationalGeography } from "@/server/geography-resolver";

import {
  discoverJurisdictionSources,
  type JurisdictionSourceCandidate,
} from "@/server/jurisdiction-source-discovery";

import { fetchPublicRecordSourcePayload } from "@/server/public-record-source-fetcher";

import {
  looksLikeArcGisEndpoint,
  toIngestionFailure,
  type PublicRecordIngestionFailureReason,
} from "@/server/public-record-source-family";

import {
  PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY,
  parsePublicRecordSourcePayload,
} from "@/server/public-record-source-parser";

import {
  resolvePublicRecordSource,
  type PublicRecordJurisdictionLookup,
  type PublicRecordSourceDefinition,
  type PublicRecordSourceFormat,
} from "@/server/public-record-source-registry";

/**
 * NATIONAL AUTOMATIC PUBLIC-RECORD SOURCE DISCOVERY
 *
 * Trust chain:
 *
 *   official government-domain registry
 *      ↓
 *   canonical county website redirects
 *      ↓
 *   county-owned pages and sitemaps
 *      ↓
 *   directly linked separately-managed public authority
 *      ↓
 *   surplus / excess-funds procedure page
 *      ↓
 *   downloadable PDF / CSV / XLSX / HTML dataset
 *      ↓
 *   existing generic parser validation
 *
 * External authority trust:
 *
 *   1. linked from an already-trusted county website
 *   2. target page identifies the target county
 *   3. target page identifies a relevant public authority
 *
 * One external authority hop only.
 */

/* ========================================================================== */
/* Limits                                                                      */
/* ========================================================================== */

const REQUEST_TIMEOUT_MS = 12_000;

const MAX_DOMAINS = 6;

const MAX_SITEMAPS_PER_SITE = 8;

const MAX_SITEMAP_URLS = 8_000;

const MAX_SOURCE_CANDIDATES_PER_SITE = 40;

const MAX_EXPLORATION_PAGES_PER_SITE = 16;

const MAX_AUTHORITY_LINKS_PER_COUNTY = 10;

const MAX_VALIDATION_ATTEMPTS_PER_DOMAIN = 18;

const MAX_CHILD_DATASET_LINKS = 16;

const MAX_HTML_BYTES = 2_500_000;

const MAX_INDEX_BYTES = 6_000_000;

/* ========================================================================== */
/* Discovery sale types                                                        */
/* ========================================================================== */

const DISCOVERY_SALE_TYPES: readonly SaleType[] = [
  "tax_lien_foreclosure",
  "tax_deed_sale",
  "sheriff_sale",
  "judicial_foreclosure",
  "nonjudicial_foreclosure",
  "trustee_sale",
  "municipal_lien_foreclosure",
  "hoa_foreclosure",
  "partition_sale",
];

/* ========================================================================== */
/* Internal types                                                              */
/* ========================================================================== */

interface ResolvedJurisdiction {
  state: StateCode;

  stateFips: string;

  stateName: string;

  countyName: string;

  countyGeoid: string;
}

interface RankedDomain {
  candidate: JurisdictionSourceCandidate;

  saleTypes: SaleType[];

  score: number;
}

interface SourceCandidate {
  url: string;

  label: string;

  score: number;

  /**
   * Whether explicit surplus/excess-funds relevance was established for this
   * candidate, either from its own text or from the official page that links
   * it.
   *
   * Official-domain status and parser success are not sufficient. Only strongly
   * relevant candidates are eligible to become a jurisdiction's surplus source.
   */
  strong: boolean;

  /**
   * Whether the candidate's own label, filename, or path carries the surplus
   * vocabulary, as opposed to inheriting it from the linking page.
   *
   * Own relevance plus a concrete document format is treated as a confident
   * find and allows the bounded crawl to stop early.
   */
  ownStrong: boolean;

  trustedDomain: string;

  agencyName?: string;

  format?: PublicRecordSourceFormat;
}

interface AuthorityLinkCandidate {
  url: string;

  label: string;

  score: number;
}

interface ValidatedAuthority {
  domain: string;

  baseUrl: string;

  agencyName: string;
}

interface SiteCrawlResult {
  candidates: SourceCandidate[];

  authorityLinks: AuthorityLinkCandidate[];
}

interface RetrievedText {
  finalUrl: string;

  text: string;

  contentType: string;

  contentDisposition: string;
}

/* ========================================================================== */
/* Cache                                                                       */
/* ========================================================================== */

const resolvedSourceCache = new Map<string, PublicRecordSourceDefinition>();

/* ========================================================================== */
/* Text helpers                                                                */
/* ========================================================================== */

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, "");
}

/**
 * Percent-decode a URL path or query before relevance matching.
 *
 * Government document URLs routinely encode spaces, so a filename such as
 * "Tax%20Sale%20Proceeds.xlsx" would otherwise normalize to
 * "tax 20 sale 20 proceeds" and never match a surplus phrase.
 */
function decodeUrlText(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function normalizeCounty(value: string): string {
  return normalizeText(value)
    .replace(/\bcounty\b/g, "")
    .replace(/\bparish\b/g, "")
    .replace(/\bborough\b/g, "")
    .replace(/\bcensus area\b/g, "")
    .replace(/\bmunicipality\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;|&#160;/gi, " ");
}

function cleanAnchorLabel(value: string): string {
  return decodeBasicEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTitle(html: string): string | undefined {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  if (!match) {
    return undefined;
  }

  const title = cleanAnchorLabel(match[1]);

  return title || undefined;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function uniqueByUrl<
  T extends {
    url: string;
  },
>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.url, value])).values()];
}

/* ========================================================================== */
/* Geography                                                                   */
/* ========================================================================== */

async function resolveJurisdiction(
  lookup: PublicRecordJurisdictionLookup,
): Promise<ResolvedJurisdiction | undefined> {
  const geography = await loadNationalGeography();

  const stateInput = lookup.state.trim().toUpperCase();

  const state = geography.states.find(
    (candidate) =>
      candidate.postalCode === stateInput ||
      candidate.name.toUpperCase() === stateInput ||
      candidate.stateFips === stateInput,
  );

  if (!state) {
    return undefined;
  }

  const countyGeoid = lookup.countyGeoid?.trim();

  const county = countyGeoid
    ? state.counties.find((candidate) => candidate.geoid === countyGeoid)
    : state.counties.find(
        (candidate) =>
          normalizeCounty(candidate.name) ===
          normalizeCounty(lookup.county ?? ""),
      );

  if (!county) {
    return undefined;
  }

  return {
    state: state.postalCode as StateCode,

    stateFips: state.stateFips,

    stateName: state.name,

    countyName: county.name,

    countyGeoid: county.geoid,
  };
}

/* ========================================================================== */
/* URL helpers                                                                 */
/* ========================================================================== */

function normalizedHost(hostname: string): string {
  const host = hostname.trim().toLowerCase();

  return host.startsWith("www.") ? host.slice(4) : host;
}

function urlBelongsToDomain(url: URL, domain: string): boolean {
  const host = normalizedHost(url.hostname);

  const trusted = normalizedHost(domain);

  return host === trusted || host.endsWith(`.${trusted}`);
}

function urlBelongsToTrustedDomains(
  url: URL,
  trustedDomains: Iterable<string>,
): boolean {
  for (const domain of trustedDomains) {
    if (urlBelongsToDomain(url, domain)) {
      return true;
    }
  }

  return false;
}

function normalizeHttpsUrl(raw: string, base: string): URL | undefined {
  let url: URL;

  try {
    url = new URL(decodeBasicEntities(raw), base);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:") {
    return undefined;
  }

  url.hash = "";

  return url;
}

function normalizeTrustedUrl(
  raw: string,
  base: string,
  trustedDomains: Iterable<string>,
): URL | undefined {
  const url = normalizeHttpsUrl(raw, base);

  if (!url) {
    return undefined;
  }

  if (!urlBelongsToTrustedDomains(url, trustedDomains)) {
    return undefined;
  }

  return url;
}

function rootUrls(candidate: JurisdictionSourceCandidate): string[] {
  const roots = new Set<string>();

  try {
    const supplied = new URL(candidate.baseUrl);

    supplied.protocol = "https:";

    supplied.pathname = "/";

    supplied.search = "";

    supplied.hash = "";

    roots.add(supplied.toString());
  } catch {
    // Ignore malformed registry URL.
  }

  const domain = normalizedHost(candidate.domain);

  roots.add(`https://${domain}/`);

  roots.add(`https://www.${domain}/`);

  return [...roots];
}

function originRoot(value: string): string | undefined {
  try {
    const url = new URL(value);

    return `${url.origin}/`;
  } catch {
    return undefined;
  }
}

/* ========================================================================== */
/* HTTP                                                                        */
/* ========================================================================== */

/**
 * Release a response body that will not be used.
 *
 * The body is drained rather than cancelled. Both release the connection, but
 * cancelling leaves Node's HTTP parser paused, and the runtime then asserts
 * when the server closes the socket — crashing the process instead of failing
 * one request. Draining leaves the parser in a clean state.
 *
 * Discovery rejects many responses without using them, so every such path must
 * release the body explicitly.
 */
async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    // The body may already be released or the connection already closed.
  }
}

/**
 * Read a response body with a streaming byte cap and a graceful deadline.
 *
 * Aborting the request signal while the body is still streaming leaves the
 * socket's HTTP parser paused and makes Node assert, taking down the process.
 * Cancelling the reader is the graceful equivalent, and enforcing the cap while
 * streaming means an oversized page is abandoned rather than fully downloaded
 * and then rejected.
 */
async function readCappedText(
  response: Response,
  description: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<string> {
  const body = response.body;

  if (!body) {
    return "";
  }

  const reader = body.getReader();

  const decoder = new TextDecoder("utf-8");

  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  let received = 0;

  let text = "";

  let completed = false;

  try {
    for (;;) {
      const result = await Promise.race([reader.read(), deadline]);

      if (result === "timeout") {
        throw new Error(`${description} timed out while being read.`);
      }

      if (result.done) {
        completed = true;

        break;
      }

      const chunk = result.value;

      if (!chunk) {
        continue;
      }

      received += chunk.byteLength;

      if (received > maxBytes) {
        throw new Error(
          `${description} exceeded the DueQuity discovery size limit.`,
        );
      }

      text += decoder.decode(chunk, {
        stream: true,
      });
    }

    return text + decoder.decode();
  } finally {
    if (timer) {
      clearTimeout(timer);
    }

    /*
     * Only cancel when the read loop exited early. Cancelling a completed
     * stream is unnecessary, and cancelling pauses the HTTP parser, which the
     * runtime asserts on if the server then closes the socket.
     */
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // The stream may already be closed.
      }
    }
  }
}

async function retrieveText(
  url: string,
  maxBytes: number,
): Promise<RetrievedText> {
  const controller = new AbortController();

  /*
   * The abort signal covers only the request/headers phase. Once headers are
   * in, the body is bounded by readCappedText() instead, which cancels rather
   * than aborting the socket.
   */
  const headerTimeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",

      redirect: "follow",

      cache: "no-store",

      signal: controller.signal,

      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5",

        "User-Agent": "DueQuity Official Public Record Research",
      },
    });
  } finally {
    clearTimeout(headerTimeout);
  }

  if (!response.ok) {
    await discardResponseBody(response);

    throw new Error(`${url} returned HTTP ${response.status}.`);
  }

  const finalUrl = response.url || url;

  const lengthHeader = response.headers.get("content-length");

  if (lengthHeader) {
    const size = Number(lengthHeader);

    if (Number.isFinite(size) && size > maxBytes) {
      await discardResponseBody(response);

      throw new Error(
        `${finalUrl} exceeded the DueQuity discovery size limit.`,
      );
    }
  }

  const text = await readCappedText(
    response,
    finalUrl,
    maxBytes,
    REQUEST_TIMEOUT_MS,
  );

  return {
    finalUrl,

    text,

    contentType: response.headers.get("content-type")?.toLowerCase() ?? "",

    contentDisposition:
      response.headers.get("content-disposition")?.toLowerCase() ?? "",
  };
}

async function fetchTrustedText(
  url: string,
  trustedDomains: Iterable<string>,
  maxBytes: number,
): Promise<RetrievedText> {
  const resource = await retrieveText(url, maxBytes);

  const final = new URL(resource.finalUrl);

  if (!urlBelongsToTrustedDomains(final, trustedDomains)) {
    throw new Error(
      `${url} redirected outside the trusted public-authority domain set.`,
    );
  }

  return resource;
}

function countyIdentityMatches(value: string, countyName: string): boolean {
  const text = normalizeText(value);

  const countyTokens = normalizeCounty(countyName)
    .split(" ")
    .filter((token) => token.length > 2);

  if (countyTokens.length === 0) {
    return false;
  }

  return countyTokens.every((token) => text.includes(token));
}

function canonicalCountyPageLooksValid(
  resource: RetrievedText,
  countyName: string,
  organizationName: string,
): boolean {
  const value = normalizeText(
    [
      resource.finalUrl,
      htmlTitle(resource.text) ?? "",
      resource.text.slice(0, 250_000),
      organizationName,
    ].join(" "),
  );

  if (!countyIdentityMatches(value, countyName)) {
    return false;
  }

  return [
    "county government",
    "official site",
    "board of commissioners",
    "government",
    "county administration",
  ].some((term) => value.includes(normalizeText(term)));
}

async function fetchCountyRootAndAdoptCanonicalDomain({
  url,
  trustedDomains,
  countyName,
  organizationName,
}: {
  url: string;

  trustedDomains: Set<string>;

  countyName: string;

  organizationName: string;
}): Promise<RetrievedText> {
  const resource = await retrieveText(url, MAX_HTML_BYTES);

  const finalUrl = new URL(resource.finalUrl);

  if (urlBelongsToTrustedDomains(finalUrl, trustedDomains)) {
    return resource;
  }

  if (!canonicalCountyPageLooksValid(resource, countyName, organizationName)) {
    throw new Error(
      `${url} redirected to a hostname that could not be verified as the target county's canonical government website.`,
    );
  }

  trustedDomains.add(normalizedHost(finalUrl.hostname));

  return resource;
}

/* ========================================================================== */
/* Discovery terminology                                                       */
/* ========================================================================== */

/**
 * SURPLUS-RECOVERY RELEVANCE VOCABULARY
 *
 * Strong phrases identify a document or page as surplus/excess-funds material.
 * Only strong relevance — established either from a candidate's own text or
 * from the official page that links it — makes a candidate eligible.
 */
const STRONG_SOURCE_TERMS = [
  "excess funds",
  "excess fund",
  "excess proceeds",
  "excess proceed",
  "surplus funds",
  "surplus fund",
  "surplus proceeds",
  "surplus proceed",
  "excess bid",
  "excess bids",
  "tax sale surplus",
  "tax sale excess",
  "tax sale overage",
  "tax sale overages",
  "tax sale proceeds",
  "tax deed surplus",
  "sheriff excess funds",
  "sheriffs excess funds",
  "sheriff sale surplus",
  "foreclosure surplus",
  "unclaimed tax sale proceeds",
  "unclaimed surplus",
  "unclaimed excess",
  "overbid",
  "overbids",
  "overage",
  "overages",
  "overplus",
  "surplus list",
  "excess funds list",
  "excess proceeds list",
  "sold properties and excess proceeds",
  "notice of excess proceeds",
];

/**
 * Contextual terms. These sharpen ranking between already-relevant candidates
 * but never establish relevance on their own, so an accumulation of generic
 * tax vocabulary cannot promote an unrelated official document.
 */
const SUPPORTING_SOURCE_TERMS = [
  "tax sale",
  "tax deed",
  "delinquent tax",
  "foreclosure",
  "sheriff sale",
  "trustee sale",
  "unclaimed funds",
  "unclaimed money",
  "property tax",
  "tax commissioner",
  "tax collector",
  "treasurer",
  "district clerk",
  "auditor",
  "revenue",
  "proceeds",
  "surplus",
  "excess",
  "list",
  "listing",
];

const SUPPORTING_SCORE_CAP = 24;

/**
 * Document classes that are official but are not surplus record sources.
 *
 * A match here disqualifies the candidate outright. Field testing showed that
 * without this an unsecured-property-tax insert, a certificate-of-obligation
 * notice, and a state auditor peer opinion could all be selected as a county's
 * surplus source purely because they were official PDFs that happened to rank.
 */
const NEGATIVE_SOURCE_TERMS = [
  "annual report",
  "annual financial",
  "comprehensive annual",
  "acfr",
  "cafr",
  "financial statement",
  "financial statements",
  "financial report",
  "audit report",
  "audited",
  "peer opinion",
  "peer review",
  "single audit",
  "budget",
  "appropriation",
  "tax rate",
  "tax rates",
  "millage",
  "levy notice",
  "certificate of obligation",
  "certificates of obligation",
  "certofobligation",
  "bond",
  "bonds",
  "debt service",
  "insert",
  "newsletter",
  "brochure",
  "advertisement",
  "advertising",
  "legal notice",
  "notice of sale",
  "notice of tax sale",
  "sale advertisement",
  "bidder registration",
  "terms and conditions",
  "claim form",
  "application form",
  "affidavit",
  "instructions",
  "frequently asked",
  "faq",
  "statute",
  "ordinance",
  "rules",
  "policy",
  "meeting",
  "agenda",
  "packet",
  "minutes",
  "press release",
  "news",
  "calendar",
  "salary",
  "payroll",
  "unsecured property tax",
];

/**
 * Human-readable authority phrases.
 */
const AUTHORITY_TERMS = [
  "tax commissioner",
  "tax collector",
  "county treasurer",
  "treasurer",
  "tax office",
  "taxation",
  "revenue commissioner",
  "revenue office",
  "delinquent tax",
  "property tax",
  "sheriff",
  "clerk of court",
  "clerk of courts",
  "finance department",
  "finance office",
];

/**
 * Compact forms intentionally support hostnames and URL slugs where the
 * authority name is concatenated.
 *
 * Examples:
 *
 *   gwinnetttaxcommissioner.com
 *   countytreasurer.gov
 *   propertytax.example.gov
 *
 * These are candidate signals only. The destination must still independently
 * pass county + authority validation before it becomes trusted.
 */
const AUTHORITY_COMPACT_TERMS = [
  "taxcommissioner",
  "taxcollector",
  "countytreasurer",
  "treasurer",
  "taxoffice",
  "taxation",
  "revenuecommissioner",
  "revenueoffice",
  "delinquenttax",
  "propertytax",
  "sheriff",
  "clerkofcourt",
  "clerkofcourts",
  "financedepartment",
  "financeoffice",
];

const EXPLORATION_TERMS = [
  "tax",
  "property tax",
  "delinquent",
  "finance",
  "revenue",
  "treasurer",
  "collector",
  "commissioner",
  "sheriff",
  "clerk",
  "surplus",
  "excess",
  "foreclosure",
  "property",
];

const DATASET_LINK_TERMS = [
  "download list",
  "download",
  "current listing",
  "current list",
  "view list",
  "list here",
  "spreadsheet",
  "excel",
  "csv",
  "xlsx",
  "pdf",
  "excess funds",
  "surplus",
  "records",
];

/* ========================================================================== */
/* Candidate scoring                                                           */
/* ========================================================================== */

/**
 * Whole-phrase relevance matching.
 *
 * Substring matching is unsafe for this vocabulary: "overage" occurs inside
 * "coverage", which is enough to misclassify an unrelated benefits page as a
 * surplus source. Matching is therefore anchored on word boundaries.
 *
 * A separator-free pass is still applied to sufficiently long phrases, because
 * government filenames concatenate words ("ExcessFunds2024.pdf",
 * "NoticeCertofObligation2019.pdf") and carry no boundaries at all.
 */
const COMPACT_MATCH_MIN_LENGTH = 10;

function matchesRelevanceTerm(
  padded: string,
  compact: string,
  term: string,
): boolean {
  const normalizedTerm = normalizeText(term);

  if (!normalizedTerm) {
    return false;
  }

  if (padded.includes(` ${normalizedTerm} `)) {
    return true;
  }

  const compactTerm = normalizedTerm.replace(/\s+/g, "");

  return (
    compactTerm.length >= COMPACT_MATCH_MIN_LENGTH &&
    compact.includes(compactTerm)
  );
}

interface SurplusRelevance {
  score: number;

  /**
   * An explicit surplus/excess-funds phrase was present.
   */
  strong: boolean;

  /**
   * The text identifies a document class that is never a surplus source.
   */
  disqualified: boolean;
}

/**
 * Measure surplus-recovery relevance for any candidate text.
 *
 * The file extension deliberately carries no admission weight. Awarding points
 * for ".pdf" alone is what allowed arbitrary official documents to enter the
 * candidate set.
 */
export function surplusRelevance(value: string): SurplusRelevance {
  const padded = ` ${normalizeText(value)} `;

  const compact = compactText(value);

  let score = 0;

  let strong = false;

  let disqualified = false;

  for (const term of STRONG_SOURCE_TERMS) {
    if (matchesRelevanceTerm(padded, compact, term)) {
      score += 100;

      strong = true;
    }
  }

  let supporting = 0;

  for (const term of SUPPORTING_SOURCE_TERMS) {
    if (matchesRelevanceTerm(padded, compact, term)) {
      supporting += 8;
    }
  }

  score += Math.min(supporting, SUPPORTING_SCORE_CAP);

  for (const term of NEGATIVE_SOURCE_TERMS) {
    if (matchesRelevanceTerm(padded, compact, term)) {
      score -= 90;

      disqualified = true;
    }
  }

  return {
    score,

    strong,

    disqualified,
  };
}

/**
 * Whether a link points at something that could hold records, as opposed to
 * another navigation page.
 *
 * Used together with inherited page relevance so a generically named document
 * linked from a surplus page still ranks strongly.
 */
function looksLikeDatasetLink(url: string, ownText: string): boolean {
  if (formatFromUrl(url)) {
    return true;
  }

  const normalized = normalizeText(ownText);

  return DATASET_LINK_TERMS.some((term) =>
    normalized.includes(normalizeText(term)),
  );
}

function explorationPageScore(value: string): number {
  const padded = ` ${normalizeText(value)} `;

  const compact = compactText(value);

  let score = 0;

  /*
   * A page whose own title or path names surplus material is the page most
   * worth opening. Without this weighting a county's excess-funds page competes
   * on equal footing with every other page containing the word "tax" and can
   * fall outside the bounded exploration budget.
   */
  for (const term of STRONG_SOURCE_TERMS) {
    if (matchesRelevanceTerm(padded, compact, term)) {
      score += 90;
    }
  }

  for (const term of EXPLORATION_TERMS) {
    if (matchesRelevanceTerm(padded, compact, term)) {
      score += 10;
    }
  }

  for (const term of NEGATIVE_SOURCE_TERMS) {
    if (matchesRelevanceTerm(padded, compact, term)) {
      score -= 40;
    }
  }

  return score;
}

function authorityLinkScore(value: string): number {
  const normalized = normalizeText(value);

  const compact = compactText(value);

  let score = 0;

  let phraseMatched = false;

  for (const term of AUTHORITY_TERMS) {
    if (normalized.includes(normalizeText(term))) {
      score += 35;

      phraseMatched = true;
    }
  }

  /*
   * Hostnames often concatenate words:
   *
   *   taxcommissioner
   *   taxcollector
   *   countytreasurer
   *
   * Recognize those forms without weakening the validation boundary.
   */
  if (!phraseMatched) {
    for (const term of AUTHORITY_COMPACT_TERMS) {
      if (compact.includes(term)) {
        score += 35;

        break;
      }
    }
  }

  if (normalized.includes("county")) {
    score += 8;
  }

  return score;
}

function childDatasetScore(value: string, parent: SourceCandidate): number {
  const normalized = normalizeText(value);

  let score = Math.max(parent.score, 1);

  for (const term of DATASET_LINK_TERMS) {
    if (normalized.includes(normalizeText(term))) {
      score += 25;
    }
  }

  score += Math.max(0, surplusRelevance(value).score);

  return score;
}

/* ========================================================================== */
/* Format detection                                                            */
/* ========================================================================== */

function formatFromUrl(url: string): PublicRecordSourceFormat | undefined {
  /*
   * ArcGIS REST layers are recognized from their service path, before any
   * extension check, because they carry no file extension at all.
   */
  if (looksLikeArcGisEndpoint(url)) {
    return "arcgis";
  }

  let pathname: string;

  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return undefined;
  }

  if (pathname.endsWith(".pdf")) {
    return "pdf_table";
  }

  if (pathname.endsWith(".csv") || pathname.endsWith(".tsv")) {
    return "csv";
  }

  if (
    pathname.endsWith(".xlsx") ||
    pathname.endsWith(".xlsm") ||
    pathname.endsWith(".xls")
  ) {
    return "xlsx";
  }

  if (pathname.endsWith(".json") || pathname.endsWith(".geojson")) {
    return "json_api";
  }

  return undefined;
}

function formatFromContentType(
  contentType: string,
): PublicRecordSourceFormat | undefined {
  const type = contentType.toLowerCase();

  if (type.includes("application/pdf")) {
    return "pdf_table";
  }

  if (type.includes("text/csv") || type.includes("application/csv")) {
    return "csv";
  }

  if (
    type.includes("spreadsheetml") ||
    type.includes("application/vnd.ms-excel")
  ) {
    return "xlsx";
  }

  if (type.includes("application/json") || type.includes("text/json")) {
    return "json_api";
  }

  if (type.includes("text/html") || type.includes("application/xhtml")) {
    return "html_table";
  }

  return undefined;
}

function formatFromContentDisposition(
  contentDisposition: string,
): PublicRecordSourceFormat | undefined {
  const value = contentDisposition.toLowerCase();

  if (/\.pdf\b/.test(value)) {
    return "pdf_table";
  }

  if (/\.csv\b/.test(value)) {
    return "csv";
  }

  if (/\.(xlsx|xls)\b/.test(value)) {
    return "xlsx";
  }

  if (/\.json\b/.test(value)) {
    return "json_api";
  }

  return undefined;
}

async function probeCandidateFormat(
  url: string,
  trustedDomain: string,
): Promise<PublicRecordSourceFormat | undefined> {
  const fromUrl = formatFromUrl(url);

  if (fromUrl) {
    return fromUrl;
  }

  const controller = new AbortController();

  let timeout: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  const clearHeaderTimeout = (): void => {
    if (timeout) {
      clearTimeout(timeout);

      timeout = undefined;
    }
  };

  try {
    const response = await fetch(url, {
      method: "GET",

      redirect: "follow",

      cache: "no-store",

      signal: controller.signal,

      headers: {
        Accept: "*/*",

        "User-Agent": "DueQuity Official Public Record Research",
      },
    });

    /*
     * Only headers are needed here. Disarm the abort before touching the body,
     * because aborting a response that is being released makes Node assert.
     */
    clearHeaderTimeout();

    if (!response.ok) {
      await discardResponseBody(response);

      return undefined;
    }

    const final = new URL(response.url || url);

    if (!urlBelongsToDomain(final, trustedDomain)) {
      await discardResponseBody(response);

      return undefined;
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";

    const contentDisposition =
      response.headers.get("content-disposition")?.toLowerCase() ?? "";

    const format =
      formatFromContentType(contentType) ??
      formatFromContentDisposition(contentDisposition) ??
      formatFromUrl(final.toString());

    await discardResponseBody(response);

    return format;
  } catch {
    return undefined;
  } finally {
    clearHeaderTimeout();
  }
}

/* ========================================================================== */
/* Robots / sitemap                                                            */
/* ========================================================================== */

function robotsSitemaps(
  text: string,
  baseUrl: string,
  trustedDomains: Iterable<string>,
): string[] {
  const results = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(.+?)\s*$/i);

    if (!match) {
      continue;
    }

    const url = normalizeTrustedUrl(match[1], baseUrl, trustedDomains);

    if (url) {
      results.add(url.toString());
    }
  }

  return [...results];
}

function sitemapLocations(xml: string): string[] {
  const results: string[] = [];

  const pattern = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;

  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) && results.length < MAX_SITEMAP_URLS) {
    const value = decodeBasicEntities(
      match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
    );

    if (value) {
      results.push(value);
    }
  }

  return results;
}

function looksLikeSitemap(url: URL): boolean {
  const path = url.pathname.toLowerCase();

  return path.endsWith(".xml") || path.includes("sitemap");
}

/* ========================================================================== */
/* HTML links                                                                  */
/* ========================================================================== */

interface DocumentHeading {
  index: number;

  text: string;
}

/**
 * Collect heading positions so each anchor can inherit the section it sits in.
 */
function documentHeadings(html: string): DocumentHeading[] {
  const headings: DocumentHeading[] = [];

  const pattern = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi;

  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const text = cleanAnchorLabel(match[1] ?? "");

    if (text) {
      headings.push({
        index: match.index,

        text,
      });
    }
  }

  return headings;
}

function nearestHeading(
  headings: readonly DocumentHeading[],
  position: number,
): string {
  let nearest = "";

  for (const heading of headings) {
    if (heading.index > position) {
      break;
    }

    nearest = heading.text;
  }

  return nearest;
}

function htmlSourceLinks(
  html: string,
  pageUrl: string,
  trustedDomains: Iterable<string>,
  agencyName?: string,
): SourceCandidate[] {
  const candidates: SourceCandidate[] = [];

  const headings = documentHeadings(html);

  const pageTitle = htmlTitle(html) ?? "";

  const pagePath = (() => {
    try {
      const parsed = new URL(pageUrl);

      return decodeUrlText(`${parsed.pathname} ${parsed.search}`);
    } catch {
      return "";
    }
  })();

  /*
   * Relevance established by the linking page itself. An official page titled
   * "Notice of Excess Proceeds" or a section headed "Sheriff's Excess Funds
   * List" qualifies the documents it publishes, which is how a generically
   * named file still ranks strongly.
   */
  const pageContext = [pageTitle, pagePath].join(" ");

  const pageRelevance = surplusRelevance(pageContext);

  const anchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";

    const label = cleanAnchorLabel(match[4] ?? "");

    const url = normalizeTrustedUrl(href, pageUrl, trustedDomains);

    if (!url) {
      continue;
    }

    const heading = nearestHeading(headings, match.index);

    const ownText = [
      label,
      decodeUrlText(`${url.pathname} ${url.search}`),
    ].join(" ");

    const ownRelevance = surplusRelevance(ownText);

    if (ownRelevance.disqualified) {
      continue;
    }

    const headingRelevance = surplusRelevance(heading);

    if (headingRelevance.disqualified) {
      continue;
    }

    const contextStrong = headingRelevance.strong || pageRelevance.strong;

    /*
     * Own surplus vocabulary qualifies a candidate outright. Inherited page or
     * section relevance qualifies it only when the link actually points at a
     * document or dataset, so navigation and boilerplate links on a surplus
     * page are not promoted.
     */
    const eligible =
      ownRelevance.strong ||
      (contextStrong && looksLikeDatasetLink(url.toString(), ownText));

    if (!eligible) {
      continue;
    }

    let score = Math.max(ownRelevance.score, 0);

    if (contextStrong) {
      score += headingRelevance.strong ? 80 : 60;
    }

    if (formatFromUrl(url.toString())) {
      score += 20;
    }

    candidates.push({
      url: url.toString(),

      label: label || heading,

      score,

      strong: true,

      ownStrong: ownRelevance.strong,

      trustedDomain: normalizedHost(url.hostname),

      agencyName,

      format: formatFromUrl(url.toString()),
    });
  }

  return candidates;
}

/**
 * Same-domain navigation links worth opening in search of a surplus list.
 *
 * Exploration previously depended entirely on sitemaps. Many county and office
 * sites publish no usable sitemap, so the excess-funds page was unreachable
 * even though it was two clicks from the front page.
 */
function htmlExplorationLinks(
  html: string,
  pageUrl: string,
  trustedDomains: Iterable<string>,
): Array<{
  url: string;

  score: number;
}> {
  const links: Array<{
    url: string;

    score: number;
  }> = [];

  const headings = documentHeadings(html);

  const anchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";

    const label = cleanAnchorLabel(match[4] ?? "");

    const url = normalizeTrustedUrl(href, pageUrl, trustedDomains);

    if (!url) {
      continue;
    }

    /*
     * Documents are source candidates, not exploration targets.
     */
    if (formatFromUrl(url.toString())) {
      continue;
    }

    const value = [
      label,
      decodeUrlText(`${url.pathname} ${url.search}`),
      nearestHeading(headings, match.index),
    ].join(" ");

    const score = explorationPageScore(value);

    if (score <= 0) {
      continue;
    }

    links.push({
      url: url.toString(),

      score,
    });
  }

  return links;
}

function htmlAuthorityLinks(
  html: string,
  pageUrl: string,
  trustedDomains: Iterable<string>,
): AuthorityLinkCandidate[] {
  const candidates: AuthorityLinkCandidate[] = [];

  const anchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";

    const label = cleanAnchorLabel(match[4] ?? "");

    const url = normalizeHttpsUrl(href, pageUrl);

    if (!url) {
      continue;
    }

    if (urlBelongsToTrustedDomains(url, trustedDomains)) {
      continue;
    }

    const value = [label, url.hostname, url.pathname].join(" ");

    const score = authorityLinkScore(value);

    if (score <= 0) {
      continue;
    }

    candidates.push({
      url: url.toString(),

      label,

      score,
    });
  }

  return uniqueByUrl(candidates)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_AUTHORITY_LINKS_PER_COUNTY);
}

/* ========================================================================== */
/* Ranked government domains                                                   */
/* ========================================================================== */

async function rankedDomains({
  stateFips,
  countyGeoid,
}: {
  stateFips: string;

  countyGeoid: string;
}): Promise<RankedDomain[]> {
  const domains = new Map<string, RankedDomain>();

  for (const saleType of DISCOVERY_SALE_TYPES) {
    const discovery = await discoverJurisdictionSources({
      stateFips,

      countyGeoid,

      saleType,
    });

    for (const candidate of discovery.candidates) {
      const key = normalizedHost(candidate.domain);

      const existing = domains.get(key);

      if (existing) {
        if (!existing.saleTypes.includes(saleType)) {
          existing.saleTypes.push(saleType);
        }

        existing.score = Math.max(existing.score, candidate.score);

        if (candidate.score > existing.candidate.score) {
          existing.candidate = candidate;
        }

        continue;
      }

      domains.set(key, {
        candidate,

        saleTypes: [saleType],

        score: candidate.score,
      });
    }
  }

  return [...domains.values()]
    .sort((left, right) => {
      if (left.candidate.scope !== right.candidate.scope) {
        return left.candidate.scope === "county_exact" ? -1 : 1;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.candidate.domain.localeCompare(right.candidate.domain);
    })
    .slice(0, MAX_DOMAINS);
}

/* ========================================================================== */
/* Generic trusted-site crawl                                                  */
/* ========================================================================== */

async function crawlTrustedSite({
  seedUrls,
  trustedDomains,
  countyName,
  agencyName,
  allowAuthorityDiscovery,
}: {
  seedUrls: string[];

  trustedDomains: Set<string>;

  countyName: string;

  agencyName: string;

  allowAuthorityDiscovery: boolean;
}): Promise<SiteCrawlResult> {
  const sourceCandidates = new Map<string, SourceCandidate>();

  const authorityCandidates = new Map<string, AuthorityLinkCandidate>();

  const explorationPages = new Map<string, number>();

  const sitemapQueue: string[] = [];

  const queuedSitemaps = new Set<string>();

  const visitedSitemaps = new Set<string>();

  function addSourceCandidate(candidate: SourceCandidate) {
    const existing = sourceCandidates.get(candidate.url);

    if (!existing || candidate.score > existing.score) {
      sourceCandidates.set(candidate.url, candidate);
    }
  }

  function addAuthorityCandidate(candidate: AuthorityLinkCandidate) {
    const existing = authorityCandidates.get(candidate.url);

    if (!existing || candidate.score > existing.score) {
      authorityCandidates.set(candidate.url, candidate);
    }
  }

  function addExplorationPage(url: string, score: number) {
    if (score <= 0) {
      return;
    }

    const existing = explorationPages.get(url) ?? 0;

    if (score > existing) {
      explorationPages.set(url, score);
    }
  }

  function queueSitemap(value: string) {
    if (queuedSitemaps.has(value)) {
      return;
    }

    queuedSitemaps.add(value);

    sitemapQueue.push(value);
  }

  for (const seedUrl of uniqueByUrl(
    seedUrls.map((url) => ({
      url,
    })),
  ).map((item) => item.url)) {
    const root = originRoot(seedUrl);

    if (root) {
      queueSitemap(`${root}sitemap.xml`);

      queueSitemap(`${root}sitemap_index.xml`);

      try {
        const robots = await fetchTrustedText(
          `${root}robots.txt`,
          trustedDomains,
          MAX_INDEX_BYTES,
        );

        for (const sitemap of robotsSitemaps(
          robots.text,
          robots.finalUrl,
          trustedDomains,
        )) {
          queueSitemap(sitemap);
        }
      } catch {
        // robots.txt is optional.
      }
    }

    try {
      const page = await fetchTrustedText(
        seedUrl,
        trustedDomains,
        MAX_HTML_BYTES,
      );

      for (const link of htmlSourceLinks(
        page.text,
        page.finalUrl,
        trustedDomains,
        agencyName,
      )) {
        addSourceCandidate(link);
      }

      for (const link of htmlExplorationLinks(
        page.text,
        page.finalUrl,
        trustedDomains,
      )) {
        addExplorationPage(link.url, link.score);
      }

      if (allowAuthorityDiscovery) {
        for (const authority of htmlAuthorityLinks(
          page.text,
          page.finalUrl,
          trustedDomains,
        )) {
          addAuthorityCandidate(authority);
        }
      }
    } catch {
      // Continue with other seeds.
    }
  }

  while (
    sitemapQueue.length > 0 &&
    visitedSitemaps.size < MAX_SITEMAPS_PER_SITE
  ) {
    const sitemapUrl = sitemapQueue.shift();

    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) {
      continue;
    }

    visitedSitemaps.add(sitemapUrl);

    let sitemap: RetrievedText;

    try {
      sitemap = await fetchTrustedText(
        sitemapUrl,
        trustedDomains,
        MAX_INDEX_BYTES,
      );
    } catch {
      continue;
    }

    for (const rawLocation of sitemapLocations(sitemap.text)) {
      const url = normalizeTrustedUrl(
        rawLocation,
        sitemap.finalUrl,
        trustedDomains,
      );

      if (!url) {
        continue;
      }

      if (looksLikeSitemap(url)) {
        queueSitemap(url.toString());

        continue;
      }

      const value = [
        decodeUrlText(`${url.pathname} ${url.search}`),
        countyName,
      ].join(" ");

      const relevance = surplusRelevance(value);

      /*
       * A sitemap entry has no anchor or heading context, so it must carry
       * explicit surplus vocabulary in its own path to become a candidate.
       */
      if (relevance.strong && !relevance.disqualified) {
        addSourceCandidate({
          url: url.toString(),

          label: "",

          score: relevance.score,

          strong: true,

          ownStrong: true,

          trustedDomain: normalizedHost(url.hostname),

          agencyName,

          format: formatFromUrl(url.toString()),
        });
      }

      const explorationScore = explorationPageScore(value);

      if (explorationScore > 0 && !formatFromUrl(url.toString())) {
        addExplorationPage(url.toString(), explorationScore);
      }
    }
  }

  /*
   * Bounded best-first exploration.
   *
   * The highest-scoring unvisited page is opened next, and the pages it links
   * become new exploration candidates. Surplus vocabulary dominates the
   * exploration score, so the walk heads toward the excess-funds page rather
   * than breadth-first across the site, while the visit budget keeps the crawl
   * bounded exactly as before.
   */
  const visitedExploration = new Set<string>();

  while (visitedExploration.size < MAX_EXPLORATION_PAGES_PER_SITE) {
    let nextUrl: string | undefined;

    let nextScore = 0;

    for (const [url, score] of explorationPages) {
      if (visitedExploration.has(url)) {
        continue;
      }

      if (!nextUrl || score > nextScore) {
        nextUrl = url;

        nextScore = score;
      }
    }

    if (!nextUrl) {
      break;
    }

    visitedExploration.add(nextUrl);

    try {
      const page = await fetchTrustedText(
        nextUrl,
        trustedDomains,
        MAX_HTML_BYTES,
      );

      for (const link of htmlSourceLinks(
        page.text,
        page.finalUrl,
        trustedDomains,
        agencyName,
      )) {
        addSourceCandidate(link);
      }

      for (const link of htmlExplorationLinks(
        page.text,
        page.finalUrl,
        trustedDomains,
      )) {
        addExplorationPage(link.url, link.score);
      }

      if (allowAuthorityDiscovery) {
        for (const authority of htmlAuthorityLinks(
          page.text,
          page.finalUrl,
          trustedDomains,
        )) {
          addAuthorityCandidate(authority);
        }
      }
    } catch {
      // Exploration pages are optional.
    }
  }

  return {
    candidates: [...sourceCandidates.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_SOURCE_CANDIDATES_PER_SITE),

    authorityLinks: [...authorityCandidates.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_AUTHORITY_LINKS_PER_COUNTY),
  };
}

/* ========================================================================== */
/* Authority validation                                                        */
/* ========================================================================== */

function authorityPageLooksValid({
  resource,
  link,
  countyName,
}: {
  resource: RetrievedText;

  link: AuthorityLinkCandidate;

  countyName: string;
}): boolean {
  const rawValue = [
    resource.finalUrl,
    htmlTitle(resource.text) ?? "",
    link.label,
    resource.text.slice(0, 250_000),
  ].join(" ");

  const normalized = normalizeText(rawValue);

  const compact = compactText(rawValue);

  if (!countyIdentityMatches(rawValue, countyName)) {
    return false;
  }

  const phraseMatch = AUTHORITY_TERMS.some((term) =>
    normalized.includes(normalizeText(term)),
  );

  if (phraseMatch) {
    return true;
  }

  return AUTHORITY_COMPACT_TERMS.some((term) => compact.includes(term));
}

async function validateAuthorityLink(
  link: AuthorityLinkCandidate,
  countyName: string,
): Promise<ValidatedAuthority | undefined> {
  let startingUrl: URL;

  try {
    startingUrl = new URL(link.url);
  } catch {
    return undefined;
  }

  const startingDomain = normalizedHost(startingUrl.hostname);

  const trustedDomains = new Set<string>([startingDomain]);

  let resource: RetrievedText;

  try {
    resource = await fetchTrustedText(link.url, trustedDomains, MAX_HTML_BYTES);
  } catch {
    return undefined;
  }

  if (
    !authorityPageLooksValid({
      resource,

      link,

      countyName,
    })
  ) {
    return undefined;
  }

  const final = new URL(resource.finalUrl);

  const domain = normalizedHost(final.hostname);

  const title = htmlTitle(resource.text);

  const agencyName =
    title?.trim() || link.label.trim() || `${countyName} Public Authority`;

  return {
    domain,

    baseUrl: resource.finalUrl,

    agencyName,
  };
}

/* ========================================================================== */
/* Candidate discovery                                                         */
/* ========================================================================== */

async function discoverCandidatesOnDomain(
  ranked: RankedDomain,
  jurisdiction: ResolvedJurisdiction,
): Promise<SourceCandidate[]> {
  const originalDomain = normalizedHost(ranked.candidate.domain);

  const trustedCountyDomains = new Set<string>([originalDomain]);

  const countySeedUrls: string[] = [];

  /*
   * Resolve trusted government-registry aliases to a verified canonical county
   * hostname.
   */
  for (const rootUrl of rootUrls(ranked.candidate)) {
    try {
      const resource = await fetchCountyRootAndAdoptCanonicalDomain({
        url: rootUrl,

        trustedDomains: trustedCountyDomains,

        countyName: jurisdiction.countyName,

        organizationName: ranked.candidate.organizationName,
      });

      countySeedUrls.push(resource.finalUrl);

      const canonicalRoot = originRoot(resource.finalUrl);

      if (canonicalRoot) {
        countySeedUrls.push(canonicalRoot);
      }
    } catch {
      // Try another registry alias.
    }
  }

  countySeedUrls.push(...rootUrls(ranked.candidate));

  const countyCrawl = await crawlTrustedSite({
    seedUrls: [...new Set(countySeedUrls)],

    trustedDomains: trustedCountyDomains,

    countyName: jurisdiction.countyName,

    agencyName:
      ranked.candidate.suborganizationName || ranked.candidate.organizationName,

    allowAuthorityDiscovery: true,
  });

  const candidates: SourceCandidate[] = [...countyCrawl.candidates];

  /*
   * One-hop separately managed authority chaining.
   */
  for (const authorityLink of countyCrawl.authorityLinks.slice(
    0,
    MAX_AUTHORITY_LINKS_PER_COUNTY,
  )) {
    const authority = await validateAuthorityLink(
      authorityLink,
      jurisdiction.countyName,
    );

    if (!authority) {
      continue;
    }

    const authorityDomains = new Set<string>([authority.domain]);

    const authoritySeeds = [
      authority.baseUrl,
      originRoot(authority.baseUrl),
    ].filter((value): value is string => Boolean(value));

    const authorityCrawl = await crawlTrustedSite({
      seedUrls: authoritySeeds,

      trustedDomains: authorityDomains,

      countyName: jurisdiction.countyName,

      agencyName: authority.agencyName,

      allowAuthorityDiscovery: false,
    });

    candidates.push(...authorityCrawl.candidates);
  }

  return uniqueByUrl(candidates)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_SOURCE_CANDIDATES_PER_SITE * 2);
}

/* ========================================================================== */
/* Sale type / custodian inference                                             */
/* ========================================================================== */

function inferSaleType(value: string, fallback: SaleType): SaleType {
  const text = normalizeText(value);

  if (text.includes("partition")) {
    return "partition_sale";
  }

  if (
    text.includes("homeowners association") ||
    text.includes(" hoa ") ||
    text.includes("condominium")
  ) {
    return "hoa_foreclosure";
  }

  if (text.includes("municipal lien")) {
    return "municipal_lien_foreclosure";
  }

  if (text.includes("sheriff")) {
    return "sheriff_sale";
  }

  if (text.includes("trustee sale") || text.includes("deed of trust")) {
    return "trustee_sale";
  }

  if (text.includes("tax deed")) {
    return "tax_deed_sale";
  }

  if (
    text.includes("tax sale") ||
    text.includes("tax collector") ||
    text.includes("tax commissioner") ||
    text.includes("treasurer")
  ) {
    return "tax_lien_foreclosure";
  }

  if (text.includes("foreclosure")) {
    return "judicial_foreclosure";
  }

  return fallback;
}

function inferCustodian(value: string): SurplusCustodian {
  const text = normalizeText(value);

  if (text.includes("sheriff")) {
    return "sheriff";
  }

  if (text.includes("trustee")) {
    return "trustee";
  }

  if (text.includes("circuit court")) {
    return "circuit_court";
  }

  if (text.includes("clerk") || text.includes("court")) {
    return "clerk_of_court";
  }

  if (text.includes("treasurer")) {
    return "county_treasurer";
  }

  if (
    text.includes("tax") ||
    text.includes("collector") ||
    text.includes("commissioner")
  ) {
    return "county_tax_collector";
  }

  if (text.includes("municipal") || text.includes("city of")) {
    return "municipality";
  }

  return "unknown";
}

/* ========================================================================== */
/* Source construction                                                         */
/* ========================================================================== */

function buildSourceDefinition({
  jurisdiction,
  ranked,
  candidate,
  format,
}: {
  jurisdiction: ResolvedJurisdiction;

  ranked: RankedDomain;

  candidate: SourceCandidate;

  format: PublicRecordSourceFormat;
}): PublicRecordSourceDefinition {
  const agencyName =
    candidate.agencyName ||
    ranked.candidate.suborganizationName ||
    ranked.candidate.organizationName;

  const sourceDescription = [candidate.label, candidate.url, agencyName].join(
    " ",
  );

  const fallbackSaleType = ranked.saleTypes[0] ?? "tax_lien_foreclosure";

  return {
    key: `auto-${jurisdiction.state.toLowerCase()}-${jurisdiction.countyGeoid}-${stableHash(
      candidate.url,
    ).slice(0, 12)}`,

    state: jurisdiction.state,

    countyGeoid: jurisdiction.countyGeoid,

    countyName: jurisdiction.countyName,

    sourceLevel: "county",

    sourceName: candidate.label || `${agencyName} Surplus Records`,

    sourceUrl: candidate.url,

    sourceFormat: format,

    parserKey: PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY,

    agencyName,

    custodian: inferCustodian(sourceDescription),

    saleType: inferSaleType(sourceDescription, fallbackSaleType),

    status: "active",

    supportsBulkPull: true,
  };
}

/* ========================================================================== */
/* Child dataset discovery                                                     */
/* ========================================================================== */

async function discoverChildDatasetCandidates(
  parent: SourceCandidate,
): Promise<SourceCandidate[]> {
  const trustedDomains = new Set<string>([parent.trustedDomain]);

  let page: RetrievedText;

  try {
    page = await fetchTrustedText(parent.url, trustedDomains, MAX_HTML_BYTES);
  } catch {
    return [];
  }

  const candidates: SourceCandidate[] = [];

  const anchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(page.text)) !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";

    const label = cleanAnchorLabel(match[4] ?? "");

    const url = normalizeTrustedUrl(href, page.finalUrl, trustedDomains);

    if (!url) {
      continue;
    }

    const ownText = [
      label,
      decodeUrlText(`${url.pathname} ${url.search}`),
    ].join(" ");

    if (surplusRelevance(ownText).disqualified) {
      continue;
    }

    const value = [parent.label, decodeUrlText(parent.url), ownText].join(" ");

    if (!looksLikeDatasetLink(url.toString(), ownText)) {
      continue;
    }

    candidates.push({
      url: url.toString(),

      label: label || parent.label,

      score: childDatasetScore(value, parent),

      /*
       * The parent page was already established as surplus material, so its
       * linked documents inherit that relevance.
       */
      strong: parent.strong,

      ownStrong: surplusRelevance(ownText).strong,

      trustedDomain: normalizedHost(url.hostname),

      agencyName: parent.agencyName,

      format: formatFromUrl(url.toString()),
    });
  }

  return uniqueByUrl(candidates)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_CHILD_DATASET_LINKS);
}

/* ========================================================================== */
/* Candidate validation                                                        */
/* ========================================================================== */

async function detectCandidateFormat(
  candidate: SourceCandidate,
): Promise<PublicRecordSourceFormat | undefined> {
  if (candidate.format) {
    return candidate.format;
  }

  return probeCandidateFormat(candidate.url, candidate.trustedDomain);
}

export interface SourceValidationAttempt {
  sourceUrl: string;

  sourceFormat: PublicRecordSourceFormat;

  accepted: boolean;

  recordCount?: number;

  /**
   * Family the response was actually classified as, when retrieval succeeded.
   */
  detectedFamily?: PublicRecordSourceFormat;

  failureReason?: PublicRecordIngestionFailureReason;

  failureMessage?: string;

  failureVariant?: string;
}

/**
 * Retrieve and parse a candidate through the real national engine.
 *
 * Every structured family is eligible. Interactive portals are the only family
 * excluded up front, because there is nothing machine-readable to validate.
 *
 * Failures are recorded rather than swallowed so an unresolvable jurisdiction
 * can report why instead of looking like an empty result.
 */
async function validateSource(
  source: PublicRecordSourceDefinition,
  attempts: SourceValidationAttempt[],
): Promise<boolean> {
  if (source.sourceFormat === "web_portal") {
    attempts.push({
      sourceUrl: source.sourceUrl,

      sourceFormat: source.sourceFormat,

      accepted: false,

      failureReason: "UNSUPPORTED_SOURCE_FAMILY",

      failureMessage:
        "Interactive portal with no published machine-readable list.",

      failureVariant: "interactive_portal",
    });

    return false;
  }

  try {
    const payload = await fetchPublicRecordSourcePayload(source);

    const records = await parsePublicRecordSourcePayload(source, payload);

    const accepted = records.length > 0;

    attempts.push({
      sourceUrl: source.sourceUrl,

      sourceFormat: source.sourceFormat,

      accepted,

      recordCount: records.length,

      detectedFamily: payload.format,
    });

    return accepted;
  } catch (error) {
    const failure = toIngestionFailure(
      error,
      `DueQuity could not validate ${source.sourceUrl}.`,
    );

    attempts.push({
      sourceUrl: source.sourceUrl,

      sourceFormat: source.sourceFormat,

      accepted: false,

      ...(failure.detectedFamily
        ? {
            detectedFamily: failure.detectedFamily,
          }
        : {}),

      failureReason: failure.reason,

      failureMessage: failure.message,

      ...(failure.variant
        ? {
            failureVariant: failure.variant,
          }
        : {}),
    });

    return false;
  }
}

async function validateCandidateOrChild({
  jurisdiction,
  ranked,
  candidate,
  attempts,
}: {
  jurisdiction: ResolvedJurisdiction;

  ranked: RankedDomain;

  candidate: SourceCandidate;

  attempts: SourceValidationAttempt[];
}): Promise<PublicRecordSourceDefinition | undefined> {
  const format = await detectCandidateFormat(candidate);

  if (!format) {
    return undefined;
  }

  const source = buildSourceDefinition({
    jurisdiction,

    ranked,

    candidate,

    format,
  });

  if (await validateSource(source, attempts)) {
    return source;
  }

  /*
   * A procedure/landing page may lead to the actual dataset. This is the
   * bounded "government page → official document link" family.
   */
  if (format !== "html_table") {
    return undefined;
  }

  const children = await discoverChildDatasetCandidates(candidate);

  for (const child of children) {
    const childFormat = await detectCandidateFormat(child);

    if (!childFormat) {
      continue;
    }

    const childSource = buildSourceDefinition({
      jurisdiction,

      ranked,

      candidate: child,

      format: childFormat,
    });

    if (await validateSource(childSource, attempts)) {
      return childSource;
    }
  }

  return undefined;
}

/* ========================================================================== */
/* Public resolver                                                             */
/* ========================================================================== */

export interface PublicRecordSourceResolution {
  source?: PublicRecordSourceDefinition;

  /**
   * True when the resolved source came from the activated registry rather than
   * from runtime discovery.
   */
  fromRegistry: boolean;

  /**
   * Domains inspected during discovery, for staff triage.
   */
  domainsInspected: number;

  candidatesConsidered: number;

  attempts: SourceValidationAttempt[];

  /**
   * Review-required summary when nothing validated.
   */
  reviewReason?: PublicRecordIngestionFailureReason;

  message: string;
}

function summarizeResolutionFailure(
  attempts: readonly SourceValidationAttempt[],
): {
  reviewReason: PublicRecordIngestionFailureReason;

  message: string;
} {
  if (attempts.length === 0) {
    return {
      reviewReason: "UNSUPPORTED_SOURCE_FAMILY",

      message:
        "No official surplus/excess-funds document candidate was located on this jurisdiction's government domains. REVIEW REQUIRED.",
    };
  }

  /*
   * Rank the failure that best explains the jurisdiction. A schema gap or an
   * unsupported family is far more actionable than a transport error on an
   * unrelated candidate.
   */
  const priority: PublicRecordIngestionFailureReason[] = [
    "INCOMPLETE_SURPLUS_SCHEMA",
    "NO_RECORDS_PARSED",
    "UNSUPPORTED_SOURCE_FAMILY",
    "UNRECOGNIZED_TABLE_STRUCTURE",
    "SOURCE_EMPTY",
    "SOURCE_UNREACHABLE",
    "SOURCE_CONFIGURATION_MISMATCH",
  ];

  for (const reason of priority) {
    const match = attempts.find((attempt) => attempt.failureReason === reason);

    if (match) {
      return {
        reviewReason: reason,

        message: `${reason} / REVIEW REQUIRED: ${match.failureMessage ?? "no detail"} (${match.sourceUrl})`,
      };
    }
  }

  return {
    reviewReason: "UNSUPPORTED_SOURCE_FAMILY",

    message:
      "Candidate official documents were retrieved but none validated as a surplus-record source. REVIEW REQUIRED.",
  };
}

/**
 * Resolve a jurisdiction's official surplus source and report what happened.
 *
 * This is the diagnostic-bearing form. It never invents a source and never
 * reports success without parsed official records.
 */
export async function resolvePublicRecordSourceWithDiagnostics(
  lookup: PublicRecordJurisdictionLookup,
): Promise<PublicRecordSourceResolution> {
  const configured = resolvePublicRecordSource(lookup);

  if (configured) {
    return {
      source: configured,

      fromRegistry: true,

      domainsInspected: 0,

      candidatesConsidered: 0,

      attempts: [],

      message:
        "An activated registry source is configured for this jurisdiction.",
    };
  }

  const jurisdiction = await resolveJurisdiction(lookup);

  if (!jurisdiction) {
    return {
      fromRegistry: false,

      domainsInspected: 0,

      candidatesConsidered: 0,

      attempts: [],

      reviewReason: "SOURCE_CONFIGURATION_MISMATCH",

      message:
        "The requested jurisdiction could not be resolved in DueQuity's national geography registry.",
    };
  }

  const cacheKey = `${jurisdiction.state}:${jurisdiction.countyGeoid}`;

  const cached = resolvedSourceCache.get(cacheKey);

  if (cached) {
    return {
      source: {
        ...cached,
      },

      fromRegistry: false,

      domainsInspected: 0,

      candidatesConsidered: 0,

      attempts: [],

      message:
        "A previously validated runtime-discovered source was reused for this jurisdiction.",
    };
  }

  const domains = await rankedDomains({
    stateFips: jurisdiction.stateFips,

    countyGeoid: jurisdiction.countyGeoid,
  });

  const validationAttempts: SourceValidationAttempt[] = [];

  /*
   * RELEVANCE-FIRST CANDIDATE SELECTION
   *
   * Candidates are gathered across the jurisdiction's ranked government domains
   * before any parsing is attempted, then validated in relevance order.
   *
   * Validating domain-by-domain and accepting the first parsable document made
   * domain ordering outrank surplus relevance: a weakly related document on the
   * county's main domain could be accepted before the tax office's actual
   * excess-funds list was ever examined.
   */
  const pooled: Array<{
    ranked: RankedDomain;

    candidate: SourceCandidate;
  }> = [];

  const pooledUrls = new Set<string>();

  let domainsInspected = 0;

  for (const ranked of domains) {
    domainsInspected += 1;

    const candidates = await discoverCandidatesOnDomain(ranked, jurisdiction);

    for (const candidate of candidates) {
      if (pooledUrls.has(candidate.url)) {
        continue;
      }

      pooledUrls.add(candidate.url);

      pooled.push({
        ranked,

        candidate,
      });
    }

    /*
     * Bounded crawl. Further domains are only inspected while nothing
     * confidently relevant has been found: a concrete document whose own
     * filename or label names surplus material. Candidates that merely inherit
     * relevance from a linking page are not enough to stop the search, so a
     * weakly related domain can never preempt the office that actually
     * publishes the list.
     */
    if (
      pooled.some(
        (entry) => entry.candidate.ownStrong && entry.candidate.format,
      )
    ) {
      break;
    }
  }

  pooled.sort((left, right) => {
    if (left.candidate.strong !== right.candidate.strong) {
      return left.candidate.strong ? -1 : 1;
    }

    return right.candidate.score - left.candidate.score;
  });

  let candidatesConsidered = 0;

  for (const entry of pooled) {
    if (candidatesConsidered >= MAX_VALIDATION_ATTEMPTS_PER_DOMAIN) {
      break;
    }

    candidatesConsidered += 1;

    const source = await validateCandidateOrChild({
      jurisdiction,

      ranked: entry.ranked,

      candidate: entry.candidate,

      attempts: validationAttempts,
    });

    if (!source) {
      continue;
    }

    resolvedSourceCache.set(cacheKey, source);

    return {
      source: {
        ...source,
      },

      fromRegistry: false,

      domainsInspected,

      candidatesConsidered,

      attempts: validationAttempts,

      message: `A ${source.sourceFormat} official surplus source was discovered and validated by the national parser.`,
    };
  }

  const summary = summarizeResolutionFailure(validationAttempts);

  return {
    fromRegistry: false,

    domainsInspected,

    candidatesConsidered,

    attempts: validationAttempts,

    reviewReason: summary.reviewReason,

    message: summary.message,
  };
}

export async function resolveOrDiscoverPublicRecordSource(
  lookup: PublicRecordJurisdictionLookup,
): Promise<PublicRecordSourceDefinition | undefined> {
  const resolution = await resolvePublicRecordSourceWithDiagnostics(lookup);

  return resolution.source;
}
