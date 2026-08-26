import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getClaimantAgreementForPortal,
  markClaimantAgreementOpened,
  recordClaimantAgreementConsent,
} from "@/server/claimant-agreement-service";

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

type PortalAgreementAction =
  | "opened"
  | "consent";

interface PortalAgreementActionBody {
  action?: unknown;

  acknowledgedKeys?: unknown;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorResponse(
  message: string,
  status: number,
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
    },
  );
}

function routeErrorResponse(
  error: unknown,
  fallback:
    string,
  status = 409,
): NextResponse {
  if (
    error instanceof
      Error &&
    error.message.trim()
  ) {
    return errorResponse(
      error.message,
      status,
    );
  }

  return errorResponse(
    fallback,
    status,
  );
}

function normalizedAction(
  value: unknown,
): PortalAgreementAction | undefined {
  if (
    value ===
      "opened" ||
    value ===
      "consent"
  ) {
    return value;
  }

  return undefined;
}

function normalizedAcknowledgementKeys(
  value: unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
        .map(
          (
            item,
          ) =>
            item.trim(),
        )
        .filter(
          Boolean,
        ),
    ),
  );
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session =
      await resolveClaimantSession();

    if (!session) {
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

    const agreement =
      await getClaimantAgreementForPortal({
        claimantId:
          session.claimantId,

        envelopeId,
      });

    if (!agreement) {
      return errorResponse(
        "Agreement not found.",
        404,
      );
    }

    return NextResponse.json({
      ok:
        true,

      agreement,
    });
  } catch (
    error
  ) {
    return routeErrorResponse(
      error,
      "Unable to load claimant agreement.",
      404,
    );
  }
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session =
      await resolveClaimantSession();

    if (!session) {
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
      PortalAgreementActionBody;

    try {
      body =
        await request.json() as
          PortalAgreementActionBody;
    } catch {
      return errorResponse(
        "A valid JSON request body is required.",
        400,
      );
    }

    const action =
      normalizedAction(
        body.action,
      );

    if (
      !action
    ) {
      return errorResponse(
        "Agreement action must be opened or consent.",
        400,
      );
    }

    if (
      action ===
      "opened"
    ) {
      const agreement =
        await markClaimantAgreementOpened({
          claimantId:
            session.claimantId,

          envelopeId,
        });

      return NextResponse.json({
        ok:
          true,

        action,

        agreement,
      });
    }

    const acknowledgedKeys =
      normalizedAcknowledgementKeys(
        body.acknowledgedKeys,
      );

    if (
      acknowledgedKeys.length ===
      0
    ) {
      return errorResponse(
        "Required agreement acknowledgements are missing.",
        400,
      );
    }

    const agreement =
      await recordClaimantAgreementConsent({
        claimantId:
          session.claimantId,

        envelopeId,

        acknowledgedKeys,
      });

    return NextResponse.json({
      ok:
        true,

      action,

      agreement,
    });
  } catch (
    error
  ) {
    return routeErrorResponse(
      error,
      "Unable to process claimant agreement.",
      409,
    );
  }
}