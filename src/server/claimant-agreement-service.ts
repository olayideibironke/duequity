import "server-only";

import {
  createHash,
} from "node:crypto";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* DueQuity Recovery Services Agreement                                        */
/* ========================================================================== */

export const RECOVERY_SERVICES_TEMPLATE_KEY =
  "duequity_recovery_services_agreement";

export const RECOVERY_SERVICES_TEMPLATE_VERSION =
  1;

export const RECOVERY_SERVICES_TEMPLATE_TITLE =
  "DueQuity Recovery Services Agreement";

export const RECOVERY_SERVICES_REQUIRED_ACKNOWLEDGEMENTS =
  [
    "electronic_records_consent",
    "document_retention_confirmed",
    "agreement_reviewed",
    "claim_and_fee_schedule_reviewed",
    "free_claim_option_acknowledged",
    "no_guarantee_acknowledged",
    "not_law_firm_acknowledged",
    "payment_route_acknowledged",
  ] as const;

export const RECOVERY_SERVICES_ELECTRONIC_CONSENT_TEXT =
  [
    "I consent to conduct this transaction electronically and to receive",
    "records relating to this DueQuity agreement electronically. I confirm",
    "that I can access, view, download and retain an electronic copy of the",
    "agreement and related records.",
  ].join(" ");

export const RECOVERY_SERVICES_SIGNATURE_INTENT_TEXT =
  [
    "By selecting Sign & Submit, I intend to electronically sign this",
    "agreement. I understand that my electronic signature represents my",
    "intent to agree to the terms of this agreement.",
  ].join(" ");

/* ========================================================================== */
/* Agreement body                                                              */
/* ========================================================================== */

const RECOVERY_SERVICES_TEMPLATE_BODY =
  `
DUEQUITY RECOVERY SERVICES AGREEMENT

This Recovery Services Agreement ("Agreement") is between Westforge Holdings Inc., through its DueQuity product and service ("DueQuity"), and {{CLAIMANT_LEGAL_NAME}} ("Claimant").

Claim Reference: {{CLAIM_REFERENCE}}
Claimant Reference: {{CLAIMANT_REFERENCE}}
Jurisdiction: {{JURISDICTION_LABEL}}

1. PURPOSE AND SCOPE OF SERVICES

Claimant voluntarily engages DueQuity to provide administrative surplus-recovery support relating to the Claim identified above.

Depending on the lawful process permitted by the applicable jurisdiction, DueQuity may research records, organize information and documents, communicate with Claimant, assist Claimant with understanding administrative filing requirements, prepare administrative materials, track the recovery process, and provide other non-legal recovery support permitted by the approved DueQuity jurisdiction workflow.

DueQuity will not perform an act that the applicable jurisdiction does not permit DueQuity to perform.

2. DUEQUITY IS A PRIVATE SERVICE

DueQuity is a private service and a product of Westforge Holdings Inc.

DueQuity is not a government agency, court, county office, tax office, sheriff, trustee, public official, or law firm.

DueQuity does not claim government sponsorship, affiliation, or authority.

3. CLAIMANT'S RIGHT TO PURSUE THE RECOVERY WITHOUT DUEQUITY

Claimant understands that using DueQuity is voluntary.

Where the applicable law and recovery process permit Claimant to pursue the funds directly, Claimant may choose to pursue the recovery without DueQuity.

Claimant is not required to hire DueQuity merely because DueQuity located or researched the recovery record.

4. NO PURCHASE OR ASSIGNMENT OF CLAIMANT'S SURPLUS RIGHTS

Under DueQuity's current launch service model, this Agreement does not sell, purchase, transfer, or assign Claimant's ownership of the underlying surplus or recovery rights to DueQuity.

Claimant remains the person or entity asserting the underlying recovery right, subject to the determination of the applicable government agency, court, custodian, or other authorized decision-maker.

5. RECOVERY INFORMATION

The current recovery figure used for this Agreement is:

{{RECOVERY_BASIS_LABEL}} Recovery Amount: {{RECOVERY_AMOUNT}}

{{RECOVERY_EXPLANATION}}

The amount shown in this Agreement does not itself establish legal entitlement.

The government agency, court, custodian, lien process, competing claimant process, probate process, bankruptcy process, or other lawful determination may affect the amount ultimately payable.

6. DUEQUITY SERVICE FEE

Claimant agrees to the DueQuity service fee shown in Schedule A.

{{FEE_TERMS}}

DueQuity does not require an off-platform upfront recovery fee under this Agreement.

DueQuity will collect only the fee allowed by the written Agreement and the applicable approved jurisdiction workflow.

7. PAYMENT ROUTE

{{PAYMENT_ROUTE_TEXT}}

DueQuity will not change the lawful payee, direct a government payment to an unauthorized person, or represent that DueQuity may receive funds where the applicable jurisdiction does not permit it.

8. CLAIMANT COOPERATION

Claimant agrees to provide truthful and reasonably requested information and documents necessary to evaluate and process the recovery.

Claimant agrees to notify DueQuity if Claimant becomes aware of another claimant, heir, estate representative, bankruptcy, trust, lien dispute, ownership dispute, court proceeding, or other fact that may materially affect entitlement or processing.

Claimant should not provide passwords or unnecessary sensitive financial information through ordinary email, text message, or telephone communications.

9. IDENTITY AND DOCUMENT VERIFICATION

DueQuity may require government-issued identification and other supporting documents appropriate to the recovery.

Submitting a document does not guarantee acceptance, legal entitlement, or payment.

DueQuity may pause the recovery workflow if identity or required supporting documentation cannot be verified.

10. NO GUARANTEE OF RECOVERY

DueQuity does not guarantee that Claimant will receive any particular amount, that a claim will be approved, or that payment will occur within a particular time.

Government agencies, courts, custodians, competing claims, liens, estates, bankruptcy proceedings, and other lawful processes may affect eligibility, timing, or the final recovery.

11. NO LEGAL, TAX, OR FINANCIAL ADVICE

DueQuity is not a law firm and does not provide legal representation through this Agreement.

DueQuity staff do not provide individualized legal, tax, or financial advice.

If a matter requires legal interpretation, litigation, probate counsel, bankruptcy counsel, disputed ownership analysis, or another professional service outside DueQuity's authorized administrative workflow, DueQuity may pause or escalate the matter.

Claimant may obtain independent legal, tax, or financial advice before signing this Agreement.

12. COMMUNICATIONS

Claimant authorizes DueQuity to communicate with Claimant through the contact methods Claimant has voluntarily provided and approved, subject to applicable law and Claimant's communication preferences.

Claimant may request that a communication method be changed or discontinued.

13. PRIVACY AND RECORDS

DueQuity may maintain records reasonably necessary to administer the recovery service, verify identity, document consent, preserve the Agreement, maintain an audit trail, and comply with applicable business and legal obligations.

DueQuity will use controlled systems for claimant records and should not require Claimant to transmit passwords through ordinary communications.

14. ELECTRONIC RECORDS AND SIGNATURES

Claimant may agree to conduct this transaction electronically.

Electronic consent is presented separately from this Agreement.

Before electronically signing, Claimant will be given an opportunity to review the Agreement and retain a copy.

Claimant's electronic signature, when voluntarily submitted through Claimant's authenticated DueQuity account, is intended to evidence Claimant's agreement to the terms presented at the time of signing.

15. CANCELLATION AND TERMINATION

{{CANCELLATION_RIGHTS_TEXT}}

Nothing in this Agreement eliminates a cancellation or rescission right that cannot lawfully be waived.

DueQuity may stop work if continuing the matter would violate an applicable jurisdiction rule, legal restriction, compliance requirement, identity requirement, or other mandatory DueQuity control.

16. MATERIAL CHANGES

The commercial fee, Claimant identity, recovery basis, jurisdiction rule, or other material signed term will not be silently rewritten after electronic execution.

If a material change requires a new agreement, DueQuity will preserve the prior agreement and issue a new agreement for review and signature.

17. FINAL RECOVERY AMOUNT

The recovery amount ultimately paid may differ from the amount displayed when this Agreement is signed.

Where the final recovered amount changes but the agreed fee formula remains valid, DueQuity may generate a Final Recovery Statement showing:

- actual amount recovered;
- contractual fee formula;
- final DueQuity fee; and
- resulting amount attributable to Claimant.

The original signed Agreement remains preserved.

18. APPLICABLE LAW

Mandatory law governing the recovery, applicable consumer protections, and other non-waivable legal requirements control over any inconsistent provision of this Agreement.

Nothing in this Agreement is intended to create a right or authority prohibited by the applicable jurisdiction.

19. ENTIRE AGREEMENT

This Agreement, including Schedule A and the disclosures incorporated into the electronic signing record, states the parties' agreement concerning the DueQuity recovery service for the Claim identified above.

A material modification must be documented through an authorized DueQuity agreement workflow.

SCHEDULE A
CLAIM & FEE DISCLOSURE

Claim Reference: {{CLAIM_REFERENCE}}
Claimant Reference: {{CLAIMANT_REFERENCE}}
Claimant: {{CLAIMANT_LEGAL_NAME}}

Recovery basis: {{RECOVERY_BASIS_LABEL}}
Recovery amount used for agreement: {{RECOVERY_AMOUNT}}

DueQuity fee structure: {{FEE_STRUCTURE_LABEL}}
DueQuity service fee: {{PROJECTED_FEE}}
Projected amount remaining to Claimant: {{PROJECTED_CLAIMANT_NET}}

Payment route: {{PAYMENT_ROUTE_SHORT}}

The projected amounts above are based on the locked commercial and recovery information used to generate this Agreement. The final recovery may change where the responsible government agency, court, custodian, or other authorized decision-maker determines a different payable amount.

Claimant acknowledges that the DueQuity fee formula shown in this Agreement controls rather than an oral estimate or an unsupported percentage stated outside the authorized DueQuity workflow.
`.trim();

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type ClaimantAgreementTemplateStatus =
  | "draft"
  | "approved"
  | "retired";

