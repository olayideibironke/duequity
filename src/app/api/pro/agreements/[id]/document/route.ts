import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  can,
} from "@/lib/session";

import {
  getSignedAgreementDocumentForStaff,
} from "@/server/claimant-agreement-document-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface RouteContext {
  params:
    Promise<{
      id:
        string;
    }>;
}

/* ========================================================================== */
/* Responses                                                                   */
/* ========================================================================== */

function errorResponse(
  message:
    string,
  status:
    number,
): NextResponse {
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
/* Helpers                                                                     */
/* ========================================================================== */

function safeDispositionFileName(
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
        /[^\x20-\x7E]/g,
        "_",
      )
      .trim();

  return normalized ||
    "DueQuity-Recovery-Services-Agreement-Signed.pdf";
}

function errorStatus(
  message:
    string,
): number {
  const normalized =
    message.toLowerCase();

  if (
    normalized.includes(
      "authentication",
    )
  ) {
    return 401;
  }

  if (
    normalized.includes(
      "not currently assigned",
    ) ||
    normalized.includes(
      "not authorized",
    ) ||
    normalized.includes(
      "permission",
    )
  ) {
    return 403;
  }

  if (
    normalized.includes(
      "could not be found",
    ) ||
    normalized.includes(
      "not yet",
    )
  ) {
    return 404;
  }

  return 409;
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  request:
    NextRequest,
  context:
    RouteContext,
): Promise<
  NextResponse
> {
  try {
    /*
     * Staff authentication is resolved entirely on the server.
     *
     * The browser never supplies:
     *
     * - staff user ID
     * - staff role
     * - claimant ID
     * - assigned staff ID
     *
     * Those values come from authenticated and persisted DueQuity records.
     */
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

    /*
     * Agreement-document access is a claimant and claim read operation.
     *
     * Assignment is a separate authorization boundary and is enforced again
     * inside getSignedAgreementDocumentForStaff().
     */
    if (
      !can(
        session,
        "claim.read",
      ) ||
      !can(
        session,
        "claimant.read",
      )
    ) {
      return errorResponse(
        "You do not have permission to read claimant agreements.",
        403,
      );
    }

    const {
      id,
    } =
      await context.params;

    const envelopeId =
      id.trim();

    if (
      !envelopeId
    ) {
      return errorResponse(
        "Agreement ID is required.",
        400,
      );
    }

    /*
     * The document service enforces the Stage 16 ownership rule:
     *
     * - Super Admin may access every claimant.
     * - Ordinary staff may access only the claimant currently assigned to them.
     *
     * It then validates the entire immutable signed-document chain before the
     * PDF bytes are returned.
     */
    const document =
      await getSignedAgreementDocumentForStaff({
        actorStaffUserId:
          session.user.id,

        actorRole:
          session.user.role,

        envelopeId,
      });

    const download =
      request.nextUrl
        .searchParams
        .get(
          "download",
        ) ===
      "1";

    const fileName =
      safeDispositionFileName(
        document.fileName,
      );

    return new NextResponse(
      Buffer.from(
        document.bytes,
      ),
      {
        status:
          200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Length":
            String(
              document.byteSize,
            ),

          "Content-Disposition":
            `${download
              ? "attachment"
              : "inline"}; filename="${fileName}"`,

          /*
           * Signed agreements contain claimant-specific contractual data.
           *
           * They must not be stored in shared browser/proxy caches.
           */
          "Cache-Control":
            "private, no-store, max-age=0",

          "Pragma":
            "no-cache",

          "X-Content-Type-Options":
            "nosniff",

          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'self'",

          "Referrer-Policy":
            "no-referrer",

          /*
           * These identifiers are useful for controlled operational
           * troubleshooting without exposing the Supabase storage key.
           */
          "X-DueQuity-Document-Id":
            document.documentId,

          "X-DueQuity-Document-Sha256":
            document.sha256,

          "X-DueQuity-Claim-Reference":
            document.claimReference,

          "X-DueQuity-Claimant-Reference":
            document.claimantReference,
        },
      },
    );
  } catch (
    error
  ) {
    const message =
      error instanceof
        Error &&
      error.message.trim()
        ? error.message
        : "Unable to retrieve the signed claimant agreement.";

    return errorResponse(
      message,
      errorStatus(
        message,
      ),
    );
  }
}