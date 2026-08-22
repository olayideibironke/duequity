import type { Metadata } from "next";

import { IdleSessionGuard } from "@/components/auth/idle-session-guard";
import { ProShell } from "@/components/pro/pro-shell";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";
import { USER_ROLE_LABEL } from "@/domain/status";
import { resolveOperationsWorkload } from "@/server/operations-workload";
import { resolveStaffSession } from "@/server/staff-session";

export const metadata: Metadata = {
  title: {
    default: "Duequity Pro",
    template: "%s | Duequity Pro",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const dynamic = "force-dynamic";

/**
 * DUEQUITY PRO LAYOUT
 *
 * Resolves the operator session and the navigation badge counts.
 *
 * Every count comes from `resolveOperationsWorkload`, which is the same
 * derivation the work queue page reads. The badge and the page cannot disagree,
 * and neither can show a number that is not backed by a persisted record.
 *
 * There is no fixture data behind these numbers. A count of zero means zero
 * persisted records, not a missing fixture.
 *
 * When no staff session can be established the entire operations shell is
 * withheld. An empty workspace and an unauthenticated workspace must not look
 * the same.
 */

export default async function ProLayout({
  children,
}: LayoutProps<"/pro">) {
  const session =
    await resolveStaffSession();

  if (!session) {
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

        title:
          session.user.title,

        role:
          USER_ROLE_LABEL[
            session.user.role
          ],

        statesCleared:
          session.user.statesCleared,
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