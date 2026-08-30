import "server-only";

import {
  randomUUID,
} from "node:crypto";

import {
  Buffer,
} from "node:buffer";

import type {
  StaffUser,
} from "@/domain/types";

import type {
  StaffSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  resolveStaffSession,
} from "@/server/staff-session";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

export const CLAIMANT_MESSAGE_STORAGE_BUCKET =
  "claimant-message-attachments";

export const CLAIMANT_MESSAGE_MAX_ATTACHMENT_BYTES =
  25 * 1024 * 1024;

export const CLAIMANT_MESSAGE_MAX_ATTACHMENTS =
  5;

export const CLAIMANT_MESSAGE_SIGNED_URL_SECONDS =
  300;

export const CLAIMANT_MESSAGE_MAX_BODY_LENGTH =
  10_000;

const ALLOWED_MIME_TYPES =
  new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type ClaimantMessagingRecordKind =
  | "claim"
  | "assigned_lead";

export interface ClaimantMessagingProfile {
  claimantId:
    string;

  claimantReference:
    string;

  legalName:
    string;

  claimId:
    string;

  claimReference:
    string;

  claimantAuthUserId?:
    string;

  originatingStaffUserId:
    string;

  assignedStaffUserId:
    string;

  recordKind:
    ClaimantMessagingRecordKind;

  workcaseId?:
    string;
}

export interface ClaimantMessageAttachment {
  id:
    string;

  messageId:
    string;

  fileName:
    string;

  mimeType:
    string;

  sizeBytes:
    number;

  createdAt:
    string;
}

export interface ClaimantMessageItem {
  id:
    string;

  threadId:
    string;

  replyToMessageId?:
    string;

  senderType:
    | "staff"
    | "claimant";

  senderName:
    string;

  bodyText:
    string;

  sentAt:
    string;

  claimantReadAt?:
    string;

  staffReadAt?:
    string;

  attachments:
    ClaimantMessageAttachment[];
}

export interface ClaimantMessageThreadSummary {
  id:
    string;

  claimId:
    string;

  claimReference:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  legalName:
    string;

  status:
    | "active"
    | "closed";

  lastMessageAt?:
    string;

  lastMessagePreview:
    string;

  unreadCount:
    number;
}

export interface ClaimantMessageThreadView
  extends ClaimantMessageThreadSummary {
  messages:
    ClaimantMessageItem[];
}

export interface ClaimantMessageAttachmentDownload {
  url:
    string;

  fileName:
    string;

  mimeType:
    string;

  expiresInSeconds:
    number;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimantOnboardingMessageRow {
  claim_id:
    string;

  claim_reference:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  claimant_auth_user_id:
    | string
    | null;

  legal_name:
    string;

  originating_staff_user_id:
    string;

  assigned_staff_user_id:
    string;
}

interface AssignedLeadWorkcaseMessageRow {
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
    | string
    | null;

  originating_staff_user_id:
    string;

  assigned_staff_user_id:
    string;

  status:
    string;

  linked_claim_id:
    | string
    | null;
}

interface ClaimantMessageThreadRow {
  id:
    string;

  created_by_staff_user_id:
    string;

  status:
    | "active"
    | "closed";

  last_message_at:
    | string
    | null;

  created_at:
    string;

  updated_at:
    string;
}

interface ClaimantMessageRow {
  id:
    string;

  thread_id:
    string;

  reply_to_message_id:
    | string
    | null;

  sender_type:
    | "staff"
    | "claimant";

  sender_staff_user_id:
    | string
    | null;

  sender_claimant_auth_user_id:
    | string
    | null;

  body_text:
    string;

  state:
    | "draft"
    | "sent";

  sent_at:
    | string
    | null;

  claimant_read_at:
    | string
    | null;

  staff_read_at:
    | string
    | null;

  created_at:
    string;

  updated_at:
    string;
}

interface ClaimantMessageAttachmentRow {
  id:
    string;

  message_id:
    string;

  uploader_type:
    | "staff"
    | "claimant";

  uploaded_by_staff_user_id:
    | string
    | null;

  uploaded_by_claimant_auth_user_id:
    | string
    | null;

  storage_path:
    string;

  file_name:
    string;

  mime_type:
    string;

  size_bytes:
    | number
    | string;

  created_at:
    string;
}

interface StaffDirectoryRow {
  id:
    string;

  name:
    string;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

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

function normalizeBodyText(
  value:
    string,
): string {
  const normalized =
    value.trim();

  if (
    normalized.length >
    CLAIMANT_MESSAGE_MAX_BODY_LENGTH
  ) {
    throw new Error(
      `Messages may not exceed ${CLAIMANT_MESSAGE_MAX_BODY_LENGTH.toLocaleString()} characters.`,
    );
  }

  return normalized;
}

function safeFileName(
  value:
    string,
): string {
  const normalized =
    value
      .trim()
      .replace(
        /[^A-Za-z0-9._ -]+/g,
        "_",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .slice(
        0,
        180,
      );

  return (
    normalized ||
    "attachment"
  );
}

function validateFiles(
  files:
    File[],
): void {
  if (
    files.length >
    CLAIMANT_MESSAGE_MAX_ATTACHMENTS
  ) {
    throw new Error(
      `A message may contain no more than ${CLAIMANT_MESSAGE_MAX_ATTACHMENTS} attachments.`,
    );
  }

  for (
    const file of
      files
  ) {
    if (
      file.size >
      CLAIMANT_MESSAGE_MAX_ATTACHMENT_BYTES
    ) {
      throw new Error(
        `${file.name} exceeds the 25 MB attachment limit.`,
      );
    }

    if (
      !ALLOWED_MIME_TYPES.has(
        file.type,
      )
    ) {
      throw new Error(
        `${file.name} is not an approved claimant-message attachment type.`,
      );
    }
  }
}

/* ========================================================================== */
/* Staff authorization                                                        */
/* ========================================================================== */

function isSuperAdmin(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
    "super_admin"
  );
}

function staffMayAccessProfile(
  session:
    StaffSession,
  profile:
    ClaimantMessagingProfile,
): boolean {
  return (
    isSuperAdmin(
      session,
    ) ||
    profile.assignedStaffUserId ===
      session.user.id
  );
}

async function requireCurrentStaffSession(
  expectedActorId?:
    string,
): Promise<
  StaffSession
> {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    throw new Error(
      "Staff authentication is required.",
    );
  }

