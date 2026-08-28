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
  getCurrentClaimFilingPackage,
  verifyClaimFilingPackageSnapshot,
} from "@/server/claim-filing-package-store";

import {
  normalizeJurisdictionFilingMethod,
  requireOperationalJurisdictionFilingDestination,
  type JurisdictionFilingDestination,
} from "@/server/jurisdiction-filing-destination-store";

import {
  claimSubmissionAudit,
  getClaimSubmissionByClaimId,
  recordClaimSubmission,
  recordClaimSubmissionAcknowledgment,
  type ClaimSubmissionRouteMode,
} from "@/server/claim-submission-store";

import {
  listJurisdictionRulePackages,
  type JurisdictionPaymentRouting,
} from "@/server/jurisdiction-intelligence";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/**
 * CLAIM SUBMISSION API
 *
 * Records real-world external submission facts only after:
 *
 *   1. current filing readiness is satisfied;
 *   2. the filing package has independent pre-filing approval;
 *   3. the frozen package passes integrity verification;
 *   4. the current approved jurisdiction still matches the package;
 *   5. the current payment route still matches the package;
 *   6. the current active document requirements still match the package;
 *   7. a complete verified operational filing destination exists;
 *   8. staff permission and state clearance are satisfied.
 *
 * This endpoint DOES NOT:
 *
 *   - send email;
 *   - upload to a government portal;
 *   - mail a filing;
 *   - file a court pleading;
 *   - contact an authority;
 *   - infer that a submission occurred.
 *
 * DESTINATION PROVENANCE
 *
 * The current verified filing destination is resolved server-side.
 *
 * When a real-world external submission is recorded, the application passes
 * only that verified destination ID to the durable submission store.
 *
 * PostgreSQL independently resolves the destination and freezes:
 *
 *   - destination version;
 *   - exact destination snapshot;
 *   - official source provenance;
 *   - verification provenance;
 *   - SHA-256 snapshot hash.
 *
 * A browser cannot supply or override the historical destination snapshot.
 *
 * CLAIMANT-CONTROLLED ROUTES
 *
 * When representativeMayFile = "no", the filing party is always derived as
 * claimant. The request body cannot override it.
 *
 * AUTHORITY ACKNOWLEDGMENT
 *
 * Submission and authority acknowledgment remain separate external facts.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type ClaimSubmissionAction =
  | "record_submission"
  | "record_acknowledgment";

interface ClaimSubmissionActionBody {
  action?: ClaimSubmissionAction;

  submittedAt?: string;

  externalReference?: string;

  submissionNote?: string;

  acknowledgedAt?: string;

  acknowledgmentSummary?: string;
}

interface ResolvedSubmissionContext {
  session: StaffSession;

  actorUserId: string;

  claim: NonNullable<
    Awaited<
      ReturnType<
        typeof resolveClaimRecord
      >
    >
  >["claim"];

  jurisdictionPackage: Awaited<
    ReturnType<
      typeof listJurisdictionRulePackages
    >
  >[number];

  jurisdiction: NonNullable<
    Awaited<
      ReturnType<
        typeof listJurisdictionRulePackages
      >
    >[number]["rule"]
  >;

  paymentRouting:
    JurisdictionPaymentRouting;

  readiness: Awaited<
    ReturnType<
      typeof resolvePersistedClaimFilingReadiness
    >
  >;

  filingPackage: NonNullable<
    Awaited<
      ReturnType<
        typeof getCurrentClaimFilingPackage
      >
    >
  >;

  routeMode:
    ClaimSubmissionRouteMode;

  filingDestination:
    JurisdictionFilingDestination;
}

/* ========================================================================== */
/* Route errors                                                                */
/* ========================================================================== */

class ClaimSubmissionRouteError extends Error {
  status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(
      message,
    );

    this.name =
      "ClaimSubmissionRouteError";

    this.status =
      status;
  }
}

function errorResponse(
  message: string,
  status = 400,
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
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 409,
) {
  if (
    error instanceof
    ClaimSubmissionRouteError
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
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    ) as IsoDate;
}

