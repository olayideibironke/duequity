import "server-only";

import {
  randomUUID,
} from "node:crypto";

import type {
  StaffUser,
} from "@/domain/types";

import {
  recordAuditEvent,
} from "@/server/audit-event-store";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

export const STAFF_MAIL_STORAGE_BUCKET =
  "staff-mail-attachments";

export const STAFF_MAIL_MAX_ATTACHMENT_BYTES =
  25 * 1024 * 1024;

export const STAFF_MAIL_SIGNED_URL_SECONDS =
  300;

const MAX_SUBJECT_LENGTH =
  240;

const MAX_BODY_LENGTH =
  100_000;

const ALLOWED_ATTACHMENT_MIME_TYPES =
  new Set<string>([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type StaffMailFolder =
  | "inbox"
  | "sent"
  | "drafts"
  | "archive"
  | "trash";

export type StaffMailPriority =
  | "normal"
  | "high";

export type StaffMailRecipientType =
  | "to"
  | "cc"
  | "bcc";

export type StaffMailMessageState =
  | "draft"
  | "sent";

export interface StaffMailParticipant {
  id: string;
  name: string;
  email: string;
  title: string;
}

export interface StaffMailRecipientInput {
  staffUserId: string;
  recipientType: StaffMailRecipientType;
}

export interface StaffMailRecipient {
  id: string;
  participant: StaffMailParticipant;
  recipientType: StaffMailRecipientType;
  readAt?: string;
  archivedAt?: string;
  trashedAt?: string;
  acknowledgedAt?: string;
}

export interface StaffMailAttachment {
  id: string;
  messageId: string;
  uploadedByStaffUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface StaffMailMessage {
  id: string;
  threadId: string;
  replyToMessageId?: string;

  sender: StaffMailParticipant;

  subject: string;
  bodyText: string;

  priority: StaffMailPriority;
  state: StaffMailMessageState;

  acknowledgmentRequested: boolean;

  sentAt?: string;
  createdAt: string;
  updatedAt: string;

  senderArchivedAt?: string;
  senderTrashedAt?: string;

  recipients: StaffMailRecipient[];
  attachments: StaffMailAttachment[];
}

export interface StaffMailListItem {
  id: string;
  threadId: string;

  sender: StaffMailParticipant;
  recipients: StaffMailRecipient[];

  subject: string;
  bodyPreview: string;

  priority: StaffMailPriority;
  state: StaffMailMessageState;

  acknowledgmentRequested: boolean;

  sentAt?: string;
  createdAt: string;
  updatedAt: string;

  unread: boolean;
  attachmentCount: number;
}

export interface StaffMailFolderCounts {
  inbox: number;
  unread: number;
  sent: number;
  drafts: number;
  archive: number;
  trash: number;
}

export interface CreateStaffMailDraftInput {
  sender: StaffUser;
  replyToMessageId?: string;
}

export interface UpdateStaffMailDraftInput {
  actor: StaffUser;

  messageId: string;

  subject: string;
  bodyText: string;

  priority: StaffMailPriority;

  acknowledgmentRequested: boolean;

  recipients: StaffMailRecipientInput[];
}

export interface UploadStaffMailAttachmentInput {
  actor: StaffUser;

  messageId: string;

  fileName: string;
  mimeType: string;

  bytes: Uint8Array;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface StaffUserRow {
  id: string;
  name: string;
  email: string;
  title: string;
  status: string;
}

interface StaffMailMessageRow {
  id: string;
  thread_id: string;

  sender_staff_user_id: string;
  reply_to_message_id: string | null;

  subject: string;
  body_text: string;

  priority: StaffMailPriority;
  state: StaffMailMessageState;

  acknowledgment_requested: boolean;

  sent_at: string | null;

  sender_archived_at: string | null;
  sender_trashed_at: string | null;
  sender_deleted_from_trash_at: string | null;

  created_at: string;
  updated_at: string;
}

interface StaffMailRecipientRow {
  id: string;

  message_id: string;
  staff_user_id: string;

  recipient_type: StaffMailRecipientType;

  read_at: string | null;
  archived_at: string | null;
  trashed_at: string | null;
  deleted_from_trash_at: string | null;
  acknowledged_at: string | null;

  created_at: string;
}

interface StaffMailAttachmentRow {
  id: string;

  message_id: string;
  uploaded_by_staff_user_id: string;

  storage_path: string;

  file_name: string;
  mime_type: string;

  size_bytes: number | string;

  created_at: string;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function validateSubject(
  value: string,
): string {
  const subject =
    value.trim();

  if (
    subject.length >
    MAX_SUBJECT_LENGTH
  ) {
    throw new Error(
      `Mail subject cannot exceed ${MAX_SUBJECT_LENGTH} characters.`,
    );
  }

  return subject;
}

function validateBody(
  value: string,
): string {
  const body =
    value.trim();

  if (
    body.length >
    MAX_BODY_LENGTH
  ) {
    throw new Error(
      "Mail body is too large.",
    );
  }

  return body;
}

function validatePriority(
  value: string,
): StaffMailPriority {
  if (
    value !== "normal" &&
    value !== "high"
  ) {
    throw new Error(
      "Mail priority is invalid.",
    );
  }

  return value;
}

function validateRecipientType(
  value: string,
): StaffMailRecipientType {
  if (
    value !== "to" &&
    value !== "cc" &&
    value !== "bcc"
  ) {
    throw new Error(
      "Mail recipient type is invalid.",
    );
  }

  return value;
}

function validateAttachmentMimeType(
  value: string,
): string {
  const mimeType =
    value
      .trim()
      .toLowerCase();

  if (
    !ALLOWED_ATTACHMENT_MIME_TYPES.has(
      mimeType,
    )
  ) {
    throw new Error(
      "This attachment type is not supported.",
    );
  }

  return mimeType;
}

function validateAttachmentSize(
  size: number,
): number {
  if (
    !Number.isInteger(
      size,
    ) ||
    size <= 0
  ) {
    throw new Error(
      "Attachment is empty.",
    );
  }

  if (
    size >
    STAFF_MAIL_MAX_ATTACHMENT_BYTES
  ) {
    throw new Error(
      "Attachment exceeds the 25 MB limit.",
    );
  }

  return size;
}

function safeFileName(
  value: string,
): string {
  const original =
    value.trim();

  if (
    !original
  ) {
    throw new Error(
      "Attachment file name is required.",
    );
  }

  const cleaned =
    original
      .replace(
        /[^\w.\-() ]+/g,
        "_",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .slice(
        0,
        180,
      )
      .trim();

  return (
    cleaned ||
    "attachment"
  );
}

function uniqueRecipientInputs(
  recipients:
    StaffMailRecipientInput[],
): StaffMailRecipientInput[] {
  const result:
    StaffMailRecipientInput[] =
    [];

  const seen =
    new Set<string>();

  for (
    const recipient of
      recipients
  ) {
    const staffUserId =
      recipient.staffUserId.trim();

    const recipientType =
      validateRecipientType(
        recipient.recipientType,
      );

    if (
      !staffUserId ||
      seen.has(
        staffUserId,
      )
    ) {
      continue;
    }

    seen.add(
      staffUserId,
    );

    result.push({
      staffUserId,
      recipientType,
    });
  }

  return result;
}

/* ========================================================================== */
/* Row mapping                                                                 */
/* ========================================================================== */

function participantFromRow(
  row: StaffUserRow,
): StaffMailParticipant {
  return {
    id:
      row.id,

    name:
      row.name,

    email:
      row.email,

    title:
      row.title,
  };
}

function attachmentFromRow(
  row: StaffMailAttachmentRow,
): StaffMailAttachment {
  return {
    id:
      row.id,

    messageId:
      row.message_id,

    uploadedByStaffUserId:
      row.uploaded_by_staff_user_id,

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

/* ========================================================================== */
/* Staff directory                                                             */
/* ========================================================================== */

async function loadStaffRows(
  ids: string[],
): Promise<
  Map<
    string,
    StaffUserRow
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

  if (
    uniqueIds.length === 0
  ) {
    return new Map();
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
        "id, name, email, title, status",
      )
      .in(
        "id",
        uniqueIds,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve DueQuity staff directory: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as StaffUserRow[];

  return new Map(
    rows.map(
      (
        row,
      ) => [
        row.id,
        row,
      ],
    ),
  );
}

export async function listActiveStaffMailDirectory(): Promise<
  StaffMailParticipant[]
> {
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
        "id, name, email, title, status",
      )
      .eq(
        "status",
        "active",
      )
      .order(
        "name",
        {
          ascending:
            true,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to load DueQuity staff directory: ${error.message}`,
    );
  }

  return (
    (
      data ??
      []
    ) as StaffUserRow[]
  ).map(
    participantFromRow,
  );
}

/* ========================================================================== */
/* Low-level reads                                                             */
/* ========================================================================== */

async function getMessageRow(
  messageId: string,
): Promise<
  StaffMailMessageRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_messages",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        messageId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read mail message: ${error.message}`,
    );
  }

  return data
    ? (
        data as StaffMailMessageRow
      )
    : undefined;
}

async function listRecipientRowsForMessages(
  messageIds: string[],
): Promise<
  StaffMailRecipientRow[]
> {
  const ids =
    [
      ...new Set(
        messageIds,
      ),
    ];

  if (
    ids.length === 0
  ) {
    return [];
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_recipients",
      )
      .select(
        "*",
      )
      .in(
        "message_id",
        ids,
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
      `Unable to read mail recipients: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ) as StaffMailRecipientRow[];
}

async function listAttachmentRowsForMessages(
  messageIds: string[],
): Promise<
  StaffMailAttachmentRow[]
> {
  const ids =
    [
      ...new Set(
        messageIds,
      ),
    ];

  if (
    ids.length === 0
  ) {
    return [];
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_attachments",
      )
      .select(
        "*",
      )
      .in(
        "message_id",
        ids,
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
      `Unable to read mail attachments: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ) as StaffMailAttachmentRow[];
}

async function recipientRowForUser(
  messageId: string,
  staffUserId: string,
): Promise<
  StaffMailRecipientRow | undefined
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_recipients",
      )
      .select(
        "*",
      )
      .eq(
        "message_id",
        messageId,
      )
      .eq(
        "staff_user_id",
        staffUserId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve mailbox recipient: ${error.message}`,
    );
  }

  return data
    ? (
        data as StaffMailRecipientRow
      )
    : undefined;
}

/* ========================================================================== */
/* Authorization                                                               */
/* ========================================================================== */

async function requireMessageAccess(
  actor: StaffUser,
  messageId: string,
): Promise<{
  message: StaffMailMessageRow;
  recipient?: StaffMailRecipientRow;
}> {
  const message =
    await getMessageRow(
      messageId,
    );

  if (
    !message
  ) {
    throw new Error(
      "Mail message not found.",
    );
  }

  if (
    message.sender_staff_user_id ===
    actor.id
  ) {
    return {
      message,
    };
  }

  const recipient =
    await recipientRowForUser(
      messageId,
      actor.id,
    );

  if (
    !recipient ||
    message.state !== "sent"
  ) {
    throw new Error(
      "You are not authorized to open this mail message.",
    );
  }

  return {
    message,
    recipient,
  };
}

async function requireOwnedDraft(
  actor: StaffUser,
  messageId: string,
): Promise<
  StaffMailMessageRow
> {
  const message =
    await getMessageRow(
      messageId,
    );

  if (
    !message ||
    message.sender_staff_user_id !==
      actor.id ||
    message.state !== "draft"
  ) {
    throw new Error(
      "Mail draft not found.",
    );
  }

  return message;
}

/* ========================================================================== */
/* Materialization                                                             */
/* ========================================================================== */

async function materializeMessages(
  rows: StaffMailMessageRow[],
): Promise<
  StaffMailMessage[]
> {
  if (
    rows.length === 0
  ) {
    return [];
  }

  const messageIds =
    rows.map(
      (
        row,
      ) =>
        row.id,
    );

  const [
    recipientRows,
    attachmentRows,
  ] =
    await Promise.all([
      listRecipientRowsForMessages(
        messageIds,
      ),

      listAttachmentRowsForMessages(
        messageIds,
      ),
    ]);

  const staffIds =
    [
      ...rows.map(
        (
          row,
        ) =>
          row.sender_staff_user_id,
      ),

      ...recipientRows.map(
        (
          row,
        ) =>
          row.staff_user_id,
      ),
    ];

  const staffById =
    await loadStaffRows(
      staffIds,
    );

  const recipientsByMessage =
    new Map<
      string,
      StaffMailRecipient[]
    >();

  for (
    const row of
      recipientRows
  ) {
    const staff =
      staffById.get(
        row.staff_user_id,
      );

    if (
      !staff
    ) {
      continue;
    }

    const recipients =
      recipientsByMessage.get(
        row.message_id,
      ) ??
      [];

    recipients.push({
      id:
        row.id,

      participant:
        participantFromRow(
          staff,
        ),

      recipientType:
        row.recipient_type,

      readAt:
        row.read_at ??
        undefined,

      archivedAt:
        row.archived_at ??
        undefined,

      trashedAt:
        row.trashed_at ??
        undefined,

      acknowledgedAt:
        row.acknowledged_at ??
        undefined,
    });

    recipientsByMessage.set(
      row.message_id,
      recipients,
    );
  }

  const attachmentsByMessage =
    new Map<
      string,
      StaffMailAttachment[]
    >();

  for (
    const row of
      attachmentRows
  ) {
    const attachments =
      attachmentsByMessage.get(
        row.message_id,
      ) ??
      [];

    attachments.push(
      attachmentFromRow(
        row,
      ),
    );

    attachmentsByMessage.set(
      row.message_id,
      attachments,
    );
  }

  const result:
    StaffMailMessage[] =
    [];

  for (
    const row of
      rows
  ) {
    const sender =
      staffById.get(
        row.sender_staff_user_id,
      );

    if (
      !sender
    ) {
      continue;
    }

    result.push({
      id:
        row.id,

      threadId:
        row.thread_id,

      replyToMessageId:
        row.reply_to_message_id ??
        undefined,

      sender:
        participantFromRow(
          sender,
        ),

      subject:
        row.subject,

      bodyText:
        row.body_text,

      priority:
        row.priority,

      state:
        row.state,

      acknowledgmentRequested:
        row.acknowledgment_requested,

      sentAt:
        row.sent_at ??
        undefined,

      createdAt:
        row.created_at,

      updatedAt:
        row.updated_at,

      senderArchivedAt:
        row.sender_archived_at ??
        undefined,

      senderTrashedAt:
        row.sender_trashed_at ??
        undefined,

      recipients:
        recipientsByMessage.get(
          row.id,
        ) ??
        [],

      attachments:
        attachmentsByMessage.get(
          row.id,
        ) ??
        [],
    });
  }

  return result;
}

/* ========================================================================== */
/* Draft creation                                                              */
/* ========================================================================== */

export async function createStaffMailDraft(
  input:
    CreateStaffMailDraftInput,
): Promise<
  StaffMailMessage
> {
  const admin =
    getSupabaseAdmin();

  let threadId: string =
    randomUUID();

  let replyToMessageId:
    string | null =
    null;

  if (
    input.replyToMessageId
  ) {
    const source =
      await requireMessageAccess(
        input.sender,
        input.replyToMessageId,
      );

    if (
      source.message.state !==
      "sent"
    ) {
      throw new Error(
        "Only a sent message may be replied to.",
      );
    }

    threadId =
      source.message.thread_id;

    replyToMessageId =
      source.message.id;
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_messages",
      )
      .insert({
        thread_id:
          threadId,

        sender_staff_user_id:
          input.sender.id,

        reply_to_message_id:
          replyToMessageId,

        subject:
          "",

        body_text:
          "",

        priority:
          "normal",

        state:
          "draft",

        acknowledgment_requested:
          false,

        sent_at:
          null,

        sender_archived_at:
          null,

        sender_trashed_at:
          null,
      })
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to create mail draft: ${error.message}`,
    );
  }

  const [
    message,
  ] =
    await materializeMessages([
      data as StaffMailMessageRow,
    ]);

  if (
    !message
  ) {
    throw new Error(
      "Mail draft could not be materialized.",
    );
  }

  return message;
}

/* ========================================================================== */
/* Draft update                                                                */
/* ========================================================================== */

export async function updateStaffMailDraft(
  input:
    UpdateStaffMailDraftInput,
): Promise<
  StaffMailMessage
> {
  await requireOwnedDraft(
    input.actor,
    input.messageId,
  );

  const subject =
    validateSubject(
      input.subject,
    );

  const bodyText =
    validateBody(
      input.bodyText,
    );

  const priority =
    validatePriority(
      input.priority,
    );

  const recipients =
    uniqueRecipientInputs(
      input.recipients,
    );

  if (
    recipients.length > 0
  ) {
    const staffById =
      await loadStaffRows(
        recipients.map(
          (
            recipient,
          ) =>
            recipient.staffUserId,
        ),
      );

    for (
      const recipient of
        recipients
    ) {
      const staff =
        staffById.get(
          recipient.staffUserId,
        );

      if (
        !staff ||
        staff.status !== "active"
      ) {
        throw new Error(
          "Mail recipients must be active DueQuity staff members.",
        );
      }
    }
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_messages",
      )
      .update({
        subject,

        body_text:
          bodyText,

        priority,

        acknowledgment_requested:
          input.acknowledgmentRequested,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        input.messageId,
      )
      .eq(
        "sender_staff_user_id",
        input.actor.id,
      )
      .eq(
        "state",
        "draft",
      )
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to save mail draft: ${error.message}`,
    );
  }

  const {
    error:
      deleteRecipientsError,
  } =
    await admin
      .from(
        "staff_mail_recipients",
      )
      .delete()
      .eq(
        "message_id",
        input.messageId,
      );

  if (
    deleteRecipientsError
  ) {
    throw new Error(
      `Unable to update draft recipients: ${deleteRecipientsError.message}`,
    );
  }

  if (
    recipients.length > 0
  ) {
    const {
      error:
        insertRecipientsError,
    } =
      await admin
        .from(
          "staff_mail_recipients",
        )
        .insert(
          recipients.map(
            (
              recipient,
            ) => ({
              message_id:
                input.messageId,

              staff_user_id:
                recipient.staffUserId,

              recipient_type:
                recipient.recipientType,

              read_at:
                null,

              archived_at:
                null,

              trashed_at:
                null,

              acknowledged_at:
                null,
            }),
          ),
        );

    if (
      insertRecipientsError
    ) {
      throw new Error(
        `Unable to save draft recipients: ${insertRecipientsError.message}`,
      );
    }
  }

  const [
    message,
  ] =
    await materializeMessages([
      data as StaffMailMessageRow,
    ]);

  if (
    !message
  ) {
    throw new Error(
      "Mail draft could not be materialized.",
    );
  }

  return message;
}

/* ========================================================================== */
/* Send                                                                        */
/* ========================================================================== */

export async function sendStaffMailMessage(
  actor: StaffUser,
  messageId: string,
): Promise<
  StaffMailMessage
> {
  const draft =
    await requireOwnedDraft(
      actor,
      messageId,
    );

  const recipientRows =
    await listRecipientRowsForMessages([
      messageId,
    ]);

  if (
    recipientRows.length === 0
  ) {
    throw new Error(
      "Select at least one DueQuity staff recipient before sending.",
    );
  }

  if (
    !recipientRows.some(
      (
        recipient,
      ) =>
        recipient.recipient_type ===
        "to",
    )
  ) {
    throw new Error(
      "At least one To recipient is required.",
    );
  }

  if (
    !draft.subject.trim() &&
    !draft.body_text.trim()
  ) {
    throw new Error(
      "Enter a subject or message before sending.",
    );
  }

  const now =
    new Date().toISOString();

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_messages",
      )
      .update({
        state:
          "sent",

        sent_at:
          now,

        sender_archived_at:
          null,

        sender_trashed_at:
          null,

        updated_at:
          now,
      })
      .eq(
        "id",
        messageId,
      )
      .eq(
        "sender_staff_user_id",
        actor.id,
      )
      .eq(
        "state",
        "draft",
      )
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to send mail message: ${error.message}`,
    );
  }

  await recordAuditEvent({
    actor,

    action:
      "staff_mail.sent",

    targetType:
      "staff_mail",

    targetId:
      messageId,

    targetLabel:
      draft.subject.trim() ||
      "Internal staff message",

    outcome:
      "success",

    detail:
      `Internal DueQuity mail sent to ${recipientRows.length} staff recipient${
        recipientRows.length === 1
          ? ""
          : "s"
      }.`,
  });

  const [
    message,
  ] =
    await materializeMessages([
      data as StaffMailMessageRow,
    ]);

  if (
    !message
  ) {
    throw new Error(
      "Sent mail could not be materialized.",
    );
  }

  return message;
}

/* ========================================================================== */
/* Mailbox loading                                                             */
/* ========================================================================== */

async function loadMailboxRows(
  staffUserId: string,
): Promise<{
  messages: StaffMailMessageRow[];
  recipientRows: StaffMailRecipientRow[];
}> {
  const admin =
    getSupabaseAdmin();

  const [
    senderResult,
    recipientResult,
  ] =
    await Promise.all([
      admin
        .from(
          "staff_mail_messages",
        )
        .select(
          "*",
        )
        .eq(
          "sender_staff_user_id",
          staffUserId,
        ),

      admin
        .from(
          "staff_mail_recipients",
        )
        .select(
          "*",
        )
        .eq(
          "staff_user_id",
          staffUserId,
        ),
    ]);

  if (
    senderResult.error
  ) {
    throw new Error(
      `Unable to load sent mail: ${senderResult.error.message}`,
    );
  }

  if (
    recipientResult.error
  ) {
    throw new Error(
      `Unable to load inbox: ${recipientResult.error.message}`,
    );
  }

  const recipientRows =
    (
      recipientResult.data ??
      []
    ) as StaffMailRecipientRow[];

  const recipientMessageIds =
    [
      ...new Set(
        recipientRows.map(
          (
            row,
          ) =>
            row.message_id,
        ),
      ),
    ];

  let recipientMessages:
    StaffMailMessageRow[] =
    [];

  if (
    recipientMessageIds.length > 0
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "staff_mail_messages",
        )
        .select(
          "*",
        )
        .in(
          "id",
          recipientMessageIds,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to load received mail messages: ${error.message}`,
      );
    }

    recipientMessages =
      (
        data ??
        []
      ) as StaffMailMessageRow[];
  }

  const messagesById =
    new Map<
      string,
      StaffMailMessageRow
    >();

  const senderRows =
    (
      senderResult.data ??
      []
    ) as StaffMailMessageRow[];

  for (
    const row of
      senderRows
  ) {
    messagesById.set(
      row.id,
      row,
    );
  }

  for (
    const row of
      recipientMessages
  ) {
    messagesById.set(
      row.id,
      row,
    );
  }

  return {
    messages:
      [
        ...messagesById.values(),
      ],

    recipientRows,
  };
}

function recipientRowMapForUser(
  rows: StaffMailRecipientRow[],
): Map<
  string,
  StaffMailRecipientRow
> {
  return new Map(
    rows.map(
      (
        row,
      ) => [
        row.message_id,
        row,
      ],
    ),
  );
}

function belongsInFolder(
  message: StaffMailMessageRow,
  recipient:
    StaffMailRecipientRow | undefined,
  staffUserId: string,
  folder: StaffMailFolder,
): boolean {
  const sender =
    message.sender_staff_user_id ===
    staffUserId;

  switch (
    folder
  ) {
    case "inbox":
      return Boolean(
        recipient &&
        message.state === "sent" &&
        !recipient.archived_at &&
        !recipient.trashed_at,
      );

    case "sent":
      return (
        sender &&
        message.state === "sent" &&
        !message.sender_archived_at &&
        !message.sender_trashed_at
      );

    case "drafts":
      return (
        sender &&
        message.state === "draft" &&
        !message.sender_trashed_at
      );

    case "archive":
      return (
        (
          sender &&
          Boolean(
            message.sender_archived_at,
          ) &&
          !message.sender_trashed_at
        ) ||
        Boolean(
          recipient &&
          recipient.archived_at &&
          !recipient.trashed_at &&
          message.state === "sent",
        )
      );

    case "trash":
      return (
        (
          sender &&
          Boolean(
            message.sender_trashed_at,
          ) &&
          !message.sender_deleted_from_trash_at
        ) ||
        Boolean(
          recipient &&
          recipient.trashed_at &&
          !recipient.deleted_from_trash_at &&
          message.state === "sent",
        )
      );

    default:
      return false;
  }
}

/* ========================================================================== */
/* Folder list                                                                 */
/* ========================================================================== */

export async function listStaffMailFolder(
  staffUserId: string,
  folder: StaffMailFolder,
): Promise<
  StaffMailListItem[]
> {
  const {
    messages,
    recipientRows,
  } =
    await loadMailboxRows(
      staffUserId,
    );

  const recipientByMessage =
    recipientRowMapForUser(
      recipientRows,
    );

  const filtered =
    messages.filter(
      (
        message,
      ) =>
        belongsInFolder(
          message,
          recipientByMessage.get(
            message.id,
          ),
          staffUserId,
          folder,
        ),
    );

  const materialized =
    await materializeMessages(
      filtered,
    );

  const items =
    materialized.map(
      (
        message,
      ): StaffMailListItem => {
        const ownRecipient =
          message.recipients.find(
            (
              recipient,
            ) =>
              recipient.participant.id ===
              staffUserId,
          );

        const unread =
          message.state === "sent" &&
          Boolean(
            ownRecipient &&
            !ownRecipient.readAt,
          );

        const bodyPreview =
          message.bodyText
            .replace(
              /\s+/g,
              " ",
            )
            .trim()
            .slice(
              0,
              180,
            );

        return {
          id:
            message.id,

          threadId:
            message.threadId,

          sender:
            message.sender,

          recipients:
            message.recipients,

          subject:
            message.subject,

          bodyPreview,

          priority:
            message.priority,

          state:
            message.state,

          acknowledgmentRequested:
            message.acknowledgmentRequested,

          sentAt:
            message.sentAt,

          createdAt:
            message.createdAt,

          updatedAt:
            message.updatedAt,

          unread,

          attachmentCount:
            message.attachments.length,
        };
      },
    );

  return items.sort(
    (
      left,
      right,
    ) =>
      Date.parse(
        right.sentAt ??
        right.updatedAt,
      ) -
      Date.parse(
        left.sentAt ??
        left.updatedAt,
      ),
  );
}

/* ========================================================================== */
/* Folder counts                                                               */
/* ========================================================================== */

export async function getStaffMailFolderCounts(
  staffUserId: string,
): Promise<
  StaffMailFolderCounts
> {
  const {
    messages,
    recipientRows,
  } =
    await loadMailboxRows(
      staffUserId,
    );

  const recipientByMessage =
    recipientRowMapForUser(
      recipientRows,
    );

  let inbox =
    0;

  let unread =
    0;

  let sent =
    0;

  let drafts =
    0;

  let archive =
    0;

  let trash =
    0;

  for (
    const message of
      messages
  ) {
    const recipient =
      recipientByMessage.get(
        message.id,
      );

    if (
      belongsInFolder(
        message,
        recipient,
        staffUserId,
        "inbox",
      )
    ) {
      inbox +=
        1;

      if (
        recipient &&
        !recipient.read_at
      ) {
        unread +=
          1;
      }
    }

    if (
      belongsInFolder(
        message,
        recipient,
        staffUserId,
        "sent",
      )
    ) {
      sent +=
        1;
    }

    if (
      belongsInFolder(
        message,
        recipient,
        staffUserId,
        "drafts",
      )
    ) {
      drafts +=
        1;
    }

    if (
      belongsInFolder(
        message,
        recipient,
        staffUserId,
        "archive",
      )
    ) {
      archive +=
        1;
    }

    if (
      belongsInFolder(
        message,
        recipient,
        staffUserId,
        "trash",
      )
    ) {
      trash +=
        1;
    }
  }

  return {
    inbox,
    unread,
    sent,
    drafts,
    archive,
    trash,
  };
}

/* ========================================================================== */
/* Message read                                                                */
/* ========================================================================== */

export async function getStaffMailMessage(
  actor: StaffUser,
  messageId: string,
): Promise<
  StaffMailMessage
> {
  const {
    message,
  } =
    await requireMessageAccess(
      actor,
      messageId,
    );

  const [
    materialized,
  ] =
    await materializeMessages([
      message,
    ]);

  if (
    !materialized
  ) {
    throw new Error(
      "Mail message could not be loaded.",
    );
  }

  return materialized;
}

export async function markStaffMailMessageRead(
  actor: StaffUser,
  messageId: string,
): Promise<void> {
  const {
    message,
    recipient,
  } =
    await requireMessageAccess(
      actor,
      messageId,
    );

  if (
    message.sender_staff_user_id ===
      actor.id ||
    !recipient ||
    recipient.read_at
  ) {
    return;
  }

  const admin =
    getSupabaseAdmin();

  const {
    error,
  } =
    await admin
      .from(
        "staff_mail_recipients",
      )
      .update({
        read_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        recipient.id,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to mark mail as read: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Acknowledgment                                                              */
/* ========================================================================== */

export async function acknowledgeStaffMailMessage(
  actor: StaffUser,
  messageId: string,
): Promise<void> {
  const {
    message,
    recipient,
  } =
    await requireMessageAccess(
      actor,
      messageId,
    );

  if (
    !message.acknowledgment_requested
  ) {
    throw new Error(
      "This message does not require acknowledgment.",
    );
  }

  if (
    !recipient
  ) {
    throw new Error(
      "Only a message recipient may acknowledge receipt.",
    );
  }

  if (
    recipient.acknowledged_at
  ) {
    return;
  }

  const now =
    new Date().toISOString();

  const admin =
    getSupabaseAdmin();

  const {
    error,
  } =
    await admin
      .from(
        "staff_mail_recipients",
      )
      .update({
        read_at:
          recipient.read_at ??
          now,

        acknowledged_at:
          now,
      })
      .eq(
        "id",
        recipient.id,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to acknowledge mail message: ${error.message}`,
    );
  }

  await recordAuditEvent({
    actor,

    action:
      "staff_mail.acknowledged",

    targetType:
      "staff_mail",

    targetId:
      messageId,

    targetLabel:
      message.subject.trim() ||
      "Internal staff message",

    outcome:
      "success",

    detail:
      "Internal staff mail receipt acknowledged.",
  });
}

/* ========================================================================== */
/* Archive / Trash / Restore                                                   */
/* ========================================================================== */

async function updateMailboxLocation(
  actor: StaffUser,
  messageId: string,
  action:
    | "archive"
    | "trash"
    | "restore",
): Promise<void> {
  const {
    message,
    recipient,
  } =
    await requireMessageAccess(
      actor,
      messageId,
    );

  const now =
    new Date().toISOString();

  const admin =
    getSupabaseAdmin();

  if (
    message.sender_staff_user_id ===
    actor.id
  ) {
    let values:
      Record<
        string,
        string | null
      >;

    if (
      action === "archive"
    ) {
      values = {
        sender_archived_at:
          now,

        sender_trashed_at:
          null,

        sender_deleted_from_trash_at:
          null,
      };
    } else if (
      action === "trash"
    ) {
      if (
        message.sender_trashed_at
      ) {
        values = {
          sender_archived_at:
            null,

          sender_trashed_at:
            message.sender_trashed_at,

          sender_deleted_from_trash_at:
            now,
        };
      } else {
        values = {
          sender_archived_at:
            null,

          sender_trashed_at:
            now,

          sender_deleted_from_trash_at:
            null,
        };
      }
    } else {
      values = {
        sender_archived_at:
          null,

        sender_trashed_at:
          null,

        sender_deleted_from_trash_at:
          null,
      };
    }

    const {
      error,
    } =
      await admin
        .from(
          "staff_mail_messages",
        )
        .update({
          ...values,

          updated_at:
            now,
        })
        .eq(
          "id",
          messageId,
        )
        .eq(
          "sender_staff_user_id",
          actor.id,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to update mail folder: ${error.message}`,
      );
    }

    return;
  }

  if (
    !recipient
  ) {
    throw new Error(
      "Mailbox recipient could not be resolved.",
    );
  }

  let recipientValues:
    Record<
      string,
      string | null
    >;

  if (
    action === "archive"
  ) {
    recipientValues = {
      archived_at:
        now,

      trashed_at:
        null,

      deleted_from_trash_at:
        null,
    };
  } else if (
    action === "trash"
  ) {
    if (
      recipient.trashed_at
    ) {
      recipientValues = {
        archived_at:
          null,

        trashed_at:
          recipient.trashed_at,

        deleted_from_trash_at:
          now,
      };
    } else {
      recipientValues = {
        archived_at:
          null,

        trashed_at:
          now,

        deleted_from_trash_at:
          null,
      };
    }
  } else {
    recipientValues = {
      archived_at:
        null,

      trashed_at:
        null,

      deleted_from_trash_at:
        null,
    };
  }

  const {
    error,
  } =
    await admin
      .from(
        "staff_mail_recipients",
      )
      .update(
        recipientValues,
      )
      .eq(
        "id",
        recipient.id,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to update mail folder: ${error.message}`,
    );
  }
}
export async function archiveStaffMailMessage(
  actor: StaffUser,
  messageId: string,
): Promise<void> {
  await updateMailboxLocation(
    actor,
    messageId,
    "archive",
  );
}

export async function trashStaffMailMessage(
  actor: StaffUser,
  messageId: string,
): Promise<void> {
  await updateMailboxLocation(
    actor,
    messageId,
    "trash",
  );
}

export async function restoreStaffMailMessage(
  actor: StaffUser,
  messageId: string,
): Promise<void> {
  await updateMailboxLocation(
    actor,
    messageId,
    "restore",
  );
}

/* ========================================================================== */
/* Attachment upload                                                          */
/* ========================================================================== */

export async function uploadStaffMailAttachment(
  input:
    UploadStaffMailAttachmentInput,
): Promise<
  StaffMailAttachment
> {
  await requireOwnedDraft(
    input.actor,
    input.messageId,
  );

  const fileName =
    safeFileName(
      input.fileName,
    );

  const mimeType =
    validateAttachmentMimeType(
      input.mimeType,
    );

  const sizeBytes =
    validateAttachmentSize(
      input.bytes.byteLength,
    );

  const storagePath =
    [
      input.actor.id,
      input.messageId,
      `${randomUUID()}-${fileName}`,
    ].join(
      "/",
    );

  const admin =
    getSupabaseAdmin();

  const {
    error:
      uploadError,
  } =
    await admin.storage
      .from(
        STAFF_MAIL_STORAGE_BUCKET,
      )
      .upload(
        storagePath,
        input.bytes,
        {
          contentType:
            mimeType,

          upsert:
            false,

          cacheControl:
            "3600",
        },
      );

  if (
    uploadError
  ) {
    throw new Error(
      `Unable to upload mail attachment: ${uploadError.message}`,
    );
  }

  const {
    data,
    error:
      insertError,
  } =
    await admin
      .from(
        "staff_mail_attachments",
      )
      .insert({
        message_id:
          input.messageId,

        uploaded_by_staff_user_id:
          input.actor.id,

        storage_path:
          storagePath,

        file_name:
          fileName,

        mime_type:
          mimeType,

        size_bytes:
          sizeBytes,
      })
      .select(
        "*",
      )
      .single();

  if (
    insertError
  ) {
    await admin.storage
      .from(
        STAFF_MAIL_STORAGE_BUCKET,
      )
      .remove([
        storagePath,
      ]);

    throw new Error(
      `Unable to register mail attachment: ${insertError.message}`,
    );
  }

  await recordAuditEvent({
    actor:
      input.actor,

    action:
      "staff_mail.attachment_uploaded",

    targetType:
      "staff_mail",

    targetId:
      input.messageId,

    targetLabel:
      fileName,

    outcome:
      "success",

    detail:
      `${fileName} attached to an internal DueQuity mail draft.`,
  });

  return attachmentFromRow(
    data as StaffMailAttachmentRow,
  );
}

/* ========================================================================== */
/* Attachment removal                                                         */
/* ========================================================================== */

export async function removeStaffMailAttachment(
  actor: StaffUser,
  attachmentId: string,
): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_attachments",
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
    error
  ) {
    throw new Error(
      `Unable to read mail attachment: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Mail attachment not found.",
    );
  }

  const row =
    data as StaffMailAttachmentRow;

  await requireOwnedDraft(
    actor,
    row.message_id,
  );

  const {
    error:
      storageError,
  } =
    await admin.storage
      .from(
        STAFF_MAIL_STORAGE_BUCKET,
      )
      .remove([
        row.storage_path,
      ]);

  if (
    storageError
  ) {
    throw new Error(
      `Unable to remove mail attachment file: ${storageError.message}`,
    );
  }

  const {
    error:
      deleteError,
  } =
    await admin
      .from(
        "staff_mail_attachments",
      )
      .delete()
      .eq(
        "id",
        attachmentId,
      );

  if (
    deleteError
  ) {
    throw new Error(
      `Unable to remove mail attachment record: ${deleteError.message}`,
    );
  }
}

/* ========================================================================== */
/* Secure attachment download                                                  */
/* ========================================================================== */

export async function createStaffMailAttachmentDownloadUrl(
  actor: StaffUser,
  attachmentId: string,
): Promise<{
  url: string;
  fileName: string;
  mimeType: string;
}> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_mail_attachments",
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
    error
  ) {
    throw new Error(
      `Unable to read mail attachment: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Mail attachment not found.",
    );
  }

  const row =
    data as StaffMailAttachmentRow;

  await requireMessageAccess(
    actor,
    row.message_id,
  );

  const {
    data:
      signedData,
    error:
      signedError,
  } =
    await admin.storage
      .from(
        STAFF_MAIL_STORAGE_BUCKET,
      )
      .createSignedUrl(
        row.storage_path,
        STAFF_MAIL_SIGNED_URL_SECONDS,
      );

  if (
    signedError ||
    !signedData
  ) {
    throw new Error(
      `Unable to create secure attachment link: ${
        signedError?.message ??
        "Signed URL was not returned."
      }`,
    );
  }

  await recordAuditEvent({
    actor,

    action:
      "staff_mail.attachment_downloaded",

    targetType:
      "staff_mail",

    targetId:
      row.message_id,

    targetLabel:
      row.file_name,

    outcome:
      "success",

    detail:
      "Authorized internal mail attachment download link created.",
  });

  return {
    url:
      signedData.signedUrl,

    fileName:
      row.file_name,

    mimeType:
      row.mime_type,
  };
}