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

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

export const CLAIMANT_MAILBOX_MAX_SUBJECT_LENGTH =
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
/* Public types                                                                */
/* ========================================================================== */

export interface ClaimantMailboxRecipient {
  staffUserId:
    string;

  name:
    string;

  title:
    string;
}

export interface ClaimantMailboxAttachment {
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

export interface ClaimantMailboxMessage {
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
    ClaimantMailboxAttachment[];
}

export interface ClaimantMailboxCounts {
  inbox:
    number;

  sent:
    number;

  attachments:
    number;
}

export interface ClaimantPortalMailboxState {
  claimantId:
    string;

  claimantReference:
    string;

  legalName:
    string;

  recoveryReference:
    string;

  recipient:
    ClaimantMailboxRecipient;

  threadId:
    string;

  messages:
    ClaimantMailboxMessage[];

  counts:
    ClaimantMailboxCounts;
}

export interface SendClaimantMailboxMessageInput {
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

interface StaffRow {
  id:
    string;

  name:
    string;

  title:
    string;
}

interface ThreadRow {
  id:
    string;

  status:
    | "active"
    | "closed";
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

/* ========================================================================== */
/* Validation                                                                  */
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
    CLAIMANT_MAILBOX_MAX_SUBJECT_LENGTH
  ) {
    throw new Error(
      `Subject may not exceed ${CLAIMANT_MAILBOX_MAX_SUBJECT_LENGTH} characters.`,
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
        `${file.name} is not an approved secure-message attachment type.`,
      );
    }
  }
}

/* ========================================================================== */
/* Profile                                                                     */
/* ========================================================================== */

async function requireProfile(
  claimantId:
    string,
): Promise<
  ClaimantMessagingProfile
> {
  const normalized =
    requireValue(
      claimantId,
      "Claimant ID",
    );

  const profile =
    await getClaimantMessagingProfile(
      normalized,
    );

  if (
    !profile
  ) {
    throw new Error(
      "The claimant messaging account could not be resolved.",
    );
  }

  if (
    !profile.claimantAuthUserId
  ) {
    throw new Error(
      "The claimant portal account is not activated.",
    );
  }

  return profile;
}

/* ========================================================================== */
/* Locked recipient                                                            */
/* ========================================================================== */

async function requireLockedRecipient(
  profile:
    ClaimantMessagingProfile,
): Promise<
  ClaimantMailboxRecipient
> {
  const admin =
    getSupabaseAdmin();

  /*
   * Recipient identity is always derived server-side from the current
   * authorized staff assignment.
   *
   * The claimant never submits or selects a staff-user ID.
   */
  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id, name, title",
      )
      .eq(
        "id",
        profile.assignedStaffUserId,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    throw new Error(
      "The authorized DueQuity staff recipient could not be resolved.",
    );
  }

  const row =
    data as
      StaffRow;

  return {
    staffUserId:
      row.id,

    name:
      row.name,

    title:
      row.title,
  };
}

/* ========================================================================== */
/* Thread                                                                      */
/* ========================================================================== */

