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

import {
  getCurrentJurisdictionFilingDestination,
  jurisdictionFilingAddressLines,
  normalizeJurisdictionFilingMethod,
  resolveJurisdictionFilingDestinationReadiness,
} from "@/server/jurisdiction-filing-destination-store";

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
 * CLAIM-INITIATION ROUTE
 *
 * This API also resolves the read-only submission route that becomes relevant
 * after pre-filing approval.
 *
 * The route identifies:
 *
 *   - the responsible authority
 *   - the recorded custodian
 *   - the approved submission method
 *   - the verified operational filing destination
 *   - whether an official claim form exists
 *   - whether an attorney is required
 *   - whether DueQuity may file as representative
 *   - whether the claimant must personally control submission
 *   - the government payment route
 *   - the DueQuity launch recovery track
 *   - the claim-specific active submission-document requirements
 *
 * Resolving this route does NOT create an external submission.
 *
 * FILING DESTINATION PRINCIPLE
 *
 * DueQuity staff should not have to independently search for where a claim
 * must be sent.
 *
 * The jurisdiction filing-destination foundation resolves the verified:
 *
 *   - filing email;
 *   - mailing destination;
 *   - physical delivery location;
 *   - online portal;
 *   - court e-filing portal;
 *   - department / attention line;
 *   - filing instructions;
 *   - official source supporting the destination.
 *
 * Stage 20D displays this destination.
 *
 * Stage 20E will make an operationally complete verified destination a
 * mandatory external-submission gate.
 *
 * DOCUMENT-ACTIVATION PRINCIPLE
 *
 * Claim Initiation must use the same claim-specific document requirements as
 * filing readiness.
 *
 * A document appearing in the jurisdiction's full requirements catalog does
 * not automatically mean it is required for every claim. Conditional estate
 * documents such as Letters of Administration remain dormant unless the claim
 * itself activates the deceased-owner or probate requirement.
 *
 * If representative filing is prohibited, the workflow remains claimant
 * controlled. DueQuity may prepare and coordinate the claimant-ready package,
 * but the software must not represent that DueQuity filed the claim.
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
 */

type FilingPackageAction =
  | "prepare"
  | "submit_for_review"
  | "approve_pre_filing"
  | "return_for_changes";

type ClaimInitiationRouteMode =
  | "claimant_controlled"
  | "representative_controlled"
  | "blocked";

type ClaimInitiationStatus =
  | "awaiting_pre_filing_package"
  | "awaiting_pre_filing_approval"
  | "ready_for_claim_initiation"
  | "counsel_required"
  | "blocked";

type FilingDestinationResolutionStatus =
  | "verified"
  | "missing"
  | "unsupported_method";

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
/* Claim-initiation route                                                      */
/* ========================================================================== */

function resolveClaimInitiationRoute({
  jurisdiction,
  jurisdictionPackage,
  currentPackageStatus,
  requiredDocumentKinds,
}: {
  jurisdiction: NonNullable<
    Awaited<ReturnType<typeof resolvePersistentClaim>>["jurisdiction"]
  >;

  jurisdictionPackage: Awaited<
    ReturnType<typeof resolvePersistentClaim>
  >["jurisdictionPackage"];

  currentPackageStatus?: string;

  requiredDocumentKinds: string[];
}) {
  const paymentRouting = jurisdictionPackage.paymentRouting;

  let mode: ClaimInitiationRouteMode = "blocked";

  if (paymentRouting?.representativeMayFile === "no") {
    mode = "claimant_controlled";
  }

  if (paymentRouting?.representativeMayFile === "yes") {
    mode = "representative_controlled";
  }

  let status: ClaimInitiationStatus;

  if (!currentPackageStatus) {
    status = "awaiting_pre_filing_package";
  } else if (currentPackageStatus !== "pre_filing_approved") {
    status = "awaiting_pre_filing_approval";
  } else if (jurisdiction.attorneyRequired) {
    status = "counsel_required";
  } else if (!paymentRouting || mode === "blocked") {
    status = "blocked";
  } else {
    status = "ready_for_claim_initiation";
  }

  let message: string;

  switch (status) {
    case "awaiting_pre_filing_package":
      message =
        "Prepare and complete the controlled filing-package review before Claim Initiation can begin.";
      break;

    case "awaiting_pre_filing_approval":
      message =
        "Independent pre-filing approval is required before Claim Initiation can begin.";
      break;

    case "counsel_required":
      message =
        "The current jurisdiction requires an attorney workflow. Do not proceed through the ordinary administrative submission route.";
      break;

    case "blocked":
      message =
        "The current jurisdiction does not contain a complete operational claim-submission route. External submission remains blocked.";
      break;

    case "ready_for_claim_initiation":
      message =
        mode === "claimant_controlled"
          ? "Pre-filing approval is complete. DueQuity may prepare and coordinate the claimant-ready submission, but the claimant or lawful estate representative must control the actual filing."
          : "Pre-filing approval is complete. The approved jurisdiction rule permits an authorized representative filing route. Claim Initiation may proceed subject to the recorded authorization and submission controls.";
      break;
  }

  return {
    mode,

    status,

    ready: status === "ready_for_claim_initiation",

    filingParty:
      mode === "claimant_controlled"
        ? "claimant"
        : mode === "representative_controlled"
          ? "authorized_representative"
          : "unresolved",

    agencyName: jurisdiction.agencyName,

    custodian: jurisdiction.custodian,

    claimMethod: jurisdiction.claimMethod,

    claimFormUrl: jurisdiction.claimFormUrl,

    attorneyRequired: jurisdiction.attorneyRequired,

    requiredDocuments: requiredDocumentKinds,

    representativeMayFile:
      paymentRouting?.representativeMayFile ?? "unknown",

    representativeMayReceivePayment:
      paymentRouting?.representativeMayReceivePayment ?? "unknown",

    paymentRoute: paymentRouting?.paymentRoute ?? "unknown",

    launchPaymentTrack: paymentRouting?.launchTrack ?? "blocked",

    feeCollectionMethod:
      paymentRouting?.feeCollectionMethod ?? "unknown",

    message,
  };
}

