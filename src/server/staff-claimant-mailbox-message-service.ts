import "server-only";

import {
  randomUUID,
} from "node:crypto";

import {
  Buffer,
} from "node:buffer";

import {
  CLAIMANT_MESSAGE_MAX_ATTACHMENT_BYTES,
  CLAIMANT_MESSAGE_MAX_ATTACHMENTS,
  CLAIMANT_MESSAGE_MAX_BODY_LENGTH,
  CLAIMANT_MESSAGE_STORAGE_BUCKET,
  getClaimantMessagingProfile,
  type ClaimantMessagingProfile,
} from "@/server/claimant-message-store";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import type {
  StaffSession,
} from "@/lib/session";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

export const STAFF_CLAIMANT_MESSAGE_MAX_SUBJECT_LENGTH =
  200;

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
/* Types                                                                       */
/* ========================================================================== */

export interface StaffClaimantMailboxAttachment {
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

export interface StaffClaimantMailboxMessage {
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

  subject:
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
    StaffClaimantMailboxAttachment[];
}

export interface StaffClaimantMailboxThreadView {
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

  messages:
    StaffClaimantMailboxMessage[];
}

export interface SendStaffClaimantMailboxMessageInput {
  claimantId:
    string;

  subject:
    string;

  bodyText:
    string;

  replyToMessageId?:
    string;

  files:
    File[];
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ThreadRow {
  id:
    string;

  status:
    | "active"
    | "closed";

  last_message_at:
    string | null;

  created_at:
    string;

  updated_at:
    string;
}

interface MessageRow {
  id:
    string;

  thread_id:
    string;

  reply_to_message_id:
    string | null;

  sender_type:
    | "staff"
    | "claimant";

  sender_staff_user_id:
    string | null;

  sender_claimant_auth_user_id:
    string | null;

  subject:
    string | null;

  body_text:
    string;

  state:
    | "draft"
    | "sent";

  sent_at:
    string | null;

  claimant_read_at:
    string | null;

  staff_read_at:
    string | null;

  created_at:
    string;

  updated_at:
    string;
}

interface AttachmentRow {
  id:
    string;

  message_id:
    string;

  storage_path:
    string;

  file_name:
    string;

  mime_type:
    string;

  size_bytes:
    number | string;

  created_at:
    string;
}

interface StaffRow {
  id:
    string;

