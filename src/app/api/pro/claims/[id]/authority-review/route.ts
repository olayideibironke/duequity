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
  claimAuthorityReviewAudit,
  closeAuthorityReview,
  getClaimAuthorityReviewByClaimId,
  listClaimAuthorityInformationRequests,
  recordAuthorityApproval,
  recordAuthorityDenial,
  recordAuthorityInformationRequest,
  recordAuthorityPaymentIssued,
  recordAuthorityReviewStarted,
  recordRecovery,
  resolveAuthorityInformationRequest,
  respondAuthorityInformationRequest,
} from "@/server/claim-authority-review-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  getClaimSubmissionByClaimId,
} from "@/server/claim-submission-store";

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
 * CLAIM AUTHORITY REVIEW API
 *
 * Durable post-submission authority lifecycle.
 *
 * This endpoint does not create an external submission.
 *
 * A real claim submission must already exist before an authority-review
 * lifecycle can exist. Supabase automatically opens the lifecycle when the
 * durable submission is recorded.
 *
 * The endpoint supports:
 *
 *   - authority review started;
 *   - additional-information request;
 *   - response to additional-information request;
 *   - information-request resolution;
 *   - authority approval;
 *   - authority denial;
 *   - payment issuance;
 *   - recovery;
 *   - closure.
 *
 * All lifecycle mutations are performed through transactional PostgreSQL
 * functions so the state transition and append-only audit event succeed or fail
 * together.
 *
 * The browser never supplies:
 *
 *   - claim ID;
 *   - claim reference;
 *   - submission provenance;
 *   - filing-package provenance;
 *   - filing-destination provenance;
 *   - authority-review ID.
 *
 * Information-request IDs are necessarily returned to the browser for request
 * specific actions. Before a response or resolution is accepted, the server
 * independently verifies that the supplied request belongs to the current
 * claim's authority-review lifecycle.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type AuthorityReviewAction =
  | "record_review_started"
  | "record_information_request"
  | "record_information_response"
  | "resolve_information_request"
  | "record_approval"
  | "record_denial"
  | "record_payment_issued"
  | "record_recovery"
  | "close_review";

interface AuthorityReviewActionBody {
  action?:
    AuthorityReviewAction;

  occurredAt?:
    string;

  externalReference?:
    string;

  summary?:
    string;

  requestId?:
    string;

  requestedAt?:
    string;

  requestSummary?:
    string;

  requestReference?:
    string;

  dueAt?:
    string;

  respondedAt?:
    string;

  responseSummary?:
    string;

  responseReference?:
    string;

  resolution?:
    | "satisfied"
    | "withdrawn";

  approvedAmountCents?:
    unknown;

  denialReason?:
    string;

  paymentAmountCents?:
    unknown;

  paymentReference?:
    string;

  recoveredAmountCents?:
    unknown;

  closeSummary?:
    string;
}

interface ResolvedAuthorityContext {
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

  submission:
    Awaited<
      ReturnType<
        typeof getClaimSubmissionByClaimId
      >
    >;

  review:
    Awaited<
      ReturnType<
        typeof getClaimAuthorityReviewByClaimId
      >
    >;
}

/* ========================================================================== */
/* Route errors                                                                */
/* ========================================================================== */

class AuthorityReviewRouteError extends Error {
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
      "AuthorityReviewRouteError";

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
    AuthorityReviewRouteError
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
    throw new AuthorityReviewRouteError(
      `${label} is required.`,
      400,
    );
  }

  return normalized;
}

function optionalText(
  value:
    string |
    undefined,
): string | undefined {
  const normalized =
    value?.trim();

  return normalized ||
    undefined;
}

function requiredWholeCents(
  value:
    unknown,
  label:
    string,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value <
      0
  ) {
    throw new AuthorityReviewRouteError(
      `${label} must be a non-negative whole-cent amount.`,
      400,
    );
  }

  return value;
}

function optionalWholeCents(
  value:
    unknown,
  label:
    string,
): number | undefined {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return undefined;
  }

  return requiredWholeCents(
    value,
    label,
  );
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function writePermission(): Permission {
  return "claim.submit";
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
    throw new AuthorityReviewRouteError(
      "You do not have permission to read this claim.",
      403,
    );
  }
}

function requireWritePermission(
  session:
    StaffSession,
): void {
  requireReadPermission(
    session,
  );

  if (
    !can(
      session,
      writePermission(),
    )
  ) {
    throw new AuthorityReviewRouteError(
      "You do not have permission to record authority-review events.",
      403,
    );
  }
}

/* ========================================================================== */
/* Context                                                                     */
/* ========================================================================== */

async function resolveAuthorityContext(
  claimId:
    string,
  session:
    StaffSession,
): Promise<
  ResolvedAuthorityContext
