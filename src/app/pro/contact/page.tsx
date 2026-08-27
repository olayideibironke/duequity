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
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import {
  can,
} from "@/lib/session";

import {
  listContactInquiries,
  type ContactInquiryStatus,
} from "@/server/contact-inquiry-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

export const metadata:
  Metadata = {
  title:
    "Contact Inbox",
};

export const dynamic =
  "force-dynamic";

interface ContactInboxPageProps {
  searchParams:
    Promise<{
      filter?:
        string;

      status?:
        string;
    }>;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

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

    case "open":
    case "awaiting_response":
      return "neutral";

    case "responded":
      return "positive";

    case "closed":
      return "neutral";

    case "spam":
      return "critical";

    default:
      return "neutral";
  }
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

function categoryLabel(
  value: string,
): string {
  switch (
    value
  ) {
    case "claim_question":
      return "Surplus question";

    case "partnership":
      return "Partnership";

    case "media":
      return "Media";

    case "other":
      return "Other";

    default:
      return "General";
  }
}

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

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ContactInboxPage({
  searchParams,
}: ContactInboxPageProps) {
  const params =
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

  const inquiries =
    await listContactInquiries(
      params.filter,
    );

  const allInquiries =
    params.filter
      ? await listContactInquiries()
      : inquiries;

  const newCount =
    allInquiries.filter(
      (
        inquiry,
      ) =>
        inquiry.status ===
        "new",
    ).length;

  const openCount =
    allInquiries.filter(
      (
        inquiry,
      ) =>
        inquiry.status ===
          "open" ||
        inquiry.status ===
          "awaiting_response",
    ).length;

  const respondedCount =
    allInquiries.filter(
      (
        inquiry,
      ) =>
        inquiry.status ===
        "responded",
    ).length;

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-ink-500">
          Public communications
        </p>

        <h1 className="mt-1.5 text-2xl">
          Contact Inbox
        </h1>

        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
          Review inquiries submitted through DueQuity&apos;s public contact
          channel. Public communications remain separate from claimant records
          and internal staff mail.
        </p>
      </div>

      {params.status ===
      "invalid" ? (
        <Callout
          tone="critical"
          role="alert"
          title="Inquiry action could not be completed"
        >
          <p>
            The requested contact inquiry action was invalid.
          </p>
        </Callout>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total inquiries"
          value={
            allInquiries.length.toLocaleString()
          }
          context="Public contact records"
        />

        <Stat
          label="New"
          value={
            newCount.toLocaleString()
          }
          context="Awaiting first review"
        />

        <Stat
          label="Open"
          value={
            openCount.toLocaleString()
          }
          context="Active conversations"
        />

        <Stat
          label="Responded"
          value={
            respondedCount.toLocaleString()
          }
          context="DueQuity has replied"
        />
      </div>

      <Card>
        <CardHeader
          title="Inbox"
          description="Newest activity appears first."
        />

        <CardBody>
          <div className="mb-5 flex flex-wrap gap-2">
            {[
              [
                "",
                "All",
              ],
              [
                "new",
                "New",
              ],
              [
                "open",
                "Open",
              ],
              [
                "awaiting_response",
                "Awaiting response",
              ],
              [
                "responded",
                "Responded",
              ],
              [
                "closed",
                "Closed",
              ],
            ].map(
              (
                [
                  value,
                  label,
                ],
              ) => (
                <Link
                  key={
                    value ||
                    "all"
                  }
                  href={
                    value
                      ? `/pro/contact?filter=${value}`
                      : "/pro/contact"
                  }
                  className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
                >
                  {label}
                </Link>
              ),
            )}
          </div>

          {inquiries.length ===
          0 ? (
            <EmptyState
              compact
              title="No inquiries"
              description="There are no public inquiries in this view."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {inquiries.map(
                (
                  inquiry,
                ) => (
                  <li
                    key={
                      inquiry.id
                    }
                    className="py-4 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/pro/contact/${inquiry.id}`}
                      className="block rounded-lg p-2 transition hover:bg-ink-50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-ink-900">
                              {
                                inquiry.requesterName
                              }
                            </p>

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
                                categoryLabel(
                                  inquiry.category,
                                )
                              }
                            </Tag>
                          </div>

                          <p className="mt-1 text-sm font-medium text-ink-800">
                            {
                              inquiry.subject
                            }
                          </p>

                          <p className="mt-1 text-sm text-ink-500">
                            {
                              inquiry.requesterEmail
                            }
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-mono text-xs text-ink-500">
                            {
                              inquiry.reference
                            }
                          </p>

                          <p className="mt-1 text-xs text-ink-500">
                            {
                              formatDateTime(
                                inquiry.lastMessageAt,
                              )
                            }
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}