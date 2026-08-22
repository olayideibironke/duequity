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

/**
 * Operational clearance for a jurisdiction.
 *
 * Duequity may not accept a claimant in a jurisdiction that has not been
 * cleared. The platform enforces this rather than relying upon staff memory.
 */
export type ComplianceStatus =
  | "research_required"
  | "under_legal_review"
  | "approved"
  | "attorney_only"
  | "restricted"
  | "paused";

/** Fee models a jurisdiction may permit. */
export type FeeModel = "flat" | "percentage" | "capped_success" | "no_fee";

export type ClaimSubmissionMethod =
  | "mail"
  | "in_person"
  | "email"
  | "online_portal"
  | "court_filing"
  | "attorney_filing";

/**
 * The jurisdiction rule record.
 *
 * Every field here exists because it can change whether, how, and at what price
 * Duequity may act.
 */
export interface Jurisdiction {
  id: string;
  state: StateCode;
  stateName: string;
  /** Null for a statewide rule such as an unclaimed property office. */
  county?: string;
  /** The agency that receives and adjudicates the claim. */
  agencyName: string;
  custodian: SurplusCustodian;
  agencyWebsite?: string;
  agencyPhone?: string;
  agencyAddress?: Omit<Address, "id" | "county">;

  claimMethod: ClaimSubmissionMethod;
  claimFormUrl?: string;
  /** Documents this agency requires, by DocumentKind. */
  requiredDocuments: DocumentKind[];

  /** Statutory window to claim, counted in days from the sale date. */
  claimDeadlineDays?: number;
  /** Controlling statute, rule, order or published agency procedure. */
  statuteReference?: string;

  /* ---- fee and licensing rules ---- */
  permittedFeeModels: FeeModel[];
  /** Recorded legal ceiling on a percentage fee, expressed 0 to 1. */
  feeCapPercent?: number;
  /** Recorded legal ceiling on a fee amount. */
  feeCapAmount?: Cents;
  /** Whether a surplus claim may be assigned or purchased. */
  assignmentPermitted: boolean;
  /** Whether a power of attorney is accepted for claim submission. */
  powerOfAttorneyAccepted: boolean;
  finderLicenseRequired: boolean;
  bondRequired: boolean;
  attorneyRequired: boolean;
  /** Contract language the jurisdiction mandates verbatim. */
  mandatoryContractLanguage?: string[];
  /** Recorded cancellation window in days. */
  cancellationPeriodDays?: number;
  /** How the agency issues payment. */
  paymentRoutingNote?: string;
  /** Whether an opened estate is required when the owner is deceased. */
  probateRequiredWhenDeceased: boolean;

  complianceStatus: ComplianceStatus;
  lastLegalReview?: IsoDate;
  reviewedBy?: string;
  internalNotes?: string;

  /**
   * Optional governance metadata for production legal review.
   *
   * Legacy local-validation records may omit these fields. Production records must retain
   * authoritative sources and version information so later rule changes can be
   * distinguished from the rules in effect when an agreement was signed.
   */
  legalRuleVersion?: number;
  legalRuleEffectiveFrom?: IsoDate;
  legalRuleEffectiveThrough?: IsoDate;
  legalReviewDueAt?: IsoDate;
  legalSourceUrls?: string[];
  legalApprovedByUserId?: string;
  legalApprovedAt?: IsoInstant;

  /**
   * How this jurisdiction treats administrative assistance.
   *
   * Distinct from complianceStatus, which answers whether Duequity may operate
   * here at all. This answers what an attorney must do when Duequity does operate
   * here.
   *
   * Optional. Where absent it is inferred from complianceStatus and
   * attorneyRequired by jurisdictionLegalRule() in src/domain/legal.ts.
   */
  legalProcessingRule?: import("./legal").LegalProcessingRule;
}

/* ========================================================================== */
/* Commercial pricing policy                                                   */
/* ========================================================================== */

