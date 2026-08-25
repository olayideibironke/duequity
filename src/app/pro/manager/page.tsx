import type { Metadata } from "next";

import Link from "next/link";

import { jurisdictionLabel } from "@/domain/compliance";

import {
  listCommercialApprovals,
  type PersistedCommercialApproval,
} from "@/server/commercial-approval-store";

import {
  getOpportunityById,
  getPropertyById,
} from "@/server/opportunity-store";

import {
  listOpportunityConversions,
} from "@/server/opportunity-conversion-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  listJurisdictionRulePackages,
} from "@/server/jurisdiction-intelligence";

import { Badge, Identifier } from "@/components/ui/badge";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import {
  formatCents,
  formatCount,
  formatTimestampDate,
} from "@/lib/format";

import {
  ManagerApprovalAction,
} from "@/components/pro/manager-approval-action";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Manager dashboard",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function approvalLabel(
  status: PersistedCommercialApproval["approvalStatus"],
): string {
  switch (status) {
    case "draft":
      return "Needs staff approval";

    case "manager_review":
      return "Manager review";

    case "staff_approved":
      return "Staff approved";

    case "manager_approved":
      return "Manager approved";

    case "rejected":
      return "Rejected";

    case "locked":
      return "Locked";
  }
}

function approvalTone(
  status: PersistedCommercialApproval["approvalStatus"],
): "neutral" | "positive" | "caution" | "critical" {
  switch (status) {
    case "draft":
    case "manager_review":
      return "caution";

    case "staff_approved":
    case "manager_approved":
    case "locked":
      return "positive";

    case "rejected":
      return "critical";
  }
}

function countStatus(
  approvals: PersistedCommercialApproval[],
  statuses: PersistedCommercialApproval["approvalStatus"][],
): number {
  return approvals.filter((approval) =>
    statuses.includes(approval.approvalStatus),
  ).length;
}

