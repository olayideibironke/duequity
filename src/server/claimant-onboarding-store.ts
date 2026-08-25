import "server-only";

import { createHash } from "node:crypto";

import type {
  ClaimParticipant,
  ClaimParticipantRole,
  Claimant,
  ClaimantRelationship,
  ConsentChannel,
  IdentityVerificationStatus,
  IsoDate,
  IsoInstant,
} from "@/domain/types";

import type {
  StaffSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Domain                                                                      */
/* ========================================================================== */

export type ClaimantOnboardingStatus =
  | "identity_pending"
  | "disclosures_pending"
  | "agreement_pending"
  | "complete";

export interface PersistedDisclosureAcknowledgement {
  key: string;

  acknowledgedAt: IsoDate;

  acknowledgedByUserId: string;
}

export interface PersistedServiceAgreementAcceptance {
  signedAt: IsoDate;

  signedByClaimantId: string;

  requiredDisclosureKeysSnapshot: string[];

  cancellationDeadline?: IsoDate;

  documentId?: string;

  recordedByUserId: string;

  recordedAt: IsoInstant;
}

export interface PersistedClaimantOnboarding {
  claimId: string;

  claimReference: string;

  claimant: Claimant;

  participant: ClaimParticipant;

  disclosureAcknowledgements: PersistedDisclosureAcknowledgement[];

  freeClaimOptionDisclosedAt?: IsoDate;

  serviceAgreement?: PersistedServiceAgreementAcceptance;

  /**
   * Permanent business attribution.
   *
   * This identifies the DueQuity staff member who originally brought the
   * claimant into the controlled claimant workflow.
   *
   * Stage 16 protects this value at the database layer from later changes.
   */
  originatingStaffUserId: string;

  /**
   * Current operational owner.
   *
   * Ordinary staff may access only claimant records assigned to their own
   * persisted staff UUID. Super Admin may access every claimant.
   */
  assignedStaffUserId: string;

  /**
   * Technical record-creation actor retained separately from business
   * attribution.
   */
  createdByUserId: string;

  createdAt: IsoInstant;

  updatedAt: IsoInstant;
}

export type ClaimantOnboardingAuditAction =
  | "onboarding_started"
  | "contact_updated"
  | "contact_verified"
  | "contact_consent_recorded"
  | "identity_status_changed"
  | "disclosures_acknowledged"
  | "service_agreement_signed";

export interface ClaimantOnboardingAuditEntry {
  id: string;

  claimId: string;

  claimantId: string;

  action: ClaimantOnboardingAuditAction;

  actorUserId: string;

  occurredAt: IsoInstant;

  detail?: string;
}

/* ========================================================================== */
/* Inputs                                                                      */
/* ========================================================================== */

interface StaffMutationAuthority {
  /**
   * Existing callers continue to supply the authenticated persisted staff UUID.
   *
   * During the Stage 16 application rollout we additionally accept the resolved
   * StaffSession. When supplied, it enables the explicit Super Admin bypass.
   *
   * Ordinary callers without StaffSession are still fail-closed to the current
   * assigned staff UUID.
   */
  actorUserId: string;

  staffSession?: StaffSession;
}

export interface StartClaimantOnboardingInput
  extends StaffMutationAuthority {
  claimId: string;

  claimReference: string;

  claimantId: string;

  claimantReference: string;

  participantId: string;

  legalName: string;

  preferredName?: string;

  email: string;

  phone: string;

  entityType?: Claimant["entityType"];

  relationship?: ClaimantRelationship;

  participantRole?: ClaimParticipantRole;

  assertedShare?: number;

  preferredContactChannel?: ConsentChannel;

  preferredLanguage?: string;

  businessDate: IsoDate;

  occurredAt: IsoInstant;
}

export interface UpdateClaimantContactInput
  extends StaffMutationAuthority {
  claimId: string;

  email: string;

  phone: string;

  occurredAt: IsoInstant;
}

export interface SetClaimantContactVerificationInput
  extends StaffMutationAuthority {
  claimId: string;

  kind: "email" | "mobile";

  verified: boolean;

  occurredAt: IsoInstant;
}

export interface RecordClaimantContactConsentInput
  extends StaffMutationAuthority {
  claimId: string;

  channels: ("email" | "mobile")[];

  consentDate: IsoDate;

  consentSource: string;

  occurredAt: IsoInstant;
}

export interface SetClaimantIdentityVerificationInput
  extends StaffMutationAuthority {
  claimId: string;

  status: IdentityVerificationStatus;

  businessDate: IsoDate;

  providerRef?: string;

  occurredAt: IsoInstant;
}

export interface AcknowledgeClaimantDisclosuresInput
  extends StaffMutationAuthority {
  claimId: string;

  disclosureKeys: string[];

  acknowledgementDate: IsoDate;

  freeClaimOptionDisclosed: boolean;

  occurredAt: IsoInstant;
}

export interface SignClaimantServiceAgreementInput
  extends StaffMutationAuthority {
  claimId: string;

  requiredDisclosureKeys: string[];

  signedAt: IsoDate;

  cancellationDeadline?: IsoDate;

  documentId?: string;

  occurredAt: IsoInstant;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimantOnboardingRow {
  claim_id: string;

  claim_reference: string;

  conversion_id: string;

  claimant_id: string;

  claimant_reference: string;

  claimant_auth_user_id:
    | string
    | null;

  participant_id: string;

  legal_name: string;

  preferred_name:
    | string
    | null;

  entity_type: Claimant["entityType"];

  email: string;

  mobile_phone: string;

  contact_methods: unknown;

  preferred_contact_channel: ConsentChannel;

  consent_recorded_at:
    | string
    | null;

  consent_source:
    | string
    | null;

  identity_verification: IdentityVerificationStatus;

  identity_verified_at:
    | string
    | null;

  identity_provider_ref:
    | string
    | null;

  preferred_language: string;

  fraud_flags: unknown;

  claimant_created_on: string;

  claimant_notes: unknown;

  participant_role: ClaimParticipantRole;

  relationship: ClaimantRelationship;

  asserted_share:
    | number
    | string
    | null;

  participant_added_on: string;

  disclosure_acknowledgements: unknown;

  free_claim_option_disclosed_at:
    | string
    | null;

  jurisdiction_package_id: string;

  jurisdiction_package_version:
    | number
    | string;

  legal_rule_version_snapshot:
    | number
    | string;

  commercial_quote_id: string;

  commercial_snapshot_hash: string;

  commercial_policy_id: string;

  commercial_policy_version:
    | number
    | string;

  fee_agreement_id: string;

  fee_agreement_legal_rule_version_snapshot:
    | number
    | string
    | null;

  service_agreement_signed_at:
    | string
    | null;

  service_agreement_signed_by_claimant_id:
    | string
    | null;

  service_agreement_required_disclosure_keys_snapshot:
    | string[]
    | null;

  service_agreement_cancellation_deadline:
    | string
    | null;

  service_agreement_document_id:
    | string
    | null;

  service_agreement_recorded_by_user_id:
    | string
    | null;

  service_agreement_recorded_at:
    | string
    | null;

  originating_staff_user_id: string;

  assigned_staff_user_id: string;

  created_by_user_id: string;

  created_at: string;

  updated_at: string;

  row_version:
    | number
    | string;
}

interface ClaimantOnboardingAuditRow {
  id: string;

  claim_id: string;

  claimant_id: string;

  action: ClaimantOnboardingAuditAction;

  actor_user_id: string;

  occurred_at: string;

  detail:
    | string
    | null;
}

interface ConversionContextRow {
  id: string;

  claim_id: string;

  claim_reference: string;

  jurisdiction_package_id: string;

  jurisdiction_package_version:
    | number
    | string;

  legal_rule_version_snapshot:
    | number
    | string;

  commercial_quote_id: string;

  commercial_snapshot_hash: string;

  commercial_policy_id: string;

  commercial_policy_version:
    | number
    | string;

  fee_agreement_id: string;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function requireNonEmpty(
  value: string,
  label: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function validateIsoDate(
  value: string,
  label: string,
): IsoDate {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      `${label} must be an ISO calendar date.`,
    );
  }

  return value as IsoDate;
}

function validateIsoInstant(
  value: string,
  label: string,
): IsoInstant {
  const parsed =
    Date.parse(
      value,
    );

  if (
    Number.isNaN(
      parsed,
    )
  ) {
    throw new Error(
      `${label} must be a valid ISO timestamp.`,
    );
  }

  return value as IsoInstant;
}

export function normalizeClaimantEmail(
  email: string,
): string {
  const normalized =
    email
      .trim()
      .toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "A valid claimant email address is required.",
    );
  }

  return normalized;
}

