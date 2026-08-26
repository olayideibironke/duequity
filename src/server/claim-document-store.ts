import "server-only";

import {
  spawn,
} from "node:child_process";

import {
  randomUUID,
} from "node:crypto";

import {
  access,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import type {
  DocumentKind,
  DocumentRequest,
  DocumentSensitivity,
  DocumentStatus,
  IsoDate,
  IsoInstant,
  StoredDocument,
} from "@/domain/types";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

export const CLAIM_DOCUMENT_STORAGE_BUCKET =
  "claim-documents";

/**
 * Temporary compatibility export.
 *
 * The old upload route imports this name. It will be removed from that route
 * in the next step when file bytes move to Supabase Storage.
 */
export const CLAIM_DOCUMENT_FILE_DIRECTORY =
  CLAIM_DOCUMENT_STORAGE_BUCKET;

/* ========================================================================== */
/* Audit                                                                       */
/* ========================================================================== */

export type ClaimDocumentAuditAction =
  | "document_requests_synced"
  | "document_uploaded"
  | "document_accepted"
  | "document_rejected"
  | "document_superseded"
  | "document_request_waived";

export interface ClaimDocumentAuditEntry {
  id:
    string;

  claimId:
    string;

  documentId?:
    string;

  requestId?:
    string;

  action:
    ClaimDocumentAuditAction;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  detail?:
    string;
}

/* ========================================================================== */
/* Inputs                                                                      */
/* ========================================================================== */

export interface SyncClaimDocumentRequestsInput {
  claimId:
    string;

  requiredKinds:
    DocumentKind[];

  requestedFromClaimantId?:
    string;

  requestedAt:
    IsoDate;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;
}

export interface RegisterClaimDocumentUploadInput {
  claimId:
    string;

  claimantId?:
    string;

  kind:
    DocumentKind;

  title:
    string;

  originalFileName?:
    string;

  mimeType:
    string;

  byteSize:
    number;

  storageKey:
    string;

  uploadedByUserId?:
    string;

  uploadedByClaimantId?:
    string;

  uploadedAt:
    IsoInstant;

  actorUserId:
    string;
}

export interface ReviewClaimDocumentInput {
  documentId:
    string;

  decision:
    "accepted" |
    "rejected";

  reviewedByUserId:
    string;

  reviewedAt:
    IsoInstant;

  rejectionReason?:
    string;

  actorUserId:
    string;
}

export interface WaiveClaimDocumentRequestInput {
  requestId:
    string;

  waivedReason:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;
}

export interface SupersedeClaimDocumentInput {
  documentId:
    string;

  actorUserId:
    string;

  occurredAt:
    IsoInstant;

  detail?:
    string;
}

/* ========================================================================== */
/* Safety scan                                                                 */
/* ========================================================================== */

type MalwareScanStatus =
  | "pending"
  | "clean"
  | "rejected"
  | "unsafe";

export interface ClaimDocumentSafetyScanResult {
  document:
    StoredDocument;

  malwareScanStatus:
    MalwareScanStatus;

  scannedAt:
    IsoInstant;

  detail:
    string;

  scanner:
    "microsoft_defender";

  clean:
    boolean;

  unsafe:
    boolean;
}

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

/* ========================================================================== */
/* Readiness                                                                   */
/* ========================================================================== */

export interface ClaimDocumentReadiness {
  claimId:
    string;

  requiredRequests:
    DocumentRequest[];

  acceptedRequiredRequests:
    DocumentRequest[];

  outstandingRequiredRequests:
    DocumentRequest[];

  requiredCount:
    number;

  acceptedCount:
    number;

  outstandingCount:
    number;

  complete:
    boolean;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimDocumentRequestRow {
  id:
    string;

  claim_id:
    string;

  kind:
    DocumentKind;

  reason:
    string;

  requested_from_claimant_id:
    string | null;

  requested_at:
    string;

  due_by:
    string | null;

  required:
    boolean;

  status:
    DocumentRequest["status"];

  guidance:
    string | null;

  fulfilled_by_document_id:
    string | null;

  waived_reason:
    string | null;

  row_version:
    number | string;

  updated_at:
    string;
}

interface ClaimDocumentRow {
  id:
    string;

  claim_id:
    string;

  opportunity_id:
    string | null;

  claimant_id:
    string | null;

  kind:
    DocumentKind;

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
    DocumentStatus;

  storage_bucket:
    string;

  storage_key:
    string;

  malware_scan_status:
    MalwareScanStatus;

  malware_scanned_at:
    string | null;

  malware_scan_detail:
    string | null;

  uploaded_by_user_id:
    string | null;

  uploaded_by_claimant_id:
    string | null;

  uploaded_at:
    string;

  reviewed_by_user_id:
    string | null;

  reviewed_at:
    string | null;

  rejection_reason:
    string | null;

  page_count:
    number | null;

  expires_at:
    string | null;

  row_version:
    number | string;

  updated_at:
    string;
}

interface ClaimDocumentAuditRow {
  id:
    string;

  claim_id:
    string;

  document_id:
    string | null;

  request_id:
    string | null;

  action:
    ClaimDocumentAuditAction;

  actor_user_id:
    string;

  occurred_at:
    string;

  detail:
    string | null;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

const MAX_DOCUMENT_BYTES =
  15 *
  1024 *
  1024;

const ALLOWED_DOCUMENT_MIME_TYPES =
  new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

function requireNonEmpty(
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

function validateIsoDate(
  value:
    string,
  label:
    string,
): IsoDate {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      `${label} must be an ISO calendar date.`,
    );
  }

  return value as
    IsoDate;
}

function validateIsoInstant(
  value:
    string,
  label:
    string,
): IsoInstant {
  if (
    Number.isNaN(
      Date.parse(
        value,
      ),
    )
  ) {
    throw new Error(
      `${label} must be a valid ISO timestamp.`,
    );
  }

  return value as
    IsoInstant;
}

function validateByteSize(
  value:
    number,
): number {
  if (
    !Number.isInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      "Document byte size must be a positive integer.",
    );
  }

  if (
    value >
    MAX_DOCUMENT_BYTES
  ) {
    throw new Error(
      "Document exceeds the 15 MB upload limit.",
    );
  }

  return value;
}

function validateMimeType(
  value:
    string,
): string {
  const mimeType =
    requireNonEmpty(
      value,
      "MIME type",
    ).toLowerCase();

  if (
    !ALLOWED_DOCUMENT_MIME_TYPES.has(
      mimeType,
    )
  ) {
    throw new Error(
      "Document type is not supported. Upload PDF, JPEG, PNG, or WebP.",
    );
  }

  return mimeType;
}

function uniqueDocumentKinds(
  kinds:
    DocumentKind[],
): DocumentKind[] {
  return [
    ...new Set(
      kinds,
    ),
  ];
}

function databaseRowVersion(
  value:
    number |
    string,
): number {
  const version =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      version,
    ) ||
    version <
      1
  ) {
    throw new Error(
      "Document record has an invalid database row version.",
    );
  }

  return version;
}

