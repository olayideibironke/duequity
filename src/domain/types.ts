/**
 * DUEQUITY DOMAIN MODEL
 *
 * The vocabulary of the business, defined once. Every screen reads from these
 * types so that the public site, the claimant portal and the operations platform
 * cannot drift into describing the same case in three different ways.
 *
 * Design principles encoded here:
 *
 * 1. Money is integer cents. Never floating point dollars.
 * 2. Dates are ISO calendar dates (YYYY-MM-DD). A filing deadline is a legal
 *    calendar date, not an instant, and must not shift across timezones.
 * 3. Estimated and confirmed values are separate fields, never one field with a
 *    flag. It must be structurally impossible to render an estimate as confirmed.
 * 4. Externally derived facts carry provenance: where the fact came from, when it
 *    was last verified, and how much confidence it carries.
 * 5. Jurisdiction rules are data, not code. Staff must not be relied upon to
 *    remember the law of 3,000 counties.
 * 6. Legal fee ceilings and Duequity commercial pricing are separate layers.
 *    A lawful maximum is never automatically the price Duequity charges.
 * 7. Commercial pricing is computed before outreach and frozen at agreement
 *    signature so later policy changes cannot silently alter a signed deal.
 */

/* ========================================================================== */
/* Primitives                                                                  */
/* ========================================================================== */

/** Integer United States cents. 4_268_000 is $42,680.00 */
export type Cents = number;

/** ISO calendar date, YYYY-MM-DD. No time, no zone. */
export type IsoDate = string;

/** ISO instant, for audit and message ordering where time of day matters. */
export type IsoInstant = string;

export type StateCode =
  | "AL"
  | "AK"
  | "AZ"
  | "AR"
  | "CA"
  | "CO"
  | "CT"
  | "DE"
  | "DC"
  | "FL"
  | "GA"
  | "HI"
  | "ID"
  | "IL"
  | "IN"
  | "IA"
  | "KS"
  | "KY"
  | "LA"
  | "ME"
  | "MD"
  | "MA"
  | "MI"
  | "MN"
  | "MS"
  | "MO"
  | "MT"
  | "NE"
  | "NV"
  | "NH"
  | "NJ"
  | "NM"
  | "NY"
  | "NC"
  | "ND"
  | "OH"
  | "OK"
  | "OR"
  | "PA"
  | "RI"
  | "SC"
  | "SD"
  | "TN"
  | "TX"
  | "UT"
  | "VT"
  | "VA"
  | "WA"
  | "WV"
  | "WI"
  | "WY";

/* ========================================================================== */
/* Data quality and provenance                                                 */
/* ========================================================================== */

/**
 * The confidence Duequity holds in an externally derived fact.
 * Section 24 of the product standard: an estimate must never present as
 * confirmed, and stale or conflicting data must be visible as such.
 */
export type DataQuality =
  | "unverified"
  | "suspected"
  | "verified"
  | "confirmed"
  | "stale"
  | "conflicting"
  | "invalid";

export type SourceKind =
  | "county_tax_sale_list"
  | "court_record"
  | "sheriff_sale"
  | "trustee_sale"
  | "recorded_deed"
  | "assessor_record"
  | "state_unclaimed_property"
  | "commercial_provider"
  | "public_api"
  | "csv_import"
  | "analyst_entry"
  | "agency_correspondence"
  | "claimant_provided";

/**
 * Provenance attached to any fact Duequity did not itself originate.
 * Section 23: every important externally derived fact retains its source.
 */
export interface Provenance {
  sourceKind: SourceKind;
  /** Human readable origin, for example "Prince George's County Circuit Court". */
  sourceName: string;
  /** Public reference such as a case number or list identifier. */
  sourceReference?: string;
  /** Public URL, where one legitimately exists. */
  sourceUrl?: string;
  /** When the source itself was published or retrieved. */
  sourceDate: IsoDate;
  /** When a Duequity analyst last checked this against the source. */
  lastVerified?: IsoDate;
  quality: DataQuality;
  analystNote?: string;
}

/** A money figure that carries its own certainty. */
export interface MonetaryFact {
  amount: Cents;
  quality: DataQuality;
  /** Free text explaining how the figure was derived. */
  basis?: string;
  asOf?: IsoDate;
}

