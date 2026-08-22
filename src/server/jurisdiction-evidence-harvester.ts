import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SaleType } from "@/domain/types";

import {
  discoverJurisdictionSources,
  type JurisdictionSourceCandidate,
} from "@/server/jurisdiction-source-discovery";

/**
 * DUEQUITY JURISDICTION EVIDENCE HARVESTER
 *
 * Evidence pipeline:
 *
 *   trusted official domain
 *     -> official index / sitemap / robots discovery
 *     -> bounded PDF text extraction where needed
 *     -> role-aware relevance classification
 *     -> limited same-domain navigation
 *     -> persisted evidence packet
 *
 * EVIDENCE ROLES:
 *
 *   process_context
 *     Official material explaining the underlying sale or court process.
 *
 *   recovery_rule
 *     Statewide authority connecting the sale process to surplus, excess
 *     proceeds, distribution, an auditor, or a controlling rule/statute.
 *
 *   local_procedure
 *     Target-county material connecting the sale process to local surplus
 *     handling, filing, distribution, claimant or representative authority,
 *     payment routing, or another local recovery procedure.
 *
 * For judicial foreclosure, a single generic word such as "surplus" is not
 * sufficient. A single generic use of "foreclosure" is also not sufficient.
 *
 * This module gathers evidence only.
 *
 * It does NOT:
 *
 *   - create jurisdiction rules
 *   - determine deadlines
 *   - determine fee limits
 *   - determine attorney requirements
 *   - determine payment or representative authority
 *   - approve jurisdiction activation
 *   - authorize claimant intake
 */

/* ========================================================================== */
/* Limits                                                                      */
/* ========================================================================== */

const MAX_DOMAINS = 3;

const MAX_HTML_EVIDENCE_PER_DOMAIN = 6;

const MAX_HTTP_FETCHES_PER_DOMAIN = 12;

const MAX_CRAWL_DEPTH = 2;

const MAX_DISCOVERED_DOCUMENTS_PER_DOMAIN = 12;

const MAX_SITEMAP_FILES_PER_DOMAIN = 12;

const MAX_SITEMAP_URLS = 10_000;

const MAX_SITEMAP_SEEDS_PER_DOMAIN = 30;

const REQUEST_TIMEOUT_MS = 10_000;

const MAX_ACCEPTED_HTML_BYTES = 2_000_000;

const MAX_ACCEPTED_INDEX_BYTES = 5_000_000;

const MAX_STORED_TEXT_CHARS = 40_000;

const MAX_EXCERPT_CHARS = 2_500;

const MAX_ACCEPTED_PDF_BYTES = 20_000_000;

const MAX_PDF_PAGES = 180;

const MAX_PDF_TEXT_CHARS = 120_000;

const PDF_EXTRACTION_TIMEOUT_MS = 20_000;

const MAX_GENERIC_PDF_RETRIEVALS_PER_DOMAIN = 4;

const MAX_MARYLAND_REPORTED_YEARS = 3;

const MAX_MARYLAND_REPORTED_CANDIDATES_PER_YEAR = 12;

const MAX_MARYLAND_UNREPORTED_MONTHS = 18;

const MAX_MARYLAND_UNREPORTED_CANDIDATES_PER_MONTH = 2;

const MAX_MARYLAND_PDF_PROBES_PER_DOMAIN = 48;

const MAX_MARYLAND_RECOVERY_RULE_SOURCES = 3;

/* ========================================================================== */
/* Evidence roles                                                              */
/* ========================================================================== */

export type EvidenceRole =
  "process_context" | "recovery_rule" | "local_procedure";

/* ========================================================================== */
/* Harvest profiles                                                            */
/* ========================================================================== */

const COMMON_PAYMENT_TERMS = [
  "claimant",
  "claimants",
  "claim form",
  "submit a claim",
  "submitting a claim",
  "retrieve these funds",
  "claiming the surplus funds",
  "payment",
  "payment routing",
  "check payable",
  "payable to",
  "payee",
  "representative",
  "authorized representative",
  "personal representative",
  "power of attorney",
  "attorney in fact",
  "attorney-in-fact",
  "assignment",
  "assignee",
  "letters of administration",
  "photo id",
  "photo identification",
  "w-9",
  "w9",
  "joint payee",
  "split disbursement",
];

interface HarvestProfile {
  processTerms: string[];

  recoveryTerms: string[];

  ruleTerms: string[];

  processSupportTerms: string[];

  bridgeTerms: string[];

  negativeProcessTerms: string[];

  requireProcessSupport: boolean;
}

function getHarvestProfile(saleType: SaleType): HarvestProfile {
  switch (saleType) {
    case "judicial_foreclosure":
      return {
        processTerms: [
          "foreclosure",
          "foreclosure sale",
          "foreclosure process",
          "foreclosure case",
          "foreclosure cases",
          "foreclosure action",
          "foreclosure actions",
          "mortgage foreclosure",
        ],

        recoveryTerms: [
          "surplus",
          "surplus funds",
          "distribution of surplus",
          "foreclosure surplus",
          "excess proceeds",
          "excess funds",
          "proceeds of sale",
          "sale proceeds",
          "auditor",
          "auditor's report",
          "audit of sale",
        ],

        ruleTerms: ["rule 14-216", "14-216", "14 216"],

        processSupportTerms: [
          "foreclosure process",
          "foreclosure case",
          "foreclosure cases",
          "foreclosure action",
          "foreclosure sale",
          "civil clerk",
          "circuit court",
          "auction",
          "order to docket",
          "report of sale",
          "ratification",
          "trustee",
          "trustees",
        ],

        bridgeTerms: [
          "housing",
          "civil",
          "civil department",
          "land records",
          "circuit court",
          "circuit courts",
          "clerk",
          "appellate opinions",
          "opinions",
          "opinions search",
          "court help",
          "rules",
          "rules of procedure",
          "standing committee on rules",
          "mortgage",
        ],

        negativeProcessTerms: [
          "foreclosure prevention",
          "credit counseling",
          "hope hotline",
          "property registration",
          "foreclosure property registry",
          "foreclosure property registration",
          "avoid foreclosure",
          "distressed homeowner",
          "distressed homeowners",
        ],

        requireProcessSupport: true,
      };

    case "nonjudicial_foreclosure":
      return {
        processTerms: [
          "foreclosure",
          "nonjudicial foreclosure",
          "trustee sale",
          "deed of trust",
          "foreclosure sale",
        ],

        recoveryTerms: [
          "surplus",
          "surplus funds",
          "excess proceeds",
          "excess funds",
          "proceeds of sale",
          "sale proceeds",
        ],

        ruleTerms: [],

        processSupportTerms: [
          "trustee sale",
          "deed of trust",
          "foreclosure sale",
          "trustee",
          "notice of sale",
        ],

        bridgeTerms: [
          "mortgage",
          "banking",
          "financial regulation",
          "consumer protection",
          "real estate",
          "recorder",
          "trustee",
          "forms",
          "statutes",
          "rules",
        ],

        negativeProcessTerms: [
          "foreclosure prevention",
          "credit counseling",
          "avoid foreclosure",
        ],

        requireProcessSupport: false,
      };

    case "tax_deed_sale":
    case "tax_lien_foreclosure":
      return {
        processTerms: [
          "tax sale",
          "tax deed",
          "tax lien",
          "delinquent tax",
          "property tax sale",
        ],

        recoveryTerms: [
          "surplus",
          "surplus funds",
          "excess proceeds",
          "excess funds",
          "claim proceeds",
          "remaining proceeds",
        ],

        ruleTerms: [],

        processSupportTerms: [
          "tax collector",
          "treasurer",
          "tax sale",
          "tax deed",
          "tax lien",
          "redemption",
        ],

        bridgeTerms: [
          "tax",
          "finance",
          "treasurer",
          "collector",
          "tax collector",
          "revenue",
          "property tax",
          "forms",
          "statutes",
          "rules",
        ],

        negativeProcessTerms: [],

        requireProcessSupport: false,
      };

    case "sheriff_sale":
      return {
        processTerms: [
          "sheriff sale",
          "judicial sale",
          "execution sale",
          "foreclosure",
        ],

        recoveryTerms: [
          "surplus",
          "surplus funds",
          "excess proceeds",
          "excess funds",
          "proceeds of sale",
        ],

        ruleTerms: [],

        processSupportTerms: ["sheriff", "execution", "sale", "court", "clerk"],

        bridgeTerms: ["sheriff", "civil", "court", "clerk", "forms", "rules"],

        negativeProcessTerms: [],

        requireProcessSupport: false,
      };

    case "hoa_foreclosure":
      return {
        processTerms: [
          "hoa foreclosure",
          "association foreclosure",
          "condominium foreclosure",
          "foreclosure",
        ],

        recoveryTerms: [
          "surplus",
          "surplus funds",
          "excess proceeds",
          "excess funds",
          "proceeds of sale",
        ],

        ruleTerms: [],

        processSupportTerms: [
          "homeowners association",
          "condominium",
          "lien",
          "foreclosure sale",
          "court",
        ],

        bridgeTerms: [
          "homeowners association",
          "condominium",
          "housing",
          "civil",
          "court",
          "clerk",
          "rules",
        ],

        negativeProcessTerms: [],

        requireProcessSupport: false,
      };

    case "trustee_sale":
      return {
        processTerms: [
          "trustee sale",
          "foreclosure",
          "foreclosure sale",
          "deed of trust",
        ],

        recoveryTerms: [
          "surplus",
          "surplus funds",
          "excess proceeds",
          "excess funds",
          "proceeds of sale",
        ],

        ruleTerms: [],

        processSupportTerms: [
          "trustee",
          "deed of trust",
          "notice of sale",
          "foreclosure sale",
        ],

        bridgeTerms: [
          "trustee",
          "mortgage",
          "deed of trust",
          "recorder",
          "court",
          "clerk",
          "rules",
        ],

        negativeProcessTerms: [],

        requireProcessSupport: false,
      };

    case "municipal_lien_foreclosure":
      return {
        processTerms: [
          "municipal lien foreclosure",
          "municipal lien",
          "lien foreclosure",
          "foreclosure sale",
          "judicial sale",
        ],

        recoveryTerms: [
          "surplus",
          "surplus funds",
          "excess proceeds",
          "excess funds",
          "remaining proceeds",
          "proceeds of sale",
        ],

        ruleTerms: [],

        processSupportTerms: [
          "municipality",
          "municipal lien",
          "lien foreclosure",
          "court",
          "clerk",
          "sale",
        ],

        bridgeTerms: [
          "municipal",
          "lien",
          "civil",
          "court",
          "clerk",
          "finance",
          "treasurer",
          "statutes",
          "rules",
        ],

        negativeProcessTerms: [],

        requireProcessSupport: false,
      };

    case "partition_sale":
      return {
        processTerms: [
          "partition sale",
          "partition action",
          "sale in lieu of partition",
          "judicial sale",
          "court ordered sale",
        ],

        recoveryTerms: [
          "surplus",
          "remaining proceeds",
          "sale proceeds",
          "distribution of proceeds",
          "proceeds of sale",
        ],

        ruleTerms: [],

        processSupportTerms: [
          "partition",
          "co owner",
          "co-owner",
          "court",
          "clerk",
          "trustee",
          "sale",
        ],

        bridgeTerms: [
          "partition",
          "real property",
          "civil",
          "court",
          "clerk",
          "trustee",
          "statutes",
          "rules",
        ],

        negativeProcessTerms: [],

        requireProcessSupport: false,
      };

    default:
      return {
        processTerms: ["sale", "claim"],

        recoveryTerms: [
          "surplus",
          "surplus funds",
          "excess proceeds",
          "excess funds",
          "proceeds of sale",
        ],

        ruleTerms: [],

        processSupportTerms: [],

        bridgeTerms: [
          "civil",
          "court",
          "clerk",
          "finance",
          "treasurer",
          "rules",
        ],

        negativeProcessTerms: [],

        requireProcessSupport: false,
      };
  }
}

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type EvidenceSourceType = "html" | "pdf";

