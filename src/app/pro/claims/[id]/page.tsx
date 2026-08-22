import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  assessDeadline,
  computeFee,
  evaluateIntakeGate,
  jurisdictionLabel,
} from "@/domain/compliance";
import { resolveLegalPosition } from "@/domain/legal-position";
import {
  CLAIM_STATUS,
  COMPLIANCE_STATUS,
  CUSTODIAN_LABEL,
  FEE_MODEL_LABEL,
  SALE_TYPE_LABEL,
} from "@/domain/status";
import type { IsoDate, Jurisdiction } from "@/domain/types";

import { ClaimantOnboardingPanel } from "@/components/pro/claimant-onboarding-panel";
import { ClaimDocumentsPanel } from "@/components/pro/claim-documents-panel";
import { ClaimFilingPackagePanel } from "@/components/pro/claim-filing-package-panel";
import { Badge, Identifier, StatusBadge, Tag } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LegalLaneBadge } from "@/components/ui/legal-lane";
import { Amount, FigureRow, Money } from "@/components/ui/money";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  Divider,
} from "@/components/ui/surface";
import { Breadcrumbs } from "@/components/ui/tabs";

import { formatCents, formatDate, formatTimestamp } from "@/lib/format";

import { getCommercialApprovalByQuoteId } from "@/server/commercial-approval-store";
import { resolvePersistedClaimFilingReadiness } from "@/server/claim-filing-readiness";
import { resolveClaimRecord } from "@/server/claim-record";
import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";
import { getOpportunityConversionByClaimId } from "@/server/opportunity-conversion-store";
import {
  getOpportunityById,
  getPropertyById,
} from "@/server/opportunity-store";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "Not recorded";
  }

  const percent = value * 100;

  return Number.isInteger(percent)
    ? `${percent.toFixed(0)}%`
    : `${percent.toFixed(1)}%`;
}

