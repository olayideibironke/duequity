import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  acknowledgeStaffMailMessage,
  archiveStaffMailMessage,
  getStaffMailFolderCounts,
  getStaffMailMessage,
  markStaffMailMessageRead,
  restoreStaffMailMessage,
  sendStaffMailMessage,
  trashStaffMailMessage,
  updateStaffMailDraft,
  type StaffMailPriority,
  type StaffMailRecipientInput,
  type StaffMailRecipientType,
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
    : "Unexpected DueQuity Mail error.";
}

async function requestJson(
  request: NextRequest,
): Promise<
  Record<
    string,
    unknown
  >
> {
  try {
    const body =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(
        body,
      )
    ) {
      return {};
    }

    return body as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

function stringValue(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value
    : "";
}

function booleanValue(
  value: unknown,
): boolean {
  return value ===
    true;
}

function recipientType(
  value: unknown,
): StaffMailRecipientType | undefined {
  if (
    value === "to" ||
    value === "cc" ||
    value === "bcc"
  ) {
    return value;
  }

  return undefined;
}

function priorityValue(
  value: unknown,
): StaffMailPriority {
  return value ===
    "high"
    ? "high"
    : "normal";
}

function recipientInputs(
  value: unknown,
): StaffMailRecipientInput[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  const recipients:
    StaffMailRecipientInput[] =
    [];

  for (
    const item of value
  ) {
    if (
      !item ||
      typeof item !==
        "object" ||
      Array.isArray(
        item,
      )
    ) {
      continue;
    }

    const record =
      item as Record<
        string,
        unknown
      >;

    const staffUserId =
      stringValue(
        record.staffUserId,
      ).trim();

    const type =
      recipientType(
        record.recipientType,
      );

    if (
      !staffUserId ||
      !type
    ) {
      continue;
    }

    recipients.push({
      staffUserId,

      recipientType:
        type,
    });
  }

  return recipients;
}

function sanitizeMessageForViewer<
  T extends {
    sender: {
      id: string;
    };

    recipients: Array<{
      participant: {
        id: string;
      };

      recipientType: string;
    }>;
  },
>(
  message: T,
  viewerId: string,
): T {
  const viewerIsSender =
    message.sender.id ===
    viewerId;

  if (
    viewerIsSender
  ) {
    return message;
  }

  return {
    ...message,

    recipients:
      message.recipients.filter(
        (
          recipient,
        ) =>
          recipient.recipientType !==
            "bcc" ||
          recipient.participant.id ===
            viewerId,
      ),
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
          "Mail message ID is required.",
      },
      {
        status:
          400,
      },
    );
  }

  try {
    await markStaffMailMessageRead(
      session.user,
      messageId,
    );

    const [
      message,
      counts,
    ] =
      await Promise.all([
        getStaffMailMessage(
          session.user,
          messageId,
        ),

        getStaffMailFolderCounts(
          session.user.id,
        ),
      ]);

    return NextResponse.json(
      {
        message:
          sanitizeMessageForViewer(
            message,
            session.user.id,
          ),

        counts,
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
/* PATCH                                                                       */
/* ========================================================================== */

export async function PATCH(
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
          "Mail message ID is required.",
      },
      {
        status:
          400,
      },
    );
  }

  const body =
    await requestJson(
      request,
    );

  const action =
    stringValue(
      body.action,
    )
      .trim()
      .toLowerCase();

  try {
    switch (
      action
    ) {
      /* ================================================================== save */
      case "save": {
        const message =
          await updateStaffMailDraft({
            actor:
              session.user,

            messageId,

            subject:
              stringValue(
                body.subject,
              ),

            bodyText:
              stringValue(
                body.bodyText,
              ),

            priority:
              priorityValue(
                body.priority,
              ),

            acknowledgmentRequested:
              booleanValue(
                body.acknowledgmentRequested,
              ),

            recipients:
              recipientInputs(
                body.recipients,
              ),
          });

        const counts =
          await getStaffMailFolderCounts(
            session.user.id,
          );

        return NextResponse.json(
          {
            message:
              sanitizeMessageForViewer(
                message,
                session.user.id,
              ),

            counts,
          },
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      }

      /* ================================================================== send */
      case "send": {
        /*
         * Compose sends the complete draft payload with the send request.
         *
         * Saving immediately before send guarantees that the exact subject,
         * body, priority and recipient set visible on screen are the values
         * persisted into the sent message.
         */
        await updateStaffMailDraft({
          actor:
            session.user,

          messageId,

          subject:
            stringValue(
              body.subject,
            ),

          bodyText:
            stringValue(
              body.bodyText,
            ),

          priority:
            priorityValue(
              body.priority,
            ),

          acknowledgmentRequested:
            booleanValue(
              body.acknowledgmentRequested,
            ),

          recipients:
            recipientInputs(
              body.recipients,
            ),
        });

        const message =
          await sendStaffMailMessage(
            session.user,
            messageId,
          );

        const counts =
          await getStaffMailFolderCounts(
            session.user.id,
          );

        return NextResponse.json(
          {
            message:
              sanitizeMessageForViewer(
                message,
                session.user.id,
              ),

            counts,
          },
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      }

      /* ============================================================= mark read */
      case "read": {
        await markStaffMailMessageRead(
          session.user,
          messageId,
        );

        const [
          message,
          counts,
        ] =
          await Promise.all([
            getStaffMailMessage(
              session.user,
              messageId,
            ),

            getStaffMailFolderCounts(
              session.user.id,
            ),
          ]);

        return NextResponse.json(
          {
            message:
              sanitizeMessageForViewer(
                message,
                session.user.id,
              ),

            counts,
          },
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      }

      /* ========================================================== acknowledge */
      case "acknowledge": {
        await acknowledgeStaffMailMessage(
          session.user,
          messageId,
        );

        const [
          message,
          counts,
        ] =
          await Promise.all([
            getStaffMailMessage(
              session.user,
              messageId,
            ),

            getStaffMailFolderCounts(
              session.user.id,
            ),
          ]);

        return NextResponse.json(
          {
            message:
              sanitizeMessageForViewer(
                message,
                session.user.id,
              ),

            counts,
          },
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      }

      /* =============================================================== archive */
      case "archive": {
        await archiveStaffMailMessage(
          session.user,
          messageId,
        );

        const counts =
          await getStaffMailFolderCounts(
            session.user.id,
          );

        return NextResponse.json(
          {
            ok:
              true,

            folder:
              "archive",

            counts,
          },
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      }

      /* ================================================================= trash */
      case "trash": {
        await trashStaffMailMessage(
          session.user,
          messageId,
        );

        const counts =
          await getStaffMailFolderCounts(
            session.user.id,
          );

        return NextResponse.json(
          {
            ok:
              true,

            folder:
              "trash",

            counts,
          },
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      }

      /* ================================================================ restore */
      case "restore": {
        await restoreStaffMailMessage(
          session.user,
          messageId,
        );

        const counts =
          await getStaffMailFolderCounts(
            session.user.id,
          );

        return NextResponse.json(
          {
            ok:
              true,

            counts,
          },
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      }

      default:
        return NextResponse.json(
          {
            error:
              "Unsupported DueQuity Mail action.",
          },
          {
            status:
              400,
          },
        );
    }
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