/* ========================================================================== */
/* Filing destination                                                          */
/* ========================================================================== */

async function resolveFilingDestination({
  jurisdictionPackage,
  claimMethod,
}: {
  jurisdictionPackage: Awaited<
    ReturnType<typeof resolvePersistentClaim>
  >["jurisdictionPackage"];

  claimMethod: string;
}) {
  const normalizedMethod =
    normalizeJurisdictionFilingMethod(claimMethod);

  if (!normalizedMethod) {
    return {
      status:
        "unsupported_method" as FilingDestinationResolutionStatus,

      complete: false,

      submissionMethod: claimMethod,

      message:
        "The jurisdiction claim method is not mapped to a supported DueQuity filing-destination method. Staff must not independently guess the filing destination.",
    };
  }

  const destination =
    await getCurrentJurisdictionFilingDestination({
      jurisdictionPackageId:
        jurisdictionPackage.id,

      jurisdictionPackageVersion:
        jurisdictionPackage.version,

      submissionMethod:
        normalizedMethod,
    });

  if (!destination) {
    return {
      status:
        "missing" as FilingDestinationResolutionStatus,

      complete: false,

      submissionMethod:
        normalizedMethod,

      message:
        `No current verified ${normalizedMethod.replaceAll(
          "_",
          " ",
        )} filing destination is recorded for this approved jurisdiction package.`,
    };
  }

  const readiness =
    resolveJurisdictionFilingDestinationReadiness(destination);

  return {
    status:
      "verified" as FilingDestinationResolutionStatus,

    complete:
      readiness.complete,

    submissionMethod:
      destination.submissionMethod,

    message:
      readiness.detail,

    id:
      destination.id,

    destinationVersion:
      destination.destinationVersion,

    agencyName:
      destination.agencyName,

    departmentName:
      destination.departmentName,

    attentionLine:
      destination.attentionLine,

    filingEmail:
      destination.filingEmail,

    mailingAddressLines:
      destination.mailingAddress
        ? jurisdictionFilingAddressLines(
            destination.mailingAddress,
          )
        : [],

    physicalAddressLines:
      destination.physicalAddress
        ? jurisdictionFilingAddressLines(
            destination.physicalAddress,
          )
        : [],

    portalUrl:
      destination.portalUrl,

    phone:
      destination.phone,

    filingInstructions:
      destination.filingInstructions,

    officialSourceUrl:
      destination.officialSourceUrl,

    officialSourceTitle:
      destination.officialSourceTitle,

    verifiedAt:
      destination.verifiedAt,
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

  const canApprovePreFiling =
    reviewWorkflowAvailable && readiness.readyToPrepare;

  const canReturnForChanges = reviewWorkflowAvailable;

  const claimInitiationRoute = resolveClaimInitiationRoute({
    jurisdiction,

    jurisdictionPackage,

    currentPackageStatus: currentPackage?.status,

    requiredDocumentKinds: readiness.requiredDocumentKinds,
  });

  const filingDestination =
    await resolveFilingDestination({
      jurisdictionPackage,

      claimMethod:
        jurisdiction.claimMethod,
    });

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

      custodian: jurisdiction.custodian,

      claimMethod: jurisdiction.claimMethod,

      claimFormUrl: jurisdiction.claimFormUrl,

      attorneyRequired: jurisdiction.attorneyRequired,

      requiredDocuments: readiness.requiredDocumentKinds,
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

      canApproveOrReturn: canReturnForChanges,

      canApprovePreFiling,

      canReturnForChanges,
    },

    claimInitiationRoute,

    filingDestination,

    submission: {
      submitted: false,

      message:
        "No court or agency submission has occurred through this filing-package workflow.",
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