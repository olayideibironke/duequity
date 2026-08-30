import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  AssignedLeadIdentityReviewPanel,
} from "@/components/pro/assigned-lead-identity-review-panel";

import {
  ProtectedSubmitButton,
} from "@/components/ui/protected-submit-button";

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  Badge,
  StatusBadge,
  Tag,
} from "@/components/ui/badge";

import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import {
  DOCUMENT_KIND_LABEL,
  DOCUMENT_STATUS,
} from "@/domain/status";

import {
  formatBytes,
  formatCount,
  formatDate,
  plural,
} from "@/lib/format";

import {
  can,
} from "@/lib/session";

import {
  PRECLAIM_SUPPORTING_DOCUMENT_KINDS,
  listPreclaimSupportingDocumentStaffState,
  preclaimSupportingDocumentKindLabel,
} from "@/server/assigned-lead-supporting-document-service";

import {
  listAssignedLeadIdentityReviewQueue,
} from "@/server/assigned-lead-identity-review-service";

import {
  listClaimDocumentRequests,
  listClaimDocuments,
} from "@/server/claim-document-store";

import {
  getClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  listOpportunityConversions,
} from "@/server/opportunity-conversion-store";

import {
  getPropertyById,
} from "@/server/opportunity-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  createSupportingDocumentRequest,
  reviewSupportingDocument,
  scanSupportingDocument,
} from "./actions";

