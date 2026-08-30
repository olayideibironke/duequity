"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  IconClose,
  IconDocument,
  IconMail,
  IconUpload,
} from "@/components/ui/icon";

import {
  cn,
} from "@/lib/cn";

import type {
  ClaimantMailboxMessage,
  ClaimantPortalMailboxState,
} from "@/server/claimant-portal-mailbox-service";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type MailboxFolder =
  | "inbox"
  | "sent"
  | "attachments";

interface MailboxPayload
  extends ClaimantPortalMailboxState {
  error?:
    string;
}

interface DownloadPayload {
  url:
    string;

  fileName:
    string;

  error?:
    string;
}

interface ClaimantPortalMailboxProps {
  initialState:
    ClaimantPortalMailboxState;

  apiEndpoint:
    string;

  attachmentEndpoint:
    string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

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

function messagePreview(
  message:
    ClaimantMailboxMessage,
): string {
  const body =
    message.bodyText
      .trim()
      .replace(
        /\s+/g,
        " ",
      );

  if (
    body
  ) {
    return body.slice(
      0,
      100,
    );
  }

  if (
    message.attachments.length >
      0
  ) {
    return message.attachments[0]
      .fileName;
  }

  return "Secure DueQuity message";
}

async function readJson<
  T extends {
    error?:
      string;
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

export function ClaimantPortalMailbox({
  initialState,
  apiEndpoint,
  attachmentEndpoint,
}: ClaimantPortalMailboxProps) {
  const [
    mailbox,
    setMailbox,
  ] =
    useState(
      initialState,
    );

  const [
    folder,
    setFolder,
  ] =
    useState<MailboxFolder>(
      "inbox",
    );

  const [
    selectedMessageId,
    setSelectedMessageId,
  ] =
    useState<
      string | undefined
    >();

  const [
    composeOpen,
    setComposeOpen,
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
    useState<
      File[]
    >(
      [],
    );

  const [
    replyToMessageId,
    setReplyToMessageId,
  ] =
    useState<
      string | undefined
    >();

  const [
    sending,
    setSending,
  ] =
    useState(
      false,
    );

  const [
    loading,
    setLoading,
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
    sentNotice,
    setSentNotice,
  ] =
    useState(
      "",
    );

  /* ======================================================================== */
  /* Unread state                                                             */
  /* ======================================================================== */

  /*
   * Toolbar badges represent ATTENTION, not folder totals.
   *
   * Only unread incoming messages receive a badge.
   *
   * Sent-message and attachment totals remain available inside their folders
   * but are deliberately not rendered as notification badges.
   */
  const unreadInboxCount =
    useMemo(
      () =>
        mailbox.messages.filter(
          (
            message,
          ) =>
            message.senderType ===
              "staff" &&
            !message.claimantReadAt,
        ).length,
      [
        mailbox.messages,
      ],
    );

  /* ======================================================================== */
  /* Folder data                                                              */
  /* ======================================================================== */

  const visibleMessages =
    useMemo(
      () => {
        const filtered =
          mailbox.messages.filter(
            (
              message,
            ) => {
              if (
                folder ===
                  "inbox"
              ) {
                return (
                  message.senderType ===
                  "staff"
                );
              }

              if (
                folder ===
                  "sent"
              ) {
                return (
                  message.senderType ===
                  "claimant"
                );
              }

              return (
                message.attachments.length >
                0
              );
            },
          );

        return filtered
          .slice()
          .sort(
            (
              left,
              right,
            ) =>
              new Date(
                right.sentAt,
              ).getTime() -
              new Date(
                left.sentAt,
              ).getTime(),
          );
      },
      [
        folder,
        mailbox.messages,
      ],
    );

  useEffect(
    () => {
      if (
        selectedMessageId &&
        visibleMessages.some(
          (
            message,
          ) =>
            message.id ===
            selectedMessageId,
        )
      ) {
        return;
      }

      setSelectedMessageId(
        visibleMessages[0]?.id,
      );
    },
    [
      selectedMessageId,
      visibleMessages,
    ],
  );

  const selectedMessage =
    mailbox.messages.find(
      (
        message,
      ) =>
        message.id ===
        selectedMessageId,
    );

  /* ======================================================================== */
  /* Compose                                                                  */
  /* ======================================================================== */

  function openNewMessage() {
    setComposeOpen(
      true,
    );

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

    setError(
      "",
    );

    setSentNotice(
      "",
    );
  }

  function closeCompose() {
    if (
      sending
    ) {
      return;
    }

    setComposeOpen(
      false,
    );

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

  function beginReply(
    message:
      ClaimantMailboxMessage,
  ) {
    const currentSubject =
      message.subject ===
        "(No subject)"
        ? "DueQuity message"
        : message.subject;

    const replySubject =
      currentSubject
        .toLowerCase()
        .startsWith(
          "re:",
        )
        ? currentSubject
        : `Re: ${currentSubject}`;

    setSubject(
      replySubject,
    );

    setBodyText(
      "",
    );

    setFiles(
      [],
    );

    setReplyToMessageId(
      message.id,
    );

    setComposeOpen(
      true,
    );

    setError(
      "",
    );

    setSentNotice(
      "",
    );
  }

  const maySend =
    subject.trim().length >
      0 &&
    bodyText.trim().length >
      0 &&
    !sending;

  async function sendMessage() {
    if (
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

    setSentNotice(
      "",
    );

    try {
      const formData =
        new FormData();

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
          apiEndpoint,
          {
            method:
              "POST",

            body:
              formData,
          },
        );

      const payload =
        await readJson<MailboxPayload>(
          response,
        );

      setMailbox(
        payload,
      );

      const sentMessages =
        payload.messages.filter(
          (
            message,
          ) =>
            message.senderType ===
            "claimant",
        );

      const latestSent =
        sentMessages[
          sentMessages.length -
            1
        ];

      setFolder(
        "sent",
      );

      setSelectedMessageId(
        latestSent?.id,
      );

      setComposeOpen(
        false,
      );

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

      setSentNotice(
        `✓ Message sent securely to ${payload.recipient.name}.`,
      );
    } catch (
      sendError
    ) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send secure message.",
      );
    } finally {
      setSending(
        false,
      );
    }
  }

  /* ======================================================================== */
  /* Refresh                                                                  */
  /* ======================================================================== */

  async function refreshMailbox() {
    if (
      loading
    ) {
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
          apiEndpoint,
          {
            cache:
              "no-store",
          },
        );

      const payload =
        await readJson<MailboxPayload>(
          response,
        );

      setMailbox(
        payload,
      );
    } catch (
      refreshError
    ) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh secure messages.",
      );
    } finally {
      setLoading(
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
          `${attachmentEndpoint}/${encodeURIComponent(
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
    <div className="space-y-4">
      {/* =============================================================== toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setFolder(
                "inbox",
              );
            }}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",

              folder ===
                "inbox"
                ? "bg-ink-950 text-white"
                : "text-ink-600 hover:bg-inset hover:text-ink-950",
            )}
          >
            <IconMail
              size={15}
            />

            Inbox

            {unreadInboxCount >
              0 && (
              <span
                aria-label={`${unreadInboxCount} unread message${
                  unreadInboxCount ===
                  1
                    ? ""
                    : "s"
                }`}
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-2xs font-semibold",

                  folder ===
                    "inbox"
                    ? "bg-white text-ink-950"
                    : "bg-accent-700 text-white",
                )}
              >
                {
                  unreadInboxCount
                }
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setFolder(
                "sent",
              );
            }}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",

              folder ===
                "sent"
                ? "bg-ink-950 text-white"
                : "text-ink-600 hover:bg-inset hover:text-ink-950",
            )}
          >
            <IconMail
              size={15}
            />

            Sent
          </button>

          <button
            type="button"
            onClick={() => {
              setFolder(
                "attachments",
              );
            }}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",

              folder ===
                "attachments"
                ? "bg-ink-950 text-white"
                : "text-ink-600 hover:bg-inset hover:text-ink-950",
            )}
          >
            <IconDocument
              size={15}
            />

            Attachments
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={
              loading
            }
            onClick={() => {
              void refreshMailbox();
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-600 transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Refreshing..."
              : "Refresh"}
          </button>

          <button
            type="button"
            onClick={
              openNewMessage
            }
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-800"
          >
            <span
              aria-hidden="true"
              className="text-base leading-none"
            >
              +
            </span>

            New Message
          </button>
        </div>
      </div>

      {/* =============================================================== notices */}
      {sentNotice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-positive-200 bg-positive-50 px-4 py-3 text-sm text-positive-900"
        >
          <p className="flex-1 font-medium">
            {
              sentNotice
            }
          </p>

          <button
            type="button"
            aria-label="Dismiss message sent confirmation"
            onClick={() => {
              setSentNotice(
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

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-critical-200 bg-critical-50 px-4 py-3 text-sm text-critical-900"
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

      {/* =============================================================== composer */}
      {composeOpen && (
        <section className="rounded-xl border border-line bg-paper shadow-sm">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-ink-500">
                Secure claimant message
              </p>

              <h2 className="mt-1 text-lg font-semibold text-ink-950">
                {replyToMessageId
                  ? "Reply to DueQuity"
                  : "New Message"}
              </h2>
            </div>

            <button
              type="button"
              disabled={
                sending
              }
              onClick={
                closeCompose
              }
              aria-label="Close new message"
              className="inline-flex size-9 items-center justify-center rounded-lg text-ink-400 transition hover:bg-inset hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconClose
                size={17}
              />
            </button>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <label
                htmlFor="claimant-message-to"
                className="text-xs font-semibold uppercase tracking-wide text-ink-500"
              >
                To
              </label>

              <input
                id="claimant-message-to"
                type="text"
                readOnly
                aria-readonly="true"
                value={`${mailbox.recipient.name} • ${mailbox.recipient.title}`}
                className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-line bg-inset px-3 py-2.5 text-sm font-medium text-ink-700 outline-none"
              />

              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Your authorized DueQuity contact is assigned automatically.
                This recipient cannot be changed from the claimant portal.
              </p>
            </div>

            <div>
              <label
                htmlFor="claimant-message-subject"
                className="text-xs font-semibold uppercase tracking-wide text-ink-500"
              >
                Subject
              </label>

              <input
                id="claimant-message-subject"
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
                className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-100 sm:text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="claimant-message-body"
                className="text-xs font-semibold uppercase tracking-wide text-ink-500"
              >
                Message
              </label>

              <textarea
                id="claimant-message-body"
                required
                maxLength={
                  10_000
                }
                rows={
                  7
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
                placeholder="Write your secure message to DueQuity..."
                className="mt-1.5 w-full resize-y rounded-lg border border-line bg-white px-3 py-3 text-base leading-relaxed text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-100 sm:text-sm"
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
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-inset px-3 py-1.5 text-xs text-ink-700"
                    >
                      <IconDocument
                        size={13}
                      />

                      <span className="max-w-60 truncate">
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
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset">
                <IconUpload
                  size={15}
                />

                Attach files

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

              <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-500">
                Up to 5 files, 25 MB each. Government ID documents should be uploaded through Identity, not Messages.
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
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500"
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
        </section>
      )}

      {/* =============================================================== mailbox */}
      <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
        <div className="border-b border-line bg-inset px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow text-ink-500">
                Secure claimant mailbox
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-sm font-semibold text-white">
                  {
                    mailbox.claimantReference
                  }
                </span>

                <span className="text-sm font-medium text-ink-700">
                  Claimant ID
                </span>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs font-semibold text-ink-500">
                Authorized DueQuity contact
              </p>

              <p className="mt-1 text-sm font-semibold text-ink-900">
                {
                  mailbox.recipient.name
                }
              </p>

              <p className="text-xs text-ink-500">
                {
                  mailbox.recipient.title
                }
              </p>
            </div>
          </div>
        </div>

        <div className="grid min-h-[560px] lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* ============================================================= list */}
          <aside className="border-b border-line bg-inset lg:border-b-0 lg:border-r">
            <div className="border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-ink-900">
                {folder ===
                  "inbox"
                  ? "Inbox"
                  : folder ===
                      "sent"
                    ? "Sent"
                    : "Attachments"}
              </p>

              <p className="mt-0.5 text-xs text-ink-500">
                {folder ===
                  "attachments"
                  ? `${mailbox.counts.attachments} secure attachment${
                      mailbox.counts.attachments ===
                      1
                        ? ""
                        : "s"
                    }`
                  : `${visibleMessages.length} message${
                      visibleMessages.length ===
                      1
                        ? ""
                        : "s"
                    }`}
              </p>
            </div>

            {visibleMessages.length ===
              0 ? (
              <div className="px-5 py-12 text-center">
                {folder ===
                  "attachments"
                  ? (
                    <IconDocument
                      size={23}
                      className="mx-auto text-ink-400"
                    />
                  )
                  : (
                    <IconMail
                      size={23}
                      className="mx-auto text-ink-400"
                    />
                  )}

                <p className="mt-3 text-sm font-semibold text-ink-800">
                  {folder ===
                    "inbox"
                    ? "No inbox messages"
                    : folder ===
                        "sent"
                      ? "No sent messages"
                      : "No message attachments"}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {visibleMessages.map(
                  (
                    message,
                  ) => {
                    const active =
                      selectedMessageId ===
                      message.id;

                    return (
                      <li
                        key={
                          message.id
                        }
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMessageId(
                              message.id,
                            );
                          }}
                          className={cn(
                            "w-full px-4 py-4 text-left transition",

                            active
                              ? "bg-white"
                              : "hover:bg-white/70",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "mt-1.5 inline-flex size-2 shrink-0 rounded-full",

                                active
                                  ? "bg-accent-600"
                                  : "bg-ink-300",
                              )}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
                                  {
                                    message.subject
                                  }
                                </p>

                                <span className="shrink-0 text-2xs text-ink-400">
                                  {formatDateTime(
                                    message.sentAt,
                                  )}
                                </span>
                              </div>

                              <p className="mt-1 truncate text-xs font-medium text-ink-600">
                                {message.senderType ===
                                "claimant"
                                  ? `To: ${mailbox.recipient.name}`
                                  : `From: ${message.senderName}`}
                              </p>

                              <p className="mt-1 truncate text-xs text-ink-500">
                                {messagePreview(
                                  message,
                                )}
                              </p>

                              {message.attachments.length >
                                0 && (
                                <p className="mt-1.5 flex items-center gap-1 text-2xs font-medium text-ink-400">
                                  <IconDocument
                                    size={12}
                                  />

                                  {
                                    message.attachments.length
                                  }{" "}
                                  attachment
                                  {message.attachments.length ===
                                  1
                                    ? ""
                                    : "s"}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  },
                )}
              </ul>
            )}
          </aside>

          {/* =========================================================== detail */}
          <section className="min-w-0 bg-white">
            {selectedMessage ? (
              <div>
                <div className="border-b border-line px-4 py-5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                        {selectedMessage.senderType ===
                        "claimant"
                          ? "Sent message"
                          : "Inbox message"}
                      </p>

                      <h2 className="mt-1.5 text-xl font-semibold text-ink-950">
                        {
                          selectedMessage.subject
                        }
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        beginReply(
                          selectedMessage,
                        );
                      }}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset"
                    >
                      Reply
                    </button>
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-ink-500">
                        From:
                      </dt>

                      <dd className="text-ink-800">
                        {selectedMessage.senderType ===
                        "claimant"
                          ? "You"
                          : selectedMessage.senderName}
                      </dd>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-ink-500">
                        To:
                      </dt>

                      <dd className="text-ink-800">
                        {selectedMessage.senderType ===
                        "claimant"
                          ? `${mailbox.recipient.name}, ${mailbox.recipient.title}`
                          : "You"}
                      </dd>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-ink-500">
                        Date:
                      </dt>

                      <dd className="text-ink-700">
                        {formatDateTime(
                          selectedMessage.sentAt,
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="px-4 py-6 sm:px-6">
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink-800">
                    {
                      selectedMessage.bodyText
                    }
                  </p>

                  {selectedMessage.attachments.length >
                    0 && (
                    <div className="mt-8">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                        Attachments
                      </p>

                      <div className="mt-2 space-y-2">
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
                                  attachment.id,
                                );
                              }}
                              className="flex w-full items-center gap-3 rounded-lg border border-line bg-inset px-3 py-3 text-left transition hover:bg-white"
                            >
                              <IconDocument
                                size={17}
                              />

                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">
                                {
                                  attachment.fileName
                                }
                              </span>

                              <span className="shrink-0 text-xs text-ink-500">
                                {formatBytes(
                                  attachment.sizeBytes,
                                )}
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center px-6 text-center">
                <div>
                  <IconMail
                    size={28}
                    className="mx-auto text-ink-400"
                  />

                  <h2 className="mt-4 text-base font-semibold text-ink-800">
                    {folder ===
                      "inbox"
                      ? "Your inbox is clear"
                      : folder ===
                          "sent"
                        ? "No sent message selected"
                        : "No attachment selected"}
                  </h2>

                  <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-500">
                    Use New Message to securely contact your assigned DueQuity representative.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-inset px-4 py-3">
        <p className="text-xs leading-relaxed text-ink-600">
          Do not send Social Security numbers, passwords, authentication codes, banking credentials or government identity documents through Messages. Government-issued ID should be submitted only through the secure Identity section.
        </p>
      </div>
    </div>
  );
}