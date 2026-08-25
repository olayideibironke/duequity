import {
  NextResponse,
} from "next/server";

import {
  getClaimantMessageAttachmentDownloadForStaff,
} from "@/server/claimant-message-store";

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
      id: string;

      attachmentId:
        string;
    }>;
  },
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Staff authentication is required.",
      },
      {
        status:
          401,
      },
    );
  }

  if (
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
          403,
      },
    );
  }

  const {
    id,
    attachmentId,
  } =
    await context.params;

  try {
    const download =
      await getClaimantMessageAttachmentDownloadForStaff(
        session,
        id,
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