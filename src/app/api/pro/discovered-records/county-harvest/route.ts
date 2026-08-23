import {
  NextResponse,
} from "next/server";

import type {
  StateCode,
} from "@/domain/types";

import {
  can,
  clearedForState,
} from "@/lib/session";

import {
  loadNationalGeography,
} from "@/server/geography-resolver";

import {
  harvestOfficialPublicRecordsForCounty,
} from "@/server/public-record-harvester";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Request                                                                     */
/* ========================================================================== */

interface CountyHarvestRequest {
  state?: unknown;

  countyGeoid?: unknown;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function requestText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: Request,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,

        message:
          "Staff authentication is required.",
      },
      {
        status: 401,
      },
    );
  }

  if (
    !can(
      session,
      "opportunity.write",
    )
  ) {
    return NextResponse.json(
      {
        ok: false,

        message:
          "Your current staff role does not authorize public-record harvesting.",
      },
      {
        status: 403,
      },
    );
  }

  let body: CountyHarvestRequest;

  try {
    body =
      (await request.json()) as CountyHarvestRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,

        message:
          "The county harvest request could not be read.",
      },
      {
        status: 400,
      },
    );
  }

  const requestedState =
    requestText(
      body.state,
    ).toUpperCase();

  const requestedCountyGeoid =
    requestText(
      body.countyGeoid,
    );

  if (
    !requestedState
  ) {
    return NextResponse.json(
      {
        ok: false,

        message:
          "Select a state before pulling surplus records.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !requestedCountyGeoid
  ) {
    return NextResponse.json(
      {
        ok: false,

        message:
          "Select a county before pulling surplus records.",
      },
      {
        status: 400,
      },
    );
  }

  const geography =
    await loadNationalGeography();

  const state =
    geography.states.find(
      (candidate) =>
        candidate.postalCode ===
        requestedState,
    );

  if (!state) {
    return NextResponse.json(
      {
        ok: false,

        message:
          "The selected state is not part of Duequity's validated U.S. geography registry.",
      },
      {
        status: 400,
      },
    );
  }

  const county =
    state.counties.find(
      (candidate) =>
        candidate.geoid ===
        requestedCountyGeoid,
    );

  if (!county) {
    return NextResponse.json(
      {
        ok: false,

        message:
          "The selected county does not belong to the selected state in Duequity's geography registry.",
      },
      {
        status: 400,
      },
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
    return NextResponse.json(
      {
        ok: false,

        message:
          "Your current staff clearance does not authorize record harvesting in this state.",
      },
      {
        status: 403,
      },
    );
  }

  try {
    const result =
      await harvestOfficialPublicRecordsForCounty(
        stateCode,
        county.name,
      );

    return NextResponse.json({
      ok: true,

      harvest: {
        state:
          stateCode,

        stateName:
          state.name,

        county:
          county.name,

        countyGeoid:
          county.geoid,

        sourceName:
          result.sourceName,

        harvestedAt:
          result.harvestedAt,

        sourceRecordCount:
          result.sourceRecordCount,

        stagedRecordCount:
          result.stagedRecordCount,

        createdCount:
          result.createdCount,

        refreshedCount:
          result.refreshedCount,
      },

      operationalEffects: {
        opportunitiesCreated: 0,

        claimsCreated: 0,

        claimantsCreated: 0,

        claimantAuthUsersCreated: 0,

        outreachAuthorized: false,

        outreachSent: false,

        onboardingStarted: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,

        message:
          error instanceof Error
            ? error.message
            : "Duequity could not pull official surplus records for this county.",
      },
      {
        status: 400,
      },
    );
  }
}