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
/* Types                                                                       */
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
  inboxTotal: number;

  inboxUnread: number;

  sentTotal: number;

  attachmentsTotal: number;
}

export interface ClaimantMailboxEntry {
  kind:
    ClaimantMailboxEntryKind;

  id: string;

  claimantId: string;

  claimantReference: string;

  legalName: string;

  claimId: string;

  claimReference: string;

  threadId?: string;

  messageId?: string;

  direction?:
    | "inbound"
    | "outbound";

  senderName?: string;

  bodyPreview?: string;

  sentAt?: string;

  unread?: boolean;

  attachmentCount?: number;

  attachmentId?: string;

  fileName?: string;

  mimeType?: string;

  sizeBytes?: number;
}

export interface ClaimantMailboxResult {
  folder:
    ClaimantMailboxFolder;

  entries:
    ClaimantMailboxEntry[];

  counts:
    ClaimantMailboxCounts;

  query?: string;
}

/* ========================================================================== */
/* Rows                                                                        */
/* ========================================================================== */

interface ClaimantRow {
  claim_id: string;

  claim_reference: string;

  claimant_id: string;

  claimant_reference: string;

  legal_name: string;

  originating_staff_user_id: string;

  assigned_staff_user_id: string;
}

interface ThreadRow {
  id: string;

  claim_id: string;

  status: string;

  last_message_at:
    | string
    | null;
}

interface MessageRow {
  id: string;

  thread_id: string;

  sender_type:
    | "staff"
    | "claimant";

  sender_staff_user_id:
    | string
    | null;

  body_text: string;

  state: string;

  sent_at:
    | string
    | null;

  claimant_read_at:
    | string
    | null;

  staff_read_at:
    | string
    | null;

  created_at: string;
}

interface AttachmentRow {
  id: string;

  message_id: string;

  file_name: string;

  mime_type: string;

  size_bytes:
    | number
    | string;

  created_at: string;
}

interface StaffRow {
  id: string;

  name: string;
}

interface RepositorySnapshot {
  claimants:
    ClaimantRow[];

  threads:
    ThreadRow[];

  messages:
    MessageRow[];

  attachments:
    AttachmentRow[];

