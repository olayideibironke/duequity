import "server-only";

import {
  addClaimantLocatorCandidate,
  addClaimantLocatorIdentity,
  getDiscoveredRecordEnrichment,
  type ClaimantLocatorCandidate,
} from "@/server/discovered-record-enrichment-store";

import type {
  DiscoveredRecord,
} from "@/server/discovered-record-store";

import {
  searchClaimantLocatorWeb,
  type ClaimantLocatorWebSearchResult,
} from "@/server/claimant-locator-web-research";

type IndividualResearchStatus =
  | "researched"
  | "unsupported"
  | "missing_identity_anchor"
  | "no_safe_sources"
  | "no_contact_data";

type IndividualAnchorKind =
  | "mailing_address"
  | "property_address"
  | "parcel"
  | "case";

interface IndividualIdentityAnchor {
  kind: IndividualAnchorKind;
  label: string;
  queryText: string;
  sourceName: string;
  streetNumber?: string;
  streetTokens: string[];
  city?: string;
  postal5?: string;
  compactIdentifier?: string;
  priority: number;
}

interface IndividualPublicSource {
  title: string;
  url: string;
  hostname: string;
  content: string;
  rawContent?: string;
  score: number;
}

interface ContactFinding {
  value: string;
  source: IndividualPublicSource;
}

interface StructuredSourceName {
  firstName: string;
  lastName: string;
  searchAliases: string[];
}

export interface IndividualPublicWebResearchResult {
  discoveredRecordId: string;
  formerOwnerName: string;
  status: IndividualResearchStatus;

  nameAliases: string[];

  identityAnchors: Array<{
    kind: IndividualAnchorKind;
    label: string;
    sourceName: string;
  }>;

  searchesRun: number;

  acceptedSourceCount: number;
  rejectedSourceCount: number;

  phoneCandidatesFound: number;
  emailCandidatesFound: number;

  identityCandidatesSaved: number;
  phoneCandidatesSaved: number;
  emailCandidatesSaved: number;

  duplicateFindingsSkipped: number;

  phones: string[];
  emails: string[];

  acceptedSources: Array<{
    title: string;
    url: string;
    hostname: string;
  }>;

  notes: string[];
}

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
    "HOA",
    "HOMEOWNER",
    "HOMEOWNERS",
    "REALTY",
    "PROPERTY",
    "PROPERTIES",
    "DEVELOPMENT",
    "INVESTMENT",
    "INVESTMENTS",
    "ENTERPRISE",
    "ENTERPRISES",
    "PARTNER",
    "PARTNERS",
    "GROUP",
    "BUILDER",
    "BUILDERS",
    "MANAGEMENT",
  ]);

const NON_INDIVIDUAL_TOKENS =
  new Set([
    "ETAL",
    "ET",
    "AL",
    "TRUST",
    "TRUSTEE",
    "TRUSTEES",
    "HEIR",
    "HEIRS",
    "ESTATE",
    "DECEASED",
    "DECEDENT",
    "DEC",
  ]);

const NAME_NOISE_TOKENS =
  new Set([
    "MR",
    "MRS",
    "MS",
    "MISS",
    "DR",
    "JR",
    "SR",
    "II",
    "III",
    "IV",
  ]);

const STREET_SUFFIX_TOKENS =
  new Set([
    "ST",
    "STREET",
    "RD",
    "ROAD",
    "DR",
    "DRIVE",
    "LN",
    "LANE",
    "CT",
    "COURT",
    "AVE",
    "AVENUE",
    "BLVD",
    "BOULEVARD",
    "WAY",
    "TRL",
    "TRAIL",
    "PL",
    "PLACE",
    "PKWY",
    "PARKWAY",
    "HWY",
    "HIGHWAY",
    "TER",
    "TERRACE",
    "CIR",
    "CIRCLE",
  ]);

const US_STATE_CODES =
  new Set([
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "DC",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
  ]);

