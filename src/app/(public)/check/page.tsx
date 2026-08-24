import type { Metadata } from "next";

import {
  redirect,
} from "next/navigation";

import {
  can,
} from "@/lib/session";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const metadata: Metadata = {
  title: "Staff operations",

  robots: {
    index:
      false,

    follow:
      false,
  },
};

export const dynamic =
  "force-dynamic";

/**
 * LEGACY PROPERTY-CHECK ROUTE
 *
 * Property checking, surplus discovery and claimant research are internal
 * Duequity operational capabilities.
 *
 * This route intentionally renders no public search interface and performs no
 * public record lookup.
 *
 * Existing links or bookmarks are routed through the staff authentication and
 * authorization boundary before reaching the operational discovery workspace.
 */
export default async function CheckPage() {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    redirect(
      "/staff/sign-in",
    );
  }

  if (
    !can(
      session,
      "opportunity.write",
    )
  ) {
    redirect(
      "/pro",
    );
  }

  redirect(
    "/pro/discovered-records",
  );
}