export type ClaimantAgreementStatus =
  | "draft"
  | "issued"
  | "opened"
  | "consented"
  | "signed"
  | "submitted"
  | "voided"
  | "superseded";

export type ClaimantAgreementRecoveryBasis =
  | "estimated"
  | "confirmed";

export type ClaimantAgreementFeeModel =
  | "percentage"
  | "flat"
  | "capped_success";

export interface ClaimantAgreementTemplateView {
  id: string;

  templateKey: string;

  version: number;

  title: string;

  status:
    ClaimantAgreementTemplateStatus;

  contentHash: string;

  requiredAcknowledgementKeys:
    string[];

  createdByStaffUserId:
    string;

  approvedByStaffUserId?:
    string;

  approvedAt?:
    string;
}

export interface ClaimantAgreementSchedule {
  claimReference: string;

  claimantReference: string;

  claimantLegalName: string;

  jurisdictionLabel: string;

  recoveryBasis:
    ClaimantAgreementRecoveryBasis;

  recoveryAmountCents: number;

  feeModel:
    ClaimantAgreementFeeModel;

  selectedPercentage?:
    number;

  selectedFlatAmountCents?:
    number;

  projectedFeeCents: number;

  projectedClaimantNetCents:
    number;

  paymentRoute: string;

  paymentLaunchTrack: string;
}

export interface ClaimantAgreementEnvelopeView {
  id: string;

  claimId: string;

  claimReference: string;

  claimantId: string;

  claimantReference: string;

  claimantLegalName: string;

  templateId: string;

  templateKey: string;

  templateVersion: number;

  title: string;

  status:
    ClaimantAgreementStatus;

  training:
    boolean;

  schedule:
    ClaimantAgreementSchedule;

  renderedAgreement:
    string;

  agreementHash: string;

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

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface StaffAccessInput {
  actorStaffUserId: string;

  actorRole: string;
}

interface ClaimantOnboardingRow {
  claim_id: string;

  claim_reference: string;

  claimant_id: string;

  claimant_reference: string;

  claimant_auth_user_id:
    | string
    | null;

  legal_name: string;

  identity_verification:
    string;

  jurisdiction_package_id:
    string;

  jurisdiction_package_version:
    number | string;

  legal_rule_version_snapshot:
    number | string;

  commercial_quote_id:
    string;

  commercial_snapshot_hash:
    string;

  commercial_policy_id:
    string;

  commercial_policy_version:
    number | string;

  fee_agreement_id:
    string;

  assigned_staff_user_id:
    | string
    | null;
}

interface OpportunityConversionRow {
  id: string;

  opportunity_id: string;

  claim_id: string;

  claim_reference: string;

  commercial_quote_id: string;

  commercial_snapshot_hash:
    string;

  commercial_policy_id: string;

  commercial_policy_version:
    number | string;

  fee_agreement_id: string;

  jurisdiction_package_id:
    string;

  jurisdiction_package_version:
    number | string;

  legal_rule_version_snapshot:
    number | string;

  status: string;
}

interface CommercialQuoteRow {
  quote_id: string;

  approval_status: string;

  locked_fee_agreement_id:
    | string
    | null;

  snapshot_hash: string;

  recovery_amount_cents:
    number | string;

  recovery_basis:
    string;

  fee_model:
    string;

  selected_percentage:
    number | string | null;

  selected_flat_amount_cents:
    number | string | null;

  projected_fee_cents:
    number | string;

  projected_claimant_net_cents:
    number | string;

  commercial_policy_id:
    string;

  commercial_policy_version:
    number | string;

  legal_rule_version_snapshot:
    number | string;
}

interface JurisdictionRulePackageRow {
  package_id: string;

  version:
    number | string;

  state_code: string;

  state_name: string;

  county_name:
    string | null;

  status: string;

  intake_authorized: boolean;

  cancellation_period_days:
    number | null;

  mandatory_contract_language:
    string[] | null;

  payment_route: string;

  payment_launch_track: string;

  representative_may_file:
    string;

  representative_may_receive_payment:
    string;

  assignment_permitted:
    boolean;

  attorney_required:
    boolean;

  payment_route_ready:
    boolean;

  legal_gate: string;

  claim_submission_gate:
    string;

  fee_gate: string;

  payment_gate: string;

  legal_rule_version:
    number | string;
}

interface OperationalDispositionRow {
  purpose:
    | "training"
    | "retired_qa";

  direct_access_allowed:
    boolean;
}

interface AgreementTemplateRow {
  id: string;

  template_key: string;

  version:
    number | string;

  title: string;

  status:
    ClaimantAgreementTemplateStatus;

  body_markdown: string;

  electronic_consent_text:
    string;

  signature_intent_text:
    string;

  required_acknowledgement_keys:
    string[];

  content_hash: string;

  created_by_staff_user_id:
    string;

  approved_by_staff_user_id:
    | string
    | null;

  approved_at:
    | string
    | null;
}

interface AgreementEnvelopeRow {
  id: string;

  claim_id: string;

  claim_reference: string;

  claimant_id: string;

  claimant_reference: string;

  claimant_auth_user_id:
    string;

  template_id: string;

  template_key: string;

  template_version:
    number | string;

  agreement_title: string;

  status:
    ClaimantAgreementStatus;

  recovery_basis:
    ClaimantAgreementRecoveryBasis;

  recovery_amount_cents:
    number | string;

  fee_model:
    ClaimantAgreementFeeModel;

  selected_percentage:
    number | string | null;

  selected_flat_amount_cents:
    number | string | null;

  projected_fee_cents:
    number | string;

  projected_claimant_net_cents:
    number | string;

  payment_route: string;

  payment_launch_track: string;

  required_acknowledgement_keys:
    string[];

  agreement_snapshot:
    unknown;

  agreement_hash: string;

  issued_at:
    | string
    | null;

  opened_at:
    | string
    | null;

  electronic_consent_at:
    | string
    | null;

  submitted_at:
    | string
    | null;

  signed_at:
    | string
    | null;

  final_document_id:
    | string
    | null;

  final_document_sha256:
    | string
    | null;
}

/* ========================================================================== */
/* Snapshot shape                                                              */
/* ========================================================================== */

interface AgreementSnapshot {
  schemaVersion: 1;

  claimant: {
    claimantId: string;

    claimantReference: string;

    legalName: string;
  };

  claim: {
    claimId: string;

    claimReference: string;
  };

  jurisdiction: {
    packageId: string;

    packageVersion: number;

    legalRuleVersion: number;

    label: string;

    paymentRoute: string;

    paymentLaunchTrack: string;

    representativeMayFile:
      string;

    representativeMayReceivePayment:
      string;

    assignmentPermitted:
      boolean;

    attorneyRequired:
      boolean;

    cancellationPeriodDays:
      number | null;

    mandatoryContractLanguage:
      string[];
  };

  commercial: {
    quoteId: string;

    snapshotHash: string;

    policyId: string;

    policyVersion: number;

    recoveryBasis:
      ClaimantAgreementRecoveryBasis;

    recoveryAmountCents:
      number;

    feeModel:
      ClaimantAgreementFeeModel;

    selectedPercentage?:
      number;

    selectedFlatAmountCents?:
      number;

    projectedFeeCents:
      number;

    projectedClaimantNetCents:
      number;
  };

