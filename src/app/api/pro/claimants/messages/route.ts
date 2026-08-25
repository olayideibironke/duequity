import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getClaimantMessageThreadForStaff,
  sendStaffClaimantMessage,
} from "@/server/claimant-message-store";

import {
  listClaimantMessageMailbox,
  searchClaimantMessageMailbox,
  type ClaimantMailboxFolder,
} from "@/server/claimant-message-mailbox-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

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

function normalizeFolder(
  value:
    string | null,
): ClaimantMailboxFolder {
  switch (
    value
  ) {
    case "sent":
      return "sent";

    case "attachments":
      return "attachments";

    default:
      return "inbox";
  }
}

export async function GET(
  request:
    NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (
    !session ||
    !session.permissions.includes(
      "claimant.read",
    )
  ) {
    return errorResponse(
      "Staff claimant access is required.",
      401,
    );
  }

  try {
    const query =
      (
        request.nextUrl.searchParams.get(
          "q",
        ) ??
        ""
      ).trim();

    const folder =
      normalizeFolder(
        request.nextUrl.searchParams.get(
          "folder",
        ),
      );

    const mailbox =
      query
        ? await searchClaimantMessageMailbox(
            query,
          )
        : await listClaimantMessageMailbox(
            folder,
          );

    const threadId =
      request.nextUrl.searchParams
        .get(
          "threadId",
        )
        ?.trim();

    const claimantId =
      request.nextUrl.searchParams
        .get(
          "claimantId",
        )
        ?.trim();

    const thread =
      threadId &&
      claimantId
        ? await getClaimantMessageThreadForStaff(
            claimantId,
            threadId,
          )
        : undefined;

    return NextResponse.json(
      {
        ...mailbox,

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
        : "Unable to load claimant message repository.",
      409,
    );
  }
}

export async function POST(
  request:
    NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (
    !session ||
    !session.permissions.includes(
      "claimant.read",
    )
  ) {
    return errorResponse(
      "Staff claimant access is required.",
      401,
    );
  }

  try {
    const formData =
      await request.formData();

    const claimantIdValue =
      formData.get(
        "claimantId",
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
      typeof claimantIdValue !==
        "string" ||
      !claimantIdValue.trim()
    ) {
      return errorResponse(
        "Claimant ID is required.",
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
      await sendStaffClaimantMessage({
        actor:
          session.user,

        claimantId:
          claimantIdValue,

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

    const mailbox =
      await listClaimantMessageMailbox(
        "sent",
      );

    return NextResponse.json(
      {
        ...mailbox,

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
        : "Unable to send claimant message.",
      409,
    );
  }
}