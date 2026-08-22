/**
 * STATUS VOCABULARY
 *
 * Every status in Duequity resolves to exactly one of six semantic tones and one
 * canonical label. Defined once, here.
 *
 * This exists to prevent the failure mode described in Section 33: dozens of
 * arbitrary badge colours invented per screen. A screen may not choose a colour
 * for a status. It asks this module.
 *
 * The six tones and their meanings:
 *
 *   neutral   in progress, nothing required of anyone, no judgement implied
 *   info      a procedural step is underway, typically with a third party
 *   positive  a good outcome, confirmed or completed
 *   caution   attention or action is required, or a figure is an estimate
 *   critical  blocked, expired, denied, restricted, or a fraud concern
 *   counsel   an attorney is involved
 *
 * Claimant facing labels are written separately from internal labels. Operations
 * may read "Disqualified"; a claimant never should.
 */

import type {
  ClaimStatus,
  ComplianceStatus,
  ContactConfidence,
  DataQuality,
  DocumentStatus,
  IdentityVerificationStatus,
  OpportunityStatus,
  OutreachStatus,
  OwnerLocatedStatus,
  RiskFlagKind,
  RiskSeverity,
  SaleType,
  SurplusCustodian,
  TaskStatus,
  UserRole,
  DocumentKind,
  ClaimantRelationship,
  AttorneyMatterKind,
  PaymentDestination,
  PaymentSource,
  FeeModel,
  DisqualificationReason,
  OwnerKind,
  PropertyType,
  ClaimSubmissionMethod,
} from "./types";

export type Tone =
  "neutral" | "info" | "positive" | "caution" | "critical" | "counsel";

export interface StatusDescriptor {
  /** Label for internal operations surfaces. */
  label: string;
  tone: Tone;
  /** Label for claimant facing surfaces. Falls back to `label` when identical. */
  claimantLabel?: string;
  /** One line explanation, used in tooltips and legends. */
  hint?: string;
}

/* ========================================================================== */
/* Opportunity                                                                 */
/* ========================================================================== */

export const OPPORTUNITY_STATUS: Record<OpportunityStatus, StatusDescriptor> = {
  new: {
    label: "New",
    tone: "neutral",
    hint: "Imported or entered, no research performed yet.",
  },
  researching: {
    label: "Researching",
    tone: "neutral",
    hint: "An analyst is reviewing the sale and title record.",
  },
  surplus_suspected: {
    label: "Surplus suspected",
    tone: "caution",
    hint: "Arithmetic suggests a surplus. Not confirmed by the agency.",
  },
  surplus_confirmed: {
    label: "Surplus confirmed",
    tone: "positive",
    hint: "The responsible agency has confirmed a surplus figure in writing.",
  },
  owner_research: {
    label: "Owner research",
    tone: "neutral",
    hint: "Locating the former owner of record or their heirs.",
  },
  owner_located: {
    label: "Owner located",
    tone: "info",
    hint: "Contact details located with acceptable confidence.",
  },
  outreach_ready: {
    label: "Outreach ready",
    tone: "info",
    hint: "Compliance cleared. Ready for a first contact attempt.",
  },
  contact_attempted: {
    label: "Contact attempted",
    tone: "info",
    hint: "Outreach sent, no response yet.",
  },
  contact_established: {
    label: "Contact established",
    tone: "info",
    hint: "The prospective claimant has responded.",
  },
  verification_pending: {
    label: "Verification pending",
    tone: "caution",
    hint: "Awaiting relationship or identity verification.",
  },
  qualified: {
    label: "Qualified",
    tone: "positive",
    hint: "Entitlement reviewed and the jurisdiction permits the claim.",
  },
  converted: {
    label: "Converted",
    tone: "positive",
    hint: "An active claim has been opened from this opportunity.",
  },
  disqualified: {
    label: "Disqualified",
    tone: "critical",
    hint: "Closed without a claim. A reason is recorded.",
  },
  closed: {
    label: "Closed",
    tone: "neutral",
    hint: "No further action. Retained for audit.",
  },
};

