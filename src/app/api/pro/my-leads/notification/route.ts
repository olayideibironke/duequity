import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getUnseenStaffLeadCount,
  markStaffLeadAssignmentIdsSeen,
} from "@/server/staff-lead-notification-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function noStoreJson(
  body:
    Record<
      string,
      unknown
    >,
  status:
    number,
) {
  return NextResponse.json(
    body,
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

export async function GET() {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return noStoreJson(
      {
        error:
          "Staff authentication is required.",
      },
      401,
    );
  }

  try {
    const newCount =
      await getUnseenStaffLeadCount(
        session,
      );

    return noStoreJson(
      {
        newCount,
      },
      200,
    );
  } catch (
    error
  ) {
    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load lead notifications.",
      },
      403,
    );
  }
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request:
    NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return noStoreJson(
      {
        error:
          "Staff authentication is required.",
      },
      401,
    );
  }

  let body:
    unknown;

  try {
    body =
      await request.json();
  } catch {
    return noStoreJson(
      {
        error:
          "A valid lead acknowledgement payload is required.",
      },
      400,
    );
  }

  const assignmentIds =
    typeof body ===
      "object" &&
    body !==
      null &&
    "assignmentIds" in
      body &&
    Array.isArray(
      body.assignmentIds,
    )
      ? body.assignmentIds.filter(
          (
            value,
          ): value is string =>
            typeof value ===
            "string",
        )
      : [];

  if (
    assignmentIds.length ===
    0
  ) {
    return noStoreJson(
      {
        error:
          "At least one assigned lead is required for acknowledgement.",
      },
      400,
    );
  }

  try {
    const acknowledgedCount =
      await markStaffLeadAssignmentIdsSeen({
        session,

        assignmentIds,
      });

    return noStoreJson(
      {
        acknowledgedCount,
      },
      200,
    );
  } catch (
    error
  ) {
    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to acknowledge assigned leads.",
      },
      403,
    );
  }
}