export interface HarvestedEvidenceSource {
  id: string;

  sourceType: EvidenceSourceType;

  evidenceRole: EvidenceRole;

  domain: string;

  url: string;

  title?: string;

  retrievedAt?: string;

  httpStatus?: number;

  contentType?: string;

  contentHash?: string;

  relevanceScore: number;

  matchedTerms: string[];

  excerpt?: string;

  text?: string;

  retrievalStatus: "retrieved" | "discovered" | "failed";

  error?: string;
}

export interface HarvestedDomainResult {
  domain: string;

  organizationName: string;

  scope: JurisdictionSourceCandidate["scope"];

  candidateScore: number;

  pages: HarvestedEvidenceSource[];

  documents: HarvestedEvidenceSource[];

  errors: string[];
}

export interface JurisdictionEvidencePacket {
  schemaVersion: 1;

  id: string;

  stateFips: string;

  stateCode: string;

  stateName: string;

  countyGeoid: string;

  countyName?: string;

  saleType: SaleType;

  harvestedAt: string;

  discoveryTerms: string[];

  domains: HarvestedDomainResult[];

  totals: {
    domainsAttempted: number;

    htmlPagesRetrieved: number;

    documentsDiscovered: number;

    retrievalFailures: number;

    processContextSources: number;

    recoveryRuleSources: number;

    localProcedureSources: number;
  };

  evidenceStatus: "complete" | "partial" | "failed";

  legalRulesCreated: false;

  jurisdictionApproved: false;

  intakeAllowed: false;

  packetHash: string;
}

/* ========================================================================== */
/* Internal types                                                              */
/* ========================================================================== */

interface TermScore {
  score: number;

  matchedTerms: string[];
}

interface EvidenceClassification {
  role: EvidenceRole;

  score: number;

  matchedTerms: string[];
}

interface LinkClassification {
  evidence?: EvidenceClassification;

  bridgeScore: number;

  bridgeTerms: string[];

  totalScore: number;
}

interface DiscoveredLink {
  url: string;

  label: string;

  sourceType: EvidenceSourceType;

  evidenceRole?: EvidenceRole;

  score: number;

  evidenceScore: number;

  bridgeScore: number;

  matchedTerms: string[];
}

interface RetrievedHtmlPage {
  finalUrl: string;

  title?: string;

  text: string;

  excerpt: string;

  contentHash: string;

  contentType: string;

  httpStatus: number;

  retrievedAt: string;

  evidence?: EvidenceClassification;

  links: DiscoveredLink[];
}

interface RetrievedPdfDocument {
  finalUrl: string;

  title?: string;

  text: string;

  excerpt: string;

  contentHash: string;

  contentType: string;

  httpStatus: number;

  retrievedAt: string;

  totalPages: number;

  evidence?: EvidenceClassification;
}

interface MarylandOpinionCandidate {
  url: string;

  title: string;

  score: number;

  reported: boolean;
}

interface SitemapSeed {
  url: string;

  sourceType: EvidenceSourceType;

  evidenceRole?: EvidenceRole;

  score: number;

  evidenceScore: number;

  bridgeScore: number;

  matchedTerms: string[];
}

interface CrawlItem {
  url: string;

  depth: number;

  score: number;
}

/* ========================================================================== */
/* Store                                                                       */
/* ========================================================================== */

