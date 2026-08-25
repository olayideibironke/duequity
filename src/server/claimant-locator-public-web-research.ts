import "server-only";

import {
  addClaimantLocatorAssociatedContact,
  addClaimantLocatorCandidate,
} from "@/server/discovered-record-enrichment-store";

import type {
  DiscoveredRecord,
} from "@/server/discovered-record-store";

import {
  searchClaimantLocatorWeb,
  type ClaimantLocatorWebSearchResult,
} from "@/server/claimant-locator-web-research";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface PublicContactSource {
  title: string;
  url: string;
  hostname: string;
  content: string;
  rawContent?: string;
  score: number;
}

interface PhoneFinding {
  value: string;
  source: PublicContactSource;
}

interface EmailFinding {
  value: string;
  source: PublicContactSource;
}

interface AssociatedPerson {
  name: string;
  relationship: string;
  source: PublicContactSource;
}

interface AssociatedPersonContact {
  name: string;
  relationship: string;
  phone?: string;
  email?: string;
  source: PublicContactSource;
}

interface BusinessIdentityAliases {
  queryAliases: string[];
  strongAliases: string[];
  baseAliases: string[];
}

export interface PublicWebLocatorResearchResult {
  discoveredRecordId: string;
  formerOwnerName: string;

  status:
    | "researched"
    | "unsupported"
    | "no_safe_sources"
    | "no_contact_data";

  acceptedSourceCount: number;
  rejectedSourceCount: number;

  phoneCandidatesFound: number;
  emailCandidatesFound: number;
  associatedPeopleFound: number;

  phoneCandidatesSaved: number;
  emailCandidatesSaved: number;
  associatedContactsSaved: number;

  duplicateFindingsSkipped: number;

  phones: string[];
  emails: string[];

  associatedContacts: Array<{
    name: string;
    relationship: string;
    phone?: string;
    email?: string;
  }>;

  acceptedSources: Array<{
    title: string;
    url: string;
    hostname: string;
  }>;

  notes: string[];
}

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const BLOCKED_PHONE_NUMBERS =
  new Set([
    "4046562817",
    "8447537825",
  ]);

const BLOCKED_EMAIL_LOCAL_PARTS =
  new Set([
    "applications",
    "application",
    "leasing",
    "lease",
    "rentals",
    "rental",
    "maintenance",
    "careers",
    "career",
    "jobs",
    "job",
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
  ]);

const LEGAL_SUFFIXES =
  new Set([
    "LLC",
    "INC",
    "INCORPORATED",
    "CORP",
    "CORPORATION",
    "COMPANY",
    "CO",
    "LTD",
    "LIMITED",
    "LP",
    "LLP",
    "PLLC",
  ]);

const BUSINESS_NAME_EXPANSIONS:
  Record<string, string> = {
    HMOWNER: "HOMEOWNER",
    HMOWNERS: "HOMEOWNERS",
    HOMEOWN: "HOMEOWNERS",
    HOMEOWNR: "HOMEOWNER",
    HOMEOWNRS: "HOMEOWNERS",
    ASSN: "ASSOCIATION",
    ASSOC: "ASSOCIATION",
    ASSOCN: "ASSOCIATION",
    PROP: "PROPERTY",
    PROPS: "PROPERTIES",
    MGMT: "MANAGEMENT",
    DEV: "DEVELOPMENT",
    INV: "INVESTMENTS",
    GRP: "GROUP",
    CO: "COMPANY",
  };

/*
 * IMPORTANT:
 *
 * Business classification must operate on complete normalized tokens.
 *
 * We never use substring checks such as:
 *
 *   normalized.includes(" CO")
 *
 * because that incorrectly classifies personal names such as:
 *
 *   DENSON CONNIE
 *
 * where "CONNIE" happens to begin with "CO".
 */
const BUSINESS_ENTITY_TOKENS =
  new Set([
    "LLC",
    "INC",
    "INCORPORATED",
    "CORP",
    "CORPORATION",
    "COMPANY",
    "CO",
    "LTD",
    "LIMITED",
    "LP",
    "LLP",
    "PLLC",

    "ASSOCIATION",
    "ASSN",
    "ASSOC",
    "ASSOCN",
    "HOA",

    "HOMEOWNER",
    "HOMEOWNERS",
    "HOMEOWN",
    "HMOWNER",
    "HMOWNERS",

    "REALTY",

    "PROPERTY",
    "PROPERTIES",
    "PROP",
    "PROPS",

    "DEVELOPMENT",
    "DEV",

    "INVESTMENT",
    "INVESTMENTS",
    "INV",

    "ENTERPRISE",
    "ENTERPRISES",

    "PARTNER",
    "PARTNERS",

    "GROUP",
    "GRP",

    "BUILDER",
    "BUILDERS",

    "MANAGEMENT",
    "MGMT",

    "TRUST",
  ]);

/*
 * These words may safely appear immediately after a matched base entity name
 * in a search-result title or page phrase.
 *
 * Distinguishing business-name words such as UNITED, HOLDINGS, CAPITAL,
 * PARTNERS, HOMES, SERVICES, etc. are intentionally absent.
 */
const SAFE_ENTITY_CONTINUATION_WORDS =
  new Set([
    "A",
    "AN",
    "THE",
    "IS",
    "WAS",
    "HAS",

    "ATLANTA",
    "STOCKBRIDGE",
    "GWINNETT",
    "GEORGIA",
    "GA",

    "UPDATED",
    "UPDATE",
    "REVIEWS",
    "REVIEW",
    "PHOTOS",
    "PHOTO",

    "YELP",
    "ZILLOW",
    "FACEBOOK",
    "LINKEDIN",

    "REAL",
    "ESTATE",
    "AGENT",
    "AGENTS",
    "BROKER",
    "BROKERS",

    "PROPERTY",
    "MANAGEMENT",
    "MANAGER",

    "CONTACT",
    "OFFICE",
    "WEBSITE",
    "HOME",
    "ABOUT",

    "EXPERT",
    "LISTING",
    "PREMIER",
    "SERVING",
    "SERVES",
    "LOCATED",
    "BASED",
    "PROVIDES",
    "OFFERS",
  ]);

