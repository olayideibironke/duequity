import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  Permission,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
  type StaffSession,
} from "@/lib/session";

import {
  claimClosureAudit,
  closeClaimFinal,
  getClaimClosureByClaimId,
  getClaimRetentionByClaimId,
  markClaimRetentionEligible,
  placeClaimRetentionHold,
  recordClaimRetentionDisposition,
  releaseClaimRetentionHold,
  scheduleClaimRetention,
} from "@/server/claim-closure-store";

import {
  getClaimAuthorityReviewByClaimId,
} from "@/server/claim-authority-review-store";

import {
  getClaimRecoverySettlementByClaimId,
} from "@/server/claim-recovery-settlement-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  listJurisdictionRulePackages,
} from "@/server/jurisdiction-intelligence";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/**
 * FINAL CLAIM CLOSURE + RETENTION API
 *
 * Final claim closure is deliberately separate from:
 *
 * - authority-review closure;
 * - recovery reconciliation;
 * - legacy claim status;
 * - document deletion;
 * - retention disposition.
 *
 * Final closure requires:
 *
 * 1. a durable authority-review lifecycle;
 * 2. that authority lifecycle to be closed;
 * 3. if actual recovery exists, the recovery settlement must be reconciled.
 *
 * Closing the claim automatically creates a retention record in
 * `policy_pending`.
 *
 * DueQuity does not invent a retention term. A compliance-authorized staff
 * member must later schedule retention using an explicit policy reference,
 * policy basis, and retention-until date.
 *
 * Permission boundary:
 *
 * claim.read
 *   Read final-closure and retention state.
 *
 * claim.close
 *   Record final claim closure.
 *
 * compliance.approve
 *   Schedule retention, place/release legal or preservation holds, mark records
 *   eligible for disposition, and record final retention disposition.
 *
 * Browser supplied closure/retention IDs are not trusted. The server resolves
 * the one durable closure and retention record for the current claim.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type ClaimClosureAction =
  | "close_final"
  | "schedule_retention"
  | "place_retention_hold"
  | "release_retention_hold"
  | "mark_retention_eligible"
  | "record_retention_disposition";

interface ClaimClosureActionBody {
  action?:
    ClaimClosureAction;

  closedAt?:
    string;

  summary?:
    string;

  scheduledAt?:
    string;

  retentionUntil?:
    string;

  policyReference?:
    string;

  policyBasis?:
    string;

  occurredAt?:
    string;

  reason?:
    string;

  dispositionMethod?:
    string;
}

interface ResolvedClosureContext {
  session:
    StaffSession;

  actorUserId:
    string;

  claim:
    NonNullable<
      Awaited<
        ReturnType<
          typeof resolveClaimRecord
        >
      >
    >["claim"];

  jurisdictionPackage:
    Awaited<
      ReturnType<
        typeof listJurisdictionRulePackages
      >
    >[number];

  authorityReview:
    Awaited<
      ReturnType<
        typeof getClaimAuthorityReviewByClaimId
      >
    >;

  recoverySettlement:
    Awaited<
      ReturnType<
        typeof getClaimRecoverySettlementByClaimId
      >
    >;

  closure:
    Awaited<
      ReturnType<
        typeof getClaimClosureByClaimId
      >
    >;

  retention:
    Awaited<
      ReturnType<
        typeof getClaimRetentionByClaimId
      >
    >;
}

/* ========================================================================== */
/* Errors                                                                      */
/* ========================================================================== */

class ClaimClosureRouteError extends Error {
  status:
    number;

  constructor(
    message:
      string,
    status:
      number,
  ) {
    super(
      message,
    );

    this.name =
      "ClaimClosureRouteError";

    this.status =
      status;
  }
}

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
    },
  );
}

