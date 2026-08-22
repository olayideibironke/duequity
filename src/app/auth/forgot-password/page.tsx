import type { Metadata } from "next";
import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

import { requestPasswordReset } from "./actions";

export const metadata: Metadata = {
  title: "Reset Password | DueQuity",
  robots: {
    index: false,
    follow: false,
  },
};

type AuthAudience =
  | "staff"
  | "claimant";

interface ForgotPasswordPageProps {
  searchParams: Promise<{
    audience?: string;
    status?: string;
  }>;
}

function resolveAudience(
  value: string | undefined,
): AuthAudience {
  return value === "staff"
    ? "staff"
    : "claimant";
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params =
    await searchParams;

  const audience =
    resolveAudience(
      params.audience,
    );

  const status =
    params.status;

  const signInPath =
    audience === "staff"
      ? "/staff/sign-in"
      : "/claimant/sign-in";

  const heading =
    audience === "staff"
      ? "Reset staff password"
      : "Reset your password";

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
            {audience === "staff"
              ? "DueQuity Operations"
              : "My DueQuity"}
          </p>

          <h1 className="mt-1.5 text-3xl">
            {heading}
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Enter the email address connected to your DueQuity account. If an
            eligible account exists, password recovery instructions will be sent
            to that address.
          </p>
        </div>

        {status === "sent" ? (
          <Callout
            tone="positive"
            role="status"
            title="Check your email"
          >
            If an eligible DueQuity account is associated with that email
            address, password recovery instructions have been sent.
          </Callout>
        ) : null}

        {status === "invalid" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Email required"
          >
            Enter the email address connected to your DueQuity account.
          </Callout>
        ) : null}

        {status === "unavailable" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Recovery request unavailable"
          >
            We could not start password recovery right now. Please try again.
          </Callout>
        ) : null}

        <Card>
          <CardBody>
            <form
              action={requestPasswordReset}
              className="space-y-5"
            >
              <input
                type="hidden"
                name="audience"
                value={audience}
              />

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

              <button
                type="submit"
                className="w-full rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                Send password reset email
              </button>
            </form>
          </CardBody>
        </Card>

        <div className="text-center">
          <Link
            href={signInPath}
            className="text-sm font-medium text-ink-700 underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}