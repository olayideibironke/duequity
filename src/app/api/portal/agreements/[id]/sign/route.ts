import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  finalizeClaimantAgreementSignature,
} from "@/server/claimant-agreement-signing-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

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

interface SignAgreementBody {
  typedLegalName?:
    unknown;

  signatureDataUrl?:
    unknown;
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

function textValue(
  value:
    unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
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
      "could not be found",
    ) ||
    normalized.includes(
      "agreement could not be found",
    )
  ) {
    return 404;
  }

  if (
    normalized.includes(
      "does not match this agreement",
    ) ||
    normalized.includes(
      "does not belong",
    )
  ) {
    return 403;
  }

  return 409;
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
): Promise<
  NextResponse
> {
  try {
    /*
     * The claimant identity comes only from the authenticated server session.
     *
     * claimantId is deliberately not accepted in the request body.
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

    let body:
      SignAgreementBody;

    try {
      body =
        await request.json() as
          SignAgreementBody;
    } catch {
      return errorResponse(
        "A valid electronic-signature request is required.",
        400,
      );
    }

    const typedLegalName =
      textValue(
        body.typedLegalName,
      );

    const signatureDataUrl =
      textValue(
        body.signatureDataUrl,
      );

    if (
      !typedLegalName
    ) {
      return errorResponse(
        "Type your legal name exactly as shown on the agreement.",
        400,
      );
    }

    if (
      !signatureDataUrl
    ) {
      return errorResponse(
        "Draw your electronic signature before submitting the agreement.",
        400,
      );
    }

    /*
     * A normal drawn PNG signature should be much smaller than this.
     *
     * This is only an early HTTP-layer guard. The signing service performs the
     * authoritative decoded-byte limit and PNG validation.
     */
    if (
      signatureDataUrl.length >
      3_000_000
    ) {
      return errorResponse(
        "The electronic signature image is too large.",
        413,
      );
    }

    const result =
      await finalizeClaimantAgreementSignature({
        claimantId:
          session.claimantId,

        envelopeId,

        typedLegalName,

        signatureDataUrl,
      });

    return NextResponse.json(
      {
        ok:
          true,

        agreement: {
          envelopeId:
            result.envelopeId,

          status:
            result.status,

          claimId:
            result.claimId,

          claimReference:
            result.claimReference,

          claimantId:
            result.claimantId,

          claimantReference:
            result.claimantReference,

          signedLegalName:
            result.signedLegalName,

          signedAt:
            result.signedAt,

          finalDocumentId:
            result.finalDocumentId,

          finalDocumentSha256:
            result.finalDocumentSha256,

          signatureSha256:
            result.signatureSha256,

          fileName:
            result.fileName,

          pageCount:
            result.pageCount,

          cancellationDeadline:
            result.cancellationDeadline,

          idempotent:
            result.idempotent,
        },
      },
      {
        status:
          200,

        headers: {
          "Cache-Control":
            "no-store",
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
        : "Unable to electronically sign the agreement.";

    return errorResponse(
      message,
      errorStatus(
        message,
      ),
    );
  }
}