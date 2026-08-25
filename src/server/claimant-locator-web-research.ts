import "server-only";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const TAVILY_SEARCH_URL =
  "https://api.tavily.com/search";

const REQUEST_TIMEOUT_MS =
  30_000;

const GEORGIA_SOS_HOST =
  "ecorp.sos.ga.gov";

const GEORGIA_BUSINESS_INFORMATION_PATH =
  "/BusinessSearch/BusinessInformation";

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type ClaimantLocatorWebSourceClass =
  | "official_government"
  | "public_web";

export type GeorgiaBusinessDetailRetrievalMethod =
  | "official_indexed_search";

export interface ClaimantLocatorWebSearchResult {
  title: string;

  url: string;

  content: string;

  rawContent?: string;

  score: number;

  sourceClass:
    ClaimantLocatorWebSourceClass;

  hostname: string;
}

export interface ClaimantLocatorWebSearchResponse {
  query: string;

  results:
    ClaimantLocatorWebSearchResult[];
}

export interface GeorgiaBusinessRecordDiscovery {
  requestedName: string;

  found: boolean;

  officialRecordUrl?: string;

  businessId?: string;

  controlNumber?: string;

  searchTitle?: string;

  searchSnippet?: string;

  searchScore?: number;

  detailHttpStatus?: number;

  detailFinalUrl?: string;

  detailText?: string;

  detailRetrievalMethod?:
    GeorgiaBusinessDetailRetrievalMethod;

  nameConfirmedOnDetailPage:
    boolean;

  searchResults:
    ClaimantLocatorWebSearchResult[];

  notes:
    string[];
}

/* ========================================================================== */
/* Tavily response types                                                       */
/* ========================================================================== */

interface TavilySearchResult {
  title?: unknown;

  url?: unknown;

  content?: unknown;

  raw_content?: unknown;

  score?: unknown;
}

interface TavilySearchResponsePayload {
  query?: unknown;

  results?: unknown;
}

/* ========================================================================== */
/* Search options                                                              */
/* ========================================================================== */

type TavilySearchDepth =
  | "basic"
  | "advanced";

type TavilyRawContentMode =
  | false
  | true
  | "text"
  | "markdown";

/* ========================================================================== */
/* Basic helpers                                                               */
/* ========================================================================== */

function requiredApiKey(): string {
  const apiKey =
    process.env
      .TAVILY_API_KEY
      ?.trim();

  if (
    !apiKey
  ) {
    throw new Error(
      "TAVILY_API_KEY is not configured.",
    );
  }

  return apiKey;
}

function optionalText(
  value: unknown,
): string | undefined {
  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const normalized =
    value
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  return normalized ||
    undefined;
}

function optionalRawText(
  value: unknown,
): string | undefined {
  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const normalized =
    value
      .replace(
        /\r\n/g,
        "\n",
      )
      .replace(
        /\r/g,
        "\n",
      )
      .trim();

  return normalized ||
    undefined;
}

function optionalNumber(
  value: unknown,
): number | undefined {
  return (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
  )
    ? value
    : undefined;
}

function normalizeIdentity(
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

function hostnameForUrl(
  value: string,
): string {
  try {
    return new URL(
      value,
    )
      .hostname
      .toLowerCase();
  } catch {
    return "";
  }
}

function sourceClassForUrl(
  value: string,
): ClaimantLocatorWebSourceClass {
  const hostname =
    hostnameForUrl(
      value,
    );

  if (
    hostname.endsWith(
      ".gov",
    )
  ) {
    return "official_government";
  }

  return "public_web";
}

function mergeResults(
  values:
    ClaimantLocatorWebSearchResult[],
): ClaimantLocatorWebSearchResult[] {
  const byUrl =
    new Map<
      string,
      ClaimantLocatorWebSearchResult
    >();

  for (
    const value of
      values
  ) {
    const key =
      value.url
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
        value,
      );

      continue;
    }

    const existingRawLength =
      existing.rawContent?.length ??
      0;

    const incomingRawLength =
      value.rawContent?.length ??
      0;

    const existingContentLength =
      existing.content.length;

    const incomingContentLength =
      value.content.length;

    byUrl.set(
      key,
      {
        ...existing,

        title:
          value.title.length >
          existing.title.length
            ? value.title
            : existing.title,

        content:
          incomingContentLength >
          existingContentLength
            ? value.content
            : existing.content,

        rawContent:
          incomingRawLength >
          existingRawLength
            ? value.rawContent
            : existing.rawContent,

        score:
          Math.max(
            existing.score,
            value.score,
          ),
      },
    );
  }

  return [
    ...byUrl.values(),
  ];
}

