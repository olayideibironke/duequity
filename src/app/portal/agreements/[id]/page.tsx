import type {
  Metadata,
} from "next";

import {
  notFound,
} from "next/navigation";

import {
  ClaimantAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  ClaimantAgreementReview,
} from "@/components/portal/claimant-agreement-review";

import {
  getClaimantAgreementForPortal,
} from "@/server/claimant-agreement-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

export const dynamic =
  "force-dynamic";

export const metadata:
  Metadata = {
  title:
    "Review Agreement",

  robots: {
    index:
      false,

    follow:
      false,
  },
};

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface PortalAgreementPageProps {
  params: Promise<{
    id: string;
  }>;
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalAgreementDetailPage({
  params,
}: PortalAgreementPageProps) {
  const session =
    await resolveClaimantSession();

  if (!session) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  const {
    id,
  } =
    await params;

  const envelopeId =
    id.trim();

  if (
    !envelopeId
  ) {
    notFound();
  }

  const agreement =
    await getClaimantAgreementForPortal({
      claimantId:
        session.claimantId,

      envelopeId,
    });

  if (!agreement) {
    notFound();
  }

  if (
    agreement.status ===
      "draft" ||
    agreement.status ===
      "voided"
  ) {
    notFound();
  }

  return (
    <ClaimantAgreementReview
      agreement={
        agreement
      }
    />
  );
}