export function normalizeUsPhone(
  phone: string,
): string {
  let digits =
    phone.replace(
      /\D/g,
      "",
    );

  if (
    digits.length ===
      11 &&
    digits.startsWith(
      "1",
    )
  ) {
    digits =
      digits.slice(
        1,
      );
  }

  if (
    digits.length !==
    10
  ) {
    throw new Error(
      "Claimant phone must be a valid U.S. 10-digit number.",
    );
  }

  return digits;
}

function validateShare(
  share:
    number | undefined,
):
  | number
  | undefined {
  if (
    share ===
    undefined
  ) {
    return undefined;
  }

  if (
    !Number.isFinite(
      share,
    ) ||
    share <
      0 ||
    share >
      1
  ) {
    throw new Error(
      "Asserted share must be between 0 and 1.",
    );
  }

  return share;
}

function uniqueKeys(
  values: string[],
): string[] {
  return [
    ...new Set(
      values
        .map(
          (
            value,
          ) =>
            value.trim(),
        )
        .filter(
          Boolean,
        ),
    ),
  ];
}

function rowVersion(
  row:
    ClaimantOnboardingRow,
): number {
  const version =
    Number(
      row.row_version,
    );

  if (
    !Number.isInteger(
      version,
    ) ||
    version <
      1
  ) {
    throw new Error(
      "Claimant onboarding has an invalid database row version.",
    );
  }

  return version;
}

/* ========================================================================== */
/* Ownership and staff authorization                                           */
/* ========================================================================== */

function isSuperAdmin(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
    "super_admin"
  );
}

function validateMutationAuthority(
  actorUserId:
    string,
  staffSession:
    StaffSession | undefined,
): string {
  const actorId =
    requireNonEmpty(
      actorUserId,
      "Actor user ID",
    );

  if (
    staffSession &&
    staffSession.user.id !==
      actorId
  ) {
    throw new Error(
      "The authenticated staff session does not match the claimant-operation actor.",
    );
  }

  return actorId;
}

function staffMayAccessRow(
  session:
    StaffSession,
  row:
    ClaimantOnboardingRow,
): boolean {
  return (
    isSuperAdmin(
      session,
    ) ||
    row.assigned_staff_user_id ===
      session.user.id
  );
}

function actorMayAccessRow(
  row:
    ClaimantOnboardingRow,
  actorUserId:
    string,
  staffSession?:
    StaffSession,
): boolean {
  if (
    staffSession
  ) {
    return staffMayAccessRow(
      staffSession,
      row,
    );
  }

  /*
   * Compatibility path during the Stage 16 application rollout.
   *
   * Existing server callers already supply a staff UUID resolved by the
   * authenticated server session. Without the complete session object there is
   * deliberately NO Super Admin bypass. The caller must be the assigned staff
   * member.
   */
  return (
    row.assigned_staff_user_id ===
    actorUserId
  );
}