function stageLabel(stageKey: string): string {
  return stageKey
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* ========================================================================== */
/* Metadata                                                                    */
/* ========================================================================== */

export async function generateMetadata({
  params,
}: PageProps<"/pro/claims/[id]">): Promise<Metadata> {
  const session = await resolveStaffSession();

  if (!session) {
    return {
      title: "Claim",
    };
  }

  const { id } = await params;

  const resolved = await resolveClaimRecord(id);

  return {
    title: resolved?.claim.reference ?? "Claim",
  };
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProClaimDetailPage({
  params,
}: PageProps<"/pro/claims/[id]">) {
  /*
   * Server-side session gate.
   *
   * Resolved before any store read. The layout also withholds the operations
   * shell, but layout and page render in parallel, so the page must refuse to
   * read operational data on its own account.
   */
  if (!(await resolveStaffSession())) {
    return <StaffAuthenticationRequired />;
  }

  const { id } = await params;

  const resolved = await resolveClaimRecord(id);

  if (!resolved) {
    notFound();
  }

  const claim = resolved.claim;

  const conversion = await getOpportunityConversionByClaimId(claim.id);

  if (!conversion) {
    notFound();
  }

  const [approval, opportunity, property, jurisdictionPackages] =
    await Promise.all([
      getCommercialApprovalByQuoteId(conversion.commercialQuoteId),

      getOpportunityById(claim.opportunityId),

      getPropertyById(claim.propertyId),

      listJurisdictionRulePackages(),
    ]);

  if (
    !approval ||
    approval.approvalStatus !== "locked" ||
    !opportunity ||
    !property
  ) {
    notFound();
  }

  const jurisdictionPackage = jurisdictionPackages.find(
    (rulePackage) =>
      rulePackage.status === "approved" &&
      rulePackage.rule?.id === claim.jurisdictionId,
  );

  const jurisdiction: Jurisdiction | undefined = jurisdictionPackage?.rule;

  if (!jurisdiction) {
    notFound();
  }

  const today = currentIsoDate();

  const deadline = assessDeadline(claim.filingDeadline, today);

  const legal = resolveLegalPosition(claim, jurisdiction, today);

  const gate = evaluateIntakeGate(jurisdiction);

  const value = claim.confirmedRecovery ?? claim.estimatedRecovery;

  const quote = approval.quoteSnapshot;

  const feeCheck = claim.feeAgreement
    ? computeFee(
        jurisdiction,
        {
          model: claim.feeAgreement.model,

          percentage: claim.feeAgreement.percentage,

          flatAmount: claim.feeAgreement.flatAmount,
        },
        value.amount,
      )
    : undefined;

  const filingReadiness = await resolvePersistedClaimFilingReadiness(
    claim,
    jurisdiction,
    today,
  );

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div>
        <Breadcrumbs
          trail={[
            {
              href: "/pro/claims",
              label: "Claims",
            },
            {
              label: claim.reference,
            },
          ]}
        />

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Identifier>{claim.reference}</Identifier>

              <StatusBadge status={CLAIM_STATUS[claim.status]} size="md" />

              <LegalLaneBadge lane={legal.lane} size="md" />

              <Badge tone="positive" size="md">
                Converted claim
              </Badge>

              <Badge tone="positive" size="md">
                Pricing locked
              </Badge>
            </div>

            <h1 className="mt-2 text-2xl">{property.address.line1}</h1>

            <p className="mt-1 text-sm text-ink-600">
              {property.address.city}, {property.address.county} County,{" "}
              {property.address.state} / {jurisdiction.agencyName}
            </p>
          </div>
        </div>
      </div>

      {/* ===================================================== headline figures */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <Money fact={value} size="xl" />

            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              {value.basis}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="eyebrow text-ink-500">Filing deadline</p>

            <p className="mt-1.5 tnum text-xl font-semibold text-ink-900">
              {claim.filingDeadline
                ? formatDate(claim.filingDeadline)
                : "Not recorded"}
            </p>

            <p
              className={
                deadline.risk === "expired" || deadline.risk === "critical"
                  ? "mt-1 text-xs font-medium text-critical-700"
                  : deadline.risk === "elevated"
                    ? "mt-1 text-xs text-caution-700"
                    : "mt-1 text-xs text-ink-500"
              }
            >
              {deadline.label}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="eyebrow text-ink-500">Stage</p>

            <p className="mt-1.5 text-base font-semibold text-ink-900">
              {stageLabel(claim.stageKey)}
            </p>

            <p className="mt-1 text-xs text-ink-500">
              Current operational stage
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="eyebrow text-ink-500">Locked Duequity fee</p>

            <p className="mt-1.5 tnum text-xl font-semibold text-ink-900">
              {formatCents(quote.projectedFee)}
            </p>

            <p className="mt-1 text-xs text-ink-500">
              {quote.selectedPercentage !== undefined
                ? `${formatPercent(quote.selectedPercentage)} approved rate`
                : FEE_MODEL_LABEL[quote.model]}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* ========================================================== provenance */}
      <Callout tone="positive" title="Persistent claim created">
        <p>
          This claim was created from{" "}
          <Link
            href={`/pro/opportunities/${opportunity.id}`}
            className="font-semibold text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
          >
            {opportunity.reference}
          </Link>
          .
        </p>

        <p className="mt-2">
          The exact approved commercial pricing snapshot remains locked to this
          claim. Refreshing the browser does not recreate or recalculate the
          approved terms.
        </p>

        <p className="mt-2 text-xs text-ink-600">
          Converted {formatTimestamp(conversion.convertedAt)}
        </p>
      </Callout>

      {/* ================================================================= body */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          {/* ------------------------------------------------ overview */}
          <Card>
            <CardHeader
              title="Claim overview"
              description="Operational claim record created from the approved opportunity conversion."
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Claim reference">
                  <Identifier>{claim.reference}</Identifier>
                </DataItem>

                <DataItem label="Originating opportunity">
                  <Link
                    href={`/pro/opportunities/${opportunity.id}`}
                    className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                  >
                    {opportunity.reference}
                  </Link>
                </DataItem>

                <DataItem label="Sale">
                  {SALE_TYPE_LABEL[opportunity.sale.saleType]}

                  <span className="ml-2 text-sm text-ink-500">
                    {formatDate(opportunity.sale.saleDate)}
                  </span>
                </DataItem>

                <DataItem label="Custodian">
                  {CUSTODIAN_LABEL[claim.custodian]}
                </DataItem>

                <DataItem label="Agency">{jurisdiction.agencyName}</DataItem>

                <DataItem label="Assignment">
                  {claim.assignedSpecialistId ? (
                    <Identifier>{claim.assignedSpecialistId}</Identifier>
                  ) : (
                    "Unassigned"
                  )}
                </DataItem>

                <DataItem label="Legal basis" span>
                  {claim.legalBasis}
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          {/* -------------------------------------------- commercial pricing */}
          <Card>
            <CardHeader
              title="Locked commercial pricing"
              description="The exact approved quote snapshot carried forward from the opportunity."
              actions={
                <Badge tone="positive" size="md">
                  Locked
                </Badge>
              }
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Fee model">
                  {FEE_MODEL_LABEL[quote.model]}
                </DataItem>

                <DataItem label="Approved pricing rate">
                  {quote.selectedPercentage !== undefined ? (
                    <span className="font-semibold text-ink-900">
                      {formatPercent(quote.selectedPercentage)}
                    </span>
                  ) : quote.projectedFee > 0 ? (
                    formatCents(quote.projectedFee)
                  ) : (
                    "No fee"
                  )}
                </DataItem>

                <DataItem label="Recovery basis">
                  <span className="font-medium text-ink-900">
                    {quote.recoveryBasis === "confirmed"
                      ? "Confirmed"
                      : "Estimated"}{" "}
                    {formatCents(quote.recoveryAmount)}
                  </span>
                </DataItem>

                <DataItem label="Commercial policy">
                  Version {quote.commercialPolicyVersion}
                  <span className="mt-0.5 block font-mono text-2xs text-ink-500">
                    {quote.commercialPolicyId}
                  </span>
                </DataItem>

                <DataItem label="Legal percentage ceiling snapshot">
                  {quote.legalFeeCapPercentSnapshot !== undefined
                    ? formatPercent(quote.legalFeeCapPercentSnapshot)
                    : "No percentage ceiling recorded"}
                </DataItem>

                <DataItem label="Legal amount ceiling snapshot">
                  {quote.legalFeeCapAmountSnapshot !== undefined
                    ? formatCents(quote.legalFeeCapAmountSnapshot)
                    : "No amount ceiling recorded"}
                </DataItem>

                <DataItem label="Approved by">
                  {approval.approvedByUserId ? (
                    <Identifier>{approval.approvedByUserId}</Identifier>
                  ) : (
                    "Not recorded"
                  )}
                </DataItem>

                <DataItem label="Locked">
                  {approval.lockedAt
                    ? formatTimestamp(approval.lockedAt)
                    : "Not recorded"}
                </DataItem>
              </DataList>

              <Divider className="my-5" />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line bg-inset px-4 py-4">
                  <p className="eyebrow text-ink-500">Duequity fee</p>

                  <p className="mt-1.5 tnum text-2xl font-semibold text-ink-900">
                    {formatCents(quote.projectedFee)}
                  </p>
                </div>

                <div className="rounded-md border border-line bg-inset px-4 py-4">
                  <p className="eyebrow text-ink-500">Projected claimant net</p>

                  <p className="mt-1.5 tnum text-2xl font-semibold text-ink-900">
                    {formatCents(quote.projectedClaimantNet)}
                  </p>
                </div>
              </div>

              <DataList columns={2} className="mt-5">
                <DataItem label="Commercial quote">
                  <Identifier>{conversion.commercialQuoteId}</Identifier>
                </DataItem>

                <DataItem label="Fee agreement record">
                  <Identifier>{conversion.feeAgreementId}</Identifier>
                </DataItem>

                <DataItem label="Snapshot integrity" span>
                  <span className="break-all font-mono text-xs text-ink-600">
                    {conversion.commercialSnapshotHash}
                  </span>
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          {/* -------------------------------------------- claimant onboarding */}
          <Card>
            <CardHeader
              title="Claimant onboarding"
              description="Persisted claimant linkage, identity verification, disclosures and service agreement workflow."
            />

            <CardBody>
              <ClaimantOnboardingPanel claimId={claim.id} />
            </CardBody>
          </Card>

          {/* -------------------------------------------- agency documents */}
          <Card>
            <CardHeader
              title="Agency documents"
              description="Jurisdiction-required claim documents, persisted uploads and human review decisions."
              actions={
                <Badge
                  tone={
                    filingReadiness.agencyDocumentsComplete
                      ? "positive"
                      : "caution"
                  }
                  size="md"
                >
                  {filingReadiness.agencyDocumentsComplete
                    ? "Complete"
                    : "Required"}
                </Badge>
              }
            />

            <CardBody>
              <ClaimDocumentsPanel claimId={claim.id} />
            </CardBody>
          </Card>

          {/* -------------------------------------------- legal handling */}
          <Card>
            <CardHeader
              title="Legal handling"
              description="Legal lane derived from the current claim record and approved jurisdiction rule."
              actions={<LegalLaneBadge lane={legal.lane} size="md" />}
            />

            <CardBody>
              <Callout
                tone={
                  legal.lane === "administrative"
                    ? "positive"
                    : legal.lane === "legal_review"
                      ? "caution"
                      : "counsel"
                }
              >
                <p>{legal.rationale}</p>
              </Callout>

              <DataList columns={2} className="mt-4">
                <DataItem label="Jurisdiction">
                  {jurisdictionLabel(jurisdiction)}
                </DataItem>

                <DataItem label="Attorney required">
                  {legal.attorneyRequired || jurisdiction.attorneyRequired ? (
                    <Badge tone="counsel">Yes</Badge>
                  ) : (
                    "No"
                  )}
                </DataItem>

                <DataItem label="Compliance status">
                  <StatusBadge
                    status={COMPLIANCE_STATUS[jurisdiction.complianceStatus]}
                  />
                </DataItem>

                <DataItem label="Intake gate">
                  <Badge
                    tone={
                      gate.outcome === "permitted"
                        ? "positive"
                        : gate.outcome === "conditional"
                          ? "counsel"
                          : "critical"
                    }
                  >
                    {gate.summary}
                  </Badge>
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          {/* -------------------------------------------- fee validation */}
          <Card>
            <CardHeader
              title="Fee validation"
              description="The locked case-specific fee is independently checked against the currently approved jurisdiction rule."
            />

            <CardBody>
              {feeCheck ? (
                <>
                  <FigureRow label="Recovery">
                    <Amount cents={value.amount} />
                  </FigureRow>

                  <FigureRow label="Locked Duequity fee" sign="subtract">
                    <Amount cents={feeCheck.fee} tone="negative" />
                  </FigureRow>

                  <FigureRow label="Projected claimant net" emphasis>
                    <Amount cents={feeCheck.netToClaimant} tone="positive" />
                  </FigureRow>

                  <p className="mt-3 text-xs leading-relaxed text-ink-600">
                    {feeCheck.basis}
                  </p>
                </>
              ) : (
                <Callout tone="critical">
                  <p>
                    The locked pricing terms could not be independently
                    validated.
                  </p>
                </Callout>
              )}
            </CardBody>
          </Card>

          {/* -------------------------------------------- filing readiness */}
          <Card>
            <CardHeader
              title="Filing readiness"
              description="Live readiness derived from persisted onboarding, jurisdiction, legal handling, deadline and document controls."
              actions={
                filingReadiness.readyToPrepare ? (
                  <Badge tone="positive" size="md">
                    Ready to prepare
                  </Badge>
                ) : (
                  <Badge tone="caution" size="md">
                    {filingReadiness.outstandingControlCount} outstanding
                  </Badge>
                )
              }
            />

            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-inset px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {filingReadiness.completedControlCount} of{" "}
                    {filingReadiness.controls.length} readiness controls
                    complete
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    A control only passes when its own persisted evidence is
                    present.
                  </p>
                </div>

                <Badge
                  tone={filingReadiness.readyToPrepare ? "positive" : "caution"}
                  size="md"
                >
                  {filingReadiness.readyToPrepare
                    ? "All controls passed"
                    : "Not ready"}
                </Badge>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {filingReadiness.controls.map((control) => (
                  <div
                    key={control.key}
                    className={
                      control.complete
                        ? "rounded-md border border-accent-200 bg-accent-50 px-3.5 py-3"
                        : "rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3"
                    }
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={
                          control.complete
                            ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-600 text-[11px] font-bold text-white"
                            : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-caution-300 bg-white text-[11px] font-bold text-caution-700"
                        }
                      >
                        {control.complete ? "✓" : "!"}
                      </span>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900">
                          {control.label}
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-ink-600">
                          {control.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Divider className="my-5" />

              <p className="eyebrow text-ink-500">
                Jurisdiction-required document types
              </p>

              {filingReadiness.requiredDocumentKinds.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {filingReadiness.requiredDocumentKinds.map((kind) => (
                    <Tag key={kind}>{kind.replaceAll("_", " ")}</Tag>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-500">
                  No required document types are recorded.
                </p>
              )}

              <Callout
                tone={filingReadiness.readyToPrepare ? "positive" : "info"}
                className="mt-5"
              >
                <p>
                  <span className="font-semibold text-ink-900">
                    Next internal action:{" "}
                  </span>

                  {filingReadiness.nextInternalAction}
                </p>
              </Callout>
            </CardBody>
          </Card>

          {/* -------------------------------------------- filing package */}
          <Card>
            <CardHeader
              title="Filing package"
              description="Prepare verified claim evidence for human pre-filing review. This workflow does not submit externally."
              actions={
                <Badge
                  tone={filingReadiness.readyToPrepare ? "positive" : "caution"}
                  size="md"
                >
                  {filingReadiness.readyToPrepare ? "Available" : "Blocked"}
                </Badge>
              }
            />

            <CardBody>
              <ClaimFilingPackagePanel claimId={claim.id} />
            </CardBody>
          </Card>
        </div>

        {/* ============================================================ sidebar */}
        <aside className="min-w-0 space-y-5">
          <Card elevated>
            <CardHeader title="Claim controls" />

            <CardBody>
              <ButtonLink
                href={`/pro/opportunities/${opportunity.id}`}
                variant="primary"
                block
              >
                Open source opportunity
              </ButtonLink>

              <ButtonLink
                href={`/pro/jurisdictions/${jurisdiction.id}`}
                block
                className="mt-2"
              >
                Jurisdiction rule
              </ButtonLink>

              <ButtonLink
                href="/pro/claims"
                variant="quiet"
                block
                className="mt-2"
              >
                All claims
              </ButtonLink>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Assignment" />

            <CardBody>
              <DataList>
                <DataItem label="Assigned operator">
                  {claim.assignedSpecialistId ? (
                    <Identifier>{claim.assignedSpecialistId}</Identifier>
                  ) : (
                    "Unassigned"
                  )}
                </DataItem>

                <DataItem label="Claim created">
                  {formatTimestamp(conversion.convertedAt)}
                </DataItem>

                <DataItem label="Current stage">
                  {stageLabel(claim.stageKey)}
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Commercial lock"
              actions={<Badge tone="positive">Locked</Badge>}
            />

            <CardBody>
              <DataList>
                <DataItem label="Approved rate">
                  {quote.selectedPercentage !== undefined
                    ? formatPercent(quote.selectedPercentage)
                    : FEE_MODEL_LABEL[quote.model]}
                </DataItem>

                <DataItem label="Duequity fee">
                  <span className="font-semibold text-ink-900">
                    {formatCents(quote.projectedFee)}
                  </span>
                </DataItem>

                <DataItem label="Claimant net">
                  {formatCents(quote.projectedClaimantNet)}
                </DataItem>

                <DataItem label="Policy">
                  Version {quote.commercialPolicyVersion}
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Agency" />

            <CardBody>
              <DataList>
                <DataItem label="Agency">{jurisdiction.agencyName}</DataItem>

                <DataItem label="Claim method">
                  {jurisdiction.claimMethod.replaceAll("_", " ")}
                </DataItem>

                <DataItem label="Custodian">
                  {CUSTODIAN_LABEL[claim.custodian]}
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="System integrity" />

            <CardBody>
              <DataList>
                <DataItem label="Claim ID">
                  <Identifier>{conversion.claimId}</Identifier>
                </DataItem>

                <DataItem label="Quote ID">
                  <Identifier>{conversion.commercialQuoteId}</Identifier>
                </DataItem>

                <DataItem label="Lock status">
                  <Tag>{approval.approvalStatus}</Tag>
                </DataItem>
              </DataList>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}