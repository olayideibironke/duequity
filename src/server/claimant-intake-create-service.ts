import "server-only";

import type {
  IsoDate,
  IsoInstant,
  Opportunity,
  PriorOwner,
} from "@/domain/types";

import {
  can,
  clearedForState,
  type StaffSession,
} from "@/lib/session";

import {
  getClaimantOnboardingForStaff,
  normalizeClaimantEmail,
  normalizeUsPhone,
  recordClaimantContactConsent,
  startClaimantOnboarding,
  type PersistedClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import {
  resolvePersistedClaimFilingReadiness,
} from "@/server/claim-filing-readiness";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  listJurisdictionRulePackages,
} from "@/server/jurisdiction-intelligence";

import {
  getOpportunityById,
} from "@/server/opportunity-store";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * CLAIMANT INTAKE CREATION SERVICE
 *
 * Controlled staff-side transition:
 *
 *   converted Claim
 *        ↓
 *   claimant confirms identity/property connection by phone
 *        ↓
 *   staff records confirmed legal name/email/mobile
 *        ↓
 *   claimant_onboarding created
 *        ↓
 *   property connection confirmation persisted
 *        ↓
 *   email communication consent persisted
 *        ↓
 *   claimant becomes eligible for controlled activation
 *
 * This service does NOT:
 *
 * - create or modify jurisdiction rules;
 * - create an Opportunity;
 * - bypass Opportunity conversion;
 * - invent commercial terms;
 * - infer estate/heir authority;
 * - activate the claimant account;
 * - send the activation invitation.
 *
 * Activation remains a separate controlled action.
 */

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export interface CreateClaimantFromConfirmedCallInput {
  session:
    StaffSession;

  claimId:
    string;

  legalFirstName:
    string;

  legalLastName:
    string;

  email:
    string;

  mobilePhone:
    string;

  propertyConnectionConfirmed:
    boolean;

  activationEmailConsentConfirmed:
    boolean;
}

export interface CreateClaimantFromConfirmedCallResult {
  onboarding:
    PersistedClaimantOnboarding;

  claimantId:
    string;

  claimantReference:
    string;

  claimId:
    string;

  claimReference:
    string;

  legalFirstName:
    string;

  legalLastName:
    string;

  email:
    string;

  mobilePhone:
    string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function requiredText(
  value:
    string,
  label:
    string,
): string {
  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        " ",
      );

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function currentIsoDate():
  IsoDate {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    ) as IsoDate;
}

function currentIsoInstant():
  IsoInstant {
  return new Date()
    .toISOString() as
      IsoInstant;
}

function claimSuffix(
  claimId:
    string,
): string {
  return claimId.replace(
    /^claim-/,
    "",
  );
}

function claimantIdForClaim(
  claimId:
    string,
): string {
  return `claimant-${claimSuffix(
    claimId,
  )}`;
}

function claimantReferenceForClaim(
  claimReference:
    string,
): string {
  const suffix =
    claimReference.replace(
      /^DQ-/,
      "",
    );

  return `DQC-${suffix}`;
}

function participantIdForClaim(
  claimId:
    string,
): string {
  return `participant-${claimSuffix(
    claimId,
  )}`;
}