  name:
    string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function requireValue(
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

function normalizeSubject(
  value:
    string,
): string {
  const normalized =
    requireValue(
      value,
      "Subject",
    );

  if (
    normalized.length >
    STAFF_CLAIMANT_MESSAGE_MAX_SUBJECT_LENGTH
  ) {
    throw new Error(
      `Subject may not exceed ${STAFF_CLAIMANT_MESSAGE_MAX_SUBJECT_LENGTH} characters.`,
    );
  }

  return normalized;
}

function normalizeBody(
  value:
    string,
): string {
  const normalized =
    requireValue(
      value,
      "Message",
    );

  if (
    normalized.length >
    CLAIMANT_MESSAGE_MAX_BODY_LENGTH
  ) {
    throw new Error(
      `Message may not exceed ${CLAIMANT_MESSAGE_MAX_BODY_LENGTH.toLocaleString()} characters.`,
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

function staffHasGlobalClaimantAccess(
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

/* ========================================================================== */
/* Authorization                                                               */
/* ========================================================================== */

async function requireAuthorizedProfile(
  claimantId:
    string,
): Promise<{
  session:
    StaffSession;

  profile:
    ClaimantMessagingProfile;
}> {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    throw new Error(
      "Staff authentication is required.",
    );
  }

  const profile =
    await getClaimantMessagingProfile(
      requireValue(
        claimantId,
        "Claimant ID",
      ),
    );

  if (
    !profile
  ) {
    throw new Error(
      "Claimant messaging record was not found.",
    );
  }

  if (
    !staffHasGlobalClaimantAccess(
      session,
    ) &&
    profile.assignedStaffUserId !==
      session.user.id
  ) {
    throw new Error(
      "Claimant messaging record was not found.",
    );
  }

  return {
    session,

    profile,
  };
}

/* ========================================================================== */
/* Thread                                                                      */
/* ========================================================================== */

async function getThreadForProfile(
  profile:
    ClaimantMessagingProfile,
  threadId?:
    string,
): Promise<
  ThreadRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  if (
    profile.recordKind ===
      "claim"
  ) {
    let query =
      admin
        .from(
          "claimant_message_threads",
        )
        .select(
          "id, status, last_message_at, created_at, updated_at",
        )
        .eq(
          "claim_id",
          profile.claimId,
        );

    if (
      threadId
    ) {
      query =
        query.eq(
          "id",
          threadId,
        );
    }

    const {
      data,
      error,
    } =
      await query
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to resolve claimant message thread: ${error.message}`,
      );
    }

    return data
      ? data as
          ThreadRow
      : undefined;
  }

  const workcaseId =
    profile.workcaseId ??
    profile.claimId;

  let query =
    admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .select(
        "id, status, last_message_at, created_at, updated_at",
      )
      .eq(
        "workcase_id",
        workcaseId,
      )
      .eq(
        "claimant_id",
        profile.claimantId,
      );

  if (
    threadId
  ) {
    query =
      query.eq(
        "id",
        threadId,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve assigned claimant message thread: ${error.message}`,
    );
  }

  return data
    ? data as
        ThreadRow
    : undefined;
}

async function ensureThread(
  profile:
    ClaimantMessagingProfile,
  staffUserId:
    string,
): Promise<
  ThreadRow
> {
  const existing =
    await getThreadForProfile(
      profile,
    );

  const admin =
    getSupabaseAdmin();

  if (
    existing
  ) {
    if (
      existing.status ===
        "active"
    ) {
      return existing;
    }

    const table =
      profile.recordKind ===
        "claim"
        ? "claimant_message_threads"
        : "assigned_lead_claimant_message_threads";

    const {
      data,
      error,
    } =
      await admin
        .from(
          table,
        )
        .update({
          status:
            "active",

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          existing.id,
        )
        .select(
          "id, status, last_message_at, created_at, updated_at",
        )
        .single();

    if (
      error
    ) {
      throw new Error(
        `Unable to reopen claimant message thread: ${error.message}`,
      );
    }

    return data as
      ThreadRow;
  }

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
            staffUserId,

          status:
            "active",

          created_at:
            now,

          updated_at:
            now,
        })
        .select(
          "id, status, last_message_at, created_at, updated_at",
        )
        .single();

    if (
      error
    ) {
      throw new Error(
        `Unable to create claimant message thread: ${error.message}`,
      );
    }

    return data as
      ThreadRow;
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
          profile.workcaseId ??
          profile.claimId,

        claimant_id:
          profile.claimantId,

        created_by_staff_user_id:
          staffUserId,

        status:
          "active",

        created_at:
          now,

        updated_at:
          now,
      })
      .select(
        "id, status, last_message_at, created_at, updated_at",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to create assigned claimant message thread: ${error.message}`,
    );
  }

  return data as
    ThreadRow;
}

/* ========================================================================== */
/* Message reads                                                               */
/* ========================================================================== */

async function loadMessages(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
): Promise<
  MessageRow[]
> {
  const admin =
    getSupabaseAdmin();

  const table =
    profile.recordKind ===
      "claim"
      ? "claimant_messages"
      : "assigned_lead_claimant_messages";

  const {
    data,
    error,
  } =
    await admin
      .from(
        table,
      )
      .select(
        "id, thread_id, reply_to_message_id, sender_type, sender_staff_user_id, sender_claimant_auth_user_id, subject, body_text, state, sent_at, claimant_read_at, staff_read_at, created_at, updated_at",
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
    MessageRow[];
}

async function loadAttachments(
  profile:
    ClaimantMessagingProfile,
  messageIds:
    string[],
): Promise<
  AttachmentRow[]
> {
  if (
    messageIds.length ===
      0
  ) {
    return [];
  }

  const admin =
    getSupabaseAdmin();

  const table =
    profile.recordKind ===
      "claim"
      ? "claimant_message_attachments"
      : "assigned_lead_claimant_message_attachments";

  const {
    data,
    error,
  } =
    await admin
      .from(
        table,
      )
      .select(
        "id, message_id, storage_path, file_name, mime_type, size_bytes, created_at",
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

  return (
    data ??
    []
  ) as
    AttachmentRow[];
}

async function loadStaffNames(
  messages:
    MessageRow[],
): Promise<
  Map<
    string,
    string
  >
> {
  const ids =
    [
      ...new Set(
        messages.flatMap(
          (
            message,
          ) =>
            message.sender_staff_user_id
              ? [
                  message.sender_staff_user_id,
                ]
              : [],
        ),
      ),
    ];

  const names =
    new Map<
      string,
      string
    >();

  if (
    ids.length ===
      0
  ) {
    return names;
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
        ids,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve claimant message staff names: ${error.message}`,
    );
  }

