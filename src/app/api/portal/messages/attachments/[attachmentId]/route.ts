import {
  NextResponse,
} from "next/server";

import {
  getClaimantMessageAttachmentDownload,
} from "@/server/claimant-message-store";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

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
    await resolveClaimantSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Claimant authentication is required.",
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
      await getClaimantMessageAttachmentDownload(
        session.claimantId,
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