/* ========================================================================== */
/* Georgia URL helpers                                                         */
/* ========================================================================== */

function businessIdFromUrl(
  value: string,
): string | undefined {
  try {
    return (
      new URL(
        value,
      )
        .searchParams
        .get(
          "businessId",
        )
        ?.trim() ||
      undefined
    );
  } catch {
    return undefined;
  }
}

function isGeorgiaBusinessInformationUrl(
  value: string,
): boolean {
  try {
    const url =
      new URL(
        value,
      );

    return (
      url.hostname
        .toLowerCase() ===
        GEORGIA_SOS_HOST &&
      url.pathname
        .toLowerCase()
        .startsWith(
          GEORGIA_BUSINESS_INFORMATION_PATH
            .toLowerCase(),
        ) &&
      Boolean(
        businessIdFromUrl(
          value,
        ),
      )
    );
  } catch {
    return false;
  }
}

/* ========================================================================== */
/* Georgia evidence helpers                                                    */
/* ========================================================================== */

function normalizedEvidenceText(
  value: string,
): string {
  return value
    .replace(
      /\*\*/g,
      "",
    )
    .replace(
      /\|/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function businessNameFromEvidence(
  content: string,
): string | undefined {
  const text =
    normalizedEvidenceText(
      content,
    );

  const match =
    text.match(
      /BUSINESS\s+NAME\s*:?\s*(.+?)(?=\s+(?:CONTROL\s+NUMBER|BUSINESS\s+TYPE|BUSINESS\s+STATUS|BUSINESS\s+PURPOSE|NAICS\s+CODE|PRINCIPAL\s+OFFICE\s+ADDRESS|DATE\s+OF\s+FORMATION|STATE\s+OF\s+FORMATION|LAST\s+ANNUAL\s+REGISTRATION|EFFECTIVE\s+DATE|FILING\s+TYPE|ANNUAL\s+REGISTRATION|REGISTERED\s+AGENT|SHARES|JURISDICTION)\b)/i,
    );

  return match?.[1]
    ?.trim() ||
    undefined;
}

function controlNumberFromEvidence(
  content: string,
): string | undefined {
  const text =
    normalizedEvidenceText(
      content,
    );

  const match =
    text.match(
      /CONTROL\s+NUMBER\s*:?\s*([A-Z0-9-]+)/i,
    );

  return match?.[1]
    ?.trim() ||
    undefined;
}

function exactBusinessIdentityMatch(
  requestedName: string,
  content: string,
): boolean {
  const sourceBusinessName =
    businessNameFromEvidence(
      content,
    );

  if (
    !sourceBusinessName
  ) {
    return false;
  }

  return (
    normalizeIdentity(
      sourceBusinessName,
    ) ===
    normalizeIdentity(
      requestedName,
    )
  );
}

function evidenceTexts(
  result:
    ClaimantLocatorWebSearchResult,
): string[] {
  const values =
    [
      result.rawContent,
      result.content,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value?.trim(),
          ),
      );

  return [
    ...new Set(
      values,
    ),
  ];
}

function matchingIdentityEvidence(
  result:
    ClaimantLocatorWebSearchResult,
  requestedName: string,
): string | undefined {
  const matching =
    evidenceTexts(
      result,
    )
      .filter(
        (text) =>
          exactBusinessIdentityMatch(
            requestedName,
            text,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.length -
          left.length,
      );

  return matching[0];
}

function evidenceMatchesControlNumber(
  text: string,
  expectedControlNumber: string,
): boolean {
  const found =
    controlNumberFromEvidence(
      text,
    );

  if (
    !found
  ) {
    return false;
  }

  return (
    found
      .toUpperCase() ===
    expectedControlNumber
      .toUpperCase()
  );
}

function containsLocatorFields(
  text: string,
): boolean {
  const normalized =
    normalizedEvidenceText(
      text,
    )
      .toUpperCase();

  return (
    normalized.includes(
      "PRINCIPAL OFFICE ADDRESS",
    ) ||
    normalized.includes(
      "REGISTERED AGENT NAME",
    ) ||
    normalized.includes(
      "REGISTERED AGENT INFORMATION",
    ) ||
    normalized.includes(
      "REGISTERED OFFICE ADDRESS",
    ) ||
    normalized.includes(
      "OFFICER INFORMATION",
    ) ||
    normalized.includes(
      "OFFICER(S)",
    ) ||
    normalized.includes(
      "AUTHORIZER INFORMATION",
    ) ||
    normalized.includes(
      "INCORPORATOR",
    ) ||
    normalized.includes(
      "ORGANIZER"
    )
  );
}

function locatorEvidenceScore(
  text: string,
): number {
  const normalized =
    normalizedEvidenceText(
      text,
    )
      .toUpperCase();

  const indicators = [
    "PRINCIPAL OFFICE ADDRESS",
    "REGISTERED AGENT NAME",
    "REGISTERED AGENT INFORMATION",
    "REGISTERED OFFICE ADDRESS",
    "PHYSICAL ADDRESS",
    "OFFICER INFORMATION",
    "OFFICER(S)",
    "CEO",
    "CFO",
    "SECRETARY",
    "AUTHORIZER INFORMATION",
    "AUTHORIZER SIGNATURE",
    "INCORPORATOR",
    "ORGANIZER",
  ];

  let score =
    0;

  for (
    const indicator of
      indicators
  ) {
    if (
      normalized.includes(
        indicator,
      )
    ) {
      score +=
        10;
    }
  }

  score +=
    Math.min(
      Math.floor(
        text.length /
          1000,
      ),
      20,
    );

  return score;
}

/* ========================================================================== */
/* Network                                                                     */
/* ========================================================================== */

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  try {
    return await fetch(
      url,
      {
        ...init,

        cache:
          "no-store",

        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/* ========================================================================== */
/* Tavily search                                                               */
/* ========================================================================== */

export async function searchClaimantLocatorWeb({
  query,
  includeDomains,
  maxResults = 10,
  searchDepth = "basic",
  includeRawContent = false,
}: {
  query: string;

  includeDomains?: string[];

  maxResults?: number;

  searchDepth?:
    TavilySearchDepth;

  includeRawContent?:
    TavilyRawContentMode;
}): Promise<
  ClaimantLocatorWebSearchResponse
> {
  const cleanedQuery =
    query
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (
    !cleanedQuery
  ) {
    throw new Error(
      "Claimant locator web search requires a query.",
    );
  }

  const response =
    await fetchWithTimeout(
      TAVILY_SEARCH_URL,
      {
        method:
          "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${requiredApiKey()}`,
        },

        body:
          JSON.stringify({
            query:
              cleanedQuery,

            search_depth:
              searchDepth,

            topic:
              "general",

            max_results:
              Math.min(
                Math.max(
                  maxResults,
                  1,
                ),
                20,
              ),

            include_answer:
              false,

            include_raw_content:
              includeRawContent,

            ...(includeDomains &&
            includeDomains.length >
              0
              ? {
                  include_domains:
                    includeDomains,
                }
              : {}),
          }),
      },
    );

  const rawText =
    await response.text();

  if (
    !response.ok
  ) {
    throw new Error(
      `Tavily search returned HTTP ${response.status}: ${rawText.slice(0, 400)}`,
    );
  }

  let payload:
    TavilySearchResponsePayload;

  try {
    payload =
      JSON.parse(
        rawText,
      ) as
        TavilySearchResponsePayload;
  } catch {
    throw new Error(
      "Tavily returned invalid search JSON.",
    );
  }

  const rawResults =
    Array.isArray(
      payload.results,
    )
      ? payload.results
      : [];

  const results:
    ClaimantLocatorWebSearchResult[] =
    [];

  for (
    const rawResult of
      rawResults
  ) {
    if (
      !rawResult ||
      typeof rawResult !==
        "object" ||
      Array.isArray(
        rawResult,
      )
    ) {
      continue;
    }

    const candidate =
      rawResult as
        TavilySearchResult;

    const title =
      optionalText(
        candidate.title,
      );

    const url =
      optionalText(
        candidate.url,
      );

    if (
      !title ||
      !url
    ) {
      continue;
    }

    const hostname =
      hostnameForUrl(
        url,
      );

    if (
      !hostname
    ) {
      continue;
    }

    results.push({
      title,

      url,

      content:
        optionalText(
          candidate.content,
        ) ??
        "",

      rawContent:
        optionalRawText(
          candidate.raw_content,
        ),

      score:
        optionalNumber(
          candidate.score,
        ) ??
        0,

      sourceClass:
        sourceClassForUrl(
          url,
        ),

      hostname,
    });
  }

  return {
    query:
      optionalText(
        payload.query,
      ) ??
      cleanedQuery,

    results:
      mergeResults(
        results,
      ),
  };
}

/* ========================================================================== */
/* Georgia exact entity discovery                                              */
/* ========================================================================== */

async function discoverExactGeorgiaResult(
  requestedName: string,
): Promise<{
  result?:
    ClaimantLocatorWebSearchResult;

  identityEvidence?: string;

  allResults:
    ClaimantLocatorWebSearchResult[];

  strategy:
    string;
}> {
  const allResults:
    ClaimantLocatorWebSearchResult[] =
    [];

  const strategies = [
    {
      label:
        "exact-name-basic",

      query:
        `"${requestedName}"`,

      searchDepth:
        "basic" as const,

      includeDomains: [
        GEORGIA_SOS_HOST,
      ],
    },

    {
      label:
        "exact-name-control-number-advanced",

      query:
        `"${requestedName}" "Control Number"`,

      searchDepth:
        "advanced" as const,

      includeDomains: [
        GEORGIA_SOS_HOST,
      ],
    },

    {
      label:
        "business-information-path-advanced",

      query:
        `site:ecorp.sos.ga.gov/BusinessSearch/BusinessInformation "${requestedName}"`,

      searchDepth:
        "advanced" as const,

      includeDomains:
        undefined,
    },
  ];

  for (
    const strategy of
      strategies
  ) {
    const search =
      await searchClaimantLocatorWeb({
        query:
          strategy.query,

        includeDomains:
          strategy.includeDomains,

        maxResults:
          10,

        searchDepth:
          strategy.searchDepth,

        /*
         * Tavily Search can return the cleaned page body as raw_content.
         * This is preferable to making a second Extract request.
         */
        includeRawContent:
          "text",
      });

    allResults.push(
      ...search.results,
    );

    const merged =
      mergeResults(
        allResults,
      );

    for (
      const result of
        merged
    ) {
      if (
        result.hostname !==
          GEORGIA_SOS_HOST ||
        !isGeorgiaBusinessInformationUrl(
          result.url,
        )
      ) {
        continue;
      }

      const identityEvidence =
        matchingIdentityEvidence(
          result,
          requestedName,
        );

      if (
        !identityEvidence
      ) {
        continue;
      }

      return {
        result,

        identityEvidence,

        allResults:
          merged,

        strategy:
          strategy.label,
      };
    }
  }

  return {
    allResults:
      mergeResults(
        allResults,
      ),

    strategy:
      "none",
  };
}

/* ========================================================================== */
/* Georgia control-number evidence                                             */
/* ========================================================================== */

async function searchGeorgiaControlEvidence({
  requestedName,
  controlNumber,
}: {
  requestedName: string;

  controlNumber: string;
}): Promise<
  ClaimantLocatorWebSearchResult[]
> {
  const first =
    await searchClaimantLocatorWeb({
      query:
        `"${controlNumber}" "${requestedName}" "Principal Office Address" "Registered Agent"`,

      includeDomains: [
        GEORGIA_SOS_HOST,
      ],

      maxResults:
        10,

      searchDepth:
        "advanced",

      includeRawContent:
        "text",
    });

  const results =
    [
      ...first.results,
    ];

  const alreadyRich =
    first.results.some(
      (result) => {
        const evidence =
          matchingIdentityEvidence(
            result,
            requestedName,
          );

        return (
          evidence !==
            undefined &&
          evidenceMatchesControlNumber(
            evidence,
            controlNumber,
          ) &&
          containsLocatorFields(
            evidence,
          )
        );
      },
    );

  if (
    alreadyRich
  ) {
    return mergeResults(
      results,
    );
  }

  /*
   * Corporations can publish officer details separately from the shorter
   * BusinessInformation result. Only spend the additional search when the
   * first control-number query did not already expose useful locator fields.
   */
  const second =
    await searchClaimantLocatorWeb({
      query:
        `"${controlNumber}" "${requestedName}" officer CEO CFO secretary annual registration`,

      includeDomains: [
        GEORGIA_SOS_HOST,
      ],

      maxResults:
        10,

      searchDepth:
        "advanced",

      includeRawContent:
        "text",
    });

  results.push(
    ...second.results,
  );

  return mergeResults(
    results,
  );
}

/* ========================================================================== */
/* Georgia evidence selection                                                  */
/* ========================================================================== */

interface GeorgiaEvidenceSelection {
  result:
    ClaimantLocatorWebSearchResult;

  text: string;

  score: number;
}

function selectGeorgiaEvidence({
  requestedName,
  businessId,
  controlNumber,
  results,
}: {
  requestedName: string;

  businessId: string;

  controlNumber: string;

  results:
    ClaimantLocatorWebSearchResult[];
}): GeorgiaEvidenceSelection[] {
  const selections:
    GeorgiaEvidenceSelection[] =
    [];

  for (
    const result of
      results
  ) {
    if (
      result.hostname !==
      GEORGIA_SOS_HOST
    ) {
      continue;
    }

    for (
      const text of
        evidenceTexts(
          result,
        )
    ) {
      if (
        !exactBusinessIdentityMatch(
          requestedName,
          text,
        )
      ) {
        continue;
      }

      const sourceControlNumber =
        controlNumberFromEvidence(
          text,
        );

      const sourceBusinessId =
        businessIdFromUrl(
          result.url,
        );

      const sameControlNumber =
        sourceControlNumber !==
          undefined &&
        sourceControlNumber
          .toUpperCase() ===
        controlNumber
          .toUpperCase();

      const sameBusinessInformationRecord =
        sourceBusinessId ===
        businessId;

      if (
        !sameControlNumber &&
        !sameBusinessInformationRecord
      ) {
        continue;
      }

      selections.push({
        result,

        text,

        score:
          locatorEvidenceScore(
            text,
          ),
      });
    }
  }

  return selections
    .sort(
      (
        left,
        right,
      ) => {
        if (
          right.score !==
          left.score
        ) {
          return (
            right.score -
            left.score
          );
        }

        return (
          right.text.length -
          left.text.length
        );
      },
    );
}

/* ========================================================================== */
/* Georgia corporate-record discovery                                          */
/* ========================================================================== */

/**
 * Georgia entity research sequence:
 *
 * 1. Locate an official Georgia BusinessInformation URL.
 * 2. Require its explicit Business Name field to exactly match the requested
 *    former owner after punctuation/spacing normalization.
 * 3. Recover the Georgia businessId and Control Number.
 * 4. Prefer raw official page content returned with the Tavily Search result.
 * 5. If locator fields are still absent, search the unique Control Number for
 *    matching Georgia filing evidence.
 *
 * Search ranking alone never establishes claimant identity.
 * All collected locator information remains candidate data until reviewed.
 */
export async function discoverGeorgiaBusinessRecord(
  requestedName: string,
): Promise<
  GeorgiaBusinessRecordDiscovery
> {
  const cleanedName =
    requestedName
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (
    !cleanedName
  ) {
    throw new Error(
      "A Georgia business name is required.",
    );
  }

  const notes:
    string[] =
    [];

  const initial =
    await discoverExactGeorgiaResult(
      cleanedName,
    );

  if (
    !initial.result ||
    !initial.identityEvidence
  ) {
    notes.push(
      "The bounded Georgia SOS searches did not return an official BusinessInformation result whose explicit Business Name field exactly matched the requested entity.",
    );

    return {
      requestedName:
        cleanedName,

      found:
        false,

      nameConfirmedOnDetailPage:
        false,

      searchResults:
        initial.allResults,

      notes,
    };
  }

  const businessId =
    businessIdFromUrl(
      initial.result.url,
    );

  const controlNumber =
    controlNumberFromEvidence(
      initial.identityEvidence,
    );

  if (
    !businessId
  ) {
    notes.push(
      "An exact Georgia entity result was found, but its official URL did not contain a businessId.",
    );

    return {
      requestedName:
        cleanedName,

      found:
        false,

      nameConfirmedOnDetailPage:
        false,

      searchResults:
        initial.allResults,

      notes,
    };
  }

  if (
    !controlNumber
  ) {
    notes.push(
      "An exact Georgia entity result was found, but its official evidence did not expose a Control Number.",
    );

    return {
      requestedName:
        cleanedName,

      found:
        false,

      businessId,

      officialRecordUrl:
        initial.result.url,

      nameConfirmedOnDetailPage:
        true,

      searchResults:
        initial.allResults,

      notes,
    };
  }

  notes.push(
    `Exact Georgia SOS entity identity found using ${initial.strategy}.`,
  );

  notes.push(
    `Georgia SOS Control Number ${controlNumber} was recovered from the exact entity record.`,
  );

  let allResults =
    initial.allResults;

  let evidence =
    selectGeorgiaEvidence({
      requestedName:
        cleanedName,

      businessId,

      controlNumber,

      results:
        allResults,
    });

  const initialHasRichLocatorEvidence =
    evidence.some(
      (selection) =>
        containsLocatorFields(
          selection.text,
        ),
    );

  if (
    !initialHasRichLocatorEvidence
  ) {
    const controlEvidence =
      await searchGeorgiaControlEvidence({
        requestedName:
          cleanedName,

        controlNumber,
      });

    allResults =
      mergeResults([
        ...allResults,
        ...controlEvidence,
      ]);

    evidence =
      selectGeorgiaEvidence({
        requestedName:
          cleanedName,

        businessId,

        controlNumber,

        results:
          allResults,
      });
  }

  const bestEvidence =
    evidence[0];

  const detailText =
    bestEvidence?.text ??
    initial.identityEvidence;

  const detailResult =
    bestEvidence?.result ??
    initial.result;

  if (
    containsLocatorFields(
      detailText,
    )
  ) {
    notes.push(
      "The exact official Georgia entity evidence also exposes locator-relevant corporate fields such as principal office, registered-agent, officer, organizer, incorporator, or authorizer information.",
    );
  } else {
    notes.push(
      "The exact Georgia entity was confirmed, but the available indexed official evidence still did not expose locator-relevant corporate fields. Those fields must remain blank until another supported source provides them.",
    );
  }

  notes.push(
    "Identity was confirmed from the explicit Business Name field of official Georgia Secretary of State evidence.",
  );

  notes.push(
    "No locator finding has been marked verified automatically.",
  );

  return {
    requestedName:
      cleanedName,

    found:
      true,

    officialRecordUrl:
      initial.result.url,

    businessId,

    controlNumber,

    searchTitle:
      detailResult.title,

    searchSnippet:
      detailResult.content,

    searchScore:
      detailResult.score,

    detailFinalUrl:
      detailResult.url,

    detailText,

    detailRetrievalMethod:
      "official_indexed_search",

    nameConfirmedOnDetailPage:
      true,

    searchResults:
      allResults,

    notes,
  };
}