import { NextRequest, NextResponse } from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";
import { resolveAddressGeography } from "@/server/geography-resolver";
import { resolveStaffSession } from "@/server/staff-session";

/**
 * DUEQUITY ADDRESS GEOGRAPHY API
 *
 * Internal validation endpoint for resolving a U.S. property address into:
 *
 *   - standardized Census address
 *   - state
 *   - state FIPS
 *   - county / county equivalent
 *   - county FIPS
 *   - county GEOID
 *
 * Geography only.
 *
 * This endpoint does NOT determine:
 *
 *   - legal rules
 *   - sale type
 *   - legal lane
 *   - deadlines
 *   - fee restrictions
 *   - jurisdiction approval
 */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  /*
   * Fail-closed staff session gate.
   *
   * This is internal staff tooling with no public caller. Without a session it
   * would be an unauthenticated proxy for outbound requests to government hosts,
   * so it refuses before doing any work.
   */
  const session =
    await resolveStaffSession();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        error: STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      },
      { status: 401 },
    );
  }

  if (!can(session, "jurisdiction.read")) {
    return NextResponse.json(
      {
        ok: false,
        error: "You do not have permission to resolve address geography.",
      },
      { status: 403 },
    );
  }

  const address = request.nextUrl.searchParams.get("address")?.trim();

  if (!address) {
    return NextResponse.json(
      {
        ok: false,

        error: "Missing required address query parameter.",

        example:
          "/api/geography/resolve?address=14735 Main Street, Upper Marlboro, MD 20772",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const geography = await resolveAddressGeography(address);

    return NextResponse.json(
      {
        ok: true,

        geography,

        legalRulesResolved: false,

        message:
          "Geography resolved successfully. No legal or compliance rules were inferred.",
      },
      {
        status: 200,

        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to resolve property geography.";

    return NextResponse.json(
      {
        ok: false,

        error: message,

        legalRulesResolved: false,
      },
      {
        status: 422,

        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}