  rights: {
    duequityIsGovernment:
      false;

    duequityIsLawFirm:
      false;

    serviceIsVoluntary:
      true;

    mayPursueWithoutDuequity:
      true;

    surplusRightsAssignedToDuequity:
      false;
  };

  template: {
    templateId: string;

    templateKey: string;

    templateVersion: number;

    templateContentHash: string;

    title: string;

    requiredAcknowledgementKeys:
      string[];

    electronicConsentText:
      string;

    signatureIntentText:
      string;
  };

  renderedAgreement: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function sha256(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function objectHash(
  value: unknown,
): string {
  return sha256(
    JSON.stringify(
      value,
    ),
  );
}

function requiredText(
  value:
    string | null | undefined,
  label:
    string,
): string {
  const normalized =
    value?.trim() ?? "";

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function positiveInteger(
  value:
    number | string,
  label:
    string,
): number {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <
      1
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return parsed;
}

function cents(
  value:
    number | string,
  label:
    string,
): number {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <
      0
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return parsed;
}

function optionalCents(
  value:
    number | string | null,
  label:
    string,
): number | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  return cents(
    value,
    label,
  );
}

function optionalPercentage(
  value:
    number | string | null,
): number | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <
      0 ||
    parsed >
      1
  ) {
    throw new Error(
      "Stored commercial percentage is invalid.",
    );
  }

  return parsed;
}

function money(
  value: number,
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
    value /
      100,
  );
}

function percentage(
  value: number,
): string {
  const percent =
    value *
    100;

  return Number.isInteger(
    percent,
  )
    ? `${percent.toFixed(
        0,
      )}%`
    : `${percent.toFixed(
        2,
      )}%`;
}

function jurisdictionLabel(
  rule:
    JurisdictionRulePackageRow,
): string {
  return rule.county_name
    ? `${rule.county_name}, ${rule.state_name}`
    : rule.state_name;
}

function recoveryExplanation(
  basis:
    ClaimantAgreementRecoveryBasis,
): string {
  if (
    basis ===
    "confirmed"
  ) {
    return [
      "The amount above is the confirmed recovery amount recorded in the",
      "DueQuity commercial snapshot used to generate this Agreement.",
      "It may still be affected by a lawful adjustment, competing claim,",
      "government determination, lien, estate issue, court order, or other",
      "applicable process.",
    ].join(
      " ",
    );
  }

  return [
    "The amount above is currently an estimate rather than a final government",
    "payment determination. The actual amount available or ultimately recovered",
    "may be higher or lower. The agreed fee formula applies according to the",
    "terms of this Agreement and applicable law.",
  ].join(
    " ",
  );
}

function feeTerms({
  model,
  selectedPercentage,
  selectedFlatAmountCents,
}: {
  model:
    ClaimantAgreementFeeModel;

  selectedPercentage?:
    number;

  selectedFlatAmountCents?:
    number;
}): string {
  if (
    model ===
    "percentage"
  ) {
    if (
      selectedPercentage ===
      undefined
    ) {
      throw new Error(
        "Percentage fee agreement is missing its percentage.",
      );
    }

    return [
      `DueQuity's agreed service fee is ${percentage(
        selectedPercentage,
      )} of the amount actually recovered under this Claim,`,
      "subject to applicable law and the terms of this Agreement.",
    ].join(
      " ",
    );
  }

  if (
    model ===
    "flat"
  ) {
    if (
      selectedFlatAmountCents ===
      undefined
    ) {
      throw new Error(
        "Flat-fee agreement is missing its flat amount.",
      );
    }

    return [
      `DueQuity's agreed service fee is ${money(
        selectedFlatAmountCents,
      )},`,
      "subject to applicable law and the terms of this Agreement.",
    ].join(
      " ",
    );
  }

  if (
    selectedPercentage ===
    undefined
  ) {
    throw new Error(
      "Capped-success agreement is missing its percentage.",
    );
  }

  return [
    `DueQuity's agreed success-fee formula begins at ${percentage(
      selectedPercentage,
    )} of the amount actually recovered,`,
    "subject to the commercial and legal cap frozen into the Claim's approved",
    "commercial snapshot and the terms of this Agreement.",
  ].join(
    " ",
  );
}

function feeStructureLabel({
  model,
  selectedPercentage,
  selectedFlatAmountCents,
}: {
  model:
    ClaimantAgreementFeeModel;

  selectedPercentage?:
    number;

  selectedFlatAmountCents?:
    number;
}): string {
  if (
    model ===
    "percentage"
  ) {
    return selectedPercentage ===
      undefined
      ? "Percentage fee"
      : `${percentage(
          selectedPercentage,
        )} of actual recovery`;
  }

  if (
    model ===
    "flat"
  ) {
    return selectedFlatAmountCents ===
      undefined
      ? "Flat service fee"
      : `${money(
          selectedFlatAmountCents,
        )} flat service fee`;
  }

  return selectedPercentage ===
    undefined
    ? "Capped success fee"
    : `${percentage(
        selectedPercentage,
      )} capped success-fee formula`;
}

function paymentRouteText(
  rule:
    JurisdictionRulePackageRow,
): string {
  if (
    rule.payment_route ===
    "claimant_only"
  ) {
    return [
      "The approved jurisdiction workflow for this Claim is claimant-payee.",
      "The responsible government agency, court, custodian, or other authorized",
      "payer pays the lawful claimant or estate rather than paying DueQuity as",
      "the recovery company. DueQuity's fee is collected separately according",
      "to this Agreement after recovery, where permitted.",
    ].join(
      " ",
    );
  }

  if (
    rule.payment_route ===
    "authorized_representative"
  ) {
    return [
      "The approved jurisdiction workflow permits an authorized representative",
      "route only to the extent stated in the current DueQuity jurisdiction",
      "package. Any authorization document required for that route is separate",
      "from this Recovery Services Agreement.",
    ].join(
      " ",
    );
  }

  return [
    "Payment must follow the exact route recorded in DueQuity's approved",
    "jurisdiction package. DueQuity will not redirect or receive the payment",
    "unless the applicable workflow expressly permits it.",
  ].join(
    " ",
  );
}

