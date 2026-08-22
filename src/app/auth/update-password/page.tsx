import type { Metadata } from "next";
import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

import { updatePassword } from "./actions";

export const metadata: Metadata = {
  title: "Set New Password | DueQuity",
  robots: {
    index: false,
    follow: false,
  },
};

type AuthAudience =
  | "staff"
  | "claimant";

interface UpdatePasswordPageProps {
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

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
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
            Set a new password
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Choose a new password with at least 12 characters.
          </p>
        </div>

        {status === "invalid" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Check your password"
          >
            Your password must contain at least 12 characters and both password
            fields must match.
          </Callout>
        ) : null}

        {status === "expired" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Recovery session unavailable"
          >
            This password recovery session is no longer valid for an authorized
            DueQuity account. Request a new password reset email and try again.
          </Callout>
        ) : null}

        {status === "failed" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Password could not be updated"
          >
            We could not update your password right now. Please try again.
          </Callout>
        ) : null}

        {status === "updated" ? (
          <Callout
            tone="positive"
            role="status"
            title="Password updated"
          >
            Your password has been changed successfully. For security, you have
            been signed out and can now sign in with your new password.
          </Callout>
        ) : null}

        {status !== "updated" ? (
          <Card>
            <CardBody>
              <form
                action={updatePassword}
                className="space-y-5"
              >
                <input
                  type="hidden"
                  name="audience"
                  value={audience}
                />

                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-ink-800"
                  >
                    New password
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
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-ink-800"
                  >
                    Confirm new password
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
                  Update password
                </button>
              </form>
            </CardBody>
          </Card>
        ) : null}

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