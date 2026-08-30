"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CLAIMANT_MESSAGE_SEARCH_EVENT,
  CLAIMANT_MESSAGE_SEARCH_RESET_EVENT,
} from "@/components/pro/claimant-message-header-search";

import {
  IconClose,
  IconDocument,
  IconMail,
  IconUpload,
} from "@/components/ui/icon";

import {
  cn,
} from "@/lib/cn";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type Folder =
  | "inbox"
  | "sent"
  | "attachments";

interface Counts {
  inboxTotal: number;
  inboxUnread: number;
  sentTotal: number;
  attachmentsTotal: number;
}

interface Entry {
  kind:
    | "message"
    | "attachment"
    | "claimant";

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

  subject?: string;

  bodyPreview?: string;

  sentAt?: string;

  unread?: boolean;

  attachmentCount?: number;

  attachmentId?: string;

  fileName?: string;

  mimeType?: string;

  sizeBytes?: number;
}

interface ThreadAttachment {
  id: string;

  messageId: string;

  fileName: string;

  mimeType: string;

  sizeBytes: number;

  createdAt: string;
}

interface ThreadMessage {
  id: string;

  threadId: string;

  replyToMessageId?: string;

  senderType:
    | "staff"
    | "claimant";

  senderName: string;

  subject: string;

  bodyText: string;

  sentAt: string;

  claimantReadAt?: string;

  staffReadAt?: string;

  attachments:
    ThreadAttachment[];
}

interface ThreadView {
  id: string;

  claimId: string;

  claimReference: string;

  claimantId: string;

  claimantReference: string;

  legalName: string;

  status:
    | "active"
    | "closed";

  lastMessageAt?: string;

  lastMessagePreview: string;

  unreadCount: number;

  messages:
    ThreadMessage[];
}

interface Payload {
  folder: Folder;

  entries: Entry[];

  counts: Counts;

  query?: string;

  thread?: ThreadView;

  error?: string;
}

interface DownloadPayload {
  url: string;

  fileName: string;

