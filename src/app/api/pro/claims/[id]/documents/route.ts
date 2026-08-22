import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import type {
  DocumentKind,
  DocumentRequest,
  IsoDate,
  Permission,
  StoredDocument,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
  type StaffSession,
} from "@/lib/session";

import {
  CLAIM_DOCUMENT_STORAGE_BUCKET,
  getClaimDocument,
  isInternalWorkflowDocumentKind,
  listClaimDocumentRequests,
  listClaimDocuments,
  registerClaimDocumentUpload,
  reviewClaimDocument,
  syncClaimDocumentRequests,
} from "@/server/claim-document-store";

import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";

import { resolvePersistedClaimFilingReadiness } from "@/server/claim-filing-readiness";

import { resolveClaimRecord } from "@/server/claim-record";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { getSupabaseAdmin } from "@/server/supabase-admin";

import { resolveStaffSession } from "@/server/staff-session";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/**
 * PERSISTED CLAIM DOCUMENT API
 *
 * GET
 *   Pure read endpoint.
 *
 * POST multipart/form-data
 *   Uploads a current agency-required document or supported internal document.
 *
 * POST application/json
 *   Performs human document review.
 *
 * Claim-specific document requirements remain subordinate to the approved
 * jurisdiction rule.
 *
 * Where a jurisdiction records probate documents as required only when the
 * former owner is deceased, those estate documents do not become live Claim
 * requirements until the Claim carries a deceased-owner or probate-required
 * flag.
 */

/* ========================================================================== */
/* Limits                                                                      */
/* ========================================================================== */

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const FILE_EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/* ========================================================================== */
/* JSON actions                                                                */
/* ========================================================================== */

type DocumentAction =
  | "accept_document"
  | "reject_document";

interface DocumentActionBody {
  action?: DocumentAction;
  documentId?: string;
  rejectionReason?: string;
}

/* ========================================================================== */
/* Route errors                                                                */
/* ========================================================================== */

class DocumentRouteError extends Error {
  status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);

    this.name =
      "DocumentRouteError";

    this.status =
      status;
  }
}

/* ========================================================================== */
/* Responses                                                                   */
/* ========================================================================== */

