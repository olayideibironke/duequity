import {
  NextResponse,
} from "next/server";

import {
  getClaimantMailboxAttachmentDownload,
} from "@/server/claimant-message-mailbox-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET(
  _request:
    Request,
  context: {
    params: Promise<{
      attachmentId:
        string;
    }>;
  },
) {
  const session =
    await resolveStaffSession();

  if (
    !session ||
    !session.permissions.includes(
      "claimant.read",
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Staff claimant access is required.",
      },
      {
        status:
          401,
      },
    );
  }

  const {
    attachmentId,
  } =
    await context.params;

  try {
    const download =
      await getClaimantMailboxAttachmentDownload(
        attachmentId,
      );

    return NextResponse.json(
      download,
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
          error instanceof Error
            ? error.message
            : "Unable to download claimant attachment.",
      },
      {
        status:
          403,
      },
    );
  }
}