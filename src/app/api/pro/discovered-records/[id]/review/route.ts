import { NextRequest, NextResponse } from "next/server";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import { resolveStaffSession } from "@/server/staff-session";

import {
  getDiscoveredRecordById,
  reviewDiscoveredRecord,
  type DiscoveredRecordReviewDecision,
} from "@/server/discovered-record-store";

/**
 * DISCOVERED RECORD REVIEW API
 *
 * Allows an authorized operational staff member to mark a staged official
 * source record as reviewed or dismissed.
 *
 * This action does NOT:
 *
 *   - create an Opportunity
 *   - create a Claim
 *   - approve a jurisdiction
 *   - approve legal rules
 *   - authorize claimant intake
 *   - authorize outreach
 *   - approve commercial pricing
 */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ReviewRequestBody {
  decision?: DiscoveredRecordReviewDecision;

  reviewNote?: string;
}

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

function isReviewDecision(
  value: unknown,
): value is DiscoveredRecordReviewDecision {
  return value === "reviewed" || value === "dismissed";
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "opportunity.write")) {
    return errorResponse(
      "You do not have permission to review discovered operational records.",
      403,
    );
  }

  const { id } = await context.params;

  const record = await getDiscoveredRecordById(id);

  if (!record) {
    return errorResponse("Discovered record not found.", 404);
  }

  if (!clearedForState(session, record.state)) {
    return errorResponse(
      "You are not cleared to review records in this state.",
      403,
    );
  }

  let body: ReviewRequestBody;

  try {
    body = (await request.json()) as ReviewRequestBody;
  } catch {
    return errorResponse("A valid JSON review request is required.", 400);
  }

  if (!isReviewDecision(body.decision)) {
    return errorResponse("Review decision must be reviewed or dismissed.", 400);
  }

  const reviewNote =
    typeof body.reviewNote === "string" ? body.reviewNote.trim() : undefined;

  if (body.decision === "dismissed" && !reviewNote) {
    return errorResponse(
      "A review note is required when dismissing a discovered record.",
      400,
    );
  }

  try {
    const updated = await reviewDiscoveredRecord({
      id: record.id,

      decision: body.decision,

      actorUserId: session.user.id,

      reviewNote,
    });

    return NextResponse.json(
      {
        ok: true,

        record: {
          id: updated.id,

          status: updated.status,

          reviewedAt: updated.reviewedAt,

          reviewedByUserId: updated.reviewedByUserId,

          reviewNote: updated.reviewNote,
        },

        operationalEffects: {
          opportunitiesCreated: 0,

          claimsCreated: 0,

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
        : "Unable to review discovered record.";

    if (message === "Discovered record not found.") {
      return errorResponse(message, 404);
    }

    return errorResponse(message, 400);
  }
}