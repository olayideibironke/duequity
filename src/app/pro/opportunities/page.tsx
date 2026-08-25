import type { Metadata } from "next";

import {
  assessDeadline,
  evaluateIntakeGate,
} from "@/domain/compliance";

import {
  OPPORTUNITY_STATUS,
  RISK_FLAG_LABEL,
  SALE_TYPE_LABEL,
} from "@/domain/status";

import type {
  IsoDate,
  Jurisdiction,
  Opportunity,
  Property,
} from "@/domain/types";

import {
  Badge,
  PriorityMark,
  StatusBadge,
} from "@/components/ui/badge";

import {
  Card,
  EmptyState,
} from "@/components/ui/surface";

import {
  FilterLinks,
} from "@/components/ui/tabs";

import {
  RecordList,
  RecordListItem,
  Table,
  TableFooter,
  TableRegion,
  TableToolbar,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
} from "@/components/ui/table";

import {
  MoneyInline,
} from "@/components/ui/money";

import {
  formatCents,
  formatDate,
  formatCount,
} from "@/lib/format";

import {
  listOpportunities,
  listProperties,
} from "@/server/opportunity-store";

import {
  listOpportunityConversions,
} from "@/server/opportunity-conversion-store";

import {
  listJurisdictionRulePackages,
} from "@/server/jurisdiction-intelligence";

import {
  staffCanAccessClaimantOwnedClaim,
} from "@/server/opportunity-staff-access";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title:
    "Opportunities",
};

export const dynamic =
  "force-dynamic";

interface PersistedConversionSummary {
  opportunityId:
    string;

  claimId:
    string;

  claimReference:
    string;
}

interface IntakeGateSummary {
  outcome:
    | "permitted"
    | "conditional"
    | "blocked";

  reason:
    string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    ) as IsoDate;
}

function propertyFor(
  propertyById:
    Map<
      string,
      Property
    >,
  opportunity:
    Opportunity,
):
  | Property
  | undefined {
  return propertyById.get(
    opportunity.propertyId,
  );
}

function intakeGateFor(
  jurisdictionById:
    Map<
      string,
      Jurisdiction
    >,
  opportunity:
    Opportunity,
): IntakeGateSummary {
  const jurisdiction =
    jurisdictionById.get(
      opportunity.jurisdictionId,
    );

  if (!jurisdiction) {
    return {
      outcome:
        "blocked",

      reason:
        "No approved jurisdiction rule is published for this opportunity.",
    };
  }

  return evaluateIntakeGate(
    jurisdiction,
  );
}

function isPersistentlyConverted(
  opportunity:
    Opportunity,
  convertedOpportunityIds:
    Set<string>,
): boolean {
  return (
    convertedOpportunityIds.has(
      opportunity.id,
    ) ||
    Boolean(
      opportunity.convertedClaimId,
    ) ||
    String(
      opportunity.status,
    ) ===
      "converted"
  );
}

function hasBlockingFlag(
  opportunity:
    Opportunity,
): boolean {
  return opportunity.flags.some(
    (
      flag,
    ) =>
      flag.severity ===
        "blocking" &&
      !flag.resolvedAt,
  );
}