function requireActorAccessToRow(
  row:
    ClaimantOnboardingRow,
  actorUserId:
    string,
  staffSession?:
    StaffSession,
): void {
  if (
    actorMayAccessRow(
      row,
      actorUserId,
      staffSession,
    )
  ) {
    return;
  }

  /*
   * Do not reveal that another staff member's claimant exists.
   */
  throw new Error(
    "Claimant onboarding has not been started for this claim.",
  );
}

export function staffCanAccessClaimantOnboarding(
  session:
    StaffSession,
  record:
    PersistedClaimantOnboarding,
): boolean {
  return (
    isSuperAdmin(
      session,
    ) ||
    record.assignedStaffUserId ===
      session.user.id
  );
}

/* ========================================================================== */
/* JSON helpers                                                                */
/* ========================================================================== */

function readArray<T>(
  value:
    unknown,
  label:
    string,
): T[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `${label} contains invalid persisted data.`,
    );
  }

  return value as T[];
}

/* ========================================================================== */
/* Row mapping                                                                 */
/* ========================================================================== */

function onboardingFromRow(
  row:
    ClaimantOnboardingRow,
): PersistedClaimantOnboarding {
  const contactMethods =
    readArray<
      Claimant["contactMethods"][number]
    >(
      row.contact_methods,
      "Claimant contact methods",
    );

  const disclosureAcknowledgements =
    readArray<PersistedDisclosureAcknowledgement>(
      row.disclosure_acknowledgements,
      "Claimant disclosure acknowledgements",
    );

  const fraudFlags =
    readArray<
      Claimant["fraudFlags"][number]
    >(
      row.fraud_flags,
      "Claimant fraud flags",
    );

  const notes =
    readArray<
      Claimant["notes"][number]
    >(
      row.claimant_notes,
      "Claimant notes",
    );

  const claimant:
    Claimant = {
    id:
      row.claimant_id,

    reference:
      row.claimant_reference,

    legalName:
      row.legal_name,

    preferredName:
      row.preferred_name ??
      undefined,

    entityType:
      row.entity_type,

    contactMethods,

    preferredContactChannel:
      row.preferred_contact_channel,

    consentRecordedAt:
      row.consent_recorded_at
        ? (
            row.consent_recorded_at as
              IsoDate
          )
        : undefined,

    consentSource:
      row.consent_source ??
      undefined,

    identityVerification:
      row.identity_verification,

    identityVerifiedAt:
      row.identity_verified_at
        ? (
            row.identity_verified_at as
              IsoDate
          )
        : undefined,

    identityProviderRef:
      row.identity_provider_ref ??
      undefined,

    preferredLanguage:
      row.preferred_language,

    fraudFlags,

    createdAt:
      row.claimant_created_on as
        IsoDate,

    notes,
  };

  const participant:
    ClaimParticipant = {
    id:
      row.participant_id,

    claimantId:
      row.claimant_id,

    role:
      row.participant_role,

    relationship:
      row.relationship,

    assertedShare:
      row.asserted_share ===
      null
        ? undefined
        : Number(
            row.asserted_share,
          ),

    addedAt:
      row.participant_added_on as
        IsoDate,
  };

  let serviceAgreement:
    | PersistedServiceAgreementAcceptance
    | undefined;

  if (
    row.service_agreement_signed_at
  ) {
    if (
      !row.service_agreement_signed_by_claimant_id ||
      !row.service_agreement_required_disclosure_keys_snapshot ||
      !row.service_agreement_recorded_by_user_id ||
      !row.service_agreement_recorded_at
    ) {
      throw new Error(
        "Claimant onboarding contains an incomplete service agreement record.",
      );
    }

    serviceAgreement = {
      signedAt:
        row.service_agreement_signed_at as
          IsoDate,

      signedByClaimantId:
        row.service_agreement_signed_by_claimant_id,

      requiredDisclosureKeysSnapshot:
        row.service_agreement_required_disclosure_keys_snapshot,

      cancellationDeadline:
        row.service_agreement_cancellation_deadline
          ? (
              row.service_agreement_cancellation_deadline as
                IsoDate
            )
          : undefined,

      documentId:
        row.service_agreement_document_id ??
        undefined,

      recordedByUserId:
        row.service_agreement_recorded_by_user_id,

      recordedAt:
        row.service_agreement_recorded_at as
          IsoInstant,
    };
  }

  return {
    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    claimant,

    participant,

    disclosureAcknowledgements,

    freeClaimOptionDisclosedAt:
      row.free_claim_option_disclosed_at
        ? (
            row.free_claim_option_disclosed_at as
              IsoDate
          )
        : undefined,

    serviceAgreement,

    originatingStaffUserId:
      row.originating_staff_user_id,

    assignedStaffUserId:
      row.assigned_staff_user_id,

    createdByUserId:
      row.created_by_user_id,

    createdAt:
      row.created_at as
        IsoInstant,

    updatedAt:
      row.updated_at as
        IsoInstant,
  };
}

function auditFromRow(
  row:
    ClaimantOnboardingAuditRow,
): ClaimantOnboardingAuditEntry {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimantId:
      row.claimant_id,

    action:
      row.action,

    actorUserId:
      row.actor_user_id,

    occurredAt:
      row.occurred_at as
        IsoInstant,

    detail:
      row.detail ??
      undefined,
  };
}

/* ========================================================================== */
/* Database helpers                                                            */
/* ========================================================================== */