function paymentRouteShort(
  rule:
    JurisdictionRulePackageRow,
): string {
  if (
    rule.payment_route ===
    "claimant_only"
  ) {
    return "Payment to claimant / lawful estate";
  }

  if (
    rule.payment_route ===
    "authorized_representative"
  ) {
    return "Authorized representative route, where permitted";
  }

  return rule.payment_route
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

function cancellationRightsText(
  days:
    number | null,
): string {
  if (
    days !==
      null &&
    Number.isInteger(
      days,
    ) &&
    days >
      0
  ) {
    return [
      `The approved jurisdiction workflow currently records a ${days}-day`,
      "cancellation period for the applicable agreement workflow.",
      "The claimant-facing signing record will calculate and display the",
      "applicable cancellation deadline from the actual signing date.",
    ].join(
      " ",
    );
  }

  return [
    "No jurisdiction-specific numeric cancellation period is presently recorded",
    "for this Claim in the approved DueQuity jurisdiction package.",
    "Any cancellation, rescission, or termination right required by applicable",
    "law remains controlling and is not waived by this Agreement.",
  ].join(
    " ",
  );
}

function renderAgreement({
  templateBody,
  onboarding,
  rule,
  quote,
}: {
  templateBody:
    string;

  onboarding:
    ClaimantOnboardingRow;

  rule:
    JurisdictionRulePackageRow;

  quote:
    CommercialQuoteRow;
}): string {
  const recoveryAmount =
    cents(
      quote.recovery_amount_cents,
      "Recovery amount",
    );

  const projectedFee =
    cents(
      quote.projected_fee_cents,
      "Projected fee",
    );

  const claimantNet =
    cents(
      quote.projected_claimant_net_cents,
      "Projected claimant net",
    );

  const recoveryBasis =
    quote.recovery_basis as
      ClaimantAgreementRecoveryBasis;

  const model =
    quote.fee_model as
      ClaimantAgreementFeeModel;

  const selectedPercentage =
    optionalPercentage(
      quote.selected_percentage,
    );

  const selectedFlatAmountCents =
    optionalCents(
      quote.selected_flat_amount_cents,
      "Selected flat fee",
    );

  const replacements: Record<
    string,
    string
  > = {
    "{{CLAIMANT_LEGAL_NAME}}":
      onboarding.legal_name,

    "{{CLAIM_REFERENCE}}":
      onboarding.claim_reference,

    "{{CLAIMANT_REFERENCE}}":
      onboarding.claimant_reference,

    "{{JURISDICTION_LABEL}}":
      jurisdictionLabel(
        rule,
      ),

    "{{RECOVERY_BASIS_LABEL}}":
      recoveryBasis ===
      "confirmed"
        ? "Confirmed"
        : "Estimated",

    "{{RECOVERY_AMOUNT}}":
      money(
        recoveryAmount,
      ),

    "{{RECOVERY_EXPLANATION}}":
      recoveryExplanation(
        recoveryBasis,
      ),

    "{{FEE_TERMS}}":
      feeTerms({
        model,

        selectedPercentage,

        selectedFlatAmountCents,
      }),

    "{{FEE_STRUCTURE_LABEL}}":
      feeStructureLabel({
        model,

        selectedPercentage,

        selectedFlatAmountCents,
      }),

    "{{PROJECTED_FEE}}":
      money(
        projectedFee,
      ),

    "{{PROJECTED_CLAIMANT_NET}}":
      money(
        claimantNet,
      ),

    "{{PAYMENT_ROUTE_TEXT}}":
      paymentRouteText(
        rule,
      ),

    "{{PAYMENT_ROUTE_SHORT}}":
      paymentRouteShort(
        rule,
      ),

    "{{CANCELLATION_RIGHTS_TEXT}}":
      cancellationRightsText(
        rule.cancellation_period_days,
      ),
  };

  let rendered =
    templateBody;

  for (
    const [
      token,
      value,
    ] of Object.entries(
      replacements,
    )
  ) {
    rendered =
      rendered.replaceAll(
        token,
        value,
      );
  }

  if (
    rendered.includes(
      "{{",
    )
  ) {
    throw new Error(
      "Agreement template contains an unresolved placeholder.",
    );
  }

  return rendered;
}

function templateContentHash(): string {
  return objectHash({
    templateKey:
      RECOVERY_SERVICES_TEMPLATE_KEY,

    version:
      RECOVERY_SERVICES_TEMPLATE_VERSION,

    title:
      RECOVERY_SERVICES_TEMPLATE_TITLE,

    body:
      RECOVERY_SERVICES_TEMPLATE_BODY,

    electronicConsent:
      RECOVERY_SERVICES_ELECTRONIC_CONSENT_TEXT,

    signatureIntent:
      RECOVERY_SERVICES_SIGNATURE_INTENT_TEXT,

    acknowledgements:
      RECOVERY_SERVICES_REQUIRED_ACKNOWLEDGEMENTS,
  });
}

/* ========================================================================== */
/* Row converters                                                              */
/* ========================================================================== */

function templateFromRow(
  row:
    AgreementTemplateRow,
): ClaimantAgreementTemplateView {
  return {
    id:
      row.id,

    templateKey:
      row.template_key,

    version:
      positiveInteger(
        row.version,
        "Template version",
      ),

    title:
      row.title,

    status:
      row.status,

    contentHash:
      row.content_hash,

    requiredAcknowledgementKeys:
      row.required_acknowledgement_keys,

    createdByStaffUserId:
      row.created_by_staff_user_id,

    approvedByStaffUserId:
      row.approved_by_staff_user_id ??
      undefined,

    approvedAt:
      row.approved_at ??
      undefined,
  };
}

function snapshotFromUnknown(
  value: unknown,
): AgreementSnapshot {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "Stored agreement snapshot is invalid.",
    );
  }

  return value as
    AgreementSnapshot;
}

function envelopeFromRow(
  row:
    AgreementEnvelopeRow,
  training:
    boolean,
): ClaimantAgreementEnvelopeView {
  const snapshot =
    snapshotFromUnknown(
      row.agreement_snapshot,
    );

  const commercial =
    snapshot.commercial;

  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    claimantId:
      row.claimant_id,

    claimantReference:
      row.claimant_reference,

    claimantLegalName:
      snapshot.claimant.legalName,

    templateId:
      row.template_id,

    templateKey:
      row.template_key,

    templateVersion:
      positiveInteger(
        row.template_version,
        "Template version",
      ),

    title:
      row.agreement_title,

    status:
      row.status,

    training,

    schedule: {
      claimReference:
        row.claim_reference,

      claimantReference:
        row.claimant_reference,

      claimantLegalName:
        snapshot.claimant
          .legalName,

      jurisdictionLabel:
        snapshot.jurisdiction
          .label,

      recoveryBasis:
        row.recovery_basis,

      recoveryAmountCents:
        cents(
          row.recovery_amount_cents,
          "Recovery amount",
        ),

      feeModel:
        row.fee_model,

      selectedPercentage:
        commercial.selectedPercentage,

      selectedFlatAmountCents:
        commercial
          .selectedFlatAmountCents,

      projectedFeeCents:
        cents(
          row.projected_fee_cents,
          "Projected fee",
        ),

      projectedClaimantNetCents:
        cents(
          row.projected_claimant_net_cents,
          "Projected claimant net",
        ),

      paymentRoute:
        row.payment_route,

      paymentLaunchTrack:
        row.payment_launch_track,
    },

    renderedAgreement:
      snapshot.renderedAgreement,

    agreementHash:
      row.agreement_hash,

    requiredAcknowledgementKeys:
      row.required_acknowledgement_keys,

    electronicConsentText:
      snapshot.template
        .electronicConsentText,

    signatureIntentText:
      snapshot.template
        .signatureIntentText,

    issuedAt:
      row.issued_at ??
      undefined,

    openedAt:
      row.opened_at ??
      undefined,

    electronicConsentAt:
      row.electronic_consent_at ??
      undefined,

    signedAt:
      row.signed_at ??
      undefined,

    submittedAt:
      row.submitted_at ??
      undefined,

    finalDocumentId:
      row.final_document_id ??
      undefined,

    finalDocumentSha256:
      row.final_document_sha256 ??
      undefined,
  };
}

/* ========================================================================== */
/* Access                                                                      */
/* ========================================================================== */

function assertStaffAccess(
  onboarding:
    ClaimantOnboardingRow,
  access:
    StaffAccessInput,
): void {
  const actorUserId =
    requiredText(
      access.actorStaffUserId,
      "Staff user ID",
    );

  if (
    access.actorRole ===
    "super_admin"
  ) {
    return;
  }

  if (
    onboarding
      .assigned_staff_user_id !==
    actorUserId
  ) {
    throw new Error(
      "Claimant agreement access is limited to the claimant's assigned staff member.",
    );
  }
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

async function getClaimantRow(
  claimantId:
    string,
): Promise<
  ClaimantOnboardingRow | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_onboarding",
      )
      .select(
        [
          "claim_id",
          "claim_reference",
          "claimant_id",
          "claimant_reference",
          "claimant_auth_user_id",
          "legal_name",
          "identity_verification",
          "jurisdiction_package_id",
          "jurisdiction_package_version",
          "legal_rule_version_snapshot",
          "commercial_quote_id",
          "commercial_snapshot_hash",
          "commercial_policy_id",
          "commercial_policy_version",
          "fee_agreement_id",
          "assigned_staff_user_id",
        ].join(
          ", ",
        ),
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read claimant agreement profile: ${error.message}`,
    );
  }

  return data
    ? data as unknown as
        ClaimantOnboardingRow
    : undefined;
}

async function getConversionRow(
  claimId:
    string,
): Promise<
  OpportunityConversionRow
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "opportunity_conversions",
      )
      .select(
        [
          "id",
          "opportunity_id",
          "claim_id",
          "claim_reference",
          "commercial_quote_id",
          "commercial_snapshot_hash",
          "commercial_policy_id",
          "commercial_policy_version",
          "fee_agreement_id",
          "jurisdiction_package_id",
          "jurisdiction_package_version",
          "legal_rule_version_snapshot",
          "status",
        ].join(
          ", ",
        ),
      )
      .eq(
        "claim_id",
        claimId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read agreement conversion record: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Converted Claim record could not be resolved.",
    );
  }

  return data as unknown as
    OpportunityConversionRow;
}

async function getCommercialQuoteRow(
  quoteId:
    string,
): Promise<
  CommercialQuoteRow
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "commercial_fee_quotes",
      )
      .select(
        [
          "quote_id",
          "approval_status",
          "locked_fee_agreement_id",
          "snapshot_hash",
          "recovery_amount_cents",
          "recovery_basis",
          "fee_model",
          "selected_percentage",
          "selected_flat_amount_cents",
          "projected_fee_cents",
          "projected_claimant_net_cents",
          "commercial_policy_id",
          "commercial_policy_version",
          "legal_rule_version_snapshot",
        ].join(
          ", ",
        ),
      )
      .eq(
        "quote_id",
        quoteId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read locked commercial quote: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Locked commercial quote could not be resolved.",
    );
  }

  return data as unknown as
    CommercialQuoteRow;
}

async function getJurisdictionRuleRow(
  packageId:
    string,
  version:
    number,
): Promise<
  JurisdictionRulePackageRow
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "jurisdiction_rule_packages",
      )
      .select(
        [
          "package_id",
          "version",
          "state_code",
          "state_name",
          "county_name",
          "status",
          "intake_authorized",
          "cancellation_period_days",
          "mandatory_contract_language",
          "payment_route",
          "payment_launch_track",
          "representative_may_file",
          "representative_may_receive_payment",
          "assignment_permitted",
          "attorney_required",
          "payment_route_ready",
          "legal_gate",
          "claim_submission_gate",
          "fee_gate",
          "payment_gate",
          "legal_rule_version",
        ].join(
          ", ",
        ),
      )
      .eq(
        "package_id",
        packageId,
      )
      .eq(
        "version",
        version,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read agreement jurisdiction package: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Approved jurisdiction package could not be resolved.",
    );
  }

  return data as unknown as
    JurisdictionRulePackageRow;
}

async function trainingDisposition(
  opportunityId:
    string,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "operational_record_dispositions",
      )
      .select(
        "purpose, direct_access_allowed",
      )
      .eq(
        "record_type",
        "opportunity",
      )
      .eq(
        "record_id",
        opportunityId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve agreement training disposition: ${error.message}`,
    );
  }

  if (!data) {
    return false;
  }

  const disposition =
    data as
      OperationalDispositionRow;

  return (
    disposition.purpose ===
      "training" &&
    disposition
      .direct_access_allowed
  );
}

