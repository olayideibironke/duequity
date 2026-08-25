import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  ClaimantConversationWorkspace,
} from "@/components/messages/claimant-conversation-workspace";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  getClaimantMessageThreadForStaff,
  getClaimantMessagingProfile,
  listClaimantMessageThreadsForStaff,
} from "@/server/claimant-message-store";

import {
  getClaimantOnboardingByClaimantIdForStaff,
} from "@/server/claimant-onboarding-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const metadata: Metadata = {
  title:
    "Claimant Messages",
};

export const dynamic =
  "force-dynamic";

export default async function ProClaimantMessagesPage({
  params,
}: PageProps<"/pro/claimants/[id]/messages">) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  if (
    !session.permissions.includes(
      "claimant.read",
    )
  ) {
    notFound();
  }

  const {
    id,
  } =
    await params;

  const accessibleOnboarding =
    await getClaimantOnboardingByClaimantIdForStaff(
      session,
      id,
    );

  if (!accessibleOnboarding) {
    notFound();
  }

  const profile =
    await getClaimantMessagingProfile(
      id,
    );

  if (!profile) {
    notFound();
  }

  const threads =
    await listClaimantMessageThreadsForStaff(
      id,
    );

  const initialThread =
    threads[0]
      ? await getClaimantMessageThreadForStaff(
          id,
          threads[0].id,
        )
      : undefined;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/pro/claimants/${id}`}
          className="text-xs font-medium text-ink-500 underline underline-offset-4 hover:text-ink-900"
        >
          Back to claimant
        </Link>

        <div className="mt-3">
          <p className="eyebrow text-ink-500">
            Claimant communication
          </p>

          <h1 className="mt-1.5 text-2xl">
            Secure Messages
          </h1>

          <p className="mt-1 text-sm text-ink-600">
            Send claimant-facing communication only. Internal staff discussion belongs in DueQuity Mail.
          </p>
        </div>
      </div>

      <ClaimantConversationWorkspace
        viewer="staff"
        profile={
          profile
        }
        initialThreads={
          threads
        }
        initialThread={
          initialThread
        }
        apiEndpoint={`/api/pro/claimants/${id}/messages`}
        attachmentEndpoint={`/api/pro/claimants/${id}/messages/attachments`}
      />
    </div>
  );
}