async function getOnboardingRow(
  claimId:
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
        "*",
      )
      .eq(
        "claim_id",
        claimId.trim(),
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read claimant onboarding: ${error.message}`,
    );
  }

  return data
    ? (
        data as
          ClaimantOnboardingRow
      )
    : undefined;
}

async function updateOnboardingRow(
  current:
    ClaimantOnboardingRow,
  values:
    Record<
      string,
      unknown
    >,
  occurredAt:
    IsoInstant,
): Promise<
  ClaimantOnboardingRow
> {
  const supabase =
    getSupabaseAdmin();

  const expectedVersion =
    rowVersion(
      current,
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_onboarding",
      )
      .update({
        ...values,

        row_version:
          expectedVersion +
          1,

        updated_at:
          occurredAt,
      })
      .eq(
        "claim_id",
        current.claim_id,
      )
      .eq(
        "row_version",
        expectedVersion,
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to update claimant onboarding: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Claimant onboarding changed while this request was being processed. Reload and try again.",
    );
  }

  return data as
    ClaimantOnboardingRow;
}

async function getConversionContext(
  claimId:
    string,
): Promise<
  ConversionContextRow
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
        "id, claim_id, claim_reference, jurisdiction_package_id, jurisdiction_package_version, legal_rule_version_snapshot, commercial_quote_id, commercial_snapshot_hash, commercial_policy_id, commercial_policy_version, fee_agreement_id",
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
      `Unable to read claim conversion context: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "The claim must be created from a completed opportunity conversion before claimant onboarding can begin.",
    );
  }

  return data as
    ConversionContextRow;
}

/* ========================================================================== */
/* Audit                                                                       */
/* ========================================================================== */

function createAuditId(
  claimId:
    string,
  action:
    ClaimantOnboardingAuditAction,
  occurredAt:
    IsoInstant,
): string {
  return createHash(
    "sha256",
  )
    .update(
      `${claimId}:${action}:${occurredAt}`,
      "utf8",
    )
    .digest(
      "hex",
    )
    .slice(
      0,
      32,
    );
}

async function appendAudit(
  record:
    PersistedClaimantOnboarding,
  action:
    ClaimantOnboardingAuditAction,
  actorUserId:
    string,
  occurredAt:
    IsoInstant,
  detail?:
    string,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } =
    await supabase
      .from(
        "claimant_onboarding_audit",
      )
      .insert({
        id:
          createAuditId(
            record.claimId,
            action,
            occurredAt,
          ),

        claim_id:
          record.claimId,

        claimant_id:
          record.claimant.id,

        action,

        actor_user_id:
          actorUserId,

        occurred_at:
          occurredAt,

        detail:
          detail ??
          null,
      });

  if (
    error
  ) {
    throw new Error(
      `Unable to write claimant onboarding audit: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Unscoped internal / claimant-self reads                                     */
/* ========================================================================== */

/**
 * IMPORTANT
 *
 * These unscoped reads remain available because claimant-self portal services
 * and internal filing/readiness services use claimant Auth binding rather than
 * staff assignment.
 *
 * Staff-facing /pro routes must use the explicitly staff-scoped variants below.
 */

export async function getClaimantOnboarding(
  claimId:
    string,
): Promise<
  PersistedClaimantOnboarding | undefined
> {
  const row =
    await getOnboardingRow(
      claimId,
    );

  return row
    ? onboardingFromRow(
        row,
      )
    : undefined;
}

export async function getClaimantOnboardingByClaimantId(
  claimantId:
    string,
): Promise<
  PersistedClaimantOnboarding | undefined
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
        "*",
      )
      .eq(
        "claimant_id",
        claimantId.trim(),
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read claimant onboarding by claimant id: ${error.message}`,
    );
  }

  return data
    ? onboardingFromRow(
        data as
          ClaimantOnboardingRow,
      )
    : undefined;
}

export async function listClaimantOnboardings(): Promise<
  PersistedClaimantOnboarding[]
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
        "*",
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
      `Unable to list claimant onboardings: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      onboardingFromRow(
        row as
          ClaimantOnboardingRow,
      ),
  );
}

export async function claimantOnboardingAudit(
  claimId?:
    string,
): Promise<
  ClaimantOnboardingAuditEntry[]
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claimant_onboarding_audit",
      )
      .select(
        "*",
      )
      .order(
        "occurred_at",
        {
          ascending:
            false,
        },
      );

  if (
    claimId
  ) {
    query =
      query.eq(
        "claim_id",
        claimId,
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (
    error
  ) {
    throw new Error(
      `Unable to read claimant onboarding audit: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      auditFromRow(
        row as
          ClaimantOnboardingAuditRow,
      ),
  );
}

/* ========================================================================== */
/* Staff-scoped reads                                                          */
/* ========================================================================== */

export async function getClaimantOnboardingForStaff(
  session:
    StaffSession,
  claimId:
    string,
): Promise<
  PersistedClaimantOnboarding | undefined
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claimant_onboarding",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId.trim(),
      );

  if (
    !isSuperAdmin(
      session,
    )
  ) {
    query =
      query.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read staff-scoped claimant onboarding: ${error.message}`,
    );
  }

  return data
    ? onboardingFromRow(
        data as
          ClaimantOnboardingRow,
      )
    : undefined;
}

export async function getClaimantOnboardingByClaimantIdForStaff(
  session:
    StaffSession,
  claimantId:
    string,
): Promise<
  PersistedClaimantOnboarding | undefined
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claimant_onboarding",
      )
      .select(
        "*",
      )
      .eq(
        "claimant_id",
        claimantId.trim(),
      );

  if (
    !isSuperAdmin(
      session,
    )
  ) {
    query =
      query.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read staff-scoped claimant onboarding by claimant id: ${error.message}`,
    );
  }

  return data
    ? onboardingFromRow(
        data as
          ClaimantOnboardingRow,
      )
    : undefined;
}