function routeErrorResponse(
  error:
    unknown,
  fallbackMessage:
    string,
  fallbackStatus =
    409,
) {
  if (
    error instanceof
    ClaimClosureRouteError
  ) {
    return errorResponse(
      error.message,
      error.status,
    );
  }

  return errorResponse(
    error instanceof Error
      ? error.message
      : fallbackMessage,
    fallbackStatus,
  );
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function requiredString(
  value:
    string |
    undefined,
  label:
    string,
): string {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new ClaimClosureRouteError(
      `${label} is required.`,
      400,
    );
  }

  return normalized;
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function actionPermission(
  action:
    ClaimClosureAction,
): Permission {
  switch (
    action
  ) {
    case "close_final":
      return "claim.close";

    case "schedule_retention":
    case "place_retention_hold":
    case "release_retention_hold":
    case "mark_retention_eligible":
    case "record_retention_disposition":
      return "compliance.approve";
  }
}

function requireReadPermission(
  session:
    StaffSession,
): void {
  if (
    !can(
      session,
      "claim.read",
    )
  ) {
    throw new ClaimClosureRouteError(
      "You do not have permission to read this claim.",
      403,
    );
  }
}

function requireActionPermission(
  session:
    StaffSession,
  action:
    ClaimClosureAction,
): void {
  requireReadPermission(
    session,
  );

  const permission =
    actionPermission(
      action,
    );

  if (
    !can(
      session,
      permission,
    )
  ) {
    throw new ClaimClosureRouteError(
      permission ===
        "claim.close"
        ? "You do not have permission to perform final claim closure."
        : "You do not have compliance approval authority for retention governance.",
      403,
    );
  }
}

/* ========================================================================== */
/* Context                                                                     */
/* ========================================================================== */

async function resolveClosureContext(
  claimId:
    string,
  session:
    StaffSession,
): Promise<
  ResolvedClosureContext
> {
  requireReadPermission(
    session,
  );

  const resolved =
    await resolveClaimRecord(
      claimId,
    );

  if (!resolved) {
    throw new ClaimClosureRouteError(
      "Claim not found.",
      404,
    );
  }

  const claim =
    resolved.claim;

  /**
   * Final closure should not depend on the jurisdiction still being open for
   * new intake.
   *
   * We therefore resolve the newest matching jurisdiction package regardless
   * of current package publication status. The package is used here for state
   * clearance only, not to re-authorize intake or filing.
   */
  const jurisdictionPackages =
    await listJurisdictionRulePackages();

  const jurisdictionPackage =
    jurisdictionPackages
      .filter(
        (
          candidate,
        ) =>
          candidate.rule?.id ===
          claim.jurisdictionId,
      )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          right.version -
          left.version,
      )[0];

  if (
    !jurisdictionPackage ||
    !jurisdictionPackage.rule
  ) {
    throw new ClaimClosureRouteError(
      "Jurisdiction provenance could not be resolved for this claim.",
      409,
    );
  }

  if (
    !clearedForState(
      session,
      jurisdictionPackage.stateCode,
    )
  ) {
    throw new ClaimClosureRouteError(
      `You are not cleared to work on claims in ${jurisdictionPackage.stateCode}.`,
      403,
    );
  }

  const [
    authorityReview,
    recoverySettlement,
    closure,
    retention,
  ] =
    await Promise.all([
      getClaimAuthorityReviewByClaimId(
        claim.id,
      ),

      getClaimRecoverySettlementByClaimId(
        claim.id,
      ),

      getClaimClosureByClaimId(
        claim.id,
      ),

      getClaimRetentionByClaimId(
        claim.id,
      ),
    ]);

  if (
    closure &&
    !retention
  ) {
    throw new ClaimClosureRouteError(
      "Final claim closure exists, but its retention record is missing. Retention actions are blocked until the lifecycle is repaired.",
      409,
    );
  }

  if (
    retention &&
    !closure
  ) {
    throw new ClaimClosureRouteError(
      "Claim retention provenance is inconsistent because final claim closure is missing.",
      409,
    );
  }

  if (
    closure &&
    retention &&
    retention.closureId !==
      closure.id
  ) {
    throw new ClaimClosureRouteError(
      "Claim retention provenance does not match the final claim closure.",
      409,
    );
  }

  return {
    session,

    actorUserId:
      session.user.id,

    claim,

    jurisdictionPackage,

    authorityReview,

    recoverySettlement,

    closure,

    retention,
  };
}

