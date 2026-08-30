import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  CLAIM_STATUS,
  DOCUMENT_KIND_LABEL,
  type StatusDescriptor,
} from "@/domain/status";

import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Callout,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import {
  Badge,
  Identifier,
  StatusBadge,
} from "@/components/ui/badge";

import {
  ButtonLink,
} from "@/components/ui/button";

import {
  Amount,
  MoneyInline,
} from "@/components/ui/money";

import {
  IconArrowRight,
  IconUpload,
} from "@/components/ui/icon";

import {
  formatCount,
  formatDate,
  plural,
} from "@/lib/format";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

import {
  ClaimantAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  listClaimantOnboardings,
} from "@/server/claimant-onboarding-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  getPropertyById,
} from "@/server/opportunity-store";

import {
  listClaimDocumentRequests,
} from "@/server/claim-document-store";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

export const metadata: Metadata = {
  title:
    "My Duequity",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Pre-Claim rows                                                              */
/* ========================================================================== */

interface AssignedWorkcaseRow {
  id:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  legal_first_name:
    string;

  legal_last_name:
    string;

  status:
    string;

  linked_claim_id:
    string | null;
}

interface AssignedIdentityRow {
  identity_verification:
    string;

  identity_verified_at:
    string | null;
}

/* ========================================================================== */
/* Claimant-facing claim status                                                */
/* ========================================================================== */

function claimantFacingClaimStatus({
  status,
  hasOpenDocumentRequests,
}: {
  status:
    keyof typeof CLAIM_STATUS;

  hasOpenDocumentRequests:
    boolean;
}): StatusDescriptor {
  const descriptor =
    CLAIM_STATUS[
      status
    ];

  if (
    status ===
      "documentation" &&
    !hasOpenDocumentRequests
  ) {
    return {
      ...descriptor,

      tone:
        "neutral",

      claimantLabel:
        "In progress",

      hint:
        "No documents are currently requested from you. Duequity is continuing internal claim preparation and review.",
    };
  }

  return descriptor;
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalOverviewPage() {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  /* ======================================================================== */
  /* Claim-backed claimant                                                    */
  /* ======================================================================== */

  const allOnboardings =
    await listClaimantOnboardings();

  const onboardings =
    allOnboardings.filter(
      (
        onboarding,
      ) =>
        onboarding.claimant.id ===
        session.claimantId,
    );

  const claimant =
    onboardings[
      0
    ]?.claimant;

  /* ======================================================================== */
  /* Active pre-Claim claimant                                                */
  /* ======================================================================== */

  const admin =
    getSupabaseAdmin();

  const {
    data:
      assignedWorkcaseData,
    error:
      assignedWorkcaseError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, claimant_id, claimant_reference, legal_first_name, legal_last_name, status, linked_claim_id",
      )
      .eq(
        "claimant_id",
        session.claimantId,
      )
      .eq(
        "status",
        "activated",
      )
      .is(
        "linked_claim_id",
        null,
      )
      .maybeSingle();

  if (
    assignedWorkcaseError
  ) {
    throw new Error(
      `Unable to load claimant recovery account: ${assignedWorkcaseError.message}`,
    );
  }

  const assignedWorkcase =
    assignedWorkcaseData
      ? assignedWorkcaseData as
          AssignedWorkcaseRow
      : null;

  let assignedIdentity:
    AssignedIdentityRow | null =
    null;

  if (
    assignedWorkcase
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "assigned_lead_claimant_identity_profiles",
        )
        .select(
          "identity_verification, identity_verified_at",
        )
        .eq(
          "workcase_id",
          assignedWorkcase.id,
        )
        .eq(
          "claimant_id",
          assignedWorkcase.claimant_id,
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to load claimant identity status: ${error.message}`,
      );
    }

    assignedIdentity =
      data
        ? data as
            AssignedIdentityRow
        : null;
  }

  /* ======================================================================== */
  /* Persisted Claims                                                         */
  /* ======================================================================== */

  const claimRows =
    (
      await Promise.all(
        onboardings.map(
          async (
            onboarding,
          ) => {
            const resolved =
              await resolveClaimRecord(
                onboarding.claimId,
              );

            if (
              !resolved
            ) {
              return undefined;
            }

            const claimantParticipant =
              resolved.claim.participants.find(
                (
                  participant,
                ) =>
                  participant.claimantId ===
                  session.claimantId,
              );

            if (
              !claimantParticipant
            ) {
              return undefined;
            }

            const [
              property,
              documentRequests,
            ] =
              await Promise.all([
                getPropertyById(
                  resolved.claim.propertyId,
                ),

                listClaimDocumentRequests(
                  resolved.claim.id,
                ),
              ]);

            return {
              claim:
                resolved.claim,

              onboarding,

              property,

              documentRequests,
            };
          },
        ),
      )
    ).flatMap(
      (
        row,
      ) =>
        row
          ? [
              row,
            ]
          : [],
    );

  /* ======================================================================== */
  /* Summary                                                                  */
  /* ======================================================================== */

  const activeClaims =
    claimRows.filter(
      ({
        claim,
      }) =>
        claim.status !==
          "paid" &&
        claim.status !==
          "closed" &&
        claim.status !==
          "withdrawn",
    );

  const completedClaims =
    claimRows.filter(
      ({
        claim,
      }) =>
        claim.status ===
          "paid" ||
        claim.status ===
          "closed",
    );

  const outstandingRequests =
    claimRows.flatMap(
      (
        row,
      ) =>
        row.documentRequests
          .filter(
            (
              request,
            ) =>
              request.status ===
                "outstanding" ||
              request.status ===
                "overdue",
          )
          .map(
            (
              request,
            ) => ({
              request,

              claim:
                row.claim,
            }),
          ),
    );

  const confirmedRecovered =
    completedClaims.reduce(
      (
        total,
        {
          claim,
        },
      ) =>
        total +
        (
          claim.confirmedRecovery
            ?.amount ??
          0
        ),
      0,
    );

  const activeRecoveryCount =
    activeClaims.length +
    (
      assignedWorkcase
        ? 1
        : 0
    );

  /* ======================================================================== */
  /* Next claimant action                                                     */
  /* ======================================================================== */

  const nextDocumentAction =
    outstandingRequests
      .slice()
      .sort(
        (
          left,
          right,
        ) => {
          const leftDue =
            left.request.dueBy ??
            "9999-12-31";

          const rightDue =
            right.request.dueBy ??
            "9999-12-31";

          return leftDue.localeCompare(
            rightDue,
          );
        },
      )[
        0
      ];

  const assignedLegalName =
    assignedWorkcase
      ? [
          assignedWorkcase
            .legal_first_name,
          assignedWorkcase
            .legal_last_name,
        ]
          .filter(
            Boolean,
          )
          .join(
            " ",
          )
      : undefined;

  const preferredName =
    claimant?.preferredName?.trim() ||
    claimant?.legalName?.trim() ||
    assignedLegalName;

  const firstName =
    preferredName
      ?.split(
        /\s+/,
      )[
        0
      ];

  const assignedIdentityVerified =
    assignedIdentity
      ?.identity_verification ===
    "verified";

  return (
    <div className="space-y-8">
      {/* ================================================================ header */}

      <div>
        <h1 className="text-2xl sm:text-3xl">
          {
            firstName
              ? `Welcome back, ${firstName}`
              : "My Duequity"
          }
        </h1>

        <p className="mt-1.5 text-md text-ink-600">
          {
            activeClaims.length >
            0
              ? `You have ${formatCount(
                  activeClaims.length,
                )} active ${plural(
                  activeClaims.length,
                  "recovery",
                  "recoveries",
                )} with Duequity.`
              : assignedWorkcase
                ? "Your Duequity recovery account is active. No official claim has been opened yet."
                : claimRows.length >
                    0
                  ? "You do not currently have an active recovery."
                  : "Your recovery information will appear here when a claim is connected to your account."
          }
        </p>
      </div>

      {/* ========================================================= next action */}

      {
        nextDocumentAction
          ? (
              <Card
                elevated
                className="border-caution-200 bg-caution-50"
              >
                <CardBody>
                  <p className="eyebrow text-caution-700">
                    Action needed from you
                  </p>

                  <p className="mt-2 text-lg leading-snug font-semibold text-ink-900">
                    Upload{" "}
                    {
                      DOCUMENT_KIND_LABEL[
                        nextDocumentAction
                          .request
                          .kind
                      ]
                    }
                    .
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-600">
                    <span>
                      Claim{" "}

                      <Identifier>
                        {
                          nextDocumentAction
                            .claim
                            .reference
                        }
                      </Identifier>
                    </span>

                    {
                      nextDocumentAction
                        .request
                        .dueBy &&
                      (
                        <span>
                          Requested by{" "}
                          {
                            formatDate(
                              nextDocumentAction
                                .request
                                .dueBy,
                            )
                          }
                        </span>
                      )
                    }

                    {
                      nextDocumentAction
                        .request
                        .status ===
                        "overdue" &&
                      (
                        <Badge tone="critical">
                          Overdue
                        </Badge>
                      )
                    }
                  </div>

                  {
                    nextDocumentAction
                      .request
                      .guidance &&
                    (
                      <p className="mt-3 text-sm leading-relaxed text-ink-600">
                        {
                          nextDocumentAction
                            .request
                            .guidance
                        }
                      </p>
                    )
                  }

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <ButtonLink
                      href="/portal/documents"
                      variant="primary"
                      accent
                      leading={
                        <IconUpload
                          size={
                            16
                          }
                        />
                      }
                    >
                      Upload documents
                    </ButtonLink>

                    <ButtonLink
                      href={`/portal/claims/${nextDocumentAction.claim.id}`}
                    >
                      View this claim
                    </ButtonLink>
                  </div>
                </CardBody>
              </Card>
            )
          : activeClaims.length >
              0
            ? (
                <Callout
                  tone="positive"
                  title="Nothing is needed from you right now"
                >
                  <p>
                    There are no outstanding claimant document requests on your
                    active recoveries. You can review each claim below for its
                    current status.
                  </p>
                </Callout>
              )
            : assignedWorkcase
              ? (
                  <Callout
                    tone={
                      assignedIdentityVerified
                        ? "positive"
                        : "neutral"
                    }
                    title={
                      assignedIdentityVerified
                        ? "Your identity is verified"
                        : "Your recovery account is active"
                    }
                  >
                    <p>
                      {
                        assignedIdentityVerified
                          ? "Your portal and identity verification are complete. Nothing else is currently requested from you. An official claim will appear here only when Duequity completes the required claim-opening controls."
                          : "Your recovery account is active. Check the Identity section for the current identity-verification status."
                      }
                    </p>
                  </Callout>
                )
              : null
      }

      {/* ============================================================ summary */}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Active recoveries"
          value={
            formatCount(
              activeRecoveryCount,
            )
          }
          context={
            assignedWorkcase &&
            activeClaims.length ===
              0
              ? "Recovery account active, claim not opened yet"
              : activeRecoveryCount >
                  0
                ? "Currently in progress"
                : "None currently"
          }
        />

        <Stat
          label="Items needed"
          value={
            formatCount(
              outstandingRequests.length,
            )
          }
          tone={
            outstandingRequests.length >
            0
              ? "caution"
              : "default"
          }
          context={
            outstandingRequests.length >
            0
              ? "Documents still requested from you"
              : "Nothing outstanding"
          }
        />

        <Stat
          label="Completed"
          value={
            formatCount(
              completedClaims.length,
            )
          }
          tone={
            completedClaims.length >
            0
              ? "positive"
              : "default"
          }
          context="Paid or closed recoveries"
        />

        <Stat
          label="Confirmed recovered"
          value={
            <Amount
              cents={
                confirmedRecovered
              }
              size="lg"
              whole
            />
          }
          tone={
            confirmedRecovered >
            0
              ? "positive"
              : "default"
          }
          context="Confirmed amount on completed recoveries"
        />
      </div>

      {/* ================================================================= claims */}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-ink-500">
              Recoveries
            </p>

            <h2 className="mt-1 text-xl">
              Your claims
            </h2>
          </div>

          {
            claimRows.length >
              0 &&
            (
              <ButtonLink
                href="/portal/claims"
                size="sm"
                trailing={
                  <IconArrowRight
                    size={
                      14
                    }
                  />
                }
              >
                All claims
              </ButtonLink>
            )
          }
        </div>

        {
          claimRows.length ===
          0
            ? (
                <EmptyState
                  className="mt-4"
                  title="No official claims connected"
                  description={
                    assignedWorkcase
                      ? "Your recovery account is active, but no official Duequity claim has been opened yet."
                      : "No persisted recovery claim is currently connected to this claimant account."
                  }
                />
              )
            : (
                <div className="mt-4 space-y-4">
                  {
                    claimRows.map(
                      ({
                        claim,
                        property,
                        documentRequests,
                      }) => {
                        const openRequests =
                          documentRequests.filter(
                            (
                              request,
                            ) =>
                              request.status ===
                                "outstanding" ||
                              request.status ===
                                "overdue",
                          );

                        const claimantStatus =
                          claimantFacingClaimStatus({
                            status:
                              claim.status,

                            hasOpenDocumentRequests:
                              openRequests.length >
                              0,
                          });

                        const recovery =
                          claim.confirmedRecovery ??
                          claim.estimatedRecovery;

                        const counselEngaged =
                          claim.attorneyAssignment
                            ?.status ===
                          "engaged";

                        return (
                          <Card
                            key={
                              claim.id
                            }
                          >
                            <CardHeader
                              eyebrow={
                                property
                                  ? [
                                      property
                                        .address
                                        .county,

                                      property
                                        .address
                                        .state,
                                    ]
                                      .filter(
                                        Boolean,
                                      )
                                      .join(
                                        ", ",
                                      )
                                  : claim.reference
                              }
                              title={
                                <Link
                                  href={`/portal/claims/${claim.id}`}
                                  className="rounded-xs transition-colors hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                                >
                                  {
                                    property
                                      ?.address
                                      .line1 ??
                                    claim.reference
                                  }
                                </Link>
                              }
                              description={
                                property
                                  ? `${property.address.city}, ${property.address.state}`
                                  : `Claim ${claim.reference}`
                              }
                              actions={
                                <StatusBadge
                                  status={
                                    claimantStatus
                                  }
                                  audience="claimant"
                                  size="md"
                                />
                              }
                            />

                            <CardBody>
                              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                                <div>
                                  <p className="text-xs text-ink-500">
                                    Claim
                                  </p>

                                  <p className="mt-0.5">
                                    <Identifier>
                                      {
                                        claim.reference
                                      }
                                    </Identifier>
                                  </p>

                                  {
                                    counselEngaged &&
                                    (
                                      <p className="mt-3">
                                        <Badge tone="counsel">
                                          Independent counsel engaged
                                        </Badge>
                                      </p>
                                    )
                                  }
                                </div>

                                <div className="sm:text-right">
                                  <p className="text-xs text-ink-500">
                                    {
                                      claim.confirmedRecovery
                                        ? "Confirmed recovery"
                                        : "Current estimate"
                                    }
                                  </p>

                                  <p className="mt-0.5">
                                    <MoneyInline
                                      fact={
                                        recovery
                                      }
                                    />
                                  </p>
                                </div>
                              </div>

                              {
                                openRequests.length >
                                  0 &&
                                (
                                  <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3">
                                    <p className="text-sm font-semibold text-ink-900">
                                      {
                                        formatCount(
                                          openRequests.length,
                                        )
                                      }{" "}
                                      {
                                        plural(
                                          openRequests.length,
                                          "document",
                                        )
                                      }{" "}
                                      needed
                                    </p>

                                    <ul className="mt-1.5 space-y-1">
                                      {
                                        openRequests.map(
                                          (
                                            request,
                                          ) => (
                                            <li
                                              key={
                                                request.id
                                              }
                                              className="text-sm text-ink-700"
                                            >
                                              {
                                                DOCUMENT_KIND_LABEL[
                                                  request.kind
                                                ]
                                              }

                                              {
                                                request.dueBy &&
                                                (
                                                  <span className="text-ink-500">
                                                    {" "}
                                                    by{" "}
                                                    {
                                                      formatDate(
                                                        request.dueBy,
                                                      )
                                                    }
                                                  </span>
                                                )
                                              }

                                              {
                                                request.status ===
                                                  "overdue" &&
                                                (
                                                  <span className="ml-1.5 font-medium text-critical-700">
                                                    Overdue
                                                  </span>
                                                )
                                              }
                                            </li>
                                          ),
                                        )
                                      }
                                    </ul>
                                  </div>
                                )
                              }
                            </CardBody>

                            <CardFooter>
                              <p className="text-sm text-ink-600">
                                {
                                  counselEngaged
                                    ? "Duequity remains responsible for permitted administrative coordination while independent counsel handles the legal work."
                                    : openRequests.length >
                                        0
                                      ? "View this recovery for current status and document requirements."
                                      : "No documents are currently requested from you. View this recovery for its current status."
                                }
                              </p>

                              <ButtonLink
                                href={`/portal/claims/${claim.id}`}
                                size="sm"
                                trailing={
                                  <IconArrowRight
                                    size={
                                      14
                                    }
                                  />
                                }
                              >
                                Open claim
                              </ButtonLink>
                            </CardFooter>
                          </Card>
                        );
                      },
                    )
                  }
                </div>
              )
        }
      </section>

      <Callout
        tone="neutral"
        title="Your recovery information"
      >
        <p>
          This portal displays only persisted recovery workcases, claims and
          onboarding records connected to the current claimant session. Duequity
          does not display internal staff notes, risk analysis, or records
          belonging to another claimant.
        </p>
      </Callout>
    </div>
  );
}