/**
 * Commercial pricing is intentionally separate from jurisdiction compliance.
 *
 * Jurisdiction records define what may legally be charged.
 * Commercial fee policies define what Duequity chooses to charge.
 *
 * A commercial policy must always remain inside the recorded legal ceiling.
 */
export type CommercialFeePolicyStatus =
  "draft" | "approved" | "paused" | "retired";

/**
 * Why a commercial quote is being calculated.
 *
 * Estimated recovery may be used for internal viability analysis before agency
 * confirmation. A confirmed recovery is preferred before a claimant is quoted.
 */
export type FeeQuoteRecoveryBasis = "estimated" | "confirmed";

/**
 * Commercial viability outcome.
 *
 * This is an internal business decision, never a legal determination.
 */
export type CommercialViabilityStatus =
  | "not_evaluated"
  | "viable"
  | "manager_review"
  | "below_minimum_revenue"
  | "declined";

/**
 * Approval state for a case-specific commercial fee quote.
 */
export type FeeQuoteApprovalStatus =
  | "draft"
  | "staff_approved"
  | "manager_review"
  | "manager_approved"
  | "rejected"
  | "locked";

/**
 * One recovery-value band inside a Duequity commercial fee policy.
 *
 * Bands allow Duequity to charge a lower percentage on larger recoveries rather
 * than applying one nationwide percentage regardless of case value.
 */
export interface CommercialFeeTier {
  id: string;
  label: string;

  /** Inclusive lower bound for the recovery amount. */
  minimumRecovery: Cents;

  /** Inclusive upper bound. Omit for the highest open-ended band. */
  maximumRecovery?: Cents;

  /** Commercial model Duequity intends to use within this band. */
  model: FeeModel;

  /**
   * Default percentage offered by Duequity, expressed 0 to 1.
   * Used by percentage and capped-success models.
   */
  defaultPercentage?: number;

  /**
   * Lowest percentage ordinary staff may quote without manager approval.
   * This is a commercial floor, not a legal floor.
   */
  staffFloorPercentage?: number;

  /**
   * Highest percentage ordinary staff may quote.
   * Must never exceed the jurisdiction legal ceiling.
   */
  staffCeilingPercentage?: number;

  /**
   * Highest percentage a manager may approve as an exception.
   * Must never exceed the jurisdiction legal ceiling.
   */
  managerExceptionCeilingPercentage?: number;

  /** Default flat amount for flat-fee models. */
  defaultFlatAmount?: Cents;

  /** Lowest flat fee ordinary staff may quote. */
  staffFloorAmount?: Cents;

  /** Highest flat fee ordinary staff may quote. */
  staffCeilingAmount?: Cents;

  /** Highest flat fee a manager may approve as an exception. */
  managerExceptionCeilingAmount?: Cents;

  /**
   * Minimum projected Duequity revenue required for the opportunity to be
   * commercially viable without manager review.
   */
  minimumViableFee?: Cents;

  /**
   * Optional internal hard cap lower than the legal jurisdiction cap.
   * Duequity may voluntarily cap its own fee below what the law permits.
   */
  internalFeeCapAmount?: Cents;

  active: boolean;
}

/**
 * Duequity's commercial pricing policy for a jurisdiction.
 *
 * A jurisdiction may eventually have more than one policy where sale type,
 * custodian or recovery process materially changes the economics.
 */
export interface CommercialFeePolicy {
  id: string;
  jurisdictionId: string;

  /**
   * Optional narrowing by sale type. Empty or absent means the policy applies to
   * every sale type currently cleared under the jurisdiction record.
   */
  saleTypes?: SaleType[];

  /**
   * Optional narrowing by custodian. Empty or absent means the policy applies to
   * every custodian currently cleared under the jurisdiction record.
   */
  custodians?: SurplusCustodian[];

  status: CommercialFeePolicyStatus;

