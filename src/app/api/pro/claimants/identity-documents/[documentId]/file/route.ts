import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getAssignedLeadIdentityFileForStaff,
} from "@/server/assigned-lead-identity-review-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function safeFileName(
  value:
    string,
): string {
  const normalized =
    value
      .replace(
        /[\r\n"]/g,
        "",
      )
      .replace(
        /[\\/:*?<>|]+/g,
        "-",
      )
      .trim();

  return (
    normalized ||
    "claimant-government-id"
  );
}

function errorResponse(
  message:
    string,
  status =
    409,
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

function toArrayBuffer(
  bytes:
    Uint8Array,
): ArrayBuffer {
  const buffer =
    new ArrayBuffer(
      bytes.byteLength,
    );

  new Uint8Array(
    buffer,
  ).set(
    bytes,
  );

  return buffer;
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  request:
    NextRequest,
  context: {
    params:
      Promise<{
        documentId:
          string;
      }>;
  },
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return errorResponse(
      "Staff authentication is required.",
      401,
    );
  }

  const {
    documentId,
  } =
    await context.params;

  try {
    const file =
      await getAssignedLeadIdentityFileForStaff(
        session,
        documentId,
      );

    const download =
      request.nextUrl.searchParams.get(
        "download",
      ) ===
      "1";

    const disposition =
      download
        ? "attachment"
        : "inline";

    const body =
      toArrayBuffer(
        file.bytes,
      );

    return new NextResponse(
      body,
      {
        status:
          200,

        headers: {
          "Content-Type":
            file.mimeType,

          "Content-Length":
            String(
              body.byteLength,
            ),

          "Content-Disposition":
            `${disposition}; filename="${safeFileName(
              file.fileName,
            )}"`,

          "Cache-Control":
            "private, no-store, max-age=0",

          Pragma:
            "no-cache",

          "X-Content-Type-Options":
            "nosniff",

          "Referrer-Policy":
            "no-referrer",
        },
      },
    );
  } catch (
    error
  ) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "The restricted identity file could not be opened.",
    );
  }
}