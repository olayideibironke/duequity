import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createStaffMailAttachmentDownloadUrl,
  getStaffMailMessage,
  removeStaffMailAttachment,
} from "@/server/staff-mail-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface RouteContext {
  params: Promise<{
    id: string;

    attachmentId: string;
  }>;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unexpected DueQuity Mail attachment error.";
}

async function resolveAttachmentAccess(
  messageId: string,
  attachmentId: string,
  session: NonNullable<
    Awaited<
      ReturnType<
        typeof resolveStaffSession
      >
    >
  >,
) {
  const message =
    await getStaffMailMessage(
      session.user,
      messageId,
    );

  const attachment =
    message.attachments.find(
      (
        item,
      ) =>
        item.id ===
        attachmentId,
    );

  if (
    !attachment
  ) {
    throw new Error(
      "Mail attachment not found.",
    );
  }

  return {
    message,

    attachment,
  };
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status:
          401,
      },
    );
  }

  const {
    id,
    attachmentId,
  } =
    await context.params;

  const messageId =
    id.trim();

  const normalizedAttachmentId =
    attachmentId.trim();

  if (
    !messageId ||
    !normalizedAttachmentId
  ) {
    return NextResponse.json(
      {
        error:
          "Mail message and attachment IDs are required.",
      },
      {
        status:
          400,
      },
    );
  }

  try {
    await resolveAttachmentAccess(
      messageId,
      normalizedAttachmentId,
      session,
    );

    const download =
      await createStaffMailAttachmentDownloadUrl(
        session.user,
        normalizedAttachmentId,
      );

    return NextResponse.json(
      {
        url:
          download.url,

        fileName:
          download.fileName,

        mimeType:
          download.mimeType,

        expiresInSeconds:
          300,
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
    const message =
      errorMessage(
        error,
      );

    const forbidden =
      message.includes(
        "not authorized",
      );

    const missing =
      message.includes(
        "not found",
      );

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status:
          forbidden
            ? 403
            : missing
              ? 404
              : 400,
      },
    );
  }
}

/* ========================================================================== */
/* DELETE                                                                      */
/* ========================================================================== */

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status:
          401,
      },
    );
  }

  const {
    id,
    attachmentId,
  } =
    await context.params;

  const messageId =
    id.trim();

  const normalizedAttachmentId =
    attachmentId.trim();

  if (
    !messageId ||
    !normalizedAttachmentId
  ) {
    return NextResponse.json(
      {
        error:
          "Mail message and attachment IDs are required.",
      },
      {
        status:
          400,
      },
    );
  }

  try {
    const {
      message,
    } =
      await resolveAttachmentAccess(
        messageId,
        normalizedAttachmentId,
        session,
      );

    if (
      message.sender.id !==
        session.user.id ||
      message.state !==
        "draft"
    ) {
      return NextResponse.json(
        {
          error:
            "Only attachments on your own unsent drafts may be removed.",
        },
        {
          status:
            403,
        },
      );
    }

    await removeStaffMailAttachment(
      session.user,
      normalizedAttachmentId,
    );

    const updatedMessage =
      await getStaffMailMessage(
        session.user,
        messageId,
      );

    return NextResponse.json(
      {
        ok:
          true,

        message:
          updatedMessage,
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
    const message =
      errorMessage(
        error,
      );

    const forbidden =
      message.includes(
        "not authorized",
      ) ||
      message.includes(
        "draft not found",
      );

    const missing =
      message.includes(
        "not found",
      );

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status:
          forbidden
            ? 403
            : missing
              ? 404
              : 400,
      },
    );
  }
}