  /**
   * Monotonically increasing policy version.
   *
   * Signed agreements retain the version used at signature even when a newer
   * commercial policy later replaces it.
   */
  version: number;

  effectiveFrom: IsoDate;
  effectiveThrough?: IsoDate;

  tiers: CommercialFeeTier[];

  /** User who approved publication of this commercial policy. */
  approvedByUserId?: string;

  /** Exact approval instant. */
  approvedAt?: IsoInstant;

  /** When the commercial policy was most recently reviewed. */
  lastReviewedAt?: IsoDate;

  /** Internal review deadline. */
  reviewDueAt?: IsoDate;

  /**
   * Human readable internal rationale.
   *
   * This may discuss margins, workload, acquisition cost or strategic pricing.
   * It is never shown to a claimant.
   */
  internalNotes?: string;
}

/**
 * A case-specific commercial quote computed before outreach.
 *
 * The quote preserves both legal and commercial ceilings as snapshots so the
 * system can later prove what rules were applied at the time.
 */
export interface CommercialFeeQuote {
  id: string;

  opportunityId: string;
  jurisdictionId: string;

  /** Commercial policy and exact version used to calculate this quote. */
  commercialPolicyId: string;
  commercialPolicyVersion: number;
  commercialTierId: string;

  /** Amount used to price the opportunity. */
  recoveryAmount: Cents;
  recoveryBasis: FeeQuoteRecoveryBasis;

  model: FeeModel;

  /** Selected percentage, expressed 0 to 1 where applicable. */
  selectedPercentage?: number;

  /** Selected flat amount where applicable. */
  selectedFlatAmount?: Cents;

  /** Fee calculated from the selected commercial terms. */
  projectedFee: Cents;

  /** Recovery less the projected Duequity service fee. */
  projectedClaimantNet: Cents;

  /* ---- legal rule and ceiling snapshot ---- */

  /**
   * Exact approved jurisdiction legal-rule version used when this quote was
   * calculated.
   *
   * Optional for legacy/local validation records. Production quotes must
   * populate this before approval, outreach, agreement creation or conversion.
   *
   * This is separate from the commercial policy version. It allows Duequity to
   * prove which legal rule was applied when pricing was created and to block a
   * later filing if the jurisdiction rule has since changed.
   */
  legalRuleVersionSnapshot?: number;

  legalFeeCapPercentSnapshot?: number;
  legalFeeCapAmountSnapshot?: Cents;

  /* ---- Duequity commercial ceiling snapshot ---- */

  commercialStaffFloorPercentSnapshot?: number;
  commercialStaffCeilingPercentSnapshot?: number;
  commercialManagerCeilingPercentSnapshot?: number;

  commercialStaffFloorAmountSnapshot?: Cents;
  commercialStaffCeilingAmountSnapshot?: Cents;
  commercialManagerCeilingAmountSnapshot?: Cents;

  internalFeeCapAmountSnapshot?: Cents;
  minimumViableFeeSnapshot?: Cents;

  /* ---- decisioning ---- */

  viabilityStatus: CommercialViabilityStatus;
  approvalStatus: FeeQuoteApprovalStatus;

  /** Plain-language internal reason when manager review is required. */
  approvalReason?: string;

  createdByUserId: string;
  createdAt: IsoInstant;

  approvedByUserId?: string;
  approvedAt?: IsoInstant;

  /**
   * Outreach may not begin until compliance and commercial approval both pass.
   */
  outreachApprovedAt?: IsoInstant;
  outreachApprovedByUserId?: string;

  /**
   * Once an agreement is signed, this quote becomes immutable.
   */
  lockedAt?: IsoInstant;
  lockedFeeAgreementId?: string;

  internalNote?: string;
}

/* ========================================================================== */
/* Opportunity pipeline                                                        */
/* ========================================================================== */

/**
 * Opportunity stages.
 *
 * Owner research and surplus confirmation frequently run in parallel, so stage
 * is a summary of where the record sits while detail lives in other fields.
 */
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

