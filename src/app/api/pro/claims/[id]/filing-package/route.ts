import { NextRequest, NextResponse } from "next/server";

import type { IsoDate, Permission } from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
  type StaffSession,
} from "@/lib/session";

import { resolveStaffSession } from "@/server/staff-session";

import { resolveClaimRecord } from "@/server/claim-record";

import { resolvePersistedClaimFilingReadiness } from "@/server/claim-filing-readiness";

import {
  approveClaimFilingPackage,
  claimFilingPackageAudit,
  getCurrentClaimFilingPackage,
  listClaimFilingPackages,
  prepareClaimFilingPackage,
  returnClaimFilingPackage,
  submitClaimFilingPackageForReview,
} from "@/server/claim-filing-package-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/**
 * CLAIM FILING PACKAGE API
 *
 * Controlled internal workflow:
 *
 *   1. prepare
 *   2. submit_for_review
 *   3. approve_pre_filing OR return_for_changes
 *
 * This API does NOT submit a claim to:
 *
 *   - a court
 *   - a clerk
 *   - a county
 *   - a tax collector
 *   - a trustee
 *   - another custodian or government agency
 *
 * "pre_filing_approved" means only that an independent authorized human
 * reviewer approved the frozen internal package snapshot for the next
 * controlled stage.
 *
 * SERVER-SIDE AUTHORIZATION
 *
 * Every request is evaluated against the authenticated staff session.
 *
 * Reading package state requires:
 *
 *   claim.read
 *
 * Preparing or submitting a package for internal review requires:
 *
 *   claim.read
 *   claim.write
 *
 * Performing independent pre-filing review requires:
 *
 *   claim.read
 *   claim.submit
 *
 * State clearance is separately enforced from permissions.
 *
 * FILING READINESS
 *
 * The browser does not supply:
 *
 *   - claimant identity
 *   - claimant linkage
 *   - accepted documents
 *   - jurisdiction requirements
 *   - payment routing
 *   - Startup Green Lane status
 *   - commercial pricing
 *   - legal-rule provenance
 *   - filing deadline
 *   - legal lane
 *   - filing-readiness controls
 *
 * Those facts are resolved again by the server from persisted records and the
 * current approved jurisdiction package.
 *
 * INDEPENDENT REVIEW
 *
 * The same user who prepared or submitted a filing package may not approve or
 * return that package during independent pre-filing review.
 *
 * RETURNED PACKAGE RULE
 *
 * A package returned for changes must be prepared again before it can be
 * resubmitted. The old returned snapshot may not simply be placed back under
 * review.
 */

type FilingPackageAction =
  "prepare" | "submit_for_review" | "approve_pre_filing" | "return_for_changes";

interface FilingPackageActionBody {
  action?: FilingPackageAction;

  reviewNote?: string;

  returnReason?: string;
}

/* ========================================================================== */
/* Route error                                                                 */
/* ========================================================================== */

class FilingPackageRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);

    this.name = "FilingPackageRouteError";

    this.status = status;
  }
}

function routeErrorResponse(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 409,
) {
  if (error instanceof FilingPackageRouteError) {
    return NextResponse.json(
      {
        ok: false,

        error: error.message,
      },
      {
        status: error.status,
      },
    );
  }

  return NextResponse.json(
    {
      ok: false,

      error: error instanceof Error ? error.message : fallbackMessage,
    },
    {
      status: fallbackStatus,
    },
  );
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,

      error: message,
    },
    {
      status,
    },
  );
}

function requiredString(value: string | undefined, label: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new FilingPackageRouteError(`${label} is required.`, 400);
  }

  return normalized;
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function actionPermission(action: FilingPackageAction): Permission {
  switch (action) {
    case "prepare":
    case "submit_for_review":
      return "claim.write";

    case "approve_pre_filing":
    case "return_for_changes":
      return "claim.submit";
  }
}

function requireClaimReadPermission(session: StaffSession): void {
  if (!can(session, "claim.read")) {
    throw new FilingPackageRouteError(
      "You do not have permission to read this claim filing package.",
      403,
    );
  }
}

function requireActionPermission(
  session: StaffSession,
  action: FilingPackageAction,
): void {
  /*
   * Mutation access never implies read access.
   *
   * Require both so an unusual custom role cannot mutate a Claim it is not
   * authorized to inspect.
   */
  requireClaimReadPermission(session);

  const permission = actionPermission(action);

  if (!can(session, permission)) {
    const message =
      permission === "claim.submit"
        ? "You do not have permission to perform independent pre-filing review."
        : "You do not have permission to prepare or submit claim filing packages for review.";

    throw new FilingPackageRouteError(message, 403);
  }
}

/* ========================================================================== */
/* Claim resolver                                                              */
/* ========================================================================== */