/* ========================================================================== */
/* Geography, property and sale                                                */
/* ========================================================================== */

export interface Address {
  id: string;
  line1: string;
  line2?: string;
  city: string;
  county: string;
  state: StateCode;
  postalCode: string;
}

export type PropertyType =
  | "single_family"
  | "condominium"
  | "townhouse"
  | "multi_family"
  | "vacant_land"
  | "commercial"
  | "mixed_use"
  | "manufactured";

export interface Property {
  id: string;
  address: Address;
  propertyType: PropertyType;
  /** County assessor parcel identifier. */
  parcelNumber?: string;
  /** Tax account or bill number, where the county uses a separate one. */
  taxAccountNumber?: string;
  legalDescription?: string;
  yearBuilt?: number;
  /** Last known assessed value, for surplus plausibility review only. */
  assessedValue?: MonetaryFact;
  provenance: Provenance;
}

/**
 * How the property was sold.
 *
 * The sale type determines which agency holds the surplus, which rules govern
 * the claim and whether legal representation may be required.
 */
export type SaleType =
  | "judicial_foreclosure"
  | "nonjudicial_foreclosure"
  | "sheriff_sale"
  | "trustee_sale"
  | "tax_deed_sale"
  | "tax_lien_foreclosure"
  | "hoa_foreclosure"
  | "municipal_lien_foreclosure"
  | "partition_sale";

/** Who is holding the surplus money right now. */
export type SurplusCustodian =
  | "county_treasurer"
  | "county_tax_collector"
  | "clerk_of_court"
  | "circuit_court"
  | "sheriff"
  | "trustee"
  | "municipality"
  | "state_unclaimed_property"
  | "escrow_agent"
  | "unknown";

/** The financial record of the sale, from which any surplus is derived. */
export interface SaleRecord {
  saleType: SaleType;
  saleDate: IsoDate;
  /** Winning bid or sale price. */
  salePrice: MonetaryFact;
  /** Total debt satisfied: judgment, mortgage payoff, or certificate face value. */
  debtSatisfied: MonetaryFact;
  /** Delinquent property taxes paid from proceeds. */
  taxesOwed?: MonetaryFact;
  /** Statutory costs, publication, auctioneer, attorney and administrative fees. */
  saleCosts?: MonetaryFact;
  /** Junior liens with a recorded claim against the surplus. */
  juniorLiens?: MonetaryFact;
  caseNumber?: string;
  /** The court, sheriff or trustee that conducted the sale. */
  sellingEntity: string;
  provenance: Provenance;
}

/* ========================================================================== */
/* Prior ownership                                                             */
/* ========================================================================== */

export type OwnerKind =
  | "individual"
  | "joint_owners"
  | "married_couple"
  | "estate"
  | "trust"
  | "llc"
  | "corporation"
  | "partnership"
  | "dissolved_entity"
  | "unknown";

export interface PriorOwner {
  id: string;
  /** Name exactly as it appears on the recorded instrument. */
  nameOnRecord: string;
  ownerKind: OwnerKind;
  /** True where a death record or probate filing has been located. */
  deceased?: boolean;
  dateOfDeath?: IsoDate;
  /** Undivided fractional interest, expressed 0 to 1. */
  ownershipShare?: number;
  provenance: Provenance;
}

/* ========================================================================== */
/* Jurisdiction and compliance                                                 */
/* ========================================================================== */

export type ComplianceStatus =
  | "research_required"
  | "under_legal_review"
  | "approved"
  | "attorney_only"
  | "restricted"
  | "paused";

export type FeeModel = "flat" | "percentage" | "capped_success" | "no_fee";

export type ClaimSubmissionMethod =
  | "mail"
  | "in_person"
  | "email"
  | "online_portal"
  | "court_filing"
  | "attorney_filing";