async function getTemplateRow(): Promise<
  AgreementTemplateRow | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_templates",
      )
      .select(
        "*",
      )
      .eq(
        "template_key",
        RECOVERY_SERVICES_TEMPLATE_KEY,
      )
      .eq(
        "version",
        RECOVERY_SERVICES_TEMPLATE_VERSION,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read Recovery Services Agreement template: ${error.message}`,
    );
  }

  return data
    ? data as
        AgreementTemplateRow
    : undefined;
}

async function agreementTrainingFlag(
  envelope:
    AgreementEnvelopeRow,
): Promise<boolean> {
  const conversion =
    await getConversionRow(
      envelope.claim_id,
    );

  return trainingDisposition(
    conversion.opportunity_id,
  );
}

/* ========================================================================== */
/* Agreement events                                                            */
/* ========================================================================== */

async function appendAgreementEvent({
  envelopeId,
  eventType,
  actorType,
  actorStaffUserId,
  actorClaimantAuthUserId,
  occurredAt,
  detail,
}: {
  envelopeId:
    string;

  eventType:
    | "created"
    | "issued"
    | "opened"
    | "electronic_consent"
    | "disclosures_acknowledged"
    | "signing_started"
    | "signed"
    | "submitted"
    | "voided"
    | "superseded";

  actorType:
    | "staff"
    | "claimant"
    | "system";

  actorStaffUserId?:
    string;

  actorClaimantAuthUserId?:
    string;

  occurredAt:
    string;

  detail?:
    Record<
      string,
      unknown
    >;
}): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_events",
      )
      .insert({
        envelope_id:
          envelopeId,

        event_type:
          eventType,

        actor_type:
          actorType,

        actor_staff_user_id:
          actorStaffUserId ??
          null,

        actor_claimant_auth_user_id:
          actorClaimantAuthUserId ??
          null,

        occurred_at:
          occurredAt,

        detail:
          detail ??
          {},
      });

  if (
    error
  ) {
    throw new Error(
      `Unable to append agreement event: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Template lifecycle                                                          */
/* ========================================================================== */

export async function ensureRecoveryServicesAgreementDraft(
  access:
    StaffAccessInput,
): Promise<
  ClaimantAgreementTemplateView
> {
  if (
    access.actorRole !==
    "super_admin"
  ) {
    throw new Error(
      "Only Super Admin may initialize the DueQuity Recovery Services Agreement template.",
    );
  }

  const existing =
    await getTemplateRow();

  if (
    existing
  ) {
    if (
      existing.content_hash !==
      templateContentHash()
    ) {
      throw new Error(
        "The stored agreement template version does not match the current application template. Create a new template version instead of overwriting legal content.",
      );
    }

    return templateFromRow(
      existing,
    );
  }

  const actorUserId =
    requiredText(
      access.actorStaffUserId,
      "Staff user ID",
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_templates",
      )
      .insert({
        template_key:
          RECOVERY_SERVICES_TEMPLATE_KEY,

        version:
          RECOVERY_SERVICES_TEMPLATE_VERSION,

        title:
          RECOVERY_SERVICES_TEMPLATE_TITLE,

        status:
          "draft",

        body_markdown:
          RECOVERY_SERVICES_TEMPLATE_BODY,

        electronic_consent_text:
          RECOVERY_SERVICES_ELECTRONIC_CONSENT_TEXT,

        signature_intent_text:
          RECOVERY_SERVICES_SIGNATURE_INTENT_TEXT,

        required_acknowledgement_keys:
          [
            ...RECOVERY_SERVICES_REQUIRED_ACKNOWLEDGEMENTS,
          ],

        content_hash:
          templateContentHash(),

        created_by_staff_user_id:
          actorUserId,
      })
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to initialize Recovery Services Agreement template: ${error.message}`,
    );
  }

  return templateFromRow(
    data as
      AgreementTemplateRow,
  );
}

export async function approveRecoveryServicesAgreementTemplate(
  access:
    StaffAccessInput,
): Promise<
  ClaimantAgreementTemplateView
> {
  if (
    access.actorRole !==
    "super_admin"
  ) {
    throw new Error(
      "Only Super Admin may approve a DueQuity agreement template.",
    );
  }

  const template =
    await getTemplateRow();

  if (!template) {
    throw new Error(
      "Recovery Services Agreement template has not been initialized.",
    );
  }

  if (
    template.content_hash !==
    templateContentHash()
  ) {
    throw new Error(
      "Agreement template integrity check failed.",
    );
  }

  if (
    template.status ===
    "approved"
  ) {
    return templateFromRow(
      template,
    );
  }

  if (
    template.status !==
    "draft"
  ) {
    throw new Error(
      "Only a draft agreement template may be approved.",
    );
  }

  const now =
    new Date()
      .toISOString();

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_templates",
      )
      .update({
        status:
          "approved",

        approved_by_staff_user_id:
          access.actorStaffUserId,

        approved_at:
          now,
      })
      .eq(
        "id",
        template.id,
      )
      .eq(
        "status",
        "draft",
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to approve agreement template: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Agreement template changed while approval was being processed.",
    );
  }

  return templateFromRow(
    data as
      AgreementTemplateRow,
  );
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function assertAgreementSourceConsistency({
  onboarding,
  conversion,
  quote,
  rule,
}: {
  onboarding:
    ClaimantOnboardingRow;

  conversion:
    OpportunityConversionRow;

  quote:
    CommercialQuoteRow;

  rule:
    JurisdictionRulePackageRow;
}): void {
  if (
    conversion.status !==
    "converted"
  ) {
    throw new Error(
      "Claim conversion is not in converted status.",
    );
  }

  if (
    conversion.claim_id !==
      onboarding.claim_id ||
    conversion.claim_reference !==
      onboarding.claim_reference
  ) {
    throw new Error(
      "Claimant onboarding does not match the persisted Claim conversion.",
    );
  }

  if (
    quote.approval_status !==
    "locked"
  ) {
    throw new Error(
      "Commercial pricing must be locked before an agreement can be prepared.",
    );
  }

  if (
    quote.quote_id !==
      conversion.commercial_quote_id ||
    quote.quote_id !==
      onboarding.commercial_quote_id
  ) {
    throw new Error(
      "The Claim does not reference one consistent commercial quote.",
    );
  }

  if (
    quote.snapshot_hash !==
      conversion.commercial_snapshot_hash ||
    quote.snapshot_hash !==
      onboarding.commercial_snapshot_hash
  ) {
    throw new Error(
      "Commercial quote snapshot integrity does not match the Claim.",
    );
  }

  if (
    quote.locked_fee_agreement_id !==
      conversion.fee_agreement_id ||
    quote.locked_fee_agreement_id !==
      onboarding.fee_agreement_id
  ) {
    throw new Error(
      "Commercial pricing is not locked to the Claim's fee-agreement record.",
    );
  }

  const quotePolicyVersion =
    positiveInteger(
      quote.commercial_policy_version,
      "Quote policy version",
    );

  const conversionPolicyVersion =
    positiveInteger(
      conversion.commercial_policy_version,
      "Conversion policy version",
    );

  const onboardingPolicyVersion =
    positiveInteger(
      onboarding.commercial_policy_version,
      "Onboarding policy version",
    );

  if (
    quote.commercial_policy_id !==
      conversion.commercial_policy_id ||
    quote.commercial_policy_id !==
      onboarding.commercial_policy_id ||
    quotePolicyVersion !==
      conversionPolicyVersion ||
    quotePolicyVersion !==
      onboardingPolicyVersion
  ) {
    throw new Error(
      "Commercial policy provenance is inconsistent across the Claim.",
    );
  }

  const ruleVersion =
    positiveInteger(
      rule.version,
      "Jurisdiction package version",
    );

  const conversionRuleVersion =
    positiveInteger(
      conversion.jurisdiction_package_version,
      "Conversion jurisdiction package version",
    );

  const onboardingRuleVersion =
    positiveInteger(
      onboarding.jurisdiction_package_version,
      "Onboarding jurisdiction package version",
    );

  if (
    rule.package_id !==
      conversion.jurisdiction_package_id ||
    rule.package_id !==
      onboarding.jurisdiction_package_id ||
    ruleVersion !==
      conversionRuleVersion ||
    ruleVersion !==
      onboardingRuleVersion
  ) {
    throw new Error(
      "Jurisdiction package provenance is inconsistent across the Claim.",
    );
  }

  const legalRuleVersion =
    positiveInteger(
      rule.legal_rule_version,
      "Jurisdiction legal-rule version",
    );

  if (
    legalRuleVersion !==
      positiveInteger(
        conversion.legal_rule_version_snapshot,
        "Conversion legal-rule version",
      ) ||
    legalRuleVersion !==
      positiveInteger(
        onboarding.legal_rule_version_snapshot,
        "Onboarding legal-rule version",
      ) ||
    legalRuleVersion !==
      positiveInteger(
        quote.legal_rule_version_snapshot,
        "Quote legal-rule version",
      )
  ) {
    throw new Error(
      "Jurisdiction legal-rule provenance is inconsistent across the Claim.",
    );
  }

  if (
    rule.status !==
      "approved" ||
    !rule.intake_authorized ||
    !rule.payment_route_ready ||
    rule.legal_gate !==
      "permitted" ||
    rule.claim_submission_gate !==
      "permitted" ||
    rule.fee_gate !==
      "permitted" ||
    rule.payment_gate !==
      "permitted"
  ) {
    throw new Error(
      "The current frozen jurisdiction package does not authorize the agreement workflow.",
    );
  }

  const recoveryBasis =
    quote.recovery_basis;

  if (
    recoveryBasis !==
      "estimated" &&
    recoveryBasis !==
      "confirmed"
  ) {
    throw new Error(
      "Commercial quote has an invalid recovery basis.",
    );
  }

  const feeModel =
    quote.fee_model;

  if (
    feeModel !==
      "percentage" &&
    feeModel !==
      "flat" &&
    feeModel !==
      "capped_success"
  ) {
    throw new Error(
      "Commercial quote has an unsupported fee model.",
    );
  }
}

/* ========================================================================== */
/* Build snapshot                                                              */
/* ========================================================================== */

function buildAgreementSnapshot({
  onboarding,
  template,
  quote,
  rule,
}: {
  onboarding:
    ClaimantOnboardingRow;

  template:
    AgreementTemplateRow;

  quote:
    CommercialQuoteRow;

  rule:
    JurisdictionRulePackageRow;
}): AgreementSnapshot {
  const recoveryBasis =
    quote.recovery_basis as
      ClaimantAgreementRecoveryBasis;

  const feeModel =
    quote.fee_model as
      ClaimantAgreementFeeModel;

  const recoveryAmountCents =
    cents(
      quote.recovery_amount_cents,
      "Recovery amount",
    );

  const projectedFeeCents =
    cents(
      quote.projected_fee_cents,
      "Projected fee",
    );

  const projectedClaimantNetCents =
    cents(
      quote.projected_claimant_net_cents,
      "Projected claimant net",
    );

  const selectedPercentage =
    optionalPercentage(
      quote.selected_percentage,
    );

  const selectedFlatAmountCents =
    optionalCents(
      quote.selected_flat_amount_cents,
      "Selected flat amount",
    );

  const renderedAgreement =
    renderAgreement({
      templateBody:
        template.body_markdown,

      onboarding,

      rule,

      quote,
    });

  return {
    schemaVersion:
      1,

    claimant: {
      claimantId:
        onboarding.claimant_id,

      claimantReference:
        onboarding.claimant_reference,

      legalName:
        onboarding.legal_name,
    },

    claim: {
      claimId:
        onboarding.claim_id,

      claimReference:
        onboarding.claim_reference,
    },

    jurisdiction: {
      packageId:
        rule.package_id,

      packageVersion:
        positiveInteger(
          rule.version,
          "Jurisdiction package version",
        ),

      legalRuleVersion:
        positiveInteger(
          rule.legal_rule_version,
          "Jurisdiction legal-rule version",
        ),

      label:
        jurisdictionLabel(
          rule,
        ),

      paymentRoute:
        rule.payment_route,

      paymentLaunchTrack:
        rule.payment_launch_track,

      representativeMayFile:
        rule.representative_may_file,

      representativeMayReceivePayment:
        rule
          .representative_may_receive_payment,

      assignmentPermitted:
        rule.assignment_permitted,

      attorneyRequired:
        rule.attorney_required,

      cancellationPeriodDays:
        rule.cancellation_period_days,

      mandatoryContractLanguage:
        rule.mandatory_contract_language ??
        [],
    },

    commercial: {
      quoteId:
        quote.quote_id,

      snapshotHash:
        quote.snapshot_hash,

      policyId:
        quote.commercial_policy_id,

      policyVersion:
        positiveInteger(
          quote.commercial_policy_version,
          "Commercial policy version",
        ),

      recoveryBasis,

      recoveryAmountCents,

      feeModel,

      selectedPercentage,

      selectedFlatAmountCents,

      projectedFeeCents,

      projectedClaimantNetCents,
    },

    rights: {
      duequityIsGovernment:
        false,

      duequityIsLawFirm:
        false,

      serviceIsVoluntary:
        true,

      mayPursueWithoutDuequity:
        true,

      surplusRightsAssignedToDuequity:
        false,
    },

    template: {
      templateId:
        template.id,

      templateKey:
        template.template_key,

      templateVersion:
        positiveInteger(
          template.version,
          "Template version",
        ),

      templateContentHash:
        template.content_hash,

      title:
        template.title,

      requiredAcknowledgementKeys:
        template
          .required_acknowledgement_keys,

      electronicConsentText:
        template
          .electronic_consent_text,

      signatureIntentText:
        template
          .signature_intent_text,
    },

    renderedAgreement,
  };
}

/* ========================================================================== */
/* Staff envelope preparation                                                  */
/* ========================================================================== */

export async function prepareClaimantAgreementForStaff({
  claimantId,
  actorStaffUserId,
  actorRole,
}: {
  claimantId:
    string;

  actorStaffUserId:
    string;

  actorRole:
    string;
}): Promise<
  ClaimantAgreementEnvelopeView
> {
  const onboarding =
    await getClaimantRow(
      requiredText(
        claimantId,
        "Claimant ID",
      ),
    );

  if (!onboarding) {
    throw new Error(
      "Claimant record not found.",
    );
  }

  assertStaffAccess(
    onboarding,
    {
      actorStaffUserId,

      actorRole,
    },
  );

  if (
    !onboarding
      .claimant_auth_user_id
  ) {
    throw new Error(
      "Claimant portal activation must be completed before an agreement can be issued.",
    );
  }

  const [
    conversion,
    template,
  ] =
    await Promise.all([
      getConversionRow(
        onboarding.claim_id,
      ),

      getTemplateRow(),
    ]);

  if (!template) {
    throw new Error(
      "Recovery Services Agreement template has not been initialized by Super Admin.",
    );
  }

  if (
    template.content_hash !==
    templateContentHash()
  ) {
    throw new Error(
      "Recovery Services Agreement template integrity check failed.",
    );
  }

  const training =
    await trainingDisposition(
      conversion.opportunity_id,
    );

  if (
    template.status !==
      "approved" &&
    !(
      training &&
      template.status ===
        "draft"
    )
  ) {
    throw new Error(
      "The Recovery Services Agreement has not been approved for production issuance.",
    );
  }

  const [
    quote,
    rule,
  ] =
    await Promise.all([
      getCommercialQuoteRow(
        conversion
          .commercial_quote_id,
      ),

      getJurisdictionRuleRow(
        conversion
          .jurisdiction_package_id,

        positiveInteger(
          conversion
            .jurisdiction_package_version,
          "Conversion jurisdiction package version",
        ),
      ),
    ]);

  assertAgreementSourceConsistency({
    onboarding,

    conversion,

    quote,

    rule,
  });

  const supabase =
    getSupabaseAdmin();

  const {
    data:
      existingData,
    error:
      existingError,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        onboarding.claim_id,
      )
      .in(
        "status",
        [
          "draft",
          "issued",
          "opened",
          "consented",
          "signed",
          "submitted",
        ],
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      )
      .maybeSingle();

  if (
    existingError
  ) {
    throw new Error(
      `Unable to inspect existing agreement: ${existingError.message}`,
    );
  }

  if (
    existingData
  ) {
    const existing =
      existingData as
        AgreementEnvelopeRow;

    const existingSnapshot =
      snapshotFromUnknown(
        existing.agreement_snapshot,
      );

    if (
      existingSnapshot.commercial
        .snapshotHash !==
        quote.snapshot_hash
    ) {
      throw new Error(
        "A current agreement already exists for an older commercial snapshot. It must be voided or superseded before a replacement is prepared.",
      );
    }

    return envelopeFromRow(
      existing,
      training,
    );
  }

  const snapshot =
    buildAgreementSnapshot({
      onboarding,

      template,

      quote,

      rule,
    });

  const agreementHash =
    objectHash(
      snapshot,
    );

  const now =
    new Date()
      .toISOString();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .insert({
        claim_id:
          onboarding.claim_id,

        claim_reference:
          onboarding.claim_reference,

        claimant_id:
          onboarding.claimant_id,

        claimant_reference:
          onboarding.claimant_reference,

        claimant_auth_user_id:
          onboarding
            .claimant_auth_user_id,

        template_id:
          template.id,

        template_key:
          template.template_key,

        template_version:
          positiveInteger(
            template.version,
            "Template version",
          ),

        template_content_hash:
          template.content_hash,

        agreement_title:
          template.title,

        status:
          "draft",

        recovery_basis:
          quote.recovery_basis,

        recovery_amount_cents:
          cents(
            quote.recovery_amount_cents,
            "Recovery amount",
          ),

        fee_model:
          quote.fee_model,

        selected_percentage:
          optionalPercentage(
            quote.selected_percentage,
          ) ??
          null,

        selected_flat_amount_cents:
          optionalCents(
            quote
              .selected_flat_amount_cents,
            "Selected flat amount",
          ) ??
          null,

        projected_fee_cents:
          cents(
            quote.projected_fee_cents,
            "Projected fee",
          ),

        projected_claimant_net_cents:
          cents(
            quote
              .projected_claimant_net_cents,
            "Projected claimant net",
          ),

        commercial_quote_id:
          quote.quote_id,

        commercial_snapshot_hash:
          quote.snapshot_hash,

        commercial_policy_id:
          quote.commercial_policy_id,

        commercial_policy_version:
          positiveInteger(
            quote
              .commercial_policy_version,
            "Commercial policy version",
          ),

        jurisdiction_package_id:
          rule.package_id,

        jurisdiction_package_version:
          positiveInteger(
            rule.version,
            "Jurisdiction package version",
          ),

        jurisdiction_legal_rule_version:
          positiveInteger(
            rule.legal_rule_version,
            "Jurisdiction legal-rule version",
          ),

        payment_route:
          rule.payment_route,

        payment_launch_track:
          rule.payment_launch_track,

        claimant_rights_snapshot:
          snapshot.rights,

        required_acknowledgement_keys:
          snapshot.template
            .requiredAcknowledgementKeys,

        agreement_snapshot:
          snapshot,

        agreement_hash:
          agreementHash,

        created_by_staff_user_id:
          actorStaffUserId,

        created_at:
          now,
      })
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    throw new Error(
      `Unable to prepare claimant agreement: ${error.message}`,
    );
  }

  const envelope =
    data as
      AgreementEnvelopeRow;

  try {
    await appendAgreementEvent({
      envelopeId:
        envelope.id,

      eventType:
        "created",

      actorType:
        "staff",

      actorStaffUserId,

      occurredAt:
        now,

      detail: {
        claimReference:
          onboarding
            .claim_reference,

        claimantReference:
          onboarding
            .claimant_reference,

        agreementHash,

        training,
      },
    });
  } catch (
    error
  ) {
    throw new Error(
      error instanceof
        Error
        ? [
            "Agreement was prepared but its creation event could not be recorded.",
            error.message,
          ].join(
            " ",
          )
        : "Agreement creation event could not be recorded.",
    );
  }

  return envelopeFromRow(
    envelope,
    training,
  );
}

/* ========================================================================== */
/* Staff issuance                                                              */
/* ========================================================================== */

export async function issueClaimantAgreementForStaff({
  envelopeId,
  actorStaffUserId,
  actorRole,
}: {
  envelopeId:
    string;

  actorStaffUserId:
    string;

  actorRole:
    string;
}): Promise<
  ClaimantAgreementEnvelopeView
> {
  const supabase =
    getSupabaseAdmin();

  const normalizedEnvelopeId =
    requiredText(
      envelopeId,
      "Agreement envelope ID",
    );

  const {
    data:
      envelopeData,
    error:
      envelopeError,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        normalizedEnvelopeId,
      )
      .maybeSingle();

  if (
    envelopeError
  ) {
    throw new Error(
      `Unable to read claimant agreement: ${envelopeError.message}`,
    );
  }

  if (
    !envelopeData
  ) {
    throw new Error(
      "Claimant agreement not found.",
    );
  }

  const current =
    envelopeData as
      AgreementEnvelopeRow;

  const onboarding =
    await getClaimantRow(
      current.claimant_id,
    );

  if (!onboarding) {
    throw new Error(
      "Claimant record could not be resolved.",
    );
  }

  assertStaffAccess(
    onboarding,
    {
      actorStaffUserId,

      actorRole,
    },
  );

  const training =
    await agreementTrainingFlag(
      current,
    );

  const template =
    await getTemplateRow();

  if (!template) {
    throw new Error(
      "Agreement template could not be resolved.",
    );
  }

  if (
    template.id !==
      current.template_id ||
    template.content_hash !==
      snapshotFromUnknown(
        current
          .agreement_snapshot,
      ).template
        .templateContentHash
  ) {
    throw new Error(
      "Agreement template no longer matches the frozen envelope.",
    );
  }

  if (
    template.status !==
      "approved" &&
    !(
      training &&
      template.status ===
        "draft"
    )
  ) {
    throw new Error(
      "This agreement template is not authorized for issuance.",
    );
  }

  if (
    current.status !==
    "draft"
  ) {
    return envelopeFromRow(
      current,
      training,
    );
  }

  const now =
    new Date()
      .toISOString();

  const {
    data:
      updatedData,
    error:
      updateError,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .update({
        status:
          "issued",

        issued_by_staff_user_id:
          actorStaffUserId,

        issued_at:
          now,
      })
      .eq(
        "id",
        current.id,
      )
      .eq(
        "status",
        "draft",
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (
    updateError
  ) {
    throw new Error(
      `Unable to issue claimant agreement: ${updateError.message}`,
    );
  }

  if (
    !updatedData
  ) {
    throw new Error(
      "Claimant agreement changed while issuance was being processed.",
    );
  }

  await appendAgreementEvent({
    envelopeId:
      current.id,

    eventType:
      "issued",

    actorType:
      "staff",

    actorStaffUserId,

    occurredAt:
      now,

    detail: {
      claimantReference:
        current
          .claimant_reference,

      agreementHash:
        current
          .agreement_hash,

      training,
    },
  });

  return envelopeFromRow(
    updatedData as
      AgreementEnvelopeRow,
    training,
  );
}

/* ========================================================================== */
/* Staff reads                                                                */
/* ========================================================================== */

export async function listClaimantAgreementsForStaff({
  claimantId,
  actorStaffUserId,
  actorRole,
}: {
  claimantId:
    string;

  actorStaffUserId:
    string;

  actorRole:
    string;
}): Promise<
  ClaimantAgreementEnvelopeView[]
> {
  const onboarding =
    await getClaimantRow(
      requiredText(
        claimantId,
        "Claimant ID",
      ),
    );

  if (!onboarding) {
    return [];
  }

  assertStaffAccess(
    onboarding,
    {
      actorStaffUserId,

      actorRole,
    },
  );

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .select(
        "*",
      )
      .eq(
        "claimant_id",
        onboarding
          .claimant_id,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to list claimant agreements: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as
      AgreementEnvelopeRow[];

  const result:
    ClaimantAgreementEnvelopeView[] =
    [];

  for (
    const row of
    rows
  ) {
    result.push(
      envelopeFromRow(
        row,
        await agreementTrainingFlag(
          row,
        ),
      ),
    );
  }

  return result;
}

/* ========================================================================== */
/* Claimant reads                                                              */
/* ========================================================================== */

export async function listClaimantAgreementsForPortal(
  claimantId:
    string,
): Promise<
  ClaimantAgreementEnvelopeView[]
> {
  const onboarding =
    await getClaimantRow(
      requiredText(
        claimantId,
        "Claimant ID",
      ),
    );

  if (
    !onboarding ||
    !onboarding
      .claimant_auth_user_id
  ) {
    return [];
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .select(
        "*",
      )
      .eq(
        "claimant_id",
        onboarding
          .claimant_id,
      )
      .eq(
        "claimant_auth_user_id",
        onboarding
          .claimant_auth_user_id,
      )
      .in(
        "status",
        [
          "issued",
          "opened",
          "consented",
          "signed",
          "submitted",
          "superseded",
        ],
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to list claimant portal agreements: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as
      AgreementEnvelopeRow[];

  const result:
    ClaimantAgreementEnvelopeView[] =
    [];

  for (
    const row of
    rows
  ) {
    result.push(
      envelopeFromRow(
        row,
        await agreementTrainingFlag(
          row,
        ),
      ),
    );
  }

  return result;
}

export async function getClaimantAgreementForPortal({
  claimantId,
  envelopeId,
}: {
  claimantId:
    string;

  envelopeId:
    string;
}): Promise<
  ClaimantAgreementEnvelopeView | undefined
> {
  const onboarding =
    await getClaimantRow(
      requiredText(
        claimantId,
        "Claimant ID",
      ),
    );

  if (
    !onboarding ||
    !onboarding
      .claimant_auth_user_id
  ) {
    return undefined;
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        requiredText(
          envelopeId,
          "Agreement envelope ID",
        ),
      )
      .eq(
        "claimant_id",
        onboarding
          .claimant_id,
      )
      .eq(
        "claimant_auth_user_id",
        onboarding
          .claimant_auth_user_id,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read claimant portal agreement: ${error.message}`,
    );
  }

  if (!data) {
    return undefined;
  }

  const envelope =
    data as
      AgreementEnvelopeRow;

  return envelopeFromRow(
    envelope,
    await agreementTrainingFlag(
      envelope,
    ),
  );
}

