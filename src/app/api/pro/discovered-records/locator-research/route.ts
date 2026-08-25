import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  StateCode,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  researchClaimantLocatorsForRecords,
} from "@/server/claimant-locator-research";

import {
  listDiscoveredRecords,
} from "@/server/discovered-record-store";

import {
  loadNationalGeography,
} from "@/server/geography-resolver";

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

function normalizeCounty(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /\bcounty\b/g,
      "",
    )
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function parseLimit(
  value: string | null,
): number {
  if (
    !value
  ) {
    return 5;
  }

  const parsed =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed < 1
  ) {
    return 5;
  }

  return Math.min(
    parsed,
    100,
  );
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

/**
 * CLAIMANT LOCATOR COUNTY RESEARCH
 *
 * Runs activated official/public locator adapters against already-staged
 * discovered records.
 *
 * This endpoint:
 *
 *   - does not create Opportunities
 *   - does not create Claims
 *   - does not authorize outreach
 *   - does not verify candidate findings automatically
 *   - does not infer missing personal information
 *
 * Automatically collected findings remain candidates until reviewed.
 */
export async function POST(
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
      "You do not have permission to run claimant locator research.",
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

  const limit =
    parseLimit(
      request.nextUrl.searchParams
        .get(
          "limit",
        ),
    );

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
      "The selected state is invalid.",
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
      "The selected county is invalid for this state.",
      400,
    );
  }

  const stateCode =
    state.postalCode as StateCode;

  if (
    !clearedForState(
      session,
      stateCode,
    )
  ) {
    return errorResponse(
      "You are not cleared to run claimant locator research for this state.",
      403,
    );
  }

  const allRecords =
    await listDiscoveredRecords();

  const countyRecords =
    allRecords
      .filter(
        (record) =>
          record.state ===
            stateCode &&
          normalizeCounty(
            record.county,
          ) ===
            normalizeCounty(
              county.name,
            ) &&
          record.status !==
            "dismissed",
      )
      .slice(
        0,
        limit,
      );

  if (
    countyRecords.length ===
    0
  ) {
    return errorResponse(
      "No eligible discovered records were found for this county.",
      404,
    );
  }

  try {
    const result =
      await researchClaimantLocatorsForRecords(
        countyRecords,
        session.user.id,
      );

    return NextResponse.json(
      {
        ok:
          true,

        jurisdiction: {
          state:
            stateCode,

          stateName:
            state.name,

          county:
            county.name,

          countyGeoid:
            county.geoid,
        },

        requestedLimit:
          limit,

        availableCountyRecords:
          allRecords.filter(
            (record) =>
              record.state ===
                stateCode &&
              normalizeCounty(
                record.county,
              ) ===
                normalizeCounty(
                  county.name,
                ) &&
              record.status !==
                "dismissed",
          ).length,

        research: {
          processedCount:
            result.processedCount,

          researchedCount:
            result.researchedCount,

          unsupportedCount:
            result.unsupportedCount,

          ownerMatchedCount:
            result.ownerMatchedCount,

          mailingAddressCandidatesSaved:
            result.mailingAddressCandidatesSaved,

          aliasCandidatesSaved:
            result.aliasCandidatesSaved,

          duplicateFindingsSkipped:
            result.duplicateFindingsSkipped,
        },

        results:
          result.results,

        operationalEffects: {
          opportunitiesCreated:
            0,

          claimsCreated:
            0,

          outreachAuthorized:
            false,

          candidateFindingsVerified:
            false,
        },

        message:
          "Claimant locator research completed. Automatically collected findings remain candidates until reviewed.",
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
        : "Unable to complete claimant locator research.",
      500,
    );
  }
}