import type { Metadata } from "next";

import Link from "next/link";

import { notFound } from "next/navigation";

import {
  CLAIM_STATUS,
  IDENTITY_STATUS,
  RELATIONSHIP_LABEL,
} from "@/domain/status";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  Divider,
  NotRecorded,
} from "@/components/ui/surface";

import {
  Badge,
  Identifier,
  StatusBadge,
  Tag,
} from "@/components/ui/badge";

import {
  Breadcrumbs,
} from "@/components/ui/tabs";

import {
  MoneyInline,
} from "@/components/ui/money";

import {
  ActivityFeed,
  ActivityItem,
} from "@/components/ui/timeline";

import {
  formatDate,
  formatPhone,
  plural,
} from "@/lib/format";

import {
  claimantOnboardingAuditForStaff,
  claimantOnboardingStatus,
  getClaimantOnboardingByClaimantIdForStaff,
  listClaimantOnboardingsForStaff,
  type ClaimantOnboardingAuditAction,
  type ClaimantOnboardingStatus,
} from "@/server/claimant-onboarding-store";

import {
  listAssignableClaimantStaff,
  type AssignableClaimantStaff,
} from "@/server/claimant-assignment-service";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  getPropertyById,
} from "@/server/opportunity-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  IconMail,
} from "@/components/ui/icon";

import {
  reassignClaimantManagerAction,
} from "./actions";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Metadata                                                                    */
/* ========================================================================== */

export async function generateMetadata({
  params,
}: PageProps<"/pro/claimants/[id]">): Promise<Metadata> {
  const session =
    await resolveStaffSession();

  if (!session) {
    return {
      title:
        "Claimant",

      robots: {
        index:
          false,

        follow:
          false,
      },
    };
  }

  const {
    id,
  } =
    await params;

  const onboarding =
    await getClaimantOnboardingByClaimantIdForStaff(
      session,
      id,
    );

  return {
    title:
      onboarding?.claimant.legalName ??
      "Claimant",

    robots: {
      index:
        false,

      follow:
        false,
    },
  };
}

/* ========================================================================== */
/* Labels                                                                      */
/* ========================================================================== */

const AUDIT_ACTION_LABELS:
  Record<
    ClaimantOnboardingAuditAction,
    string
  > = {
  onboarding_started:
    "Onboarding started",

  contact_updated:
    "Contact updated",

  contact_verified:
    "Contact verification updated",

  contact_consent_recorded:
    "Contact consent recorded",

  identity_status_changed:
    "Identity status changed",

  disclosures_acknowledged:
    "Disclosures acknowledged",

  service_agreement_signed:
    "Service agreement signed",
};

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

function auditActionLabel(
  action:
    ClaimantOnboardingAuditAction,
): string {
  return AUDIT_ACTION_LABELS[
    action
  ];
}

function participantRoleLabel(
  role:
    string,
): string {
  return role
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (
        character,
      ) =>
        character.toUpperCase(),
    );
}

function contactChannelLabel(
  channel:
    string,
): string {
  switch (
    channel
  ) {
    case "email":
      return "Email";

    case "phone_call":
      return "Telephone";

    case "sms":
      return "Text message";

    case "mail":
      return "Mail";

    default:
      return channel;
  }
}

function roleLabel(
  role:
    string,
): string {
  return role
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (
        value,
      ) =>
        value.toUpperCase(),
    );
}

async function staffNames(
  ids:
    string[],
): Promise<
  Map<
    string,
    string
  >