const OFFICIAL_ANCHOR_SOURCE_WORDS = [
  "COUNTY",
  "ASSESSOR",
  "ASSESSMENT",
  "TAX",
  "GIS",
  "CLERK",
  "COURT",
  "DEED",
  "PROPERTY",
  "RECORDER",
  "REGISTER",
  "GOVERNMENT",
];

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
    "info",
    "support",
    "office",
    "contact",
    "admin",
    "hello",
  ]);

const RELATIVE_CONTEXT_WORDS = [
  "RELATIVE",
  "RELATIVES",
  "RELATED",
  "ASSOCIATE",
  "ASSOCIATES",
  "ASSOCIATED",
  "HOUSEHOLD",
  "HOUSEHOLD MEMBER",
  "FAMILY",
  "FAMILY MEMBER",
];

/* ========================================================================== */
/* Normalization                                                               */
/* ========================================================================== */

function normalizeText(
  value: string,
): string {
  return value
    .normalize(
      "NFKD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
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

function normalizeCompact(
  value: string,
): string {
  return normalizeText(
    value,
  ).replace(
    /\s+/g,
    "",
  );
}

function uniqueStrings(
  values: string[],
): string[] {
  const seen =
    new Set<string>();

  const result:
    string[] = [];

  for (
    const value of values
  ) {
    const normalized =
      normalizeText(
        value,
      );

    if (
      !normalized ||
      seen.has(
        normalized,
      )
    ) {
      continue;
    }

    seen.add(
      normalized,
    );

    result.push(
      normalized,
    );
  }

  return result;
}

/* ========================================================================== */
/* Owner qualification                                                        */
/* ========================================================================== */

function ownerTokens(
  value: string,
): string[] {
  return normalizeText(
    value,
  )
    .split(
      " ",
    )
    .filter(
      Boolean,
    );
}

function looksLikeBusinessEntity(
  value: string,
): boolean {
  return ownerTokens(
    value,
  ).some(
    (token) =>
      BUSINESS_ENTITY_TOKENS.has(
        token,
      ),
  );
}

function looksLikeNonIndividualOwner(
  value: string,
): boolean {
  if (
    value.includes(
      "&",
    )
  ) {
    return true;
  }

  const tokens =
    ownerTokens(
      value,
    );

  if (
    tokens.includes(
      "AND",
    )
  ) {
    return true;
  }

  if (
    tokens.includes(
      "ETAL",
    ) ||
    (
      tokens.includes(
        "ET",
      ) &&
      tokens.includes(
        "AL",
      )
    )
  ) {
    return true;
  }

  return tokens.some(
    (token) =>
      NON_INDIVIDUAL_TOKENS.has(
        token,
      ),
  );
}

/* ========================================================================== */
/* Source-listed identity                                                      */
/* ========================================================================== */

function structuredSourceName(
  value: string,
): StructuredSourceName | undefined {
  if (
    looksLikeBusinessEntity(
      value,
    ) ||
    looksLikeNonIndividualOwner(
      value,
    )
  ) {
    return undefined;
  }

  const pieces =
    value
      .split(
        ",",
      )
      .map(
        (piece) =>
          piece
            .replace(
              /\s+/g,
              " ",
            )
            .trim(),
      )
      .filter(
        Boolean,
      );

  /*
   * We split identity only when the official source explicitly supplies
   * exactly one comma in LAST, GIVEN format.
   *
   * No comma means no first/last-name inference.
   */
  if (
    pieces.length !==
    2
  ) {
    return undefined;
  }

  const lastName =
    pieces[0];

  const givenSide =
    pieces[1];

  const firstName =
    givenSide
      .split(
        /\s+/,
      )
      .filter(
        Boolean,
      )[0];

  /*
   * Very short right-hand values are commonly truncated source text.
   *
   * Example:
   *
   *   RODRIGUEZ ZAPATA, BR
   *
   * We refuse to manufacture a first name from that.
   */
  if (
    !lastName ||
    !firstName ||
    normalizeText(
      firstName,
    ).length < 3
  ) {
    return undefined;
  }

  const normalizedGiven =
    normalizeText(
      givenSide,
    );

  const normalizedLast =
    normalizeText(
      lastName,
    );

  if (
    !normalizedGiven ||
    !normalizedLast
  ) {
    return undefined;
  }

  return {
    firstName,

    lastName,

    searchAliases:
      uniqueStrings([
        `${normalizedGiven} ${normalizedLast}`,

        `${normalizedLast} ${normalizedGiven}`,
      ]),
  };
}

function individualNameAliases(
  value: string,
): string[] {
  const structured =
    structuredSourceName(
      value,
    );

  if (
    structured
  ) {
    return structured
      .searchAliases;
  }

  const tokens =
    ownerTokens(
      value,
    ).filter(
      (token) =>
        !NAME_NOISE_TOKENS.has(
          token,
        ) &&
        !NON_INDIVIDUAL_TOKENS.has(
          token,
        ),
    );

  if (
    tokens.length < 2 ||
    tokens.length > 6
  ) {
    return [];
  }

  const aliases = [
    tokens.join(
      " ",
    ),
  ];

  /*
   * Two-token names may be searched in both orders because another
   * independent identity anchor is still required.
   */
  if (
    tokens.length ===
    2
  ) {
    aliases.push(
      `${tokens[1]} ${tokens[0]}`,
    );
  }

  return uniqueStrings(
    aliases,
  );
}

/* ========================================================================== */
/* Identity anchors                                                           */
/* ========================================================================== */

function officialAnchorSource(
  candidate:
    ClaimantLocatorCandidate,
): boolean {
  if (
    candidate.status ===
    "verified"
  ) {
    return true;
  }

  const sourceName =
    normalizeText(
      candidate.source
        .sourceName,
    );

  return OFFICIAL_ANCHOR_SOURCE_WORDS.some(
    (word) =>
      sourceName.includes(
        word,
      ),
  );
}

function addressStreetNumber(
  value: string,
): string | undefined {
  return value
    .trim()
    .match(
      /^(\d{1,8})\b/,
    )?.[1];
}

function addressPostal5(
  value: string,
): string | undefined {
  return value.match(
    /\b(\d{5})(?:-\d{4})?\b/,
  )?.[1];
}

function significantStreetTokens(
  value: string,
): string[] {
  return normalizeText(
    value,
  )
    .split(
      " ",
    )
    .filter(
      (token) =>
        Boolean(
          token,
        ) &&
        !/^\d+$/.test(
          token,
        ) &&
        !/^\d{5}(?:\d{4})?$/.test(
          token,
        ) &&
        !US_STATE_CODES.has(
          token,
        ) &&
        !STREET_SUFFIX_TOKENS.has(
          token,
        ),
    )
    .slice(
      0,
      4,
    );
}

function propertyAddressAnchor(
  record:
    DiscoveredRecord,
): IndividualIdentityAnchor | undefined {
  const address =
    record.addressLine1
      ?.trim();

  if (
    !address
  ) {
    return undefined;
  }

  const streetNumber =
    addressStreetNumber(
      address,
    );

  const city =
    record.city
      ?.trim();

  const postal5 =
    record.postalCode
      ?.match(
        /\d{5}/,
      )?.[0];

  if (
    !streetNumber &&
    !(
      city &&
      postal5
    )
  ) {
    return undefined;
  }

  const label = [
    address,
    city,
    record.state,
    postal5,
  ]
    .filter(
      Boolean,
    )
    .join(
      ", ",
    );

  return {
    kind:
      "property_address",

    label,

    queryText:
      label,

    sourceName:
      record.sourceName,

    streetNumber,

    streetTokens:
      significantStreetTokens(
        address,
      ),

    city:
      city
        ? normalizeText(
            city,
          )
        : undefined,

    postal5,

    priority:
      80,
  };
}

function identifierAnchor(
  record:
    DiscoveredRecord,
  kind:
    | "parcel"
    | "case",
  value:
    string | undefined,
  priority:
    number,
): IndividualIdentityAnchor | undefined {
  const trimmed =
    value?.trim();

  if (
    !trimmed
  ) {
    return undefined;
  }

  const compact =
    normalizeCompact(
      trimmed,
    );

  /*
   * Avoid weak generic identifiers such as a two-digit item number.
   */
  if (
    compact.length <
    6
  ) {
    return undefined;
  }

  return {
    kind,

    label:
      trimmed,

    queryText:
      `${trimmed} ${record.county} ${record.state}`,

    sourceName:
      record.sourceName,

    streetTokens:
      [],

    compactIdentifier:
      compact,

    priority,
  };
}

function mailingAddressAnchors(
  candidates:
    ClaimantLocatorCandidate[],
): IndividualIdentityAnchor[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.kind ===
          "mailing_address" &&
        candidate.status !==
          "rejected" &&
        officialAnchorSource(
          candidate,
        ),
    )
    .map(
      (candidate) => {
        const value =
          candidate.value
            .trim();

        return {
          kind:
            "mailing_address" as const,

          label:
            value,

          queryText:
            value,

          sourceName:
            candidate.source
              .sourceName,

          streetNumber:
            addressStreetNumber(
              value,
            ),

          streetTokens:
            significantStreetTokens(
              value,
            ),

          postal5:
            addressPostal5(
              value,
            ),

          priority:
            candidate.status ===
              "verified"
              ? 100
              : 90,
        };
      },
    )
    .filter(
      (anchor) =>
        Boolean(
          anchor.streetNumber,
        ) ||
        Boolean(
          anchor.postal5,
        ),
    );
}

async function identityAnchors(
  record:
    DiscoveredRecord,
): Promise<
  IndividualIdentityAnchor[]
> {
  const enrichment =
    await getDiscoveredRecordEnrichment(
      record.id,
    );

  const candidates =
    enrichment
      ?.claimantLocator
      ?.candidates ??
    [];

  const anchors:
    IndividualIdentityAnchor[] = [
      ...mailingAddressAnchors(
        candidates,
      ),
    ];

  const property =
    propertyAddressAnchor(
      record,
    );

  if (
    property
  ) {
    anchors.push(
      property,
    );
  }

  const parcel =
    identifierAnchor(
      record,
      "parcel",
      record.parcelNumber
        ?.trim() ||
        record.propertyId
          ?.trim(),
      70,
    );

  if (
    parcel
  ) {
    anchors.push(
      parcel,
    );
  }

  const caseIdentity =
    identifierAnchor(
      record,
      "case",
      record.caseNumber,
      65,
    );

  if (
    caseIdentity
  ) {
    anchors.push(
      caseIdentity,
    );
  }

  return anchors
    .sort(
      (
        left,
        right,
      ) =>
        right.priority -
        left.priority,
    )
    .slice(
      0,
      4,
    );
}

/* ========================================================================== */
/* Public sources                                                             */
/* ========================================================================== */

function publicSource(
  result:
    ClaimantLocatorWebSearchResult,
): IndividualPublicSource {
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
    IndividualPublicSource,
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

function titleStartsWithNameAlias(
  source:
    IndividualPublicSource,
  aliases:
    string[],
): boolean {
  const title =
    normalizeText(
      source.title,
    );

  return aliases.some(
    (alias) => {
      const normalizedAlias =
        normalizeText(
          alias,
        );

      return (
        title ===
          normalizedAlias ||
        title.startsWith(
          `${normalizedAlias} `,
        )
      );
    },
  );
}

function addressAnchorScore(
  evidence:
    string,
  anchor:
    IndividualIdentityAnchor,
): number {
  const normalized =
    normalizeText(
      evidence,
    );

  let score =
    0;

  if (
    anchor.streetNumber &&
    new RegExp(
      `\\b${anchor.streetNumber}\\b`,
    ).test(
      normalized,
    )
  ) {
    score +=
      2;
  }

  for (
    const token of
      anchor.streetTokens.slice(
        0,
        2,
      )
  ) {
    if (
      normalized.includes(
        token,
      )
    ) {
      score +=
        1;
    }
  }

  if (
    anchor.postal5 &&
    normalized.includes(
      anchor.postal5,
    )
  ) {
    score +=
      2;
  }

  if (
    anchor.city &&
    normalized.includes(
      anchor.city,
    )
  ) {
    score +=
      1;
  }

  return score;
}

function sourceMatchesAnchor(
  source:
    IndividualPublicSource,
  anchors:
    IndividualIdentityAnchor[],
): boolean {
  const evidence =
    sourceEvidence(
      source,
    );

  const compactEvidence =
    normalizeCompact(
      evidence,
    );

  for (
    const anchor of anchors
  ) {
    if (
      anchor.kind ===
        "parcel" ||
      anchor.kind ===
        "case"
    ) {
      if (
        anchor.compactIdentifier &&
        compactEvidence.includes(
          anchor.compactIdentifier,
        )
      ) {
        return true;
      }

      continue;
    }

    if (
      addressAnchorScore(
        evidence,
        anchor,
      ) >=
      4
    ) {
      return true;
    }
  }

  return false;
}

function mergeSources(
  sources:
    IndividualPublicSource[],
): IndividualPublicSource[] {
  const byUrl =
    new Map<
      string,
      IndividualPublicSource
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
      !existing ||
      sourceEvidence(
        source,
      ).length >
        sourceEvidence(
          existing,
        ).length
    ) {
      byUrl.set(
        key,
        source,
      );
    }
  }

  return [
    ...byUrl.values(),
  ];
}