export interface Jurisdiction {
  id: string;
  state: StateCode;
  stateName: string;
  county?: string;
  agencyName: string;
  custodian: SurplusCustodian;
  agencyWebsite?: string;
  agencyPhone?: string;
  agencyAddress?: Omit<Address, "id" | "county">;
  claimMethod: ClaimSubmissionMethod;
  claimFormUrl?: string;
  requiredDocuments: DocumentKind[];
  claimDeadlineDays?: number;
  statuteReference?: string;
  permittedFeeModels: FeeModel[];
  feeCapPercent?: number;
  feeCapAmount?: Cents;
  assignmentPermitted: boolean;
  powerOfAttorneyAccepted: boolean;
  finderLicenseRequired: boolean;
  bondRequired: boolean;
  attorneyRequired: boolean;
  mandatoryContractLanguage?: string[];
  cancellationPeriodDays?: number;
  paymentRoutingNote?: string;
  probateRequiredWhenDeceased: boolean;
  complianceStatus: ComplianceStatus;
  lastLegalReview?: IsoDate;
  reviewedBy?: string;
  internalNotes?: string;
  legalRuleVersion?: number;
  legalRuleEffectiveFrom?: IsoDate;
  legalRuleEffectiveThrough?: IsoDate;
  legalReviewDueAt?: IsoDate;
  legalSourceUrls?: string[];
  legalApprovedByUserId?: string;
  legalApprovedAt?: IsoInstant;
  legalProcessingRule?: import("./legal").LegalProcessingRule;
}

/* ========================================================================== */
/* Commercial pricing policy                                                   */
/* ========================================================================== */

export type CommercialFeePolicyStatus =
  "draft" | "approved" | "paused" | "retired";

export type FeeQuoteRecoveryBasis = "estimated" | "confirmed";

export type CommercialViabilityStatus =
  | "not_evaluated"
  | "viable"
  | "manager_review"
  | "below_minimum_revenue"
  | "declined";

export type FeeQuoteApprovalStatus =
  | "draft"
  | "staff_approved"
  | "manager_review"
  | "manager_approved"
  | "rejected"
  | "locked";

export interface CommercialFeeTier {
  id: string;
  label: string;
  minimumRecovery: Cents;
  maximumRecovery?: Cents;
  model: FeeModel;
  defaultPercentage?: number;
  staffFloorPercentage?: number;
  staffCeilingPercentage?: number;
  managerExceptionCeilingPercentage?: number;
  defaultFlatAmount?: Cents;
  staffFloorAmount?: Cents;
  staffCeilingAmount?: Cents;
  managerExceptionCeilingAmount?: Cents;
  minimumViableFee?: Cents;
  internalFeeCapAmount?: Cents;
  active: boolean;
}

export interface CommercialFeePolicy {
  id: string;
  jurisdictionId: string;
  saleTypes?: SaleType[];
  custodians?: SurplusCustodian[];
  status: CommercialFeePolicyStatus;
  version: number;
  effectiveFrom: IsoDate;
  effectiveThrough?: IsoDate;
  tiers: CommercialFeeTier[];
  approvedByUserId?: string;
  approvedAt?: IsoInstant;
  lastReviewedAt?: IsoDate;
  reviewDueAt?: IsoDate;
  internalNotes?: string;
}

export interface CommercialFeeQuote {
  id: string;
  opportunityId: string;
  jurisdictionId: string;
  commercialPolicyId: string;
  commercialPolicyVersion: number;
  commercialTierId: string;
  recoveryAmount: Cents;
  recoveryBasis: FeeQuoteRecoveryBasis;
  model: FeeModel;
  selectedPercentage?: number;
  selectedFlatAmount?: Cents;
  projectedFee: Cents;
  projectedClaimantNet: Cents;
  legalRuleVersionSnapshot?: number;
  legalFeeCapPercentSnapshot?: number;
  legalFeeCapAmountSnapshot?: Cents;
  commercialStaffFloorPercentSnapshot?: number;
  commercialStaffCeilingPercentSnapshot?: number;
  commercialManagerCeilingPercentSnapshot?: number;
  commercialStaffFloorAmountSnapshot?: Cents;
  commercialStaffCeilingAmountSnapshot?: Cents;
  commercialManagerCeilingAmountSnapshot?: Cents;
  internalFeeCapAmountSnapshot?: Cents;
  minimumViableFeeSnapshot?: Cents;
  viabilityStatus: CommercialViabilityStatus;
  approvalStatus: FeeQuoteApprovalStatus;
  approvalReason?: string;
  createdByUserId: string;
  createdAt: IsoInstant;
  approvedByUserId?: string;
  approvedAt?: IsoInstant;
  outreachApprovedAt?: IsoInstant;
  outreachApprovedByUserId?: string;
  lockedAt?: IsoInstant;
  lockedFeeAgreementId?: string;
  internalNote?: string;
}

