import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  Badge,
  Identifier,
} from "@/components/ui/badge";

import {
  Breadcrumbs,
} from "@/components/ui/tabs";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
} from "@/components/ui/surface";

import {
  IconMail,
} from "@/components/ui/icon";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  formatPhone,
} from "@/lib/format";

import {
  getAssignedLeadClaimantOperationsByClaimantIdForStaff,
  type AssignedLeadClaimantOperationsRecord,
} from "@/server/assigned-lead-claimant-operations-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Metadata                                                                    */
/* ========================================================================== */

export async function generateMetadata({
  params,
}: PageProps<"/pro/claimants/workcases/[claimantId]">): Promise<Metadata> {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
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
    claimantId,
  } =
    await params;

  const record =
    await getAssignedLeadClaimantOperationsByClaimantIdForStaff(
      session,
      claimantId,
    );

  return {
    title:
      record?.legalName ??
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
/* Helpers                                                                     */
/* ========================================================================== */

function formatTimestamp(
  value:
    string | undefined,
): string {
  if (
    !value
  ) {
    return "Not recorded";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    },
  ).format(
    date,
  );
}

function identityLabel(
  record:
    AssignedLeadClaimantOperationsRecord,
): string {
  switch (
    record.identityVerification
  ) {
    case "verified":
      return "Identity verified";

    case "under_review":
      return "Identity under review";

    case "failed":
      return "Identity failed";

    case "manual_review":
      return "Manual identity review";

    case "not_started":
      return "Identity not started";

    default:
      return "Identity documents requested";
  }
}

