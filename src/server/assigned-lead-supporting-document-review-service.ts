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
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import type {
  StaffSession,
} from "@/lib/session";

import {
  isPreclaimSupportingDocumentKind,
  PRECLAIM_SUPPORTING_DOCUMENT_MAX_BYTES,
  PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET,
} from "@/server/assigned-lead-supporting-document-service";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type SupportingDocumentSafetyOutcome =
  | "clean"
  | "unsafe"
  | "failed";

export interface SupportingDocumentSafetyResult {
  outcome:
    SupportingDocumentSafetyOutcome;

  detail:
    string;
}

export interface SupportingDocumentReviewInput {
  session:
    StaffSession;

  documentId:
    string;

  decision:
    "accepted" |
    "rejected";

  rejectionReason?:
    string;

  documentReviewConfirmed?:
    boolean;
}

export interface SupportingDocumentFileResult {
  bytes:
    Uint8Array;

  mimeType:
    string;

  fileName:
    string;
}

interface SupportingDocumentRow {
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
    string;

  status:
    string;

  storage_bucket:
    string;

  storage_key:
    string;

  malware_scan_status:
    string;
}

interface WorkcaseRow {
  id:
    string;

  assigned_staff_user_id:
    string;

  discovered_record_id:
    string;

  status:
    string;

