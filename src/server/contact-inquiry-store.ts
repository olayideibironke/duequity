import "server-only";

import {
  randomBytes,
} from "node:crypto";

import type {
  Permission,
  StaffUser,
} from "@/domain/types";

import {
  can,
  type StaffSession,
} from "@/lib/session";

import {
  recordAuditEvent,
} from "@/server/audit-event-store";

import {
  DUEQUITY_CONTACT_EMAIL,
  sendDueQuityContactEmail,
} from "@/server/contact-email-transport";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  resolveStaffSession,
} from "@/server/staff-session";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type ContactInquiryCategory =
  | "general"
  | "claim_question"
  | "partnership"
  | "media"
  | "other";

export type ContactInquiryStatus =
  | "new"
  | "open"
  | "awaiting_response"
  | "responded"
  | "closed"
  | "spam";

export type ContactMessageDirection =
  | "inbound"
  | "outbound"
  | "internal";

export type ContactMessageState =
  | "received"
  | "draft"
  | "sent"
  | "failed";

export interface ContactInquiryListItem {
  id: string;

  reference: string;

  status:
    ContactInquiryStatus;

  category:
    ContactInquiryCategory;

  requesterName: string;

  requesterEmail: string;

  requesterPhone?: string;

  subject: string;

  lastMessageAt: string;

  createdAt: string;
}

export interface ContactInquiryMessage {
  id: string;

  inquiryId: string;

  replyToMessageId?: string;

  direction:
    ContactMessageDirection;

  channel:
    | "website_form"
    | "email"
    | "internal_note";

  senderType:
    | "public"
    | "staff"
    | "system";

  senderName: string;

  senderEmail?: string;

  senderStaffUserId?: string;

  bodyText: string;

  state:
    ContactMessageState;

  externalMessageId?: string;

  sentAt?: string;

  createdAt: string;
}

export interface ContactInquiryDetail
  extends ContactInquiryListItem {
  source:
    | "website_form"
    | "direct_email"
    | "staff_created";

  assignedToStaffUserId?: string;

  closedAt?: string;

  rowVersion: number;

  updatedAt: string;

  messages:
    ContactInquiryMessage[];
}

export interface CreatePublicContactInquiryInput {
  requesterName: string;

  requesterEmail: string;

  requesterPhone?: string;

  category: string;

  subject: string;

  bodyText: string;
}

export type PublicContactSubmissionErrorCode =
  | "invalid"
  | "rate_limited"
  | "unavailable";

export class PublicContactSubmissionError extends Error {
  readonly code:
    PublicContactSubmissionErrorCode;

  constructor(
    code:
      PublicContactSubmissionErrorCode,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      "PublicContactSubmissionError";

    this.code =
      code;
  }
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ContactInquiryRow {
  id: string;

  reference: string;

  source:
    | "website_form"
    | "direct_email"
    | "staff_created";

  status:
    ContactInquiryStatus;

  category:
    ContactInquiryCategory;

  requester_name: string;

  requester_email: string;

  requester_phone:
    string | null;

  subject: string;

  assigned_to_staff_user_id:
    string | null;

  last_message_at: string;

  closed_at:
    string | null;

  row_version:
    number | string;

  created_at: string;

  updated_at: string;
}

interface ContactMessageRow {
  id: string;

  inquiry_id: string;

  reply_to_message_id:
    string | null;

  direction:
    ContactMessageDirection;

  channel:
    | "website_form"
    | "email"
    | "internal_note";

  sender_type:
    | "public"
    | "staff"
    | "system";

  sender_name: string;

  sender_email:
    string | null;

  sender_staff_user_id:
    string | null;

  body_text: string;

  state:
    ContactMessageState;

  external_message_id:
    string | null;

  sent_at:
    string | null;