function opportunitiesForFilter(
  all:
    Opportunity[],
  filterStatus:
    string,
  convertedOpportunityIds:
    Set<string>,
  jurisdictionById:
    Map<
      string,
      Jurisdiction
    >,
): Opportunity[] {
  if (
    filterStatus ===
    "all"
  ) {
    return all;
  }

  if (
    filterStatus ===
    "converted"
  ) {
    return all.filter(
      (
        opportunity,
      ) =>
        isPersistentlyConverted(
          opportunity,
          convertedOpportunityIds,
        ),
    );
  }

  const active =
    all.filter(
      (
        opportunity,
      ) =>
        !isPersistentlyConverted(
          opportunity,
          convertedOpportunityIds,
        ),
    );

  if (
    filterStatus ===
    "open"
  ) {
    return active.filter(
      (
        opportunity,
      ) =>
        String(
          opportunity.status,
        ) !==
        "disqualified",
    );
  }

  if (
    filterStatus ===
    "confirmed"
  ) {
    return active.filter(
      (
        opportunity,
      ) =>
        Boolean(
          opportunity.confirmedSurplus,
        ),
    );
  }

  if (
    filterStatus ===
    "blocked"
  ) {
    return active.filter(
      (
        opportunity,
      ) =>
        hasBlockingFlag(
          opportunity,
        ) ||
        intakeGateFor(
          jurisdictionById,
          opportunity,
        ).outcome ===
          "blocked",
    );
  }

  return active.filter(
    (
      opportunity,
    ) =>
      String(
        opportunity.status,
      ) ===
      filterStatus,
  );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProOpportunitiesPage({
  searchParams,
}: PageProps<"/pro/opportunities">) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const params =
    await searchParams;

  const status =
    (
      Array.isArray(
        params.status,
      )
        ? params.status[0]
        : params.status
    ) ??
    "open";

  const [
    allOpportunities,
    properties,
    conversions,
    rulePackages,
  ] =
    await Promise.all([
      listOpportunities(),

      listProperties(),

      listOpportunityConversions(),

      listJurisdictionRulePackages(),
    ]);

  const today =
    currentIsoDate();

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

  const jurisdictionById =
    new Map<
      string,
      Jurisdiction
    >();

  for (
    const rulePackage of
      rulePackages
  ) {
    if (
      rulePackage.status ===
        "approved" &&
      rulePackage.rule
    ) {
      jurisdictionById.set(
        rulePackage.rule.id,
        rulePackage.rule,
      );
    }
  }

  const conversionByOpportunityId =
    new Map<
      string,
      PersistedConversionSummary
    >(
      conversions.map(
        (
          conversion,
        ) => [
          conversion.opportunityId,
          {
            opportunityId:
              conversion.opportunityId,

            claimId:
              conversion.claimId,

            claimReference:
              conversion.claimReference,
          },
        ],
      ),
    );

  /*
   * Stage 16 converted-Opportunity visibility.
   *
   * Pre-claim Opportunities remain within the existing research pipeline.
   *
   * Once an Opportunity is linked to a claimant-owned Claim, ordinary staff
   * may see it only when that claimant is currently assigned to them. Super
   * Admin continues to see the complete pipeline.
   */
  const visibleOpportunities =
    (
      await Promise.all(
        allOpportunities.map(
          async (
            opportunity,
          ) => {
            const conversion =
              conversionByOpportunityId.get(
                opportunity.id,
              );

            const claimId =
              conversion?.claimId ??
              opportunity.convertedClaimId;

            if (!claimId) {
              return opportunity;
            }

            const accessible =
              await staffCanAccessClaimantOwnedClaim(
                session,
                claimId,
              );

            return accessible
              ? opportunity
              : undefined;
          },
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

  const convertedOpportunityIds =
    new Set(
      conversionByOpportunityId.keys(),
    );

  const filtered =
    opportunitiesForFilter(
      visibleOpportunities,
      status,
      convertedOpportunityIds,
      jurisdictionById,
    );

  const filterDefinitions =
    [
      {
        key:
          "open",

        label:
          "Open",
      },
      {
        key:
          "all",

        label:
          "All",
      },
      {
        key:
          "confirmed",

        label:
          "Surplus confirmed",
      },
      {
        key:
          "blocked",

        label:
          "Blocked",
      },
      {
        key:
          "researching",

        label:
          "Researching",
      },
      {
        key:
          "qualified",

        label:
          "Qualified",
      },
      {
        key:
          "converted",

        label:
          "Converted",
      },
    ];

  const filters =
    filterDefinitions.map(
      (
        filter,
      ) => ({
        href:
          `/pro/opportunities?status=${filter.key}`,

        label:
          filter.label,

        count:
          opportunitiesForFilter(
            visibleOpportunities,
            filter.key,
            convertedOpportunityIds,
            jurisdictionById,
          ).length,

        active:
          status ===
          filter.key,
      }),
    );

  const totalValue =
    filtered.reduce(
      (
        sum,
        opportunity,
      ) =>
        sum +
        (
          opportunity.confirmedSurplus?.amount ??
          opportunity.estimatedSurplus.amount
        ),
      0,
    );

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">
            Pipeline
          </p>

          <h1 className="mt-1.5 text-2xl">
            Opportunities
          </h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Researched surplus opportunities before a person becomes a claimant.
            Converted opportunities remain visible only within the staff scope
            authorized for the resulting claimant.
          </p>
        </div>
      </div>

      <FilterLinks
        filters={
          filters
        }
        label="Filter opportunities"
      />

      <Card className="min-w-0 overflow-hidden">
        <TableToolbar
          count={
            filtered.length
          }
          noun={{
            one:
              "opportunity",

            many:
              "opportunities",
          }}
        >
          <p className="tnum text-sm text-ink-600">
            <span className="text-xs text-ink-500">
              Identified value{" "}
            </span>

            <span className="font-semibold text-ink-900">
              {formatCents(
                totalValue,
              )}
            </span>
          </p>
        </TableToolbar>

        {filtered.length ===
        0 ? (
          <EmptyState
            className="m-4 border-0 bg-transparent"
            title={
              visibleOpportunities.length ===
              0
                ? "No opportunities available"
                : "No opportunities match this filter"
            }
            description={
              visibleOpportunities.length ===
              0
                ? "No researched or claimant-authorized opportunities are currently available within your staff scope."
                : "Adjust the filter above, or open the full pipeline to see every opportunity available within your staff scope."
            }
          />
        ) : (
          <>
            <div className="hidden min-w-0 xl:block">
              <div className="max-w-full overflow-x-auto">
                <div className="min-w-[1080px]">
                  <TableRegion label="Opportunity pipeline">
                    <Table caption="Opportunity pipeline with reference, property, status, value, deadline and assignment">
                      <THead>
                        <TH width="14%">
                          Reference
                        </TH>

                        <TH width="24%">
                          Property
                        </TH>

                        <TH width="10%">
                          Sale
                        </TH>

                        <TH width="12%">
                          Status
                        </TH>

                        <TH
                          width="11%"
                          align="right"
                        >
                          Surplus
                        </TH>

                        <TH width="11%">
                          Deadline
                        </TH>

                        <TH width="10%">
                          Flags
                        </TH>

                        <TH width="8%">
                          Owner
                        </TH>
                      </THead>

                      <TBody>
                        {filtered.map(
                          (
                            opportunity,
                          ) => {
                            const property =
                              propertyFor(
                                propertyById,
                                opportunity,
                              );

                            const gate =
                              intakeGateFor(
                                jurisdictionById,
                                opportunity,
                              );

                            const deadline =
                              assessDeadline(
                                opportunity.claimDeadline,
                                today,
                              );

                            const blocking =
                              opportunity.flags.filter(
                                (
                                  flag,
                                ) =>
                                  flag.severity ===
                                    "blocking" &&
                                  !flag.resolvedAt,
                              );

                            const attention =
                              opportunity.flags.filter(
                                (
                                  flag,
                                ) =>
                                  flag.severity ===
                                    "attention" &&
                                  !flag.resolvedAt,
                              );

                            const value =
                              opportunity.confirmedSurplus ??
                              opportunity.estimatedSurplus;

                            const conversion =
                              conversionByOpportunityId.get(
                                opportunity.id,
                              );

                            const converted =
                              isPersistentlyConverted(
                                opportunity,
                                convertedOpportunityIds,
                              );

                            return (
                              <TR
                                key={
                                  opportunity.id
                                }
                                tone={
                                  converted
                                    ? undefined
                                    : deadline.risk ===
                                          "expired" ||
                                        deadline.risk ===
                                          "critical"
                                      ? "critical"
                                      : blocking.length >
                                            0 ||
                                          gate.outcome ===
                                            "blocked"
                                        ? "caution"
                                        : undefined
                                }
                              >
                                <TD nowrap>
                                  <div className="flex min-w-0 items-center gap-2">
                                    <PriorityMark
                                      priority={
                                        opportunity.priority
                                      }
                                    />

                                    <span className="font-mono text-xs font-medium text-ink-600">
                                      {
                                        opportunity.reference
                                      }
                                    </span>
                                  </div>
                                </TD>

                                <TDPrimary
                                  href={`/pro/opportunities/${opportunity.id}`}
                                  secondary={
                                    property
                                      ? `${property.address.city}, ${property.address.county}, ${property.address.state}`
                                      : "Property record unavailable"
                                  }
                                >
                                  <span className="block min-w-0 truncate font-medium">
                                    {property
                                      ? property.address.line1
                                      : opportunity.propertyId}
                                  </span>

                                  {conversion && (
                                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                      <Badge tone="positive">
                                        Converted
                                      </Badge>

                                      {/*
                                       * TDPrimary already renders the entire
                                       * cell as an Opportunity link.
                                       *
                                       * The Claim reference therefore remains
                                       * plain text here. A nested Next Link
                                       * would create invalid <a><a /></a>
                                       * markup and trigger hydration failure.
                                       */}
                                      <span className="font-mono text-2xs font-medium text-accent-700">
                                        {
                                          conversion.claimReference
                                        }
                                      </span>
                                    </span>
                                  )}
                                </TDPrimary>

                                <TD nowrap>
                                  <span className="text-xs text-ink-600">
                                    {
                                      SALE_TYPE_LABEL[
                                        opportunity.sale.saleType
                                      ]
                                    }
                                  </span>

                                  <span className="mt-0.5 block text-2xs text-ink-400">
                                    {formatDate(
                                      opportunity.sale.saleDate,
                                    )}
                                  </span>
                                </TD>

                                <TD>
                                  {converted ? (
                                    <>
                                      <Badge
                                        tone="positive"
                                        size="md"
                                      >
                                        Converted
                                      </Badge>

                                      {conversion && (
                                        <span className="mt-1 block text-2xs text-ink-500">
                                          Claim{" "}
                                          {
                                            conversion.claimReference
                                          }
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <StatusBadge
                                        status={
                                          OPPORTUNITY_STATUS[
                                            opportunity.status
                                          ]
                                        }
                                      />

                                      {gate.outcome ===
                                        "blocked" && (
                                        <span className="mt-1 block">
                                          <Badge
                                            tone="critical"
                                            title={
                                              gate.reason
                                            }
                                          >
                                            Intake blocked
                                          </Badge>
                                        </span>
                                      )}
                                    </>
                                  )}
                                </TD>

                                <TD align="right">
                                  <MoneyInline
                                    fact={
                                      value
                                    }
                                    whole
                                  />
                                </TD>

                                <TD nowrap>
                                  {opportunity.claimDeadline ? (
                                    <>
                                      <span className="tnum text-xs text-ink-700">
                                        {formatDate(
                                          opportunity.claimDeadline,
                                        )}
                                      </span>

                                      <span
                                        className={
                                          deadline.risk ===
                                            "expired" ||
                                          deadline.risk ===
                                            "critical"
                                            ? "mt-0.5 block text-2xs font-medium text-critical-700"
                                            : deadline.risk ===
                                                "elevated"
                                              ? "mt-0.5 block text-2xs text-caution-700"
                                              : "mt-0.5 block text-2xs text-ink-400"
                                        }
                                      >
                                        {
                                          deadline.label
                                        }
                                      </span>
                                    </>
                                  ) : (
                                    <Badge tone="caution">
                                      Not recorded
                                    </Badge>
                                  )}
                                </TD>

                                <TD>
                                  {converted ? (
                                    <span className="text-2xs text-ink-500">
                                      Moved to Claims
                                    </span>
                                  ) : (
                                    <div className="flex min-w-0 flex-wrap gap-1">
                                      {blocking
                                        .slice(
                                          0,
                                          2,
                                        )
                                        .map(
                                          (
                                            flag,
                                          ) => (
                                            <Badge
                                              key={
                                                flag.kind
                                              }
                                              tone="critical"
                                              title={
                                                flag.detail
                                              }
                                            >
                                              {
                                                RISK_FLAG_LABEL[
                                                  flag.kind
                                                ]
                                              }
                                            </Badge>
                                          ),
                                        )}

                                      {blocking.length ===
                                        0 &&
                                        attention
                                          .slice(
                                            0,
                                            2,
                                          )
                                          .map(
                                            (
                                              flag,
                                            ) => (
                                              <Badge
                                                key={
                                                  flag.kind
                                                }
                                                tone="caution"
                                                title={
                                                  flag.detail
                                                }
                                              >
                                                {
                                                  RISK_FLAG_LABEL[
                                                    flag.kind
                                                  ]
                                                }
                                              </Badge>
                                            ),
                                          )}

                                      {blocking.length +
                                        attention.length >
                                        2 && (
                                        <span className="text-2xs text-ink-500">
                                          +
                                          {blocking.length +
                                            attention.length -
                                            2}
                                        </span>
                                      )}

                                      {blocking.length +
                                        attention.length ===
                                        0 && (
                                        <span className="text-2xs text-ink-400">
                                          None
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </TD>

                                <TD nowrap>
                                  <span className="text-xs text-ink-600">
                                    {opportunity.assignedToUserId
                                      ? "Assigned"
                                      : "Unassigned"}
                                  </span>

                                  <span className="mt-0.5 block text-2xs text-ink-400">
                                    Risk{" "}
                                    {
                                      opportunity.riskScore
                                    }
                                  </span>
                                </TD>
                              </TR>
                            );
                          },
                        )}
                      </TBody>
                    </Table>
                  </TableRegion>
                </div>
              </div>

              <TableFooter
                shown={
                  filtered.length
                }
                total={
                  visibleOpportunities.length
                }
                noun="opportunities"
              >
                <p className="text-xs text-ink-500">
                  Converted opportunities remain available only when the
                  resulting claimant is within your current staff scope.
                </p>
              </TableFooter>
            </div>

            <div className="xl:hidden">
              <RecordList>
                {filtered.map(
                  (
                    opportunity,
                  ) => {
                    const property =
                      propertyFor(
                        propertyById,
                        opportunity,
                      );

                    const deadline =
                      assessDeadline(
                        opportunity.claimDeadline,
                        today,
                      );

                    const blocking =
                      opportunity.flags.filter(
                        (
                          flag,
                        ) =>
                          flag.severity ===
                            "blocking" &&
                          !flag.resolvedAt,
                      );

                    const value =
                      opportunity.confirmedSurplus ??
                      opportunity.estimatedSurplus;

                    const conversion =
                      conversionByOpportunityId.get(
                        opportunity.id,
                      );

                    const converted =
                      isPersistentlyConverted(
                        opportunity,
                        convertedOpportunityIds,
                      );

                    return (
                      <RecordListItem
                        key={
                          opportunity.id
                        }
                        href={`/pro/opportunities/${opportunity.id}`}
                        title={
                          property
                            ? property.address.line1
                            : opportunity.propertyId
                        }
                        subtitle={
                          property
                            ? `${property.address.city}, ${property.address.state} / ${opportunity.reference}`
                            : opportunity.reference
                        }
                        status={
                          converted ? (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <Badge tone="positive">
                                Converted
                              </Badge>

                              {conversion && (
                                <span className="font-mono text-2xs text-ink-500">
                                  {
                                    conversion.claimReference
                                  }
                                </span>
                              )}
                            </span>
                          ) : (
                            <StatusBadge
                              status={
                                OPPORTUNITY_STATUS[
                                  opportunity.status
                                ]
                              }
                            />
                          )
                        }
                        tone={
                          converted
                            ? undefined
                            : deadline.risk ===
                                  "expired" ||
                                deadline.risk ===
                                  "critical"
                              ? "critical"
                              : blocking.length >
                                  0
                                ? "caution"
                                : undefined
                        }
                        facts={[
                          {
                            label:
                              value.quality ===
                              "confirmed"
                                ? "Confirmed"
                                : "Estimated",

                            value:
                              formatCents(
                                value.amount,
                              ),
                          },
                          {
                            label:
                              converted
                                ? "Workflow"
                                : "Deadline",

                            value:
                              converted
                                ? "Moved to Claims"
                                : deadline.label,
                          },
                          {
                            label:
                              converted
                                ? "Claim"
                                : "Blocking flags",

                            value:
                              conversion
                                ? conversion.claimReference
                                : blocking.length >
                                    0
                                  ? formatCount(
                                      blocking.length,
                                    )
                                  : "None",
                          },
                          {
                            label:
                              "Risk score",

                            value:
                              String(
                                opportunity.riskScore,
                              ),
                          },
                        ]}
                      />
                    );
                  },
                )}
              </RecordList>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}