  if (
    expectedActorId &&
    session.user.id !==
      expectedActorId
  ) {
    throw new Error(
      "The authenticated staff identity does not match the claimant-message actor.",
    );
  }

  return session;
}

/* ========================================================================== */
/* Profile mapping                                                             */
/* ========================================================================== */

function legacyProfileFromRow(
  row:
    ClaimantOnboardingMessageRow,
): ClaimantMessagingProfile {
  return {
    claimantId:
      row.claimant_id,

    claimantReference:
      row.claimant_reference,

    legalName:
      row.legal_name,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    claimantAuthUserId:
      row.claimant_auth_user_id ??
      undefined,

    originatingStaffUserId:
      row.originating_staff_user_id,

    assignedStaffUserId:
      row.assigned_staff_user_id,

    recordKind:
      "claim",
  };
}

function assignedLeadProfileFromRow(
  row:
    AssignedLeadWorkcaseMessageRow,
): ClaimantMessagingProfile {
  const legalName =
    [
      row.legal_first_name,
      row.legal_last_name,
    ]
      .filter(
        Boolean,
      )
      .join(
        " ",
      );

  return {
    claimantId:
      row.claimant_id,

    claimantReference:
      row.claimant_reference,

    legalName,

    /*
     * The conversation workspace requires a stable recovery ID/reference.
     * A pre-Claim claimant intentionally has no official Claim yet.
     *
     * The workcase UUID is used internally as the recovery record ID, while
     * the existing DQC claimant reference is shown to the claimant. No fake
     * DQ Claim reference is created.
     */
    claimId:
      row.id,

    claimReference:
      row.claimant_reference,

    claimantAuthUserId:
      row.auth_user_id ??
      undefined,

    originatingStaffUserId:
      row.originating_staff_user_id,

    assignedStaffUserId:
      row.assigned_staff_user_id,

    recordKind:
      "assigned_lead",

    workcaseId:
      row.id,
  };
}

/* ========================================================================== */
/* Profiles                                                                    */
/* ========================================================================== */

async function getLegacyMessagingProfile(
  claimantId:
    string,
): Promise<
  ClaimantMessagingProfile | undefined
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
        "claim_id, claim_reference, claimant_id, claimant_reference, claimant_auth_user_id, legal_name, originating_staff_user_id, assigned_staff_user_id",
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
      `Unable to resolve claimant messaging profile: ${error.message}`,
    );
  }

  return data
    ? legacyProfileFromRow(
        data as
          ClaimantOnboardingMessageRow,
      )
    : undefined;
}

