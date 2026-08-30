import "server-only";

import {
  randomUUID,
} from "node:crypto";

import type {
  DocumentKind,
  DocumentSensitivity,
} from "@/domain/types";

import type {
  StaffSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

export const PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET =
  "claim-documents";

export const PRECLAIM_SUPPORTING_DOCUMENT_MAX_BYTES =
  15 *
  1024 *
  1024;

export const PRECLAIM_SUPPORTING_DOCUMENT_KINDS =
  [
    "proof_of_former_ownership",
    "recorded_deed",
    "death_certificate",
    "probate_letters",
    "letters_of_administration",
    "will",
    "trust_instrument",
    "articles_of_organization",
    "certificate_of_good_standing",
    "w9",
    "court_order",
    "agency_correspondence",
    "lien_release",
    "bankruptcy_discharge",
    "marriage_certificate",
    "utility_bill_proof_of_residence",
    "other",
  ] as const;

export type PreclaimSupportingDocumentKind =
  typeof PRECLAIM_SUPPORTING_DOCUMENT_KINDS[number];

const ALLOWED_MIME_TYPES =
  new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type PreclaimSupportingRequestStatus =
  | "outstanding"
  | "received"
  | "accepted"
  | "overdue";

export type PreclaimSupportingDocumentStatus =
  | "uploaded"
  | "scanning"
  | "under_review"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

export type PreclaimSupportingSafetyStatus =
  | "pending"
  | "clean"
  | "rejected"
  | "unsafe";

export interface PreclaimSupportingClaimant {
  workcaseId:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  legalName:
    string;

  email?:
    string;

  assignedStaffUserId:
    string;

  discoveredRecordId:
    string;
}

export interface PreclaimSupportingDocumentRequest {
  id:
    string;

  workcaseId:
    string;

  claimantId:
    string;

  kind:
    PreclaimSupportingDocumentKind;

  kindLabel:
    string;

  reason:
    string;

  guidance?:
    string;

  requestedAt:
    string;

  status:
    PreclaimSupportingRequestStatus;

  fulfilledByDocumentId?:
    string;
}

export interface PreclaimSupportingDocument {
  id:
    string;

  workcaseId:
    string;

  claimantId:
    string;

  kind:
    PreclaimSupportingDocumentKind;

  kindLabel:
    string;

  title:
    string;

  originalFileName?:
    string;

  mimeType:
    string;

  byteSize:
    number;

  sensitivity:
    DocumentSensitivity;

  status:
    PreclaimSupportingDocumentStatus;

  safetyStatus:
    PreclaimSupportingSafetyStatus;

  uploadedAt:
    string;

  reviewedAt?:
    string;

  rejectionReason?:
    string;
}

export interface PreclaimSupportingStaffState {
  claimants:
    PreclaimSupportingClaimant[];

  requests:
    PreclaimSupportingDocumentRequest[];

  documents:
    PreclaimSupportingDocument[];
}

export interface PreclaimSupportingClaimantState {
  claimant:
    PreclaimSupportingClaimant;

  requests:
    PreclaimSupportingDocumentRequest[];

  documents:
    PreclaimSupportingDocument[];
}

export interface CreatePreclaimSupportingDocumentRequestInput {
  session:
    StaffSession;

  workcaseId:
    string;

  kind:
    PreclaimSupportingDocumentKind;

  reason:
    string;

  guidance?:
    string;
}

export interface UploadPreclaimSupportingDocumentInput {
  claimantId:
    string;

  requestId:
    string;

  originalFileName:
    string;

  mimeType:
    string;

  buffer:
    Buffer;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface WorkcaseRow {
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

  email:
    string | null;

  auth_user_id:
    string | null;

  assigned_staff_user_id:
    string;

  discovered_record_id:
    string;

  status:
    string;

  linked_claim_id:
    string | null;
}

interface IdentityProfileRow {
  workcase_id:
    string;

  claimant_id:
    string;

  identity_verification:
    string;
}

interface RequestRow {
  id:
    string;

  workcase_id:
    string;

  claimant_id:
    string;

  kind:
    string;

  reason:
    string;

  requested_at:
    string;

  required:
    boolean;

  status:
    PreclaimSupportingRequestStatus;

  guidance:
    string | null;

  fulfilled_by_document_id:
    string | null;
}

interface DocumentRow {
  id:
    string;

  workcase_id:
    string;

  claimant_id:
    string;

  kind:
    string;

  title:
    string;

  original_file_name:
    string | null;

  mime_type:
    string;

  byte_size:
    number | string;

  sensitivity:
    DocumentSensitivity;

  status:
    PreclaimSupportingDocumentStatus;

  malware_scan_status:
    PreclaimSupportingSafetyStatus;

  uploaded_at:
    string;

  reviewed_at:
    string | null;

  rejection_reason:
    string | null;
}

/* ========================================================================== */
/* Labels                                                                      */
/* ========================================================================== */

export function preclaimSupportingDocumentKindLabel(
  kind:
    PreclaimSupportingDocumentKind,
): string {
  switch (
    kind
  ) {
    case "proof_of_former_ownership":
      return "Proof of former ownership";

    case "recorded_deed":
      return "Recorded deed";

    case "death_certificate":
      return "Death certificate";

    case "probate_letters":
      return "Probate letters";

    case "letters_of_administration":
      return "Letters of administration";

    case "will":
      return "Will";

    case "trust_instrument":
      return "Trust instrument";

    case "articles_of_organization":
      return "Articles of organization";

    case "certificate_of_good_standing":
      return "Certificate of good standing";

    case "w9":
      return "W-9";

    case "court_order":
      return "Court order";

    case "agency_correspondence":
      return "Agency correspondence";

    case "lien_release":
      return "Lien release";

    case "bankruptcy_discharge":
      return "Bankruptcy discharge";

    case "marriage_certificate":
      return "Marriage certificate";

    case "utility_bill_proof_of_residence":
      return "Utility bill / proof of residence";

    case "other":
      return "Other supporting document";
  }
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

export function isPreclaimSupportingDocumentKind(
  value:
    unknown,
): value is PreclaimSupportingDocumentKind {
  return (
    typeof value ===
      "string" &&
    (
      PRECLAIM_SUPPORTING_DOCUMENT_KINDS as
        readonly string[]
    ).includes(
      value,
    )
  );
}

function requiredText(
  value:
    string,
  label:
    string,
  maxLength:
    number,
): string {
  const normalized =
    value.trim();

  if (
    !normalized
  ) {
    throw new Error(
      `${label} is required.`,
    );
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new Error(
      `${label} is too long.`,
    );
  }

  return normalized;
}

function optionalText(
  value:
    string | undefined,
  maxLength:
    number,
): string | undefined {
  const normalized =
    value?.trim();

  if (
    !normalized
  ) {
    return undefined;
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new Error(
      "Supporting document guidance is too long.",
    );
  }

  return normalized;
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

function safeOriginalFileName(
  value:
    string,
): string {
  const safe =
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
    safe ||
    "supporting-document"
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
        "Unsupported supporting document file type.",
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
      buffer[
        0
      ] ===
        0xff &&
      buffer[
        1
      ] ===
        0xd8 &&
      buffer[
        2
      ] ===
        0xff
    );
  }

  if (
    mimeType ===
    "image/png"
  ) {
    const signature =
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
        signature.length &&
      buffer
        .subarray(
          0,
          signature.length,
        )
        .equals(
          signature,
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
/* Sensitivity                                                                 */
/* ========================================================================== */

function sensitivityForSupportingDocument(
  kind:
    PreclaimSupportingDocumentKind,
): DocumentSensitivity {
  switch (
    kind
  ) {
    case "recorded_deed":
    case "articles_of_organization":
    case "certificate_of_good_standing":
    case "court_order":
    case "agency_correspondence":
    case "lien_release":
    case "bankruptcy_discharge":
      return "public_record";

    case "proof_of_former_ownership":
    case "death_certificate":
    case "probate_letters":
    case "letters_of_administration":
    case "will":
    case "trust_instrument":
    case "w9":
    case "marriage_certificate":
    case "utility_bill_proof_of_residence":
    case "other":
      return "sensitive";
  }
}

/* ========================================================================== */
/* Authorization                                                               */
/* ========================================================================== */

function mayManageSupportingDocuments(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
      "claims_manager" ||
    session.user.role ===
      "administrator" ||
    session.user.role ===
      "super_admin"
  );
}

function hasAdministrativeScope(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
      "administrator" ||
    session.user.role ===
      "super_admin"
  );
}

async function requireActiveAssignmentAuthorization({
  session,
  workcase,
}: {
  session:
    StaffSession;

  workcase:
    WorkcaseRow;
}): Promise<void> {
  if (
    !mayManageSupportingDocuments(
      session,
    )
  ) {
    throw new Error(
      "Your staff role is not authorized to manage pre-Claim supporting documents.",
    );
  }

  if (
    hasAdministrativeScope(
      session,
    )
  ) {
    return;
  }

  if (
    workcase.assigned_staff_user_id !==
    session.user.id
  ) {
    throw new Error(
      "This claimant recovery is assigned to a different staff member.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "staff_has_active_lead_work_authorization",
      {
        p_staff_user_id:
          session.user.id,

        p_discovered_record_id:
          workcase.discovered_record_id,

        p_opportunity_id:
          null,

        p_claim_id:
          null,
      },
    );

  if (
    error ||
    data !==
      true
  ) {
    throw new Error(
      "The active Admin-assigned work authorization for this claimant could not be verified.",
    );
  }
}

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function claimantFromRow(
  row:
    WorkcaseRow,
): PreclaimSupportingClaimant {
  return {
    workcaseId:
      row.id,

    claimantId:
      row.claimant_id,

    claimantReference:
      row.claimant_reference,

    legalName:
      [
        row.legal_first_name,
        row.legal_last_name,
      ]
        .filter(
          Boolean,
        )
        .join(
          " ",
        ),

    email:
      row.email ??
      undefined,

    assignedStaffUserId:
      row.assigned_staff_user_id,

    discoveredRecordId:
      row.discovered_record_id,
  };
}

function requestFromRow(
  row:
    RequestRow,
): PreclaimSupportingDocumentRequest {
  if (
    !isPreclaimSupportingDocumentKind(
      row.kind,
    )
  ) {
    throw new Error(
      "Pre-Claim supporting request contains an unsupported document kind.",
    );
  }

  return {
    id:
      row.id,

    workcaseId:
      row.workcase_id,

    claimantId:
      row.claimant_id,

    kind:
      row.kind,

    kindLabel:
      preclaimSupportingDocumentKindLabel(
        row.kind,
      ),

    reason:
      row.reason,

    guidance:
      row.guidance ??
      undefined,

    requestedAt:
      row.requested_at,

    status:
      row.status,

    fulfilledByDocumentId:
      row.fulfilled_by_document_id ??
      undefined,
  };
}

function documentFromRow(
  row:
    DocumentRow,
): PreclaimSupportingDocument {
  if (
    !isPreclaimSupportingDocumentKind(
      row.kind,
    )
  ) {
    throw new Error(
      "Pre-Claim supporting document contains an unsupported document kind.",
    );
  }

  return {
    id:
      row.id,

    workcaseId:
      row.workcase_id,

    claimantId:
      row.claimant_id,

    kind:
      row.kind,

    kindLabel:
      preclaimSupportingDocumentKindLabel(
        row.kind,
      ),

    title:
      row.title,

    originalFileName:
      row.original_file_name ??
      undefined,

    mimeType:
      row.mime_type,

    byteSize:
      Number(
        row.byte_size,
      ),

    sensitivity:
      row.sensitivity,

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
/* Workcase helpers                                                            */
/* ========================================================================== */

async function getActivePreclaimWorkcaseById(
  workcaseId:
    string,
): Promise<
  WorkcaseRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, claimant_id, claimant_reference, legal_first_name, legal_last_name, email, auth_user_id, assigned_staff_user_id, discovered_record_id, status, linked_claim_id",
      )
      .eq(
        "id",
        workcaseId,
      )
      .eq(
        "status",
        "activated",
      )
      .is(
        "linked_claim_id",
        null,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to load pre-Claim claimant workcase: ${error.message}`,
    );
  }

  return data
    ? data as
        WorkcaseRow
    : undefined;
}

async function getActivePreclaimWorkcaseForClaimant(
  claimantId:
    string,
): Promise<
  WorkcaseRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, claimant_id, claimant_reference, legal_first_name, legal_last_name, email, auth_user_id, assigned_staff_user_id, discovered_record_id, status, linked_claim_id",
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .eq(
        "status",
        "activated",
      )
      .is(
        "linked_claim_id",
        null,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to load claimant recovery workcase: ${error.message}`,
    );
  }

  return data
    ? data as
        WorkcaseRow
    : undefined;
}

async function requireVerifiedIdentity(
  workcase:
    WorkcaseRow,
): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_identity_profiles",
      )
      .select(
        "workcase_id, claimant_id, identity_verification",
      )
      .eq(
        "workcase_id",
        workcase.id,
      )
      .eq(
        "claimant_id",
        workcase.claimant_id,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to verify claimant identity status: ${error.message}`,
    );
  }

  const profile =
    data
      ? data as
          IdentityProfileRow
      : undefined;

  if (
    !profile ||
    profile.identity_verification !==
      "verified"
  ) {
    throw new Error(
      "Supporting documents may be requested only after claimant identity is verified.",
    );
  }
}

/* ========================================================================== */
/* Staff state                                                                 */
/* ========================================================================== */

export async function listPreclaimSupportingDocumentStaffState(
  session:
    StaffSession,
): Promise<
  PreclaimSupportingStaffState
> {
  if (
    !mayManageSupportingDocuments(
      session,
    )
  ) {
    return {
      claimants:
        [],

      requests:
        [],

      documents:
        [],
    };
  }

  const admin =
    getSupabaseAdmin();

  let workcaseQuery =
    admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, claimant_id, claimant_reference, legal_first_name, legal_last_name, email, auth_user_id, assigned_staff_user_id, discovered_record_id, status, linked_claim_id",
      )
      .eq(
        "status",
        "activated",
      )
      .is(
        "linked_claim_id",
        null,
      );

  if (
    !hasAdministrativeScope(
      session,
    )
  ) {
    workcaseQuery =
      workcaseQuery.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const {
    data:
      workcaseData,
    error:
      workcaseError,
  } =
    await workcaseQuery
      .order(
        "updated_at",
        {
          ascending:
            false,
        },
      );

  if (
    workcaseError
  ) {
    throw new Error(
      `Unable to list pre-Claim claimant workcases: ${workcaseError.message}`,
    );
  }

  const workcases =
    (
      workcaseData ??
      []
    )
      .map(
        (
          row,
        ) =>
          row as
            WorkcaseRow,
      )
      .filter(
        (
          row,
        ) =>
          Boolean(
            row.auth_user_id,
          ),
      );

  if (
    workcases.length ===
    0
  ) {
    return {
      claimants:
        [],

      requests:
        [],

      documents:
        [],
    };
  }

  const authorizedWorkcases:
    WorkcaseRow[] =
    [];

  for (
    const workcase of
    workcases
  ) {
    try {
      await requireActiveAssignmentAuthorization({
        session,

        workcase,
      });

      authorizedWorkcases.push(
        workcase,
      );
    } catch {
      /*
       * A workcase that is no longer within the operator's exact assignment
       * scope simply does not enter the staff collection workspace.
       */
    }
  }

  if (
    authorizedWorkcases.length ===
    0
  ) {
    return {
      claimants:
        [],

      requests:
        [],

      documents:
        [],
    };
  }

  const workcaseIds =
    authorizedWorkcases.map(
      (
        row,
      ) =>
        row.id,
    );

  const {
    data:
      identityData,
    error:
      identityError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_identity_profiles",
      )
      .select(
        "workcase_id, claimant_id, identity_verification",
      )
      .in(
        "workcase_id",
        workcaseIds,
      )
      .eq(
        "identity_verification",
        "verified",
      );

  if (
    identityError
  ) {
    throw new Error(
      `Unable to load verified claimant identities: ${identityError.message}`,
    );
  }

  const verifiedWorkcaseIds =
    new Set(
      (
        identityData ??
        []
      ).map(
        (
          row,
        ) =>
          (
            row as
              IdentityProfileRow
          ).workcase_id,
      ),
    );

  const verifiedWorkcases =
    authorizedWorkcases.filter(
      (
        row,
      ) =>
        verifiedWorkcaseIds.has(
          row.id,
        ),
    );

  if (
    verifiedWorkcases.length ===
    0
  ) {
    return {
      claimants:
        [],

      requests:
        [],

      documents:
        [],
    };
  }

  const verifiedIds =
    verifiedWorkcases.map(
      (
        row,
      ) =>
        row.id,
    );

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
          "id, workcase_id, claimant_id, kind, reason, requested_at, required, status, guidance, fulfilled_by_document_id",
        )
        .in(
          "workcase_id",
          verifiedIds,
        )
        .neq(
          "kind",
          "government_id",
        )
        .order(
          "requested_at",
          {
            ascending:
              false,
          },
        ),

      admin
        .from(
          "assigned_lead_claimant_documents",
        )
        .select(
          "id, workcase_id, claimant_id, kind, title, original_file_name, mime_type, byte_size, sensitivity, status, malware_scan_status, uploaded_at, reviewed_at, rejection_reason",
        )
        .in(
          "workcase_id",
          verifiedIds,
        )
        .neq(
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
      `Unable to list pre-Claim supporting document requests: ${requestResult.error.message}`,
    );
  }

  if (
    documentResult.error
  ) {
    throw new Error(
      `Unable to list pre-Claim supporting documents: ${documentResult.error.message}`,
    );
  }

  return {
    claimants:
      verifiedWorkcases.map(
        claimantFromRow,
      ),

    requests:
      (
        requestResult.data ??
        []
      ).map(
        (
          row,
        ) =>
          requestFromRow(
            row as
              RequestRow,
          ),
      ),

    documents:
      (
        documentResult.data ??
        []
      ).map(
        (
          row,
        ) =>
          documentFromRow(
            row as
              DocumentRow,
          ),
      ),
  };
}

/* ========================================================================== */
/* Create request                                                              */
/* ========================================================================== */

export async function createPreclaimSupportingDocumentRequest(
  input:
    CreatePreclaimSupportingDocumentRequestInput,
): Promise<
  PreclaimSupportingDocumentRequest
> {
  if (
    !isPreclaimSupportingDocumentKind(
      input.kind,
    )
  ) {
    throw new Error(
      "Select a supported pre-Claim document type.",
    );
  }

  const workcaseId =
    requiredText(
      input.workcaseId,
      "Claimant workcase",
      100,
    );

  const reason =
    requiredText(
      input.reason,
      "Request reason",
      500,
    );

  const guidance =
    optionalText(
      input.guidance,
      1_000,
    );

  const workcase =
    await getActivePreclaimWorkcaseById(
      workcaseId,
    );

  if (
    !workcase
  ) {
    throw new Error(
      "The selected active pre-Claim claimant recovery could not be found.",
    );
  }

  await requireActiveAssignmentAuthorization({
    session:
      input.session,

    workcase,
  });

  await requireVerifiedIdentity(
    workcase,
  );

  if (
    !workcase.auth_user_id
  ) {
    throw new Error(
      "The claimant portal account is not active.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data:
      existingData,
    error:
      existingError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_document_requests",
      )
      .select(
        "id",
      )
      .eq(
        "workcase_id",
        workcase.id,
      )
      .eq(
        "claimant_id",
        workcase.claimant_id,
      )
      .eq(
        "kind",
        input.kind,
      )
      .maybeSingle();

  if (
    existingError
  ) {
    throw new Error(
      `Unable to verify existing supporting document requests: ${existingError.message}`,
    );
  }

  if (
    existingData
  ) {
    throw new Error(
      `${preclaimSupportingDocumentKindLabel(
        input.kind,
      )} has already been requested for this claimant.`,
    );
  }

  const requestedAt =
    new Date()
      .toISOString();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_document_requests",
      )
      .insert({
        workcase_id:
          workcase.id,

        claimant_id:
          workcase.claimant_id,

        kind:
          input.kind,

        reason,

        requested_at:
          requestedAt,

        required:
          true,

        status:
          "outstanding",

        guidance:
          guidance ??
          null,

        fulfilled_by_document_id:
          null,
      })
      .select(
        "id, workcase_id, claimant_id, kind, reason, requested_at, required, status, guidance, fulfilled_by_document_id",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to create supporting document request: ${error.message}`,
    );
  }

  const created =
    data as
      RequestRow;

  const {
    error:
      auditError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_document_audit",
      )
      .insert({
        workcase_id:
          workcase.id,

        claimant_id:
          workcase.claimant_id,

        document_id:
          null,

        request_id:
          created.id,

        action:
          "document_request_created",

        actor_type:
          "staff",

        actor_staff_user_id:
          input.session.user.id,

        actor_claimant_auth_user_id:
          null,

        occurred_at:
          requestedAt,

        detail: {
          source:
            "staff_preclaim_supporting_documents",

          kind:
            input.kind,

          kindLabel:
            preclaimSupportingDocumentKindLabel(
              input.kind,
            ),

          reason,

          guidance:
            guidance ??
            null,
        },
      });

  if (
    auditError
  ) {
    await admin
      .from(
        "assigned_lead_claimant_document_requests",
      )
      .delete()
      .eq(
        "id",
        created.id,
      );

    throw new Error(
      `Supporting document request could not be audited: ${auditError.message}`,
    );
  }

  return requestFromRow(
    created,
  );
}

