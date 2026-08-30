import "server-only";

import {
  getClaimantMessageAttachmentDownloadForStaff,
  type ClaimantMessageAttachmentDownload,
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
/* Public types                                                                */
/* ========================================================================== */

export type ClaimantMailboxFolder =
  | "inbox"
  | "sent"
  | "attachments";

export type ClaimantMailboxEntryKind =
  | "message"
  | "attachment"
  | "claimant";

export interface ClaimantMailboxCounts {
  inboxTotal:
    number;

  inboxUnread:
    number;

  sentTotal:
    number;

  attachmentsTotal:
    number;
}

export interface ClaimantMailboxEntry {
  kind:
    ClaimantMailboxEntryKind;

  id:
    string;

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

  threadId?:
    string;

  messageId?:
    string;

  direction?:
    | "inbound"
    | "outbound";

  senderName?:
    string;

  subject?:
    string;

  bodyPreview?:
    string;

  sentAt?:
    string;

  unread?:
    boolean;

  attachmentCount?:
    number;

  attachmentId?:
    string;

  fileName?:
    string;

  mimeType?:
    string;

  sizeBytes?:
    number;

  recordKind?:
    | "claim"
    | "assigned_lead";
}

export interface ClaimantMailboxResult {
  folder:
    ClaimantMailboxFolder;

  entries:
    ClaimantMailboxEntry[];

  counts:
    ClaimantMailboxCounts;

  query?:
    string;
}

/* ========================================================================== */
/* Unified repository rows                                                     */
/* ========================================================================== */

interface RepositoryClaimant {
  recordKind:
    | "claim"
    | "assigned_lead";

  recoveryId:
    string;

  recoveryReference:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  legalName:
    string;

  originatingStaffUserId:
    string;

  assignedStaffUserId:
    string;
}

interface RepositoryThread {
  recordKind:
    | "claim"
    | "assigned_lead";

  id:
    string;

  recoveryId:
    string;

  status:
    string;

  lastMessageAt:
    | string
    | null;
}

interface RepositoryMessage {
  recordKind:
    | "claim"
    | "assigned_lead";

  id:
    string;

  threadId:
    string;

  senderType:
    | "staff"
    | "claimant";

  senderStaffUserId:
    | string
    | null;

  subject:
    string | null;

  bodyText:
    string;

  state:
    string;

  sentAt:
    | string
    | null;

  claimantReadAt:
    | string
    | null;

  staffReadAt:
    | string
    | null;

  createdAt:
    string;
}

interface RepositoryAttachment {
  recordKind:
    | "claim"
    | "assigned_lead";

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

interface RepositorySnapshot {
  claimants:
    RepositoryClaimant[];

  threads:
    RepositoryThread[];

  messages:
    RepositoryMessage[];

  attachments:
    RepositoryAttachment[];

  staffNames:
    Map<
      string,
      string
    >;
}

/* ========================================================================== */
/* Raw database rows                                                           */
/* ========================================================================== */

interface ClaimBackedClaimantRow {
  claim_id:
    string;

  claim_reference:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  legal_name:
    string;

  originating_staff_user_id:
    string;

  assigned_staff_user_id:
    string;
}

interface AssignedLeadClaimantRow {
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

interface ClaimThreadRow {
  id:
    string;

  claim_id:
    string;

  status:
    string;

  last_message_at:
    | string
    | null;
}

interface AssignedLeadThreadRow {
  id:
    string;

  workcase_id:
    string;

  claimant_id:
    string;

  status:
    string;

  last_message_at:
    | string
    | null;
}

interface MessageRow {
  id:
    string;

  thread_id:
    string;

  sender_type:
    | "staff"
    | "claimant";

  sender_staff_user_id:
    | string
    | null;

  subject:
    string
    | null;

  body_text:
    string;

  state:
    string;

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
}

interface AttachmentRow {
  id:
    string;

  message_id:
    string;

  file_name:
    string;

  mime_type:
    string;

  size_bytes:
    number
    | string;

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

function normalizedQuery(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase()
    .slice(
      0,
      200,
    );
}

function preview(
  value:
    string,
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " ",
    )
    .slice(
      0,
      160,
    );
}

function messagePreview(
  subject:
    string | null,
  bodyText:
    string,
): string {
  const normalizedSubject =
    subject
      ?.trim();

  const normalizedBody =
    preview(
      bodyText,
    );

  if (
    normalizedSubject &&
    normalizedBody
  ) {
    return `${normalizedSubject} — ${normalizedBody}`.slice(
      0,
      160,
    );
  }

  if (
    normalizedSubject
  ) {
    return normalizedSubject.slice(
      0,
      160,
    );
  }

  return normalizedBody;
}

function includesQuery(
  query:
    string,
  values:
    Array<
      string | undefined
    >,
): boolean {
  return values.some(
    (
      value,
    ) =>
      value
        ?.toLowerCase()
        .includes(
          query,
        ) ===
      true,
  );
}

function timeValue(
  value:
    string | undefined,
): number {
  if (
    !value
  ) {
    return 0;
  }

  const date =
    new Date(
      value,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? 0
    : date.getTime();
}

/* ========================================================================== */
/* Staff authorization                                                        */
/* ========================================================================== */

function hasGlobalClaimantAccess(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
      "super_admin" ||
    session.user.role ===
      "administrator"
  );
}

async function requireStaffSession(): Promise<
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

  return session;
}

/* ========================================================================== */
/* Claim-backed repository                                                     */
/* ========================================================================== */

async function loadClaimBackedClaimants(
  session:
    StaffSession,
): Promise<
  RepositoryClaimant[]
> {
  const admin =
    getSupabaseAdmin();

  let query =
    admin
      .from(
        "claimant_onboarding",
      )
      .select(
        "claim_id, claim_reference, claimant_id, claimant_reference, legal_name, originating_staff_user_id, assigned_staff_user_id",
      );

  if (
    !hasGlobalClaimantAccess(
      session,
    )
  ) {
    query =
      query.eq(
        "assigned_staff_user_id",
        session.user.id,
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
      `Unable to load Claim-backed claimant message identities: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      rawRow,
    ) => {
      const row =
        rawRow as
          ClaimBackedClaimantRow;

      return {
        recordKind:
          "claim",

        recoveryId:
          row.claim_id,

        recoveryReference:
          row.claim_reference,

        claimantId:
          row.claimant_id,

        claimantReference:
          row.claimant_reference,

        legalName:
          row.legal_name,

        originatingStaffUserId:
          row.originating_staff_user_id,

        assignedStaffUserId:
          row.assigned_staff_user_id,
      };
    },
  );
}

/* ========================================================================== */
/* Assigned-lead repository                                                    */
/* ========================================================================== */

async function loadAssignedLeadClaimants(
  session:
    StaffSession,
): Promise<
  RepositoryClaimant[]
> {
  const admin =
    getSupabaseAdmin();

  let query =
    admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, claimant_id, claimant_reference, legal_first_name, legal_last_name, originating_staff_user_id, assigned_staff_user_id, status, linked_claim_id",
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
    !hasGlobalClaimantAccess(
      session,
    )
  ) {
    query =
      query.eq(
        "assigned_staff_user_id",
        session.user.id,
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
      `Unable to load assigned claimant message identities: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      rawRow,
    ) => {
      const row =
        rawRow as
          AssignedLeadClaimantRow;

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
        recordKind:
          "assigned_lead",

        recoveryId:
          row.id,

        recoveryReference:
          row.claimant_reference,

        claimantId:
          row.claimant_id,

        claimantReference:
          row.claimant_reference,

        legalName,

        originatingStaffUserId:
          row.originating_staff_user_id,

        assignedStaffUserId:
          row.assigned_staff_user_id,
      };
    },
  );
}

/* ========================================================================== */
/* Threads                                                                     */
/* ========================================================================== */

async function loadThreads(
  claimants:
    RepositoryClaimant[],
): Promise<
  RepositoryThread[]
> {
  const admin =
    getSupabaseAdmin();

  const claimRecoveryIds =
    claimants
      .filter(
        (
          claimant,
        ) =>
          claimant.recordKind ===
          "claim",
      )
      .map(
        (
          claimant,
        ) =>
          claimant.recoveryId,
      );

  const assignedRecoveryIds =
    claimants
      .filter(
        (
          claimant,
        ) =>
          claimant.recordKind ===
          "assigned_lead",
      )
      .map(
        (
          claimant,
        ) =>
          claimant.recoveryId,
      );

  const threads:
    RepositoryThread[] =
    [];

  if (
    claimRecoveryIds.length >
    0
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
          "id, claim_id, status, last_message_at",
        )
        .in(
          "claim_id",
          claimRecoveryIds,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to load Claim-backed claimant message threads: ${error.message}`,
      );
    }

    for (
      const rawRow of
        data ??
        []
    ) {
      const row =
        rawRow as
          ClaimThreadRow;

      threads.push({
        recordKind:
          "claim",

        id:
          row.id,

        recoveryId:
          row.claim_id,

        status:
          row.status,

        lastMessageAt:
          row.last_message_at,
      });
    }
  }

  if (
    assignedRecoveryIds.length >
    0
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "assigned_lead_claimant_message_threads",
        )
        .select(
          "id, workcase_id, claimant_id, status, last_message_at",
        )
        .in(
          "workcase_id",
          assignedRecoveryIds,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to load assigned claimant message threads: ${error.message}`,
      );
    }

    for (
      const rawRow of
        data ??
        []
    ) {
      const row =
        rawRow as
          AssignedLeadThreadRow;

      threads.push({
        recordKind:
          "assigned_lead",

        id:
          row.id,

        recoveryId:
          row.workcase_id,

        status:
          row.status,

        lastMessageAt:
          row.last_message_at,
      });
    }
  }

  return threads;
}