async function getAssignedLeadMessagingProfile(
  claimantId:
    string,
): Promise<
  ClaimantMessagingProfile | undefined
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
        "id, claimant_id, claimant_reference, legal_first_name, legal_last_name, auth_user_id, originating_staff_user_id, assigned_staff_user_id, status, linked_claim_id",
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
      `Unable to resolve assigned claimant messaging profile: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    return undefined;
  }

  const row =
    data as
      AssignedLeadWorkcaseMessageRow;

  /*
   * Once this recovery becomes a real Claim, claimant_onboarding must become
   * authoritative. Never silently continue against the pre-Claim repository
   * when a Claim binding exists.
   */
  if (
    row.linked_claim_id ||
    row.status ===
      "bound_to_claim"
  ) {
    throw new Error(
      "This claimant recovery is linked to an official Claim, but its Claim-backed messaging profile could not be resolved.",
    );
  }

  if (
    row.status !==
      "activated"
  ) {
    return undefined;
  }

  if (
    !row.auth_user_id
  ) {
    throw new Error(
      "The activated claimant recovery does not have a bound authentication identity.",
    );
  }

  return assignedLeadProfileFromRow(
    row,
  );
}

async function getClaimantMessagingProfileUnscoped(
  claimantId:
    string,
): Promise<
  ClaimantMessagingProfile | undefined
> {
  const normalized =
    requireNonEmpty(
      claimantId,
      "Claimant ID",
    );

  const legacy =
    await getLegacyMessagingProfile(
      normalized,
    );

  if (
    legacy
  ) {
    return legacy;
  }

  return getAssignedLeadMessagingProfile(
    normalized,
  );
}

/**
 * Unscoped profile read retained for claimant-self services.
 *
 * The claimant API authenticates the current claimant before calling these
 * functions. Staff operations perform a second assignment-scope check.
 */
export async function getClaimantMessagingProfile(
  claimantId:
    string,
): Promise<
  ClaimantMessagingProfile | undefined
> {
  return getClaimantMessagingProfileUnscoped(
    claimantId,
  );
}

async function getClaimantMessagingProfileForStaff(
  session:
    StaffSession,
  claimantId:
    string,
): Promise<
  ClaimantMessagingProfile | undefined
> {
  const profile =
    await getClaimantMessagingProfileUnscoped(
      claimantId,
    );

  if (
    !profile ||
    !staffMayAccessProfile(
      session,
      profile,
    )
  ) {
    return undefined;
  }

  return profile;
}

/* ========================================================================== */
/* Thread reads                                                                */
/* ========================================================================== */

async function getThreadRowForProfile(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
): Promise<
  ClaimantMessageThreadRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_message_threads",
        )
        .select(
          "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
        )
        .eq(
          "id",
          threadId,
        )
        .eq(
          "claim_id",
          profile.claimId,
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to read claimant message thread: ${error.message}`,
      );
    }

    return data
      ? data as
          ClaimantMessageThreadRow
      : undefined;
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .select(
        "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
      )
      .eq(
        "id",
        threadId,
      )
      .eq(
        "workcase_id",
        profile.claimId,
      )
      .eq(
        "claimant_id",
        profile.claimantId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read assigned claimant message thread: ${error.message}`,
    );
  }

  return data
    ? data as
        ClaimantMessageThreadRow
    : undefined;
}

async function getThreadForProfile(
  profile:
    ClaimantMessagingProfile,
): Promise<
  ClaimantMessageThreadRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_message_threads",
        )
        .select(
          "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
        )
        .eq(
          "claim_id",
          profile.claimId,
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to read claimant conversation: ${error.message}`,
      );
    }

    return data
      ? data as
          ClaimantMessageThreadRow
      : undefined;
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .select(
        "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
      )
      .eq(
        "workcase_id",
        profile.claimId,
      )
      .eq(
        "claimant_id",
        profile.claimantId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read assigned claimant conversation: ${error.message}`,
    );
  }

  return data
    ? data as
        ClaimantMessageThreadRow
    : undefined;
}

/* ========================================================================== */
/* Thread creation                                                             */
/* ========================================================================== */

async function reopenThread(
  profile:
    ClaimantMessagingProfile,
  thread:
    ClaimantMessageThreadRow,
): Promise<
  ClaimantMessageThreadRow
> {
  const admin =
    getSupabaseAdmin();

  const now =
    new Date().toISOString();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_message_threads",
        )
        .update({
          status:
            "active",

          updated_at:
            now,
        })
        .eq(
          "id",
          thread.id,
        )
        .select(
          "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
        )
        .single();

    if (
      error
    ) {
      throw new Error(
        `Unable to reopen claimant conversation: ${error.message}`,
      );
    }

    return data as
      ClaimantMessageThreadRow;
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .update({
        status:
          "active",

        updated_at:
          now,
      })
      .eq(
        "id",
        thread.id,
      )
      .select(
        "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to reopen assigned claimant conversation: ${error.message}`,
    );
  }

  return data as
    ClaimantMessageThreadRow;
}

async function ensureStaffThread(
  profile:
    ClaimantMessagingProfile,
  actor:
    StaffUser,
): Promise<
  ClaimantMessageThreadRow
> {
  const existing =
    await getThreadForProfile(
      profile,
    );

  if (
    existing
  ) {
    if (
      existing.status ===
        "closed"
    ) {
      return reopenThread(
        profile,
        existing,
      );
    }

    return existing;
  }

  const admin =
    getSupabaseAdmin();

  const now =
    new Date().toISOString();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_message_threads",
        )
        .insert({
          claim_id:
            profile.claimId,

          created_by_staff_user_id:
            actor.id,

          status:
            "active",

          created_at:
            now,

          updated_at:
            now,
        })
        .select(
          "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
        )
        .single();

    if (
      error &&
      error.code ===
        "23505"
    ) {
      const raced =
        await getThreadForProfile(
          profile,
        );

      if (
        raced
      ) {
        return raced;
      }
    }

    if (
      error ||
      !data
    ) {
      throw new Error(
        `Unable to create claimant conversation: ${
          error?.message ??
          "Unknown database error."
        }`,
      );
    }

    return data as
      ClaimantMessageThreadRow;
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .insert({
        workcase_id:
          profile.claimId,

        claimant_id:
          profile.claimantId,

        created_by_staff_user_id:
          actor.id,

        status:
          "active",

        created_at:
          now,

        updated_at:
          now,
      })
      .select(
        "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
      )
      .single();

  if (
    error &&
    error.code ===
      "23505"
  ) {
    const raced =
      await getThreadForProfile(
        profile,
      );

    if (
      raced
    ) {
      return raced;
    }
  }

  if (
    error ||
    !data
  ) {
    throw new Error(
      `Unable to create assigned claimant conversation: ${
        error?.message ??
        "Unknown database error."
      }`,
    );
  }

  return data as
    ClaimantMessageThreadRow;
}

/* ========================================================================== */
/* Attachment mapping                                                          */
/* ========================================================================== */

function attachmentFromRow(
  row:
    ClaimantMessageAttachmentRow,
): ClaimantMessageAttachment {
  return {
    id:
      row.id,

    messageId:
      row.message_id,

    fileName:
      row.file_name,

    mimeType:
      row.mime_type,

    sizeBytes:
      Number(
        row.size_bytes,
      ),

    createdAt:
      row.created_at,
  };
}

async function attachmentsForMessages(
  profile:
    ClaimantMessagingProfile,
  messageIds:
    string[],
): Promise<
  Map<
    string,
    ClaimantMessageAttachment[]
  >