function requiredString(
  value:
    string | undefined,
  label: string,
): string {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new ClaimSubmissionRouteError(
      `${label} is required.`,
      400,
    );
  }

  return normalized;
}

function optionalText(
  value:
    string | undefined,
): string | undefined {
  const normalized =
    value?.trim();

  return normalized ||
    undefined;
}

function normalizeDocumentKinds(
  values: string[],
): string[] {
  return [
    ...values,
  ].sort(
    (
      left,
      right,
    ) =>
      left.localeCompare(
        right,
      ),
  );
}

function arraysEqual(
  left: string[],
  right: string[],
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  return left.every(
    (
      value,
      index,
    ) =>
      value ===
      right[index],
  );
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function requiredPermission(): Permission {
  return "claim.submit";
}

function requireSubmissionPermission(
  session: StaffSession,
): void {
  if (
    !can(
      session,
      "claim.read",
    )
  ) {
    throw new ClaimSubmissionRouteError(
      "You do not have permission to read this claim.",
      403,
    );
  }

  if (
    !can(
      session,
      requiredPermission(),
    )
  ) {
    throw new ClaimSubmissionRouteError(
      "You do not have permission to record claim-submission events.",
      403,
    );
  }
}

/* ========================================================================== */
/* Current route validation                                                    */
/* ========================================================================== */

function resolveRouteMode(
  paymentRouting:
    JurisdictionPaymentRouting,
): ClaimSubmissionRouteMode {
  if (
    paymentRouting
      .representativeMayFile ===
    "no"
  ) {
    return "claimant_controlled";
  }

  if (
    paymentRouting
      .representativeMayFile ===
    "yes"
  ) {
    return "representative_controlled";
  }

  throw new ClaimSubmissionRouteError(
    "The current jurisdiction does not contain a resolved filing-party determination.",
    409,
  );
}

function assertPaymentRouteOperational(
  paymentRouting:
    JurisdictionPaymentRouting,
): void {
  if (
    paymentRouting.paymentRoute ===
      "unknown" ||
    paymentRouting.paymentRoute ===
      "assignee" ||
    paymentRouting.launchTrack ===
      "blocked" ||
    paymentRouting.launchTrack ===
      "future_acquisition" ||
    paymentRouting
      .representativeMayFile ===
      "unknown" ||
    paymentRouting
      .representativeMayReceivePayment ===
      "unknown" ||
    paymentRouting
      .assignmentRequiredForRepresentativePayment ===
      "unknown" ||
    paymentRouting
      .assignmentRequiredForRepresentativePayment ===
      "yes" ||
    paymentRouting
      .feeCollectionMethod ===
      "unknown" ||
    paymentRouting
      .feeCollectionMethod ===
      "assignment_acquisition"
  ) {
    throw new ClaimSubmissionRouteError(
      "The current jurisdiction payment route is not operational for DueQuity claim submission.",
      409,
    );
  }
}

function assertApprovedPackageMatchesCurrentRules(
  context: {
    filingPackage:
      ResolvedSubmissionContext["filingPackage"];

    jurisdictionPackage:
      ResolvedSubmissionContext["jurisdictionPackage"];

    jurisdiction:
      ResolvedSubmissionContext["jurisdiction"];

    paymentRouting:
      JurisdictionPaymentRouting;

    readiness:
      ResolvedSubmissionContext["readiness"];
  },
): void {
  const {
    filingPackage,
    jurisdictionPackage,
    jurisdiction,
    paymentRouting,
    readiness,
  } =
    context;

  if (
    !verifyClaimFilingPackageSnapshot(
      filingPackage,
    )
  ) {
    throw new ClaimSubmissionRouteError(
      "The approved filing-package snapshot failed integrity verification. External submission must remain blocked.",
      409,
    );
  }

  if (
    filingPackage.status !==
    "pre_filing_approved"
  ) {
    throw new ClaimSubmissionRouteError(
      "Independent pre-filing approval is required before an external submission may be recorded.",
      409,
    );
  }

  if (
    filingPackage.snapshot
      .jurisdictionId !==
    jurisdiction.id
  ) {
    throw new ClaimSubmissionRouteError(
      "The approved filing package no longer matches the current jurisdiction.",
      409,
    );
  }

  if (
    filingPackage.snapshot
      .jurisdictionPackageVersion !==
    jurisdictionPackage.version
  ) {
    throw new ClaimSubmissionRouteError(
      "The jurisdiction rule package changed after pre-filing approval. Prepare and independently approve a new filing package before recording submission.",
      409,
    );
  }

  if (
    filingPackage.snapshot
      .jurisdictionLegalRuleVersion !==
    jurisdiction.legalRuleVersion
  ) {
    throw new ClaimSubmissionRouteError(
      "The jurisdiction legal-rule version changed after pre-filing approval. Prepare and independently approve a new filing package before recording submission.",
      409,
    );
  }

  if (
    filingPackage.snapshot
      .paymentRoute !==
      paymentRouting.paymentRoute ||
    filingPackage.snapshot
      .launchPaymentTrack !==
      paymentRouting.launchTrack ||
    filingPackage.snapshot
      .representativeMayFile !==
      paymentRouting
        .representativeMayFile ||
    filingPackage.snapshot
      .representativeMayReceivePayment !==
      paymentRouting
        .representativeMayReceivePayment ||
    filingPackage.snapshot
      .assignmentRequiredForRepresentativePayment !==
      paymentRouting
        .assignmentRequiredForRepresentativePayment ||
    filingPackage.snapshot
      .feeCollectionMethod !==
      paymentRouting
        .feeCollectionMethod
  ) {
    throw new ClaimSubmissionRouteError(
      "The jurisdiction payment-routing determination changed after pre-filing approval. Prepare and independently approve a new filing package before recording submission.",
      409,
    );
  }

  const frozenDocumentKinds =
    normalizeDocumentKinds(
      filingPackage.snapshot
        .acceptedDocuments.map(
          (
            document,
          ) =>
            document.kind,
        ),
    );

  const currentRequiredDocumentKinds =
    normalizeDocumentKinds(
      readiness
        .requiredDocumentKinds,
    );

  if (
    !arraysEqual(
      frozenDocumentKinds,
      currentRequiredDocumentKinds,
    )
  ) {
    throw new ClaimSubmissionRouteError(
      "The claim-specific document requirements changed after pre-filing approval. Prepare and independently approve a new filing package before recording submission.",
      409,
    );
  }
}

/* ========================================================================== */
/* Filing destination gate                                                     */
/* ========================================================================== */

async function resolveOperationalFilingDestination(
  jurisdictionPackage:
    ResolvedSubmissionContext["jurisdictionPackage"],
  claimMethod: string,
): Promise<
  JurisdictionFilingDestination
> {
  const submissionMethod =
    normalizeJurisdictionFilingMethod(
      claimMethod,
    );

  if (!submissionMethod) {
    throw new ClaimSubmissionRouteError(
      `The approved jurisdiction claim method "${claimMethod}" is not mapped to a supported DueQuity filing-destination method. External submission is blocked.`,
      409,
    );
  }

  try {
    return await requireOperationalJurisdictionFilingDestination({
      jurisdictionPackageId:
        jurisdictionPackage.id,

      jurisdictionPackageVersion:
        jurisdictionPackage.version,

      submissionMethod,
    });
  } catch (error) {
    throw new ClaimSubmissionRouteError(
      error instanceof Error
        ? error.message
        : "A complete verified operational filing destination is required before an external submission may be recorded.",
      409,
    );
  }
}

/* ========================================================================== */
/* Context                                                                     */
/* ========================================================================== */

async function resolveSubmissionContext(
  claimId: string,
  session: StaffSession,
): Promise<
  ResolvedSubmissionContext
> {
  requireSubmissionPermission(
    session,
  );

  const resolved =
    await resolveClaimRecord(
      claimId,
    );

  if (!resolved) {
    throw new ClaimSubmissionRouteError(
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

  const jurisdiction =
    jurisdictionPackage?.rule;

  if (
    !jurisdictionPackage ||
    !jurisdiction
  ) {
    throw new ClaimSubmissionRouteError(
      "No current approved jurisdiction rule is published for this claim.",
      409,
    );
  }

  if (
    !clearedForState(
      session,
      jurisdictionPackage
        .stateCode,
    )
  ) {
    throw new ClaimSubmissionRouteError(
      `You are not cleared to work on claims in ${jurisdictionPackage.stateCode}.`,
      403,
    );
  }

  if (
    jurisdiction
      .attorneyRequired
  ) {
    throw new ClaimSubmissionRouteError(
      "The current jurisdiction requires an attorney workflow. The ordinary administrative claim-submission route is blocked.",
      409,
    );
  }

  const paymentRouting =
    jurisdictionPackage
      .paymentRouting;

  if (!paymentRouting) {
    throw new ClaimSubmissionRouteError(
      "The current jurisdiction does not contain a frozen payment-routing determination.",
      409,
    );
  }

  assertPaymentRouteOperational(
    paymentRouting,
  );

  const readiness =
    await resolvePersistedClaimFilingReadiness(
      claim,
      jurisdiction,
      currentIsoDate(),
    );

  if (
    !readiness.readyToPrepare
  ) {
    throw new ClaimSubmissionRouteError(
      `The claim no longer satisfies current filing readiness. ${readiness.nextInternalAction}`,
      409,
    );
  }

  const filingPackage =
    await getCurrentClaimFilingPackage(
      claim.id,
    );

  if (!filingPackage) {
    throw new ClaimSubmissionRouteError(
      "No current filing package exists for this claim.",
      409,
    );
  }

  assertApprovedPackageMatchesCurrentRules({
    filingPackage,

    jurisdictionPackage,

    jurisdiction,

    paymentRouting,

    readiness,
  });

  const filingDestination =
    await resolveOperationalFilingDestination(
      jurisdictionPackage,
      jurisdiction.claimMethod,
    );

  const routeMode =
    resolveRouteMode(
      paymentRouting,
    );

  return {
    session,

    actorUserId:
      session.user.id,

    claim,

    jurisdictionPackage,

    jurisdiction,

    paymentRouting,

    readiness,

    filingPackage,

    routeMode,

    filingDestination,
  };
}

/* ========================================================================== */
/* Response                                                                    */
/* ========================================================================== */

async function submissionStateResponse(
  claimId: string,
  session: StaffSession,
) {
  const context =
    await resolveSubmissionContext(
      claimId,
      session,
    );

  const {
    claim,
    jurisdiction,
    paymentRouting,
    filingPackage,
    routeMode,
    actorUserId,
    filingDestination,
  } =
    context;

  const [
    submission,
    audit,
  ] =
    await Promise.all([
      getClaimSubmissionByClaimId(
        claim.id,
      ),

      claimSubmissionAudit(
        claim.id,
      ),
    ]);

  const canRecordSubmission =
    !submission;

  const canRecordAcknowledgment =
    Boolean(
      submission,
    ) &&
    submission?.status ===
      "submitted";

  return {
    ok:
      true,

    claim: {
      id:
        claim.id,

      reference:
        claim.reference,
    },

    filingPackage: {
      id:
        filingPackage.id,

      version:
        filingPackage.version,

      status:
        filingPackage.status,

      snapshotHash:
        filingPackage.snapshotHash,

      preFilingApprovedAt:
        filingPackage
          .preFilingApprovedAt,
    },

    route: {
      mode:
        routeMode,

      filingParty:
        routeMode ===
        "claimant_controlled"
          ? "claimant"
          : "authorized_representative",

      agencyName:
        jurisdiction.agencyName,

      custodian:
        jurisdiction.custodian,

      submissionMethod:
        jurisdiction.claimMethod,

      representativeMayFile:
        paymentRouting
          .representativeMayFile,

      representativeMayReceivePayment:
        paymentRouting
          .representativeMayReceivePayment,

      paymentRoute:
        paymentRouting
          .paymentRoute,

      launchTrack:
        paymentRouting
          .launchTrack,

      feeCollectionMethod:
        paymentRouting
          .feeCollectionMethod,
    },

    filingDestination: {
      id:
        filingDestination.id,

      version:
        filingDestination
          .destinationVersion,

      submissionMethod:
        filingDestination
          .submissionMethod,

      agencyName:
        filingDestination
          .agencyName,

      departmentName:
        filingDestination
          .departmentName,

      attentionLine:
        filingDestination
          .attentionLine,

      filingEmail:
        filingDestination
          .filingEmail,

      mailingAddress:
        filingDestination
          .mailingAddress,

      physicalAddress:
        filingDestination
          .physicalAddress,

      portalUrl:
        filingDestination
          .portalUrl,

      phone:
        filingDestination
          .phone,

      filingInstructions:
        filingDestination
          .filingInstructions,

      officialSourceUrl:
        filingDestination
          .officialSourceUrl,

      officialSourceTitle:
        filingDestination
          .officialSourceTitle,

      verifiedAt:
        filingDestination
          .verifiedAt,
    },

    permissions: {
      actorUserId,

      mayRecordSubmission:
        canRecordSubmission,

      mayRecordAcknowledgment:
        canRecordAcknowledgment,
    },

    submission:
      submission ??
      null,

    audit,
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
      id: string;
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
      await submissionStateResponse(
        id,
        session,
      ),
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Claim-submission state could not be loaded.",
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
      id: string;
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
      ClaimSubmissionActionBody;

    try {
      body =
        (await request.json()) as
          ClaimSubmissionActionBody;
    } catch {
      return errorResponse(
        "Invalid JSON request.",
        400,
      );
    }

    if (!body.action) {
      return errorResponse(
        "Claim-submission action is required.",
        400,
      );
    }

    const submissionContext =
      await resolveSubmissionContext(
        id,
        session,
      );

    const {
      claim,
      jurisdiction,
      filingPackage,
      routeMode,
      actorUserId,
      filingDestination,
    } =
      submissionContext;

    const existingSubmission =
      await getClaimSubmissionByClaimId(
        claim.id,
      );

    /* ====================================================================== */
    /* Record real-world external submission                                  */
    /* ====================================================================== */

    if (
      body.action ===
      "record_submission"
    ) {
      if (
        existingSubmission
      ) {
        return errorResponse(
          "An external submission has already been recorded for this claim.",
          409,
        );
      }

      const submittedAt =
        requiredString(
          body.submittedAt,
          "Submitted at",
        );

      await recordClaimSubmission({
        claimId:
          claim.id,

        claimReference:
          claim.reference,

        filingPackageId:
          filingPackage.id,

        filingPackageVersion:
          filingPackage.version,

        routeMode,

        filingParty:
          routeMode ===
          "claimant_controlled"
            ? "claimant"
            : "authorized_representative",

        authorityName:
          jurisdiction.agencyName,

        custodian:
          jurisdiction.custodian,

        submissionMethod:
          jurisdiction.claimMethod,

        filingDestinationId:
          filingDestination.id,

        submittedAt,

        actorUserId,

        externalReference:
          optionalText(
            body.externalReference,
          ),

        submissionNote:
          optionalText(
            body.submissionNote,
          ),
      });

      return NextResponse.json(
        await submissionStateResponse(
          claim.id,
          session,
        ),
      );
    }

    /* ====================================================================== */
    /* Record authority acknowledgment                                        */
    /* ====================================================================== */

    if (
      body.action ===
      "record_acknowledgment"
    ) {
      if (
        !existingSubmission
      ) {
        return errorResponse(
          "Record the external submission before recording authority acknowledgment.",
          409,
        );
      }

      if (
        existingSubmission
          .status ===
        "acknowledged"
      ) {
        return NextResponse.json(
          await submissionStateResponse(
            claim.id,
            session,
          ),
        );
      }

      const acknowledgedAt =
        requiredString(
          body.acknowledgedAt,
          "Acknowledged at",
        );

      await recordClaimSubmissionAcknowledgment({
        submissionId:
          existingSubmission.id,

        acknowledgedAt,

        actorUserId,

        externalReference:
          optionalText(
            body.externalReference,
          ),

        acknowledgmentSummary:
          optionalText(
            body.acknowledgmentSummary,
          ),
      });

      return NextResponse.json(
        await submissionStateResponse(
          claim.id,
          session,
        ),
      );
    }

    return errorResponse(
      "Unsupported claim-submission action.",
      400,
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Claim-submission action failed.",
      409,
    );
  }
}