export async function listClaimantOnboardingsForStaff(
  session:
    StaffSession,
): Promise<
  PersistedClaimantOnboarding[]
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claimant_onboarding",
      )
      .select(
        "*",
      );

  if (
    !isSuperAdmin(
      session,
    )
  ) {
    query =
      query.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const {
    data,
    error,
  } =
    await query
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
      `Unable to list staff-scoped claimant onboardings: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      onboardingFromRow(
        row as
          ClaimantOnboardingRow,
      ),
  );
}

export async function claimantOnboardingAuditForStaff(
  session:
    StaffSession,
  claimId?:
    string,
): Promise<
  ClaimantOnboardingAuditEntry[]
> {
  if (
    isSuperAdmin(
      session,
    )
  ) {
    return claimantOnboardingAudit(
      claimId,
    );
  }

  const supabase =
    getSupabaseAdmin();

  if (
    claimId
  ) {
    const accessible =
      await getClaimantOnboardingForStaff(
        session,
        claimId,
      );

    if (
      !accessible
    ) {
      return [];
    }

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "claimant_onboarding_audit",
        )
        .select(
          "*",
        )
        .eq(
          "claim_id",
          accessible.claimId,
        )
        .order(
          "occurred_at",
          {
            ascending:
              false,
          },
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to read staff-scoped claimant onboarding audit: ${error.message}`,
      );
    }

    return (
      data ??
      []
    ).map(
      (
        row,
      ) =>
        auditFromRow(
          row as
            ClaimantOnboardingAuditRow,
        ),
    );
  }

  const owned =
    await listClaimantOnboardingsForStaff(
      session,
    );

  const claimIds =
    [
      ...new Set(
        owned.map(
          (
            onboarding,
          ) =>
            onboarding.claimId,
        ),
      ),
    ];

  if (
    claimIds.length ===
    0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claimant_onboarding_audit",
      )
      .select(
        "*",
      )
      .in(
        "claim_id",
        claimIds,
      )
      .order(
        "occurred_at",
        {
          ascending:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to read staff-scoped claimant onboarding audit: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      auditFromRow(
        row as
          ClaimantOnboardingAuditRow,
      ),
  );
}

/* ========================================================================== */
/* Derived onboarding state                                                    */
/* ========================================================================== */

export function claimantOnboardingStatus(
  record:
    PersistedClaimantOnboarding,
): ClaimantOnboardingStatus {
  if (
    record
      .claimant
      .identityVerification !==
    "verified"
  ) {
    return "identity_pending";
  }

  if (
    record
      .disclosureAcknowledgements
      .length ===
      0 ||
    !record
      .freeClaimOptionDisclosedAt
  ) {
    return "disclosures_pending";
  }

  if (
    !record
      .serviceAgreement
  ) {
    return "agreement_pending";
  }

  return "complete";
}

/* ========================================================================== */
/* Start onboarding                                                            */
/* ========================================================================== */

export async function startClaimantOnboarding(
  input:
    StartClaimantOnboardingInput,
): Promise<
  PersistedClaimantOnboarding