/* ========================================================================== */
/* Opportunity pipeline                                                        */
/* ========================================================================== */

export type OpportunityStatus =
  | "new"
  | "researching"
  | "surplus_suspected"
  | "surplus_confirmed"
  | "owner_research"
  | "owner_located"
  | "outreach_ready"
  | "contact_attempted"
  | "contact_established"
  | "verification_pending"
  | "qualified"
  | "converted"
  | "disqualified"
  | "closed";

export type OwnerLocatedStatus =
  | "not_started"
  | "searching"
  | "probable_match"
  | "located"
  | "deceased_heirs_needed"
  | "unlocatable";

export type ContactConfidence =
  "none" | "low" | "medium" | "high" | "confirmed";

export type DisqualificationReason =
  | "no_surplus"
  | "deadline_expired"
  | "already_claimed"
  | "owner_unlocatable"
  | "jurisdiction_restricted"
  | "liens_exceed_surplus"
  | "claimant_declined"
  | "duplicate_record"
  | "data_invalid"
  | "commercially_unviable";

export interface Opportunity {
  id: string;
  reference: string;
  propertyId: string;
  jurisdictionId: string;
  sale: SaleRecord;
  priorOwners: PriorOwner[];
  estimatedSurplus: MonetaryFact;
  confirmedSurplus?: MonetaryFact;
  custodian: SurplusCustodian;
  claimDeadline?: IsoDate;
  status: OpportunityStatus;
  ownerLocated: OwnerLocatedStatus;
  contactConfidence: ContactConfidence;
  flags: RiskFlag[];
  priority: 1 | 2 | 3;
  riskScore: number;
  activeCommercialFeeQuoteId?: string;
  assignedToUserId?: string;
  convertedClaimId?: string;
  disqualifiedReason?: DisqualificationReason;
  createdAt: IsoDate;
  lastActivityAt: IsoDate;
  provenance: Provenance;
  notes: Note[];
}

/* ========================================================================== */
/* Risk flags                                                                  */
/* ========================================================================== */

export type RiskFlagKind =
  | "deceased_owner"
  | "multiple_owners"
  | "probate_required"
  | "bankruptcy"
  | "federal_tax_lien"
  | "judgment_lien"
  | "hoa_lien"
  | "child_support_lien"
  | "business_entity"
  | "dissolved_entity"
  | "trust"
  | "competing_claimant"
  | "deadline_approaching"
  | "court_petition_required"
  | "attorney_required"
  | "missing_documentation"
  | "data_conflict"
  | "fraud_concern";

export type RiskSeverity = "informational" | "attention" | "blocking";

export interface RiskFlag {
  kind: RiskFlagKind;
  severity: RiskSeverity;
  detail: string;
  raisedAt: IsoDate;
  raisedBy: string;
  resolvedAt?: IsoDate;
  resolutionNote?: string;
}

/* ========================================================================== */
/* Claimants, estates and heirs                                                */
/* ========================================================================== */

export type ClaimantRelationship =
  | "self_former_owner"
  | "surviving_spouse"
  | "child"
  | "grandchild"
  | "sibling"
  | "parent"
  | "executor"
  | "administrator"
  | "trustee"
  | "heir_at_law"
  | "business_owner"
  | "assignee"
  | "other";

export type IdentityVerificationStatus =
  | "not_started"
  | "documents_requested"
  | "under_review"
  | "verified"
  | "failed"
  | "manual_review";

export type ConsentChannel = "email" | "phone_call" | "sms" | "mail";

export interface ContactMethod {
  id: string;
  kind: "email" | "mobile" | "landline" | "mailing_address";
  value: string;
  isPrimary: boolean;
  verified: boolean;
  consentGivenAt?: IsoDate;
  optedOutAt?: IsoDate;
}