function identityTone(
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

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PreClaimClaimantOperationsPage({
  params,
}: PageProps<"/pro/claimants/workcases/[claimantId]">) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const {
    claimantId,
  } =
    await params;

  const record =
    await getAssignedLeadClaimantOperationsByClaimantIdForStaff(
      session,
      claimantId,
    );

  if (
    !record
  ) {
    notFound();
  }

  const identityVerified =
    record.identityVerification ===
    "verified";

  return (
    <div className="space-y-5">
      {/* ================================================================== */}
      {/* Header                                                             */}
      {/* ================================================================== */}

      <div>
        <Breadcrumbs
          trail={[
            {
              href:
                "/pro/claimants",

              label:
                session.user.role ===
                  "super_admin"
                  ? "All Claimants"
                  : "My Claimants",
            },
            {
              label:
                record.claimantReference,
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
                  record.claimantReference
                }
              </Identifier>

              <Badge
                tone={
                  identityTone(
                    record,
                  )
                }
              >
                {
                  identityLabel(
                    record,
                  )
                }
              </Badge>

              <Badge tone="neutral">
                Pre-Claim
              </Badge>

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
            </div>

            <h1 className="mt-2 text-2xl">
              {
                record.legalName
              }
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-600">
              Activated claimant recovery workcase managed by{" "}
              <strong>
                {
                  record.assignedStaffName
                }
              </strong>
              . This record has not yet been converted into an official DueQuity
              Claim.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/pro/claimants/messages"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800"
            >
              <IconMail
                size={
                  16
                }
              />

              Message claimant
            </Link>

            <Link
              href="/pro/documents"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-inset"
            >
              Identity documents
            </Link>
          </div>
        </div>
      </div>

      {/* ============================================================ boundary */}

      <Callout
        tone="neutral"
        title="Pre-Claim operational boundary"
      >
        <p>
          This claimant is active in DueQuity&apos;s assigned-lead recovery
          workflow, but no official Claim has been created. No jurisdiction
          approval, filing destination, fee agreement, commercial quote or
          entitlement determination is inferred from this workcase.
        </p>
      </Callout>

      {/* =============================================================== next */}

      <Callout
        tone={
          identityVerified
            ? "positive"
            : "caution"
        }
        title={
          identityVerified
            ? "Verified claimant ready for continued recovery operations"
            : "Identity verification remains outstanding"
        }
      >
        <p>
          {identityVerified
            ? "Identity and portal activation are complete. Staff may continue secure claimant communication and legitimate pre-Claim preparation. Formal Claim conversion and any service-agreement or filing workflow remain subject to their own genuine jurisdiction, commercial and legal prerequisites."
            : "Continue the controlled identity workflow before treating this claimant as identity verified. Formal Claim conversion remains separate."}
        </p>
      </Callout>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          {/* =========================================================== status */}

          <Card>
            <CardHeader
              title="Recovery status"
              description="Current operational state of this activated pre-Claim claimant."
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Claimant ID">
                  <Identifier>
                    {
                      record.claimantReference
                    }
                  </Identifier>
                </DataItem>

                <DataItem label="Recovery stage">
                  <Badge tone="neutral">
                    Pre-Claim
                  </Badge>
                </DataItem>

                <DataItem label="Portal account">
                  <Badge
                    tone={
                      record.portalAccountActive
                        ? "positive"
                        : "caution"
                    }
                  >
                    {record.portalAccountActive
                      ? "Active"
                      : "Pending"}
                  </Badge>
                </DataItem>

                <DataItem label="Identity">
                  <Badge
                    tone={
                      identityTone(
                        record,
                      )
                    }
                  >
                    {
                      identityLabel(
                        record,
                      )
                    }
                  </Badge>
                </DataItem>

                <DataItem label="Official Claim">
                  <Badge tone="neutral">
                    Not created
                  </Badge>
                </DataItem>

                <DataItem label="Government ID request">
                  {
                    record.governmentIdRequestStatus ??
                    "Not recorded"
                  }
                </DataItem>

                <DataItem label="Government ID document">
                  {
                    record.governmentIdDocumentStatus ??
                    "Not recorded"
                  }
                </DataItem>

                <DataItem label="File safety">
                  {
                    record.governmentIdSafetyStatus ??
                    "Not recorded"
                  }
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          {/* ========================================================== contact */}

          <Card>
            <CardHeader
              title="Claimant contact"
              description="Confirmed contact details persisted from the assigned-lead claimant activation workflow."
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Legal name">
                  {
                    record.legalName
                  }
                </DataItem>

                <DataItem label="Email">
                  {
                    record.email
                  }
                </DataItem>

                <DataItem label="Mobile">
                  {formatPhone(
                    record.mobilePhone,
                  )}
                </DataItem>

                <DataItem label="Current manager">
                  {
                    record.assignedStaffName
                  }
                </DataItem>

                <DataItem label="Property connection confirmed">
                  {formatTimestamp(
                    record.propertyConnectionConfirmedAt,
                  )}
                </DataItem>

                <DataItem label="Activation-material consent">
                  {formatTimestamp(
                    record.activationMaterialsConsentAt,
                  )}
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          {/* ======================================================= messaging */}

          <Card>
            <CardHeader
              title="Secure claimant communication"
              description="Claimant-facing messages remain separate from DueQuity internal staff mail."
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Messaging status">
                  <Badge
                    tone={
                      record.messagingActive
                        ? "positive"
                        : "neutral"
                    }
                  >
                    {record.messagingActive
                      ? "Active"
                      : "No thread yet"}
                  </Badge>
                </DataItem>

                <DataItem label="Messages">
                  {
                    record.messageCount
                  }
                </DataItem>

                <DataItem label="Unread claimant messages">
                  {record.unreadMessageCount >
                    0 ? (
                    <Badge tone="caution">
                      {
                        record.unreadMessageCount
                      }{" "}
                      unread
                    </Badge>
                  ) : (
                    <Badge tone="positive">
                      Inbox clear
                    </Badge>
                  )}
                </DataItem>

                <DataItem label="Latest message">
                  {formatTimestamp(
                    record.latestMessageAt,
                  )}
                </DataItem>
              </DataList>

              <Link
                href="/pro/claimants/messages"
                className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                <IconMail
                  size={
                    16
                  }
                />

                Open Claimant Messages
              </Link>
            </CardBody>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          {/* ========================================================= identity */}

          <Card>
            <CardHeader title="Identity verification" />

            <CardBody>
              <DataList>
                <DataItem label="Status">
                  <Badge
                    tone={
                      identityTone(
                        record,
                      )
                    }
                  >
                    {
                      identityLabel(
                        record,
                      )
                    }
                  </Badge>
                </DataItem>

                <DataItem label="Verified">
                  {formatTimestamp(
                    record.identityVerifiedAt,
                  )}
                </DataItem>

                <DataItem label="Government ID">
                  {
                    record.governmentIdDocumentStatus ??
                    "Not recorded"
                  }
                </DataItem>

                <DataItem label="Safety result">
                  {
                    record.governmentIdSafetyStatus ??
                    "Not recorded"
                  }
                </DataItem>
              </DataList>

              <Link
                href="/pro/documents"
                className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-inset"
              >
                Open Documents
              </Link>
            </CardBody>
          </Card>

          {/* ======================================================= ownership */}

          <Card>
            <CardHeader title="Staff ownership" />

            <CardBody>
              <DataList>
                <DataItem label="Brought to DueQuity by">
                  {
                    record.originatingStaffName
                  }
                </DataItem>

                <DataItem label="Currently managed by">
                  {
                    record.assignedStaffName
                  }
                </DataItem>

                <DataItem label="Workcase created">
                  {formatTimestamp(
                    record.createdAt,
                  )}
                </DataItem>

                <DataItem label="Last updated">
                  {formatTimestamp(
                    record.updatedAt,
                  )}
                </DataItem>
              </DataList>

              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Operational assignment determines staff access to this
                pre-Claim claimant. It does not transfer or create recovery
                rights.
              </p>
            </CardBody>
          </Card>

          {/* ========================================================== safety */}

          <Card inset>
            <CardHeader title="Data boundary" />

            <CardBody>
              <p className="text-sm leading-relaxed text-ink-600">
                This workcase does not store or display Social Security numbers,
                bank credentials or government-ID image contents in the claimant
                record.
              </p>

              <p className="mt-3 text-sm leading-relaxed text-ink-600">
                Restricted identity evidence remains inside the separate secure
                Documents workflow.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}