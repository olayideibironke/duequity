import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  ensureRecoveryServicesAgreementDraft,
  issueClaimantAgreementForStaff,
  listClaimantAgreementsForStaff,
  prepareClaimantAgreementForStaff,
} from "@/server/claimant-agreement-service";

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

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

type AgreementAction =
  | "initialize_template"
  | "prepare"
  | "issue";

interface AgreementActionBody {
  action?: unknown;

  envelopeId?: unknown;
}

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

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

function routeErrorResponse(
  error: unknown,
  fallbackMessage: string,
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
    fallbackMessage,
    status,
  );
}

function normalizedAction(
  value: unknown,
): AgreementAction | undefined {
  if (
    value ===
      "initialize_template" ||
    value ===
      "prepare" ||
    value ===
      "issue"
  ) {
    return value;
  }

  return undefined;
}

function normalizedEnvelopeId(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function requireAgreementReadPermissions(
  session:
    NonNullable<
      Awaited<
        ReturnType<
          typeof resolveStaffSession
        >
      >
    >,
): NextResponse | undefined {
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
      "You do not have permission to view claimant agreements.",
      403,
    );
  }

  return undefined;
}

function requireAgreementWritePermissions(
  session:
    NonNullable<
      Awaited<
        ReturnType<
          typeof resolveStaffSession
        >
      >
    >,
): NextResponse | undefined {
  if (
    !can(
      session,
      "claim.write",
    ) ||
    !can(
      session,
      "claimant.write",
    ) ||
    !can(
      session,
      "fee_agreement.write",
    )
  ) {
    return errorResponse(
      "You do not have permission to prepare or issue claimant agreements.",
      403,
    );
  }

  return undefined;
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
      await resolveStaffSession();

    if (!session) {
      return errorResponse(
        STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
        401,
      );
    }

    const permissionError =
      requireAgreementReadPermissions(
        session,
      );

    if (
      permissionError
    ) {
      return permissionError;
    }

    const {
      id,
    } =
      await context.params;

    const claimantId =
      id.trim();

    if (
      !claimantId
    ) {
      return errorResponse(
        "Claimant ID is required.",
        400,
      );
    }

    const agreements =
      await listClaimantAgreementsForStaff({
        claimantId,

        actorStaffUserId:
          session.user.id,

        actorRole:
          session.user.role,
      });

    return NextResponse.json(
      {
        ok:
          true,

        claimantId,

        agreements,
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
    return routeErrorResponse(
      error,
      "Unable to load claimant agreements.",
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
      await resolveStaffSession();

    if (!session) {
      return errorResponse(
        STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
        401,
      );
    }

    const {
      id,
    } =
      await context.params;

    const claimantId =
      id.trim();

    if (
      !claimantId
    ) {
      return errorResponse(
        "Claimant ID is required.",
        400,
      );
    }

    let body:
      AgreementActionBody;

    try {
      body =
        await request.json() as
          AgreementActionBody;
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
        "Agreement action must be initialize_template, prepare, or issue.",
        400,
      );
    }

    /* ====================================================================== */
    /* One-time template initialization                                       */
    /* ====================================================================== */

    if (
      action ===
      "initialize_template"
    ) {
      if (
        session.user.role !==
        "super_admin"
      ) {
        return errorResponse(
          "Only Super Admin may initialize the Recovery Services Agreement template.",
          403,
        );
      }

      const template =
        await ensureRecoveryServicesAgreementDraft({
          actorStaffUserId:
            session.user.id,

          actorRole:
            session.user.role,
        });

      return NextResponse.json(
        {
          ok:
            true,

          action,

          template,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    /* ====================================================================== */
    /* Claimant agreement write permissions                                   */
    /* ====================================================================== */

    const permissionError =
      requireAgreementWritePermissions(
        session,
      );

    if (
      permissionError
    ) {
      return permissionError;
    }

    /* ====================================================================== */
    /* Prepare                                                                */
    /* ====================================================================== */

    if (
      action ===
      "prepare"
    ) {
      const agreement =
        await prepareClaimantAgreementForStaff({
          claimantId,

          actorStaffUserId:
            session.user.id,

          actorRole:
            session.user.role,
        });

      return NextResponse.json(
        {
          ok:
            true,

          action,

          agreement,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    /* ====================================================================== */
    /* Issue                                                                  */
    /* ====================================================================== */

    const envelopeId =
      normalizedEnvelopeId(
        body.envelopeId,
      );

    if (
      !envelopeId
    ) {
      return errorResponse(
        "Agreement envelope ID is required for issuance.",
        400,
      );
    }

    const agreement =
      await issueClaimantAgreementForStaff({
        envelopeId,

        actorStaffUserId:
          session.user.id,

        actorRole:
          session.user.role,
      });

    if (
      agreement.claimantId !==
      claimantId
    ) {
      return errorResponse(
        "Agreement does not belong to this claimant.",
        404,
      );
    }

    return NextResponse.json(
      {
        ok:
          true,

        action,

        agreement,
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
    return routeErrorResponse(
      error,
      "Unable to process claimant agreement.",
      409,
    );
  }
}