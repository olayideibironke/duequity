"use client";

import { useMemo, useState } from "react";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";

import type {
  ClaimSubmissionMethod,
  ComplianceStatus,
  DocumentKind,
  FeeModel,
  SurplusCustodian,
} from "@/domain/types";

import type { LegalProcessingRule } from "@/domain/legal";

/* ========================================================================== */
/* Local review types                                                          */
/* ========================================================================== */

type JurisdictionRuleScope = "state" | "county";

type JurisdictionReviewStatus =
  "draft" | "ready_for_approval" | "changes_required" | "approved";

type JurisdictionReviewFindingKey =
  | "agency_contact"
  | "custodian"
  | "claim_method"
  | "required_documents"
  | "claim_deadline"
  | "controlling_authority"
  | "fee_models"
  | "percentage_fee_cap"
  | "amount_fee_cap"
  | "assignment"
  | "power_of_attorney"
  | "finder_license"
  | "bond"
  | "attorney_requirement"
  | "contract_language"
  | "cancellation_period"
  | "payment_routing"
  | "probate_requirement"
  | "compliance_status"
  | "legal_processing_rule";

type JurisdictionPaymentRoute =
  | "claimant_only"
  | "authorized_representative"
  | "joint_payee"
  | "split_disbursement"
  | "assignee"
  | "unknown";

type DuequityLaunchPaymentTrack =
  | "direct_claimant_recovery"
  | "managed_representative_recovery"
  | "future_acquisition"
  | "blocked";

type JurisdictionYesNoUnknown = "yes" | "no" | "unknown";

type JurisdictionFeeCollectionMethod =
  | "contractual_post_recovery"
  | "representative_disbursement"
  | "joint_payee_disbursement"
  | "split_disbursement"
  | "assignment_acquisition"
  | "unknown";

interface JurisdictionAuthoritySource {
  id: string;

  authorityName: string;

  url: string;

  title?: string;

  contentHash?: string;
}

interface JurisdictionReviewFindings {
  agencyName?: string;

  agencyWebsite?: string;

  agencyPhone?: string;

  custodian?: SurplusCustodian;

  claimMethod?: ClaimSubmissionMethod;

  claimFormUrl?: string;

  requiredDocuments?: DocumentKind[];

  claimDeadlineDays?: number;

  statuteReference?: string;

  permittedFeeModels?: FeeModel[];

  feeCapPercent?: number;

  feeCapAmount?: number;

  assignmentPermitted?: boolean;

  powerOfAttorneyAccepted?: boolean;

  finderLicenseRequired?: boolean;

  bondRequired?: boolean;

  attorneyRequired?: boolean;

  mandatoryContractLanguage?: string[];

  cancellationPeriodDays?: number;

  paymentRoutingNote?: string;

  paymentRoute?: JurisdictionPaymentRoute;

  paymentLaunchTrack?: DuequityLaunchPaymentTrack;

  representativeMayFile?: JurisdictionYesNoUnknown;

  representativeMayReceivePayment?: JurisdictionYesNoUnknown;

  assignmentRequiredForRepresentativePayment?: JurisdictionYesNoUnknown;

  feeCollectionMethod?: JurisdictionFeeCollectionMethod;

  probateRequiredWhenDeceased?: boolean;

  complianceStatus?: ComplianceStatus;

  legalProcessingRule?: LegalProcessingRule;

  internalNotes?: string;
}

interface JurisdictionReviewDraft {
  id: string;

  status: JurisdictionReviewStatus;

  scope?: JurisdictionRuleScope;

  findings: JurisdictionReviewFindings;

  reviewedFindings: JurisdictionReviewFindingKey[];

  selectedSourceIds: string[];

  sourceCandidates: JurisdictionAuthoritySource[];

  additionalSources: JurisdictionAuthoritySource[];

  findingSourceIds: Partial<Record<JurisdictionReviewFindingKey, string[]>>;
}

/* ========================================================================== */
/* Review constants                                                           */
/* ========================================================================== */

const REVIEW_FINDINGS: JurisdictionReviewFindingKey[] = [
  "agency_contact",
  "custodian",
  "claim_method",
  "required_documents",
  "claim_deadline",
  "controlling_authority",
  "fee_models",
  "percentage_fee_cap",
  "amount_fee_cap",
  "assignment",
  "power_of_attorney",
  "finder_license",
  "bond",
  "attorney_requirement",
  "contract_language",
  "cancellation_period",
  "payment_routing",
  "probate_requirement",
  "compliance_status",
  "legal_processing_rule",
];

const CUSTODIANS: SurplusCustodian[] = [
  "county_treasurer",
  "county_tax_collector",
  "clerk_of_court",
  "circuit_court",
  "sheriff",
  "trustee",
  "municipality",
  "state_unclaimed_property",
  "escrow_agent",
  "unknown",
];

const CLAIM_METHODS: ClaimSubmissionMethod[] = [
  "mail",
  "in_person",
  "email",
  "online_portal",
  "court_filing",
  "attorney_filing",
];

