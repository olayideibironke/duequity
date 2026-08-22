import type { Metadata } from "next";

import Link from "next/link";

import { CLAIM_STATUS } from "@/domain/status";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
  EmptyState,
  Stat,
} from "@/components/ui/surface";

import { Identifier, StatusBadge } from "@/components/ui/badge";

import { Amount, FigureRow } from "@/components/ui/money";

import { formatCents, formatCount, formatDate, plural } from "@/lib/format";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { getPropertyById } from "@/server/opportunity-store";

import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";

import {
  getCommercialApprovalByQuoteId,
  verifyCommercialQuoteSnapshot,
} from "@/server/commercial-approval-store";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Recoveries",
};

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "Not applicable";
  }

  const percentage = value * 100;

  return Number.isInteger(percentage)
    ? `${percentage.toFixed(0)}%`
    : `${percentage.toFixed(2)}%`;
}

function custodianLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProRecoveriesPage() {
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

  const conversions = await listOpportunityConversions();

  const rows = (
    await Promise.all(
      conversions.map(async (conversion) => {
        const resolved = await resolveClaimRecord(conversion.claimId);

        if (!resolved) {
          return undefined;
        }

        const claim = resolved.claim;

        const [property, onboarding, approval] = await Promise.all([
          getPropertyById(claim.propertyId),

          getClaimantOnboarding(claim.id),

          getCommercialApprovalByQuoteId(conversion.commercialQuoteId),
        ]);

        const lockedQuote =
          approval &&
          approval.approvalStatus === "locked" &&
          verifyCommercialQuoteSnapshot(approval)
            ? approval.quoteSnapshot
            : undefined;

        return {
          conversion,
          claim,
          property,
          onboarding,
          approval,
          lockedQuote,
        };
      }),
    )
  ).flatMap((row) => (row ? [row] : []));

  /* ======================================================================== */
  /* Recovery classifications                                                 */
  /* ======================================================================== */

  /*
   * Paid and closed claims with a confirmed recovery are the only records
   * counted as completed recoveries.
   *
   * We deliberately do not infer payment from a quote, an opportunity amount,
   * or a filing state.
   */
  const completedRecoveries = rows.filter(
    ({ claim }) =>
      (claim.status === "paid" || claim.status === "closed") &&
      Boolean(claim.confirmedRecovery),
  );

  /*
   * Agency-approved claims are real confirmed value, but they are still
   * awaiting the payment stage.
   */
  const approvedInFlight = rows.filter(
    ({ claim }) =>
      claim.status === "approved" && Boolean(claim.confirmedRecovery),
  );

  const grossRecovered = completedRecoveries.reduce(
    (total, { claim }) => total + (claim.confirmedRecovery?.amount ?? 0),
    0,
  );

  /*
   * This is intentionally labelled quoted fees, not earned fees.
   *
   * Duequity does not yet persist fee invoices or fee-settlement events.
   */
  const lockedQuotedFees = completedRecoveries.reduce(
    (total, { lockedQuote }) => total + (lockedQuote?.projectedFee ?? 0),
    0,
  );

  const quotedClaimantNet = completedRecoveries.reduce(
    (total, { lockedQuote }) =>
      total + (lockedQuote?.projectedClaimantNet ?? 0),
    0,
  );

  const approvedInFlightAmount = approvedInFlight.reduce(
    (total, { claim }) => total + (claim.confirmedRecovery?.amount ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Pipeline</p>

          <h1 className="mt-1.5 text-2xl">Recoveries</h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Agency-approved, paid and completed recovery outcomes derived from
            persisted claim records. Duequity does not record a recovery as paid
            until the claim itself reaches the paid or closed stage.
          </p>
        </div>
      </div>

      {/* ================================================================= stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Confirmed recovered"
          value={formatCents(grossRecovered)}
          tone={grossRecovered > 0 ? "positive" : "default"}
          context={`${formatCount(
            completedRecoveries.length,
          )} completed ${plural(
            completedRecoveries.length,
            "recovery",
            "recoveries",
          )}`}
        />

        <Stat
          label="Quoted claimant net"
          value={formatCents(quotedClaimantNet)}
          context="From verified locked commercial pricing snapshots"
        />

        <Stat
          label="Locked quoted fees"
          value={formatCents(lockedQuotedFees)}
          context="Commercial obligation only, not fee-payment confirmation"
        />

        <Stat
          label="Approved, awaiting payment"
          value={formatCents(approvedInFlightAmount)}
          tone={approvedInFlight.length > 0 ? "caution" : "positive"}
          context={`${formatCount(approvedInFlight.length)} ${plural(
            approvedInFlight.length,
            "claim",
          )}`}
        />
      </div>

      {/* ========================================================= money policy */}
      <Callout tone="neutral" title="How claimant funds are treated">
        <p>
          Duequity is not the payee on an agency recovery and does not take
          custody of claimant funds. The government agency, court, trustee, or
          other responsible custodian pays the claimant, estate, or appropriate
          attorney trust account directly. Duequity&apos;s service fee is a
          separate contractual obligation.
        </p>
      </Callout>

      {/* ================================================= approved in flight */}
      {approvedInFlight.length > 0 && (
        <Card>
          <CardHeader
            title="Approved, awaiting payment"
            description="The agency outcome is recorded, but the claim has not yet reached the paid stage."
          />

          <CardBody flush>
            <ul className="divide-y divide-line-subtle">
              {approvedInFlight.map(({ claim, property, onboarding }) => {
                const recovery = claim.confirmedRecovery;

                if (!recovery) {
                  return null;
                }

                return (
                  <li key={claim.id}>
                    <Link
                      href={`/pro/claims/${claim.id}`}
                      className="block px-4 py-3.5 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-accent-700">
                              {claim.reference}
                            </span>

                            <StatusBadge status={CLAIM_STATUS[claim.status]} />
                          </div>

                          <p className="mt-1 text-sm font-medium text-ink-900">
                            {property?.address.line1 ?? "Property not recorded"}
                          </p>

                          <p className="mt-0.5 text-xs text-ink-500">
                            {onboarding?.claimant.legalName ??
                              "Claimant not recorded"}

                            {claim.agencyContactName && (
                              <>
                                {" / "}
                                {claim.agencyContactName}
                              </>
                            )}
                          </p>
                        </div>

                        <Amount
                          cents={recovery.amount}
                          size="md"
                          tone="positive"
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* ================================================= completed recovery */}
      {completedRecoveries.length === 0 ? (
        <EmptyState
          title="No completed recoveries yet"
          description="Paid and closed claims with a confirmed recovery amount will appear here. Duequity does not fabricate settlement records from opportunity or pricing data."
        />
      ) : (
        <div className="space-y-5">
          {completedRecoveries.map(
            ({
              conversion,
              claim,
              property,
              onboarding,
              approval,
              lockedQuote,
            }) => {
              const recovery = claim.confirmedRecovery;

              if (!recovery) {
                return null;
              }

              return (
                <Card key={claim.id}>
                  <CardHeader
                    eyebrow={
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/pro/claims/${claim.id}`}
                          className="font-mono text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                        >
                          {claim.reference}
                        </Link>

                        {property?.address.state && (
                          <span className="text-ink-400">
                            {property.address.state}
                          </span>
                        )}
                      </span>
                    }
                    title={property?.address.line1 ?? claim.reference}
                    description={
                      onboarding?.claimant.legalName
                        ? `${onboarding.claimant.legalName} / ${
                            claim.agencyContactName ??
                            custodianLabel(claim.custodian)
                          }`
                        : (claim.agencyContactName ??
                          custodianLabel(claim.custodian))
                    }
                    actions={
                      <StatusBadge status={CLAIM_STATUS[claim.status]} />
                    }
                  />

                  <CardBody>
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
                      {/* ============================================== accounting */}
                      <div>
                        <p className="eyebrow text-ink-500">
                          Recovery accounting
                        </p>

                        <div className="mt-2">
                          <FigureRow
                            label="Confirmed recovery"
                            note={
                              recovery.asOf
                                ? `Confirmed as of ${formatDate(recovery.asOf)}`
                                : "Confirmation date not recorded"
                            }
                          >
                            <Amount
                              cents={recovery.amount}
                              size="lg"
                              tone="positive"
                            />
                          </FigureRow>

                          {lockedQuote && (
                            <>
                              <FigureRow
                                label="Locked quoted service fee"
                                sign="subtract"
                                note="Separate contractual fee obligation"
                              >
                                <Amount
                                  cents={lockedQuote.projectedFee}
                                  tone="negative"
                                />
                              </FigureRow>

                              <FigureRow
                                label="Quoted claimant economic net"
                                emphasis
                              >
                                <Amount
                                  cents={lockedQuote.projectedClaimantNet}
                                  size="lg"
                                  tone="positive"
                                />
                              </FigureRow>
                            </>
                          )}
                        </div>

                        {lockedQuote ? (
                          <DataList columns={2} className="mt-4">
                            <DataItem label="Pricing model">
                              {lockedQuote.model.replaceAll("_", " ")}
                            </DataItem>

                            <DataItem label="Approved rate">
                              {formatPercent(lockedQuote.selectedPercentage)}
                            </DataItem>

                            <DataItem label="Commercial quote">
                              <Identifier>
                                {conversion.commercialQuoteId}
                              </Identifier>
                            </DataItem>

                            <DataItem label="Fee agreement">
                              <Identifier>
                                {conversion.feeAgreementId}
                              </Identifier>
                            </DataItem>

                            <DataItem label="Pricing snapshot" span>
                              <span className="break-all font-mono text-xs text-ink-600">
                                {conversion.commercialSnapshotHash}
                              </span>
                            </DataItem>
                          </DataList>
                        ) : (
                          <Callout
                            tone="caution"
                            className="mt-4"
                            title="Locked pricing unavailable"
                          >
                            <p>
                              This claim does not currently have a verified
                              locked commercial pricing snapshot available for
                              recovery accounting. No service fee is inferred.
                            </p>
                          </Callout>
                        )}

                        {claim.attorneyAssignment && (
                          <div className="mt-4 rounded-md border border-counsel-200 bg-counsel-50 px-3.5 py-3">
                            <p className="eyebrow text-counsel-700">
                              Independent legal fee
                            </p>

                            {claim.attorneyAssignment.independentLegalFee
                              ?.amount ? (
                              <div className="mt-1.5">
                                <Amount
                                  cents={
                                    claim.attorneyAssignment.independentLegalFee
                                      .amount
                                  }
                                  size="md"
                                />
                              </div>
                            ) : (
                              <p className="mt-1.5 text-sm text-ink-600">
                                No independent legal fee amount is recorded.
                              </p>
                            )}

                            <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                              Any independent counsel fee belongs to the
                              claimant&apos;s separate relationship with counsel
                              and is not Duequity revenue.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* ============================================== settlement */}
                      <div>
                        <p className="eyebrow text-ink-500">Recovery record</p>

                        <DataList className="mt-2">
                          <DataItem label="Claim status">
                            <StatusBadge status={CLAIM_STATUS[claim.status]} />
                          </DataItem>

                          <DataItem label="Confirmed amount">
                            <span className="font-semibold text-ink-900">
                              {formatCents(recovery.amount)}
                            </span>
                          </DataItem>

                          <DataItem label="Confirmation date">
                            {recovery.asOf
                              ? formatDate(recovery.asOf)
                              : "Not recorded"}
                          </DataItem>

                          <DataItem label="Agency reference">
                            {claim.agencyReference ? (
                              <Identifier>{claim.agencyReference}</Identifier>
                            ) : (
                              "Not recorded"
                            )}
                          </DataItem>

                          <DataItem label="Responsible custodian">
                            {claim.agencyContactName ??
                              custodianLabel(claim.custodian)}
                          </DataItem>

                          <DataItem label="Last activity">
                            {formatDate(claim.lastActivityAt)}
                          </DataItem>

                          <DataItem label="File closed">
                            {claim.closedAt
                              ? formatDate(claim.closedAt)
                              : "Not yet closed"}
                          </DataItem>

                          <DataItem label="Commercial lock">
                            {approval?.lockedAt
                              ? formatDate(approval.lockedAt.slice(0, 10))
                              : "Not recorded"}
                          </DataItem>
                        </DataList>

                        <Callout
                          tone="neutral"
                          className="mt-4"
                          title="Payment details are not inferred"
                        >
                          <p>
                            Duequity does not currently have a persisted
                            settlement ledger for payment instruments, clearing
                            dates, agency deductions, fee invoices, or fee
                            receipts. Therefore this page does not invent check
                            numbers, ACH transfers, payment destinations, or
                            settlement dates.
                          </p>
                        </Callout>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            },
          )}
        </div>
      )}

      {/* ============================================================ boundary */}
      <Callout tone="neutral" title="Current recovery boundary">
        <p>
          For the current MVP, the persisted claim is the authoritative recovery
          lifecycle record. A dedicated settlement ledger should only be
          introduced when Duequity needs to record actual agency disbursement
          confirmation, invoicing, fee settlement, closing statements, or
          related accounting events. Until then, those facts are intentionally
          left unrecorded rather than simulated.
        </p>
      </Callout>
    </div>
  );
}