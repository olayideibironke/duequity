"use client";

import {
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import type {
  StaffMyLead,
} from "@/server/staff-my-leads-service";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type ContactFilter =
  | "all"
  | "has_contact"
  | "phone"
  | "email"
  | "no_contact";

type LeadFilter =
  | "all"
  | "new";

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

const currencyFormatter =
  new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",

      maximumFractionDigits:
        2,
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

function normalize(
  value:
    string | undefined,
): string {
  return (
    value ??
    ""
  )
    .toLowerCase()
    .trim();
}

function startWorkHref(
  lead:
    StaffMyLead,
): string {
  const query =
    lead.subjectType ===
      "discovered_record"
      ? lead.recordId
      : (
          lead.opportunityReference ??
          lead.recordId
        );

  return `/pro/claimants/onboarding?q=${encodeURIComponent(
    query,
  )}`;
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function MyLeadsWorkspace({
  leads,
}: {
  leads:
    StaffMyLead[];
}) {
  const [
    query,
    setQuery,
  ] =
    useState(
      "",
    );

  const [
    stateFilter,
    setStateFilter,
  ] =
    useState(
      "all",
    );

  const [
    countyFilter,
    setCountyFilter,
  ] =
    useState(
      "all",
    );

  const [
    contactFilter,
    setContactFilter,
  ] =
    useState<ContactFilter>(
      "all",
    );

  const [
    leadFilter,
    setLeadFilter,
  ] =
    useState<LeadFilter>(
      "all",
    );

  const states =
    useMemo(
      () =>
        Array.from(
          new Set(
            leads.map(
              (
                lead,
              ) =>
                lead.stateCode,
            ),
          ),
        ).sort(),
      [
        leads,
      ],
    );

  const counties =
    useMemo(
      () =>
        Array.from(
          new Set(
            leads
              .filter(
                (
                  lead,
                ) =>
                  stateFilter ===
                    "all" ||
                  lead.stateCode ===
                    stateFilter,
              )
              .map(
                (
                  lead,
                ) =>
                  lead.county,
              ),
          ),
        ).sort(
          (
            left,
            right,
          ) =>
            left.localeCompare(
              right,
            ),
        ),
      [
        leads,
        stateFilter,
      ],
    );

  const filteredLeads =
    useMemo(
      () => {
        const normalizedQuery =
          normalize(
            query,
          );

        return leads.filter(
          (
            lead,
          ) => {
            if (
              stateFilter !==
                "all" &&
              lead.stateCode !==
                stateFilter
            ) {
              return false;
            }

            if (
              countyFilter !==
                "all" &&
              lead.county !==
                countyFilter
            ) {
              return false;
            }

            if (
              leadFilter ===
                "new" &&
              !lead.isNew
            ) {
              return false;
            }

            const hasPhone =
              Boolean(
                lead.bestPhone ||
                lead.additionalPhones,
              );

            const hasEmail =
              Boolean(
                lead.bestEmail ||
                lead.additionalEmails,
              );

            if (
              contactFilter ===
                "has_contact" &&
              !hasPhone &&
              !hasEmail
            ) {
              return false;
            }

            if (
              contactFilter ===
                "phone" &&
              !hasPhone
            ) {
              return false;
            }

            if (
              contactFilter ===
                "email" &&
              !hasEmail
            ) {
              return false;
            }

            if (
              contactFilter ===
                "no_contact" &&
              (
                hasPhone ||
                hasEmail
              )
            ) {
              return false;
            }

            if (
              !normalizedQuery
            ) {
              return true;
            }

            const searchable =
              [
                lead.ownerName,
                lead.addressLine1,
                lead.city,
                lead.county,
                lead.stateCode,
                lead.postalCode,
                lead.bestPhone,
                lead.additionalPhones,
                lead.bestEmail,
                lead.additionalEmails,
                lead.caseOrParcel,
                lead.batchReference,
                lead.batchName,
                lead.recordId,
                lead.opportunityReference,
              ]
                .map(
                  normalize,
                )
                .join(
                  " ",
                );

            return searchable.includes(
              normalizedQuery,
            );
          },
        );
      },
      [
        leads,
        query,
        stateFilter,
        countyFilter,
        contactFilter,
        leadFilter,
      ],
    );

  function clearFilters() {
    setQuery(
      "",
    );

    setStateFilter(
      "all",
    );

    setCountyFilter(
      "all",
    );

    setContactFilter(
      "all",
    );

    setLeadFilter(
      "all",
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
      <div className="border-b border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ink-950">
              Assigned lead worklist
            </h2>

            <p className="mt-0.5 text-xs text-ink-500">
              Showing{" "}
              {filteredLeads.length.toLocaleString()}{" "}
              of{" "}
              {leads.length.toLocaleString()}{" "}
              active assigned{" "}
              {leads.length ===
              1
                ? "lead"
                : "leads"}
              .
            </p>
          </div>

          <a
            href="/api/pro/my-leads/export"
            className="inline-flex rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Download assigned leads (.xlsx)
          </a>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_10rem_14rem_12rem_10rem_auto]">
          <input
            type="search"
            value={
              query
            }
            onChange={(
              event,
            ) => {
              setQuery(
                event.target.value,
              );
            }}
            placeholder="Search name, address, parcel, phone, email..."
            className="min-w-0 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
          />

          <select
            value={
              stateFilter
            }
            onChange={(
              event,
            ) => {
              setStateFilter(
                event.target.value,
              );

              setCountyFilter(
                "all",
              );
            }}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:border-accent-400"
          >
            <option value="all">
              All states
            </option>

            {states.map(
              (
                state,
              ) => (
                <option
                  key={
                    state
                  }
                  value={
                    state
                  }
                >
                  {
                    state
                  }
                </option>
              ),
            )}
          </select>

          <select
            value={
              countyFilter
            }
            onChange={(
              event,
            ) => {
              setCountyFilter(
                event.target.value,
              );
            }}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:border-accent-400"
          >
            <option value="all">
              All counties
            </option>

            {counties.map(
              (
                county,
              ) => (
                <option
                  key={
                    county
                  }
                  value={
                    county
                  }
                >
                  {
                    county
                  }
                </option>
              ),
            )}
          </select>

          <select
            value={
              contactFilter
            }
            onChange={(
              event,
            ) => {
              setContactFilter(
                event.target.value as
                  ContactFilter,
              );
            }}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:border-accent-400"
          >
            <option value="all">
              All contacts
            </option>

            <option value="has_contact">
              Has contact data
            </option>

            <option value="phone">
              Has phone
            </option>

            <option value="email">
              Has email
            </option>

            <option value="no_contact">
              No contact data
            </option>
          </select>

          <select
            value={
              leadFilter
            }
            onChange={(
              event,
            ) => {
              setLeadFilter(
                event.target.value as
                  LeadFilter,
              );
            }}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:border-accent-400"
          >
            <option value="all">
              All leads
            </option>

            <option value="new">
              New only
            </option>
          </select>

          <button
            type="button"
            onClick={
              clearFilters
            }
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-inset"
          >
            Clear
          </button>
        </div>
      </div>

      {filteredLeads.length ===
      0 ? (
        <div className="px-5 py-12 text-center">
          <h3 className="font-serif text-lg font-semibold text-ink-950">
            No leads match these filters
          </h3>

          <p className="mt-2 text-sm text-ink-500">
            Clear or adjust the search and filters to see your assigned recovery leads.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-left">
            <thead className="bg-canvas">
              <tr className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">
                  Lead
                </th>

                <th className="px-4 py-3">
                  Property
                </th>

                <th className="px-4 py-3">
                  Contact
                </th>

                <th className="px-4 py-3">
                  Surplus
                </th>

                <th className="px-4 py-3">
                  Assigned
                </th>

                <th className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-line">
              {filteredLeads.map(
                (
                  lead,
                ) => (
                  <tr
                    key={
                      lead.assignmentId
                    }
                    className="align-top transition-colors hover:bg-canvas/70"
                  >
                    <td className="min-w-64 px-4 py-4">
                      <div className="flex items-start gap-2">
                        {lead.isNew && (
                          <span className="mt-1.5 inline-flex size-2 shrink-0 rounded-full bg-accent-600" />
                        )}

                        <div>
                          <p className="font-semibold text-ink-950">
                            {
                              lead.ownerName
                            }
                          </p>

                          {lead.caseOrParcel && (
                            <p className="mt-1 text-xs text-ink-500">
                              {
                                lead.caseOrParcel
                              }
                            </p>
                          )}

                          <p className="mt-1 font-mono text-2xs text-ink-400">
                            {
                              lead.recordId
                            }
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="min-w-72 px-4 py-4">
                      <p className="text-sm font-medium text-ink-900">
                        {
                          lead.addressLine1
                        }
                      </p>

                      <p className="mt-1 text-xs text-ink-500">
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
                      </p>

                      <p className="mt-1 text-xs text-ink-500">
                        Sale:{" "}
                        {formatDate(
                          lead.saleDate,
                        )}
                      </p>
                    </td>

                    <td className="min-w-64 px-4 py-4">
                      {lead.bestPhone ? (
                        <p className="text-sm font-semibold text-ink-900">
                          {
                            lead.bestPhone
                          }
                        </p>
                      ) : (
                        <p className="text-sm text-ink-400">
                          No phone located
                        </p>
                      )}

                      {lead.bestEmail && (
                        <p className="mt-1 break-all text-xs text-ink-600">
                          {
                            lead.bestEmail
                          }
                        </p>
                      )}

                      {lead.additionalPhones && (
                        <p className="mt-1 text-xs text-ink-500">
                          Additional:{" "}
                          {
                            lead.additionalPhones
                          }
                        </p>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <p className="font-semibold tabular-nums text-ink-950">
                        {formatMoney(
                          lead.amountCents,
                        )}
                      </p>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <p className="text-sm text-ink-700">
                        {formatDate(
                          lead.assignedAt,
                        )}
                      </p>

                      {lead.isNew && (
                        <span className="mt-2 inline-flex rounded-full bg-accent-100 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-accent-800">
                          New
                        </span>
                      )}
                    </td>

                    <td className="min-w-48 px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/pro/my-leads/${encodeURIComponent(
                            lead.assignmentId,
                          )}`}
                          className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset"
                        >
                          Open Lead
                        </Link>

                        <Link
                          href={
                            startWorkHref(
                              lead,
                            )
                          }
                          className="rounded-lg bg-ink-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-ink-800"
                        >
                          Start Work
                        </Link>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}