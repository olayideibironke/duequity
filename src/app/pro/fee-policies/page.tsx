import type { Metadata } from "next";

import { jurisdictionLabel } from "@/domain/compliance";
import {
  CUSTODIAN_LABEL,
  FEE_MODEL_LABEL,
  SALE_TYPE_LABEL,
} from "@/domain/status";
import type { CommercialFeePolicy, Jurisdiction } from "@/domain/types";
import { Badge, Identifier, Tag } from "@/components/ui/badge";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  Divider,
} from "@/components/ui/surface";
import { formatCents, formatDate } from "@/lib/format";
import { listCommercialFeePolicies } from "@/server/commercial-fee-policy-store";
import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Fee policies",
};

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "Not recorded";
  }

  const percent = value * 100;

  return Number.isInteger(percent)
    ? `${percent.toFixed(0)}%`
    : `${percent.toFixed(1)}%`;
}

function policyStatusTone(
  status: CommercialFeePolicy["status"],
): "neutral" | "positive" | "critical" {
  if (status === "approved") {
    return "positive";
  }

  if (status === "paused") {
    return "critical";
  }

  return "neutral";
}

function policyStatusLabel(status: CommercialFeePolicy["status"]): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "paused":
      return "Paused";
    case "retired":
      return "Retired";
  }
}

function tierRange(minimum: number, maximum?: number): string {
  if (maximum === undefined) {
    return `${formatCents(minimum)} and above`;
  }

  return `${formatCents(minimum)} to ${formatCents(maximum)}`;
}

function defaultPrice(
  model: "flat" | "percentage" | "capped_success" | "no_fee",
  percentage?: number,
  flatAmount?: number,
): string {
  if (model === "percentage" || model === "capped_success") {
    return percentage !== undefined
      ? formatPercent(percentage)
      : "Not recorded";
  }

  if (model === "flat") {
    return flatAmount !== undefined ? formatCents(flatAmount) : "Not recorded";
  }

  return "No fee";
}

function jurisdictionName(
  jurisdiction: Jurisdiction | undefined,
  jurisdictionId: string,
): string {
  if (!jurisdiction) {
    return jurisdictionId;
  }

  return jurisdictionLabel(jurisdiction);
}

