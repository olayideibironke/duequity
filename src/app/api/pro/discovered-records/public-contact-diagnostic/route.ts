import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  searchClaimantLocatorWeb,
} from "@/server/claimant-locator-web-research";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
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

function cleanName(
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
/* GET                                                                         */
/* ========================================================================== */

/**
 * PUBLIC CONTACT RESEARCH DIAGNOSTIC
 *
 * Searches the public web for locator evidence tied to the supplied claimant
 * or entity name.
 *
 * This route is deliberately read-only.
 *
 * Nothing found here is automatically considered verified.
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
      "You do not have permission to run claimant public-contact research.",
      403,
    );
  }

  const rawName =
    request.nextUrl
      .searchParams
      .get(
        "name",
      );

  if (
    !rawName
  ) {
    return errorResponse(
      "A claimant or entity name is required.",
      400,
    );
  }

  const name =
    cleanName(
      rawName,
    );

  const state =
    cleanName(
      request.nextUrl
        .searchParams
        .get(
          "state",
        ) ??
        "",
    );

  const county =
    cleanName(
      request.nextUrl
        .searchParams
        .get(
          "county",
        ) ??
        "",
    );

  try {
    /*
     * One bounded search only.
     *
     * We are testing whether the general public web can produce useful contact
     * evidence before building persistence.
     */
    const geographicContext =
      [
        county,
        state,
      ]
        .filter(
          Boolean,
        )
        .join(
          " ",
        );

    const query =
      [
        `"${name}"`,

        geographicContext,

        "phone email address contact owner officer registered agent",
      ]
        .filter(
          Boolean,
        )
        .join(
          " ",
        );

    const search =
      await searchClaimantLocatorWeb({
        query,

        maxResults:
          15,

        searchDepth:
          "advanced",

        includeRawContent:
          "text",
      });

    return NextResponse.json(
      {
        ok:
          true,

        requested: {
          name,

          state:
            state ||
            null,

          county:
            county ||
            null,
        },

        query:
          search.query,

        resultCount:
          search.results.length,

        results:
          search.results.map(
            (result) => ({
              title:
                result.title,

              url:
                result.url,

              hostname:
                result.hostname,

              score:
                result.score,

              sourceClass:
                result.sourceClass,

              content:
                result.content,

              rawContentPreview:
                result.rawContent
                  ?.slice(
                    0,
                    5000,
                  ) ??
                null,
            }),
          ),

        operationalEffects: {
          enrichmentSaved:
            false,

          locatorCandidatesCreated:
            0,

          associatedContactsCreated:
            0,

          opportunitiesCreated:
            0,

          claimsCreated:
            0,

          outreachAuthorized:
            false,
        },

        message:
          "Public contact research completed read-only. Search results are evidence candidates only and nothing was persisted.",
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
        : "Public contact research failed.",
      500,
    );
  }
}