"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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

type AgreementAction =
  | "initialize_template"
  | "prepare"
  | "issue";

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

interface ClaimantAgreement {
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

interface AgreementTemplateResult {
  id:
    string;

  templateKey:
    string;

  version:
    number;

  title:
    string;

  status:
    "draft" |
    "approved" |
    "retired";

  contentHash:
    string;

  requiredAcknowledgementKeys:
    string[];

  createdByStaffUserId:
    string;

  approvedByStaffUserId?:
    string;

  approvedAt?:
    string;
}

interface AgreementListResponse {
  ok:
    boolean;

  claimantId?:
    string;

  agreements?:
    ClaimantAgreement[];

  error?:
    string;
}

interface AgreementActionResponse {
  ok:
    boolean;

  action?:
    AgreementAction;

  agreement?:
    ClaimantAgreement;

  template?:
    AgreementTemplateResult;

  error?:
    string;
}

interface ClaimantAgreementPanelProps {
  claimantId:
    string;
}

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
  if (
    !value
  ) {
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
        )} flat fee`;
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
/* Signed document                                                             */
/* ========================================================================== */

function signedDocumentAvailable(
  agreement:
    ClaimantAgreement,
): boolean {
  return (
    agreement.status ===
      "submitted" &&
    Boolean(
      agreement
        .finalDocumentId,
    ) &&
    Boolean(
      agreement
        .finalDocumentSha256,
    )
  );
}

function signedDocumentUrl({
  envelopeId,
  download = false,
}: {
  envelopeId:
    string;

  download?:
    boolean;
}): string {
  const base =
    `/api/pro/agreements/${encodeURIComponent(
      envelopeId,
    )}/document`;

  return download
    ? `${base}?download=1`
    : base;
}

/* ========================================================================== */
/* Status presentation                                                         */
/* ========================================================================== */

function statusLabel(
  status:
    AgreementStatus,
): string {
  switch (
    status
  ) {
    case "draft":
      return "Prepared";

    case "issued":
      return "Awaiting claimant";

    case "opened":
      return "Claimant reviewing";

    case "consented":
      return "Ready for signature";

    case "signed":
      return "Signed";

    case "submitted":
      return "Completed";

    case "voided":
      return "Voided";

    case "superseded":
      return "Superseded";
  }
}

function statusClass(
  status:
    AgreementStatus,
): string {
  switch (
    status
  ) {
    case "signed":
    case "submitted":
      return [
        "border-ink-300",
        "bg-ink-50",
        "text-ink-900",
      ].join(
        " ",
      );

    case "issued":
    case "opened":
    case "consented":
      return [
        "border-ink-300",
        "bg-ink-50",
        "text-ink-800",
      ].join(
        " ",
      );

    case "voided":
    case "superseded":
      return [
        "border-ink-200",
        "bg-ink-100",
        "text-ink-600",
      ].join(
        " ",
      );

    default:
      return [
        "border-ink-200",
        "bg-white",
        "text-ink-700",
      ].join(
        " ",
      );
  }
}

/* ========================================================================== */
/* Small presentation components                                               */
/* ========================================================================== */

function Metric({
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
        {label}
      </p>

      <p
        className={[
          "mt-1.5",
          "break-words",
          emphasis
            ? "text-xl font-semibold text-ink-950"
            : "text-sm font-semibold text-ink-900",
        ].join(
          " ",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TimelineItem({
  label,
  value,
  complete,
}: {
  label:
    string;

  value:
    string;

  complete:
    boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={[
          "mt-1",
          "h-2.5",
          "w-2.5",
          "shrink-0",
          "rounded-full",
          complete
            ? "bg-ink-900"
            : "bg-ink-200",
        ].join(
          " ",
        )}
      />

      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-800">
          {label}
        </p>

        <p className="mt-0.5 break-words text-xs text-ink-500">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Signed PDF actions                                                          */
/* ========================================================================== */

function SignedPdfActions({
  agreement,
  compact = false,
}: {
  agreement:
    ClaimantAgreement;

  compact?:
    boolean;
}) {
  if (
    !signedDocumentAvailable(
      agreement,
    )
  ) {
    return null;
  }

  return (
    <div
      className={[
        "flex",
        "flex-wrap",
        "gap-2",
        compact
          ? ""
          : "mt-4",
      ].join(
        " ",
      )}
    >
      <a
        href={signedDocumentUrl({
          envelopeId:
            agreement.id,
        })}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          "inline-flex",
          "items-center",
          "justify-center",
          "rounded-lg",
          "border",
          "border-ink-950",
          "bg-ink-950",
          "font-semibold",
          "text-white",
          "transition",
          "hover:bg-ink-800",
          compact
            ? "min-h-9 px-3 py-2 text-xs"
            : "min-h-10 px-4 py-2 text-sm",
        ].join(
          " ",
        )}
      >
        View Signed PDF
      </a>

      <a
        href={signedDocumentUrl({
          envelopeId:
            agreement.id,

          download:
            true,
        })}
        className={[
          "inline-flex",
          "items-center",
          "justify-center",
          "rounded-lg",
          "border",
          "border-ink-300",
          "bg-white",
          "font-semibold",
          "text-ink-700",
          "transition",
          "hover:bg-ink-50",
          compact
            ? "min-h-9 px-3 py-2 text-xs"
            : "min-h-10 px-4 py-2 text-sm",
        ].join(
          " ",
        )}
      >
        Download PDF
      </a>
    </div>
  );
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimantAgreementPanel({
  claimantId,
}: ClaimantAgreementPanelProps) {
  const [
    agreements,
    setAgreements,
  ] =
    useState<
      ClaimantAgreement[]
    >(
      [],
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    busyAction,
    setBusyAction,
  ] =
    useState<
      AgreementAction |
      undefined
    >();

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

  const [
    previewOpen,
    setPreviewOpen,
  ] =
    useState(
      false,
    );

  const endpoint =
    useMemo(
      () =>
        `/api/pro/claimants/${encodeURIComponent(
          claimantId,
        )}/agreements`,
      [
        claimantId,
      ],
    );

  const templateMissing =
    Boolean(
      error
        ?.toLowerCase()
        .includes(
          "template has not been initialized by super admin",
        ),
    );

  const loadAgreements =
    useCallback(
      async () => {
        setError(
          undefined,
        );

        try {
          const response =
            await fetch(
              endpoint,
              {
                method:
                  "GET",

                cache:
                  "no-store",

                headers: {
                  Accept:
                    "application/json",
                },
              },
            );

          const payload =
            await response.json() as
              AgreementListResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ??
              "Unable to load claimant agreements.",
            );
          }

          setAgreements(
            payload.agreements ??
            [],
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Unable to load claimant agreements.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        endpoint,
      ],
    );

  useEffect(
    () => {
      void loadAgreements();
    },
    [
      loadAgreements,
    ],
  );

  const current =
    agreements[0];

  const canIssueCurrent =
    Boolean(
      current &&
      current.status ===
        "draft" &&
      !current.issuedAt,
    );

  async function runAction({
    action,
    envelopeId,
  }: {
    action:
      AgreementAction;

    envelopeId?:
      string;
  }) {
    setBusyAction(
      action,
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

            cache:
              "no-store",

            body:
              JSON.stringify({
                action,

                envelopeId,
              }),
          },
        );

      const payload =
        await response.json() as
          AgreementActionResponse;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          payload.error ??
          "Unable to process claimant agreement.",
        );
      }

      if (
        action ===
        "initialize_template"
      ) {
        if (
          !payload.template
        ) {
          throw new Error(
            "Agreement template initialization did not return a template record.",
          );
        }

        setSuccess(
          `Recovery Services Agreement template v${payload.template.version} initialized as ${payload.template.status.toUpperCase()}. It has not been approved for production use.`,
        );

        await loadAgreements();

        return;
      }

      if (
        !payload.agreement
      ) {
        throw new Error(
          "Agreement action did not return an agreement record.",
        );
      }

      if (
        action ===
        "prepare"
      ) {
        setSuccess(
          "Recovery Services Agreement prepared from the locked Claim, jurisdiction and commercial records.",
        );
      } else {
        setSuccess(
          "Agreement issued to the claimant portal.",
        );
      }

      await loadAgreements();
    } catch (
      actionError
    ) {
      setError(
        actionError instanceof
          Error
          ? actionError.message
          : "Unable to process claimant agreement.",
      );
    } finally {
      setBusyAction(
        undefined,
      );
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-paper shadow-sm">
      <div className="border-b border-ink-100 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              E-Document
            </p>

            <h2 className="mt-1 text-lg font-semibold text-ink-950">
              Recovery Services Agreement
            </h2>

            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-600">
              DueQuity builds the agreement from the locked recovery amount,
              approved commercial fee and jurisdiction rules. Staff do not type
              claimant fee terms manually.
            </p>
          </div>

          {current && (
            <div className="flex shrink-0 items-center gap-2">
              {current.training && (
                <span className="rounded-full border border-ink-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-700">
                  Training
                </span>
              )}

              <span
                className={[
                  "rounded-full",
                  "border",
                  "px-3",
                  "py-1",
                  "text-[11px]",
                  "font-semibold",
                  "uppercase",
                  "tracking-[0.08em]",
                  statusClass(
                    current.status,
                  ),
                ].join(
                  " ",
                )}
              >
                {statusLabel(
                  current.status,
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {error && (
          <div className="rounded-xl border border-ink-300 bg-white px-4 py-3">
            <p className="text-sm font-semibold text-ink-950">
              Agreement action could not be completed
            </p>

            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              {error}
            </p>
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-ink-300 bg-ink-50 px-4 py-3">
            <p className="text-sm font-semibold text-ink-950">
              Agreement workflow updated
            </p>

            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              {success}
            </p>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-ink-100 bg-white px-4 py-8 text-center">
            <p className="text-sm text-ink-500">
              Loading claimant agreement...
            </p>
          </div>
        ) : !current ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-5">
            {templateMissing ? (
              <>
                <div className="max-w-2xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-700">
                    One-time system setup
                  </p>

                  <h3 className="mt-1 text-sm font-semibold text-ink-900">
                    Recovery Services Agreement template must be initialized
                  </h3>

                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                    The agreement code is already installed, but its immutable
                    version 1 template has not yet been registered in the
                    DueQuity database.
                  </p>

                  <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
                    <p className="text-xs font-semibold text-ink-900">
                      This action does not approve the agreement for production.
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-ink-700">
                      Initialization creates the template as DRAFT. The
                      designated training claimant may use the draft during
                      controlled QA, while real claimant issuance remains
                      blocked until a separate Super Admin approval occurs.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    busyAction !==
                    undefined
                  }
                  onClick={() =>
                    void runAction({
                      action:
                        "initialize_template",
                    })
                  }
                  className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-ink-950 bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyAction ===
                  "initialize_template"
                    ? "Initializing..."
                    : "Initialize Agreement Template"}
                </button>
              </>
            ) : (
              <>
                <div className="max-w-2xl">
                  <h3 className="text-sm font-semibold text-ink-900">
                    No agreement prepared yet
                  </h3>

                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                    Prepare Agreement freezes the current claimant, Claim,
                    commercial pricing and jurisdiction provenance into one
                    claimant-specific Recovery Services Agreement.
                  </p>

                  <p className="mt-2 text-xs leading-relaxed text-ink-500">
                    A real claimant cannot receive an unapproved agreement
                    template. The designated training claimant may use the
                    draft template during controlled QA.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    busyAction !==
                    undefined
                  }
                  onClick={() =>
                    void runAction({
                      action:
                        "prepare",
                    })
                  }
                  className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-ink-950 bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyAction ===
                  "prepare"
                    ? "Preparing..."
                    : "Prepare Agreement"}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    Claim & Fee Summary
                  </p>

                  <h3 className="mt-1 text-base font-semibold text-ink-950">
                    What the claimant will see before signing
                  </h3>
                </div>

                <p className="text-xs text-ink-500">
                  Template v
                  {current.templateVersion}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label={
                    current.schedule
                      .recoveryBasis ===
                    "confirmed"
                      ? "Confirmed recovery"
                      : "Estimated recovery"
                  }
                  value={money(
                    current.schedule
                      .recoveryAmountCents,
                  )}
                  emphasis
                />

                <Metric
                  label="DueQuity fee"
                  value={feeStructure(
                    current.schedule,
                  )}
                />

                <Metric
                  label="Projected DueQuity fee"
                  value={money(
                    current.schedule
                      .projectedFeeCents,
                  )}
                  emphasis
                />

                <Metric
                  label="Projected claimant amount"
                  value={money(
                    current.schedule
                      .projectedClaimantNetCents,
                  )}
                  emphasis
                />
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 rounded-2xl border border-ink-100 bg-white p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                      Agreement details
                    </p>

                    <h3 className="mt-1 text-base font-semibold text-ink-950">
                      {current.title}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPreviewOpen(
                        (
                          value,
                        ) =>
                          !value,
                      )
                    }
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
                  >
                    {previewOpen
                      ? "Hide agreement"
                      : "Preview agreement"}
                  </button>
                </div>

                <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-ink-500">
                      Claim
                    </dt>

                    <dd className="mt-1 text-sm font-semibold text-ink-900">
                      {current.claimReference}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium text-ink-500">
                      Claimant
                    </dt>

                    <dd className="mt-1 text-sm font-semibold text-ink-900">
                      {current.claimantLegalName}
                    </dd>

                    <dd className="mt-0.5 text-xs text-ink-500">
                      {current.claimantReference}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium text-ink-500">
                      Jurisdiction
                    </dt>

                    <dd className="mt-1 text-sm text-ink-800">
                      {current.schedule
                        .jurisdictionLabel}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium text-ink-500">
                      Recovery basis
                    </dt>

                    <dd className="mt-1 text-sm text-ink-800">
                      {humanize(
                        current.schedule
                          .recoveryBasis,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium text-ink-500">
                      Payment route
                    </dt>

                    <dd className="mt-1 text-sm text-ink-800">
                      {humanize(
                        current.schedule
                          .paymentRoute,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-medium text-ink-500">
                      Launch track
                    </dt>

                    <dd className="mt-1 text-sm text-ink-800">
                      {humanize(
                        current.schedule
                          .paymentLaunchTrack,
                      )}
                    </dd>
                  </div>

                  {current.signedAt && (
                    <div>
                      <dt className="text-xs font-medium text-ink-500">
                        Signed
                      </dt>

                      <dd className="mt-1 text-sm font-semibold text-ink-900">
                        {dateTime(
                          current.signedAt,
                        )}
                      </dd>
                    </div>
                  )}

                  {current.submittedAt && (
                    <div>
                      <dt className="text-xs font-medium text-ink-500">
                        Filed
                      </dt>

                      <dd className="mt-1 text-sm font-semibold text-ink-900">
                        {dateTime(
                          current.submittedAt,
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                {current.schedule
                  .recoveryBasis ===
                  "estimated" && (
                  <div className="mt-5 rounded-xl border border-ink-300 bg-ink-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-900">
                      Estimated recovery
                    </p>

                    <p className="mt-1 text-sm leading-relaxed text-ink-700">
                      The claimant agreement expressly states that this amount
                      may change when the responsible government agency, court
                      or custodian determines the final payable amount.
                    </p>
                  </div>
                )}

                {signedDocumentAvailable(
                  current,
                ) && (
                  <div className="mt-5 rounded-2xl border border-ink-300 bg-ink-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-700">
                          Final signed agreement
                        </p>

                        <p className="mt-1 text-sm font-semibold text-ink-950">
                          Immutable PDF filed in claimant record
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-ink-700">
                          The stored PDF is served only after DueQuity verifies
                          claimant ownership, staff assignment and the recorded
                          SHA-256 document hash.
                        </p>
                      </div>

                      <span className="w-fit shrink-0 rounded-full border border-ink-300 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-700">
                        Integrity verified on access
                      </span>
                    </div>

                    <dl className="mt-4 grid gap-3">
                      <div className="rounded-xl border border-ink-200 bg-white p-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                          Document ID
                        </dt>

                        <dd className="mt-1 break-all font-mono text-xs font-semibold text-ink-900">
                          {
                            current
                              .finalDocumentId
                          }
                        </dd>
                      </div>

                      <div className="rounded-xl border border-ink-200 bg-white p-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                          SHA-256
                        </dt>

                        <dd className="mt-1 break-all font-mono text-[10px] leading-relaxed text-ink-600">
                          {
                            current
                              .finalDocumentSha256
                          }
                        </dd>
                      </div>
                    </dl>

                    <SignedPdfActions
                      agreement={
                        current
                      }
                    />
                  </div>
                )}

                {current.status ===
                  "signed" &&
                  !signedDocumentAvailable(
                    current,
                  ) && (
                  <div className="mt-5 rounded-xl border border-ink-300 bg-ink-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-900">
                      Final PDF pending
                    </p>

                    <p className="mt-1 text-sm leading-relaxed text-ink-700">
                      The signature has been recorded, but complete final PDF
                      evidence is not yet available.
                    </p>
                  </div>
                )}

                {previewOpen && (
                  <div className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-paper">
                    <div className="border-b border-ink-100 bg-white px-4 py-3">
                      <p className="text-xs font-semibold text-ink-800">
                        Frozen claimant agreement preview
                      </p>

                      <p className="mt-0.5 break-all text-[11px] text-ink-500">
                        Hash:{" "}
                        <span className="font-mono">
                          {current.agreementHash}
                        </span>
                      </p>
                    </div>

                    <div className="max-h-[560px] overflow-y-auto px-5 py-5">
                      <div className="whitespace-pre-wrap text-sm leading-7 text-ink-800">
                        {current.renderedAgreement}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <aside className="min-w-0 rounded-2xl border border-ink-100 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                  Agreement lifecycle
                </p>

                <div className="mt-4 space-y-4">
                  <TimelineItem
                    label="Prepared"
                    value="Commercial and legal snapshots frozen"
                    complete
                  />

                  <TimelineItem
                    label="Issued"
                    value={dateTime(
                      current.issuedAt,
                    )}
                    complete={Boolean(
                      current.issuedAt,
                    )}
                  />

                  <TimelineItem
                    label="Opened"
                    value={dateTime(
                      current.openedAt,
                    )}
                    complete={Boolean(
                      current.openedAt,
                    )}
                  />

                  <TimelineItem
                    label="Electronic consent"
                    value={dateTime(
                      current
                        .electronicConsentAt,
                    )}
                    complete={Boolean(
                      current
                        .electronicConsentAt,
                    )}
                  />

                  <TimelineItem
                    label="Signed"
                    value={dateTime(
                      current.signedAt,
                    )}
                    complete={Boolean(
                      current.signedAt,
                    )}
                  />

                  <TimelineItem
                    label="Filed in claimant record"
                    value={
                      current.finalDocumentId
                        ? current.finalDocumentId
                        : "Pending"
                    }
                    complete={Boolean(
                      current.finalDocumentId,
                    )}
                  />
                </div>

                {signedDocumentAvailable(
                  current,
                ) && (
                  <div className="mt-5 border-t border-ink-100 pt-4">
                    <p className="text-xs font-semibold text-ink-800">
                      Signed document available
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-ink-500">
                      Access remains restricted to the currently assigned staff
                      member or Super Admin.
                    </p>
                  </div>
                )}
              </aside>
            </div>

            <div className="flex flex-col gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-ink-700">
                  Current status:{" "}
                  <span className="font-semibold text-ink-950">
                    {statusLabel(
                      current.status,
                    )}
                  </span>
                </p>

                {current.status ===
                  "draft" && (
                  <p className="mt-1 text-xs text-ink-500">
                    The claimant cannot see this agreement until it is issued.
                  </p>
                )}

                {current.status ===
                  "issued" && (
                  <p className="mt-1 text-xs text-ink-500">
                    The agreement is now available inside the claimant portal.
                  </p>
                )}

                {current.status ===
                  "opened" && (
                  <p className="mt-1 text-xs text-ink-500">
                    The claimant has opened the agreement for review.
                  </p>
                )}

                {current.status ===
                  "consented" && (
                  <p className="mt-1 text-xs text-ink-500">
                    Required electronic consent and disclosures have been
                    recorded. Signature is the next claimant action.
                  </p>
                )}

                {current.status ===
                  "signed" && (
                  <p className="mt-1 text-xs text-ink-500">
                    The claimant signature is recorded. Final PDF evidence is
                    still pending.
                  </p>
                )}

                {current.status ===
                  "submitted" && (
                  <p className="mt-1 text-xs text-ink-500">
                    The signed Recovery Services Agreement has been permanently
                    filed in the claimant record.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canIssueCurrent && (
                  <button
                    type="button"
                    disabled={
                      busyAction !==
                      undefined
                    }
                    onClick={() =>
                      void runAction({
                        action:
                          "issue",

                        envelopeId:
                          current.id,
                      })
                    }
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-ink-950 bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyAction ===
                    "issue"
                      ? "Issuing..."
                      : "Issue to Claimant"}
                  </button>
                )}

                {signedDocumentAvailable(
                  current,
                ) && (
                  <SignedPdfActions
                    agreement={
                      current
                    }
                    compact
                  />
                )}

                <button
                  type="button"
                  disabled={
                    busyAction !==
                    undefined
                  }
                  onClick={() =>
                    void loadAgreements()
                  }
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-300 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Refresh status
                </button>
              </div>
            </div>

            {agreements.length >
              1 && (
              <div className="border-t border-ink-100 pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                  Agreement history
                </p>

                <div className="mt-3 space-y-2">
                  {agreements
                    .slice(
                      1,
                    )
                    .map(
                      (
                        agreement,
                      ) => (
                        <div
                          key={
                            agreement.id
                          }
                          className="rounded-xl border border-ink-100 bg-white px-4 py-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink-900">
                                {
                                  agreement.title
                                }{" "}
                                v
                                {
                                  agreement.templateVersion
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

                              {agreement.signedAt && (
                                <p className="mt-1 text-xs text-ink-500">
                                  Signed{" "}
                                  {dateTime(
                                    agreement.signedAt,
                                  )}
                                </p>
                              )}

                              {agreement.finalDocumentId && (
                                <p className="mt-1 break-all font-mono text-[10px] text-ink-500">
                                  Document{" "}
                                  {
                                    agreement
                                      .finalDocumentId
                                  }
                                </p>
                              )}
                            </div>

                            <span
                              className={[
                                "w-fit",
                                "shrink-0",
                                "rounded-full",
                                "border",
                                "px-2.5",
                                "py-1",
                                "text-[10px]",
                                "font-semibold",
                                "uppercase",
                                "tracking-[0.08em]",
                                statusClass(
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

                          {signedDocumentAvailable(
                            agreement,
                          ) && (
                            <div className="mt-3 border-t border-ink-100 pt-3">
                              <SignedPdfActions
                                agreement={
                                  agreement
                                }
                                compact
                              />

                              <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-ink-400">
                                SHA-256:{" "}
                                {
                                  agreement
                                    .finalDocumentSha256
                                }
                              </p>
                            </div>
                          )}
                        </div>
                      ),
                    )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}