function errorResponse(
  message: string,
  status = 400,
) {
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

function routeErrorResponse(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 409,
) {
  if (
    error instanceof
    DocumentRouteError
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
    .slice(0, 10) as IsoDate;
}

function requiredString(
  value: string | undefined,
  label: string,
): string {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new DocumentRouteError(
      `${label} is required.`,
      400,
    );
  }

  return normalized;
}

function safePathPart(
  value: string,
): string {
  return value.replace(
    /[^a-zA-Z0-9_-]/g,
    "-",
  );
}

function safeOriginalFileName(
  value: string,
): string {
  const pieces =
    value.split(/[\\/]/);

  const lastPiece =
    pieces[
      pieces.length - 1
    ] ?? "";

  const base =
    lastPiece
      .replace(
        /[\u0000-\u001f\u007f]/g,
        "",
      )
      .replace(
        /[<>:"/\\|?*]/g,
        "_",
      )
      .trim();

  if (!base) {
    return "uploaded-document";
  }

  return base.slice(
    0,
    180,
  );
}

function documentTitle(
  kind: DocumentKind,
): string {
  switch (kind) {
    case "government_id":
      return "Government ID";

    case "proof_of_former_ownership":
      return "Proof of former ownership";

    case "affidavit_of_entitlement":
      return "Affidavit of entitlement";

    case "fee_agreement":
      return "Duequity service agreement";

    case "w9":
      return "W-9";

    default:
      return kind
        .replaceAll(
          "_",
          " ",
        )
        .replace(
          /\b\w/g,
          (character) =>
            character.toUpperCase(),
        );
  }
}

function fileContentMatchesMimeType(
  buffer: Buffer,
  mimeType: string,
): boolean {
  if (
    mimeType ===
    "application/pdf"
  ) {
    return (
      buffer.length >= 5 &&
      buffer
        .subarray(
          0,
          5,
        )
        .toString(
          "ascii",
        ) === "%PDF-"
    );
  }

  if (
    mimeType ===
    "image/jpeg"
  ) {
    return (
      buffer.length >= 3 &&
      buffer[0] ===
        0xff &&
      buffer[1] ===
        0xd8 &&
      buffer[2] ===
        0xff
    );
  }

  if (
    mimeType ===
    "image/png"
  ) {
    const signature = [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ];

    return (
      buffer.length >=
        signature.length &&
      signature.every(
        (
          byte,
          index,
        ) =>
          buffer[index] ===
          byte,
      )
    );
  }

  if (
    mimeType ===
    "image/webp"
  ) {
    return (
      buffer.length >= 12 &&
      buffer
        .subarray(
          0,
          4,
        )
        .toString(
          "ascii",
        ) === "RIFF" &&
      buffer
        .subarray(
          8,
          12,
        )
        .toString(
          "ascii",
        ) === "WEBP"
    );
  }

  return false;
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function requirePermission(
  session: StaffSession,
  permission: Permission,
  message: string,
): void {
  if (
    !can(
      session,
      permission,
    )
  ) {
    throw new DocumentRouteError(
      message,
      403,
    );
  }
}

function requireDocumentRead(
  session: StaffSession,
): void {
  requirePermission(
    session,
    "claim.read",
    "You do not have permission to read this Claim.",
  );

  requirePermission(
    session,
    "claimant.read",
    "You do not have permission to read claimant information for this Claim.",
  );

  requirePermission(
    session,
    "document.read",
    "You do not have permission to read Claim documents.",
  );
}

function requireDocumentUpload(
  session: StaffSession,
): void {
  requireDocumentRead(
    session,
  );

  requirePermission(
    session,
    "claim.write",
    "You do not have permission to upload documents to this Claim.",
  );
}

function requireDocumentReview(
  session: StaffSession,
): void {
  requireDocumentRead(
    session,
  );

  requirePermission(
    session,
    "claim.write",
    "You do not have permission to change this Claim's document workflow.",
  );

  requirePermission(
    session,
    "document.review",
    "You do not have permission to accept or reject Claim documents.",
  );
}

/* ========================================================================== */
/* Context                                                                     */
/* ========================================================================== */

async function resolveDocumentContext(
  claimId: string,
  session: StaffSession,
) {
  const resolved =
    await resolveClaimRecord(
      claimId,
    );

  if (!resolved) {
    throw new DocumentRouteError(
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
        (rulePackage) =>
          rulePackage.status ===
            "approved" &&
          rulePackage.rule?.id ===
            claim.jurisdictionId,
      )
      .slice()
      .sort(
        (left, right) =>
          right.version -
          left.version,
      )[0];

  const jurisdiction =
    jurisdictionPackage?.rule;

  if (
    !jurisdictionPackage ||
    !jurisdiction
  ) {
    throw new DocumentRouteError(
      "No current approved jurisdiction rule is published for this Claim.",
      409,
    );
  }

  if (
    !clearedForState(
      session,
      jurisdictionPackage.stateCode,
    )
  ) {
    throw new DocumentRouteError(
      `You are not cleared to work on Claims in ${jurisdictionPackage.stateCode}.`,
      403,
    );
  }

  const onboarding =
    await getClaimantOnboarding(
      claim.id,
    );

  const filingReadiness =
    await resolvePersistedClaimFilingReadiness(
      claim,
      jurisdiction,
      currentIsoDate(),
    );

  return {
    claim,
    jurisdictionPackage,
    jurisdiction,
    onboarding,
    filingReadiness,
    actorUserId:
      session.user.id,
  };
}

/* ========================================================================== */
/* Claim-specific required documents                                           */
/* ========================================================================== */

function requiredAgencyDocumentKinds(
  context: Awaited<
    ReturnType<
      typeof resolveDocumentContext
    >
  >,
): DocumentKind[] {
  const estateHandlingRequired =
    context.jurisdiction
      .probateRequiredWhenDeceased &&
    context.claim.flags.some(
      (flag) =>
        flag.kind ===
          "deceased_owner" ||
        flag.kind ===
          "probate_required",
    );

  return context.jurisdiction.requiredDocuments.filter(
    (kind) => {
      if (
        isInternalWorkflowDocumentKind(
          kind,
        )
      ) {
        return false;
      }

      if (
        kind ===
          "letters_of_administration" &&
        !estateHandlingRequired
      ) {
        return false;
      }

      return true;
    },
  );
}

/* ========================================================================== */
/* Operational advancement gate                                                */
/* ========================================================================== */

function assertDocumentWorkflowMayAdvance(
  filingReadiness: Awaited<
    ReturnType<
      typeof resolvePersistedClaimFilingReadiness
    >
  >,
): void {
  if (
    !filingReadiness.jurisdictionClear
  ) {
    throw new DocumentRouteError(
      `Document workflow is blocked by the current jurisdiction rule. ${filingReadiness.nextInternalAction}`,
      409,
    );
  }

  if (
    !filingReadiness.startupGreenLaneClear
  ) {
    throw new DocumentRouteError(
      `Document workflow is blocked because this Claim is outside Duequity's Startup Green Lane. ${filingReadiness.nextInternalAction}`,
      409,
    );
  }

  if (
    !filingReadiness.legalClear
  ) {
    throw new DocumentRouteError(
      `Document workflow is blocked because this Claim is not currently cleared for straightforward administrative handling. ${filingReadiness.nextInternalAction}`,
      409,
    );
  }

  if (
    !filingReadiness.deadlineClear
  ) {
    throw new DocumentRouteError(
      "Document workflow is blocked because the recorded filing deadline has expired.",
      409,
    );
  }
}

/* ========================================================================== */
/* Pure current request view                                                   */
/* ========================================================================== */

function currentRequestView(
  claimId: string,
  requiredKinds: DocumentKind[],
  persistedRequests: DocumentRequest[],
  documents: StoredDocument[],
) {
  const requests: DocumentRequest[] =
    [];

  const acceptedRequiredRequests: DocumentRequest[] =
    [];

  const outstandingRequiredRequests: DocumentRequest[] =
    [];

  for (
    const kind of
    requiredKinds
  ) {
    const persisted =
      persistedRequests.find(
        (request) =>
          request.claimId ===
            claimId &&
          request.kind ===
            kind &&
          request.required,
      );

    const viewRequest: DocumentRequest =
      persisted
        ? {
            ...persisted,
          }
        : {
            id:
              `doc-request-view-${safePathPart(
                claimId,
              )}-${kind}`,

            claimId,

            kind,

            reason:
              `Required by the current approved jurisdiction workflow for ${kind.replaceAll(
                "_",
                " ",
              )}.`,

            requestedAt:
              currentIsoDate(),

            required: true,

            status:
              "outstanding",

            guidance:
              `Provide a clear, complete copy of the required ${kind.replaceAll(
                "_",
                " ",
              )} document.`,
          };

    const acceptedEvidence =
      viewRequest.status ===
        "accepted" &&
      Boolean(
        viewRequest.fulfilledByDocumentId,
      )
        ? documents.find(
            (document) =>
              document.id ===
                viewRequest.fulfilledByDocumentId &&
              document.claimId ===
                claimId &&
              document.kind ===
                kind &&
              document.status ===
                "accepted",
          )
        : undefined;

    if (
      viewRequest.status ===
        "accepted" &&
      !acceptedEvidence
    ) {
      viewRequest.status =
        "outstanding";

      viewRequest.fulfilledByDocumentId =
        undefined;
    }

    requests.push(
      viewRequest,
    );

    if (
      acceptedEvidence
    ) {
      acceptedRequiredRequests.push(
        viewRequest,
      );
    } else {
      outstandingRequiredRequests.push(
        viewRequest,
      );
    }
  }

  return {
    requests,

    readiness: {
      claimId,

      requiredRequests:
        requests,

      acceptedRequiredRequests,

      outstandingRequiredRequests,

      requiredCount:
        requests.length,

      acceptedCount:
        acceptedRequiredRequests.length,

      outstandingCount:
        outstandingRequiredRequests.length,

      complete:
        outstandingRequiredRequests.length ===
        0,
    },
  };
}

/* ========================================================================== */
/* Current document response                                                   */
/* ========================================================================== */

async function documentResponse(
  context: Awaited<
    ReturnType<
      typeof resolveDocumentContext
    >
  >,
  session: StaffSession,
) {
  const [
    persistedRequests,
    allDocuments,
  ] = await Promise.all([
    listClaimDocumentRequests(
      context.claim.id,
    ),

    listClaimDocuments(
      context.claim.id,
    ),
  ]);

  const requiredDocumentKinds =
    requiredAgencyDocumentKinds(
      context,
    );

  const {
    requests,
    readiness,
  } = currentRequestView(
    context.claim.id,
    requiredDocumentKinds,
    persistedRequests,
    allDocuments,
  );

  const mayReadRestricted =
    can(
      session,
      "document.read_restricted",
    );

  const documents =
    allDocuments.filter(
      (document) =>
        document.sensitivity !==
          "restricted" ||
        mayReadRestricted,
    );

  const internalWorkflowDocuments =
    documents.filter(
      (document) =>
        isInternalWorkflowDocumentKind(
          document.kind,
        ),
    );

  return {
    ok: true,

    requests,

    documents,

    readiness,

    internalWorkflow: {
      supportedKinds: [
        "fee_agreement",
      ] satisfies DocumentKind[],

      documents:
        internalWorkflowDocuments,
    },

    permissions: {
      mayUpload:
        can(
          session,
          "claim.write",
        ),

      mayReview:
        can(
          session,
          "claim.write",
        ) &&
        can(
          session,
          "document.review",
        ),

      mayReadRestricted,
    },

    claim: {
      id:
        context.claim.id,

      reference:
        context.claim.reference,

      jurisdictionId:
        context.claim.jurisdictionId,
    },

    claimant:
      context.onboarding
        ? {
            id:
              context.onboarding.claimant.id,

            legalName:
              context.onboarding.claimant.legalName,
          }
        : null,

    jurisdiction: {
      id:
        context.jurisdiction.id,

      agencyName:
        context.jurisdiction.agencyName,

      stateCode:
        context.jurisdictionPackage.stateCode,

      packageVersion:
        context.jurisdictionPackage.version,

      legalRuleVersion:
        context.jurisdiction.legalRuleVersion ??
        null,

      requiredDocumentKinds,
    },

    filingGate: {
      jurisdictionClear:
        context.filingReadiness.jurisdictionClear,

      startupGreenLaneClear:
        context.filingReadiness.startupGreenLaneClear,

      legalClear:
        context.filingReadiness.legalClear,

      deadlineClear:
        context.filingReadiness.deadlineClear,

      nextInternalAction:
        context.filingReadiness.nextInternalAction,
    },
  };
}

/* ========================================================================== */
/* Synchronize current agency requests before a mutation                        */
/* ========================================================================== */

async function reconcileCurrentAgencyRequests(
  context: Awaited<
    ReturnType<
      typeof resolveDocumentContext
    >
  >,
) {
  const requiredKinds =
    requiredAgencyDocumentKinds(
      context,
    );

  await syncClaimDocumentRequests({
    claimId:
      context.claim.id,

    requiredKinds,

    requestedFromClaimantId:
      context.onboarding?.claimant.id,

    requestedAt:
      currentIsoDate(),

    actorUserId:
      context.actorUserId,

    occurredAt:
      new Date().toISOString(),
  });
}

/* ========================================================================== */
/* Storage                                                                     */
/* ========================================================================== */

async function uploadPrivateDocument(
  storageKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } = await supabase.storage
    .from(
      CLAIM_DOCUMENT_STORAGE_BUCKET,
    )
    .upload(
      storageKey,
      buffer,
      {
        contentType:
          mimeType,

        upsert:
          false,
      },
    );

  if (error) {
    throw new DocumentRouteError(
      `Document could not be stored securely: ${error.message}`,
      500,
    );
  }
}

async function removePrivateDocument(
  storageKey: string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } = await supabase.storage
    .from(
      CLAIM_DOCUMENT_STORAGE_BUCKET,
    )
    .remove([
      storageKey,
    ]);

  if (error) {
    console.error(
      "Unable to remove orphaned Claim document from private storage.",
      {
        storageKey,

        error:
          error.message,
      },
    );
  }
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
    requireDocumentRead(
      session,
    );

    const resolved =
      await resolveDocumentContext(
        id,
        session,
      );

    return NextResponse.json(
      await documentResponse(
        resolved,
        session,
      ),
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Claim documents could not be loaded.",
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
    const contentType =
      request.headers.get(
        "content-type",
      ) ?? "";

    if (
      contentType.includes(
        "multipart/form-data",
      )
    ) {
      requireDocumentUpload(
        session,
      );

      const resolved =
        await resolveDocumentContext(
          id,
          session,
        );

      assertDocumentWorkflowMayAdvance(
        resolved.filingReadiness,
      );

      const formData =
        await request.formData();

      const fileValue =
        formData.get(
          "file",
        );

      const kindValue =
        formData.get(
          "kind",
        );

      if (
        !(
          fileValue instanceof
          File
        )
      ) {
        return errorResponse(
          "A document file is required.",
        );
      }

      if (
        typeof kindValue !==
        "string"
      ) {
        return errorResponse(
          "Document kind is required.",
        );
      }

      const kind =
        kindValue as DocumentKind;

      const currentRequiredKinds =
        requiredAgencyDocumentKinds(
          resolved,
        );

      const agencyRequired =
        currentRequiredKinds.includes(
          kind,
        );

      const internalWorkflowDocument =
        isInternalWorkflowDocumentKind(
          kind,
        );

      if (
        !agencyRequired &&
        !internalWorkflowDocument
      ) {
        return errorResponse(
          "This document kind is neither required by the current Claim workflow nor supported as Duequity internal workflow evidence.",
          409,
        );
      }

      if (
        internalWorkflowDocument
      ) {
        requirePermission(
          session,
          "fee_agreement.write",
          "You do not have permission to upload Duequity service-agreement evidence.",
        );
      } else {
        await reconcileCurrentAgencyRequests(
          resolved,
        );
      }

      if (
        fileValue.size <= 0
      ) {
        return errorResponse(
          "The uploaded file is empty.",
        );
      }

      if (
        fileValue.size >
        MAX_UPLOAD_BYTES
      ) {
        return errorResponse(
          "The uploaded file exceeds the 15 MB limit.",
        );
      }

      const mimeType =
        fileValue.type
          .trim()
          .toLowerCase();

      if (
        !ALLOWED_MIME_TYPES.has(
          mimeType,
        )
      ) {
        return errorResponse(
          "Only PDF, JPEG, PNG and WebP files are accepted.",
        );
      }

      const extension =
        FILE_EXTENSION_BY_MIME[
          mimeType
        ];

      if (!extension) {
        return errorResponse(
          "The uploaded file type could not be mapped to a safe storage extension.",
        );
      }

      const arrayBuffer =
        await fileValue.arrayBuffer();

      const buffer =
        Buffer.from(
          arrayBuffer,
        );

      if (
        buffer.length !==
        fileValue.size
      ) {
        return errorResponse(
          "The uploaded file size did not match the received file content.",
          400,
        );
      }

      if (
        !fileContentMatchesMimeType(
          buffer,
          mimeType,
        )
      ) {
        return errorResponse(
          "The uploaded file content does not match its declared file type.",
          400,
        );
      }

      const claimDirectoryName =
        safePathPart(
          resolved.claim.id,
        );

      const fileName =
        `${randomUUID()}${extension}`;

      const storageKey =
        `${claimDirectoryName}/${fileName}`;

      await uploadPrivateDocument(
        storageKey,
        buffer,
        mimeType,
      );

      try {
        await registerClaimDocumentUpload({
          claimId:
            resolved.claim.id,

          claimantId:
            resolved.onboarding?.claimant.id,

          kind,

          title:
            documentTitle(
              kind,
            ),

          originalFileName:
            safeOriginalFileName(
              fileValue.name,
            ),

          mimeType,

          byteSize:
            buffer.length,

          storageKey,

          uploadedByUserId:
            resolved.actorUserId,

          uploadedAt:
            new Date().toISOString(),

          actorUserId:
            resolved.actorUserId,
        });
      } catch (error) {
        await removePrivateDocument(
          storageKey,
        );

        throw error;
      }

      const refreshed =
        await resolveDocumentContext(
          resolved.claim.id,
          session,
        );

      return NextResponse.json(
        await documentResponse(
          refreshed,
          session,
        ),
      );
    }

    if (
      contentType.includes(
        "application/json",
      )
    ) {
      requireDocumentReview(
        session,
      );

      let body:
        DocumentActionBody;

      try {
        body =
          (await request.json()) as DocumentActionBody;
      } catch {
        return errorResponse(
          "Invalid JSON request.",
        );
      }

      if (
        !body.action
      ) {
        return errorResponse(
          "Document action is required.",
        );
      }

      const resolved =
        await resolveDocumentContext(
          id,
          session,
        );

      assertDocumentWorkflowMayAdvance(
        resolved.filingReadiness,
      );

      const documentId =
        requiredString(
          body.documentId,
          "Document ID",
        );

      const document =
        await getClaimDocument(
          documentId,
        );

      if (!document) {
        throw new DocumentRouteError(
          "Document not found.",
          404,
        );
      }

      if (
        document.claimId !==
        resolved.claim.id
      ) {
        throw new DocumentRouteError(
          "The selected document does not belong to this Claim.",
          409,
        );
      }

      if (
        document.sensitivity ===
          "restricted" &&
        !can(
          session,
          "document.read_restricted",
        )
      ) {
        throw new DocumentRouteError(
          "You do not have permission to review restricted Claim documents.",
          403,
        );
      }

      const internalWorkflowDocument =
        isInternalWorkflowDocumentKind(
          document.kind,
        );

      const currentAgencyKind =
        requiredAgencyDocumentKinds(
          resolved,
        ).includes(
          document.kind,
        );

      if (
        body.action ===
          "accept_document" &&
        !internalWorkflowDocument &&
        !currentAgencyKind
      ) {
        return errorResponse(
          "This document kind is not a current filing requirement for this Claim.",
          409,
        );
      }

      if (
        internalWorkflowDocument
      ) {
        requirePermission(
          session,
          "fee_agreement.write",
          "You do not have permission to approve or reject Duequity service-agreement evidence.",
        );
      } else {
        await reconcileCurrentAgencyRequests(
          resolved,
        );
      }

      if (
        body.action ===
          "accept_document"
      ) {
        await reviewClaimDocument({
          documentId,

          decision:
            "accepted",

          reviewedByUserId:
            resolved.actorUserId,

          reviewedAt:
            new Date().toISOString(),

          actorUserId:
            resolved.actorUserId,
        });
      } else if (
        body.action ===
          "reject_document"
      ) {
        await reviewClaimDocument({
          documentId,

          decision:
            "rejected",

          reviewedByUserId:
            resolved.actorUserId,

          reviewedAt:
            new Date().toISOString(),

          rejectionReason:
            requiredString(
              body.rejectionReason,
              "Rejection reason",
            ),

          actorUserId:
            resolved.actorUserId,
        });
      } else {
        return errorResponse(
          "Unsupported document action.",
        );
      }

      const refreshed =
        await resolveDocumentContext(
          resolved.claim.id,
          session,
        );

      return NextResponse.json(
        await documentResponse(
          refreshed,
          session,
        ),
      );
    }

    return errorResponse(
      "Request must use multipart/form-data for an upload or application/json for document review.",
      415,
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Document action failed.",
      409,
    );
  }
}