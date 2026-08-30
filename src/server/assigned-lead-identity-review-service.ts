import "server-only";

import {
  spawn,
} from "node:child_process";

import {
  access,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  constants as fsConstants,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import type {
  StaffSession,
} from "@/lib/session";

import {
  can,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const CLAIM_DOCUMENT_STORAGE_BUCKET =
  "claim-documents";

const MAX_DOCUMENT_BYTES =
  15 * 1024 * 1024;

const REVIEW_ROLES =
  new Set([
    "claims_manager",
    "administrator",
    "super_admin",
  ]);

const ADMIN_ROLES =
  new Set([
    "administrator",
    "super_admin",
  ]);

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type AssignedLeadIdentityDocumentStatus =
  | "uploaded"
  | "scanning"
  | "under_review"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

export type AssignedLeadIdentitySafetyStatus =
  | "pending"
  | "clean"
  | "rejected"
  | "unsafe";

export type AssignedLeadIdentityVerificationStatus =
  | "not_started"
  | "documents_requested"
  | "under_review"
  | "verified"
  | "failed"
  | "manual_review";

export interface AssignedLeadIdentityReviewItem {
  documentId:
    string;

  workcaseId:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  legalName:
    string;

  assignedStaffUserId:
    string;

  assignedStaffName:
    string;

  identityVerification:
    AssignedLeadIdentityVerificationStatus;

  identityVerifiedAt?:
    string;

  requestStatus?:
    string;

  governmentIdType:
    string;

  governmentIdTypeLabel:
    string;

  title:
    string;

  originalFileName:
    string;

  mimeType:
    string;

  byteSize:
    number;

  status:
    AssignedLeadIdentityDocumentStatus;

  safetyStatus:
    AssignedLeadIdentitySafetyStatus;

  safetyScannedAt?:
    string;

  safetyDetail?:
    string;

  uploadedAt:
    string;

  reviewedAt?:
    string;

  reviewedByStaffUserId?:
    string;

  reviewedByStaffName?:
    string;

  rejectionReason?:
    string;

  canRunSafetyScan:
    boolean;

  canReview:
    boolean;

  canOpenFile:
    boolean;
}

export interface AssignedLeadIdentityFile {
  bytes:
    Uint8Array;

  fileName:
    string;

  mimeType:
    string;
}

export interface ReviewAssignedLeadIdentityInput {
  session:
    StaffSession;

  documentId:
    string;

  decision:
    | "accepted"
    | "rejected";

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
/* Database rows                                                               */
/* ========================================================================== */

interface WorkcaseRow {
  id:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  discovered_record_id:
    string;

  assigned_staff_user_id:
    string;

  legal_first_name:
    string;

  legal_last_name:
    string;

  status:
    string;
}

interface IdentityProfileRow {
  workcase_id:
    string;

  claimant_id:
    string;

  identity_verification:
    AssignedLeadIdentityVerificationStatus;

  identity_verified_at:
    string | null;
}

interface DocumentRequestRow {
  id:
    string;

  workcase_id:
    string;

  claimant_id:
    string;

  status:
    string;
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

  government_id_type:
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
    string;

  status:
    AssignedLeadIdentityDocumentStatus;

  storage_bucket:
    string;

  storage_key:
    string;

  malware_scan_status:
    AssignedLeadIdentitySafetyStatus;

  malware_scanned_at:
    string | null;

  malware_scan_detail:
    string | null;

  uploaded_at:
    string;

  reviewed_by_staff_user_id:
    string | null;

  reviewed_at:
    string | null;

  rejection_reason:
    string | null;
}

interface StaffRow {
  id:
    string;

  name:
    string;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function requiredText(
  value:
    string,
  label:
    string,
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

  return normalized;
}

function requiredUuid(
  value:
    string,
  label:
    string,
): string {
  const normalized =
    requiredText(
      value,
      label,
    );

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return normalized;
}

function legalName(
  workcase:
    WorkcaseRow,
): string {
  return [
    workcase
      .legal_first_name,
    workcase
      .legal_last_name,
  ]
    .map(
      (
        value,
      ) =>
        value.trim(),
    )
    .filter(
      Boolean,
    )
    .join(
      " ",
    );
}

function governmentIdTypeLabel(
  value:
    string,
): string {
  switch (
    value
  ) {
    case "drivers_license":
      return "Driver's License";

    case "us_passport":
      return "U.S. Passport";

    case "state_id":
      return "State ID";

    case "other_government_photo_id":
      return "Other government photo ID";

    default:
      return value
        .replaceAll(
          "_",
          " ",
        )
        .replace(
          /\b\w/g,
          (
            character,
          ) =>
            character.toUpperCase(),
        );
  }
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function isAdmin(
  session:
    StaffSession,
): boolean {
  return ADMIN_ROLES.has(
    session.user.role,
  );
}

function requireIdentityReadAuthority(
  session:
    StaffSession,
): void {
  if (
    session.user.status !==
    "active"
  ) {
    throw new Error(
      "An active DueQuity staff account is required.",
    );
  }

  if (
    !REVIEW_ROLES.has(
      session.user.role,
    )
  ) {
    throw new Error(
      "Your DueQuity role is not authorized to access restricted claimant identity evidence.",
    );
  }

  if (
    !can(
      session,
      "claimant.read",
    ) ||
    !can(
      session,
      "document.read",
    )
  ) {
    throw new Error(
      "Your DueQuity role is not authorized to read claimant identity evidence.",
    );
  }

  if (
    !isAdmin(
      session,
    ) &&
    !can(
      session,
      "document.read_restricted",
    )
  ) {
    throw new Error(
      "Restricted document access is required to review claimant identity evidence.",
    );
  }
}

function requireIdentityReviewAuthority(
  session:
    StaffSession,
): void {
  requireIdentityReadAuthority(
    session,
  );

  if (
    !isAdmin(
      session,
    ) &&
    !can(
      session,
      "document.review",
    )
  ) {
    throw new Error(
      "Document review permission is required to process claimant identity evidence.",
    );
  }
}

/* ========================================================================== */
/* Work authorization                                                          */
/* ========================================================================== */

async function hasActiveLeadAuthorization(
  session:
    StaffSession,
  discoveredRecordId:
    string,
): Promise<
  boolean
> {
  if (
    isAdmin(
      session,
    )
  ) {
    return true;
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
          discoveredRecordId,

        p_opportunity_id:
          null,

        p_claim_id:
          null,
      },
    );

  if (
    error
  ) {
    throw new Error(
      `Unable to verify claimant work authorization: ${error.message}`,
    );
  }

  return data ===
    true;
}

async function assertWorkcaseAuthority(
  session:
    StaffSession,
  workcase:
    WorkcaseRow,
): Promise<
  void
> {
  if (
    workcase.status !==
    "activated"
  ) {
    throw new Error(
      "Identity review is available only for an active pre-Claim claimant account.",
    );
  }

  if (
    isAdmin(
      session,
    )
  ) {
    return;
  }

  if (
    workcase
      .assigned_staff_user_id !==
    session.user.id
  ) {
    throw new Error(
      "The selected claimant identity record could not be found.",
    );
  }

  if (
    !(
      await hasActiveLeadAuthorization(
        session,
        workcase
          .discovered_record_id,
      )
    )
  ) {
    throw new Error(
      "The active Admin-assigned authorization for this claimant could not be verified.",
    );
  }
}

/* ========================================================================== */
/* Row readers                                                                 */
/* ========================================================================== */

async function getWorkcase(
  workcaseId:
    string,
): Promise<
  WorkcaseRow
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
        [
          "id",
          "claimant_id",
          "claimant_reference",
          "discovered_record_id",
          "assigned_staff_user_id",
          "legal_first_name",
          "legal_last_name",
          "status",
        ].join(
          ", ",
        ),
      )
      .eq(
        "id",
        workcaseId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve claimant workcase: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "The claimant workcase could not be found.",
    );
  }

  return data as unknown as
    WorkcaseRow;
}

async function getDocumentRow(
  documentId:
    string,
): Promise<
  DocumentRow
> {
  const normalizedDocumentId =
    requiredUuid(
      documentId,
      "Document ID",
    );

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_documents",
      )
      .select(
        [
          "id",
          "workcase_id",
          "claimant_id",
          "kind",
          "government_id_type",
          "title",
          "original_file_name",
          "mime_type",
          "byte_size",
          "sensitivity",
          "status",
          "storage_bucket",
          "storage_key",
          "malware_scan_status",
          "malware_scanned_at",
          "malware_scan_detail",
          "uploaded_at",
          "reviewed_by_staff_user_id",
          "reviewed_at",
          "rejection_reason",
        ].join(
          ", ",
        ),
      )
      .eq(
        "id",
        normalizedDocumentId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve claimant identity document: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "The claimant identity document could not be found.",
    );
  }

  return data as unknown as
    DocumentRow;
}

