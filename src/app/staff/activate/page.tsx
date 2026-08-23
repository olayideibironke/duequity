import type { Metadata } from "next";

import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

import { activateStaffAccount } from "./actions";

export const metadata: Metadata = {
  title: "Activate Staff Account | DueQuity",

  robots: {
    index: false,
    follow: false,
  },
};

interface StaffActivatePageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

export default async function StaffActivatePage({
  searchParams,
}: StaffActivatePageProps) {
  const params =
    await searchParams;

  const status =
    params.status;

  const activationComplete =
    status === "activated";

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
            Activate your staff account
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Create your password to finish activating your DueQuity staff
            account.
          </p>
        </div>

        {status === "invalid" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Invitation unavailable"
          >
            This staff invitation is invalid, expired, or has already been
            used. Contact your DueQuity administrator for a new invitation.
          </Callout>
        ) : null}

        {status === "expired" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Activation session unavailable"
          >
            Your staff activation session is no longer valid. Open the staff
            invitation email again or contact your DueQuity administrator.
          </Callout>
        ) : null}

        {status === "failed" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Account could not be activated"
          >
            We could not complete your staff account activation. Please try
            again while your invitation session is still active.
          </Callout>
        ) : null}

        {status === "invalid-password" ? (
          <Callout
            tone="critical"
            role="alert"
            title="Check your password"
          >
            Your password must contain at least 12 characters and both password
            fields must match.
          </Callout>
        ) : null}

        {activationComplete ? (
          <Callout
            tone="positive"
            role="status"
            title="Staff account activated"
          >
            Your DueQuity staff account is active. For security, your activation
            session has been signed out. You can now sign in with your business
            email and new password.
          </Callout>
        ) : null}

        {!activationComplete &&
        status !== "invalid" &&
        status !== "expired" ? (
          <Card>
            <CardBody>
              <form
                action={activateStaffAccount}
                className="space-y-5"
              >
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

                  <p className="text-xs leading-relaxed text-ink-500">
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
                  Activate staff account
                </button>
              </form>
            </CardBody>
          </Card>
        ) : null}

        <div className="text-center">
          <Link
            href="/staff/sign-in"
            className="text-sm font-medium text-ink-700 underline underline-offset-4"
          >
            Back to staff sign in
          </Link>
        </div>
      </div>
    </main>
  );
}