/* ========================================================================== */
/* Public search                                                              */
/* ========================================================================== */

async function searchIndividualSources({
  aliases,
  anchors,
}: {
  aliases:
    string[];

  anchors:
    IndividualIdentityAnchor[];
}): Promise<{
  allSources:
    IndividualPublicSource[];

  acceptedSources:
    IndividualPublicSource[];

  searchesRun:
    number;
}> {
  const allSources:
    IndividualPublicSource[] = [];

  const plans:
    Array<{
      alias: string;
      anchor: IndividualIdentityAnchor;
    }> = [];

  for (
    const alias of
      aliases.slice(
        0,
        2,
      )
  ) {
    for (
      const anchor of
        anchors.slice(
          0,
          2,
        )
    ) {
      plans.push({
        alias,
        anchor,
      });
    }
  }

  let searchesRun =
    0;

  for (
    const plan of
      plans.slice(
        0,
        4,
      )
  ) {
    searchesRun +=
      1;

    const search =
      await searchClaimantLocatorWeb({
        query:
          `"${plan.alias}" "${plan.anchor.queryText}" phone email address`,

        maxResults:
          15,

        searchDepth:
          "advanced",

        includeRawContent:
          "text",
      });

    allSources.push(
      ...search.results.map(
        publicSource,
      ),
    );

    const merged =
      mergeSources(
        allSources,
      );

    const accepted =
      merged.filter(
        (source) =>
          titleStartsWithNameAlias(
            source,
            aliases,
          ) &&
          sourceMatchesAnchor(
            source,
            anchors,
          ),
      );

    if (
      accepted.length >
      0
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
          titleStartsWithNameAlias(
            source,
            aliases,
          ) &&
          sourceMatchesAnchor(
            source,
            anchors,
          ),
      ),

    searchesRun,
  };
}

