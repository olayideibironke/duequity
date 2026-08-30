import type {
  Metadata,
} from "next";

import {
  ClaimantPortalMailbox,
} from "@/components/messages/claimant-portal-mailbox";

import {
  ClaimantAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  getClaimantPortalMailboxState,
} from "@/server/claimant-portal-mailbox-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

export const metadata: Metadata = {
  title:
    "Messages",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalMessagesPage() {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  try {
    const mailbox =
      await getClaimantPortalMailboxState(
        session.claimantId,
      );

    return (
      <div className="space-y-5">
        <div>
          <p className="eyebrow text-ink-500">
            My DueQuity
          </p>

          <h1 className="mt-1.5 text-2xl sm:text-3xl">
            Messages
          </h1>

          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-600">
            Your secure DueQuity mailbox for recovery-related communication with your authorized DueQuity representative.
          </p>
        </div>

        <ClaimantPortalMailbox
          initialState={
            mailbox
          }
          apiEndpoint="/api/portal/messages"
          attachmentEndpoint="/api/portal/messages/attachments"
        />
      </div>
    );
  } catch (
    error
  ) {
    return (
      <div className="rounded-lg border border-critical-200 bg-critical-50 px-4 py-4">
        <h1 className="text-lg font-semibold text-critical-900">
          Messaging unavailable
        </h1>

        <p className="mt-1 text-sm leading-relaxed text-critical-800">
          {error instanceof Error
            ? error.message
            : "Your secure claimant mailbox could not be loaded."}
        </p>
      </div>
    );
  }
}