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
  researchIndividualPublicWebContacts,
} from "@/server/claimant-locator-individual-public-web-research";

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
      ok: false,
      error: message,
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
 * INDIVIDUAL CLAIMANT PUBLIC-WEB RESEARCH
 *
 * This route performs identity-anchored public-web research for one discovered
 * individual former owner.
 *
 * Important:
 *
 * - same-name-only research is not permitted
 * - an independent identity anchor is required
 * - saved phone/email findings remain candidates
 * - no claimant is created
 * - no Opportunity is created
 * - no Claim is created
 * - no outreach is authorized
 * - no candidate is automatically verified
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
      "You do not have permission to research individual claimant contact information.",
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
    !body ||
    typeof body !==
      "object"
  ) {
    return errorResponse(
      "A valid JSON request body is required.",
      400,
    );
  }

  const recordId =
    "recordId" in body &&
    typeof body.recordId ===
      "string"
      ? body.recordId.trim()
      : "";

  if (
    !recordId
  ) {
    return errorResponse(
      "recordId is required.",
      400,
    );
  }

  const record =
    await getDiscoveredRecordById(
      recordId,
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
      await researchIndividualPublicWebContacts({
        record,

        actorUserId:
          session.user.id,
      });

    return NextResponse.json(
      {
        ok: true,

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

          claimantsCreated:
            0,

          outreachAuthorized:
            false,

          candidatesAutomaticallyVerified:
            false,
        },

        message:
          "Individual public-contact research completed. Persisted findings remain candidates until reviewed.",
      },
      {
        status: 200,

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
        : "Individual claimant public-contact research failed.",
      500,
    );
  }
}