async function getIdentityProfile(
  workcaseId:
    string,
  claimantId:
    string,
): Promise<
  IdentityProfileRow | null
> {
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
        "workcase_id, claimant_id, identity_verification, identity_verified_at",
      )
      .eq(
        "workcase_id",
        workcaseId,
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
      `Unable to resolve claimant identity profile: ${error.message}`,
    );
  }

  return data
    ? data as unknown as
        IdentityProfileRow
    : null;
}

async function getDocumentRequest(
  workcaseId:
    string,
  claimantId:
    string,
): Promise<
  DocumentRequestRow | null
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_document_requests",
      )
      .select(
        "id, workcase_id, claimant_id, status",
      )
      .eq(
        "workcase_id",
        workcaseId,
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .eq(
        "kind",
        "government_id",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve government-ID request: ${error.message}`,
    );
  }

  return data
    ? data as unknown as
        DocumentRequestRow
    : null;
}

async function staffNames(
  ids:
    string[],
): Promise<
  Map<
    string,
    string
  >
> {
  const uniqueIds =
    [
      ...new Set(
        ids.filter(
          Boolean,
        ),
      ),
    ];

  const result =
    new Map<
      string,
      string
    >();

  if (
    uniqueIds.length ===
    0
  ) {
    return result;
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id, name",
      )
      .in(
        "id",
        uniqueIds,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve staff attribution: ${error.message}`,
    );
  }

  for (
    const rawRow of
      data ??
      []
  ) {
    const row =
      rawRow as unknown as
        StaffRow;

    result.set(
      row.id,
      row.name,
    );
  }

  return result;
}