function evidenceStorePath({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): string {
  const safeSaleType = String(saleType).replace(/[^a-z0-9_-]/gi, "_");

  return join(
    process.cwd(),
    ".duequity-data",
    "jurisdiction-evidence",
    `${stateFips}-${countyGeoid}-${safeSaleType}.json`,
  );
}

async function writeEvidencePacket(
  packet: JurisdictionEvidencePacket,
): Promise<void> {
  const path = evidenceStorePath({
    stateFips: packet.stateFips,

    countyGeoid: packet.countyGeoid,

    saleType: packet.saleType,
  });

  await mkdir(dirname(path), {
    recursive: true,
  });

  const tempPath = `${path}.tmp`;

  await writeFile(tempPath, JSON.stringify(packet, null, 2), "utf8");

  await rename(tempPath, path);
}

export async function getJurisdictionEvidencePacket({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): Promise<JurisdictionEvidencePacket | undefined> {
  const path = evidenceStorePath({
    stateFips,
    countyGeoid,
    saleType,
  });

  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  const normalized = raw.replace(/^\uFEFF/, "");

  try {
    return JSON.parse(normalized) as JurisdictionEvidencePacket;
  } catch {
    throw new Error(
      "Stored jurisdiction evidence packet contains invalid JSON.",
    );
  }
}

/* ========================================================================== */
/* Hashing                                                                     */
/* ========================================================================== */

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/* ========================================================================== */
/* Text helpers                                                                */
/* ========================================================================== */

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedSearchText(value: string): string {
  return normalizeWhitespace(
    decodeBasicEntities(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " "),
  );
}

/* ========================================================================== */
/* Term scoring                                                                */
/* ========================================================================== */

function scoreTerms(
  value: string,
  terms: string[],
  phraseWeight: number,
  wordWeight: number,
): TermScore {
  const haystack = normalizedSearchText(value);

  /*
   * Match whole normalized words / phrases, not arbitrary substrings.
   *
   * Example:
   *   "land" must match "Omid Land Group"
   *   but must NOT match the "land" characters inside "Maryland".
   *
   * normalizedSearchText() already converts punctuation to spaces, so padding
   * both sides gives us a lightweight token-boundary check that also works for
   * multi-word phrases such as "foreclosure sale" and "rule 14 216".
   */
  const paddedHaystack = ` ${haystack} `;

  let score = 0;

  const matchedTerms: string[] = [];

  for (const term of terms) {
    const needle = normalizedSearchText(term);

    if (!needle || !paddedHaystack.includes(` ${needle} `)) {
      continue;
    }

    score += needle.includes(" ") ? phraseWeight : wordWeight;

    matchedTerms.push(term);
  }

  return {
    score,

    matchedTerms: [...new Set(matchedTerms)],
  };
}

/* ========================================================================== */
/* Evidence classification                                                     */
/* ========================================================================== */

function classifyEvidence({
  value,
  profile,
  scope,
}: {
  value: string;

  profile: HarvestProfile;

  scope: JurisdictionSourceCandidate["scope"];
}): EvidenceClassification | undefined {
  const process = scoreTerms(value, profile.processTerms, 12, 7);

  const recovery = scoreTerms(value, profile.recoveryTerms, 14, 8);

  const payment = scoreTerms(value, COMMON_PAYMENT_TERMS, 14, 8);

  const rule = scoreTerms(value, profile.ruleTerms, 30, 24);

  const support = scoreTerms(value, profile.processSupportTerms, 8, 5);

  const negative = scoreTerms(value, profile.negativeProcessTerms, 20, 12);

  /*
   * Explicit controlling rule references are strongest.
   */
  if (rule.score > 0) {
    return {
      role: scope === "county_exact" ? "local_procedure" : "recovery_rule",

      score: 100 + rule.score + process.score + recovery.score,

      matchedTerms: [
        ...new Set([
          ...rule.matchedTerms,
          ...process.matchedTerms,
          ...recovery.matchedTerms,
        ]),
      ],
    };
  }

  /*
   * Payment / representation procedure.
   *
   * This role does not decide what Duequity is legally allowed to do. It only
   * preserves official material that directly addresses claimant identity,
   * representative authority, filing, payment, checks, assignments, or related
   * disbursement mechanics.
   *
   * Requiring a recovery signal prevents generic government payment pages from
   * entering a surplus-recovery evidence packet.
   */
  if (recovery.score > 0 && payment.score > 0) {
    return {
      role: scope === "county_exact" ? "local_procedure" : "recovery_rule",

      score: 75 + recovery.score + payment.score + process.score,

      matchedTerms: [
        ...new Set([
          ...recovery.matchedTerms,
          ...payment.matchedTerms,
          ...process.matchedTerms,
        ]),
      ],
    };
  }

  /*
   * Paired-term gate.
   *
   * Judicial foreclosure surplus recovery requires both:
   *
   *   foreclosure / sale process
   *   +
   *   surplus / proceeds / auditor signal
   *
   * This is what blocks unrelated "surplus real property" programs.
   */
  if (process.score > 0 && recovery.score > 0) {
    return {
      role: scope === "county_exact" ? "local_procedure" : "recovery_rule",

      score: 60 + process.score + recovery.score + support.score,

      matchedTerms: [
        ...new Set([
          ...process.matchedTerms,
          ...recovery.matchedTerms,
          ...support.matchedTerms,
        ]),
      ],
    };
  }

  /*
   * Process context.
   *
   * For judicial foreclosure, "foreclosure" by itself is not enough.
   * There must also be a procedural support signal such as Circuit Court,
   * Civil Clerk, auction, foreclosure case, report of sale, etc.
   *
   * Prevention, counseling and property-registration pages are explicitly
   * excluded unless they separately satisfy the recovery-rule gate above.
   */
  if (
    process.score > 0 &&
    negative.score === 0 &&
    (!profile.requireProcessSupport || support.score > 0)
  ) {
    return {
      role: "process_context",

      score: 20 + process.score + support.score,

      matchedTerms: [
        ...new Set([...process.matchedTerms, ...support.matchedTerms]),
      ],
    };
  }

  return undefined;
}

function classifyLink({
  value,
  profile,
  scope,
}: {
  value: string;

  profile: HarvestProfile;

  scope: JurisdictionSourceCandidate["scope"];
}): LinkClassification {
  const evidence = classifyEvidence({
    value,

    profile,

    scope,
  });

  const bridge = scoreTerms(value, profile.bridgeTerms, 6, 3);

  return {
    evidence,

    bridgeScore: bridge.score,

    bridgeTerms: bridge.matchedTerms,

    totalScore: (evidence?.score ?? 0) + bridge.score,
  };
}

/* ========================================================================== */
/* URL helpers                                                                 */
/* ========================================================================== */

function normalizedHost(hostname: string): string {
  const lower = hostname.trim().toLowerCase();

  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

function isAllowedHost(hostname: string, trustedDomains: string[]): boolean {
  const host = normalizedHost(hostname);

  return trustedDomains.some((trustedDomain) => {
    const trusted = normalizedHost(trustedDomain);

    return host === trusted || host.endsWith(`.${trusted}`);
  });
}

function normalizeHttpsUrl(rawUrl: string, baseUrl: string): URL | undefined {
  let url: URL;

  try {
    url = new URL(decodeBasicEntities(rawUrl), baseUrl);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:") {
    return undefined;
  }

  url.hash = "";

  return url;
}

function rootUrlCandidates(candidate: JurisdictionSourceCandidate): string[] {
  const roots = new Set<string>();

  const cleanDomain = normalizedHost(candidate.domain);

  try {
    const supplied = new URL(candidate.baseUrl);

    supplied.protocol = "https:";

    supplied.pathname = "/";

    supplied.search = "";

    supplied.hash = "";

    roots.add(supplied.toString());
  } catch {
    // Ignore malformed discovery root.
  }

  roots.add(`https://${cleanDomain}/`);

  roots.add(`https://www.${cleanDomain}/`);

  return [...roots];
}

function evidenceSourceTypeForUrl(url: URL): EvidenceSourceType {
  return url.pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "html";
}

/* ========================================================================== */
/* Generic text fetch                                                          */
/* ========================================================================== */

async function fetchTextResource({
  url,
  trustedDomains,
  maxBytes,
}: {
  url: string;

  trustedDomains: string[];

  maxBytes: number;
}): Promise<{
  finalUrl: string;

  body: string;

  contentType: string;

  status: number;
}> {
  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",

      redirect: "follow",

      cache: "no-store",

      signal: controller.signal,

      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1",

        "User-Agent": "Duequity-Jurisdiction-Research/1.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }

  const finalUrl = response.url || url;

  const parsedFinal = new URL(finalUrl);

  if (!isAllowedHost(parsedFinal.hostname, trustedDomains)) {
    throw new Error(
      `${url} redirected outside the trusted jurisdiction source set.`,
    );
  }

  const lengthHeader = response.headers.get("content-length");

  if (lengthHeader) {
    const length = Number(lengthHeader);

    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error(
        `${finalUrl} exceeded the Duequity retrieval size limit.`,
      );
    }
  }

  const body = await response.text();

  if (Buffer.byteLength(body, "utf8") > maxBytes) {
    throw new Error(`${finalUrl} exceeded the Duequity retrieval size limit.`);
  }

  return {
    finalUrl,

    body,

    contentType: response.headers.get("content-type")?.toLowerCase() ?? "",

    status: response.status,
  };
}

/* ========================================================================== */
/* Binary / PDF retrieval                                                      */
/* ========================================================================== */

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function fetchBinaryResource({
  url,
  trustedDomains,
  maxBytes,
}: {
  url: string;

  trustedDomains: string[];

  maxBytes: number;
}): Promise<{
  finalUrl: string;

  body: Uint8Array;

  contentType: string;

  status: number;
}> {
  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",

      redirect: "follow",

      cache: "no-store",

      signal: controller.signal,

      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.8,*/*;q=0.1",

        "User-Agent": "Duequity-Jurisdiction-Research/1.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }

  const finalUrl = response.url || url;

  const parsedFinal = new URL(finalUrl);

  if (!isAllowedHost(parsedFinal.hostname, trustedDomains)) {
    throw new Error(
      `${url} redirected outside the trusted jurisdiction source set.`,
    );
  }

  const lengthHeader = response.headers.get("content-length");

  if (lengthHeader) {
    const length = Number(lengthHeader);

    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error(
        `${finalUrl} exceeded the Duequity PDF retrieval size limit.`,
      );
    }
  }

  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error(
      `${finalUrl} exceeded the Duequity PDF retrieval size limit.`,
    );
  }

  return {
    finalUrl,

    body: new Uint8Array(arrayBuffer),

    contentType: response.headers.get("content-type")?.toLowerCase() ?? "",

    status: response.status,
  };
}

function buildRelevantExcerpt({
  text,
  matchedTerms,
}: {
  text: string;

  matchedTerms: string[];
}): string {
  if (text.length <= MAX_EXCERPT_CHARS) {
    return text;
  }

  const normalizedText = text.toLowerCase();

  let firstMatch = -1;

  for (const term of matchedTerms) {
    const candidate = term.trim().toLowerCase();

    if (!candidate) {
      continue;
    }

    const index = normalizedText.indexOf(candidate);

    if (index >= 0 && (firstMatch < 0 || index < firstMatch)) {
      firstMatch = index;
    }
  }

  if (firstMatch < 0) {
    return text.slice(0, MAX_EXCERPT_CHARS);
  }

  const before = Math.floor(MAX_EXCERPT_CHARS * 0.35);

  const start = Math.max(0, firstMatch - before);

  return text.slice(start, start + MAX_EXCERPT_CHARS);
}

async function fetchPdfDocument({
  url,
  title,
  trustedDomains,
  profile,
  scope,
}: {
  url: string;

  title?: string;

  trustedDomains: string[];

  profile: HarvestProfile;

  scope: JurisdictionSourceCandidate["scope"];
}): Promise<RetrievedPdfDocument> {
  const resource = await fetchBinaryResource({
    url,

    trustedDomains,

    maxBytes: MAX_ACCEPTED_PDF_BYTES,
  });

  if (
    !resource.contentType.includes("application/pdf") &&
    !new URL(resource.finalUrl).pathname.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error(`${resource.finalUrl} did not return PDF content.`);
  }

  /*
   * Hash the downloaded bytes BEFORE passing them to unpdf.
   *
   * PDF.js may transfer/detach the Uint8Array backing buffer while opening the
   * document. Hashing after getDocumentProxy() can therefore produce the
   * SHA-256 of an empty buffer (e3b0c442...), which destroys source provenance.
   *
   * The hash must represent the exact official PDF bytes received from the
   * source, independent of what the parser later does with its buffer.
   */
  const contentHash = createHash("sha256").update(resource.body).digest("hex");

  const { extractText, getDocumentProxy } = await import("unpdf");

  const pdf = await withTimeout(
    getDocumentProxy(resource.body, {
      maxImageSize: 16_777_216,
    }),
    PDF_EXTRACTION_TIMEOUT_MS,
    `${resource.finalUrl} exceeded the Duequity PDF open timeout.`,
  );

  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(
        `${resource.finalUrl} exceeded the Duequity PDF page limit.`,
      );
    }

    const extracted = await withTimeout(
      extractText(pdf, {
        mergePages: true,
      }),
      PDF_EXTRACTION_TIMEOUT_MS,
      `${resource.finalUrl} exceeded the Duequity PDF text extraction timeout.`,
    );

    const extractedText = Array.isArray(extracted.text)
      ? extracted.text.join("\n")
      : extracted.text;

    const storedText = normalizeWhitespace(extractedText).slice(
      0,
      MAX_PDF_TEXT_CHARS,
    );

    const evidence = classifyEvidence({
      value: [
        title ?? "",
        new URL(resource.finalUrl).pathname,
        storedText,
      ].join(" "),

      profile,

      scope,
    });

    return {
      finalUrl: resource.finalUrl,

      title,

      text: storedText,

      excerpt: buildRelevantExcerpt({
        text: storedText,

        matchedTerms: evidence?.matchedTerms ?? [],
      }),

      contentHash,

      contentType: resource.contentType || "application/pdf",

      httpStatus: resource.status,

      retrievedAt: new Date().toISOString(),

      totalPages: extracted.totalPages,

      evidence,
    };
  } finally {
    // The bounded extraction completes with the proxy falling out of scope.
    // unpdf does not expose destroy() on its PDFDocumentProxy type.
  }
}

