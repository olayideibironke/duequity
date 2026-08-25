import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getClaimantMessageThreadForStaff,
  getClaimantMessagingProfile,
  listClaimantMessageThreadsForStaff,
  sendStaffClaimantMessage,
} from "@/server/claimant-message-store";

import {
  getClaimantOnboardingByClaimantIdForStaff,
} from "@/server/claimant-onboarding-store";

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

export async function GET(
  request:
    NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return errorResponse(
      "Staff authentication is required.",
      401,
    );
  }

  if (
    !session.permissions.includes(
      "claimant.read",
    )
  ) {
    return errorResponse(
      "Staff claimant access is required.",
      403,
    );
  }

  const {
    id,
  } =
    await context.params;

  try {
    const accessibleOnboarding =
      await getClaimantOnboardingByClaimantIdForStaff(
        session,
        id,
      );

    if (!accessibleOnboarding) {
      return errorResponse(
        "Claimant not found.",
        404,
      );
    }

    const profile =
      await getClaimantMessagingProfile(
        id,
      );

    if (!profile) {
      return errorResponse(
        "Claimant not found.",
        404,
      );
    }

    const threads =
      await listClaimantMessageThreadsForStaff(
        id,
      );

    const threadId =
      request.nextUrl.searchParams
        .get(
          "threadId",
        )
        ?.trim();

    const thread =
      threadId
        ? await getClaimantMessageThreadForStaff(
            id,
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
        : "Unable to load claimant messages.",
      409,
    );
  }
}

export async function POST(
  request:
    NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return errorResponse(
      "Staff authentication is required.",
      401,
    );
  }

  if (
    !session.permissions.includes(
      "claimant.read",
    )
  ) {
    return errorResponse(
      "Staff claimant access is required.",
      403,
    );
  }

  const {
    id,
  } =
    await context.params;

  try {
    const accessibleOnboarding =
      await getClaimantOnboardingByClaimantIdForStaff(
        session,
        id,
      );

    if (!accessibleOnboarding) {
      return errorResponse(
        "Claimant not found.",
        404,
      );
    }

    const formData =
      await request.formData();

    const bodyValue =
      formData.get(
        "bodyText",
      );

    const replyValue =
      formData.get(
        "replyToMessageId",
      );

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
          id,

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
          id,
        ),

        listClaimantMessageThreadsForStaff(
          id,
        ),
      ]);

    if (!profile) {
      return errorResponse(
        "Claimant not found.",
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
        : "Unable to send claimant message.",
      409,
    );
  }
}