/* ========================================================================== */
/* Item builder                                                                */
/* ========================================================================== */

function reviewItem({
  workcase,
  identity,
  request,
  document,
  names,
}: {
  workcase:
    WorkcaseRow;

  identity:
    IdentityProfileRow | null;

  request:
    DocumentRequestRow | null;

  document:
    DocumentRow;

  names:
    Map<
      string,
      string
    >;
}): AssignedLeadIdentityReviewItem {
  const byteSize =
    Number(
      document.byte_size,
    );

  if (
    !Number.isSafeInteger(
      byteSize,
    ) ||
    byteSize <=
      0
  ) {
    throw new Error(
      "The claimant identity document contains an invalid file size.",
    );
  }

  const safetyClean =
    document
      .malware_scan_status ===
    "clean";

  const readyForHumanReview =
    document.status ===
      "under_review" &&
    safetyClean;

  const fileMayOpen =
    safetyClean &&
    (
      document.status ===
        "under_review" ||
      document.status ===
        "accepted"
    );

  return {
    documentId:
      document.id,

    workcaseId:
      workcase.id,

    claimantId:
      workcase.claimant_id,

    claimantReference:
      workcase
        .claimant_reference,

    legalName:
      legalName(
        workcase,
      ),

    assignedStaffUserId:
      workcase
        .assigned_staff_user_id,

    assignedStaffName:
      names.get(
        workcase
          .assigned_staff_user_id,
      ) ??
      "Assigned DueQuity staff",

    identityVerification:
      identity
        ?.identity_verification ??
      "documents_requested",

    identityVerifiedAt:
      identity
        ?.identity_verified_at ??
      undefined,

    requestStatus:
      request?.status,

    governmentIdType:
      document
        .government_id_type,

    governmentIdTypeLabel:
      governmentIdTypeLabel(
        document
          .government_id_type,
      ),

    title:
      document.title,

    originalFileName:
      document
        .original_file_name ??
      document.title,

    mimeType:
      document.mime_type,

    byteSize,

    status:
      document.status,

    safetyStatus:
      document
        .malware_scan_status,

    safetyScannedAt:
      document
        .malware_scanned_at ??
      undefined,

    safetyDetail:
      document
        .malware_scan_detail ??
      undefined,

    uploadedAt:
      document.uploaded_at,

    reviewedAt:
      document
        .reviewed_at ??
      undefined,

    reviewedByStaffUserId:
      document
        .reviewed_by_staff_user_id ??
      undefined,

    reviewedByStaffName:
      document
        .reviewed_by_staff_user_id
        ? names.get(
            document
              .reviewed_by_staff_user_id,
          )
        : undefined,

    rejectionReason:
      document
        .rejection_reason ??
      undefined,

    canRunSafetyScan:
      document.status ===
        "uploaded" &&
      document
        .malware_scan_status !==
        "unsafe",

    canReview:
      readyForHumanReview,

    canOpenFile:
      fileMayOpen,
  };
}

