import type {
  Metadata,
} from "next";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  EmptyState,
} from "@/components/ui/surface";

import {
  Badge,
} from "@/components/ui/badge";

import {
  TextLink,
} from "@/components/ui/button";

import {
  IconLock,
  IconShield,
} from "@/components/ui/icon";

import {
  formatDate,
} from "@/lib/format";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

import {
  ClaimantAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  listClaimantOnboardings,
} from "@/server/claimant-onboarding-store";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  deleteClaimantAccount,
} from "./actions";

export const metadata: Metadata = {
  title:
    "Security",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface PortalSecurityPageProps {
  searchParams: Promise<{
    deleteStatus?:
      string;
  }>;
}

interface AssignedWorkcaseRow {
  id:
    string;

  claimant_id:
    string;

  legal_first_name:
    string;

  legal_last_name:
    string;

  auth_user_id:
    string | null;

  created_at:
    string;

  status:
    string;

  linked_claim_id:
    string | null;
}

interface AssignedIdentityRow {
  identity_verification:
    string;

  identity_verified_at:
    string | null;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function identityLabel(
  status:
    string,
): string {
  switch (
    status
  ) {
    case "verified":
      return "Verified";

    case "under_review":
      return "Under review";

    case "documents_requested":
      return "Documents requested";

    case "manual_review":
      return "Manual review";

    case "failed":
      return "Verification failed";

    default:
      return "Not started";
  }
}

function identityTone(
  status:
    string,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  switch (
    status
  ) {
    case "verified":
      return "positive";

    case "failed":
      return "critical";

    case "under_review":
    case "documents_requested":
    case "manual_review":
      return "caution";

    default:
      return "neutral";
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalSecurityPage({
  searchParams,
}: PortalSecurityPageProps) {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  const params =
    await searchParams;

  const deleteStatus =
    params.deleteStatus;

  /* ======================================================================== */
  /* Existing Claim-backed claimant                                           */
  /* ======================================================================== */

  const onboardings =
    await listClaimantOnboardings();

  const onboarding =
    onboardings.find(
      (
        record,
      ) =>
        record.claimant.id ===
        session.claimantId,
    );

  /* ======================================================================== */
  /* Active pre-Claim claimant                                                */
  /* ======================================================================== */

  const admin =
    getSupabaseAdmin();

  const {
    data:
      assignedWorkcaseData,
    error:
      assignedWorkcaseError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, claimant_id, legal_first_name, legal_last_name, auth_user_id, created_at, status, linked_claim_id",
      )
      .eq(
        "claimant_id",
        session.claimantId,
      )
      .eq(
        "status",
        "activated",
      )
      .is(
        "linked_claim_id",
        null,
      )
      .maybeSingle();

  if (
    assignedWorkcaseError
  ) {
    throw new Error(
      `Unable to load claimant security record: ${assignedWorkcaseError.message}`,
    );
  }

  const assignedWorkcase =
    assignedWorkcaseData
      ? assignedWorkcaseData as
          AssignedWorkcaseRow
      : null;

  let assignedIdentity:
    AssignedIdentityRow | null =
    null;

  if (
    assignedWorkcase
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "assigned_lead_claimant_identity_profiles",
        )
        .select(
          "identity_verification, identity_verified_at",
        )
        .eq(
          "workcase_id",
          assignedWorkcase.id,
        )
        .eq(
          "claimant_id",
          assignedWorkcase.claimant_id,
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to load claimant identity security status: ${error.message}`,
      );
    }

    assignedIdentity =
      data
        ? data as
            AssignedIdentityRow
        : null;
  }

  if (
    !onboarding &&
    !assignedWorkcase
  ) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl">
            Security
          </h1>

          <p className="mt-1.5 text-md text-ink-600">
            Account protection and claimant safety.
          </p>
        </div>

        <EmptyState
          title="No claimant account connected"
          description="No authorized claimant record is connected to the current claimant session."
        />
      </div>
    );
  }

  const claimantName =
    onboarding
      ?.claimant
      .legalName ??
    [
      assignedWorkcase
        ?.legal_first_name,
      assignedWorkcase
        ?.legal_last_name,
    ]
      .filter(
        Boolean,
      )
      .join(
        " ");

  const recordCreated =
    onboarding
      ?.claimant
      .createdAt ??
    assignedWorkcase
      ?.created_at
      .slice(
        0,
        10,
      );

  const identityVerification =
    onboarding
      ?.claimant
      .identityVerification ??
    assignedIdentity
      ?.identity_verification ??
    "not_started";

  const identityVerifiedAt =
    onboarding
      ?.claimant
      .identityVerifiedAt ??
    assignedIdentity
      ?.identity_verified_at
      ?.slice(
        0,
        10,
      );

  const isPreClaim =
    Boolean(
      assignedWorkcase &&
      !onboarding,
    );

  return (
    <div className="space-y-6">
      {/* ================================================================ header */}

      <div>
        <h1 className="text-2xl sm:text-3xl">
          Security
        </h1>

        <p className="mt-1.5 max-w-2xl text-md text-ink-600">
          Manage access to your DueQuity account and review important claimant
          safety information.
        </p>
      </div>

      {/* ========================================================== account */}

      <Card>
        <CardHeader
          title="Current claimant record"
          description="Security-relevant information connected to your claimant account."
        />

        <CardBody>
          <DataList columns={2}>
            <DataItem label="Claimant">
              {
                claimantName
              }
            </DataItem>

            <DataItem label="Account record created">
              {
                recordCreated
                  ? formatDate(
                      recordCreated,
                    )
                  : "Not recorded"
              }
            </DataItem>

            <DataItem label="Identity verification">
              <Badge
                tone={
                  identityTone(
                    identityVerification,
                  )
                }
              >
                {
                  identityLabel(
                    identityVerification,
                  )
                }
              </Badge>
            </DataItem>

            <DataItem label="Recovery stage">
              {
                isPreClaim
                  ? (
                      <Badge tone="neutral">
                        Pre-Claim
                      </Badge>
                    )
                  : (
                      <Badge tone="info">
                        Official Claim
                      </Badge>
                    )
              }
            </DataItem>

            {
              identityVerifiedAt &&
              (
                <DataItem label="Identity verified">
                  {
                    formatDate(
                      identityVerifiedAt,
                    )
                  }
                </DataItem>
              )
            }

            {
              onboarding
                ? (
                    <DataItem label="Contact consent">
                      {
                        onboarding
                          .claimant
                          .consentRecordedAt
                          ? (
                              <span className="flex flex-wrap items-center gap-2">
                                <Badge tone="positive">
                                  Recorded
                                </Badge>

                                <span>
                                  {
                                    formatDate(
                                      onboarding
                                        .claimant
                                        .consentRecordedAt,
                                    )
                                  }
                                </span>
                              </span>
                            )
                          : (
                              <Badge tone="caution">
                                Not recorded
                              </Badge>
                            )
                      }
                    </DataItem>
                  )
                : (
                    <DataItem label="Portal account">
                      <Badge tone="positive">
                        Active
                      </Badge>
                    </DataItem>
                  )
            }
          </DataList>
        </CardBody>
      </Card>

      {/* ===================================================== account access */}

      <Card>
        <CardHeader
          title="Account access"
          description="Manage your password and current signed-in session."
        />

        <CardBody>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-subtle pb-5">
              <div>
                <p className="text-base font-semibold text-ink-900">
                  Password
                </p>

                <p className="mt-1 text-sm leading-relaxed text-ink-600">
                  Request a secure password reset email if you need to change
                  your password.
                </p>
              </div>

              <TextLink
                href="/auth/forgot-password?audience=claimant"
                className="text-sm"
              >
                Reset password
              </TextLink>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-ink-900">
                  Current session
                </p>

                <p className="mt-1 text-sm leading-relaxed text-ink-600">
                  Sign out of My DueQuity on this browser.
                </p>
              </div>

              <form
                action="/auth/sign-out"
                method="post"
              >
                <button
                  type="submit"
                  className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ==================================================== delete feedback */}

      {
        deleteStatus ===
        "invalid"
          ? (
              <Callout
                tone="critical"
                role="alert"
                title="Confirmation required"
              >
                Enter your current password and type DELETE exactly as shown
                before submitting the request.
              </Callout>
            )
          : null
      }

      {
        deleteStatus ===
        "invalid-password"
          ? (
              <Callout
                tone="critical"
                role="alert"
                title="Password could not be verified"
              >
                The current password you entered could not be verified.
              </Callout>
            )
          : null
      }

      {
        deleteStatus ===
        "unauthorized"
          ? (
              <Callout
                tone="critical"
                role="alert"
                title="Account deletion unavailable"
              >
                DueQuity could not establish an authorized production claimant
                session for this request.
              </Callout>
            )
          : null
      }

      {
        deleteStatus ===
        "failed"
          ? (
              <Callout
                tone="critical"
                role="alert"
                title="Account could not be deleted"
              >
                Your account was not deleted. Please try again.
              </Callout>
            )
          : null
      }

      {/* ======================================================= delete account */}

      <Card>
        <CardHeader
          title="Delete portal account"
          description="Permanently remove your My DueQuity sign-in account."
        />

        <CardBody>
          <Callout
            tone="critical"
            role="alert"
            title="This action is permanent"
          >
            <div className="space-y-2">
              <p>
                Deleting your portal account permanently removes your DueQuity
                sign-in identity and immediately ends your access to My
                DueQuity.
              </p>

              <p>
                Your underlying recovery records, claim records where
                applicable, documents, transaction history and required audit
                records are not erased by deleting your login account. Records
                that DueQuity must retain remain preserved.
              </p>
            </div>
          </Callout>

          <form
            action={
              deleteClaimantAccount
            }
            className="mt-5 space-y-5"
          >
            <div className="space-y-2">
              <label
                htmlFor="delete-password"
                className="block text-sm font-medium text-ink-800"
              >
                Current password
              </label>

              <input
                id="delete-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="delete-confirmation"
                className="block text-sm font-medium text-ink-800"
              >
                Type DELETE to confirm
              </label>

              <input
                id="delete-confirmation"
                name="confirmation"
                type="text"
                autoComplete="off"
                required
                className="w-full rounded-xl border border-critical-300 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-critical-500"
              />
            </div>

            <button
              type="submit"
              className="rounded-xl border border-critical-300 bg-white px-4 py-3 text-sm font-semibold text-critical-700 transition hover:bg-critical-50"
            >
              Permanently delete portal account
            </button>
          </form>
        </CardBody>
      </Card>

      {/* ================================================== impersonation */}

      <Card elevated>
        <CardHeader
          eyebrow="Claimant safety"
          title="Protect yourself from recovery scams"
          description="Property and foreclosure information can exist in public records, so someone knowing an address or sale does not prove that they represent DueQuity or a government agency."
        />

        <CardBody>
          <div className="rounded-md border border-accent-200 bg-accent-50 px-4 py-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-accent-800">
              <IconShield
                size={
                  15
                }
              />

              Verify important recovery information
            </p>

            <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
              Compare any request you receive with the recovery information
              shown inside your authenticated DueQuity account. Do not rely only
              on what a caller, text message, letter or email tells you.
            </p>
          </div>

          <p className="mt-5 text-base font-semibold text-ink-900">
            DueQuity&apos;s recovery model does not require you to
          </p>

          <ul className="mt-2.5 space-y-2">
            {
              [
                "Pay an upfront recovery fee before funds are recovered",
                "Send money by gift card, wire transfer or cryptocurrency",
                "Give bank account details through an unapproved message or phone request",
                "Give a Social Security number through an unapproved message or phone request",
                "Sell or assign ownership of your recovery claim to DueQuity",
                "Believe that a caller represents a court, county or government agency merely because they know details from public records",
              ].map(
                (
                  item,
                ) => (
                  <li
                    key={
                      item
                    }
                    className="flex gap-2.5"
                  >
                    <Badge
                      tone="critical"
                      className="mt-0.5 shrink-0"
                    >
                      Never
                    </Badge>

                    <span className="text-sm leading-relaxed text-ink-700">
                      {
                        item
                      }
                    </span>
                  </li>
                ),
              )
            }
          </ul>

          <div className="mt-5 rounded-md border border-line bg-inset px-4 py-3.5">
            <p className="text-sm font-semibold text-ink-900">
              If a communication looks suspicious
            </p>

            <p className="mt-1 text-sm leading-relaxed text-ink-600">
              Do not send money or sensitive personal information. Keep the
              communication and verify the request through an official DueQuity
              channel. If the request claims to come from a court or government
              agency, independently verify that agency using its official
              contact information.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* ========================================================== privacy */}

      <Callout tone="neutral">
        <p className="flex items-start gap-2">
          <IconLock
            size={
              15
            }
            className="mt-0.5 shrink-0 text-ink-500"
          />

          <span>
            Information about DueQuity&apos;s handling of personal information
            is available in the{" "}

            <TextLink
              href="/privacy"
              className="text-sm"
            >
              privacy notice
            </TextLink>
            .
          </span>
        </p>
      </Callout>
    </div>
  );
}