/* ========================================================================== */
/* Sitemap discovery                                                           */
/* ========================================================================== */

function parseRobotsSitemaps(
  robots: string,
  baseUrl: string,
  trustedDomains: string[],
): string[] {
  const results = new Set<string>();

  for (const line of robots.split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(.+?)\s*$/i);

    if (!match) {
      continue;
    }

    const url = normalizeHttpsUrl(match[1], baseUrl);

    if (!url || !isAllowedHost(url.hostname, trustedDomains)) {
      continue;
    }

    results.add(url.toString());
  }

  return [...results];
}

function parseXmlLocations(xml: string): string[] {
  const results: string[] = [];

  const pattern = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;

  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) && results.length < MAX_SITEMAP_URLS) {
    const value = normalizeWhitespace(
      decodeBasicEntities(match[1].replace(/<!\[CDATA\[|\]\]>/g, "")),
    );

    if (value) {
      results.push(value);
    }
  }

  return results;
}

function looksLikeSitemapUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();

  return path.endsWith(".xml") || path.includes("sitemap");
}

async function discoverSitemapSeeds({
  candidate,
  trustedDomains,
  profile,
}: {
  candidate: JurisdictionSourceCandidate;

  trustedDomains: string[];

  profile: HarvestProfile;
}): Promise<SitemapSeed[]> {
  const roots = rootUrlCandidates(candidate);

  const sitemapQueue: string[] = [];

  const queuedSitemaps = new Set<string>();

  const visitedSitemaps = new Set<string>();

  const seeds = new Map<string, SitemapSeed>();

  function queueSitemap(value: string) {
    if (queuedSitemaps.has(value)) {
      return;
    }

    queuedSitemaps.add(value);

    sitemapQueue.push(value);
  }

  for (const root of roots) {
    let origin: string;

    try {
      origin = new URL(root).origin;
    } catch {
      continue;
    }

    queueSitemap(`${origin}/sitemap.xml`);

    queueSitemap(`${origin}/sitemap_index.xml`);

    try {
      const robots = await fetchTextResource({
        url: `${origin}/robots.txt`,

        trustedDomains,

        maxBytes: 500_000,
      });

      for (const sitemap of parseRobotsSitemaps(
        robots.body,
        robots.finalUrl,
        trustedDomains,
      )) {
        queueSitemap(sitemap);
      }
    } catch {
      /*
       * robots.txt is optional.
       */
    }
  }

  while (
    sitemapQueue.length > 0 &&
    visitedSitemaps.size < MAX_SITEMAP_FILES_PER_DOMAIN
  ) {
    const sitemapUrl = sitemapQueue.shift();

    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) {
      continue;
    }

    visitedSitemaps.add(sitemapUrl);

    let resource: Awaited<ReturnType<typeof fetchTextResource>>;

    try {
      resource = await fetchTextResource({
        url: sitemapUrl,

        trustedDomains,

        maxBytes: MAX_ACCEPTED_INDEX_BYTES,
      });
    } catch {
      continue;
    }

    const locations = parseXmlLocations(resource.body);

    for (const rawLocation of locations) {
      const location = normalizeHttpsUrl(rawLocation, resource.finalUrl);

      if (!location || !isAllowedHost(location.hostname, trustedDomains)) {
        continue;
      }

      if (looksLikeSitemapUrl(location)) {
        if (
          visitedSitemaps.size + sitemapQueue.length <
          MAX_SITEMAP_FILES_PER_DOMAIN * 2
        ) {
          queueSitemap(location.toString());
        }

        continue;
      }

      const sourceType = evidenceSourceTypeForUrl(location);

      const classification = classifyLink({
        value: [location.pathname, location.search].join(" "),

        profile,

        scope: candidate.scope,
      });

      /*
       * PDFs must already have a meaningful evidence classification in their
       * URL. We never crawl arbitrary PDF collections merely because they sit
       * under an "opinions" directory.
       */
      if (sourceType === "pdf" && !classification.evidence) {
        continue;
      }

      /*
       * HTML bridge pages may survive even when they are not evidence.
       *
       * Examples:
       *   appellate opinions
       *   rules
       *   land records
       *   civil
       *
       * They can lead to stronger evidence but will not themselves be stored
       * unless page content passes the evidence classifier.
       */
      if (!classification.evidence && classification.bridgeScore === 0) {
        continue;
      }

      const normalizedUrl = location.toString();

      const seed: SitemapSeed = {
        url: normalizedUrl,

        sourceType,

        evidenceRole: classification.evidence?.role,

        score: classification.totalScore,

        evidenceScore: classification.evidence?.score ?? 0,

        bridgeScore: classification.bridgeScore,

        matchedTerms: [
          ...new Set([
            ...(classification.evidence?.matchedTerms ?? []),
            ...classification.bridgeTerms,
          ]),
        ],
      };

      const existing = seeds.get(normalizedUrl);

      if (!existing || seed.score > existing.score) {
        seeds.set(normalizedUrl, seed);
      }
    }
  }

  return [...seeds.values()]
    .sort((left, right) => {
      /*
       * Real evidence outranks bridge navigation.
       */
      if (Boolean(left.evidenceRole) !== Boolean(right.evidenceRole)) {
        return left.evidenceRole ? -1 : 1;
      }

      if (right.evidenceScore !== left.evidenceScore) {
        return right.evidenceScore - left.evidenceScore;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.url.localeCompare(right.url);
    })
    .slice(0, MAX_SITEMAP_SEEDS_PER_DOMAIN);
}

/* ========================================================================== */
/* Maryland official opinion index adapter                                     */
/* ========================================================================== */

const MARYLAND_CIVIL_OPINION_HINT_TERMS = [
  "llc",
  "bank",
  "mortgage",
  "trustee",
  "trustees",
  "property",
  "properties",
  "realty",
  "real estate",
  "land",
  "holdings",
  "investment",
  "investments",
  "funding",
  "capital",
  "servicing",
  "loan",
  "loans",
  "condominium",
  "association",
  "homeowners",
  "homes",
  "development",
  "group",
];

const MARYLAND_CRIMINAL_OPINION_HINT_TERMS = [
  "state",
  "attorney grievance",
  "reinstatement",
  "criminal",
  "per curiam",
  "public safety",
  "correctional",
];

function isMarylandJudiciaryOpinionCandidate({
  candidate,
  profile,
}: {
  candidate: JurisdictionSourceCandidate;

  profile: HarvestProfile;
}): boolean {
  const host = normalizedHost(candidate.domain);

  return (
    (host === "mdcourts.gov" || host.endsWith(".mdcourts.gov")) &&
    profile.ruleTerms.some(
      (term) =>
        normalizedSearchText(term) === "rule 14 216" ||
        normalizedSearchText(term) === "14 216",
    )
  );
}

function marylandReportedIndexUrls(): string[] {
  const currentYear = new Date().getUTCFullYear();

  return Array.from(
    {
      length: MAX_MARYLAND_REPORTED_YEARS,
    },
    (_value, index) => {
      const year = currentYear - index;

      return `https://www.mdcourts.gov/cgi-bin/indexlist.pl?court=both&order=bydate&submit=Submit&year=${year}`;
    },
  );
}

function marylandUnreportedMonthUrls(): string[] {
  const now = new Date();

  return Array.from(
    {
      length: MAX_MARYLAND_UNREPORTED_MONTHS,
    },
    (_value, index) => {
      const month = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1),
      );

      const year = month.getUTCFullYear().toString();

      const monthNumber = String(month.getUTCMonth() + 1).padStart(2, "0");

      return `https://www.mdcourts.gov/appellate/unreportedopinions/list/${year}${monthNumber}`;
    },
  );
}

function scoreMarylandOpinionIndexRow({
  rowText,
  profile,
  scope,
  reported,
}: {
  rowText: string;

  profile: HarvestProfile;

  scope: JurisdictionSourceCandidate["scope"];

  reported: boolean;
}): number {
  const evidence = classifyEvidence({
    value: rowText,

    profile,

    scope,
  });

  if (evidence) {
    return 1_000 + evidence.score + (reported ? 100 : 20);
  }

  const civil = scoreTerms(rowText, MARYLAND_CIVIL_OPINION_HINT_TERMS, 22, 14);

  const criminal = scoreTerms(
    rowText,
    MARYLAND_CRIMINAL_OPINION_HINT_TERMS,
    28,
    20,
  );

  /*
   * Reported opinions are already a narrow, high-authority corpus. We retain
   * recent civil-looking rows even when the case caption itself does not reveal
   * the foreclosure issue. Unreported rows need a stronger civil/property hint
   * because the monthly corpus is much larger.
   */
  if (reported) {
    if (criminal.score > 0 && civil.score === 0) {
      return 0;
    }

    return 100 + civil.score - Math.min(criminal.score, 80);
  }

  if (civil.score === 0 || criminal.score > civil.score) {
    return 0;
  }

  return 20 + civil.score - Math.min(criminal.score, 15);
}