/* ========================================================================== */
/* Claimant state                                                              */
/* ========================================================================== */

export async function getPreclaimSupportingDocumentClaimantState(
  claimantId:
    string,
): Promise<
  PreclaimSupportingClaimantState | null
> {
  const normalizedClaimantId =
    requiredText(
      claimantId,
      "Claimant identity",
      200,
    );

  const workcase =
    await getActivePreclaimWorkcaseForClaimant(
      normalizedClaimantId,
    );

  if (
    !workcase
  ) {
    return null;
  }

  if (
    !workcase.auth_user_id
  ) {
    return null;
  }

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
          "id, workcase_id, claimant_id, kind, reason, requested_at, required, status, guidance, fulfilled_by_document_id",
        )
        .eq(
          "workcase_id",
          workcase.id,
        )
        .eq(
          "claimant_id",
          workcase.claimant_id,
        )
        .neq(
          "kind",
          "government_id",
        )
        .order(
          "requested_at",
          {
            ascending:
              false,
          },
        ),

      admin
        .from(
          "assigned_lead_claimant_documents",
        )
        .select(
          "id, workcase_id, claimant_id, kind, title, original_file_name, mime_type, byte_size, sensitivity, status, malware_scan_status, uploaded_at, reviewed_at, rejection_reason",
        )
        .eq(
          "workcase_id",
          workcase.id,
        )
        .eq(
          "claimant_id",
          workcase.claimant_id,
        )
        .neq(
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
      `Unable to load your supporting document requests: ${requestResult.error.message}`,
    );
  }

  if (
    documentResult.error
  ) {
    throw new Error(
      `Unable to load your supporting documents: ${documentResult.error.message}`,
    );
  }

  return {
    claimant:
      claimantFromRow(
        workcase,
      ),

    requests:
      (
        requestResult.data ??
        []
      ).map(
        (
          row,
        ) =>
          requestFromRow(
            row as
              RequestRow,
          ),
      ),

    documents:
      (
        documentResult.data ??
        []
      ).map(
        (
          row,
        ) =>
          documentFromRow(
            row as
              DocumentRow,
          ),
      ),
  };
}

