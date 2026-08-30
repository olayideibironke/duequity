"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  IconAlert,
  IconArrowLeft,
  IconCheck,
  IconClose,
  IconDocument,
  IconMail,
  IconPlus,
  IconUpload,
} from "@/components/ui/icon";

import {
  STAFF_MAIL_SEARCH_EVENT,
  STAFF_MAIL_SEARCH_RESET_EVENT,
} from "@/components/pro/staff-mail-header-search";

import {
  cn,
} from "@/lib/cn";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type MailFolder =
  | "inbox"
  | "sent"
  | "drafts"
  | "archive"
  | "trash";

type MailPriority =
  | "normal"
  | "high";

type RecipientType =
  | "to"
  | "cc"
  | "bcc";

interface Participant {
  id: string;
  name: string;
  email: string;
  title: string;
}

interface Recipient {
  id: string;

  participant:
    Participant;

  recipientType:
    RecipientType;

  readAt?: string;
  archivedAt?: string;
  trashedAt?: string;
  acknowledgedAt?: string;
}

interface Attachment {
  id: string;

  messageId: string;

  uploadedByStaffUserId: string;

  fileName: string;
  mimeType: string;
  sizeBytes: number;

  createdAt: string;
}

interface MailMessage {
  id: string;

  threadId: string;

  replyToMessageId?: string;

  sender:
    Participant;

  subject: string;
  bodyText: string;

  priority:
    MailPriority;

  state:
    "draft" | "sent";

  acknowledgmentRequested: boolean;

  sentAt?: string;

  createdAt: string;
  updatedAt: string;

  senderArchivedAt?: string;
  senderTrashedAt?: string;

  recipients:
    Recipient[];

  attachments:
    Attachment[];
}

interface MailListItem {
  id: string;

  threadId: string;

  sender:
    Participant;

  recipients:
    Recipient[];

  subject: string;

  bodyPreview: string;

  priority:
    MailPriority;

  state:
    "draft" | "sent";

  acknowledgmentRequested: boolean;

  sentAt?: string;

  createdAt: string;
  updatedAt: string;

  unread: boolean;

  attachmentCount: number;

  sourceFolder?: MailFolder;
}

interface SearchMailListItem
  extends MailListItem {
  sourceFolder: MailFolder;
}

interface FolderCounts {
  inbox: number;
  unread: number;
  sent: number;
  drafts: number;
  archive: number;
  trash: number;
}

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  title: string;
  role: string;
}

interface MailboxPayload {
  folder: MailFolder;

  items:
    MailListItem[];

  counts:
    FolderCounts;

  directory:
    Participant[];

  currentUser:
    CurrentUser;

  error?: string;
}

interface SearchPayload {
  query: string;

  items:
    SearchMailListItem[];

  counts:
    FolderCounts;

  error?: string;
}

interface MessagePayload {
  message:
    MailMessage;

  counts:
    FolderCounts;

  error?: string;
}

interface DraftPayload {
  draft:
    MailMessage;

  error?: string;
}

interface ActionPayload {
  message?:
    MailMessage;

  counts?:
    FolderCounts;

  ok?: boolean;

  error?: string;
}

interface AttachmentUploadPayload {
  attachment:
    Attachment;

  message:
    MailMessage;

  error?: string;
}

interface AttachmentDownloadPayload {
  url: string;
  fileName: string;
  mimeType: string;
  expiresInSeconds: number;

  error?: string;
}

interface ComposeRecipient {
  staffUserId: string;

  recipientType:
    RecipientType;
}

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const EMPTY_COUNTS:
  FolderCounts = {
    inbox:
      0,

    unread:
      0,

    sent:
      0,

    drafts:
      0,

    archive:
      0,

    trash:
      0,
  };

const FOLDERS: Array<{
  key:
    MailFolder;

  label:
    string;
}> = [
  {
    key:
      "inbox",

    label:
      "Inbox",
  },

  {
    key:
      "sent",

    label:
      "Sent",
  },

  {
    key:
      "drafts",

    label:
      "Drafts",
  },

  {
    key:
      "archive",

    label:
      "Archive",
  },

  {
    key:
      "trash",

    label:
      "Trash",
  },
];

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

function folderLabel(
  folder:
    MailFolder,
): string {
  return (
    FOLDERS.find(
      (
        entry,
      ) =>
        entry.key ===
        folder,
    )?.label ??
    folder
  );
}

function formatDateTime(
  value:
    string | undefined,
): string {
  if (
    !value
  ) {
    return "";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  const today =
    new Date();

  const sameDay =
    date.getFullYear() ===
      today.getFullYear() &&
    date.getMonth() ===
      today.getMonth() &&
    date.getDate() ===
      today.getDate();

  if (
    sameDay
  ) {
    return new Intl.DateTimeFormat(
      "en-US",
      {
        hour:
          "numeric",

        minute:
          "2-digit",
      },
    ).format(
      date,
    );
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      year:
        date.getFullYear() !==
        today.getFullYear()
          ? "numeric"
          : undefined,
    },
  ).format(
    date,
  );
}

function formatFullDateTime(
  value:
    string | undefined,
): string {
  if (
    !value
  ) {
    return "Not sent";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "long",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    },
  ).format(
    date,
  );
}

function formatBytes(
  value:
    number,
): string {
  if (
    value <
    1024
  ) {
    return `${value} B`;
  }

  if (
    value <
    1024 * 1024
  ) {
    return `${(
      value /
      1024
    ).toFixed(
      1,
    )} KB`;
  }

  return `${(
    value /
    (
      1024 *
      1024
    )
  ).toFixed(
    1,
  )} MB`;
}

function subjectLabel(
  value:
    string,
): string {
  return (
    value.trim() ||
    "(No subject)"
  );
}

function recipientLabel(
  recipients:
    Recipient[],
): string {
  const names =
    recipients
      .filter(
        (
          recipient,
        ) =>
          recipient.recipientType ===
          "to",
      )
      .map(
        (
          recipient,
        ) =>
          recipient.participant.name,
      );

  if (
    names.length ===
    0
  ) {
    return "No recipient";
  }

  if (
    names.length ===
    1
  ) {
    return names[0];
  }

  return `${names[0]} +${
    names.length -
    1
  }`;
}

