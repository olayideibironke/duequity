import type { Metadata } from "next";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import {
  Badge,
  Tag,
} from "@/components/ui/badge";

import {
  can,
} from "@/lib/session";

import { getSupabaseAdmin } from "@/server/supabase-admin";
import { resolveStaffSession } from "@/server/staff-session";

import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

import { inviteStaffMember } from "./actions";

export const metadata: Metadata = {
  title: "Staff Management",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface StaffUserRow {
  id: string;

  name: string;

  email: string;

  role: string;

  title: string;

  states_cleared: string[] | null;

  mfa_enrolled: boolean;

  status: string;

  created_at: string;
}

interface StaffManagementPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
] as const;

const ORDINARY_STAFF_ROLES = [
  {
    value:
      "research_analyst",

    label:
      "Research Analyst",
  },
  {
    value:
      "operations_specialist",

    label:
      "Operations Specialist",
  },
  {
    value:
      "claims_manager",

    label:
      "Claims Manager",
  },
  {
    value:
      "compliance_officer",

    label:
      "Compliance Officer",
  },
  {
    value:
      "attorney_liaison",

    label:
      "Attorney Liaison",
  },
] as const;

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function roleLabel(
  role: string,
): string {
  return role
    .split("_")
    .map((word) =>
      word.length > 0
        ? `${word[0].toUpperCase()}${word.slice(1)}`
        : word,
    )
    .join(" ");
}

