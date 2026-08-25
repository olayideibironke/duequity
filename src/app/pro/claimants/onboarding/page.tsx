import type {
  Metadata,
} from "next";

import {
  Badge,
} from "@/components/ui/badge";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@/components/ui/surface";

import {
  can,
} from "@/lib/session";

import {
  listClaimantActivationCandidates,
  listClaimantActivationInvitations,
} from "@/server/claimant-invite-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  sendClaimantActivationInvitation,
} from "./actions";

export const metadata: Metadata = {
  title:
    "Claimant Onboarding",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ClaimantOnboardingPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formatTimestamp(
  value:
    string | undefined,
): string {
  if (!value) {
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

function statusTone(
  status:
    string,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral"
  | "info" {
  switch (
    status
  ) {
    case "activated":
      return "positive";

    case "sent":
    case "preparing":
      return "info";

    case "failed":
    case "revoked":
      return "critical";

    case "expired":
      return "caution";

    default:
      return "neutral";
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ClaimantOnboardingPage({
  searchParams,
}: ClaimantOnboardingPageProps) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const params =
    await searchParams;

  const mayInvite =
    can(
      session,
      "claim.read",
    ) &&
    can(
      session,
      "claim.write",
    ) &&
    can(
      session,
      "claimant.read",
    ) &&
    can(
      session,
      "claimant.write",
    );

  const [
    candidates,
    invitations,
  ] =
    await Promise.all([
      listClaimantActivationCandidates(
        session,
      ),

      listClaimantActivationInvitations(
        session,
      ),
    ]);

  const superAdmin =
    session.user.role ===
    "super_admin";

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-ink-500">
          Claimants
        </p>

        <h1 className="mt-1.5 text-2xl sm:text-3xl">
          Claimant Onboarding
        </h1>

        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-600">
          {superAdmin
            ? "Manage controlled claimant activation across all DueQuity claimant assignments."
            : "Send controlled My DueQuity activation invitations only for claimants currently assigned to you."}
        </p>
      </div>

      {params.status ===
        "sent" && (
        <Callout
          tone="positive"
          title="Activation invitation sent"
          role="status"
        >
          The claimant was sent a secure DueQuity activation email. Their Claimant ID and confirmed identity information are locked to the invitation.
        </Callout>
      )}

      {params.status ===
        "invalid" && (
        <Callout
          tone="critical"
          title="Check the onboarding information"
          role="alert"
        >
          Select a claimant, enter the confirmed legal first and last name, confirmed email and U.S. mobile number, and complete the confirmation checkbox.
        </Callout>
      )}

      {params.status ===
        "legal-name-mismatch" && (
        <Callout
          tone="critical"
          title="Legal name does not match"
          role="alert"
        >
          The legal first and last name entered here do not match the claimant identity already saved to this recovery. Update the claimant record through the controlled claimant workflow before sending activation.
        </Callout>
      )}

      {params.status ===
        "email-mismatch" && (
        <Callout
          tone="critical"
          title="Email does not match"
          role="alert"
        >
          The email entered here does not match the claimant email already saved to this recovery. Save the approved contact change first, then send activation.
        </Callout>
      )}

      {params.status ===
        "mobile-mismatch" && (
        <Callout
          tone="critical"
          title="Mobile number does not match"
          role="alert"
        >
          The mobile number entered here does not match the claimant mobile number already saved to this recovery. Save the approved contact change first, then send activation.
        </Callout>
      )}

      {params.status ===
        "claimant-record-incomplete" && (
        <Callout
          tone="critical"
          title="Claimant record is incomplete"
          role="alert"
        >
          The saved claimant identity or contact record is incomplete. Finish the claimant onboarding record before issuing an activation invitation.
        </Callout>
      )}

      {params.status ===
        "already-active" && (
        <Callout
          tone="caution"
          title="Claimant account already exists"
          role="alert"
        >
          This claimant already has a My DueQuity authentication identity. Do not issue another activation invitation.
        </Callout>
      )}

      {params.status ===
        "open-invitation" && (
        <Callout
          tone="caution"
          title="Activation invitation already open"
          role="alert"
        >
          This claimant already has an active activation invitation. Do not create another invitation while the existing one remains open.
        </Callout>
      )}

      {params.status ===
        "claimant-not-found" && (
        <Callout
          tone="critical"
          title="Claimant record unavailable"
          role="alert"
        >
          DueQuity could not find an accessible claimant record for this request. Refresh the page and select a current claimant record.
        </Callout>
      )}

      {params.status ===
        "claimant-review-required" && (
        <Callout
          tone="caution"
          title="Claimant review required"
          role="alert"
        >
          This activation workflow currently supports individual claimant records only. Estate, trust and business claimant records require the appropriate controlled review workflow.
        </Callout>
      )}

      {params.status ===
        "auth-collision" && (
        <Callout
          tone="critical"
          title="Authentication identity conflict"
          role="alert"
        >
          A DueQuity staff authentication identity cannot also be used as this claimant identity. Resolve the account ownership before continuing.
        </Callout>
      )}

      {params.status ===
        "not-authorized" && (
        <Callout
          tone="critical"
          title="Invitation not authorized"
          role="alert"
        >
          Your current DueQuity role is not authorized to create claimant activation invitations.
        </Callout>
      )}

      {params.status ===
        "unavailable" && (
        <Callout
          tone="critical"
          title="Invitation could not be sent"
          role="alert"
        >
          DueQuity could not complete the controlled claimant invitation. No activation should be assumed complete. Review the claimant record and try again, or investigate the server failure before proceeding.
        </Callout>
      )}

      {!mayInvite && (
        <Callout
          tone="caution"
          title="Read-only onboarding access"
        >
          Your current DueQuity role may review claimant onboarding, but it cannot create claimant activation invitations.
        </Callout>
      )}

      <Card>
        <CardHeader
          title="Send claimant activation"
          description={
            superAdmin
              ? "Eligible claimant records across all staff assignments are available. Claimant identity and recovery linkage remain system-controlled."
              : "Only claimant records currently assigned to you are available. Claimant identity and recovery linkage remain system-controlled."
          }
        />

        <CardBody>
          {candidates.length ===
            0 ? (
            <EmptyState
              compact
              title="No claimant records awaiting invitation"
              description="A claimant record must already exist from the approved recovery workflow and be accessible to your staff account before an activation invitation can be sent."
            />
          ) : (
            <form
              action={
                sendClaimantActivationInvitation
              }
              className="space-y-5"
            >
              <div className="space-y-2">
                <label
                  htmlFor="claimantId"
                  className="block text-sm font-semibold text-ink-800"
                >
                  Claimant record
                </label>

                <select
                  id="claimantId"
                  name="claimantId"
                  required
                  disabled={
                    !mayInvite
                  }
                  defaultValue=""
                  className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option
                    value=""
                    disabled
                  >
                    Select claimant
                  </option>

                  {candidates.map(
                    (
                      candidate,
                    ) => (
                      <option
                        key={
                          candidate.claimantId
                        }
                        value={
                          candidate.claimantId
                        }
                      >
                        {candidate.claimantReference} | {candidate.currentLegalName} | {candidate.claimReference}
                      </option>
                    ),
                  )}
                </select>

                <p className="text-xs leading-relaxed text-ink-500">
                  The Claimant ID shown here is generated and controlled by DueQuity. Staff and claimants cannot edit it.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="legalFirstName"
                    className="block text-sm font-semibold text-ink-800"
                  >
                    Confirmed legal first name
                  </label>

                  <input
                    id="legalFirstName"
                    name="legalFirstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    disabled={
                      !mayInvite
                    }
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="legalLastName"
                    className="block text-sm font-semibold text-ink-800"
                  >
                    Confirmed legal last name
                  </label>

                  <input
                    id="legalLastName"
                    name="legalLastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    disabled={
                      !mayInvite
                    }
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block text-sm font-semibold text-ink-800"
                  >
                    Confirmed email
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    disabled={
                      !mayInvite
                    }
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:opacity-60"
                  />

                  <p className="text-xs text-ink-500">
                    Read the email address back to the claimant before sending.
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="mobilePhone"
                    className="block text-sm font-semibold text-ink-800"
                  >
                    Confirmed U.S. mobile
                  </label>

                  <input
                    id="mobilePhone"
                    name="mobilePhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(555) 123-4567"
                    required
                    disabled={
                      !mayInvite
                    }
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:opacity-60"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-line bg-inset px-4 py-4">
                <input
                  type="checkbox"
                  name="confirmation"
                  value="confirmed"
                  required
                  disabled={
                    !mayInvite
                  }
                  className="mt-0.5 size-4"
                />

                <span className="text-sm leading-relaxed text-ink-700">
                  I confirmed the claimant&apos;s legal first and last name, read back the email address and mobile number, and the claimant gave permission for DueQuity to send secure activation materials.
                </span>
              </label>

              <Callout
                tone="neutral"
                title="What the claimant receives"
              >
                The claimant receives a one-time secure activation link. Their legal name, Claimant ID and email are locked. They create their own password. After activation, a government-issued photo ID is required before claim processing can continue.
              </Callout>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={
                    !mayInvite
                  }
                  className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send claimant activation
                </button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Activation history"
          description={`${invitations.length.toLocaleString()} accessible claimant activation invitation${
            invitations.length ===
            1
              ? ""
              : "s"
          } recorded.`}
        />

        <CardBody flush>
          {invitations.length ===
            0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="No claimant invitations yet"
              description="Controlled claimant invitations accessible to your staff account will appear here."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {invitations.map(
                (
                  invitation,
                ) => (
                  <li
                    key={
                      invitation.id
                    }
                    className="px-4 py-4 sm:px-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-xs font-semibold text-white">
                            {
                              invitation.claimantReference
                            }
                          </span>

                          <Badge
                            tone={
                              statusTone(
                                invitation.status,
                              )
                            }
                          >
                            {
                              invitation.status
                            }
                          </Badge>
                        </div>

                        <p className="mt-2 font-semibold text-ink-900">
                          {invitation.legalFirstName} {invitation.legalLastName}
                        </p>

                        <p className="mt-1 text-sm text-ink-600">
                          {
                            invitation.email
                          }
                        </p>

                        <p className="mt-0.5 text-xs text-ink-500">
                          Mobile: {invitation.mobilePhone}
                        </p>
                      </div>

                      <div className="text-right text-xs leading-relaxed text-ink-500">
                        <p>
                          Sent:{" "}
                          {formatTimestamp(
                            invitation.sentAt,
                          )}
                        </p>

                        <p>
                          Expires:{" "}
                          {formatTimestamp(
                            invitation.expiresAt,
                          )}
                        </p>

                        {invitation.activatedAt && (
                          <p className="text-accent-700">
                            Activated:{" "}
                            {formatTimestamp(
                              invitation.activatedAt,
                            )}
                          </p>
                        )}
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