  staffNames:
    Map<
      string,
      string
    >;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function normalizedQuery(
  value: string,
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
  value: string,
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

function includesQuery(
  query: string,
  values: Array<
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
  value: string | undefined,
): number {
  if (!value) {
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

function isSuperAdmin(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
    "super_admin"
  );
}

async function requireStaffSession(): Promise<
  StaffSession
> {
  const session =
    await resolveStaffSession();

  if (!session) {
    throw new Error(
      "Staff authentication is required.",
    );
  }

  return session;
}

/* ========================================================================== */
/* Repository snapshot                                                         */
/* ========================================================================== */

async function loadRepositorySnapshot(
  session:
    StaffSession,
): Promise<
  RepositorySnapshot
> {
  const admin =
    getSupabaseAdmin();

  let claimantQuery =
    admin
      .from(
        "claimant_onboarding",
      )
      .select(
        "claim_id, claim_reference, claimant_id, claimant_reference, legal_name, originating_staff_user_id, assigned_staff_user_id",
      );

  if (
    !isSuperAdmin(
      session,
    )
  ) {
    claimantQuery =
      claimantQuery.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const {
    data:
      claimantData,
    error:
      claimantError,
  } =
    await claimantQuery;

  if (
    claimantError
  ) {
    throw new Error(
      `Unable to load claimant message identities: ${claimantError.message}`,
    );
  }

  const claimants =
    (
      claimantData ??
      []
    ) as ClaimantRow[];

  if (
    claimants.length ===
    0
  ) {
    return {
      claimants:
        [],

      threads:
        [],

      messages:
        [],

      attachments:
        [],

      staffNames:
        new Map(),
    };
  }

  const claimIds =
    [
      ...new Set(
        claimants.map(
          (
            claimant,
          ) =>
            claimant.claim_id,
        ),
      ),
    ];

  const {
    data:
      threadData,
    error:
      threadError,
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
        claimIds,
      );

  if (
    threadError
  ) {
    throw new Error(
      `Unable to load claimant message threads: ${threadError.message}`,
    );
  }

  const threads =
    (
      threadData ??
      []
    ) as ThreadRow[];

  if (
    threads.length ===
    0
  ) {
    return {
      claimants,

      threads:
        [],

      messages:
        [],

      attachments:
        [],

      staffNames:
        new Map(),
    };
  }

  const threadIds =
    [
      ...new Set(
        threads.map(
          (
            thread,
          ) =>
            thread.id,
        ),
      ),
    ];

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
        "id, thread_id, sender_type, sender_staff_user_id, body_text, state, sent_at, claimant_read_at, staff_read_at, created_at",
      )
      .in(
        "thread_id",
        threadIds,
      )
      .eq(
        "state",
        "sent",
      );

  if (
    messageError
  ) {
    throw new Error(
      `Unable to load claimant messages: ${messageError.message}`,
    );
  }

  const messages =
    (
      messageData ??
      []
    ) as MessageRow[];

  const messageIds =
    [
      ...new Set(
        messages.map(
          (
            message,
          ) =>
            message.id,
        ),
      ),
    ];

  let attachments:
    AttachmentRow[] =
    [];

  if (
    messageIds.length >
    0
  ) {
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
          "id, message_id, file_name, mime_type, size_bytes, created_at",
        )
        .in(
          "message_id",
          messageIds,
        );

    if (
      attachmentError
    ) {
      throw new Error(
        `Unable to load claimant message attachments: ${attachmentError.message}`,
      );
    }

    attachments =
      (
        attachmentData ??
        []
      ) as AttachmentRow[];
  }

  const staffIds =
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

  const staffNames =
    new Map<
      string,
      string
    >();

  if (
    staffIds.length >
    0
  ) {
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
          staffIds,
        );

    if (error) {
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
        rawRow as StaffRow;

      staffNames.set(
        row.id,
        row.name,
      );
    }
  }

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

function claimantByClaimId(
  snapshot:
    RepositorySnapshot,
): Map<
  string,
  ClaimantRow
> {
  return new Map(
    snapshot.claimants.map(
      (
        claimant,
      ) => [
        claimant.claim_id,
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
  ThreadRow
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

function threadByClaimId(
  snapshot:
    RepositorySnapshot,
): Map<
  string,
  ThreadRow
> {
  return new Map(
    snapshot.threads.map(
      (
        thread,
      ) => [
        thread.claim_id,
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
  MessageRow
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
  AttachmentRow[]
> {
  const result =
    new Map<
      string,
      AttachmentRow[]
    >();

  for (
    const attachment of
      snapshot.attachments
  ) {
    const current =
      result.get(
        attachment.message_id,
      ) ??
      [];

    current.push(
      attachment,
    );

    result.set(
      attachment.message_id,
      current,
    );
  }

  return result;
}

/* ========================================================================== */
/* Entries                                                                     */
/* ========================================================================== */

function messageEntries(
  snapshot:
    RepositorySnapshot,
): ClaimantMailboxEntry[] {
  const claimants =
    claimantByClaimId(
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
        message.thread_id,
      );

    if (!thread) {
      continue;
    }

    const claimant =
      claimants.get(
        thread.claim_id,
      );

    if (!claimant) {
      continue;
    }

    const inbound =
      message.sender_type ===
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
        claimant.claimant_id,

      claimantReference:
        claimant.claimant_reference,

      legalName:
        claimant.legal_name,

      claimId:
        claimant.claim_id,

      claimReference:
        claimant.claim_reference,

      direction:
        inbound
          ? "inbound"
          : "outbound",

      senderName:
        inbound
          ? claimant.legal_name
          : (
              message.sender_staff_user_id
                ? snapshot.staffNames.get(
                    message.sender_staff_user_id,
                  )
                : undefined
            ) ??
            "DueQuity staff",

      bodyPreview:
        preview(
          message.body_text,
        ),

      sentAt:
        message.sent_at ??
        message.created_at,

      unread:
        inbound &&
        !message.staff_read_at,

      attachmentCount:
        attachments.get(
          message.id,
        )?.length ??
        0,
    });
  }

  return entries;
}

function attachmentEntries(
  snapshot:
    RepositorySnapshot,
): ClaimantMailboxEntry[] {
  const claimants =
    claimantByClaimId(
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
        attachment.message_id,
      );

    if (!message) {
      continue;
    }

    const thread =
      threads.get(
        message.thread_id,
      );

    if (!thread) {
      continue;
    }

    const claimant =
      claimants.get(
        thread.claim_id,
      );

    if (!claimant) {
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
        claimant.claimant_id,

      claimantReference:
        claimant.claimant_reference,

      legalName:
        claimant.legal_name,

      claimId:
        claimant.claim_id,

      claimReference:
        claimant.claim_reference,

      direction:
        message.sender_type ===
        "claimant"
          ? "inbound"
          : "outbound",

      senderName:
        message.sender_type ===
        "claimant"
          ? claimant.legal_name
          : (
              message.sender_staff_user_id
                ? snapshot.staffNames.get(
                    message.sender_staff_user_id,
                  )
                : undefined
            ) ??
            "DueQuity staff",

      bodyPreview:
        preview(
          message.body_text,
        ),

      sentAt:
        attachment.created_at,

      unread:
        message.sender_type ===
          "claimant" &&
        !message.staff_read_at,

      attachmentCount:
        1,

      fileName:
        attachment.file_name,

      mimeType:
        attachment.mime_type,

      sizeBytes:
        Number(
          attachment.size_bytes,
        ),
    });
  }

  return entries;
}

function claimantEntries(
  snapshot:
    RepositorySnapshot,
): ClaimantMailboxEntry[] {
  const threads =
    threadByClaimId(
      snapshot,
    );

  return snapshot.claimants.map(
    (
      claimant,
    ) => {
      const thread =
        threads.get(
          claimant.claim_id,
        );

      return {
        kind:
          "claimant",

        id:
          claimant.claimant_id,

        claimantId:
          claimant.claimant_id,

        claimantReference:
          claimant.claimant_reference,

        legalName:
          claimant.legal_name,

        claimId:
          claimant.claim_id,

        claimReference:
          claimant.claim_reference,

        threadId:
          thread?.id,
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
        message.sender_type ===
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
          !message.staff_read_at,
      ).length,

    sentTotal:
      snapshot.messages.filter(
        (
          message,
        ) =>
          message.sender_type ===
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
/* Repository search                                                           */
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

  if (!query) {
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

  if (!normalized) {
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

  if (!attachment) {
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
        attachment.message_id,
    );

  if (!message) {
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
        message.thread_id,
    );

  if (!thread) {
    throw new Error(
      "Claimant attachment conversation could not be resolved.",
    );
  }

  const claimant =
    snapshot.claimants.find(
      (
        item,
      ) =>
        item.claim_id ===
        thread.claim_id,
    );

  if (!claimant) {
    throw new Error(
      "Claimant attachment identity could not be resolved.",
    );
  }

  return getClaimantMessageAttachmentDownloadForStaff(
    session,
    claimant.claimant_id,
    normalized,
  );
}