/* ========================================================================== */
/* Normalization                                                               */
/* ========================================================================== */

function normalizeText(
  value: string,
): string {
  return value
    .toUpperCase()
    .replace(
      /&/g,
      " AND ",
    )
    .replace(
      /[^A-Z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function uniqueStrings(
  values: string[],
): string[] {
  const seen =
    new Set<string>();

  const result:
    string[] =
    [];

  for (
    const value of values
  ) {
    const cleaned =
      normalizeText(
        value,
      );

    if (
      !cleaned ||
      seen.has(
        cleaned,
      )
    ) {
      continue;
    }

    seen.add(
      cleaned,
    );

    result.push(
      cleaned,
    );
  }

  return result;
}

function expandBusinessTokens(
  value: string,
): string {
  return normalizeText(
    value,
  )
    .split(
      " ",
    )
    .map(
      (token) =>
        BUSINESS_NAME_EXPANSIONS[
          token
        ] ??
        token,
    )
    .join(
      " ",
    );
}

function removeLegalSuffix(
  value: string,
): string {
  const tokens =
    normalizeText(
      value,
    )
      .split(
        " ",
      )
      .filter(
        Boolean,
      );

  while (
    tokens.length > 0 &&
    LEGAL_SUFFIXES.has(
      tokens[
        tokens.length - 1
      ],
    )
  ) {
    tokens.pop();
  }

  return tokens.join(
    " ",
  );
}

function homeownerAssociationAliases(
  value: string,
): string[] {
  const normalized =
    normalizeText(
      value,
    );

  const expanded =
    expandBusinessTokens(
      normalized,
    );

  const aliases:
    string[] =
    [];

  for (
    const candidate of [
      normalized,
      expanded,
    ]
  ) {
    if (
      candidate.includes(
        "HOMEOWNERS ASSOCIATION",
      )
    ) {
      aliases.push(
        candidate.replace(
          /\bHOMEOWNERS ASSOCIATION\b/g,
          "HOA",
        ),
      );
    }

    if (
      candidate.includes(
        "HOMEOWNER ASSOCIATION",
      )
    ) {
      aliases.push(
        candidate.replace(
          /\bHOMEOWNER ASSOCIATION\b/g,
          "HOA",
        ),
      );
    }

    const withoutSuffix =
      removeLegalSuffix(
        candidate,
      );

    if (
      /\bHOMEOWNERS$/.test(
        withoutSuffix,
      )
    ) {
      aliases.push(
        `${withoutSuffix} ASSOCIATION`,
      );

      aliases.push(
        withoutSuffix.replace(
          /\bHOMEOWNERS$/,
          "HOA",
        ),
      );
    }
  }

  return aliases;
}

function buildBusinessIdentityAliases(
  formerOwnerName: string,
): BusinessIdentityAliases {
  const original =
    normalizeText(
      formerOwnerName,
    );

  const expanded =
    expandBusinessTokens(
      formerOwnerName,
    );

  const homeownerVariants =
    [
      ...homeownerAssociationAliases(
        original,
      ),

      ...homeownerAssociationAliases(
        expanded,
      ),
    ];

  const strongAliases =
    uniqueStrings([
      original,
      expanded,
      ...homeownerVariants,
    ]);

  const baseAliases =
    uniqueStrings(
      strongAliases
        .map(
          removeLegalSuffix,
        )
        .filter(
          (value) =>
            value
              .split(
                " ",
              )
              .length >= 2,
        ),
    );

  const queryAliases =
    uniqueStrings([
      expanded,
      ...homeownerVariants,
      original,
      ...baseAliases,
    ]);

  return {
    queryAliases,
    strongAliases,
    baseAliases,
  };
}

function normalizePhoneDigits(
  value: string,
): string | undefined {
  let digits =
    value.replace(
      /\D/g,
      "",
    );

  if (
    digits.length === 11 &&
    digits.startsWith(
      "1",
    )
  ) {
    digits =
      digits.slice(
        1,
      );
  }

  if (
    digits.length !== 10
  ) {
    return undefined;
  }

  if (
    BLOCKED_PHONE_NUMBERS.has(
      digits,
    )
  ) {
    return undefined;
  }

  return digits;
}

function formatUsPhone(
  digits: string,
): string {
  return `(${digits.slice(
    0,
    3,
  )}) ${digits.slice(
    3,
    6,
  )}-${digits.slice(
    6,
  )}`;
}

function normalizedPersonName(
  value: string,
): string {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

/* ========================================================================== */
/* Exact entity-boundary matching                                              */
/* ========================================================================== */

function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

function aliasPattern(
  alias: string,
): RegExp {
  const tokens =
    normalizeText(
      alias,
    )
      .split(
        " ",
      )
      .filter(
        Boolean,
      )
      .map(
        escapeRegExp,
      );

  return new RegExp(
    tokens.join(
      "[\\s\\W_]+",
    ),
    "i",
  );
}

function firstContinuationWord(
  remainder: string,
): string | undefined {
  const cleaned =
    remainder
      .replace(
        /^[\s\-|:;,()[\]{}.!/\\]+/,
        "",
      )
      .trim();

  if (
    !cleaned
  ) {
    return undefined;
  }

  const match =
    cleaned.match(
      /^[A-Za-z0-9]+/,
    );

  return match
    ? match[0]
        .toUpperCase()
    : undefined;
}

function safeAliasContinuation(
  remainder: string,
): boolean {
  const word =
    firstContinuationWord(
      remainder,
    );

  if (
    !word
  ) {
    return true;
  }

  if (
    LEGAL_SUFFIXES.has(
      word,
    )
  ) {
    return true;
  }

  return SAFE_ENTITY_CONTINUATION_WORDS.has(
    word,
  );
}

function safeAliasAtStart(
  value: string,
  alias: string,
): boolean {
  const pattern =
    aliasPattern(
      alias,
    );

  const match =
    value.match(
      new RegExp(
        `^\\s*${pattern.source}`,
        "i",
      ),
    );

  if (
    !match
  ) {
    return false;
  }

  const remainder =
    value.slice(
      match[0].length,
    );

  return safeAliasContinuation(
    remainder,
  );
}

function containsSafeAliasOccurrence(
  value: string,
  alias: string,
): boolean {
  const pattern =
    aliasPattern(
      alias,
    );

  const regex =
    new RegExp(
      pattern.source,
      "ig",
    );

  let match:
    RegExpExecArray |
    null;

  while (
    (
      match =
        regex.exec(
          value,
        )
    ) !== null
  ) {
    const remainder =
      value.slice(
        match.index +
        match[0].length,
      );

    if (
      safeAliasContinuation(
        remainder,
      )
    ) {
      return true;
    }

    if (
      regex.lastIndex ===
      match.index
    ) {
      regex.lastIndex +=
        1;
    }
  }

  return false;
}

function titleStartsWithSafeAlias(
  title: string,
  aliases: string[],
): boolean {
  return aliases.some(
    (alias) =>
      safeAliasAtStart(
        title,
        alias,
      ),
  );
}

function titleConnectsPersonToAlias(
  title: string,
  aliases: string[],
): boolean {
  const marker =
    /\s+at\s+/i;

  const match =
    marker.exec(
      title,
    );

  if (
    !match
  ) {
    return false;
  }

  const entityPart =
    title.slice(
      match.index +
      match[0].length,
    );

  return aliases.some(
    (alias) =>
      safeAliasAtStart(
        entityPart,
        alias,
      ),
  );
}

/* ========================================================================== */
/* Entity qualification                                                        */
/* ========================================================================== */

function looksLikeBusinessEntity(
  value: string,
): boolean {
  const tokens =
    normalizeText(
      value,
    )
      .split(
        " ",
      )
      .filter(
        Boolean,
      );

  return tokens.some(
    (token) =>
      BUSINESS_ENTITY_TOKENS.has(
        token,
      ),
  );
}

/* ========================================================================== */
/* Source evidence                                                             */
/* ========================================================================== */

function sourceFromResult(
  result:
    ClaimantLocatorWebSearchResult,
): PublicContactSource {
  return {
    title:
      result.title,

    url:
      result.url,

    hostname:
      result.hostname,

    content:
      result.content,

    rawContent:
      result.rawContent,

    score:
      result.score,
  };
}

function sourceEvidence(
  source:
    PublicContactSource,
): string {
  return [
    source.title,
    source.content,
    source.rawContent ??
      "",
  ].join(
    "\n",
  );
}

function hasGeorgiaContext(
  source:
    PublicContactSource,
): boolean {
  const text =
    sourceEvidence(
      source,
    );

  return (
    /\bGeorgia\b/i.test(
      text,
    ) ||
    /\bGA\b/i.test(
      text,
    ) ||
    /\bAtlanta\b/i.test(
      text,
    ) ||
    /\bStockbridge\b/i.test(
      text,
    ) ||
    /\bGwinnett\b/i.test(
      text,
    )
  );
}

function earlyBodyMatchesAlias(
  source:
    PublicContactSource,
  aliases:
    BusinessIdentityAliases,
): boolean {
  const values = [
    source.rawContent,
    source.content,
  ];

  for (
    const value of values
  ) {
    if (
      !value
    ) {
      continue;
    }

    const early =
      value.slice(
        0,
        5000,
      );

    for (
      const alias of aliases.strongAliases
    ) {
      if (
        containsSafeAliasOccurrence(
          early,
          alias,
        )
      ) {
        return true;
      }
    }

    const welcomeMatch =
      /welcome\s+to\s+/i.exec(
        early,
      );

    if (
      welcomeMatch
    ) {
      const afterWelcome =
        early.slice(
          welcomeMatch.index +
          welcomeMatch[0].length,
        );

      for (
        const alias of aliases.baseAliases
      ) {
        if (
          safeAliasAtStart(
            afterWelcome,
            alias,
          )
        ) {
          return true;
        }
      }
    }

    for (
      const alias of aliases.baseAliases
    ) {
      if (
        safeAliasAtStart(
          early.trimStart(),
          alias,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function safelyMatchesEntity(
  source:
    PublicContactSource,
  aliases:
    BusinessIdentityAliases,
): boolean {
  if (
    aliases.baseAliases.length === 0
  ) {
    return false;
  }

  const titleAliases =
    [
      ...aliases.strongAliases,
      ...aliases.baseAliases,
    ];

  const identityMatch =
    titleStartsWithSafeAlias(
      source.title,
      titleAliases,
    ) ||
    titleConnectsPersonToAlias(
      source.title,
      titleAliases,
    ) ||
    earlyBodyMatchesAlias(
      source,
      aliases,
    );

  if (
    !identityMatch
  ) {
    return false;
  }

  return hasGeorgiaContext(
    source,
  );
}

function mergeSources(
  sources:
    PublicContactSource[],
): PublicContactSource[] {
  const byUrl =
    new Map<
      string,
      PublicContactSource
    >();

  for (
    const source of sources
  ) {
    const key =
      source.url
        .trim()
        .toLowerCase();

    if (
      !key
    ) {
      continue;
    }

    const existing =
      byUrl.get(
        key,
      );

    if (
      !existing
    ) {
      byUrl.set(
        key,
        source,
      );

      continue;
    }

    const existingLength =
      sourceEvidence(
        existing,
      ).length;

    const incomingLength =
      sourceEvidence(
        source,
      ).length;

    byUrl.set(
      key,
      {
        ...(
          incomingLength >
          existingLength
            ? source
            : existing
        ),

        score:
          Math.max(
            existing.score,
            source.score,
          ),
      },
    );
  }

  return [
    ...byUrl.values(),
  ];
}

/* ========================================================================== */
/* Company versus person source separation                                     */
/* ========================================================================== */

function isPersonCentricSource(
  source:
    PublicContactSource,
  aliases:
    BusinessIdentityAliases,
): boolean {
  if (
    titleConnectsPersonToAlias(
      source.title,
      [
        ...aliases.strongAliases,
        ...aliases.baseAliases,
      ],
    )
  ) {
    return true;
  }

  const title =
    normalizeText(
      source.title,
    );

  const relationshipWords = [
    " BROKER ",
    " CEO ",
    " PRESIDENT ",
    " AGENT ",
    " REALTOR ",
    " MANAGER ",
  ];

  const hasRelationship =
    relationshipWords.some(
      (word) =>
        title.includes(
          word,
        ),
    );

  if (
    !hasRelationship
  ) {
    return false;
  }

  return aliases.baseAliases.some(
    (alias) =>
      containsSafeAliasOccurrence(
        source.title,
        alias,
      ),
  );
}

function isCompanyCentricSource(
  source:
    PublicContactSource,
  aliases:
    BusinessIdentityAliases,
): boolean {
  if (
    isPersonCentricSource(
      source,
      aliases,
    )
  ) {
    return false;
  }

  if (
    titleStartsWithSafeAlias(
      source.title,
      [
        ...aliases.strongAliases,
        ...aliases.baseAliases,
      ],
    )
  ) {
    return true;
  }

  const body =
    (
      source.rawContent ??
      source.content
    ).slice(
      0,
      1800,
    );

  const welcome =
    /welcome\s+to\s+/i.exec(
      body,
    );

  if (
    welcome
  ) {
    const afterWelcome =
      body.slice(
        welcome.index +
        welcome[0].length,
      );

    if (
      aliases.baseAliases.some(
        (alias) =>
          safeAliasAtStart(
            afterWelcome,
            alias,
          ),
      )
    ) {
      return true;
    }
  }

  return aliases.strongAliases.some(
    (alias) =>
      safeAliasAtStart(
        body.trimStart(),
        alias,
      ),
  );
}

/* ========================================================================== */
/* Bounded business search                                                     */
/* ========================================================================== */

async function searchBusinessSources({
  record,
  aliases,
}: {
  record:
    DiscoveredRecord;

  aliases:
    BusinessIdentityAliases;
}): Promise<{
  allSources:
    PublicContactSource[];

  acceptedSources:
    PublicContactSource[];

  searchesRun:
    number;
}> {
  const allSources:
    PublicContactSource[] =
    [];

  let searchesRun =
    0;

  const queryAliases =
    aliases.queryAliases.slice(
      0,
      2,
    );

  for (
    const alias of queryAliases
  ) {
    searchesRun +=
      1;

    const search =
      await searchClaimantLocatorWeb({
        query:
          `"${alias}" Georgia "${record.county}" phone email address contact owner broker officer CEO president registered agent`,

        maxResults:
          15,

        searchDepth:
          "advanced",

        includeRawContent:
          "text",
      });

    allSources.push(
      ...search.results.map(
        sourceFromResult,
      ),
    );

    const merged =
      mergeSources(
        allSources,
      );

    const accepted =
      merged.filter(
        (source) =>
          safelyMatchesEntity(
            source,
            aliases,
          ),
      );

    if (
      accepted.length > 0
    ) {
      return {
        allSources:
          merged,

        acceptedSources:
          accepted,

        searchesRun,
      };
    }
  }

  const merged =
    mergeSources(
      allSources,
    );

  return {
    allSources:
      merged,

    acceptedSources:
      merged.filter(
        (source) =>
          safelyMatchesEntity(
            source,
            aliases,
          ),
      ),

    searchesRun,
  };
}

/* ========================================================================== */
/* Phones                                                                      */
/* ========================================================================== */

function extractPhones(
  text: string,
): string[] {
  const pattern =
    /(?:\+?1[\s.\-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.\-]\d{3}[\s.\-]\d{4}/g;

  const matches =
    text.match(
      pattern,
    ) ??
    [];

  const phones:
    string[] =
    [];

  const seen =
    new Set<string>();

  for (
    const match of matches
  ) {
    const digits =
      normalizePhoneDigits(
        match,
      );

    if (
      !digits ||
      seen.has(
        digits,
      )
    ) {
      continue;
    }

    seen.add(
      digits,
    );

    phones.push(
      formatUsPhone(
        digits,
      ),
    );
  }

  return phones;
}

function phoneVariants(
  phone: string,
): string[] {
  const digits =
    phone.replace(
      /\D/g,
      "",
    );

  if (
    digits.length !== 10
  ) {
    return [
      phone,
    ];
  }

  return [
    phone,
    digits,
    `${digits.slice(
      0,
      3,
    )}-${digits.slice(
      3,
      6,
    )}-${digits.slice(
      6,
    )}`,
    `${digits.slice(
      0,
      3,
    )}.${digits.slice(
      3,
      6,
    )}.${digits.slice(
      6,
    )}`,
    `${digits.slice(
      0,
      3,
    )} ${digits.slice(
      3,
      6,
    )} ${digits.slice(
      6,
    )}`,
  ];
}

function phoneContext(
  text: string,
  phone: string,
): string {
  const upper =
    text.toUpperCase();

  for (
    const variant of phoneVariants(
      phone,
    )
  ) {
    const index =
      upper.indexOf(
        variant.toUpperCase(),
      );

    if (
      index < 0
    ) {
      continue;
    }

    return upper.slice(
      Math.max(
        0,
        index - 180,
      ),
      Math.min(
        upper.length,
        index +
          variant.length +
          180,
      ),
    );
  }

  return "";
}

function companyPhoneScore(
  source:
    PublicContactSource,
  phone: string,
): number {
  const evidence =
    normalizeText(
      sourceEvidence(
        source,
      ),
    );

  const context =
    normalizeText(
      phoneContext(
        sourceEvidence(
          source,
        ),
        phone,
      ),
    );

  let score =
    source.score *
    100;

  if (
    evidence.includes(
      "CALL OUR OFFICE",
    )
  ) {
    score +=
      80;
  }

  if (
    context.includes(
      "OFFICE",
    )
  ) {
    score +=
      40;
  }

  if (
    context.includes(
      "MAIN",
    )
  ) {
    score +=
      20;
  }

  if (
    context.includes(
      "DIRECT",
    ) ||
    context.includes(
      "MOBILE",
    ) ||
    context.includes(
      "CELL",
    )
  ) {
    score -=
      30;
  }

  return score;
}

function collectCompanyPhones({
  sources,
  aliases,
  excludedPhoneDigits,
}: {
  sources:
    PublicContactSource[];

  aliases:
    BusinessIdentityAliases;

  excludedPhoneDigits:
    Set<string>;
}): PhoneFinding[] {
  const byPhone =
    new Map<
      string,
      PhoneFinding
    >();

  const scores =
    new Map<
      string,
      number
    >();

  for (
    const source of sources
  ) {
    if (
      !isCompanyCentricSource(
        source,
        aliases,
      )
    ) {
      continue;
    }

    const phones =
      extractPhones(
        sourceEvidence(
          source,
        ),
      );

    for (
      const phone of phones
    ) {
      const digits =
        phone.replace(
          /\D/g,
          "",
        );

      if (
        excludedPhoneDigits.has(
          digits,
        )
      ) {
        continue;
      }

      const score =
        companyPhoneScore(
          source,
          phone,
        );

      const current =
        scores.get(
          digits,
        ) ??
        Number.NEGATIVE_INFINITY;

      if (
        score <= current
      ) {
        continue;
      }

      scores.set(
        digits,
        score,
      );

      byPhone.set(
        digits,
        {
          value:
            phone,

          source,
        },
      );
    }
  }

  return [
    ...byPhone.values(),
  ]
    .sort(
      (
        left,
        right,
      ) =>
        companyPhoneScore(
          right.source,
          right.value,
        ) -
        companyPhoneScore(
          left.source,
          left.value,
        ),
    )
    .slice(
      0,
      3,
    );
}

/* ========================================================================== */
/* Emails                                                                      */
/* ========================================================================== */

function usableEmail(
  value: string,
): boolean {
  const email =
    value
      .trim()
      .toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    return false;
  }

  const localPart =
    email.split(
      "@",
    )[0];

  return !BLOCKED_EMAIL_LOCAL_PARTS.has(
    localPart,
  );
}

function extractEmails(
  text: string,
): string[] {
  const matches =
    text.match(
      /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi,
    ) ??
    [];

  const seen =
    new Set<string>();

  const emails:
    string[] =
    [];

  for (
    const match of matches
  ) {
    const email =
      match
        .trim()
        .toLowerCase();

    if (
      !usableEmail(
        email,
      ) ||
      seen.has(
        email,
      )
    ) {
      continue;
    }

    seen.add(
      email,
    );

    emails.push(
      email,
    );
  }

  return emails;
}

function collectCompanyEmails({
  sources,
  aliases,
}: {
  sources:
    PublicContactSource[];

  aliases:
    BusinessIdentityAliases;
}): EmailFinding[] {
  const byEmail =
    new Map<
      string,
      EmailFinding
    >();

  for (
    const source of sources
  ) {
    if (
      !isCompanyCentricSource(
        source,
        aliases,
      )
    ) {
      continue;
    }

    const emails =
      extractEmails(
        sourceEvidence(
          source,
        ),
      );

    for (
      const email of emails
    ) {
      const existing =
        byEmail.get(
          email,
        );

      if (
        existing &&
        existing.source.score >=
          source.score
      ) {
        continue;
      }

      byEmail.set(
        email,
        {
          value:
            email,

          source,
        },
      );
    }
  }

  return [
    ...byEmail.values(),
  ]
    .sort(
      (
        left,
        right,
      ) =>
        right.source.score -
        left.source.score,
    )
    .slice(
      0,
      3,
    );
}

/* ========================================================================== */
/* Associated people                                                          */
/* ========================================================================== */

function relationshipLabel(
  value: string,
): string {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .slice(
      0,
      80,
    );
}

function relationshipSpecificity(
  value: string,
): number {
  return (
    value.length +
    (
      value.match(
        /[&,/]/g,
      ) ??
      []
    ).length *
      20
  );
}

function validPersonName(
  value: string,
): boolean {
  const normalized =
    normalizedPersonName(
      value,
    );

  const words =
    normalized.split(
      " ",
    );

  return (
    words.length >= 2 &&
    words.length <= 4 &&
    words.every(
      (word) =>
        /^[A-Za-z][A-Za-z.'-]*$/.test(
          word,
        ),
    )
  );
}

function extractAssociatedPeopleFromSource(
  source:
    PublicContactSource,
  aliases:
    BusinessIdentityAliases,
): AssociatedPerson[] {
  const people:
    AssociatedPerson[] =
    [];

  const evidence =
    sourceEvidence(
      source,
    );

  const brokerPattern =
    /\bOur\s+Broker\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})\b/g;

  let brokerMatch:
    RegExpExecArray |
    null;

  while (
    (
      brokerMatch =
        brokerPattern.exec(
          evidence,
        )
    ) !== null
  ) {
    const name =
      normalizedPersonName(
        brokerMatch[1],
      );

    if (
      validPersonName(
        name,
      )
    ) {
      people.push({
        name,

        relationship:
          "Broker",

        source,
      });
    }
  }

  const titleMatch =
    source.title.match(
      /^(.{2,80}?)\s+-\s+(.{2,80}?)\s+at\s+(.+)$/i,
    );

  if (
    titleMatch
  ) {
    const name =
      normalizedPersonName(
        titleMatch[1],
      );

    const relationship =
      relationshipLabel(
        titleMatch[2],
      );

    const companyPart =
      titleMatch[3];

    const companyMatches =
      [
        ...aliases.strongAliases,
        ...aliases.baseAliases,
      ].some(
        (alias) =>
          safeAliasAtStart(
            companyPart,
            alias,
          ),
      );

    if (
      validPersonName(
        name,
      ) &&
      companyMatches
    ) {
      people.push({
        name,
        relationship,
        source,
      });
    }
  }

  return people;
}

function collectAssociatedPeople(
  sources:
    PublicContactSource[],
  aliases:
    BusinessIdentityAliases,
): AssociatedPerson[] {
  const byName =
    new Map<
      string,
      AssociatedPerson
    >();

  for (
    const source of sources
  ) {
    const people =
      extractAssociatedPeopleFromSource(
        source,
        aliases,
      );

    for (
      const person of people
    ) {
      const key =
        normalizeText(
          person.name,
        );

      const existing =
        byName.get(
          key,
        );

      if (
        !existing
      ) {
        byName.set(
          key,
          person,
        );

        continue;
      }

      if (
        relationshipSpecificity(
          person.relationship,
        ) >
        relationshipSpecificity(
          existing.relationship,
        )
      ) {
        byName.set(
          key,
          person,
        );
      }
    }
  }

  return [
    ...byName.values(),
  ].slice(
    0,
    3,
  );
}

/* ========================================================================== */
/* Associated-person contact research                                          */
/* ========================================================================== */

function sourceContainsPersonAndEntity({
  source,
  personName,
  aliases,
}: {
  source:
    PublicContactSource;

  personName:
    string;

  aliases:
    BusinessIdentityAliases;
}): boolean {
  const text =
    normalizeText(
      sourceEvidence(
        source,
      ),
    );

  const personPresent =
    text.includes(
      normalizeText(
        personName,
      ),
    );

  if (
    !personPresent
  ) {
    return false;
  }

  const entityPresent =
    [
      ...aliases.strongAliases,
      ...aliases.baseAliases,
    ].some(
      (alias) =>
        containsSafeAliasOccurrence(
          sourceEvidence(
            source,
          ),
          alias,
        ),
    );

  return (
    entityPresent &&
    hasGeorgiaContext(
      source,
    )
  );
}

function personPhoneScore({
  source,
  personName,
  phone,
}: {
  source:
    PublicContactSource;

  personName:
    string;

  phone:
    string;
}): number {
  const normalizedTitle =
    normalizeText(
      source.title,
    );

  const normalizedPerson =
    normalizeText(
      personName,
    );

  const context =
    normalizeText(
      phoneContext(
        sourceEvidence(
          source,
        ),
        phone,
      ),
    );

  let score =
    source.score *
    100;

  if (
    normalizedTitle.startsWith(
      normalizedPerson,
    )
  ) {
    score +=
      120;
  }

  if (
    context.includes(
      normalizedPerson,
    )
  ) {
    score +=
      80;
  }

  const personWords =
    normalizedPerson.split(
      " ",
    );

  const lastName =
    personWords[
      personWords.length - 1
    ];

  if (
    lastName &&
    context.includes(
      lastName,
    )
  ) {
    score +=
      30;
  }

  if (
    context.includes(
      "DIRECT",
    ) ||
    context.includes(
      "MOBILE",
    ) ||
    context.includes(
      "CELL",
    )
  ) {
    score +=
      35;
  }

  if (
    context.includes(
      "BROKER",
    ) ||
    context.includes(
      "CEO",
    ) ||
    context.includes(
      "AGENT",
    )
  ) {
    score +=
      20;
  }

  if (
    context.includes(
      "CALL OUR OFFICE",
    ) ||
    context.includes(
      "OFFICE PHONE",
    )
  ) {
    score -=
      80;
  }

  return score;
}

function personEmailScore({
  source,
  personName,
  email,
}: {
  source:
    PublicContactSource;

  personName:
    string;

  email:
    string;
}): number {
  const title =
    normalizeText(
      source.title,
    );

  const person =
    normalizeText(
      personName,
    );

  const evidence =
    sourceEvidence(
      source,
    );

  const emailIndex =
    evidence
      .toLowerCase()
      .indexOf(
        email.toLowerCase(),
      );

  const context =
    emailIndex >= 0
      ? normalizeText(
          evidence.slice(
            Math.max(
              0,
              emailIndex - 180,
            ),
            Math.min(
              evidence.length,
              emailIndex +
                email.length +
                180,
            ),
          ),
        )
      : "";

  let score =
    source.score *
    100;

  if (
    title.startsWith(
      person,
    )
  ) {
    score +=
      120;
  }

  if (
    context.includes(
      person,
    )
  ) {
    score +=
      80;
  }

  return score;
}

async function findAssociatedPersonContact({
  person,
  aliases,
}: {
  person:
    AssociatedPerson;

  aliases:
    BusinessIdentityAliases;
}): Promise<
  AssociatedPersonContact |
  undefined
> {
  const companyAlias =
    aliases.queryAliases[0] ??
    aliases.baseAliases[0];

  if (
    !companyAlias
  ) {
    return undefined;
  }

  const search =
    await searchClaimantLocatorWeb({
      query:
        `"${person.name}" "${companyAlias}" Georgia phone email`,

      maxResults:
        10,

      searchDepth:
        "basic",

      includeRawContent:
        "text",
    });

  const accepted =
    search.results
      .map(
        sourceFromResult,
      )
      .filter(
        (source) =>
          sourceContainsPersonAndEntity({
            source,

            personName:
              person.name,

            aliases,
          }),
      );

  let best:
    AssociatedPersonContact |
    undefined;

  let bestScore =
    Number.NEGATIVE_INFINITY;

  for (
    const source of accepted
  ) {
    const phones =
      extractPhones(
        sourceEvidence(
          source,
        ),
      );

    const emails =
      extractEmails(
        sourceEvidence(
          source,
        ),
      );

    let selectedPhone:
      string |
      undefined;

    let selectedPhoneScore =
      Number.NEGATIVE_INFINITY;

    for (
      const phone of phones
    ) {
      const score =
        personPhoneScore({
          source,

          personName:
            person.name,

          phone,
        });

      if (
        score >
        selectedPhoneScore
      ) {
        selectedPhone =
          phone;

        selectedPhoneScore =
          score;
      }
    }

    let selectedEmail:
      string |
      undefined;

    let selectedEmailScore =
      Number.NEGATIVE_INFINITY;

    for (
      const email of emails
    ) {
      const score =
        personEmailScore({
          source,

          personName:
            person.name,

          email,
        });

      if (
        score >
        selectedEmailScore
      ) {
        selectedEmail =
          email;

        selectedEmailScore =
          score;
      }
    }

    if (
      !selectedPhone &&
      !selectedEmail
    ) {
      continue;
    }

    const titleStartsWithPerson =
      normalizeText(
        source.title,
      ).startsWith(
        normalizeText(
          person.name,
        ),
      );

    if (
      !titleStartsWithPerson &&
      selectedPhoneScore < 130 &&
      selectedEmailScore < 130
    ) {
      continue;
    }

    const score =
      Math.max(
        selectedPhoneScore,
        selectedEmailScore,
      );

    if (
      score <= bestScore
    ) {
      continue;
    }

    bestScore =
      score;

    best = {
      name:
        person.name,

      relationship:
        person.relationship,

      phone:
        selectedPhone,

      email:
        selectedEmail,

      source,
    };
  }

  return best;
}

/* ========================================================================== */
/* Duplicate handling                                                         */
/* ========================================================================== */

function isDuplicateFindingError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.message
      .toLowerCase()
      .includes(
        "already recorded",
      )
  );
}

/* ========================================================================== */
/* Production research                                                        */
/* ========================================================================== */

export async function researchPublicWebBusinessContacts({
  record,
  actorUserId,
}: {
  record:
    DiscoveredRecord;

  actorUserId:
    string;
}): Promise<
  PublicWebLocatorResearchResult
> {
  const notes:
    string[] =
    [];

  if (
    record.state !== "GA"
  ) {
    return {
      discoveredRecordId:
        record.id,

      formerOwnerName:
        record.formerOwnerName,

      status:
        "unsupported",

      acceptedSourceCount:
        0,

      rejectedSourceCount:
        0,

      phoneCandidatesFound:
        0,

      emailCandidatesFound:
        0,

      associatedPeopleFound:
        0,

      phoneCandidatesSaved:
        0,

      emailCandidatesSaved:
        0,

      associatedContactsSaved:
        0,

      duplicateFindingsSkipped:
        0,

      phones:
        [],

      emails:
        [],

      associatedContacts:
        [],

      acceptedSources:
        [],

      notes: [
        "This production public-web adapter is currently activated only for Georgia business/entity claimant research.",
      ],
    };
  }

  if (
    !looksLikeBusinessEntity(
      record.formerOwnerName,
    )
  ) {
    return {
      discoveredRecordId:
        record.id,

      formerOwnerName:
        record.formerOwnerName,

      status:
        "unsupported",

      acceptedSourceCount:
        0,

      rejectedSourceCount:
        0,

      phoneCandidatesFound:
        0,

      emailCandidatesFound:
        0,

      associatedPeopleFound:
        0,

      phoneCandidatesSaved:
        0,

      emailCandidatesSaved:
        0,

      associatedContactsSaved:
        0,

      duplicateFindingsSkipped:
        0,

      phones:
        [],

      emails:
        [],

      associatedContacts:
        [],

      acceptedSources:
        [],

      notes: [
        "The former-owner name was not classified as a business/entity name. Individual claimant public-web automation remains intentionally disabled until a separate identity-safe adapter is implemented.",
      ],
    };
  }

  const aliases =
    buildBusinessIdentityAliases(
      record.formerOwnerName,
    );

  const sourceSearch =
    await searchBusinessSources({
      record,
      aliases,
    });

  const acceptedSources =
    sourceSearch.acceptedSources;

  const rejectedSourceCount =
    sourceSearch.allSources.length -
    acceptedSources.length;

  notes.push(
    `Business-name normalization produced ${aliases.queryAliases.length} bounded identity form(s); ${sourceSearch.searchesRun} public-web search(es) were required.`,
  );

  notes.push(
    "Business/entity classification uses complete normalized tokens only. Personal-name substrings are not treated as entity indicators.",
  );

  notes.push(
    "Base-name matches are rejected when the matched name continues with an unapproved distinguishing business-name word.",
  );

  if (
    acceptedSources.length === 0
  ) {
    return {
      discoveredRecordId:
        record.id,

      formerOwnerName:
        record.formerOwnerName,

      status:
        "no_safe_sources",

      acceptedSourceCount:
        0,

      rejectedSourceCount,

      phoneCandidatesFound:
        0,

      emailCandidatesFound:
        0,

      associatedPeopleFound:
        0,

      phoneCandidatesSaved:
        0,

      emailCandidatesSaved:
        0,

      associatedContactsSaved:
        0,

      duplicateFindingsSkipped:
        0,

      phones:
        [],

      emails:
        [],

      associatedContacts:
        [],

      acceptedSources:
        [],

      notes: [
        ...notes,

        "Public-web results were returned, but none passed the strict Georgia entity identity and geography gate. No contact information was saved.",
      ],
    };
  }

  const associatedPeople =
    collectAssociatedPeople(
      acceptedSources,
      aliases,
    );

  const associatedContacts:
    AssociatedPersonContact[] =
    [];

  for (
    const person of associatedPeople.slice(
      0,
      2,
    )
  ) {
    const contact =
      await findAssociatedPersonContact({
        person,
        aliases,
      });

    if (
      !contact
    ) {
      notes.push(
        `${person.name} was explicitly associated with the entity, but no person-specific phone/email result passed the contact-role gate.`,
      );

      continue;
    }

    associatedContacts.push(
      contact,
    );
  }

  const associatedPhoneDigits =
    new Set(
      associatedContacts
        .map(
          (contact) =>
            contact.phone
              ?.replace(
                /\D/g,
                "",
              ),
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(
              value,
            ),
        ),
    );

  const phones =
    collectCompanyPhones({
      sources:
        acceptedSources,

      aliases,

      excludedPhoneDigits:
        associatedPhoneDigits,
    });

  const emails =
    collectCompanyEmails({
      sources:
        acceptedSources,

      aliases,
    });

  const retrievalDate =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  let phoneCandidatesSaved =
    0;

  let emailCandidatesSaved =
    0;

  let associatedContactsSaved =
    0;

  let duplicateFindingsSkipped =
    0;

  for (
    const finding of phones
  ) {
    try {
      await addClaimantLocatorCandidate({
        discoveredRecordId:
          record.id,

        actorUserId,

        kind:
          "phone",

        value:
          finding.value,

        sourceName:
          finding.source.title,

        sourceUrl:
          finding.source.url,

        sourceDate:
          retrievalDate,
      });

      phoneCandidatesSaved +=
        1;
    } catch (
      error
    ) {
      if (
        isDuplicateFindingError(
          error,
        )
      ) {
        duplicateFindingsSkipped +=
          1;

        continue;
      }

      throw error;
    }
  }

  for (
    const finding of emails
  ) {
    try {
      await addClaimantLocatorCandidate({
        discoveredRecordId:
          record.id,

        actorUserId,

        kind:
          "email",

        value:
          finding.value,

        sourceName:
          finding.source.title,

        sourceUrl:
          finding.source.url,

        sourceDate:
          retrievalDate,
      });

      emailCandidatesSaved +=
        1;
    } catch (
      error
    ) {
      if (
        isDuplicateFindingError(
          error,
        )
      ) {
        duplicateFindingsSkipped +=
          1;

        continue;
      }

      throw error;
    }
  }

  const returnedAssociatedContacts: Array<{
    name: string;
    relationship: string;
    phone?: string;
    email?: string;
  }> =
    [];

  for (
    const contact of associatedContacts
  ) {
    returnedAssociatedContacts.push({
      name:
        contact.name,

      relationship:
        contact.relationship,

      phone:
        contact.phone,

      email:
        contact.email,
    });

    try {
      await addClaimantLocatorAssociatedContact({
        discoveredRecordId:
          record.id,

        actorUserId,

        name:
          contact.name,

        relationship:
          contact.relationship,

        phone:
          contact.phone,

        email:
          contact.email,

        sourceName:
          contact.source.title,

        sourceUrl:
          contact.source.url,

        sourceDate:
          retrievalDate,
      });

      associatedContactsSaved +=
        1;
    } catch (
      error
    ) {
      if (
        isDuplicateFindingError(
          error,
        )
      ) {
        duplicateFindingsSkipped +=
          1;

        continue;
      }

      throw error;
    }
  }

  notes.push(
    "Company-level phone/email sources and person-specific associated-contact sources are evaluated separately.",
  );

  notes.push(
    "A phone selected as an associated person's direct contact is excluded from the company phone candidate lane during the same research run.",
  );

  notes.push(
    "Generic company office numbers are not assigned to an associated person unless person-specific evidence supports that assignment.",
  );

  notes.push(
    "Function-specific inboxes such as applications, leasing, maintenance, careers, and no-reply addresses were excluded from claimant email candidates.",
  );

  notes.push(
    "County abbreviations and clearly truncated entity tokens may be expanded only for search and identity matching. The official former-owner name retained on the discovered record is never rewritten.",
  );

  notes.push(
    "All automatically collected public-web findings remain candidate data until DueQuity review.",
  );

  const anyContactData =
    phones.length > 0 ||
    emails.length > 0 ||
    returnedAssociatedContacts.length >
      0;

  return {
    discoveredRecordId:
      record.id,

    formerOwnerName:
      record.formerOwnerName,

    status:
      anyContactData
        ? "researched"
        : "no_contact_data",

    acceptedSourceCount:
      acceptedSources.length,

    rejectedSourceCount,

    phoneCandidatesFound:
      phones.length,

    emailCandidatesFound:
      emails.length,

    associatedPeopleFound:
      associatedPeople.length,

    phoneCandidatesSaved,

    emailCandidatesSaved,

    associatedContactsSaved,

    duplicateFindingsSkipped,

    phones:
      phones.map(
        (finding) =>
          finding.value,
      ),

    emails:
      emails.map(
        (finding) =>
          finding.value,
      ),

    associatedContacts:
      returnedAssociatedContacts,

    acceptedSources:
      acceptedSources.map(
        (source) => ({
          title:
            source.title,

          url:
            source.url,

          hostname:
            source.hostname,
        }),
      ),

    notes,
  };
}