/* ========================================================================== */
/* Phone extraction                                                           */
/* ========================================================================== */

function normalizePhone(
  value:
    string,
): string | undefined {
  let digits =
    value.replace(
      /\D/g,
      "",
    );

  if (
    digits.length ===
      11 &&
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
    digits.length !==
      10 ||
    BLOCKED_PHONE_NUMBERS.has(
      digits,
    )
  ) {
    return undefined;
  }

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

function contactContext(
  evidence:
    string,
  value:
    string,
): string {
  const index =
    evidence
      .toLowerCase()
      .indexOf(
        value.toLowerCase(),
      );

  if (
    index <
    0
  ) {
    return "";
  }

  return evidence.slice(
    Math.max(
      0,
      index - 260,
    ),

    Math.min(
      evidence.length,
      index +
        value.length +
        260,
    ),
  );
}

function relativeContext(
  value:
    string,
): boolean {
  const normalized =
    normalizeText(
      value,
    );

  return RELATIVE_CONTEXT_WORDS.some(
    (word) =>
      normalized.includes(
        word,
      ),
  );
}

function contextContainsAlias(
  value:
    string,
  aliases:
    string[],
): boolean {
  const normalized =
    ` ${normalizeText(
      value,
    )} `;

  return aliases.some(
    (alias) =>
      normalized.includes(
        ` ${normalizeText(
          alias,
        )} `,
      ),
  );
}

function extractPhones(
  source:
    IndividualPublicSource,
  aliases:
    string[],
): ContactFinding[] {
  const evidence =
    sourceEvidence(
      source,
    );

  const matches =
    evidence.match(
      /(?:\+?1[\s.\-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.\-]\d{3}[\s.\-]\d{4}/g,
    ) ??
    [];

  const findings:
    ContactFinding[] = [];

  const seen =
    new Set<string>();

  for (
    const match of matches
  ) {
    const phone =
      normalizePhone(
        match,
      );

    if (
      !phone
    ) {
      continue;
    }

    const digits =
      phone.replace(
        /\D/g,
        "",
      );

    if (
      seen.has(
        digits,
      )
    ) {
      continue;
    }

    const context =
      contactContext(
        evidence,
        match,
      );

    if (
      !context ||
      relativeContext(
        context,
      )
    ) {
      continue;
    }

    const normalizedContext =
      normalizeText(
        context,
      );

    const claimantSupported =
      contextContainsAlias(
        context,
        aliases,
      ) ||
      (
        titleStartsWithNameAlias(
          source,
          aliases,
        ) &&
        (
          normalizedContext.includes(
            "PHONE",
          ) ||
          normalizedContext.includes(
            "MOBILE",
          ) ||
          normalizedContext.includes(
            "CELL",
          ) ||
          normalizedContext.includes(
            "LANDLINE",
          )
        )
      );

    if (
      !claimantSupported
    ) {
      continue;
    }

    seen.add(
      digits,
    );

    findings.push({
      value:
        phone,

      source,
    });
  }

  return findings;
}

/* ========================================================================== */
/* Email extraction                                                           */
/* ========================================================================== */

function usableEmail(
  value:
    string,
): boolean {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized,
    )
  ) {
    return false;
  }

  const local =
    normalized
      .split(
        "@",
      )[0];

  return !BLOCKED_EMAIL_LOCAL_PARTS.has(
    local,
  );
}

