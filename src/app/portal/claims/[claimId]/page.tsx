
import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { resolveClaimantSession } from "@/server/claimant-session";

import { ClaimantAuthenticationRequired } from "@/components/ui/authentication-required";

import { resolveLegalPosition } from "@/domain/legal-position";

import {
  CLAIM_STATUS,
  CUSTODIAN_LABEL,
  DOCUMENT_KIND_LABEL,
  DOCUMENT_STATUS,
  FEE_MODEL_LABEL,
  SALE_TYPE_LABEL,
} from "@/domain/status";

import type { IsoDate } from "@/domain/types";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  Divider,
  GovernmentDisclosure,
  NotRecorded,
} from "@/components/ui/surface";

import { Badge, Identifier, StatusBadge } from "@/components/ui/badge";

import { Breadcrumbs } from "@/components/ui/tabs";

import { ButtonLink, TextLink } from "@/components/ui/button";

import { Amount, Money } from "@/components/ui/money";

import { IconArrowLeft, IconUpload } from "@/components/ui/icon";

import { formatBytes, formatDate, formatPhone, plural } from "@/lib/format";

import { resolveClaimRecord } from "@/server/claim-record";

import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";

import {
  listClaimDocuments,
  resolveClaimDocumentReadiness,
} from "@/server/claim-document-store";

import { getCurrentClaimFilingPackage } from "@/server/claim-filing-package-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import {
  getOpportunityById,
  getPropertyById,
} from "@/server/opportunity-store";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Metadata                                                                    */
/* ========================================================================== */

