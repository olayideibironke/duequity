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
  getDiscoveredRecordById,
} from "@/server/discovered-record-store";

import {
  researchPublicWebBusinessContacts,
} from "@/server/claimant-locator-public-web-research";

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
/* POST                                                                        */
/* ========================================================================== */

/**
 * PUBLIC CONTACT RESEARCH
 *
 * Persists only candidate locator findings.
 *
 * This route:
 *
 * - does not verify candidates automatically
 * - does not create a claimant
 * - does not create an Opportunity
 * - does not create a Claim
 * - does not authorize outreach
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
      "You do not have permission to run claimant public-contact research.",
      403,
    );
  }

  let body:
    unknown;

  try {
    body =
      await request.json();
  } catch {
    return errorResponse(
      "A valid JSON request body is required.",
      400,
    );
  }

  if (
    body ===
      null ||
    typeof body !==
      "object" ||
    Array.isArray(
      body,
    )
  ) {
    return errorResponse(
      "The public-contact research request is invalid.",
      400,
    );
  }

  const recordIdValue =
    (
      body as {
        recordId?: unknown;
      }
    ).recordId;

  if (
    typeof recordIdValue !==
      "string" ||
    !recordIdValue.trim()
  ) {
    return errorResponse(
      "A discovered record id is required.",
      400,
    );
  }

  const record =
    await getDiscoveredRecordById(
      recordIdValue.trim(),
    );

  if (
    !record
  ) {
    return errorResponse(
      "The discovered record was not found.",
      404,
    );
  }

  if (
    !clearedForState(
      session,
      record.state,
    )
  ) {
    return errorResponse(
      "You are not cleared to research claimant locator information for this state.",
      403,
    );
  }

  try {
    const research =
      await researchPublicWebBusinessContacts({
        record,

        actorUserId:
          session.user.id,
      });

    return NextResponse.json(
      {
        ok:
          true,

        record: {
          id:
            record.id,

          formerOwnerName:
            record.formerOwnerName,

          state:
            record.state,

          county:
            record.county,

          parcelNumber:
            record.parcelNumber ??
            null,
        },

        research,

        operationalEffects: {
          opportunitiesCreated:
            0,

          claimsCreated:
            0,

          outreachAuthorized:
            false,

          candidatesAutomaticallyVerified:
            false,
        },

        message:
          "Public contact research completed. Persisted findings remain candidates until reviewed.",
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