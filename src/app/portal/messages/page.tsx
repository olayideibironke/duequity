import type { Metadata } from "next";

import Link from "next/link";

import { Callout, Card, CardBody, CardHeader } from "@/components/ui/surface";

import { ButtonLink } from "@/components/ui/button";

import { IconDocument, IconLock } from "@/components/ui/icon";

import { resolveClaimantSession } from "@/server/claimant-session";

import { ClaimantAuthenticationRequired } from "@/components/ui/authentication-required";

import { listClaimantOnboardings } from "@/server/claimant-onboarding-store";

import { resolveClaimRecord } from "@/server/claim-record";

export const metadata: Metadata = {
  title: "Messages",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalMessagesPage() {
  /*
   * Temporary claimant-session boundary.
   *
   * Production authentication will replace the current session implementation
   * later. This page does not accept claimant identity from URL parameters.
   */
  const session = await resolveClaimantSession();

  if (!session) {
    return <ClaimantAuthenticationRequired />;
  }

  const onboardings = (await listClaimantOnboardings()).filter(
    (onboarding) => onboarding.claimant.id === session.claimantId,
  );

  /*
   * Resolve only claims that can be proven to belong to the current claimant.
   */
  const claims = (
    await Promise.all(
      onboardings.map(async (onboarding) => {
        const resolved = await resolveClaimRecord(onboarding.claimId);

        if (!resolved) {
          return undefined;
        }

        const belongsToClaimant = resolved.claim.participants.some(
          (participant) => participant.claimantId === session.claimantId,
        );

        if (!belongsToClaimant) {
          return undefined;
        }

        return resolved.claim;
      }),
    )
  ).flatMap((claim) => (claim ? [claim] : []));

  return (
    <div className="space-y-6">
      {/* ================================================================ header */}
      <div>
        <h1 className="text-2xl sm:text-3xl">Messages</h1>

        <p className="mt-1.5 max-w-2xl text-md text-ink-600">
          Communication related to your Duequity recoveries will appear here
          when secure claimant messaging is activated.
        </p>
      </div>

      {/* ======================================================= availability */}
      <Callout tone="neutral" title="Messaging is not active yet">
        <p>
          Duequity does not currently have a production messaging repository
          connected to this portal. For that reason, this page does not display
          sample conversations, invented specialist identities, unread counts,
          or messages that were not actually sent.
        </p>
      </Callout>

      {/* ============================================================ account */}
      <Card>
        <CardHeader
          title="Your recovery account"
          description={
            claims.length === 1
              ? "1 recovery is currently connected to this claimant account."
              : `${claims.length} recoveries are currently connected to this claimant account.`
          }
          actions={
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
              <IconLock size={13} />
              Claimant account
            </span>
          }
        />

        <CardBody>
          {claims.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink-600">
              No recovery claim is currently connected to this claimant account.
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {claims.map((claim) => (
                <li
                  key={claim.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-ink-500">
                      {claim.reference}
                    </p>

                    <p className="mt-1 text-sm font-medium text-ink-900">
                      Recovery claim
                    </p>
                  </div>

                  <Link
                    href={`/portal/claims/${claim.id}`}
                    className="text-sm font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                  >
                    View claim
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ======================================================= documents */}
      <Card>
        <CardHeader
          title="Need to provide a document?"
          description="Existing document requirements and uploads remain available through the Documents section."
        />

        <CardBody>
          <ButtonLink
            href="/portal/documents"
            variant="primary"
            accent
            leading={<IconDocument size={16} />}
          >
            Open documents
          </ButtonLink>
        </CardBody>
      </Card>

      {/* ============================================================ safety */}
      <Callout tone="neutral" title="Protect sensitive information">
        <p>
          Do not send Social Security numbers, bank account details, passwords,
          authentication codes, or identity-document contents through an
          unapproved communication channel. When a production messaging channel
          is enabled, the portal will clearly identify where messages are stored
          and how they are protected.
        </p>
      </Callout>
    </div>
  );
}