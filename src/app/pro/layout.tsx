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
  getStaffMailFolderCounts,
} from "@/server/staff-mail-store";

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

  /*
   * Public communications is an isolated staff lane.
   *
   * Communications Specialists do not query operational workload, claimant
   * records or internal DueQuity Mail merely by loading the Pro shell.
   */
  if (
    session.user.role ===
    "communications_specialist"
  ) {
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
            0,

          claims:
            0,

          tasksOverdue:
            0,

          documentsOutstanding:
            0,

          complianceBlocked:
            0,

          mailUnread:
            0,
        }}
      >
        <IdleSessionGuard />

        {children}
      </ProShell>
    );
  }

  const [
    workload,
    mailCounts,
  ] =
    await Promise.all([
      resolveOperationsWorkload(),

      getStaffMailFolderCounts(
        session.user.id,
      ),
    ]);

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

        mailUnread:
          mailCounts.unread,
      }}
    >
      <IdleSessionGuard />

      {children}
    </ProShell>
  );
}