function normalizedNameTokens(
  value:
    string,
): string[] {
  return value
    .normalize(
      "NFKD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .trim()
    .split(
      /\s+/,
    )
    .filter(
      Boolean,
    );
}

function confirmedNameMatchesSource({
  firstName,
  lastName,
  sourceName,
}: {
  firstName:
    string;

  lastName:
    string;

  sourceName:
    string;
}): boolean {
  const sourceTokens =
    new Set(
      normalizedNameTokens(
        sourceName,
      ),
    );

  const requiredTokens = [
    ...normalizedNameTokens(
      firstName,
    ),

    ...normalizedNameTokens(
      lastName,
    ),
  ];

  return (
    requiredTokens.length >
      0 &&
    requiredTokens.every(
      (
        token,
      ) =>
        sourceTokens.has(
          token,
        ),
    )
  );
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function requireCreateAuthority(
  session:
    StaffSession,
): void {
  const requiredPermissions = [
    "claim.read",
    "claim.write",
    "claimant.read",
    "claimant.write",
  ] as const;

  const missing =
    requiredPermissions.filter(
      (
        permission,
      ) =>
        !can(
          session,
          permission,
        ),
    );

  if (
    missing.length >
    0
  ) {
    throw new Error(
      "Your DueQuity role is not authorized to create claimant onboarding records.",
    );
  }
}

/* ========================================================================== */
/* Source owner                                                                */
/* ========================================================================== */

function eligibleSourceOwner(
  opportunity:
    Opportunity,
): PriorOwner {
  const candidates =
    opportunity
      .priorOwners
      .filter(
        (
          owner,
        ) =>
          owner.ownerKind ===
            "individual" &&
          !owner.deceased,
      );

  if (
    candidates.length !==
    1
  ) {
    throw new Error(
      "Claimant creation requires review because the recovery does not contain exactly one living individual former owner.",
    );
  }

  const owner =
    candidates[0];

  if (
    owner.ownershipShare !==
      undefined &&
    owner.ownershipShare !==
      1
  ) {
    throw new Error(
      "Claimant creation requires review because the source owner does not have a recorded 100% ownership share.",
    );
  }

  return owner;
}

/* ========================================================================== */
/* Property confirmation persistence                                           */
/* ========================================================================== */

interface IntakeConfirmationRow {
  row_version:
    | number
    | string;

  assigned_staff_user_id:
    string;

  property_connection_confirmed_at:
    | string
    | null;

  property_connection_confirmed_by_user_id:
    | string
    | null;

  property_connection_confirmation_source:
    | string
    | null;
}

async function persistPropertyConnectionConfirmation({
  session,
  claimId,
  occurredAt,
}: {
  session:
    StaffSession;

  claimId:
    string;

  occurredAt:
    IsoInstant;
}): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .select(
        [
          "row_version",
          "assigned_staff_user_id",
          "property_connection_confirmed_at",
          "property_connection_confirmed_by_user_id",
          "property_connection_confirmation_source",
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
    error ||
    !data
  ) {
    throw new Error(
      "The newly created claimant onboarding record could not be resolved for property confirmation.",
    );
  }

  const row =
    data as unknown as
      IntakeConfirmationRow;

  if (
    session.user.role !==
      "super_admin" &&
    row.assigned_staff_user_id !==
      session.user.id
  ) {
    throw new Error(
      "This claimant is not assigned to your DueQuity staff account.",
    );
  }

  /*
   * Confirmation is immutable in ordinary intake operation.
   *
   * If another successful attempt already recorded it, preserve the first
   * persisted confirmation rather than rewriting its actor or timestamp.
   */
  if (
    row
      .property_connection_confirmed_at
  ) {
    return;
  }

  const rowVersion =
    Number(
      row.row_version,
    );

  if (
    !Number.isInteger(
      rowVersion,
    ) ||
    rowVersion <
      1
  ) {
    throw new Error(
      "Claimant onboarding has an invalid row version.",
    );
  }

  const {
    data:
      updated,
    error:
      updateError,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .update({
        property_connection_confirmed_at:
          occurredAt,

        property_connection_confirmed_by_user_id:
          session.user.id,

        property_connection_confirmation_source:
          "phone_call",

        row_version:
          rowVersion +
          1,

        updated_at:
          occurredAt,
      })
      .eq(
        "claim_id",
        claimId,
      )
      .eq(
        "row_version",
        rowVersion,
      )
      .select(
        "claim_id",
      )
      .maybeSingle();

  if (
    updateError
  ) {
    throw new Error(
      `Unable to record claimant property confirmation: ${updateError.message}`,
    );
  }

  if (
    !updated
  ) {
    throw new Error(
      "Claimant onboarding changed while property confirmation was being recorded. Reload and try again.",
    );
  }
}

/* ========================================================================== */
/* Consent helper                                                              */
/* ========================================================================== */

async function ensureActivationEmailConsent({
  session,
  claimId,
  businessDate,
  occurredAt,
}: {
  session:
    StaffSession;

  claimId:
    string;

  businessDate:
    IsoDate;

  occurredAt:
    IsoInstant;
}): Promise<
  PersistedClaimantOnboarding
> {
  const current =
    await getClaimantOnboardingForStaff(
      session,
      claimId,
    );

  if (!current) {
    throw new Error(
      "The claimant onboarding record is not accessible to this staff account.",
    );
  }

  const emailMethod =
    current
      .claimant
      .contactMethods
      .find(
        (
          method,
        ) =>
          method.kind ===
          "email",
      );

  if (
    current
      .claimant
      .consentRecordedAt &&
    current
      .claimant
      .consentSource &&
    emailMethod
      ?.consentGivenAt
  ) {
    return current;
  }

  return recordClaimantContactConsent({
    claimId,

    channels: [
      "email",
    ],

    consentDate:
      businessDate,

    consentSource:
      "Telephone call",

    actorUserId:
      session.user.id,

    staffSession:
      session,

    occurredAt,
  });
}

/* ========================================================================== */
/* Operational gate                                                           */
/* ========================================================================== */

async function resolveCreationContext({
  session,
  claimId,
  businessDate,
}: {
  session:
    StaffSession;

  claimId:
    string;

  businessDate:
    IsoDate;
}) {
  const resolved =
    await resolveClaimRecord(
      claimId,
    );

  if (!resolved) {
    throw new Error(
      "Claim not found.",
    );
  }

  const claim =
    resolved.claim;

  const [
    opportunity,
    jurisdictionPackages,
  ] =
    await Promise.all([
      getOpportunityById(
        claim.opportunityId,
      ),

      listJurisdictionRulePackages(),
    ]);

  if (!opportunity) {
    throw new Error(
      "The source Opportunity could not be resolved.",
    );
  }

  if (
    opportunity.id !==
      claim.opportunityId ||
    opportunity.propertyId !==
      claim.propertyId ||
    opportunity.jurisdictionId !==
      claim.jurisdictionId
  ) {
    throw new Error(
      "The Claim does not match its persisted source Opportunity.",
    );
  }

  const rulePackage =
    jurisdictionPackages
      .filter(
        (
          candidate,
        ) =>
          candidate.status ===
            "approved" &&
          candidate.rule?.id ===
            claim.jurisdictionId,
      )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          right.version -
          left.version,
      )[0];

  const jurisdiction =
    rulePackage?.rule;

  if (
    !rulePackage ||
    !jurisdiction
  ) {
    throw new Error(
      "No current approved jurisdiction rule is available for this Claim.",
    );
  }

  if (
    !clearedForState(
      session,
      rulePackage.stateCode,
    )
  ) {
    throw new Error(
      `You are not cleared to work on claimant intake in ${rulePackage.stateCode}.`,
    );
  }

  if (
    rulePackage
      .intakeAuthorized ===
    false
  ) {
    throw new Error(
      "Claimant intake is not authorized by the current approved jurisdiction package.",
    );
  }

  const readiness =
    await resolvePersistedClaimFilingReadiness(
      claim,
      jurisdiction,
      businessDate,
    );

  if (
    !readiness
      .jurisdictionClear
  ) {
    throw new Error(
      `Claimant creation is blocked by the current jurisdiction rule. ${readiness.nextInternalAction}`,
    );
  }

  if (
    !readiness
      .startupGreenLaneClear
  ) {
    throw new Error(
      `Claimant creation is blocked because this Claim is outside DueQuity's current operational lane. ${readiness.nextInternalAction}`,
    );
  }

  if (
    !readiness
      .legalClear
  ) {
    throw new Error(
      `Claimant creation is blocked because this Claim is not cleared for straightforward administrative handling. ${readiness.nextInternalAction}`,
    );
  }

  if (
    !readiness
      .deadlineClear
  ) {
    throw new Error(
      "Claimant creation is blocked because the recorded filing deadline has expired.",
    );
  }

  const sourceOwner =
    eligibleSourceOwner(
      opportunity,
    );

  return {
    claim,

    opportunity,

    sourceOwner,
  };
}

/* ========================================================================== */
/* Create claimant                                                             */
/* ========================================================================== */

export async function createClaimantFromConfirmedCall(
  input:
    CreateClaimantFromConfirmedCallInput,
): Promise<
  CreateClaimantFromConfirmedCallResult
> {
  requireCreateAuthority(
    input.session,
  );

  if (
    input
      .propertyConnectionConfirmed !==
    true
  ) {
    throw new Error(
      "Confirm the claimant's connection to the displayed foreclosed property before creating the claimant record.",
    );
  }

  if (
    input
      .activationEmailConsentConfirmed !==
    true
  ) {
    throw new Error(
      "The claimant must give permission for DueQuity to send secure activation materials before this workflow may continue.",
    );
  }

  const claimId =
    requiredText(
      input.claimId,
      "Claim ID",
    );

  const legalFirstName =
    requiredText(
      input.legalFirstName,
      "Legal first name",
    );

  const legalLastName =
    requiredText(
      input.legalLastName,
      "Legal last name",
    );

  const legalName =
    `${legalFirstName} ${legalLastName}`;

  const email =
    normalizeClaimantEmail(
      input.email,
    );

  const mobilePhone =
    normalizeUsPhone(
      input.mobilePhone,
    );

  const businessDate =
    currentIsoDate();

  const occurredAt =
    currentIsoInstant();

  const {
    claim,
    sourceOwner,
  } =
    await resolveCreationContext({
      session:
        input.session,

      claimId,

      businessDate,
    });

  if (
    !confirmedNameMatchesSource({
      firstName:
        legalFirstName,

      lastName:
        legalLastName,

      sourceName:
        sourceOwner
          .nameOnRecord,
    })
  ) {
    throw new Error(
      "The confirmed claimant name does not sufficiently match the former-owner name on the source recovery record. Stop intake and escalate the identity mismatch for review.",
    );
  }

  /*
   * This remains intentionally self-former-owner only.
   *
   * Deceased owners, heirs, trusts, businesses, competing claimants and
   * authority questions must not enter this ordinary intake path.
   */
  let onboarding =
    await startClaimantOnboarding({
      claimId:
        claim.id,

      claimReference:
        claim.reference,

      claimantId:
        claimantIdForClaim(
          claim.id,
        ),

      claimantReference:
        claimantReferenceForClaim(
          claim.reference,
        ),

      participantId:
        participantIdForClaim(
          claim.id,
        ),

      legalName,

      email,

      phone:
        mobilePhone,

      entityType:
        "individual",

      relationship:
        "self_former_owner",

      participantRole:
        "primary_claimant",

      assertedShare:
        sourceOwner
          .ownershipShare ??
        1,

      preferredContactChannel:
        "email",

      preferredLanguage:
        "en",

      actorUserId:
        input.session.user.id,

      staffSession:
        input.session,

      businessDate,

      occurredAt,
    });

  await persistPropertyConnectionConfirmation({
    session:
      input.session,

    claimId:
      claim.id,

    occurredAt,
  });

  onboarding =
    await ensureActivationEmailConsent({
      session:
        input.session,

      claimId:
        claim.id,

      businessDate,

      occurredAt:
        currentIsoInstant(),
    });

  return {
    onboarding,

    claimantId:
      onboarding.claimant.id,

    claimantReference:
      onboarding.claimant.reference,

    claimId:
      onboarding.claimId,

    claimReference:
      onboarding.claimReference,

    legalFirstName,

    legalLastName,

    email,

    mobilePhone,
  };
}

/* ========================================================================== */
/* Activation prerequisites                                                    */
/* ========================================================================== */

interface ActivationPrerequisiteRow {
  claimant_id:
    string;

  assigned_staff_user_id:
    string;

  consent_recorded_at:
    | string
    | null;

  consent_source:
    | string
    | null;

  contact_methods:
    unknown;

  property_connection_confirmed_at:
    | string
    | null;

  property_connection_confirmed_by_user_id:
    | string
    | null;

  property_connection_confirmation_source:
    | string
    | null;
}

export async function assertClaimantActivationPrerequisites({
  session,
  claimantId,
}: {
  session:
    StaffSession;

  claimantId:
    string;
}): Promise<void> {
  requireCreateAuthority(
    session,
  );

  const normalizedClaimantId =
    requiredText(
      claimantId,
      "Claimant ID",
    );

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .select(
        [
          "claimant_id",
          "assigned_staff_user_id",
          "consent_recorded_at",
          "consent_source",
          "contact_methods",
          "property_connection_confirmed_at",
          "property_connection_confirmed_by_user_id",
          "property_connection_confirmation_source",
        ].join(
          ", ",
        ),
      )
      .eq(
        "claimant_id",
        normalizedClaimantId,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    throw new Error(
      "The selected claimant onboarding record could not be resolved.",
    );
  }

  const row =
    data as unknown as
      ActivationPrerequisiteRow;

  if (
    session.user.role !==
      "super_admin" &&
    row.assigned_staff_user_id !==
      session.user.id
  ) {
    throw new Error(
      "This claimant is not assigned to your DueQuity staff account.",
    );
  }

  if (
    !row
      .property_connection_confirmed_at ||
    !row
      .property_connection_confirmed_by_user_id ||
    !row
      .property_connection_confirmation_source
  ) {
    throw new Error(
      "Claimant activation is blocked until the claimant's connection to the source property has been confirmed and recorded.",
    );
  }

  if (
    !row.consent_recorded_at ||
    !row.consent_source
  ) {
    throw new Error(
      "Claimant activation is blocked until email communication consent has been recorded.",
    );
  }

  const contactMethods =
    Array.isArray(
      row.contact_methods,
    )
      ? row.contact_methods
      : [];

  const emailMethod =
    contactMethods.find(
      (
        value,
      ) => {
        if (
          !value ||
          typeof value !==
            "object"
        ) {
          return false;
        }

        const method =
          value as {
            kind?:
              unknown;

            consentGivenAt?:
              unknown;
          };

        return (
          method.kind ===
            "email" &&
          typeof method
            .consentGivenAt ===
            "string" &&
          method
            .consentGivenAt
            .trim()
            .length >
            0
        );
      },
    );

  if (!emailMethod) {
    throw new Error(
      "Claimant activation is blocked because consent to use the claimant's email for DueQuity activation materials has not been recorded.",
    );
  }
}