> {
  const claimId =
    requireNonEmpty(
      input.claimId,
      "Claim ID",
    );

  const claimReference =
    requireNonEmpty(
      input.claimReference,
      "Claim reference",
    );

  const claimantId =
    requireNonEmpty(
      input.claimantId,
      "Claimant ID",
    );

  const claimantReference =
    requireNonEmpty(
      input.claimantReference,
      "Claimant reference",
    );

  const participantId =
    requireNonEmpty(
      input.participantId,
      "Participant ID",
    );

  const legalName =
    requireNonEmpty(
      input.legalName,
      "Claimant legal name",
    );

  const email =
    normalizeClaimantEmail(
      input.email,
    );

  const phone =
    normalizeUsPhone(
      input.phone,
    );

  const businessDate =
    validateIsoDate(
      input.businessDate,
      "Business date",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const actorUserId =
    validateMutationAuthority(
      input.actorUserId,
      input.staffSession,
    );

  const assertedShare =
    validateShare(
      input.assertedShare,
    );

  const existingRow =
    await getOnboardingRow(
      claimId,
    );

  if (
    existingRow
  ) {
    /*
     * Before returning an idempotent existing result, prove that the current
     * actor is entitled to this claimant. This prevents Staff B from learning
     * about or receiving Staff A's claimant simply by submitting matching
     * claimant details.
     */
    requireActorAccessToRow(
      existingRow,
      actorUserId,
      input.staffSession,
    );

    const existing =
      onboardingFromRow(
        existingRow,
      );

    const existingEmail =
      existing
        .claimant
        .contactMethods
        .find(
          (
            method,
          ) =>
            method.kind ===
            "email",
        )
        ?.value;

    const existingPhone =
      existing
        .claimant
        .contactMethods
        .find(
          (
            method,
          ) =>
            method.kind ===
            "mobile",
        )
        ?.value;

    if (
      existing
        .claimant
        .legalName ===
        legalName &&
      existingEmail ===
        email &&
      existingPhone ===
        phone
    ) {
      return existing;
    }

    throw new Error(
      "Claimant onboarding already exists for this claim with different claimant details.",
    );
  }

  const conversion =
    await getConversionContext(
      claimId,
    );

  if (
    conversion
      .claim_reference !==
    claimReference
  ) {
    throw new Error(
      "Claim reference does not match the completed opportunity conversion.",
    );
  }

  const claimant:
    Claimant = {
    id:
      claimantId,

    reference:
      claimantReference,

    legalName,

    preferredName:
      input
        .preferredName
        ?.trim() ||
      undefined,

    entityType:
      input
        .entityType ??
      "individual",

    contactMethods: [
      {
        id:
          `contact-${claimantId}-email`,

        kind:
          "email",

        value:
          email,

        isPrimary:
          true,

        verified:
          false,
      },
      {
        id:
          `contact-${claimantId}-mobile`,

        kind:
          "mobile",

        value:
          phone,

        isPrimary:
          false,

        verified:
          false,
      },
    ],

    preferredContactChannel:
      input
        .preferredContactChannel ??
      "email",

    identityVerification:
      "not_started",

    preferredLanguage:
      input
        .preferredLanguage
        ?.trim() ||
      "en",

    fraudFlags:
      [],

    createdAt:
      businessDate,

    notes:
      [],
  };

  const participant:
    ClaimParticipant = {
    id:
      participantId,

    claimantId,

    role:
      input
        .participantRole ??
      "primary_claimant",

    relationship:
      input
        .relationship ??
      "self_former_owner",

    assertedShare,

    addedAt:
      businessDate,
  };

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
      .insert({
        claim_id:
          claimId,

        claim_reference:
          claimReference,

        conversion_id:
          conversion.id,

        claimant_id:
          claimantId,

        claimant_reference:
          claimantReference,

        claimant_auth_user_id:
          null,

        participant_id:
          participantId,

        legal_name:
          legalName,

        preferred_name:
          claimant
            .preferredName ??
          null,

        date_of_birth:
          null,

        entity_type:
          claimant
            .entityType,

        email,

        mobile_phone:
          phone,

        contact_methods:
          claimant
            .contactMethods,

        mailing_address:
          null,

        preferred_contact_channel:
          claimant
            .preferredContactChannel,

        consent_recorded_at:
          null,

        consent_source:
          null,

        identity_verification:
          "not_started",

        identity_verified_at:
          null,

        identity_provider_ref:
          null,

        preferred_language:
          claimant
            .preferredLanguage,

        accessibility_note:
          null,

        fraud_flags:
          [],

        claimant_created_on:
          businessDate,

        claimant_notes:
          [],

        participant_role:
          participant.role,

        relationship:
          participant
            .relationship,

        asserted_share:
          assertedShare ??
          null,

        determined_share:
          null,

        contesting:
          null,

        participant_added_on:
          businessDate,

        disclosure_acknowledgements:
          [],

        free_claim_option_disclosed_at:
          null,

        jurisdiction_package_id:
          conversion
            .jurisdiction_package_id,

        jurisdiction_package_version:
          Number(
            conversion
              .jurisdiction_package_version,
          ),

        legal_rule_version_snapshot:
          Number(
            conversion
              .legal_rule_version_snapshot,
          ),

        commercial_quote_id:
          conversion
            .commercial_quote_id,

        commercial_snapshot_hash:
          conversion
            .commercial_snapshot_hash,

        commercial_policy_id:
          conversion
            .commercial_policy_id,

        commercial_policy_version:
          Number(
            conversion
              .commercial_policy_version,
          ),

        fee_agreement_id:
          conversion
            .fee_agreement_id,

        fee_agreement_legal_rule_version_snapshot:
          null,

        service_agreement_signed_at:
          null,

        service_agreement_signed_by_claimant_id:
          null,

        service_agreement_required_disclosure_keys_snapshot:
          null,

        service_agreement_cancellation_deadline:
          null,

        service_agreement_document_id:
          null,

        service_agreement_recorded_by_user_id:
          null,

        service_agreement_recorded_at:
          null,

        /*
         * Stage 16 ownership.
         *
         * The authenticated staff actor who starts onboarding is both the
         * permanent business originator and the initial operational manager.
         */
        originating_staff_user_id:
          actorUserId,

        assigned_staff_user_id:
          actorUserId,

        /*
         * Keep technical provenance separate.
         */
        created_by_user_id:
          actorUserId,

        created_at:
          occurredAt,

        updated_at:
          occurredAt,

        row_version:
          1,
      })
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    if (
      error.code ===
      "23505"
    ) {
      throw new Error(
        "Claimant identifier, claimant reference, or participant identifier is already in use.",
      );
    }

    throw new Error(
      `Unable to start claimant onboarding: ${error.message}`,
    );
  }

  const record =
    onboardingFromRow(
      data as
        ClaimantOnboardingRow,
    );

  await appendAudit(
    record,
    "onboarding_started",
    actorUserId,
    occurredAt,
    "Claimant onboarding started with required email and mobile contact details. The originating and assigned DueQuity staff ownership was recorded. Contact consent and identity verification remain separate outstanding controls.",
  );

  return record;
}

/* ========================================================================== */
/* Contact details                                                             */
/* ========================================================================== */

export async function updateClaimantContactDetails(
  input:
    UpdateClaimantContactInput,
): Promise<
  PersistedClaimantOnboarding
> {
  const current =
    await getOnboardingRow(
      input.claimId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Claimant onboarding has not been started for this claim.",
    );
  }

  const actorUserId =
    validateMutationAuthority(
      input.actorUserId,
      input.staffSession,
    );

  requireActorAccessToRow(
    current,
    actorUserId,
    input.staffSession,
  );

  const record =
    onboardingFromRow(
      current,
    );

  const email =
    normalizeClaimantEmail(
      input.email,
    );

  const phone =
    normalizeUsPhone(
      input.phone,
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const contactMethods =
    record
      .claimant
      .contactMethods
      .map(
        (
          method,
        ) => ({
          ...method,
        }),
      );

  const emailMethod =
    contactMethods.find(
      (
        method,
      ) =>
        method.kind ===
        "email",
    );

  const mobileMethod =
    contactMethods.find(
      (
        method,
      ) =>
        method.kind ===
        "mobile",
    );

  if (
    !emailMethod ||
    !mobileMethod
  ) {
    throw new Error(
      "Claimant contact record is missing its required email or mobile method.",
    );
  }

  const emailChanged =
    emailMethod.value !==
    email;

  const phoneChanged =
    mobileMethod.value !==
    phone;

  emailMethod.value =
    email;

  mobileMethod.value =
    phone;

  if (
    emailChanged
  ) {
    emailMethod.verified =
      false;
  }

  if (
    phoneChanged
  ) {
    mobileMethod.verified =
      false;

    mobileMethod.consentGivenAt =
      undefined;
  }

  const updatedRow =
    await updateOnboardingRow(
      current,
      {
        email,

        mobile_phone:
          phone,

        contact_methods:
          contactMethods,
      },
      occurredAt,
    );

  const updated =
    onboardingFromRow(
      updatedRow,
    );

  await appendAudit(
    updated,
    "contact_updated",
    actorUserId,
    occurredAt,
    "Claimant email and mobile contact details were updated. Changed channels require verification again.",
  );

  return updated;
}