export interface Claimant {
  id: string;
  reference: string;
  legalName: string;
  preferredName?: string;
  dateOfBirth?: IsoDate;
  entityType: "individual" | "estate" | "trust" | "business";
  contactMethods: ContactMethod[];
  mailingAddress?: Address;
  preferredContactChannel: ConsentChannel;
  consentRecordedAt?: IsoDate;
  consentSource?: string;
  identityVerification: IdentityVerificationStatus;
  identityVerifiedAt?: IsoDate;
  identityProviderRef?: string;
  preferredLanguage: string;
  accessibilityNote?: string;
  fraudFlags: RiskFlag[];
  createdAt: IsoDate;
  notes: Note[];
}

export interface Estate {
  id: string;
  decedentName: string;
  dateOfDeath: IsoDate;
  probateCaseNumber?: string;
  probateCounty?: string;
  probateState?: StateCode;
  probateStatus:
    | "not_opened"
    | "petition_filed"
    | "open"
    | "closed"
    | "reopened_required"
    | "small_estate_procedure";
  personalRepresentativeName?: string;
  lettersOnFile: boolean;
  willOnFile?: boolean;
  heirs: Heir[];
  provenance: Provenance;
}

export interface Heir {
  id: string;
  name: string;
  relationship: ClaimantRelationship;
  assertedShare?: number;
  claimantId?: string;
  contacted: boolean;
  consentOnFile: boolean;
  note?: string;
}

/* ========================================================================== */
/* Claims                                                                      */
/* ========================================================================== */

export type ClaimStatus =
  | "intake"
  | "documentation"
  | "ready_to_file"
  | "submitted"
  | "under_review"
  | "action_required"
  | "approved"
  | "paid"
  | "closed"
  | "denied"
  | "withdrawn";

export interface RecoveryStage {
  key: string;
  ordinal: number;
  claimantLabel: string;
  internalLabel: string;
  claimantDescription: string;
}

export type ClaimParticipantRole =
  | "primary_claimant"
  | "co_claimant"
  | "heir"
  | "personal_representative"
  | "trustee"
  | "authorised_contact"
  | "competing_claimant";

export interface ClaimParticipant {
  id: string;
  claimantId: string;
  role: ClaimParticipantRole;
  relationship: ClaimantRelationship;
  assertedShare?: number;
  determinedShare?: number;
  contesting?: boolean;
  addedAt: IsoDate;
}

export interface FeeAgreement {
  id: string;
  model: FeeModel;
  percentage?: number;
  flatAmount?: Cents;
  capAmount?: Cents;
  jurisdictionId: string;
  commercialFeeQuoteId?: string;
  commercialPolicyId?: string;
  commercialPolicyVersion?: number;
  legalRuleVersionSnapshot?: number;
  legalFeeCapPercentSnapshot?: number;
  legalFeeCapAmountSnapshot?: Cents;
  disclosuresAcknowledged: string[];
  signedAt?: IsoDate;
  cancellationDeadline?: IsoDate;
  cancelledAt?: IsoDate;
  freeClaimOptionDisclosedAt?: IsoDate;
  documentId?: string;
}

export interface Claim {
  id: string;
  reference: string;
  opportunityId: string;
  propertyId: string;
  jurisdictionId: string;
  participants: ClaimParticipant[];
  estateId?: string;
  status: ClaimStatus;
  stageKey: string;
  legalBasis: string;
  filingDeadline?: IsoDate;
  estimatedRecovery: MonetaryFact;
  confirmedRecovery?: MonetaryFact;
  feeAgreement?: FeeAgreement;
  custodian: SurplusCustodian;
  agencyContactName?: string;
  agencyReference?: string;
  submittedAt?: IsoDate;
  agencyResponseAt?: IsoDate;
  agencyResponseSummary?: string;
  attorneyAssignment?: AttorneyAssignment;
  legalReview?: import("./legal").LegalReviewRecord;
  flags: RiskFlag[];
  nextClaimantAction?: string;
  nextInternalAction?: string;
  assignedSpecialistId?: string;
  createdAt: IsoDate;
  lastActivityAt: IsoDate;
  closedAt?: IsoDate;
  notes: Note[];
}

/* ========================================================================== */
/* Documents                                                                   */
/* ========================================================================== */

