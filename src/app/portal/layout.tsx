import type { Metadata } from "next";

import { IdleSessionGuard } from "@/components/auth/idle-session-guard";
import { PortalShell } from "@/components/portal/portal-shell";
import { resolveClaimantSession } from "@/server/claimant-session";

export const metadata: Metadata = {
  title: {
    default: "My Duequity",

    template: "%s | My Duequity",
  },

  robots: {
    index: false,

    follow: false,

    nocache: true,
  },
};

/**
 * Claimant portal chrome.
 *
 * Claim-specific authorization remains inside the server-side portal routes.
 * This layout intentionally does not select claimant identities from URL
 * parameters or preload one claimant's records for another route.
 *
 * The shared idle-session guard is mounted only when a legitimate claimant
 * session can be resolved.
 */
export default async function PortalLayout({
  children,
}: LayoutProps<"/portal">) {
  const session =
    await resolveClaimantSession();

  return (
    <PortalShell>
      {session && <IdleSessionGuard />}
      {children}
    </PortalShell>
  );
}