const DOCUMENT_KINDS: DocumentKind[] = [
  "government_id",
  "proof_of_former_ownership",
  "recorded_deed",
  "death_certificate",
  "probate_letters",
  "letters_of_administration",
  "will",
  "trust_instrument",
  "articles_of_organization",
  "certificate_of_good_standing",
  "w9",
  "affidavit_of_heirship",
  "affidavit_of_entitlement",
  "court_order",
  "agency_claim_form",
  "agency_correspondence",
  "fee_agreement",
  "lien_release",
  "bankruptcy_discharge",
  "marriage_certificate",
  "utility_bill_proof_of_residence",
  "other",
];

const FEE_MODELS: FeeModel[] = [
  "flat",
  "percentage",
  "capped_success",
  "no_fee",
];

const COMPLIANCE_STATUSES: ComplianceStatus[] = [
  "research_required",
  "under_legal_review",
  "approved",
  "attorney_only",
  "restricted",
  "paused",
];

const LEGAL_PROCESSING_RULES: LegalProcessingRule[] = [
  "administrative_permitted",
  "legal_review_recommended",
  "attorney_mandatory",
  "restricted",
  "not_yet_approved",
];

const PAYMENT_ROUTES: JurisdictionPaymentRoute[] = [
  "claimant_only",
  "authorized_representative",
  "joint_payee",
  "split_disbursement",
  "assignee",
  "unknown",
];

const YES_NO_UNKNOWN_VALUES: JurisdictionYesNoUnknown[] = [
  "yes",
  "no",
  "unknown",
];

/* ========================================================================== */
/* Styling                                                                     */
/* ========================================================================== */

const CONTROL_CLASS =
  "w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm outline-none transition-colors placeholder:text-ink-400 hover:border-ink-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 disabled:cursor-not-allowed disabled:bg-inset disabled:text-ink-500";

const TEXTAREA_CLASS = `${CONTROL_CLASS} min-h-24`;

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function paymentRouteLabel(value: JurisdictionPaymentRoute): string {
  switch (value) {
    case "claimant_only":
      return "Claimant payee";

    case "authorized_representative":
      return "Authorized representative payee";

    case "joint_payee":
      return "Joint payee";

    case "split_disbursement":
      return "Split disbursement";

    case "assignee":
      return "Assignment / acquisition";

    case "unknown":
      return "Unknown";
  }
}

function yesNoUnknownLabel(value: JurisdictionYesNoUnknown): string {
  switch (value) {
    case "yes":
      return "Yes";

    case "no":
      return "No";

    case "unknown":
      return "Unknown";
  }
}

function dollarsFromCents(cents: number | undefined): string {
  if (cents === undefined) {
    return "";
  }

  return (cents / 100).toString();
}