> {
  const result =
    new Map<
      string,
      ClaimantMessageAttachment[]
    >();

  if (
    messageIds.length ===
      0
  ) {
    return result;
  }

  const admin =
    getSupabaseAdmin();

  let rows:
    ClaimantMessageAttachmentRow[] =
    [];

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_message_attachments",
        )
        .select(
          "*",
        )
        .in(
          "message_id",
          messageIds,
        )
        .order(
          "created_at",
          {
            ascending:
              true,
          },
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to read claimant message attachments: ${error.message}`,
      );
    }

    rows =
      (
        data ??
        []
      ) as
        ClaimantMessageAttachmentRow[];
  } else {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "assigned_lead_claimant_message_attachments",
        )
        .select(
          "*",
        )
        .in(
          "message_id",
          messageIds,
        )
        .order(
          "created_at",
          {
            ascending:
              true,
          },
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to read assigned claimant message attachments: ${error.message}`,
      );
    }

    rows =
      (
        data ??
        []
      ) as
        ClaimantMessageAttachmentRow[];
  }

  for (
    const row of
      rows
  ) {
    const existing =
      result.get(
        row.message_id,
      ) ??
      [];

    existing.push(
      attachmentFromRow(
        row,
      ),
    );

    result.set(
      row.message_id,
      existing,
    );
  }

  return result;
}

/* ========================================================================== */
/* Staff directory                                                             */
/* ========================================================================== */

async function staffNames(
  staffUserIds:
    string[],
): Promise<
  Map<
    string,
    string
  >
> {
  const unique =
    [
      ...new Set(
        staffUserIds.filter(
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
    unique.length ===
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
        unique,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve claimant-message staff identities: ${error.message}`,
    );
  }

  for (
    const rawRow of
      data ??
      []
  ) {
    const row =
      rawRow as
        StaffDirectoryRow;

    result.set(
      row.id,
      row.name,
    );
  }

  return result;
}

/* ========================================================================== */
/* Message loading                                                             */
/* ========================================================================== */

async function loadMessageRows(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
): Promise<
  ClaimantMessageRow[]
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_messages",
        )
        .select(
          "*",
        )
        .eq(
          "thread_id",
          threadId,
        )
        .eq(
          "state",
          "sent",
        )
        .order(
          "sent_at",
          {
            ascending:
              true,
          },
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to read claimant messages: ${error.message}`,
      );
    }

    return (
      data ??
      []
    ) as
      ClaimantMessageRow[];
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_messages",
      )
      .select(
        "*",
      )
      .eq(
        "thread_id",
        threadId,
      )
      .eq(
        "state",
        "sent",
      )
      .order(
        "sent_at",
        {
          ascending:
            true,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to read assigned claimant messages: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ) as
    ClaimantMessageRow[];
}

async function loadMessages(
  thread:
    ClaimantMessageThreadRow,
  profile:
    ClaimantMessagingProfile,
): Promise<
  ClaimantMessageItem[]
> {
  const rows =
    await loadMessageRows(
      profile,
      thread.id,
    );

  const attachments =
    await attachmentsForMessages(
      profile,
      rows.map(
        (
          row,
        ) =>
          row.id,
      ),
    );

  const names =
    await staffNames(
      rows.flatMap(
        (
          row,
        ) =>
          row.sender_staff_user_id
            ? [
                row.sender_staff_user_id,
              ]
            : [],
      ),
    );

  return rows.map(
    (
      row,
    ) => ({
      id:
        row.id,

      threadId:
        row.thread_id,

      replyToMessageId:
        row.reply_to_message_id ??
        undefined,

      senderType:
        row.sender_type,

      senderName:
        row.sender_type ===
        "staff"
          ? (
              row.sender_staff_user_id
                ? names.get(
                    row.sender_staff_user_id,
                  )
                : undefined
            ) ??
            "DueQuity staff"
          : profile.legalName,

      bodyText:
        row.body_text,

      sentAt:
        row.sent_at ??
        row.created_at,

      claimantReadAt:
        row.claimant_read_at ??
        undefined,

      staffReadAt:
        row.staff_read_at ??
        undefined,

      attachments:
        attachments.get(
          row.id,
        ) ??
        [],
    }),
  );
}

/* ========================================================================== */
/* Read state                                                                  */
/* ========================================================================== */

async function markThreadReadForStaff(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
): Promise<
  void
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      error,
    } =
      await admin
        .from(
          "claimant_messages",
        )
        .update({
          staff_read_at:
            new Date().toISOString(),
        })
        .eq(
          "thread_id",
          threadId,
        )
        .eq(
          "sender_type",
          "claimant",
        )
        .is(
          "staff_read_at",
          null,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to mark claimant replies read: ${error.message}`,
      );
    }

    return;
  }

  const {
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_messages",
      )
      .update({
        staff_read_at:
          new Date().toISOString(),
      })
      .eq(
        "thread_id",
        threadId,
      )
      .eq(
        "sender_type",
        "claimant",
      )
      .is(
        "staff_read_at",
        null,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to mark assigned claimant replies read: ${error.message}`,
    );
  }
}