/* ========================================================================== */
/* Single authorized item                                                      */
/* ========================================================================== */

export async function getAssignedLeadIdentityReviewItem(
  session:
    StaffSession,
  documentId:
    string,
): Promise<
  AssignedLeadIdentityReviewItem
> {
  requireIdentityReadAuthority(
    session,
  );

  const document =
    await getDocumentRow(
      documentId,
    );

  const workcase =
    await getWorkcase(
      document.workcase_id,
    );

  await assertWorkcaseAuthority(
    session,
    workcase,
  );

  if (
    document.claimant_id !==
    workcase.claimant_id
  ) {
    throw new Error(
      "Claimant identity-document ownership is inconsistent.",
    );
  }

  if (
    document.kind !==
      "government_id" ||
    document.sensitivity !==
      "restricted"
  ) {
    throw new Error(
      "The selected file is not supported claimant identity evidence.",
    );
  }

  const [
    identity,
    request,
  ] =
    await Promise.all([
      getIdentityProfile(
        workcase.id,
        workcase.claimant_id,
      ),

      getDocumentRequest(
        workcase.id,
        workcase.claimant_id,
      ),
    ]);

  const names =
    await staffNames([
      workcase
        .assigned_staff_user_id,

      document
        .reviewed_by_staff_user_id ??
        "",
    ]);

  return reviewItem({
    workcase,
    identity,
    request,
    document,
    names,
  });
}

/* ========================================================================== */
/* Staff queue                                                                 */
/* ========================================================================== */

export async function listAssignedLeadIdentityReviewQueue(
  session:
    StaffSession,
): Promise<
  AssignedLeadIdentityReviewItem[]
