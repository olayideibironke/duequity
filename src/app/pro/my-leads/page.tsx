import type {
  Metadata,
} from "next";

import {
  redirect,
} from "next/navigation";

import {
  MyLeadsSeenMarker,
} from "@/components/pro/my-leads-seen-marker";

import {
  MyLeadsWorkspace,
} from "@/components/pro/my-leads-workspace";

import {
  can,
} from "@/lib/session";

import {
  listStaffMyLeads,
} from "@/server/staff-my-leads-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const metadata:
  Metadata = {
  title:
    "My Leads",
};

export const dynamic =
  "force-dynamic";

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

function formatMoney(
  cents:
    number,
): string {
  return currencyFormatter.format(
    cents /
      100,
  );
}

export default async function MyLeadsPage() {
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

  const leads =
    await listStaffMyLeads(
      session,
    );

  const newLeads =
    leads.filter(
      (
        lead,
      ) =>
        lead.isNew,
    );

  const assignedValueCents =
    leads.reduce(
      (
        total,
        lead,
      ) =>
        total +
        (
          lead.amountCents ??
          0
        ),
      0,
    );

  const newLocations =
    Array.from(
      new Set(
        newLeads.map(
          (
            lead,
          ) =>
            `${lead.county}, ${lead.stateCode}`,
        ),
      ),
    );

  return (
    <div className="space-y-5">
      <MyLeadsSeenMarker
        assignmentIds={
          newLeads.map(
            (
              lead,
            ) =>
              lead.assignmentId,
          )
        }
      />

      <div>
        <p className="eyebrow text-ink-500">
          Pipeline
        </p>

        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-ink-950">
          My Leads
        </h1>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-ink-600">
          Recovery leads assigned directly to your DueQuity staff account.
          Search, review, export and begin claimant outreach work from this
          workspace.
        </p>
      </div>

      {
        newLeads.length >
          0 &&
        (
          <div className="rounded-xl border border-accent-300 bg-accent-50 px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex size-2.5 rounded-full bg-accent-600" />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-950">
                  New leads added
                </p>

                <p className="mt-0.5 text-sm text-ink-600">
                  {
                    newLeads.length
                  }{" "}
                  new{" "}
                  {
                    newLeads.length ===
                      1
                      ? "lead has"
                      : "leads have"
                  }{" "}
                  been assigned to you
                  {
                    newLocations.length >
                      0
                      ? ` · ${newLocations.join(
                          " · ",
                        )}`
                      : ""
                  }
                  .
                </p>
              </div>

              <span className="rounded-full bg-accent-600 px-2.5 py-1 text-xs font-semibold text-white">
                {
                  newLeads.length
                }{" "}
                new
              </span>
            </div>
          </div>
        )
      }

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-line bg-paper p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Active assigned leads
          </p>

          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink-950">
            {
              leads.length.toLocaleString()
            }
          </p>
        </div>

        <div className="rounded-xl border border-line bg-paper p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            New
          </p>

          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink-950">
            {
              newLeads.length.toLocaleString()
            }
          </p>
        </div>

        <div className="rounded-xl border border-line bg-paper p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Assigned value
          </p>

          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-950">
            {
              formatMoney(
                assignedValueCents,
              )
            }
          </p>
        </div>
      </div>

      {
        leads.length ===
          0
          ? (
              <div className="rounded-xl border border-dashed border-line bg-paper px-5 py-12 text-center">
                <h2 className="font-serif text-xl font-semibold text-ink-950">
                  No assigned leads yet
                </h2>

                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-600">
                  New recovery leads will appear here automatically when
                  DueQuity Admin assigns them to you.
                </p>
              </div>
            )
          : (
              <MyLeadsWorkspace
                leads={
                  leads
                }
              />
            )
      }
    </div>
  );
}