/* ========================================================================== */
/* Messages                                                                    */
/* ========================================================================== */

async function loadMessages(
  threads:
    RepositoryThread[],
): Promise<
  RepositoryMessage[]
> {
  const admin =
    getSupabaseAdmin();

  const claimThreadIds =
    threads
      .filter(
        (
          thread,
        ) =>
          thread.recordKind ===
          "claim",
      )
      .map(
        (
          thread,
        ) =>
          thread.id,
      );

  const assignedThreadIds =
    threads
      .filter(
        (
          thread,
        ) =>
          thread.recordKind ===
          "assigned_lead",
      )
      .map(
        (
          thread,
        ) =>
          thread.id,
      );

  const messages:
    RepositoryMessage[] =
    [];

  if (
    claimThreadIds.length >
    0
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
          "id, thread_id, sender_type, sender_staff_user_id, subject, body_text, state, sent_at, claimant_read_at, staff_read_at, created_at",
        )
        .in(
          "thread_id",
          claimThreadIds,
        )
        .eq(
          "state",
          "sent",
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to load Claim-backed claimant messages: ${error.message}`,
      );
    }

    for (
      const rawRow of
        data ??
        []
    ) {
      const row =
        rawRow as
          MessageRow;

      messages.push({
        recordKind:
          "claim",

        id:
          row.id,

        threadId:
          row.thread_id,

        senderType:
          row.sender_type,

        senderStaffUserId:
          row.sender_staff_user_id,

        subject:
          row.subject,

        bodyText:
          row.body_text,

        state:
          row.state,

        sentAt:
          row.sent_at,

        claimantReadAt:
          row.claimant_read_at,

        staffReadAt:
          row.staff_read_at,

        createdAt:
          row.created_at,
      });
    }
  }

  if (
    assignedThreadIds.length >
    0
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "assigned_lead_claimant_messages",
        )
        .select(
          "id, thread_id, sender_type, sender_staff_user_id, subject, body_text, state, sent_at, claimant_read_at, staff_read_at, created_at",
        )
        .in(
          "thread_id",
          assignedThreadIds,
        )
        .eq(
          "state",
          "sent",
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to load assigned claimant messages: ${error.message}`,
      );
    }

    for (
      const rawRow of
        data ??
        []
    ) {
      const row =
        rawRow as
          MessageRow;

      messages.push({
        recordKind:
          "assigned_lead",

        id:
          row.id,

        threadId:
          row.thread_id,

        senderType:
          row.sender_type,

        senderStaffUserId:
          row.sender_staff_user_id,

        subject:
          row.subject,

        bodyText:
          row.body_text,

        state:
          row.state,

        sentAt:
          row.sent_at,

        claimantReadAt:
          row.claimant_read_at,

        staffReadAt:
          row.staff_read_at,

        createdAt:
          row.created_at,
      });
    }
  }

  return messages;
}