export const metadata: Metadata = {
  title: "Your claim",

  robots: {
    index: false,

    follow: false,
  },
};

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function stageLabel(stageKey: string): string {
  return stageKey
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function legalStatusCopy(lane: string): {
  tone: "positive" | "caution" | "counsel";

  title: string;

  body: string;
} {
  switch (lane) {
    case "administrative":
      return {
        tone: "positive",

        title: "Administrative recovery",

        body: "Duequity is currently handling this claim through the administrative recovery process permitted for this jurisdiction.",
      };

    case "legal_review":
      return {
        tone: "caution",

        title: "Legal review required",

        body: "This claim requires legal review before the next legal or filing step can proceed. Duequity can continue supporting research, documents and coordination.",
      };

    default:
      return {
        tone: "counsel",

        title: "Independent counsel required",

        body: "The legal portion of this claim requires independent licensed counsel. Duequity remains available for research, documents and operational coordination.",
      };
  }
}

function filingPackageLabel(
  status:
    | "prepared"
    | "under_review"
    | "pre_filing_approved"
    | "returned_for_changes"
    | "superseded",
): string {
  switch (status) {
    case "prepared":
      return "Package prepared";

    case "under_review":
      return "Under pre-filing review";

    case "pre_filing_approved":
      return "Pre-filing review approved";

    case "returned_for_changes":
      return "Changes required";

    case "superseded":
      return "Replaced by newer package";

    default:
      return status;
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalClaimDetailPage({
  params,
}: PageProps<"/portal/claims/[claimId]">) {
  const { claimId } = await params;

  /*
   * Claimant identity continues to come exclusively from the server-side
   * claimant session boundary.
   *
   * The browser cannot select another claimant with a query parameter.
   */
  const session = await resolveClaimantSession();

  if (!session) {
    return <ClaimantAuthenticationRequired />;
  }

  const resolved = await resolveClaimRecord(claimId);

  if (!resolved) {
    notFound();
  }

  const claim = resolved.claim;

  const onboarding = await getClaimantOnboarding(claim.id);

  /*
   * Fail closed.
   *
   * Knowing a claim ID is not enough to view a claim. The persisted onboarding
   * claimant must match the claimant authenticated by the session boundary.
   */
  if (!onboarding || onboarding.claimant.id !== session.claimantId) {
    notFound();
  }

  const [
    property,
    opportunity,
    jurisdictionPackages,
    documents,
    documentReadiness,
    filingPackage,
  ] = await Promise.all([
    getPropertyById(claim.propertyId),

    getOpportunityById(claim.opportunityId),

    listJurisdictionRulePackages(),

    listClaimDocuments(claim.id),

    resolveClaimDocumentReadiness(claim.id),

    getCurrentClaimFilingPackage(claim.id),
  ]);

  if (!property || !opportunity) {
    notFound();
  }

  if (
    opportunity.id !== claim.opportunityId ||
    opportunity.propertyId !== claim.propertyId ||
    opportunity.jurisdictionId !== claim.jurisdictionId
  ) {
    notFound();
  }

  const jurisdictionPackage = jurisdictionPackages.find(
    (rulePackage) =>
      rulePackage.status === "approved" &&
      rulePackage.rule?.id === claim.jurisdictionId,
  );

  const jurisdiction = jurisdictionPackage?.rule;

  if (!jurisdiction) {
    notFound();
  }

  const legal = resolveLegalPosition(claim, jurisdiction, currentIsoDate());

  const legalCopy = legalStatusCopy(legal.lane);

  const recovery = claim.confirmedRecovery ?? claim.estimatedRecovery;

  /*
   * Do not depend on a request row already having been synchronized.
   *
   * Every document kind required by the approved jurisdiction rule remains
   * outstanding until its persisted request points to accepted evidence.
   */
  const requiredDocumentViews = jurisdiction.requiredDocuments.map((kind) => {
    const request = documentReadiness.requiredRequests.find(
      (candidate) => candidate.kind === kind,
    );

    return {
      kind,

      request,

      complete: request?.status === "accepted",
    };
  });

  const outstandingDocuments = requiredDocumentViews.filter(
    (item) => !item.complete,
  );

  const acceptedDocuments = documents.filter(
    (document) => document.status === "accepted",
  );

  const propertyLocation = [
    property.address.city,
    property.address.county ? `${property.address.county} County` : undefined,
    property.address.state,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-8">
      {/* ================================================================ header */}
      <div>
        <Breadcrumbs
          trail={[
            {
              href: "/portal/claims",

              label: "Your claims",
            },
            {
              label: claim.reference,
            },
          ]}
        />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow text-ink-500">{propertyLocation}</p>

            <h1 className="mt-2 text-2xl sm:text-3xl">
              {property.address.line1}
            </h1>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <StatusBadge
                status={CLAIM_STATUS[claim.status]}
                audience="claimant"
                size="md"
              />

              <Identifier label="Claim">{claim.reference}</Identifier>

              {claim.agencyReference && (
                <Identifier label="Agency reference">
                  {claim.agencyReference}
                </Identifier>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================== claimant action */}
      {outstandingDocuments.length > 0 && (
        <Card elevated className="border-caution-200 bg-caution-50">
          <CardBody>
            <p className="eyebrow text-caution-700">Action needed from you</p>

            <p className="mt-2 text-lg font-semibold leading-snug text-ink-900">
              We still need {outstandingDocuments.length}{" "}
              {plural(outstandingDocuments.length, "document")} for this claim.
            </p>

            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              Your claim cannot complete its document readiness checks until
              each required item has been reviewed and accepted.
            </p>

            <ButtonLink
              href="/portal/documents"
              variant="primary"
              accent
              className="mt-4"
              leading={<IconUpload size={16} />}
            >
              Upload documents
            </ButtonLink>
          </CardBody>
        </Card>
      )}

      {/* ============================================================ two columns */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="min-w-0 space-y-8">
          {/* ------------------------------------------------ current status */}
          <Card>
            <CardHeader
              title="Where your claim stands"
              description="The current operational position of your recovery claim."
            />

            <CardBody>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-md border border-line bg-inset px-4 py-4">
                  <p className="eyebrow text-ink-500">Stage</p>

                  <p className="mt-1.5 text-base font-semibold text-ink-900">
                    {stageLabel(claim.stageKey)}
                  </p>
                </div>

                <div className="rounded-md border border-line bg-inset px-4 py-4">
                  <p className="eyebrow text-ink-500">Documents</p>

                  {outstandingDocuments.length === 0 ? (
                    <div className="mt-1.5">
                      <Badge tone="positive">Current</Badge>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-base font-semibold text-caution-800">
                      {outstandingDocuments.length} outstanding
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-line bg-inset px-4 py-4">
                  <p className="eyebrow text-ink-500">Filing package</p>

                  <p className="mt-1.5 text-sm font-semibold text-ink-900">
                    {filingPackage
                      ? filingPackageLabel(filingPackage.status)
                      : "Not yet prepared"}
                  </p>
                </div>
              </div>

              {claim.filingDeadline && (
                <p className="mt-4 text-sm text-ink-600">
                  Recorded filing deadline:{" "}
                  <span className="font-semibold text-ink-900">
                    {formatDate(claim.filingDeadline)}
                  </span>
                </p>
              )}
            </CardBody>
          </Card>

          {/* ------------------------------------------------ legal handling */}
          <Callout tone={legalCopy.tone} title={legalCopy.title}>
            <p>{legalCopy.body}</p>

            {legal.lane === "attorney_required" && (
              <p className="mt-2">
                Duequity does not provide legal representation and does not
                share in attorney fees.
              </p>
            )}
          </Callout>

          {/* ---------------------------------------------------- documents */}
          <Card>
            <CardHeader
              title="Documents"
              description={
                outstandingDocuments.length > 0
                  ? `${outstandingDocuments.length} ${plural(
                      outstandingDocuments.length,
                      "item",
                    )} still required.`
                  : "All jurisdiction-required document types currently have accepted evidence."
              }
              actions={
                <ButtonLink
                  href="/portal/documents"
                  size="sm"
                  leading={<IconUpload size={14} />}
                >
                  Upload
                </ButtonLink>
              }
            />

            <CardBody>
              {requiredDocumentViews.length > 0 ? (
                <div className="space-y-3">
                  <p className="eyebrow text-ink-500">
                    Required for this claim
                  </p>

                  {requiredDocumentViews.map((item) => (
                    <div
                      key={item.kind}
                      className={
                        item.complete
                          ? "flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent-200 bg-accent-50 px-3.5 py-3"
                          : "flex flex-wrap items-center justify-between gap-3 rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3"
                      }
                    >
                      <p className="text-sm font-medium text-ink-900">
                        {DOCUMENT_KIND_LABEL[item.kind]}
                      </p>

                      <Badge tone={item.complete ? "positive" : "caution"}>
                        {item.complete ? "Accepted" : "Needed"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-500">
                  No required document types are recorded for this jurisdiction.
                </p>
              )}

              {documents.length > 0 && (
                <>
                  <Divider className="my-5" />

                  <p className="eyebrow text-ink-500">Documents on file</p>

                  <ul className="mt-2.5 divide-y divide-line-subtle">
                    {documents.map((document) => (
                      <li
                        key={document.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-base text-ink-900">
                            {document.title}
                          </p>

                          <p className="mt-0.5 text-xs text-ink-500">
                            {DOCUMENT_KIND_LABEL[document.kind]}

                            {document.uploadedAt && (
                              <>
                                {" / Added "}
                                {formatDate(document.uploadedAt.slice(0, 10))}
                              </>
                            )}

                            {" / "}
                            {formatBytes(document.byteSize)}
                          </p>

                          {document.rejectionReason && (
                            <p className="mt-1 text-sm text-critical-700">
                              {document.rejectionReason}
                            </p>
                          )}
                        </div>

                        <StatusBadge
                          status={DOCUMENT_STATUS[document.status]}
                          audience="claimant"
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {documents.length === 0 && requiredDocumentViews.length === 0 && (
                <p className="text-md text-ink-500">
                  No documents have been added to this claim yet.
                </p>
              )}

              {acceptedDocuments.length > 0 && (
                <p className="mt-4 text-xs text-ink-500">
                  {acceptedDocuments.length} accepted{" "}
                  {plural(acceptedDocuments.length, "document")} currently on
                  file.
                </p>
              )}
            </CardBody>
          </Card>

          {/* ---------------------------------------------------- amount */}
          <Card>
            <CardHeader
              title="Recovery amount"
              description="Duequity keeps estimated and agency-confirmed recovery values separate."
            />

            <CardBody>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <Money fact={claim.estimatedRecovery} size="xl" />

                  <p className="mt-2 text-sm leading-relaxed text-ink-600">
                    {claim.estimatedRecovery.basis}
                  </p>
                </div>

                <div className="border-t border-line pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                  {claim.confirmedRecovery ? (
                    <>
                      <Money fact={claim.confirmedRecovery} size="xl" />

                      <p className="mt-2 text-sm leading-relaxed text-ink-600">
                        {claim.confirmedRecovery.basis}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="eyebrow text-ink-400">Confirmed</p>

                      <p className="mt-1 text-lg text-ink-400">
                        Not yet confirmed
                      </p>

                      <p className="mt-2 text-sm leading-relaxed text-ink-600">
                        Until the custodian confirms the amount, the recovery
                        estimate should be treated as provisional.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {claim.feeAgreement && (
                <>
                  <Divider className="my-6" />

                  <p className="eyebrow text-ink-500">Your service agreement</p>

                  <DataList columns={2} className="mt-2.5">
                    <DataItem label="Fee model">
                      {FEE_MODEL_LABEL[claim.feeAgreement.model]}
                    </DataItem>

                    <DataItem label="Rate">
                      {claim.feeAgreement.percentage !== undefined ? (
                        `${(claim.feeAgreement.percentage * 100).toFixed(
                          1,
                        )}% of the recovery`
                      ) : claim.feeAgreement.flatAmount !== undefined ? (
                        <Amount
                          cents={claim.feeAgreement.flatAmount}
                          size="sm"
                        />
                      ) : (
                        <NotRecorded />
                      )}
                    </DataItem>

                    {claim.feeAgreement.capAmount !== undefined && (
                      <DataItem label="Maximum fee">
                        <Amount
                          cents={claim.feeAgreement.capAmount}
                          size="sm"
                        />
                      </DataItem>
                    )}

                    {claim.feeAgreement.signedAt && (
                      <DataItem label="Signed">
                        {formatDate(claim.feeAgreement.signedAt)}
                      </DataItem>
                    )}

                    {claim.feeAgreement.cancellationDeadline && (
                      <DataItem label="Cancellation deadline">
                        {formatDate(claim.feeAgreement.cancellationDeadline)}
                      </DataItem>
                    )}
                  </DataList>

                  <p className="mt-3 text-sm leading-relaxed text-ink-600">
                    Duequity does not take ownership of your surplus and is not
                    the recipient of agency or court disbursements.
                  </p>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ============================================================ sidebar */}
        <aside className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Claim information" />

            <CardBody>
              <DataList>
                <DataItem label="Claim reference">
                  <Identifier>{claim.reference}</Identifier>
                </DataItem>

                <DataItem label="Current stage">
                  {stageLabel(claim.stageKey)}
                </DataItem>

                <DataItem label="Opened">
                  {formatDate(claim.createdAt)}
                </DataItem>

                <DataItem label="Recovery value">
                  <span className="font-semibold text-ink-900">
                    <Amount cents={recovery.amount} size="sm" />
                  </span>
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Who holds the funds" />

            <CardBody>
              <DataList>
                <DataItem label="Agency">{jurisdiction.agencyName}</DataItem>

                <DataItem label="Type">
                  {CUSTODIAN_LABEL[claim.custodian]}
                </DataItem>

                {jurisdiction.agencyPhone && (
                  <DataItem label="Telephone">
                    <a
                      href={`tel:+1${jurisdiction.agencyPhone}`}
                      className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                    >
                      {formatPhone(jurisdiction.agencyPhone)}
                    </a>
                  </DataItem>
                )}

                {claim.submittedAt && (
                  <DataItem label="Filed">
                    {formatDate(claim.submittedAt)}
                  </DataItem>
                )}

                {claim.filingDeadline && (
                  <DataItem label="Recorded deadline">
                    {formatDate(claim.filingDeadline)}
                  </DataItem>
                )}
              </DataList>

              <p className="mt-3 text-xs leading-relaxed text-ink-500">
                You may contact the custodian directly at any time. See{" "}
                <TextLink
                  href={`/states/${jurisdiction.state.toLowerCase()}/${(
                    jurisdiction.county ?? "statewide"
                  )
                    .toLowerCase()
                    .replace(/['’]/g, "")
                    .replace(/[^a-z0-9]+/g, "-")}`}
                  className="text-xs"
                >
                  how claims work here
                </TextLink>
                .
              </p>
            </CardBody>
          </Card>

          <Card inset>
            <CardBody>
              <p className="eyebrow text-ink-500">The property</p>

              <DataList className="mt-2">
                <DataItem label="Sale type">
                  {SALE_TYPE_LABEL[opportunity.sale.saleType]}
                </DataItem>

                <DataItem label="Sale date">
                  {formatDate(opportunity.sale.saleDate)}
                </DataItem>

                {opportunity.sale.caseNumber && (
                  <DataItem label="Case number">
                    <Identifier>{opportunity.sale.caseNumber}</Identifier>
                  </DataItem>
                )}

                <DataItem label="Parcel number">
                  {property.parcelNumber ? (
                    <Identifier>{property.parcelNumber}</Identifier>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Legal basis">{claim.legalBasis}</DataItem>
              </DataList>
            </CardBody>
          </Card>

          <GovernmentDisclosure agencyName={jurisdiction.agencyName} />

          <ButtonLink
            href="/portal/claims"
            block
            variant="quiet"
            leading={<IconArrowLeft size={16} />}
          >
            All claims
          </ButtonLink>
        </aside>
      </div>
    </div>
  );
}