/* ========================================================================== */
/* Contact verification                                                       */
/* ========================================================================== */

export async function setClaimantContactVerification(
  input:
    SetClaimantContactVerificationInput,
): Promise<
  PersistedClaimantOnboarding
> {
  const current =
    await getOnboardingRow(
      input.claimId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Claimant onboarding has not been started for this claim.",
    );
  }

  const actorUserId =
    validateMutationAuthority(
      input.actorUserId,
      input.staffSession,
    );

  requireActorAccessToRow(
    current,
    actorUserId,
    input.staffSession,
  );

  const record =
    onboardingFromRow(
      current,
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const contactMethods =
    record
      .claimant
      .contactMethods
      .map(
        (
          method,
        ) => ({
          ...method,
        }),
      );

  const method =
    contactMethods.find(
      (
        candidate,
      ) =>
        candidate.kind ===
        input.kind,
    );

  if (
    !method
  ) {
    throw new Error(
      `Claimant ${input.kind} contact method is not recorded.`,
    );
  }

  method.verified =
    input.verified;

  const updatedRow =
    await updateOnboardingRow(
      current,
      {
        contact_methods:
          contactMethods,
      },
      occurredAt,
    );

  const updated =
    onboardingFromRow(
      updatedRow,
    );

  await appendAudit(
    updated,
    "contact_verified",
    actorUserId,
    occurredAt,
    `${input.kind} contact verification set to ${
      input.verified
        ? "verified"
        : "not verified"
    }.`,
  );

  return updated;
}

/* ========================================================================== */
/* Contact consent                                                            */
/* ========================================================================== */

export async function recordClaimantContactConsent(
  input:
    RecordClaimantContactConsentInput,
): Promise<
  PersistedClaimantOnboarding
> {
  const current =
    await getOnboardingRow(
      input.claimId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Claimant onboarding has not been started for this claim.",
    );
  }

  const actorUserId =
    validateMutationAuthority(
      input.actorUserId,
      input.staffSession,
    );

  requireActorAccessToRow(
    current,
    actorUserId,
    input.staffSession,
  );

  const record =
    onboardingFromRow(
      current,
    );

  const channels =
    [
      ...new Set(
        input.channels,
      ),
    ];

  if (
    channels.length ===
    0
  ) {
    throw new Error(
      "At least one contact channel is required when recording consent.",
    );
  }

  const consentDate =
    validateIsoDate(
      input.consentDate,
      "Consent date",
    );

  const consentSource =
    requireNonEmpty(
      input.consentSource,
      "Consent source",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const contactMethods =
    record
      .claimant
      .contactMethods
      .map(
        (
          method,
        ) => ({
          ...method,
        }),
      );

  for (
    const channel of
    channels
  ) {
    const method =
      contactMethods.find(
        (
          candidate,
        ) =>
          candidate.kind ===
          channel,
      );

    if (
      !method
    ) {
      throw new Error(
        `Claimant ${channel} contact method is not recorded.`,
      );
    }

    method.consentGivenAt =
      consentDate;

    method.optedOutAt =
      undefined;
  }

  const updatedRow =
    await updateOnboardingRow(
      current,
      {
        contact_methods:
          contactMethods,

        consent_recorded_at:
          consentDate,

        consent_source:
          consentSource,
      },
      occurredAt,
    );

  const updated =
    onboardingFromRow(
      updatedRow,
    );

  await appendAudit(
    updated,
    "contact_consent_recorded",
    actorUserId,
    occurredAt,
    `Contact consent recorded for ${channels.join(
      ", ",
    )}. Source: ${consentSource}.`,
  );

  return updated;
}

/* ========================================================================== */
/* Identity verification                                                      */
/* ========================================================================== */

export async function setClaimantIdentityVerification(
  input:
    SetClaimantIdentityVerificationInput,
): Promise<
  PersistedClaimantOnboarding
> {
  const current =
    await getOnboardingRow(
      input.claimId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Claimant onboarding has not been started for this claim.",
    );
  }

  const actorUserId =
    validateMutationAuthority(
      input.actorUserId,
      input.staffSession,
    );

  requireActorAccessToRow(
    current,
    actorUserId,
    input.staffSession,
  );

  const businessDate =
    validateIsoDate(
      input.businessDate,
      "Business date",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const updatedRow =
    await updateOnboardingRow(
      current,
      {
        identity_verification:
          input.status,

        identity_provider_ref:
          input
            .providerRef
            ?.trim() ||
          null,

        identity_verified_at:
          input.status ===
          "verified"
            ? businessDate
            : null,
      },
      occurredAt,
    );

  const updated =
    onboardingFromRow(
      updatedRow,
    );

  await appendAudit(
    updated,
    "identity_status_changed",
    actorUserId,
    occurredAt,
    `Identity verification status changed to ${input.status}.`,
  );

  return updated;
}

/* ========================================================================== */
/* Disclosure acknowledgement                                                 */
/* ========================================================================== */

export async function acknowledgeClaimantDisclosures(
  input:
    AcknowledgeClaimantDisclosuresInput,
): Promise<
  PersistedClaimantOnboarding