  for (
    const rawRow of
      data ??
      []
  ) {
    const row =
      rawRow as
        StaffRow;

    names.set(
      row.id,
      row.name,
    );
  }

  return names;
}

/* ========================================================================== */
/* Read state                                                                  */
/* ========================================================================== */

async function markClaimantMessagesRead(
  profile:
    ClaimantMessagingProfile,
  threadId:
    string,
): Promise<
  void
> {
  const admin =
    getSupabaseAdmin();

  const table =
    profile.recordKind ===
      "claim"
      ? "claimant_messages"
      : "assigned_lead_claimant_messages";

  const {
    error,
  } =
    await admin
      .from(
        table,
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
      `Unable to mark claimant messages read: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Thread view                                                                 */
/* ========================================================================== */

export async function getStaffClaimantMailboxThread(
  claimantId:
    string,
  threadId:
    string,
  markRead =
    true,
): Promise<
  StaffClaimantMailboxThreadView
> {
  const {
    profile,
  } =
    await requireAuthorizedProfile(
      claimantId,
    );

  const thread =
    await getThreadForProfile(
      profile,
      requireValue(
        threadId,
        "Thread ID",
      ),
    );

  if (
    !thread
  ) {
    throw new Error(
      "Claimant conversation was not found.",
    );
  }

  if (
    markRead
  ) {
    await markClaimantMessagesRead(
      profile,
      thread.id,
    );
  }

  const messages =
    await loadMessages(
      profile,
      thread.id,
    );

  const [
    attachments,
    staffNames,
  ] =
    await Promise.all([
      loadAttachments(
        profile,
        messages.map(
          (
            message,
          ) =>
            message.id,
        ),
      ),

      loadStaffNames(
        messages,
      ),
    ]);

  const attachmentMap =
    new Map<
      string,
      StaffClaimantMailboxAttachment[]
    >();

  for (
    const row of
      attachments
  ) {
    const current =
      attachmentMap.get(
        row.message_id,
      ) ??
      [];

    current.push({
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
    });

    attachmentMap.set(
      row.message_id,
      current,
    );
  }

  const mappedMessages =
    messages.map(
      (
        message,
      ): StaffClaimantMailboxMessage => ({
        id:
          message.id,

        threadId:
          message.thread_id,

        replyToMessageId:
          message.reply_to_message_id ??
          undefined,

        senderType:
          message.sender_type,

        senderName:
          message.sender_type ===
            "staff"
            ? (
                message.sender_staff_user_id
                  ? staffNames.get(
                      message.sender_staff_user_id,
                    )
                  : undefined
              ) ??
              "DueQuity staff"
            : profile.legalName,

        subject:
          message.subject?.trim() ||
          "(No subject)",

        bodyText:
          message.body_text,

        sentAt:
          message.sent_at ??
          message.created_at,

        claimantReadAt:
          message.claimant_read_at ??
          undefined,

        staffReadAt:
          message.staff_read_at ??
          undefined,

        attachments:
          attachmentMap.get(
            message.id,
          ) ??
          [],
      }),
    );

  const latest =
    mappedMessages[
      mappedMessages.length -
        1
    ];

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
      latest?.sentAt,

    lastMessagePreview:
      latest?.bodyText
        .trim()
        .replace(
          /\s+/g,
          " ",
        )
        .slice(
          0,
          120,
        ) ??
      "",

    unreadCount:
      mappedMessages.filter(
        (
          message,
        ) =>
          message.senderType ===
            "claimant" &&
          !message.staffReadAt,
      ).length,

    messages:
      mappedMessages,
  };
}

/* ========================================================================== */
/* Reply validation                                                            */
/* ========================================================================== */

async function validateReply(
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

  const table =
    profile.recordKind ===
      "claim"
      ? "claimant_messages"
      : "assigned_lead_claimant_messages";

  const {
    data,
    error,
  } =
    await admin
      .from(
        table,
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

/* ========================================================================== */
/* Send                                                                        */
/* ========================================================================== */

export async function sendStaffClaimantMailboxMessage(
  input:
    SendStaffClaimantMailboxMessageInput,
): Promise<
  StaffClaimantMailboxThreadView
> {
  const {
    session,
    profile,
  } =
    await requireAuthorizedProfile(
      input.claimantId,
    );

  const subject =
    normalizeSubject(
      input.subject,
    );

  const bodyText =
    normalizeBody(
      input.bodyText,
    );

  validateFiles(
    input.files,
  );

  const thread =
    await ensureThread(
      profile,
      session.user.id,
    );

  const replyTarget =
    await validateReply(
      profile,
      thread.id,
      input.replyToMessageId,
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
        input.files
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
              await file.arrayBuffer(),
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
          "staff",

        uploaded_by_staff_user_id:
          session.user.id,

        uploaded_by_claimant_auth_user_id:
          null,

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

    const baseMessage = {
      id:
        messageId,

      thread_id:
        thread.id,

      reply_to_message_id:
        replyTarget,

      sender_type:
        "staff",

      sender_staff_user_id:
        session.user.id,

      sender_claimant_auth_user_id:
        null,

      subject,

      body_text:
        bodyText,

      state:
        "sent",

      sent_at:
        now,

      claimant_read_at:
        null,

      staff_read_at:
        now,

      created_at:
        now,

      updated_at:
        now,
    };

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
            baseMessage,
          );

      if (
        error
      ) {
        throw new Error(
          `Unable to send claimant message: ${error.message}`,
        );
      }
    } else {
      const {
        error,
      } =
        await admin
          .from(
            "assigned_lead_claimant_messages",
          )
          .insert({
            ...baseMessage,

            recipient_staff_user_id:
              null,
          });

      if (
        error
      ) {
        throw new Error(
          `Unable to send assigned claimant message: ${error.message}`,
        );
      }
    }

    messageInserted =
      true;

    if (
      attachmentRows.length >
        0
    ) {
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
              attachmentRows,
            );

        if (
          error
        ) {
          throw new Error(
            `Unable to register claimant message attachments: ${error.message}`,
          );
        }
      } else {
        const {
          error,
        } =
          await admin
            .from(
              "assigned_lead_claimant_message_attachments",
            )
            .insert(
              attachmentRows,
            );

        if (
          error
        ) {
          throw new Error(
            `Unable to register assigned claimant message attachments: ${error.message}`,
          );
        }
      }
    }

    const threadTable =
      profile.recordKind ===
        "claim"
        ? "claimant_message_threads"
        : "assigned_lead_claimant_message_threads";

    const {
      error:
        threadError,
    } =
      await admin
        .from(
          threadTable,
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
          thread.id,
        );

    if (
      threadError
    ) {
      throw new Error(
        `Unable to update claimant conversation: ${threadError.message}`,
      );
    }
  } catch (
    error
  ) {
    if (
      messageInserted
    ) {
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
      } else {
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

  return getStaffClaimantMailboxThread(
    profile.claimantId,
    thread.id,
    false,
  );
}