> {
  requireReadPermission(
    session,
  );

  const resolved =
    await resolveClaimRecord(
      claimId,
    );

  if (!resolved) {
    throw new AuthorityReviewRouteError(
      "Claim not found.",
      404,
    );
  }

  const claim =
    resolved.claim;

  const jurisdictionPackages =
    await listJurisdictionRulePackages();

  const jurisdictionPackage =
    jurisdictionPackages
      .filter(
        (
          candidate,
        ) =>
          candidate.status ===
            "approved" &&
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
    throw new AuthorityReviewRouteError(
      "No current approved jurisdiction rule is published for this claim.",
      409,
    );
  }

  if (
    !clearedForState(
      session,
      jurisdictionPackage.stateCode,
    )
  ) {
    throw new AuthorityReviewRouteError(
      `You are not cleared to work on claims in ${jurisdictionPackage.stateCode}.`,
      403,
    );
  }

  const submission =
    await getClaimSubmissionByClaimId(
      claim.id,
    );

  const review =
    await getClaimAuthorityReviewByClaimId(
      claim.id,
    );

  if (
    submission &&
    !review
  ) {
    throw new AuthorityReviewRouteError(
      "A durable claim submission exists, but its authority-review lifecycle is missing. Authority-review actions are blocked until the lifecycle is repaired.",
      409,
    );
  }

  if (
    review &&
    !submission
  ) {
    throw new AuthorityReviewRouteError(
      "Authority-review provenance is inconsistent because the underlying claim submission is missing.",
      409,
    );
  }

  if (
    review &&
    submission &&
    review.submissionId !==
      submission.id
  ) {
    throw new AuthorityReviewRouteError(
      "Authority-review provenance does not match the current durable claim submission.",
      409,
    );
  }

  return {
    session,

    actorUserId:
      session.user.id,

    claim,

    jurisdictionPackage,

    submission,

    review,
  };
}

/* ========================================================================== */
/* Request ownership                                                           */
/* ========================================================================== */

async function requireInformationRequestForReview({
  reviewId,
  requestId,
}: {
  reviewId:
    string;

  requestId:
    string;
}) {
  const normalizedRequestId =
    requiredString(
      requestId,
      "Information request ID",
    );

  const requests =
    await listClaimAuthorityInformationRequests(
      reviewId,
    );

  const informationRequest =
    requests.find(
      (
        candidate,
      ) =>
        candidate.id ===
        normalizedRequestId,
    );

  if (!informationRequest) {
    throw new AuthorityReviewRouteError(
      "The authority information request does not belong to this claim's current authority-review lifecycle.",
      404,
    );
  }

  return informationRequest;
}

/* ========================================================================== */
/* Current state                                                               */
/* ========================================================================== */

