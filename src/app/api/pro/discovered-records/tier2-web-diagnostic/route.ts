import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  discoverGeorgiaBusinessRecord,
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

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

/**
 * TIER 2 CLAIMANT WEB RESEARCH DIAGNOSTIC
 *
 * Uses Tavily only as a discovery layer.
 *
 * When an official Georgia corporate result is found, DueQuity fetches that
 * government page directly and confirms the requested business identity.
 *
 * Nothing is persisted by this route.
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
      "You do not have permission to run claimant web research.",
      403,
    );
  }

  const name =
    request.nextUrl
      .searchParams
      .get(
        "name",
      )
      ?.replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (
    !name
  ) {
    return errorResponse(
      "A claimant or entity name is required.",
      400,
    );
  }

  try {
    const discovery =
      await discoverGeorgiaBusinessRecord(
        name,
      );

    return NextResponse.json(
      {
        ok:
          true,

        provider: {
          name:
            "Tavily",

          role:
            "web discovery only",
        },

        requestedName:
          name,

        officialGeorgiaBusinessRecord: {
          found:
            discovery.found,

          businessId:
            discovery.businessId,

          officialRecordUrl:
            discovery.officialRecordUrl,

          nameConfirmedOnDetailPage:
            discovery.nameConfirmedOnDetailPage,

          searchTitle:
            discovery.searchTitle,

          searchScore:
            discovery.searchScore,

          detailHttpStatus:
            discovery.detailHttpStatus,

          detailFinalUrl:
            discovery.detailFinalUrl,

          /*
           * This preview lets us inspect the current Georgia page labels before
           * writing a production field parser. We will not guess label names.
           */
          detailText:
            discovery.detailText,
        },

        searchResults:
          discovery.searchResults.map(
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
            }),
          ),

        notes:
          discovery.notes,

        operationalEffects: {
          enrichmentSaved:
            false,

          locatorCandidatesCreated:
            0,

          opportunitiesCreated:
            0,

          claimsCreated:
            0,

          outreachAuthorized:
            false,
        },

        message:
          discovery.found
            ? "Tier 2 discovered and directly confirmed an official Georgia business record. Nothing was persisted."
            : "Tier 2 completed the official Georgia business-record discovery attempt. Nothing was persisted.",
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
        : "Tier 2 claimant web research failed.",
      500,
    );
  }
}