export default async function ProFeePoliciesPage() {
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

  const [policies, rulePackages] = await Promise.all([
    listCommercialFeePolicies(),
    listJurisdictionRulePackages(),
  ]);

  const jurisdictionById = new Map<string, Jurisdiction>();

  for (const rulePackage of rulePackages) {
    if (rulePackage.status === "approved" && rulePackage.rule) {
      jurisdictionById.set(rulePackage.rule.id, rulePackage.rule);
    }
  }

  const approvedPolicies = policies.filter(
    (policy) => policy.status === "approved",
  );

  const activeTiers = policies.reduce(
    (total, policy) =>
      total + policy.tiers.filter((tier) => tier.active).length,
    0,
  );

  const jurisdictionsCovered = new Set(
    policies.map((policy) => policy.jurisdictionId),
  ).size;

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Commercial governance</p>

          <h1 className="mt-1.5 text-2xl">Fee policies</h1>

          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
            Duequity&apos;s internal pricing rules by jurisdiction, recovery
            size and fee model. Commercial policy may be more conservative than
            the recorded legal ceiling.
          </p>
        </div>
      </div>

      {/* ========================================================== governance */}
      <Callout tone="caution" title="Legal ceiling is not Duequity's price">
        <p>
          Approved jurisdiction records control what the platform is legally
          permitted to quote. Commercial fee policies control what Duequity
          chooses to charge within those recorded boundaries. A legal maximum
          never automatically becomes the customer price.
        </p>
      </Callout>

      {/* ============================================================= metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="eyebrow text-ink-500">Policies</p>

            <p className="mt-1.5 tnum text-2xl font-semibold text-ink-900">
              {policies.length}
            </p>

            <p className="mt-1 text-xs text-ink-500">
              {approvedPolicies.length} approved
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="eyebrow text-ink-500">Jurisdictions covered</p>

            <p className="mt-1.5 tnum text-2xl font-semibold text-ink-900">
              {jurisdictionsCovered}
            </p>

            <p className="mt-1 text-xs text-ink-500">
              Production pricing coverage
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="eyebrow text-ink-500">Active recovery tiers</p>

            <p className="mt-1.5 tnum text-2xl font-semibold text-ink-900">
              {activeTiers}
            </p>

            <p className="mt-1 text-xs text-ink-500">
              Across recorded policies
            </p>
          </CardBody>
        </Card>
      </div>

      {/* ============================================================= empty */}
      {policies.length === 0 && (
        <Card elevated>
          <CardHeader
            title="No production fee policies yet"
            description="Commercial pricing stays unavailable until a jurisdiction is legally cleared and a real Duequity fee policy is approved for it."
          />

          <CardBody>
            <Callout tone="neutral" title="Pricing is correctly blocked">
              <p>
                No seeded or fallback fee policy is being used. Once Compliance
                approves a jurisdiction, Duequity can publish a commercial
                policy within that jurisdiction&apos;s recorded fee rules.
              </p>
            </Callout>
          </CardBody>
        </Card>
      )}

      {/* ============================================================= policies */}
      {policies.length > 0 && (
        <div className="space-y-5">
          {policies.map((policy) => {
            const jurisdiction = jurisdictionById.get(policy.jurisdictionId);

            return (
              <Card key={policy.id} elevated>
                <CardHeader
                  title={jurisdictionName(jurisdiction, policy.jurisdictionId)}
                  description={`Commercial pricing policy version ${policy.version}`}
                  actions={
                    <Badge tone={policyStatusTone(policy.status)} size="md">
                      {policyStatusLabel(policy.status)}
                    </Badge>
                  }
                />

                <CardBody>
                  <div className="flex flex-wrap items-center gap-2">
                    <Identifier>{policy.id}</Identifier>

                    <Tag>Version {policy.version}</Tag>
                  </div>

                  <DataList columns={2} className="mt-4">
                    <DataItem label="Jurisdiction">
                      {jurisdictionName(jurisdiction, policy.jurisdictionId)}
                    </DataItem>

                    <DataItem label="Effective from">
                      {formatDate(policy.effectiveFrom)}
                    </DataItem>

                    <DataItem label="Effective through">
                      {policy.effectiveThrough
                        ? formatDate(policy.effectiveThrough)
                        : "No scheduled end"}
                    </DataItem>

                    <DataItem label="Last reviewed">
                      {policy.lastReviewedAt
                        ? formatDate(policy.lastReviewedAt)
                        : "Not recorded"}
                    </DataItem>

                    <DataItem label="Review due">
                      {policy.reviewDueAt
                        ? formatDate(policy.reviewDueAt)
                        : "Not recorded"}
                    </DataItem>

                    <DataItem label="Approved">
                      {policy.approvedAt
                        ? formatDate(policy.approvedAt)
                        : "Not recorded"}
                    </DataItem>
                  </DataList>

                  <Divider className="my-5" />

                  <div className="grid gap-5 lg:grid-cols-2">
                    <div>
                      <p className="eyebrow text-ink-500">Sale types</p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {policy.saleTypes && policy.saleTypes.length > 0 ? (
                          policy.saleTypes.map((saleType) => (
                            <Tag key={saleType}>
                              {SALE_TYPE_LABEL[saleType]}
                            </Tag>
                          ))
                        ) : (
                          <span className="text-sm text-ink-600">
                            All cleared sale types
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="eyebrow text-ink-500">Custodians</p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {policy.custodians && policy.custodians.length > 0 ? (
                          policy.custodians.map((custodian) => (
                            <Tag key={custodian}>
                              {CUSTODIAN_LABEL[custodian]}
                            </Tag>
                          ))
                        ) : (
                          <span className="text-sm text-ink-600">
                            All cleared custodians
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Divider className="my-5" />

                  <div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="eyebrow text-ink-500">Recovery tiers</p>

                        <p className="mt-1 text-sm text-ink-600">
                          Duequity&apos;s commercial ranges within the approved
                          jurisdiction rules.
                        </p>
                      </div>

                      <Badge tone="neutral" size="md">
                        {policy.tiers.filter((tier) => tier.active).length}{" "}
                        active
                      </Badge>
                    </div>

                    <div className="mt-3 grid gap-3">
                      {policy.tiers.map((tier) => (
                        <div
                          key={tier.id}
                          className="rounded-lg border border-line bg-inset px-4 py-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-ink-900">
                                  {tier.label}
                                </p>

                                <Badge
                                  tone={tier.active ? "positive" : "neutral"}
                                >
                                  {tier.active ? "Active" : "Inactive"}
                                </Badge>
                              </div>

                              <p className="mt-1 text-xs text-ink-500">
                                Recovery{" "}
                                {tierRange(
                                  tier.minimumRecovery,
                                  tier.maximumRecovery,
                                )}
                              </p>
                            </div>

                            <Tag>{FEE_MODEL_LABEL[tier.model]}</Tag>
                          </div>

                          <DataList columns={2} className="mt-4">
                            <DataItem label="Default price">
                              <span className="font-semibold text-ink-900">
                                {defaultPrice(
                                  tier.model,
                                  tier.defaultPercentage,
                                  tier.defaultFlatAmount,
                                )}
                              </span>
                            </DataItem>

                            <DataItem label="Minimum viable fee">
                              {tier.minimumViableFee !== undefined
                                ? formatCents(tier.minimumViableFee)
                                : "Not recorded"}
                            </DataItem>

                            <DataItem label="Staff percentage authority">
                              {tier.staffFloorPercentage !== undefined ||
                              tier.staffCeilingPercentage !== undefined
                                ? `${formatPercent(
                                    tier.staffFloorPercentage,
                                  )} to ${formatPercent(
                                    tier.staffCeilingPercentage,
                                  )}`
                                : "Not applicable"}
                            </DataItem>

                            <DataItem label="Manager percentage ceiling">
                              {tier.managerExceptionCeilingPercentage !==
                              undefined
                                ? formatPercent(
                                    tier.managerExceptionCeilingPercentage,
                                  )
                                : "Not applicable"}
                            </DataItem>

                            <DataItem label="Staff flat-fee authority">
                              {tier.staffFloorAmount !== undefined ||
                              tier.staffCeilingAmount !== undefined
                                ? `${
                                    tier.staffFloorAmount !== undefined
                                      ? formatCents(tier.staffFloorAmount)
                                      : "No floor"
                                  } to ${
                                    tier.staffCeilingAmount !== undefined
                                      ? formatCents(tier.staffCeilingAmount)
                                      : "No ceiling"
                                  }`
                                : "Not applicable"}
                            </DataItem>

                            <DataItem label="Manager flat-fee ceiling">
                              {tier.managerExceptionCeilingAmount !== undefined
                                ? formatCents(
                                    tier.managerExceptionCeilingAmount,
                                  )
                                : "Not applicable"}
                            </DataItem>

                            <DataItem label="Internal fee cap">
                              {tier.internalFeeCapAmount !== undefined
                                ? formatCents(tier.internalFeeCapAmount)
                                : "Not recorded"}
                            </DataItem>
                          </DataList>
                        </div>
                      ))}
                    </div>
                  </div>

                  {policy.internalNotes && (
                    <>
                      <Divider className="my-5" />

                      <Callout tone="neutral">
                        <p className="font-semibold text-ink-900">
                          Internal policy note
                        </p>

                        <p className="mt-1 text-sm leading-relaxed text-ink-600">
                          {policy.internalNotes}
                        </p>
                      </Callout>
                    </>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}