  error?: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

const EMPTY_COUNTS: Counts = {
  inboxTotal:
    0,

  inboxUnread:
    0,

  sentTotal:
    0,

  attachmentsTotal:
    0,
};

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

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
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
    number | undefined,
): string {
  if (
    value ===
    undefined
  ) {
    return "";
  }

  if (
    value <
    1024
  ) {
    return `${value} B`;
  }

  if (
    value <
    1024 *
      1024
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

async function readJson<
  T extends {
    error?: string;
  },
>(
  response:
    Response,
): Promise<T> {
  const payload =
    await response.json() as
      T;

  if (
    !response.ok
  ) {
    throw new Error(
      payload.error ||
      `Request failed with status ${response.status}.`,
    );
  }

  return payload;
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimantMessageMailboxClient({
  initialEntries,
  initialCounts,
}: {
  initialEntries:
    Entry[];

  initialCounts:
    Counts;
}) {
  const composerRef =
    useRef<HTMLDivElement>(
      null,
    );

  const messageInputRef =
    useRef<HTMLTextAreaElement>(
      null,
    );

  const [
    folder,
    setFolder,
  ] =
    useState<Folder>(
      "inbox",
    );

  const [
    entries,
    setEntries,
  ] =
    useState<Entry[]>(
      initialEntries,
    );

  const [
    counts,
    setCounts,
  ] =
    useState<Counts>(
      initialCounts ??
      EMPTY_COUNTS,
    );

  const [
    thread,
    setThread,
  ] =
    useState<
      ThreadView | undefined
    >();

  const [
    selectedClaimant,
    setSelectedClaimant,
  ] =
    useState<
      Entry | undefined
    >();

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
    loading,
    setLoading,
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
    error,
    setError,
  ] =
    useState(
      "",
    );

  const [
    composeOpen,
    setComposeOpen,
  ] =
    useState(
      false,
    );

  const [
    messageSent,
    setMessageSent,
  ] =
    useState(
      false,
    );

  const [
    subject,
    setSubject,
  ] =
    useState(
      "",
    );

  const [
    bodyText,
    setBodyText,
  ] =
    useState(
      "",
    );

  const [
    files,
    setFiles,
  ] =
    useState<File[]>(
      [],
    );

  const [
    replyToMessageId,
    setReplyToMessageId,
  ] =
    useState<
      string | undefined
    >();

  /* ======================================================================== */
  /* Search reset                                                             */
  /* ======================================================================== */

  const resetHeaderSearch =
    useCallback(
      () => {
        window.dispatchEvent(
          new Event(
            CLAIMANT_MESSAGE_SEARCH_RESET_EVENT,
          ),
        );
      },
      [],
    );

  /* ======================================================================== */
  /* Composer                                                                 */
  /* ======================================================================== */

  function resetComposer() {
    setSubject(
      "",
    );

    setBodyText(
      "",
    );

    setFiles(
      [],
    );

    setReplyToMessageId(
      undefined,
    );
  }

  function revealComposer() {
    window.requestAnimationFrame(
      () => {
        composerRef.current
          ?.scrollIntoView({
            behavior:
              "smooth",

            block:
              "nearest",
          });

        window.setTimeout(
          () => {
            messageInputRef.current
              ?.focus();
          },
          180,
        );
      },
    );
  }

  /* ======================================================================== */
  /* Folder loading                                                           */
  /* ======================================================================== */

  const loadFolder =
    useCallback(
      async (
        nextFolder:
          Folder,
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
              `/api/pro/claimants/messages?folder=${encodeURIComponent(
                nextFolder,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const payload =
            await readJson<Payload>(
              response,
            );

          setFolder(
            nextFolder,
          );

          setEntries(
            payload.entries,
          );

          setCounts(
            payload.counts,
          );

          setThread(
            undefined,
          );

          setSelectedClaimant(
            undefined,
          );

          setSearchMode(
            false,
          );

          setSearchQuery(
            "",
          );

          setComposeOpen(
            false,
          );

          setMessageSent(
            false,
          );

          resetComposer();
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load claimant messages.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  /* ======================================================================== */
  /* Search                                                                   */
  /* ======================================================================== */

  const runSearch =
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
          await loadFolder(
            folder,
          );

          return;
        }

        setLoading(
          true,
        );

        setError(
          "",
        );

        try {
          const response =
            await fetch(
              `/api/pro/claimants/messages?q=${encodeURIComponent(
                query,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const payload =
            await readJson<Payload>(
              response,
            );

          setEntries(
            payload.entries,
          );

          setCounts(
            payload.counts,
          );

          setSearchMode(
            true,
          );

          setSearchQuery(
            payload.query ??
            query,
          );

          setThread(
            undefined,
          );

          setSelectedClaimant(
            undefined,
          );

          setComposeOpen(
            false,
          );

          setMessageSent(
            false,
          );

          resetComposer();
        } catch (
          searchError
        ) {
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Unable to search claimant messages.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        folder,
        loadFolder,
      ],
    );

  useEffect(
    () => {
      function handleSearch(
        event:
          Event,
      ) {
        const customEvent =
          event as CustomEvent<{
            query?:
              unknown;
          }>;

        const query =
          typeof customEvent.detail
            ?.query ===
            "string"
            ? customEvent.detail.query
            : "";

        void runSearch(
          query,
        );
      }

      window.addEventListener(
        CLAIMANT_MESSAGE_SEARCH_EVENT,
        handleSearch,
      );

      return () => {
        window.removeEventListener(
          CLAIMANT_MESSAGE_SEARCH_EVENT,
          handleSearch,
        );
      };
    },
    [
      runSearch,
    ],
  );

  /* ======================================================================== */
  /* Open entry                                                               */
  /* ======================================================================== */

  async function openEntry(
    entry:
      Entry,
  ) {
    setError(
      "",
    );

    setComposeOpen(
      false,
    );

    setMessageSent(
      false,
    );

    resetComposer();

    if (
      !entry.threadId
    ) {
      setThread(
        undefined,
      );

      setSelectedClaimant(
        entry,
      );

      return;
    }

    setLoading(
      true,
    );

    try {
      const parameters =
        new URLSearchParams();

      if (
        searchMode &&
        searchQuery
      ) {
        parameters.set(
          "q",
          searchQuery,
        );
      } else {
        parameters.set(
          "folder",
          folder,
        );
      }

      parameters.set(
        "threadId",
        entry.threadId,
      );

      parameters.set(
        "claimantId",
        entry.claimantId,
      );

      const response =
        await fetch(
          `/api/pro/claimants/messages?${parameters.toString()}`,
          {
            cache:
              "no-store",
          },
        );

      const payload =
        await readJson<Payload>(
          response,
        );

      setEntries(
        payload.entries,
      );

      setCounts(
        payload.counts,
      );

      setThread(
        payload.thread,
      );

      setSelectedClaimant(
        entry,
      );
    } catch (
      openError
    ) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Unable to open claimant conversation.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  /* ======================================================================== */
  /* Active claimant                                                          */
  /* ======================================================================== */

  const activeClaimantId =
    thread?.claimantId ??
    selectedClaimant
      ?.claimantId;

  const activeClaimantReference =
    thread?.claimantReference ??
    selectedClaimant
      ?.claimantReference;

  const activeLegalName =
    thread?.legalName ??
    selectedClaimant
      ?.legalName;

  const activeClaimReference =
    thread?.claimReference ??
    selectedClaimant
      ?.claimReference;

  /* ======================================================================== */
  /* New message                                                              */
  /* ======================================================================== */

  function startNewMessage() {
    if (
      !activeClaimantId
    ) {
      setError(
        "Select an assigned claimant before creating a new message.",
      );

      return;
    }

    resetComposer();

    setMessageSent(
      false,
    );

    setComposeOpen(
      true,
    );

    setError(
      "",
    );

    revealComposer();
  }

  /* ======================================================================== */
  /* Reply                                                                    */
  /* ======================================================================== */

  function startReply(
    message:
      ThreadMessage,
  ) {
    const originalSubject =
      message.subject ===
        "(No subject)"
        ? "DueQuity message"
        : message.subject;

    const replySubject =
      originalSubject
        .toLowerCase()
        .startsWith(
          "re:",
        )
        ? originalSubject
        : `Re: ${originalSubject}`;

    setReplyToMessageId(
      message.id,
    );

    setSubject(
      replySubject,
    );

    setBodyText(
      "",
    );

    setFiles(
      [],
    );

    setMessageSent(
      false,
    );

    setComposeOpen(
      true,
    );

    setError(
      "",
    );

    revealComposer();
  }

  function closeComposer() {
    if (
      sending
    ) {
      return;
    }

    setComposeOpen(
      false,
    );

    resetComposer();
  }

  const selectedReply =
    thread?.messages.find(
      (
        message,
      ) =>
        message.id ===
        replyToMessageId,
    );

  /* ======================================================================== */
  /* Send                                                                     */
  /* ======================================================================== */

  const maySend =
    Boolean(
      activeClaimantId,
    ) &&
    subject.trim().length >
      0 &&
    bodyText.trim().length >
      0 &&
    !sending;

  async function sendMessage() {
    if (
      !activeClaimantId ||
      !maySend
    ) {
      return;
    }

    setSending(
      true,
    );

    setError(
      "",
    );

    try {
      const formData =
        new FormData();

      formData.set(
        "claimantId",
        activeClaimantId,
      );

      formData.set(
        "subject",
        subject,
      );

      formData.set(
        "bodyText",
        bodyText,
      );

      if (
        replyToMessageId
      ) {
        formData.set(
          "replyToMessageId",
          replyToMessageId,
        );
      }

      for (
        const file of
          files
      ) {
        formData.append(
          "files",
          file,
        );
      }

      const response =
        await fetch(
          "/api/pro/claimants/messages",
          {
            method:
              "POST",

            body:
              formData,
          },
        );

      const payload =
        await readJson<Payload>(
          response,
        );

      if (
        payload.thread
      ) {
        setThread(
          payload.thread,
        );
      }

      setCounts(
        payload.counts,
      );

      resetComposer();

      setComposeOpen(
        false,
      );

      setMessageSent(
        true,
      );

      const refreshed =
        await fetch(
          `/api/pro/claimants/messages?folder=${encodeURIComponent(
            folder,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const refreshedPayload =
        await readJson<Payload>(
          refreshed,
        );

      setEntries(
        refreshedPayload.entries,
      );

      setCounts(
        refreshedPayload.counts,
      );
    } catch (
      sendError
    ) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send claimant message.",
      );
    } finally {
      setSending(
        false,
      );
    }
  }

  /* ======================================================================== */
  /* Download                                                                 */
  /* ======================================================================== */

  async function downloadAttachment(
    attachmentId:
      string,
  ) {
    setError(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/pro/claimants/messages/attachments/${encodeURIComponent(
            attachmentId,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const payload =
        await readJson<DownloadPayload>(
          response,
        );

      const anchor =
        document.createElement(
          "a",
        );

      anchor.href =
        payload.url;

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
  /* Render                                                                   */
  /* ======================================================================== */

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
      {error && (
        <div
          role="alert"
          className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-critical-200 bg-critical-50 px-3 py-2.5 text-sm text-critical-800"
        >
          <p className="flex-1">
            {
              error
            }
          </p>

          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => {
              setError(
                "",
              );
            }}
          >
            <IconClose
              size={15}
            />
          </button>
        </div>
      )}

      <div className="grid min-h-[700px] lg:grid-cols-[190px_390px_minmax(0,1fr)]">
        {/* ============================================================= folders */}
        <aside className="border-b border-line bg-inset lg:border-b-0 lg:border-r">
          <div className="border-b border-line px-4 py-4">
            <p className="text-sm font-semibold text-ink-900">
              Claimant Messages
            </p>

            <p className="mt-0.5 text-xs text-ink-500">
              Secure claimant communication
            </p>
          </div>

          <div className="p-3 pb-0">
            <button
              type="button"
              disabled={
                !activeClaimantId
              }
              onClick={
                startNewMessage
              }
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500"
            >
              <span aria-hidden="true">
                +
              </span>

              New Message
            </button>
          </div>

          <nav className="space-y-1 p-3">
            <button
              type="button"
              onClick={() => {
                resetHeaderSearch();

                void loadFolder(
                  "inbox",
                );
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",

                !searchMode &&
                folder ===
                  "inbox"
                  ? "bg-white text-ink-950 shadow-sm"
                  : "text-ink-600 hover:bg-white/70",
              )}
            >
              <IconMail
                size={15}
              />

              <span className="flex-1 text-left">
                Inbox
              </span>

              {counts.inboxUnread >
                0 && (
                <span className="rounded-full bg-accent-700 px-2 py-0.5 text-2xs font-semibold text-white">
                  {
                    counts.inboxUnread
                  }
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                resetHeaderSearch();

                void loadFolder(
                  "sent",
                );
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",

                !searchMode &&
                folder ===
                  "sent"
                  ? "bg-white text-ink-950 shadow-sm"
                  : "text-ink-600 hover:bg-white/70",
              )}
            >
              <IconMail
                size={15}
              />

              <span className="flex-1 text-left">
                Sent
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetHeaderSearch();

                void loadFolder(
                  "attachments",
                );
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",

                !searchMode &&
                folder ===
                  "attachments"
                  ? "bg-white text-ink-950 shadow-sm"
                  : "text-ink-600 hover:bg-white/70",
              )}
            >
              <IconDocument
                size={15}
              />

              <span className="flex-1 text-left">
                Attachments
              </span>
            </button>
          </nav>

          <div className="border-t border-line px-4 py-4">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">
              Claimant-facing only
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Internal staff discussion remains in DueQuity Mail.
            </p>
          </div>
        </aside>

        {/* ================================================================ list */}
        <section className="border-b border-line lg:border-b-0 lg:border-r">
          <div className="min-h-[67px] border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">
              {searchMode
                ? "Search results"
                : folder ===
                    "inbox"
                  ? "Inbox"
                  : folder ===
                      "sent"
                    ? "Sent"
                    : "Attachments"}
            </p>

            <p className="mt-0.5 text-xs text-ink-400">
              {folder ===
                "inbox"
                ? `${counts.inboxTotal} messages, ${counts.inboxUnread} unread`
                : folder ===
                    "sent"
                  ? `${counts.sentTotal} sent messages`
                  : `${counts.attachmentsTotal} attachments`}
            </p>
          </div>

          <div className="max-h-[630px] overflow-y-auto">
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-ink-500">
                Loading...
              </div>
            ) : entries.length ===
              0 ? (
              <div className="px-5 py-12 text-center text-sm text-ink-500">
                No claimant messages
              </div>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {entries.map(
                  (
                    entry,
                  ) => (
                    <li
                      key={`${entry.kind}-${entry.id}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void openEntry(
                            entry,
                          );
                        }}
                        className="w-full px-4 py-3.5 text-left hover:bg-inset"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",

                              entry.unread
                                ? "bg-accent-600"
                                : "bg-transparent",
                            )}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-ink-700">
                                {
                                  entry.claimantReference
                                }
                              </p>

                              <span className="text-2xs text-ink-400">
                                {formatDateTime(
                                  entry.sentAt,
                                )}
                              </span>
                            </div>

                            <p className="mt-1 truncate text-sm font-medium text-ink-900">
                              {
                                entry.legalName
                              }
                            </p>

                            <p className="mt-0.5 truncate text-xs font-semibold text-ink-700">
                              {
                                entry.subject ??
                                "(No subject)"
                              }
                            </p>

                            <p className="mt-0.5 truncate text-xs text-ink-500">
                              {entry.kind ===
                              "attachment"
                                ? entry.fileName
                                : entry.bodyPreview}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </section>

        {/* =============================================================== detail */}
        <section className="flex min-w-0 flex-col bg-white">
          {activeClaimantReference ? (
            <>
              <div className="border-b border-line px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                      Claimant ID
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-sm font-semibold text-white">
                        {
                          activeClaimantReference
                        }
                      </span>

                      <span className="text-sm font-semibold text-ink-900">
                        {
                          activeLegalName
                        }
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-ink-500">
                      Recovery{" "}
                      {
                        activeClaimReference
                      }
                    </p>
                  </div>

                  {!composeOpen &&
                    !messageSent && (
                    <button
                      type="button"
                      onClick={
                        startNewMessage
                      }
                      className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-inset"
                    >
                      + New Message
                    </button>
                  )}
                </div>
              </div>

              {/* ========================================================= */}
              {/* Success screen                                            */}
              {/* ========================================================= */}

              {messageSent ? (
                <div className="flex flex-1 items-center justify-center px-6 py-16">
                  <div className="w-full max-w-md rounded-xl border border-positive-200 bg-positive-50 px-6 py-7 text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-positive-100 text-xl font-semibold text-positive-800">
                      ✓
                    </div>

                    <h2 className="mt-4 text-xl font-semibold text-ink-950">
                      Message sent
                    </h2>

                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      Your secure message was successfully sent to{" "}
                      <strong>
                        {
                          activeLegalName
                        }
                      </strong>
                      .
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setMessageSent(
                          false,
                        );
                      }}
                      className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-ink-950 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-800"
                    >
                      Back to conversation
                    </button>
                  </div>
                </div>
              ) : composeOpen ? (
                /* ======================================================= */
                /* Composer                                                */
                /* ======================================================= */

                <div
                  ref={
                    composerRef
                  }
                  className="flex-1 overflow-y-auto bg-paper px-4 py-5 sm:px-6"
                >
                  <div className="mx-auto max-w-3xl rounded-xl border border-line bg-white shadow-sm">
                    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="eyebrow text-ink-500">
                          Secure claimant message
                        </p>

                        <h2 className="mt-1 text-base font-semibold text-ink-950">
                          {replyToMessageId
                            ? "Reply to claimant"
                            : "New Message"}
                        </h2>
                      </div>

                      <button
                        type="button"
                        disabled={
                          sending
                        }
                        aria-label="Close message composer"
                        onClick={
                          closeComposer
                        }
                        className="inline-flex size-8 items-center justify-center rounded-md text-ink-400 hover:bg-inset hover:text-ink-900"
                      >
                        <IconClose
                          size={16}
                        />
                      </button>
                    </div>

                    <div className="space-y-4 p-4">
                      {selectedReply && (
                        <div className="rounded-lg border border-line bg-inset px-3 py-2.5">
                          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                            Replying to
                          </p>

                          <p className="mt-1 line-clamp-2 text-xs text-ink-600">
                            {
                              selectedReply.bodyText
                            }
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                          To
                        </label>

                        <input
                          type="text"
                          readOnly
                          value={`${activeLegalName ?? "Claimant"} • ${activeClaimantReference}`}
                          className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-line bg-inset px-3 py-2.5 text-sm font-medium text-ink-700"
                        />
                      </div>

                      <div>
                        <label className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                          Subject
                        </label>

                        <input
                          type="text"
                          required
                          maxLength={
                            200
                          }
                          value={
                            subject
                          }
                          onChange={(
                            event,
                          ) => {
                            setSubject(
                              event.target.value,
                            );
                          }}
                          placeholder="Enter message subject"
                          className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                      </div>

                      <div>
                        <label className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                          Message
                        </label>

                        <textarea
                          ref={
                            messageInputRef
                          }
                          required
                          rows={
                            7
                          }
                          maxLength={
                            10_000
                          }
                          value={
                            bodyText
                          }
                          onChange={(
                            event,
                          ) => {
                            setBodyText(
                              event.target.value,
                            );
                          }}
                          placeholder={`Write a secure message to ${activeLegalName ?? activeClaimantReference}...`}
                          className="mt-1.5 w-full resize-y rounded-lg border border-line bg-white px-3 py-3 text-sm leading-relaxed text-ink-900 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                        />
                      </div>

                      {files.length >
                        0 && (
                        <div className="flex flex-wrap gap-2">
                          {files.map(
                            (
                              file,
                              index,
                            ) => (
                              <span
                                key={`${file.name}-${index}`}
                                className="inline-flex items-center gap-2 rounded-full border border-line bg-inset px-3 py-1.5 text-xs text-ink-700"
                              >
                                <IconDocument
                                  size={13}
                                />

                                <span className="max-w-52 truncate">
                                  {
                                    file.name
                                  }
                                </span>

                                <button
                                  type="button"
                                  aria-label={`Remove ${file.name}`}
                                  onClick={() => {
                                    setFiles(
                                      (
                                        current,
                                      ) =>
                                        current.filter(
                                          (
                                            _,
                                            currentIndex,
                                          ) =>
                                            currentIndex !==
                                            index,
                                        ),
                                    );
                                  }}
                                >
                                  <IconClose
                                    size={12}
                                  />
                                </button>
                              </span>
                            ),
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-inset">
                          <IconUpload
                            size={15}
                          />

                          Attach

                          <input
                            type="file"
                            multiple
                            className="sr-only"
                            accept=".pdf,.docx,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp"
                            onChange={(
                              event,
                            ) => {
                              const selected =
                                Array.from(
                                  event.currentTarget
                                    .files ??
                                  [],
                                );

                              event.currentTarget.value =
                                "";

                              setFiles(
                                (
                                  current,
                                ) =>
                                  [
                                    ...current,
                                    ...selected,
                                  ].slice(
                                    0,
                                    5,
                                  ),
                              );
                            }}
                          />
                        </label>

                        <p className="min-w-0 flex-1 text-2xs text-ink-400">
                          Secure claimant-facing attachments only.
                        </p>

                        <button
                          type="button"
                          disabled={
                            !maySend
                          }
                          aria-disabled={
                            !maySend
                          }
                          aria-busy={
                            sending
                          }
                          onClick={() => {
                            void sendMessage();
                          }}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent-700 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500"
                        >
                          <IconMail
                            size={15}
                          />

                          {sending
                            ? "Sending..."
                            : "Send Message"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ======================================================= */
                /* Conversation                                            */
                /* ======================================================= */

                <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                  {thread ? (
                    <div className="space-y-4">
                      {thread.messages.map(
                        (
                          message,
                        ) => {
                          const mine =
                            message.senderType ===
                            "staff";

                          return (
                            <div
                              key={
                                message.id
                              }
                              className={cn(
                                "flex",

                                mine
                                  ? "justify-end"
                                  : "justify-start",
                              )}
                            >
                              <div className="max-w-[80%]">
                                <div className="mb-1 flex gap-2 px-1 text-2xs font-semibold text-ink-500">
                                  <span>
                                    {mine
                                      ? message.senderName
                                      : `${thread.claimantReference} claimant`}
                                  </span>

                                  <span>
                                    •
                                  </span>

                                  <span>
                                    {
                                      message.subject
                                    }
                                  </span>
                                </div>

                                <div
                                  className={cn(
                                    "rounded-2xl px-4 py-3 text-sm leading-relaxed",

                                    mine
                                      ? "rounded-br-md bg-ink-950 text-white"
                                      : "rounded-bl-md border border-line bg-inset text-ink-800",
                                  )}
                                >
                                  <p className="whitespace-pre-wrap break-words">
                                    {
                                      message.bodyText
                                    }
                                  </p>

                                  {message.attachments.length >
                                    0 && (
                                    <div className="mt-3 space-y-2">
                                      {message.attachments.map(
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
                                                attachment.id,
                                              );
                                            }}
                                            className={cn(
                                              "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left",

                                              mine
                                                ? "border-ink-700 bg-ink-900"
                                                : "border-line bg-white",
                                            )}
                                          >
                                            <IconDocument
                                              size={14}
                                            />

                                            <span className="min-w-0 flex-1 truncate text-xs">
                                              {
                                                attachment.fileName
                                              }
                                            </span>

                                            <span className="text-2xs opacity-70">
                                              {formatBytes(
                                                attachment.sizeBytes,
                                              )}
                                            </span>
                                          </button>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="mt-1 flex gap-3 px-1">
                                  <span className="text-2xs text-ink-400">
                                    {formatDateTime(
                                      message.sentAt,
                                    )}
                                  </span>

                                  {!mine && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        startReply(
                                          message,
                                        );
                                      }}
                                      className="text-2xs font-semibold text-ink-500 hover:text-ink-900"
                                    >
                                      Reply
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <div className="flex min-h-[420px] items-center justify-center text-center">
                      <div>
                        <IconMail
                          size={25}
                          className="mx-auto text-ink-400"
                        />

                        <h2 className="mt-3 text-base font-semibold text-ink-800">
                          No conversation yet
                        </h2>

                        <p className="mt-1 text-sm text-ink-500">
                          Use New Message to contact this claimant securely.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-[520px] items-center justify-center px-6 text-center">
              <div>
                <IconMail
                  size={26}
                  className="mx-auto text-ink-400"
                />

                <h2 className="mt-4 text-base font-semibold text-ink-800">
                  Select a claimant
                </h2>

                <p className="mt-1 text-sm text-ink-500">
                  Open an assigned claimant conversation to send or reply securely.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}