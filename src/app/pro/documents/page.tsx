import type { Metadata } from "next";

import Link from "next/link";

import { DOCUMENT_KIND_LABEL, DOCUMENT_STATUS } from "@/domain/status";

import {
  Card,
  CardBody,
  CardHeader,
  Callout,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import { Badge, StatusBadge, Tag } from "@/components/ui/badge";

import { formatBytes, formatCount, formatDate, plural } from "@/lib/format";

import { can } from "@/lib/session";

import { resolveStaffSession } from "@/server/staff-session";

import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

import {
  listClaimDocumentRequests,
  listClaimDocuments,
} from "@/server/claim-document-store";

import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { getPropertyById } from "@/server/opportunity-store";

export const metadata: Metadata = {
  title: "Documents",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProDocumentsPage() {
  const session = await resolveStaffSession();

  if (!session) {
    return <StaffAuthenticationRequired />;
  }

  const canReadRestricted = can(session, "document.read_restricted");

  const canReview = can(session, "document.review");

  const conversions = await listOpportunityConversions();

  const claimRows = (
    await Promise.all(
      conversions.map(async (conversion) => {
        const resolved = await resolveClaimRecord(conversion.claimId);

        if (!resolved) {
          return undefined;
        }

        const claim = resolved.claim;

        const [property, onboarding, documents, requests] = await Promise.all([
          getPropertyById(claim.propertyId),

          getClaimantOnboarding(claim.id),

          listClaimDocuments(claim.id),

          listClaimDocumentRequests(claim.id),
        ]);

        return {
          claim,
          property,
          onboarding,
          documents,
          requests,
        };
      }),
    )
  ).flatMap((row) => (row ? [row] : []));

  /* ======================================================================== */
  /* Flatten persisted document records                                       */
  /* ======================================================================== */

  const documentRows = claimRows.flatMap((row) =>
    row.documents.map((document) => ({
      document,
      claim: row.claim,
      property: row.property,
      onboarding: row.onboarding,
    })),
  );

  const requestRows = claimRows.flatMap((row) =>
    row.requests.map((request) => ({
      request,
      claim: row.claim,
      property: row.property,
      onboarding: row.onboarding,
    })),
  );

  const awaitingReview = documentRows.filter(
    ({ document }) =>
      document.status !== "accepted" && document.status !== "rejected",
  );

  const rejected = documentRows.filter(
    ({ document }) => document.status === "rejected",
  );

  const outstanding = requestRows.filter(
    ({ request }) => request.status !== "accepted",
  );

  const claimsAffected = new Set(outstanding.map(({ claim }) => claim.id)).size;

  const requiredCount = requestRows.length;

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Work</p>

          <h1 className="mt-1.5 text-2xl">Documents</h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Persisted document review queue and outstanding claim requirements.
            File contents are not rendered on this register. Review decisions
            remain attached to the individual claim workflow.
          </p>
        </div>
      </div>

      {/* ================================================================= stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Awaiting review"
          value={formatCount(awaitingReview.length)}
          tone={awaitingReview.length > 0 ? "caution" : "positive"}
          context="Uploaded but not yet accepted or rejected"
        />

        <Stat
          label="Rejected"
          value={formatCount(rejected.length)}
          tone={rejected.length > 0 ? "critical" : "positive"}
          context="Replacement evidence is required"
        />

        <Stat
          label="Requests outstanding"
          value={formatCount(outstanding.length)}
          context={`${formatCount(requiredCount)} persisted ${plural(
            requiredCount,
            "requirement",
          )}`}
        />

        <Stat
          label="Claims affected"
          value={formatCount(claimsAffected)}
          tone={claimsAffected > 0 ? "caution" : "positive"}
          context="Claims with incomplete document requirements"
        />
      </div>

      {/* =========================================================== permissions */}
      {!canReadRestricted && (
        <Callout
          tone="neutral"
          title="Restricted document access is not available to your role"
        >
          <p>
            Sensitive document metadata may be visible for workflow purposes,
            but restricted file contents require the appropriate document access
            permission.
          </p>
        </Callout>
      )}

      {!canReview && (
        <Callout
          tone="neutral"
          title="Document review is read-only for your role"
        >
          <p>
            You can see the persisted document queue, but accepting or rejecting
            evidence requires the document.review permission.
          </p>
        </Callout>
      )}

      {/* ======================================================= awaiting review */}
      <Card>
        <CardHeader
          title="Awaiting review"
          description="Documents uploaded to persisted claims that have not yet received a final review decision."
        />

        <CardBody flush>
          {awaitingReview.length === 0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="Review queue clear"
              description="No persisted documents are waiting for review."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {awaitingReview.map(
                ({ document, claim, property, onboarding }) => (
                  <li key={document.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-ink-900">
                          {document.title}
                        </p>

                        <p className="mt-0.5 text-xs text-ink-500">
                          {DOCUMENT_KIND_LABEL[document.kind]}

                          {" / "}

                          {formatBytes(document.byteSize)}

                          {document.uploadedAt && (
                            <>
                              {" / uploaded "}
                              {formatDate(document.uploadedAt.slice(0, 10))}
                            </>
                          )}
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                          <Link
                            href={`/pro/claims/${claim.id}`}
                            className="font-mono text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                          >
                            {claim.reference}
                          </Link>

                          {property && (
                            <span>
                              {property.address.line1}, {property.address.state}
                            </span>
                          )}

                          {onboarding && (
                            <span>
                              Claimant: {onboarding.claimant.legalName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <StatusBadge
                          status={DOCUMENT_STATUS[document.status]}
                        />

                        <Tag>Persisted</Tag>

                        {!canReview && (
                          <Badge tone="neutral">Review not permitted</Badge>
                        )}
                      </div>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ============================================================= rejected */}
      {rejected.length > 0 && (
        <Card>
          <CardHeader
            title="Rejected documents"
            description="Documents that failed review and require replacement or correction."
          />

          <CardBody flush>
            <ul className="divide-y divide-line-subtle">
              {rejected.map(({ document, claim, property }) => (
                <li
                  key={document.id}
                  className="px-4 py-3.5 shadow-[inset_2px_0_0_0_var(--color-critical-600)] sm:px-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-medium text-ink-900">
                        {document.title}
                      </p>

                      {document.rejectionReason && (
                        <p className="mt-1 text-sm text-critical-700">
                          {document.rejectionReason}
                        </p>
                      )}

                      <p className="mt-1.5 text-xs text-ink-500">
                        <Link
                          href={`/pro/claims/${claim.id}`}
                          className="font-mono text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                        >
                          {claim.reference}
                        </Link>

                        {property && (
                          <>
                            {" / "}
                            {property.address.line1}, {property.address.state}
                          </>
                        )}

                        {document.reviewedAt && (
                          <>
                            {" / reviewed "}
                            {formatDate(document.reviewedAt.slice(0, 10))}
                          </>
                        )}
                      </p>
                    </div>

                    <StatusBadge status={DOCUMENT_STATUS[document.status]} />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* ================================================= outstanding requests */}
      <Card>
        <CardHeader
          title="Outstanding requests"
          description={`${formatCount(outstanding.length)} ${plural(
            outstanding.length,
            "document requirement",
          )} remain incomplete across persisted claims.`}
        />

        <CardBody flush>
          {outstanding.length === 0 ? (
            <EmptyState
              compact
              className="m-4 border-0 bg-transparent"
              title="No outstanding requests"
              description="Every persisted document requirement currently points to accepted evidence."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {outstanding.map(({ request, claim, property, onboarding }) => (
                <li key={request.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-medium text-ink-900">
                          {DOCUMENT_KIND_LABEL[request.kind]}
                        </p>

                        <Badge tone="caution">Required</Badge>

                        {request.requestedFromClaimantId ? (
                          <Tag>From claimant</Tag>
                        ) : (
                          <Tag>Internal</Tag>
                        )}
                      </div>

                      <p className="mt-1.5 text-xs text-ink-500">
                        <Link
                          href={`/pro/claims/${claim.id}`}
                          className="font-mono text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                        >
                          {claim.reference}
                        </Link>

                        {property && (
                          <>
                            {" / "}
                            {property.address.line1}, {property.address.state}
                          </>
                        )}

                        {onboarding && request.requestedFromClaimantId && (
                          <>
                            {" / "}
                            {onboarding.claimant.legalName}
                          </>
                        )}
                      </p>
                    </div>

                    <Badge tone="caution">Outstanding</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ============================================================ local note */}
      <Callout tone="neutral" title="Current storage boundary">
        <p>
          The validation build persists document metadata and files locally.
          Before production deployment, file storage must move to durable
          private object storage with authenticated access, malware scanning,
          retention controls and audited delivery. This register intentionally
          does not create a public file URL.
        </p>
      </Callout>
    </div>
  );
}