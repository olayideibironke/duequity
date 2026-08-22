import type { Metadata } from "next";

import { resolveClaimantSession } from "@/server/claimant-session";

import { ClaimantAuthenticationRequired } from "@/components/ui/authentication-required";

import { DOCUMENT_KIND_LABEL, DOCUMENT_STATUS } from "@/domain/status";

import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
} from "@/components/ui/surface";

import { Badge, StatusBadge } from "@/components/ui/badge";

import { formatBytes, formatDate, plural } from "@/lib/format";

import { DocumentUpload } from "@/components/portal/document-upload";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";

import {
  listClaimDocumentRequests,
  listClaimDocuments,
} from "@/server/claim-document-store";

import { getPropertyById } from "@/server/opportunity-store";

export const metadata: Metadata = {
  title: "Documents",

  robots: {
    index: false,

    follow: false,
  },
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalDocumentsPage() {
  /*
   * Claimant identity continues to come from the server-side claimant session
   * boundary.
   *
   * The authentication implementation itself will be replaced during the
   * dedicated auth phase. This page does not accept a claimant ID from the URL.
   */
  const session = await resolveClaimantSession();

  if (!session) {
    return <ClaimantAuthenticationRequired />;
  }

  const conversions = await listOpportunityConversions();

  /*
   * Resolve only claims that are actually linked to the authenticated
   * claimant through persisted onboarding.
   */
  const claimRows = (
    await Promise.all(
      conversions.map(async (conversion) => {
        const resolved = await resolveClaimRecord(conversion.claimId);

        if (!resolved) {
          return undefined;
        }

        const claim = resolved.claim;

        const onboarding = await getClaimantOnboarding(claim.id);

        if (!onboarding || onboarding.claimant.id !== session.claimantId) {
          return undefined;
        }

        const [property, requests, documents] = await Promise.all([
          getPropertyById(claim.propertyId),

          listClaimDocumentRequests(claim.id),

          listClaimDocuments(claim.id),
        ]);

        return {
          claim,
          onboarding,
          property,
          requests,
          documents,
        };
      }),
    )
  ).flatMap((row) => (row ? [row] : []));

  /* ======================================================================== */
  /* Request rows                                                             */
  /* ======================================================================== */

  const requestRows = claimRows.flatMap((row) =>
    row.requests.map((request) => ({
      request,

      claim: row.claim,

      property: row.property,
    })),
  );

  const mine = requestRows.filter(
    ({ request }) =>
      request.requestedFromClaimantId === session.claimantId &&
      (request.status === "outstanding" || request.status === "overdue"),
  );

  const underReview = requestRows.filter(
    ({ request }) =>
      request.requestedFromClaimantId === session.claimantId &&
      request.status === "received",
  );

  const elsewhere = requestRows.filter(
    ({ request }) =>
      request.requestedFromClaimantId !== session.claimantId &&
      request.status !== "accepted" &&
      request.status !== "waived",
  );

  /* ======================================================================== */
  /* Document rows                                                            */
  /* ======================================================================== */

  const documentRows = claimRows.flatMap((row) =>
    row.documents
      /*
       * Portal visibility is intentionally conservative.
       *
       * A claimant sees only files explicitly linked to their claimant
       * identity or uploaded by that claimant. Staff-only claim documents
       * are not exposed simply because the claimant owns the claim.
       */
      .filter(
        (document) =>
          document.claimantId === session.claimantId ||
          document.uploadedByClaimantId === session.claimantId,
      )
      .map((document) => ({
        document,

        claim: row.claim,

        property: row.property,
      })),
  );

  const rejected = documentRows.filter(
    ({ document }) => document.status === "rejected",
  );

  /* ======================================================================== */
  /* Labels                                                                   */
  /* ======================================================================== */

  function claimLabel(claimId: string): string {
    const row = claimRows.find((candidate) => candidate.claim.id === claimId);

    if (!row) {
      return "Recovery claim";
    }

    if (row.property) {
      return row.property.address.line1;
    }

    return row.claim.reference;
  }

  return (
    <div className="space-y-8">
      {/* ================================================================ header */}
      <div>
        <h1 className="text-2xl sm:text-3xl">Documents</h1>

        <p className="mt-1.5 text-md text-ink-600">
          {mine.length > 0
            ? `${mine.length} ${plural(
                mine.length,
                "item",
              )} still needed from you.`
            : underReview.length > 0
              ? "Your submitted documents are being reviewed."
              : "You currently have no outstanding document requests."}
        </p>
      </div>

      {/* ======================================================== no claims */}
      {claimRows.length === 0 && (
        <EmptyState
          title="No claim documents yet"
          description="Document requirements will appear after a recovery claim is linked to your verified claimant profile."
        />
      )}

      {/* ================================================= rejected */}
      {rejected.length > 0 && (
        <Callout
          tone="critical"
          title={
            rejected.length === 1
              ? "A document needs to be replaced"
              : "Documents need to be replaced"
          }
          role="alert"
        >
          <div className="space-y-3">
            {rejected.map(({ document, claim }) => (
              <div key={document.id}>
                <p className="font-medium text-ink-900">{document.title}</p>

                <p className="mt-0.5 text-xs text-ink-500">
                  {claimLabel(claim.id)}
                </p>

                {document.rejectionReason && (
                  <p className="mt-1 text-sm text-critical-700">
                    {document.rejectionReason}
                  </p>
                )}
              </div>
            ))}

            <p className="text-sm">
              Upload a corrected replacement against the outstanding requirement
              below. The replacement still requires review before it satisfies
              the claim requirement.
            </p>
          </div>
        </Callout>
      )}

      {/* ================================================= needed from claimant */}
      {claimRows.length > 0 && (
        <section>
          <h2 className="text-xl">Needed from you</h2>

          {mine.length === 0 ? (
            <EmptyState
              compact
              className="mt-4"
              title="Nothing outstanding"
              description="No document request currently requires action from you."
            />
          ) : (
            <div className="mt-4 space-y-4">
              {mine.map(({ request, claim }) => (
                <Card key={request.id} elevated>
                  <CardHeader
                    eyebrow={claimLabel(claim.id)}
                    title={DOCUMENT_KIND_LABEL[request.kind]}
                    description={request.reason}
                    actions={
                      request.status === "overdue" ? (
                        <Badge tone="critical" size="md">
                          Overdue
                        </Badge>
                      ) : request.dueBy ? (
                        <Badge tone="caution" size="md">
                          By {formatDate(request.dueBy)}
                        </Badge>
                      ) : (
                        <Badge tone="caution" size="md">
                          Needed
                        </Badge>
                      )
                    }
                  />

                  <CardBody>
                    {request.guidance && (
                      <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                        <p className="text-sm font-medium text-ink-800">
                          How to prepare this document
                        </p>

                        <p className="mt-1 text-sm leading-relaxed text-ink-600">
                          {request.guidance}
                        </p>
                      </div>
                    )}

                    <div className={request.guidance ? "mt-4" : ""}>
                      <DocumentUpload
                        documentLabel={DOCUMENT_KIND_LABEL[request.kind]}
                      />
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ====================================================== under review */}
      {underReview.length > 0 && (
        <section>
          <h2 className="text-xl">Under review</h2>

          <p className="mt-1.5 text-md text-ink-600">
            These requirements have received a document but still need a review
            decision.
          </p>

          <Card className="mt-4">
            <CardBody flush>
              <ul className="divide-y divide-line-subtle">
                {underReview.map(({ request, claim }) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-medium text-ink-900">
                        {DOCUMENT_KIND_LABEL[request.kind]}
                      </p>

                      <p className="mt-0.5 text-xs text-ink-500">
                        {claimLabel(claim.id)}
                      </p>
                    </div>

                    <Badge tone="info" size="md">
                      Review pending
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {/* =============================================== handled elsewhere */}
      {elsewhere.length > 0 && (
        <section>
          <h2 className="text-xl">Being handled for you</h2>

          <p className="mt-1.5 text-md text-ink-600">
            These items are part of your claim, but they are not currently
            assigned to you for collection.
          </p>

          <Card className="mt-4">
            <CardBody flush>
              <ul className="divide-y divide-line-subtle">
                {elsewhere.map(({ request, claim }) => (
                  <li key={request.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-ink-900">
                          {DOCUMENT_KIND_LABEL[request.kind]}
                        </p>

                        <p className="mt-0.5 text-xs text-ink-500">
                          {claimLabel(claim.id)}
                        </p>
                      </div>

                      <Badge tone="neutral" size="md">
                        In progress
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {/* =========================================================== on file */}
      {claimRows.length > 0 && (
        <section>
          <h2 className="text-xl">On file</h2>

          {documentRows.length === 0 ? (
            <EmptyState
              compact
              className="mt-4"
              title="No claimant documents yet"
              description="Documents linked to your claimant profile will appear here after they are uploaded."
            />
          ) : (
            <Card className="mt-4">
              <CardBody flush>
                <ul className="divide-y divide-line-subtle">
                  {documentRows.map(({ document, claim }) => (
                    <li key={document.id} className="px-4 py-3.5 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-ink-900">
                            {document.title}
                          </p>

                          <p className="mt-0.5 text-xs text-ink-500">
                            {DOCUMENT_KIND_LABEL[document.kind]}

                            {" / "}

                            {claimLabel(claim.id)}

                            {document.uploadedAt && (
                              <>
                                {" / Added "}
                                {formatDate(document.uploadedAt.slice(0, 10))}
                              </>
                            )}

                            {" / "}

                            {formatBytes(document.byteSize)}

                            {document.pageCount && (
                              <>
                                {" / "}
                                {document.pageCount}{" "}
                                {plural(document.pageCount, "page")}
                              </>
                            )}
                          </p>

                          {document.rejectionReason && (
                            <p className="mt-1.5 text-sm text-critical-700">
                              {document.rejectionReason}
                            </p>
                          )}
                        </div>

                        <StatusBadge
                          status={DOCUMENT_STATUS[document.status]}
                          audience="claimant"
                          size="md"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </section>
      )}

      {/* ======================================================= security note */}
      {claimRows.length > 0 && (
        <Callout tone="neutral" title="Document privacy">
          <p>
            This portal does not expose a public file address for claim
            documents. Document metadata is shown only after the claim is
            matched to your server-side claimant session.
          </p>
        </Callout>
      )}
    </div>
  );
}