function extractMarylandOpinionCandidates({
  html,
  pageUrl,
  trustedDomains,
  profile,
  scope,
  reported,
}: {
  html: string;

  pageUrl: string;

  trustedDomains: string[];

  profile: HarvestProfile;

  scope: JurisdictionSourceCandidate["scope"];

  reported: boolean;
}): MarylandOpinionCandidate[] {
  const candidates = new Map<string, MarylandOpinionCandidate>();

  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html))) {
    const rowHtml = rowMatch[1];

    const rowText = normalizeWhitespace(
      decodeBasicEntities(rowHtml.replace(/<[^>]+>/g, " ")),
    );

    if (!rowText) {
      continue;
    }

    const anchorPattern =
      /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

    let anchorMatch: RegExpExecArray | null;

    while ((anchorMatch = anchorPattern.exec(rowHtml))) {
      const href = anchorMatch[1] ?? anchorMatch[2] ?? anchorMatch[3] ?? "";

      const url = normalizeHttpsUrl(href, pageUrl);

      if (
        !url ||
        !isAllowedHost(url.hostname, trustedDomains) ||
        !url.pathname.toLowerCase().endsWith(".pdf")
      ) {
        continue;
      }

      const score = scoreMarylandOpinionIndexRow({
        rowText,

        profile,

        scope,

        reported,
      });

      if (score <= 0) {
        continue;
      }

      const normalizedUrl = url.toString();

      const candidate: MarylandOpinionCandidate = {
        url: normalizedUrl,

        title: rowText.slice(0, 500),

        score,

        reported,
      };

      const existing = candidates.get(normalizedUrl);

      if (!existing || candidate.score > existing.score) {
        candidates.set(normalizedUrl, candidate);
      }
    }
  }

  return [...candidates.values()].sort(
    (left, right) => right.score - left.score,
  );
}

function marylandOpinionAuthorityBoost(reported: boolean): number {
  return reported ? 35 : 8;
}

async function discoverMarylandOpinionCandidates({
  candidate,
  trustedDomains,
  profile,
}: {
  candidate: JurisdictionSourceCandidate;

  trustedDomains: string[];

  profile: HarvestProfile;
}): Promise<{
  candidates: MarylandOpinionCandidate[];

  errors: string[];
}> {
  if (
    !isMarylandJudiciaryOpinionCandidate({
      candidate,
      profile,
    })
  ) {
    return {
      candidates: [],
      errors: [],
    };
  }

  const errors: string[] = [];

  const reportedGroups: MarylandOpinionCandidate[][] = [];

  for (const indexUrl of marylandReportedIndexUrls()) {
    try {
      const resource = await fetchTextResource({
        url: indexUrl,

        trustedDomains,

        maxBytes: MAX_ACCEPTED_INDEX_BYTES,
      });

      const group = extractMarylandOpinionCandidates({
        html: resource.body,

        pageUrl: resource.finalUrl,

        trustedDomains,

        profile,

        scope: candidate.scope,

        reported: true,
      }).slice(0, MAX_MARYLAND_REPORTED_CANDIDATES_PER_YEAR);

      reportedGroups.push(group);
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : `Unable to read Maryland reported-opinion index ${indexUrl}.`,
      );
    }
  }

  const unreportedGroups: MarylandOpinionCandidate[][] = [];

  for (const indexUrl of marylandUnreportedMonthUrls()) {
    try {
      const resource = await fetchTextResource({
        url: indexUrl,

        trustedDomains,

        maxBytes: MAX_ACCEPTED_INDEX_BYTES,
      });

      const group = extractMarylandOpinionCandidates({
        html: resource.body,

        pageUrl: resource.finalUrl,

        trustedDomains,

        profile,

        scope: candidate.scope,

        reported: false,
      }).slice(0, MAX_MARYLAND_UNREPORTED_CANDIDATES_PER_MONTH);

      unreportedGroups.push(group);
    } catch (error) {
      /*
       * A month can legitimately have no published opinions yet. Index misses
       * are therefore diagnostics, not a reason to fail the whole domain.
       */
      const message =
        error instanceof Error
          ? error.message
          : `Unable to read Maryland unreported-opinion index ${indexUrl}.`;

      if (!message.includes("HTTP 404")) {
        errors.push(message);
      }
    }
  }

  /*
   * Round-robin across years/months prevents one large index from consuming the
   * entire probe budget. Reported authority is tried first, then unreported
   * opinions are sampled across the full recent window instead of only the most
   * recent month.
   */
  function interleaveGroups(
    groups: MarylandOpinionCandidate[][],
  ): MarylandOpinionCandidate[] {
    const output: MarylandOpinionCandidate[] = [];

    const maxLength = groups.reduce(
      (maximum, group) => Math.max(maximum, group.length),
      0,
    );

    for (let index = 0; index < maxLength; index += 1) {
      for (const group of groups) {
        const item = group[index];

        if (item) {
          output.push(item);
        }
      }
    }

    return output;
  }

  const reportedOrdered = interleaveGroups(reportedGroups);

  const unreportedOrdered = interleaveGroups(unreportedGroups);

  /*
   * Reserve most of the Maryland probe budget for the month-by-month
   * unreported corpus.
   *
   * The earlier implementation concatenated all reported candidates first and
   * then sliced the combined list. With three reported years, that could consume
   * most of the total probe budget before older months in the unreported window
   * were ever reached.
   *
   * Twelve reported probes preserve recent higher-authority coverage. Thirty-six
   * unreported probes guarantee two ranked candidates from every month across
   * the current 18-month window.
   */
  const reportedProbeBudget = Math.min(12, MAX_MARYLAND_PDF_PROBES_PER_DOMAIN);

  const unreportedProbeBudget = Math.max(
    0,
    MAX_MARYLAND_PDF_PROBES_PER_DOMAIN - reportedProbeBudget,
  );

  const ordered = [
    ...reportedOrdered.slice(0, reportedProbeBudget),
    ...unreportedOrdered.slice(0, unreportedProbeBudget),
  ];

  return {
    candidates: [
      ...new Map(ordered.map((item) => [item.url, item])).values(),
    ].slice(0, MAX_MARYLAND_PDF_PROBES_PER_DOMAIN),

    errors,
  };
}

/* ========================================================================== */
/* HTML extraction                                                             */
/* ========================================================================== */

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (!match) {
    return undefined;
  }

  const title = normalizeWhitespace(
    decodeBasicEntities(match[1].replace(/<[^>]+>/g, " ")),
  );

  return title || undefined;
}

function extractText(html: string): string {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  return normalizeWhitespace(
    decodeBasicEntities(cleaned.replace(/<[^>]+>/g, " ")),
  );
}

/* ========================================================================== */
/* Curated official jurisdiction anchors                                       */
/* ========================================================================== */

/**
 * Curated anchors solve a specific evidence-discovery problem without turning
 * the harvester into a legal-rules engine.
 *
 * Some official government sites expose the controlling recovery procedure on
 * pages whose URLs are difficult to discover from a bounded sitemap crawl.
 * When Duequity has already validated an exact official URL for a jurisdiction,
 * it may preserve that URL here as an evidence anchor.
 *
 * These anchors:
 *
 *   - must be official government sources
 *   - are evidence only
 *   - do not create legal findings
 *   - do not determine payment routing
 *   - do not approve a jurisdiction
 *
 * Human review remains mandatory.
 */
interface CuratedOfficialHtmlSeed {
  domain: string;

  organizationName: string;

  scope: JurisdictionSourceCandidate["scope"];

  url: string;

  title: string;

  evidenceRole: EvidenceRole;

  relevanceScore: number;

  matchedTerms: string[];
}