export const DISQUALIFICATION_REASON: Record<DisqualificationReason, string> = {
  no_surplus: "No surplus after debt and costs",
  deadline_expired: "Statutory claim deadline expired",
  already_claimed: "Funds already claimed by another party",
  owner_unlocatable: "Former owner could not be located",
  jurisdiction_restricted: "Jurisdiction not cleared for intake",
  liens_exceed_surplus: "Recorded liens exceed the surplus",
  claimant_declined: "Prospective claimant declined",
  duplicate_record: "Duplicate of an existing record",
  data_invalid: "Source data proved invalid",
  commercially_unviable:
    "Opportunity does not meet Duequity commercial criteria",
};

export const OWNER_LOCATED_STATUS: Record<
  OwnerLocatedStatus,
  StatusDescriptor
> = {
  not_started: { label: "Not started", tone: "neutral" },
  searching: { label: "Searching", tone: "neutral" },
  probable_match: {
    label: "Probable match",
    tone: "caution",
    hint: "A likely match found. Not yet confirmed.",
  },
  located: { label: "Located", tone: "positive" },
  deceased_heirs_needed: {
    label: "Heirs needed",
    tone: "caution",
    hint: "Owner of record is deceased. Heir research required.",
  },
  unlocatable: { label: "Unlocatable", tone: "critical" },
};

export const CONTACT_CONFIDENCE: Record<ContactConfidence, StatusDescriptor> = {
  none: { label: "None", tone: "neutral" },
  low: { label: "Low", tone: "caution" },
  medium: { label: "Medium", tone: "caution" },
  high: { label: "High", tone: "info" },
  confirmed: { label: "Confirmed", tone: "positive" },
};

/* ========================================================================== */
/* Claim                                                                       */
/* ========================================================================== */

export const CLAIM_STATUS: Record<ClaimStatus, StatusDescriptor> = {
  intake: {
    label: "Intake",
    tone: "neutral",
    claimantLabel: "Getting started",
    hint: "Claim opened. Entitlement and jurisdiction review underway.",
  },
  documentation: {
    label: "Documentation",
    tone: "caution",
    claimantLabel: "Documents needed",
    hint: "Waiting on documents before the claim can be filed.",
  },
  ready_to_file: {
    label: "Ready to file",
    tone: "info",
    claimantLabel: "Ready to submit",
    hint: "Claim package complete and reviewed. Awaiting submission.",
  },
  submitted: {
    label: "Submitted",
    tone: "info",
    claimantLabel: "Submitted to the agency",
    hint: "Filed with the responsible agency.",
  },
  under_review: {
    label: "Under review",
    tone: "info",
    claimantLabel: "Under agency review",
    hint: "The agency is reviewing the claim.",
  },
  action_required: {
    label: "Action required",
    tone: "caution",
    claimantLabel: "Action needed from you",
    hint: "The agency or Duequity needs something before proceeding.",
  },
  approved: {
    label: "Approved",
    tone: "positive",
    claimantLabel: "Approved",
    hint: "The agency approved the claim. Payment is being issued.",
  },
  paid: {
    label: "Paid",
    tone: "positive",
    claimantLabel: "Payment issued",
    hint: "The agency issued payment to the claimant or their trust account.",
  },
  closed: {
    label: "Closed",
    tone: "neutral",
    claimantLabel: "Completed",
    hint: "Recovery complete and the file is closed.",
  },
  denied: {
    label: "Denied",
    tone: "critical",
    claimantLabel: "Not approved",
    hint: "The agency declined the claim. Reasons are recorded.",
  },
  withdrawn: {
    label: "Withdrawn",
    tone: "neutral",
    claimantLabel: "Withdrawn",
    hint: "The claim was withdrawn before determination.",
  },
};

/* ========================================================================== */
/* Compliance                                                                  */
/* ========================================================================== */

export const COMPLIANCE_STATUS: Record<ComplianceStatus, StatusDescriptor> = {
  research_required: {
    label: "Research required",
    tone: "neutral",
    hint: "No legal review performed. Intake is blocked.",
  },
  under_legal_review: {
    label: "Under legal review",
    tone: "caution",
    hint: "Review in progress. Intake is blocked until it completes.",
  },
  approved: {
    label: "Approved",
    tone: "positive",
    hint: "Administrative claims permitted under recorded rules.",
  },
  attorney_only: {
    label: "Attorney only",
    tone: "counsel",
    hint: "Claims permitted only through independent licensed counsel.",
  },
  restricted: {
    label: "Restricted",
    tone: "critical",
    hint: "A licensing, bonding or fee barrier blocks intake.",
  },
  paused: {
    label: "Paused",
    tone: "critical",
    hint: "Temporarily halted by a compliance officer.",
  },
};