function extractEmails(
  source:
    IndividualPublicSource,
  aliases:
    string[],
): ContactFinding[] {
  const evidence =
    sourceEvidence(
      source,
    );

  const matches =
    evidence.match(
      /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi,
    ) ??
    [];

  const findings:
    ContactFinding[] = [];

  const seen =
    new Set<string>();

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

    const context =
      contactContext(
        evidence,
        match,
      );

    if (
      !context ||
      relativeContext(
        context,
      ) ||
      !contextContainsAlias(
        context,
        aliases,
      )
    ) {
      continue;
    }

    seen.add(
      email,
    );

    findings.push({
      value:
        email,

      source,
    });
  }

  return findings;
}

/* ========================================================================== */
/* Finding selection                                                          */
/* ========================================================================== */

function collectBestFindings(
  sources:
    IndividualPublicSource[],
  aliases:
    string[],
): {
  phones:
    ContactFinding[];

  emails:
    ContactFinding[];
} {
  const phoneMap =
    new Map<
      string,
      ContactFinding
    >();

  const emailMap =
    new Map<
      string,
      ContactFinding
    >();

  for (
    const source of sources
  ) {
    for (
      const finding of
        extractPhones(
          source,
          aliases,
        )
    ) {
      const key =
        finding.value
          .replace(
            /\D/g,
            "",
          );

      const existing =
        phoneMap.get(
          key,
        );

      if (
        !existing ||
        finding.source.score >
          existing.source.score
      ) {
        phoneMap.set(
          key,
          finding,
        );
      }
    }

    for (
      const finding of
        extractEmails(
          source,
          aliases,
        )
    ) {
      const existing =
        emailMap.get(
          finding.value,
        );

      if (
        !existing ||
        finding.source.score >
          existing.source.score
      ) {
        emailMap.set(
          finding.value,
          finding,
        );
      }
    }
  }

  return {
    phones:
      [
        ...phoneMap.values(),
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
          2,
        ),

    emails:
      [
        ...emailMap.values(),
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
          2,
        ),
  };
}

