"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  ClaimantAgreementSignaturePad,
} from "@/components/portal/claimant-agreement-signature-pad";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type AgreementStatus =
  | "draft"
  | "issued"
  | "opened"
  | "consented"
  | "signed"
  | "submitted"
  | "voided"
  | "superseded";

type RecoveryBasis =
  | "estimated"
  | "confirmed";

type FeeModel =
  | "percentage"
  | "flat"
  | "capped_success";

interface AgreementSchedule {
  claimReference:
    string;

  claimantReference:
    string;

  claimantLegalName:
    string;

  jurisdictionLabel:
    string;

  recoveryBasis:
    RecoveryBasis;

  recoveryAmountCents:
    number;

  feeModel:
    FeeModel;

  selectedPercentage?:
    number;

  selectedFlatAmountCents?:
    number;

  projectedFeeCents:
    number;

  projectedClaimantNetCents:
    number;

  paymentRoute:
    string;

  paymentLaunchTrack:
    string;
}

export interface ClaimantAgreementReviewData {
  id:
    string;

  claimId:
    string;

  claimReference:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  claimantLegalName:
    string;

  templateId:
    string;

  templateKey:
    string;

  templateVersion:
    number;

  title:
    string;

  status:
    AgreementStatus;

  training:
    boolean;

  schedule:
    AgreementSchedule;

  renderedAgreement:
    string;

  agreementHash:
    string;

  requiredAcknowledgementKeys:
    string[];

  electronicConsentText:
    string;

  signatureIntentText:
    string;

  issuedAt?:
    string;

  openedAt?:
    string;

  electronicConsentAt?:
    string;

  signedAt?:
    string;

  submittedAt?:
    string;

  finalDocumentId?:
    string;

  finalDocumentSha256?:
    string;
}

interface AgreementApiResponse {
  ok:
    boolean;

  action?:
    "opened" |
    "consent";

  agreement?:
    ClaimantAgreementReviewData;

  error?:
    string;
}

interface ClaimantAgreementReviewProps {
  agreement:
    ClaimantAgreementReviewData;
}

/* ========================================================================== */
/* Acknowledgement copy                                                        */
/* ========================================================================== */

const ACKNOWLEDGEMENT_COPY:
  Record<
    string,
    {
      title:
        string;

      body:
        string;
    }
  > = {
  electronic_records_consent: {
    title:
      "Electronic records and signatures",

    body:
      "I agree to conduct this transaction electronically and receive this agreement and related records electronically.",
  },

  document_retention_confirmed: {
    title:
      "Ability to keep a copy",

    body:
      "I confirm that I can view, download, print, or otherwise retain an electronic copy of this agreement for my records.",
  },

  agreement_reviewed: {
    title:
      "Agreement reviewed",

    body:
      "I have had the opportunity to read the DueQuity Recovery Services Agreement before signing.",
  },

  claim_and_fee_schedule_reviewed: {
    title:
      "Claim and fee information",

    body:
      "I reviewed the recovery amount, DueQuity fee formula, projected DueQuity fee, projected amount to me, and payment route shown in Schedule A.",
  },

  free_claim_option_acknowledged: {
    title:
      "Voluntary service and direct-claim option",

    body:
      "I understand that using DueQuity is voluntary and that, where the applicable process permits, I may pursue the recovery without DueQuity.",
  },

  no_guarantee_acknowledged: {
    title:
      "No guarantee of recovery",

    body:
      "I understand that DueQuity does not guarantee approval, payment, a particular recovery amount, or a particular processing time.",
  },

  not_law_firm_acknowledged: {
    title:
      "DueQuity is not a law firm",

    body:
      "I understand that DueQuity is a private recovery-support service and is not a law firm or government agency.",
  },

  payment_route_acknowledged: {
    title:
      "Payment route",

    body:
      "I reviewed and understand the payment route shown for this claim, including whether payment is made directly to the claimant or another legally permitted payee.",
  },
};

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

