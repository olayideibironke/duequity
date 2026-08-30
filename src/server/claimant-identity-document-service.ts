import "server-only";

import {
  randomUUID,
} from "node:crypto";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

export const CLAIMANT_IDENTITY_STORAGE_BUCKET =
  "claim-documents";

export const CLAIMANT_IDENTITY_MAX_BYTES =
  15 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type GovernmentIdType =
  | "drivers_license"
  | "us_passport"
  | "state_id"
  | "other_government_photo_id";

export type ClaimantIdentityVerificationStatus =
  | "not_started"
  | "documents_requested"
  | "under_review"
  | "verified"
  | "failed"
  | "manual_review";

export type ClaimantIdentityDocumentStatus =
  | "requested"
  | "uploaded"
  | "scanning"
  | "under_review"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

export type ClaimantIdentitySafetyStatus =
  | "pending"
  | "clean"
  | "rejected"
  | "unsafe";

export type ClaimantIdentityRecordKind =
  | "claim"
  | "assigned_lead";

export interface ClaimantIdentityDocumentView {
  id:
    string;

  governmentIdType:
    GovernmentIdType;

  governmentIdTypeLabel:
    string;

  originalFileName?:
    string;

  mimeType:
    string;

  byteSize:
    number;

  status:
    ClaimantIdentityDocumentStatus;

  safetyStatus:
    ClaimantIdentitySafetyStatus;

  uploadedAt:
    string;

  reviewedAt?:
    string;

  rejectionReason?:
    string;
}

export interface ClaimantIdentityDocumentState {
  claimantId:
    string;

  claimantReference:
    string;

  claimId:
    string;

  claimReference:
    string;

  legalName:
    string;

  recordKind?:
    ClaimantIdentityRecordKind;

  workcaseId?:
    string;

  identityVerification:
    ClaimantIdentityVerificationStatus;

  identityVerifiedAt?:
    string;

  request: {
    id:
      string;

    status:
      | "outstanding"
      | "received"
      | "accepted"
      | "waived"
      | "overdue";

    required:
      boolean;

    guidance?:
      string;
  } | null;

  documents:
    ClaimantIdentityDocumentView[];

  latestDocument?:
    ClaimantIdentityDocumentView;

  mayUpload:
    boolean;

  uploadBlockReason?:
    string;
}

export interface UploadClaimantGovernmentIdInput {
  claimantId:
    string;

  governmentIdType:
    GovernmentIdType;

  originalFileName:
    string;

  mimeType:
    string;

  buffer:
    Buffer;
}

/* ========================================================================== */
/* Legacy Claim database rows                                                  */
/* ========================================================================== */

interface ClaimantIdentityRow {
  claim_id:
    string;

  claim_reference:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  legal_name:
    string;

  identity_verification:
    ClaimantIdentityVerificationStatus;

  identity_verified_at:
    string | null;
}

interface GovernmentIdRequestRow {
  id:
    string;

  status:
    | "outstanding"
    | "received"
    | "accepted"
    | "waived"
    | "overdue";

  required:
    boolean;

  requested_from_claimant_id:
    string | null;

  guidance:
    string | null;
}

interface GovernmentIdDocumentRow {
  id:
    string;

  government_id_type:
    GovernmentIdType;

  original_file_name:
    string | null;

  mime_type:
    string;

  byte_size:
    number | string;

  status:
    ClaimantIdentityDocumentStatus;

  malware_scan_status:
    ClaimantIdentitySafetyStatus;

  uploaded_at:
    string;

  reviewed_at:
    string | null;

  rejection_reason:
    string | null;
}

/* ========================================================================== */
/* Assigned-lead pre-Claim database rows                                       */
/* ========================================================================== */

interface AssignedLeadWorkcaseRow {
  id:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  legal_first_name:
    string;

  legal_last_name:
    string;

  auth_user_id:
    string | null;

  status:
    string;

  linked_claim_id:
    string | null;
}

interface AssignedLeadIdentityProfileRow {
  workcase_id:
    string;

  claimant_id:
    string;

  identity_verification:
    ClaimantIdentityVerificationStatus;

  identity_verified_at:
    string | null;
}

interface AssignedLeadDocumentRequestRow {
  id:
    string;

