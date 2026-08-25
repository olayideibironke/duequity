import type {
  Metadata,
} from "next";

import {
  ClaimantAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  ClaimantConversationWorkspace,
} from "@/components/messages/claimant-conversation-workspace";

import {
  getClaimantMessageThreadForClaimant,
  getClaimantMessagingProfile,
  listClaimantMessageThreadsForClaimant,
} from "@/server/claimant-message-store";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

export const metadata: Metadata = {
  title:
    "Messages",
};

export const dynamic =
  "force-dynamic";

export default async function PortalMessagesPage() {
  const session =
    await resolveClaimantSession();

  if (!session) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  const profile =
    await getClaimantMessagingProfile(
      session.claimantId,
    );

  if (!profile) {
    return (
      <div className="rounded-lg border border-critical-200 bg-critical-50 px-4 py-4">
        <h1 className="text-lg font-semibold text-critical-900">
          Messaging unavailable
        </h1>

        <p className="mt-1 text-sm text-critical-800">
          Your authenticated claimant account could not be connected to its DueQuity claimant record.
        </p>
      </div>
    );
  }

  const threads =
    await listClaimantMessageThreadsForClaimant(
      session.claimantId,
    );

  const initialThread =
    threads[0]
      ? await getClaimantMessageThreadForClaimant(
          session.claimantId,
          threads[0].id,
        )
      : undefined;

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-ink-500">
          My DueQuity
        </p>

        <h1 className="mt-1.5 text-2xl sm:text-3xl">
          Messages
        </h1>

        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">
          Secure communication between you and DueQuity concerning your recovery.
        </p>
      </div>

      <ClaimantConversationWorkspace
        viewer="claimant"
        profile={
          profile
        }
        initialThreads={
          threads
        }
        initialThread={
          initialThread
        }
        apiEndpoint="/api/portal/messages"
        attachmentEndpoint="/api/portal/messages/attachments"
      />

      <div className="rounded-lg border border-line bg-inset px-4 py-3">
        <p className="text-xs leading-relaxed text-ink-600">
          Do not send Social Security numbers, passwords, authentication codes, banking credentials or government identity-document contents through Messages. Use the secure Documents section when DueQuity requests identity or claim documents.
        </p>
      </div>
    </div>
  );
}