import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const GEORGIA_SOS_BASE =
  "https://ecorp.sos.ga.gov";

const GEORGIA_SOS_SEARCH_URL =
  `${GEORGIA_SOS_BASE}/BusinessSearch`;

const GEORGIA_SOS_FILINGS_URL =
  `${GEORGIA_SOS_BASE}/BusinessSearch/BusinessFilings`;

const REQUEST_TIMEOUT_MS =
  20_000;

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface BusinessSearchResult {
  businessId: string;

  name: string;

  href: string;

  normalizedName: string;
}

interface FilingResult {
  filingNo: string;

  href: string;
}

/* ========================================================================== */
/* Response helpers                                                            */
/* ========================================================================== */

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      ok:
        false,

      error:
        message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

/* ========================================================================== */
/* HTML helpers                                                                */
/* ========================================================================== */

function decodeHtmlEntities(
  value: string,
): string {
  return value
    .replace(
      /&amp;/gi,
      "&",
    )
    .replace(
      /&quot;/gi,
      "\"",
    )
    .replace(
      /&#39;/gi,
      "'",
    )
    .replace(
      /&apos;/gi,
      "'",
    )
    .replace(
      /&lt;/gi,
      "<",
    )
    .replace(
      /&gt;/gi,
      ">",
    )
    .replace(
      /&nbsp;/gi,
      " ",
    )
    .replace(
      /&#(\d+);/g,
      (
        _match,
        decimal: string,
      ) => {
        const code =
          Number(
            decimal,
          );

        return Number.isInteger(
          code,
        )
          ? String.fromCodePoint(
              code,
            )
          : "";
      },
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        _match,
        hexadecimal: string,
      ) => {
        const code =
          Number.parseInt(
            hexadecimal,
            16,
          );

        return Number.isInteger(
          code,
        )
          ? String.fromCodePoint(
              code,
            )
          : "";
      },
    );
}

function plainText(
  html: string,
): string {
  return decodeHtmlEntities(
    html
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        " ",
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        " ",
      )
      .replace(
        /<br\s*\/?>/gi,
        "\n",
      )
      .replace(
        /<\/(?:div|p|td|th|tr|li|h[1-6])>/gi,
        "\n",
      )
      .replace(
        /<[^>]+>/g,
        " ",
      ),
  )
    .split(
      /\r?\n/,
    )
    .map(
      (line) =>
        line
          .replace(
            /\s+/g,
            " ",
          )
          .trim(),
    )
    .filter(
      Boolean,
    )
    .join(
      "\n",
    );
}