function packagePreference(status: string): number {
  switch (status) {
    case "approved":
      return 3;

    case "draft":
      return 2;

    default:
      return 1;
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProManagerPage() {
  /*
   * Resolve the authenticated staff member before any operational reads.
   */
  const session =
    await resolveStaffSession();

  if (!session) {
    return <StaffAuthenticationRequired />;
  }

  /*
   * Load commercial approvals and conversion identifiers first.
   *
   * We deliberately do NOT globally load every Opportunity and Property here.
   * Converted records must pass the central Claim ownership resolver before
   * their Opportunity or Property detail is loaded into this staff request.
   */
  const [
    allApprovals,
    conversions,
    jurisdictionPackages,
  ] =
    await Promise.all([
      listCommercialApprovals(),

      listOpportunityConversions(),

      listJurisdictionRulePackages(),
    ]);

  const conversionByOpportunityId =
    new Map(
      conversions.map(
        (conversion) => [
          conversion.opportunityId,
          conversion,
        ],
      ),
    );

  /* ======================================================================== */
  /* Staff ownership scope                                                    */
  /* ======================================================================== */

  /*
   * Before conversion:
   *
   * Commercial approvals remain part of the shared pricing-management
   * workflow for staff roles that have access to this dashboard.
   *
   * After conversion:
   *
   * The commercial record becomes attached to a real Claim. If that Claim has
   * claimant onboarding, resolveClaimRecord() enforces Stage 16 ownership:
   *
   *   Super Admin
   *     -> may resolve every Claim
   *
   *   ordinary staff
   *     -> may resolve only Claims whose claimant is currently assigned to
   *        that staff user's persisted UUID
   *
   * A converted Claim owned by another staff member therefore disappears from:
   *
   *   - this queue
   *   - this dashboard's counts
   *   - Opportunity details loaded by this page
   *   - Property details loaded by this page
   *
   * This prevents the Manager Dashboard from becoming a side door around the
   * Claim and Claimant ownership boundary.
   */
  const visibleApprovals =
    (
      await Promise.all(
        allApprovals.map(
          async (
            approval,
          ) => {
            const conversion =
              conversionByOpportunityId.get(
                approval.opportunityId,
              );

            /*
             * No Claim exists yet.
             *
             * This remains part of the pre-claim commercial workflow.
             */
            if (!conversion) {
              return approval;
            }

            /*
             * Converted records must pass the central staff ownership boundary.
             */
            const resolvedClaim =
              await resolveClaimRecord(
                conversion.claimId,
              );

            return resolvedClaim
              ? approval
              : undefined;
          },
        ),
      )
    ).flatMap(
      (
        approval,
      ) =>
        approval
          ? [
              approval,
            ]
          : [],
    );

  const sortedApprovals =
    [
      ...visibleApprovals,
    ].sort(
      (
        first,
        second,
      ) =>
        second.updatedAt.localeCompare(
          first.updatedAt,
        ),
    );

  /* ======================================================================== */
  /* Load only visible Opportunity records                                    */
  /* ======================================================================== */

  const visibleOpportunityIds =
    [
      ...new Set(
        visibleApprovals.map(
          (
            approval,
          ) =>
            approval.opportunityId,
        ),
      ),
    ];

  const opportunities =
    (
      await Promise.all(
        visibleOpportunityIds.map(
          (
            opportunityId,
          ) =>
            getOpportunityById(
              opportunityId,
            ),
        ),
      )
    ).flatMap(
      (
        opportunity,
      ) =>
        opportunity
          ? [
              opportunity,
            ]
          : [],
    );

  const opportunityById =
    new Map(
      opportunities.map(
        (
          opportunity,
        ) => [
          opportunity.id,
          opportunity,
        ],
      ),
    );

  /* ======================================================================== */
  /* Load only visible Property records                                       */
  /* ======================================================================== */

  const visiblePropertyIds =
    [
      ...new Set(
        opportunities.map(
          (
            opportunity,
          ) =>
            opportunity.propertyId,
        ),
      ),
    ];

  const properties =
    (
      await Promise.all(
        visiblePropertyIds.map(
          (
            propertyId,
          ) =>
            getPropertyById(
              propertyId,
            ),
        ),
      )
    ).flatMap(
      (
        property,
      ) =>
        property
          ? [
              property,
            ]
          : [],
    );

  const propertyById =
    new Map(
      properties.map(
        (
          property,
        ) => [
          property.id,
          property,
        ],
      ),
    );

  /* ======================================================================== */
  /* Jurisdiction lookup                                                      */
  /* ======================================================================== */

  /*
   * Keep the strongest available persisted rule for each jurisdiction.
   *
   * Approved packages win over drafts. If two packages share the same
   * preference, the later record returned by the repository becomes visible.
   *
   * Jurisdiction rules are governance data and are not claimant-owned records.
   */
  const jurisdictionPackageById =
    new Map<
      string,
      (typeof jurisdictionPackages)[number]
    >();

  for (
    const rulePackage of
      jurisdictionPackages
  ) {
    if (!rulePackage.rule) {
      continue;
    }

    const jurisdictionId =
      rulePackage.rule.id;

    const existing =
      jurisdictionPackageById.get(
        jurisdictionId,
      );

    if (!existing) {
      jurisdictionPackageById.set(
        jurisdictionId,
        rulePackage,
      );

      continue;
    }

    if (
      packagePreference(
        rulePackage.status,
      ) >=
      packagePreference(
        existing.status,
      )
    ) {
      jurisdictionPackageById.set(
        jurisdictionId,
        rulePackage,
      );
    }
  }

  /* ======================================================================== */
  /* Metrics                                                                  */
  /* ======================================================================== */

  /*
   * All dashboard metrics are calculated from the staff-scoped records only.
   *
   * A hidden claimant-owned commercial record therefore cannot leak through a
   * count even when its row is not displayed.
   */
  const awaitingStaff =
    countStatus(
      visibleApprovals,
      [
        "draft",
      ],
    );

  const awaitingManager =
    countStatus(
      visibleApprovals,
      [
        "manager_review",
      ],
    );

  const approved =
    countStatus(
      visibleApprovals,
      [
        "staff_approved",
        "manager_approved",
      ],
    );

  const locked =
    countStatus(
      visibleApprovals,
      [
        "locked",
      ],
    );

  const rejected =
    countStatus(
      visibleApprovals,
      [
        "rejected",
      ],
    );

  const superAdmin =
    session.user.role ===
    "super_admin";

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">
            Management
          </p>

          <h1 className="mt-1.5 text-2xl">
            Manager dashboard
          </h1>

          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
            {superAdmin
              ? "Commercial pricing oversight across persisted Duequity opportunities and all converted claimant assignments."
              : "Commercial pricing oversight within your authorized Duequity scope. Converted records assigned to another staff member are excluded."}
          </p>
        </div>
      </div>

      {/* ================================================================= stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Staff approval"
          value={
            formatCount(
              awaitingStaff,
            )
          }
          tone={
            awaitingStaff >
            0
              ? "caution"
              : "positive"
          }
          context="Awaiting ordinary staff decision"
        />

        <Stat
          label="Manager review"
          value={
            formatCount(
              awaitingManager,
            )
          }
          tone={
            awaitingManager >
            0
              ? "caution"
              : "positive"
          }
          context="Outside ordinary staff authority"
        />

        <Stat
          label="Approved"
          value={
            formatCount(
              approved,
            )
          }
          context="Approved but not yet commercially locked"
        />

        <Stat
          label="Locked"
          value={
            formatCount(
              locked,
            )
          }
          tone={
            locked >
            0
              ? "positive"
              : "default"
          }
          context="Accessible records bound to persisted agreement records"
        />

        <Stat
          label="Rejected"
          value={
            formatCount(
              rejected,
            )
          }
          tone={
            rejected >
            0
              ? "critical"
              : "positive"
          }
          context="Requires recalculation or closure"
        />
      </div>

      {/* ============================================================ boundary */}
      <Callout
        tone="neutral"
        title="Commercial approval boundary"
      >
        <p>
          This dashboard controls commercial pricing, not legal eligibility. A
          pricing approval does not approve a jurisdiction, authorize claimant
          intake, establish legal representation, or confirm that a recovery has
          been paid.
        </p>

        {!superAdmin && (
          <p className="mt-2">
            Once an Opportunity becomes a claimant-linked Claim, its commercial
            record follows that claimant&apos;s current staff assignment and is
            no longer visible here to other staff members.
          </p>
        )}
      </Callout>

      {/* ============================================================= queue */}
      <Card elevated>
        <CardHeader
          title="Commercial approval queue"
          description={
            superAdmin
              ? "Persisted pricing decisions across the complete Duequity management scope."
              : "Persisted pricing decisions available within your current staff scope."
          }
          actions={
            <Badge
              tone="neutral"
              size="md"
            >
              {formatCount(
                visibleApprovals.length,
              )}{" "}
              records
            </Badge>
          }
        />

        <CardBody>
          {sortedApprovals.length ===
          0 ? (
            <EmptyState
              title="No commercial approval records"
              description={
                superAdmin
                  ? "Commercial pricing decisions will appear here after an opportunity receives a persisted quote."
                  : "No commercial pricing records are currently available within your staff scope."
              }
            />
          ) : (
            <div className="space-y-3">
              {sortedApprovals.map(
                (
                  approval,
                ) => {
                  const opportunity =
                    opportunityById.get(
                      approval.opportunityId,
                    );

                  const property =
                    opportunity
                      ? propertyById.get(
                          opportunity.propertyId,
                        )
                      : undefined;

                  const jurisdictionPackage =
                    jurisdictionPackageById.get(
                      approval.jurisdictionId,
                    );

                  const jurisdiction =
                    jurisdictionPackage?.rule;

                  const quote =
                    approval.quoteSnapshot;

                  return (
                    <div
                      key={
                        approval.quoteId
                      }
                      className="rounded-lg border border-line bg-paper px-4 py-4"
                    >
                      {/* ================================================= top */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {opportunity ? (
                              <Link
                                href={`/pro/opportunities/${opportunity.id}`}
                                className="font-semibold text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                              >
                                {
                                  opportunity.reference
                                }
                              </Link>
                            ) : (
                              <Badge tone="critical">
                                Opportunity missing
                              </Badge>
                            )}

                            <Badge
                              tone={
                                approvalTone(
                                  approval.approvalStatus,
                                )
                              }
                              size="md"
                            >
                              {approvalLabel(
                                approval.approvalStatus,
                              )}
                            </Badge>
                          </div>

                          <p className="mt-1 text-sm font-medium text-ink-900">
                            {property?.address.line1 ??
                              opportunity?.reference ??
                              approval.opportunityId}
                          </p>

                          {property ? (
                            <p className="mt-0.5 text-xs text-ink-500">
                              {
                                property.address.city
                              }
                              ,{" "}
                              {
                                property.address.state
                              }{" "}
                              {
                                property.address.postalCode
                              }
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-caution-700">
                              Property record not available
                            </p>
                          )}
                        </div>

                        <Identifier>
                          {
                            approval.quoteId
                          }
                        </Identifier>
                      </div>

                      {/* ============================================== details */}
                      <DataList
                        columns={
                          3
                        }
                        className="mt-4"
                      >
                        <DataItem label="Jurisdiction">
                          {jurisdiction
                            ? jurisdictionLabel(
                                jurisdiction,
                              )
                            : approval.jurisdictionId}
                        </DataItem>

                        <DataItem label="Rule package">
                          {jurisdictionPackage
                            ? jurisdictionPackage.status.replaceAll(
                                "_",
                                " ",
                              )
                            : "Not found"}
                        </DataItem>

                        <DataItem label="Recovery basis">
                          <span className="font-semibold text-ink-900">
                            {formatCents(
                              quote.recoveryAmount,
                            )}
                          </span>

                          <span className="ml-1 text-xs text-ink-500">
                            {
                              quote.recoveryBasis
                            }
                          </span>
                        </DataItem>

                        <DataItem label="Duequity fee">
                          <span className="font-semibold text-ink-900">
                            {formatCents(
                              quote.projectedFee,
                            )}
                          </span>
                        </DataItem>

                        <DataItem label="Claimant projected net">
                          {formatCents(
                            quote.projectedClaimantNet,
                          )}
                        </DataItem>

                        <DataItem label="Commercial policy">
                          Version{" "}
                          {
                            approval.commercialPolicyVersion
                          }

                          <span className="mt-0.5 block font-mono text-2xs text-ink-500">
                            {
                              approval.commercialPolicyId
                            }
                          </span>
                        </DataItem>

                        <DataItem label="Approver">
                          {approval.approvedByUserId ? (
                            <Identifier>
                              {
                                approval.approvedByUserId
                              }
                            </Identifier>
                          ) : (
                            "Not yet approved"
                          )}
                        </DataItem>

                        <DataItem label="Approved">
                          {approval.approvedAt
                            ? formatTimestampDate(
                                approval.approvedAt,
                              )
                            : "Not yet approved"}
                        </DataItem>

                        <DataItem label="Last updated">
                          {formatTimestampDate(
                            approval.updatedAt,
                          )}
                        </DataItem>

                        <DataItem label="Snapshot">
                          <span className="font-mono text-xs text-ink-600">
                            {approval.snapshotHash.slice(
                              0,
                              16,
                            )}
                            …
                          </span>
                        </DataItem>
                      </DataList>

                      {/* ============================================== notes */}
                      {approval.approvalReason && (
                        <Callout
                          tone="neutral"
                          className="mt-4"
                        >
                          <p className="text-sm">
                            <span className="font-semibold text-ink-900">
                              Decision note:{" "}
                            </span>

                            {
                              approval.approvalReason
                            }
                          </p>
                        </Callout>
                      )}

                      {approval.rejectionReason && (
                        <Callout
                          tone="critical"
                          className="mt-4"
                        >
                          <p className="text-sm">
                            <span className="font-semibold">
                              Rejection reason:{" "}
                            </span>

                            {
                              approval.rejectionReason
                            }
                          </p>
                        </Callout>
                      )}

                      {/* ============================================== action */}
                      {approval.approvalStatus ===
                        "manager_review" && (
                        <>
                          {opportunity ? (
                            <ManagerApprovalAction
                              opportunityId={
                                opportunity.id
                              }
                            />
                          ) : (
                            <Callout
                              tone="critical"
                              className="mt-4"
                              title="Approval action unavailable"
                            >
                              <p>
                                The persisted commercial approval references an
                                opportunity that is no longer available. Manager
                                action is disabled until the record relationship
                                is repaired.
                              </p>
                            </Callout>
                          )}
                        </>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}