async function resolvePersistentClaim(claimId: string, session: StaffSession) {
  const resolved = await resolveClaimRecord(claimId);

  if (!resolved) {
    throw new FilingPackageRouteError("Claim not found.", 404);
  }

  const claim = resolved.claim;

  const jurisdictionPackages = await listJurisdictionRulePackages();

  /*
   * Select the newest approved package for the Claim's jurisdiction.
   *
   * Filing authorization always relies on the current approved rule rather
   * than whichever matching package happened to appear first in storage.
   */
  const jurisdictionPackage = jurisdictionPackages
    .filter(
      (rulePackage) =>
        rulePackage.status === "approved" &&
        rulePackage.rule?.id === claim.jurisdictionId,
    )
    .slice()
    .sort((left, right) => right.version - left.version)[0];

  const jurisdiction = jurisdictionPackage?.rule;

  if (!jurisdictionPackage || !jurisdiction) {
    throw new FilingPackageRouteError(
      "No current approved jurisdiction rule is published for this claim.",
      409,
    );
  }

  /*
   * Operational permission and geographic clearance are separate gates.
   *
   * A user with claim.write or claim.submit cannot act outside their cleared
   * states.
   */
  if (!clearedForState(session, jurisdictionPackage.stateCode)) {
    throw new FilingPackageRouteError(
      `You are not cleared to work on claims in ${jurisdictionPackage.stateCode}.`,
      403,
    );
  }

  const readiness = await resolvePersistedClaimFilingReadiness(
    claim,
    jurisdiction,
    currentIsoDate(),
  );

  return {
    claim,

    jurisdiction,

    jurisdictionPackage,

    readiness,

    actorUserId: session.user.id,
  };
}

/* ========================================================================== */
/* Current-state response                                                      */
/* ========================================================================== */