/* ========================================================================== */
/* Data quality                                                                */
/* ========================================================================== */

export const DATA_QUALITY: Record<DataQuality, StatusDescriptor> = {
  unverified: {
    label: "Unverified",
    tone: "caution",
    hint: "Captured from a source but not checked by an analyst.",
  },
  suspected: {
    label: "Suspected",
    tone: "caution",
    hint: "Analyst believes this is correct. Not conclusively sourced.",
  },
  verified: {
    label: "Verified",
    tone: "info",
    hint: "Checked by a Duequity analyst against the source record.",
  },
  confirmed: {
    label: "Confirmed",
    tone: "positive",
    hint: "Confirmed in writing by the responsible government agency.",
  },
  stale: {
    label: "Stale",
    tone: "caution",
    hint: "Previously verified. The verification window has lapsed.",
  },
  conflicting: {
    label: "Conflicting",
    tone: "critical",
    hint: "Sources disagree. Human resolution required.",
  },
  invalid: {
    label: "Invalid",
    tone: "critical",
    hint: "Known to be incorrect. Retained for audit only.",
  },
};

/**
 * The two words that matter most in this product.
 *
 * A figure is either an estimate Duequity calculated, or a figure the agency
 * confirmed. There is no third presentation, and the distinction is never left
 * to a caller's choice of wording.
 */
export function monetaryCertainty(quality: DataQuality): {
  word: "Estimated" | "Confirmed" | "Unverified";
  tone: Tone;
} {
  if (quality === "confirmed") return { word: "Confirmed", tone: "positive" };

  if (quality === "verified") return { word: "Estimated", tone: "caution" };

  if (quality === "conflicting" || quality === "invalid") {
    return { word: "Unverified", tone: "critical" };
  }

  return { word: "Estimated", tone: "caution" };
}

/* ========================================================================== */
/* Documents                                                                   */
/* ========================================================================== */

export const DOCUMENT_STATUS: Record<DocumentStatus, StatusDescriptor> = {
  requested: {
    label: "Requested",
    tone: "caution",
    claimantLabel: "Needed",
  },
  uploaded: {
    label: "Uploaded",
    tone: "info",
    claimantLabel: "Received",
  },
  scanning: {
    label: "Scanning",
    tone: "info",
    claimantLabel: "Checking file",
    hint: "Validating the file before it is accepted.",
  },
  under_review: {
    label: "Under review",
    tone: "info",
    claimantLabel: "In review",
  },
  accepted: {
    label: "Accepted",
    tone: "positive",
    claimantLabel: "Accepted",
  },
  rejected: {
    label: "Rejected",
    tone: "critical",
    claimantLabel: "Needs to be replaced",
  },
  expired: {
    label: "Expired",
    tone: "critical",
  },
  superseded: {
    label: "Superseded",
    tone: "neutral",
  },
};

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  government_id: "Government issued identification",
  proof_of_former_ownership: "Proof of former ownership",
  recorded_deed: "Recorded deed",
  death_certificate: "Death certificate",
  probate_letters: "Probate letters",
  letters_of_administration: "Letters of administration",
  will: "Will",
  trust_instrument: "Trust instrument",
  articles_of_organization: "Articles of organization",
  certificate_of_good_standing: "Certificate of good standing",
  w9: "Form W-9",
  affidavit_of_heirship: "Affidavit of heirship",
  affidavit_of_entitlement: "Affidavit of entitlement",
  court_order: "Court order",
  agency_claim_form: "Agency claim form",
  agency_correspondence: "Agency correspondence",
  fee_agreement: "Service agreement",
  lien_release: "Lien release",
  bankruptcy_discharge: "Bankruptcy discharge",
  marriage_certificate: "Marriage certificate",
  utility_bill_proof_of_residence: "Proof of residence",
  other: "Other document",
};

/** Default sensitivity per document kind, so callers cannot under classify. */
export const DOCUMENT_KIND_SENSITIVITY: Record<
  DocumentKind,
  "public_record" | "internal" | "sensitive" | "restricted"