  status:
    | "outstanding"
    | "received"
    | "accepted"
    | "overdue";

  required:
    boolean;

  guidance:
    string | null;
}

interface AssignedLeadDocumentRow {
  id:
    string;

  government_id_type:
    GovernmentIdType;

  original_file_name:
    string | null;

  mime_type:
    string;

  byte_size:
    number | string;

  status:
    ClaimantIdentityDocumentStatus;

  malware_scan_status:
    ClaimantIdentitySafetyStatus;

  uploaded_at:
    string;

  reviewed_at:
    string | null;

  rejection_reason:
    string | null;
}

/* ========================================================================== */
/* Internal identity context                                                   */
/* ========================================================================== */

interface ClaimBackedIdentityContext {
  kind:
    "claim";

  claimantId:
    string;

  claimantReference:
    string;

  claimId:
    string;

  claimReference:
    string;

  legalName:
    string;

  identityVerification:
    ClaimantIdentityVerificationStatus;

  identityVerifiedAt:
    string | null;
}

interface AssignedLeadIdentityContext {
  kind:
    "assigned_lead";

  claimantId:
    string;

  claimantReference:
    string;

  workcaseId:
    string;

  legalName:
    string;

  authUserId:
    string;

  identityVerification:
    ClaimantIdentityVerificationStatus;

  identityVerifiedAt:
    string | null;
}

type ClaimantIdentityContext =
  | ClaimBackedIdentityContext
  | AssignedLeadIdentityContext;

/* ========================================================================== */
/* Labels                                                                      */
/* ========================================================================== */

export function governmentIdTypeLabel(
  type:
    GovernmentIdType,
): string {
  switch (
    type
  ) {
    case "drivers_license":
      return "Driver's License";

    case "us_passport":
      return "U.S. Passport";

    case "state_id":
      return "State ID";

    case "other_government_photo_id":
      return "Other government-issued photo ID";
  }
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

export function isGovernmentIdType(
  value:
    unknown,
): value is GovernmentIdType {
  return (
    value ===
      "drivers_license" ||
    value ===
      "us_passport" ||
    value ===
      "state_id" ||
    value ===
      "other_government_photo_id"
  );
}

function safeOriginalFileName(
  value:
    string,
): string {
  const trimmed =
    value
      .trim()
      .replace(
        /[^\w.\-() ]+/g,
        "_",
      )
      .slice(
        0,
        180,
      );

  return (
    trimmed ||
    "government-id"
  );
}

function safePathPart(
  value:
    string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/g,
    "-",
  );
}

function extensionForMimeType(
  mimeType:
    string,
): string {
  switch (
    mimeType
  ) {
    case "application/pdf":
      return ".pdf";

    case "image/jpeg":
      return ".jpg";

    case "image/png":
      return ".png";

    case "image/webp":
      return ".webp";

    default:
      throw new Error(
        "Unsupported government ID file type.",
      );
  }
}

function contentMatchesMimeType(
  buffer:
    Buffer,
  mimeType:
    string,
): boolean {
  if (
    mimeType ===
    "application/pdf"
  ) {
    return (
      buffer.length >=
        5 &&
      buffer
        .subarray(
          0,
          5,
        )
        .toString(
          "ascii",
        ) ===
        "%PDF-"
    );
  }

  if (
    mimeType ===
    "image/jpeg"
  ) {
    return (
      buffer.length >=
        3 &&
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
    const pngSignature =
      Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]);

    return (
      buffer.length >=
        pngSignature.length &&
      buffer
        .subarray(
          0,
          pngSignature.length,
        )
        .equals(
          pngSignature,
        )
    );
  }

  if (
    mimeType ===
    "image/webp"
  ) {
    return (
      buffer.length >=
        12 &&
      buffer
        .subarray(
          0,
          4,
        )
        .toString(
          "ascii",
        ) ===
        "RIFF" &&
      buffer
        .subarray(
          8,
          12,
        )
        .toString(
          "ascii",
        ) ===
        "WEBP"
    );
  }

  return false;
}

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function documentFromLegacyRow(
  row:
    GovernmentIdDocumentRow,
): ClaimantIdentityDocumentView {
  return {
    id:
      row.id,

    governmentIdType:
      row.government_id_type,

    governmentIdTypeLabel:
      governmentIdTypeLabel(
        row.government_id_type,
      ),

    originalFileName:
      row.original_file_name ??
      undefined,

    mimeType:
      row.mime_type,

    byteSize:
      Number(
        row.byte_size,
      ),

    status:
      row.status,

    safetyStatus:
      row.malware_scan_status,

    uploadedAt:
      row.uploaded_at,

    reviewedAt:
      row.reviewed_at ??
      undefined,

    rejectionReason:
      row.rejection_reason ??
      undefined,
  };
}

