import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  assessDeadline,
  deriveEstimatedSurplus,
  evaluateIntakeGate,
  jurisdictionLabel,
} from "@/domain/compliance";
import {
  classifyLegalComplexity,
  jurisdictionLegalRule,
  legalFlagFromRiskFlag,
  LEGAL_LANE,
  LEGAL_PROCESSING_RULE,
  type LegalComplexityFlag,
} from "@/domain/legal";
import { calculateCommercialFeeQuote } from "@/domain/commercial-pricing";
import {
  COMPLIANCE_STATUS,
  CONTACT_CONFIDENCE,
  CUSTODIAN_LABEL,
  DATA_QUALITY,
  DISQUALIFICATION_REASON,
  FEE_MODEL_LABEL,
  OPPORTUNITY_STATUS,
  OWNER_KIND_LABEL,
  OWNER_LOCATED_STATUS,
  PROPERTY_TYPE_LABEL,
  RISK_FLAG_LABEL,
  RISK_SEVERITY_TONE,
  SALE_TYPE_LABEL,
} from "@/domain/status";
import type {
  CommercialFeePolicy,
  IsoDate,
  IsoInstant,
  Jurisdiction,
  Opportunity,
} from "@/domain/types";

import { ConvertOpportunity } from "@/components/pro/convert-opportunity";
import {
  Badge,
  Identifier,
  PriorityMark,
  StatusBadge,
  Tag,
} from "@/components/ui/badge";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { IconArrowRight, IconExternal } from "@/components/ui/icon";
import { LegalFlagList, LegalLaneBadge } from "@/components/ui/legal-lane";
import { Amount, FigureRow, Money, MoneyInline } from "@/components/ui/money";
import {
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DataItem,
  DataList,
  Divider,
  NotRecorded,
} from "@/components/ui/surface";
import { Breadcrumbs } from "@/components/ui/tabs";
import { ActivityFeed, ActivityItem } from "@/components/ui/timeline";
import {
  formatCents,
  formatDate,
  formatElapsed,
  formatTimestamp,
} from "@/lib/format";
import { getCommercialApprovalForOpportunity } from "@/server/commercial-approval-store";
import { listCommercialFeePolicies } from "@/server/commercial-fee-policy-store";
import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";
import { getOpportunityConversion } from "@/server/opportunity-conversion-store";
import {
  getOpportunityById,
  getPropertyById,
} from "@/server/opportunity-store";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const dynamic = "force-dynamic";

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function currentIsoInstant(): IsoInstant {
  return new Date().toISOString() as IsoInstant;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "Not recorded";

  const percentage = value * 100;

  return Number.isInteger(percentage)
    ? `${percentage.toFixed(0)}%`
    : `${percentage.toFixed(1)}%`;
}

function pricingGateTone(
  outcome: "allowed" | "manager_review" | "blocked",
): "positive" | "caution" | "critical" {
  if (outcome === "allowed") return "positive";
  if (outcome === "manager_review") return "caution";
  return "critical";
}

function policyEffectiveOn(
  policy: CommercialFeePolicy,
  asOfDate: IsoDate,
): boolean {
  if (asOfDate < policy.effectiveFrom) return false;

  if (policy.effectiveThrough && asOfDate > policy.effectiveThrough) {
    return false;
  }

  return true;
}

function policyCoversOpportunity(
  policy: CommercialFeePolicy,
  opportunity: Opportunity,
): boolean {
  const saleCovered =
    !policy.saleTypes ||
    policy.saleTypes.length === 0 ||
    policy.saleTypes.includes(opportunity.sale.saleType);

  const custodianCovered =
    !policy.custodians ||
    policy.custodians.length === 0 ||
    policy.custodians.includes(opportunity.custodian);

  return saleCovered && custodianCovered;
}