/** Confidence that the located contact details reach the right person. */
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

/**
 * A researched possibility, before any person has agreed to become a claimant.
 * An opportunity is a Duequity internal record. It is never a promise of money.
 */
export interface Opportunity {
  id: string;
  /** Short human reference, for example "OPP-2026-0417". */
  reference: string;
  propertyId: string;
  jurisdictionId: string;
  sale: SaleRecord;
  priorOwners: PriorOwner[];

  /**
   * Estimated surplus, derived arithmetically from the sale record.
   * Always presented as an estimate until the agency confirms a figure.
   */
  estimatedSurplus: MonetaryFact;

  /** Present only once the responsible agency states a figure in writing. */
  confirmedSurplus?: MonetaryFact;

  custodian: SurplusCustodian;

  /** Absolute statutory deadline, computed from the jurisdiction rule. */
  claimDeadline?: IsoDate;

  status: OpportunityStatus;
  ownerLocated: OwnerLocatedStatus;
  contactConfidence: ContactConfidence;

  /* ---- research flags that gate how the case may proceed ---- */
  flags: RiskFlag[];

  /** Analyst-assigned priority, 1 highest. */
  priority: 1 | 2 | 3;

  /**
   * Composite risk score, 0 to 100, higher means more complicated.
   * Advisory only. It never produces a legal conclusion or automated decision.
   */
  riskScore: number;

  /**
   * Active internal commercial quote.
   *
   * Optional for legacy local-validation records. Production outreach requires an
   * approved quote before contact begins.
   */
  activeCommercialFeeQuoteId?: string;

  assignedToUserId?: string;

  /** Set once the opportunity becomes a claim. */
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

/**
 * Conditions that change how a case must be handled.
 *
 * These assist human review. The engine raises flags, it never draws a legal
 * conclusion.
 */
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
  /** Why this flag was raised, in plain language, for the reviewing human. */
  detail: string;
  raisedAt: IsoDate;
  raisedBy: string;
  resolvedAt?: IsoDate;
  resolutionNote?: string;
}

/* ========================================================================== */
/* Claimants, estates and heirs                                                */
/* ========================================================================== */

/** How a claimant connects to the former owner of record. */
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
  /** Express consent to be contacted on this channel, required for SMS and calls. */
  consentGivenAt?: IsoDate;
  optedOutAt?: IsoDate;
}

/**
 * A person or entity asserting entitlement.
 *
 * Sensitive identifiers are deliberately absent from this type. Duequity does
 * not collect a Social Security number unless an approved jurisdiction workflow
 * requires one.
 */
export interface Claimant {
  id: string;
  reference: string;
  legalName: string;
  preferredName?: string;

  /** Present only where a jurisdiction requires date of birth to adjudicate. */
  dateOfBirth?: IsoDate;

  entityType: "individual" | "estate" | "trust" | "business";

  contactMethods: ContactMethod[];
  mailingAddress?: Address;
  preferredContactChannel: ConsentChannel;

  /** Written or recorded consent to be contacted at all. */
  consentRecordedAt?: IsoDate;
  consentSource?: string;

  identityVerification: IdentityVerificationStatus;
  identityVerifiedAt?: IsoDate;

  /**
   * Opaque reference issued by the identity verification provider.
   * No document images or government identifiers are stored on this record.
   */
  identityProviderRef?: string;

  /** Language preference, ISO 639-1. Drives correspondence templates. */
  preferredLanguage: string;
  accessibilityNote?: string;

  fraudFlags: RiskFlag[];
  createdAt: IsoDate;
  notes: Note[];
}

/** An opened or unopened estate, where the owner of record has died. */
export interface Estate {
  id: string;
  decedentName: string;
  dateOfDeath: IsoDate;

  /** Probate case number, when an estate has been opened. */
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

  /** Letters of administration or testamentary on file. */
  lettersOnFile: boolean;