/* ========================================================================== */
/* Internal workflow documents                                                */
/* ========================================================================== */

const INTERNAL_WORKFLOW_DOCUMENT_KINDS =
  new Set<DocumentKind>([
    "fee_agreement",
  ]);

export function isInternalWorkflowDocumentKind(
  kind:
    DocumentKind,
): boolean {
  return INTERNAL_WORKFLOW_DOCUMENT_KINDS.has(
    kind,
  );
}

/* ========================================================================== */
/* Government ID synchronization                                               */
/* ========================================================================== */

/**
 * Government-ID request and claimant-identity state are synchronized by the
 * database trigger attached to claim_documents.
 *
 * When a government-ID document becomes accepted, rejected, expired or
 * superseded, that trigger updates claimant_onboarding and the matching
 * government-ID request inside the same database operation.
 *
 * Application code must therefore not perform a second request mutation from
 * a request row captured before the document update. Doing so races the
 * database trigger's row_version increment and can falsely report a
 * concurrency failure after a successful operation.
 */
function databaseSynchronizesDocumentRequest(
  kind:
    DocumentKind,
): boolean {
  return kind ===
    "government_id";
}

/* ========================================================================== */
/* Sensitivity                                                                 */
/* ========================================================================== */

export function sensitivityForDocumentKind(
  kind:
    DocumentKind,
): DocumentSensitivity {
  switch (
    kind
  ) {
    case "government_id":
      return "restricted";

    case "death_certificate":
    case "probate_letters":
    case "letters_of_administration":
    case "will":
    case "trust_instrument":
    case "w9":
    case "marriage_certificate":
    case "utility_bill_proof_of_residence":
      return "sensitive";

    case "recorded_deed":
    case "court_order":
    case "agency_correspondence":
    case "lien_release":
    case "bankruptcy_discharge":
      return "public_record";

    default:
      return "internal";
  }
}

/* ========================================================================== */
/* Identifiers                                                                 */
/* ========================================================================== */

function safeIdPart(
  value:
    string,
): string {
  return value.replace(
    /[^a-zA-Z0-9_-]/g,
    "-",
  );
}

function requestIdFor(
  claimId:
    string,
  kind:
    DocumentKind,
): string {
  return [
    "doc-request",
    safeIdPart(
      claimId,
    ),
    kind,
  ].join(
    "-",
  );
}

export function createClaimDocumentId(
  claimId:
    string,
): string {
  return [
    "doc",
    safeIdPart(
      claimId,
    ),
    randomUUID(),
  ].join(
    "-",
  );
}

/* ========================================================================== */
/* Row mapping                                                                 */
/* ========================================================================== */

function requestFromRow(
  row:
    ClaimDocumentRequestRow,
): DocumentRequest {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    kind:
      row.kind,

    reason:
      row.reason,

    requestedFromClaimantId:
      row.requested_from_claimant_id ??
      undefined,

    requestedAt:
      row.requested_at as
        IsoDate,

    dueBy:
      row.due_by
        ? row.due_by as
            IsoDate
        : undefined,

    required:
      row.required,

    status:
      row.status,

    guidance:
      row.guidance ??
      undefined,

    fulfilledByDocumentId:
      row.fulfilled_by_document_id ??
      undefined,

    waivedReason:
      row.waived_reason ??
      undefined,
  };
}

function documentFromRow(
  row:
    ClaimDocumentRow,
): StoredDocument {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimantId:
      row.claimant_id ??
      undefined,

    kind:
      row.kind,

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

    storageKey:
      row.storage_key,

    uploadedByUserId:
      row.uploaded_by_user_id ??
      undefined,

    uploadedByClaimantId:
      row.uploaded_by_claimant_id ??
      undefined,

    uploadedAt:
      row.uploaded_at as
        IsoInstant,

    reviewedByUserId:
      row.reviewed_by_user_id ??
      undefined,

    reviewedAt:
      row.reviewed_at
        ? row.reviewed_at as
            IsoInstant
        : undefined,

    rejectionReason:
      row.rejection_reason ??
      undefined,
  };
}

function auditFromRow(
  row:
    ClaimDocumentAuditRow,
): ClaimDocumentAuditEntry {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    documentId:
      row.document_id ??
      undefined,

    requestId:
      row.request_id ??
      undefined,

    action:
      row.action,

    actorUserId:
      row.actor_user_id,

    occurredAt:
      row.occurred_at as
        IsoInstant,

    detail:
      row.detail ??
      undefined,
  };
}

/* ========================================================================== */
/* Database helpers                                                            */
/* ========================================================================== */

async function getRequestRow(
  requestId:
    string,
): Promise<
  ClaimDocumentRequestRow |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_document_requests",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        requestId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read document request: ${error.message}`,
    );
  }

  return data
    ? data as
        ClaimDocumentRequestRow
    : undefined;
}

async function getDocumentRow(
  documentId:
    string,
): Promise<
  ClaimDocumentRow |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_documents",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        documentId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read document: ${error.message}`,
    );
  }

  return data
    ? data as
        ClaimDocumentRow
    : undefined;
}