/* ========================================================================== */
/* Persistence                                                                */
/* ========================================================================== */

function duplicateFinding(
  error:
    unknown,
): boolean {
  return (
    error instanceof
      Error &&
    error.message
      .toLowerCase()
      .includes(
        "already recorded",
      )
  );
}

async function saveStructuredSourceIdentity({
  record,
  actorUserId,
}: {
  record:
    DiscoveredRecord;

  actorUserId:
    string;
}): Promise<{
  saved:
    number;

  duplicates:
    number;
}> {
  const structured =
    structuredSourceName(
      record.formerOwnerName,
    );

  if (
    !structured
  ) {
    return {
      saved:
        0,

      duplicates:
        0,
    };
  }

  const sourceDate =
    record.sourceRetrievedAt
      .slice(
        0,
        10,
      );

  const findings = [
    {
      kind:
        "first_name" as const,

      value:
        structured.firstName,
    },

    {
      kind:
        "last_name" as const,

      value:
        structured.lastName,
    },
  ];

  let saved =
    0;

  let duplicates =
    0;

  for (
    const finding of findings
  ) {
    try {
      await addClaimantLocatorIdentity({
        discoveredRecordId:
          record.id,

        actorUserId,

        kind:
          finding.kind,

        value:
          finding.value,

        sourceName:
          record.sourceName,

        sourceUrl:
          record.sourceUrl,

        sourceDate,
      });

      saved +=
        1;
    } catch (
      error
    ) {
      if (
        duplicateFinding(
          error,
        )
      ) {
        duplicates +=
          1;

        continue;
      }

      throw error;
    }
  }

  return {
    saved,

    duplicates,
  };
}