function documentFromAssignedLeadRow(
  row:
    AssignedLeadDocumentRow,
): ClaimantIdentityDocumentView {
  return {
    id:
      row.id,

    governmentIdType:
      row.government_id_type,

    governmentIdTypeLabel:
      governmentIdTypeLabel(
        row.government_id_type,
      ),

    originalFileName:
      row.original_file_name ??
      undefined,

    mimeType:
      row.mime_type,

    byteSize:
      Number(
        row.byte_size,
      ),

    status:
      row.status,

    safetyStatus:
      row.malware_scan_status,

    uploadedAt:
      row.uploaded_at,

    reviewedAt:
      row.reviewed_at ??
      undefined,

    rejectionReason:
      row.rejection_reason ??
      undefined,
  };
}

/* ========================================================================== */
/* Identity context resolution                                                 */
/* ========================================================================== */

async function resolveClaimBackedIdentity(
  claimantId:
    string,
): Promise<
  ClaimBackedIdentityContext | null
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .select(
        "claim_id, claim_reference, claimant_id, claimant_reference, legal_name, identity_verification, identity_verified_at",
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve the claimant identity record: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    return null;
  }

  const row =
    data as
      ClaimantIdentityRow;

  return {
    kind:
      "claim",

    claimantId:
      row.claimant_id,

    claimantReference:
      row.claimant_reference,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    legalName:
      row.legal_name,

    identityVerification:
      row.identity_verification,

    identityVerifiedAt:
      row.identity_verified_at,
  };
}

async function resolveAssignedLeadIdentity(
  claimantId:
    string,
): Promise<
  AssignedLeadIdentityContext | null