> {
  requireIdentityReadAuthority(
    session,
  );

  const admin =
    getSupabaseAdmin();

  let workcaseQuery =
    admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        [
          "id",
          "claimant_id",
          "claimant_reference",
          "discovered_record_id",
          "assigned_staff_user_id",
          "legal_first_name",
          "legal_last_name",
          "status",
        ].join(
          ", ",
        ),
      )
      .eq(
        "status",
        "activated",
      );

  if (
    !isAdmin(
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
      rawWorkcases,
    error:
      workcaseError,
  } =
    await workcaseQuery;

  if (
    workcaseError
  ) {
    throw new Error(
      `Unable to load assigned claimant workcases: ${workcaseError.message}`,
    );
  }

  let workcases =
    (
      rawWorkcases ??
      []
    ) as unknown as
      WorkcaseRow[];

  if (
    !isAdmin(
      session,
    )
  ) {
    const authorizationResults =
      await Promise.all(
        workcases.map(
          async (
            workcase,
          ) => ({
            workcase,

            authorized:
              await hasActiveLeadAuthorization(
                session,
                workcase
                  .discovered_record_id,
              ),
          }),
        ),
      );

    workcases =
      authorizationResults
        .filter(
          (
            result,
          ) =>
            result.authorized,
        )
        .map(
          (
            result,
          ) =>
            result.workcase,
        );
  }

  if (
    workcases.length ===
    0
  ) {
    return [];
  }

  const workcaseIds =
    workcases.map(
      (
        workcase,
      ) =>
        workcase.id,
    );

  const [
    identityResult,
    requestResult,
    documentResult,
  ] =
    await Promise.all([
      admin
        .from(
          "assigned_lead_claimant_identity_profiles",
        )
        .select(
          "workcase_id, claimant_id, identity_verification, identity_verified_at",
        )
        .in(
          "workcase_id",
          workcaseIds,
        ),

      admin
        .from(
          "assigned_lead_claimant_document_requests",
        )
        .select(
          "id, workcase_id, claimant_id, status",
        )
        .in(
          "workcase_id",
          workcaseIds,
        )
        .eq(
          "kind",
          "government_id",
        ),

      admin
        .from(
          "assigned_lead_claimant_documents",
        )
        .select(
          [
            "id",
            "workcase_id",
            "claimant_id",
            "kind",
            "government_id_type",
            "title",
            "original_file_name",
            "mime_type",
            "byte_size",
            "sensitivity",
            "status",
            "storage_bucket",
            "storage_key",
            "malware_scan_status",
            "malware_scanned_at",
            "malware_scan_detail",
            "uploaded_at",
            "reviewed_by_staff_user_id",
            "reviewed_at",
            "rejection_reason",
          ].join(
            ", ",
          ),
        )
        .in(
          "workcase_id",
          workcaseIds,
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
    identityResult.error
  ) {
    throw new Error(
      `Unable to load claimant identity profiles: ${identityResult.error.message}`,
    );
  }

  if (
    requestResult.error
  ) {
    throw new Error(
      `Unable to load claimant identity requests: ${requestResult.error.message}`,
    );
  }

  if (
    documentResult.error
  ) {
    throw new Error(
      `Unable to load claimant identity documents: ${documentResult.error.message}`,
    );
  }

  const identities =
    (
      identityResult.data ??
      []
    ) as unknown as
      IdentityProfileRow[];

  const requests =
    (
      requestResult.data ??
      []
    ) as unknown as
      DocumentRequestRow[];

  const documents =
    (
      documentResult.data ??
      []
    ) as unknown as
      DocumentRow[];

  const latestDocumentByWorkcase =
    new Map<
      string,
      DocumentRow
    >();

  for (
    const document of
      documents
  ) {
    if (
      !latestDocumentByWorkcase.has(
        document.workcase_id,
      )
    ) {
      latestDocumentByWorkcase.set(
        document.workcase_id,
        document,
      );
    }
  }

  const reviewerIds =
    documents
      .map(
        (
          document,
        ) =>
          document
            .reviewed_by_staff_user_id ??
          "",
      )
      .filter(
        Boolean,
      );

  const names =
    await staffNames([
      ...workcases.map(
        (
          workcase,
        ) =>
          workcase
            .assigned_staff_user_id,
      ),

      ...reviewerIds,
    ]);

  const items:
    AssignedLeadIdentityReviewItem[] =
    [];

  for (
    const workcase of
      workcases
  ) {
    const document =
      latestDocumentByWorkcase.get(
        workcase.id,
      );

    if (
      !document
    ) {
      continue;
    }

    const identity =
      identities.find(
        (
          row,
        ) =>
          row.workcase_id ===
            workcase.id &&
          row.claimant_id ===
            workcase.claimant_id,
      ) ??
      null;

    const request =
      requests.find(
        (
          row,
        ) =>
          row.workcase_id ===
            workcase.id &&
          row.claimant_id ===
            workcase.claimant_id,
      ) ??
      null;

    items.push(
      reviewItem({
        workcase,
        identity,
        request,
        document,
        names,
      }),
    );
  }

  return items.sort(
    (
      left,
      right,
    ) =>
      right.uploadedAt.localeCompare(
        left.uploadedAt,
      ),
  );
}

/* ========================================================================== */
/* Secure file access                                                          */
/* ========================================================================== */

export async function getAssignedLeadIdentityFileForStaff(
  session:
    StaffSession,
  documentId:
    string,
): Promise<
  AssignedLeadIdentityFile
> {
  const item =
    await getAssignedLeadIdentityReviewItem(
      session,
      documentId,
    );

  if (
    !item.canOpenFile
  ) {
    throw new Error(
      "The restricted identity file cannot be opened until the safety check has passed.",
    );
  }

  const document =
    await getDocumentRow(
      documentId,
    );

  if (
    document.storage_bucket !==
    CLAIM_DOCUMENT_STORAGE_BUCKET
  ) {
    throw new Error(
      "The identity file is stored outside the approved private document bucket.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        document.storage_bucket,
      )
      .download(
        document.storage_key,
      );

  if (
    error ||
    !data
  ) {
    throw new Error(
      error
        ? `Unable to retrieve the restricted identity file: ${error.message}`
        : "Unable to retrieve the restricted identity file.",
    );
  }

  const bytes =
    new Uint8Array(
      await data.arrayBuffer(),
    );

  if (
    bytes.byteLength !==
    Number(
      document.byte_size,
    )
  ) {
    throw new Error(
      "Stored identity-file size does not match its database record.",
    );
  }

  return {
    bytes,

    fileName:
      document
        .original_file_name ??
      document.title,

    mimeType:
      document.mime_type,
  };
}

/* ========================================================================== */
/* Microsoft Defender                                                         */
/* ========================================================================== */

interface ProcessResult {
  exitCode:
    number | null;

  stdout:
    string;

  stderr:
    string;

  timedOut:
    boolean;
}

interface SafetyScanResult {
  outcome:
    | "clean"
    | "unsafe";

  detail:
    string;
}

async function exists(
  path:
    string,
): Promise<
  boolean
> {
  try {
    await access(
      path,
      fsConstants.X_OK,
    );

    return true;
  } catch {
    return false;
  }
}

async function findMicrosoftDefenderExecutable(): Promise<
  string
> {
  if (
    process.platform !==
    "win32"
  ) {
    throw new Error(
      "The configured local Microsoft Defender scanner is available only on the Windows DueQuity validation workstation.",
    );
  }

  const programData =
    process.env.ProgramData ??
    "C:\\ProgramData";

  const platformRoot =
    join(
      programData,
      "Microsoft",
      "Windows Defender",
      "Platform",
    );

  try {
    const entries =
      await readdir(
        platformRoot,
        {
          withFileTypes:
            true,
        },
      );

    const directories =
      entries
        .filter(
          (
            entry,
          ) =>
            entry.isDirectory(),
        )
        .map(
          (
            entry,
          ) =>
            entry.name,
        )
        .sort()
        .reverse();

    for (
      const directory of
        directories
    ) {
      const candidate =
        join(
          platformRoot,
          directory,
          "MpCmdRun.exe",
        );

      if (
        await exists(
          candidate,
        )
      ) {
        return candidate;
      }
    }
  } catch {
    // Fall through to the stable Windows Defender location.
  }

  const programFiles =
    process.env.ProgramFiles ??
    "C:\\Program Files";

  const stableCandidate =
    join(
      programFiles,
      "Windows Defender",
      "MpCmdRun.exe",
    );

  if (
    await exists(
      stableCandidate,
    )
  ) {
    return stableCandidate;
  }

  throw new Error(
    "Microsoft Defender command-line scanner could not be located on this workstation.",
  );
}

function runProcess(
  command:
    string,
  args:
    string[],
  timeoutMs =
    120_000,
): Promise<
  ProcessResult
> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const child =
        spawn(
          command,
          args,
          {
            windowsHide:
              true,

            shell:
              false,
          },
        );

      let stdout =
        "";

      let stderr =
        "";

      let timedOut =
        false;

      const timeout =
        setTimeout(
          () => {
            timedOut =
              true;

            child.kill();
          },
          timeoutMs,
        );

      child.stdout.on(
        "data",
        (
          chunk,
        ) => {
          stdout +=
            String(
              chunk,
            );
        },
      );

      child.stderr.on(
        "data",
        (
          chunk,
        ) => {
          stderr +=
            String(
              chunk,
            );
        },
      );

      child.once(
        "error",
        (
          error,
        ) => {
          clearTimeout(
            timeout,
          );

          reject(
            error,
          );
        },
      );

      child.once(
        "close",
        (
          exitCode,
        ) => {
          clearTimeout(
            timeout,
          );

          resolve({
            exitCode,

            stdout,

            stderr,

            timedOut,
          });
        },
      );
    },
  );
}