export type DocumentKind =
  | "government_id"
  | "proof_of_former_ownership"
  | "recorded_deed"
  | "death_certificate"
  | "probate_letters"
  | "letters_of_administration"
  | "will"
  | "trust_instrument"
  | "articles_of_organization"
  | "certificate_of_good_standing"
  | "w9"
  | "affidavit_of_heirship"
  | "affidavit_of_entitlement"
  | "court_order"
  | "agency_claim_form"
  | "agency_correspondence"
  | "fee_agreement"
  | "lien_release"
  | "bankruptcy_discharge"
  | "marriage_certificate"
  | "utility_bill_proof_of_residence"
  | "other";

export type DocumentSensitivity =
  "public_record" | "internal" | "sensitive" | "restricted";

export type DocumentStatus =
  | "requested"
  | "uploaded"
  | "scanning"
  | "under_review"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

export interface StoredDocument {
  id: string;
  claimId?: string;
  opportunityId?: string;
  claimantId?: string;
  kind: DocumentKind;
  title: string;
  originalFileName?: string;
  mimeType: string;
  byteSize: number;
  sensitivity: DocumentSensitivity;
  status: DocumentStatus;
  storageKey: string;
  uploadedByUserId?: string;
  uploadedByClaimantId?: string;
  uploadedAt?: IsoInstant;
  reviewedByUserId?: string;
  reviewedAt?: IsoInstant;
  rejectionReason?: string;
  pageCount?: number;
  expiresAt?: IsoDate;
}

export interface DocumentRequest {
  id: string;
  claimId: string;
  kind: DocumentKind;
  reason: string;
  requestedFromClaimantId?: string;
  requestedAt: IsoDate;
  dueBy?: IsoDate;
  required: boolean;
  status: "outstanding" | "received" | "accepted" | "waived" | "overdue";
  guidance?: string;
  fulfilledByDocumentId?: string;
  waivedReason?: string;
}

/* ========================================================================== */
/* Work, communication and outreach                                            */
/* ========================================================================== */

export type TaskKind =
  | "research"
  | "owner_search"
  | "document_review"
  | "agency_follow_up"
  | "claimant_follow_up"
  | "compliance_review"
  | "commercial_review"
  | "attorney_handoff"
  | "filing"
  | "payment_verification"
  | "closing";

export type TaskStatus =
  "open" | "in_progress" | "blocked" | "done" | "cancelled";

export interface WorkTask {
  id: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: 1 | 2 | 3;
  claimId?: string;
  opportunityId?: string;
  assignedToUserId?: string;
  dueBy?: IsoDate;
  createdAt: IsoDate;
  completedAt?: IsoDate;
  blockedReason?: string;
  detail?: string;
}

export type CommunicationChannel =
  | "secure_message"
  | "email"
  | "phone_call"
  | "sms"
  | "letter"
  | "in_person"
  | "agency_call"
  | "agency_letter";

export type CommunicationDirection = "inbound" | "outbound" | "internal";

export interface Communication {
  id: string;
  claimId?: string;
  opportunityId?: string;
  claimantId?: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  authorName: string;
  authorRole: "claimant" | "specialist" | "attorney" | "agency" | "system";
  subject?: string;
  body: string;
  sentAt: IsoInstant;
  readAt?: IsoInstant;
  attachmentDocumentIds?: string[];
  claimantVisible: boolean;
}

export type OutreachChannel =
  "letter" | "email" | "phone" | "sms" | "attorney_letter";

export type OutreachStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "returned_undeliverable"
  | "responded"
  | "opted_out"
  | "no_response";

export interface OutreachAttempt {
  id: string;
  opportunityId: string;
  channel: OutreachChannel;
  templateKey: string;
  status: OutreachStatus;
  sentAt?: IsoDate;
  respondedAt?: IsoDate;
  optedOutAt?: IsoDate;
  consentBasis:
    | "public_record_mail"
    | "express_written"
    | "express_oral"
    | "inbound_request";
  doNotContactScreenedAt?: IsoDate;
  verificationCode?: string;
  commercialFeeQuoteId?: string;
  sentByUserId: string;
  followUpAt?: IsoDate;
  outcomeNote?: string;
}

