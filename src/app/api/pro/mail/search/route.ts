import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getStaffMailFolderCounts,
  getStaffMailMessage,
  listStaffMailFolder,
  type StaffMailFolder,
  type StaffMailListItem,
  type StaffMailMessage,
} from "@/server/staff-mail-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const dynamic =
  "force-dynamic";

const SEARCH_FOLDERS:
  readonly StaffMailFolder[] = [
    "inbox",
    "sent",
    "drafts",
    "archive",
    "trash",
  ];

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unexpected DueQuity Mail search error.";
}

function sanitizeMessageForViewer(
  message: StaffMailMessage,
  viewerId: string,
): StaffMailMessage {
  if (
    message.sender.id ===
    viewerId
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

function searchTextForMessage(
  message: StaffMailMessage,
): string {
  const recipientText =
    message.recipients
      .map(
        (
          recipient,
        ) =>
          [
            recipient.recipientType,
            recipient.participant.name,
            recipient.participant.email,
            recipient.participant.title,
          ].join(
            " ",
          ),
      )
      .join(
        " ",
      );

  const attachmentText =
    message.attachments
      .map(
        (
          attachment,
        ) =>
          [
            attachment.fileName,
            attachment.mimeType,
          ].join(
            " ",
          ),
      )
      .join(
        " ",
      );

  return [
    message.sender.name,
    message.sender.email,
    message.sender.title,
    message.subject,
    message.bodyText,
    message.priority,
    message.state,
    recipientText,
    attachmentText,
  ]
    .join(
      " ",
    )
    .toLowerCase();
}

function bodyPreviewForSearch(
  bodyText: string,
  query: string,
): string {
  const normalizedBody =
    bodyText
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (
    !normalizedBody
  ) {
    return "";
  }

  const bodyLower =
    normalizedBody.toLowerCase();

  const queryLower =
    query.toLowerCase();

  const matchIndex =
    bodyLower.indexOf(
      queryLower,
    );

  if (
    matchIndex <
    0
  ) {
    return normalizedBody.slice(
      0,
      180,
    );
  }

  const start =
    Math.max(
      0,
      matchIndex -
        60,
    );

  const end =
    Math.min(
      normalizedBody.length,
      matchIndex +
        query.length +
        120,
    );

  const preview =
    normalizedBody.slice(
      start,
      end,
    );

  return `${
    start >
    0
      ? "…"
      : ""
  }${preview}${
    end <
    normalizedBody.length
      ? "…"
      : ""
  }`;
}

function listItemFromMessage(
  message: StaffMailMessage,
  viewerId: string,
  sourceFolder: StaffMailFolder,
  query: string,
): StaffMailListItem & {
  sourceFolder: StaffMailFolder;
} {
  const ownRecipient =
    message.recipients.find(
      (
        recipient,
      ) =>
        recipient.participant.id ===
        viewerId,
    );

  return {
    id:
      message.id,

    threadId:
      message.threadId,

    sender:
      message.sender,

    recipients:
      message.recipients,

    subject:
      message.subject,

    bodyPreview:
      bodyPreviewForSearch(
        message.bodyText,
        query,
      ),

    priority:
      message.priority,

    state:
      message.state,

    acknowledgmentRequested:
      message.acknowledgmentRequested,

    sentAt:
      message.sentAt,

    createdAt:
      message.createdAt,

    updatedAt:
      message.updatedAt,

    unread:
      message.state ===
        "sent" &&
      Boolean(
        ownRecipient &&
        !ownRecipient.readAt,
      ),

    attachmentCount:
      message.attachments.length,

    sourceFolder,
  };
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  request: NextRequest,
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

  const query =
    (
      request.nextUrl.searchParams.get(
        "q",
      ) ??
      ""
    )
      .trim()
      .slice(
        0,
        200,
      );

  if (
    !query
  ) {
    return NextResponse.json(
      {
        query:
          "",

        items:
          [],

        counts:
          await getStaffMailFolderCounts(
            session.user.id,
          ),
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  try {
    const folderResults =
      await Promise.all(
        SEARCH_FOLDERS.map(
          async (
            folder,
          ) => ({
            folder,

            items:
              await listStaffMailFolder(
                session.user.id,
                folder,
              ),
          }),
        ),
      );

    const sourceFolderByMessageId =
      new Map<
        string,
        StaffMailFolder
      >();

    for (
      const result of
        folderResults
    ) {
      for (
        const item of
          result.items
      ) {
        if (
          !sourceFolderByMessageId.has(
            item.id,
          )
        ) {
          sourceFolderByMessageId.set(
            item.id,
            result.folder,
          );
        }
      }
    }

    const messageIds =
      [
        ...sourceFolderByMessageId.keys(),
      ];

    const messages =
      await Promise.all(
        messageIds.map(
          (
            messageId,
          ) =>
            getStaffMailMessage(
              session.user,
              messageId,
            ),
        ),
      );

    const normalizedQuery =
      query.toLowerCase();

    const matches =
      messages
        .map(
          (
            message,
          ) =>
            sanitizeMessageForViewer(
              message,
              session.user.id,
            ),
        )
        .filter(
          (
            message,
          ) =>
            searchTextForMessage(
              message,
            ).includes(
              normalizedQuery,
            ),
        )
        .map(
          (
            message,
          ) =>
            listItemFromMessage(
              message,
              session.user.id,
              sourceFolderByMessageId.get(
                message.id,
              ) ??
                "inbox",
              query,
            ),
        )
        .sort(
          (
            left,
            right,
          ) =>
            Date.parse(
              right.sentAt ??
              right.updatedAt,
            ) -
            Date.parse(
              left.sentAt ??
              left.updatedAt,
            ),
        );

    return NextResponse.json(
      {
        query,

        items:
          matches,

        counts:
          await getStaffMailFolderCounts(
            session.user.id,
          ),
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
    return NextResponse.json(
      {
        error:
          errorMessage(
            error,
          ),
      },
      {
        status:
          400,
      },
    );
  }
}