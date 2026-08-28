import type { Metadata } from "next";

import Link from "next/link";

import {
  can,
} from "@/lib/session";

import {
  Badge,
  Identifier,
} from "@/components/ui/badge";

import {
  Amount,
  FigureRow,
} from "@/components/ui/money";

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

import {
  StaffAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  formatCents,
  formatCount,
  formatTimestamp,
  plural,
} from "@/lib/format";

import {
  getClaimAuthorityReviewByClaimId,
} from "@/server/claim-authority-review-store";

import {
  getClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import {
  getClaimRecoverySettlementByClaimId,
  getRecoveryFeeInvoiceBySettlementId,
  listRecoveryFeePayments,
} from "@/server/claim-recovery-settlement-store";

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

export const metadata: Metadata = {
  title:
    "Recoveries",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function humanize(
  value:
    string,
): string {
  return value
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (
        character,
      ) =>
        character.toUpperCase(),
    );
}

function settlementStatusLabel(
  value:
    string,
): string {
  switch (
    value
  ) {
    case "no_fee_due":
      return "No fee due";

    case "awaiting_invoice":
      return "Awaiting invoice";

    case "invoice_open":
      return "Invoice open";

    case "partially_paid":
      return "Fee partially paid";

    case "fee_settled":
      return "Fee settled";

    case "reconciled":
      return "Reconciled";

    default:
      return humanize(
        value,
      );
  }
}

function settlementStatusTone(
  value:
    string,
):
  | "positive"
  | "caution"
  | "neutral" {
  switch (
    value
  ) {
    case "no_fee_due":
    case "fee_settled":
    case "reconciled":
      return "positive";

    case "awaiting_invoice":
    case "invoice_open":
    case "partially_paid":
      return "caution";

    default:
      return "neutral";
  }
}

function authorityStatusLabel(
  value:
    string,
): string {
  switch (
    value
  ) {
    case "approved":
      return "Approved, awaiting payment";

    case "payment_issued":
      return "Payment issued, awaiting recovery";

    default:
      return humanize(
        value,
      );
  }
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProRecoveriesPage() {
  const session =
    await resolveStaffSession();

  if (!session) {
    return (
      <StaffAuthenticationRequired />
    );
  }

  if (
    !can(
      session,
      "recovery.read",
    )
  ) {
    return (
      <div className="space-y-5">
        <div>
          <p className="eyebrow text-ink-500">
            Pipeline
          </p>

          <h1 className="mt-1.5 text-2xl">
            Recoveries
          </h1>
        </div>

        <Callout
          tone="critical"
          title="Recovery access required"
        >
          <p>
            Your current staff role does not permit access to recovery
            accounting.
          </p>
        </Callout>
      </div>
    );
  }

  const conversions =
    await listOpportunityConversions();

  const rows =
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

            if (!resolved) {
              return undefined;
            }

            const claim =
              resolved.claim;

            const [
              property,
              onboarding,
              authorityReview,
              settlement,
            ] =
              await Promise.all([
                getPropertyById(
                  claim.propertyId,
                ),

                getClaimantOnboarding(
                  claim.id,
                ),

                getClaimAuthorityReviewByClaimId(
                  claim.id,
                ),

                getClaimRecoverySettlementByClaimId(
                  claim.id,
                ),
              ]);

            const invoice =
              settlement
                ? await getRecoveryFeeInvoiceBySettlementId(
                    settlement.id,
                  )
                : undefined;

            const payments =
              invoice
                ? await listRecoveryFeePayments(
                    invoice.id,
                  )
                : [];

            return {
              conversion,

              claim,

              property,

              onboarding,

              authorityReview,

              settlement,

              invoice,

              payments,
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
  /* Durable classifications                                                  */
  /* ======================================================================== */

  const awaitingRecovery =
    rows.filter(
      (
        {
          authorityReview,
          settlement,
        },
      ) =>
        !settlement &&
        (
          authorityReview?.status ===
            "approved" ||
          authorityReview?.status ===
            "payment_issued"
        ),
    );

  const recoveries =
    rows.filter(
      (
        row,
      ) =>
        Boolean(
          row.settlement,
        ),
    );

  const grossRecovered =
    recoveries.reduce(
      (
        total,
        {
          settlement,
        },
      ) =>
        total +
        (
          settlement?.grossRecoveryCents ??
          0
        ),
      0,
    );

  const earnedServiceFees =
    recoveries.reduce(
      (
        total,
        {
          settlement,
        },
      ) =>
        total +
        (
          settlement?.calculatedServiceFeeCents ??
          0
        ),
      0,
    );

  const collectedServiceFees =
    recoveries.reduce(
      (
        total,
        {
          invoice,
        },
      ) =>
        total +
        (
          invoice?.amountPaidCents ??
          0
        ),
      0,
    );

  const outstandingServiceFees =
    recoveries.reduce(
      (
        total,
        {
          settlement,
          invoice,
        },
      ) => {
        if (!settlement) {
          return total;
        }

        if (
          settlement.calculatedServiceFeeCents ===
          0
        ) {
          return total;
        }

        if (!invoice) {
          return (
            total +
            settlement.calculatedServiceFeeCents
          );
        }

        return (
          total +
          invoice.balanceDueCents
        );
      },
      0,
    );

  const claimantEconomicNet =
    recoveries.reduce(
      (
        total,
        {
          settlement,
        },
      ) =>
        total +
        (
          settlement?.claimantEconomicNetCents ??
          0
        ),
      0,
    );

  const reconciledRecoveries =
    recoveries.filter(
      (
        {
          settlement,
        },
      ) =>
        settlement?.status ===
        "reconciled",
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">
            Pipeline
          </p>

          <h1 className="mt-1.5 text-2xl">
            Recoveries
          </h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Durable authority outcomes, actual recoveries, DueQuity
            service-fee settlement, and final reconciliation.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Actual recovered"
          value={
            formatCents(
              grossRecovered,
            )
          }
          tone={
            grossRecovered >
            0
              ? "positive"
              : "default"
          }
          context={`${formatCount(
            recoveries.length,
          )} actual ${plural(
            recoveries.length,
            "recovery",
            "recoveries",
          )}`}
        />

        <Stat
          label="DueQuity fees earned"
          value={
            formatCents(
              earnedServiceFees,
            )
          }
          context="Calculated from actual recovered amounts and frozen fee terms"
        />

        <Stat
          label="DueQuity fees collected"
          value={
            formatCents(
              collectedServiceFees,
            )
          }
          tone={
            collectedServiceFees >
            0
              ? "positive"
              : "default"
          }
          context={`${formatCents(
            outstandingServiceFees,
          )} currently outstanding`}
        />

        <Stat
          label="Claimant economic net"
          value={
            formatCents(
              claimantEconomicNet,
            )
          }
          context={`${formatCount(
            reconciledRecoveries.length,
          )} reconciled ${plural(
            reconciledRecoveries.length,
            "recovery",
            "recoveries",
          )}`}
        />
      </div>

      <Callout
        tone="neutral"
        title="Claimant recovery and DueQuity fees remain separate"
      >
        <p>
          A recovery is counted here only after actual recovery is durably
          recorded. DueQuity does not treat authority approval, payment
          issuance, a quoted recovery amount, or a service agreement as proof
          that money was received.
        </p>

        <p className="mt-2">
          Where the approved jurisdiction route pays the claimant or lawful
          estate representative directly, those recovery funds do not become
          DueQuity funds. DueQuity&apos;s contractual service fee is separately
          invoiced and separately tracked only after recovery.
        </p>
      </Callout>

      {
        awaitingRecovery.length >
          0 &&
        (
          <Card>
            <CardHeader
              title="Approved or payment issued"
              description="Durable authority outcomes that have not yet reached actual recovery."
            />

            <CardBody flush>
              <ul className="divide-y divide-line-subtle">
                {
                  awaitingRecovery.map(
                    (
                      {
                        claim,
                        property,
                        onboarding,
                        authorityReview,
                      },
                    ) => {
                      if (
                        !authorityReview
                      ) {
                        return null;
                      }

                      return (
                        <li
                          key={
                            claim.id
                          }
                        >
                          <Link
                            href={`/pro/claims/${claim.id}`}
                            className="block px-4 py-3.5 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs text-accent-700">
                                    {
                                      claim.reference
                                    }
                                  </span>

                                  <Badge
                                    tone={
                                      authorityReview.status ===
                                        "payment_issued"
                                        ? "positive"
                                        : "caution"
                                    }
                                  >
                                    {
                                      authorityStatusLabel(
                                        authorityReview.status,
                                      )
                                    }
                                  </Badge>
                                </div>

                                <p className="mt-1 text-sm font-medium text-ink-900">
                                  {
                                    property
                                      ?.address
                                      .line1 ??
                                    "Property not recorded"
                                  }
                                </p>

                                <p className="mt-0.5 text-xs text-ink-500">
                                  {
                                    onboarding
                                      ?.claimant
                                      .legalName ??
                                    "Claimant not recorded"
                                  }
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-sm font-semibold text-ink-900">
                                  {
                                    authorityReview.paymentAmountCents !==
                                    undefined
                                      ? formatCents(
                                          authorityReview.paymentAmountCents,
                                        )
                                      : authorityReview.approvedAmountCents !==
                                          undefined
                                        ? formatCents(
                                            authorityReview.approvedAmountCents,
                                          )
                                        : "Amount not recorded"
                                  }
                                </p>

                                <p className="mt-1 text-xs text-ink-500">
                                  {
                                    authorityReview.status ===
                                      "payment_issued"
                                      ? "Authority payment issuance"
                                      : "Authority-approved amount"
                                  }
                                </p>
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    },
                  )
                }
              </ul>
            </CardBody>
          </Card>
        )
      }

      {
        recoveries.length ===
          0
          ? (
              <EmptyState
                title="No actual recoveries yet"
                description="A recovery will appear here only after the durable authority-review lifecycle records actual receipt. Claim readiness, approval, and payment issuance do not create a recovery settlement."
              />
            )
          : (
              <div className="space-y-5">
                {
                  recoveries.map(
                    (
                      {
                        conversion,
                        claim,
                        property,
                        onboarding,
                        settlement,
                        invoice,
                        payments,
                      },
                    ) => {
                      if (
                        !settlement
                      ) {
                        return null;
                      }

                      const postedPayments =
                        payments.filter(
                          (
                            payment,
                          ) =>
                            payment.status ===
                            "posted",
                        );

                      const voidedPayments =
                        payments.filter(
                          (
                            payment,
                          ) =>
                            payment.status ===
                            "voided",
                        );

                      return (
                        <Card
                          key={
                            settlement.id
                          }
                        >
                          <CardHeader
                            eyebrow={
                              <span className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/pro/claims/${claim.id}`}
                                  className="font-mono text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                                >
                                  {
                                    claim.reference
                                  }
                                </Link>

                                {
                                  property
                                    ?.address
                                    .state &&
                                  (
                                    <span className="text-ink-400">
                                      {
                                        property.address.state
                                      }
                                    </span>
                                  )
                                }
                              </span>
                            }
                            title={
                              property
                                ?.address
                                .line1 ??
                              claim.reference
                            }
                            description={
                              onboarding
                                ?.claimant
                                .legalName ??
                              "Claimant not recorded"
                            }
                            actions={
                              <Badge
                                tone={
                                  settlementStatusTone(
                                    settlement.status,
                                  )
                                }
                                size="md"
                              >
                                {
                                  settlementStatusLabel(
                                    settlement.status,
                                  )
                                }
                              </Badge>
                            }
                          />

                          <CardBody>
                            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
                              <div>
                                <p className="eyebrow text-ink-500">
                                  Recovery economics
                                </p>

                                <div className="mt-2">
                                  <FigureRow
                                    label="Actual recovery"
                                    note={`Recovered ${formatTimestamp(
                                      settlement.recoveredAt,
                                    )}`}
                                  >
                                    <Amount
                                      cents={
                                        settlement.grossRecoveryCents
                                      }
                                      size="lg"
                                      tone="positive"
                                    />
                                  </FigureRow>

                                  <FigureRow
                                    label="DueQuity service fee"
                                    sign="subtract"
                                    note="Calculated from actual recovery and frozen fee terms"
                                  >
                                    <Amount
                                      cents={
                                        settlement.calculatedServiceFeeCents
                                      }
                                      tone="negative"
                                    />
                                  </FigureRow>

                                  <FigureRow
                                    label="Claimant economic net"
                                    emphasis
                                  >
                                    <Amount
                                      cents={
                                        settlement.claimantEconomicNetCents
                                      }
                                      size="lg"
                                      tone="positive"
                                    />
                                  </FigureRow>
                                </div>

                                <DataList
                                  columns={2}
                                  className="mt-4"
                                >
                                  <DataItem label="Payment route">
                                    {
                                      humanize(
                                        settlement.paymentRoute,
                                      )
                                    }
                                  </DataItem>

                                  <DataItem label="Recovery track">
                                    {
                                      humanize(
                                        settlement.launchPaymentTrack,
                                      )
                                    }
                                  </DataItem>

                                  <DataItem label="Fee collection">
                                    {
                                      humanize(
                                        settlement.feeCollectionMethod,
                                      )
                                    }
                                  </DataItem>

                                  <DataItem label="Representative may receive">
                                    {
                                      settlement.representativeMayReceivePayment ===
                                      "yes"
                                        ? "Yes"
                                        : "No"
                                    }
                                  </DataItem>

                                  <DataItem label="Commercial quote">
                                    <Identifier>
                                      {
                                        settlement.commercialQuoteId
                                      }
                                    </Identifier>
                                  </DataItem>

                                  <DataItem label="Fee agreement">
                                    <Identifier>
                                      {
                                        settlement.feeAgreementId
                                      }
                                    </Identifier>
                                  </DataItem>

                                  <DataItem
                                    label="Settlement"
                                    span
                                  >
                                    <Identifier>
                                      {
                                        settlement.id
                                      }
                                    </Identifier>
                                  </DataItem>
                                </DataList>
                              </div>

                              <div>
                                <p className="eyebrow text-ink-500">
                                  DueQuity fee ledger
                                </p>

                                {
                                  settlement.calculatedServiceFeeCents ===
                                  0
                                    ? (
                                        <Callout
                                          tone="positive"
                                          className="mt-2"
                                          title="No service fee due"
                                        >
                                          <p>
                                            The actual recovery resulted in a
                                            $0 DueQuity service fee. No fee
                                            invoice is required.
                                          </p>
                                        </Callout>
                                      )
                                    : invoice
                                      ? (
                                          <>
                                            <DataList className="mt-2">
                                              <DataItem label="Invoice">
                                                <Identifier>
                                                  {
                                                    invoice.invoiceNumber
                                                  }
                                                </Identifier>
                                              </DataItem>

                                              <DataItem label="Invoice status">
                                                <Badge
                                                  tone={
                                                    invoice.balanceDueCents ===
                                                    0
                                                      ? "positive"
                                                      : "caution"
                                                  }
                                                >
                                                  {
                                                    humanize(
                                                      invoice.status,
                                                    )
                                                  }
                                                </Badge>
                                              </DataItem>

                                              <DataItem label="Invoice amount">
                                                <span className="font-semibold text-ink-900">
                                                  {
                                                    formatCents(
                                                      invoice.invoiceAmountCents,
                                                    )
                                                  }
                                                </span>
                                              </DataItem>

                                              <DataItem label="Collected">
                                                {
                                                  formatCents(
                                                    invoice.amountPaidCents,
                                                  )
                                                }
                                              </DataItem>

                                              <DataItem label="Waived">
                                                {
                                                  formatCents(
                                                    invoice.amountWaivedCents,
                                                  )
                                                }
                                              </DataItem>

                                              <DataItem label="Balance due">
                                                <span
                                                  className={
                                                    invoice.balanceDueCents >
                                                    0
                                                      ? "font-semibold text-caution-800"
                                                      : "font-semibold text-accent-800"
                                                  }
                                                >
                                                  {
                                                    formatCents(
                                                      invoice.balanceDueCents,
                                                    )
                                                  }
                                                </span>
                                              </DataItem>

                                              <DataItem label="Issued">
                                                {
                                                  formatTimestamp(
                                                    invoice.issuedAt,
                                                  )
                                                }
                                              </DataItem>

                                              <DataItem label="Settled">
                                                {
                                                  invoice.settledAt
                                                    ? formatTimestamp(
                                                        invoice.settledAt,
                                                      )
                                                    : "Not yet settled"
                                                }
                                              </DataItem>
                                            </DataList>

                                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                              <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                                                <p className="eyebrow text-ink-500">
                                                  Posted payments
                                                </p>

                                                <p className="mt-1 text-lg font-semibold text-ink-900">
                                                  {
                                                    formatCount(
                                                      postedPayments.length,
                                                    )
                                                  }
                                                </p>
                                              </div>

                                              <div className="rounded-md border border-line bg-inset px-3.5 py-3">
                                                <p className="eyebrow text-ink-500">
                                                  Voided payments
                                                </p>

                                                <p className="mt-1 text-lg font-semibold text-ink-900">
                                                  {
                                                    formatCount(
                                                      voidedPayments.length,
                                                    )
                                                  }
                                                </p>
                                              </div>
                                            </div>
                                          </>
                                        )
                                      : (
                                          <Callout
                                            tone="caution"
                                            className="mt-2"
                                            title="Fee invoice not yet issued"
                                          >
                                            <p>
                                              Actual recovery is recorded and a
                                              DueQuity service fee is due, but
                                              the contractual fee invoice has
                                              not yet been issued.
                                            </p>
                                          </Callout>
                                        )
                                }

                                {
                                  settlement.status ===
                                    "reconciled" &&
                                  (
                                    <Callout
                                      tone="positive"
                                      className="mt-4"
                                      title="Recovery reconciled"
                                    >
                                      <p>
                                        {
                                          settlement.reconciliationSummary ??
                                          "Final recovery reconciliation is complete."
                                        }
                                      </p>

                                      {
                                        settlement.reconciledAt &&
                                        (
                                          <p className="mt-2 text-xs">
                                            Reconciled{" "}
                                            {
                                              formatTimestamp(
                                                settlement.reconciledAt,
                                              )
                                            }
                                          </p>
                                        )
                                      }
                                    </Callout>
                                  )
                                }
                              </div>
                            </div>

                            <div className="mt-5 border-t border-line pt-4">
                              <p className="text-xs leading-relaxed text-ink-500">
                                Durable claim ledger source:{" "}
                                <span className="font-mono">
                                  {
                                    conversion.claimId
                                  }
                                </span>
                                . Actual recovery and fee accounting shown here
                                come from the durable recovery settlement ledger,
                                not from legacy claim-status inference.
                              </p>
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
        tone="neutral"
        title="Recovery accounting boundary"
      >
        <p>
          Authority approval and payment issuance are operational milestones,
          not proof of actual recovery. The Stage 22 settlement ledger begins
          only when recovery is durably recorded. DueQuity service fees are then
          calculated from the actual recovered amount and are not treated as
          collected until an actual fee payment is recorded.
        </p>
      </Callout>
    </div>
  );
}