async function filingPackageResponse(claimId: string, session: StaffSession) {
  requireClaimReadPermission(session);

  const { claim, jurisdiction, jurisdictionPackage, readiness, actorUserId } =
    await resolvePersistentClaim(claimId, session);

  const [currentPackage, packageHistory, audit] = await Promise.all([
    getCurrentClaimFilingPackage(claim.id),

    listClaimFilingPackages(claim.id),

    claimFilingPackageAudit(claim.id),
  ]);

  const mayWrite = can(session, "claim.write");

  const mayReview = can(session, "claim.submit");

  /*
   * A returned package must be prepared again so changed Claim data produces a
   * fresh package snapshot.
   */
  const canPrepare =
    mayWrite &&
    readiness.readyToPrepare &&
    (!currentPackage || currentPackage.status === "returned_for_changes");

  const canSubmitForReview =
    mayWrite &&
    readiness.readyToPrepare &&
    currentPackage?.status === "prepared";

  const reviewerIndependent = Boolean(
    currentPackage &&
    currentPackage.preparedByUserId !== actorUserId &&
    currentPackage.submittedForReviewByUserId !== actorUserId,
  );

  const reviewWorkflowAvailable =
    Boolean(currentPackage?.status === "under_review") &&
    mayReview &&
    reviewerIndependent;

  /*
   * A reviewer may always return an under-review package for changes.
   *
   * Approval is stricter: the Claim must STILL satisfy current filing
   * readiness at approval time.
   */
  const canApprovePreFiling =
    reviewWorkflowAvailable && readiness.readyToPrepare;

  const canReturnForChanges = reviewWorkflowAvailable;

  return {
    ok: true,

    claim: {
      id: claim.id,

      reference: claim.reference,

      jurisdictionId: claim.jurisdictionId,

      filingDeadline: claim.filingDeadline,
    },

    jurisdiction: {
      id: jurisdiction.id,

      agencyName: jurisdiction.agencyName,

      stateCode: jurisdictionPackage.stateCode,

      ruleVersion: jurisdictionPackage.version,
    },

    readiness,

    currentPackage: currentPackage ?? null,

    packageHistory,

    audit,

    permissions: {
      actorUserId,

      mayRead: true,

      mayWrite,

      mayPerformPreFilingReview: mayReview,

      reviewerIndependent,

      canPrepare,

      canSubmitForReview,

      /*
       * Retained for existing UI compatibility.
       *
       * New UI should prefer the two specific values below because approval and
       * return no longer have identical readiness requirements.
       */
      canApproveOrReturn: canReturnForChanges,

      canApprovePreFiling,

      canReturnForChanges,
    },

    submission: {
      submitted: false,

      message:
        "No court or agency submission occurs through this filing-package API.",
    },
  };
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id } = await context.params;

  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  try {
    requireClaimReadPermission(session);

    return NextResponse.json(await filingPackageResponse(id, session));
  } catch (error) {
    return routeErrorResponse(
      error,
      "Filing package state could not be loaded.",
      409,
    );
  }
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id } = await context.params;

  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  try {
    let body: FilingPackageActionBody;

    try {
      body = (await request.json()) as FilingPackageActionBody;
    } catch {
      return errorResponse("Invalid JSON request.");
    }

    if (!body.action) {
      return errorResponse("Filing-package action is required.");
    }

    requireActionPermission(session, body.action);

    const { claim, readiness, actorUserId } = await resolvePersistentClaim(
      id,
      session,
    );

    const occurredAt = new Date().toISOString();

    /* ====================================================================== */
    /* Prepare                                                                */
    /* ====================================================================== */

    if (body.action === "prepare") {
      if (!readiness.readyToPrepare) {
        return errorResponse(
          `Claim is not ready to prepare. ${readiness.outstandingControlCount} filing-readiness control${
            readiness.outstandingControlCount === 1 ? " remains" : "s remain"
          } outstanding. ${readiness.nextInternalAction}`,
          409,
        );
      }

      const currentPackage = await getCurrentClaimFilingPackage(claim.id);

      if (currentPackage && currentPackage.status !== "returned_for_changes") {
        return errorResponse(
          "A current filing package already exists. Only a package returned for changes may be prepared again.",
          409,
        );
      }

      await prepareClaimFilingPackage({
        claimId: claim.id,

        actorUserId,

        occurredAt,
      });

      return NextResponse.json(await filingPackageResponse(claim.id, session));
    }

    /* ====================================================================== */
    /* Resolve current package                                                */
    /* ====================================================================== */

    const currentPackage = await getCurrentClaimFilingPackage(claim.id);

    if (!currentPackage) {
      return errorResponse(
        "Prepare a filing package before performing this action.",
        409,
      );
    }

    /* ====================================================================== */
    /* Submit for human review                                                */
    /* ====================================================================== */

    if (body.action === "submit_for_review") {
      if (!readiness.readyToPrepare) {
        return errorResponse(
          `The claim no longer satisfies filing readiness. ${readiness.nextInternalAction}`,
          409,
        );
      }

      /*
       * A returned package cannot simply be resubmitted.
       *
       * It must first be prepared again so the package store freezes a fresh
       * snapshot of the corrected Claim and documents.
       */
      if (currentPackage.status !== "prepared") {
        return errorResponse(
          currentPackage.status === "returned_for_changes"
            ? "This package was returned for changes. Prepare a refreshed package before submitting it for review again."
            : "Only a prepared filing package may be submitted for review.",
          409,
        );
      }

      await submitClaimFilingPackageForReview({
        packageId: currentPackage.id,

        actorUserId,

        occurredAt,
      });

      return NextResponse.json(await filingPackageResponse(claim.id, session));
    }

    /* ====================================================================== */
    /* Independent reviewer gate                                              */
    /* ====================================================================== */

    const reviewerIndependent =
      currentPackage.preparedByUserId !== actorUserId &&
      currentPackage.submittedForReviewByUserId !== actorUserId;

    if (
      (body.action === "approve_pre_filing" ||
        body.action === "return_for_changes") &&
      !reviewerIndependent
    ) {
      return errorResponse(
        "A different authorized staff user must perform the independent pre-filing review.",
        403,
      );
    }

    /* ====================================================================== */
    /* Independent pre-filing approval                                        */
    /* ====================================================================== */

    if (body.action === "approve_pre_filing") {
      if (currentPackage.status !== "under_review") {
        return errorResponse(
          "The current filing package must be under review before it can receive pre-filing approval.",
          409,
        );
      }

      /*
       * Re-check current readiness immediately before approval.
       *
       * Examples of facts that can invalidate an under-review package:
       *
       *   - jurisdiction approval withdrawn
       *   - payment route changed
       *   - legal rule version changed
       *   - new blocking flag
       *   - deadline expired
       *   - agreement cancelled
       *   - required document no longer accepted
       *
       * The reviewer may return such a package, but may not approve it.
       */
      if (!readiness.readyToPrepare) {
        return errorResponse(
          `Pre-filing approval is blocked because the claim no longer satisfies current filing readiness. ${readiness.nextInternalAction}`,
          409,
        );
      }

      await approveClaimFilingPackage({
        packageId: currentPackage.id,

        reviewerUserId: actorUserId,

        occurredAt,

        reviewNote: body.reviewNote?.trim() || undefined,
      });

      return NextResponse.json(await filingPackageResponse(claim.id, session));
    }

    /* ====================================================================== */
    /* Return for changes                                                     */
    /* ====================================================================== */

    if (body.action === "return_for_changes") {
      if (currentPackage.status !== "under_review") {
        return errorResponse(
          "Only a filing package currently under review can be returned for changes.",
          409,
        );
      }

      await returnClaimFilingPackage({
        packageId: currentPackage.id,

        reviewerUserId: actorUserId,

        occurredAt,

        reason: requiredString(body.returnReason, "Return reason"),
      });

      return NextResponse.json(await filingPackageResponse(claim.id, session));
    }

    return errorResponse("Unsupported filing-package action.");
  } catch (error) {
    return routeErrorResponse(error, "Filing-package action failed.", 409);
  }
}