/* ========================================================================== */
/* Claimant opened event                                                       */
/* ========================================================================== */

export async function markClaimantAgreementOpened({
  claimantId,
  envelopeId,
}: {
  claimantId:
    string;

  envelopeId:
    string;
}): Promise<
  ClaimantAgreementEnvelopeView
> {
  const onboarding =
    await getClaimantRow(
      requiredText(
        claimantId,
        "Claimant ID",
      ),
    );

  if (
    !onboarding ||
    !onboarding
      .claimant_auth_user_id
  ) {
    throw new Error(
      "Authenticated claimant agreement profile could not be resolved.",
    );
  }

  const current =
    await getClaimantAgreementForPortal({
      claimantId:
        onboarding.claimant_id,

      envelopeId,
    });

  if (!current) {
    throw new Error(
      "Agreement not found.",
    );
  }

  if (
    current.status ===
      "opened" ||
    current.status ===
      "consented" ||
    current.status ===
      "signed" ||
    current.status ===
      "submitted" ||
    current.status ===
      "superseded"
  ) {
    return current;
  }

  if (
    current.status !==
    "issued"
  ) {
    throw new Error(
      "Agreement is not available for claimant review.",
    );
  }

  const now =
    new Date()
      .toISOString();

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .update({
        status:
          "opened",

        opened_at:
          now,
      })
      .eq(
        "id",
        current.id,
      )
      .eq(
        "claimant_id",
        onboarding
          .claimant_id,
      )
      .eq(
        "claimant_auth_user_id",
        onboarding
          .claimant_auth_user_id,
      )
      .eq(
        "status",
        "issued",
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to record agreement opening: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Agreement changed while the opening event was being recorded.",
    );
  }

  await appendAgreementEvent({
    envelopeId:
      current.id,

    eventType:
      "opened",

    actorType:
      "claimant",

    actorClaimantAuthUserId:
      onboarding
        .claimant_auth_user_id,

    occurredAt:
      now,

    detail: {
      claimantReference:
        onboarding
          .claimant_reference,
    },
  });

  return envelopeFromRow(
    data as
      AgreementEnvelopeRow,
    current.training,
  );
}

