import Link from "next/link";

import {
  Callout,
  Card,
  CardBody,
} from "@/components/ui/surface";

/**
 * AUTHENTICATION REQUIRED
 *
 * The single fail-closed surface shown when a staff or claimant session cannot
 * be established.
 *
 * Authentication alone does not grant access. The production session resolvers
 * must also map the authenticated Supabase identity to an authorized DueQuity
 * staff or claimant record before protected data is read.
 */

export function StaffAuthenticationRequired() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div>
        <p className="eyebrow text-ink-500">
          Operations
        </p>

        <h1 className="mt-1.5 text-2xl">
          Staff authentication required
        </h1>
      </div>

      <Card>
        <CardBody>
          <Callout
            tone="critical"
            role="alert"
            title="Authorized staff access required"
          >
            <div className="space-y-2">
              <p>
                DueQuity could not establish an authorized staff session for
                this request.
              </p>

              <p>
                No operational record is read or written until your authenticated
                identity is verified and mapped to an authorized DueQuity staff
                account.
              </p>
            </div>
          </Callout>

          <div className="mt-5">
            <Link
              href="/staff/sign-in"
              className="inline-flex rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
            >
              Sign in to Operations
            </Link>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-ink-500">
            Access is restricted to authorized DueQuity staff accounts.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export function ClaimantAuthenticationRequired() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div>
        <p className="eyebrow text-ink-500">
          Secure portal
        </p>

        <h1 className="mt-1.5 text-2xl">
          Sign in required
        </h1>
      </div>

      <Card>
        <CardBody>
          <Callout
            tone="critical"
            role="alert"
            title="Secure claimant access required"
          >
            <div className="space-y-2">
              <p>
                DueQuity could not establish an authenticated claimant session
                for this request.
              </p>

              <p>
                No claim, document or message is loaded until your authenticated
                identity is securely linked to your DueQuity claimant record.
              </p>
            </div>
          </Callout>

          <div className="mt-5">
            <Link
              href="/claimant/sign-in"
              className="inline-flex rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
            >
              Sign in to My DueQuity
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}