async function updateRequestRow(
  current:
    ClaimDocumentRequestRow,
  values:
    Record<
      string,
      unknown
    >,
): Promise<
  ClaimDocumentRequestRow
> {
  const supabase =
    getSupabaseAdmin();

  const expectedVersion =
    databaseRowVersion(
      current.row_version,
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_document_requests",
      )
      .update({
        ...values,

        row_version:
          expectedVersion +
          1,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        current.id,
      )
      .eq(
        "row_version",
        expectedVersion,
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to update document request: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Document request changed while this request was being processed. Reload and try again.",
    );
  }

  return data as
    ClaimDocumentRequestRow;
}

async function updateDocumentRow(
  current:
    ClaimDocumentRow,
  values:
    Record<
      string,
      unknown
    >,
): Promise<
  ClaimDocumentRow
> {
  const supabase =
    getSupabaseAdmin();

  const expectedVersion =
    databaseRowVersion(
      current.row_version,
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_documents",
      )
      .update({
        ...values,

        row_version:
          expectedVersion +
          1,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        current.id,
      )
      .eq(
        "row_version",
        expectedVersion,
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to update document: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Document changed while this request was being processed. Reload and try again.",
    );
  }

  return data as
    ClaimDocumentRow;
}

/* ========================================================================== */
/* Audit                                                                       */
/* ========================================================================== */

async function appendAudit(
  input: {
    claimId:
      string;

    documentId?:
      string;

    requestId?:
      string;

    action:
      ClaimDocumentAuditAction;

    actorUserId:
      string;

    occurredAt:
      IsoInstant;

    detail?:
      string;
  },
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } =
    await supabase
      .from(
        "claim_document_audit",
      )
      .insert({
        id:
          randomUUID(),

        claim_id:
          input.claimId,

        document_id:
          input.documentId ??
          null,

        request_id:
          input.requestId ??
          null,

        action:
          input.action,

        actor_user_id:
          input.actorUserId,

        occurred_at:
          input.occurredAt,

        detail:
          input.detail ??
          null,
      });

  if (
    error
  ) {
    throw new Error(
      `Unable to write document audit: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Microsoft Defender                                                         */
/* ========================================================================== */

const DEFENDER_SCAN_TIMEOUT_MS =
  120_000;

const MAX_PROCESS_OUTPUT_CHARACTERS =
  65_536;

async function fileExists(
  path:
    string,
): Promise<boolean> {
  try {
    await access(
      path,
    );

    return true;
  } catch {
    return false;
  }
}

async function findMicrosoftDefenderExecutable(): Promise<string> {
  if (
    process.platform !==
    "win32"
  ) {
    throw new Error(
      "Microsoft Defender local document scanning is available only on the Windows QA environment.",
    );
  }

  const programData =
    process.env.ProgramData ??
    "C:\\ProgramData";

  const programFiles =
    process.env.ProgramFiles ??
    "C:\\Program Files";

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

    const versions =
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
        .sort(
          (
            left,
            right,
          ) =>
            right.localeCompare(
              left,
              "en-US",
              {
                numeric:
                  true,
              },
            ),
        );

    for (
      const version of
      versions
    ) {
      const candidate =
        join(
          platformRoot,
          version,
          "MpCmdRun.exe",
        );

      if (
        await fileExists(
          candidate,
        )
      ) {
        return candidate;
      }
    }
  } catch {
    /*
     * Fall through to the legacy Program Files location.
     */
  }

  const fallback =
    join(
      programFiles,
      "Windows Defender",
      "MpCmdRun.exe",
    );

  if (
    await fileExists(
      fallback,
    )
  ) {
    return fallback;
  }

  throw new Error(
    "Microsoft Defender command-line scanner could not be located on this Windows system.",
  );
}

function appendProcessOutput(
  current:
    string,
  chunk:
    Buffer,
): string {
  if (
    current.length >=
    MAX_PROCESS_OUTPUT_CHARACTERS
  ) {
    return current;
  }

  const available =
    MAX_PROCESS_OUTPUT_CHARACTERS -
    current.length;

  return (
    current +
    chunk
      .toString(
        "utf8",
      )
      .slice(
        0,
        available,
      )
  );
}

function runProcess(
  executable:
    string,
  args:
    string[],
): Promise<
  ProcessResult
> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      let stdout =
        "";

      let stderr =
        "";

      let timedOut =
        false;

      let settled =
        false;

      const child =
        spawn(
          executable,
          args,
          {
            windowsHide:
              true,

            shell:
              false,

            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
          },
        );

      const timeout =
        setTimeout(
          () => {
            timedOut =
              true;

            child.kill();
          },
          DEFENDER_SCAN_TIMEOUT_MS,
        );

      child.stdout.on(
        "data",
        (
          chunk:
            Buffer,
        ) => {
          stdout =
            appendProcessOutput(
              stdout,
              chunk,
            );
        },
      );

      child.stderr.on(
        "data",
        (
          chunk:
            Buffer,
        ) => {
          stderr =
            appendProcessOutput(
              stderr,
              chunk,
            );
        },
      );

      child.on(
        "error",
        (
          error,
        ) => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          clearTimeout(
            timeout,
          );

          reject(
            error,
          );
        },
      );

      child.on(
        "close",
        (
          code,
        ) => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          clearTimeout(
            timeout,
          );

          resolve({
            exitCode:
              code,

            stdout,

            stderr,

            timedOut,
          });
        },
      );
    },
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
      return ".bin";
  }
}

function defenderReportedThreat(
  result:
    ProcessResult,
): boolean {
  const output =
    `${result.stdout}\n${result.stderr}`
      .toLowerCase();

  if (
    /detected\s+[1-9]\d*\s+threat/.test(
      output,
    )
  ) {
    return true;
  }

  if (
    /found\s+[1-9]\d*\s+threat/.test(
      output,
    )
  ) {
    return true;
  }

  if (
    output.includes(
      "malware found",
    )
  ) {
    return true;
  }

  if (
    output.includes(
      "threat detected",
    )
  ) {
    return true;
  }

  return false;
}

function cleanSafetyResult(
  row:
    ClaimDocumentRow,
): ClaimDocumentSafetyScanResult {
  if (
    row.malware_scan_status !==
      "clean" ||
    !row.malware_scanned_at
  ) {
    throw new Error(
      "Document does not contain a completed clean safety result.",
    );
  }

  return {
    document:
      documentFromRow(
        row,
      ),

    malwareScanStatus:
      "clean",

    scannedAt:
      row.malware_scanned_at as
        IsoInstant,

    detail:
      row.malware_scan_detail ??
      "Microsoft Defender safety scan completed with no unresolved malware detection.",

    scanner:
      "microsoft_defender",

    clean:
      true,

    unsafe:
      false,
  };
}

async function recordScannerFailure(
  scanningRow:
    ClaimDocumentRow,
  detail:
    string,
): Promise<
  ClaimDocumentRow
> {
  const scannedAt =
    new Date()
      .toISOString();

  return updateDocumentRow(
    scanningRow,
    {
      status:
        "uploaded",

      malware_scan_status:
        "rejected",

      malware_scanned_at:
        scannedAt,

      malware_scan_detail:
        detail,
    },
  );
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listClaimDocumentRequests(
  claimId:
    string,
): Promise<
  DocumentRequest[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_document_requests",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId,
      )
      .order(
        "kind",
        {
          ascending:
            true,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to list document requests: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      requestFromRow(
        row as
          ClaimDocumentRequestRow,
      ),
  );
}

export async function getClaimDocumentRequest(
  requestId:
    string,
): Promise<
  DocumentRequest |
  undefined
> {
  const row =
    await getRequestRow(
      requestId,
    );

  return row
    ? requestFromRow(
        row,
      )
    : undefined;
}

export async function listClaimDocuments(
  claimId:
    string,
): Promise<
  StoredDocument[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_documents",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId,
      )
      .order(
        "uploaded_at",
        {
          ascending:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to list claim documents: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      documentFromRow(
        row as
          ClaimDocumentRow,
      ),
  );
}

export async function getClaimDocument(
  documentId:
    string,
): Promise<
  StoredDocument |
  undefined
> {
  const row =
    await getDocumentRow(
      documentId,
    );

  return row
    ? documentFromRow(
        row,
      )
    : undefined;
}

export async function claimDocumentAudit(
  claimId?:
    string,
): Promise<
  ClaimDocumentAuditEntry[]
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claim_document_audit",
      )
      .select(
        "*",
      )
      .order(
        "occurred_at",
        {
          ascending:
            false,
        },
      );

  if (
    claimId
  ) {
    query =
      query.eq(
        "claim_id",
        claimId,
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (
    error
  ) {
    throw new Error(
      `Unable to read document audit: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      auditFromRow(
        row as
          ClaimDocumentAuditRow,
      ),
  );
}