async function authorityStateResponse(
  claimId:
    string,
  session:
    StaffSession,
) {
  const context =
    await resolveAuthorityContext(
      claimId,
      session,
    );

  const {
    actorUserId,
    claim,
    submission,
    review,
  } =
    context;

  const [
    informationRequests,
    audit,
  ] =
    review
      ? await Promise.all([
          listClaimAuthorityInformationRequests(
            review.id,
          ),

          claimAuthorityReviewAudit(
            review.id,
          ),
        ])
      : [
          [],
          [],
        ];

  return {
    ok:
      true,

    claim: {
      id:
        claim.id,

      reference:
        claim.reference,
    },

    available:
      Boolean(
        submission &&
        review,
      ),

    submission:
      submission
        ? {
            id:
              submission.id,

            status:
              submission.status,

            submittedAt:
              submission.submittedAt,

            acknowledgedAt:
              submission
                .acknowledgedAt,

            externalReference:
              submission
                .externalReference,

            acknowledgmentReference:
              submission
                .acknowledgmentReference,

            authorityName:
              submission
                .authorityName,

            submissionMethod:
              submission
                .submissionMethod,

            filingDestinationId:
              submission
                .filingDestinationId,

            filingDestinationVersion:
              submission
                .filingDestinationVersion,

            filingDestinationSnapshotHash:
              submission
                .filingDestinationSnapshotHash,
          }
        : null,

    review:
      review ??
      null,

    informationRequests,

    audit,

    permissions: {
      actorUserId,

      mayRead:
        true,

      mayRecordEvents:
        can(
          session,
          writePermission(),
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
      await authorityStateResponse(
        id,
        session,
      ),
    );
  } catch (
    error
  ) {
    return routeErrorResponse(
      error,
      "Authority-review state could not be loaded.",
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
    requireWritePermission(
      session,
    );

    let body:
      AuthorityReviewActionBody;

    try {
      body =
        (await request.json()) as
          AuthorityReviewActionBody;
    } catch {
      return errorResponse(
        "Invalid JSON request.",
        400,
      );
    }

    if (!body.action) {
      return errorResponse(
        "Authority-review action is required.",
        400,
      );
    }

    const authorityContext =
      await resolveAuthorityContext(
        id,
        session,
      );

    const {
      actorUserId,
      submission,
      review,
    } =
      authorityContext;

    if (
      !submission ||
      !review
    ) {
      return errorResponse(
        "Authority Review becomes available only after a real external claim submission has been durably recorded.",
        409,
      );
    }

    /* ====================================================================== */
    /* Authority review started                                               */
    /* ====================================================================== */

    if (
      body.action ===
      "record_review_started"
    ) {
      await recordAuthorityReviewStarted({
        reviewId:
          review.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Review started at",
          ),

        externalReference:
          optionalText(
            body.externalReference,
          ),

        summary:
          optionalText(
            body.summary,
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Additional-information request                                         */
    /* ====================================================================== */

    if (
      body.action ===
      "record_information_request"
    ) {
      await recordAuthorityInformationRequest({
        reviewId:
          review.id,

        actorUserId,

        requestedAt:
          requiredString(
            body.requestedAt,
            "Requested at",
          ),

        requestSummary:
          requiredString(
            body.requestSummary,
            "Request summary",
          ),

        requestReference:
          optionalText(
            body.requestReference,
          ),

        dueAt:
          optionalText(
            body.dueAt,
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Response to information request                                        */
    /* ====================================================================== */

    if (
      body.action ===
      "record_information_response"
    ) {
      const informationRequest =
        await requireInformationRequestForReview({
          reviewId:
            review.id,

          requestId:
            requiredString(
              body.requestId,
              "Information request ID",
            ),
        });

      await respondAuthorityInformationRequest({
        requestId:
          informationRequest.id,

        actorUserId,

        respondedAt:
          requiredString(
            body.respondedAt,
            "Responded at",
          ),

        responseSummary:
          requiredString(
            body.responseSummary,
            "Response summary",
          ),

        responseReference:
          optionalText(
            body.responseReference,
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Resolve information request                                            */
    /* ====================================================================== */

    if (
      body.action ===
      "resolve_information_request"
    ) {
      if (
        body.resolution !==
          "satisfied" &&
        body.resolution !==
          "withdrawn"
      ) {
        return errorResponse(
          "Information-request resolution must be satisfied or withdrawn.",
          400,
        );
      }

      const informationRequest =
        await requireInformationRequestForReview({
          reviewId:
            review.id,

          requestId:
            requiredString(
              body.requestId,
              "Information request ID",
            ),
        });

      await resolveAuthorityInformationRequest({
        requestId:
          informationRequest.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Resolution timestamp",
          ),

        resolution:
          body.resolution,

        summary:
          optionalText(
            body.summary,
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Authority approval                                                     */
    /* ====================================================================== */

    if (
      body.action ===
      "record_approval"
    ) {
      await recordAuthorityApproval({
        reviewId:
          review.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Approval timestamp",
          ),

        summary:
          requiredString(
            body.summary,
            "Approval summary",
          ),

        externalReference:
          optionalText(
            body.externalReference,
          ),

        approvedAmountCents:
          optionalWholeCents(
            body.approvedAmountCents,
            "Approved amount",
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Authority denial                                                       */
    /* ====================================================================== */

    if (
      body.action ===
      "record_denial"
    ) {
      await recordAuthorityDenial({
        reviewId:
          review.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Denial timestamp",
          ),

        denialReason:
          requiredString(
            body.denialReason,
            "Denial reason",
          ),

        summary:
          optionalText(
            body.summary,
          ),

        externalReference:
          optionalText(
            body.externalReference,
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Payment issued                                                         */
    /* ====================================================================== */

    if (
      body.action ===
      "record_payment_issued"
    ) {
      await recordAuthorityPaymentIssued({
        reviewId:
          review.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Payment-issued timestamp",
          ),

        paymentAmountCents:
          requiredWholeCents(
            body.paymentAmountCents,
            "Payment amount",
          ),

        paymentReference:
          optionalText(
            body.paymentReference,
          ),

        summary:
          optionalText(
            body.summary,
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Recovery                                                               */
    /* ====================================================================== */

    if (
      body.action ===
      "record_recovery"
    ) {
      await recordRecovery({
        reviewId:
          review.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Recovery timestamp",
          ),

        recoveredAmountCents:
          requiredWholeCents(
            body.recoveredAmountCents,
            "Recovered amount",
          ),

        summary:
          optionalText(
            body.summary,
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Closure                                                                */
    /* ====================================================================== */

    if (
      body.action ===
      "close_review"
    ) {
      await closeAuthorityReview({
        reviewId:
          review.id,

        actorUserId,

        occurredAt:
          requiredString(
            body.occurredAt,
            "Closure timestamp",
          ),

        closeSummary:
          requiredString(
            body.closeSummary,
            "Closure summary",
          ),
      });

      return NextResponse.json(
        await authorityStateResponse(
          id,
          session,
        ),
      );
    }

    return errorResponse(
      "Unsupported authority-review action.",
      400,
    );
  } catch (
    error
  ) {
    return routeErrorResponse(
      error,
      "Authority-review action failed.",
      409,
    );
  }
}