  created_at: string;
}

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const MAX_NAME_LENGTH =
  120;

const MAX_EMAIL_LENGTH =
  254;

const MAX_PHONE_LENGTH =
  40;

const MAX_SUBJECT_LENGTH =
  200;

const MAX_PUBLIC_BODY_LENGTH =
  10_000;

const MAX_REPLY_BODY_LENGTH =
  20_000;

const PUBLIC_RATE_LIMIT_WINDOW_MINUTES =
  15;

const PUBLIC_RATE_LIMIT_COUNT =
  3;

const VALID_CATEGORIES =
  new Set<ContactInquiryCategory>([
    "general",
    "claim_question",
    "partnership",
    "media",
    "other",
  ]);

const VALID_STATUSES =
  new Set<ContactInquiryStatus>([
    "new",
    "open",
    "awaiting_response",
    "responded",
    "closed",
    "spam",
  ]);

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function normalizedSingleLine(
  value: string,
  maximumLength: number,
): string {
  return value
    .replace(
      /[\r\n\t]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .slice(
      0,
      maximumLength,
    );
}

function requiredSingleLine(
  value: string,
  maximumLength: number,
  label: string,
): string {
  const normalized =
    normalizedSingleLine(
      value,
      maximumLength,
    );

  if (!normalized) {
    throw new PublicContactSubmissionError(
      "invalid",
      `${label} is required.`,
    );
  }

  return normalized;
}

function normalizeEmail(
  value: string,
): string {
  const email =
    value
      .trim()
      .toLowerCase();

  if (
    !email ||
    email.length >
      MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    throw new PublicContactSubmissionError(
      "invalid",
      "A valid email address is required.",
    );
  }

  return email;
}

function normalizePhone(
  value:
    string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const phone =
    normalizedSingleLine(
      value,
      MAX_PHONE_LENGTH,
    );

  return phone ||
    undefined;
}

function normalizeCategory(
  value: string,
): ContactInquiryCategory {
  const category =
    value.trim() as
      ContactInquiryCategory;

  if (
    !VALID_CATEGORIES.has(
      category,
    )
  ) {
    throw new PublicContactSubmissionError(
      "invalid",
      "The inquiry category is invalid.",
    );
  }

  return category;
}

function normalizePublicBody(
  value: string,
): string {
  const body =
    value.trim();

  if (
    !body ||
    body.length >
      MAX_PUBLIC_BODY_LENGTH
  ) {
    throw new PublicContactSubmissionError(
      "invalid",
      "The inquiry message is invalid.",
    );
  }

  return body;
}

function normalizeReplyBody(
  value: string,
): string {
  const body =
    value.trim();

  if (
    !body ||
    body.length >
      MAX_REPLY_BODY_LENGTH
  ) {
    throw new Error(
      "Reply text is required and must be within the permitted size.",
    );
  }

  return body;
}

function normalizeStatus(
  value: string,
): ContactInquiryStatus {
  const status =
    value.trim() as
      ContactInquiryStatus;

  if (
    !VALID_STATUSES.has(
      status,
    )
  ) {
    throw new Error(
      "The selected inquiry status is invalid.",
    );
  }

  return status;
}

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function listItemFromRow(
  row:
    ContactInquiryRow,
): ContactInquiryListItem {
  return {
    id:
      row.id,

    reference:
      row.reference,

    status:
      row.status,

    category:
      row.category,

    requesterName:
      row.requester_name,

    requesterEmail:
      row.requester_email,

    requesterPhone:
      row.requester_phone ??
      undefined,

    subject:
      row.subject,

    lastMessageAt:
      row.last_message_at,

    createdAt:
      row.created_at,
  };
}

function messageFromRow(
  row:
    ContactMessageRow,
): ContactInquiryMessage {
  return {
    id:
      row.id,

    inquiryId:
      row.inquiry_id,

    replyToMessageId:
      row.reply_to_message_id ??
      undefined,

    direction:
      row.direction,

    channel:
      row.channel,

    senderType:
      row.sender_type,

    senderName:
      row.sender_name,

    senderEmail:
      row.sender_email ??
      undefined,

    senderStaffUserId:
      row.sender_staff_user_id ??
      undefined,

    bodyText:
      row.body_text,

    state:
      row.state,

    externalMessageId:
      row.external_message_id ??
      undefined,

    sentAt:
      row.sent_at ??
      undefined,

    createdAt:
      row.created_at,
  };
}

/* ========================================================================== */
/* Authorization                                                               */
/* ========================================================================== */

async function requireContactPermission(
  permission:
    Permission,
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
    !can(
      session,
      permission,
    )
  ) {
    throw new Error(
      "Your DueQuity role does not permit this contact inquiry action.",
    );
  }

  return session;
}

/* ========================================================================== */
/* Low level inquiry read                                                      */
/* ========================================================================== */

async function loadInquiryRow(
  inquiryId: string,
): Promise<
  ContactInquiryRow
> {
  const id =
    inquiryId.trim();

  if (!id) {
    throw new Error(
      "Inquiry ID is required.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "contact_inquiries",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        id,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load contact inquiry: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Contact inquiry was not found.",
    );
  }

  return data as
    ContactInquiryRow;
}

/* ========================================================================== */
/* Public submission                                                          */
/* ========================================================================== */

function createReference(): string {
  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      )
      .replaceAll(
        "-",
        "",
      );