> {
  const admin =
    getSupabaseAdmin();

  const {
    data:
      workcaseData,
    error:
      workcaseError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, claimant_id, claimant_reference, legal_first_name, legal_last_name, auth_user_id, status, linked_claim_id",
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .maybeSingle();

  if (
    workcaseError
  ) {
    throw new Error(
      `Unable to resolve the assigned claimant recovery: ${workcaseError.message}`,
    );
  }

  if (
    !workcaseData
  ) {
    return null;
  }

  const workcase =
    workcaseData as
      AssignedLeadWorkcaseRow;

  /*
   * Once bound to an official Claim, claimant_onboarding must become the
   * authoritative identity source. If that binding exists but the Claim-backed
   * claimant record cannot be resolved, fail closed rather than silently
   * continuing to use the pre-Claim identity repository.
   */
  if (
    workcase.status ===
      "bound_to_claim" ||
    workcase.linked_claim_id
  ) {
    throw new Error(
      "The claimant recovery is linked to an official Claim, but the Claim-backed identity record could not be resolved.",
    );
  }

  if (
    workcase.status !==
      "activated"
  ) {
    return null;
  }

  if (
    !workcase.auth_user_id
  ) {
    throw new Error(
      "The activated claimant recovery does not have a bound authentication identity.",
    );
  }

  const {
    data:
      profileData,
    error:
      profileError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_identity_profiles",
      )
      .select(
        "workcase_id, claimant_id, identity_verification, identity_verified_at",
      )
      .eq(
        "workcase_id",
        workcase.id,
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .maybeSingle();

  if (
    profileError
  ) {
    throw new Error(
      `Unable to resolve the claimant identity profile: ${profileError.message}`,
    );
  }

  if (
    !profileData
  ) {
    throw new Error(
      "The claimant identity profile has not been initialized.",
    );
  }

  const profile =
    profileData as
      AssignedLeadIdentityProfileRow;

  return {
    kind:
      "assigned_lead",

    claimantId:
      workcase.claimant_id,

    claimantReference:
      workcase.claimant_reference,

    workcaseId:
      workcase.id,

    legalName:
      [
        workcase.legal_first_name,
        workcase.legal_last_name,
      ]
        .filter(
          Boolean,
        )
        .join(
          " ",
        ),

    authUserId:
      workcase.auth_user_id,

    identityVerification:
      profile.identity_verification,

    identityVerifiedAt:
      profile.identity_verified_at,
  };
}

async function requireClaimantIdentityContext(
  claimantId:
    string,
): Promise<
  ClaimantIdentityContext
> {
  const normalizedClaimantId =
    claimantId.trim();

  if (
    !normalizedClaimantId
  ) {
    throw new Error(
      "Claimant identity is required.",
    );
  }

  const claimBacked =
    await resolveClaimBackedIdentity(
      normalizedClaimantId,
    );

  if (
    claimBacked
  ) {
    return claimBacked;
  }

  const assignedLead =
    await resolveAssignedLeadIdentity(
      normalizedClaimantId,
    );

  if (
    assignedLead
  ) {
    return assignedLead;
  }

  throw new Error(
    "The claimant identity record could not be resolved.",
  );
}

/* ========================================================================== */
/* Upload eligibility                                                          */
/* ========================================================================== */

function resolveUploadEligibility(
  input: {
    requestExists:
      boolean;

    requestRequired:
      boolean;

    requestBelongsToClaimant:
      boolean;

    identityVerification:
      ClaimantIdentityVerificationStatus;

    latestDocument?:
      ClaimantIdentityDocumentView;
  },
): {
  mayUpload:
    boolean;

  uploadBlockReason?:
    string;
} {
  if (
    !input.requestExists ||
    !input.requestRequired
  ) {
    return {
      mayUpload:
        false,

      uploadBlockReason:
        "DueQuity has not issued a current government ID requirement for this recovery.",
    };
  }

  if (
    !input.requestBelongsToClaimant
  ) {
    return {
      mayUpload:
        false,

      uploadBlockReason:
        "This government ID requirement is not assigned to your claimant account.",
    };
  }

  if (
    input.identityVerification ===
      "verified"
  ) {
    return {
      mayUpload:
        false,

      uploadBlockReason:
        "Your identity has already been verified.",
    };
  }

  const latestDocument =
    input.latestDocument;

  if (
    latestDocument &&
    (
      latestDocument.status ===
        "uploaded" ||
      latestDocument.status ===
        "scanning" ||
      latestDocument.status ===
        "under_review"
    )
  ) {
    return {
      mayUpload:
        false,

      uploadBlockReason:
        "Your current government ID is already being processed. A replacement is not needed unless DueQuity rejects the current file.",
    };
  }

  if (
    latestDocument?.status ===
      "accepted"
  ) {
    return {
      mayUpload:
        false,

      uploadBlockReason:
        "Your government ID has already been accepted.",
    };
  }

  return {
    mayUpload:
      true,
  };
}

/* ========================================================================== */
/* Legacy Claim identity state                                                 */
/* ========================================================================== */

async function getClaimBackedIdentityState(
  context:
    ClaimBackedIdentityContext,
): Promise<
  ClaimantIdentityDocumentState
> {
  const admin =
    getSupabaseAdmin();

  const [
    requestResult,
    documentResult,
  ] =
    await Promise.all([
      admin
        .from(
          "claim_document_requests",
        )
        .select(
          "id, status, required, requested_from_claimant_id, guidance",
        )
        .eq(
          "claim_id",
          context.claimId,
        )
        .eq(
          "kind",
          "government_id",
        )
        .maybeSingle(),

      admin
        .from(
          "claim_documents",
        )
        .select(
          "id, government_id_type, original_file_name, mime_type, byte_size, status, malware_scan_status, uploaded_at, reviewed_at, rejection_reason",
        )
        .eq(
          "claim_id",
          context.claimId,
        )
        .eq(
          "claimant_id",
          context.claimantId,
        )
        .eq(
          "kind",
          "government_id",
        )
        .order(
          "uploaded_at",
          {
            ascending:
              false,
          },
        ),
    ]);

  if (
    requestResult.error
  ) {
    throw new Error(
      `Unable to load the government ID requirement: ${requestResult.error.message}`,
    );
  }

  if (
    documentResult.error
  ) {
    throw new Error(
      `Unable to load government ID uploads: ${documentResult.error.message}`,
    );
  }

  const request =
    requestResult.data
      ? requestResult.data as
          GovernmentIdRequestRow
      : null;

  const documents =
    (
      documentResult.data ??
      []
    ).map(
      (
        row,
      ) =>
        documentFromLegacyRow(
          row as
            GovernmentIdDocumentRow,
        ),
    );

  const latestDocument =
    documents[0];

  const eligibility =
    resolveUploadEligibility({
      requestExists:
        Boolean(
          request,
        ),

      requestRequired:
        request?.required ===
          true,

      requestBelongsToClaimant:
        !request
          ?.requested_from_claimant_id ||
        request.requested_from_claimant_id ===
          context.claimantId,

      identityVerification:
        context.identityVerification,

      latestDocument,
    });

  return {
    claimantId:
      context.claimantId,

    claimantReference:
      context.claimantReference,

    claimId:
      context.claimId,

    claimReference:
      context.claimReference,

    legalName:
      context.legalName,

    recordKind:
      "claim",

    identityVerification:
      context.identityVerification,

    identityVerifiedAt:
      context.identityVerifiedAt ??
      undefined,

    request:
      request
        ? {
            id:
              request.id,

            status:
              request.status,

            required:
              request.required,

            guidance:
              request.guidance ??
              undefined,
          }
        : null,

    documents,

    latestDocument,

    mayUpload:
      eligibility.mayUpload,

    uploadBlockReason:
      eligibility.uploadBlockReason,
  };
}

/* ========================================================================== */
/* Assigned-lead pre-Claim identity state                                      */
/* ========================================================================== */

async function getAssignedLeadIdentityState(
  context:
    AssignedLeadIdentityContext,
): Promise<
  ClaimantIdentityDocumentState
> {
  const admin =
    getSupabaseAdmin();

  const [
    requestResult,
    documentResult,
  ] =
    await Promise.all([
      admin
        .from(
          "assigned_lead_claimant_document_requests",
        )
        .select(
          "id, status, required, guidance",
        )
        .eq(
          "workcase_id",
          context.workcaseId,
        )
        .eq(
          "claimant_id",
          context.claimantId,
        )
        .eq(
          "kind",
          "government_id",
        )
        .maybeSingle(),

      admin
        .from(
          "assigned_lead_claimant_documents",
        )
        .select(
          "id, government_id_type, original_file_name, mime_type, byte_size, status, malware_scan_status, uploaded_at, reviewed_at, rejection_reason",
        )
        .eq(
          "workcase_id",
          context.workcaseId,
        )
        .eq(
          "claimant_id",
          context.claimantId,
        )
        .eq(
          "kind",
          "government_id",
        )
        .order(
          "uploaded_at",
          {
            ascending:
              false,
          },
        ),
    ]);

  if (
    requestResult.error
  ) {
    throw new Error(
      `Unable to load the government ID requirement: ${requestResult.error.message}`,
    );
  }

  if (
    documentResult.error
  ) {
    throw new Error(
      `Unable to load government ID uploads: ${documentResult.error.message}`,
    );
  }

  const request =
    requestResult.data
      ? requestResult.data as
          AssignedLeadDocumentRequestRow
      : null;

  const documents =
    (
      documentResult.data ??
      []
    ).map(
      (
        row,
      ) =>
        documentFromAssignedLeadRow(
          row as
            AssignedLeadDocumentRow,
        ),
    );

  const latestDocument =
    documents[0];

  const eligibility =
    resolveUploadEligibility({
      requestExists:
        Boolean(
          request,
        ),

      requestRequired:
        request?.required ===
          true,

      requestBelongsToClaimant:
        true,

      identityVerification:
        context.identityVerification,

      latestDocument,
    });

  /*
   * The existing claimant UI contract contains claimId and claimReference.
   * A pre-Claim recovery intentionally has no official Claim yet.
   *
   * The workcase UUID is therefore supplied only as the internal record ID,
   * while the existing DQC claimant reference remains the human-facing
   * recovery reference. No fake DQ Claim reference is created.
   */
  return {
    claimantId:
      context.claimantId,

    claimantReference:
      context.claimantReference,

    claimId:
      context.workcaseId,

    claimReference:
      context.claimantReference,

    legalName:
      context.legalName,

    recordKind:
      "assigned_lead",

    workcaseId:
      context.workcaseId,

    identityVerification:
      context.identityVerification,

    identityVerifiedAt:
      context.identityVerifiedAt ??
      undefined,

    request:
      request
        ? {
            id:
              request.id,

            status:
              request.status,

            required:
              request.required,

            guidance:
              request.guidance ??
              undefined,
          }
        : null,

    documents,

    latestDocument,

    mayUpload:
      eligibility.mayUpload,

    uploadBlockReason:
      eligibility.uploadBlockReason,
  };
}

/* ========================================================================== */
/* Public state resolver                                                       */
/* ========================================================================== */

export async function getClaimantIdentityDocumentState(
  claimantId:
    string,
): Promise<
  ClaimantIdentityDocumentState
> {
  const context =
    await requireClaimantIdentityContext(
      claimantId,
    );

  if (
    context.kind ===
      "claim"
  ) {
    return getClaimBackedIdentityState(
      context,
    );
  }

  return getAssignedLeadIdentityState(
    context,
  );
}

/* ========================================================================== */
/* Legacy Claim upload                                                         */
/* ========================================================================== */

async function uploadClaimBackedGovernmentId(
  context:
    ClaimBackedIdentityContext,
  currentState:
    ClaimantIdentityDocumentState,
  input:
    UploadClaimantGovernmentIdInput,
  mimeType:
    string,
  originalFileName:
    string,
): Promise<
  ClaimantIdentityDocumentState
> {
  if (
    !currentState.request
  ) {
    throw new Error(
      "A government ID requirement must exist before an ID can be uploaded.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const documentId =
    [
      "doc",
      safePathPart(
        context.claimId,
      ),
      randomUUID(),
    ].join(
      "-",
    );

  const extension =
    extensionForMimeType(
      mimeType,
    );

  const storageKey =
    [
      safePathPart(
        context.claimId,
      ),
      "government-id",
      `${randomUUID()}${extension}`,
    ].join(
      "/",
    );

  const uploadedAt =
    new Date().toISOString();

  const {
    error:
      storageError,
  } =
    await admin.storage
      .from(
        CLAIMANT_IDENTITY_STORAGE_BUCKET,
      )
      .upload(
        storageKey,
        input.buffer,
        {
          contentType:
            mimeType,

          upsert:
            false,

          cacheControl:
            "0",
        },
      );

  if (
    storageError
  ) {
    throw new Error(
      `Unable to securely store the government ID: ${storageError.message}`,
    );
  }

  const {
    error:
      insertError,
  } =
    await admin
      .from(
        "claim_documents",
      )
      .insert({
        id:
          documentId,

        claim_id:
          context.claimId,

        opportunity_id:
          null,

        claimant_id:
          context.claimantId,

        kind:
          "government_id",

        government_id_type:
          input.governmentIdType,

        title:
          governmentIdTypeLabel(
            input.governmentIdType,
          ),

        original_file_name:
          originalFileName,

        mime_type:
          mimeType,

        byte_size:
          input.buffer.length,

        sensitivity:
          "restricted",

        status:
          "uploaded",

        storage_bucket:
          CLAIMANT_IDENTITY_STORAGE_BUCKET,

        storage_key:
          storageKey,

        malware_scan_status:
          "pending",

        malware_scanned_at:
          null,

        malware_scan_detail:
          null,

        uploaded_by_user_id:
          null,

        uploaded_by_claimant_id:
          context.claimantId,

        uploaded_at:
          uploadedAt,

        reviewed_by_user_id:
          null,

        reviewed_at:
          null,

        rejection_reason:
          null,

        page_count:
          null,

        expires_at:
          null,

        row_version:
          1,
      });

  if (
    insertError
  ) {
    await admin.storage
      .from(
        CLAIMANT_IDENTITY_STORAGE_BUCKET,
      )
      .remove([
        storageKey,
      ]);

    throw new Error(
      `Unable to register the government ID upload: ${insertError.message}`,
    );
  }

  /*
   * The existing Claim document trigger updates claimant_onboarding and the
   * government-ID request when a document enters uploaded/review states.
   *
   * The explicit request update below is retained for compatibility with the
   * established Claim-backed workflow.
   */
  const {
    error:
      requestError,
  } =
    await admin
      .from(
        "claim_document_requests",
      )
      .update({
        required:
          true,

        status:
          "received",

        fulfilled_by_document_id:
          null,

        waived_reason:
          null,
      })
      .eq(
        "id",
        currentState.request.id,
      )
      .neq(
        "status",
        "accepted",
      );

  if (
    requestError
  ) {
    await admin
      .from(
        "claim_documents",
      )
      .delete()
      .eq(
        "id",
        documentId,
      );

    await admin.storage
      .from(
        CLAIMANT_IDENTITY_STORAGE_BUCKET,
      )
      .remove([
        storageKey,
      ]);

    await admin
      .from(
        "claimant_onboarding",
      )
      .update({
        identity_verification:
          "documents_requested",

        identity_verified_at:
          null,

        identity_provider_ref:
          null,
      })
      .eq(
        "claimant_id",
        context.claimantId,
      )
      .neq(
        "identity_verification",
        "verified",
      );

    throw new Error(
      `Unable to update the government ID requirement: ${requestError.message}`,
    );
  }

  const {
    error:
      auditError,
  } =
    await admin
      .from(
        "claim_document_audit",
      )
      .insert({
        id:
          randomUUID(),

        claim_id:
          context.claimId,

        document_id:
          documentId,

        request_id:
          currentState.request.id,

        action:
          "document_uploaded",

        actor_user_id:
          context.claimantId,

        occurred_at:
          uploadedAt,

        detail:
          `${governmentIdTypeLabel(
            input.governmentIdType,
          )} uploaded by the authenticated claimant through the restricted government ID workflow. Safety review remains pending.`,
      });

  if (
    auditError
  ) {
    throw new Error(
      `Government ID was stored but its audit record could not be written: ${auditError.message}`,
    );
  }

  return getClaimantIdentityDocumentState(
    context.claimantId,
  );
}

/* ========================================================================== */
/* Assigned-lead pre-Claim upload                                              */
/* ========================================================================== */

async function uploadAssignedLeadGovernmentId(
  context:
    AssignedLeadIdentityContext,
  currentState:
    ClaimantIdentityDocumentState,
  input:
    UploadClaimantGovernmentIdInput,
  mimeType:
    string,
  originalFileName:
    string,
): Promise<
  ClaimantIdentityDocumentState
> {
  if (
    !currentState.request
  ) {
    throw new Error(
      "A government ID requirement must exist before an ID can be uploaded.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const documentId =
    randomUUID();

  const extension =
    extensionForMimeType(
      mimeType,
    );

  /*
   * Pre-Claim identity evidence remains in the same private claim-documents
   * bucket but has its own isolated object path. It is never attached to a
   * fabricated Claim.
   */
  const storageKey =
    [
      "preclaim",
      safePathPart(
        context.workcaseId,
      ),
      "government-id",
      `${randomUUID()}${extension}`,
    ].join(
      "/",
    );

  const uploadedAt =
    new Date().toISOString();

  const {
    error:
      storageError,
  } =
    await admin.storage
      .from(
        CLAIMANT_IDENTITY_STORAGE_BUCKET,
      )
      .upload(
        storageKey,
        input.buffer,
        {
          contentType:
            mimeType,

          upsert:
            false,

          cacheControl:
            "0",
        },
      );

  if (
    storageError
  ) {
    throw new Error(
      `Unable to securely store the government ID: ${storageError.message}`,
    );
  }

  const {
    error:
      insertError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_documents",
      )
      .insert({
        id:
          documentId,

        workcase_id:
          context.workcaseId,

        claimant_id:
          context.claimantId,

        kind:
          "government_id",

        government_id_type:
          input.governmentIdType,

        title:
          governmentIdTypeLabel(
            input.governmentIdType,
          ),

        original_file_name:
          originalFileName,

        mime_type:
          mimeType,

        byte_size:
          input.buffer.length,

        sensitivity:
          "restricted",

        status:
          "uploaded",

        storage_bucket:
          CLAIMANT_IDENTITY_STORAGE_BUCKET,

        storage_key:
          storageKey,

        malware_scan_status:
          "pending",

        malware_scanned_at:
          null,

        malware_scan_detail:
          null,

        uploaded_by_claimant_auth_user_id:
          context.authUserId,

        uploaded_at:
          uploadedAt,

        reviewed_by_staff_user_id:
          null,

        reviewed_at:
          null,

        rejection_reason:
          null,

        row_version:
          1,
      });

  if (
    insertError
  ) {
    await admin.storage
      .from(
        CLAIMANT_IDENTITY_STORAGE_BUCKET,
      )
      .remove([
        storageKey,
      ]);

    throw new Error(
      `Unable to register the government ID upload: ${insertError.message}`,
    );
  }

  /*
   * Stage 32 owns the state transition transactionally.
   *
   * Inserting the document automatically:
   *
   * - moves the pre-Claim identity profile to under_review;
   * - moves the required government-ID request to received.
   *
   * Application code must not duplicate those state mutations.
   */
  const {
    error:
      auditError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_document_audit",
      )
      .insert({
        id:
          randomUUID(),

        workcase_id:
          context.workcaseId,

        claimant_id:
          context.claimantId,

        document_id:
          documentId,

        request_id:
          currentState.request.id,

        action:
          "document_uploaded",

        actor_type:
          "claimant",

        actor_staff_user_id:
          null,

        actor_claimant_auth_user_id:
          context.authUserId,

        occurred_at:
          uploadedAt,

        detail: {
          governmentIdType:
            input.governmentIdType,

          governmentIdTypeLabel:
            governmentIdTypeLabel(
              input.governmentIdType,
            ),

          originalFileName,

          mimeType,

          byteSize:
            input.buffer.length,

          safetyStatus:
            "pending",

          source:
            "my_duequity_identity_portal",
        },
      });

  if (
    auditError
  ) {
    throw new Error(
      `Government ID was stored but its audit record could not be written: ${auditError.message}`,
    );
  }

  return getClaimantIdentityDocumentState(
    context.claimantId,
  );
}

/* ========================================================================== */
/* Public upload                                                               */
/* ========================================================================== */

export async function uploadClaimantGovernmentId(
  input:
    UploadClaimantGovernmentIdInput,
): Promise<
  ClaimantIdentityDocumentState
> {
  const claimantId =
    input.claimantId.trim();

  if (
    !claimantId
  ) {
    throw new Error(
      "Claimant identity is required.",
    );
  }

  if (
    !isGovernmentIdType(
      input.governmentIdType,
    )
  ) {
    throw new Error(
      "Select a valid government ID type.",
    );
  }

  const mimeType =
    input.mimeType
      .trim()
      .toLowerCase();

  if (
    !ALLOWED_MIME_TYPES.has(
      mimeType,
    )
  ) {
    throw new Error(
      "Upload a PDF, JPEG, PNG, or WebP file.",
    );
  }

  if (
    input.buffer.length <=
      0
  ) {
    throw new Error(
      "The selected government ID file is empty.",
    );
  }

  if (
    input.buffer.length >
    CLAIMANT_IDENTITY_MAX_BYTES
  ) {
    throw new Error(
      "The government ID file exceeds the 15 MB limit.",
    );
  }

  if (
    !contentMatchesMimeType(
      input.buffer,
      mimeType,
    )
  ) {
    throw new Error(
      "The uploaded file contents do not match the declared file type.",
    );
  }

  const context =
    await requireClaimantIdentityContext(
      claimantId,
    );

  const currentState =
    context.kind ===
      "claim"
      ? await getClaimBackedIdentityState(
          context,
        )
      : await getAssignedLeadIdentityState(
          context,
        );

  if (
    !currentState.mayUpload
  ) {
    throw new Error(
      currentState.uploadBlockReason ??
      "A new government ID cannot be uploaded right now.",
    );
  }

  const originalFileName =
    safeOriginalFileName(
      input.originalFileName,
    );

  if (
    context.kind ===
      "claim"
  ) {
    return uploadClaimBackedGovernmentId(
      context,
      currentState,
      input,
      mimeType,
      originalFileName,
    );
  }

  return uploadAssignedLeadGovernmentId(
    context,
    currentState,
    input,
    mimeType,
    originalFileName,
  );
}