function replySubject(
  subject:
    string,
): string {
  const normalized =
    subject.trim();

  if (
    /^re:/i.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return `Re: ${
    normalized ||
    "(No subject)"
  }`;
}

function forwardSubject(
  subject:
    string,
): string {
  const normalized =
    subject.trim();

  if (
    /^fwd:/i.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return `Fwd: ${
    normalized ||
    "(No subject)"
  }`;
}

function uniqueComposeRecipients(
  recipients:
    ComposeRecipient[],
): ComposeRecipient[] {
  const seen =
    new Set<string>();

  const result:
    ComposeRecipient[] =
    [];

  for (
    const recipient of
      recipients
  ) {
    if (
      seen.has(
        recipient.staffUserId,
      )
    ) {
      continue;
    }

    seen.add(
      recipient.staffUserId,
    );

    result.push(
      recipient,
    );
  }

  return result;
}

/* ========================================================================== */
/* Fetch helper                                                                */
/* ========================================================================== */

async function readJson<
  T extends {
    error?: string;
  },
>(
  response:
    Response,
): Promise<T> {
  const data =
    await response.json() as T;

  if (
    !response.ok
  ) {
    throw new Error(
      data.error ||
      `Request failed with status ${response.status}.`,
    );
  }

  return data;
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function StaffMailClient() {
  const [
    folder,
    setFolder,
  ] =
    useState<MailFolder>(
      "inbox",
    );

  const [
    items,
    setItems,
  ] =
    useState<
      MailListItem[]
    >(
      [],
    );

  const [
    counts,
    setCounts,
  ] =
    useState<FolderCounts>(
      EMPTY_COUNTS,
    );

  const [
    directory,
    setDirectory,
  ] =
    useState<
      Participant[]
    >(
      [],
    );

  const [
    currentUser,
    setCurrentUser,
  ] =
    useState<
      CurrentUser | undefined
    >();

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    error,
    setError,
  ] =
    useState(
      "",
    );

  const [
    searchMode,
    setSearchMode,
  ] =
    useState(
      false,
    );

  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState(
      "",
    );

  const [
    selectedMessage,
    setSelectedMessage,
  ] =
    useState<
      MailMessage | undefined
    >();

  const [
    selectedSourceFolder,
    setSelectedSourceFolder,
  ] =
    useState<
      MailFolder | undefined
    >();

  const [
    selectedMessageLoading,
    setSelectedMessageLoading,
  ] =
    useState(
      false,
    );

  const [
    composing,
    setComposing,
  ] =
    useState(
      false,
    );

  const [
    draftId,
    setDraftId,
  ] =
    useState<
      string | undefined
    >();

  const [
    composeSubject,
    setComposeSubject,
  ] =
    useState(
      "",
    );

  const [
    composeBody,
    setComposeBody,
  ] =
    useState(
      "",
    );

  const [
    composePriority,
    setComposePriority,
  ] =
    useState<
      MailPriority
    >(
      "normal",
    );

  const [
    composeAcknowledgment,
    setComposeAcknowledgment,
  ] =
    useState(
      false,
    );

  const [
    composeRecipients,
    setComposeRecipients,
  ] =
    useState<
      ComposeRecipient[]
    >(
      [],
    );

  const [
    recipientSelection,
    setRecipientSelection,
  ] =
    useState(
      "",
    );

  const [
    recipientTypeSelection,
    setRecipientTypeSelection,
  ] =
    useState<
      RecipientType
    >(
      "to",
    );

  const [
    composeAttachments,
    setComposeAttachments,
  ] =
    useState<
      Attachment[]
    >(
      [],
    );

  const [
    savingDraft,
    setSavingDraft,
  ] =
    useState(
      false,
    );

  const [
    sending,
    setSending,
  ] =
    useState(
      false,
    );

  const [
    uploading,
    setUploading,
  ] =
    useState(
      false,
    );

  const [
    actionBusy,
    setActionBusy,
  ] =
    useState(
      false,
    );

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState(
      "",
    );

  const lastSavedFingerprint =
    useRef(
      "",
    );

  const composeFingerprint =
    useMemo(
      () =>
        JSON.stringify({
          subject:
            composeSubject,

          body:
            composeBody,

          priority:
            composePriority,

          acknowledgment:
            composeAcknowledgment,

          recipients:
            composeRecipients,
        }),
      [
        composeAcknowledgment,
        composeBody,
        composePriority,
        composeRecipients,
        composeSubject,
      ],
    );

  /* ======================================================================== */
  /* Reset helpers                                                             */
  /* ======================================================================== */

  const clearCompose =
    useCallback(
      () => {
        setComposing(
          false,
        );

        setDraftId(
          undefined,
        );

        setComposeSubject(
          "",
        );

        setComposeBody(
          "",
        );

        setComposePriority(
          "normal",
        );

        setComposeAcknowledgment(
          false,
        );

        setComposeRecipients(
          [],
        );

        setComposeAttachments(
          [],
        );

        setRecipientSelection(
          "",
        );

        setRecipientTypeSelection(
          "to",
        );

        lastSavedFingerprint.current =
          "";
      },
      [],
    );

  const resetRepositorySearch =
    useCallback(
      () => {
        setSearchMode(
          false,
        );

        setSearchQuery(
          "",
        );

        window.dispatchEvent(
          new Event(
            STAFF_MAIL_SEARCH_RESET_EVENT,
          ),
        );
      },
      [],
    );

  function hydrateDraft(
    message:
      MailMessage,
    overrides?: {
      subject?: string;

      bodyText?: string;

      recipients?:
        ComposeRecipient[];

      priority?:
        MailPriority;

      acknowledgmentRequested?:
        boolean;
    },
  ) {
    const subject =
      overrides?.subject ??
      message.subject;

    const bodyText =
      overrides?.bodyText ??
      message.bodyText;

    const recipients =
      overrides?.recipients ??
      message.recipients.map(
        (
          recipient,
        ) => ({
          staffUserId:
            recipient.participant.id,

          recipientType:
            recipient.recipientType,
        }),
      );

    const priority =
      overrides?.priority ??
      message.priority;

    const acknowledgmentRequested =
      overrides
        ?.acknowledgmentRequested ??
      message.acknowledgmentRequested;

    setSelectedMessage(
      undefined,
    );

    setSelectedSourceFolder(
      undefined,
    );

    setComposing(
      true,
    );

    setDraftId(
      message.id,
    );

    setComposeSubject(
      subject,
    );

    setComposeBody(
      bodyText,
    );

    setComposePriority(
      priority,
    );

    setComposeAcknowledgment(
      acknowledgmentRequested,
    );

    setComposeRecipients(
      uniqueComposeRecipients(
        recipients,
      ),
    );

    setComposeAttachments(
      message.attachments,
    );

    lastSavedFingerprint.current =
      JSON.stringify({
        subject,

        body:
          bodyText,

        priority,

        acknowledgment:
          acknowledgmentRequested,

        recipients:
          uniqueComposeRecipients(
            recipients,
          ),
      });
  }

  /* ======================================================================== */
  /* Mailbox loading                                                           */
  /* ======================================================================== */

  const loadFolder =
    useCallback(
      async (
        targetFolder:
          MailFolder,
        options?: {
          preserveSelection?: boolean;
        },
      ) => {
        setLoading(
          true,
        );

        setError(
          "",
        );

        try {
          const response =
            await fetch(
              `/api/pro/mail?folder=${encodeURIComponent(
                targetFolder,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            await readJson<MailboxPayload>(
              response,
            );

          setFolder(
            data.folder,
          );

          setItems(
            data.items,
          );

          setCounts(
            data.counts,
          );

          setDirectory(
            data.directory,
          );

          setCurrentUser(
            data.currentUser,
          );

          if (
            !options
              ?.preserveSelection
          ) {
            setSelectedMessage(
              undefined,
            );

            setSelectedSourceFolder(
              undefined,
            );
          }
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load DueQuity Mail.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void loadFolder(
        "inbox",
      );
    },
    [
      loadFolder,
    ],
  );

  /* ======================================================================== */
  /* Draft save                                                                */
  /* ======================================================================== */

  const saveDraft =
    useCallback(
      async (
        options?: {
          silent?: boolean;
        },
      ): Promise<boolean> => {
        if (
          !draftId
        ) {
          return false;
        }

        if (
          composeFingerprint ===
          lastSavedFingerprint.current
        ) {
          return true;
        }

        setSavingDraft(
          true,
        );

        if (
          !options?.silent
        ) {
          setError(
            "",
          );
        }

        try {
          const response =
            await fetch(
              `/api/pro/mail/${encodeURIComponent(
                draftId,
              )}`,
              {
                method:
                  "PATCH",

                headers: {
                  "content-type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    action:
                      "save",

                    subject:
                      composeSubject,

                    bodyText:
                      composeBody,

                    priority:
                      composePriority,

                    acknowledgmentRequested:
                      composeAcknowledgment,

                    recipients:
                      composeRecipients,
                  }),
              },
            );

          const data =
            await readJson<ActionPayload>(
              response,
            );

          if (
            data.counts
          ) {
            setCounts(
              data.counts,
            );
          }

          lastSavedFingerprint.current =
            composeFingerprint;

          return true;
        } catch (
          saveError
        ) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Unable to save mail draft.",
          );

          return false;
        } finally {
          setSavingDraft(
            false,
          );
        }
      },
      [
        composeAcknowledgment,
        composeBody,
        composeFingerprint,
        composePriority,
        composeRecipients,
        composeSubject,
        draftId,
      ],
    );

  useEffect(
    () => {
      if (
        !composing ||
        !draftId ||
        sending ||
        uploading ||
        composeFingerprint ===
          lastSavedFingerprint.current
      ) {
        return;
      }

      const timer =
        window.setTimeout(
          () => {
            void saveDraft({
              silent:
                true,
            });
          },
          900,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
      };
    },
    [
      composeFingerprint,
      composing,
      draftId,
      saveDraft,
      sending,
      uploading,
    ],
  );

  /* ======================================================================== */
  /* Repository-wide search                                                    */
  /* ======================================================================== */

  const runRepositorySearch =
    useCallback(
      async (
        rawQuery:
          string,
      ) => {
        const query =
          rawQuery
            .trim()
            .slice(
              0,
              200,
            );

        if (
          !query
        ) {
          setSearchMode(
            false,
          );

          setSearchQuery(
            "",
          );

          setSelectedMessage(
            undefined,
          );

          setSelectedSourceFolder(
            undefined,
          );

          await loadFolder(
            folder,
          );

          return;
        }

        if (
          composing
        ) {
          await saveDraft({
            silent:
              true,
          });

          clearCompose();
        }

        setLoading(
          true,
        );

        setError(
          "",
        );

        setSuccessMessage(
          "",
        );

        setSelectedMessage(
          undefined,
        );

        setSelectedSourceFolder(
          undefined,
        );

        try {
          const response =
            await fetch(
              `/api/pro/mail/search?q=${encodeURIComponent(
                query,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            await readJson<SearchPayload>(
              response,
            );

          setSearchMode(
            true,
          );

          setSearchQuery(
            data.query,
          );

          setItems(
            data.items,
          );

          setCounts(
            data.counts,
          );
        } catch (
          searchError
        ) {
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Unable to search DueQuity Mail.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        clearCompose,
        composing,
        folder,
        loadFolder,
        saveDraft,
      ],
    );

  useEffect(
    () => {
      function handleMailSearch(
        event:
          Event,
      ) {
        const customEvent =
          event as CustomEvent<{
            query?: unknown;
          }>;

        const query =
          typeof customEvent
            .detail?.query ===
            "string"
            ? customEvent.detail.query
            : "";

        void runRepositorySearch(
          query,
        );
      }

      window.addEventListener(
        STAFF_MAIL_SEARCH_EVENT,
        handleMailSearch,
      );

      return () => {
        window.removeEventListener(
          STAFF_MAIL_SEARCH_EVENT,
          handleMailSearch,
        );
      };
    },
    [
      runRepositorySearch,
    ],
  );

  /* ======================================================================== */
  /* Compose creation                                                          */
  /* ======================================================================== */

  async function createDraft(
    options?: {
      replyToMessageId?: string;

      subject?: string;

      bodyText?: string;

      recipients?:
        ComposeRecipient[];

      priority?:
        MailPriority;

      acknowledgmentRequested?:
        boolean;
    },
  ) {
    setError(
      "",
    );

    setSuccessMessage(
      "",
    );

    try {
      const response =
        await fetch(
          "/api/pro/mail",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "create_draft",

                replyToMessageId:
                  options
                    ?.replyToMessageId,
              }),
          },
        );

      const data =
        await readJson<DraftPayload>(
          response,
        );

      hydrateDraft(
        data.draft,
        {
          subject:
            options?.subject,

          bodyText:
            options?.bodyText,

          recipients:
            options?.recipients,

          priority:
            options?.priority,

          acknowledgmentRequested:
            options
              ?.acknowledgmentRequested,
        },
      );

      if (
        options &&
        (
          options.subject !==
            undefined ||
          options.bodyText !==
            undefined ||
          options.recipients !==
            undefined ||
          options.priority !==
            undefined ||
          options
            .acknowledgmentRequested !==
            undefined
        )
      ) {
        lastSavedFingerprint.current =
          "";
      }
    } catch (
      createError
    ) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create mail draft.",
      );
    }
  }

  /* ======================================================================== */
  /* Message opening                                                           */
  /* ======================================================================== */

  async function openMessage(
    item:
      MailListItem,
  ) {
    setError(
      "",
    );

    setSuccessMessage(
      "",
    );

    setSelectedMessageLoading(
      true,
    );

    try {
      const response =
        await fetch(
          `/api/pro/mail/${encodeURIComponent(
            item.id,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const data =
        await readJson<MessagePayload>(
          response,
        );

      setCounts(
        data.counts,
      );

      if (
        data.message.state ===
          "draft"
      ) {
        hydrateDraft(
          data.message,
        );

        return;
      }

      clearCompose();

      setSelectedSourceFolder(
        item.sourceFolder ??
        folder,
      );

      setSelectedMessage(
        data.message,
      );

      setItems(
        (
          current,
        ) =>
          current.map(
            (
              currentItem,
            ) =>
              currentItem.id ===
              item.id
                ? {
                    ...currentItem,

                    unread:
                      false,
                  }
                : currentItem,
          ),
      );
    } catch (
      openError
    ) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Unable to open mail message.",
      );
    } finally {
      setSelectedMessageLoading(
        false,
      );
    }
  }

  /* ======================================================================== */
  /* Folder switching                                                          */
  /* ======================================================================== */

  async function switchFolder(
    nextFolder:
      MailFolder,
  ) {
    if (
      composing
    ) {
      await saveDraft({
        silent:
          true,
      });

      clearCompose();
    }

    resetRepositorySearch();

    await loadFolder(
      nextFolder,
    );
  }

  /* ======================================================================== */
  /* Recipient controls                                                        */
  /* ======================================================================== */

  function addRecipient() {
    const staffUserId =
      recipientSelection.trim();

    if (
      !staffUserId
    ) {
      return;
    }

    setComposeRecipients(
      (
        current,
      ) =>
        uniqueComposeRecipients([
          ...current,

          {
            staffUserId,

            recipientType:
              recipientTypeSelection,
          },
        ]),
    );

    setRecipientSelection(
      "",
    );
  }

  function removeRecipient(
    staffUserId:
      string,
  ) {
    setComposeRecipients(
      (
        current,
      ) =>
        current.filter(
          (
            recipient,
          ) =>
            recipient.staffUserId !==
            staffUserId,
        ),
    );
  }

  function participantFor(
    staffUserId:
      string,
  ): Participant | undefined {
    return directory.find(
      (
        participant,
      ) =>
        participant.id ===
        staffUserId,
    );
  }

  /* ======================================================================== */
  /* Send                                                                      */
  /* ======================================================================== */

  async function sendMessage() {
    if (
      !draftId
    ) {
      return;
    }

    if (
      !composeRecipients.some(
        (
          recipient,
        ) =>
          recipient.recipientType ===
          "to",
      )
    ) {
      setError(
        "Select at least one To recipient.",
      );

      return;
    }

    if (
      !composeSubject.trim() &&
      !composeBody.trim()
    ) {
      setError(
        "Enter a subject or message before sending.",
      );

      return;
    }

    setSending(
      true,
    );

    setError(
      "",
    );

    setSuccessMessage(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/pro/mail/${encodeURIComponent(
            draftId,
          )}`,
          {
            method:
              "PATCH",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "send",

                subject:
                  composeSubject,

                bodyText:
                  composeBody,

                priority:
                  composePriority,

                acknowledgmentRequested:
                  composeAcknowledgment,

                recipients:
                  composeRecipients,
              }),
          },
        );

      const data =
        await readJson<ActionPayload>(
          response,
        );

      if (
        data.counts
      ) {
        setCounts(
          data.counts,
        );
      }

      clearCompose();

      resetRepositorySearch();

      setSuccessMessage(
        "Message sent securely inside DueQuity.",
      );

      await loadFolder(
        "sent",
      );
    } catch (
      sendError
    ) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send mail.",
      );
    } finally {
      setSending(
        false,
      );
    }
  }

  /* ======================================================================== */
  /* Attachments                                                               */
  /* ======================================================================== */

  async function uploadAttachment(
    file:
      File,
  ) {
    if (
      !draftId
    ) {
      return;
    }

    setUploading(
      true,
    );

    setError(
      "",
    );

    try {
      const formData =
        new FormData();

      formData.set(
        "file",
        file,
      );

      const response =
        await fetch(
          `/api/pro/mail/${encodeURIComponent(
            draftId,
          )}/attachments`,
          {
            method:
              "POST",

            body:
              formData,
          },
        );

      const data =
        await readJson<AttachmentUploadPayload>(
          response,
        );

      setComposeAttachments(
        data.message.attachments,
      );
    } catch (
      uploadError
    ) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload attachment.",
      );
    } finally {
      setUploading(
        false,
      );
    }
  }

  async function removeAttachment(
    attachmentId:
      string,
  ) {
    if (
      !draftId
    ) {
      return;
    }

    setUploading(
      true,
    );

    setError(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/pro/mail/${encodeURIComponent(
            draftId,
          )}/attachments/${encodeURIComponent(
            attachmentId,
          )}`,
          {
            method:
              "DELETE",
          },
        );

      const data =
        await readJson<{
          ok: boolean;

          message:
            MailMessage;

          error?: string;
        }>(
          response,
        );

      setComposeAttachments(
        data.message.attachments,
      );
    } catch (
      removeError
    ) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove attachment.",
      );
    } finally {
      setUploading(
        false,
      );
    }
  }

  async function downloadAttachment(
    messageId:
      string,
    attachmentId:
      string,
  ) {
    setError(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/pro/mail/${encodeURIComponent(
            messageId,
          )}/attachments/${encodeURIComponent(
            attachmentId,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const data =
        await readJson<AttachmentDownloadPayload>(
          response,
        );

      const anchor =
        document.createElement(
          "a",
        );

      anchor.href =
        data.url;

      anchor.target =
        "_blank";

      anchor.rel =
        "noopener noreferrer";

      document.body.appendChild(
        anchor,
      );

      anchor.click();

      anchor.remove();
    } catch (
      downloadError
    ) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download attachment.",
      );
    }
  }

  /* ======================================================================== */
  /* Message actions                                                           */
  /* ======================================================================== */

  async function messageAction(
    action:
      "archive"
      | "trash"
      | "restore"
      | "acknowledge",
  ) {
    if (
      !selectedMessage
    ) {
      return;
    }

    setActionBusy(
      true,
    );

    setError(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/pro/mail/${encodeURIComponent(
            selectedMessage.id,
          )}`,
          {
            method:
              "PATCH",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action,
              }),
          },
        );

      const data =
        await readJson<ActionPayload>(
          response,
        );

      if (
        data.counts
      ) {
        setCounts(
          data.counts,
        );
      }

      if (
        action ===
          "acknowledge" &&
        data.message
      ) {
        setSelectedMessage(
          data.message,
        );

        setSuccessMessage(
          "Receipt acknowledged.",
        );

        return;
      }

      setSelectedMessage(
        undefined,
      );

      setSelectedSourceFolder(
        undefined,
      );

      if (
        searchMode &&
        searchQuery
      ) {
        await runRepositorySearch(
          searchQuery,
        );
      } else {
        await loadFolder(
          folder,
        );
      }
    } catch (
      actionError
    ) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update mail message.",
      );
    } finally {
      setActionBusy(
        false,
      );
    }
  }

  /* ======================================================================== */
  /* Reply / reply all / forward                                               */
  /* ======================================================================== */

  function replyRecipients(
    message:
      MailMessage,
  ): ComposeRecipient[] {
    if (
      !currentUser
    ) {
      return [];
    }

    if (
      message.sender.id !==
      currentUser.id
    ) {
      return [
        {
          staffUserId:
            message.sender.id,

          recipientType:
            "to",
        },
      ];
    }

    const firstTo =
      message.recipients.find(
        (
          recipient,
        ) =>
          recipient.recipientType ===
          "to" &&
          recipient.participant.id !==
          currentUser.id,
      );

    return firstTo
      ? [
          {
            staffUserId:
              firstTo.participant.id,

            recipientType:
              "to",
          },
        ]
      : [];
  }

  function replyAllRecipients(
    message:
      MailMessage,
  ): ComposeRecipient[] {
    if (
      !currentUser
    ) {
      return [];
    }

    const recipients:
      ComposeRecipient[] =
      [];

    if (
      message.sender.id !==
      currentUser.id
    ) {
      recipients.push({
        staffUserId:
          message.sender.id,

        recipientType:
          "to",
      });
    }

    for (
      const recipient of
        message.recipients
    ) {
      if (
        recipient.participant.id ===
          currentUser.id ||
        recipient.recipientType ===
          "bcc"
      ) {
        continue;
      }

      recipients.push({
        staffUserId:
          recipient.participant.id,

        recipientType:
          recipient.recipientType ===
          "cc"
            ? "cc"
            : "to",
      });
    }

    return uniqueComposeRecipients(
      recipients,
    );
  }

  async function startReply(
    mode:
      "reply"
      | "reply_all"
      | "forward",
  ) {
    if (
      !selectedMessage
    ) {
      return;
    }

    const timestamp =
      formatFullDateTime(
        selectedMessage.sentAt,
      );

    if (
      mode ===
      "forward"
    ) {
      await createDraft({
        subject:
          forwardSubject(
            selectedMessage.subject,
          ),

        bodyText:
          [
            "",
            "",
            "---------- Forwarded DueQuity Mail ----------",
            `From: ${selectedMessage.sender.name} <${selectedMessage.sender.email}>`,
            `Sent: ${timestamp}`,
            `Subject: ${subjectLabel(
              selectedMessage.subject,
            )}`,
            "",
            selectedMessage.bodyText,
          ].join(
            "\n",
          ),

        recipients:
          [],
      });

      return;
    }

    const recipients =
      mode ===
        "reply_all"
        ? replyAllRecipients(
            selectedMessage,
          )
        : replyRecipients(
            selectedMessage,
          );

    await createDraft({
      replyToMessageId:
        selectedMessage.id,

      subject:
        replySubject(
          selectedMessage.subject,
        ),

      recipients,

      bodyText:
        [
          "",
          "",
          `On ${timestamp}, ${selectedMessage.sender.name} wrote:`,
          selectedMessage.bodyText
            .split(
              "\n",
            )
            .map(
              (
                line,
              ) =>
                `> ${line}`,
            )
            .join(
              "\n",
            ),
        ].join(
          "\n",
        ),
    });
  }

  /* ======================================================================== */
  /* Draft trash                                                               */
  /* ======================================================================== */

  async function trashDraft() {
    if (
      !draftId
    ) {
      clearCompose();

      return;
    }

    setActionBusy(
      true,
    );

    setError(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/pro/mail/${encodeURIComponent(
            draftId,
          )}`,
          {
            method:
              "PATCH",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "trash",
              }),
          },
        );

      await readJson<ActionPayload>(
        response,
      );

      clearCompose();

      if (
        searchMode &&
        searchQuery
      ) {
        await runRepositorySearch(
          searchQuery,
        );
      } else {
        await loadFolder(
          "drafts",
        );
      }
    } catch (
      trashError
    ) {
      setError(
        trashError instanceof Error
          ? trashError.message
          : "Unable to move draft to Trash.",
      );
    } finally {
      setActionBusy(
        false,
      );
    }
  }

  /* ======================================================================== */
  /* Detail helpers                                                            */
  /* ======================================================================== */

  const currentRecipient =
    selectedMessage &&
    currentUser
      ? selectedMessage.recipients.find(
          (
            recipient,
          ) =>
            recipient.participant.id ===
            currentUser.id,
        )
      : undefined;

  const mayAcknowledge =
    Boolean(
      selectedMessage &&
      currentRecipient &&
      selectedMessage
        .acknowledgmentRequested &&
      !currentRecipient
        .acknowledgedAt,
    );

  const effectiveSelectedFolder =
    selectedSourceFolder ??
    folder;

  /* ======================================================================== */
  /* Render                                                                    */
  /* ======================================================================== */

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
      {/* ================================================================= top */}
      <div className="flex min-h-16 flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-950 text-white">
            <IconMail
              size={19}
            />
          </span>

          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink-950">
              DueQuity Mail
            </h1>

            <p className="text-xs text-ink-500">
              Secure internal staff communication
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {savingDraft && (
            <span className="hidden text-xs text-ink-400 sm:inline">
              Saving draft...
            </span>
          )}

          {!savingDraft &&
            composing &&
            draftId && (
              <span className="hidden items-center gap-1 text-xs text-positive-700 sm:flex">
                <IconCheck
                  size={14}
                />

                Draft saved
              </span>
            )}

          <button
            type="button"
            onClick={() => {
              void createDraft();
            }}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            <IconPlus
              size={16}
            />

            Compose
          </button>
        </div>
      </div>

      {/* =========================================================== feedback */}
      {(error ||
        successMessage) && (
        <div
          className={cn(
            "mx-4 mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm sm:mx-5",

            error
              ? "border-critical-200 bg-critical-50 text-critical-800"
              : "border-positive-200 bg-positive-50 text-positive-800",
          )}
          role={
            error
              ? "alert"
              : "status"
          }
        >
          {error ? (
            <IconAlert
              size={17}
              className="mt-0.5"
            />
          ) : (
            <IconCheck
              size={17}
              className="mt-0.5"
            />
          )}

          <p className="flex-1">
            {error ||
              successMessage}
          </p>

          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setError(
                "",
              );

              setSuccessMessage(
                "",
              );
            }}
            className="shrink-0"
          >
            <IconClose
              size={15}
            />
          </button>
        </div>
      )}

      {/* ============================================================= layout */}
      <div className="grid min-h-[680px] lg:grid-cols-[190px_360px_minmax(0,1fr)] xl:grid-cols-[205px_400px_minmax(0,1fr)]">
        {/* ========================================================== folders */}
        <aside className="border-b border-line bg-inset lg:border-b-0 lg:border-r">
          <nav
            aria-label="Mail folders"
            className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-1 lg:p-4"
          >
            {FOLDERS.map(
              (
                entry,
              ) => {
                const active =
                  !searchMode &&
                  folder ===
                  entry.key;

                const displayCount =
                  entry.key ===
                    "inbox"
                    ? counts.unread
                    : entry.key ===
                        "drafts"
                      ? counts.drafts
                      : entry.key ===
                          "trash"
                        ? counts.trash
                        : 0;

                return (
                  <button
                    key={
                      entry.key
                    }
                    type="button"
                    onClick={() => {
                      void switchFolder(
                        entry.key,
                      );
                    }}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition lg:w-full",

                      active
                        ? "bg-white text-ink-950 shadow-sm"
                        : "text-ink-600 hover:bg-white/70 hover:text-ink-900",
                    )}
                  >
                    <IconMail
                      size={15}
                      className={
                        active
                          ? "text-accent-700"
                          : "text-ink-400"
                      }
                    />

                    <span className="flex-1 text-left">
                      {
                        entry.label
                      }
                    </span>

                    {displayCount >
                      0 && (
                      <span
                        className={cn(
                          "tnum rounded-full px-1.5 py-0.5 text-2xs font-semibold",

                          entry.key ===
                            "inbox"
                            ? "bg-accent-700 text-white"
                            : "bg-ink-200 text-ink-700",
                        )}
                      >
                        {
                          displayCount
                        }
                      </span>
                    )}
                  </button>
                );
              },
            )}
          </nav>

          <div className="hidden border-t border-line px-4 py-4 lg:block">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">
              Internal only
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Messages and attachments remain within authorized DueQuity staff accounts.
            </p>
          </div>
        </aside>

        {/* ===================================================== message list */}
        <section className="border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex min-h-[65px] items-center border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">
                {searchMode
                  ? "Search results"
                  : folderLabel(
                      folder,
                    )}
              </p>

              <p className="mt-0.5 truncate text-xs text-ink-400">
                {searchMode ? (
                  <>
                    {items.length.toLocaleString()} result
                    {items.length ===
                    1
                      ? ""
                      : "s"} across all mail for &quot;{searchQuery}&quot;
                  </>
                ) : folder ===
                  "inbox" ? (
                  `${counts.unread.toLocaleString()} unread`
                ) : (
                  `${counts[
                    folder
                  ].toLocaleString()} message${
                    counts[
                      folder
                    ] ===
                    1
                      ? ""
                      : "s"
                  }`
                )}
              </p>
            </div>

            {searchMode && (
              <button
                type="button"
                onClick={() => {
                  resetRepositorySearch();

                  void loadFolder(
                    folder,
                  );
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-inset hover:text-ink-900"
              >
                <IconClose
                  size={13}
                />

                Clear
              </button>
            )}
          </div>

          <div className="max-h-[620px] overflow-y-auto">
            {loading ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-ink-700">
                  {searchMode
                    ? "Searching mail..."
                    : "Loading mail..."}
                </p>
              </div>
            ) : items.length ===
              0 ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-inset text-ink-400">
                  <IconMail
                    size={19}
                  />
                </span>

                <p className="mt-3 text-sm font-semibold text-ink-800">
                  {searchMode
                    ? "No matching mail"
                    : "No messages"}
                </p>

                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  {searchMode
                    ? `No messages, drafts, recipients or attachments match "${searchQuery}".`
                    : folder ===
                        "inbox"
                      ? "New internal DueQuity messages will appear here."
                      : `This ${folder} folder is empty.`}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {items.map(
                  (
                    item,
                  ) => {
                    const selected =
                      selectedMessage?.id ===
                      item.id ||
                      draftId ===
                      item.id;

                    const senderView =
                      currentUser
                        ? item.sender.id ===
                          currentUser.id
                        : (
                            item.sourceFolder ===
                              "sent" ||
                            item.sourceFolder ===
                              "drafts" ||
                            folder ===
                              "sent" ||
                            folder ===
                              "drafts"
                          );

                    return (
                      <li
                        key={
                          item.id
                        }
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void openMessage(
                              item,
                            );
                          }}
                          className={cn(
                            "w-full px-4 py-3.5 text-left transition",

                            selected
                              ? "bg-accent-50"
                              : "hover:bg-inset",

                            item.unread &&
                              "bg-white",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "mt-1 size-2 shrink-0 rounded-full",

                                item.unread
                                  ? "bg-accent-600"
                                  : "bg-transparent",
                              )}
                              aria-hidden="true"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p
                                  className={cn(
                                    "min-w-0 flex-1 truncate text-sm",

                                    item.unread
                                      ? "font-semibold text-ink-950"
                                      : "font-medium text-ink-800",
                                  )}
                                >
                                  {senderView
                                    ? recipientLabel(
                                        item.recipients,
                                      )
                                    : item
                                        .sender
                                        .name}
                                </p>

                                <span className="shrink-0 text-2xs text-ink-400">
                                  {formatDateTime(
                                    item.sentAt ??
                                    item.updatedAt,
                                  )}
                                </span>
                              </div>

                              <div className="mt-1 flex items-center gap-2">
                                {searchMode &&
                                  item.sourceFolder && (
                                    <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                                      {folderLabel(
                                        item.sourceFolder,
                                      )}
                                    </span>
                                  )}

                                {item.priority ===
                                  "high" && (
                                  <span className="rounded-full bg-critical-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-critical-700">
                                    High
                                  </span>
                                )}

                                <p
                                  className={cn(
                                    "truncate text-xs",

                                    item.unread
                                      ? "font-semibold text-ink-800"
                                      : "text-ink-600",
                                  )}
                                >
                                  {subjectLabel(
                                    item.subject,
                                  )}
                                </p>
                              </div>

                              <div className="mt-1 flex items-center gap-2">
                                <p className="min-w-0 flex-1 truncate text-xs text-ink-400">
                                  {item.bodyPreview ||
                                    "No message body"}
                                </p>

                                {item.attachmentCount >
                                  0 && (
                                  <span
                                    className="flex shrink-0 items-center gap-1 text-2xs text-ink-400"
                                    title={`${item.attachmentCount} attachment${
                                      item.attachmentCount ===
                                      1
                                        ? ""
                                        : "s"
                                    }`}
                                  >
                                    <IconDocument
                                      size={13}
                                    />

                                    {
                                      item.attachmentCount
                                    }
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  },
                )}
              </ul>
            )}
          </div>
        </section>

        {/* ===================================================== detail pane */}
        <section className="min-w-0 bg-white">
          {selectedMessageLoading ? (
            <div className="flex min-h-[480px] items-center justify-center">
              <p className="text-sm text-ink-500">
                Opening message...
              </p>
            </div>
          ) : composing ? (
            <div className="flex min-h-full flex-col">
              <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => {
                    void (
                      async () => {
                        await saveDraft({
                          silent:
                            true,
                        });

                        clearCompose();
                      }
                    )();
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-inset hover:text-ink-900"
                  aria-label="Close compose"
                >
                  <IconArrowLeft
                    size={17}
                  />
                </button>

                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    New message
                  </p>

                  <p className="text-xs text-ink-400">
                    DueQuity internal mail
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      actionBusy
                    }
                    onClick={() => {
                      void trashDraft();
                    }}
                    className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-600 transition hover:bg-inset disabled:opacity-50"
                  >
                    Discard
                  </button>

                  <button
                    type="button"
                    disabled={
                      savingDraft ||
                      sending
                    }
                    onClick={() => {
                      void saveDraft();
                    }}
                    className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset disabled:opacity-50"
                  >
                    {savingDraft
                      ? "Saving..."
                      : "Save"}
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 sm:p-5">
                <div className="rounded-xl border border-line bg-inset p-3">
                  <div className="flex flex-wrap gap-2">
                    {composeRecipients.map(
                      (
                        recipient,
                      ) => {
                        const participant =
                          participantFor(
                            recipient.staffUserId,
                          );

                        if (
                          !participant
                        ) {
                          return null;
                        }

                        return (
                          <span
                            key={
                              recipient.staffUserId
                            }
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink-700"
                          >
                            <span className="font-semibold uppercase text-2xs text-ink-400">
                              {
                                recipient.recipientType
                              }
                            </span>

                            <span>
                              {
                                participant.name
                              }
                            </span>

                            <button
                              type="button"
                              onClick={() => {
                                removeRecipient(
                                  recipient.staffUserId,
                                );
                              }}
                              aria-label={`Remove ${participant.name}`}
                              className="text-ink-400 hover:text-critical-700"
                            >
                              <IconClose
                                size={12}
                              />
                            </button>
                          </span>
                        );
                      },
                    )}

                    {composeRecipients.length ===
                      0 && (
                      <p className="px-1 py-1 text-xs text-ink-400">
                        No recipients selected
                      </p>
                    )}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[90px_minmax(0,1fr)_auto]">
                    <select
                      value={
                        recipientTypeSelection
                      }
                      onChange={(
                        event,
                      ) => {
                        setRecipientTypeSelection(
                          event
                            .target
                            .value as RecipientType,
                        );
                      }}
                      className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink-800 outline-none focus:border-accent-400"
                    >
                      <option value="to">
                        To
                      </option>

                      <option value="cc">
                        CC
                      </option>

                      <option value="bcc">
                        BCC
                      </option>
                    </select>

                    <select
                      value={
                        recipientSelection
                      }
                      onChange={(
                        event,
                      ) => {
                        setRecipientSelection(
                          event
                            .target
                            .value,
                        );
                      }}
                      className="h-10 min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink-800 outline-none focus:border-accent-400"
                    >
                      <option value="">
                        Select DueQuity staff...
                      </option>

                      {directory
                        .filter(
                          (
                            participant,
                          ) =>
                            !composeRecipients.some(
                              (
                                recipient,
                              ) =>
                                recipient.staffUserId ===
                                participant.id,
                            ),
                        )
                        .map(
                          (
                            participant,
                          ) => (
                            <option
                              key={
                                participant.id
                              }
                              value={
                                participant.id
                              }
                            >
                              {participant.name} · {participant.title}
                            </option>
                          ),
                        )}
                    </select>

                    <button
                      type="button"
                      disabled={
                        !recipientSelection
                      }
                      onClick={
                        addRecipient
                      }
                      className="h-10 rounded-lg border border-line bg-white px-4 text-xs font-semibold text-ink-700 transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>

                  <p className="mt-2 text-2xs leading-relaxed text-ink-400">
                    Only active DueQuity staff accounts can receive internal mail. External addresses are not accepted.
                  </p>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="mail-subject"
                    className="text-xs font-semibold text-ink-600"
                  >
                    Subject
                  </label>

                  <input
                    id="mail-subject"
                    value={
                      composeSubject
                    }
                    onChange={(
                      event,
                    ) => {
                      setComposeSubject(
                        event
                          .target
                          .value,
                      );
                    }}
                    maxLength={
                      240
                    }
                    placeholder="Message subject"
                    className="mt-1.5 h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-inset px-3 py-2.5">
                  <label className="flex items-center gap-2 text-xs text-ink-600">
                    <span className="font-semibold">
                      Priority
                    </span>

                    <select
                      value={
                        composePriority
                      }
                      onChange={(
                        event,
                      ) => {
                        setComposePriority(
                          event
                            .target
                            .value as MailPriority,
                        );
                      }}
                      className="rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink-800 outline-none"
                    >
                      <option value="normal">
                        Normal
                      </option>

                      <option value="high">
                        High
                      </option>
                    </select>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-600">
                    <input
                      type="checkbox"
                      checked={
                        composeAcknowledgment
                      }
                      onChange={(
                        event,
                      ) => {
                        setComposeAcknowledgment(
                          event
                            .target
                            .checked,
                        );
                      }}
                      className="size-4 rounded border-line accent-ink-900"
                    />

                    Require acknowledgment
                  </label>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="mail-body"
                    className="sr-only"
                  >
                    Message
                  </label>

                  <textarea
                    id="mail-body"
                    value={
                      composeBody
                    }
                    onChange={(
                      event,
                    ) => {
                      setComposeBody(
                        event
                          .target
                          .value,
                      );
                    }}
                    rows={
                      13
                    }
                    placeholder="Write your message..."
                    className="min-h-[280px] w-full resize-y rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  />
                </div>

                <div className="mt-4 rounded-xl border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-ink-800">
                        Attachments
                      </p>

                      <p className="mt-0.5 text-2xs text-ink-400">
                        Excel, CSV, PDF, Word, TXT and approved images · 25 MB per file
                      </p>
                    </div>

                    <label
                      className={cn(
                        "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition",

                        uploading
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-inset",
                      )}
                    >
                      <IconUpload
                        size={15}
                      />

                      {uploading
                        ? "Uploading..."
                        : "Attach file"}

                      <input
                        type="file"
                        className="sr-only"
                        disabled={
                          uploading
                        }
                        accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"
                        onChange={(
                          event,
                        ) => {
                          const file =
                            event
                              .currentTarget
                              .files?.[0];

                          event.currentTarget.value =
                            "";

                          if (
                            file
                          ) {
                            void uploadAttachment(
                              file,
                            );
                          }
                        }}
                      />
                    </label>
                  </div>

                  {composeAttachments.length ===
                    0 ? (
                    <div className="px-3 py-4 text-xs text-ink-400">
                      No files attached.
                    </div>
                  ) : (
                    <ul className="divide-y divide-line-subtle">
                      {composeAttachments.map(
                        (
                          attachment,
                        ) => (
                          <li
                            key={
                              attachment.id
                            }
                            className="flex items-center gap-3 px-3 py-2.5"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-inset text-ink-500">
                              <IconDocument
                                size={15}
                              />
                            </span>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-ink-800">
                                {
                                  attachment.fileName
                                }
                              </p>

                              <p className="text-2xs text-ink-400">
                                {formatBytes(
                                  attachment.sizeBytes,
                                )}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={
                                uploading
                              }
                              onClick={() => {
                                void removeAttachment(
                                  attachment.id,
                                );
                              }}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-ink-400 transition hover:bg-critical-50 hover:text-critical-700 disabled:opacity-40"
                              aria-label={`Remove ${attachment.fileName}`}
                            >
                              <IconClose
                                size={15}
                              />
                            </button>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-sm sm:px-5">
                <button
                  type="button"
                  disabled={
                    sending ||
                    uploading
                  }
                  onClick={() => {
                    void sendMessage();
                  }}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconMail
                    size={16}
                  />

                  {sending
                    ? "Sending..."
                    : "Send"}
                </button>

                <span className="text-xs text-ink-400">
                  Sent only inside DueQuity
                </span>
              </div>
            </div>
          ) : selectedMessage ? (
            <div className="flex min-h-full flex-col">
              <div className="border-b border-line px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedMessage.priority ===
                        "high" && (
                        <span className="rounded-full bg-critical-50 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-critical-700">
                          High priority
                        </span>
                      )}

                      {selectedMessage
                        .acknowledgmentRequested && (
                        <span className="rounded-full bg-caution-50 px-2 py-1 text-2xs font-semibold text-caution-700">
                          Acknowledgment requested
                        </span>
                      )}
                    </div>

                    <h2 className="mt-2 break-words text-xl font-semibold text-ink-950">
                      {subjectLabel(
                        selectedMessage.subject,
                      )}
                    </h2>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {effectiveSelectedFolder ===
                      "trash" ? (
                      <>
                        <button
                          type="button"
                          disabled={
                            actionBusy
                          }
                          onClick={() => {
                            void messageAction(
                              "restore",
                            );
                          }}
                          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset disabled:opacity-50"
                        >
                          Restore
                        </button>

                        <button
                          type="button"
                          disabled={
                            actionBusy
                          }
                          onClick={() => {
                            void messageAction(
                              "trash",
                            );
                          }}
                          className="rounded-lg border border-critical-200 bg-critical-50 px-3 py-2 text-xs font-semibold text-critical-700 transition hover:bg-critical-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={
                            actionBusy
                          }
                          onClick={() => {
                            void messageAction(
                              "archive",
                            );
                          }}
                          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset disabled:opacity-50"
                        >
                          Archive
                        </button>

                        <button
                          type="button"
                          disabled={
                            actionBusy
                          }
                          onClick={() => {
                            void messageAction(
                              "trash",
                            );
                          }}
                          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-critical-50 hover:text-critical-700 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-line bg-inset px-3.5 py-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">
                      {selectedMessage.sender.name
                        .split(
                          /\s+/,
                        )
                        .filter(
                          Boolean,
                        )
                        .slice(
                          0,
                          2,
                        )
                        .map(
                          (
                            part,
                          ) =>
                            part[0]?.toUpperCase(),
                        )
                        .join(
                          "",
                        )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900">
                        {
                          selectedMessage.sender.name
                        }
                      </p>

                      <p className="mt-0.5 text-xs text-ink-500">
                        {selectedMessage.sender.title} · {selectedMessage.sender.email}
                      </p>

                      <p className="mt-2 text-xs text-ink-500">
                        <span className="font-semibold text-ink-600">
                          To:
                        </span>{" "}
                        {selectedMessage.recipients
                          .filter(
                            (
                              recipient,
                            ) =>
                              recipient.recipientType ===
                              "to",
                          )
                          .map(
                            (
                              recipient,
                            ) =>
                              recipient.participant.name,
                          )
                          .join(
                            ", ",
                          ) ||
                          "Not recorded"}
                      </p>

                      {selectedMessage.recipients.some(
                        (
                          recipient,
                        ) =>
                          recipient.recipientType ===
                          "cc",
                      ) && (
                        <p className="mt-1 text-xs text-ink-500">
                          <span className="font-semibold text-ink-600">
                            CC:
                          </span>{" "}
                          {selectedMessage.recipients
                            .filter(
                              (
                                recipient,
                              ) =>
                                recipient.recipientType ===
                                "cc",
                            )
                            .map(
                              (
                                recipient,
                              ) =>
                                recipient.participant.name,
                            )
                            .join(
                              ", ",
                            )}
                        </p>
                      )}

                      {selectedMessage.recipients.some(
                        (
                          recipient,
                        ) =>
                          recipient.recipientType ===
                          "bcc",
                      ) && (
                        <p className="mt-1 text-xs text-ink-500">
                          <span className="font-semibold text-ink-600">
                            BCC:
                          </span>{" "}
                          {selectedMessage.recipients
                            .filter(
                              (
                                recipient,
                              ) =>
                                recipient.recipientType ===
                                "bcc",
                            )
                            .map(
                              (
                                recipient,
                              ) =>
                                recipient.participant.name,
                            )
                            .join(
                              ", ",
                            )}
                        </p>
                      )}
                    </div>

                    <time className="shrink-0 text-right text-2xs text-ink-400">
                      {formatFullDateTime(
                        selectedMessage.sentAt,
                      )}
                    </time>
                  </div>
                </div>
              </div>

              <div className="flex-1 px-4 py-5 sm:px-6">
                <div className="whitespace-pre-wrap break-words text-sm leading-7 text-ink-800">
                  {selectedMessage.bodyText ||
                    "No message body."}
                </div>

                {selectedMessage.attachments.length >
                  0 && (
                  <div className="mt-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-400">
                      Attachments
                    </p>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {selectedMessage.attachments.map(
                        (
                          attachment,
                        ) => (
                          <button
                            key={
                              attachment.id
                            }
                            type="button"
                            onClick={() => {
                              void downloadAttachment(
                                selectedMessage.id,
                                attachment.id,
                              );
                            }}
                            className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3 text-left transition hover:border-ink-300 hover:bg-inset"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-inset text-ink-500">
                              <IconDocument
                                size={16}
                              />
                            </span>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-ink-800">
                                {
                                  attachment.fileName
                                }
                              </p>

                              <p className="mt-0.5 text-2xs text-ink-400">
                                {formatBytes(
                                  attachment.sizeBytes,
                                )} · Secure download
                              </p>
                            </div>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {selectedMessage
                  .acknowledgmentRequested &&
                  currentRecipient && (
                  <div className="mt-8 rounded-xl border border-caution-200 bg-caution-50 p-4">
                    {currentRecipient
                      .acknowledgedAt ? (
                      <>
                        <p className="flex items-center gap-2 text-sm font-semibold text-positive-800">
                          <IconCheck
                            size={16}
                          />

                          Receipt acknowledged
                        </p>

                        <p className="mt-1 text-xs text-ink-600">
                          Acknowledged{" "}
                          {formatFullDateTime(
                            currentRecipient.acknowledgedAt,
                          )}
                        </p>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-caution-900">
                            Acknowledgment requested
                          </p>

                          <p className="mt-1 text-xs text-caution-800">
                            The sender requested confirmation that you received this message.
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={
                            actionBusy ||
                            !mayAcknowledge
                          }
                          onClick={() => {
                            void messageAction(
                              "acknowledge",
                            );
                          }}
                          className="rounded-lg bg-ink-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:opacity-50"
                        >
                          Acknowledge receipt
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {effectiveSelectedFolder !==
                "trash" && (
                <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-sm sm:px-5">
                  <button
                    type="button"
                    onClick={() => {
                      void startReply(
                        "reply",
                      );
                    }}
                    className="rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset"
                  >
                    Reply
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void startReply(
                        "reply_all",
                      );
                    }}
                    className="rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset"
                  >
                    Reply all
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void startReply(
                        "forward",
                      );
                    }}
                    className="rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset"
                  >
                    Forward
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[520px] items-center justify-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-inset text-ink-400">
                  <IconMail
                    size={23}
                  />
                </span>

                <h2 className="mt-4 text-base font-semibold text-ink-800">
                  {searchMode
                    ? "Select a search result"
                    : "Select a message"}
                </h2>

                <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-500">
                  {searchMode
                    ? "Search covers your complete DueQuity Mail repository, including inbox, sent mail, drafts, archive, trash and attachments."
                    : "Open a message from the list or compose a new secure internal message to another DueQuity staff member."}
                </p>

                {!searchMode && (
                  <button
                    type="button"
                    onClick={() => {
                      void createDraft();
                    }}
                    className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-inset"
                  >
                    <IconPlus
                      size={15}
                    />

                    Compose message
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}