async function markThreadReadForClaimant(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
): Promise<
  void
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      error,
    } =
      await admin
        .from(
          "claimant_messages",
        )
        .update({
          claimant_read_at:
            new Date().toISOString(),
        })
        .eq(
          "thread_id",
          threadId,
        )
        .eq(
          "sender_type",
          "staff",
        )
        .is(
          "claimant_read_at",
          null,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to mark DueQuity messages read: ${error.message}`,
      );
    }

    return;
  }

  const {
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_messages",
      )
      .update({
        claimant_read_at:
          new Date().toISOString(),
      })
      .eq(
        "thread_id",
        threadId,
      )
      .eq(
        "sender_type",
        "staff",
      )
      .is(
        "claimant_read_at",
        null,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to mark assigned DueQuity messages read: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Summary                                                                     */
/* ========================================================================== */

async function loadSummaryRows(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
): Promise<
  Array<{
    body_text:
      string;

    sender_type:
      | "staff"
      | "claimant";

    claimant_read_at:
      | string
      | null;

    staff_read_at:
      | string
      | null;

    sent_at:
      | string
      | null;

    created_at:
      string;
  }>
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_messages",
        )
        .select(
          "body_text, sender_type, claimant_read_at, staff_read_at, sent_at, created_at",
        )
        .eq(
          "thread_id",
          threadId,
        )
        .eq(
          "state",
          "sent",
        )
        .order(
          "sent_at",
          {
            ascending:
              false,
          },
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to summarize claimant conversation: ${error.message}`,
      );
    }

    return (
      data ??
      []
    ) as Array<{
      body_text:
        string;

      sender_type:
        | "staff"
        | "claimant";

      claimant_read_at:
        | string
        | null;

      staff_read_at:
        | string
        | null;

      sent_at:
        | string
        | null;

      created_at:
        string;
    }>;
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_messages",
      )
      .select(
        "body_text, sender_type, claimant_read_at, staff_read_at, sent_at, created_at",
      )
      .eq(
        "thread_id",
        threadId,
      )
      .eq(
        "state",
        "sent",
      )
      .order(
        "sent_at",
        {
          ascending:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to summarize assigned claimant conversation: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ) as Array<{
    body_text:
      string;

    sender_type:
      | "staff"
      | "claimant";

    claimant_read_at:
      | string
      | null;

    staff_read_at:
      | string
      | null;

    sent_at:
      | string
      | null;

    created_at:
      string;
  }>;
}

async function buildThreadSummary(
  thread:
    ClaimantMessageThreadRow,
  profile:
    ClaimantMessagingProfile,
  viewer:
    | "staff"
    | "claimant",
): Promise<
  ClaimantMessageThreadSummary
> {
  const rows =
    await loadSummaryRows(
      profile,
      thread.id,
    );

  const latest =
    rows[0];

  const unreadCount =
    rows.filter(
      (
        row,
      ) =>
        viewer ===
        "staff"
          ? (
              row.sender_type ===
                "claimant" &&
              !row.staff_read_at
            )
          : (
              row.sender_type ===
                "staff" &&
              !row.claimant_read_at
            ),
    ).length;

  return {
    id:
      thread.id,

    claimId:
      profile.claimId,

    claimReference:
      profile.claimReference,

    claimantId:
      profile.claimantId,

    claimantReference:
      profile.claimantReference,

    legalName:
      profile.legalName,

    status:
      thread.status,

    lastMessageAt:
      thread.last_message_at ??
      (
        latest
          ? latest.sent_at ??
            latest.created_at
          : undefined
      ),

    lastMessagePreview:
      latest?.body_text
        ?.trim()
        .replace(
          /\s+/g,
          " ",
        )
        .slice(
          0,
          120,
        ) ??
      "",

    unreadCount,
  };
}

/* ========================================================================== */
/* Thread listing                                                              */
/* ========================================================================== */

