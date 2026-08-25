"use client";

import {
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
  ClaimantMessageItem,
  ClaimantMessageThreadSummary,
  ClaimantMessageThreadView,
  ClaimantMessagingProfile,
} from "@/server/claimant-message-store";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface WorkspacePayload {
  profile:
    ClaimantMessagingProfile;

  threads:
    ClaimantMessageThreadSummary[];

  thread?:
    ClaimantMessageThreadView;

  error?:
    string;
}

interface AttachmentDownloadPayload {
  url: string;

  fileName: string;

  error?:
    string;
}

interface ClaimantConversationWorkspaceProps {
  viewer:
    | "staff"
    | "claimant";

  profile:
    ClaimantMessagingProfile;

  initialThreads:
    ClaimantMessageThreadSummary[];

  initialThread?:
    ClaimantMessageThreadView;

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
  if (!value) {
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

async function readJson<
  T extends {
    error?: string;
  },
>(
  response:
    Response,
): Promise<T> {
  const payload =
    await response.json() as T;

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

export function ClaimantConversationWorkspace({
  viewer,
  profile,
  initialThreads,
  initialThread,
  apiEndpoint,
  attachmentEndpoint,
}: ClaimantConversationWorkspaceProps) {
  const [
    threads,
    setThreads,
  ] =
    useState(
      initialThreads,
    );

  const [
    thread,
    setThread,
  ] =
    useState<
      ClaimantMessageThreadView | undefined
    >(
      initialThread,
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

  const selectedReply =
    useMemo(
      () =>
        thread?.messages.find(
          (
            message,
          ) =>
            message.id ===
            replyToMessageId,
        ),
      [
        replyToMessageId,
        thread,
      ],
    );

  const mayCompose =
    viewer ===
      "staff" ||
    Boolean(
      thread,
    );

  async function refreshThread(
    threadId:
      string,
  ) {
    setLoading(
      true,
    );

    setError(
      "",
    );

    try {
      const response =
        await fetch(
          `${apiEndpoint}?threadId=${encodeURIComponent(
            threadId,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const payload =
        await readJson<WorkspacePayload>(
          response,
        );

      setThreads(
        payload.threads,
      );

      setThread(
        payload.thread,
      );

      setReplyToMessageId(
        undefined,
      );
    } catch (
      refreshError
    ) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to load claimant conversation.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  async function sendMessage() {
    if (
      sending
    ) {
      return;
    }

    if (
      !bodyText.trim() &&
      files.length ===
        0
    ) {
      setError(
        "Write a message or attach a file before sending.",
      );

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
        "bodyText",
        bodyText,
      );

      if (
        thread
      ) {
        formData.set(
          "threadId",
          thread.id,
        );
      }

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
        await readJson<WorkspacePayload>(
          response,
        );

      setThreads(
        payload.threads,
      );

      setThread(
        payload.thread,
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
        await readJson<AttachmentDownloadPayload>(
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

  function senderLabel(
    message:
      ClaimantMessageItem,
  ): string {
    if (
      viewer ===
      "claimant"
    ) {
      return message.senderType ===
        "claimant"
        ? "You"
        : message.senderName;
    }

    return message.senderType ===
      "claimant"
      ? `Claimant ${profile.claimantReference}`
      : message.senderName;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
      {/* =============================================================== identity */}
      <div className="border-b border-line bg-inset px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-ink-500">
              Secure claimant communication
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-sm font-semibold text-white">
                {profile.claimantReference}
              </span>

              <span className="text-sm font-medium text-ink-800">
                Claimant ID
              </span>
            </div>

            <p className="mt-2 text-sm text-ink-600">
              {viewer ===
                "staff"
                ? profile.legalName
                : "Your secure DueQuity claimant account"}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs font-medium text-ink-600">
              Recovery
            </p>

            <p className="mt-1 font-mono text-xs text-ink-500">
              {profile.claimReference}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-critical-200 bg-critical-50 px-3 py-2.5 text-sm text-critical-800 sm:mx-5"
        >
          <p className="flex-1">
            {error}
          </p>

          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() =>
              setError(
                "",
              )
            }
          >
            <IconClose
              size={15}
            />
          </button>
        </div>
      )}

      <div className="grid min-h-[620px] lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* ============================================================ threads */}
        <aside className="border-b border-line bg-inset lg:border-b-0 lg:border-r">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">
              Messages
            </p>

            <p className="mt-0.5 text-xs text-ink-500">
              {threads.length ===
              0
                ? "No conversation yet"
                : `${threads.length} secure conversation${
                    threads.length ===
                    1
                      ? ""
                      : "s"
                  }`}
            </p>
          </div>

          {threads.length ===
            0 ? (
            <div className="px-4 py-8 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-white text-ink-400">
                <IconMail
                  size={19}
                />
              </span>

              <p className="mt-3 text-sm font-semibold text-ink-800">
                No messages yet
              </p>

              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                {viewer ===
                  "staff"
                  ? "Send the first secure message to open this claimant conversation."
                  : "When DueQuity sends you a secure message, it will appear here."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {threads.map(
                (
                  item,
                ) => {
                  const active =
                    thread?.id ===
                    item.id;

                  return (
                    <li
                      key={
                        item.id
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void refreshThread(
                            item.id,
                          );
                        }}
                        className={cn(
                          "w-full px-4 py-3.5 text-left transition",

                          active
                            ? "bg-white"
                            : "hover:bg-white/70",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-ink-700">
                            {
                              item.claimantReference
                            }
                          </p>

                          {item.unreadCount >
                            0 && (
                            <span className="rounded-full bg-accent-700 px-2 py-0.5 text-2xs font-semibold text-white">
                              {
                                item.unreadCount
                              }
                            </span>
                          )}
                        </div>

                        <p className="mt-1 truncate text-xs text-ink-600">
                          {item.lastMessagePreview ||
                            "Secure claimant conversation"}
                        </p>

                        {item.lastMessageAt && (
                          <p className="mt-1 text-2xs text-ink-400">
                            {formatDateTime(
                              item.lastMessageAt,
                            )}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                },
              )}
            </ul>
          )}
        </aside>

        {/* ============================================================ messages */}
        <section className="flex min-w-0 flex-col bg-white">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {loading ? (
              <div className="flex min-h-[300px] items-center justify-center">
                <p className="text-sm text-ink-500">
                  Loading messages...
                </p>
              </div>
            ) : thread ? (
              <div className="space-y-4">
                {thread.messages.map(
                  (
                    message,
                  ) => {
                    const mine =
                      viewer ===
                        "claimant"
                        ? message.senderType ===
                          "claimant"
                        : message.senderType ===
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
                        <div className="max-w-[88%] sm:max-w-[75%]">
                          <div className="mb-1 flex items-center gap-2 px-1">
                            <span className="text-2xs font-semibold text-ink-500">
                              {senderLabel(
                                message,
                              )}
                            </span>

                            <span className="text-2xs text-ink-400">
                              {formatDateTime(
                                message.sentAt,
                              )}
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
                            {message.replyToMessageId && (
                              <p
                                className={cn(
                                  "mb-2 border-l-2 pl-2 text-xs",

                                  mine
                                    ? "border-ink-600 text-ink-300"
                                    : "border-ink-300 text-ink-500",
                                )}
                              >
                                Reply
                              </p>
                            )}

                            {message.bodyText && (
                              <p className="whitespace-pre-wrap break-words">
                                {
                                  message.bodyText
                                }
                              </p>
                            )}

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
                                        size={15}
                                      />

                                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                        {
                                          attachment.fileName
                                        }
                                      </span>

                                      <span className="shrink-0 text-2xs opacity-70">
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

                          <button
                            type="button"
                            onClick={() => {
                              setReplyToMessageId(
                                message.id,
                              );
                            }}
                            className="mt-1 px-1 text-2xs font-medium text-ink-500 hover:text-ink-900"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center text-center">
                <div>
                  <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-inset text-ink-400">
                    <IconMail
                      size={23}
                    />
                  </span>

                  <h2 className="mt-4 text-base font-semibold text-ink-800">
                    {viewer ===
                      "staff"
                      ? "Start secure conversation"
                      : "No secure messages yet"}
                  </h2>

                  <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-500">
                    {viewer ===
                      "staff"
                      ? `Messages sent here are delivered only to claimant ${profile.claimantReference}.`
                      : "DueQuity messages concerning your recovery will appear here."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ============================================================ composer */}
          {mayCompose && (
            <div className="border-t border-line bg-paper px-4 py-4 sm:px-5">
              {selectedReply && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-line bg-inset px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                      Replying to
                    </p>

                    <p className="mt-0.5 truncate text-xs text-ink-600">
                      {selectedReply.bodyText ||
                        selectedReply.attachments[0]?.fileName ||
                        "Attachment"}
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() =>
                      setReplyToMessageId(
                        undefined,
                      )
                    }
                    className="text-ink-400 hover:text-ink-900"
                  >
                    <IconClose
                      size={14}
                    />
                  </button>
                </div>
              )}

              {files.length >
                0 && (
                <div className="mb-3 flex flex-wrap gap-2">
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
                                    itemIndex,
                                  ) =>
                                    itemIndex !==
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

              <textarea
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
                maxLength={
                  10_000
                }
                rows={
                  4
                }
                placeholder={
                  viewer ===
                  "staff"
                    ? `Message claimant ${profile.claimantReference}...`
                    : "Write a secure message to DueQuity..."
                }
                className="w-full resize-y rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset">
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
                          event.currentTarget.files ??
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

                <p className="min-w-0 flex-1 text-2xs leading-relaxed text-ink-400">
                  Up to 5 files, 25 MB each. Identity evidence and government IDs should use Documents instead.
                </p>

                <button
                  type="button"
                  disabled={
                    sending
                  }
                  onClick={() => {
                    void sendMessage();
                  }}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconMail
                    size={15}
                  />

                  {sending
                    ? "Sending..."
                    : "Send"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}