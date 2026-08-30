import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getClaimantPortalMailboxState,
  sendClaimantMailboxMessage,
} from "@/server/claimant-portal-mailbox-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorResponse(
  message:
    string,
  status =
    400,
) {
  return NextResponse.json(
    {
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
/* Get mailbox                                                                 */
/* ========================================================================== */

export async function GET() {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return errorResponse(
      "Claimant authentication is required.",
      401,
    );
  }

  try {
    const mailbox =
      await getClaimantPortalMailboxState(
        session.claimantId,
      );

    return NextResponse.json(
      mailbox,
      {
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
        : "Unable to load secure claimant messages.",
      409,
    );
  }
}

/* ========================================================================== */
/* Send message                                                                */
/* ========================================================================== */

export async function POST(
  request:
    NextRequest,
) {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return errorResponse(
      "Claimant authentication is required.",
      401,
    );
  }

  try {
    const formData =
      await request.formData();

    const subjectValue =
      formData.get(
        "subject",
      );

    const bodyValue =
      formData.get(
        "bodyText",
      );

    const replyValue =
      formData.get(
        "replyToMessageId",
      );

    const files =
      formData
        .getAll(
          "files",
        )
        .filter(
          (
            value,
          ): value is File =>
            value instanceof
            File,
        );

    /*
     * IMPORTANT:
     *
     * There is deliberately no recipient value accepted from the claimant.
     *
     * The server resolves the current authorized staff recipient directly from
     * the claimant's DueQuity assignment. A claimant cannot alter, forge or
     * choose the recipient through form data.
     */
    const mailbox =
      await sendClaimantMailboxMessage({
        claimantId:
          session.claimantId,

        subject:
          typeof subjectValue ===
            "string"
            ? subjectValue
            : "",

        bodyText:
          typeof bodyValue ===
            "string"
            ? bodyValue
            : "",

        replyToMessageId:
          typeof replyValue ===
            "string"
            ? replyValue
            : undefined,

        files,
      });

    return NextResponse.json(
      mailbox,
      {
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
        : "Unable to send secure claimant message.",
      409,
    );
  }
}