  linked_claim_id:
    string | null;
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
/* Authorization                                                               */
/* ========================================================================== */

function mayReviewSupportingDocuments(
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

async function requireAuthorizedSupportingDocument(
  session:
    StaffSession,
  documentId:
    string,
): Promise<
  SupportingDocumentRow
> {
  if (
    !mayReviewSupportingDocuments(
      session,
    )
  ) {
    throw new Error(
      "Your staff role is not authorized to review pre-Claim supporting documents.",
    );
  }

  const normalizedDocumentId =
    documentId.trim();

  if (
    !normalizedDocumentId
  ) {
    throw new Error(
      "Document ID is required.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data:
      documentData,
    error:
      documentError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_documents",
      )
      .select(
        "id, workcase_id, claimant_id, kind, title, original_file_name, mime_type, byte_size, sensitivity, status, storage_bucket, storage_key, malware_scan_status",
      )
      .eq(
        "id",
        normalizedDocumentId,
      )
      .maybeSingle();

  if (
    documentError
  ) {
    throw new Error(
      `Unable to load supporting document: ${documentError.message}`,
    );
  }

  if (
    !documentData
  ) {
    throw new Error(
      "Supporting document not found.",
    );
  }

  const document =
    documentData as
      SupportingDocumentRow;

  if (
    document.kind ===
      "government_id" ||
    !isPreclaimSupportingDocumentKind(
      document.kind,
    )
  ) {
    throw new Error(
      "This file is not a pre-Claim supporting document.",
    );
  }

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
        "id, assigned_staff_user_id, discovered_record_id, status, linked_claim_id",
      )
      .eq(
        "id",
        document.workcase_id,
      )
      .maybeSingle();

  if (
    workcaseError
  ) {
    throw new Error(
      `Unable to load claimant recovery: ${workcaseError.message}`,
    );
  }

  if (
    !workcaseData
  ) {
    throw new Error(
      "The claimant recovery for this document could not be resolved.",
    );
  }

  const workcase =
    workcaseData as
      WorkcaseRow;

  if (
    workcase.status !==
      "activated" ||
    workcase.linked_claim_id
  ) {
    throw new Error(
      "Supporting-document review is available only while this recovery is active and pre-Claim.",
    );
  }

  if (
    hasAdministrativeScope(
      session,
    )
  ) {
    return document;
  }

  if (
    workcase.assigned_staff_user_id !==
      session.user.id
  ) {
    throw new Error(
      "This claimant recovery is assigned to a different staff member.",
    );
  }

  const {
    data:
      authorized,
    error:
      authorizationError,
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
    authorizationError ||
    authorized !==
      true
  ) {
    throw new Error(
      "The active Admin-assigned work authorization for this claimant could not be verified.",
    );
  }

  return document;
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

function defenderReportedThreat(
  result:
    ProcessResult,
): boolean {
  const output =
    `${result.stdout}\n${result.stderr}`
      .toLowerCase();

  return (
    /detected\s+[1-9]\d*\s+threat/.test(
      output,
    ) ||
    /found\s+[1-9]\d*\s+threat/.test(
      output,
    ) ||
    output.includes(
      "malware found",
    ) ||
    output.includes(
      "threat detected",
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
      return ".bin";
  }
}

/* ========================================================================== */
/* RPC helper                                                                  */
/* ========================================================================== */

async function finishSafetyScan({
  documentId,
  staffUserId,
  outcome,
  detail,
}: {
  documentId:
    string;

  staffUserId:
    string;

  outcome:
    SupportingDocumentSafetyOutcome;

  detail:
    string;
}): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const {
    error,
  } =
    await admin.rpc(
      "finish_assigned_lead_supporting_document_safety_scan",
      {
        p_document_id:
          documentId,

        p_staff_user_id:
          staffUserId,

        p_outcome:
          outcome,

        p_detail:
          detail,
      },
    );

  if (
    error
  ) {
    throw new Error(
      `Unable to finish supporting-document safety processing: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Safety scan                                                                 */
/* ========================================================================== */

export async function runPreclaimSupportingDocumentSafetyScan(
  session:
    StaffSession,
  documentId:
    string,
): Promise<
  SupportingDocumentSafetyResult
> {
  const document =
    await requireAuthorizedSupportingDocument(
      session,
      documentId,
    );

  if (
    document.storage_bucket !==
      PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET
  ) {
    throw new Error(
      "Supporting document is stored outside the approved private document bucket.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    error:
      beginError,
  } =
    await admin.rpc(
      "begin_assigned_lead_supporting_document_safety_scan",
      {
        p_document_id:
          document.id,

        p_staff_user_id:
          session.user.id,
      },
    );

  if (
    beginError
  ) {
    throw new Error(
      `Unable to begin supporting-document safety processing: ${beginError.message}`,
    );
  }

  let temporaryDirectory:
    string |
    undefined;

  try {
    const {
      data,
      error,
    } =
      await admin.storage
        .from(
          PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET,
        )
        .download(
          document.storage_key,
        );

    if (
      error ||
      !data
    ) {
      throw new Error(
        error?.message ??
        "Private supporting document could not be retrieved.",
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
        "Supporting document contains an invalid byte size.",
      );
    }

    if (
      bytes.byteLength !==
        expectedByteSize
    ) {
      throw new Error(
        "Stored supporting document byte size does not match its database record.",
      );
    }

    if (
      bytes.byteLength >
        PRECLAIM_SUPPORTING_DOCUMENT_MAX_BYTES
    ) {
      throw new Error(
        "Stored supporting document exceeds the approved 15 MB limit.",
      );
    }

    const defenderExecutable =
      await findMicrosoftDefenderExecutable();

    temporaryDirectory =
      await mkdtemp(
        join(
          tmpdir(),
          "duequity-supporting-doc-",
        ),
      );

    const temporaryFile =
      join(
        temporaryDirectory,
        `document${extensionForMimeType(
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

    if (
      result.timedOut
    ) {
      const detail =
        "Microsoft Defender safety scan timed out before a clean result could be established.";

      await finishSafetyScan({
        documentId:
          document.id,

        staffUserId:
          session.user.id,

        outcome:
          "failed",

        detail,
      });

      return {
        outcome:
          "failed",

        detail,
      };
    }

    if (
      result.exitCode ===
        0
    ) {
      const detail =
        "Microsoft Defender custom file scan completed with no unresolved malware detection.";

      await finishSafetyScan({
        documentId:
          document.id,

        staffUserId:
          session.user.id,

        outcome:
          "clean",

        detail,
      });

      return {
        outcome:
          "clean",

        detail,
      };
    }

    if (
      result.exitCode ===
        2 &&
      defenderReportedThreat(
        result,
      )
    ) {
      const detail =
        "Microsoft Defender reported a threat during the custom supporting-document scan.";

      await finishSafetyScan({
        documentId:
          document.id,

        staffUserId:
          session.user.id,

        outcome:
          "unsafe",

        detail,
      });

      return {
        outcome:
          "unsafe",

        detail,
      };
    }

    const exitCode =
      result.exitCode ===
        null
        ? "unknown"
        : String(
            result.exitCode,
          );

    const detail =
      `Microsoft Defender did not establish a clean result. Scanner exit code: ${exitCode}.`;

    await finishSafetyScan({
      documentId:
        document.id,

      staffUserId:
        session.user.id,

      outcome:
        "failed",

      detail,
    });

    return {
      outcome:
        "failed",

      detail,
    };
  } catch (
    error
  ) {
    const detail =
      error instanceof Error
        ? error.message
        : "Supporting-document safety scan could not complete.";

    try {
      await finishSafetyScan({
        documentId:
          document.id,

        staffUserId:
          session.user.id,

        outcome:
          "failed",

        detail,
      });
    } catch {
      /*
       * Preserve the original scanner failure.
       */
    }

    return {
      outcome:
        "failed",

      detail,
    };
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
         * Temporary cleanup failure never changes the persisted safety result.
         */
      }
    }
  }
}

/* ========================================================================== */
/* Human review                                                                */
/* ========================================================================== */

export async function reviewPreclaimSupportingDocument(
  input:
    SupportingDocumentReviewInput,
): Promise<void> {
  await requireAuthorizedSupportingDocument(
    input.session,
    input.documentId,
  );

  const admin =
    getSupabaseAdmin();

  const {
    error,
  } =
    await admin.rpc(
      "review_assigned_lead_supporting_document",
      {
        p_document_id:
          input.documentId,

        p_staff_user_id:
          input.session.user.id,

        p_decision:
          input.decision,

        p_rejection_reason:
          input.rejectionReason?.trim() ||
          null,

        p_document_review_confirmed:
          input.documentReviewConfirmed ===
          true,
      },
    );

  if (
    error
  ) {
    throw new Error(
      `Unable to save supporting-document review: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Secure file                                                                 */
/* ========================================================================== */

export async function getPreclaimSupportingDocumentFile(
  session:
    StaffSession,
  documentId:
    string,
): Promise<
  SupportingDocumentFileResult
> {
  const document =
    await requireAuthorizedSupportingDocument(
      session,
      documentId,
    );

  if (
    document.malware_scan_status !==
      "clean"
  ) {
    throw new Error(
      "Supporting document cannot be opened until its safety check is clean.",
    );
  }

  if (
    document.status !==
      "under_review" &&
    document.status !==
      "accepted"
  ) {
    throw new Error(
      "Supporting document is not available for secure review in its current state.",
    );
  }

  if (
    document.storage_bucket !==
      PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET
  ) {
    throw new Error(
      "Supporting document is stored outside the approved private document bucket.",
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
        PRECLAIM_SUPPORTING_DOCUMENT_STORAGE_BUCKET,
      )
      .download(
        document.storage_key,
      );

  if (
    error ||
    !data
  ) {
    throw new Error(
      error?.message ??
      "Supporting document could not be retrieved.",
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
      "Stored supporting document byte size does not match its database record.",
    );
  }

  return {
    bytes,

    mimeType:
      document.mime_type,

    fileName:
      document.original_file_name ??
      document.title,
  };
}