> = {
  government_id: "restricted",
  proof_of_former_ownership: "sensitive",
  recorded_deed: "public_record",
  death_certificate: "restricted",
  probate_letters: "public_record",
  letters_of_administration: "public_record",
  will: "restricted",
  trust_instrument: "restricted",
  articles_of_organization: "public_record",
  certificate_of_good_standing: "public_record",
  w9: "restricted",
  affidavit_of_heirship: "sensitive",
  affidavit_of_entitlement: "sensitive",
  court_order: "public_record",
  agency_claim_form: "sensitive",
  agency_correspondence: "sensitive",
  fee_agreement: "sensitive",
  lien_release: "public_record",
  bankruptcy_discharge: "restricted",
  marriage_certificate: "restricted",
  utility_bill_proof_of_residence: "sensitive",
  other: "sensitive",
};

/* ========================================================================== */
/* Tasks, outreach, identity                                                   */
/* ========================================================================== */

export const TASK_STATUS: Record<TaskStatus, StatusDescriptor> = {
  open: {
    label: "Open",
    tone: "neutral",
  },
  in_progress: {
    label: "In progress",
    tone: "info",
  },
  blocked: {
    label: "Blocked",
    tone: "critical",
  },
  done: {
    label: "Done",
    tone: "positive",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
  },
};

export const OUTREACH_STATUS: Record<OutreachStatus, StatusDescriptor> = {
  queued: {
    label: "Queued",
    tone: "neutral",
  },
  sent: {
    label: "Sent",
    tone: "info",
  },
  delivered: {
    label: "Delivered",
    tone: "info",
  },
  returned_undeliverable: {
    label: "Undeliverable",
    tone: "critical",
  },
  responded: {
    label: "Responded",
    tone: "positive",
  },
  opted_out: {
    label: "Opted out",
    tone: "critical",
    hint: "No further contact permitted on this channel.",
  },
  no_response: {
    label: "No response",
    tone: "neutral",
  },
};

export const IDENTITY_STATUS: Record<
  IdentityVerificationStatus,
  StatusDescriptor
> = {
  not_started: {
    label: "Not started",
    tone: "neutral",
  },
  documents_requested: {
    label: "Documents requested",
    tone: "caution",
    claimantLabel: "Documents needed",
  },
  under_review: {
    label: "Under review",
    tone: "info",
    claimantLabel: "In review",
  },
  verified: {
    label: "Verified",
    tone: "positive",
  },
  failed: {
    label: "Failed",
    tone: "critical",
    claimantLabel: "Could not verify",
  },
  manual_review: {
    label: "Manual review",
    tone: "caution",
  },
};

/* ========================================================================== */
/* Risk flags                                                                  */
/* ========================================================================== */

export const RISK_FLAG_LABEL: Record<RiskFlagKind, string> = {
  deceased_owner: "Deceased owner",
  multiple_owners: "Multiple owners",
  probate_required: "Probate required",
  bankruptcy: "Bankruptcy",
  federal_tax_lien: "Federal tax lien",
  judgment_lien: "Judgment lien",
  hoa_lien: "HOA lien",
  child_support_lien: "Child support lien",
  business_entity: "Business entity",
  dissolved_entity: "Dissolved entity",
  trust: "Trust",
  competing_claimant: "Competing claimant",
  deadline_approaching: "Deadline approaching",
  court_petition_required: "Court petition required",
  attorney_required: "Attorney required",
  missing_documentation: "Missing documentation",
  data_conflict: "Data conflict",
  fraud_concern: "Fraud concern",
};

export const RISK_SEVERITY_TONE: Record<RiskSeverity, Tone> = {
  informational: "neutral",
  attention: "caution",
  blocking: "critical",
};

/* ========================================================================== */
/* Domain label maps                                                           */
/* ========================================================================== */

export const SALE_TYPE_LABEL: Record<SaleType, string> = {
  judicial_foreclosure: "Judicial foreclosure",
  nonjudicial_foreclosure: "Nonjudicial foreclosure",
  sheriff_sale: "Sheriff sale",
  trustee_sale: "Trustee sale",
  tax_deed_sale: "Tax deed sale",
  tax_lien_foreclosure: "Tax lien foreclosure",
  hoa_foreclosure: "HOA foreclosure",
  municipal_lien_foreclosure: "Municipal lien foreclosure",
  partition_sale: "Partition sale",
};