  willOnFile?: boolean;
  heirs: Heir[];
  provenance: Provenance;
}

export interface Heir {
  id: string;
  name: string;
  relationship: ClaimantRelationship;

  /** Fractional interest asserted, 0 to 1. Sum across heirs should reach 1. */
  assertedShare?: number;

  /** Linked once this heir is onboarded as a claimant in their own right. */
  claimantId?: string;

  contacted: boolean;

  /** Whether this heir has signed a consent or waiver, where required. */
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

/**
 * A configurable recovery stage.
 *
 * Claimant timeline stages are data rather than a hard-coded list.
 */
export interface RecoveryStage {
  key: string;
  ordinal: number;
  /** Label shown to the claimant. Written for a non-specialist reader. */
  claimantLabel: string;
  /** Label shown to operations staff. May use internal terminology. */
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

  /** Asserted fractional entitlement, 0 to 1. */
  assertedShare?: number;

  /** Share as adjudicated by the agency or court, once determined. */
  determinedShare?: number;

  /** True where this participant contests another participant's entitlement. */
  contesting?: boolean;

  addedAt: IsoDate;
}

/**
 * The fee agreement.
 *
 * Every field is a compliance control. Duequity never takes custody of claimant
 * funds. Fees are disclosed and must remain within the applicable jurisdiction
 * rule and the approved Duequity commercial pricing policy.
 */
export interface FeeAgreement {
  id: string;
  model: FeeModel;

  /** Percentage expressed 0 to 1, present only for percentage models. */
  percentage?: number;

  /** Flat amount, present for flat and capped models. */
  flatAmount?: Cents;

  /** Hard ceiling applied regardless of model, from the jurisdiction rule. */
  capAmount?: Cents;

  /** The jurisdiction rule this agreement was validated against. */
  jurisdictionId: string;

  /**
   * Case-specific commercial quote that produced this agreement.
   *
   * Optional on legacy local-validation records. Production agreements always retain it.
   */
  commercialFeeQuoteId?: string;

  /**
   * Duequity commercial policy snapshot used when the agreement was created.
   */
  commercialPolicyId?: string;
  commercialPolicyVersion?: number;

  /**
   * Legal rule snapshot used when the agreement was created.
   */
  legalRuleVersionSnapshot?: number;
  legalFeeCapPercentSnapshot?: number;
  legalFeeCapAmountSnapshot?: Cents;

  /** Disclosures presented to and acknowledged by the claimant. */
  disclosuresAcknowledged: string[];

  signedAt?: IsoDate;

  /** Statutory cancellation deadline, computed at signature. */
  cancellationDeadline?: IsoDate;

  cancelledAt?: IsoDate;

  /** Written confirmation that the claimant was told they may claim for free. */
  freeClaimOptionDisclosedAt?: IsoDate;

  documentId?: string;
}

export interface Claim {
  id: string;

  /** Claimant-facing reference, for example "DQ-4471-MD". */
  reference: string;

  opportunityId: string;
  propertyId: string;
  jurisdictionId: string;

  participants: ClaimParticipant[];

  /** Present where the owner of record is deceased. */
  estateId?: string;

  status: ClaimStatus;

  /** Key into the configured RecoveryStage list. */
  stageKey: string;

  /** Statutory basis for the claim, in plain language plus a statute reference. */
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

  /**
   * Legal complexity classification.
   *
   * Defined in src/domain/legal.ts. Optional on the type so existing records
   * remain valid.
   */
  legalReview?: import("./legal").LegalReviewRecord;

  flags: RiskFlag[];

  /** The single next thing the claimant must do, or null when nothing is needed. */
  nextClaimantAction?: string;

  /** The single next thing operations must do. */
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

/**
 * Sensitivity governs how a document may be displayed, who may open it, and how
 * long the signed access URL lives.
 */
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

  /** Display name. Never the raw client filename without sanitisation. */
  title: string;