function selectCommercialPolicy(
  policies: CommercialFeePolicy[],
  opportunity: Opportunity,
  asOfDate: IsoDate,
): CommercialFeePolicy | undefined {
  return policies
    .filter(
      (policy) =>
        policy.status === "approved" &&
        policy.jurisdictionId === opportunity.jurisdictionId &&
        policyEffectiveOn(policy, asOfDate) &&
        policyCoversOpportunity(policy, opportunity),
    )
    .slice()
    .sort((left, right) => right.version - left.version)[0];
}

export async function generateMetadata({
  params,
}: PageProps<"/pro/opportunities/[id]">): Promise<Metadata> {
  const session = await resolveStaffSession();

  if (!session) {
    return {
      title: "Opportunity",
    };
  }

  const { id } = await params;

  const opportunity = await getOpportunityById(id);

  return {
    title: opportunity?.reference ?? "Opportunity",
  };
}

export default async function ProOpportunityDetailPage({
  params,
}: PageProps<"/pro/opportunities/[id]">) {
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

  const opportunity = await getOpportunityById(id);

  if (!opportunity) {
    notFound();
  }

  const [
    property,
    rulePackages,
    commercialPolicies,
    persistedConversion,
    persistedCommercialApproval,
  ] = await Promise.all([
    getPropertyById(opportunity.propertyId),
    listJurisdictionRulePackages(),
    listCommercialFeePolicies(),
    getOpportunityConversion(opportunity.id),
    getCommercialApprovalForOpportunity(opportunity.id),
  ]);

  if (!property) {
    notFound();
  }

  const jurisdictionPackage = rulePackages.find(
    (rulePackage) =>
      rulePackage.status === "approved" &&
      rulePackage.rule?.id === opportunity.jurisdictionId,
  );

  const jurisdiction: Jurisdiction | undefined = jurisdictionPackage?.rule;

  const today = currentIsoDate();

  const convertedClaimId =
    opportunity.convertedClaimId ?? persistedConversion?.claimId;

  const convertedClaimReference = persistedConversion?.claimReference;

  const converted = Boolean(convertedClaimId);

  const deadline = assessDeadline(opportunity.claimDeadline, today);

  const derivation = deriveEstimatedSurplus(opportunity);

  const openFlags = opportunity.flags.filter((flag) => !flag.resolvedAt);

  const blockingFlags = openFlags.filter(
    (flag) => flag.severity === "blocking",
  );

  const gate = jurisdiction
    ? evaluateIntakeGate(jurisdiction)
    : {
        outcome: "blocked" as const,
        summary: "Jurisdiction not approved",
        reason:
          "No approved jurisdiction rule is published for this opportunity.",
        requiredAction:
          "Complete and approve the jurisdiction review before intake or conversion.",
        authority: undefined,
      };

  const projectedFlags: LegalComplexityFlag[] = [];

  for (const risk of openFlags) {
    const kind = legalFlagFromRiskFlag(risk.kind);

    if (!kind || projectedFlags.some((flag) => flag.kind === kind)) {
      continue;
    }

    projectedFlags.push({
      kind,
      detail: risk.detail,
      raisedAt: risk.raisedAt,
      raisedBy: risk.raisedBy,
    });
  }

  const projected = jurisdiction
    ? classifyLegalComplexity(projectedFlags, jurisdiction)
    : undefined;

  const legalRule = jurisdiction
    ? jurisdictionLegalRule(jurisdiction)
    : undefined;

  const commercialPolicy = selectCommercialPolicy(
    commercialPolicies,
    opportunity,
    today,
  );

  const calculatedCommercialPricing =
    jurisdiction && commercialPolicy
      ? calculateCommercialFeeQuote({
          opportunity,
          jurisdiction,
          policy: commercialPolicy,
          quoteId: `preview-${opportunity.id}-v${commercialPolicy.version}`,
          createdByUserId: opportunity.assignedToUserId ?? "system",
          createdAt: currentIsoInstant(),
          asOfDate: today,
        })
      : undefined;

  const persistedApprovalStatus = persistedCommercialApproval?.approvalStatus;

  const hasPersistedPricingDecision =
    persistedApprovalStatus === "staff_approved" ||
    persistedApprovalStatus === "manager_review" ||
    persistedApprovalStatus === "manager_approved" ||
    persistedApprovalStatus === "locked";

  const commercialQuote =
    hasPersistedPricingDecision && persistedCommercialApproval
      ? persistedCommercialApproval.quoteSnapshot
      : calculatedCommercialPricing?.quote;

  const commercialTier = calculatedCommercialPricing?.tier;

  const commercialGate = calculatedCommercialPricing?.gate;

  const commercialPricingApproved =
    persistedApprovalStatus === "staff_approved" ||
    persistedApprovalStatus === "manager_approved" ||
    persistedApprovalStatus === "locked";

  const commercialWorkflowGate:
    "allowed" | "manager_review" | "blocked" | "missing" =
    persistedApprovalStatus === "manager_review"
      ? "manager_review"
      : commercialPricingApproved
        ? "allowed"
        : (commercialGate?.outcome ?? "missing");

  const commercialWorkflowReason =
    persistedApprovalStatus === "manager_review"
      ? "The requested pricing exception is awaiting manager approval."
      : persistedApprovalStatus === "manager_approved"
        ? "This pricing exception was approved by a Duequity manager."
        : persistedApprovalStatus === "staff_approved"
          ? "This commercial pricing decision was approved by staff."
          : persistedApprovalStatus === "locked"
            ? "This commercial pricing decision is approved and locked to the conversion."
            : commercialGate?.reason;

  const commercialPricingSummary =
    commercialQuote && commercialPolicy
      ? `${
          commercialQuote.selectedPercentage !== undefined
            ? formatPercent(commercialQuote.selectedPercentage)
            : FEE_MODEL_LABEL[commercialQuote.model]
        } / projected fee ${formatCents(
          commercialQuote.projectedFee,
        )} / policy v${commercialPolicy.version}`
      : undefined;

  return (
    <div className="space-y-5">
      <div>
        <Breadcrumbs
          trail={[
            {
              href: "/pro/opportunities",
              label: "Opportunities",
            },
            {
              label: opportunity.reference,
            },
          ]}
        />

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Identifier>{opportunity.reference}</Identifier>

              <PriorityMark priority={opportunity.priority} />

              {converted ? (
                <Badge tone="positive" size="md">
                  Converted
                </Badge>
              ) : (
                <StatusBadge
                  status={OPPORTUNITY_STATUS[opportunity.status]}
                  size="md"
                />
              )}
            </div>

            <h1 className="mt-2 text-2xl">{property.address.line1}</h1>

            <p className="mt-1 text-sm text-ink-600">
              {property.address.city}, {property.address.county} County,{" "}
              {property.address.state} {property.address.postalCode}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <Money
              fact={
                opportunity.confirmedSurplus ?? opportunity.estimatedSurplus
              }
              size="xl"
            />

            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              {
                (opportunity.confirmedSurplus ?? opportunity.estimatedSurplus)
                  .basis
              }
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="eyebrow text-ink-500">Claim deadline</p>

            <p className="mt-1.5 tnum text-xl font-semibold text-ink-900">
              {opportunity.claimDeadline
                ? formatDate(opportunity.claimDeadline)
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
            <p className="eyebrow text-ink-500">Owner located</p>

            <p className="mt-1.5">
              <StatusBadge
                status={OWNER_LOCATED_STATUS[opportunity.ownerLocated]}
                size="md"
              />
            </p>

            <p className="mt-2 text-xs text-ink-500">
              Contact confidence:{" "}
              <span className="font-medium text-ink-700">
                {CONTACT_CONFIDENCE[opportunity.contactConfidence].label}
              </span>
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="eyebrow text-ink-500">Risk score</p>

            <p className="mt-1.5 tnum text-xl font-semibold text-ink-900">
              {opportunity.riskScore}

              <span className="ml-1 text-sm font-normal text-ink-400">
                / 100
              </span>
            </p>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className={
                  opportunity.riskScore >= 70
                    ? "h-full rounded-full bg-critical-600"
                    : opportunity.riskScore >= 40
                      ? "h-full rounded-full bg-caution-600"
                      : "h-full rounded-full bg-accent-500"
                }
                style={{
                  width: `${opportunity.riskScore}%`,
                }}
              />
            </div>

            <p className="mt-1.5 text-2xs leading-relaxed text-ink-500">
              Advisory only. Human review remains authoritative.
            </p>
          </CardBody>
        </Card>
      </div>

      {converted && convertedClaimId && (
        <Callout tone="positive" title="Opportunity converted to claim">
          <p>
            <span className="font-semibold text-ink-900">
              {opportunity.reference}
            </span>{" "}
            has moved into Claims.
          </p>

          <p className="mt-2">
            Claim:{" "}
            <Link
              href={`/pro/claims/${convertedClaimId}`}
              className="font-semibold text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
            >
              {convertedClaimReference ?? convertedClaimId}
            </Link>
          </p>

          {persistedConversion && (
            <p className="mt-2 text-xs text-ink-600">
              Conversion recorded{" "}
              {formatTimestamp(persistedConversion.convertedAt)}.
            </p>
          )}
        </Callout>
      )}

      <Callout
        tone={
          gate.outcome === "permitted"
            ? "positive"
            : gate.outcome === "conditional"
              ? "counsel"
              : "critical"
        }
        title={
          jurisdiction
            ? `${jurisdictionLabel(jurisdiction)}: ${gate.summary}`
            : gate.summary
        }
      >
        <p>{gate.reason}</p>

        {gate.requiredAction && (
          <p className="mt-2">
            <span className="font-semibold text-ink-900">Required: </span>

            {gate.requiredAction}
          </p>
        )}

        <p className="mt-2 text-xs">
          <TextLink href="/pro/jurisdictions" className="text-xs">
            Jurisdiction reviews
          </TextLink>

          {gate.authority && (
            <span className="ml-2 text-ink-500">
              Authority: {gate.authority}
            </span>
          )}
        </p>
      </Callout>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Surplus derivation"
              description="Arithmetic only. It does not determine entitlement."
            />

            <CardBody>
              <FigureRow
                label="Sale proceeds"
                note={opportunity.sale.salePrice.basis}
              >
                <MoneyInline fact={opportunity.sale.salePrice} />
              </FigureRow>

              <FigureRow
                label="Debt satisfied"
                sign="subtract"
                note={opportunity.sale.debtSatisfied.basis}
              >
                <MoneyInline fact={opportunity.sale.debtSatisfied} />
              </FigureRow>

              {opportunity.sale.taxesOwed && (
                <FigureRow
                  label="Delinquent taxes"
                  sign="subtract"
                  note={opportunity.sale.taxesOwed.basis}
                >
                  <MoneyInline fact={opportunity.sale.taxesOwed} />
                </FigureRow>
              )}

              {opportunity.sale.saleCosts && (
                <FigureRow
                  label="Sale costs and fees"
                  sign="subtract"
                  note={opportunity.sale.saleCosts.basis}
                >
                  <MoneyInline fact={opportunity.sale.saleCosts} />
                </FigureRow>
              )}

              {opportunity.sale.juniorLiens && (
                <FigureRow
                  label="Recorded junior liens"
                  sign="subtract"
                  note={opportunity.sale.juniorLiens.basis}
                >
                  <MoneyInline fact={opportunity.sale.juniorLiens} />
                </FigureRow>
              )}

              <FigureRow label="Derived surplus" emphasis>
                <Amount cents={derivation.amount} size="lg" />
              </FigureRow>

              {opportunity.confirmedSurplus ? (
                <Callout tone="positive" className="mt-4">
                  <p>
                    <span className="font-semibold text-ink-900">
                      Agency confirmed{" "}
                      {formatCents(opportunity.confirmedSurplus.amount)}.
                    </span>{" "}
                    {opportunity.confirmedSurplus.basis}
                  </p>
                </Callout>
              ) : (
                <Callout tone="caution" className="mt-4">
                  <p>
                    <span className="font-semibold text-ink-900">
                      No agency confirmation on file.
                    </span>{" "}
                    This amount remains an estimate.
                  </p>
                </Callout>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Sale record and provenance"
              description="Source facts and verification history."
            />

            <CardBody>
              <DataList columns={2}>
                <DataItem label="Sale type">
                  {SALE_TYPE_LABEL[opportunity.sale.saleType]}
                </DataItem>

                <DataItem label="Sale date">
                  {formatDate(opportunity.sale.saleDate)}
                </DataItem>

                <DataItem label="Case number">
                  {opportunity.sale.caseNumber ? (
                    <Identifier>{opportunity.sale.caseNumber}</Identifier>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Selling entity">
                  {opportunity.sale.sellingEntity}
                </DataItem>

                <DataItem label="Surplus custodian">
                  {CUSTODIAN_LABEL[opportunity.custodian]}
                </DataItem>

                <DataItem label="Responsible agency">
                  {jurisdiction ? jurisdiction.agencyName : "Not approved"}
                </DataItem>
              </DataList>

              <Divider className="my-5" />

              <DataList columns={2}>
                <DataItem label="Origin">
                  {opportunity.provenance.sourceName}
                </DataItem>

                <DataItem label="Data quality">
                  <StatusBadge
                    status={DATA_QUALITY[opportunity.provenance.quality]}
                  />
                </DataItem>

                <DataItem label="Source reference">
                  {opportunity.provenance.sourceReference ? (
                    <Identifier>
                      {opportunity.provenance.sourceReference}
                    </Identifier>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Source date">
                  {formatDate(opportunity.provenance.sourceDate)}
                </DataItem>

                <DataItem label="Last verified">
                  {opportunity.provenance.lastVerified ? (
                    <span>
                      {formatDate(opportunity.provenance.lastVerified)}

                      <span className="ml-2 text-xs text-ink-500">
                        {formatElapsed(
                          opportunity.provenance.lastVerified,
                          today,
                        )}
                      </span>
                    </span>
                  ) : (
                    <Badge tone="caution">Never verified</Badge>
                  )}
                </DataItem>

                {opportunity.provenance.sourceUrl && (
                  <DataItem label="Public record">
                    <TextLink href={opportunity.provenance.sourceUrl} external>
                      Open source{" "}
                      <IconExternal size={12} className="ml-1 inline" />
                    </TextLink>
                  </DataItem>
                )}
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Prior ownership"
              description="Names exactly as recorded in the source record."
            />

            <CardBody flush>
              {opportunity.priorOwners.length === 0 ? (
                <p className="px-4 py-4 text-sm text-ink-500 sm:px-5">
                  No prior-owner record has been attached yet.
                </p>
              ) : (
                <ul className="divide-y divide-line-subtle">
                  {opportunity.priorOwners.map((priorOwner) => (
                    <li key={priorOwner.id} className="px-4 py-3.5 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink-900">
                            {priorOwner.nameOnRecord}
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Tag>{OWNER_KIND_LABEL[priorOwner.ownerKind]}</Tag>

                            {priorOwner.ownershipShare !== undefined && (
                              <Tag>
                                {Math.round(priorOwner.ownershipShare * 100)}%
                                interest
                              </Tag>
                            )}

                            {priorOwner.deceased && (
                              <Badge tone="caution">Deceased</Badge>
                            )}
                          </div>
                        </div>

                        <StatusBadge
                          status={DATA_QUALITY[priorOwner.provenance.quality]}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Commercial pricing"
              description="Duequity pricing remains subordinate to the approved jurisdiction rules."
              actions={
                persistedApprovalStatus === "manager_approved" ? (
                  <Badge tone="positive" size="md">
                    Manager approved
                  </Badge>
                ) : persistedApprovalStatus === "staff_approved" ? (
                  <Badge tone="positive" size="md">
                    Staff approved
                  </Badge>
                ) : persistedApprovalStatus === "locked" ? (
                  <Badge tone="positive" size="md">
                    Locked
                  </Badge>
                ) : persistedApprovalStatus === "manager_review" ? (
                  <Badge tone="caution" size="md">
                    Manager review
                  </Badge>
                ) : commercialGate ? (
                  <Badge
                    tone={pricingGateTone(commercialGate.outcome)}
                    size="md"
                  >
                    {commercialGate.outcome === "allowed"
                      ? "Within staff authority"
                      : commercialGate.outcome === "manager_review"
                        ? "Manager review"
                        : "Pricing blocked"}
                  </Badge>
                ) : (
                  <Badge tone="critical" size="md">
                    No approved policy
                  </Badge>
                )
              }
            />

            <CardBody>
              {!jurisdiction ? (
                <Callout tone="critical">
                  <p>
                    Pricing is unavailable until the jurisdiction rule is
                    approved.
                  </p>
                </Callout>
              ) : !commercialPolicy ? (
                <Callout tone="critical">
                  <p>
                    No current approved Duequity fee policy matches this
                    jurisdiction, sale type and custodian.
                  </p>
                </Callout>
              ) : !calculatedCommercialPricing ? (
                <Callout tone="critical">
                  <p>Commercial pricing could not be evaluated.</p>
                </Callout>
              ) : !calculatedCommercialPricing.policyValidation.valid ? (
                <Callout tone="critical">
                  <ul className="list-disc space-y-1 pl-5">
                    {calculatedCommercialPricing.policyValidation.errors.map(
                      (error) => (
                        <li key={error}>{error}</li>
                      ),
                    )}
                  </ul>
                </Callout>
              ) : !commercialQuote || !commercialTier || !commercialGate ? (
                <Callout tone="critical">
                  <p>No active pricing tier covers this recovery amount.</p>
                </Callout>
              ) : (
                <DataList columns={2}>
                  <DataItem label="Recovery basis">
                    {commercialQuote.recoveryBasis === "confirmed"
                      ? "Confirmed"
                      : "Estimated"}{" "}
                    {formatCents(commercialQuote.recoveryAmount)}
                  </DataItem>

                  <DataItem label="Fee model">
                    {FEE_MODEL_LABEL[commercialQuote.model]}
                  </DataItem>

                  <DataItem label="Legal percentage ceiling">
                    {jurisdiction.feeCapPercent !== undefined
                      ? formatPercent(jurisdiction.feeCapPercent)
                      : "No percentage ceiling recorded"}
                  </DataItem>

                  <DataItem label="Legal amount ceiling">
                    {jurisdiction.feeCapAmount !== undefined
                      ? formatCents(jurisdiction.feeCapAmount)
                      : "No amount ceiling recorded"}
                  </DataItem>

                  <DataItem label="Duequity policy">
                    Version {commercialPolicy.version} / {commercialTier.label}
                  </DataItem>

                  <DataItem label="Projected Duequity fee">
                    <span className="font-semibold text-ink-900">
                      {formatCents(commercialQuote.projectedFee)}
                    </span>
                  </DataItem>

                  <DataItem label="Projected claimant net">
                    <span className="font-semibold text-ink-900">
                      {formatCents(commercialQuote.projectedClaimantNet)}
                    </span>
                  </DataItem>

                  <DataItem label="Pricing status">
                    {commercialWorkflowReason ?? commercialGate.reason}
                  </DataItem>
                </DataList>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Projected legal lane"
              description="Derived from current flags and the approved jurisdiction rule."
              actions={
                projected ? (
                  <LegalLaneBadge lane={projected.lane} size="md" />
                ) : (
                  <Badge tone="critical" size="md">
                    Not classified
                  </Badge>
                )
              }
            />

            <CardBody>
              {!projected || !legalRule ? (
                <Callout tone="critical">
                  <p>
                    A legal lane cannot be projected until an approved
                    jurisdiction rule exists.
                  </p>
                </Callout>
              ) : (
                <>
                  <div
                    className={
                      projected.lane === "administrative"
                        ? "rounded-md border border-accent-200 bg-accent-50 px-3.5 py-3"
                        : projected.lane === "legal_review"
                          ? "rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3"
                          : "rounded-md border border-counsel-200 bg-counsel-50 px-3.5 py-3"
                    }
                  >
                    <p className="font-semibold text-ink-900">
                      {LEGAL_LANE[projected.lane].label}
                    </p>

                    <p className="mt-1 text-sm text-ink-700">
                      {projected.rationale}
                    </p>
                  </div>

                  <DataList columns={2} className="mt-4">
                    <DataItem label="Jurisdiction rule">
                      <Badge tone={LEGAL_PROCESSING_RULE[legalRule].tone}>
                        {LEGAL_PROCESSING_RULE[legalRule].label}
                      </Badge>
                    </DataItem>

                    <DataItem label="Jurisdiction lane floor">
                      <LegalLaneBadge lane={projected.jurisdictionFloor} />
                    </DataItem>
                  </DataList>

                  {projectedFlags.length > 0 && (
                    <>
                      <Divider className="my-4" />

                      <LegalFlagList flags={projectedFlags} />
                    </>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Review flags"
              description="Human review remains authoritative."
              actions={
                openFlags.length > 0 ? (
                  <Badge
                    tone={blockingFlags.length > 0 ? "critical" : "caution"}
                    size="md"
                  >
                    {openFlags.length} open
                  </Badge>
                ) : (
                  <Badge tone="positive" size="md">
                    None open
                  </Badge>
                )
              }
            />

            <CardBody>
              {opportunity.flags.length === 0 ? (
                <p className="text-sm text-ink-500">No flags raised.</p>
              ) : (
                <ul className="space-y-3">
                  {opportunity.flags.map((flag, index) => (
                    <li
                      key={`${flag.kind}-${index}`}
                      className="rounded-md border border-line px-3.5 py-3"
                    >
                      <Badge tone={RISK_SEVERITY_TONE[flag.severity]} size="md">
                        {RISK_FLAG_LABEL[flag.kind]}
                      </Badge>

                      <p className="mt-1.5 text-sm text-ink-700">
                        {flag.detail}
                      </p>

                      <p className="mt-1.5 text-2xs text-ink-500">
                        Raised by {flag.raisedBy} on {formatDate(flag.raisedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {opportunity.notes.length > 0 && (
            <Card>
              <CardHeader
                title="Internal notes"
                description="Never visible to a claimant."
              />

              <CardBody>
                <ActivityFeed>
                  {opportunity.notes.map((note) => (
                    <ActivityItem
                      key={note.id}
                      title={note.authorName}
                      detail={note.body}
                      date={note.createdAt}
                      tone={note.pinned ? "caution" : "neutral"}
                    />
                  ))}
                </ActivityFeed>
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5">
          <Card elevated>
            <CardHeader
              title="Conversion"
              description={
                converted
                  ? "This opportunity has moved into Claims."
                  : "Production compliance and pricing gates control conversion."
              }
            />

            <CardBody>
              {converted && convertedClaimId ? (
                <div>
                  <Badge tone="positive" size="md">
                    Converted
                  </Badge>

                  <p className="mt-2 text-sm text-ink-600">
                    Workflow continues in{" "}
                    {convertedClaimReference ?? convertedClaimId}.
                  </p>

                  <ButtonLink
                    href={`/pro/claims/${convertedClaimId}`}
                    variant="primary"
                    block
                    className="mt-3"
                    trailing={<IconArrowRight size={16} />}
                  >
                    Open claim
                  </ButtonLink>
                </div>
              ) : opportunity.status === "disqualified" ? (
                <div>
                  <Badge tone="critical" size="md">
                    Disqualified
                  </Badge>

                  {opportunity.disqualifiedReason && (
                    <p className="mt-2 text-sm text-ink-600">
                      {DISQUALIFICATION_REASON[opportunity.disqualifiedReason]}
                    </p>
                  )}
                </div>
              ) : !jurisdiction || !projected ? (
                <Callout tone="critical" title="Conversion blocked">
                  <p>
                    An approved jurisdiction rule is required before this
                    opportunity can be converted.
                  </p>
                </Callout>
              ) : (
                <ConvertOpportunity
                  opportunityReference={opportunity.reference}
                  jurisdictionName={jurisdictionLabel(jurisdiction)}
                  gateOutcome={gate.outcome}
                  gateReason={gate.reason}
                  gateAction={gate.requiredAction}
                  blockingFlags={blockingFlags.map((flag) => ({
                    label: RISK_FLAG_LABEL[flag.kind],
                    detail: flag.detail,
                  }))}
                  surplusConfirmed={Boolean(opportunity.confirmedSurplus)}
                  deadlineExpired={deadline.risk === "expired"}
                  ownerLocated={
                    opportunity.ownerLocated === "located" ||
                    opportunity.ownerLocated === "probable_match"
                  }
                  projectedLane={projected.lane}
                  projectedRationale={projected.rationale}
                  commercialPricingGate={commercialWorkflowGate}
                  commercialPricingReason={commercialWorkflowReason}
                  commercialPricingViable={
                    commercialQuote?.viabilityStatus === "viable"
                  }
                  commercialPricingApproved={commercialPricingApproved}
                  commercialPricingSummary={commercialPricingSummary}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Property" />

            <CardBody>
              <DataList>
                <DataItem label="Type">
                  {PROPERTY_TYPE_LABEL[property.propertyType]}
                </DataItem>

                <DataItem label="Parcel number">
                  {property.parcelNumber ? (
                    <Identifier>{property.parcelNumber}</Identifier>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Tax account">
                  {property.taxAccountNumber ? (
                    <Identifier>{property.taxAccountNumber}</Identifier>
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Year built">
                  {property.yearBuilt ?? <NotRecorded />}
                </DataItem>

                <DataItem label="Assessed value">
                  {property.assessedValue ? (
                    <MoneyInline fact={property.assessedValue} whole />
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>
              </DataList>
            </CardBody>

            <CardFooter>
              <p className="text-xs text-ink-500">
                Source: {property.provenance.sourceName}
              </p>

              <StatusBadge status={DATA_QUALITY[property.provenance.quality]} />
            </CardFooter>
          </Card>

          <Card>
            <CardHeader
              title="Jurisdiction"
              actions={
                jurisdiction ? (
                  <StatusBadge
                    status={COMPLIANCE_STATUS[jurisdiction.complianceStatus]}
                  />
                ) : (
                  <Badge tone="critical">Not approved</Badge>
                )
              }
            />

            <CardBody>
              <DataList>
                <DataItem label="Jurisdiction">
                  {jurisdiction
                    ? jurisdictionLabel(jurisdiction)
                    : opportunity.jurisdictionId}
                </DataItem>

                <DataItem label="Agency">
                  {jurisdiction ? jurisdiction.agencyName : "Not approved"}
                </DataItem>

                <DataItem label="Attorney required">
                  {jurisdiction ? (
                    jurisdiction.attorneyRequired ? (
                      <Badge tone="counsel">Yes</Badge>
                    ) : (
                      "No"
                    )
                  ) : (
                    <NotRecorded />
                  )}
                </DataItem>

                <DataItem label="Last legal review">
                  {jurisdiction?.lastLegalReview ? (
                    formatDate(jurisdiction.lastLegalReview)
                  ) : (
                    <Badge tone="caution">Not recorded</Badge>
                  )}
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Assignment" />

            <CardBody>
              <DataList>
                <DataItem label="Assigned operator">
                  {opportunity.assignedToUserId ? (
                    <Identifier>{opportunity.assignedToUserId}</Identifier>
                  ) : (
                    <NotRecorded label="Unassigned" />
                  )}
                </DataItem>

                <DataItem label="Created">
                  {formatDate(opportunity.createdAt)}
                </DataItem>

                <DataItem label="Last activity">
                  {formatDate(opportunity.lastActivityAt)}

                  <span className="ml-2 text-xs text-ink-500">
                    {formatElapsed(opportunity.lastActivityAt, today)}
                  </span>
                </DataItem>
              </DataList>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}