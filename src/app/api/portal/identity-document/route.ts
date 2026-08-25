import {
  NextResponse,
} from "next/server";

import {
  getClaimantIdentityDocumentState,
  isGovernmentIdType,
  uploadClaimantGovernmentId,
} from "@/server/claimant-identity-document-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Response helpers                                                            */
/* ========================================================================== */

function errorResponse(
  message:
    string,
  status =
    400,
) {
  return NextResponse.json(
    {
      ok:
        false,

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

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET() {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return errorResponse(
      "Claimant authentication is required.",
      401,
    );
  }

  try {
    const state =
      await getClaimantIdentityDocumentState(
        session.claimantId,
      );

    return NextResponse.json(
      {
        ok:
          true,

        state,
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
        : "Identity verification could not be loaded.",
      409,
    );
  }
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request:
    Request,
) {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return errorResponse(
      "Claimant authentication is required.",
      401,
    );
  }

  let formData:
    FormData;

  try {
    formData =
      await request.formData();
  } catch {
    return errorResponse(
      "The government ID upload could not be read.",
    );
  }

  const typeValue =
    formData.get(
      "governmentIdType",
    );

  const fileValue =
    formData.get(
      "file",
    );

  if (
    !isGovernmentIdType(
      typeValue,
    )
  ) {
    return errorResponse(
      "Select the type of government-issued ID you are uploading.",
    );
  }

  if (
    !(fileValue instanceof File)
  ) {
    return errorResponse(
      "Choose a government ID file to upload.",
    );
  }

  try {
    const arrayBuffer =
      await fileValue.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer,
      );

    const state =
      await uploadClaimantGovernmentId({
        claimantId:
          session.claimantId,

        governmentIdType:
          typeValue,

        originalFileName:
          fileValue.name,

        mimeType:
          fileValue.type,

        buffer,
      });

    return NextResponse.json(
      {
        ok:
          true,

        state,
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
        : "The government ID could not be uploaded.",
      409,
    );
  }
}