  originalFileName?: string;
  mimeType: string;
  byteSize: number;
  sensitivity: DocumentSensitivity;
  status: DocumentStatus;

  /**
   * Opaque object storage key.
   *
   * Access is always brokered through a short-lived signed URL issued after a
   * server-side authorisation check.
   */
  storageKey: string;

  uploadedByUserId?: string;
  uploadedByClaimantId?: string;
  uploadedAt?: IsoInstant;

  reviewedByUserId?: string;
  reviewedAt?: IsoInstant;

  rejectionReason?: string;

  /** Page count, for multi-page scans of court records. */
  pageCount?: number;

  /** Set where the document itself expires. */
  expiresAt?: IsoDate;
}

/** An outstanding request for a specific document from a specific party. */
export interface DocumentRequest {
  id: string;
  claimId: string;
  kind: DocumentKind;

  /** Why the agency or Duequity needs it, written for the claimant. */
  reason: string;

  requestedFromClaimantId?: string;
  requestedAt: IsoDate;
  dueBy?: IsoDate;
  required: boolean;

  status: "outstanding" | "received" | "accepted" | "waived" | "overdue";

  /** Guidance shown at the upload control. */
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

  /** Display name of the sender. */
  authorName: string;

  authorRole: "claimant" | "specialist" | "attorney" | "agency" | "system";

  subject?: string;
  body: string;
  sentAt: IsoInstant;
  readAt?: IsoInstant;
  attachmentDocumentIds?: string[];

  /** True where the message is visible to the claimant in the portal. */
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

/**
 * A proof-first outreach attempt.
 *
 * Production workflows should only create an outreach attempt after both the
 * jurisdiction compliance gate and Duequity commercial pricing gate have passed.
 */
export interface OutreachAttempt {
  id: string;
  opportunityId: string;
  channel: OutreachChannel;
  templateKey: string;
  status: OutreachStatus;
  sentAt?: IsoDate;
  respondedAt?: IsoDate;
  optedOutAt?: IsoDate;

  /** Legal basis relied upon for this contact. */
  consentBasis:
    | "public_record_mail"
    | "express_written"
    | "express_oral"
    | "inbound_request";

  /** Screened against the national and state do-not-contact registries. */
  doNotContactScreenedAt?: IsoDate;

  /** Verification code printed on the outreach. */
  verificationCode?: string;

  /**
   * Commercial quote approved before this outreach began.
   *
   * Optional for legacy local-validation records. Production outreach retains it.
   */
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

  /** States of licensure with bar numbers. */
  licenses: {
    state: StateCode;
    barNumber: string;
    admittedYear: number;
  }[];

  practiceAreas: AttorneyMatterKind[];

  /** Counties the attorney will accept matters in. */
  countiesServed: {
    state: StateCode;
    county: string;
  }[];

  languages: string[];
  email: string;
  phone: string;

  availability: "accepting" | "limited" | "not_accepting";

  activeMatterCount: number;

  /** Historical outcomes, for internal referral quality only. */
  metrics?: {
    mattersCompleted: number;
    medianDaysToResolution: number;
  };

  engagementStatus: "active" | "onboarding" | "inactive";

  conflictCheckStatus: "clear" | "pending" | "conflict_identified";

  /**
   * Optional production governance.
   */
  barStatusLastVerifiedAt?: IsoDate;
  malpracticeInsuranceStatus?: "verified" | "pending" | "not_verified";
  malpracticeInsuranceVerifiedAt?: IsoDate;
  disciplinaryReviewStatus?: "clear" | "review_required" | "not_reviewed";
  disciplinaryReviewAt?: IsoDate;
}

/**
 * An escalation to independent counsel.
 *
 * Duequity does not share legal fees and does not receive referral compensation.
 */
export interface AttorneyAssignment {
  id: string;
  attorneyId: string;
  matterKind: AttorneyMatterKind;

  /** Why the matter requires counsel, in plain language. */
  escalationReason: string;