function curatedOfficialHtmlSeeds({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): CuratedOfficialHtmlSeed[] {
  /*
   * Carroll County, Maryland tax-lien surplus recovery.
   *
   * County GEOID 24013.
   *
   * The county FAQ is especially important because it expressly discusses:
   *
   *   - surplus-funds claims
   *   - claimant identification
   *   - personal representatives for deceased owners
   *   - the question of power of attorney
   *   - the claim-submission contact
   *
   * The page does not, by itself, establish that Duequity may file or receive
   * payment. The evidence role only ensures that the human reviewer sees the
   * source when answering those questions.
   */
  if (
    stateFips === "24" &&
    countyGeoid === "24013" &&
    saleType === "tax_lien_foreclosure"
  ) {
    return [
      {
        domain: "carrollcountymd.gov",

        organizationName: "Carroll County Government",

        scope: "county_exact",

        url: "https://www.carrollcountymd.gov/government/directory/comptroller/frequently-asked-questions-comptroller/",

        title:
          "Carroll County Comptroller Surplus Funds Frequently Asked Questions",

        evidenceRole: "local_procedure",

        relevanceScore: 320,

        matchedTerms: [
          "surplus funds",
          "claimant",
          "personal representative",
          "power of attorney",
          "letters of administration",
          "submit a claim",
        ],
      },
      {
        domain: "carrollcountymd.gov",

        organizationName: "Carroll County Government",

        scope: "county_exact",

        url: "https://www.carrollcountymd.gov/government/directory/comptroller/collectionstaxes/surplus-funds-list/",

        title: "Carroll County Tax Sale Surplus Funds List",

        evidenceRole: "local_procedure",

        relevanceScore: 290,

        matchedTerms: ["tax sale", "surplus funds", "balance owed"],
      },
      {
        domain: "carrollcountymd.gov",

        organizationName: "Carroll County Government",

        scope: "county_exact",

        url: "https://www.carrollcountymd.gov/government/directory/comptroller/collectionstaxes/",

        title: "Carroll County Collections and Taxes",

        evidenceRole: "process_context",

        relevanceScore: 240,

        matchedTerms: ["tax sale", "tax collector", "collections"],
      },
      {
        domain: "mgaleg.maryland.gov",

        organizationName: "Maryland General Assembly",

        scope: "statewide_authority",

        url: "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gtp&section=14-819",

        title: "Maryland Tax-Property § 14-819",

        evidenceRole: "recovery_rule",

        relevanceScore: 350,

        matchedTerms: [
          "14-819",
          "person entitled",
          "balance",
          "collector",
          "3 years",
          "7 years",
        ],
      },
    ];
  }

  return [];
}

async function fetchCuratedOfficialHtmlEvidence(
  seed: CuratedOfficialHtmlSeed,
): Promise<HarvestedEvidenceSource> {
  const resource = await fetchTextResource({
    url: seed.url,

    trustedDomains: [seed.domain],

    maxBytes: MAX_ACCEPTED_HTML_BYTES,
  });

  if (
    !resource.contentType.includes("text/html") &&
    !resource.contentType.includes("application/xhtml+xml")
  ) {
    throw new Error(`${resource.finalUrl} did not return HTML content.`);
  }

  const title = extractTitle(resource.body) ?? seed.title;

  const text = extractText(resource.body).slice(0, MAX_STORED_TEXT_CHARS);

  const retrievedAt = new Date().toISOString();

  return {
    id: `html-${sha256(resource.finalUrl).slice(0, 16)}`,

    sourceType: "html",

    evidenceRole: seed.evidenceRole,

    domain: seed.domain,

    url: resource.finalUrl,

    title,

    retrievedAt,

    httpStatus: resource.status,

    contentType: resource.contentType,

    contentHash: sha256(resource.body),

    relevanceScore: seed.relevanceScore,

    matchedTerms: seed.matchedTerms,

    excerpt: buildRelevantExcerpt({
      text,

      matchedTerms: seed.matchedTerms,
    }),

    text,

    retrievalStatus: "retrieved",
  };
}

async function harvestCuratedJurisdictionEvidence({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): Promise<HarvestedDomainResult[]> {
  const seeds = curatedOfficialHtmlSeeds({
    stateFips,

    countyGeoid,

    saleType,
  });

  if (seeds.length === 0) {
    return [];
  }

  const grouped = new Map<
    string,
    {
      organizationName: string;

      scope: JurisdictionSourceCandidate["scope"];

      seeds: CuratedOfficialHtmlSeed[];
    }
  >();

  for (const seed of seeds) {
    const current = grouped.get(seed.domain);

    if (current) {
      current.seeds.push(seed);

      continue;
    }

    grouped.set(seed.domain, {
      organizationName: seed.organizationName,

      scope: seed.scope,

      seeds: [seed],
    });
  }

  const results: HarvestedDomainResult[] = [];

  for (const [domain, group] of grouped) {
    const pages: HarvestedEvidenceSource[] = [];

    const retrievalErrors: string[] = [];

    for (const seed of group.seeds) {
      try {
        const evidence = await fetchCuratedOfficialHtmlEvidence(seed);

        pages.push(evidence);
      } catch (error) {
        retrievalErrors.push(
          error instanceof Error
            ? error.message
            : `Unable to retrieve curated official source ${seed.url}.`,
        );
      }
    }

    /*
     * A curated domain is supplemental evidence.
     *
     * If at least one exact anchor was successfully retrieved, incidental
     * failure of another optional anchor does not downgrade the entire packet.
     * If the whole curated domain is unreachable, retain the failure so the
     * outage remains visible.
     */
    results.push({
      domain,

      organizationName: group.organizationName,

      scope: group.scope,

      candidateScore: 1_000,

      pages: [...new Map(pages.map((page) => [page.url, page])).values()].sort(
        (left, right) => right.relevanceScore - left.relevanceScore,
      ),

      documents: [],

      errors: pages.length > 0 ? [] : retrievalErrors,
    });
  }

  return results;
}

function mergeHarvestedDomainResult({
  existing,
  incoming,
}: {
  existing: HarvestedDomainResult;

  incoming: HarvestedDomainResult;
}): HarvestedDomainResult {
  const pages = [
    ...new Map(
      [...existing.pages, ...incoming.pages].map((page) => [page.url, page]),
    ).values(),
  ]
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, MAX_HTML_EVIDENCE_PER_DOMAIN);

  const documents = [
    ...new Map(
      [...existing.documents, ...incoming.documents].map((document) => [
        document.url,
        document,
      ]),
    ).values(),
  ]
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, MAX_DISCOVERED_DOCUMENTS_PER_DOMAIN);

  /*
   * If curated anchors succeeded on the domain, they establish that the
   * official source itself is available. Generic crawler misses elsewhere on
   * the same site are non-material to packet completeness.
   */
  const incomingSucceeded =
    incoming.pages.length > 0 || incoming.documents.length > 0;

  return {
    domain: existing.domain,

    organizationName: incoming.organizationName || existing.organizationName,

    scope: incoming.scope,

    candidateScore: Math.max(existing.candidateScore, incoming.candidateScore),

    pages,

    documents,

    errors: incomingSucceeded
      ? incoming.errors
      : [...new Set([...existing.errors, ...incoming.errors])],
  };
}

/* ========================================================================== */
/* Link discovery                                                              */
/* ========================================================================== */

function extractRelevantLinks({
  html,
  pageUrl,
  trustedDomains,
  profile,
  scope,
  allowBridge,
}: {
  html: string;

  pageUrl: string;

  trustedDomains: string[];

  profile: HarvestProfile;

  scope: JurisdictionSourceCandidate["scope"];

  allowBridge: boolean;
}): DiscoveredLink[] {
  const links = new Map<string, DiscoveredLink>();

  const anchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";

    const label = normalizeWhitespace(
      decodeBasicEntities((match[4] ?? "").replace(/<[^>]+>/g, " ")),
    );

    const url = normalizeHttpsUrl(href, pageUrl);

    if (!url || !isAllowedHost(url.hostname, trustedDomains)) {
      continue;
    }

    const sourceType = evidenceSourceTypeForUrl(url);

    const classification = classifyLink({
      value: [label, url.pathname, url.search].join(" "),

      profile,

      scope,
    });

    if (sourceType === "pdf" && !classification.evidence) {
      continue;
    }

    if (
      sourceType === "html" &&
      !classification.evidence &&
      (!allowBridge || classification.bridgeScore === 0)
    ) {
      continue;
    }

    const normalizedUrl = url.toString();

    const discovered: DiscoveredLink = {
      url: normalizedUrl,

      label,

      sourceType,

      evidenceRole: classification.evidence?.role,

      score: classification.totalScore,

      evidenceScore: classification.evidence?.score ?? 0,

      bridgeScore: classification.bridgeScore,

      matchedTerms: [
        ...new Set([
          ...(classification.evidence?.matchedTerms ?? []),
          ...classification.bridgeTerms,
        ]),
      ],
    };

    const existing = links.get(normalizedUrl);

    if (!existing || discovered.score > existing.score) {
      links.set(normalizedUrl, discovered);
    }
  }

  return [...links.values()].sort((left, right) => {
    if (Boolean(left.evidenceRole) !== Boolean(right.evidenceRole)) {
      return left.evidenceRole ? -1 : 1;
    }

    if (right.evidenceScore !== left.evidenceScore) {
      return right.evidenceScore - left.evidenceScore;
    }

    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.url.localeCompare(right.url);
  });
}

/* ========================================================================== */
/* HTML retrieval                                                              */
/* ========================================================================== */

async function fetchHtmlPage({
  url,
  trustedDomains,
  profile,
  scope,
  allowBridgeLinks,
}: {
  url: string;

  trustedDomains: string[];

  profile: HarvestProfile;

  scope: JurisdictionSourceCandidate["scope"];

  allowBridgeLinks: boolean;
}): Promise<RetrievedHtmlPage> {
  const resource = await fetchTextResource({
    url,

    trustedDomains,

    maxBytes: MAX_ACCEPTED_HTML_BYTES,
  });

  if (
    !resource.contentType.includes("text/html") &&
    !resource.contentType.includes("application/xhtml+xml")
  ) {
    throw new Error(`${resource.finalUrl} did not return HTML content.`);
  }

  const title = extractTitle(resource.body);

  const fullText = extractText(resource.body);

  const storedText = fullText.slice(0, MAX_STORED_TEXT_CHARS);

  const evidence = classifyEvidence({
    value: [title ?? "", new URL(resource.finalUrl).pathname, storedText].join(
      " ",
    ),

    profile,

    scope,
  });

  return {
    finalUrl: resource.finalUrl,

    title,

    text: storedText,

    excerpt: storedText.slice(0, MAX_EXCERPT_CHARS),

    contentHash: sha256(resource.body),

    contentType: resource.contentType,

    httpStatus: resource.status,

    retrievedAt: new Date().toISOString(),

    evidence,

    links: extractRelevantLinks({
      html: resource.body,

      pageUrl: resource.finalUrl,

      trustedDomains,

      profile,

      scope,

      allowBridge: allowBridgeLinks,
    }),
  };
}

/* ========================================================================== */
/* Evidence conversion                                                         */
/* ========================================================================== */

function htmlEvidenceId(url: string): string {
  return `html-${sha256(url).slice(0, 16)}`;
}

function documentEvidenceId(url: string): string {
  return `document-${sha256(url).slice(0, 16)}`;
}

function toHtmlEvidence(
  domain: string,
  page: RetrievedHtmlPage,
): HarvestedEvidenceSource {
  if (!page.evidence) {
    throw new Error(
      `Attempted to persist non-evidence HTML page: ${page.finalUrl}`,
    );
  }

  return {
    id: htmlEvidenceId(page.finalUrl),

    sourceType: "html",

    evidenceRole: page.evidence.role,

    domain,

    url: page.finalUrl,

    title: page.title,

    retrievedAt: page.retrievedAt,

    httpStatus: page.httpStatus,

    contentType: page.contentType,

    contentHash: page.contentHash,

    relevanceScore: page.evidence.score,

    matchedTerms: page.evidence.matchedTerms,

    excerpt: page.excerpt,

    text: page.text,

    retrievalStatus: "retrieved",
  };
}