async function loadThreadRows(
  profile:
    ClaimantMessagingProfile,
): Promise<
  ClaimantMessageThreadRow[]
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_message_threads",
        )
        .select(
          "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
        )
        .eq(
          "claim_id",
          profile.claimId,
        )
        .order(
          "last_message_at",
          {
            ascending:
              false,

            nullsFirst:
              false,
          },
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to list claimant conversations: ${error.message}`,
      );
    }

    return (
      data ??
      []
    ) as
      ClaimantMessageThreadRow[];
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .select(
        "id, created_by_staff_user_id, status, last_message_at, created_at, updated_at",
      )
      .eq(
        "workcase_id",
        profile.claimId,
      )
      .eq(
        "claimant_id",
        profile.claimantId,
      )
      .order(
        "last_message_at",
        {
          ascending:
            false,

          nullsFirst:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to list assigned claimant conversations: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ) as
    ClaimantMessageThreadRow[];
}

async function listThreads(
  profile:
    ClaimantMessagingProfile,
  viewer:
    | "staff"
    | "claimant",
): Promise<
  ClaimantMessageThreadSummary[]
> {
  const rows =
    await loadThreadRows(
      profile,
    );

  return Promise.all(
    rows.map(
      (
        row,
      ) =>
        buildThreadSummary(
          row,
          profile,
          viewer,
        ),
    ),
  );
}

export async function listClaimantMessageThreadsForStaff(
  claimantId:
    string,
): Promise<
  ClaimantMessageThreadSummary[]
> {
  const session =
    await requireCurrentStaffSession();

  const profile =
    await getClaimantMessagingProfileForStaff(
      session,
      claimantId,
    );

  if (
    !profile
  ) {
    return [];
  }

  return listThreads(
    profile,
    "staff",
  );
}

export async function listClaimantMessageThreadsForClaimant(
  claimantId:
    string,
): Promise<
  ClaimantMessageThreadSummary[]
> {
  const profile =
    await getClaimantMessagingProfileUnscoped(
      claimantId,
    );

  if (
    !profile
  ) {
    return [];
  }

  return listThreads(
    profile,
    "claimant",
  );
}

/* ========================================================================== */
/* Thread authorization                                                        */
/* ========================================================================== */

async function authorizeThread(
  claimantId:
    string,
  threadId:
    string,
): Promise<{
  thread:
    ClaimantMessageThreadRow;

  profile:
    ClaimantMessagingProfile;
}> {
  const profile =
    await getClaimantMessagingProfileUnscoped(
      claimantId,
    );

  if (
    !profile
  ) {
    throw new Error(
      "Claimant conversation was not found.",
    );
  }

  const thread =
    await getThreadRowForProfile(
      profile,
      requireNonEmpty(
        threadId,
        "Thread ID",
      ),
    );

  if (
    !thread
  ) {
    throw new Error(
      "You are not authorized to access this claimant conversation.",
    );
  }

  return {
    thread,

    profile,
  };
}

async function authorizeStaffThread(
  session:
    StaffSession,
  claimantId:
    string,
  threadId:
    string,
): Promise<{
  thread:
    ClaimantMessageThreadRow;

  profile:
    ClaimantMessagingProfile;
}> {
  const authorized =
    await authorizeThread(
      claimantId,
      threadId,
    );

  if (
    !staffMayAccessProfile(
      session,
      authorized.profile,
    )
  ) {
    throw new Error(
      "Claimant conversation was not found.",
    );
  }

  return authorized;
}

/* ========================================================================== */
/* Thread views                                                                */
/* ========================================================================== */

export async function getClaimantMessageThreadForStaff(
  claimantId:
    string,
  threadId:
    string,
  markRead =
    true,
): Promise<
  ClaimantMessageThreadView
> {
  const session =
    await requireCurrentStaffSession();

  const {
    thread,
    profile,
  } =
    await authorizeStaffThread(
      session,
      claimantId,
      threadId,
    );

  if (
    markRead
  ) {
    await markThreadReadForStaff(
      profile,
      thread.id,
    );
  }

  const [
    summary,
    messages,
  ] =
    await Promise.all([
      buildThreadSummary(
        thread,
        profile,
        "staff",
      ),

      loadMessages(
        thread,
        profile,
      ),
    ]);

  return {
    ...summary,

    messages,
  };
}

export async function getClaimantMessageThreadForClaimant(
  claimantId:
    string,
  threadId:
    string,
  markRead =
    true,
): Promise<
  ClaimantMessageThreadView
> {
  const {
    thread,
    profile,
  } =
    await authorizeThread(
      claimantId,
      threadId,
    );

  if (
    markRead
  ) {
    await markThreadReadForClaimant(
      profile,
      thread.id,
    );
  }

  const [
    summary,
    messages,
  ] =
    await Promise.all([
      buildThreadSummary(
        thread,
        profile,
        "claimant",
      ),

      loadMessages(
        thread,
        profile,
      ),
    ]);

  return {
    ...summary,

    messages,
  };
}

/* ========================================================================== */
/* Reply validation                                                            */
/* ========================================================================== */

async function validateReplyTarget(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
  replyToMessageId:
    string | undefined,
): Promise<
  string | null
> {
  const normalized =
    replyToMessageId
      ?.trim();

  if (
    !normalized
  ) {
    return null;
  }

  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_messages",
        )
        .select(
          "id",
        )
        .eq(
          "id",
          normalized,
        )
        .eq(
          "thread_id",
          threadId,
        )
        .eq(
          "state",
          "sent",
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to validate reply target: ${error.message}`,
      );
    }

    if (
      !data
    ) {
      throw new Error(
        "The message being replied to is not part of this claimant conversation.",
      );
    }

    return normalized;
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_messages",
      )
      .select(
        "id",
      )
      .eq(
        "id",
        normalized,
      )
      .eq(
        "thread_id",
        threadId,
      )
      .eq(
        "state",
        "sent",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to validate assigned claimant reply target: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "The message being replied to is not part of this claimant conversation.",
    );
  }

  return normalized;
}

/* ========================================================================== */
/* Message insertion helpers                                                   */
/* ========================================================================== */

async function insertMessageRow(
  profile:
    ClaimantMessagingProfile,
  values:
    Record<
      string,
      unknown
    >,
): Promise<
  void
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      error,
    } =
      await admin
        .from(
          "claimant_messages",
        )
        .insert(
          values,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to send claimant message: ${error.message}`,
      );
    }

    return;
  }

  const {
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_messages",
      )
      .insert(
        values,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to send assigned claimant message: ${error.message}`,
    );
  }
}

async function insertAttachmentRows(
  profile:
    ClaimantMessagingProfile,
  rows:
    Array<
      Record<
        string,
        unknown
      >
    >,
): Promise<
  void
> {
  if (
    rows.length ===
      0
  ) {
    return;
  }

  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      error,
    } =
      await admin
        .from(
          "claimant_message_attachments",
        )
        .insert(
          rows,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to record claimant message attachments: ${error.message}`,
      );
    }

    return;
  }

  const {
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_attachments",
      )
      .insert(
        rows,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to record assigned claimant message attachments: ${error.message}`,
    );
  }
}