function statusTone(
  status: string,
): "neutral" | "positive" | "caution" {
  switch (status) {
    case "active":
      return "positive";

    case "invited":
      return "caution";

    default:
      return "neutral";
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function StaffManagementPage({
  searchParams,
}: StaffManagementPageProps) {
  const params =
    await searchParams;

  const session =
    await resolveStaffSession();

  if (!session) {
    return <StaffAuthenticationRequired />;
  }

  if (
    !can(
      session,
      "user.manage",
    )
  ) {
    return (
      <div className="space-y-5">
        <div>
          <p className="eyebrow text-ink-500">
            Administration
          </p>

          <h1 className="mt-1.5 text-2xl">
            Staff Management
          </h1>
        </div>

        <Callout
          tone="critical"
          title="Access not permitted"
          role="alert"
        >
          <p>
            Your current staff role does not hold the user.manage permission.
          </p>
        </Callout>
      </div>
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from("staff_users")
      .select(
        "id, name, email, role, title, states_cleared, mfa_enrolled, status, created_at",
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to load staff users: ${error.message}`,
    );
  }

  const staffUsers =
    (data ?? []) as StaffUserRow[];

  const activeCount =
    staffUsers.filter(
      (staff) =>
        staff.status === "active",
    ).length;

  const invitedCount =
    staffUsers.filter(
      (staff) =>
        staff.status === "invited",
    ).length;

  const suspendedCount =
    staffUsers.filter(
      (staff) =>
        staff.status === "suspended",
    ).length;

  const roleOptions =
    session.user.role === "super_admin"
      ? [
          ...ORDINARY_STAFF_ROLES,
          {
            value:
              "administrator",

            label:
              "Administrator",
          },
          {
            value:
              "super_admin",

            label:
              "Super Administrator",
          },
        ]
      : ORDINARY_STAFF_ROLES;

  return (
    <div className="space-y-5">
      {/* ================================================================= header */}
      <div>
        <p className="eyebrow text-ink-500">
          Administration
        </p>

        <h1 className="mt-1.5 text-2xl">
          Staff Management
        </h1>

        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
          Invite authorized DueQuity staff, assign their operational role and
          define the states they are cleared to work. Staff access is not active
          until the employee accepts the invitation and creates a password.
        </p>
      </div>

      {/* ================================================================= stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Staff profiles"
          value={staffUsers.length.toLocaleString()}
          context="All DueQuity staff records"
        />

        <Stat
          label="Active"
          value={activeCount.toLocaleString()}
          context="Authorized staff accounts"
        />

        <Stat
          label="Invited"
          value={invitedCount.toLocaleString()}
          context="Awaiting account activation"
        />

        <Stat
          label="Suspended"
          value={suspendedCount.toLocaleString()}
          context="Access currently disabled"
        />
      </div>

      {/* ============================================================ messages */}
      {params.status === "invited" ? (
        <Callout
          tone="positive"
          role="status"
          title="Staff invitation sent"
        >
          <p>
            The staff profile was created and a secure account activation
            invitation was sent to the employee&apos;s business email.
          </p>
        </Callout>
      ) : null}

      {params.status === "invalid" ? (
        <Callout
          tone="critical"
          role="alert"
          title="Check the invitation details"
        >
          <p>
            Name, business email, title and staff role are required.
          </p>
        </Callout>
      ) : null}

      {params.status === "unavailable" ? (
        <Callout
          tone="critical"
          role="alert"
          title="Invitation could not be created"
        >
          <p>
            DueQuity could not create this staff invitation. Check that the
            email is not already associated with a staff account and try again.
          </p>
        </Callout>
      ) : null}

      {/* =============================================================== invite */}
      <Card>
        <CardHeader
          title="Invite staff member"
          description="Create a controlled staff account invitation. No temporary password is created or shared."
        />

        <CardBody>
          <form
            action={inviteStaffMember}
            className="space-y-5"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-ink-800"
                >
                  Legal name
                </label>

                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-ink-800"
                >
                  Business email
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-ink-800"
                >
                  Job title
                </label>

                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-ink-800"
                >
                  DueQuity role
                </label>

                <select
                  id="role"
                  name="role"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                >
                  <option
                    value=""
                    disabled
                  >
                    Select a role
                  </option>

                  {roleOptions.map((role) => (
                    <option
                      key={role.value}
                      value={role.value}
                    >
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="statesCleared"
                className="block text-sm font-medium text-ink-800"
              >
                States cleared
              </label>

              <select
                id="statesCleared"
                name="statesCleared"
                multiple
                className="min-h-44 w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
              >
                {STATES.map(
                  ([code, name]) => (
                    <option
                      key={code}
                      value={code}
                    >
                      {code} - {name}
                    </option>
                  ),
                )}
              </select>

              <p className="text-xs leading-relaxed text-ink-500">
                Select the states this employee is authorized to work. Leave
                this blank only when the staff role is intentionally cleared
                for all states.
              </p>
            </div>

            <Callout
              tone="neutral"
              title="Controlled staff activation"
            >
              <p>
                The employee will receive a one-time invitation by email. Their
                staff profile remains invited and cannot enter the DueQuity
                operations workspace until activation is completed.
              </p>
            </Callout>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                Send staff invitation
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* =============================================================== roster */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Staff roster"
          description={`${staffUsers.length.toLocaleString()} ${
            staffUsers.length === 1
              ? "staff profile"
              : "staff profiles"
          } currently recorded.`}
        />

        <CardBody flush>
          {staffUsers.length === 0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="No staff profiles"
              description="Invite the first DueQuity staff member above."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {staffUsers.map(
                (staff) => (
                  <li
                    key={staff.id}
                    className="px-4 py-4 sm:px-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink-900">
                            {staff.name}
                          </p>

                          <Badge
                            tone={statusTone(
                              staff.status,
                            )}
                          >
                            {staff.status}
                          </Badge>

                          <Tag>
                            {roleLabel(
                              staff.role,
                            )}
                          </Tag>
                        </div>

                        <p className="mt-1 text-sm text-ink-600">
                          {staff.title}
                        </p>

                        <p className="mt-1 text-sm text-ink-600">
                          {staff.email}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {staff.states_cleared &&
                          staff.states_cleared.length > 0 ? (
                            staff.states_cleared.map(
                              (state) => (
                                <Tag
                                  key={state}
                                >
                                  {state}
                                </Tag>
                              ),
                            )
                          ) : (
                            <Tag>
                              All states
                            </Tag>
                          )}
                        </div>
                      </div>

                      <div className="text-right text-xs text-ink-500">
                        <p>
                          MFA{" "}
                          {staff.mfa_enrolled
                            ? "enrolled"
                            : "not enrolled"}
                        </p>

                        <p className="mt-1">
                          Added{" "}
                          {staff.created_at.slice(
                            0,
                            10,
                          )}
                        </p>
                      </div>
                    </div>
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