  return `DQI-${today}-${randomBytes(
    4,
  )
    .toString(
      "hex",
    )
    .toUpperCase()}`;
}

async function enforcePublicRateLimit(
  email: string,
): Promise<void> {
  const cutoff =
    new Date(
      Date.now() -
        PUBLIC_RATE_LIMIT_WINDOW_MINUTES *
          60 *
          1000,
    ).toISOString();

  const admin =
    getSupabaseAdmin();

  const {
    count,
    error,
  } =
    await admin
      .from(
        "contact_inquiries",
      )
      .select(
        "id",
        {
          count:
            "exact",

          head:
            true,
        },
      )
      .eq(
        "requester_email",
        email,
      )
      .gte(
        "created_at",
        cutoff,
      );

  if (error) {
    throw new PublicContactSubmissionError(
      "unavailable",
      "Unable to verify the inquiry submission limit.",
    );
  }

  if (
    (count ?? 0) >=
    PUBLIC_RATE_LIMIT_COUNT
  ) {
    throw new PublicContactSubmissionError(
      "rate_limited",
      "Please wait before sending another inquiry.",
    );
  }
}

export async function createPublicContactInquiry(
  input:
    CreatePublicContactInquiryInput,
): Promise<{
  id: string;

  reference: string;
}> {
  const requesterName =
    requiredSingleLine(
      input.requesterName,
      MAX_NAME_LENGTH,
      "Name",
    );

  const requesterEmail =
    normalizeEmail(
      input.requesterEmail,
    );

  const requesterPhone =
    normalizePhone(
      input.requesterPhone,
    );

  const category =
    normalizeCategory(
      input.category,
    );

  const subject =
    requiredSingleLine(
      input.subject,
      MAX_SUBJECT_LENGTH,
      "Subject",
    );

  const bodyText =
    normalizePublicBody(
      input.bodyText,
    );

  await enforcePublicRateLimit(
    requesterEmail,
  );

  const admin =
    getSupabaseAdmin();

  const now =
    new Date().toISOString();

  let inquiry:
    ContactInquiryRow | null =
    null;

  for (
    let attempt =
      0;
    attempt <
      3;
    attempt +=
      1
  ) {
    const reference =
      createReference();

    const {
      data,
      error,
    } =
      await admin
        .from(
          "contact_inquiries",
        )
        .insert({
          reference,

          source:
            "website_form",

          status:
            "new",

          category,

          requester_name:
            requesterName,

          requester_email:
            requesterEmail,

          requester_phone:
            requesterPhone ??
            null,

          subject,

          assigned_to_staff_user_id:
            null,

          last_message_at:
            now,

          closed_at:
            null,

          row_version:
            1,

          created_at:
            now,

          updated_at:
            now,
        })
        .select(
          "*",
        )
        .single();

    if (!error) {
      inquiry =
        data as
          ContactInquiryRow;

      break;
    }

    if (
      error.code !==
      "23505"
    ) {
      throw new PublicContactSubmissionError(
        "unavailable",
        "DueQuity could not create the inquiry.",
      );
    }
  }

  if (!inquiry) {
    throw new PublicContactSubmissionError(
      "unavailable",
      "DueQuity could not create a unique inquiry reference.",
    );
  }

  const {
    error:
      messageError,
  } =
    await admin
      .from(
        "contact_inquiry_messages",
      )
      .insert({
        inquiry_id:
          inquiry.id,

        reply_to_message_id:
          null,

        direction:
          "inbound",

        channel:
          "website_form",

        sender_type:
          "public",

        sender_name:
          requesterName,

        sender_email:
          requesterEmail,

        sender_staff_user_id:
          null,

        body_text:
          bodyText,

        state:
          "received",

        external_message_id:
          null,

        sent_at:
          now,

        created_at:
          now,
      });

  if (
    messageError
  ) {
    await admin
      .from(
        "contact_inquiries",
      )
      .delete()
      .eq(
        "id",
        inquiry.id,
      );

    throw new PublicContactSubmissionError(
      "unavailable",
      "DueQuity could not save the inquiry message.",
    );
  }

  return {
    id:
      inquiry.id,

    reference:
      inquiry.reference,
  };
}