function anchorText(
  html: string,
): string {
  return decodeHtmlEntities(
    html.replace(
      /<[^>]+>/g,
      " ",
    ),
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function normalizeBusinessName(
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

function uniqueBy<
  T,
>(
  values: T[],
  key: (
    value: T,
  ) => string,
): T[] {
  const seen =
    new Set<string>();

  const result:
    T[] =
    [];

  for (
    const value of
      values
  ) {
    const valueKey =
      key(
        value,
      );

    if (
      seen.has(
        valueKey,
      )
    ) {
      continue;
    }

    seen.add(
      valueKey,
    );

    result.push(
      value,
    );
  }

  return result;
}

/* ========================================================================== */
/* Search-result extraction                                                    */
/* ========================================================================== */

function parseBusinessSearchResults(
  html: string,
): BusinessSearchResult[] {
  const results:
    BusinessSearchResult[] =
    [];

  const anchorPattern =
    /<a\b[^>]*href=["']([^"']*BusinessInformation\?[^"']*businessId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match:
    RegExpExecArray |
    null;

  while (
    (
      match =
        anchorPattern.exec(
          html,
        )
    ) !==
    null
  ) {
    const rawHref =
      decodeHtmlEntities(
        match[1],
      );

    const businessId =
      match[2];

    const name =
      anchorText(
        match[3],
      );

    if (
      !name
    ) {
      continue;
    }

    const href =
      new URL(
        rawHref,
        GEORGIA_SOS_BASE,
      ).toString();

    results.push({
      businessId,

      name,

      href,

      normalizedName:
        normalizeBusinessName(
          name,
        ),
    });
  }

  return uniqueBy(
    results,
    (result) =>
      result.businessId,
  );
}

/* ========================================================================== */
/* Filing extraction                                                           */
/* ========================================================================== */

function parseFilingResults(
  html: string,
): FilingResult[] {
  const results:
    FilingResult[] =
    [];

  const hrefPattern =
    /href=["']([^"']*filingNo=(\d+)[^"']*)["']/gi;

  let match:
    RegExpExecArray |
    null;

  while (
    (
      match =
        hrefPattern.exec(
          html,
        )
    ) !==
    null
  ) {
    const rawHref =
      decodeHtmlEntities(
        match[1],
      );

    results.push({
      filingNo:
        match[2],

      href:
        new URL(
          rawHref,
          GEORGIA_SOS_BASE,
        ).toString(),
    });
  }

  return uniqueBy(
    results,
    (result) =>
      result.filingNo,
  );
}

/* ========================================================================== */
/* Network helpers                                                             */
/* ========================================================================== */

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
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

        redirect:
          "follow",

        signal:
          controller.signal,

        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",

          "User-Agent":
            "DueQuity Official Public Record Research",

          ...(init?.headers ??
            {}),
        },
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

/**
 * GEORGIA SECRETARY OF STATE BUSINESS SEARCH DIAGNOSTIC
 *
 * Read-only test of the current official Georgia Corporations Division
 * Business Search and filing-history endpoints.
 *
 * This endpoint does not persist enrichment findings.
 */
export async function GET(
  request: NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  if (
    !can(
      session,
      "opportunity.write",
    )
  ) {
    return errorResponse(
      "You do not have permission to run the Georgia business-record diagnostic.",
      403,
    );
  }

  const requestedName =
    request.nextUrl.searchParams
      .get(
        "name",
      )
      ?.replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (
    !requestedName
  ) {
    return errorResponse(
      "A business name is required.",
      400,
    );
  }

  try {
    /* ---------------------------------------------------------------------- */
    /* Step 1: search                                                         */
    /* ---------------------------------------------------------------------- */

    const searchBody =
      new URLSearchParams();

    searchBody.set(
      "search.SearchType",
      "BusinessName",
    );

    searchBody.set(
      "search.SearchValue",
      requestedName,
    );

    searchBody.set(
      "search.SearchCriteria",
      "StartsWith",
    );

    const searchResponse =
      await fetchWithTimeout(
        GEORGIA_SOS_SEARCH_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",

            Referer:
              GEORGIA_SOS_SEARCH_URL,
          },

          body:
            searchBody.toString(),
        },
      );

    const searchHtml =
      await searchResponse.text();

    const searchResults =
      parseBusinessSearchResults(
        searchHtml,
      );

    const requestedNormalized =
      normalizeBusinessName(
        requestedName,
      );

    const selected =
      searchResults.find(
        (result) =>
          result.normalizedName ===
          requestedNormalized,
      ) ??
      searchResults[0];

    if (
      !selected
    ) {
      return NextResponse.json(
        {
          ok:
            true,

          requestedName,

          search: {
            httpStatus:
              searchResponse.status,

            resultCount:
              0,

            results:
              [],
          },

          selectedBusiness:
            null,

          detail:
            null,

          filings:
            null,

          message:
            "The live Georgia Secretary of State search responded, but no business-information result was recognized for this name. Nothing was persisted.",
        },
        {
          status:
            200,

          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Step 2: business detail                                                */
    /* ---------------------------------------------------------------------- */

    const detailResponse =
      await fetchWithTimeout(
        selected.href,
        {
          method:
            "GET",

          headers: {
            Referer:
              GEORGIA_SOS_SEARCH_URL,
          },
        },
      );

    const detailHtml =
      await detailResponse.text();

    const detailText =
      plainText(
        detailHtml,
      );

    /* ---------------------------------------------------------------------- */
    /* Step 3: filing history                                                 */
    /* ---------------------------------------------------------------------- */

    const filingsBody =
      new URLSearchParams();

    filingsBody.set(
      "businessId",
      selected.businessId,
    );

    const filingsResponse =
      await fetchWithTimeout(
        GEORGIA_SOS_FILINGS_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",

            Referer:
              selected.href,
          },

          body:
            filingsBody.toString(),
        },
      );

    const filingsHtml =
      await filingsResponse.text();

    const filingResults =
      parseFilingResults(
        filingsHtml,
      );

    return NextResponse.json(
      {
        ok:
          true,

        requestedName,

        search: {
          httpStatus:
            searchResponse.status,

          resultCount:
            searchResults.length,

          results:
            searchResults
              .slice(
                0,
                10,
              )
              .map(
                (result) => ({
                  businessId:
                    result.businessId,

                  name:
                    result.name,

                  exactNormalizedMatch:
                    result.normalizedName ===
                    requestedNormalized,

                  href:
                    result.href,
                }),
              ),
        },

        selectedBusiness: {
          businessId:
            selected.businessId,

          name:
            selected.name,

          href:
            selected.href,

          exactNormalizedMatch:
            selected.normalizedName ===
            requestedNormalized,
        },

        detail: {
          httpStatus:
            detailResponse.status,

          /*
           * Deliberately return normalized official page text for this first
           * diagnostic instead of guessing the current HTML field structure.
           *
           * Once we see the live result, the production parser will map the
           * precise fields.
           */
          textPreview:
            detailText.slice(
              0,
              6000,
            ),
        },

        filings: {
          httpStatus:
            filingsResponse.status,

          filingCountRecognized:
            filingResults.length,

          filings:
            filingResults
              .slice(
                -10,
              )
              .map(
                (filing) => ({
                  filingNo:
                    filing.filingNo,

                  href:
                    filing.href,
                }),
              ),
        },

        operationalEffects: {
          enrichmentSaved:
            false,

          opportunitiesCreated:
            0,

          claimsCreated:
            0,

          outreachAuthorized:
            false,
        },

        message:
          "The live Georgia Secretary of State business-search path was tested read-only. Nothing was persisted.",
      },
      {
        status:
          200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (
    error
  ) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Georgia Secretary of State diagnostic failed.",
      500,
    );
  }
}