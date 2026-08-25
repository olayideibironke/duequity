import type {
  Metadata,
} from "next";

import {
  ClaimantMessageMailboxClient,
} from "@/components/messages/claimant-message-mailbox-client";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  listClaimantMessageMailbox,
} from "@/server/claimant-message-mailbox-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const metadata: Metadata = {
  title:
    "Claimant Messages",
};

export const dynamic =
  "force-dynamic";

export default async function ClaimantMessagesPage() {
  const session =
    await resolveStaffSession();

  if (
    !session ||
    !session.permissions.includes(
      "claimant.read",
    )
  ) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const mailbox =
    await listClaimantMessageMailbox(
      "inbox",
    );

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-ink-500">
          Claimants
        </p>

        <h1 className="mt-1.5 text-2xl sm:text-3xl">
          Claimant Messages
        </h1>

        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-600">
          Secure claimant-facing communication organized by Claimant ID. Search claimants, conversations and message attachments from one controlled workspace.
        </p>
      </div>

      <ClaimantMessageMailboxClient
        initialEntries={
          mailbox.entries
        }
        initialCounts={
          mailbox.counts
        }
      />
    </div>
  );
}