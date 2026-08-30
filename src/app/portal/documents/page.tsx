import type {
  Metadata,
} from "next";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

import {
  ClaimantAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  ProtectedSubmitButton,
} from "@/components/ui/protected-submit-button";

import {
  DOCUMENT_KIND_LABEL,
  DOCUMENT_STATUS,
} from "@/domain/status";

import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
} from "@/components/ui/surface";

import {
  Badge,
  StatusBadge,
} from "@/components/ui/badge";

import {
  formatBytes,
  formatDate,
  plural,
} from "@/lib/format";

import {
  DocumentUpload,
} from "@/components/portal/document-upload";

import {
  getPreclaimSupportingDocumentClaimantState,
} from "@/server/assigned-lead-supporting-document-service";

import {
  listOpportunityConversions,
} from "@/server/opportunity-conversion-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  getClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import {
  listClaimDocumentRequests,
  listClaimDocuments,
} from "@/server/claim-document-store";

import {
  getPropertyById,
} from "@/server/opportunity-store";

import {
  uploadSupportingDocument,
} from "./actions";

export const metadata: Metadata = {
  title:
    "Documents",

  robots: {
    index:
      false,

    follow:
      false,
  },
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface PortalDocumentsPageProps {
  searchParams: Promise<{
    supportingStatus?:
      string;
  }>;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function requestBadgeTone(
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

    case "outstanding":
    case "overdue":
      return "caution";

    default:
      return "neutral";
  }
}

function requestBadgeLabel(
  status:
    string,
): string {
  switch (
    status
  ) {
    case "accepted":
      return "Accepted";

    case "received":
      return "Review pending";

    case "outstanding":
      return "Needed";

    case "overdue":
      return "Overdue";

    default:
      return status;
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalDocumentsPage({
  searchParams,
}: PortalDocumentsPageProps) {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  const params =
    await searchParams;

  const supportingStatus =
    params.supportingStatus ??
    "";

  const [
    conversions,
    preclaimSupportingState,
  ] =
    await Promise.all([
      listOpportunityConversions(),

      getPreclaimSupportingDocumentClaimantState(
        session.claimantId,
      ),
    ]);

  /*
   * Resolve only official Claims actually linked to the authenticated claimant.
   * The pre-Claim supporting-document workflow remains separate below.
   */
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

            const onboarding =
              await getClaimantOnboarding(
                claim.id,
              );

            if (
              !onboarding ||
              onboarding.claimant.id !==
                session.claimantId
            ) {
              return undefined;
            }

            const [
              property,
              requests,
              documents,
            ] =
              await Promise.all([
                getPropertyById(
                  claim.propertyId,
                ),

                listClaimDocumentRequests(
                  claim.id,
                ),

                listClaimDocuments(
                  claim.id,
                ),
              ]);

            return {
              claim,
              onboarding,
              property,
              requests,
              documents,
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
  /* Claim-backed request rows                                                 */
  /* ======================================================================== */

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
          }),
        ),
    );

  const mine =
    requestRows.filter(
      ({
        request,
      }) =>
        request.requestedFromClaimantId ===
          session.claimantId &&
        (
          request.status ===
            "outstanding" ||
          request.status ===
            "overdue"
        ),
    );

  const underReview =
    requestRows.filter(
      ({
        request,
      }) =>
        request.requestedFromClaimantId ===
          session.claimantId &&
        request.status ===
          "received",
    );

  const elsewhere =
    requestRows.filter(
      ({
        request,
      }) =>
        request.requestedFromClaimantId !==
          session.claimantId &&
        request.status !==
          "accepted" &&
        request.status !==
          "waived",
    );

  /* ======================================================================== */
  /* Claim-backed document rows                                                */
  /* ======================================================================== */

  const documentRows =
    claimRows.flatMap(
      (
        row,
      ) =>
        row.documents
          .filter(
            (
              document,
            ) =>
              document.claimantId ===
                session.claimantId ||
              document.uploadedByClaimantId ===
                session.claimantId,
          )
          .map(
            (
              document,
            ) => ({
              document,

              claim:
                row.claim,

              property:
                row.property,
            }),
          ),
    );

  const rejected =
    documentRows.filter(
      ({
        document,
      }) =>
        document.status ===
        "rejected",
    );

  /* ======================================================================== */
  /* Pre-Claim supporting rows                                                 */
  /* ======================================================================== */

  const supportingRequests =
    preclaimSupportingState
      ?.requests ??
    [];

  const supportingDocuments =
    preclaimSupportingState
      ?.documents ??
    [];

  const supportingOutstanding =
    supportingRequests.filter(
      (
        request,
      ) =>
        request.status ===
          "outstanding" ||
        request.status ===
          "overdue",
    );

  const supportingReceived =
    supportingRequests.filter(
      (
        request,
      ) =>
        request.status ===
          "received",
    );

  /* ======================================================================== */
  /* Claim labels                                                              */
  /* ======================================================================== */

  function claimLabel(
    claimId:
      string,
  ): string {
    const row =
      claimRows.find(
        (
          candidate,
        ) =>
          candidate.claim.id ===
          claimId,
      );

    if (
      !row
    ) {
      return "Recovery claim";
    }

    if (
      row.property
    ) {
      return row.property.address.line1;
    }

    return row.claim.reference;
  }

  /* ======================================================================== */
  /* Header message                                                            */
  /* ======================================================================== */

  const actionNeededCount =
    supportingOutstanding.length +
    mine.length;

  let headerMessage =
    "You currently have no outstanding document requests.";

  if (
    actionNeededCount >
    0
  ) {
    headerMessage =
      `${actionNeededCount} ${plural(
        actionNeededCount,
        "item",
      )} still needed from you.`;
  } else if (
    supportingReceived.length >
      0 ||
    underReview.length >
      0
  ) {
    headerMessage =
      "Your submitted documents are being reviewed.";
  }

  return (
    <div className="space-y-8">
      {/* ================================================================ header */}

      <div>
        <h1 className="text-2xl sm:text-3xl">
          Documents
        </h1>

        <p className="mt-1.5 text-md text-ink-600">
          {
            headerMessage
          }
        </p>
      </div>

      {/* ======================================================== upload status */}

      {
        supportingStatus ===
          "uploaded" &&
        (
          <Callout
            tone="positive"
            role="status"
            title="Document uploaded"
          >
            Your supporting document was securely received. It remains pending
            until DueQuity completes the required safety and staff review.
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
            title="Select a document"
          >
            Choose a valid file before submitting this document request.
          </Callout>
        )
      }

      {
        supportingStatus ===
          "too-large" &&
        (
          <Callout
            tone="critical"
            role="alert"
            title="File is too large"
          >
            Supporting documents must be 15 MB or smaller.
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
            title="Document could not be uploaded"
          >
            The upload was not completed. Confirm that the requested document is
            still outstanding and try again.
          </Callout>
        )
      }

      {/* ============================================== pre-Claim supporting docs */}

      {
        preclaimSupportingState &&
        (
          <section>
            <div>
              <h2 className="text-xl">
                Recovery supporting documents
              </h2>

              <p className="mt-1.5 text-md text-ink-600">
                These documents were specifically requested for your active
                recovery account. They are not presented as an official Claim
                filing requirement.
              </p>
            </div>

            {
              supportingRequests.length ===
                0
                ? (
                    <EmptyState
                      compact
                      className="mt-4"
                      title="Nothing requested"
                      description="DueQuity has not requested any additional supporting documents from you."
                    />
                  )
                : (
                    <div className="mt-4 space-y-4">
                      {
                        supportingRequests.map(
                          (
                            request,
                          ) => {
                            const documentsForRequest =
                              supportingDocuments.filter(
                                (
                                  document,
                                ) =>
                                  document.kind ===
                                  request.kind,
                              );

                            const latestDocument =
                              documentsForRequest[
                                0
                              ];

                            const mayUpload =
                              request.status ===
                                "outstanding" ||
                              request.status ===
                                "overdue";

                            return (
                              <Card
                                key={
                                  request.id
                                }
                                elevated={
                                  mayUpload
                                }
                              >
                                <CardHeader
                                  eyebrow={
                                    preclaimSupportingState
                                      .claimant
                                      .claimantReference
                                  }
                                  title={
                                    request.kindLabel
                                  }
                                  description={
                                    request.reason
                                  }
                                  actions={
                                    <Badge
                                      tone={
                                        requestBadgeTone(
                                          request.status,
                                        )
                                      }
                                      size="md"
                                    >
                                      {
                                        requestBadgeLabel(
                                          request.status,
                                        )
                                      }
                                    </Badge>
                                  }
                                />

                                <CardBody>
                                  <div className="space-y-4">
                                    {
                                      request.guidance &&
                                      (
                                        <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                                          <p className="text-sm font-medium text-ink-800">
                                            How to prepare this document
                                          </p>

                                          <p className="mt-1 text-sm leading-relaxed text-ink-600">
                                            {
                                              request.guidance
                                            }
                                          </p>
                                        </div>
                                      )
                                    }

                                    {
                                      mayUpload &&
                                      (
                                        <form
                                          action={
                                            uploadSupportingDocument
                                          }
                                          className="space-y-3"
                                        >
                                          <input
                                            type="hidden"
                                            name="requestId"
                                            value={
                                              request.id
                                            }
                                          />

                                          <div className="space-y-2">
                                            <label
                                              htmlFor={`supporting-file-${request.id}`}
                                              className="block text-sm font-medium text-ink-800"
                                            >
                                              Select document
                                            </label>

                                            <input
                                              id={`supporting-file-${request.id}`}
                                              type="file"
                                              name="file"
                                              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                                              required
                                              className="block w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink-700 file:mr-4 file:rounded-lg file:border-0 file:bg-inset file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-800"
                                            />

                                            <p className="text-xs text-ink-500">
                                              PDF, JPEG, PNG, or WebP. Maximum
                                              file size 15 MB.
                                            </p>
                                          </div>

                                          <div className="flex justify-end">
                                            <ProtectedSubmitButton
                                              label="Upload document"
                                              pendingLabel="Uploading document…"
                                              successLabel="✓ Document uploaded"
                                              requireValid
                                            />
                                          </div>
                                        </form>
                                      )
                                    }

                                    {
                                      latestDocument &&
                                      (
                                        <div className="rounded-xl border border-line bg-white px-4 py-3">
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium text-ink-900">
                                                {
                                                  latestDocument.originalFileName ??
                                                  latestDocument.title
                                                }
                                              </p>

                                              <p className="mt-0.5 text-xs text-ink-500">
                                                {
                                                  formatBytes(
                                                    latestDocument.byteSize,
                                                  )
                                                }

                                                {" · uploaded "}

                                                {
                                                  formatDate(
                                                    latestDocument.uploadedAt.slice(
                                                      0,
                                                      10,
                                                    ),
                                                  )
                                                }
                                              </p>

                                              {
                                                latestDocument.rejectionReason &&
                                                (
                                                  <p className="mt-1.5 text-sm text-critical-700">
                                                    {
                                                      latestDocument.rejectionReason
                                                    }
                                                  </p>
                                                )
                                              }
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                              <Badge
                                                tone={
                                                  latestDocument.safetyStatus ===
                                                    "clean"
                                                    ? "positive"
                                                    : latestDocument.safetyStatus ===
                                                        "unsafe"
                                                      ? "critical"
                                                      : "caution"
                                                }
                                              >
                                                {
                                                  latestDocument.safetyStatus ===
                                                    "clean"
                                                    ? "Safety clean"
                                                    : latestDocument.safetyStatus ===
                                                        "unsafe"
                                                      ? "Unsafe"
                                                      : "Safety pending"
                                                }
                                              </Badge>

                                              <Badge
                                                tone={
                                                  latestDocument.status ===
                                                    "accepted"
                                                    ? "positive"
                                                    : latestDocument.status ===
                                                        "rejected"
                                                      ? "critical"
                                                      : "info"
                                                }
                                              >
                                                {
                                                  latestDocument.status ===
                                                    "accepted"
                                                    ? "Accepted"
                                                    : latestDocument.status ===
                                                        "rejected"
                                                      ? "Rejected"
                                                      : "Review pending"
                                                }
                                              </Badge>
                                            </div>
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
                  )
            }

            <Callout
              className="mt-4"
              tone="neutral"
              title="Secure document handling"
            >
              Supporting documents are stored privately and are available only
              through authenticated DueQuity workflows. Uploading a document
              does not by itself establish entitlement or create an official
              Claim.
            </Callout>
          </section>
        )
      }

      {/* ======================================================== no claims */}

      {
        claimRows.length ===
          0 &&
        (
          <EmptyState
            title="No official Claim documents yet"
            description="No official DueQuity Claim is connected to your account. Any supporting documents specifically requested for your active recovery appear above."
          />
        )
      }

      {/* ================================================= rejected Claim docs */}

      {
        rejected.length >
          0 &&
        (
          <Callout
            tone="critical"
            title={
              rejected.length ===
                1
                ? "A document needs to be replaced"
                : "Documents need to be replaced"
            }
            role="alert"
          >
            <div className="space-y-3">
              {
                rejected.map(
                  ({
                    document,
                    claim,
                  }) => (
                    <div
                      key={
                        document.id
                      }
                    >
                      <p className="font-medium text-ink-900">
                        {
                          document.title
                        }
                      </p>

                      <p className="mt-0.5 text-xs text-ink-500">
                        {
                          claimLabel(
                            claim.id,
                          )
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
                    </div>
                  ),
                )
              }

              <p className="text-sm">
                Upload a corrected replacement against the outstanding
                requirement below. The replacement still requires review before
                it satisfies the Claim requirement.
              </p>
            </div>
          </Callout>
        )
      }

      {/* ============================================== official Claim needed */}

      {
        claimRows.length >
          0 &&
        (
          <section>
            <h2 className="text-xl">
              Needed from you
            </h2>

            {
              mine.length ===
                0
                ? (
                    <EmptyState
                      compact
                      className="mt-4"
                      title="Nothing outstanding"
                      description="No official Claim document request currently requires action from you."
                    />
                  )
                : (
                    <div className="mt-4 space-y-4">
                      {
                        mine.map(
                          ({
                            request,
                            claim,
                          }) => (
                            <Card
                              key={
                                request.id
                              }
                              elevated
                            >
                              <CardHeader
                                eyebrow={
                                  claimLabel(
                                    claim.id,
                                  )
                                }
                                title={
                                  DOCUMENT_KIND_LABEL[
                                    request.kind
                                  ]
                                }
                                description={
                                  request.reason
                                }
                                actions={
                                  request.status ===
                                    "overdue"
                                    ? (
                                        <Badge
                                          tone="critical"
                                          size="md"
                                        >
                                          Overdue
                                        </Badge>
                                      )
                                    : request.dueBy
                                      ? (
                                          <Badge
                                            tone="caution"
                                            size="md"
                                          >
                                            By{" "}
                                            {
                                              formatDate(
                                                request.dueBy,
                                              )
                                            }
                                          </Badge>
                                        )
                                      : (
                                          <Badge
                                            tone="caution"
                                            size="md"
                                          >
                                            Needed
                                          </Badge>
                                        )
                                }
                              />

                              <CardBody>
                                {
                                  request.guidance &&
                                  (
                                    <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                                      <p className="text-sm font-medium text-ink-800">
                                        How to prepare this document
                                      </p>

                                      <p className="mt-1 text-sm leading-relaxed text-ink-600">
                                        {
                                          request.guidance
                                        }
                                      </p>
                                    </div>
                                  )
                                }

                                <div
                                  className={
                                    request.guidance
                                      ? "mt-4"
                                      : ""
                                  }
                                >
                                  <DocumentUpload
                                    documentLabel={
                                      DOCUMENT_KIND_LABEL[
                                        request.kind
                                      ]
                                    }
                                  />
                                </div>
                              </CardBody>
                            </Card>
                          ),
                        )
                      }
                    </div>
                  )
            }
          </section>
        )
      }

      {/* ====================================================== under review */}

      {
        underReview.length >
          0 &&
        (
          <section>
            <h2 className="text-xl">
              Under review
            </h2>

            <p className="mt-1.5 text-md text-ink-600">
              These official Claim requirements have received a document but
              still need a review decision.
            </p>

            <Card className="mt-4">
              <CardBody flush>
                <ul className="divide-y divide-line-subtle">
                  {
                    underReview.map(
                      ({
                        request,
                        claim,
                      }) => (
                        <li
                          key={
                            request.id
                          }
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                        >
                          <div className="min-w-0">
                            <p className="text-base font-medium text-ink-900">
                              {
                                DOCUMENT_KIND_LABEL[
                                  request.kind
                                ]
                              }
                            </p>

                            <p className="mt-0.5 text-xs text-ink-500">
                              {
                                claimLabel(
                                  claim.id,
                                )
                              }
                            </p>
                          </div>

                          <Badge
                            tone="info"
                            size="md"
                          >
                            Review pending
                          </Badge>
                        </li>
                      ),
                    )
                  }
                </ul>
              </CardBody>
            </Card>
          </section>
        )
      }

      {/* =============================================== handled elsewhere */}

      {
        elsewhere.length >
          0 &&
        (
          <section>
            <h2 className="text-xl">
              Being handled for you
            </h2>

            <p className="mt-1.5 text-md text-ink-600">
              These items are part of your official Claim, but they are not
              currently assigned to you for collection.
            </p>

            <Card className="mt-4">
              <CardBody flush>
                <ul className="divide-y divide-line-subtle">
                  {
                    elsewhere.map(
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
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-base font-medium text-ink-900">
                                {
                                  DOCUMENT_KIND_LABEL[
                                    request.kind
                                  ]
                                }
                              </p>

                              <p className="mt-0.5 text-xs text-ink-500">
                                {
                                  claimLabel(
                                    claim.id,
                                  )
                                }
                              </p>
                            </div>

                            <Badge
                              tone="neutral"
                              size="md"
                            >
                              In progress
                            </Badge>
                          </div>
                        </li>
                      ),
                    )
                  }
                </ul>
              </CardBody>
            </Card>
          </section>
        )
      }

      {/* =========================================================== on file */}

      {
        claimRows.length >
          0 &&
        (
          <section>
            <h2 className="text-xl">
              Official Claim documents on file
            </h2>

            {
              documentRows.length ===
                0
                ? (
                    <EmptyState
                      compact
                      className="mt-4"
                      title="No Claim documents yet"
                      description="Documents linked to an official Claim will appear here after they are uploaded."
                    />
                  )
                : (
                    <Card className="mt-4">
                      <CardBody flush>
                        <ul className="divide-y divide-line-subtle">
                          {
                            documentRows.map(
                              ({
                                document,
                                claim,
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
                                          claimLabel(
                                            claim.id,
                                          )
                                        }

                                        {
                                          document.uploadedAt &&
                                          (
                                            <>
                                              {" / Added "}
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

                                        {" / "}

                                        {
                                          formatBytes(
                                            document.byteSize,
                                          )
                                        }

                                        {
                                          document.pageCount &&
                                          (
                                            <>
                                              {" / "}
                                              {
                                                document.pageCount
                                              }{" "}
                                              {
                                                plural(
                                                  document.pageCount,
                                                  "page",
                                                )
                                              }
                                            </>
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

                                    <StatusBadge
                                      status={
                                        DOCUMENT_STATUS[
                                          document.status
                                        ]
                                      }
                                      audience="claimant"
                                      size="md"
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
          </section>
        )
      }

      {/* ======================================================= security note */}

      <Callout
        tone="neutral"
        title="Document privacy"
      >
        <p>
          DueQuity document storage is private. Document metadata is shown only
          after your authenticated claimant account is matched to the applicable
          recovery or official Claim record.
        </p>
      </Callout>
    </div>
  );
}