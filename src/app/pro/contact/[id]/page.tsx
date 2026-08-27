import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  Badge,
  Tag,
} from "@/components/ui/badge";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
} from "@/components/ui/surface";

import {
  can,
} from "@/lib/session";

import {
  getContactInquiry,
  type ContactInquiryStatus,
} from "@/server/contact-inquiry-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  replyToContactAction,
  updateContactStatusAction,
} from "./actions";

export const metadata:
  Metadata = {
  title:
    "Contact Inquiry",
};

export const dynamic =
  "force-dynamic";

interface ContactInquiryPageProps {
  params:
    Promise<{
      id: string;
    }>;

  searchParams:
    Promise<{
      status?:
        string;
    }>;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formatDateTime(
  value: string,
): string {
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

function statusLabel(
  status:
    ContactInquiryStatus,
): string {
  switch (
    status
  ) {
    case "new":
      return "New";

    case "open":
      return "Open";

    case "awaiting_response":
      return "Awaiting response";

    case "responded":
      return "Responded";

    case "closed":
      return "Closed";

    case "spam":
      return "Spam";

    default:
      return status;
  }
}

function statusTone(
  status:
    ContactInquiryStatus,
):
  | "neutral"
  | "positive"
  | "caution"
  | "critical" {
  switch (
    status
  ) {
    case "new":
      return "caution";

    case "responded":
      return "positive";

    case "spam":
      return "critical";

    default:
      return "neutral";
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ContactInquiryPage({
  params,
  searchParams,
}: ContactInquiryPageProps) {
  const {
    id,
  } =
    await params;

  const query =
    await searchParams;

  const session =
    await resolveStaffSession();

  if (!session) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  if (
    !can(
      session,
      "contact.read",
    )
  ) {
    return (
      <Callout
        tone="critical"
        role="alert"
        title="Access not permitted"
      >
        <p>
          Your staff role does not have access to public contact inquiries.
        </p>
      </Callout>
    );
  }

  const inquiry =
    await getContactInquiry(
      id,
    );

  const canReply =
    can(
      session,
      "contact.reply",
    );

  const canManage =
    can(
      session,
      "contact.manage",
    );

  const replyBlocked =
    inquiry.status ===
      "closed" ||
    inquiry.status ===
      "spam";

  /*
   * Immediately after a successful reply, do not render another empty
   * composer. The success confirmation and recorded outbound message should
   * be the staff member's clear visual confirmation that the action completed.
   *
   * Returning to the inquiry later without ?status=replied restores the normal
   * reply composer for any necessary follow-up.
   */
  const showReplyComposer =
    canReply &&
    query.status !==
      "replied";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/pro/contact"
          className="text-sm font-medium text-ink-500 transition hover:text-ink-900"
        >
          ← Contact Inbox
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-ink-500">
              Public inquiry
            </p>

            <h1 className="mt-1.5 text-2xl">
              {
                inquiry.subject
              }
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  statusTone(
                    inquiry.status,
                  )
                }
              >
                {
                  statusLabel(
                    inquiry.status,
                  )
                }
              </Badge>

              <Tag>
                {
                  inquiry.reference
                }
              </Tag>
            </div>
          </div>

          <div className="text-right text-sm text-ink-500">
            <p>
              Last activity
            </p>

            <p className="mt-1 font-medium text-ink-800">
              {
                formatDateTime(
                  inquiry.lastMessageAt,
                )
              }
            </p>
          </div>
        </div>
      </div>

      {query.status ===
      "replied" ? (
        <Callout
          tone="positive"
          role="status"
          title="Reply sent"
        >
          <p>
            The response was sent successfully from info@duequity.com and
            recorded in this inquiry.
          </p>
        </Callout>
      ) : null}

      {query.status ===
      "reply-failed" ? (
        <Callout
          tone="critical"
          role="alert"
          title="Reply could not be sent"
        >
          <p>
            The response was not confirmed as delivered. Check the DueQuity
            contact mailbox configuration before trying again.
          </p>
        </Callout>
      ) : null}

      {query.status ===
      "updated" ? (
        <Callout
          tone="positive"
          role="status"
          title="Inquiry updated"
        >
          <p>
            The inquiry status was updated successfully.
          </p>
        </Callout>
      ) : null}

      {query.status ===
      "update-failed" ? (
        <Callout
          tone="critical"
          role="alert"
          title="Status could not be updated"
        >
          <p>
            DueQuity could not complete the requested status change.
          </p>
        </Callout>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Conversation"
              description={`${inquiry.messages.length.toLocaleString()} ${
                inquiry.messages.length ===
                1
                  ? "message"
                  : "messages"
              }`}
            />

            <CardBody>
              <div className="space-y-4">
                {inquiry.messages.map(
                  (
                    message,
                  ) => (
                    <article
                      key={
                        message.id
                      }
                      className={
                        message.direction ===
                        "outbound"
                          ? "ml-auto max-w-3xl rounded-xl border border-accent-200 bg-accent-50 p-4"
                          : message.direction ===
                              "internal"
                            ? "max-w-3xl rounded-xl border border-caution-200 bg-caution-50 p-4"
                            : "max-w-3xl rounded-xl border border-line bg-white p-4"
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink-900">
                            {
                              message.senderName
                            }
                          </p>

                          {message.senderEmail ? (
                            <p className="mt-0.5 text-xs text-ink-500">
                              {
                                message.senderEmail
                              }
                            </p>
                          ) : null}
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                            {
                              message.direction
                            }
                          </p>

                          <p className="mt-1 text-xs text-ink-500">
                            {
                              formatDateTime(
                                message.sentAt ??
                                  message.createdAt,
                              )
                            }
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-800">
                        {
                          message.bodyText
                        }
                      </p>

                      {message.state ===
                      "failed" ? (
                        <p className="mt-3 text-xs font-semibold text-critical-700">
                          Delivery failed
                        </p>
                      ) : null}
                    </article>
                  ),
                )}
              </div>
            </CardBody>
          </Card>

          {showReplyComposer ? (
            <Card>
              <CardHeader
                title="Reply"
                description="Replies are sent externally from info@duequity.com."
              />

              <CardBody>
                {replyBlocked ? (
                  <Callout
                    tone="caution"
                    title="This inquiry is closed"
                  >
                    <p>
                      Reopen the inquiry before sending another response.
                    </p>
                  </Callout>
                ) : (
                  <form
                    action={
                      replyToContactAction
                    }
                    className="space-y-4"
                  >
                    <input
                      type="hidden"
                      name="inquiryId"
                      value={
                        inquiry.id
                      }
                    />

                    <div className="space-y-2">
                      <label
                        htmlFor="bodyText"
                        className="block text-sm font-medium text-ink-800"
                      >
                        Response
                      </label>

                      <textarea
                        id="bodyText"
                        name="bodyText"
                        rows={8}
                        maxLength={
                          20_000
                        }
                        required
                        className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm leading-6 text-ink-900 outline-none transition focus:border-ink-500"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                      >
                        Send reply
                      </button>
                    </div>
                  </form>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Requester"
            />

            <CardBody>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Name
                  </dt>

                  <dd className="mt-1 font-medium text-ink-900">
                    {
                      inquiry.requesterName
                    }
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Email
                  </dt>

                  <dd className="mt-1 break-all text-ink-800">
                    <a
                      href={`mailto:${inquiry.requesterEmail}`}
                      className="hover:underline"
                    >
                      {
                        inquiry.requesterEmail
                      }
                    </a>
                  </dd>
                </div>

                {inquiry.requesterPhone ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Phone
                    </dt>

                    <dd className="mt-1 text-ink-800">
                      {
                        inquiry.requesterPhone
                      }
                    </dd>
                  </div>
                ) : null}

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Created
                  </dt>

                  <dd className="mt-1 text-ink-800">
                    {
                      formatDateTime(
                        inquiry.createdAt,
                      )
                    }
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader
                title="Workflow"
                description="Update the operational state of this inquiry."
              />

              <CardBody>
                <form
                  action={
                    updateContactStatusAction
                  }
                  className="space-y-4"
                >
                  <input
                    type="hidden"
                    name="inquiryId"
                    value={
                      inquiry.id
                    }
                  />

                  <div className="space-y-2">
                    <label
                      htmlFor="status"
                      className="block text-sm font-medium text-ink-800"
                    >
                      Status
                    </label>

                    <select
                      id="status"
                      name="status"
                      defaultValue={
                        inquiry.status
                      }
                      className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                    >
                      <option value="new">
                        New
                      </option>

                      <option value="open">
                        Open
                      </option>

                      <option value="awaiting_response">
                        Awaiting response
                      </option>

                      <option value="responded">
                        Responded
                      </option>

                      <option value="closed">
                        Closed
                      </option>

                      <option value="spam">
                        Spam
                      </option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-xl border border-ink-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
                  >
                    Update status
                  </button>
                </form>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}