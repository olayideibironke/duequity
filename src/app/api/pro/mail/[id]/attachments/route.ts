import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getStaffMailMessage,
  STAFF_MAIL_MAX_ATTACHMENT_BYTES,
  uploadStaffMailAttachment,
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

function mimeTypeForFile(
  fileName: string,
  browserMimeType: string,
): string {
  const normalizedName =
    fileName
      .trim()
      .toLowerCase();

  const normalizedBrowserType =
    browserMimeType
      .trim()
      .toLowerCase();

  if (
    normalizedName.endsWith(
      ".xlsx",
    )
  ) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  if (
    normalizedName.endsWith(
      ".xls",
    )
  ) {
    return "application/vnd.ms-excel";
  }

  if (
    normalizedName.endsWith(
      ".csv",
    )
  ) {
    return "text/csv";
  }

  if (
    normalizedName.endsWith(
      ".pdf",
    )
  ) {
    return "application/pdf";
  }

  if (
    normalizedName.endsWith(
      ".docx",
    )
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (
    normalizedName.endsWith(
      ".doc",
    )
  ) {
    return "application/msword";
  }

  if (
    normalizedName.endsWith(
      ".txt",
    )
  ) {
    return "text/plain";
  }

  if (
    normalizedName.endsWith(
      ".jpg",
    ) ||
    normalizedName.endsWith(
      ".jpeg",
    )
  ) {
    return "image/jpeg";
  }

  if (
    normalizedName.endsWith(
      ".png",
    )
  ) {
    return "image/png";
  }

  if (
    normalizedName.endsWith(
      ".webp",
    )
  ) {
    return "image/webp";
  }

  return normalizedBrowserType;
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
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
  } =
    await context.params;

  const messageId =
    id.trim();

  if (
    !messageId
  ) {
    return NextResponse.json(
      {
        error:
          "Mail draft ID is required.",
      },
      {
        status:
          400,
      },
    );
  }

  try {
    const currentMessage =
      await getStaffMailMessage(
        session.user,
        messageId,
      );

    if (
      currentMessage.sender.id !==
        session.user.id ||
      currentMessage.state !==
        "draft"
    ) {
      return NextResponse.json(
        {
          error:
            "Attachments may only be added to your own mail drafts.",
        },
        {
          status:
            403,
        },
      );
    }

    const formData =
      await request.formData();

    const uploaded =
      formData.get(
        "file",
      );

    if (
      !(uploaded instanceof File)
    ) {
      return NextResponse.json(
        {
          error:
            "Select a file to attach.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      uploaded.size <=
      0
    ) {
      return NextResponse.json(
        {
          error:
            "The selected attachment is empty.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      uploaded.size >
      STAFF_MAIL_MAX_ATTACHMENT_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            "Attachment exceeds the 25 MB limit.",
        },
        {
          status:
            413,
        },
      );
    }

    const arrayBuffer =
      await uploaded.arrayBuffer();

    const attachment =
      await uploadStaffMailAttachment({
        actor:
          session.user,

        messageId,

        fileName:
          uploaded.name,

        mimeType:
          mimeTypeForFile(
            uploaded.name,
            uploaded.type,
          ),

        bytes:
          new Uint8Array(
            arrayBuffer,
          ),
      });

    const message =
      await getStaffMailMessage(
        session.user,
        messageId,
      );

    return NextResponse.json(
      {
        attachment,

        message,
      },
      {
        status:
          201,

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

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status:
          forbidden
            ? 403
            : 400,
      },
    );
  }
}