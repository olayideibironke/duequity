import type {
  Metadata,
} from "next";

import {
  IDENTITY_STATUS,
} from "@/domain/status";

import {
  claimantOnboardingStatus,
  listClaimantOnboardingsForStaff,
  type ClaimantOnboardingStatus,
  type PersistedClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import {
  listAssignedLeadClaimantOperationsForStaff,
  type AssignedLeadClaimantOperationsRecord,
} from "@/server/assigned-lead-claimant-operations-service";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  Card,
  EmptyState,
} from "@/components/ui/surface";

import {
  Badge,
  StatusBadge,
} from "@/components/ui/badge";

import {
  RecordList,
  RecordListItem,
  Table,
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
  formatDate,
  formatPhone,
  plural,
} from "@/lib/format";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title:
    "Claimants",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ClaimantRegisterRecord {
  onboarding:
    PersistedClaimantOnboarding;

  claimCount:
    number;

  claimReferences:
    string[];

  onboardingStatus:
    ClaimantOnboardingStatus;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function onboardingStatusLabel(
  status:
    ClaimantOnboardingStatus,
): string {
  switch (
    status
  ) {
    case "identity_pending":
      return "Identity pending";

    case "disclosures_pending":
      return "Disclosures pending";

    case "agreement_pending":
      return "Agreement pending";

    case "complete":
      return "Complete";

    default:
      return status;
  }
}

function onboardingStatusTone(
  status:
    ClaimantOnboardingStatus,
):
  | "positive"
  | "caution"
  | "neutral" {
  return status ===
    "complete"
    ? "positive"
    : "caution";
}

function primaryEmail(
  onboarding:
    PersistedClaimantOnboarding,
) {
  return onboarding
    .claimant
    .contactMethods
    .find(
      (
        method,
      ) =>
        method.kind ===
        "email",
    );
}

function mobilePhone(
  onboarding:
    PersistedClaimantOnboarding,
) {
  return onboarding
    .claimant
    .contactMethods
    .find(
      (
        method,
      ) =>
        method.kind ===
        "mobile",
    );
}

function preClaimIdentityLabel(
  record:
    AssignedLeadClaimantOperationsRecord,
): string {
  switch (
    record.identityVerification
  ) {
    case "verified":
      return "Verified";

    case "under_review":
      return "Under review";

    case "failed":
      return "Failed";

    case "manual_review":
      return "Manual review";

    case "not_started":
      return "Not started";

    default:
      return "Documents requested";
  }
}

function preClaimIdentityTone(
  record:
    AssignedLeadClaimantOperationsRecord,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  switch (
    record.identityVerification
  ) {
    case "verified":
      return "positive";

    case "failed":
      return "critical";

    case "under_review":
    case "manual_review":
    case "documents_requested":
      return "caution";

    default:
      return "neutral";
  }
}

async function staffNameDirectory(
  records:
    PersistedClaimantOnboarding[],
): Promise<
  Map<
    string,
    string
  >
> {
  const ids =
    [
      ...new Set(
        records.flatMap(
          (
            record,
          ) => [
            record.originatingStaffUserId,
            record.assignedStaffUserId,
          ],
        ),
      ),
    ];

  if (
    ids.length ===
    0
  ) {
    return new Map();
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id, name",
      )
      .in(
        "id",
        ids,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to load claimant staff attribution: ${error.message}`,
    );
  }

  return new Map(
    (
      data ??
      []
    ).map(
      (
        row,
      ) => [
        String(
          row.id,
        ),

        String(
          row.name,
        ),
      ],
    ),
  );
}

/* ========================================================================== */
/* Official Claim register                                                     */
/* ========================================================================== */

async function loadClaimantRegister(
  session:
    NonNullable<
      Awaited<
        ReturnType<
          typeof resolveStaffSession
        >
      >
    >,
): Promise<
  ClaimantRegisterRecord[]
> {
  const onboardings =
    await listClaimantOnboardingsForStaff(
      session,
    );

  const grouped =
    new Map<
      string,
      PersistedClaimantOnboarding[]
    >();

  for (
    const onboarding of
      onboardings
  ) {
    const existing =
      grouped.get(
        onboarding.claimant.id,
      ) ??
      [];

    existing.push(
      onboarding,
    );

    grouped.set(
      onboarding.claimant.id,
      existing,
    );
  }

  const records =
    await Promise.all(
      [
        ...grouped.values(),
      ].map(
        async (
          claimantOnboardings,
        ) => {
          const sorted =
            [
              ...claimantOnboardings,
            ].sort(
              (
                left,
                right,
              ) =>
                right.updatedAt.localeCompare(
                  left.updatedAt,
                ),
            );

          const latest =
            sorted[0];

          const resolvedClaims =
            await Promise.all(
              sorted.map(
                (
                  onboarding,
                ) =>
                  resolveClaimRecord(
                    onboarding.claimId,
                  ),
              ),
            );

          const existingClaims =
            resolvedClaims.filter(
              Boolean,
            );

          const claimReferences =
            [
              ...new Set(
                existingClaims.map(
                  (
                    result,
                  ) =>
                    result!.claim.reference,
                ),
              ),
            ];

          return {
            onboarding:
              latest,

            claimCount:
              existingClaims.length,

            claimReferences,

            onboardingStatus:
              claimantOnboardingStatus(
                latest,
              ),
          };
        },
      ),
    );

  return records.sort(
    (
      left,
      right,
    ) =>
      right.onboarding.updatedAt.localeCompare(
        left.onboarding.updatedAt,
      ),
  );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProClaimantsPage() {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const [
    claimants,
    preClaimClaimants,
  ] =
    await Promise.all([
      loadClaimantRegister(
        session,
      ),

      listAssignedLeadClaimantOperationsForStaff(
        session,
      ),
    ]);

  const superAdmin =
    session.user.role ===
    "super_admin";

  const staffNames =
    superAdmin
      ? await staffNameDirectory(
          claimants.map(
            (
              record,
            ) =>
              record.onboarding,
          ),
        )
      : new Map<
          string,
          string
        >();

  const incompleteClaimants =
    claimants.filter(
      (
        record,
      ) =>
        record.onboardingStatus !==
        "complete",
    );

  const incompletePreClaim =
    preClaimClaimants.filter(
      (
        record,
      ) =>
        record.identityVerification !==
        "verified",
    );

  const incompleteCount =
    incompleteClaimants.length +
    incompletePreClaim.length;

  const totalCount =
    claimants.length +
    preClaimClaimants.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">
            Work
          </p>

          <h1 className="mt-1.5 text-2xl">
            {superAdmin
              ? "All Claimants"
              : "My Claimants"}
          </h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            {superAdmin
              ? "Claimant records across DueQuity, including active pre-Claim recovery workcases and claimants already linked to an official persisted Claim."
              : "Claimants currently assigned to your DueQuity staff account, including activated pre-Claim recovery workcases and official persisted Claims."}
          </p>
        </div>
      </div>

      {incompleteCount >
        0 && (
        <div className="rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
          <p className="text-sm font-semibold text-caution-800">
            {
              incompleteCount
            }{" "}
            {plural(
              incompleteCount,
              "claimant",
            )}{" "}
            still have operational controls to complete.
          </p>

          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            Pre-Claim identity controls remain separate from official Claim
            disclosures, agreements, jurisdiction and commercial requirements.
          </p>
        </div>
      )}

      {totalCount ===
        0 ? (
        <EmptyState
          title={
            superAdmin
              ? "No production claimants yet"
              : "No claimants assigned to you yet"
          }
          description={
            superAdmin
              ? "Activated claimant workcases and official Claim claimant records will appear here."
              : "A claimant will appear here after an assigned lead becomes an activated claimant workcase or an official Claim is assigned to you."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <TableToolbar
            count={
              totalCount
            }
            noun={{
              one:
                "claimant",

              many:
                "claimants",
            }}
          />

          <div className="hidden lg:block">
            <TableRegion label="Claimant register">
              <Table caption="Assigned claimant register containing pre-Claim workcases and official Claim-backed claimant records">
                <THead>
                  <TH>
                    Claimant
                  </TH>

                  <TH width="11%">
                    Reference
                  </TH>

                  <TH width="12%">
                    Identity
                  </TH>

                  <TH width="12%">
                    Stage
                  </TH>

                  <TH width="17%">
                    Contact
                  </TH>

                  {superAdmin && (
                    <TH width="11%">
                      Brought by
                    </TH>
                  )}

                  {superAdmin && (
                    <TH width="11%">
                      Managed by
                    </TH>
                  )}

                  <TH width="9%">
                    Claims
                  </TH>

                  <TH width="12%">
                    Status
                  </TH>
                </THead>

                <TBody>
                  {preClaimClaimants.map(
                    (
                      record,
                    ) => (
                      <TR
                        key={`preclaim-${record.claimantId}`}
                        tone={
                          record.identityVerification !==
                          "verified"
                            ? "caution"
                            : undefined
                        }
                      >
                        <TDPrimary
                          href={`/pro/claimants/workcases/${record.claimantId}`}
                          secondary={`Activated recovery workcase · updated ${formatDate(
                            record.updatedAt.slice(
                              0,
                              10,
                            ),
                          )}`}
                        >
                          {
                            record.legalName
                          }
                        </TDPrimary>

                        <TD nowrap>
                          <span className="font-mono text-xs text-ink-600">
                            {
                              record.claimantReference
                            }
                          </span>
                        </TD>

                        <TD>
                          <Badge
                            tone={
                              preClaimIdentityTone(
                                record,
                              )
                            }
                          >
                            {
                              preClaimIdentityLabel(
                                record,
                              )
                            }
                          </Badge>

                          {record.identityVerifiedAt && (
                            <span className="mt-0.5 block text-2xs text-ink-400">
                              Verified{" "}
                              {formatDate(
                                record.identityVerifiedAt.slice(
                                  0,
                                  10,
                                ),
                              )}
                            </span>
                          )}
                        </TD>

                        <TD>
                          <Badge tone="neutral">
                            Pre-Claim
                          </Badge>

                          <span className="mt-0.5 block text-2xs text-ink-400">
                            No official Claim yet
                          </span>
                        </TD>

                        <TD>
                          <span className="block truncate text-xs text-ink-700">
                            {
                              record.email
                            }
                          </span>

                          <span className="mt-0.5 block text-2xs text-ink-500">
                            {formatPhone(
                              record.mobilePhone,
                            )}
                          </span>
                        </TD>

                        {superAdmin && (
                          <TD>
                            <span className="text-xs text-ink-700">
                              {
                                record.originatingStaffName
                              }
                            </span>
                          </TD>
                        )}

                        {superAdmin && (
                          <TD>
                            <span className="text-xs text-ink-700">
                              {
                                record.assignedStaffName
                              }
                            </span>
                          </TD>
                        )}

                        <TD numeric>
                          <span className="text-sm text-ink-800">
                            0
                          </span>

                          <span className="mt-0.5 block text-2xs text-ink-400">
                            Not created
                          </span>
                        </TD>

                        <TD>
                          <Badge
                            tone={
                              record.portalAccountActive
                                ? "positive"
                                : "caution"
                            }
                          >
                            {record.portalAccountActive
                              ? "Portal active"
                              : "Portal pending"}
                          </Badge>

                          {record.unreadMessageCount >
                            0 && (
                            <span className="mt-0.5 block text-2xs font-semibold text-accent-700">
                              {
                                record.unreadMessageCount
                              }{" "}
                              unread
                            </span>
                          )}
                        </TD>
                      </TR>
                    ),
                  )}

                  {claimants.map(
                    (
                      record,
                    ) => {
                      const {
                        onboarding,
                        onboardingStatus,
                        claimCount,
                        claimReferences,
                      } =
                        record;

                      const claimant =
                        onboarding.claimant;

                      const email =
                        primaryEmail(
                          onboarding,
                        );

                      const mobile =
                        mobilePhone(
                          onboarding,
                        );

                      return (
                        <TR
                          key={`claim-${claimant.id}`}
                          tone={
                            onboardingStatus !==
                            "complete"
                              ? "caution"
                              : undefined
                          }
                        >
                          <TDPrimary
                            href={`/pro/claimants/${claimant.id}`}
                            secondary={
                              claimant.preferredName
                                ? `Preferred name: ${claimant.preferredName}`
                                : `Created ${formatDate(
                                    claimant.createdAt,
                                  )}`
                            }
                          >
                            {
                              claimant.legalName
                            }
                          </TDPrimary>

                          <TD nowrap>
                            <span className="font-mono text-xs text-ink-600">
                              {
                                claimant.reference
                              }
                            </span>
                          </TD>

                          <TD>
                            <StatusBadge
                              status={
                                IDENTITY_STATUS[
                                  claimant.identityVerification
                                ]
                              }
                            />

                            {claimant.identityVerifiedAt && (
                              <span className="mt-0.5 block text-2xs text-ink-400">
                                Verified{" "}
                                {formatDate(
                                  claimant.identityVerifiedAt,
                                )}
                              </span>
                            )}
                          </TD>

                          <TD>
                            <Badge tone="info">
                              Official Claim
                            </Badge>
                          </TD>

                          <TD>
                            {email && (
                              <span className="block truncate text-xs text-ink-700">
                                {
                                  email.value
                                }

                                {email.verified && (
                                  <span className="ml-1 text-accent-700">
                                    verified
                                  </span>
                                )}
                              </span>
                            )}

                            {mobile && (
                              <span className="mt-0.5 block text-2xs text-ink-500">
                                {formatPhone(
                                  mobile.value,
                                )}

                                {mobile.verified
                                  ? " / verified"
                                  : ""}
                              </span>
                            )}
                          </TD>

                          {superAdmin && (
                            <TD>
                              <span className="text-xs text-ink-700">
                                {staffNames.get(
                                  onboarding.originatingStaffUserId,
                                ) ??
                                  onboarding.originatingStaffUserId}
                              </span>
                            </TD>
                          )}

                          {superAdmin && (
                            <TD>
                              <span className="text-xs text-ink-700">
                                {staffNames.get(
                                  onboarding.assignedStaffUserId,
                                ) ??
                                  onboarding.assignedStaffUserId}
                              </span>
                            </TD>
                          )}

                          <TD numeric>
                            <span className="text-sm text-ink-800">
                              {
                                claimCount
                              }
                            </span>

                            {claimReferences.length >
                              0 && (
                              <span
                                className="mt-0.5 block max-w-28 truncate font-mono text-2xs text-ink-400"
                                title={
                                  claimReferences.join(
                                    ", ",
                                  )
                                }
                              >
                                {
                                  claimReferences.join(
                                    ", ",
                                  )
                                }
                              </span>
                            )}
                          </TD>

                          <TD>
                            <Badge
                              tone={
                                onboardingStatusTone(
                                  onboardingStatus,
                                )
                              }
                            >
                              {
                                onboardingStatusLabel(
                                  onboardingStatus,
                                )
                              }
                            </Badge>
                          </TD>
                        </TR>
                      );
                    },
                  )}
                </TBody>
              </Table>
            </TableRegion>
          </div>

          <div className="lg:hidden">
            <RecordList>
              {preClaimClaimants.map(
                (
                  record,
                ) => (
                  <RecordListItem
                    key={`preclaim-${record.claimantId}`}
                    href={`/pro/claimants/workcases/${record.claimantId}`}
                    title={
                      record.legalName
                    }
                    subtitle={
                      record.claimantReference
                    }
                    status={
                      <Badge
                        tone={
                          preClaimIdentityTone(
                            record,
                          )
                        }
                      >
                        {
                          preClaimIdentityLabel(
                            record,
                          )
                        }
                      </Badge>
                    }
                    tone={
                      record.identityVerification !==
                      "verified"
                        ? "caution"
                        : undefined
                    }
                    facts={[
                      {
                        label:
                          "Stage",

                        value:
                          "Pre-Claim",
                      },
                      {
                        label:
                          "Claims",

                        value:
                          "0",
                      },
                      {
                        label:
                          "Contact",

                        value:
                          record.email,
                      },
                      {
                        label:
                          "Portal",

                        value:
                          record.portalAccountActive
                            ? "Active"
                            : "Pending",
                      },
                    ]}
                  />
                ),
              )}

              {claimants.map(
                (
                  record,
                ) => {
                  const {
                    onboarding,
                    onboardingStatus,
                    claimCount,
                  } =
                    record;

                  const claimant =
                    onboarding.claimant;

                  const email =
                    primaryEmail(
                      onboarding,
                    );

                  const facts = [
                    {
                      label:
                        "Stage",

                      value:
                        "Official Claim",
                    },
                    {
                      label:
                        "Onboarding",

                      value:
                        onboardingStatusLabel(
                          onboardingStatus,
                        ),
                    },
                    {
                      label:
                        "Claims",

                      value:
                        String(
                          claimCount,
                        ),
                    },
                    {
                      label:
                        "Contact",

                      value:
                        email?.value ??
                        "Not recorded",
                    },
                  ];

                  if (
                    superAdmin
                  ) {
                    facts.push(
                      {
                        label:
                          "Brought by",

                        value:
                          staffNames.get(
                            onboarding.originatingStaffUserId,
                          ) ??
                          onboarding.originatingStaffUserId,
                      },
                      {
                        label:
                          "Managed by",

                        value:
                          staffNames.get(
                            onboarding.assignedStaffUserId,
                          ) ??
                          onboarding.assignedStaffUserId,
                      },
                    );
                  }

                  return (
                    <RecordListItem
                      key={`claim-${claimant.id}`}
                      href={`/pro/claimants/${claimant.id}`}
                      title={
                        claimant.legalName
                      }
                      subtitle={
                        claimant.reference
                      }
                      status={
                        <StatusBadge
                          status={
                            IDENTITY_STATUS[
                              claimant.identityVerification
                            ]
                          }
                        />
                      }
                      tone={
                        onboardingStatus !==
                        "complete"
                          ? "caution"
                          : undefined
                      }
                      facts={
                        facts
                      }
                    />
                  );
                },
              )}
            </RecordList>
          </div>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-ink-500">
        A pre-Claim claimant workcase is an operational recovery record only.
        It does not create an Opportunity, official Claim, jurisdiction
        approval, filing route, fee agreement or entitlement to recovery
        proceeds.
      </p>
    </div>
  );
}