/* ========================================================================== */
/* Current state                                                               */
/* ========================================================================== */

async function closureStateResponse(
  claimId:
    string,
  session:
    StaffSession,
) {
  const context =
    await resolveClosureContext(
      claimId,
      session,
    );

  const {
    actorUserId,
    claim,
    authorityReview,
    recoverySettlement,
    closure,
    retention,
  } =
    context;

  const authorityClosed =
    authorityReview?.status ===
    "closed";

  const recoveryReconciled =
    !recoverySettlement ||
    recoverySettlement.status ===
      "reconciled";

  const mayCloseFinal =
    Boolean(
      authorityReview &&
      authorityClosed &&
      recoveryReconciled &&
      !closure &&
      can(
        session,
        "claim.close",
      ),
    );

  const audit =
    closure
      ? await claimClosureAudit(
          claim.id,
        )
      : [];

  return {
    ok:
      true,

    claim: {
      id:
        claim.id,

      reference:
        claim.reference,
    },

    prerequisites: {
      authorityReviewExists:
        Boolean(
          authorityReview,
        ),

      authorityReviewStatus:
        authorityReview?.status ??
        null,

      authorityClosed,

      recoverySettlementExists:
        Boolean(
          recoverySettlement,
        ),

      recoverySettlementStatus:
        recoverySettlement?.status ??
        null,

      recoveryReconciled,

      readyForFinalClosure:
        Boolean(
          authorityReview &&
          authorityClosed &&
          recoveryReconciled &&
          !closure,
        ),
    },

    closure:
      closure ??
      null,

    retention:
      retention ??
      null,

    audit,

    permissions: {
      actorUserId,

      mayRead:
        true,

      mayCloseFinal,

      mayGovernRetention:
        can(
          session,
          "compliance.approve",
        ),
    },
  };
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request:
    NextRequest,
  context: {
    params: Promise<{
      id:
        string;
    }>;
  },
) {
  const {
    id,
  } =
    await context.params;

  const session =
    await resolveStaffSession();

  if (!session) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  try {
    return NextResponse.json(
      await closureStateResponse(
        id,
        session,
      ),
    );
  } catch (
    error
  ) {
    return routeErrorResponse(
      error,
      "Final claim closure state could not be loaded.",
      409,
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
    params: Promise<{
      id:
        string;
    }>;
  },
) {
  const {
    id,
  } =
    await context.params;

  const session =
    await resolveStaffSession();

  if (!session) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  try {
    let body:
      ClaimClosureActionBody;

    try {
      body =
        (await request.json()) as
          ClaimClosureActionBody;
    } catch {
      return errorResponse(
        "Invalid JSON request.",
        400,
      );
    }

    if (!body.action) {
      return errorResponse(
        "Final claim closure action is required.",
        400,
      );
    }

    requireActionPermission(
      session,
      body.action,
    );

    const closureContext =
      await resolveClosureContext(
        id,
        session,
      );

    const {
      actorUserId,
      claim,
      authorityReview,
      recoverySettlement,
      closure,
      retention,
    } =
      closureContext;

    /* ====================================================================== */
    /* Final claim closure                                                    */
    /* ====================================================================== */

    if (
      body.action ===
      "close_final"
    ) {
      if (closure) {
        return errorResponse(
          "This claim has already been finally closed.",
          409,
        );
      }

      if (!authorityReview) {
        return errorResponse(
          "Final claim closure requires a durable authority-review lifecycle.",
          409,
        );
      }

      if (
        authorityReview.status !==
        "closed"
      ) {
        return errorResponse(
          "The authority-review lifecycle must be closed before final claim closure.",
          409,
        );
      }

      if (
        recoverySettlement &&
        recoverySettlement.status !==
          "reconciled"
      ) {
        return errorResponse(
          "A claim with an actual recovery cannot be finally closed until recovery accounting is reconciled.",
          409,
        );
      }

      await closeClaimFinal({
        claimId:
          claim.id,

        actorUserId,

        closedAt:
          requiredString(
            body.closedAt,
            "Final claim closure timestamp",
          ),

        summary:
          requiredString(
            body.summary,
            "Final claim closure summary",
          ),
      });

      return NextResponse.json(
        await closureStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Remaining actions require final closure + retention                    */
    /* ====================================================================== */

    if (
      !closure ||
      !retention
    ) {
      return errorResponse(
        "Retention governance becomes available only after final claim closure.",
        409,
      );
    }

    /* ====================================================================== */
    /* Schedule retention                                                     */
    /* ====================================================================== */

    if (
      body.action ===
      "schedule_retention"
    ) {
      if (
        retention.status !==
        "policy_pending"
      ) {
        return errorResponse(
          "Retention may be scheduled only while the record is awaiting an explicit retention policy.",
          409,
        );
      }

      await scheduleClaimRetention({
        retentionId:
          retention.id,

        actorUserId,

        scheduledAt:
          requiredString(
            body.scheduledAt,
            "Retention scheduling timestamp",
          ),

        retentionUntil:
          requiredString(
            body.retentionUntil,
            "Retention-until timestamp",
          ),

        policyReference:
          requiredString(
            body.policyReference,
            "Retention policy reference",
          ),

        policyBasis:
          requiredString(
            body.policyBasis,
            "Retention policy basis",
          ),
      });

      return NextResponse.json(
        await closureStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Place retention hold                                                   */
    /* ====================================================================== */

    if (
      body.action ===
      "place_retention_hold"
    ) {
      if (
        retention.status ===
          "legal_hold" ||
        retention.status ===
          "disposed"
      ) {
        return errorResponse(
          retention.status ===
            "legal_hold"
            ? "This claim retention record is already under an active hold."
            : "A disposed retention record cannot be placed on hold.",
          409,
        );
      }

      await placeClaimRetentionHold({
        retentionId:
          retention.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Retention-hold timestamp",
          ),

        reason:
          requiredString(
            body.reason,
            "Retention-hold reason",
          ),
      });

      return NextResponse.json(
        await closureStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Release retention hold                                                 */
    /* ====================================================================== */

    if (
      body.action ===
      "release_retention_hold"
    ) {
      if (
        retention.status !==
        "legal_hold"
      ) {
        return errorResponse(
          "This claim retention record does not currently have an active hold.",
          409,
        );
      }

      await releaseClaimRetentionHold({
        retentionId:
          retention.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Retention-hold release timestamp",
          ),

        summary:
          requiredString(
            body.summary,
            "Retention-hold release summary",
          ),
      });

      return NextResponse.json(
        await closureStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Mark eligible for disposition                                          */
    /* ====================================================================== */

    if (
      body.action ===
      "mark_retention_eligible"
    ) {
      if (
        retention.status !==
        "scheduled"
      ) {
        return errorResponse(
          "Only a scheduled retention record may be marked eligible for disposition.",
          409,
        );
      }

      await markClaimRetentionEligible({
        retentionId:
          retention.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Retention eligibility timestamp",
          ),

        summary:
          requiredString(
            body.summary,
            "Retention eligibility summary",
          ),
      });

      return NextResponse.json(
        await closureStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Record retention disposition                                           */
    /* ====================================================================== */

    if (
      body.action ===
      "record_retention_disposition"
    ) {
      if (
        retention.status !==
        "eligible_for_disposition"
      ) {
        return errorResponse(
          "Retention disposition may be recorded only after the record is explicitly eligible for disposition.",
          409,
        );
      }

      await recordClaimRetentionDisposition({
        retentionId:
          retention.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Retention disposition timestamp",
          ),

        method:
          requiredString(
            body.dispositionMethod,
            "Retention disposition method",
          ),

        summary:
          requiredString(
            body.summary,
            "Retention disposition summary",
          ),
      });

      return NextResponse.json(
        await closureStateResponse(
          id,
          session,
        ),
      );
    }

    return errorResponse(
      "Unsupported final claim closure action.",
      400,
    );
  } catch (
    error
  ) {
    return routeErrorResponse(
      error,
      "Final claim closure action failed.",
      409,
    );
  }
}