/* ========================================================================== */
/* Attachments                                                                 */
/* ========================================================================== */

async function loadAttachments(
  messages:
    RepositoryMessage[],
): Promise<
  RepositoryAttachment[]
> {
  const admin =
    getSupabaseAdmin();

  const claimMessageIds =
    messages
      .filter(
        (
          message,
        ) =>
          message.recordKind ===
          "claim",
      )
      .map(
        (
          message,
        ) =>
          message.id,
      );

  const assignedMessageIds =
    messages
      .filter(
        (
          message,
        ) =>
          message.recordKind ===
          "assigned_lead",
      )
      .map(
        (
          message,
        ) =>
          message.id,
      );

  const attachments:
    RepositoryAttachment[] =
    [];

  if (
    claimMessageIds.length >
    0
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
          "id, message_id, file_name, mime_type, size_bytes, created_at",
        )
        .in(
          "message_id",
          claimMessageIds,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to load Claim-backed claimant message attachments: ${error.message}`,
      );
    }

    for (
      const rawRow of
        data ??
        []
    ) {
      const row =
        rawRow as
          AttachmentRow;

      attachments.push({
        recordKind:
          "claim",

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
    }
  }

  if (
    assignedMessageIds.length >
    0
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "assigned_lead_claimant_message_attachments",
        )
        .select(
          "id, message_id, file_name, mime_type, size_bytes, created_at",
        )
        .in(
          "message_id",
          assignedMessageIds,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to load assigned claimant message attachments: ${error.message}`,
      );
    }

    for (
      const rawRow of
        data ??
        []
    ) {
      const row =
        rawRow as
          AttachmentRow;

      attachments.push({
        recordKind:
          "assigned_lead",

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
    }
  }

  return attachments;
}