async function requireThread(
  profile:
    ClaimantMessagingProfile,
): Promise<
  ThreadRow
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
          "id, status",
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
        `Unable to resolve the secure claimant conversation: ${error.message}`,
      );
    }

    if (
      data
    ) {
      return data as
        ThreadRow;
    }

    const now =
      new Date().toISOString();

    const {
      data:
        created,
      error:
        createError,
    } =
      await admin
        .from(
          "claimant_message_threads",
        )
        .insert({
          claim_id:
            profile.claimId,

          created_by_staff_user_id:
            profile.assignedStaffUserId,

          status:
            "active",

          created_at:
            now,

          updated_at:
            now,
        })
        .select(
          "id, status",
        )
        .single();

    if (
      createError ||
      !created
    ) {
      throw new Error(
        `Unable to initialize the secure claimant conversation: ${
          createError?.message ??
          "Unknown database error."
        }`,
      );
    }

    return created as
      ThreadRow;
  }

  const workcaseId =
    profile.workcaseId ??
    profile.claimId;

  const {
    data,
    error,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .select(
        "id, status",
      )
      .eq(
        "workcase_id",
        workcaseId,
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
      `Unable to resolve the secure assigned-recovery conversation: ${error.message}`,
    );
  }

  if (
    data
  ) {
    return data as
      ThreadRow;
  }

  const now =
    new Date().toISOString();

  const {
    data:
      created,
    error:
      createError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_message_threads",
      )
      .insert({
        workcase_id:
          workcaseId,

        claimant_id:
          profile.claimantId,

        created_by_staff_user_id:
          profile.assignedStaffUserId,

        status:
          "active",

        created_at:
          now,

        updated_at:
          now,
      })
      .select(
        "id, status",
      )
      .single();

  if (
    createError ||
    !created
  ) {
    throw new Error(
      `Unable to initialize the secure assigned-recovery conversation: ${
        createError?.message ??
        "Unknown database error."
      }`,
    );
  }

  return created as
    ThreadRow;
}

/* ========================================================================== */
/* Rows                                                                        */
/* ========================================================================== */

async function loadMessageRows(
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
        "id, thread_id, reply_to_message_id, sender_type, sender_staff_user_id, sender_claimant_auth_user_id, subject, body_text, state, sent_at, claimant_read_at, staff_read_at, created_at",
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
      `Unable to load secure claimant messages: ${error.message}`,
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
      `Unable to load secure message attachments: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ) as
    AttachmentRow[];
}

/* ========================================================================== */
/* Staff names                                                                 */
/* ========================================================================== */

async function loadStaffNames(
  ids:
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
        ids.filter(
          Boolean,
        ),
      ),
    ];

  const names =
    new Map<
      string,
      string
    >();

  if (
    unique.length ===
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
        unique,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve DueQuity message senders: ${error.message}`,
    );
  }

  for (
    const rawRow of
      data ??
      []
  ) {
    const row =
      rawRow as {
        id:
          string;

        name:
          string;
      };

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

async function markInboxRead(
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
      `Unable to update claimant message read status: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* State                                                                       */
/* ========================================================================== */

export async function getClaimantPortalMailboxState(
  claimantId:
    string,
): Promise<
  ClaimantPortalMailboxState
> {
  const profile =
    await requireProfile(
      claimantId,
    );

  const [
    recipient,
    thread,
  ] =
    await Promise.all([
      requireLockedRecipient(
        profile,
      ),

      requireThread(
        profile,
      ),
    ]);

  await markInboxRead(
    profile,
    thread.id,
  );

  const messageRows =
    await loadMessageRows(
      profile,
      thread.id,
    );

  const attachments =
    await loadAttachments(
      profile,
      messageRows.map(
        (
          row,
        ) =>
          row.id,
      ),
    );

  const attachmentsByMessage =
    new Map<
      string,
      ClaimantMailboxAttachment[]
    >();

  for (
    const row of
      attachments
  ) {
    const existing =
      attachmentsByMessage.get(
        row.message_id,
      ) ??
      [];

    existing.push({
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

    attachmentsByMessage.set(
      row.message_id,
      existing,
    );
  }

  const staffNames =
    await loadStaffNames(
      messageRows.flatMap(
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

  const messages =
    messageRows.map(
      (
        row,
      ): ClaimantMailboxMessage => ({
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
                  ? staffNames.get(
                      row.sender_staff_user_id,
                    )
                  : undefined
              ) ??
              "DueQuity staff"
            : profile.legalName,

        subject:
          row.subject?.trim() ||
          "(No subject)",

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
          attachmentsByMessage.get(
            row.id,
          ) ??
          [],
      }),
    );

  return {
    claimantId:
      profile.claimantId,

    claimantReference:
      profile.claimantReference,

    legalName:
      profile.legalName,

    recoveryReference:
      profile.claimReference,

    recipient,

    threadId:
      thread.id,

    messages,

    counts: {
      inbox:
        messages.filter(
          (
            message,
          ) =>
            message.senderType ===
            "staff",
        ).length,

      sent:
        messages.filter(
          (
            message,
          ) =>
            message.senderType ===
            "claimant",
        ).length,

      attachments:
        messages.reduce(
          (
            count,
            message,
          ) =>
            count +
            message.attachments.length,
          0,
        ),
    },
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
      `Unable to validate the reply message: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "The message being replied to is not part of this secure conversation.",
    );
  }

  return normalized;
}

