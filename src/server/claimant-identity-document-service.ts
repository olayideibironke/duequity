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

export interface ClaimantIdentityDocumentView {
  id: string;

  governmentIdType:
    GovernmentIdType;

  governmentIdTypeLabel:
    string;

  originalFileName?: string;

  mimeType: string;

  byteSize: number;

  status:
    ClaimantIdentityDocumentStatus;

  safetyStatus:
    ClaimantIdentitySafetyStatus;

  uploadedAt: string;

  reviewedAt?: string;

  rejectionReason?: string;
}

export interface ClaimantIdentityDocumentState {
  claimantId: string;

  claimantReference: string;

  claimId: string;

  claimReference: string;

  legalName: string;

  identityVerification:
    ClaimantIdentityVerificationStatus;

  identityVerifiedAt?: string;

  request: {
    id: string;

    status:
      | "outstanding"
      | "received"
      | "accepted"
      | "waived"
      | "overdue";

    required: boolean;

    guidance?: string;
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
  claimantId: string;

  governmentIdType:
    GovernmentIdType;

  originalFileName: string;

  mimeType: string;

  buffer: Buffer;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimantIdentityRow {
  claim_id: string;

  claim_reference: string;

  claimant_id: string;

  claimant_reference: string;

  legal_name: string;

  identity_verification:
    ClaimantIdentityVerificationStatus;

  identity_verified_at:
    string | null;
}

interface GovernmentIdRequestRow {
  id: string;

  status:
    | "outstanding"
    | "received"
    | "accepted"
    | "waived"
    | "overdue";

  required: boolean;

  requested_from_claimant_id:
    string | null;

  guidance:
    string | null;
}

interface GovernmentIdDocumentRow {
  id: string;

  government_id_type:
    GovernmentIdType;

  original_file_name:
    string | null;

  mime_type: string;

  byte_size:
    number | string;

  status:
    ClaimantIdentityDocumentStatus;

  malware_scan_status:
    ClaimantIdentitySafetyStatus;

  uploaded_at: string;

  reviewed_at:
    string | null;

  rejection_reason:
    string | null;
}

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

function documentFromRow(
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

/* ========================================================================== */
/* Claimant                                                                    */
/* ========================================================================== */

async function requireClaimantIdentityRow(
  claimantId:
    string,
): Promise<
  ClaimantIdentityRow
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
    error ||
    !data
  ) {
    throw new Error(
      "The claimant identity record could not be resolved.",
    );
  }

  return data as ClaimantIdentityRow;
}

/* ========================================================================== */
/* State                                                                       */
/* ========================================================================== */

export async function getClaimantIdentityDocumentState(
  claimantId:
    string,
): Promise<
  ClaimantIdentityDocumentState
> {
  const claimant =
    await requireClaimantIdentityRow(
      claimantId,
    );

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
          claimant.claim_id,
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
          claimant.claim_id,
        )
        .eq(
          "claimant_id",
          claimant.claimant_id,
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
      ? requestResult.data as GovernmentIdRequestRow
      : null;

  const documents =
    (
      documentResult.data ??
      []
    ).map(
      (
        row,
      ) =>
        documentFromRow(
          row as GovernmentIdDocumentRow,
        ),
    );

  const latestDocument =
    documents[0];

  let mayUpload =
    true;

  let uploadBlockReason:
    string | undefined;

  if (
    !request ||
    !request.required
  ) {
    mayUpload =
      false;

    uploadBlockReason =
      "DueQuity has not issued a current government ID requirement for this recovery.";
  } else if (
    request.requested_from_claimant_id &&
    request.requested_from_claimant_id !==
      claimant.claimant_id
  ) {
    mayUpload =
      false;

    uploadBlockReason =
      "This government ID requirement is not assigned to your claimant account.";
  } else if (
    claimant.identity_verification ===
      "verified"
  ) {
    mayUpload =
      false;

    uploadBlockReason =
      "Your identity has already been verified.";
  } else if (
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
    mayUpload =
      false;

    uploadBlockReason =
      "Your current government ID is already being processed. A replacement is not needed unless DueQuity rejects the current file.";
  } else if (
    latestDocument?.status ===
      "accepted"
  ) {
    mayUpload =
      false;

    uploadBlockReason =
      "Your government ID has already been accepted.";
  }

  return {
    claimantId:
      claimant.claimant_id,

    claimantReference:
      claimant.claimant_reference,

    claimId:
      claimant.claim_id,

    claimReference:
      claimant.claim_reference,

    legalName:
      claimant.legal_name,

    identityVerification:
      claimant.identity_verification,

    identityVerifiedAt:
      claimant.identity_verified_at ??
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

    mayUpload,

    uploadBlockReason,
  };
}

/* ========================================================================== */
/* Upload                                                                      */
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

  const currentState =
    await getClaimantIdentityDocumentState(
      claimantId,
    );

  if (
    !currentState.mayUpload
  ) {
    throw new Error(
      currentState.uploadBlockReason ??
      "A new government ID cannot be uploaded right now.",
    );
  }

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
        currentState.claimId,
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
        currentState.claimId,
      ),
      "government-id",
      `${randomUUID()}${extension}`,
    ].join(
      "/",
    );

  const originalFileName =
    safeOriginalFileName(
      input.originalFileName,
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
          currentState.claimId,

        opportunity_id:
          null,

        claimant_id:
          claimantId,

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
          claimantId,

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
        claimantId,
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
          currentState.claimId,

        document_id:
          documentId,

        request_id:
          currentState.request.id,

        action:
          "document_uploaded",

        actor_user_id:
          claimantId,

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
    claimantId,
  );
}