export const CUSTODIAN_LABEL: Record<SurplusCustodian, string> = {
  county_treasurer: "County treasurer",
  county_tax_collector: "County tax collector",
  clerk_of_court: "Clerk of court",
  circuit_court: "Circuit court",
  sheriff: "Sheriff",
  trustee: "Trustee",
  municipality: "Municipality",
  state_unclaimed_property: "State unclaimed property office",
  escrow_agent: "Escrow agent",
  unknown: "Not yet determined",
};

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  single_family: "Single family",
  condominium: "Condominium",
  townhouse: "Townhouse",
  multi_family: "Multi family",
  vacant_land: "Vacant land",
  commercial: "Commercial",
  mixed_use: "Mixed use",
  manufactured: "Manufactured home",
};

export const OWNER_KIND_LABEL: Record<OwnerKind, string> = {
  individual: "Individual",
  joint_owners: "Joint owners",
  married_couple: "Married couple",
  estate: "Estate",
  trust: "Trust",
  llc: "Limited liability company",
  corporation: "Corporation",
  partnership: "Partnership",
  dissolved_entity: "Dissolved entity",
  unknown: "Unknown",
};

export const RELATIONSHIP_LABEL: Record<ClaimantRelationship, string> = {
  self_former_owner: "Former owner",
  surviving_spouse: "Surviving spouse",
  child: "Child",
  grandchild: "Grandchild",
  sibling: "Sibling",
  parent: "Parent",
  executor: "Executor",
  administrator: "Administrator",
  trustee: "Trustee",
  heir_at_law: "Heir at law",
  business_owner: "Business owner",
  assignee: "Assignee",
  other: "Other",
};

export const MATTER_KIND_LABEL: Record<AttorneyMatterKind, string> = {
  probate: "Probate",
  estate_administration: "Estate administration",
  competing_heirs: "Competing heirs",
  bankruptcy: "Bankruptcy",
  court_motion: "Court motion",
  contested_surplus: "Contested surplus",
  lien_dispute: "Lien dispute",
  trust_dispute: "Trust dispute",
  entity_dissolution: "Entity dissolution",
  complex_title: "Complex title",
  quiet_title: "Quiet title",
};

export const PAYMENT_SOURCE_LABEL: Record<PaymentSource, string> = {
  county_treasurer: "County treasurer",
  county_tax_collector: "County tax collector",
  clerk_of_court: "Clerk of court",
  sheriff: "Sheriff",
  trustee: "Trustee",
  state_unclaimed_property: "State unclaimed property office",
  municipality: "Municipality",
};

export const PAYMENT_DESTINATION_LABEL: Record<PaymentDestination, string> = {
  claimant_direct: "Directly to the claimant",
  estate_account: "Estate account",
  attorney_trust_account: "Attorney trust account",
  split_among_claimants: "Split among claimants",
};

export const FEE_MODEL_LABEL: Record<FeeModel, string> = {
  flat: "Flat fee",
  percentage: "Percentage of recovery",
  capped_success: "Capped success fee",
  no_fee: "No fee",
};

export const SUBMISSION_METHOD_LABEL: Record<ClaimSubmissionMethod, string> = {
  mail: "Mail",
  in_person: "In person",
  email: "Email",
  online_portal: "Online portal",
  court_filing: "Court filing",
  attorney_filing: "Attorney filing",
};

/**
 * State names for the states with recorded jurisdictions.
 * Kept here rather than a full fifty state table because only recorded states appear.
 */
export const STATE_NAME: Partial<Record<string, string>> = {
  CA: "California",
  FL: "Florida",
  GA: "Georgia",
  MD: "Maryland",
  OH: "Ohio",
  TX: "Texas",
};

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  claimant: "Claimant",
  operations_specialist: "Operations specialist",
  research_analyst: "Research analyst",
  compliance_officer: "Compliance officer",
  claims_manager: "Claims manager",
  attorney_liaison: "Attorney liaison",
  administrator: "Administrator",
  super_admin: "Super admin",
};
