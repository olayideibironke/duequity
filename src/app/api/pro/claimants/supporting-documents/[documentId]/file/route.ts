import {
  NextResponse,
} from "next/server";

import {
  getPreclaimSupportingDocumentFile,
} from "@/server/assigned-lead-supporting-document-review-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function safeDownloadFileName(
  value:
    string,
): string {
  const normalized =
    value
      .replace(
        /[\r\n"]/g,
        "_",
      )
      .trim();

  return (
    normalized ||
    "supporting-document"
  );
}

function toArrayBuffer(
  bytes:
    Uint8Array,
): ArrayBuffer {
  const copy =
    new Uint8Array(
      bytes.byteLength,
    );

  copy.set(
    bytes,
  );

  return copy.buffer;
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request:
    Request,
  context: {
    params: Promise<{
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
    documentId,
  } =
    await context.params;

  if (
    !documentId?.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "Document ID is required.",
      },
      {
        status:
          400,
      },
    );
  }

  try {
    const file =
      await getPreclaimSupportingDocumentFile(
        session,
        documentId,
      );

    const fileName =
      safeDownloadFileName(
        file.fileName,
      );

    return new Response(
      toArrayBuffer(
        file.bytes,
      ),
      {
        status:
          200,

        headers: {
          "Content-Type":
            file.mimeType,

          "Content-Disposition":
            `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(
              fileName,
            )}`,

          "Cache-Control":
            "private, no-store, max-age=0",

          Pragma:
            "no-cache",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : "Supporting document could not be opened.";

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status:
          message.includes(
            "safety",
          )
            ? 409
            : 403,
      },
    );
  }
}