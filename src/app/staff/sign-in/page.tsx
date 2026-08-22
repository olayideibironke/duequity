import type { Metadata } from "next";
import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

import { signInStaff } from "./actions";

export const metadata: Metadata = {
  title: "Staff Sign In | DueQuity",
  robots: {
    index: false,
    follow: false,
  },
};

interface StaffSignInPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function StaffSignInPage({
  searchParams,
}: StaffSignInPageProps) {
  const params =
    await searchParams;

  const signInFailed =
    params.error === "signin";

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
            DueQuity Operations
          </p>

          <h1 className="mt-1.5 text-3xl">
            Staff sign in
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Use your authorized DueQuity staff credentials to access the
            operations workspace.
          </p>
        </div>

        {signInFailed ? (
          <Callout
            tone="critical"
            role="alert"
            title="Sign in failed"
          >
            The email or password could not be verified, or this account is not
            authorized for DueQuity staff access.
          </Callout>
        ) : null}

        <Card>
          <CardBody>
            <form
              action={signInStaff}
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
                    href="/auth/forgot-password?audience=staff"
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
                Sign in to Operations
              </button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-xs leading-relaxed text-ink-500">
          Access is restricted to authorized DueQuity staff accounts.
        </p>
      </div>
    </main>
  );
}