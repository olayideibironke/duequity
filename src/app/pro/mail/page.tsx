import type {
  Metadata,
} from "next";

import {
  StaffMailClient,
} from "@/components/pro/staff-mail-client";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const metadata:
  Metadata = {
  title:
    "Mail",
};

export const dynamic =
  "force-dynamic";

export default async function ProMailPage() {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-ink-500">
          Work
        </p>

        <h1 className="mt-1.5 text-2xl">
          Internal Mail
        </h1>

        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
          Secure staff-to-staff communication, operational assignments and confidential file transfer inside DueQuity.
        </p>
      </div>

      <StaffMailClient />
    </div>
  );
}