/* ========================================================================== */
/* Microsoft Defender safety scan                                              */
/* ========================================================================== */

export async function runClaimDocumentSafetyScan(
  documentId:
    string,
): Promise<
  ClaimDocumentSafetyScanResult
> {
  const normalizedDocumentId =
    requireNonEmpty(
      documentId,
      "Document ID",
    );

  const current =
    await getDocumentRow(
      normalizedDocumentId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Document not found.",
    );
  }

  if (
    current.storage_bucket !==
    CLAIM_DOCUMENT_STORAGE_BUCKET
  ) {
    throw new Error(
      "Document is stored outside the approved private claim-document bucket.",
    );
  }

  if (
    current.status ===
      "superseded" ||
    current.status ===
      "expired"
  ) {
    throw new Error(
      "This document is no longer eligible for a safety scan.",
    );
  }

  if (
    current.malware_scan_status ===
      "clean"
  ) {
    return cleanSafetyResult(
      current,
    );
  }

  if (
    current.malware_scan_status ===
      "unsafe"
  ) {
    throw new Error(
      "This document was previously identified as unsafe and must be replaced.",
    );
  }

  const scanningRow =
    await updateDocumentRow(
      current,
      {
        status:
          "scanning",

        malware_scan_status:
          "pending",

        malware_scanned_at:
          null,

        malware_scan_detail:
          null,
      },
    );

  let temporaryDirectory:
    string |
    undefined;

  try {
    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } =
      await supabase.storage
        .from(
          CLAIM_DOCUMENT_STORAGE_BUCKET,
        )
        .download(
          scanningRow.storage_key,
        );

    if (
      error
    ) {
      throw new Error(
        `Private document could not be retrieved for safety scanning: ${error.message}`,
      );
    }

    if (
      !data
    ) {
      throw new Error(
        "Private document could not be retrieved for safety scanning.",
      );
    }

    const bytes =
      new Uint8Array(
        await data.arrayBuffer(),
      );

    const expectedByteSize =
      Number(
        scanningRow.byte_size,
      );

    if (
      !Number.isSafeInteger(
        expectedByteSize,
      ) ||
      expectedByteSize <=
        0
    ) {
      throw new Error(
        "Document record contains an invalid byte size.",
      );
    }

    if (
      bytes.byteLength !==
      expectedByteSize
    ) {
      throw new Error(
        "Stored document byte size does not match its database record.",
      );
    }

    if (
      bytes.byteLength >
      MAX_DOCUMENT_BYTES
    ) {
      throw new Error(
        "Stored document exceeds the approved 15 MB safety limit.",
      );
    }

    const defenderExecutable =
      await findMicrosoftDefenderExecutable();

    temporaryDirectory =
      await mkdtemp(
        join(
          tmpdir(),
          "duequity-defender-",
        ),
      );

    const temporaryFile =
      join(
        temporaryDirectory,
        `document${extensionForMimeType(
          scanningRow.mime_type,
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

    /*
     * Microsoft Defender custom scan:
     *
     * -ScanType 3         = custom scan
     * -File               = scan only this temporary copy
     * -DisableRemediation = do not alter the file after detection
     *
     * The original claimant document remains private in Supabase Storage.
     */
    const result =
      await runProcess(
        defenderExecutable,
        [
          "-Scan",
          "-ScanType",
          "3",
          "-File",
          temporaryFile,
          "-DisableRemediation",
        ],
      );

    const scannedAt =
      new Date()
        .toISOString() as
        IsoInstant;

    if (
      result.timedOut
    ) {
      await recordScannerFailure(
        scanningRow,
        "Microsoft Defender safety scan timed out before a clean result could be established.",
      );

      throw new Error(
        "Microsoft Defender safety scan timed out. The document remains blocked and may be scanned again.",
      );
    }

    if (
      result.exitCode ===
      0
    ) {
      const updated =
        await updateDocumentRow(
          scanningRow,
          {
            status:
              "under_review",

            malware_scan_status:
              "clean",

            malware_scanned_at:
              scannedAt,

            malware_scan_detail:
              "Microsoft Defender custom file scan completed with no unresolved malware detection.",
          },
        );

      return {
        document:
          documentFromRow(
            updated,
          ),

        malwareScanStatus:
          "clean",

        scannedAt,

        detail:
          "Microsoft Defender custom file scan completed with no unresolved malware detection.",

        scanner:
          "microsoft_defender",

        clean:
          true,

        unsafe:
          false,
      };
    }

    if (
      result.exitCode ===
        2 &&
      defenderReportedThreat(
        result,
      )
    ) {
      const updated =
        await updateDocumentRow(
          scanningRow,
          {
            status:
              "rejected",

            malware_scan_status:
              "unsafe",

            malware_scanned_at:
              scannedAt,

            malware_scan_detail:
              "Microsoft Defender reported a threat during the custom document scan. The document is blocked and must be replaced.",

            rejection_reason:
              "Automated safety scan identified the uploaded file as unsafe. Upload a replacement document.",
          },
        );

      return {
        document:
          documentFromRow(
            updated,
          ),

        malwareScanStatus:
          "unsafe",

        scannedAt,

        detail:
          "Microsoft Defender reported a threat during the custom document scan. The document is blocked and must be replaced.",

        scanner:
          "microsoft_defender",

        clean:
          false,

        unsafe:
          true,
      };
    }

    const exitCodeText =
      result.exitCode ===
        null
        ? "unknown"
        : String(
            result.exitCode,
          );

    await recordScannerFailure(
      scanningRow,
      `Microsoft Defender custom scan did not establish a clean result. Scanner exit code: ${exitCodeText}.`,
    );

    throw new Error(
      `Microsoft Defender did not establish a clean safety result. Scanner exit code: ${exitCodeText}. The document remains blocked and may be scanned again.`,
    );
  } catch (
    scanError
  ) {
    const latest =
      await getDocumentRow(
        scanningRow.id,
      );

    if (
      latest &&
      latest.status ===
        "scanning" &&
      latest.malware_scan_status ===
        "pending"
    ) {
      try {
        await recordScannerFailure(
          latest,
          "Microsoft Defender safety scan could not complete. No clean result was recorded.",
        );
      } catch {
        /*
         * Preserve the original scan error. A later retry or staff refresh can
         * resolve a concurrent row-version change.
         */
      }
    }

    throw scanError;
  } finally {
    if (
      temporaryDirectory
    ) {
      try {
        await rm(
          temporaryDirectory,
          {
            recursive:
              true,

            force:
              true,
          },
        );
      } catch {
        /*
         * Temporary cleanup failure must never turn an unsafe or indeterminate
         * scan into a clean result.
         */
      }
    }
  }
}

/* ========================================================================== */
/* Request synchronization                                                     */
/* ========================================================================== */

export async function syncClaimDocumentRequests(
  input:
    SyncClaimDocumentRequestsInput,
): Promise<
  DocumentRequest[]
> {
  const claimId =
    requireNonEmpty(
      input.claimId,
      "Claim ID",
    );

  const requestedAt =
    validateIsoDate(
      input.requestedAt,
      "Requested date",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const requiredKinds =
    uniqueDocumentKinds(
      input.requiredKinds,
    );

  for (
    const kind of
    requiredKinds
  ) {
    if (
      isInternalWorkflowDocumentKind(
        kind,
      )
    ) {
      throw new Error(
        `${kind.replaceAll(
          "_",
          " ",
        )} is a Duequity internal workflow document and cannot be synchronized as a jurisdiction-required filing request.`,
      );
    }
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data:
      requestData,
    error:
      requestError,
  } =
    await supabase
      .from(
        "claim_document_requests",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId,
      );

  if (
    requestError
  ) {
    throw new Error(
      `Unable to read current document requests: ${requestError.message}`,
    );
  }

  const {
    data:
      documentData,
    error:
      documentError,
  } =
    await supabase
      .from(
        "claim_documents",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId,
      );

  if (
    documentError
  ) {
    throw new Error(
      `Unable to read current claim documents: ${documentError.message}`,
    );
  }

  const requests =
    (
      requestData ??
      []
    ).map(
      (
        row,
      ) =>
        row as
          ClaimDocumentRequestRow,
    );

  const documents =
    (
      documentData ??
      []
    ).map(
      (
        row,
      ) =>
        row as
          ClaimDocumentRow,
    );

  const requiredKindSet =
    new Set<DocumentKind>(
      requiredKinds,
    );

  let createdCount =
    0;

  let reactivatedCount =
    0;

  let retiredCount =
    0;

  for (
    const request of
    requests
  ) {
    if (
      !request.required ||
      requiredKindSet.has(
        request.kind,
      )
    ) {
      continue;
    }

    await updateRequestRow(
      request,
      {
        required:
          false,
      },
    );

    retiredCount +=
      1;
  }

  for (
    const kind of
    requiredKinds
  ) {
    const existing =
      requests.find(
        (
          request,
        ) =>
          request.kind ===
          kind,
      );

    if (
      existing
    ) {
      if (
        !existing.required
      ) {
        const acceptedDocument =
          existing.fulfilled_by_document_id
            ? documents.find(
                (
                  document,
                ) =>
                  document.id ===
                    existing.fulfilled_by_document_id &&
                  document.kind ===
                    kind &&
                  document.status ===
                    "accepted",
              )
            : undefined;

        await updateRequestRow(
          existing,
          {
            required:
              true,

            requested_at:
              requestedAt,

            requested_from_claimant_id:
              input.requestedFromClaimantId ??
              null,

            reason:
              `Required by the currently recorded jurisdiction workflow for ${kind.replaceAll(
                "_",
                " ",
              )}.`,

            guidance:
              `Provide a clear, complete copy of the required ${kind.replaceAll(
                "_",
                " ",
              )} document.`,

            status:
              acceptedDocument
                ? "accepted"
                : "outstanding",

            fulfilled_by_document_id:
              acceptedDocument
                ? acceptedDocument.id
                : null,

            waived_reason:
              acceptedDocument
                ? existing.waived_reason
                : null,
          },
        );

        reactivatedCount +=
          1;
      }

      continue;
    }

    const {
      error,
    } =
      await supabase
        .from(
          "claim_document_requests",
        )
        .insert({
          id:
            requestIdFor(
              claimId,
              kind,
            ),

          claim_id:
            claimId,

          kind,

          reason:
            `Required by the currently recorded jurisdiction workflow for ${kind.replaceAll(
              "_",
              " ",
            )}.`,

          requested_from_claimant_id:
            input.requestedFromClaimantId ??
            null,

          requested_at:
            requestedAt,

          due_by:
            null,

          required:
            true,

          status:
            "outstanding",

          guidance:
            `Provide a clear, complete copy of the required ${kind.replaceAll(
              "_",
              " ",
            )} document.`,

          fulfilled_by_document_id:
            null,

          waived_reason:
            null,

          row_version:
            1,
        });

    if (
      error
    ) {
      throw new Error(
        `Unable to create document request: ${error.message}`,
      );
    }

    createdCount +=
      1;
  }

  await appendAudit({
    claimId,

    action:
      "document_requests_synced",

    actorUserId,

    occurredAt,

    detail:
      `${requiredKinds.length} current required document kind${
        requiredKinds.length ===
        1
          ? ""
          : "s"
      } evaluated. ${createdCount} new request${
        createdCount ===
        1
          ? ""
          : "s"
      } created, ${reactivatedCount} reactivated, ${retiredCount} retired from current filing requirements.`,
  });

  return listClaimDocumentRequests(
    claimId,
  );
}

/* ========================================================================== */
/* Upload registration                                                        */
/* ========================================================================== */

export async function registerClaimDocumentUpload(
  input:
    RegisterClaimDocumentUploadInput,
): Promise<
  StoredDocument
> {
  const claimId =
    requireNonEmpty(
      input.claimId,
      "Claim ID",
    );

  const title =
    requireNonEmpty(
      input.title,
      "Document title",
    );

  const mimeType =
    validateMimeType(
      input.mimeType,
    );

  const byteSize =
    validateByteSize(
      input.byteSize,
    );

  const storageKey =
    requireNonEmpty(
      input.storageKey,
      "Storage key",
    );

  const uploadedAt =
    validateIsoInstant(
      input.uploadedAt,
      "Uploaded at",
    );

  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data:
      requestData,
    error:
      requestError,
  } =
    await supabase
      .from(
        "claim_document_requests",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId,
      )
      .eq(
        "kind",
        input.kind,
      )
      .eq(
        "required",
        true,
      )
      .maybeSingle();

  if (
    requestError
  ) {
    throw new Error(
      `Unable to resolve document request: ${requestError.message}`,
    );
  }

  const request =
    requestData
      ? requestData as
          ClaimDocumentRequestRow
      : undefined;

  const internalWorkflowDocument =
    isInternalWorkflowDocumentKind(
      input.kind,
    );

  if (
    !request &&
    !internalWorkflowDocument
  ) {
    throw new Error(
      "A current required document request must exist before this workflow accepts an agency-document upload for that document kind.",
    );
  }

  const documentId =
    createClaimDocumentId(
      claimId,
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_documents",
      )
      .insert({
        id:
          documentId,

        claim_id:
          claimId,

        opportunity_id:
          null,

        claimant_id:
          input.claimantId ??
          null,

        kind:
          input.kind,

        title,

        original_file_name:
          input.originalFileName?.trim() ||
          null,

        mime_type:
          mimeType,

        byte_size:
          byteSize,

        sensitivity:
          sensitivityForDocumentKind(
            input.kind,
          ),

        status:
          "uploaded",

        storage_bucket:
          CLAIM_DOCUMENT_STORAGE_BUCKET,

        storage_key:
          storageKey,

        malware_scan_status:
          "pending",

        malware_scanned_at:
          null,

        malware_scan_detail:
          null,

        uploaded_by_user_id:
          input.uploadedByUserId ??
          null,

        uploaded_by_claimant_id:
          input.uploadedByClaimantId ??
          null,

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
      })
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to register document upload: ${error.message}`,
    );
  }

  if (
    request &&
    request.status !==
      "accepted" &&
    request.status !==
      "waived"
  ) {
    await updateRequestRow(
      request,
      {
        status:
          "received",
      },
    );
  }

  await appendAudit({
    claimId,

    documentId,

    requestId:
      request?.id,

    action:
      "document_uploaded",

    actorUserId,

    occurredAt:
      uploadedAt,

    detail:
      request
        ? `${input.kind.replaceAll(
            "_",
            " ",
          )} uploaded. Filing requirement remains unsatisfied until required safety checks and human review accept the document.`
        : `${input.kind.replaceAll(
            "_",
            " ",
          )} uploaded as Duequity internal workflow evidence. It does not satisfy an agency filing-document requirement.`,
  });

  return documentFromRow(
    data as
      ClaimDocumentRow,
  );
}

