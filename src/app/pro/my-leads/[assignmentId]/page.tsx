import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  can,
} from "@/lib/session";

import {
  getLatestProspectiveClaimantContact,
} from "@/server/prospective-claimant-contact-service";

import {
  listStaffMyLeads,
} from "@/server/staff-my-leads-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const metadata:
  Metadata = {
  title:
    "Assigned Lead",
};

export const dynamic =
  "force-dynamic";

interface AssignedLeadPageProps {
  params:
    Promise<{
      assignmentId:
        string;
    }>;
}

const currencyFormatter =
  new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",
    },
  );

const dateFormatter =
  new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",
    },
  );

function formatMoney(
  cents:
    number | undefined,
): string {
  if (
    cents ===
    undefined
  ) {
    return "Not recorded";
  }

  return currencyFormatter.format(
    cents /
      100,
  );
}

function formatDate(
  value:
    string | undefined,
): string {
  if (
    !value
  ) {
    return "Not recorded";
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

  return dateFormatter.format(
    date,
  );
}

export default async function AssignedLeadPage({
  params,
}: AssignedLeadPageProps) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    redirect(
      "/staff/sign-in",
    );
  }

  if (
    !can(
      session,
      "opportunity.read",
    )
  ) {
    redirect(
      "/",
    );
  }

  const {
    assignmentId,
  } =
    await params;

  const leads =
    await listStaffMyLeads(
      session,
    );

  const lead =
    leads.find(
      (
        candidate,
      ) =>
        candidate.assignmentId ===
        assignmentId,
    );

  if (
    !lead
  ) {
    notFound();
  }

  const savedContact =
    lead.subjectType ===
      "discovered_record"
      ? await getLatestProspectiveClaimantContact({
          session,

          discoveredRecordId:
            lead.recordId,
        })
      : undefined;

  const workQuery =
    lead.subjectType ===
      "discovered_record"
      ? lead.recordId
      : (
          lead.opportunityReference ??
          lead.recordId
        );

  const startWorkHref =
    `/pro/claimants/onboarding?q=${encodeURIComponent(
      workQuery,
    )}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-ink-500">
            My Leads
          </p>

          <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-ink-950">
            {
              lead.ownerName
            }
          </h1>

          <p className="mt-2 font-mono text-xs text-ink-500">
            {
              lead.recordId
            }
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/pro/my-leads"
            className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-inset"
          >
            Back to My Leads
          </Link>

          <Link
            href={
              startWorkHref
            }
            className="rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Start Work
          </Link>
        </div>
      </div>

      {savedContact && (
        <div className="rounded-xl border border-accent-300 bg-accent-50 p-4">
          <p className="text-sm font-semibold text-ink-950">
            Claimant interested · Contact saved
          </p>

          <p className="mt-1 text-sm text-ink-600">
            {savedContact.confirmedLegalFirstName}{" "}
            {savedContact.confirmedLegalLastName} ·{" "}
            {savedContact.confirmedEmail} ·{" "}
            {savedContact.confirmedMobilePhone}
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-line bg-paper shadow-sm">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink-950">
              Recovery lead
            </h2>
          </div>

          <dl className="grid gap-5 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Former owner
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-950">
                {
                  lead.ownerName
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Surplus
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-950">
                {formatMoney(
                  lead.amountCents,
                )}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Property
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-950">
                {
                  lead.addressLine1
                }
              </dd>

              <dd className="mt-1 text-sm text-ink-600">
                {[
                  lead.city,
                  lead.county,
                  lead.stateCode,
                  lead.postalCode,
                ]
                  .filter(
                    Boolean,
                  )
                  .join(
                    ", ",
                  )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Sale date
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {formatDate(
                  lead.saleDate,
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Case / parcel
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  lead.caseOrParcel ??
                  "Not recorded"
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Assigned
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {formatDate(
                  lead.assignedAt,
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Lead stage
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {lead.subjectType ===
                "discovered_record"
                  ? "Discovery"
                  : "Opportunity"}
              </dd>
            </div>

            {lead.batchReference && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Assignment batch
                </dt>

                <dd className="mt-1 font-mono text-xs text-ink-700">
                  {
                    lead.batchReference
                  }
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-paper shadow-sm">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-semibold text-ink-950">
                Located contact
              </h2>
            </div>

            <dl className="space-y-4 p-5">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Best phone
                </dt>

                <dd className="mt-1 text-sm font-semibold text-ink-900">
                  {
                    lead.bestPhone ??
                    "No phone located"
                  }
                </dd>
              </div>

              {lead.additionalPhones && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Additional phones
                  </dt>

                  <dd className="mt-1 text-sm text-ink-800">
                    {
                      lead.additionalPhones
                    }
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Best email
                </dt>

                <dd className="mt-1 break-all text-sm font-semibold text-ink-900">
                  {
                    lead.bestEmail ??
                    "No email located"
                  }
                </dd>
              </div>

              {lead.additionalEmails && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Additional emails
                  </dt>

                  <dd className="mt-1 break-all text-sm text-ink-800">
                    {
                      lead.additionalEmails
                    }
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
            <p className="text-sm font-semibold text-ink-950">
              Ready to work this lead?
            </p>

            <p className="mt-2 text-sm leading-6 text-ink-600">
              Start Work opens this exact assigned recovery inside DueQuity&apos;s existing controlled claimant-intake workflow. It does not create a claimant or bypass jurisdiction controls.
            </p>

            <Link
              href={
                startWorkHref
              }
              className="mt-4 inline-flex rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
            >
              Start Work
            </Link>
          </div>

          {lead.sourceUrl && (
            <a
              href={
                lead.sourceUrl
              }
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink-700 transition hover:bg-inset"
            >
              Open official source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}