/* ========================================================================== */
/* Claimant electronic consent                                                */
/* ========================================================================== */

export async function recordClaimantAgreementConsent({
  claimantId,
  envelopeId,
  acknowledgedKeys,
}: {
  claimantId:
    string;

  envelopeId:
    string;

  acknowledgedKeys:
    string[];
}): Promise<
  ClaimantAgreementEnvelopeView
> {
  const onboarding =
    await getClaimantRow(
      requiredText(
        claimantId,
        "Claimant ID",
      ),
    );

  if (
    !onboarding ||
    !onboarding
      .claimant_auth_user_id
  ) {
    throw new Error(
      "Authenticated claimant agreement profile could not be resolved.",
    );
  }

  const current =
    await getClaimantAgreementForPortal({
      claimantId:
        onboarding.claimant_id,

      envelopeId,
    });

  if (!current) {
    throw new Error(
      "Agreement not found.",
    );
  }

  if (
    current.status ===
      "consented" ||
    current.status ===
      "signed" ||
    current.status ===
      "submitted"
  ) {
    return current;
  }

  if (
    current.status !==
      "issued" &&
    current.status !==
      "opened"
  ) {
    throw new Error(
      "Agreement is not available for electronic consent.",
    );
  }

  const normalizedKeys =
    Array.from(
      new Set(
        acknowledgedKeys
          .map(
            (
              key,
            ) =>
              key.trim(),
          )
          .filter(
            Boolean,
          ),
      ),
    );

  const missingKeys =
    current
      .requiredAcknowledgementKeys
      .filter(
        (
          requiredKey,
        ) =>
          !normalizedKeys
            .includes(
              requiredKey,
            ),
      );

  if (
    missingKeys.length >
    0
  ) {
    throw new Error(
      "All required agreement acknowledgements must be accepted before signing.",
    );
  }

  const now =
    new Date()
      .toISOString();

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_agreement_envelopes",
      )
      .update({
        status:
          "consented",

        opened_at:
          current.openedAt ??
          now,

        electronic_consent_at:
          now,

        electronic_consent_text_snapshot:
          current
            .electronicConsentText,

        acknowledged_keys_snapshot:
          normalizedKeys,
      })
      .eq(
        "id",
        current.id,
      )
      .eq(
        "claimant_id",
        onboarding
          .claimant_id,
      )
      .eq(
        "claimant_auth_user_id",
        onboarding
          .claimant_auth_user_id,
      )
      .in(
        "status",
        [
          "issued",
          "opened",
        ],
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to record claimant agreement consent: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Agreement changed while electronic consent was being recorded.",
    );
  }

  await appendAgreementEvent({
    envelopeId:
      current.id,

    eventType:
      "electronic_consent",

    actorType:
      "claimant",

    actorClaimantAuthUserId:
      onboarding
        .claimant_auth_user_id,

    occurredAt:
      now,

    detail: {
      consentTextHash:
        sha256(
          current
            .electronicConsentText,
        ),
    },
  });

  await appendAgreementEvent({
    envelopeId:
      current.id,

    eventType:
      "disclosures_acknowledged",

    actorType:
      "claimant",

    actorClaimantAuthUserId:
      onboarding
        .claimant_auth_user_id,

    occurredAt:
      now,

    detail: {
      acknowledgementKeys:
        normalizedKeys,
    },
  });

  return envelopeFromRow(
    data as
      AgreementEnvelopeRow,
    current.training,
  );
}