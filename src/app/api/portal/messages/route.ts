import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getClaimantMessageThreadForClaimant,
  getClaimantMessagingProfile,
  listClaimantMessageThreadsForClaimant,
  sendClaimantPortalMessage,
} from "@/server/claimant-message-store";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

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

export async function GET(
  request:
    NextRequest,
) {
  const session =
    await resolveClaimantSession();

  if (!session) {
    return errorResponse(
      "Claimant authentication is required.",
      401,
    );
  }

  try {
    const profile =
      await getClaimantMessagingProfile(
        session.claimantId,
      );

    if (!profile) {
      return errorResponse(
        "Claimant account could not be resolved.",
        404,
      );
    }

    const threads =
      await listClaimantMessageThreadsForClaimant(
        session.claimantId,
      );

    const threadId =
      request.nextUrl.searchParams
        .get(
          "threadId",
        )
        ?.trim();

    const thread =
      threadId
        ? await getClaimantMessageThreadForClaimant(
            session.claimantId,
            threadId,
          )
        : undefined;

    return NextResponse.json(
      {
        profile,

        threads,

        thread,
      },
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
        : "Unable to load secure messages.",
      409,
    );
  }
}

export async function POST(
  request:
    NextRequest,
) {
  const session =
    await resolveClaimantSession();

  if (!session) {
    return errorResponse(
      "Claimant authentication is required.",
      401,
    );
  }

  try {
    const formData =
      await request.formData();

    const threadValue =
      formData.get(
        "threadId",
      );

    const bodyValue =
      formData.get(
        "bodyText",
      );

    const replyValue =
      formData.get(
        "replyToMessageId",
      );

    if (
      typeof threadValue !==
        "string" ||
      !threadValue.trim()
    ) {
      return errorResponse(
        "A DueQuity conversation must exist before a claimant can reply.",
        409,
      );
    }

    const files =
      formData
        .getAll(
          "files",
        )
        .filter(
          (
            value,
          ): value is File =>
            value instanceof File,
        );

    const thread =
      await sendClaimantPortalMessage({
        claimantId:
          session.claimantId,

        threadId:
          threadValue,

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

    const [
      profile,
      threads,
    ] =
      await Promise.all([
        getClaimantMessagingProfile(
          session.claimantId,
        ),

        listClaimantMessageThreadsForClaimant(
          session.claimantId,
        ),
      ]);

    if (!profile) {
      return errorResponse(
        "Claimant account could not be resolved.",
        404,
      );
    }

    return NextResponse.json(
      {
        profile,

        threads,

        thread,
      },
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