> {
  const current =
    await getOnboardingRow(
      input.claimId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Claimant onboarding has not been started for this claim.",
    );
  }

  const actorUserId =
    validateMutationAuthority(
      input.actorUserId,
      input.staffSession,
    );

  requireActorAccessToRow(
    current,
    actorUserId,
    input.staffSession,
  );

  const record =
    onboardingFromRow(
      current,
    );

  const disclosureKeys =
    uniqueKeys(
      input.disclosureKeys,
    );

  if (
    disclosureKeys.length ===
    0
  ) {
    throw new Error(
      "At least one disclosure acknowledgement is required.",
    );
  }

  const acknowledgementDate =
    validateIsoDate(
      input.acknowledgementDate,
      "Acknowledgement date",
    );

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  const acknowledgements =
    record
      .disclosureAcknowledgements
      .map(
        (
          item,
        ) => ({
          ...item,
        }),
      );

  for (
    const key of
    disclosureKeys
  ) {
    const existing =
      acknowledgements.find(
        (
          acknowledgement,
        ) =>
          acknowledgement.key ===
          key,
      );

    if (
      existing
    ) {
      existing.acknowledgedAt =
        acknowledgementDate;

      existing.acknowledgedByUserId =
        actorUserId;
    } else {
      acknowledgements.push({
        key,

        acknowledgedAt:
          acknowledgementDate,

        acknowledgedByUserId:
          actorUserId,
      });
    }
  }

  const updatedRow =
    await updateOnboardingRow(
      current,
      {
        disclosure_acknowledgements:
          acknowledgements,

        free_claim_option_disclosed_at:
          input
            .freeClaimOptionDisclosed
            ? acknowledgementDate
            : current
                .free_claim_option_disclosed_at,
      },
      occurredAt,
    );

  const updated =
    onboardingFromRow(
      updatedRow,
    );

  await appendAudit(
    updated,
    "disclosures_acknowledged",
    actorUserId,
    occurredAt,
    `${disclosureKeys.length} disclosure acknowledgement${
      disclosureKeys.length ===
      1
        ? ""
        : "s"
    } recorded.${
      input
        .freeClaimOptionDisclosed
        ? " Free-claim option disclosure recorded."
        : ""
    }`,
  );

  return updated;
}

/* ========================================================================== */
/* Service agreement                                                          */
/* ========================================================================== */

export async function signClaimantServiceAgreement(
  input:
    SignClaimantServiceAgreementInput,
): Promise<
  PersistedClaimantOnboarding
> {
  const current =
    await getOnboardingRow(
      input.claimId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Claimant onboarding has not been started for this claim.",
    );
  }

  const actorUserId =
    validateMutationAuthority(
      input.actorUserId,
      input.staffSession,
    );

  requireActorAccessToRow(
    current,
    actorUserId,
    input.staffSession,
  );

  const record =
    onboardingFromRow(
      current,
    );

  if (
    record
      .claimant
      .identityVerification !==
    "verified"
  ) {
    throw new Error(
      "Claimant identity must be verified before the service agreement can be signed.",
    );
  }

  const requiredDisclosureKeys =
    uniqueKeys(
      input.requiredDisclosureKeys,
    );

  if (
    requiredDisclosureKeys.length ===
    0
  ) {
    throw new Error(
      "At least one required disclosure is needed before the service agreement can be signed.",
    );
  }

  const acknowledgedKeys =
    new Set(
      record
        .disclosureAcknowledgements
        .map(
          (
            acknowledgement,
          ) =>
            acknowledgement.key,
        ),
    );

  const missingDisclosures =
    requiredDisclosureKeys.filter(
      (
        key,
      ) =>
        !acknowledgedKeys.has(
          key,
        ),
    );

  if (
    missingDisclosures.length >
    0
  ) {
    throw new Error(
      `Required disclosure acknowledgements are missing: ${missingDisclosures.join(
        ", ",
      )}.`,
    );
  }

  if (
    !record
      .freeClaimOptionDisclosedAt
  ) {
    throw new Error(
      "The claimant's free direct-claim option must be disclosed before the service agreement can be signed.",
    );
  }

  const signedAt =
    validateIsoDate(
      input.signedAt,
      "Signed date",
    );

  const cancellationDeadline =
    input
      .cancellationDeadline
      ? validateIsoDate(
          input.cancellationDeadline,
          "Cancellation deadline",
        )
      : undefined;

  const occurredAt =
    validateIsoInstant(
      input.occurredAt,
      "Occurred at",
    );

  if (
    record.serviceAgreement
  ) {
    const existing =
      record.serviceAgreement;

    const sameAgreement =
      existing.signedAt ===
        signedAt &&
      existing.documentId ===
        (
          input
            .documentId
            ?.trim() ||
          undefined
        ) &&
      JSON.stringify(
        [
          ...existing
            .requiredDisclosureKeysSnapshot,
        ].sort(),
      ) ===
        JSON.stringify(
          [
            ...requiredDisclosureKeys,
          ].sort(),
        );

    if (
      sameAgreement
    ) {
      return record;
    }

    throw new Error(
      "A different signed service agreement is already recorded for this claimant onboarding.",
    );
  }

  const legalRuleVersion =
    Number(
      current
        .legal_rule_version_snapshot,
    );

  if (
    !Number.isInteger(
      legalRuleVersion,
    ) ||
    legalRuleVersion <
      1
  ) {
    throw new Error(
      "Claimant onboarding is missing its jurisdiction legal-rule version.",
    );
  }

  const updatedRow =
    await updateOnboardingRow(
      current,
      {
        fee_agreement_legal_rule_version_snapshot:
          legalRuleVersion,

        service_agreement_signed_at:
          signedAt,

        service_agreement_signed_by_claimant_id:
          record.claimant.id,

        service_agreement_required_disclosure_keys_snapshot:
          requiredDisclosureKeys,

        service_agreement_cancellation_deadline:
          cancellationDeadline ??
          null,

        service_agreement_document_id:
          input
            .documentId
            ?.trim() ||
          null,

        service_agreement_recorded_by_user_id:
          actorUserId,

        service_agreement_recorded_at:
          occurredAt,
      },
      occurredAt,
    );

  const updated =
    onboardingFromRow(
      updatedRow,
    );

  await appendAudit(
    updated,
    "service_agreement_signed",
    actorUserId,
    occurredAt,
    "Signed service agreement recorded after identity verification and required disclosure acknowledgement checks passed.",
  );

  return updated;
}