async function updateThreadAfterSend(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
  now:
    string,
): Promise<
  void
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    const {
      error,
    } =
      await admin
        .from(
          "claimant_message_threads",
        )
        .update({
          status:
            "active",

          last_message_at:
            now,

          updated_at:
            now,
        })
        .eq(
          "id",
          threadId,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to update claimant conversation: ${error.message}`,
      );
    }

    return;
  }

  const {
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .update({
        status:
          "active",

        last_message_at:
          now,

        updated_at:
          now,
      })
      .eq(
        "id",
        threadId,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to update assigned claimant conversation: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Cleanup                                                                     */
/* ========================================================================== */

async function cleanupFailedMessage(
  profile:
    ClaimantMessagingProfile,
  messageId:
    string,
): Promise<
  void
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    await admin
      .from(
        "claimant_message_attachments",
      )
      .delete()
      .eq(
        "message_id",
        messageId,
      );

    await admin
      .from(
        "claimant_messages",
      )
      .delete()
      .eq(
        "id",
        messageId,
      );

    return;
  }

  await admin
    .from(
      "assigned_lead_claimant_message_attachments",
    )
    .delete()
    .eq(
      "message_id",
      messageId,
    );

  await admin
    .from(
      "assigned_lead_claimant_messages",
    )
    .delete()
    .eq(
      "id",
      messageId,
    );
}

/* ========================================================================== */
/* Send                                                                        */
/* ========================================================================== */

async function sendMessage({
  thread,
  profile,
  senderType,
  senderStaffUserId,
  senderClaimantAuthUserId,
  bodyText,
  replyToMessageId,
  files,
}: {
  thread:
    ClaimantMessageThreadRow;

  profile:
    ClaimantMessagingProfile;

  senderType:
    | "staff"
    | "claimant";

  senderStaffUserId?:
    string;

  senderClaimantAuthUserId?:
    string;

  bodyText:
    string;

  replyToMessageId?:
    string;

  files:
    File[];
}): Promise<
  string
> {
  const body =
    normalizeBodyText(
      bodyText,
    );

  validateFiles(
    files,
  );

  if (
    !body &&
    files.length ===
      0
  ) {
    throw new Error(
      "Write a message or attach a file before sending.",
    );
  }

  const replyTarget =
    await validateReplyTarget(
      profile,
      thread.id,
      replyToMessageId,
    );

  const messageId =
    randomUUID();

  const now =
    new Date().toISOString();

  const admin =
    getSupabaseAdmin();

  const uploadedPaths:
    string[] =
    [];

  const attachmentRows:
    Array<
      Record<
        string,
        unknown
      >
    > =
    [];

  let messageInserted =
    false;

  try {
    for (
      const file of
        files
    ) {
      const attachmentId =
        randomUUID();

      const fileName =
        safeFileName(
          file.name,
        );

      const storagePath =
        [
          profile.recordKind,
          profile.claimantReference,
          thread.id,
          messageId,
          `${attachmentId}-${fileName}`,
        ].join(
          "/",
        );

      const arrayBuffer =
        await file.arrayBuffer();

      const {
        error:
          uploadError,
      } =
        await admin.storage
          .from(
            CLAIMANT_MESSAGE_STORAGE_BUCKET,
          )
          .upload(
            storagePath,
            Buffer.from(
              arrayBuffer,
            ),
            {
              contentType:
                file.type,

              upsert:
                false,
            },
          );

      if (
        uploadError
      ) {
        throw new Error(
          `Unable to upload ${fileName}: ${uploadError.message}`,
        );
      }

      uploadedPaths.push(
        storagePath,
      );

      attachmentRows.push({
        id:
          attachmentId,

        message_id:
          messageId,

        uploader_type:
          senderType,

        uploaded_by_staff_user_id:
          senderType ===
          "staff"
            ? senderStaffUserId ??
              null
            : null,

        uploaded_by_claimant_auth_user_id:
          senderType ===
          "claimant"
            ? senderClaimantAuthUserId ??
              null
            : null,

        storage_path:
          storagePath,

        file_name:
          fileName,

        mime_type:
          file.type,

        size_bytes:
          file.size,

        created_at:
          now,
      });
    }

    await insertMessageRow(
      profile,
      {
        id:
          messageId,

        thread_id:
          thread.id,

        reply_to_message_id:
          replyTarget,

        sender_type:
          senderType,

        sender_staff_user_id:
          senderType ===
          "staff"
            ? senderStaffUserId ??
              null
            : null,

        sender_claimant_auth_user_id:
          senderType ===
          "claimant"
            ? senderClaimantAuthUserId ??
              null
            : null,

        body_text:
          body,

        state:
          "sent",

        sent_at:
          now,

        claimant_read_at:
          null,

        staff_read_at:
          null,

        created_at:
          now,

        updated_at:
          now,
      },
    );

    messageInserted =
      true;

    await insertAttachmentRows(
      profile,
      attachmentRows,
    );

    await updateThreadAfterSend(
      profile,
      thread.id,
      now,
    );

    return messageId;
  } catch (
    error
  ) {
    if (
      messageInserted
    ) {
      await cleanupFailedMessage(
        profile,
        messageId,
      );
    }

    if (
      uploadedPaths.length >
        0
    ) {
      await admin.storage
        .from(
          CLAIMANT_MESSAGE_STORAGE_BUCKET,
        )
        .remove(
          uploadedPaths,
        );
    }

    throw error;
  }
}

/* ========================================================================== */
/* Staff send                                                                  */
/* ========================================================================== */

export async function sendStaffClaimantMessage({
  actor,
  claimantId,
  bodyText,
  replyToMessageId,
  files,
}: {
  actor:
    StaffUser;

  claimantId:
    string;

  bodyText:
    string;

  replyToMessageId?:
    string;

  files:
    File[];
}): Promise<
  ClaimantMessageThreadView
> {
  const session =
    await requireCurrentStaffSession(
      actor.id,
    );

  const profile =
    await getClaimantMessagingProfileForStaff(
      session,
      claimantId,
    );

  if (
    !profile
  ) {
    throw new Error(
      "Claimant record was not found.",
    );
  }

  const thread =
    await ensureStaffThread(
      profile,
      actor,
    );

  await sendMessage({
    thread,

    profile,

    senderType:
      "staff",

    senderStaffUserId:
      actor.id,

    bodyText,

    replyToMessageId,

    files,
  });

  return getClaimantMessageThreadForStaff(
    claimantId,
    thread.id,
    false,
  );
}

/* ========================================================================== */
/* Claimant send                                                               */
/* ========================================================================== */

export async function sendClaimantPortalMessage({
  claimantId,
  threadId,
  bodyText,
  replyToMessageId,
  files,
}: {
  claimantId:
    string;

  threadId:
    string;

  bodyText:
    string;

  replyToMessageId?:
    string;

  files:
    File[];
}): Promise<
  ClaimantMessageThreadView
> {
  const {
    thread,
    profile,
  } =
    await authorizeThread(
      claimantId,
      threadId,
    );

  if (
    thread.status !==
      "active"
  ) {
    throw new Error(
      "This claimant conversation is currently closed.",
    );
  }

  if (
    !profile.claimantAuthUserId
  ) {
    throw new Error(
      "The claimant portal account is not activated.",
    );
  }

  await sendMessage({
    thread,

    profile,

    senderType:
      "claimant",

    senderClaimantAuthUserId:
      profile.claimantAuthUserId,

    bodyText,

    replyToMessageId,

    files,
  });

  return getClaimantMessageThreadForClaimant(
    claimantId,
    thread.id,
    false,
  );
}

/* ========================================================================== */
/* Attachment authorization                                                    */
/* ========================================================================== */

async function resolveLegacyAttachment(
  profile:
    ClaimantMessagingProfile,
  attachmentId:
    string,
): Promise<
  ClaimantMessageAttachmentRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  const {
    data:
      attachmentData,
    error:
      attachmentError,
  } =
    await admin
      .from(
        "claimant_message_attachments",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        attachmentId,
      )
      .maybeSingle();

  if (
    attachmentError ||
    !attachmentData
  ) {
    return undefined;
  }

  const attachment =
    attachmentData as
      ClaimantMessageAttachmentRow;

  const {
    data:
      messageData,
    error:
      messageError,
  } =
    await admin
      .from(
        "claimant_messages",
      )
      .select(
        "thread_id",
      )
      .eq(
        "id",
        attachment.message_id,
      )
      .maybeSingle();

  if (
    messageError ||
    !messageData
  ) {
    return undefined;
  }

  const thread =
    await getThreadRowForProfile(
      profile,
      String(
        messageData.thread_id,
      ),
    );

  return thread
    ? attachment
    : undefined;
}

async function resolveAssignedLeadAttachment(
  profile:
    ClaimantMessagingProfile,
  attachmentId:
    string,
): Promise<
  ClaimantMessageAttachmentRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  const {
    data:
      attachmentData,
    error:
      attachmentError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_attachments",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        attachmentId,
      )
      .maybeSingle();

  if (
    attachmentError ||
    !attachmentData
  ) {
    return undefined;
  }

  const attachment =
    attachmentData as
      ClaimantMessageAttachmentRow;

  const {
    data:
      messageData,
    error:
      messageError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_messages",
      )
      .select(
        "thread_id",
      )
      .eq(
        "id",
        attachment.message_id,
      )
      .maybeSingle();

  if (
    messageError ||
    !messageData
  ) {
    return undefined;
  }

  const thread =
    await getThreadRowForProfile(
      profile,
      String(
        messageData.thread_id,
      ),
    );

  return thread
    ? attachment
    : undefined;
}

async function resolveAttachmentAuthorization(
  claimantId:
    string,
  attachmentId:
    string,
): Promise<{
  attachment:
    ClaimantMessageAttachmentRow;

  profile:
    ClaimantMessagingProfile;
}> {
  const profile =
    await getClaimantMessagingProfileUnscoped(
      claimantId,
    );

  if (
    !profile
  ) {
    throw new Error(
      "Claimant message attachment was not found.",
    );
  }

  const normalizedAttachmentId =
    requireNonEmpty(
      attachmentId,
      "Attachment ID",
    );

  const attachment =
    profile.recordKind ===
      "claim"
      ? await resolveLegacyAttachment(
          profile,
          normalizedAttachmentId,
        )
      : await resolveAssignedLeadAttachment(
          profile,
          normalizedAttachmentId,
        );

  if (
    !attachment
  ) {
    throw new Error(
      "Claimant message attachment was not found.",
    );
  }

  return {
    attachment,

    profile,
  };
}

/* ========================================================================== */
/* Signed downloads                                                            */
/* ========================================================================== */

async function signedAttachmentDownload(
  attachment:
    ClaimantMessageAttachmentRow,
): Promise<
  ClaimantMessageAttachmentDownload
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        CLAIMANT_MESSAGE_STORAGE_BUCKET,
      )
      .createSignedUrl(
        attachment.storage_path,
        CLAIMANT_MESSAGE_SIGNED_URL_SECONDS,
      );

  if (
    error ||
    !data?.signedUrl
  ) {
    throw new Error(
      `Unable to create secure claimant attachment link: ${
        error?.message ??
        "Signed URL unavailable."
      }`,
    );
  }

  return {
    url:
      data.signedUrl,

    fileName:
      attachment.file_name,

    mimeType:
      attachment.mime_type,

    expiresInSeconds:
      CLAIMANT_MESSAGE_SIGNED_URL_SECONDS,
  };
}

/**
 * Claimant-self attachment broker.
 */
export async function getClaimantMessageAttachmentDownload(
  claimantId:
    string,
  attachmentId:
    string,
): Promise<
  ClaimantMessageAttachmentDownload
> {
  const {
    attachment,
  } =
    await resolveAttachmentAuthorization(
      claimantId,
      attachmentId,
    );

  return signedAttachmentDownload(
    attachment,
  );
}

/**
 * Staff attachment broker.
 *
 * Ordinary staff may access only the claimant currently assigned to them.
 * Super Admin retains global access.
 */
export async function getClaimantMessageAttachmentDownloadForStaff(
  session:
    StaffSession,
  claimantId:
    string,
  attachmentId:
    string,
): Promise<
  ClaimantMessageAttachmentDownload
> {
  const {
    attachment,
    profile,
  } =
    await resolveAttachmentAuthorization(
      claimantId,
      attachmentId,
    );

  if (
    !staffMayAccessProfile(
      session,
      profile,
    )
  ) {
    throw new Error(
      "Claimant message attachment was not found.",
    );
  }

  return signedAttachmentDownload(
    attachment,
  );
}