> {
  const unique =
    [
      ...new Set(
        ids.filter(
          Boolean,
        ),
      ),
    ];

  if (
    unique.length ===
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
        unique,
      );

  if (error) {
    throw new Error(
      `Unable to resolve claimant staff attribution: ${error.message}`,
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
/* Page                                                                        */
/* ========================================================================== */

export default async function ProClaimantDetailPage({
  params,
  searchParams,
}: PageProps<"/pro/claimants/[id]">) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const {
    id,
  } =
    await params;

  const query =
    await searchParams;

  const assignmentStatus =
    Array.isArray(
      query.assignment,
    )
      ? query.assignment[0]
      : query.assignment;

  const accessible =
    await getClaimantOnboardingByClaimantIdForStaff(
      session,
      id,
    );

  if (!accessible) {
    notFound();
  }

  const allAccessibleOnboardings =
    await listClaimantOnboardingsForStaff(
      session,
    );

  const claimantOnboardings =
    allAccessibleOnboardings
      .filter(
        (
          record,
        ) =>
          record.claimant.id ===
          id,
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.updatedAt.localeCompare(
            left.updatedAt,
          ),
      );

  if (
    claimantOnboardings.length ===
    0
  ) {
    notFound();
  }

  const latest =
    claimantOnboardings[0];

  const claimant =
    latest.claimant;

  const onboardingStatus =
    claimantOnboardingStatus(
      latest,
    );

  const allAudit =
    await claimantOnboardingAuditForStaff(
      session,
    );

  const audit =
    allAudit.filter(
      (
        entry,
      ) =>
        entry.claimantId ===
        claimant.id,
    );

  const claimViews =
    (
      await Promise.all(
        claimantOnboardings.map(
          async (
            onboarding,
          ) => {
            const resolved =
              await resolveClaimRecord(
                onboarding.claimId,
              );

            if (!resolved) {
              return undefined;
            }

            const property =
              await getPropertyById(
                resolved.claim.propertyId,
              );

            return {
              onboarding,

              claim:
                resolved.claim,

              property,
            };
          },
        ),
      )
    ).flatMap(
      (
        result,
      ) =>
        result
          ? [
              result,
            ]
          : [],
    );

  const email =
    claimant.contactMethods.find(
      (
        method,
      ) =>
        method.kind ===
        "email",
    );

  const mobile =
    claimant.contactMethods.find(
      (
        method,
      ) =>
        method.kind ===
        "mobile",
    );

  const superAdmin =
    session.user.role ===
    "super_admin";

  let ownershipNames =
    new Map<
      string,
      string
    >();

  let assignableStaff:
    AssignableClaimantStaff[] =
    [];

  if (
    superAdmin
  ) {
    [
      ownershipNames,
      assignableStaff,
    ] =
      await Promise.all([
        staffNames([
          latest.originatingStaffUserId,
          latest.assignedStaffUserId,
        ]),

        listAssignableClaimantStaff(
          session,
        ),
      ]);
  }

  return (
    <div className="space-y-5">
      <div>
        <Breadcrumbs
          trail={[
            {
              href:
                "/pro/claimants",

              label:
                superAdmin
                  ? "All Claimants"
                  : "My Claimants",
            },
            {
              label:
                claimant.reference,
            },
          ]}
        />

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow text-ink-500">
              Claimant ID
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Identifier>
                {
                  claimant.reference
                }
              </Identifier>

              <StatusBadge
                status={
                  IDENTITY_STATUS[
                    claimant.identityVerification
                  ]
                }
                size="md"
              />

              <Tag>
                {
                  claimant.entityType
                }
              </Tag>

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
            </div>

            <h1 className="mt-2 text-2xl">
              {
                claimant.legalName
              }
            </h1>

            {claimant.preferredName &&
              claimant.preferredName !==
                claimant.legalName && (
                <p className="mt-1 text-sm text-ink-600">
                  Preferred name:{" "}
                  {
                    claimant.preferredName
                  }
                </p>
              )}

            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-500">
              Use Claimant ID{" "}
              {
                claimant.reference
              }{" "}
              when identifying this claimant in DueQuity operational communication.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/pro/claimants/${claimant.id}/messages`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            >
              <IconMail
                size={
                  16
                }
              />

              Message claimant
            </Link>
          </div>
        </div>
      </div>

      {assignmentStatus ===
        "updated" && (
        <Callout
          tone="positive"
          title="Claimant manager reassigned"
          role="status"
        >
          The current operational manager was updated. Permanent originating staff attribution was preserved.
        </Callout>
      )}

      {assignmentStatus ===
        "unchanged" && (
        <Callout
          tone="neutral"
          title="Assignment unchanged"
        >
          The selected staff member was already the current manager for this claimant.
        </Callout>
      )}

      {assignmentStatus ===
        "invalid" && (
        <Callout
          tone="critical"
          title="Select a valid staff member"
          role="alert"
        >
          DueQuity could not process the claimant reassignment because the requested staff assignment was incomplete.
        </Callout>
      )}

      {assignmentStatus ===
        "failed" && (
        <Callout
          tone="critical"
          title="Claimant reassignment failed"
          role="alert"
        >
          The claimant manager was not safely reassigned. Review the current assignment before trying again.
        </Callout>
      )}

      {assignmentStatus ===
        "not-authorized" && (
        <Callout
          tone="critical"
          title="Reassignment not authorized"
          role="alert"
        >
          Only DueQuity Super Admin may change claimant management assignments.
        </Callout>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Claims"
              description={`${claimViews.length} ${plural(
                claimViews.length,
                "persisted claim",
              )} linked to claimant ID ${claimant.reference}.`}
            />

            <CardBody flush>
              {claimViews.length ===
              0 ? (
                <p className="px-4 py-4 text-sm text-ink-500 sm:px-5">
                  No active persisted claim could be resolved for this claimant.
                </p>
              ) : (
                <ul className="divide-y divide-line-subtle">
                  {claimViews.map(
                    ({
                      onboarding,
                      claim,
                      property,
                    }) => {
                      const value =
                        claim.confirmedRecovery ??
                        claim.estimatedRecovery;

                      return (
                        <li
                          key={
                            claim.id
                          }
                        >
                          <Link
                            href={`/pro/claims/${claim.id}`}
                            className="block px-4 py-3.5 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-base font-medium text-ink-900">
                                  <span className="font-mono text-xs text-ink-500">
                                    {
                                      claim.reference
                                    }
                                  </span>{" "}

                                  {property
                                    ? property.address.line1
                                    : "Property record"}
                                </p>

                                {property && (
                                  <p className="mt-0.5 text-xs text-ink-500">
                                    {
                                      property.address.city
                                    }
                                    ,{" "}

                                    {property.address.county
                                      ? `${property.address.county} County, `
                                      : ""}

                                    {
                                      property.address.state
                                    }
                                  </p>
                                )}

                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  <Tag>
                                    {
                                      RELATIONSHIP_LABEL[
                                        onboarding.participant.relationship
                                      ]
                                    }
                                  </Tag>

                                  <Tag>
                                    {participantRoleLabel(
                                      onboarding.participant.role,
                                    )}
                                  </Tag>

                                  {onboarding.participant.assertedShare !==
                                    undefined && (
                                    <Tag>
                                      {Math.round(
                                        onboarding.participant.assertedShare *
                                          100,
                                      )}
                                      % asserted
                                    </Tag>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <StatusBadge
                                  status={
                                    CLAIM_STATUS[
                                      claim.status
                                    ]
                                  }
                                />

                                <p className="mt-1.5">
                                  <MoneyInline
                                    fact={
                                      value
                                    }
                                    whole
                                  />
                                </p>
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    },
                  )}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Contact and consent"
              description="Contact details, channel verification and consent are persisted separately."
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Claimant ID">
                  <Identifier>
                    {
                      claimant.reference
                    }
                  </Identifier>
                </DataItem>

                <DataItem label="Preferred channel">
                  {contactChannelLabel(
                    claimant.preferredContactChannel,
                  )}
                </DataItem>

                <DataItem label="Language">
                  {
                    claimant.preferredLanguage
                  }
                </DataItem>

                <DataItem label="Consent recorded">
                  {claimant.consentRecordedAt ? (
                    formatDate(
                      claimant.consentRecordedAt,
                    )
                  ) : (
                    <Badge tone="caution">
                      Not recorded
                    </Badge>
                  )}
                </DataItem>

                <DataItem label="Consent source">
                  {claimant.consentSource ? (
                    claimant.consentSource
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>
              </DataList>

              <div className="mt-4 overflow-hidden rounded-md border border-line">
                <ul className="divide-y divide-line-subtle">
                  {claimant.contactMethods.map(
                    (
                      method,
                    ) => (
                      <li
                        key={
                          method.id
                        }
                        className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-ink-900">
                            {method.kind ===
                              "mobile" ||
                            method.kind ===
                              "landline"
                              ? formatPhone(
                                  method.value,
                                )
                              : method.value}
                          </p>

                          <p className="text-2xs text-ink-500">
                            {method.kind.replaceAll(
                              "_",
                              " ",
                            )}

                            {method.isPrimary &&
                              " / primary"}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          {method.verified ? (
                            <Badge tone="positive">
                              Verified
                            </Badge>
                          ) : (
                            <Badge tone="caution">
                              Unverified
                            </Badge>
                          )}

                          {method.consentGivenAt ? (
                            <Badge tone="info">
                              Consented
                            </Badge>
                          ) : (
                            <Badge tone="neutral">
                              No consent
                            </Badge>
                          )}

                          {method.optedOutAt && (
                            <Badge tone="critical">
                              Opted out
                            </Badge>
                          )}
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              </div>

              {claimant.mailingAddress && (
                <div className="mt-4">
                  <p className="eyebrow text-ink-500">
                    Mailing address
                  </p>

                  <p className="mt-1.5 text-sm text-ink-800">
                    {
                      claimant.mailingAddress.line1
                    }
                    <br />
                    {
                      claimant.mailingAddress.city
                    }
                    ,{" "}
                    {
                      claimant.mailingAddress.state
                    }{" "}
                    {
                      claimant.mailingAddress.postalCode
                    }
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Disclosures and agreement"
              description="Persisted onboarding controls required before the claimant service agreement can be completed."
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Disclosure acknowledgements">
                  {
                    latest.disclosureAcknowledgements.length
                  }
                </DataItem>

                <DataItem label="Free direct-claim option">
                  {latest.freeClaimOptionDisclosedAt ? (
                    <>
                      Disclosed{" "}
                      {formatDate(
                        latest.freeClaimOptionDisclosedAt,
                      )}
                    </>
                  ) : (
                    <Badge tone="caution">
                      Not recorded
                    </Badge>
                  )}
                </DataItem>

                <DataItem label="Service agreement">
                  {latest.serviceAgreement ? (
                    <Badge tone="positive">
                      Signed
                    </Badge>
                  ) : (
                    <Badge tone="caution">
                      Not signed
                    </Badge>
                  )}
                </DataItem>

                {latest.serviceAgreement && (
                  <DataItem label="Agreement signed">
                    {formatDate(
                      latest.serviceAgreement.signedAt,
                    )}
                  </DataItem>
                )}

                {latest.serviceAgreement?.cancellationDeadline && (
                  <DataItem label="Cancellation deadline">
                    {formatDate(
                      latest.serviceAgreement.cancellationDeadline,
                    )}
                  </DataItem>
                )}

                {latest.serviceAgreement?.documentId && (
                  <DataItem label="Agreement document">
                    <Identifier>
                      {
                        latest.serviceAgreement.documentId
                      }
                    </Identifier>
                  </DataItem>
                )}
              </DataList>

              {latest.disclosureAcknowledgements.length >
                0 && (
                <>
                  <Divider className="my-5" />

                  <p className="eyebrow text-ink-500">
                    Acknowledged disclosures
                  </p>

                  <ul className="mt-2.5 divide-y divide-line-subtle">
                    {latest.disclosureAcknowledgements.map(
                      (
                        acknowledgement,
                      ) => (
                        <li
                          key={
                            acknowledgement.key
                          }
                          className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                        >
                          <span className="text-sm text-ink-800">
                            {acknowledgement.key.replaceAll(
                              "_",
                              " ",
                            )}
                          </span>

                          <span className="text-xs text-ink-500">
                            {formatDate(
                              acknowledgement.acknowledgedAt,
                            )}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>

          {audit.length >
            0 && (
            <Card>
              <CardHeader
                title="Onboarding activity"
                description="Persisted audit events for claimant onboarding controls."
              />

              <CardBody>
                <ActivityFeed>
                  {audit.map(
                    (
                      entry,
                    ) => (
                      <ActivityItem
                        key={
                          entry.id
                        }
                        title={
                          auditActionLabel(
                            entry.action,
                          )
                        }
                        detail={
                          entry.detail
                        }
                        date={
                          entry.occurredAt
                        }
                        tone={
                          entry.action ===
                            "identity_status_changed" ||
                          entry.action ===
                            "disclosures_acknowledged"
                            ? "caution"
                            : "neutral"
                        }
                      />
                    ),
                  )}
                </ActivityFeed>
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5">
          {superAdmin && (
            <Card elevated>
              <CardHeader
                title="Staff ownership"
                description="Permanent production attribution and current operational assignment."
              />

              <CardBody>
                <DataList>
                  <DataItem label="Brought to DueQuity by">
                    {ownershipNames.get(
                      latest.originatingStaffUserId,
                    ) ??
                    latest.originatingStaffUserId}
                  </DataItem>

                  <DataItem label="Currently managed by">
                    {ownershipNames.get(
                      latest.assignedStaffUserId,
                    ) ??
                    latest.assignedStaffUserId}
                  </DataItem>
                </DataList>

                <Divider className="my-5" />

                <form
                  action={
                    reassignClaimantManagerAction
                  }
                  className="space-y-3"
                >
                  <input
                    type="hidden"
                    name="claimantId"
                    value={
                      claimant.id
                    }
                  />

                  <div>
                    <label
                      htmlFor="assignedStaffUserId"
                      className="block text-xs font-semibold text-ink-700"
                    >
                      Reassign current manager
                    </label>

                    <select
                      id="assignedStaffUserId"
                      name="assignedStaffUserId"
                      defaultValue={
                        latest.assignedStaffUserId
                      }
                      required
                      className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                    >
                      {assignableStaff.map(
                        (
                          staff,
                        ) => (
                          <option
                            key={
                              staff.id
                            }
                            value={
                              staff.id
                            }
                          >
                            {staff.name} · {roleLabel(
                              staff.role,
                            )}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                  >
                    Update manager
                  </button>
                </form>

                <p className="mt-4 text-xs leading-relaxed text-ink-500">
                  Reassignment changes operational access only. The staff member
                  who originally brought this claimant to DueQuity remains
                  permanently attributed and is not rewritten.
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Claimant identity" />

            <CardBody>
              <DataList>
                <DataItem label="Claimant ID">
                  <Identifier>
                    {
                      claimant.reference
                    }
                  </Identifier>
                </DataItem>

                <DataItem label="Verification status">
                  <StatusBadge
                    status={
                      IDENTITY_STATUS[
                        claimant.identityVerification
                      ]
                    }
                  />
                </DataItem>

                <DataItem label="Verified">
                  {claimant.identityVerifiedAt ? (
                    formatDate(
                      claimant.identityVerifiedAt,
                    )
                  ) : (
                    <NotRecorded label="Not verified" />
                  )}
                </DataItem>

                <DataItem label="Provider reference">
                  {claimant.identityProviderRef ? (
                    <Identifier>
                      {
                        claimant.identityProviderRef
                      }
                    </Identifier>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Record created">
                  {formatDate(
                    claimant.createdAt,
                  )}
                </DataItem>

                <DataItem label="Last updated">
                  {formatDate(
                    latest.updatedAt.slice(
                      0,
                      10,
                    ),
                  )}
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          <Card inset>
            <CardHeader title="Secure communication" />

            <CardBody>
              <p className="text-sm leading-relaxed text-ink-600">
                Claimant-facing messages are stored separately from DueQuity
                internal staff mail.
              </p>

              <Link
                href={`/pro/claimants/${claimant.id}/messages`}
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              >
                <IconMail
                  size={
                    16
                  }
                />

                Message{" "}
                {
                  claimant.reference
                }
              </Link>
            </CardBody>
          </Card>

          <Card inset>
            <CardHeader title="Data minimization" />

            <CardBody>
              <p className="text-sm leading-relaxed text-ink-600">
                This claimant repository does not store Social Security numbers,
                banking credentials or identity-document image contents inside
                the claimant onboarding record.
              </p>

              <p className="mt-3 text-sm leading-relaxed text-ink-600">
                Identity documents use the separate secure document workflow.
                Recovery payments are not routed through DueQuity unless an
                approved jurisdiction route expressly permits it.
              </p>
            </CardBody>
          </Card>

          {(email ||
            mobile) && (
            <Card inset>
              <CardHeader title="Primary contact" />

              <CardBody>
                <DataList>
                  <DataItem label="Claimant ID">
                    <Identifier>
                      {
                        claimant.reference
                      }
                    </Identifier>
                  </DataItem>

                  {email && (
                    <DataItem label="Email">
                      {
                        email.value
                      }
                    </DataItem>
                  )}

                  {mobile && (
                    <DataItem label="Mobile">
                      {formatPhone(
                        mobile.value,
                      )}
                    </DataItem>
                  )}
                </DataList>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}