/* ========================================================================== */
/* Claimant upload                                                             */
/* ========================================================================== */

export async function uploadPreclaimSupportingDocument(
  input:
    UploadPreclaimSupportingDocumentInput,
): Promise<
  PreclaimSupportingClaimantState
> {
  const claimantId =
    requiredText(
      input.claimantId,
      "Claimant identity",
      200,
    );

  const requestId =
    requiredText(
      input.requestId,
      "Document request",
      100,
    );

  const admin =
    getSupabaseAdmin();

  const {
    data:
      requestData,
    error:
      requestError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_document_requests",
      )
      .select(
        "id, workcase_id, claimant_id, kind, reason, requested_at, required, status, guidance, fulfilled_by_document_id",
      )
      .eq(
        "id",
        requestId,
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .maybeSingle();

  if (
    requestError
  ) {
    throw new Error(
      `Unable to load the supporting document request: ${requestError.message}`,
    );
  }

  if (
    !requestData
  ) {
    throw new Error(
      "The supporting document request could not be found.",
    );
  }

  const request =
    requestData as
      RequestRow;

  if (
    !isPreclaimSupportingDocumentKind(
      request.kind,
    )
  ) {
    throw new Error(
      "This upload is not a pre-Claim supporting document request.",
    );
  }

  if (
    request.status !==
      "outstanding" &&
    request.status !==
      "overdue"
  ) {
    throw new Error(
      "This supporting document request is not currently awaiting an upload.",
    );
  }

  const workcase =
    await getActivePreclaimWorkcaseById(
      request.workcase_id,
    );

  if (
    !workcase ||
    workcase.claimant_id !==
      claimantId
  ) {
    throw new Error(
      "The claimant recovery for this supporting document could not be resolved.",
    );
  }

  if (
    !workcase.auth_user_id
  ) {
    throw new Error(
      "The claimant portal account is not active.",
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
      "The selected supporting document is empty.",
    );
  }

  if (
    input.buffer.length >
    PRECLAIM_SUPPORTING_DOCUMENT_MAX_BYTES
  ) {
    throw new Error(
      "The supporting document exceeds the 15 MB limit.",
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

  const originalFileName =
    safeOriginalFileName(
      input.originalFileName,
    );

  const extension =
    extensionForMimeType(
      mimeType,
    );

  const documentId =
    randomUUID();

  const storageKey =
    [
      "preclaim",
      safePathPart(
        workcase.id,
      ),
      "supporting-documents",
      safePathPart(
        request.kind,
      ),
      `${randomUUID()}${extension}`,
    ].join(
      "/",
    );

  const uploadedAt =
    new Date()
      .toISOString();

  const sensitivity =
    sensitivityForSupportingDocument(
      request.kind,
    );

  const {
    error:
      storageError,
  } =
    await admin.storage
      .from(
        PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET,
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
      `Unable to securely store the supporting document: ${storageError.message}`,
    );
  }

  const {
    error:
      documentError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_documents",
      )
      .insert({
        id:
          documentId,

        workcase_id:
          workcase.id,

        claimant_id:
          claimantId,

        kind:
          request.kind,

        government_id_type:
          null,

        title:
          preclaimSupportingDocumentKindLabel(
            request.kind,
          ),

        original_file_name:
          originalFileName,

        mime_type:
          mimeType,

        byte_size:
          input.buffer.length,

        sensitivity,

        status:
          "uploaded",

        storage_bucket:
          PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET,

        storage_key:
          storageKey,

        malware_scan_status:
          "pending",

        malware_scanned_at:
          null,

        malware_scan_detail:
          null,

        uploaded_by_claimant_auth_user_id:
          workcase.auth_user_id,

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
    documentError
  ) {
    await admin.storage
      .from(
        PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET,
      )
      .remove([
        storageKey,
      ]);

    throw new Error(
      `Unable to register the supporting document: ${documentError.message}`,
    );
  }

  const {
    data:
      updatedRequest,
    error:
      updateError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_document_requests",
      )
      .update({
        status:
          "received",
      })
      .eq(
        "id",
        request.id,
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .in(
        "status",
        [
          "outstanding",
          "overdue",
        ],
      )
      .select(
        "id",
      )
      .maybeSingle();

  if (
    updateError ||
    !updatedRequest
  ) {
    await admin
      .from(
        "assigned_lead_claimant_documents",
      )
      .delete()
      .eq(
        "id",
        documentId,
      );

    await admin.storage
      .from(
        PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET,
      )
      .remove([
        storageKey,
      ]);

    throw new Error(
      updateError?.message ??
      "This supporting document request changed before the upload could be completed. Reload and try again.",
    );
  }

  const {
    error:
      auditError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_document_audit",
      )
      .insert({
        workcase_id:
          workcase.id,

        claimant_id:
          claimantId,

        document_id:
          documentId,

        request_id:
          request.id,

        action:
          "document_uploaded",

        actor_type:
          "claimant",

        actor_staff_user_id:
          null,

        actor_claimant_auth_user_id:
          workcase.auth_user_id,

        occurred_at:
          uploadedAt,

        detail: {
          source:
            "my_duequity_preclaim_supporting_documents",

          kind:
            request.kind,

          kindLabel:
            preclaimSupportingDocumentKindLabel(
              request.kind,
            ),

          originalFileName,

          mimeType,

          byteSize:
            input.buffer.length,

          safetyStatus:
            "pending",
        },
      });

  if (
    auditError
  ) {
    await admin
      .from(
        "assigned_lead_claimant_document_requests",
      )
      .update({
        status:
          request.status,
      })
      .eq(
        "id",
        request.id,
      )
      .eq(
        "status",
        "received",
      );

    await admin
      .from(
        "assigned_lead_claimant_documents",
      )
      .delete()
      .eq(
        "id",
        documentId,
      );

    await admin.storage
      .from(
        PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET,
      )
      .remove([
        storageKey,
      ]);

    throw new Error(
      `Supporting document upload could not be audited: ${auditError.message}`,
    );
  }

  const refreshed =
    await getPreclaimSupportingDocumentClaimantState(
      claimantId,
    );

  if (
    !refreshed
  ) {
    throw new Error(
      "The supporting document was uploaded, but the claimant recovery could not be reloaded.",
    );
  }

  return refreshed;
}