  referredAt: IsoDate;

  /** Set when the claimant signs an engagement letter directly with the firm. */
  engagementSignedAt?: IsoDate;

  status:
    | "referred"
    | "conflict_check"
    | "engaged"
    | "declined"
    | "completed"
    | "withdrawn";

  /**
   * Always false.
   *
   * Retained as an explicit, auditable statement that no fee-sharing arrangement
   * exists on any matter.
   */
  feeSharedWithDuequity: false;

  /** Confirmation that the claimant was told the engagement is separate. */
  separateEngagementDisclosedAt?: IsoDate;

  /** Conflict check outcome for this specific matter. */
  conflictCheckedAt?: IsoDate;

  /**
   * The firm's own fee, held entirely separately from any Duequity service fee.
   */
  independentLegalFee?: import("./legal").IndependentLegalFee;

  /** Documents released to counsel as part of the handoff package. */
  handoffDocumentIds?: string[];

  note?: string;
}

/* ========================================================================== */
/* Recovery and payment                                                        */
/* ========================================================================== */

/**
 * Where the money went.
 *
 * Duequity is never a payment destination for claimant funds.
 */
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

  /** The specific agency that issued payment. */
  sourceName: string;

  destination: PaymentDestination;

  /** Instrument type. Duequity never endorses or deposits a claimant instrument. */
  instrument: "check" | "ach" | "wire" | "court_disbursement";

  issuedAt: IsoDate;
  clearedAt?: IsoDate;
  reference?: string;
}

export interface Recovery {
  id: string;
  claimId: string;

  /** Gross amount approved by the agency. */
  approvedAmount: Cents;

  approvedAt: IsoDate;
  payments: PaymentRecord[];

  /** Duequity service fee, computed against the fee agreement and cap. */
  serviceFee: Cents;

  /** Human-readable explanation of exactly how the fee was computed. */
  feeBasis: string;

  /** Fee invoice settlement. Separate from the government disbursement. */
  feeSettledAt?: IsoDate;

  /** Net amount to the claimant after the disclosed service fee. */
  netToClaimant: Cents;

  /** Third-party deductions the agency withheld. */
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

  /** Stage key this event advanced the case into, where applicable. */
  stageKey?: string;

  occurredAt: IsoDate;

  /** Label written for a claimant audience. */
  claimantLabel: string;

  /** Additional context, claimant-facing. */
  claimantDetail?: string;

  /** Internal label, may use operational terminology. */
  internalLabel?: string;

  actorName?: string;

  actorRole?: "claimant" | "specialist" | "attorney" | "agency" | "system";

  /** Whether the claimant sees this event in their portal timeline. */
  claimantVisible: boolean;
}

export interface Note {
  id: string;
  body: string;
  authorName: string;
  createdAt: IsoDate;

  /** Internal notes are never exposed on a claimant surface. */
  visibility: "internal" | "claimant_visible";

  pinned?: boolean;
}

/**
 * Immutable audit record.
 *
 * Sensitive actions are logged with actor, action, target and outcome.
 */
export interface AuditEvent {
  id: string;
  occurredAt: IsoInstant;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: AuditAction;

  /** Entity type and identifier the action was performed against. */
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
    | "session";

  targetId: string;
  targetLabel?: string;

  outcome: "success" | "denied" | "failed";

  /** Coarse network origin. */
  ipPrefix?: string;

  deviceSummary?: string;

  /** Structured, non-sensitive detail about what changed. */
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
  | "administrator"
  | "super_admin";

/**
 * Permission keys.
 *
 * These are the vocabulary of authorisation. Every check runs server-side. A
 * hidden button is not access control.
 */
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
  | "user.manage"
  | "settings.manage";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;

  /** States the user is cleared to operate in. Empty means all. */
  statesCleared: StateCode[];

  mfaEnrolled: boolean;
  lastActiveAt?: IsoDate;
  status: "active" | "suspended" | "invited";
}
