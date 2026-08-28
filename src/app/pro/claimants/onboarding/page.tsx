import type {
  Metadata,
} from "next";

import Link from "next/link";

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
  formatCents,
} from "@/lib/format";

import {
  searchClaimantIntakeCandidates,
  type ClaimantIntakeCandidate,
} from "@/server/claimant-intake-service";

import {
  listClaimantActivationCandidates,
  listClaimantActivationInvitations,
  type ClaimantActivationCandidate,
  type ClaimantActivationInvitation,
} from "@/server/claimant-invite-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  createClaimantFromConfirmedCallAction,
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
    q?: string;
    claimantId?: string;
  }>;
}

type LeadClaimantState =
  | "not_created"
  | "ready_for_activation"
  | "invitation_open"
  | "activated";

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

function routeBadgeTone(
  candidate:
    ClaimantIntakeCandidate,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  return candidate.route.tone;
}

function titleCase(
  value:
    string,
): string {
  return value
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (
        character,
      ) =>
        character.toUpperCase(),
    );
}

function legalNameParts(
  legalName:
    string,
): {
  firstName:
    string;

  lastName:
    string;
} {
  const parts =
    legalName
      .trim()
      .replace(
        /\s+/g,
        " ",
      )
      .split(
        " ",
      )
      .filter(
        Boolean,
      );

  if (
    parts.length ===
    0
  ) {
    return {
      firstName:
        "",

      lastName:
        "",
    };
  }

  if (
    parts.length ===
    1
  ) {
    return {
      firstName:
        parts[0],

      lastName:
        "",
    };
  }

  return {
    firstName:
      parts[0],

    /*
     * Preserve every remaining token so recombining first + last produces
     * exactly the persisted legal name even when the person has middle names.
     */
    lastName:
      parts
        .slice(
          1,
        )
        .join(
          " ",
        ),
  };
}

function claimantStateForClaim({
  claimId,
  activationCandidates,
  invitations,
}: {
  claimId:
    string | undefined;

  activationCandidates:
    ClaimantActivationCandidate[];

  invitations:
    ClaimantActivationInvitation[];
}): {
  state:
    LeadClaimantState;

  activationCandidate?:
    ClaimantActivationCandidate;
} {
  if (!claimId) {
    return {
      state:
        "not_created",
    };
  }

  const activated =
    invitations.some(
      (
        invitation,
      ) =>
        invitation.claimId ===
          claimId &&
        invitation.status ===
          "activated",
    );

  if (activated) {
    return {
      state:
        "activated",
    };
  }

  const openInvitation =
    invitations.some(
      (
        invitation,
      ) =>
        invitation.claimId ===
          claimId &&
        (
          invitation.status ===
            "sent" ||
          invitation.status ===
            "preparing"
        ),
    );

  if (openInvitation) {
    return {
      state:
        "invitation_open",
    };
  }

  const activationCandidate =
    activationCandidates.find(
      (
        candidate,
      ) =>
        candidate.claimId ===
        claimId,
    );

  if (activationCandidate) {
    return {
      state:
        "ready_for_activation",

      activationCandidate,
    };
  }

  return {
    state:
      "not_created",
  };
}

/* ========================================================================== */
/* Lead result                                                                 */
/* ========================================================================== */

