import type {
  Metadata,
} from "next";

import {
  ClaimantAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  GovernmentIdUpload,
} from "@/components/portal/government-id-upload";

import {
  getClaimantIdentityDocumentState,
} from "@/server/claimant-identity-document-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

export const metadata: Metadata = {
  title:
    "Identity Verification",

  robots: {
    index:
      false,

    follow:
      false,

    nocache:
      true,
  },
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalIdentityPage() {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  const state =
    await getClaimantIdentityDocumentState(
      session.claimantId,
    );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow text-ink-500">
          My DueQuity
        </p>

        <h1 className="mt-1.5 text-2xl sm:text-3xl">
          Identity Verification
        </h1>

        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-600">
          Your portal account is active independently of identity approval.
          Claim processing remains paused until DueQuity accepts the required
          government-issued photo ID.
        </p>
      </div>

      <GovernmentIdUpload
        initialState={
          state
        }
      />
    </div>
  );
}