/* ========================================================================== */
/* Inbox                                                                       */
/* ========================================================================== */

export async function listContactInquiries(
  requestedStatus?:
    string,
): Promise<
  ContactInquiryListItem[]
> {
  await requireContactPermission(
    "contact.read",
  );

  const admin =
    getSupabaseAdmin();

  let query =
    admin
      .from(
        "contact_inquiries",
      )
      .select(
        "*",
      );

  if (
    requestedStatus &&
    VALID_STATUSES.has(
      requestedStatus as
        ContactInquiryStatus,
    )
  ) {
    query =
      query.eq(
        "status",
        requestedStatus,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        "last_message_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        250,
      );

  if (error) {
    throw new Error(
      `Unable to load Contact Inbox: ${error.message}`,
    );
  }

  return (
    (
      data ??
      []
    ) as ContactInquiryRow[]
  ).map(
    listItemFromRow,
  );
}

/* ========================================================================== */
/* Detail                                                                      */
/* ========================================================================== */

export async function getContactInquiry(
  inquiryId: string,
): Promise<
  ContactInquiryDetail
> {
  await requireContactPermission(
    "contact.read",
  );

  const inquiry =
    await loadInquiryRow(
      inquiryId,
    );

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "contact_inquiry_messages",
      )
      .select(
        "*",
      )
      .eq(
        "inquiry_id",
        inquiry.id,
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        },
      );

  if (error) {
    throw new Error(
      `Unable to load inquiry conversation: ${error.message}`,
    );
  }

  return {
    ...listItemFromRow(
      inquiry,
    ),

    source:
      inquiry.source,

    assignedToStaffUserId:
      inquiry.assigned_to_staff_user_id ??
      undefined,

    closedAt:
      inquiry.closed_at ??
      undefined,

    rowVersion:
      Number(
        inquiry.row_version,
      ),

    updatedAt:
      inquiry.updated_at,

    messages:
      (
        (
          data ??
          []
        ) as ContactMessageRow[]
      ).map(
        messageFromRow,
      ),
  };
}

/* ========================================================================== */
/* Status                                                                      */
/* ========================================================================== */

export async function updateContactInquiryStatus(
  inquiryId: string,
  rawStatus: string,
): Promise<void> {
  const session =
    await requireContactPermission(
      "contact.manage",
    );

  const status =
    normalizeStatus(
      rawStatus,
    );

  const inquiry =
    await loadInquiryRow(
      inquiryId,
    );

  const now =
    new Date().toISOString();

  const admin =
    getSupabaseAdmin();

  const {
    error,
  } =
    await admin
      .from(
        "contact_inquiries",
      )
      .update({
        status,

        closed_at:
          status ===
            "closed" ||
          status ===
            "spam"
            ? now
            : null,

        row_version:
          Number(
            inquiry.row_version,
          ) +
          1,

        updated_at:
          now,
      })
      .eq(
        "id",
        inquiry.id,
      );

  if (error) {
    throw new Error(
      `Unable to update inquiry status: ${error.message}`,
    );
  }

  await recordAuditEvent({
    actor:
      session.user,

    action:
      "contact.status_changed",

    targetType:
      "contact_inquiry",

    targetId:
      inquiry.id,

    targetLabel:
      inquiry.reference,

    outcome:
      "success",

    detail:
      `Public inquiry status changed from ${inquiry.status} to ${status}.`,
  });
}

/* ========================================================================== */
/* Reply                                                                       */
/* ========================================================================== */

function replySubject(
  inquiry:
    ContactInquiryRow,
): string {
  const existing =
    inquiry.subject.trim();

  const prefixed =
    /^re:/i.test(
      existing,
    )
      ? existing
      : `Re: ${existing}`;

  return `${prefixed} [${inquiry.reference}]`;
}

