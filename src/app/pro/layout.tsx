import type {
  Metadata,
} from "next";

import {
  IdleSessionGuard,
} from "@/components/auth/idle-session-guard";

import {
  ProShell,
} from "@/components/pro/pro-shell";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  resolveOperationsWorkload,
} from "@/server/operations-workload";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const metadata:
  Metadata = {
  title: {
    default:
      "Duequity Pro",

    template:
      "%s | Duequity Pro",
  },

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

export default async function ProLayout({
  children,
}: LayoutProps<"/pro">) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <StaffAuthenticationRequired />
      </div>
    );
  }

  const workload =
    await resolveOperationsWorkload();

  return (
    <ProShell
      operator={{
        name:
          session.user.name,

        email:
          session.user.email,

        title:
          session.user.title,

        role:
          session.user.role,

        permissions:
          session.permissions,
      }}
      counts={{
        opportunities:
          workload.openOpportunityCount,

        claims:
          workload.openClaimCount,

        tasksOverdue:
          workload.blockedTaskCount +
          workload.overdueTaskCount,

        documentsOutstanding:
          workload.outstandingDocumentCount,

        complianceBlocked:
          workload.complianceBlockedCount,
      }}
    >
      <IdleSessionGuard />

      {children}
    </ProShell>
  );
}