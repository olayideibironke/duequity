import type { Metadata } from "next";

import { PortalShell } from "@/components/portal/portal-shell";

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
 */
export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return <PortalShell>{children}</PortalShell>;
}