/* ========================================================================== */
/* Attorneys                                                                   */
/* ========================================================================== */

export interface LawFirm {
  id: string;
  name: string;
  city: string;
  state: StateCode;
  website?: string;
  phone?: string;
}

export type AttorneyMatterKind =
  | "probate"
  | "estate_administration"
  | "competing_heirs"
  | "bankruptcy"
  | "court_motion"
  | "contested_surplus"
  | "lien_dispute"
  | "trust_dispute"
  | "entity_dissolution"
  | "complex_title"
  | "quiet_title";

export interface Attorney {
  id: string;
  name: string;
  firmId: string;
  licenses: {
    state: StateCode;
    barNumber: string;
    admittedYear: number;
  }[];
  practiceAreas: AttorneyMatterKind[];
  countiesServed: {
    state: StateCode;
    county: string;
  }[];
  languages: string[];
  email: string;
  phone: string;
  availability: "accepting" | "limited" | "not_accepting";
  activeMatterCount: number;
  metrics?: {
    mattersCompleted: number;
    medianDaysToResolution: number;
  };
  engagementStatus: "active" | "onboarding" | "inactive";
  conflictCheckStatus: "clear" | "pending" | "conflict_identified";
  barStatusLastVerifiedAt?: IsoDate;
  malpracticeInsuranceStatus?: "verified" | "pending" | "not_verified";
  malpracticeInsuranceVerifiedAt?: IsoDate;
  disciplinaryReviewStatus?: "clear" | "review_required" | "not_reviewed";
  disciplinaryReviewAt?: IsoDate;
}

export interface AttorneyAssignment {
  id: string;
  attorneyId: string;
  matterKind: AttorneyMatterKind;
  escalationReason: string;
  referredAt: IsoDate;
  engagementSignedAt?: IsoDate;
  status:
    | "referred"
    | "conflict_check"
    | "engaged"
    | "declined"
    | "completed"
    | "withdrawn";
  feeSharedWithDuequity: false;
  separateEngagementDisclosedAt?: IsoDate;
  conflictCheckedAt?: IsoDate;
  independentLegalFee?: import("./legal").IndependentLegalFee;
  handoffDocumentIds?: string[];
  note?: string;
}

/* ========================================================================== */
/* Recovery and payment                                                        */
/* ========================================================================== */

export type PaymentDestination =
  | "claimant_direct"
  | "estate_account"
  | "attorney_trust_account"
  | "split_among_claimants";

export type PaymentSource =
  | "county_treasurer"
  | "county_tax_collector"
  | "clerk_of_court"
  | "sheriff"
  | "trustee"
  | "state_unclaimed_property"
  | "municipality";

export interface PaymentRecord {
  id: string;
  amount: Cents;
  source: PaymentSource;
  sourceName: string;
  destination: PaymentDestination;
  instrument: "check" | "ach" | "wire" | "court_disbursement";
  issuedAt: IsoDate;
  clearedAt?: IsoDate;
  reference?: string;
}

export interface Recovery {
  id: string;
  claimId: string;
  approvedAmount: Cents;
  approvedAt: IsoDate;
  payments: PaymentRecord[];
  serviceFee: Cents;
  feeBasis: string;
  feeSettledAt?: IsoDate;
  netToClaimant: Cents;
  agencyDeductions?: {
    label: string;
    amount: Cents;
  }[];
  completedAt?: IsoDate;
  closingDocumentIds: string[];
}

/* ========================================================================== */
/* Timeline, notes, audit                                                      */
/* ========================================================================== */

export interface TimelineEvent {
  id: string;
  claimId?: string;
  opportunityId?: string;
  stageKey?: string;
  occurredAt: IsoDate;
  claimantLabel: string;
  claimantDetail?: string;
  internalLabel?: string;
  actorName?: string;
  actorRole?: "claimant" | "specialist" | "attorney" | "agency" | "system";
  claimantVisible: boolean;
}

export interface Note {
  id: string;
  body: string;
  authorName: string;
  createdAt: IsoDate;
  visibility: "internal" | "claimant_visible";
  pinned?: boolean;
}

export interface AuditEvent {
  id: string;
  occurredAt: IsoInstant;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: AuditAction;

