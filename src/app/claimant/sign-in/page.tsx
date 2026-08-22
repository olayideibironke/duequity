import type { Metadata } from "next";
import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

import { signInClaimant } from "./actions";

export const metadata: Metadata = {
  title: "Claimant Sign In | DueQuity",
  robots: {
    index: false,
    follow: false,
  },
};

interface ClaimantSignInPageProps {
  searchParams: Promise<{
    error?: string;
    account?: string;
  }>;
}

export default async function ClaimantSignInPage({
  searchParams,
}: ClaimantSignInPageProps) {
  const params =
    await searchParams;

  const signInFailed =
    params.error === "signin";

  const confirmationFailed =
    params.error === "confirmation";

  const accountDeleted =
    params.account === "deleted";

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
            Sign in
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Sign in to securely view your claim, documents, messages and account
            information.
          </p>
        </div>

        {accountDeleted ? (
          <Callout
            tone="positive"
            role="status"
            title="Portal account deleted"
          >
            Your My DueQuity sign-in account has been permanently removed and
            you have been signed out.
          </Callout>
        ) : null}

        {confirmationFailed ? (
          <Callout
            tone="critical"
            role="alert"
            title="Email confirmation failed"
          >
            The confirmation link could not be verified or has expired. Return
            to account activation and try again.
          </Callout>
        ) : null}

        {signInFailed ? (
          <Callout
            tone="critical"
            role="alert"
            title="Sign in failed"
          >
            The email or password could not be verified, or this account is not
            connected to a DueQuity claimant record.
          </Callout>
        ) : null}

        <Card>
          <CardBody>
            <form
              action={signInClaimant}
              className="space-y-5"
            >
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
                <div className="flex items-center justify-between gap-4">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-ink-800"
                  >
                    Password
                  </label>

                  <Link
                    href="/auth/forgot-password?audience=claimant"
                    className="text-xs font-medium text-ink-700 underline underline-offset-4"
                  >
                    Forgot password?
                  </Link>
                </div>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-ink-500"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                Sign in to My DueQuity
              </button>
            </form>

            <div className="mt-5 border-t border-ink-100 pt-5 text-center">
              <Link
                href="/auth/forgot-email"
                className="text-sm font-medium text-ink-700 underline underline-offset-4"
              >
                Forgot your sign-in email?
              </Link>
            </div>

            <div className="mt-3 text-center">
              <Link
                href="/claimant/activate"
                className="text-sm font-medium text-ink-700 underline underline-offset-4"
              >
                Activate your account
              </Link>
            </div>
          </CardBody>
        </Card>

        <p className="text-center text-xs leading-relaxed text-ink-500">
          Your account must be linked to an active DueQuity claimant record.
        </p>
      </div>
    </main>
  );
}