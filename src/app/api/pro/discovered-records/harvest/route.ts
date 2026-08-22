import { NextResponse } from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import { resolveStaffSession } from "@/server/staff-session";

import { harvestSupportedPublicRecords } from "@/server/public-record-harvester";

/**
 * STAFF PUBLIC-RECORD HARVEST API
 *
 * Runs activated official public-record adapters and stages the records in
 * Duequity's discovered-record repository.
 *
 * This endpoint requires opportunity.write because staged discoveries are
 * potential operational opportunities.
 *
 * Harvesting does NOT:
 *
 *   - create Opportunities
 *   - create Claims
 *   - approve jurisdictions
 *   - approve legal rules
 *   - authorize claimant intake
 *   - authorize outreach
 *   - calculate or approve commercial pricing
 */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,

      error: message,
    },
    {
      status,

      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST() {
  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "opportunity.write")) {
    return errorResponse(
      "You do not have permission to harvest operational opportunity records.",
      403,
    );
  }

  try {
    const result = await harvestSupportedPublicRecords();

    return NextResponse.json(
      {
        ok: true,

        harvest: {
          harvestedAt: result.harvestedAt,

          sourceRecordCount: result.sourceRecordCount,

          stagedRecordCount: result.stagedRecordCount,

          createdCount: result.createdCount,

          refreshedCount: result.refreshedCount,
        },

        operationalEffects: {
          opportunitiesCreated: 0,

          claimsCreated: 0,

          jurisdictionRulesCreated: false,

          jurisdictionApproved: false,

          intakeAuthorized: false,

          outreachAuthorized: false,
        },
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
        : "Unable to harvest official public records.";

    return errorResponse(message, 500);
  }
}