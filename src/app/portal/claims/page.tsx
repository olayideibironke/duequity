import type { Metadata } from "next";

import Link from "next/link";

import { resolveClaimantSession } from "@/server/claimant-session";

import { ClaimantAuthenticationRequired } from "@/components/ui/authentication-required";

import { CLAIM_STATUS } from "@/domain/status";

import type { Claim } from "@/domain/types";

import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
} from "@/components/ui/surface";

import { Badge, Identifier, StatusBadge } from "@/components/ui/badge";

import { ButtonLink } from "@/components/ui/button";

import { MoneyInline } from "@/components/ui/money";

import { IconArrowRight } from "@/components/ui/icon";

import { formatDate, plural } from "@/lib/format";

import { resolveClaimRecord } from "@/server/claim-record";

import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";

import { resolveClaimDocumentReadiness } from "@/server/claim-document-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { getPropertyById } from "@/server/opportunity-store";

export const metadata: Metadata = {
  title: "Your claims",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function stageLabel(
  stageKey: string,
): string {
  return stageKey
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

async function loadClaimantClaims(
  claimantId: string,
): Promise<Claim[]> {
  const conversions =
    await listOpportunityConversions();

  const resolved =
    await Promise.all(
      conversions.map(
        async (
          conversion,
        ) => {
          const claimRecord =
            await resolveClaimRecord(
              conversion.claimId,
            );

          if (
            !claimRecord
          ) {
            return undefined;
          }

          const onboarding =
            await getClaimantOnboarding(
              claimRecord.claim.id,
            );

          if (
            !onboarding ||
            onboarding.claimant.id !==
              claimantId
          ) {
            return undefined;
          }

          return claimRecord.claim;
        },
      ),
    );

  return resolved
    .flatMap(
      (
        claim,
      ) =>
        claim
          ? [claim]
          : [],
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.lastActivityAt.localeCompare(
          left.lastActivityAt,
        ),
    );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalClaimsPage() {
  /*
   * Claimant identity continues to come from the existing session boundary.
   *
   * The session implementation will be replaced during the dedicated
   * authentication phase. This page does not accept a claimant ID from the
   * browser or query string.
   *
   * Claimants may view only claims Duequity has already linked to their verified
   * claimant profile. Property checking and surplus discovery are staff-only
   * capabilities and are not exposed through the claimant portal.
   */
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  const claims =
    await loadClaimantClaims(
      session.claimantId,
    );

  const jurisdictionPackages =
    await listJurisdictionRulePackages();

  const jurisdictionById =
    new Map(
      jurisdictionPackages
        .filter(
          (
            rulePackage,
          ) =>
            rulePackage.status ===
              "approved" &&
            Boolean(
              rulePackage.rule,
            ),
        )
        .map(
          (
            rulePackage,
          ) => [
            rulePackage.rule!.id,
            rulePackage.rule!,
          ],
        ),
    );

  const claimViews =
    await Promise.all(
      claims.map(
        async (
          claim,
        ) => {
          const [
            property,
            documentReadiness,
          ] =
            await Promise.all([
              getPropertyById(
                claim.propertyId,
              ),

              resolveClaimDocumentReadiness(
                claim.id,
              ),
            ]);

          const jurisdiction =
            jurisdictionById.get(
              claim.jurisdictionId,
            );

          const outstandingRequests =
            documentReadiness.requiredRequests.filter(
              (
                request,
              ) =>
                request.status !==
                "accepted",
            );

          return {
            claim,
            property,
            jurisdiction,
            outstandingRequests,
          };
        },
      ),
    );

  return (
    <div className="space-y-6">
      {/* ================================================================ header */}
      <div>
        <h1 className="text-2xl sm:text-3xl">
          Your claims
        </h1>

        <p className="mt-1.5 text-md text-ink-600">
          Track every recovery claim Duequity is handling for you, including its
          current stage, value and outstanding document requirements.
        </p>
      </div>

      {/* ================================================================= empty */}
      {claimViews.length ===
      0 ? (
        <EmptyState
          title="No claims yet"
          description="When an eligible recovery claim is opened and linked to your verified claimant profile, it will appear here."
        />
      ) : (
        <div className="space-y-4">
          {claimViews.map(
            ({
              claim,
              property,
              jurisdiction,
              outstandingRequests,
            }) => {
              const recovery =
                claim.confirmedRecovery ??
                claim.estimatedRecovery;

              const propertyTitle =
                property
                  ? property.address
                      .line1
                  : "Property record";

              const propertyLocation =
                property
                  ? [
                      property.address
                        .city,

                      property.address
                        .county
                        ? `${property.address.county} County`
                        : undefined,

                      property.address
                        .state,
                    ]
                      .filter(
                        Boolean,
                      )
                      .join(
                        ", ",
                      )
                  : "Property information unavailable";

              return (
                <Card
                  key={
                    claim.id
                  }
                >
                  <CardHeader
                    eyebrow={
                      <span className="flex flex-wrap items-center gap-2">
                        <Identifier>
                          {
                            claim.reference
                          }
                        </Identifier>

                        <span className="text-ink-400">
                          Opened{" "}
                          {formatDate(
                            claim.createdAt,
                          )}
                        </span>
                      </span>
                    }
                    title={
                      <Link
                        href={`/portal/claims/${claim.id}`}
                        className="rounded-xs transition-colors hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                      >
                        {
                          propertyTitle
                        }
                      </Link>
                    }
                    description={
                      jurisdiction
                        ? `${propertyLocation}. Funds held by ${jurisdiction.agencyName}.`
                        : propertyLocation
                    }
                    actions={
                      <StatusBadge
                        status={
                          CLAIM_STATUS[
                            claim.status
                          ]
                        }
                        audience="claimant"
                        size="md"
                      />
                    }
                  />

                  <CardBody>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                          Current stage
                        </p>

                        <p className="mt-1 text-sm font-semibold text-ink-900">
                          {stageLabel(
                            claim.stageKey,
                          )}
                        </p>
                      </div>

                      <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                          Recovery
                        </p>

                        <p className="mt-1">
                          <MoneyInline
                            fact={
                              recovery
                            }
                          />
                        </p>

                        <p className="mt-1 text-2xs text-ink-500">
                          {claim.confirmedRecovery
                            ? "Confirmed"
                            : "Estimated"}
                        </p>
                      </div>

                      <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                          Documents
                        </p>

                        {outstandingRequests.length ===
                        0 ? (
                          <div className="mt-1">
                            <Badge tone="positive">
                              Current
                            </Badge>
                          </div>
                        ) : (
                          <>
                            <p className="mt-1 text-sm font-semibold text-caution-800">
                              {
                                outstandingRequests.length
                              }{" "}
                              {plural(
                                outstandingRequests.length,
                                "item",
                              )}{" "}
                              outstanding
                            </p>

                            <p className="mt-1 text-2xs text-ink-500">
                              Action may be required
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {outstandingRequests.length >
                      0 && (
                      <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-caution-700">
                          Action needed from you
                        </p>

                        <p className="mt-1 text-sm text-ink-800">
                          Please provide the outstanding documents required for
                          this claim.
                        </p>

                        <p className="mt-1 text-xs text-ink-600">
                          {
                            outstandingRequests.length
                          }{" "}
                          {plural(
                            outstandingRequests.length,
                            "document",
                          )}{" "}
                          remaining.
                        </p>
                      </div>
                    )}

                    {claim.filingDeadline && (
                      <p className="mt-4 text-xs text-ink-500">
                        Filing deadline:{" "}
                        <span className="font-medium text-ink-700">
                          {formatDate(
                            claim.filingDeadline,
                          )}
                        </span>
                      </p>
                    )}
                  </CardBody>

                  <CardFooter>
                    <p className="text-sm text-ink-600">
                      {claim.assignedSpecialistId
                        ? "Assigned to the Duequity recovery team"
                        : "Awaiting team assignment"}
                    </p>

                    <ButtonLink
                      href={`/portal/claims/${claim.id}`}
                      size="sm"
                      trailing={
                        <IconArrowRight
                          size={14}
                        />
                      }
                    >
                      Open claim
                    </ButtonLink>
                  </CardFooter>
                </Card>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}