function money(
  cents:
    number,
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

function percentage(
  value:
    number | undefined,
): string {
  if (
    value ===
    undefined
  ) {
    return "—";
  }

  const amount =
    value *
    100;

  return Number.isInteger(
    amount,
  )
    ? `${amount.toFixed(
        0,
      )}%`
    : `${amount.toFixed(
        2,
      )}%`;
}

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

function feeStructure(
  schedule:
    AgreementSchedule,
): string {
  if (
    schedule.feeModel ===
    "percentage"
  ) {
    return `${percentage(
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
    : `${percentage(
        schedule
          .selectedPercentage,
      )} capped success fee`;
}

function dateTime(
  value:
    string,
): string {
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
        "long",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",

      timeZoneName:
        "short",
    },
  ).format(
    parsed,
  );
}

/* ========================================================================== */
/* Summary                                                                     */
/* ========================================================================== */

function SummaryItem({
  label,
  value,
  emphasis = false,
}: {
  label:
    string;

  value:
    string;

  emphasis?:
    boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-100 bg-white p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </dt>

      <dd
        className={[
          "mt-1.5",
          "break-words",
          emphasis
            ? "text-xl font-semibold text-ink-950"
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
/* Component                                                                   */
/* ========================================================================== */

export function ClaimantAgreementReview({
  agreement:
    initialAgreement,
}: ClaimantAgreementReviewProps) {
  const [
    agreement,
    setAgreement,
  ] =
    useState(
      initialAgreement,
    );

  const [
    acknowledgedKeys,
    setAcknowledgedKeys,
  ] =
    useState<
      string[]
    >(
      agreement.status ===
        "consented" ||
      agreement.status ===
        "signed" ||
      agreement.status ===
        "submitted"
        ? [
            ...agreement
              .requiredAcknowledgementKeys,
          ]
        : [],
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | undefined
    >();

  const [
    success,
    setSuccess,
  ] =
    useState<
      string | undefined
    >();

  const endpoint =
    useMemo(
      () =>
        `/api/portal/agreements/${encodeURIComponent(
          agreement.id,
        )}`,
      [
        agreement.id,
      ],
    );

  const signedDocumentUrl =
    useMemo(
      () =>
        `/api/portal/agreements/${encodeURIComponent(
          agreement.id,
        )}/document`,
      [
        agreement.id,
      ],
    );

  const signedDocumentDownloadUrl =
    `${signedDocumentUrl}?download=1`;

  const acknowledgementComplete =
    agreement
      .requiredAcknowledgementKeys
      .every(
        (
          key,
        ) =>
          acknowledgedKeys.includes(
            key,
          ),
      );

  const consentAlreadyRecorded =
    agreement.status ===
      "consented" ||
    agreement.status ===
      "signed" ||
    agreement.status ===
      "submitted";

  const readyForSignature =
    agreement.status ===
    "consented";

  const agreementCompleted =
    agreement.status ===
      "signed" ||
    agreement.status ===
      "submitted";

  const finalPdfAvailable =
    agreement.status ===
      "submitted" &&
    Boolean(
      agreement
        .finalDocumentId,
    ) &&
    Boolean(
      agreement
        .finalDocumentSha256,
    );

  /* ======================================================================== */
  /* Record first review                                                       */
  /* ======================================================================== */

  useEffect(
    () => {
      if (
        agreement.status !==
        "issued"
      ) {
        return;
      }

      let cancelled =
        false;

      async function recordOpened() {
        try {
          const response =
            await fetch(
              endpoint,
              {
                method:
                  "POST",

                headers: {
                  Accept:
                    "application/json",

                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    action:
                      "opened",
                  }),
              },
            );

          const payload =
            await response.json() as
              AgreementApiResponse;

          if (
            cancelled
          ) {
            return;
          }

          if (
            response.ok &&
            payload.ok &&
            payload.agreement
          ) {
            setAgreement(
              payload.agreement,
            );
          }
        } catch {
          /*
           * Reading the agreement remains available even if a temporary
           * network problem prevents the opened event from being recorded.
           *
           * Consent and final signature still fail closed on the server.
           */
        }
      }

      void recordOpened();

      return () => {
        cancelled =
          true;
      };
    },
    [
      agreement.status,
      endpoint,
    ],
  );

  /* ======================================================================== */
  /* Actions                                                                   */
  /* ======================================================================== */

  function toggleAcknowledgement(
    key:
      string,
  ) {
    if (
      consentAlreadyRecorded
    ) {
      return;
    }

    setAcknowledgedKeys(
      (
        current,
      ) =>
        current.includes(
          key,
        )
          ? current.filter(
              (
                value,
              ) =>
                value !==
                key,
            )
          : [
              ...current,
              key,
            ],
    );

    setError(
      undefined,
    );

    setSuccess(
      undefined,
    );
  }

  async function recordConsent() {
    if (
      consentAlreadyRecorded
    ) {
      return;
    }

    if (
      !acknowledgementComplete
    ) {
      setError(
        "Please review and accept every required acknowledgement before continuing.",
      );

      return;
    }

    setSubmitting(
      true,
    );

    setError(
      undefined,
    );

    setSuccess(
      undefined,
    );

    try {
      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "consent",

                acknowledgedKeys,
              }),
          },
        );

      const payload =
        await response.json() as
          AgreementApiResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.agreement
      ) {
        throw new Error(
          payload.error ??
          "Unable to record agreement consent.",
        );
      }

      setAgreement(
        payload.agreement,
      );

      setAcknowledgedKeys(
        [
          ...payload
            .agreement
            .requiredAcknowledgementKeys,
        ],
      );

      setSuccess(
        "Your electronic consent and required acknowledgements have been securely recorded. You may now proceed to the electronic signature section below.",
      );
    } catch (
      consentError
    ) {
      setError(
        consentError instanceof
          Error
          ? consentError.message
          : "Unable to record agreement consent.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  function printAgreement() {
    window.print();
  }

  /* ======================================================================== */
  /* View                                                                       */
  /* ======================================================================== */

  return (
    <div className="space-y-6">
      {/* =============================================================== return */}

      <div className="print:hidden">
        <Link
          href="/portal/agreements"
          className="text-sm font-semibold text-ink-600 underline underline-offset-4 transition hover:text-ink-950"
        >
          ← Back to agreements
        </Link>
      </div>

      {/* =============================================================== heading */}

      <header className="rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              Recovery Services Agreement
            </p>

            <h1 className="mt-1 text-2xl font-semibold text-ink-950 sm:text-3xl">
              Review & Sign
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-600">
              Review your recovery information and the complete agreement.
              Nothing on this page requires you to sign until you decide to
              proceed.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {agreement.training && (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-700">
                Training
              </span>
            )}

            <span
              className={[
                "rounded-full",
                "border",
                "px-3",
                "py-1.5",
                "text-[10px]",
                "font-semibold",
                "uppercase",
                "tracking-[0.08em]",
                agreementCompleted
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : readyForSignature
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-ink-200 bg-ink-50 text-ink-700",
              ].join(
                " ",
              )}
            >
              {agreementCompleted
                ? "Signed"
                : readyForSignature
                  ? "Ready to sign"
                  : "Review required"}
            </span>
          </div>
        </div>
      </header>

      {/* ======================================================== claim summary */}

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-paper shadow-sm">
        <div className="border-b border-ink-100 bg-white px-5 py-4 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            Schedule A
          </p>

          <h2 className="mt-1 text-lg font-semibold text-ink-950">
            Your Claim & Fee Disclosure
          </h2>

          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            These figures were populated automatically from your DueQuity claim
            record. They were not typed into this agreement by staff.
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <div className="rounded-2xl border border-ink-100 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {agreement.schedule
                .recoveryBasis ===
              "confirmed"
                ? "Confirmed recovery amount"
                : "Estimated recovery amount"}
            </p>

            <p className="mt-1 text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
              {money(
                agreement.schedule
                  .recoveryAmountCents,
              )}
            </p>

            {agreement.schedule
              .recoveryBasis ===
              "estimated" && (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-amber-700">
                This is currently an estimate. The amount actually payable may
                change when the responsible government agency, court, custodian,
                or other authorized decision-maker determines the final amount.
              </p>
            )}
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryItem
              label="DueQuity fee"
              value={feeStructure(
                agreement.schedule,
              )}
            />

            <SummaryItem
              label="Projected DueQuity fee"
              value={money(
                agreement.schedule
                  .projectedFeeCents,
              )}
              emphasis
            />

            <SummaryItem
              label="Projected amount to you"
              value={money(
                agreement.schedule
                  .projectedClaimantNetCents,
              )}
              emphasis
            />

            <SummaryItem
              label="Payment route"
              value={humanize(
                agreement.schedule
                  .paymentRoute,
              )}
            />
          </dl>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryItem
              label="Legal name"
              value={
                agreement
                  .claimantLegalName
              }
            />

            <SummaryItem
              label="Jurisdiction"
              value={
                agreement.schedule
                  .jurisdictionLabel
              }
            />

            <SummaryItem
              label="Claim ID"
              value={
                agreement
                  .claimReference
              }
            />

            <SummaryItem
              label="Claimant ID"
              value={
                agreement
                  .claimantReference
              }
            />
          </dl>
        </div>
      </section>

      {/* ======================================================== full contract */}

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Full agreement
            </p>

            <h2 className="mt-1 text-lg font-semibold text-ink-950">
              {
                agreement.title
              }
            </h2>

            <p className="mt-1 text-xs text-ink-500">
              Agreement version{" "}
              {
                agreement
                  .templateVersion
              }
            </p>
          </div>

          <button
            type="button"
            onClick={
              printAgreement
            }
            className="print:hidden inline-flex min-h-10 items-center justify-center rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            Print / Save a Copy
          </button>
        </div>

        <article className="px-5 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-4xl whitespace-pre-wrap text-sm leading-7 text-ink-800 sm:text-[15px]">
            {
              agreement
                .renderedAgreement
            }
          </div>
        </article>

        <div className="border-t border-ink-100 bg-inset px-5 py-3 sm:px-6">
          <p className="break-all font-mono text-[10px] leading-relaxed text-ink-500">
            Agreement integrity reference:{" "}
            {
              agreement
                .agreementHash
            }
          </p>
        </div>
      </section>

      {/* =========================================================== consent */}

      {!agreementCompleted && (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm print:hidden">
          <div className="border-b border-ink-100 px-5 py-4 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Electronic consent
            </p>

            <h2 className="mt-1 text-lg font-semibold text-ink-950">
              Review each acknowledgement
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
              Each item must be separately accepted before the electronic
              signature step becomes available.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <div className="rounded-xl border border-ink-100 bg-inset px-4 py-4">
              <p className="text-sm font-semibold text-ink-900">
                Electronic transaction consent
              </p>

              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                {
                  agreement
                    .electronicConsentText
                }
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {agreement
                .requiredAcknowledgementKeys
                .map(
                  (
                    key,
                  ) => {
                    const copy =
                      ACKNOWLEDGEMENT_COPY[
                        key
                      ] ?? {
                        title:
                          humanize(
                            key,
                          ),

                        body:
                          "I have reviewed and acknowledge this required agreement disclosure.",
                      };

                    const checked =
                      acknowledgedKeys.includes(
                        key,
                      );

                    return (
                      <label
                        key={
                          key
                        }
                        className={[
                          "flex",
                          "items-start",
                          "gap-3",
                          "rounded-xl",
                          "border",
                          "p-4",
                          "transition",
                          consentAlreadyRecorded
                            ? "cursor-default"
                            : "cursor-pointer",
                          checked
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-ink-200 bg-white hover:bg-ink-50",
                        ].join(
                          " ",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={
                            checked
                          }
                          disabled={
                            consentAlreadyRecorded
                          }
                          onChange={() =>
                            toggleAcknowledgement(
                              key,
                            )
                          }
                          className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300"
                        />

                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink-900">
                            {
                              copy.title
                            }
                          </span>

                          <span className="mt-1 block text-sm leading-relaxed text-ink-600">
                            {
                              copy.body
                            }
                          </span>
                        </span>
                      </label>
                    );
                  },
                )}
            </div>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
              >
                <p className="text-sm font-semibold text-red-900">
                  Unable to continue
                </p>

                <p className="mt-1 text-sm leading-relaxed text-red-700">
                  {error}
                </p>
              </div>
            )}

            {success && (
              <div
                role="status"
                className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
              >
                <p className="text-sm font-semibold text-emerald-900">
                  Consent recorded
                </p>

                <p className="mt-1 text-sm leading-relaxed text-emerald-700">
                  {success}
                </p>
              </div>
            )}

            {!consentAlreadyRecorded ? (
              <div className="mt-6 flex flex-col gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {
                      acknowledgedKeys
                        .length
                    }{" "}
                    of{" "}
                    {
                      agreement
                        .requiredAcknowledgementKeys
                        .length
                    }{" "}
                    acknowledged
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Recording these acknowledgements does not itself submit your
                    final electronic signature.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    submitting ||
                    !acknowledgementComplete
                  }
                  onClick={() =>
                    void recordConsent()
                  }
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting
                    ? "Recording..."
                    : "Accept & Continue"}
                </button>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-300 bg-white text-sm font-semibold text-emerald-700">
                    ✓
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-emerald-900">
                      Required consent recorded
                    </p>

                    <p className="mt-1 text-sm leading-relaxed text-emerald-800">
                      Your electronic-record consent and required disclosures
                      are securely recorded. You may proceed to electronic
                      signature below.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                    Verified agreement signer
                  </p>

                  <p className="mt-1 text-base font-semibold text-ink-950">
                    {
                      agreement
                        .claimantLegalName
                    }
                  </p>

                  <p className="mt-1 text-xs text-ink-500">
                    Claimant ID{" "}
                    {
                      agreement
                        .claimantReference
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================= signature */}

      {readyForSignature && (
        <ClaimantAgreementSignaturePad
          envelopeId={
            agreement.id
          }
          claimantLegalName={
            agreement
              .claimantLegalName
          }
          claimantReference={
            agreement
              .claimantReference
          }
          claimReference={
            agreement
              .claimReference
          }
          signatureIntentText={
            agreement
              .signatureIntentText
          }
        />
      )}

      {/* ================================================= signed state */}

      {agreementCompleted && (
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
          <div className="p-5 sm:p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300 bg-white text-lg font-semibold text-emerald-700">
              ✓
            </div>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Electronic signature complete
            </p>

            <h2 className="mt-1 text-lg font-semibold text-emerald-950">
              Agreement electronically signed
            </h2>

            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-emerald-800">
              This agreement has been electronically executed and preserved as
              part of your secure DueQuity claimant record.
            </p>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  Signed by
                </dt>

                <dd className="mt-1 text-sm font-semibold text-ink-950">
                  {
                    agreement
                      .claimantLegalName
                  }
                </dd>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  Signed
                </dt>

                <dd className="mt-1 text-sm font-semibold text-ink-950">
                  {agreement.signedAt
                    ? dateTime(
                        agreement
                          .signedAt,
                      )
                    : "Recorded"}
                </dd>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  Claim ID
                </dt>

                <dd className="mt-1 font-mono text-xs font-semibold text-ink-950">
                  {
                    agreement
                      .claimReference
                  }
                </dd>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  Claimant ID
                </dt>

                <dd className="mt-1 font-mono text-xs font-semibold text-ink-950">
                  {
                    agreement
                      .claimantReference
                  }
                </dd>
              </div>
            </dl>

            {agreement.finalDocumentId && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  Signed document reference
                </p>

                <p className="mt-1 break-all font-mono text-xs font-semibold text-ink-900">
                  {
                    agreement
                      .finalDocumentId
                  }
                </p>
              </div>
            )}

            {agreement.finalDocumentSha256 && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  Document integrity
                </p>

                <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-ink-500">
                  SHA-256:{" "}
                  {
                    agreement
                      .finalDocumentSha256
                  }
                </p>
              </div>
            )}

            {finalPdfAvailable && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-white p-4 print:hidden">
                <p className="text-sm font-semibold text-ink-900">
                  Your signed agreement
                </p>

                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  View the completed signed PDF or save a copy for your records.
                  DueQuity verifies the stored document before serving it.
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <a
                    href={
                      signedDocumentUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                  >
                    View Signed PDF
                  </a>

                  <a
                    href={
                      signedDocumentDownloadUrl
                    }
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-emerald-50"
                  >
                    Download PDF
                  </a>
                </div>
              </div>
            )}

            {!finalPdfAvailable && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden">
                <p className="text-xs font-semibold text-amber-900">
                  Final PDF processing
                </p>

                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  The agreement signature is recorded, but the final PDF is not
                  yet available for retrieval.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ============================================================== safety */}

      <footer className="rounded-xl border border-ink-100 bg-inset px-4 py-4 print:hidden">
        <p className="text-xs font-semibold text-ink-700">
          Your signature remains your choice
        </p>

        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Do not sign until you understand the agreement. DueQuity staff should
          not ask you to send your password, authentication code, or electronic
          signature through ordinary email, text message, or telephone.
        </p>
      </footer>
    </div>
  );
}