function defenderReportedThreat(
  result:
    ProcessResult,
): boolean {
  const output =
    `${result.stdout}\n${result.stderr}`;

  return (
    /found\s+[1-9]\d*\s+threat/i.test(
      output,
    ) ||
    /threats?\s+(?:was|were\s+)?found/i.test(
      output,
    ) ||
    /threat\s+detected/i.test(
      output,
    )
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
        "The identity file has an unsupported media type.",
      );
  }
}

async function runMicrosoftDefenderScan(
  document:
    DocumentRow,
): Promise<
  SafetyScanResult
> {
  const admin =
    getSupabaseAdmin();

  if (
    document.storage_bucket !==
    CLAIM_DOCUMENT_STORAGE_BUCKET
  ) {
    throw new Error(
      "The identity file is outside the approved private document bucket.",
    );
  }

  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        document.storage_bucket,
      )
      .download(
        document.storage_key,
      );

  if (
    error ||
    !data
  ) {
    throw new Error(
      error
        ? `Private identity file could not be retrieved for safety scanning: ${error.message}`
        : "Private identity file could not be retrieved for safety scanning.",
    );
  }

  const bytes =
    new Uint8Array(
      await data.arrayBuffer(),
    );

  const expectedByteSize =
    Number(
      document.byte_size,
    );

  if (
    !Number.isSafeInteger(
      expectedByteSize,
    ) ||
    expectedByteSize <=
      0
  ) {
    throw new Error(
      "The identity document contains an invalid recorded file size.",
    );
  }

  if (
    bytes.byteLength !==
    expectedByteSize
  ) {
    throw new Error(
      "Stored identity-file size does not match its database record.",
    );
  }

  if (
    bytes.byteLength >
    MAX_DOCUMENT_BYTES
  ) {
    throw new Error(
      "Stored identity file exceeds the approved 15 MB limit.",
    );
  }

  const defender =
    await findMicrosoftDefenderExecutable();

  const temporaryDirectory =
    await mkdtemp(
      join(
        tmpdir(),
        "duequity-identity-defender-",
      ),
    );

  try {
    const temporaryFile =
      join(
        temporaryDirectory,
        `identity-document${extensionForMimeType(
          document.mime_type,
        )}`,
      );

    await writeFile(
      temporaryFile,
      bytes,
      {
        flag:
          "wx",
      },
    );

    const result =
      await runProcess(
        defender,
        [
          "-Scan",
          "-ScanType",
          "3",
          "-File",
          temporaryFile,
          "-DisableRemediation",
        ],
      );

    if (
      result.timedOut
    ) {
      throw new Error(
        "Microsoft Defender safety scan timed out before a clean result could be established.",
      );
    }

    if (
      result.exitCode ===
      0
    ) {
      return {
        outcome:
          "clean",

        detail:
          "Microsoft Defender custom file scan completed with no unresolved malware detection.",
      };
    }

    if (
      result.exitCode ===
        2 &&
      defenderReportedThreat(
        result,
      )
    ) {
      return {
        outcome:
          "unsafe",

        detail:
          "Microsoft Defender reported a threat during the custom identity-document scan. The file is blocked and must be replaced.",
      };
    }

    throw new Error(
      `Microsoft Defender did not establish a clean result. Scanner exit code: ${
        result.exitCode ===
        null
          ? "unknown"
          : result.exitCode
      }.`,
    );
  } finally {
    await rm(
      temporaryDirectory,
      {
        recursive:
          true,

        force:
          true,
      },
    );
  }
}