/* ========================================================================== */
/* Send                                                                        */
/* ========================================================================== */

export async function sendClaimantMailboxMessage(
  input:
    SendClaimantMailboxMessageInput,
): Promise<
  ClaimantPortalMailboxState
> {
  const profile =
    await requireProfile(
      input.claimantId,
    );

  const [
    recipient,
    thread,
  ] =
    await Promise.all([
      requireLockedRecipient(
        profile,
      ),

      requireThread(
        profile,
      ),
    ]);

  if (
    thread.status !==
      "active"
  ) {
    throw new Error(
      "This secure conversation is currently closed.",
    );
  }

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

      const buffer =
        Buffer.from(
          await file.arrayBuffer(),
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
            buffer,
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
          "claimant",

        uploaded_by_staff_user_id:
          null,

        uploaded_by_claimant_auth_user_id:
          profile.claimantAuthUserId,

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
          .insert({
            id:
              messageId,

            thread_id:
              thread.id,

            reply_to_message_id:
              replyTarget,

            sender_type:
              "claimant",

            sender_staff_user_id:
              null,

            sender_claimant_auth_user_id:
              profile.claimantAuthUserId,

            subject,

            body_text:
              bodyText,

            state:
              "sent",

            sent_at:
              now,

            claimant_read_at:
              now,

            staff_read_at:
              null,

            created_at:
              now,

            updated_at:
              now,
          });

      if (
        error
      ) {
        throw new Error(
          `Unable to send the claimant message: ${error.message}`,
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
            id:
              messageId,

            thread_id:
              thread.id,

            reply_to_message_id:
              replyTarget,

            sender_type:
              "claimant",

            sender_staff_user_id:
              null,

            sender_claimant_auth_user_id:
              profile.claimantAuthUserId,

            recipient_staff_user_id:
              recipient.staffUserId,

            subject,

            body_text:
              bodyText,

            state:
              "sent",

            sent_at:
              now,

            claimant_read_at:
              now,

            staff_read_at:
              null,

            created_at:
              now,

            updated_at:
              now,
          });

      if (
        error
      ) {
        throw new Error(
          `Unable to send the assigned-recovery message: ${error.message}`,
        );
      }
    }

    messageInserted =
      true;

    if (
      attachmentRows.length >
        0
    ) {
      const attachmentTable =
        profile.recordKind ===
          "claim"
          ? "claimant_message_attachments"
          : "assigned_lead_claimant_message_attachments";

      const {
        error,
      } =
        await admin
          .from(
            attachmentTable,
          )
          .insert(
            attachmentRows,
          );

      if (
        error
      ) {
        throw new Error(
          `Unable to register message attachments: ${error.message}`,
        );
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
        `Unable to update the secure conversation: ${threadError.message}`,
      );
    }
  } catch (
    error
  ) {
    const attachmentTable =
      profile.recordKind ===
        "claim"
        ? "claimant_message_attachments"
        : "assigned_lead_claimant_message_attachments";

    const messageTable =
      profile.recordKind ===
        "claim"
        ? "claimant_messages"
        : "assigned_lead_claimant_messages";

    if (
      messageInserted
    ) {
      await admin
        .from(
          attachmentTable,
        )
        .delete()
        .eq(
          "message_id",
          messageId,
        );

      await admin
        .from(
          messageTable,
        )
        .delete()
        .eq(
          "id",
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

  return getClaimantPortalMailboxState(
    profile.claimantId,
  );
}