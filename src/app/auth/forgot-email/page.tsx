import type { Metadata } from "next";
import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

import { recoverSignInEmail } from "./actions";

export const metadata: Metadata = {
  title: "Recover Sign-In Email | DueQuity",
  robots: {
    index: false,
    follow: false,
  },
};

interface ForgotEmailPageProps {
  searchParams: Promise<{
    status?: string;
    hint?: string;
  }>;
}

export default async function ForgotEmailPage({
  searchParams,
}: ForgotEmailPageProps) {
  const params =
    await searchParams;

  const status =
    params.status;

  const emailHint =
    params.hint?.trim();

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
            Forgot your sign-in email?
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Enter your DueQuity claimant reference and the mobile number
            connected to your account.
          </p>
        </div>

        {status === "found" && emailHint ? (
          <Callout
            tone="positive"
            role="status"
            title="Account located"
          >
            Your sign-in email is{" "}
            <strong>{emailHint}</strong>.
          </Callout>
        ) : null}

        {status === "invalid" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Check your information"
          >
            Enter your claimant reference and a valid U.S. mobile number.
          </Callout>
        ) : null}

        {status === "not-found" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Account not located"
          >
            We could not match that claimant reference and mobile number to an
            active DueQuity sign-in account.
          </Callout>
        ) : null}

        {status === "unavailable" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Recovery unavailable"
          >
            We could not complete email recovery right now. Please try again.
          </Callout>
        ) : null}

        <Card>
          <CardBody>
            <form
              action={recoverSignInEmail}
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

              <button
                type="submit"
                className="w-full rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                Recover sign-in email
              </button>
            </form>
          </CardBody>
        </Card>

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