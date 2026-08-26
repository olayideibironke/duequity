import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getSignedAgreementDocumentForClaimant,
} from "@/server/claimant-agreement-document-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/* ========================================================================== */
/* Helpers                                                                     */
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
      "does not belong",
    ) ||
    normalized.includes(
      "does not own",
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
     * Step 1:
     * Resolve the authorized claimant account from DueQuity's claimant-session
     * boundary.
     */
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

    /*
     * Step 2:
     * Independently validate the current Supabase access token and obtain the
     * actual authenticated Auth UUID.
     *
     * We deliberately do not accept an auth user ID from the browser.
     */
    const auth =
      await getSupabaseServerAuth();

    const {
      data: {
        user:
          authUser,
      },
      error:
        authError,
    } =
      await auth.auth.getUser();

    if (
      authError ||
      !authUser
    ) {
      return errorResponse(
        "Claimant authentication is required.",
        401,
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
     * Step 3:
     * The document service verifies:
     *
     * - claimant ID
     * - Auth UUID
     * - submitted envelope
     * - onboarding linkage
     * - final Document ID
     * - fee_agreement kind
     * - accepted status
     * - clean safety status
     * - private storage bucket
     * - byte size
     * - SHA-256 integrity
     */
    const document =
      await getSignedAgreementDocumentForClaimant({
        claimantId:
          session.claimantId,

        claimantAuthUserId:
          authUser.id,

        envelopeId,
      });

    const download =
      request.nextUrl.searchParams.get(
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

          "X-DueQuity-Document-Id":
            document.documentId,

          "X-DueQuity-Document-Sha256":
            document.sha256,
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
        : "Unable to retrieve the signed agreement.";

    return errorResponse(
      message,
      errorStatus(
        message,
      ),
    );
  }
}