/* ========================================================================== */
/* Human review                                                                */
/* ========================================================================== */

export async function reviewClaimDocument(
  input:
    ReviewClaimDocumentInput,
): Promise<
  StoredDocument
> {
  const reviewedAt =
    validateIsoInstant(
      input.reviewedAt,
      "Reviewed at",
    );

  const reviewedByUserId =
    requireNonEmpty(
      input.reviewedByUserId,
      "Reviewer user ID",
    );

  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const current =
    await getDocumentRow(
      input.documentId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Document not found.",
    );
  }

  if (
    current.status ===
    "superseded"
  ) {
    throw new Error(
      "A superseded document cannot be reviewed.",
    );
  }

  if (
    current.malware_scan_status ===
    "pending"
  ) {
    throw new Error(
      "Document review is blocked until the malware safety check has completed.",
    );
  }

  if (
    input.decision ===
      "accepted" &&
    current.malware_scan_status !==
      "clean"
  ) {
    throw new Error(
      "A document cannot be accepted unless its malware safety status is clean.",
    );
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data:
      requestData,
    error:
      requestError,
  } =
    await supabase
      .from(
        "claim_document_requests",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        current.claim_id,
      )
      .eq(
        "kind",
        current.kind,
      )
      .eq(
        "required",
        true,
      )
      .maybeSingle();

  if (
    requestError
  ) {
    throw new Error(
      `Unable to resolve document request during review: ${requestError.message}`,
    );
  }

  const request =
    requestData
      ? requestData as
          ClaimDocumentRequestRow
      : undefined;

  const internalWorkflowDocument =
    isInternalWorkflowDocumentKind(
      current.kind,
    );

  const requestSynchronizedByDatabase =
    databaseSynchronizesDocumentRequest(
      current.kind,
    );

  if (
    input.decision ===
    "rejected"
  ) {
    const rejectionReason =
      requireNonEmpty(
        input.rejectionReason ??
        "",
        "Rejection reason",
      );

    const updated =
      await updateDocumentRow(
        current,
        {
          status:
            "rejected",

          reviewed_by_user_id:
            reviewedByUserId,

          reviewed_at:
            reviewedAt,

          rejection_reason:
            rejectionReason,
        },
      );

    /*
     * Government-ID request state is synchronized by the database trigger that
     * just observed the document rejection. Do not update the same request
     * again from the pre-document-update row version.
     */
    if (
      !requestSynchronizedByDatabase
    ) {
      if (
        request &&
        request.fulfilled_by_document_id ===
          current.id
      ) {
        const {
          data:
            replacementData,
          error:
            replacementError,
        } =
          await supabase
            .from(
              "claim_documents",
            )
            .select(
              "*",
            )
            .eq(
              "claim_id",
              current.claim_id,
            )
            .eq(
              "kind",
              current.kind,
            )
            .eq(
              "status",
              "accepted",
            )
            .neq(
              "id",
              current.id,
            )
            .order(
              "uploaded_at",
              {
                ascending:
                  false,
              },
            )
            .limit(
              1,
            )
            .maybeSingle();

        if (
          replacementError
        ) {
          throw new Error(
            `Unable to resolve accepted replacement document: ${replacementError.message}`,
          );
        }

        await updateRequestRow(
          request,
          {
            status:
              replacementData
                ? "accepted"
                : "outstanding",

            fulfilled_by_document_id:
              replacementData
                ? (
                    replacementData as
                      ClaimDocumentRow
                  ).id
                : null,
          },
        );
      } else if (
        request &&
        request.status !==
          "waived"
      ) {
        const {
          data:
            replacementData,
          error:
            replacementError,
        } =
          await supabase
            .from(
              "claim_documents",
            )
            .select(
              "*",
            )
            .eq(
              "claim_id",
              current.claim_id,
            )
            .eq(
              "kind",
              current.kind,
            )
            .eq(
              "status",
              "accepted",
            )
            .neq(
              "id",
              current.id,
            )
            .order(
              "uploaded_at",
              {
                ascending:
                  false,
              },
            )
            .limit(
              1,
            )
            .maybeSingle();

        if (
          replacementError
        ) {
          throw new Error(
            `Unable to resolve accepted replacement document: ${replacementError.message}`,
          );
        }

        await updateRequestRow(
          request,
          {
            status:
              replacementData
                ? "accepted"
                : "outstanding",

            fulfilled_by_document_id:
              replacementData
                ? (
                    replacementData as
                      ClaimDocumentRow
                  ).id
                : null,
          },
        );
      }
    }

    await appendAudit({
      claimId:
        current.claim_id,

      documentId:
        current.id,

      requestId:
        request?.id,

      action:
        "document_rejected",

      actorUserId,

      occurredAt:
        reviewedAt,

      detail:
        `Document rejected. Reason: ${rejectionReason}`,
    });

    return documentFromRow(
      updated,
    );
  }

  if (
    !request &&
    !internalWorkflowDocument
  ) {
    throw new Error(
      "A current required document request could not be resolved for this agency document.",
    );
  }

  const {
    data:
      acceptedRows,
    error:
      acceptedError,
  } =
    await supabase
      .from(
        "claim_documents",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        current.claim_id,
      )
      .eq(
        "kind",
        current.kind,
      )
      .eq(
        "status",
        "accepted",
      )
      .neq(
        "id",
        current.id,
      );

  if (
    acceptedError
  ) {
    throw new Error(
      `Unable to resolve previously accepted documents: ${acceptedError.message}`,
    );
  }

  for (
    const accepted of
    acceptedRows ??
    []
  ) {
    await updateDocumentRow(
      accepted as
        ClaimDocumentRow,
      {
        status:
          "superseded",
      },
    );
  }

  /*
   * For Government ID, this document update invokes the database identity-sync
   * trigger. That trigger verifies claimant identity and marks the matching
   * document request accepted using this exact document ID.
   */
  const updated =
    await updateDocumentRow(
      current,
      {
        status:
          "accepted",

        rejection_reason:
          null,

        reviewed_by_user_id:
          reviewedByUserId,

        reviewed_at:
          reviewedAt,
      },
    );

  /*
   * Non-government document kinds remain application-managed.
   *
   * Government ID deliberately skips this second mutation because the database
   * trigger already performed it and incremented the request row version.
   */
  if (
    request &&
    !requestSynchronizedByDatabase
  ) {
    await updateRequestRow(
      request,
      {
        status:
          "accepted",

        fulfilled_by_document_id:
          current.id,

        waived_reason:
          null,
      },
    );
  }

  await appendAudit({
    claimId:
      current.claim_id,

    documentId:
      current.id,

    requestId:
      request?.id,

    action:
      "document_accepted",

    actorUserId,

    occurredAt:
      reviewedAt,

    detail:
      request
        ? `${current.kind.replaceAll(
            "_",
            " ",
          )} accepted by human review and now satisfies the current required document request.`
        : `${current.kind.replaceAll(
            "_",
            " ",
          )} accepted by human review as Duequity internal workflow evidence. It does not satisfy an agency filing-document request.`,
  });

  return documentFromRow(
    updated,
  );
}