/* ========================================================================== */
/* Empty result                                                               */
/* ========================================================================== */

function emptyResult({
  record,
  status,
  aliases,
  anchors,
  notes,
  identityCandidatesSaved = 0,
  duplicateFindingsSkipped = 0,
  searchesRun = 0,
  rejectedSourceCount = 0,
}: {
  record:
    DiscoveredRecord;

  status:
    IndividualResearchStatus;

  aliases:
    string[];

  anchors:
    IndividualIdentityAnchor[];

  notes:
    string[];

  identityCandidatesSaved?:
    number;

  duplicateFindingsSkipped?:
    number;

  searchesRun?:
    number;

  rejectedSourceCount?:
    number;
}): IndividualPublicWebResearchResult {
  return {
    discoveredRecordId:
      record.id,

    formerOwnerName:
      record.formerOwnerName,

    status,

    nameAliases:
      aliases,

    identityAnchors:
      anchors.map(
        (anchor) => ({
          kind:
            anchor.kind,

          label:
            anchor.label,

          sourceName:
            anchor.sourceName,
        }),
      ),

    searchesRun,

    acceptedSourceCount:
      0,

    rejectedSourceCount,

    phoneCandidatesFound:
      0,

    emailCandidatesFound:
      0,

    identityCandidatesSaved,

    phoneCandidatesSaved:
      0,

    emailCandidatesSaved:
      0,

    duplicateFindingsSkipped,

    phones:
      [],

    emails:
      [],

    acceptedSources:
      [],

    notes,
  };
}

/* ========================================================================== */
/* Production research                                                        */
/* ========================================================================== */

export async function researchIndividualPublicWebContacts({
  record,
  actorUserId,
}: {
  record:
    DiscoveredRecord;

  actorUserId:
    string;
}): Promise<
  IndividualPublicWebResearchResult
