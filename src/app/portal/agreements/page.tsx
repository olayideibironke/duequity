import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  ClaimantAuthenticationRequired,
} from "@/components/ui/authentication-required";

import {
  Card,
  CardBody,
  CardHeader,
} from "@/components/ui/surface";

import {
  Identifier,
} from "@/components/ui/badge";

import {
  listClaimantAgreementsForPortal,
  type ClaimantAgreementEnvelopeView,
} from "@/server/claimant-agreement-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

export const metadata:
  Metadata = {
  title:
    "Agreements",
};

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

function money(
  cents: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  ).format(
    cents /
      100,
  );
}

function percent(
  value:
    number | undefined,
): string {
  if (
    value ===
    undefined
  ) {
    return "—";
  }

  const percentage =
    value *
    100;

  return Number.isInteger(
    percentage,
  )
    ? `${percentage.toFixed(
        0,
      )}%`
    : `${percentage.toFixed(
        2,
      )}%`;
}

function dateTime(
  value:
    string | undefined,
): string {
  if (!value) {
    return "—";
  }

  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    },
  ).format(
    parsed,
  );
}

function humanize(
  value: string,
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

function feeLabel(
  agreement:
    ClaimantAgreementEnvelopeView,
): string {
  const schedule =
    agreement.schedule;

  if (
    schedule.feeModel ===
    "percentage"
  ) {
    return `${percent(
      schedule.selectedPercentage,
    )} of actual recovery`;
  }

  if (
    schedule.feeModel ===
    "flat"
  ) {
    return schedule
      .selectedFlatAmountCents ===
      undefined
      ? "Flat service fee"
      : `${money(
          schedule
            .selectedFlatAmountCents,
        )} flat service fee`;
  }

  return schedule
    .selectedPercentage ===
    undefined
    ? "Capped success fee"
    : `${percent(
        schedule
          .selectedPercentage,
      )} capped success fee`;
}

/* ========================================================================== */
/* Status                                                                      */
/* ========================================================================== */

function statusLabel(
  status:
    ClaimantAgreementEnvelopeView["status"],
): string {
  switch (
    status
  ) {
    case "issued":
      return "Ready for review";

    case "opened":
      return "In review";

    case "consented":
      return "Ready to sign";

    case "signed":
      return "Signed";

    case "submitted":
      return "Completed";

    case "superseded":
      return "Replaced";

    case "voided":
      return "Voided";

    case "draft":
      return "Preparing";
  }
}

function statusClasses(
  status:
    ClaimantAgreementEnvelopeView["status"],
): string {
  if (
    status ===
      "signed" ||
    status ===
      "submitted"
  ) {
    return [
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-800",
    ].join(
      " ",
    );
  }

  if (
    status ===
      "issued" ||
    status ===
      "opened" ||
    status ===
      "consented"
  ) {
    return [
      "border-amber-200",
      "bg-amber-50",
      "text-amber-800",
    ].join(
      " ",
    );
  }

  return [
    "border-ink-200",
    "bg-ink-50",
    "text-ink-600",
  ].join(
    " ",
  );
}

function actionLabel(
  status:
    ClaimantAgreementEnvelopeView["status"],
): string {
  switch (
    status
  ) {
    case "issued":
      return "Review Agreement";

    case "opened":
      return "Continue Review";

    case "consented":
      return "Continue to Signature";

    case "signed":
    case "submitted":
      return "View Signed Agreement";

    default:
      return "View Agreement";
  }
}

/* ========================================================================== */
/* Summary cell                                                                */
/* ========================================================================== */

function SummaryValue({
  label,
  value,
  emphasis = false,
}: {
  label: string;

  value: string;

  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </dt>

      <dd
        className={[
          "mt-1",
          emphasis
            ? "text-lg font-semibold text-ink-950"
            : "text-sm font-semibold text-ink-800",
        ].join(
          " ",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function PortalAgreementsPage() {
  const session =
    await resolveClaimantSession();

  if (!session) {
    return (
      <ClaimantAuthenticationRequired />
    );
  }

  const agreements =
    await listClaimantAgreementsForPortal(
      session.claimantId,
    );

  const activeAgreements =
    agreements.filter(
      (
        agreement,
      ) =>
        agreement.status !==
          "voided" &&
        agreement.status !==
          "superseded",
    );

  const historicalAgreements =
    agreements.filter(
      (
        agreement,
      ) =>
        agreement.status ===
          "voided" ||
        agreement.status ===
          "superseded",
    );

  return (
    <div className="space-y-6">
      {/* ================================================================= header */}

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
          My DueQuity
        </p>

        <h1 className="mt-1 text-2xl sm:text-3xl">
          Agreements
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-600 sm:text-base">
          Review your recovery information, DueQuity service fee and agreement
          terms before electronically signing. Your agreement information comes
          directly from your DueQuity recovery record.
        </p>
      </div>

      {/* ================================================================ notice */}

      <div className="rounded-xl border border-ink-200 bg-white px-4 py-4 sm:px-5">
        <p className="text-sm font-semibold text-ink-900">
          Review before you sign
        </p>

        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
          Your use of DueQuity is voluntary. Review the recovery amount, fee,
          projected amount to you, payment route and full agreement before
          providing electronic consent or a signature.
        </p>
      </div>

      {/* ======================================================= no agreements */}

      {agreements.length ===
      0 ? (
        <Card>
          <CardHeader
            title="No agreements waiting"
            description="No Recovery Services Agreement has been issued to this claimant account."
          />

          <CardBody>
            <p className="text-sm leading-relaxed text-ink-600">
              When a DueQuity agreement is ready for your review, it will
              appear here. You do not need to sign anything that is not
              presented inside your authenticated DueQuity portal.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/portal/claims"
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                View my claims
              </Link>

              <Link
                href="/portal/messages"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                Messages
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* ================================================= current agreements */}

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                  Current
                </p>

                <h2 className="mt-1 text-lg font-semibold text-ink-950">
                  Recovery agreements
                </h2>
              </div>

              <p className="text-xs text-ink-500">
                {activeAgreements.length} active
              </p>
            </div>

            {activeAgreements.length ===
            0 ? (
              <div className="mt-3 rounded-xl border border-ink-200 bg-white p-5">
                <p className="text-sm text-ink-600">
                  There are no current agreements requiring action.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                {activeAgreements.map(
                  (
                    agreement,
                  ) => {
                    const schedule =
                      agreement.schedule;

                    return (
                      <article
                        key={
                          agreement.id
                        }
                        className="overflow-hidden rounded-2xl border border-ink-200 bg-paper shadow-sm"
                      >
                        <div className="border-b border-ink-100 bg-white px-5 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
                                Claim{" "}
                                {
                                  agreement.claimReference
                                }
                              </p>

                              <h3 className="mt-1 text-lg font-semibold text-ink-950">
                                {
                                  agreement.title
                                }
                              </h3>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Identifier>
                                  {
                                    agreement.claimantReference
                                  }
                                </Identifier>

                                {agreement.training && (
                                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-700">
                                    Training
                                  </span>
                                )}
                              </div>
                            </div>

                            <span
                              className={[
                                "w-fit",
                                "shrink-0",
                                "rounded-full",
                                "border",
                                "px-3",
                                "py-1.5",
                                "text-[11px]",
                                "font-semibold",
                                "uppercase",
                                "tracking-[0.08em]",
                                statusClasses(
                                  agreement.status,
                                ),
                              ].join(
                                " ",
                              )}
                            >
                              {statusLabel(
                                agreement.status,
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="px-5 py-5">
                          {/* ======================================== big recovery */}

                          <div className="rounded-2xl border border-ink-100 bg-white p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                              {schedule.recoveryBasis ===
                              "confirmed"
                                ? "Confirmed recovery"
                                : "Estimated recovery"}
                            </p>

                            <p className="mt-1 text-3xl font-semibold tracking-tight text-ink-950">
                              {money(
                                schedule
                                  .recoveryAmountCents,
                              )}
                            </p>

                            {schedule.recoveryBasis ===
                              "estimated" && (
                              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-amber-700">
                                This amount is currently an estimate. The final
                                amount may change when the responsible agency,
                                court or custodian determines the amount
                                actually payable.
                              </p>
                            )}
                          </div>

                          {/* =========================================== fee summary */}

                          <dl className="mt-4 grid gap-4 rounded-2xl border border-ink-100 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
                            <SummaryValue
                              label="DueQuity fee"
                              value={feeLabel(
                                agreement,
                              )}
                            />

                            <SummaryValue
                              label="Projected DueQuity fee"
                              value={money(
                                schedule
                                  .projectedFeeCents,
                              )}
                              emphasis
                            />

                            <SummaryValue
                              label="Projected amount to you"
                              value={money(
                                schedule
                                  .projectedClaimantNetCents,
                              )}
                              emphasis
                            />

                            <SummaryValue
                              label="Payment route"
                              value={humanize(
                                schedule.paymentRoute,
                              )}
                            />
                          </dl>

                          {/* ========================================== details */}

                          <dl className="mt-4 grid gap-x-8 gap-y-4 border-t border-ink-100 pt-4 sm:grid-cols-2">
                            <SummaryValue
                              label="Claimant"
                              value={
                                agreement.claimantLegalName
                              }
                            />

                            <SummaryValue
                              label="Jurisdiction"
                              value={
                                schedule.jurisdictionLabel
                              }
                            />

                            <SummaryValue
                              label="Agreement version"
                              value={`Version ${agreement.templateVersion}`}
                            />

                            <SummaryValue
                              label="Issued"
                              value={dateTime(
                                agreement.issuedAt,
                              )}
                            />
                          </dl>

                          {/* =========================================== action */}

                          <div className="mt-5 flex flex-col gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-ink-900">
                                {agreement.status ===
                                "submitted"
                                  ? "Your agreement is complete."
                                  : agreement.status ===
                                      "signed"
                                    ? "Your signature has been recorded."
                                    : "Your agreement is ready in your secure portal."}
                              </p>

                              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                Review and retain a copy of the agreement for
                                your records.
                              </p>
                            </div>

                            <Link
                              href={`/portal/agreements/${encodeURIComponent(
                                agreement.id,
                              )}`}
                              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                            >
                              {actionLabel(
                                agreement.status,
                              )}
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            )}
          </section>

          {/* ====================================================== history */}

          {historicalAgreements.length >
            0 && (
            <section className="border-t border-ink-100 pt-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
                  History
                </p>

                <h2 className="mt-1 text-lg font-semibold text-ink-950">
                  Previous agreements
                </h2>
              </div>

              <div className="mt-3 space-y-2">
                {historicalAgreements.map(
                  (
                    agreement,
                  ) => (
                    <Link
                      key={
                        agreement.id
                      }
                      href={`/portal/agreements/${encodeURIComponent(
                        agreement.id,
                      )}`}
                      className="flex flex-col gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 transition hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900">
                          {
                            agreement.title
                          }
                        </p>

                        <p className="mt-0.5 text-xs text-ink-500">
                          {
                            agreement.claimReference
                          }{" "}
                          ·{" "}
                          {money(
                            agreement.schedule
                              .recoveryAmountCents,
                          )}
                        </p>
                      </div>

                      <span
                        className={[
                          "w-fit",
                          "rounded-full",
                          "border",
                          "px-2.5",
                          "py-1",
                          "text-[10px]",
                          "font-semibold",
                          "uppercase",
                          "tracking-[0.08em]",
                          statusClasses(
                            agreement.status,
                          ),
                        ].join(
                          " ",
                        )}
                      >
                        {statusLabel(
                          agreement.status,
                        )}
                      </span>
                    </Link>
                  ),
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* =============================================================== safety */}

      <div className="rounded-xl border border-ink-100 bg-inset px-4 py-4">
        <p className="text-xs font-semibold text-ink-700">
          Secure agreement handling
        </p>

        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          DueQuity agreements should be reviewed and signed only from your
          authenticated claimant portal. DueQuity staff should not ask you to
          send a password, authentication code or electronic signature through
          ordinary email, text message or telephone.
        </p>
      </div>
    </div>
  );
}