  targetType:
    | "claim"
    | "opportunity"
    | "claimant"
    | "document"
    | "jurisdiction"
    | "fee_policy"
    | "fee_quote"
    | "fee_agreement"
    | "user"
    | "recovery"
    | "contact_inquiry"
    | "session";

  targetId: string;
  targetLabel?: string;
  outcome: "success" | "denied" | "failed";
  ipPrefix?: string;
  deviceSummary?: string;
  detail?: string;
}

export type AuditAction =
  | "session.login"
  | "session.login_failed"
  | "session.logout"
  | "session.mfa_enrolled"
  | "claim.created"
  | "claim.status_changed"
  | "claim.stage_changed"
  | "claim.assigned"
  | "claim.submitted_to_agency"
  | "claim.closed"
  | "opportunity.created"
  | "opportunity.converted"
  | "opportunity.disqualified"
  | "claimant.created"
  | "claimant.identity_verified"
  | "claimant.contact_updated"
  | "document.uploaded"
  | "document.viewed"
  | "document.downloaded"
  | "document.accepted"
  | "document.rejected"
  | "document.deleted"
  | "jurisdiction.rule_updated"
  | "jurisdiction.compliance_status_changed"

  /* ---- commercial pricing ---- */
  | "fee_policy.created"
  | "fee_policy.updated"
  | "fee_policy.approved"
  | "fee_policy.paused"
  | "fee_policy.retired"
  | "fee_quote.created"
  | "fee_quote.recalculated"
  | "fee_quote.staff_approved"
  | "fee_quote.manager_review_requested"
  | "fee_quote.manager_approved"
  | "fee_quote.rejected"
  | "fee_quote.outreach_approved"
  | "fee_quote.locked"
  | "fee_agreement.signed"
  | "fee_agreement.cancelled"

  /* ---- legal complexity routing ---- */
  | "legal.classified_administrative"
  | "legal.review_requested"
  | "legal.complexity_flag_added"
  | "legal.complexity_flag_resolved"
  | "legal.attorney_required"
  | "legal.lane_changed"
  | "legal.returned_to_administrative"
  | "legal.matter_completed"
  | "attorney.referred"
  | "attorney.engaged"
  | "recovery.approved"
  | "recovery.payment_recorded"
  | "recovery.completed"

  /* ---- public contact inquiries ---- */
  | "contact.inquiry_created"
  | "contact.inquiry_viewed"
  | "contact.reply_sent"
  | "contact.status_changed"

  | "export.generated"
  | "permission.denied";

/* ========================================================================== */
/* Users, roles and permissions                                                */
/* ========================================================================== */

export type UserRole =
  | "claimant"
  | "operations_specialist"
  | "research_analyst"
  | "compliance_officer"
  | "claims_manager"
  | "attorney_liaison"
  | "communications_specialist"
  | "administrator"
  | "super_admin";

export type Permission =
  | "opportunity.read"
  | "opportunity.write"
  | "opportunity.disqualify"
  | "claim.read"
  | "claim.write"
  | "claim.submit"
  | "claim.close"
  | "claimant.read"
  | "claimant.write"
  | "claimant.read_sensitive"
  | "document.read"
  | "document.read_restricted"
  | "document.review"
  | "document.delete"
  | "jurisdiction.read"
  | "jurisdiction.write"
  | "compliance.approve"

  /* ---- commercial pricing ---- */
  | "fee_policy.read"
  | "fee_policy.write"
  | "fee_policy.approve"
  | "fee_quote.read"
  | "fee_quote.write"
  | "fee_quote.staff_approve"
  | "fee_quote.manager_approve"
  | "fee_quote.outreach_approve"
  | "fee_agreement.write"
  | "attorney.read"
  | "attorney.refer"
  | "recovery.read"
  | "recovery.write"
  | "recovery.approve"
  | "report.read"
  | "audit.read"

  /* ---- public contact inquiries ---- */
  | "contact.read"
  | "contact.reply"
  | "contact.manage"

  | "user.manage"
  | "settings.manage";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  statesCleared: StateCode[];
  mfaEnrolled: boolean;
  lastActiveAt?: IsoDate;
  status: "active" | "suspended" | "invited";
}