export async function replyToContactInquiry(
  inquiryId: string,
  rawBodyText: string,
): Promise<void> {
  const session =
    await requireContactPermission(
      "contact.reply",
    );

  const inquiry =
    await loadInquiryRow(
      inquiryId,
    );

  if (
    inquiry.status ===
      "closed" ||
    inquiry.status ===
      "spam"
  ) {
    throw new Error(
      "Reopen this inquiry before replying.",
    );
  }

  const bodyText =
    normalizeReplyBody(
      rawBodyText,
    );

  const admin =
    getSupabaseAdmin();

  const {
    data:
      latestMessageData,
    error:
      latestMessageError,
  } =
    await admin
      .from(
        "contact_inquiry_messages",
      )
      .select(
        "id",
      )
      .eq(
        "inquiry_id",
        inquiry.id,
      )
      .order(
        "created_at",
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
    latestMessageError
  ) {
    throw new Error(
      `Unable to resolve inquiry conversation: ${latestMessageError.message}`,
    );
  }

  const now =
    new Date().toISOString();

  const {
    data:
      draftData,
    error:
      draftError,
  } =
    await admin
      .from(
        "contact_inquiry_messages",
      )
      .insert({
        inquiry_id:
          inquiry.id,

        reply_to_message_id:
          latestMessageData?.id ??
          null,

        direction:
          "outbound",

        channel:
          "email",

        sender_type:
          "staff",

        sender_name:
          session.user.name,

        sender_email:
          DUEQUITY_CONTACT_EMAIL,

        sender_staff_user_id:
          session.user.id,

        body_text:
          bodyText,

        state:
          "draft",

        external_message_id:
          null,

        sent_at:
          null,

        created_at:
          now,
      })
      .select(
        "id",
      )
      .single();

  if (
    draftError ||
    !draftData
  ) {
    throw new Error(
      `Unable to create inquiry reply: ${
        draftError?.message ??
        "Draft record was not returned."
      }`,
    );
  }

  const messageId =
    draftData.id as
      string;

  try {
    const delivery =
      await sendDueQuityContactEmail({
        to:
          inquiry.requester_email,

        subject:
          replySubject(
            inquiry,
          ),

        bodyText,
      });

    const sentAt =
      new Date().toISOString();

    const {
      error:
        messageUpdateError,
    } =
      await admin
        .from(
          "contact_inquiry_messages",
        )
        .update({
          state:
            "sent",

          external_message_id:
            delivery.messageId ??
            null,

          sent_at:
            sentAt,
        })
        .eq(
          "id",
          messageId,
        );

    if (
      messageUpdateError
    ) {
      throw new Error(
        `Email was sent but DueQuity could not finalize its message record: ${messageUpdateError.message}`,
      );
    }

    const {
      error:
        inquiryUpdateError,
    } =
      await admin
        .from(
          "contact_inquiries",
        )
        .update({
          status:
            "responded",

          assigned_to_staff_user_id:
            session.user.id,

          last_message_at:
            sentAt,

          row_version:
            Number(
              inquiry.row_version,
            ) +
            1,

          updated_at:
            sentAt,
        })
        .eq(
          "id",
          inquiry.id,
        );

    if (
      inquiryUpdateError
    ) {
      throw new Error(
        `Email was sent but DueQuity could not update the inquiry: ${inquiryUpdateError.message}`,
      );
    }

    await recordAuditEvent({
      actor:
        session.user,

      action:
        "contact.reply_sent",

      targetType:
        "contact_inquiry",

      targetId:
        inquiry.id,

      targetLabel:
        inquiry.reference,

      outcome:
        "success",

      detail:
        `Reply sent from ${DUEQUITY_CONTACT_EMAIL} to the public inquiry requester.`,
    });
  } catch (
    error
  ) {
    await admin
      .from(
        "contact_inquiry_messages",
      )
      .update({
        state:
          "failed",
      })
      .eq(
        "id",
        messageId,
      );

    try {
      await recordAuditEvent({
        actor:
          session.user,

        action:
          "contact.reply_failed",

        targetType:
          "contact_inquiry",

        targetId:
          inquiry.id,

        targetLabel:
          inquiry.reference,

        outcome:
          "failure",

        detail:
          "An outbound public inquiry reply could not be delivered.",
      });
    } catch {
      /*
       * Preserve the original delivery failure.
       */
    }

    throw error;
  }
}