import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getAssignedLeadIdentityReviewItem,
  reviewAssignedLeadIdentityDocument,
  runAssignedLeadIdentitySafetyScan,
} from "@/server/assigned-lead-identity-review-service";

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

type IdentityAction =
  | "run_safety_scan"
  | "accept"
  | "reject";

interface IdentityActionBody {
  action?:
    IdentityAction;

  rejectionReason?:
    string;

  documentTypeConfirmed?:
    boolean;

  legibilityConfirmed?:
    boolean;

  identityMatchConfirmed?:
    boolean;
}

/* ========================================================================== */
/* Responses                                                                   */
/* ========================================================================== */

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

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request:
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
    return NextResponse.json(
      {
        ok:
          true,

        item:
          await getAssignedLeadIdentityReviewItem(
            session,
            documentId,
          ),
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
        : "The claimant identity record could not be loaded.",
    );
  }
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
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

  let body:
    IdentityActionBody;

  try {
    body =
      await request.json() as
        IdentityActionBody;
  } catch {
    return errorResponse(
      "Invalid identity-review request.",
      400,
    );
  }

  if (
    !body.action
  ) {
    return errorResponse(
      "Identity-review action is required.",
      400,
    );
  }

  try {
    if (
      body.action ===
      "run_safety_scan"
    ) {
      const item =
        await runAssignedLeadIdentitySafetyScan(
          session,
          documentId,
        );

      return NextResponse.json(
        {
          ok:
            true,

          item,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    if (
      body.action ===
      "accept"
    ) {
      const item =
        await reviewAssignedLeadIdentityDocument({
          session,

          documentId,

          decision:
            "accepted",

          documentTypeConfirmed:
            body.documentTypeConfirmed ===
            true,

          legibilityConfirmed:
            body.legibilityConfirmed ===
            true,

          identityMatchConfirmed:
            body.identityMatchConfirmed ===
            true,
        });

      return NextResponse.json(
        {
          ok:
            true,

          item,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    if (
      body.action ===
      "reject"
    ) {
      const item =
        await reviewAssignedLeadIdentityDocument({
          session,

          documentId,

          decision:
            "rejected",

          rejectionReason:
            body.rejectionReason,
        });

      return NextResponse.json(
        {
          ok:
            true,

          item,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    return errorResponse(
      "Unsupported identity-review action.",
      400,
    );
  } catch (
    error
  ) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "The identity-review action could not be completed.",
    );
  }
}