/* ========================================================================== */
/* Waiver                                                                      */
/* ========================================================================== */

export async function waiveClaimDocumentRequest(
  input:
    WaiveClaimDocumentRequestInput,
): Promise<
  DocumentRequest
> {
  const reason =
    requireNonEmpty(
      input.waivedReason,
      "Waiver reason",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const current =
    await getRequestRow(
      input.requestId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Document request not found.",
    );
  }

  const updated =
    await updateRequestRow(
      current,
      {
        status:
          "waived",

        waived_reason:
          reason,

        fulfilled_by_document_id:
          null,
      },
    );

  await appendAudit({
    claimId:
      current.claim_id,

    requestId:
      current.id,

    action:
      "document_request_waived",

    actorUserId,

    occurredAt,

    detail:
      `Required document request waived. Reason: ${reason}`,
  });

  return requestFromRow(
    updated,
  );
}

/* ========================================================================== */
/* Supersede                                                                   */
/* ========================================================================== */

export async function supersedeClaimDocument(
  input:
    SupersedeClaimDocumentInput,
): Promise<
  StoredDocument
> {
  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const current =
    await getDocumentRow(
      input.documentId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Document not found.",
    );
  }

  const requestSynchronizedByDatabase =
    databaseSynchronizesDocumentRequest(
      current.kind,
    );

  /*
   * For Government ID, this update may change claimant identity/request state
   * through the database trigger before application code continues.
   */
  const updated =
    await updateDocumentRow(
      current,
      {
        status:
          "superseded",
      },
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data:
      requestData,
    error:
      requestError,
  } =
    await supabase
      .from(
        "claim_document_requests",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        current.claim_id,
      )
      .eq(
        "kind",
        current.kind,
      )
      .eq(
        "required",
        true,
      )
      .maybeSingle();

  if (
    requestError
  ) {
    throw new Error(
      `Unable to resolve document request during supersede: ${requestError.message}`,
    );
  }

  const request =
    requestData
      ? requestData as
          ClaimDocumentRequestRow
      : undefined;

  /*
   * Government-ID requests have already been synchronized by the database
   * trigger. All other request kinds continue to use the existing
   * application-managed replacement logic.
   */
  if (
    !requestSynchronizedByDatabase &&
    request
      ?.fulfilled_by_document_id ===
      current.id
  ) {
    const {
      data:
        replacementData,
      error:
        replacementError,
    } =
      await supabase
        .from(
          "claim_documents",
        )
        .select(
          "*",
        )
        .eq(
          "claim_id",
          current.claim_id,
        )
        .eq(
          "kind",
          current.kind,
        )
        .eq(
          "status",
          "accepted",
        )
        .neq(
          "id",
          current.id,
        )
        .order(
          "uploaded_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          1,
        )
        .maybeSingle();

    if (
      replacementError
    ) {
      throw new Error(
        `Unable to resolve replacement document: ${replacementError.message}`,
      );
    }

    await updateRequestRow(
      request,
      {
        status:
          replacementData
            ? "accepted"
            : "outstanding",

        fulfilled_by_document_id:
          replacementData
            ? (
                replacementData as
                  ClaimDocumentRow
              ).id
            : null,
      },
    );
  }

  await appendAudit({
    claimId:
      current.claim_id,

    documentId:
      current.id,

    requestId:
      request?.id,

    action:
      "document_superseded",

    actorUserId,

    occurredAt,

    detail:
      input.detail?.trim() ||
      "Document superseded.",
  });

  return documentFromRow(
    updated,
  );
}