export const metadata: Metadata = {
  title:
    "Documents",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ProDocumentsPageProps {
  searchParams: Promise<{
    supportingStatus?:
      string;

    supportingReviewStatus?:
      string;
  }>;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function mayUseAssignedIdentityReview(
  role:
    string,
): boolean {
  return (
    role ===
      "claims_manager" ||
    role ===
      "administrator" ||
    role ===
      "super_admin"
  );
}

function requestTone(
  status:
    string,
):
  | "positive"
  | "caution"
  | "info"
  | "neutral" {
  switch (
    status
  ) {
    case "accepted":
      return "positive";

    case "received":
      return "info";

    case "overdue":
    case "outstanding":
      return "caution";

    default:
      return "neutral";
  }
}

function requestLabel(
  status:
    string,
): string {
  switch (
    status
  ) {
    case "accepted":
      return "Accepted";

    case "received":
      return "Received";

    case "overdue":
      return "Overdue";

    case "outstanding":
      return "Waiting on claimant";

    default:
      return status;
  }
}

function documentTone(
  status:
    string,
):
  | "positive"
  | "critical"
  | "caution"
  | "info"
  | "neutral" {
  switch (
    status
  ) {
    case "accepted":
      return "positive";

    case "rejected":
      return "critical";

    case "uploaded":
    case "scanning":
    case "under_review":
      return "info";

    case "expired":
      return "caution";

    default:
      return "neutral";
  }
}

function documentLabel(
  status:
    string,
): string {
  switch (
    status
  ) {
    case "accepted":
      return "Accepted";

    case "rejected":
      return "Rejected";

    case "uploaded":
      return "Uploaded";

    case "scanning":
      return "Safety check";

    case "under_review":
      return "Under review";

    case "expired":
      return "Expired";

    case "superseded":
      return "Superseded";

    default:
      return status;
  }
}

function safetyTone(
  status:
    string,
):
  | "positive"
  | "critical"
  | "caution"
  | "neutral" {
  switch (
    status
  ) {
    case "clean":
      return "positive";

    case "unsafe":
      return "critical";

    case "pending":
    case "rejected":
      return "caution";

    default:
      return "neutral";
  }
}

function safetyLabel(
  status:
    string,
): string {
  switch (
    status
  ) {
    case "clean":
      return "Safety clean";

    case "unsafe":
      return "Unsafe";

    case "pending":
      return "Safety pending";

    case "rejected":
      return "Safety not cleared";

    default:
      return status;
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProDocumentsPage({
  searchParams,
}: ProDocumentsPageProps) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  const params =
    await searchParams;

  const supportingStatus =
    params.supportingStatus ??
    "";

  const supportingReviewStatus =
    params.supportingReviewStatus ??
    "";

  const canReadRestricted =
    can(
      session,
      "document.read_restricted",
    ) ||
    session.user.role ===
      "administrator" ||
    session.user.role ===
      "super_admin";

  const canReview =
    can(
      session,
      "document.review",
    ) ||
    session.user.role ===
      "administrator" ||
    session.user.role ===
      "super_admin";

  const assignedIdentityReviewEnabled =
    mayUseAssignedIdentityReview(
      session.user.role,
    );

  const [
    conversions,
    assignedIdentityItems,
    supportingState,
  ] =
    await Promise.all([
      listOpportunityConversions(),

      assignedIdentityReviewEnabled
        ? listAssignedLeadIdentityReviewQueue(
            session,
          )
        : Promise.resolve(
            [],
          ),

      listPreclaimSupportingDocumentStaffState(
        session,
      ),
    ]);

  const claimRows =
    (
      await Promise.all(
        conversions.map(
          async (
            conversion,
          ) => {
            const resolved =
              await resolveClaimRecord(
                conversion.claimId,
              );

            if (
              !resolved
            ) {
              return undefined;
            }

            const claim =
              resolved.claim;

            const [
              property,
              onboarding,
              documents,
              requests,
            ] =
              await Promise.all([
                getPropertyById(
                  claim.propertyId,
                ),

                getClaimantOnboarding(
                  claim.id,
                ),

                listClaimDocuments(
                  claim.id,
                ),

                listClaimDocumentRequests(
                  claim.id,
                ),
              ]);

            return {
              claim,
              property,
              onboarding,
              documents,
              requests,
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
  /* Claim-backed rows                                                         */
  /* ======================================================================== */

  const documentRows =
    claimRows.flatMap(
      (
        row,
      ) =>
        row.documents.map(
          (
            document,
          ) => ({
            document,

            claim:
              row.claim,

            property:
              row.property,

            onboarding:
              row.onboarding,
          }),
        ),
    );

  const requestRows =
    claimRows.flatMap(
      (
        row,
      ) =>
        row.requests.map(
          (
            request,
          ) => ({
            request,

            claim:
              row.claim,

            property:
              row.property,

            onboarding:
              row.onboarding,
          }),
        ),
    );

  const awaitingReview =
    documentRows.filter(
      ({
        document,
      }) =>
        document.status !==
          "accepted" &&
        document.status !==
          "rejected",
    );

  const rejected =
    documentRows.filter(
      ({
        document,
      }) =>
        document.status ===
        "rejected",
    );

  const outstanding =
    requestRows.filter(
      ({
        request,
      }) =>
        request.status !==
        "accepted",
    );

  const claimsAffected =
    new Set(
      outstanding.map(
        ({
          claim,
        }) =>
          claim.id,
      ),
    ).size;

  /* ======================================================================== */
  /* Pre-Claim counts                                                          */
  /* ======================================================================== */

  const assignedIdentityAwaiting =
    assignedIdentityItems.filter(
      (
        item,
      ) =>
        item.status !==
          "accepted" &&
        item.status !==
          "rejected",
    ).length;

  const assignedIdentityRejected =
    assignedIdentityItems.filter(
      (
        item,
      ) =>
        item.status ===
        "rejected",
    ).length;

  const supportingAwaiting =
    supportingState.documents.filter(
      (
        document,
      ) =>
        document.status ===
          "uploaded" ||
        document.status ===
          "scanning" ||
        document.status ===
          "under_review",
    );

  const supportingRejected =
    supportingState.documents.filter(
      (
        document,
      ) =>
        document.status ===
          "rejected",
    );

  const supportingOutstanding =
    supportingState.requests.filter(
      (
        request,
      ) =>
        request.status ===
          "outstanding" ||
        request.status ===
          "overdue",
    );

  const totalAwaitingReview =
    awaitingReview.length +
    assignedIdentityAwaiting +
    supportingAwaiting.length;

  const totalRejected =
    rejected.length +
    assignedIdentityRejected +
    supportingRejected.length;

  const totalOutstandingRequests =
    outstanding.length +
    supportingOutstanding.length;

  const claimantByWorkcaseId =
    new Map(
      supportingState.claimants.map(
        (
          claimant,
        ) => [
          claimant.workcaseId,
          claimant,
        ],
      ),
    );

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">
            Work
          </p>

          <h1 className="mt-1.5 text-2xl">
            Documents
          </h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Controlled claimant identity review, pre-Claim supporting document
            collection, and persisted Claim document requirements.
          </p>
        </div>
      </div>

      {/* ================================================================= stats */}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Awaiting review"
          value={
            formatCount(
              totalAwaitingReview,
            )
          }
          tone={
            totalAwaitingReview >
            0
              ? "caution"
              : "positive"
          }
          context="Identity, supporting, and Claim documents needing action"
        />

        <Stat
          label="Rejected"
          value={
            formatCount(
              totalRejected,
            )
          }
          tone={
            totalRejected >
            0
              ? "critical"
              : "positive"
          }
          context="Replacement evidence is required"
        />

        <Stat
          label="Requests outstanding"
          value={
            formatCount(
              totalOutstandingRequests,
            )
          }
          context="Claim and pre-Claim document requests"
        />

        <Stat
          label="Claims affected"
          value={
            formatCount(
              claimsAffected,
            )
          }
          tone={
            claimsAffected >
            0
              ? "caution"
              : "positive"
          }
          context="Converted Claims with incomplete requirements"
        />
      </div>

      {/* ===================================================== identity review */}

      {
        assignedIdentityReviewEnabled &&
        (
          <AssignedLeadIdentityReviewPanel
            initialItems={
              assignedIdentityItems
            }
          />
        )
      }

      {/* ============================================== supporting documents */}

      <Card>
        <CardHeader
          title="Pre-Claim supporting documents"
          description="Request and review specific supporting evidence from a verified claimant on an active assigned recovery. These records do not create an official Claim or filing requirement."
          actions={
            <Badge tone="neutral">
              Pre-Claim
            </Badge>
          }
        />

        <CardBody>
          <div className="space-y-5">
            {/* ================================================= status messages */}

            {
              supportingStatus ===
                "requested" &&
              (
                <Callout
                  tone="positive"
                  role="status"
                  title="Document request sent"
                >
                  The supporting document request was saved and is visible in
                  My DueQuity.
                </Callout>
              )
            }

            {
              supportingStatus ===
                "invalid" &&
              (
                <Callout
                  tone="critical"
                  role="alert"
                  title="Complete the required fields"
                >
                  Select a claimant and document type, then provide the reason
                  the document is needed.
                </Callout>
              )
            }

            {
              supportingStatus ===
                "failed" &&
              (
                <Callout
                  tone="critical"
                  role="alert"
                  title="Document request could not be saved"
                >
                  The request was not created.
                </Callout>
              )
            }

            {
              supportingReviewStatus ===
                "scan-clean" &&
              (
                <Callout
                  tone="positive"
                  role="status"
                  title="Safety check passed"
                >
                  The supporting document is now available for secure human
                  review.
                </Callout>
              )
            }

            {
              supportingReviewStatus ===
                "scan-unsafe" &&
              (
                <Callout
                  tone="critical"
                  role="alert"
                  title="Unsafe document blocked"
                >
                  The safety check identified the file as unsafe. It cannot be
                  opened or accepted and must be replaced.
                </Callout>
              )
            }

            {
              supportingReviewStatus ===
                "scan-failed" &&
              (
                <Callout
                  tone="critical"
                  role="alert"
                  title="Safety check did not complete"
                >
                  No clean result was established. The file remains blocked and
                  the safety check may be retried.
                </Callout>
              )
            }

            {
              supportingReviewStatus ===
                "confirmation-required" &&
              (
                <Callout
                  tone="critical"
                  role="alert"
                  title="Review confirmation required"
                >
                  Confirm that you reviewed the supporting document before
                  accepting it.
                </Callout>
              )
            }

            {
              supportingReviewStatus ===
                "rejection-reason-required" &&
              (
                <Callout
                  tone="critical"
                  role="alert"
                  title="Rejection reason required"
                >
                  Enter the reason the claimant must replace or correct the
                  document.
                </Callout>
              )
            }

            {
              supportingReviewStatus ===
                "accepted" &&
              (
                <Callout
                  tone="positive"
                  role="status"
                  title="Supporting document accepted"
                >
                  The review decision was saved and the document now satisfies
                  this pre-Claim supporting-document request.
                </Callout>
              )
            }

            {
              supportingReviewStatus ===
                "rejected" &&
              (
                <Callout
                  tone="critical"
                  role="status"
                  title="Supporting document rejected"
                >
                  The rejection was saved. The claimant must provide a
                  replacement when the request is reopened by the controlled
                  workflow.
                </Callout>
              )
            }

            {
              supportingReviewStatus ===
                "review-failed" &&
              (
                <Callout
                  tone="critical"
                  role="alert"
                  title="Review could not be saved"
                >
                  The document state changed or the review could not be
                  authorized. Reload and try again.
                </Callout>
              )
            }

            {/* ================================================= request form */}

            {
              supportingState.claimants.length ===
                0
                ? (
                    <EmptyState
                      compact
                      title="No verified pre-Claim claimants available"
                      description="Supporting-document collection becomes available after an assigned claimant activates My DueQuity and completes identity verification."
                    />
                  )
                : (
                    <form
                      action={
                        createSupportingDocumentRequest
                      }
                      className="space-y-4 rounded-xl border border-line bg-inset p-4"
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label
                            htmlFor="workcaseId"
                            className="block text-sm font-medium text-ink-800"
                          >
                            Claimant
                          </label>

                          <select
                            id="workcaseId"
                            name="workcaseId"
                            required
                            defaultValue=""
                            className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink-900"
                          >
                            <option
                              value=""
                              disabled
                            >
                              Select claimant
                            </option>

                            {
                              supportingState.claimants.map(
                                (
                                  claimant,
                                ) => (
                                  <option
                                    key={
                                      claimant.workcaseId
                                    }
                                    value={
                                      claimant.workcaseId
                                    }
                                  >
                                    {
                                      claimant.legalName
                                    }
                                    {" · "}
                                    {
                                      claimant.claimantReference
                                    }
                                  </option>
                                ),
                              )
                            }
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="kind"
                            className="block text-sm font-medium text-ink-800"
                          >
                            Document type
                          </label>

                          <select
                            id="kind"
                            name="kind"
                            required
                            defaultValue=""
                            className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink-900"
                          >
                            <option
                              value=""
                              disabled
                            >
                              Select document
                            </option>

                            {
                              PRECLAIM_SUPPORTING_DOCUMENT_KINDS.map(
                                (
                                  kind,
                                ) => (
                                  <option
                                    key={
                                      kind
                                    }
                                    value={
                                      kind
                                    }
                                  >
                                    {
                                      preclaimSupportingDocumentKindLabel(
                                        kind,
                                      )
                                    }
                                  </option>
                                ),
                              )
                            }
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="reason"
                          className="block text-sm font-medium text-ink-800"
                        >
                          Why this document is needed
                        </label>

                        <textarea
                          id="reason"
                          name="reason"
                          required
                          maxLength={
                            500
                          }
                          rows={
                            3
                          }
                          className="w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink-900"
                        />
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="guidance"
                          className="block text-sm font-medium text-ink-800"
                        >
                          Preparation guidance
                          <span className="ml-1 font-normal text-ink-500">
                            Optional
                          </span>
                        </label>

                        <textarea
                          id="guidance"
                          name="guidance"
                          maxLength={
                            1000
                          }
                          rows={
                            2
                          }
                          className="w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink-900"
                        />
                      </div>

                      <Callout
                        tone="neutral"
                        title="Supporting evidence only"
                      >
                        This request collects evidence for the active recovery
                        account. It does not establish a jurisdiction filing
                        requirement, fee agreement, entitlement decision, or
                        official DueQuity Claim.
                      </Callout>

                      <div className="flex justify-end">
                        <ProtectedSubmitButton
                          label="Send document request"
                          pendingLabel="Sending request…"
                          successLabel="✓ Request sent"
                          requireValid
                        />
                      </div>
                    </form>
                  )
            }

            {/* ======================================================= requests */}

            {
              supportingState.requests.length >
                0 &&
              (
                <div>
                  <h3 className="text-base font-semibold text-ink-900">
                    Current requests
                  </h3>

                  <div className="mt-3 divide-y divide-line-subtle overflow-hidden rounded-xl border border-line">
                    {
                      supportingState.requests.map(
                        (
                          request,
                        ) => {
                          const claimant =
                            claimantByWorkcaseId.get(
                              request.workcaseId,
                            );

                          return (
                            <div
                              key={
                                request.id
                              }
                              className="bg-white px-4 py-3.5"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium text-ink-900">
                                    {
                                      request.kindLabel
                                    }
                                  </p>

                                  <p className="mt-0.5 text-xs text-ink-500">
                                    {
                                      claimant?.legalName ??
                                      request.claimantId
                                    }

                                    {
                                      claimant &&
                                      (
                                        <>
                                          {" · "}
                                          {
                                            claimant.claimantReference
                                          }
                                        </>
                                      )
                                    }

                                    {" · requested "}

                                    {
                                      formatDate(
                                        request.requestedAt.slice(
                                          0,
                                          10,
                                        ),
                                      )
                                    }
                                  </p>

                                  <p className="mt-2 text-sm leading-relaxed text-ink-700">
                                    {
                                      request.reason
                                    }
                                  </p>

                                  {
                                    request.guidance &&
                                    (
                                      <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                        Guidance:{" "}
                                        {
                                          request.guidance
                                        }
                                      </p>
                                    )
                                  }
                                </div>

                                <Badge
                                  tone={
                                    requestTone(
                                      request.status,
                                    )
                                  }
                                >
                                  {
                                    requestLabel(
                                      request.status,
                                    )
                                  }
                                </Badge>
                              </div>
                            </div>
                          );
                        },
                      )
                    }
                  </div>
                </div>
              )
            }

            {/* ====================================================== documents */}

            {
              supportingState.documents.length >
                0 &&
              (
                <div>
                  <h3 className="text-base font-semibold text-ink-900">
                    Supporting documents received
                  </h3>

                  <div className="mt-3 space-y-3">
                    {
                      supportingState.documents.map(
                        (
                          document,
                        ) => {
                          const claimant =
                            claimantByWorkcaseId.get(
                              document.workcaseId,
                            );

                          const mayScan =
                            document.status ===
                              "uploaded" &&
                            (
                              document.safetyStatus ===
                                "pending" ||
                              document.safetyStatus ===
                                "rejected"
                            );

                          const readyForReview =
                            document.status ===
                              "under_review" &&
                            document.safetyStatus ===
                              "clean";

                          const accepted =
                            document.status ===
                              "accepted" &&
                            document.safetyStatus ===
                              "clean";

                          return (
                            <Card
                              key={
                                document.id
                              }
                            >
                              <CardBody>
                                <div className="space-y-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium text-ink-900">
                                        {
                                          document.kindLabel
                                        }
                                      </p>

                                      <p className="mt-0.5 text-xs text-ink-500">
                                        {
                                          claimant?.legalName ??
                                          document.claimantId
                                        }

                                        {
                                          document.originalFileName &&
                                          (
                                            <>
                                              {" · "}
                                              {
                                                document.originalFileName
                                              }
                                            </>
                                          )
                                        }

                                        {" · "}

                                        {
                                          formatBytes(
                                            document.byteSize,
                                          )
                                        }

                                        {" · uploaded "}

                                        {
                                          formatDate(
                                            document.uploadedAt.slice(
                                              0,
                                              10,
                                            ),
                                          )
                                        }
                                      </p>

                                      {
                                        document.rejectionReason &&
                                        (
                                          <p className="mt-1.5 text-sm text-critical-700">
                                            {
                                              document.rejectionReason
                                            }
                                          </p>
                                        )
                                      }
                                    </div>

                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <Badge
                                        tone={
                                          safetyTone(
                                            document.safetyStatus,
                                          )
                                        }
                                      >
                                        {
                                          safetyLabel(
                                            document.safetyStatus,
                                          )
                                        }
                                      </Badge>

                                      <Badge
                                        tone={
                                          documentTone(
                                            document.status,
                                          )
                                        }
                                      >
                                        {
                                          documentLabel(
                                            document.status,
                                          )
                                        }
                                      </Badge>
                                    </div>
                                  </div>

                                  {/* ================================= safety scan */}

                                  {
                                    mayScan &&
                                    (
                                      <form
                                        action={
                                          scanSupportingDocument
                                        }
                                        className="flex justify-end"
                                      >
                                        <input
                                          type="hidden"
                                          name="documentId"
                                          value={
                                            document.id
                                          }
                                        />

                                        <ProtectedSubmitButton
                                          label="Run safety check"
                                          pendingLabel="Running safety check…"
                                          successLabel="✓ Safety check complete"
                                        />
                                      </form>
                                    )
                                  }

                                  {/* ================================= human review */}

                                  {
                                    readyForReview &&
                                    (
                                      <div className="space-y-4 rounded-xl border border-line bg-inset p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                            <p className="text-sm font-medium text-ink-900">
                                              Ready for human review
                                            </p>

                                            <p className="mt-1 text-xs text-ink-500">
                                              Open the clean private file,
                                              review its contents, then record
                                              your decision.
                                            </p>
                                          </div>

                                          <Link
                                            href={`/api/pro/claimants/supporting-documents/${document.id}/file`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 text-sm font-medium text-ink-800 hover:bg-inset"
                                          >
                                            View secure document
                                          </Link>
                                        </div>

                                        <form
                                          action={
                                            reviewSupportingDocument
                                          }
                                          className="space-y-3 rounded-xl border border-line bg-white p-4"
                                        >
                                          <input
                                            type="hidden"
                                            name="documentId"
                                            value={
                                              document.id
                                            }
                                          />

                                          <input
                                            type="hidden"
                                            name="decision"
                                            value="accepted"
                                          />

                                          <label className="flex items-start gap-3 text-sm text-ink-700">
                                            <input
                                              type="checkbox"
                                              name="documentReviewConfirmed"
                                              required
                                              className="mt-0.5 h-4 w-4"
                                            />

                                            <span>
                                              I reviewed this document and
                                              confirm it is acceptable for the
                                              specific supporting-document
                                              request shown above.
                                            </span>
                                          </label>

                                          <div className="flex justify-end">
                                            <ProtectedSubmitButton
                                              label="Accept document"
                                              pendingLabel="Accepting document…"
                                              successLabel="✓ Document accepted"
                                              requireValid
                                            />
                                          </div>
                                        </form>

                                        <form
                                          action={
                                            reviewSupportingDocument
                                          }
                                          className="space-y-3 rounded-xl border border-line bg-white p-4"
                                        >
                                          <input
                                            type="hidden"
                                            name="documentId"
                                            value={
                                              document.id
                                            }
                                          />

                                          <input
                                            type="hidden"
                                            name="decision"
                                            value="rejected"
                                          />

                                          <div className="space-y-2">
                                            <label
                                              htmlFor={`rejectionReason-${document.id}`}
                                              className="block text-sm font-medium text-ink-800"
                                            >
                                              Rejection reason
                                            </label>

                                            <textarea
                                              id={`rejectionReason-${document.id}`}
                                              name="rejectionReason"
                                              required
                                              maxLength={
                                                1000
                                              }
                                              rows={
                                                3
                                              }
                                              placeholder="Explain what is wrong and what the claimant must replace or correct."
                                              className="w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink-900"
                                            />
                                          </div>

                                          <div className="flex justify-end">
                                            <ProtectedSubmitButton
                                              label="Reject document"
                                              pendingLabel="Rejecting document…"
                                              successLabel="✓ Document rejected"
                                              requireValid
                                            />
                                          </div>
                                        </form>
                                      </div>
                                    )
                                  }

                                  {/* ================================= accepted */}

                                  {
                                    accepted &&
                                    (
                                      <div className="rounded-xl border border-line bg-inset p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                            <p className="text-sm font-medium text-ink-900">
                                              ✓ Supporting document accepted and
                                              saved
                                            </p>

                                            <p className="mt-1 text-xs text-ink-500">
                                              The review decision is complete
                                              and locked in the persisted
                                              workflow.
                                            </p>

                                            <p className="mt-2 text-sm text-positive-700">
                                              ✓ Review confirmed
                                            </p>
                                          </div>

                                          <Link
                                            href={`/api/pro/claimants/supporting-documents/${document.id}/file`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 text-sm font-medium text-ink-800 hover:bg-inset"
                                          >
                                            View accepted document
                                          </Link>
                                        </div>
                                      </div>
                                    )
                                  }
                                </div>
                              </CardBody>
                            </Card>
                          );
                        },
                      )
                    }
                  </div>
                </div>
              )
            }
          </div>
        </CardBody>
      </Card>

      {/* =========================================================== permissions */}

      {
        !canReadRestricted &&
        (
          <Callout
            tone="neutral"
            title="Restricted document access is not available to your role"
          >
            Sensitive document metadata may be visible for workflow purposes,
            but restricted file contents require controlled authority.
          </Callout>
        )
      }

      {
        !canReview &&
        (
          <Callout
            tone="neutral"
            title="Document review is read-only for your role"
          >
            You can see the persisted Claim document queue, but accepting or
            rejecting Claim evidence requires document-review authority.
          </Callout>
        )
      }

      {/* ======================================================= Claim documents */}

      <Card>
        <CardHeader
          title="Claim documents awaiting review"
          description="Documents attached to persistently converted Claims that have not yet received a final review decision."
        />

        <CardBody flush>
          {
            awaitingReview.length ===
              0
              ? (
                  <EmptyState
                    compact
                    className="m-4 border-0 bg-transparent"
                    title="Claim review queue clear"
                    description="No converted-Claim documents are currently waiting for review."
                  />
                )
              : (
                  <ul className="divide-y divide-line-subtle">
                    {
                      awaitingReview.map(
                        ({
                          document,
                          claim,
                          property,
                          onboarding,
                        }) => (
                          <li
                            key={
                              document.id
                            }
                            className="px-4 py-3.5 sm:px-5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-base font-medium text-ink-900">
                                  {
                                    document.title
                                  }
                                </p>

                                <p className="mt-0.5 text-xs text-ink-500">
                                  {
                                    DOCUMENT_KIND_LABEL[
                                      document.kind
                                    ]
                                  }

                                  {" / "}

                                  {
                                    formatBytes(
                                      document.byteSize,
                                    )
                                  }

                                  {
                                    document.uploadedAt &&
                                    (
                                      <>
                                        {" / uploaded "}
                                        {
                                          formatDate(
                                            document.uploadedAt.slice(
                                              0,
                                              10,
                                            ),
                                          )
                                        }
                                      </>
                                    )
                                  }
                                </p>

                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                                  <Link
                                    href={`/pro/claims/${claim.id}`}
                                    className="font-mono text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                                  >
                                    {
                                      claim.reference
                                    }
                                  </Link>

                                  {
                                    property &&
                                    (
                                      <span>
                                        {
                                          property.address.line1
                                        }
                                        {", "}
                                        {
                                          property.address.state
                                        }
                                      </span>
                                    )
                                  }

                                  {
                                    onboarding &&
                                    (
                                      <span>
                                        Claimant:{" "}
                                        {
                                          onboarding.claimant.legalName
                                        }
                                      </span>
                                    )
                                  }
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                <StatusBadge
                                  status={
                                    DOCUMENT_STATUS[
                                      document.status
                                    ]
                                  }
                                />

                                <Tag>
                                  Persisted Claim
                                </Tag>

                                {
                                  !canReview &&
                                  (
                                    <Badge tone="neutral">
                                      Review not permitted
                                    </Badge>
                                  )
                                }
                              </div>
                            </div>
                          </li>
                        ),
                      )
                    }
                  </ul>
                )
          }
        </CardBody>
      </Card>

      {/* ============================================================= rejected */}

      {
        rejected.length >
          0 &&
        (
          <Card>
            <CardHeader
              title="Rejected Claim documents"
              description="Converted-Claim documents that failed review and require replacement or correction."
            />

            <CardBody flush>
              <ul className="divide-y divide-line-subtle">
                {
                  rejected.map(
                    ({
                      document,
                      claim,
                      property,
                    }) => (
                      <li
                        key={
                          document.id
                        }
                        className="px-4 py-3.5 sm:px-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-base font-medium text-ink-900">
                              {
                                document.title
                              }
                            </p>

                            {
                              document.rejectionReason &&
                              (
                                <p className="mt-1 text-sm text-critical-700">
                                  {
                                    document.rejectionReason
                                  }
                                </p>
                              )
                            }

                            <p className="mt-1.5 text-xs text-ink-500">
                              <Link
                                href={`/pro/claims/${claim.id}`}
                                className="font-mono text-accent-700 underline"
                              >
                                {
                                  claim.reference
                                }
                              </Link>

                              {
                                property &&
                                (
                                  <>
                                    {" / "}
                                    {
                                      property.address.line1
                                    }
                                  </>
                                )
                              }
                            </p>
                          </div>

                          <StatusBadge
                            status={
                              DOCUMENT_STATUS[
                                document.status
                              ]
                            }
                          />
                        </div>
                      </li>
                    ),
                  )
                }
              </ul>
            </CardBody>
          </Card>
        )
      }

      {/* ================================================= outstanding requests */}

      <Card>
        <CardHeader
          title="Outstanding Claim requests"
          description={`${formatCount(
            outstanding.length,
          )} ${plural(
            outstanding.length,
            "document requirement",
          )} remain incomplete across converted Claims.`}
        />

        <CardBody flush>
          {
            outstanding.length ===
              0
              ? (
                  <EmptyState
                    compact
                    className="m-4 border-0 bg-transparent"
                    title="No outstanding Claim requests"
                    description="Every persisted converted-Claim document requirement currently points to accepted evidence."
                  />
                )
              : (
                  <ul className="divide-y divide-line-subtle">
                    {
                      outstanding.map(
                        ({
                          request,
                          claim,
                        }) => (
                          <li
                            key={
                              request.id
                            }
                            className="px-4 py-3.5 sm:px-5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-base font-medium text-ink-900">
                                  {
                                    DOCUMENT_KIND_LABEL[
                                      request.kind
                                    ]
                                  }
                                </p>

                                <Link
                                  href={`/pro/claims/${claim.id}`}
                                  className="mt-1 inline-block text-xs font-mono text-accent-700 underline"
                                >
                                  {
                                    claim.reference
                                  }
                                </Link>
                              </div>

                              <Badge tone="caution">
                                Outstanding
                              </Badge>
                            </div>
                          </li>
                        ),
                      )
                    }
                  </ul>
                )
          }
        </CardBody>
      </Card>

      {/* ============================================================ boundary */}

      <Callout
        tone="neutral"
        title="Restricted document security boundary"
      >
        Claimant identity files and pre-Claim supporting documents remain in
        private Supabase object storage and are never exposed through a public
        file URL. Supporting evidence does not by itself establish a Claim,
        entitlement, filing requirement, or approval.
      </Callout>
    </div>
  );
}