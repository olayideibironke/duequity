import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

import {
  activateClaimantAccount,
} from "./actions";

export const metadata: Metadata = {
  title:
    "Activate My DueQuity Account | DueQuity",

  robots: {
    index:
      false,

    follow:
      false,
  },
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ActivateClaimantPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

interface InvitationRow {
  id: string;

  claimant_id: string;

  claimant_reference: string;

  legal_first_name: string;

  legal_last_name: string;

  email: string;

  status: string;

  expires_at: string;
}

interface ClaimantRow {
  claim_reference: string;
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ActivateClaimantPage({
  searchParams,
}: ActivateClaimantPageProps) {
  const params =
    await searchParams;

  const supabase =
    await getSupabaseServerAuth();

  const {
    data: {
      user,
    },
  } =
    await supabase.auth.getUser();

  const admin =
    getSupabaseAdmin();

  let invitation:
    InvitationRow | undefined;

  let claim:
    ClaimantRow | undefined;

  if (user) {
    const {
      data,
    } =
      await admin
        .from(
          "claimant_activation_invitations",
        )
        .select(
          "id, claimant_id, claimant_reference, legal_first_name, legal_last_name, email, status, expires_at",
        )
        .eq(
          "auth_user_id",
          user.id,
        )
        .in(
          "status",
          [
            "sent",
            "activated",
          ],
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          1,
        )
        .maybeSingle();

    if (data) {
      invitation =
        data as InvitationRow;

      const {
        data:
          claimantData,
      } =
        await admin
          .from(
            "claimant_onboarding",
          )
          .select(
            "claim_reference",
          )
          .eq(
            "claimant_id",
            invitation.claimant_id,
          )
          .maybeSingle();

      if (
        claimantData
      ) {
        claim =
          claimantData as ClaimantRow;
      }
    }
  }

  const expired =
    invitation?.status ===
      "sent" &&
    new Date(
      invitation.expires_at,
    ).getTime() <=
      Date.now();

  const mayActivate =
    Boolean(
      invitation &&
      invitation.status ===
        "sent" &&
      !expired,
    );

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div
        className="w-full space-y-5"
        style={{
          maxWidth:
            "500px",
        }}
      >
        <div>
          <p className="eyebrow text-ink-500">
            My DueQuity
          </p>

          <h1 className="mt-1.5 text-3xl">
            Activate your account
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Review the identity information confirmed with DueQuity and create your private password.
          </p>
        </div>

        {params.status ===
          "invalid-password" && (
          <Callout
            tone="critical"
            role="alert"
            title="Check your password"
          >
            Use at least 12 characters and make sure both password fields match.
          </Callout>
        )}

        {params.status ===
          "unavailable" && (
          <Callout
            tone="critical"
            role="alert"
            title="Activation unavailable"
          >
            DueQuity could not finish activating this account. Please contact DueQuity claimant support.
          </Callout>
        )}

        {(
          params.status ===
            "expired" ||
          expired
        ) && (
          <Callout
            tone="caution"
            role="alert"
            title="Activation link expired"
          >
            This secure activation link has expired. Contact DueQuity so an authorized staff member can issue a new activation invitation.
          </Callout>
        )}

        {!invitation &&
          params.status !==
            "expired" && (
          <Callout
            tone="critical"
            role="alert"
            title="Valid invitation required"
          >
            Claimant accounts cannot be created through public registration. Open the secure activation link sent by DueQuity.
          </Callout>
        )}

        {invitation?.status ===
          "activated" && (
          <Callout
            tone="positive"
            title="Account already activated"
          >
            Your activation is complete. Sign in to My DueQuity using the password you created.
          </Callout>
        )}

        {mayActivate &&
          invitation && (
          <>
            <Card>
              <CardBody>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                      Legal name
                    </p>

                    <div className="mt-1.5 rounded-xl border border-line bg-inset px-4 py-3 text-sm font-semibold text-ink-900">
                      {invitation.legal_first_name}{" "}
                      {invitation.legal_last_name}
                    </div>

                    <p className="mt-1 text-xs text-ink-500">
                      Confirmed by DueQuity staff. This field cannot be edited during activation.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                      Claimant ID
                    </p>

                    <div className="mt-1.5 rounded-xl border border-line bg-ink-950 px-4 py-3 font-mono text-sm font-semibold text-white">
                      {
                        invitation.claimant_reference
                      }
                    </div>

                    <p className="mt-1 text-xs text-ink-500">
                      Your permanent DueQuity claimant identifier.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                      Email
                    </p>

                    <div className="mt-1.5 rounded-xl border border-line bg-inset px-4 py-3 text-sm text-ink-900">
                      {
                        invitation.email
                      }
                    </div>
                  </div>

                  {claim && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                        Recovery reference
                      </p>

                      <div className="mt-1.5 rounded-xl border border-line bg-inset px-4 py-3 font-mono text-sm text-ink-800">
                        {
                          claim.claim_reference
                        }
                      </div>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <form
                  action={
                    activateClaimantAccount
                  }
                  className="space-y-5"
                >
                  <div className="space-y-2">
                    <label
                      htmlFor="password"
                      className="block text-sm font-semibold text-ink-800"
                    >
                      Create password
                    </label>

                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      required
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                    />

                    <p className="text-xs text-ink-500">
                      Use at least 12 characters.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="confirmPassword"
                      className="block text-sm font-semibold text-ink-800"
                    >
                      Confirm password
                    </label>

                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      required
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                    />
                  </div>

                  <Callout
                    tone="neutral"
                    title="Identity document required after activation"
                  >
                    Account creation is not blocked by your ID upload. After you sign in, DueQuity will require one current government-issued photo ID before claim processing can continue: a valid Driver&apos;s License, valid U.S. Passport, valid State ID, or another current government-issued photo ID.
                  </Callout>

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-ink-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                  >
                    Activate My DueQuity Account
                  </button>
                </form>
              </CardBody>
            </Card>
          </>
        )}

        <div className="text-center">
          <Link
            href="/claimant/sign-in"
            className="text-sm font-medium text-ink-700 underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}