/* ========================================================================== */
/* Staff directory                                                             */
/* ========================================================================== */

async function loadStaffNames(
  messages:
    RepositoryMessage[],
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
            message.senderStaffUserId
              ? [
                  message.senderStaffUserId,
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
      `Unable to load claimant-message staff names: ${error.message}`,
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
/* Snapshot                                                                    */
/* ========================================================================== */

async function loadRepositorySnapshot(
  session:
    StaffSession,
): Promise<
  RepositorySnapshot
> {
  const [
    claimBackedClaimants,
    assignedLeadClaimants,
  ] =
    await Promise.all([
      loadClaimBackedClaimants(
        session,
      ),

      loadAssignedLeadClaimants(
        session,
      ),
    ]);

  const claimants =
    [
      ...claimBackedClaimants,
      ...assignedLeadClaimants,
    ];

  const threads =
    await loadThreads(
      claimants,
    );

  const messages =
    await loadMessages(
      threads,
    );

  const [
    attachments,
    staffNames,
  ] =
    await Promise.all([
      loadAttachments(
        messages,
      ),

      loadStaffNames(
        messages,
      ),
    ]);

  return {
    claimants,

    threads,

    messages,

    attachments,

    staffNames,
  };
}

/* ========================================================================== */
/* Indexes                                                                     */
/* ========================================================================== */

function claimantByRecoveryId(
  snapshot:
    RepositorySnapshot,
): Map<
  string,
  RepositoryClaimant
> {
  return new Map(
    snapshot.claimants.map(
      (
        claimant,
      ) => [
        `${claimant.recordKind}:${claimant.recoveryId}`,
        claimant,
      ],
    ),
  );
}

function threadById(
  snapshot:
    RepositorySnapshot,
): Map<
  string,
  RepositoryThread
> {
  return new Map(
    snapshot.threads.map(
      (
        thread,
      ) => [
        thread.id,
        thread,
      ],
    ),
  );
}

function threadByRecoveryId(
  snapshot:
    RepositorySnapshot,
): Map<
  string,
  RepositoryThread
> {
  return new Map(
    snapshot.threads.map(
      (
        thread,
      ) => [
        `${thread.recordKind}:${thread.recoveryId}`,
        thread,
      ],
    ),
  );
}

function messageById(
  snapshot:
    RepositorySnapshot,
): Map<
  string,
  RepositoryMessage
> {
  return new Map(
    snapshot.messages.map(
      (
        message,
      ) => [
        message.id,
        message,
      ],
    ),
  );
}

function attachmentsByMessageId(
  snapshot:
    RepositorySnapshot,
): Map<
  string,
  RepositoryAttachment[]
> {
  const result =
    new Map<
      string,
      RepositoryAttachment[]
    >();

  for (
    const attachment of
      snapshot.attachments
  ) {
    const current =
      result.get(
        attachment.messageId,
      ) ??
      [];

    current.push(
      attachment,
    );

    result.set(
      attachment.messageId,
      current,
    );
  }

  return result;
}

/* ========================================================================== */
/* Message entries                                                            */
/* ========================================================================== */

function messageEntries(
  snapshot:
    RepositorySnapshot,
): ClaimantMailboxEntry[] {
  const claimants =
    claimantByRecoveryId(
      snapshot,
    );

  const threads =
    threadById(
      snapshot,
    );

  const attachments =
    attachmentsByMessageId(
      snapshot,
    );

  const entries:
    ClaimantMailboxEntry[] =
    [];

  for (
    const message of
      snapshot.messages
  ) {
    const thread =
      threads.get(
        message.threadId,
      );

    if (
      !thread
    ) {
      continue;
    }

    const claimant =
      claimants.get(
        `${thread.recordKind}:${thread.recoveryId}`,
      );

    if (
      !claimant
    ) {
      continue;
    }

    const inbound =
      message.senderType ===
      "claimant";

    entries.push({
      kind:
        "message",

      id:
        message.id,

      messageId:
        message.id,

      threadId:
        thread.id,

      claimantId:
        claimant.claimantId,

      claimantReference:
        claimant.claimantReference,

      legalName:
        claimant.legalName,

      claimId:
        claimant.recoveryId,

      claimReference:
        claimant.recoveryReference,

      direction:
        inbound
          ? "inbound"
          : "outbound",

      senderName:
        inbound
          ? claimant.legalName
          : (
              message.senderStaffUserId
                ? snapshot.staffNames.get(
                    message.senderStaffUserId,
                  )
                : undefined
            ) ??
            "DueQuity staff",

      subject:
        message.subject ??
        undefined,

      bodyPreview:
        messagePreview(
          message.subject,
          message.bodyText,
        ),

      sentAt:
        message.sentAt ??
        message.createdAt,

      unread:
        inbound &&
        !message.staffReadAt,

      attachmentCount:
        attachments.get(
          message.id,
        )?.length ??
        0,

      recordKind:
        claimant.recordKind,
    });
  }

  return entries;
}

/* ========================================================================== */
/* Attachment entries                                                         */
/* ========================================================================== */

function attachmentEntries(
  snapshot:
    RepositorySnapshot,
): ClaimantMailboxEntry[] {
  const claimants =
    claimantByRecoveryId(
      snapshot,
    );

  const threads =
    threadById(
      snapshot,
    );

  const messages =
    messageById(
      snapshot,
    );

  const entries:
    ClaimantMailboxEntry[] =
    [];

  for (
    const attachment of
      snapshot.attachments
  ) {
    const message =
      messages.get(
        attachment.messageId,
      );

    if (
      !message
    ) {
      continue;
    }

    const thread =
      threads.get(
        message.threadId,
      );

    if (
      !thread
    ) {
      continue;
    }

    const claimant =
      claimants.get(
        `${thread.recordKind}:${thread.recoveryId}`,
      );

    if (
      !claimant
    ) {
      continue;
    }

    entries.push({
      kind:
        "attachment",

      id:
        attachment.id,

      attachmentId:
        attachment.id,

      messageId:
        message.id,

      threadId:
        thread.id,

      claimantId:
        claimant.claimantId,

      claimantReference:
        claimant.claimantReference,

      legalName:
        claimant.legalName,

      claimId:
        claimant.recoveryId,

      claimReference:
        claimant.recoveryReference,

      direction:
        message.senderType ===
          "claimant"
          ? "inbound"
          : "outbound",

      senderName:
        message.senderType ===
          "claimant"
          ? claimant.legalName
          : (
              message.senderStaffUserId
                ? snapshot.staffNames.get(
                    message.senderStaffUserId,
                  )
                : undefined
            ) ??
            "DueQuity staff",

      subject:
        message.subject ??
        undefined,

      bodyPreview:
        messagePreview(
          message.subject,
          message.bodyText,
        ),

      sentAt:
        attachment.createdAt,

      unread:
        message.senderType ===
          "claimant" &&
        !message.staffReadAt,

      attachmentCount:
        1,

      fileName:
        attachment.fileName,

      mimeType:
        attachment.mimeType,

      sizeBytes:
        attachment.sizeBytes,

      recordKind:
        claimant.recordKind,
    });
  }

  return entries;
}

/* ========================================================================== */
/* Claimant entries                                                           */
/* ========================================================================== */

function claimantEntries(
  snapshot:
    RepositorySnapshot,
): ClaimantMailboxEntry[] {
  const threads =
    threadByRecoveryId(
      snapshot,
    );

  return snapshot.claimants.map(
    (
      claimant,
    ) => {
      const thread =
        threads.get(
          `${claimant.recordKind}:${claimant.recoveryId}`,
        );

      return {
        kind:
          "claimant",

        id:
          claimant.claimantId,

        claimantId:
          claimant.claimantId,

        claimantReference:
          claimant.claimantReference,

        legalName:
          claimant.legalName,

        claimId:
          claimant.recoveryId,

        claimReference:
          claimant.recoveryReference,

        threadId:
          thread?.id,

        recordKind:
          claimant.recordKind,
      };
    },
  );
}

/* ========================================================================== */
/* Counts                                                                      */
/* ========================================================================== */

function countsForSnapshot(
  snapshot:
    RepositorySnapshot,
): ClaimantMailboxCounts {
  const inbound =
    snapshot.messages.filter(
      (
        message,
      ) =>
        message.senderType ===
        "claimant",
    );

  return {
    inboxTotal:
      inbound.length,

    inboxUnread:
      inbound.filter(
        (
          message,
        ) =>
          !message.staffReadAt,
      ).length,

    sentTotal:
      snapshot.messages.filter(
        (
          message,
        ) =>
          message.senderType ===
          "staff",
      ).length,

    attachmentsTotal:
      snapshot.attachments.length,
  };
}

/* ========================================================================== */
/* Public mailbox                                                              */
/* ========================================================================== */

export async function listClaimantMessageMailbox(
  folder:
    ClaimantMailboxFolder,
): Promise<
  ClaimantMailboxResult
> {
  const session =
    await requireStaffSession();

  const snapshot =
    await loadRepositorySnapshot(
      session,
    );

  const messages =
    messageEntries(
      snapshot,
    );

  const attachments =
    attachmentEntries(
      snapshot,
    );

  const entries =
    folder ===
      "inbox"
      ? messages.filter(
          (
            entry,
          ) =>
            entry.direction ===
            "inbound",
        )
      : folder ===
          "sent"
        ? messages.filter(
            (
              entry,
            ) =>
              entry.direction ===
              "outbound",
          )
        : attachments;

  entries.sort(
    (
      left,
      right,
    ) =>
      timeValue(
        right.sentAt,
      ) -
      timeValue(
        left.sentAt,
      ),
  );

  return {
    folder,

    entries,

    counts:
      countsForSnapshot(
        snapshot,
      ),
  };
}

/* ========================================================================== */
/* Search                                                                      */
/* ========================================================================== */

export async function searchClaimantMessageMailbox(
  rawQuery:
    string,
): Promise<
  ClaimantMailboxResult
> {
  const query =
    normalizedQuery(
      rawQuery,
    );

  if (
    !query
  ) {
    return listClaimantMessageMailbox(
      "inbox",
    );
  }

  const session =
    await requireStaffSession();

  const snapshot =
    await loadRepositorySnapshot(
      session,
    );

  const messages =
    messageEntries(
      snapshot,
    );

  const attachments =
    attachmentEntries(
      snapshot,
    );

  const claimants =
    claimantEntries(
      snapshot,
    );

  const matchedClaimants =
    claimants.filter(
      (
        entry,
      ) =>
        includesQuery(
          query,
          [
            entry.claimantReference,
            entry.legalName,
            entry.claimReference,
            entry.claimantId,
            entry.claimId,
          ],
        ),
    );

  const matchedMessages =
    messages.filter(
      (
        entry,
      ) =>
        includesQuery(
          query,
          [
            entry.claimantReference,
            entry.legalName,
            entry.claimReference,
            entry.senderName,
            entry.subject,
            entry.bodyPreview,
            entry.direction,
            entry.direction ===
              "inbound"
              ? "inbox"
              : "sent",
          ],
        ),
    );

  const matchedAttachments =
    attachments.filter(
      (
        entry,
      ) =>
        includesQuery(
          query,
          [
            entry.claimantReference,
            entry.legalName,
            entry.claimReference,
            entry.senderName,
            entry.subject,
            entry.bodyPreview,
            entry.fileName,
            entry.mimeType,
            "attachment",
            "attachments",
          ],
        ),
    );

  const entries =
    [
      ...matchedMessages,
      ...matchedAttachments,
      ...matchedClaimants,
    ];

  entries.sort(
    (
      left,
      right,
    ) => {
      const dateDifference =
        timeValue(
          right.sentAt,
        ) -
        timeValue(
          left.sentAt,
        );

      if (
        dateDifference !==
        0
      ) {
        return dateDifference;
      }

      if (
        left.kind ===
          "claimant" &&
        right.kind !==
          "claimant"
      ) {
        return 1;
      }

      if (
        right.kind ===
          "claimant" &&
        left.kind !==
          "claimant"
      ) {
        return -1;
      }

      return left.claimantReference.localeCompare(
        right.claimantReference,
      );
    },
  );

  return {
    folder:
      "inbox",

    entries:
      entries.slice(
        0,
        300,
      ),

    counts:
      countsForSnapshot(
        snapshot,
      ),

    query,
  };
}

/* ========================================================================== */
/* Attachment authorization                                                    */
/* ========================================================================== */

export async function getClaimantMailboxAttachmentDownload(
  attachmentId:
    string,
): Promise<
  ClaimantMessageAttachmentDownload
> {
  const normalized =
    attachmentId.trim();

  if (
    !normalized
  ) {
    throw new Error(
      "Attachment ID is required.",
    );
  }

  const session =
    await requireStaffSession();

  const snapshot =
    await loadRepositorySnapshot(
      session,
    );

  const attachment =
    snapshot.attachments.find(
      (
        item,
      ) =>
        item.id ===
        normalized,
    );

  if (
    !attachment
  ) {
    throw new Error(
      "Claimant message attachment was not found.",
    );
  }

  const message =
    snapshot.messages.find(
      (
        item,
      ) =>
        item.id ===
        attachment.messageId,
    );

  if (
    !message
  ) {
    throw new Error(
      "Claimant attachment message could not be resolved.",
    );
  }

  const thread =
    snapshot.threads.find(
      (
        item,
      ) =>
        item.id ===
        message.threadId,
    );

  if (
    !thread
  ) {
    throw new Error(
      "Claimant attachment conversation could not be resolved.",
    );
  }

  const claimant =
    snapshot.claimants.find(
      (
        item,
      ) =>
        item.recordKind ===
          thread.recordKind &&
        item.recoveryId ===
          thread.recoveryId,
    );

  if (
    !claimant
  ) {
    throw new Error(
      "Claimant attachment identity could not be resolved.",
    );
  }

  return getClaimantMessageAttachmentDownloadForStaff(
    session,
    claimant.claimantId,
    normalized,
  );
}