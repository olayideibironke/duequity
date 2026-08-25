import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  loadNationalGeography,
} from "@/server/geography-resolver";

import {
  resolveOrDiscoverPublicRecordSource,
} from "@/server/public-record-source-auto-discovery";

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
 * Read-only staff diagnostic for national public-record source resolution.
 *
 * This endpoint does not:
 *
 *   - stage records
 *   - create Opportunities
 *   - create Claims
 *   - approve jurisdictions
 *   - authorize intake
 *   - authorize outreach
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
      "You do not have permission to inspect operational source resolution.",
      403,
    );
  }

  const stateParam =
    request.nextUrl.searchParams
      .get(
        "state",
      )
      ?.trim()
      .toUpperCase();

  const countyGeoid =
    request.nextUrl.searchParams
      .get(
        "countyGeoid",
      )
      ?.trim();

  if (
    !stateParam ||
    !countyGeoid
  ) {
    return errorResponse(
      "State and countyGeoid are required.",
      400,
    );
  }

  const geography =
    await loadNationalGeography();

  const state =
    geography.states.find(
      (candidate) =>
        candidate.postalCode ===
        stateParam,
    );

  if (
    !state
  ) {
    return errorResponse(
      "State was not found in the national geography registry.",
      400,
    );
  }

  const county =
    state.counties.find(
      (candidate) =>
        candidate.geoid ===
        countyGeoid,
    );

  if (
    !county
  ) {
    return errorResponse(
      "County GEOID was not found in the selected state.",
      400,
    );
  }

  if (
    !clearedForState(
      session,
      state.postalCode,
    )
  ) {
    return errorResponse(
      `You are not cleared to inspect public-record sources in ${state.postalCode}.`,
      403,
    );
  }

  try {
    const source =
      await resolveOrDiscoverPublicRecordSource({
        state:
          state.postalCode,

        county:
          county.name,

        countyGeoid:
          county.geoid,
      });

    if (
      !source
    ) {
      return NextResponse.json(
        {
          ok:
            true,

          jurisdiction: {
            state:
              state.postalCode,

            stateName:
              state.name,

            county:
              county.name,

            countyGeoid:
              county.geoid,
          },

          resolved:
            false,

          source:
            null,

          message:
            "The national resolver completed but did not validate a usable official surplus-record source.",
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

    return NextResponse.json(
      {
        ok:
          true,

        jurisdiction: {
          state:
            state.postalCode,

          stateName:
            state.name,

          county:
            county.name,

          countyGeoid:
            county.geoid,
        },

        resolved:
          true,

        source: {
          key:
            source.key,

          sourceName:
            source.sourceName,

          sourceUrl:
            source.sourceUrl,

          sourceFormat:
            source.sourceFormat,

          parserKey:
            source.parserKey,

          agencyName:
            source.agencyName,

          custodian:
            source.custodian,

          saleType:
            source.saleType,

          sourceLevel:
            source.sourceLevel,

          supportsBulkPull:
            source.supportsBulkPull,

          status:
            source.status,
        },

        message:
          "A usable official surplus-record source was discovered and validated by the existing parser.",
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
        : "Source resolution failed.",
      500,
    );
  }
}