> {
  /*
   * Estates, trusts, heirs, joint owners and companies cannot safely use the
   * single-individual research lane.
   */
  if (
    looksLikeBusinessEntity(
      record.formerOwnerName,
    ) ||
    looksLikeNonIndividualOwner(
      record.formerOwnerName,
    )
  ) {
    return emptyResult({
      record,

      status:
        "unsupported",

      aliases:
        [],

      anchors:
        [],

      notes: [
        "This lane accepts only a single individual former owner. Business, estate, trust, heir, joint-owner and ETAL records remain outside the individual lane.",
      ],
    });
  }

  /*
   * Preserve explicit LAST, GIVEN source structure as candidate identity
   * fields. This does not infer first/last names from an unstructured name.
   */
  const structuredIdentity =
    await saveStructuredSourceIdentity({
      record,

      actorUserId,
    });

  const aliases =
    individualNameAliases(
      record.formerOwnerName,
    );

  if (
    aliases.length ===
    0
  ) {
    return emptyResult({
      record,

      status:
        "unsupported",

      aliases:
        [],

      anchors:
        [],

      identityCandidatesSaved:
        structuredIdentity.saved,

      duplicateFindingsSkipped:
        structuredIdentity.duplicates,

      notes: [
        "The former-owner name could not be converted into a bounded individual-name search form without guessing.",
      ],
    });
  }

  const anchors =
    await identityAnchors(
      record,
    );

  if (
    anchors.length ===
    0
  ) {
    return emptyResult({
      record,

      status:
        "missing_identity_anchor",

      aliases,

      anchors:
        [],

      identityCandidatesSaved:
        structuredIdentity.saved,

      duplicateFindingsSkipped:
        structuredIdentity.duplicates,

      notes: [
        "No sufficiently strong official or verified identity anchor is available. Same-name-only public-web research was not performed.",
      ],
    });
  }

  const search =
    await searchIndividualSources({
      aliases,

      anchors,
    });

  const rejectedSourceCount =
    search.allSources.length -
    search.acceptedSources.length;

  if (
    search.acceptedSources.length ===
    0
  ) {
    return emptyResult({
      record,

      status:
        "no_safe_sources",

      aliases,

      anchors,

      searchesRun:
        search.searchesRun,

      rejectedSourceCount,

      identityCandidatesSaved:
        structuredIdentity.saved,

      duplicateFindingsSkipped:
        structuredIdentity.duplicates,

      notes: [
        "Public-web results were returned, but none had the claimant as the page's primary subject while also matching an independent address, parcel or case anchor.",

        "No phone or email was saved.",
      ],
    });
  }

  const {
    phones,
    emails,
  } =
    collectBestFindings(
      search.acceptedSources,
      aliases,
    );

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

  let duplicateFindingsSkipped =
    structuredIdentity.duplicates;

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
        duplicateFinding(
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
        duplicateFinding(
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

  const anyContact =
    phones.length >
      0 ||
    emails.length >
      0;

  return {
    discoveredRecordId:
      record.id,

    formerOwnerName:
      record.formerOwnerName,

    status:
      anyContact
        ? "researched"
        : "no_contact_data",

    nameAliases:
      aliases,

    identityAnchors:
      anchors.map(
        (anchor) => ({
          kind:
            anchor.kind,

          label:
            anchor.label,

          sourceName:
            anchor.sourceName,
        }),
      ),

    searchesRun:
      search.searchesRun,

    acceptedSourceCount:
      search.acceptedSources.length,

    rejectedSourceCount,

    phoneCandidatesFound:
      phones.length,

    emailCandidatesFound:
      emails.length,

    identityCandidatesSaved:
      structuredIdentity.saved,

    phoneCandidatesSaved,

    emailCandidatesSaved,

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

    acceptedSources:
      search.acceptedSources.map(
        (source) => ({
          title:
            source.title,

          url:
            source.url,

          hostname:
            source.hostname,
        }),
      ),

    notes: [
      "The individual contact lane is national but remains identity-anchor gated. A name alone is never enough to save contact data.",

      "Exact property, mailing-address, parcel or case evidence is required in addition to the claimant name.",

      "When the official source explicitly uses LAST, GIVEN formatting, DueQuity preserves source-structured first and last name candidates without guessing.",

      "Phone and email extraction rejects relative or associate context.",

      "All automatically saved findings remain candidates until staff review.",

      "No claimant, Opportunity or Claim is created, and outreach is not authorized.",
    ],
  };
}