/* ========================================================================== */
/* Safety RPC                                                                  */
/* ========================================================================== */

export async function runAssignedLeadIdentitySafetyScan(
  session:
    StaffSession,
  documentId:
    string,
): Promise<
  AssignedLeadIdentityReviewItem
> {
  requireIdentityReviewAuthority(
    session,
  );

  const authorizedItem =
    await getAssignedLeadIdentityReviewItem(
      session,
      documentId,
    );

  if (
    !authorizedItem.canRunSafetyScan
  ) {
    throw new Error(
      "This identity document is not eligible for a new safety scan.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    error:
      beginError,
  } =
    await admin.rpc(
      "begin_assigned_lead_claimant_document_safety_scan",
      {
        p_document_id:
          authorizedItem.documentId,

        p_staff_user_id:
          session.user.id,
      },
    );

  if (
    beginError
  ) {
    throw new Error(
      `Unable to start the identity-document safety check: ${beginError.message}`,
    );
  }

  const scanningDocument =
    await getDocumentRow(
      authorizedItem.documentId,
    );

  try {
    const scanResult =
      await runMicrosoftDefenderScan(
        scanningDocument,
      );

    const {
      error:
        finishError,
    } =
      await admin.rpc(
        "finish_assigned_lead_claimant_document_safety_scan",
        {
          p_document_id:
            authorizedItem.documentId,

          p_staff_user_id:
            session.user.id,

          p_outcome:
            scanResult.outcome,

          p_detail:
            scanResult.detail,
        },
      );

    if (
      finishError
    ) {
      throw new Error(
        `Unable to save the identity-document safety result: ${finishError.message}`,
      );
    }
  } catch (
    scanError
  ) {
    const detail =
      scanError instanceof Error
        ? scanError.message
        : "The configured identity-document safety scanner did not establish a clean result.";

    const {
      error:
        failureSaveError,
    } =
      await admin.rpc(
        "finish_assigned_lead_claimant_document_safety_scan",
        {
          p_document_id:
            authorizedItem.documentId,

          p_staff_user_id:
            session.user.id,

          p_outcome:
            "failed",

          p_detail:
            detail,
        },
      );

    if (
      failureSaveError
    ) {
      throw new Error(
        `${detail} The blocked safety state also could not be persisted: ${failureSaveError.message}`,
      );
    }

    throw new Error(
      `${detail} The file remains blocked from human approval and may be scanned again.`,
    );
  }

  return getAssignedLeadIdentityReviewItem(
    session,
    authorizedItem.documentId,
  );
}

/* ========================================================================== */
/* Human review RPC                                                            */
/* ========================================================================== */

export async function reviewAssignedLeadIdentityDocument(
  input:
    ReviewAssignedLeadIdentityInput,
): Promise<
  AssignedLeadIdentityReviewItem
> {
  requireIdentityReviewAuthority(
    input.session,
  );

  const documentId =
    requiredUuid(
      input.documentId,
      "Document ID",
    );

  const current =
    await getAssignedLeadIdentityReviewItem(
      input.session,
      documentId,
    );

  if (
    !current.canReview
  ) {
    throw new Error(
      "Human identity review is blocked until the document has a clean safety result.",
    );
  }

  const rejectionReason =
    input.rejectionReason
      ?.trim() ??
    "";

  if (
    input.decision ===
      "rejected" &&
    !rejectionReason
  ) {
    throw new Error(
      "A rejection reason is required before requesting a replacement ID.",
    );
  }

  if (
    input.decision ===
      "accepted" &&
    !(
      input.documentTypeConfirmed ===
        true &&
      input.legibilityConfirmed ===
        true &&
      input.identityMatchConfirmed ===
        true
    )
  ) {
    throw new Error(
      "Complete all three identity-review confirmations before approving this government ID.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    error,
  } =
    await admin.rpc(
      "review_assigned_lead_claimant_government_id",
      {
        p_document_id:
          documentId,

        p_staff_user_id:
          input.session.user.id,

        p_decision:
          input.decision,

        p_rejection_reason:
          input.decision ===
            "rejected"
            ? rejectionReason
            : null,

        p_document_type_confirmed:
          input.documentTypeConfirmed ===
          true,

        p_legibility_confirmed:
          input.legibilityConfirmed ===
          true,

        p_identity_match_confirmed:
          input.identityMatchConfirmed ===
          true,
      },
    );

  if (
    error
  ) {
    throw new Error(
      `Unable to save the claimant identity review: ${error.message}`,
    );
  }

  return getAssignedLeadIdentityReviewItem(
    input.session,
    documentId,
  );
}