function centsFromDollars(value: string): number | undefined {
  const trimmed = value.trim();

  if (trimmed === "") {
    return undefined;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.round(parsed * 100);
}

function percentDisplay(value: number | undefined): string {
  if (value === undefined) {
    return "";
  }

  return (value * 100).toString();
}

function normalizedPercent(value: string): number | undefined {
  const trimmed = value.trim();

  if (trimmed === "") {
    return undefined;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed / 100;
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();

  if (trimmed === "") {
    return undefined;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function lines(value: string): string[] | undefined {
  const values = value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function sourceLabel(source: JurisdictionAuthoritySource): string {
  return source.title ?? `${source.authorityName} source`;
}

function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-1 text-critical-600">
      *
    </span>
  );
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

interface JurisdictionReviewEditorProps {
  draft: JurisdictionReviewDraft;

  canApprove: boolean;
}

export function JurisdictionReviewEditor({
  draft,
  canApprove,
}: JurisdictionReviewEditorProps) {
  const router = useRouter();

  const locked = draft.status === "approved";

  const initial = draft.findings;

  /* ======================================================================== */
  /* General review state                                                     */
  /* ======================================================================== */

  const [scope, setScope] = useState<JurisdictionRuleScope | "">(
    draft.scope ?? "",
  );

  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(
    draft.selectedSourceIds,
  );

  const [paymentEvidenceSourceIds, setPaymentEvidenceSourceIds] = useState<
    string[]
  >(draft.findingSourceIds.payment_routing ?? []);

  /* ======================================================================== */
  /* Agency                                                                    */
  /* ======================================================================== */

  const [agencyName, setAgencyName] = useState(initial.agencyName ?? "");

  const [agencyWebsite, setAgencyWebsite] = useState(
    initial.agencyWebsite ?? "",
  );

  const [agencyPhone, setAgencyPhone] = useState(initial.agencyPhone ?? "");

  const [custodian, setCustodian] = useState<SurplusCustodian | "">(
    initial.custodian ?? "",
  );

  /* ======================================================================== */
  /* Claim                                                                     */
  /* ======================================================================== */

  const [claimMethod, setClaimMethod] = useState<ClaimSubmissionMethod | "">(
    initial.claimMethod ?? "",
  );

  const [claimFormUrl, setClaimFormUrl] = useState(initial.claimFormUrl ?? "");

  const [requiredDocuments, setRequiredDocuments] = useState<DocumentKind[]>(
    initial.requiredDocuments ?? [],
  );

  const [claimDeadlineDays, setClaimDeadlineDays] = useState(
    initial.claimDeadlineDays?.toString() ?? "",
  );

  const [statuteReference, setStatuteReference] = useState(
    initial.statuteReference ?? "",
  );

  /* ======================================================================== */
  /* Commercial                                                               */
  /* ======================================================================== */

  const [permittedFeeModels, setPermittedFeeModels] = useState<FeeModel[]>(
    initial.permittedFeeModels ?? [],
  );

  const [feeCapPercent, setFeeCapPercent] = useState(
    percentDisplay(initial.feeCapPercent),
  );

  const [feeCapAmount, setFeeCapAmount] = useState(
    dollarsFromCents(initial.feeCapAmount),
  );

  /* ======================================================================== */
  /* Legal                                                                    */
  /* ======================================================================== */

  const [assignmentPermitted, setAssignmentPermitted] = useState<boolean | "">(
    initial.assignmentPermitted ?? "",
  );

  const [powerOfAttorneyAccepted, setPowerOfAttorneyAccepted] = useState<
    boolean | ""
  >(initial.powerOfAttorneyAccepted ?? "");

  const [finderLicenseRequired, setFinderLicenseRequired] = useState<
    boolean | ""
  >(initial.finderLicenseRequired ?? "");

  const [bondRequired, setBondRequired] = useState<boolean | "">(
    initial.bondRequired ?? "",
  );

  const [attorneyRequired, setAttorneyRequired] = useState<boolean | "">(
    initial.attorneyRequired ?? "",
  );

  const [probateRequiredWhenDeceased, setProbateRequiredWhenDeceased] =
    useState<boolean | "">(initial.probateRequiredWhenDeceased ?? "");

  const [mandatoryContractLanguage, setMandatoryContractLanguage] = useState(
    (initial.mandatoryContractLanguage ?? []).join("\n"),
  );

  const [cancellationPeriodDays, setCancellationPeriodDays] = useState(
    initial.cancellationPeriodDays?.toString() ?? "",
  );

  /* ======================================================================== */
  /* Payment routing                                                          */
  /* ======================================================================== */

  const [paymentRoute, setPaymentRoute] = useState<
    JurisdictionPaymentRoute | ""
  >(initial.paymentRoute ?? "");

  const [paymentLaunchTrack, setPaymentLaunchTrack] = useState<
    DuequityLaunchPaymentTrack | ""
  >(initial.paymentLaunchTrack ?? "");

  const [representativeMayFile, setRepresentativeMayFile] = useState<
    JurisdictionYesNoUnknown | ""
  >(initial.representativeMayFile ?? "");

  const [representativeMayReceivePayment, setRepresentativeMayReceivePayment] =
    useState<JurisdictionYesNoUnknown | "">(
      initial.representativeMayReceivePayment ?? "",
    );

  const [
    assignmentRequiredForRepresentativePayment,
    setAssignmentRequiredForRepresentativePayment,
  ] = useState<JurisdictionYesNoUnknown | "">(
    initial.assignmentRequiredForRepresentativePayment ?? "",
  );

  const [feeCollectionMethod, setFeeCollectionMethod] = useState<
    JurisdictionFeeCollectionMethod | ""
  >(initial.feeCollectionMethod ?? "");

  const [paymentRoutingNote, setPaymentRoutingNote] = useState(
    initial.paymentRoutingNote ?? "",
  );

  /* ======================================================================== */
  /* Compliance                                                               */
  /* ======================================================================== */

  const [complianceStatus, setComplianceStatus] = useState<
    ComplianceStatus | ""
  >(initial.complianceStatus ?? "");

  const [legalProcessingRule, setLegalProcessingRule] = useState<
    LegalProcessingRule | ""
  >(initial.legalProcessingRule ?? "");

  const [internalNotes, setInternalNotes] = useState(
    initial.internalNotes ?? "",
  );

  /* ======================================================================== */
  /* Workflow                                                                 */
  /* ======================================================================== */

  const [reviewedAll, setReviewedAll] = useState(
    REVIEW_FINDINGS.every((finding) =>
      draft.reviewedFindings.includes(finding),
    ),
  );

  const [busy, setBusy] = useState(false);

  const [message, setMessage] = useState<string>();

  const [error, setError] = useState<string>();

  const sources = useMemo(
    () => [...draft.sourceCandidates, ...draft.additionalSources],
    [draft.additionalSources, draft.sourceCandidates],
  );

  /* ======================================================================== */
  /* Source controls                                                          */
  /* ======================================================================== */

  function toggleSource(id: string) {
    setSelectedSourceIds((current) => {
      if (current.includes(id)) {
        setPaymentEvidenceSourceIds((evidenceCurrent) =>
          evidenceCurrent.filter((value) => value !== id),
        );

        return current.filter((value) => value !== id);
      }

      return [...current, id];
    });
  }

  function togglePaymentEvidenceSource(id: string) {
    setPaymentEvidenceSourceIds((current) => {
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }

      /*
       * Payment evidence must also be part of the jurisdiction's selected
       * authority sources. Selecting it here automatically ensures that.
       */
      setSelectedSourceIds((selectedCurrent) =>
        selectedCurrent.includes(id)
          ? selectedCurrent
          : [...selectedCurrent, id],
      );

      return [...current, id];
    });
  }

  /* ======================================================================== */
  /* Documents / fees                                                         */
  /* ======================================================================== */

  function toggleDocument(kind: DocumentKind) {
    setRequiredDocuments((current) =>
      current.includes(kind)
        ? current.filter((value) => value !== kind)
        : [...current, kind],
    );
  }

  function toggleFeeModel(model: FeeModel) {
    setPermittedFeeModels((current) =>
      current.includes(model)
        ? current.filter((value) => value !== model)
        : [...current, model],
    );
  }

  /* ======================================================================== */
  /* Payment-route policy                                                     */
  /* ======================================================================== */

  function applyPaymentRoute(route: JurisdictionPaymentRoute | "") {
    setPaymentRoute(route);

    switch (route) {
      case "claimant_only":
        setPaymentLaunchTrack("direct_claimant_recovery");

        setRepresentativeMayReceivePayment("no");

        setAssignmentRequiredForRepresentativePayment("no");

        setFeeCollectionMethod("contractual_post_recovery");

        break;

      case "authorized_representative":
        setPaymentLaunchTrack("managed_representative_recovery");

        setRepresentativeMayReceivePayment("yes");

        setAssignmentRequiredForRepresentativePayment("no");

        setFeeCollectionMethod("representative_disbursement");

        break;

      case "joint_payee":
        setPaymentLaunchTrack("managed_representative_recovery");

        setRepresentativeMayReceivePayment("yes");

        setAssignmentRequiredForRepresentativePayment("no");

        setFeeCollectionMethod("joint_payee_disbursement");

        break;

      case "split_disbursement":
        setPaymentLaunchTrack("managed_representative_recovery");

        setRepresentativeMayReceivePayment("yes");

        setAssignmentRequiredForRepresentativePayment("no");

        setFeeCollectionMethod("split_disbursement");

        break;

      case "assignee":
        setPaymentLaunchTrack("future_acquisition");

        setRepresentativeMayReceivePayment("yes");

        setAssignmentRequiredForRepresentativePayment("yes");

        setFeeCollectionMethod("assignment_acquisition");

        break;

      case "unknown":
        setPaymentLaunchTrack("blocked");

        setRepresentativeMayReceivePayment("unknown");

        setAssignmentRequiredForRepresentativePayment("unknown");

        setFeeCollectionMethod("unknown");

        break;

      case "":
        setPaymentLaunchTrack("");

        setRepresentativeMayReceivePayment("");

        setAssignmentRequiredForRepresentativePayment("");

        setFeeCollectionMethod("");

        break;
    }
  }

  /* ======================================================================== */
  /* Build payload                                                            */
  /* ======================================================================== */

  function buildFindings(): JurisdictionReviewFindings {
    return {
      agencyName: agencyName.trim() || undefined,

      agencyWebsite: agencyWebsite.trim() || undefined,

      agencyPhone: agencyPhone.trim() || undefined,

      custodian: custodian || undefined,

      claimMethod: claimMethod || undefined,

      claimFormUrl: claimFormUrl.trim() || undefined,

      requiredDocuments,

      claimDeadlineDays: numberOrUndefined(claimDeadlineDays),

      statuteReference: statuteReference.trim() || undefined,

      permittedFeeModels,

      feeCapPercent: normalizedPercent(feeCapPercent),

      feeCapAmount: centsFromDollars(feeCapAmount),

      assignmentPermitted:
        assignmentPermitted === "" ? undefined : assignmentPermitted,

      powerOfAttorneyAccepted:
        powerOfAttorneyAccepted === "" ? undefined : powerOfAttorneyAccepted,

      finderLicenseRequired:
        finderLicenseRequired === "" ? undefined : finderLicenseRequired,

      bondRequired: bondRequired === "" ? undefined : bondRequired,

      attorneyRequired: attorneyRequired === "" ? undefined : attorneyRequired,

      mandatoryContractLanguage: lines(mandatoryContractLanguage),

      cancellationPeriodDays: numberOrUndefined(cancellationPeriodDays),

      paymentRoutingNote: paymentRoutingNote.trim() || undefined,

      paymentRoute: paymentRoute || undefined,

      paymentLaunchTrack: paymentLaunchTrack || undefined,

      representativeMayFile: representativeMayFile || undefined,

      representativeMayReceivePayment:
        representativeMayReceivePayment || undefined,

      assignmentRequiredForRepresentativePayment:
        assignmentRequiredForRepresentativePayment || undefined,

      feeCollectionMethod: feeCollectionMethod || undefined,

      probateRequiredWhenDeceased:
        probateRequiredWhenDeceased === ""
          ? undefined
          : probateRequiredWhenDeceased,

      complianceStatus: complianceStatus || undefined,

      legalProcessingRule: legalProcessingRule || undefined,

      internalNotes: internalNotes.trim() || undefined,
    };
  }

  /* ======================================================================== */
  /* Save                                                                     */
  /* ======================================================================== */

  async function save(nextStatus: "draft" | "ready_for_approval") {
    setBusy(true);

    setMessage(undefined);

    setError(undefined);

    try {
      const response = await fetch(
        `/api/jurisdiction-intelligence/reviews/${encodeURIComponent(
          draft.id,
        )}`,
        {
          method: "PATCH",

          headers: {
            "content-type": "application/json",
          },

          body: JSON.stringify({
            scope: scope || undefined,

            findings: buildFindings(),

            selectedSourceIds,

            findingSourceIds: {
              ...draft.findingSourceIds,

              payment_routing: paymentEvidenceSourceIds,
            },

            reviewedFindings: reviewedAll ? REVIEW_FINDINGS : [],

            status: nextStatus,
          }),
        },
      );

      const payload = (await response.json()) as {
        ok?: boolean;

        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save jurisdiction review.");
      }

      setMessage(
        nextStatus === "ready_for_approval"
          ? "Review is ready for compliance approval."
          : "Review draft saved.",
      );

      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save jurisdiction review.",
      );
    } finally {
      setBusy(false);
    }
  }

  /* ======================================================================== */
  /* Approve                                                                  */
  /* ======================================================================== */

  async function approve() {
    setBusy(true);

    setMessage(undefined);

    setError(undefined);

    try {
      const response = await fetch(
        `/api/jurisdiction-intelligence/reviews/${encodeURIComponent(
          draft.id,
        )}/approve`,
        {
          method: "POST",
        },
      );

      const payload = (await response.json()) as {
        ok?: boolean;

        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to approve jurisdiction review.",
        );
      }

      setMessage("Jurisdiction rule approved.");

      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to approve jurisdiction review.",
      );
    } finally {
      setBusy(false);
    }
  }

  /* ======================================================================== */
  /* UI                                                                       */
  /* ======================================================================== */

  return (
    <div className="space-y-5">
      {/* ================================================================== */}
      {/* Official sources                                                   */}
      {/* ================================================================== */}

      <section className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink-900">
            Official sources
            <RequiredMark />
          </h2>

          <p className="mt-1 text-sm text-ink-600">
            Select the official sources relied upon for the jurisdiction rule.
          </p>

          {!locked && selectedSourceIds.length === 0 && (
            <p className="mt-2 text-xs font-medium text-critical-700">
              Required: select at least one official source before marking this
              review ready for approval.
            </p>
          )}
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          {sources.map((source) => (
            <label
              key={source.id}
              className={
                selectedSourceIds.includes(source.id)
                  ? "flex cursor-pointer gap-3 rounded-md border border-accent-500 bg-accent-50/50 px-3 py-3 ring-1 ring-accent-500/20"
                  : "flex cursor-pointer gap-3 rounded-md border border-ink-300 bg-white px-3 py-3 transition-colors hover:border-ink-400"
              }
            >
              <input
                type="checkbox"
                checked={selectedSourceIds.includes(source.id)}
                disabled={locked || busy}
                onChange={() => toggleSource(source.id)}
                className="mt-1"
              />

              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-900">
                  {sourceLabel(source)}
                </span>

                <span className="mt-0.5 block break-all text-xs text-ink-500">
                  {source.url}
                </span>

                {source.contentHash && (
                  <span className="mt-1 block break-all font-mono text-2xs text-ink-400">
                    SHA-256 {source.contentHash}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* ================================================================== */}
      {/* Jurisdiction rule                                                  */}
      {/* ================================================================== */}

      <section className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink-900">
            Jurisdiction rule
          </h2>

          <p className="mt-1 text-sm text-ink-600">
            Record only findings supported by reviewed official authority.
          </p>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <Field label="Rule scope" required>
            <select
              value={scope}
              disabled={locked || busy}
              onChange={(event) =>
                setScope(event.target.value as JurisdictionRuleScope | "")
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select</option>

              <option value="state">Statewide</option>

              <option value="county">County specific</option>
            </select>
          </Field>

          <Field label="Agency name" required>
            <input
              value={agencyName}
              disabled={locked || busy}
              onChange={(event) => setAgencyName(event.target.value)}
              className={CONTROL_CLASS}
            />
          </Field>

          <Field label="Agency website">
            <input
              value={agencyWebsite}
              disabled={locked || busy}
              onChange={(event) => setAgencyWebsite(event.target.value)}
              className={CONTROL_CLASS}
            />
          </Field>

          <Field label="Agency phone">
            <input
              value={agencyPhone}
              disabled={locked || busy}
              onChange={(event) => setAgencyPhone(event.target.value)}
              className={CONTROL_CLASS}
            />
          </Field>

          <Field label="Custodian" required>
            <select
              value={custodian}
              disabled={locked || busy}
              onChange={(event) =>
                setCustodian(event.target.value as SurplusCustodian | "")
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select</option>

              {CUSTODIANS.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Claim method" required>
            <select
              value={claimMethod}
              disabled={locked || busy}
              onChange={(event) =>
                setClaimMethod(event.target.value as ClaimSubmissionMethod | "")
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select</option>

              {CLAIM_METHODS.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Claim form URL">
            <input
              value={claimFormUrl}
              disabled={locked || busy}
              onChange={(event) => setClaimFormUrl(event.target.value)}
              className={CONTROL_CLASS}
            />
          </Field>

          <Field label="Claim deadline, days">
            <input
              type="number"
              min="0"
              value={claimDeadlineDays}
              disabled={locked || busy}
              onChange={(event) => setClaimDeadlineDays(event.target.value)}
              className={CONTROL_CLASS}
            />
          </Field>

          <Field label="Controlling authority" span>
            <input
              value={statuteReference}
              disabled={locked || busy}
              onChange={(event) => setStatuteReference(event.target.value)}
              placeholder="Statute, court rule, order, or official procedure"
              className={CONTROL_CLASS}
            />
          </Field>

          <Field label="Percentage fee cap">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={feeCapPercent}
                disabled={locked || busy}
                onChange={(event) => setFeeCapPercent(event.target.value)}
                className={CONTROL_CLASS}
              />

              <span className="text-sm text-ink-500">%</span>
            </div>
          </Field>

          <Field label="Amount fee cap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-500">$</span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={feeCapAmount}
                disabled={locked || busy}
                onChange={(event) => setFeeCapAmount(event.target.value)}
                className={CONTROL_CLASS}
              />
            </div>
          </Field>

          <Field label="Cancellation period, days">
            <input
              type="number"
              min="0"
              value={cancellationPeriodDays}
              disabled={locked || busy}
              onChange={(event) =>
                setCancellationPeriodDays(event.target.value)
              }
              className={CONTROL_CLASS}
            />
          </Field>

          <Field label="Compliance status" required>
            <select
              value={complianceStatus}
              disabled={locked || busy}
              onChange={(event) =>
                setComplianceStatus(event.target.value as ComplianceStatus | "")
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select</option>

              {COMPLIANCE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Legal processing rule" required>
            <select
              value={legalProcessingRule}
              disabled={locked || busy}
              onChange={(event) =>
                setLegalProcessingRule(
                  event.target.value as LegalProcessingRule | "",
                )
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select</option>

              {LEGAL_PROCESSING_RULES.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* ============================================================== */}
        {/* Fee models                                                      */}
        {/* ============================================================== */}

        <div className="border-t border-line px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-ink-900">
            Permitted fee models
            <RequiredMark />
          </p>

          <p className="mt-1 text-xs text-ink-500">
            Select only the fee models supported by the verified jurisdiction
            rule.
          </p>

          <div className="mt-2 flex flex-wrap gap-3">
            {FEE_MODELS.map((model) => (
              <label
                key={model}
                className="flex items-center gap-2 text-sm text-ink-700"
              >
                <input
                  type="checkbox"
                  checked={permittedFeeModels.includes(model)}
                  disabled={locked || busy}
                  onChange={() => toggleFeeModel(model)}
                />

                {humanize(model)}
              </label>
            ))}
          </div>
        </div>

        {/* ============================================================== */}
        {/* Required documents                                              */}
        {/* ============================================================== */}

        <div className="border-t border-line px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-ink-900">
            Required documents
            <RequiredMark />
          </p>

          <p className="mt-1 text-xs text-ink-500">
            Select the documents required by the official procedure.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DOCUMENT_KINDS.map((kind) => (
              <label
                key={kind}
                className="flex items-start gap-2 text-sm text-ink-700"
              >
                <input
                  type="checkbox"
                  checked={requiredDocuments.includes(kind)}
                  disabled={locked || busy}
                  onChange={() => toggleDocument(kind)}
                  className="mt-0.5"
                />

                {humanize(kind)}
              </label>
            ))}
          </div>
        </div>

        {/* ============================================================== */}
        {/* Legal booleans                                                  */}
        {/* ============================================================== */}

        <div className="border-t border-line px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <BooleanSelect
              label="Assignment permitted"
              value={assignmentPermitted}
              setValue={setAssignmentPermitted}
              disabled={locked || busy}
              required
            />

            <BooleanSelect
              label="Power of attorney accepted"
              value={powerOfAttorneyAccepted}
              setValue={setPowerOfAttorneyAccepted}
              disabled={locked || busy}
              required
            />

            <BooleanSelect
              label="Finder license required"
              value={finderLicenseRequired}
              setValue={setFinderLicenseRequired}
              disabled={locked || busy}
              required
            />

            <BooleanSelect
              label="Bond required"
              value={bondRequired}
              setValue={setBondRequired}
              disabled={locked || busy}
              required
            />

            <BooleanSelect
              label="Attorney required"
              value={attorneyRequired}
              setValue={setAttorneyRequired}
              disabled={locked || busy}
              required
            />

            <BooleanSelect
              label="Estate required when owner deceased"
              value={probateRequiredWhenDeceased}
              setValue={setProbateRequiredWhenDeceased}
              disabled={locked || busy}
              required
            />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* Payment & representation                                           */}
      {/* ================================================================== */}

      <section className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink-900">
            Payment & representation
            <RequiredMark />
          </h2>

          <p className="mt-1 text-sm text-ink-600">
            Classify how the government pays the recovery and how Duequity may
            participate. Do not infer these answers from general surplus law.
          </p>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <Field label="Government payment route" required>
            <select
              value={paymentRoute}
              disabled={locked || busy}
              onChange={(event) =>
                applyPaymentRoute(
                  event.target.value as JurisdictionPaymentRoute | "",
                )
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select</option>

              {PAYMENT_ROUTES.map((value) => (
                <option key={value} value={value}>
                  {paymentRouteLabel(value)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Duequity recovery track" required>
            <input
              value={paymentLaunchTrack ? humanize(paymentLaunchTrack) : ""}
              disabled
              className={CONTROL_CLASS}
            />
          </Field>

          <YesNoUnknownSelect
            label="Representative may file"
            value={representativeMayFile}
            setValue={setRepresentativeMayFile}
            disabled={locked || busy}
            required
          />

          <YesNoUnknownSelect
            label="Representative may receive payment"
            value={representativeMayReceivePayment}
            setValue={setRepresentativeMayReceivePayment}
            disabled={true}
            required
          />

          <YesNoUnknownSelect
            label="Assignment required for representative payment"
            value={assignmentRequiredForRepresentativePayment}
            setValue={setAssignmentRequiredForRepresentativePayment}
            disabled={true}
            required
          />

          <Field label="Fee collection method" required>
            <input
              value={feeCollectionMethod ? humanize(feeCollectionMethod) : ""}
              disabled
              className={CONTROL_CLASS}
            />
          </Field>
        </div>

        {paymentRoute === "claimant_only" && (
          <div className="border-t border-line bg-inset px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-ink-900">
              Direct Claimant Recovery
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              The government pays the lawful claimant or estate representative.
              Duequity relies on the executed service agreement for its agreed
              post-recovery fee.
            </p>
          </div>
        )}

        {(paymentRoute === "authorized_representative" ||
          paymentRoute === "joint_payee" ||
          paymentRoute === "split_disbursement") && (
          <div className="border-t border-line bg-positive-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-positive-900">
              Managed Representative Recovery
            </p>

            <p className="mt-1 text-xs leading-relaxed text-positive-800">
              This route may allow Duequity to receive or participate in payment
              without acquiring ownership of the claimant&apos;s surplus rights.
              Official authority must expressly support the selected route.
            </p>
          </div>
        )}

        {paymentRoute === "assignee" && (
          <div className="border-t border-line bg-caution-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-caution-900">
              Future Acquisition Recovery
            </p>

            <p className="mt-1 text-xs leading-relaxed text-caution-800">
              This route requires assignment or acquisition of surplus rights.
              Duequity may preserve the research, but this pipeline is
              intentionally disabled for launch.
            </p>
          </div>
        )}

        {paymentRoute === "unknown" && (
          <div className="border-t border-line bg-critical-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-critical-900">
              Payment route unresolved
            </p>

            <p className="mt-1 text-xs leading-relaxed text-critical-800">
              This jurisdiction cannot be approved until the government payment
              route and representation rules are established from official
              evidence.
            </p>
          </div>
        )}

        {/* ============================================================== */}
        {/* Payment evidence                                                */}
        {/* ============================================================== */}

        <div className="border-t border-line px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-ink-900">
            Payment-routing evidence
            <RequiredMark />
          </p>

          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Select the official source or sources that directly establish the
            payment route, representative authority, or disbursement procedure.
            Selecting a source here also selects it as an authority source for
            the jurisdiction package.
          </p>

          <div className="mt-3 space-y-3">
            {sources.map((source) => (
              <label
                key={source.id}
                className={
                  paymentEvidenceSourceIds.includes(source.id)
                    ? "flex cursor-pointer gap-3 rounded-md border border-accent-500 bg-accent-50/50 px-3 py-3 ring-1 ring-accent-500/20"
                    : "flex cursor-pointer gap-3 rounded-md border border-ink-300 bg-white px-3 py-3 transition-colors hover:border-ink-400"
                }
              >
                <input
                  type="checkbox"
                  checked={paymentEvidenceSourceIds.includes(source.id)}
                  disabled={locked || busy}
                  onChange={() => togglePaymentEvidenceSource(source.id)}
                  className="mt-1"
                />

                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">
                    {sourceLabel(source)}
                  </span>

                  <span className="mt-0.5 block break-all text-xs text-ink-500">
                    {source.url}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {!locked && paymentEvidenceSourceIds.length === 0 && (
            <p className="mt-3 text-xs font-medium text-critical-700">
              At least one official payment-routing source is required before
              approval.
            </p>
          )}
        </div>

        {/* ============================================================== */}
        {/* Payment notes                                                   */}
        {/* ============================================================== */}

        <div className="border-t border-line px-4 py-4 sm:px-5">
          <Field label="Payment-routing findings">
            <textarea
              value={paymentRoutingNote}
              disabled={locked || busy}
              onChange={(event) => setPaymentRoutingNote(event.target.value)}
              rows={4}
              placeholder="Record exactly what the official authority establishes about the payee, representative filing authority, payment authority, POA, joint checks, split payments, or assignment."
              className={TEXTAREA_CLASS}
            />
          </Field>
        </div>
      </section>

      {/* ================================================================== */}
      {/* Contract / internal notes                                          */}
      {/* ================================================================== */}

      <section className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink-900">
            Contract & review notes
          </h2>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:px-5">
          <Field label="Mandatory contract language">
            <textarea
              value={mandatoryContractLanguage}
              disabled={locked || busy}
              onChange={(event) =>
                setMandatoryContractLanguage(event.target.value)
              }
              rows={4}
              placeholder="One required clause per line"
              className={TEXTAREA_CLASS}
            />
          </Field>

          <Field label="Internal review notes">
            <textarea
              value={internalNotes}
              disabled={locked || busy}
              onChange={(event) => setInternalNotes(event.target.value)}
              rows={4}
              className={TEXTAREA_CLASS}
            />
          </Field>
        </div>
      </section>

      {/* ================================================================== */}
      {/* Review acknowledgment                                              */}
      {/* ================================================================== */}

      {!locked && (
        <section className="rounded-lg border border-line bg-surface px-4 py-4 sm:px-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={reviewedAll}
              disabled={busy}
              onChange={(event) => setReviewedAll(event.target.checked)}
              className="mt-1"
            />

            <span>
              <span className="block text-sm font-semibold text-ink-900">
                Required findings reviewed
                <RequiredMark />
              </span>

              <span className="mt-0.5 block text-xs leading-relaxed text-ink-600">
                I reviewed every required legal, commercial, representation, and
                payment-routing question against the selected official sources.
                Unknown questions remain explicitly unknown and may not be
                treated as permission.
              </span>
            </span>
          </label>
        </section>
      )}

      {!locked && reviewedAll && selectedSourceIds.length === 0 && (
        <div className="rounded-md border border-critical-200 bg-critical-50 px-4 py-3 text-sm text-critical-800">
          Select at least one official source before marking this review ready
          for approval.
        </div>
      )}

      {!locked && reviewedAll && paymentEvidenceSourceIds.length === 0 && (
        <div className="rounded-md border border-critical-200 bg-critical-50 px-4 py-3 text-sm text-critical-800">
          Select at least one official payment-routing evidence source before
          marking this review ready for approval.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-critical-200 bg-critical-50 px-4 py-3 text-sm text-critical-800">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-md border border-positive-200 bg-positive-50 px-4 py-3 text-sm text-positive-800">
          {message}
        </div>
      )}

      {/* ================================================================== */}
      {/* Actions                                                            */}
      {/* ================================================================== */}

      {!locked && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => save("draft")}
            className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-800 disabled:opacity-50"
          >
            Save draft
          </button>

          <button
            type="button"
            disabled={
              busy ||
              !reviewedAll ||
              selectedSourceIds.length === 0 ||
              paymentEvidenceSourceIds.length === 0
            }
            onClick={() => save("ready_for_approval")}
            title={
              selectedSourceIds.length === 0
                ? "Select at least one official source first."
                : paymentEvidenceSourceIds.length === 0
                  ? "Select at least one payment-routing evidence source first."
                  : !reviewedAll
                    ? "Confirm all required findings have been reviewed first."
                    : undefined
            }
            className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark ready for approval
          </button>

          {canApprove && draft.status === "ready_for_approval" && (
            <button
              type="button"
              disabled={busy}
              onClick={approve}
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Approve jurisdiction rule
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Shared field                                                               */
/* ========================================================================== */

function Field({
  label,
  span = false,
  required = false,
  children,
}: {
  label: string;

  span?: boolean;

  required?: boolean;

  children: ReactNode;
}) {
  return (
    <label className={span ? "sm:col-span-2" : undefined}>
      <span className="mb-1.5 block text-xs font-semibold text-ink-700">
        {label}

        {required && <RequiredMark />}
      </span>

      {children}
    </label>
  );
}

/* ========================================================================== */
/* Boolean selector                                                           */
/* ========================================================================== */

function BooleanSelect({
  label,
  value,
  setValue,
  disabled,
  required = false,
}: {
  label: string;

  value: boolean | "";

  setValue: (value: boolean | "") => void;

  disabled: boolean;

  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-semibold text-ink-700">
        {label}

        {required && <RequiredMark />}
      </span>

      <select
        value={value === "" ? "" : value ? "yes" : "no"}
        disabled={disabled}
        onChange={(event) =>
          setValue(
            event.target.value === "" ? "" : event.target.value === "yes",
          )
        }
        className={CONTROL_CLASS}
      >
        <option value="">Select</option>

        <option value="yes">Yes</option>

        <option value="no">No</option>
      </select>
    </label>
  );
}

/* ========================================================================== */
/* Yes / No / Unknown selector                                                */
/* ========================================================================== */

function YesNoUnknownSelect({
  label,
  value,
  setValue,
  disabled,
  required = false,
}: {
  label: string;

  value: JurisdictionYesNoUnknown | "";

  setValue: (value: JurisdictionYesNoUnknown | "") => void;

  disabled: boolean;

  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-semibold text-ink-700">
        {label}

        {required && <RequiredMark />}
      </span>

      <select
        value={value}
        disabled={disabled}
        onChange={(event) =>
          setValue(event.target.value as JurisdictionYesNoUnknown | "")
        }
        className={CONTROL_CLASS}
      >
        <option value="">Select</option>

        {YES_NO_UNKNOWN_VALUES.map((option) => (
          <option key={option} value={option}>
            {yesNoUnknownLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