/* ========================================================================== */
/* Filing readiness                                                            */
/* ========================================================================== */

export async function resolveClaimDocumentReadiness(
  claimId:
    string,
): Promise<
  ClaimDocumentReadiness
> {
  const requests =
    await listClaimDocumentRequests(
      claimId,
    );

  const requiredRequests =
    requests.filter(
      (
        request,
      ) =>
        request.required,
    );

  const acceptedRequiredRequests =
    requiredRequests.filter(
      (
        request,
      ) =>
        (
          request.status ===
            "accepted" &&
          Boolean(
            request
              .fulfilledByDocumentId,
          )
        ) ||
        request.status ===
          "waived",
    );

  const acceptedIds =
    new Set(
      acceptedRequiredRequests.map(
        (
          request,
        ) =>
          request.id,
      ),
    );

  const outstandingRequiredRequests =
    requiredRequests.filter(
      (
        request,
      ) =>
        !acceptedIds.has(
          request.id,
        ),
    );

  return {
    claimId,

    requiredRequests,

    acceptedRequiredRequests,

    outstandingRequiredRequests,

    requiredCount:
      requiredRequests.length,

    acceptedCount:
      acceptedRequiredRequests.length,

    outstandingCount:
      outstandingRequiredRequests.length,

    complete:
      outstandingRequiredRequests.length ===
      0,
  };
}

/* ========================================================================== */
/* Status helpers                                                              */
/* ========================================================================== */

export function documentStatusLabel(
  status:
    DocumentStatus,
): string {
  switch (
    status
  ) {
    case "requested":
      return "Requested";

    case "uploaded":
      return "Uploaded";

    case "scanning":
      return "Scanning";

    case "under_review":
      return "Under review";

    case "accepted":
      return "Accepted";

    case "rejected":
      return "Rejected";

    case "expired":
      return "Expired";

    case "superseded":
      return "Superseded";

    default:
      return status;
  }
}