function toDocumentEvidence({
  domain,
  url,
  title,
  classification,
}: {
  domain: string;

  url: string;

  title?: string;

  classification: EvidenceClassification;
}): HarvestedEvidenceSource {
  return {
    id: documentEvidenceId(url),

    sourceType: "pdf",

    evidenceRole: classification.role,

    domain,

    url,

    title,

    relevanceScore: classification.score,

    matchedTerms: classification.matchedTerms,

    retrievalStatus: "discovered",
  };
}

function toRetrievedDocumentEvidence({
  domain,
  document,
  authorityBoost = 0,
}: {
  domain: string;

  document: RetrievedPdfDocument;

  authorityBoost?: number;
}): HarvestedEvidenceSource {
  if (!document.evidence) {
    throw new Error(
      `Attempted to persist non-evidence PDF document: ${document.finalUrl}`,
    );
  }

  return {
    id: documentEvidenceId(document.finalUrl),

    sourceType: "pdf",

    evidenceRole: document.evidence.role,

    domain,

    url: document.finalUrl,

    title: document.title,

    retrievedAt: document.retrievedAt,

    httpStatus: document.httpStatus,

    contentType: document.contentType,

    contentHash: document.contentHash,

    relevanceScore: document.evidence.score + authorityBoost,

    matchedTerms: document.evidence.matchedTerms,

    excerpt: document.excerpt,

    text: document.text,

    retrievalStatus: "retrieved",
  };
}

/* ========================================================================== */
/* Domain harvesting                                                           */
/* ========================================================================== */

async function harvestDomain({
  candidate,
  trustedDomains,
  profile,
}: {
  candidate: JurisdictionSourceCandidate;

  trustedDomains: string[];

  profile: HarvestProfile;
}): Promise<HarvestedDomainResult> {
  const pages: HarvestedEvidenceSource[] = [];

  const documents: HarvestedEvidenceSource[] = [];

  const errors: string[] = [];

  const seenPages = new Set<string>();

  const seenDocuments = new Set<string>();

  let fetchCount = 0;

  let pdfRetrievalCount = 0;

  function addDocument({
    url,
    title,
    classification,
  }: {
    url: string;

    title?: string;

    classification: EvidenceClassification;
  }) {
    if (
      documents.length >= MAX_DISCOVERED_DOCUMENTS_PER_DOMAIN ||
      seenDocuments.has(url)
    ) {
      return;
    }

    seenDocuments.add(url);

    documents.push(
      toDocumentEvidence({
        domain: candidate.domain,

        url,

        title,

        classification,
      }),
    );
  }

  async function retrievePdfEvidence({
    url,
    title,
    authorityBoost = 0,
    recordFailure,
  }: {
    url: string;

    title?: string;

    authorityBoost?: number;

    recordFailure: boolean;
  }): Promise<HarvestedEvidenceSource | undefined> {
    if (seenDocuments.has(url)) {
      return documents.find((document) => document.url === url);
    }

    pdfRetrievalCount += 1;

    try {
      const document = await fetchPdfDocument({
        url,

        title,

        trustedDomains,

        profile,

        scope: candidate.scope,
      });

      if (!document.evidence) {
        return undefined;
      }

      const evidence = toRetrievedDocumentEvidence({
        domain: candidate.domain,

        document,

        authorityBoost,
      });

      seenDocuments.add(evidence.url);

      documents.push(evidence);

      return evidence;
    } catch (error) {
      if (recordFailure) {
        errors.push(
          error instanceof Error
            ? error.message
            : `Unable to retrieve PDF evidence ${url}.`,
        );
      }

      return undefined;
    }
  }

  async function retrievePage({
    url,
    allowBridgeLinks,
    recordFailure,
  }: {
    url: string;

    allowBridgeLinks: boolean;

    recordFailure: boolean;
  }): Promise<RetrievedHtmlPage | undefined> {
    if (fetchCount >= MAX_HTTP_FETCHES_PER_DOMAIN || seenPages.has(url)) {
      return undefined;
    }

    seenPages.add(url);

    fetchCount += 1;

    try {
      return await fetchHtmlPage({
        url,

        trustedDomains,

        profile,

        scope: candidate.scope,

        allowBridgeLinks,
      });
    } catch (error) {
      if (recordFailure) {
        errors.push(
          error instanceof Error ? error.message : `Unable to retrieve ${url}.`,
        );
      }

      return undefined;
    }
  }

  /*
   * PHASE 0
   *
   * Jurisdiction-specific official opinion indexes.
   *
   * Maryland's legacy full-text search endpoint is no longer dependable, but
   * the Judiciary still publishes stable reported and unreported opinion
   * indexes. Their PDF filenames are often opaque, so Duequity must classify
   * the actual PDF text rather than reject the document based on its URL.
   */
  if (
    isMarylandJudiciaryOpinionCandidate({
      candidate,
      profile,
    })
  ) {
    const maryland = await discoverMarylandOpinionCandidates({
      candidate,

      trustedDomains,

      profile,
    });

    errors.push(...maryland.errors);

    let marylandRecoveryRules = 0;

    let marylandExplicitRuleFound = false;

    for (const opinion of maryland.candidates) {
      /*
       * Do not stop merely because several generic foreclosure-surplus opinions
       * have already qualified. For Maryland judicial foreclosure research,
       * the adapter is specifically responsible for obtaining at least one
       * source that actually contains the configured controlling-rule signal.
       *
       * The total PDF probe ceiling remains the hard network bound.
       * Final document persistence is still reduced to the normal per-domain
       * evidence limit after scoring and deduplication.
       */
      if (
        pdfRetrievalCount >= MAX_MARYLAND_PDF_PROBES_PER_DOMAIN ||
        (marylandRecoveryRules >= MAX_MARYLAND_RECOVERY_RULE_SOURCES &&
          marylandExplicitRuleFound)
      ) {
        break;
      }

      const evidence = await retrievePdfEvidence({
        url: opinion.url,

        title: opinion.title,

        authorityBoost: marylandOpinionAuthorityBoost(opinion.reported),

        recordFailure: false,
      });

      if (evidence?.evidenceRole === "recovery_rule") {
        marylandRecoveryRules += 1;

        const normalizedMatchedTerms = new Set(
          evidence.matchedTerms.map((term) => normalizedSearchText(term)),
        );

        marylandExplicitRuleFound =
          profile.ruleTerms.some((term) =>
            normalizedMatchedTerms.has(normalizedSearchText(term)),
          ) || marylandExplicitRuleFound;
      }
    }
  }

  /*
   * PHASE 1
   *
   * Sitemap-first evidence and bridge discovery.
   */
  const sitemapSeeds = await discoverSitemapSeeds({
    candidate,

    trustedDomains,

    profile,
  });

  const sitemapBridgeQueue: CrawlItem[] = [];

  for (const seed of sitemapSeeds) {
    if (fetchCount >= MAX_HTTP_FETCHES_PER_DOMAIN) {
      break;
    }

    if (seed.sourceType === "pdf") {
      if (!seed.evidenceRole) {
        continue;
      }

      const classification: EvidenceClassification = {
        role: seed.evidenceRole,

        score: seed.evidenceScore,

        matchedTerms: seed.matchedTerms,
      };

      addDocument({
        url: seed.url,

        classification,
      });

      continue;
    }

    if (seed.evidenceRole) {
      if (pages.length >= MAX_HTML_EVIDENCE_PER_DOMAIN) {
        continue;
      }

      const page = await retrievePage({
        url: seed.url,

        allowBridgeLinks: false,

        recordFailure: true,
      });

      if (page?.evidence) {
        pages.push(toHtmlEvidence(candidate.domain, page));

        for (const link of page.links) {
          if (link.sourceType !== "pdf" || !link.evidenceRole) {
            continue;
          }

          addDocument({
            url: link.url,

            title: link.label || undefined,

            classification: {
              role: link.evidenceRole,

              score: link.evidenceScore,

              matchedTerms: link.matchedTerms,
            },
          });
        }
      }

      continue;
    }

    if (seed.bridgeScore > 0) {
      sitemapBridgeQueue.push({
        url: seed.url,

        depth: 1,

        score: seed.score,
      });
    }
  }

  /*
   * PHASE 2
   *
   * Root discovery.
   *
   * Bare-domain failure followed by successful www fallback is not treated as
   * an evidence failure.
   */
  const rootFailures: string[] = [];

  let root: RetrievedHtmlPage | undefined;

  for (const rootUrl of rootUrlCandidates(candidate)) {
    if (root || fetchCount >= MAX_HTTP_FETCHES_PER_DOMAIN) {
      break;
    }

    if (seenPages.has(rootUrl)) {
      continue;
    }

    seenPages.add(rootUrl);

    fetchCount += 1;

    try {
      root = await fetchHtmlPage({
        url: rootUrl,

        trustedDomains,

        profile,

        scope: candidate.scope,

        allowBridgeLinks: true,
      });
    } catch (error) {
      rootFailures.push(
        error instanceof Error
          ? error.message
          : `Unable to retrieve ${rootUrl}.`,
      );
    }
  }

  const queue: CrawlItem[] = [...sitemapBridgeQueue];

  if (root) {
    if (root.evidence && pages.length < MAX_HTML_EVIDENCE_PER_DOMAIN) {
      pages.push(toHtmlEvidence(candidate.domain, root));
    }

    for (const link of root.links) {
      if (link.sourceType === "pdf") {
        if (link.evidenceRole) {
          addDocument({
            url: link.url,

            title: link.label || undefined,

            classification: {
              role: link.evidenceRole,

              score: link.evidenceScore,

              matchedTerms: link.matchedTerms,
            },
          });
        }

        continue;
      }

      queue.push({
        url: link.url,

        depth: 1,

        score: link.score,
      });
    }
  } else if (pages.length === 0 && documents.length === 0) {
    errors.push(
      rootFailures.length > 0
        ? rootFailures.join(" | ")
        : `Unable to retrieve a usable root or indexed source from ${candidate.domain}.`,
    );
  }

  /*
   * PHASE 3
   *
   * Limited bridge navigation.
   */
  queue.sort((left, right) => right.score - left.score);

  while (
    queue.length > 0 &&
    fetchCount < MAX_HTTP_FETCHES_PER_DOMAIN &&
    pages.length < MAX_HTML_EVIDENCE_PER_DOMAIN
  ) {
    const next = queue.shift();

    if (!next || next.depth > MAX_CRAWL_DEPTH) {
      continue;
    }

    const page = await retrievePage({
      url: next.url,

      allowBridgeLinks: next.depth < MAX_CRAWL_DEPTH,

      recordFailure: false,
    });

    if (!page) {
      continue;
    }

    if (page.evidence) {
      if (!pages.some((existing) => existing.url === page.finalUrl)) {
        pages.push(toHtmlEvidence(candidate.domain, page));
      }
    }

    for (const link of page.links) {
      if (link.sourceType === "pdf") {
        if (link.evidenceRole) {
          addDocument({
            url: link.url,

            title: link.label || undefined,

            classification: {
              role: link.evidenceRole,

              score: link.evidenceScore,

              matchedTerms: link.matchedTerms,
            },
          });
        }

        continue;
      }

      if (next.depth < MAX_CRAWL_DEPTH) {
        queue.push({
          url: link.url,

          depth: next.depth + 1,

          score: link.score,
        });
      }
    }

    queue.sort((left, right) => right.score - left.score);
  }

  /*
   * PHASE 4
   *
   * Verify a small number of generically discovered PDFs by reading their
   * actual text. This preserves the national path while avoiding an unbounded
   * document crawl. Maryland opinion-index PDFs were already handled above.
   */
  const genericDiscoveredDocuments = documents
    .filter((document) => document.retrievalStatus === "discovered")
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, MAX_GENERIC_PDF_RETRIEVALS_PER_DOMAIN);

  for (const discovered of genericDiscoveredDocuments) {
    try {
      const verified = await fetchPdfDocument({
        url: discovered.url,

        title: discovered.title,

        trustedDomains,

        profile,

        scope: candidate.scope,
      });

      if (!verified.evidence) {
        continue;
      }

      const index = documents.findIndex(
        (document) => document.url === discovered.url,
      );

      if (index >= 0) {
        documents[index] = toRetrievedDocumentEvidence({
          domain: candidate.domain,

          document: verified,
        });
      }
    } catch {
      /*
       * Generic verification is best-effort. The original discovered record is
       * retained if the PDF cannot be parsed.
       */
    }
  }

  /*
   * Final dedupe in case the same page was reached from sitemap and navigation.
   */
  const uniquePages = [
    ...new Map(pages.map((page) => [page.url, page])).values(),
  ]
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, MAX_HTML_EVIDENCE_PER_DOMAIN);

  const uniqueDocuments = [
    ...new Map(documents.map((document) => [document.url, document])).values(),
  ]
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, MAX_DISCOVERED_DOCUMENTS_PER_DOMAIN);

  return {
    domain: candidate.domain,

    organizationName: candidate.organizationName,

    scope: candidate.scope,

    candidateScore: candidate.score,

    pages: uniquePages,

    documents: uniqueDocuments,

    errors,
  };
}