function LeadResultCard({
  candidate,
  query,
  mayCreateClaimant,
  claimantState,
  activationCandidate,
}: {
  candidate:
    ClaimantIntakeCandidate;

  query:
    string;

  mayCreateClaimant:
    boolean;

  claimantState:
    LeadClaimantState;

  activationCandidate?:
    ClaimantActivationCandidate;
}) {
  const ownerNames =
    candidate.formerOwnerNames.length >
    0
      ? candidate.formerOwnerNames.join(
          " / ",
        )
      : "Former owner not recorded";

  const creationAllowed =
    mayCreateClaimant &&
    candidate.route.intakeCleared &&
    candidate.converted &&
    Boolean(
      candidate.claimId,
    ) &&
    claimantState ===
      "not_created";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      {/* ================================================================== */}
      {/* Record header                                                       */}
      {/* ================================================================== */}

      <div className="border-b border-line-subtle px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-xs font-semibold text-white">
                {
                  candidate.opportunityReference
                }
              </span>

              <Badge
                tone={
                  routeBadgeTone(
                    candidate,
                  )
                }
              >
                {
                  candidate.route.code
                }{" "}
                ·{" "}
                {
                  candidate.route.label
                }
              </Badge>

              {candidate.converted ? (
                <Badge tone="positive">
                  Claim exists
                </Badge>
              ) : (
                <Badge tone="neutral">
                  Opportunity
                </Badge>
              )}

              {claimantState ===
                "ready_for_activation" && (
                <Badge tone="info">
                  Claimant created
                </Badge>
              )}

              {claimantState ===
                "invitation_open" && (
                <Badge tone="info">
                  Activation sent
                </Badge>
              )}

              {claimantState ===
                "activated" && (
                <Badge tone="positive">
                  Claimant activated
                </Badge>
              )}
            </div>

            <h3 className="mt-3 text-lg font-semibold text-ink-950">
              {ownerNames}
            </h3>

            <p className="mt-1 text-sm leading-relaxed text-ink-600">
              {
                candidate.propertyAddress
              }
            </p>
          </div>

          <div className="text-right">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-400">
              {
                candidate.surplusQuality ===
                "confirmed"
                  ? "Confirmed surplus"
                  : "Estimated surplus"
              }
            </p>

            <p className="mt-1 tnum text-lg font-semibold text-ink-950">
              {formatCents(
                candidate.surplusAmount,
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Source + route                                                      */}
      {/* ================================================================== */}

      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="border-b border-line-subtle px-5 py-5 lg:border-b-0 lg:border-r">
          <p className="eyebrow text-ink-500">
            Source record to verify
          </p>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-ink-500">
                Former owner
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {ownerNames}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                County / state
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {candidate.county
                  ? `${candidate.county}, `
                  : ""}
                {
                  candidate.state
                }
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-ink-500">
                Foreclosed property
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {
                  candidate.propertyAddress
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Sale type
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {titleCase(
                  candidate.saleType,
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Opportunity status
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {titleCase(
                  candidate.opportunityStatus,
                )}
              </dd>
            </div>
          </dl>

          <Callout
            className="mt-5"
            tone="neutral"
            title="Phone verification"
          >
            Confirm the caller&apos;s first and last name and ask them to confirm that they previously owned or had an interest in the property shown above. Do not alter the government/source record from this screen.
          </Callout>
        </div>

        <div className="px-5 py-5">
          <p className="eyebrow text-ink-500">
            DueQuity recovery route
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-ink-950 px-3 py-1.5 font-mono text-sm font-bold tracking-wide text-white">
              {
                candidate.route.code
              }
            </span>

            <Badge
              tone={
                routeBadgeTone(
                  candidate,
                )
              }
            >
              {
                candidate.route.label
              }
            </Badge>
          </div>

          <dl className="mt-5 space-y-4">
            <div>
              <dt className="text-xs font-medium text-ink-500">
                Filing control
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {
                  candidate.route.filingPartyLabel
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Payment route
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {
                  candidate.route.paymentRouteLabel
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                DueQuity may file
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  candidate.route.representativeMayFile ===
                  "yes"
                    ? "Yes"
                    : candidate.route.representativeMayFile ===
                        "no"
                      ? "No"
                      : "Not cleared"
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                DueQuity may receive payment
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  candidate.route.representativeMayReceivePayment ===
                  "yes"
                    ? "Yes"
                    : candidate.route.representativeMayReceivePayment ===
                        "no"
                      ? "No"
                      : "Not cleared"
                }
              </dd>
            </div>
          </dl>

          <Callout
            className="mt-5"
            tone={
              candidate.route.intakeCleared
                ? "positive"
                : candidate.route.code ===
                    "ATTY"
                  ? "caution"
                  : "critical"
            }
            title={
              candidate.route.intakeCleared
                ? "Intake route cleared"
                : candidate.route.code ===
                    "ATTY"
                  ? "Attorney route"
                  : "Do not advance intake"
            }
          >
            {
              candidate.route.reason
            }
          </Callout>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Claim linkage                                                       */}
      {/* ================================================================== */}

      <div className="border-t border-line-subtle bg-inset px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {candidate.converted ? (
              <>
                <p className="text-sm font-semibold text-ink-900">
                  Claim already created
                </p>

                <p className="mt-0.5 text-xs text-ink-500">
                  {candidate.claimReference ??
                    candidate.claimId}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink-900">
                  Claim has not been created yet
                </p>

                <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-ink-500">
                  The Opportunity must pass DueQuity&apos;s existing conversion controls before a claimant record can be created.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/pro/opportunities/${candidate.opportunityId}`}
              className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 transition hover:border-ink-300 hover:bg-ink-50"
            >
              Open opportunity
            </Link>

            {candidate.converted &&
              candidate.claimId && (
                <Link
                  href={`/pro/claims/${candidate.claimId}`}
                  className="rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
                >
                  Open claim
                </Link>
              )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Existing claimant states                                             */}
      {/* ================================================================== */}

      {claimantState ===
        "activated" && (
        <div className="border-t border-line-subtle px-5 py-5">
          <Callout
            tone="positive"
            title="Claimant already activated"
          >
            A claimant record and My DueQuity account already exist for this Claim. Do not create another claimant record or send another activation invitation.
          </Callout>
        </div>
      )}

      {claimantState ===
        "invitation_open" && (
        <div className="border-t border-line-subtle px-5 py-5">
          <Callout
            tone="info"
            title="Activation invitation already sent"
          >
            The claimant record already exists and an activation invitation is currently open. Wait for the claimant to complete activation or use the controlled invitation workflow if intervention is later required.
          </Callout>
        </div>
      )}

      {claimantState ===
        "ready_for_activation" &&
        activationCandidate && (
          <div className="border-t border-line-subtle px-5 py-5">
            <Callout
              tone="positive"
              title="Claimant record already created"
            >
              {activationCandidate.claimantReference} is ready for secure activation. Continue below without recreating the claimant.
            </Callout>

            <div className="mt-4">
              <Link
                href={`/pro/claimants/onboarding?q=${encodeURIComponent(
                  query,
                )}&claimantId=${encodeURIComponent(
                  activationCandidate.claimantId,
                )}#send-claimant-activation`}
                className="inline-flex rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                Continue to activation
              </Link>
            </div>
          </div>
        )}

      {/* ================================================================== */}
      {/* New claimant creation                                                */}
      {/* ================================================================== */}

      {creationAllowed &&
        candidate.claimId && (
          <div className="border-t border-line-subtle px-5 py-6">
            <div className="max-w-4xl">
              <p className="eyebrow text-accent-700">
                Next step
              </p>

              <h4 className="mt-1 text-lg font-semibold text-ink-950">
                Create claimant from confirmed call
              </h4>

              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Enter only the identity and contact information the claimant personally confirmed. The source property and county route remain system-controlled.
              </p>
            </div>

            <form
              action={
                createClaimantFromConfirmedCallAction
              }
              className="mt-5 space-y-5"
            >
              <input
                type="hidden"
                name="claimId"
                value={
                  candidate.claimId
                }
              />

              <input
                type="hidden"
                name="q"
                value={
                  query
                }
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor={`legalFirstName-${candidate.opportunityId}`}
                    className="block text-sm font-semibold text-ink-800"
                  >
                    Confirmed legal first name
                  </label>

                  <input
                    id={`legalFirstName-${candidate.opportunityId}`}
                    name="legalFirstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    placeholder="First name confirmed by claimant"
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor={`legalLastName-${candidate.opportunityId}`}
                    className="block text-sm font-semibold text-ink-800"
                  >
                    Confirmed legal last name
                  </label>

                  <input
                    id={`legalLastName-${candidate.opportunityId}`}
                    name="legalLastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    placeholder="Last name confirmed by claimant"
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor={`email-${candidate.opportunityId}`}
                    className="block text-sm font-semibold text-ink-800"
                  >
                    Confirmed email
                  </label>

                  <input
                    id={`email-${candidate.opportunityId}`}
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="claimant@example.com"
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  />

                  <p className="text-xs leading-relaxed text-ink-500">
                    Read the complete email address back to the claimant before saving.
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor={`mobilePhone-${candidate.opportunityId}`}
                    className="block text-sm font-semibold text-ink-800"
                  >
                    Confirmed U.S. mobile
                  </label>

                  <input
                    id={`mobilePhone-${candidate.opportunityId}`}
                    name="mobilePhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    required
                    placeholder="(555) 123-4567"
                    className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  />

                  <p className="text-xs leading-relaxed text-ink-500">
                    Use the claimant&apos;s confirmed 10-digit U.S. mobile number.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-xl border border-line bg-inset px-4 py-4">
                  <input
                    type="checkbox"
                    name="propertyConnectionConfirmed"
                    value="confirmed"
                    required
                    className="mt-0.5 size-4"
                  />

                  <span className="text-sm leading-relaxed text-ink-700">
                    The claimant confirmed that they previously owned or had an interest in the foreclosed property shown above.
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-line bg-inset px-4 py-4">
                  <input
                    type="checkbox"
                    name="activationEmailConsentConfirmed"
                    value="confirmed"
                    required
                    className="mt-0.5 size-4"
                  />

                  <span className="text-sm leading-relaxed text-ink-700">
                    The claimant voluntarily agreed to move forward with DueQuity and gave permission for DueQuity to send secure activation materials to the confirmed email address.
                  </span>
                </label>
              </div>

              <Callout
                tone="neutral"
                title="Do not collect sensitive information here"
              >
                Do not enter Social Security numbers, bank information, card information, passwords, authentication codes, government ID images or signatures in this intake form.
              </Callout>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-2xl text-xs leading-relaxed text-ink-500">
                  Creating the claimant links the confirmed person to this existing Claim. It does not verify entitlement, approve payment, file with an agency, or activate the claimant account.
                </p>

                <button
                  type="submit"
                  className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                >
                  Create claimant record
                </button>
              </div>
            </form>
          </div>
        )}

      {/* ================================================================== */}
      {/* Cannot create claimant                                               */}
      {/* ================================================================== */}

      {candidate.route.intakeCleared &&
        !candidate.converted && (
          <div className="border-t border-line-subtle px-5 py-5">
            <Callout
              tone="caution"
              title="Claim conversion required first"
            >
              This county route is cleared, but the Opportunity has not yet become a Claim. Complete the existing controlled Opportunity conversion before claimant creation.
            </Callout>
          </div>
        )}

      {!candidate.route.intakeCleared && (
        <div className="border-t border-line-subtle px-5 py-5">
          <Callout
            tone={
              candidate.route.code ===
              "ATTY"
                ? "caution"
                : "critical"
            }
            title="Claimant creation blocked"
          >
            This recovery may not advance through ordinary claimant intake while the current route remains {candidate.route.label.toLowerCase()}.
          </Callout>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Activation card                                                            */
/* ========================================================================== */

function ActivationCandidateCard({
  candidate,
  mayInvite,
  selected,
}: {
  candidate:
    ClaimantActivationCandidate;

  mayInvite:
    boolean;

  selected:
    boolean;
}) {
  const {
    firstName,
    lastName,
  } =
    legalNameParts(
      candidate.currentLegalName,
    );

  return (
    <div
      className={[
        "rounded-2xl border bg-white p-5",
        selected
          ? "border-accent-300 ring-2 ring-accent-100"
          : "border-line",
      ].join(
        " ",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-xs font-semibold text-white">
              {
                candidate.claimantReference
              }
            </span>

            <Badge tone="info">
              Ready for activation
            </Badge>
          </div>

          <p className="mt-3 font-semibold text-ink-950">
            {
              candidate.currentLegalName
            }
          </p>

          <p className="mt-1 text-sm text-ink-600">
            {
              candidate.currentEmail
            }
          </p>

          <p className="mt-0.5 text-xs text-ink-500">
            Claim:{" "}
            {
              candidate.claimReference
            }{" "}
            · Mobile:{" "}
            {
              candidate.currentMobilePhone
            }
          </p>
        </div>

        {selected && (
          <Badge tone="positive">
            Newly created
          </Badge>
        )}
      </div>

      <form
        action={
          sendClaimantActivationInvitation
        }
        className="mt-5 space-y-4"
      >
        <input
          type="hidden"
          name="claimantId"
          value={
            candidate.claimantId
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor={`activationFirst-${candidate.claimantId}`}
              className="block text-sm font-semibold text-ink-800"
            >
              Confirmed legal first name
            </label>

            <input
              id={`activationFirst-${candidate.claimantId}`}
              name="legalFirstName"
              type="text"
              required
              defaultValue={
                firstName
              }
              disabled={
                !mayInvite
              }
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:opacity-60"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor={`activationLast-${candidate.claimantId}`}
              className="block text-sm font-semibold text-ink-800"
            >
              Confirmed legal last name
            </label>

            <input
              id={`activationLast-${candidate.claimantId}`}
              name="legalLastName"
              type="text"
              required
              defaultValue={
                lastName
              }
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
              htmlFor={`activationEmail-${candidate.claimantId}`}
              className="block text-sm font-semibold text-ink-800"
            >
              Confirmed email
            </label>

            <input
              id={`activationEmail-${candidate.claimantId}`}
              name="email"
              type="email"
              required
              defaultValue={
                candidate.currentEmail
              }
              disabled={
                !mayInvite
              }
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:opacity-60"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor={`activationPhone-${candidate.claimantId}`}
              className="block text-sm font-semibold text-ink-800"
            >
              Confirmed U.S. mobile
            </label>

            <input
              id={`activationPhone-${candidate.claimantId}`}
              name="mobilePhone"
              type="tel"
              required
              defaultValue={
                candidate.currentMobilePhone
              }
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
            I reviewed the saved claimant identity and contact information and intend to send the controlled My DueQuity activation invitation.
          </span>
        </label>

        <Callout
          tone="neutral"
          title="What happens next"
        >
          DueQuity sends a one-time secure activation link to the saved email. The claimant creates their own password. After activation, the existing secure document workflow requests the required government-issued photo ID.
        </Callout>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={
              !mayInvite ||
              !firstName ||
              !lastName
            }
            className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send secure activation
          </button>
        </div>
      </form>
    </div>
  );
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

  const query =
    params.q
      ?.trim()
      .slice(
        0,
        200,
      ) ??
    "";

  const selectedClaimantId =
    params.claimantId
      ?.trim() ??
    "";

  const mayLocateLead =
    can(
      session,
      "opportunity.read",
    ) &&
    can(
      session,
      "claim.read",
    ) &&
    can(
      session,
      "claimant.read",
    );

  const mayCreateClaimant =
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

  const mayInvite =
    mayCreateClaimant;

  const [
    activationCandidates,
    invitations,
    intakeSearch,
  ] =
    await Promise.all([
      listClaimantActivationCandidates(
        session,
      ),

      listClaimantActivationInvitations(
        session,
      ),

      mayLocateLead &&
      query.length >=
        2
        ? searchClaimantIntakeCandidates({
            session,

            query,
          })
        : Promise.resolve({
            query,

            candidates:
              [],

            totalMatches:
              0,
          }),
    ]);

  const orderedActivationCandidates =
    activationCandidates
      .slice()
      .sort(
        (
          left,
          right,
        ) => {
          if (
            left.claimantId ===
            selectedClaimantId
          ) {
            return -1;
          }

          if (
            right.claimantId ===
            selectedClaimantId
          ) {
            return 1;
          }

          return left
            .claimantReference
            .localeCompare(
              right.claimantReference,
            );
        },
      );

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
          Find the Admin-assigned recovery record, verify the caller against the source property, confirm the DueQuity recovery route, create the claimant record, and send secure activation.
        </p>
      </div>

      {/* ================================================================== */}
      {/* Creation status                                                     */}
      {/* ================================================================== */}

      {params.status ===
        "claimant-created" && (
        <Callout
          tone="positive"
          title="Claimant record created"
          role="status"
        >
          The claimant is now persistently linked to the recovery. Their confirmed property connection and email communication consent were recorded. Continue to secure activation below.
        </Callout>
      )}

      {params.status ===
        "claimant-create-invalid" && (
        <Callout
          tone="critical"
          title="Complete the claimant intake form"
          role="alert"
        >
          First name, last name, email, mobile number, property confirmation and activation-email consent are required before creating a claimant.
        </Callout>
      )}

      {params.status ===
        "source-name-mismatch" && (
        <Callout
          tone="critical"
          title="Claimant name requires review"
          role="alert"
        >
          The first and last name confirmed on the call do not sufficiently match the former-owner identity on the recovery source record. Stop ordinary intake and review the identity before creating a claimant.
        </Callout>
      )}

      {params.status ===
        "property-confirmation-required" && (
        <Callout
          tone="critical"
          title="Property connection not confirmed"
          role="alert"
        >
          Claimant creation and activation are blocked until the person confirms their connection to the displayed foreclosed property.
        </Callout>
      )}

      {params.status ===
        "consent-required" && (
        <Callout
          tone="critical"
          title="Activation permission not recorded"
          role="alert"
        >
          An email address alone is not permission to use it. Record the claimant&apos;s permission for DueQuity to send secure activation materials before continuing.
        </Callout>
      )}

      {params.status ===
        "claim-not-found" && (
        <Callout
          tone="critical"
          title="Claim unavailable"
          role="alert"
        >
          The Claim or its source Opportunity could not be resolved. Do not create a disconnected claimant record.
        </Callout>
      )}

      {params.status ===
        "record-mismatch" && (
        <Callout
          tone="critical"
          title="Recovery linkage mismatch"
          role="alert"
        >
          The Claim does not match its persisted source Opportunity. Claimant creation is blocked until the recovery linkage is corrected.
        </Callout>
      )}

      {params.status ===
        "intake-blocked" && (
        <Callout
          tone="critical"
          title="Claimant intake blocked"
          role="alert"
        >
          The current jurisdiction, legal lane, deadline or other operational control does not permit ordinary claimant creation for this recovery.
        </Callout>
      )}

      {params.status ===
        "claimant-review-required" && (
        <Callout
          tone="caution"
          title="Claimant review required"
          role="alert"
        >
          This ordinary flow supports a single living individual former owner. Estates, deceased owners, multiple owners, trusts, businesses and authority questions require the appropriate controlled review path.
        </Callout>
      )}

      {params.status ===
        "claimant-create-unavailable" && (
        <Callout
          tone="critical"
          title="Claimant could not be created"
          role="alert"
        >
          DueQuity could not complete the controlled claimant creation. No claimant should be assumed created. Review the recovery record before trying again.
        </Callout>
      )}

      {/* ================================================================== */}
      {/* Start new claimant                                                  */}
      {/* ================================================================== */}

      <Card>
        <CardHeader
          title="Start new claimant"
          description="Find the assigned DueQuity recovery record first. Recovery route, filing authority and payment handling are derived automatically from the approved jurisdiction package."
        />

        <CardBody>
          {!mayLocateLead ? (
            <Callout
              tone="caution"
              title="Lead lookup unavailable"
            >
              Your current DueQuity role is not authorized to locate claimant intake records.
            </Callout>
          ) : (
            <div className="space-y-5">
              <form
                method="get"
                action="/pro/claimants/onboarding"
                className="rounded-2xl border border-line bg-inset p-4 sm:p-5"
              >
                <label
                  htmlFor="q"
                  className="block text-sm font-semibold text-ink-900"
                >
                  Find assigned lead
                </label>

                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  Search by Opportunity reference, Claim reference, former-owner name, foreclosed property address, parcel number, city or ZIP code.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="q"
                    name="q"
                    type="search"
                    defaultValue={
                      query
                    }
                    placeholder="Example: OPP-..., John Smith, 123 Main St..."
                    className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                  />

                  <button
                    type="submit"
                    className="rounded-xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                  >
                    Find lead
                  </button>
                </div>
              </form>

              {query.length ===
                1 && (
                <Callout
                  tone="caution"
                  title="Enter more information"
                >
                  Enter at least two characters to search the operational recovery records.
                </Callout>
              )}

              {query.length >=
                2 &&
                intakeSearch.totalMatches ===
                  0 && (
                  <EmptyState
                    compact
                    title="No matching operational record"
                    description="No accessible DueQuity Opportunity or converted Claim matched this search. Verify the reference, former-owner name or foreclosed property address from the Admin-assigned lead."
                  />
                )}

              {intakeSearch.totalMatches >
                0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {
                          intakeSearch.totalMatches
                        }{" "}
                        matching{" "}
                        {intakeSearch.totalMatches ===
                        1
                          ? "record"
                          : "records"}
                      </p>

                      <p className="mt-0.5 text-xs text-ink-500">
                        Confirm the correct property and former-owner record before continuing.
                      </p>
                    </div>

                    <Badge tone="info">
                      Route identified automatically
                    </Badge>
                  </div>

                  {intakeSearch.candidates.map(
                    (
                      candidate,
                    ) => {
                      const claimantState =
                        claimantStateForClaim({
                          claimId:
                            candidate.claimId,

                          activationCandidates,

                          invitations,
                        });

                      return (
                        <LeadResultCard
                          key={
                            candidate.opportunityId
                          }
                          candidate={
                            candidate
                          }
                          query={
                            query
                          }
                          mayCreateClaimant={
                            mayCreateClaimant
                          }
                          claimantState={
                            claimantState.state
                          }
                          activationCandidate={
                            claimantState.activationCandidate
                          }
                        />
                      );
                    },
                  )}
                </div>
              )}

              {query.length <
                2 && (
                <Callout
                  tone="neutral"
                  title="How this workflow starts"
                >
                  Leads are assigned by the Admin. After the claimant voluntarily agrees to continue with DueQuity, locate the recovery record here. DueQuity identifies DCR, MRR, attorney or blocked handling automatically. Staff never select the county route manually.
                </Callout>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ================================================================== */}
      {/* Existing invitation statuses                                        */}
      {/* ================================================================== */}

      {params.status ===
        "sent" && (
        <Callout
          tone="positive"
          title="Activation invitation sent"
          role="status"
        >
          The claimant was sent a secure DueQuity activation email. Their Claimant ID and saved identity information remain linked to the recovery.
        </Callout>
      )}

      {params.status ===
        "invalid" && (
        <Callout
          tone="critical"
          title="Check the activation information"
          role="alert"
        >
          Review the claimant legal name, email and mobile number and complete the activation confirmation.
        </Callout>
      )}

      {params.status ===
        "legal-name-mismatch" && (
        <Callout
          tone="critical"
          title="Legal name does not match"
          role="alert"
        >
          The activation name does not match the claimant identity saved to this recovery. Correct the claimant record through the controlled workflow before sending activation.
        </Callout>
      )}

      {params.status ===
        "email-mismatch" && (
        <Callout
          tone="critical"
          title="Email does not match"
          role="alert"
        >
          The activation email does not match the claimant email saved to this recovery. Save an approved contact correction first.
        </Callout>
      )}

      {params.status ===
        "mobile-mismatch" && (
        <Callout
          tone="critical"
          title="Mobile number does not match"
          role="alert"
        >
          The activation mobile number does not match the claimant mobile saved to this recovery. Save an approved contact correction first.
        </Callout>
      )}

      {params.status ===
        "claimant-record-incomplete" && (
        <Callout
          tone="critical"
          title="Claimant record is incomplete"
          role="alert"
        >
          Finish the claimant identity/contact record before issuing an activation invitation.
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
          This claimant already has an active activation invitation.
        </Callout>
      )}

      {params.status ===
        "claimant-not-found" && (
        <Callout
          tone="critical"
          title="Claimant record unavailable"
          role="alert"
        >
          DueQuity could not find the accessible claimant record required for this activation.
        </Callout>
      )}

      {params.status ===
        "auth-collision" && (
        <Callout
          tone="critical"
          title="Authentication identity conflict"
          role="alert"
        >
          A DueQuity staff authentication identity cannot also be used as this claimant identity.
        </Callout>
      )}

      {params.status ===
        "not-authorized" && (
        <Callout
          tone="critical"
          title="Action not authorized"
          role="alert"
        >
          Your current DueQuity role is not authorized to complete this claimant action.
        </Callout>
      )}

      {params.status ===
        "unavailable" && (
        <Callout
          tone="critical"
          title="Invitation could not be sent"
          role="alert"
        >
          DueQuity could not complete the controlled claimant invitation. No activation should be assumed complete.
        </Callout>
      )}

      {!mayInvite && (
        <Callout
          tone="caution"
          title="Read-only onboarding access"
        >
          Your current DueQuity role may review claimant onboarding but cannot create or activate claimants.
        </Callout>
      )}

      {/* ================================================================== */}
      {/* Activation handoff                                                  */}
      {/* ================================================================== */}

      <div id="send-claimant-activation">
        <Card>
          <CardHeader
            title="Send claimant activation"
            description={
              superAdmin
                ? "Eligible claimant records across all staff assignments are shown. Saved identity and recovery linkage remain system-controlled."
                : "Only claimant records currently assigned to you are shown. Saved identity and recovery linkage remain system-controlled."
            }
          />

          <CardBody>
            {orderedActivationCandidates.length ===
              0 ? (
              <EmptyState
                compact
                title="No claimant records awaiting invitation"
                description="After a claimant record is created from a valid recovery, it will appear here until its secure activation is sent."
              />
            ) : (
              <div className="space-y-4">
                {orderedActivationCandidates.map(
                  (
                    candidate,
                  ) => (
                    <ActivationCandidateCard
                      key={
                        candidate.claimantId
                      }
                      candidate={
                        candidate
                      }
                      mayInvite={
                        mayInvite
                      }
                      selected={
                        candidate.claimantId ===
                        selectedClaimantId
                      }
                    />
                  ),
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* Activation history                                                  */}
      {/* ================================================================== */}

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
                          Mobile:{" "}
                          {
                            invitation.mobilePhone
                          }
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