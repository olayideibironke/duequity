import type { Metadata } from "next";
import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

import { activateClaimantAccount } from "./actions";

export const metadata: Metadata = {
  title: "Activate My DueQuity Account | DueQuity",
  robots: {
    index: false,
    follow: false,
  },
};

interface ActivateClaimantPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

export default async function ActivateClaimantPage({
  searchParams,
}: ActivateClaimantPageProps) {
  const params =
    await searchParams;

  const status =
    params.status;

  const activationSent =
    status === "sent";

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div
        className="w-full space-y-5"
        style={{
          maxWidth: "460px",
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
            If you are already working with DueQuity, verify your claimant
            record and create secure access to your portal.
          </p>
        </div>

        {status === "invalid" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Check your information"
          >
            Enter your claimant reference, email, U.S. mobile number and a
            matching password of at least 12 characters.
          </Callout>
        ) : null}

        {status === "not-found" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Claimant record not located"
          >
            We could not match those details to an eligible DueQuity claimant
            record.
          </Callout>
        ) : null}

        {status === "already-active" ? (
          <Callout
            tone="positive"
            role="status"
            title="Account already activated"
          >
            This claimant record already has a My DueQuity sign-in account.
            Sign in instead, or reset your password if needed.
          </Callout>
        ) : null}

        {status === "unavailable" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Activation unavailable"
          >
            We could not activate your account right now. Please try again.
          </Callout>
        ) : null}

        {activationSent ? (
          <Callout
            tone="positive"
            role="status"
            title="Check your email"
          >
            Your account was created. Open the confirmation email we sent to
            verify your email address and finish activating My DueQuity.
          </Callout>
        ) : null}

        {!activationSent ? (
          <Card>
            <CardBody>
              <form
                action={activateClaimantAccount}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label
                    htmlFor="claimantReference"
                    className="block text-sm font-medium text-ink-800"
                  >
                    Claimant reference
                  </label>

                  <input
                    id="claimantReference"
                    name="claimantReference"
                    type="text"
                    autoComplete="off"
                    required
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-ink-800"
                  >
                    Email
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
                    htmlFor="mobilePhone"
                    className="block text-sm font-medium text-ink-800"
                  >
                    Mobile number
                  </label>

                  <input
                    id="mobilePhone"
                    name="mobilePhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(555) 123-4567"
                    pattern="\([0-9]{3}\) [0-9]{3}-[0-9]{4}"
                    title="Enter a U.S. phone number in the format (555) 123-4567"
                    maxLength={14}
                    required
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                  />

                  <p className="text-xs text-ink-500">
                    Format: (555) 123-4567
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-ink-800"
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
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                  />

                  <p className="text-xs text-ink-500">
                    Use at least 12 characters.
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-ink-800"
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
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                >
                  Activate My DueQuity Account
                </button>
              </form>
            </CardBody>
          </Card>
        ) : null}

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