/* ========================================================================== */
/* Packet helpers                                                              */
/* ========================================================================== */

function computePacketHash(
  packet: Omit<JurisdictionEvidencePacket, "packetHash">,
): string {
  return sha256(JSON.stringify(packet));
}

function countRole(
  domains: HarvestedDomainResult[],
  role: EvidenceRole,
): number {
  return domains.reduce(
    (total, domain) =>
      total +
      domain.pages.filter((source) => source.evidenceRole === role).length +
      domain.documents.filter((source) => source.evidenceRole === role).length,
    0,
  );
}

/* ========================================================================== */
/* Public harvester                                                            */
/* ========================================================================== */

export async function harvestJurisdictionEvidence({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): Promise<JurisdictionEvidencePacket> {
  const discovery = await discoverJurisdictionSources({
    stateFips,

    countyGeoid,

    saleType,
  });

  const trustedCandidates = discovery.candidates;

  if (trustedCandidates.length === 0) {
    throw new Error(
      "No trusted official source candidates are available for evidence harvesting.",
    );
  }

  /*
   * Every discovery candidate remains inside the trusted redirect set, but a
   * candidate only consumes one of the evidence packet's MAX_DOMAINS slots
   * after it actually produces role-qualified evidence.
   *
   * Government-domain registries can contain stale historical domains. A dead
   * domain must not crowd a live official source out of the bounded harvest,
   * nor should a dead duplicate automatically downgrade an otherwise complete
   * evidence packet.
   */
  const trustedDomains = trustedCandidates.map((candidate) => candidate.domain);

  const profile = getHarvestProfile(saleType);

  const domains: HarvestedDomainResult[] = [];

  const failedCandidates: HarvestedDomainResult[] = [];

  /*
   * Sequential by design.
   *
   * Continue down the ranked official-source list until up to MAX_DOMAINS
   * productive domains have been collected. Candidates that return no
   * role-qualified evidence do not consume the evidence-domain budget.
   */
  for (const candidate of trustedCandidates) {
    if (domains.length >= MAX_DOMAINS) {
      break;
    }

    const harvested = await harvestDomain({
      candidate,

      trustedDomains,

      profile,
    });

    const producedEvidence =
      harvested.pages.length > 0 || harvested.documents.length > 0;

    if (producedEvidence) {
      domains.push(harvested);

      continue;
    }

    if (harvested.errors.length > 0) {
      failedCandidates.push(harvested);
    }
  }

  /*
   * PHASE 5
   *
   * Curated official jurisdiction anchors.
   *
   * These exact government URLs supplement bounded discovery when Duequity has
   * already validated a high-value official source that may be difficult to
   * reach from a sitemap or navigation crawl.
   *
   * They remain evidence only. They do not create legal or payment findings.
   */
  const curatedDomains = await harvestCuratedJurisdictionEvidence({
    stateFips,

    countyGeoid,

    saleType,
  });

  for (const curatedDomain of curatedDomains) {
    const existingIndex = domains.findIndex(
      (domain) =>
        normalizedHost(domain.domain) === normalizedHost(curatedDomain.domain),
    );

    if (existingIndex >= 0) {
      domains[existingIndex] = mergeHarvestedDomainResult({
        existing: domains[existingIndex],

        incoming: curatedDomain,
      });

      continue;
    }

    /*
     * Curated anchors outrank generic discovery for the same bounded packet.
     */
    domains.unshift(curatedDomain);
  }

  if (domains.length > MAX_DOMAINS) {
    domains.splice(MAX_DOMAINS);
  }

  /*
   * If no official source produced evidence at all, retain bounded failures in
   * the packet so a real jurisdiction-wide outage remains visible rather than
   * being silently discarded.
   */
  if (domains.length === 0 && failedCandidates.length > 0) {
    domains.push(...failedCandidates.slice(0, MAX_DOMAINS));
  }

  const htmlPagesRetrieved = domains.reduce(
    (total, domain) => total + domain.pages.length,
    0,
  );

  const documentsDiscovered = domains.reduce(
    (total, domain) => total + domain.documents.length,
    0,
  );

  const retrievalFailures = domains.reduce(
    (total, domain) => total + domain.errors.length,
    0,
  );

  const processContextSources = countRole(domains, "process_context");

  const recoveryRuleSources = countRole(domains, "recovery_rule");

  const localProcedureSources = countRole(domains, "local_procedure");

  const totalEvidenceSources =
    processContextSources + recoveryRuleSources + localProcedureSources;

  /*
   * Evidence quality status:
   *
   * failed:
   *   no role-qualified evidence
   *
   * complete:
   *   at least one recovery-rule source
   *   plus process/local procedural context
   *   plus no source retrieval failures
   *
   * partial:
   *   useful evidence exists but the legal recovery evidence set is incomplete
   *   or one of the trusted source domains failed.
   */
  const evidenceStatus: JurisdictionEvidencePacket["evidenceStatus"] =
    totalEvidenceSources === 0
      ? "failed"
      : recoveryRuleSources > 0 &&
          (processContextSources > 0 || localProcedureSources > 0) &&
          retrievalFailures === 0
        ? "complete"
        : "partial";

  const packetWithoutHash: Omit<JurisdictionEvidencePacket, "packetHash"> = {
    schemaVersion: 1,

    id: ["evidence", stateFips, countyGeoid, saleType].join("-"),

    stateFips,

    stateCode: discovery.stateCode,

    stateName: discovery.stateName,

    countyGeoid,

    countyName: discovery.countyName,

    saleType,

    harvestedAt: new Date().toISOString(),

    discoveryTerms: [
      ...profile.ruleTerms,
      ...profile.processTerms,
      ...profile.recoveryTerms,
      ...profile.processSupportTerms,
      ...profile.bridgeTerms,
      ...COMMON_PAYMENT_TERMS,
    ],

    domains,

    totals: {
      domainsAttempted: domains.length,

      htmlPagesRetrieved,

      documentsDiscovered,

      retrievalFailures,

      processContextSources,

      recoveryRuleSources,

      localProcedureSources,
    },

    evidenceStatus,

    legalRulesCreated: false,

    jurisdictionApproved: false,

    intakeAllowed: false,
  };

  const packet: JurisdictionEvidencePacket = {
    ...packetWithoutHash,

    packetHash: computePacketHash(packetWithoutHash),
  };

  await writeEvidencePacket(packet);

  return packet;
}
