import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createStaffMailDraft,
  getStaffMailFolderCounts,
  listActiveStaffMailDirectory,
  listStaffMailFolder,
  type StaffMailFolder,
  type StaffMailListItem,
} from "@/server/staff-mail-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function isStaffMailFolder(
  value: string | null,
): value is StaffMailFolder {
  return (
    value === "inbox" ||
    value === "sent" ||
    value === "drafts" ||
    value === "archive" ||
    value === "trash"
  );
}

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
  Record<string, unknown>
> {
  try {
    const body =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
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

function sanitizeListItemForViewer(
  item: StaffMailListItem,
  viewerId: string,
): StaffMailListItem {
  const viewerIsSender =
    item.sender.id ===
    viewerId;

  if (
    viewerIsSender
  ) {
    return item;
  }

  return {
    ...item,

    recipients:
      item.recipients.filter(
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
  request: NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
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

  try {
    const folderParam =
      request.nextUrl.searchParams.get(
        "folder",
      );

    const folder:
      StaffMailFolder =
      isStaffMailFolder(
        folderParam,
      )
        ? folderParam
        : "inbox";

    const [
      items,
      counts,
      directory,
    ] =
      await Promise.all([
        listStaffMailFolder(
          session.user.id,
          folder,
        ),

        getStaffMailFolderCounts(
          session.user.id,
        ),

        listActiveStaffMailDirectory(),
      ]);

    const recipientDirectory =
      directory.filter(
        (
          participant,
        ) =>
          participant.id !==
          session.user.id,
      );

    return NextResponse.json(
      {
        folder,

        items:
          items.map(
            (
              item,
            ) =>
              sanitizeListItemForViewer(
                item,
                session.user.id,
              ),
          ),

        counts,

        directory:
          recipientDirectory,

        currentUser: {
          id:
            session.user.id,

          name:
            session.user.name,

          email:
            session.user.email,

          title:
            session.user.title,

          role:
            session.user.role,
        },
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
          500,
      },
    );
  }
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
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

  const body =
    await requestJson(
      request,
    );

  const action =
    typeof body.action ===
      "string"
      ? body.action
          .trim()
          .toLowerCase()
      : "";

  if (
    action !==
    "create_draft"
  ) {
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

  const replyToMessageId =
    typeof body.replyToMessageId ===
      "string"
      ? body.replyToMessageId.trim()
      : "";

  try {
    const draft =
      await createStaffMailDraft({
        sender:
          session.user,

        replyToMessageId:
          replyToMessageId ||
          undefined,
      });

    return NextResponse.json(
      {
        draft,
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