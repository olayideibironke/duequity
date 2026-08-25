import { NextRequest, NextResponse } from "next/server";

import { requiredDisclosures } from "@/domain/compliance";

import type {
  ConsentChannel,
  FeeAgreement,
  IdentityVerificationStatus,
  IsoDate,
  Opportunity,
  Permission,
  PriorOwner,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
  type StaffSession,
} from "@/lib/session";

import {
  acknowledgeClaimantDisclosures,
  claimantOnboardingStatus,
  getClaimantOnboarding,
  getClaimantOnboardingForStaff,
  recordClaimantContactConsent,
  setClaimantContactVerification,
  setClaimantIdentityVerification,
  signClaimantServiceAgreement,
  staffCanAccessClaimantOnboarding,
  startClaimantOnboarding,
  updateClaimantContactDetails,
} from "@/server/claimant-onboarding-store";

import { listClaimDocuments } from "@/server/claim-document-store";

import {
  resolvePersistedClaimFilingReadiness,
  type PersistedClaimFilingReadiness,
} from "@/server/claim-filing-readiness";

import { resolveClaimRecord } from "@/server/claim-record";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { getOpportunityById } from "@/server/opportunity-store";

import { resolveStaffSession } from "@/server/staff-session";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/**
 * CLAIMANT ONBOARDING API
 *
 * Orchestration for Claims created through the persisted opportunity-conversion
 * workflow.
 *
 * GET returns:
 *
 *   - persisted onboarding state
 *   - server-derived candidate former owner
 *   - disclosures required by the current approved jurisdiction rule
 *   - current operational onboarding gates
 *
 * POST supports separately controlled onboarding actions:
 *
 *   start
 *   update_contact
 *   verify_contact
 *   record_contact_consent
 *   set_identity
 *   acknowledge_disclosures
 *   sign_agreement
 *
 * SERVER AUTHORITY
 *
 * The browser does not decide:
 *
 *   - claimant ID
 *   - claimant reference
 *   - participant ID
 *   - claimant legal name
 *   - source ownership
 *   - required disclosures
 *   - cancellation period
 *   - jurisdiction
 *   - claim linkage
 *   - staff actor
 *   - claimant staff assignment
 *   - claimant business originator
 *   - jurisdiction legal-rule version
 *   - payment route
 *   - Startup Green Lane status
 *   - legal lane
 *   - filing deadline
 *
 * Those values are derived from persisted server records.
 *
 * AUTHORIZATION
 *
 * Reading onboarding requires:
 *
 *   claim.read
 *   claimant.read
 *
 * Ordinary claimant-data mutations require:
 *
 *   claim.write
 *   claimant.write
 *
 * Disclosure and agreement actions require:
 *
 *   claim.write
 *   fee_agreement.write
 *
 * State clearance is enforced separately from permissions.
 *
 * STAFF OWNERSHIP
 *
 * Once claimant onboarding exists:
 *
 *   - Super Admin may access every claimant.
 *   - Ordinary staff may access only claimant records currently assigned to
 *     their persisted public.staff_users UUID.
 *
 * The ownership rule is server enforced. A direct URL, handcrafted request or
 * browser manipulation cannot bypass it.
 *
 * Claimants owned by another staff member are treated as unavailable rather
 * than disclosing that the claimant exists.
 *
 * Starting onboarding establishes:
 *
 *   originating_staff_user_id = authenticated staff actor
 *   assigned_staff_user_id    = authenticated staff actor
 *
 * OPERATIONAL GATE
 *
 * A Claim may be read even when its workflow later becomes blocked, but no
 * onboarding mutation may advance while:
 *
 *   - the current jurisdiction is not cleared;
 *   - the current payment route is outside Duequity's Startup Green Lane;
 *   - the Claim's current legal position is not administrative; or
 *   - the filing deadline has expired.
 *
 * AGREEMENT GATE
 *
 * Signing the service agreement additionally requires:
 *
 *   - verified claimant identity;
 *   - every currently required disclosure acknowledgement;
 *   - the free direct-claim option disclosure;
 *   - an accepted persisted fee-agreement document;
 *   - a fee-agreement legal-rule version matching the current approved rule.
 */

/* ========================================================================== */
/* Request shapes                                                              */
/* ========================================================================== */

type OnboardingAction =
  | "start"
  | "update_contact"
  | "verify_contact"
  | "record_contact_consent"
  | "set_identity"
  | "acknowledge_disclosures"
  | "sign_agreement";

interface OnboardingRequestBody {
  action?: OnboardingAction;

  email?: string;

  phone?: string;

  preferredName?: string;

  preferredLanguage?: string;

  preferredContactChannel?: ConsentChannel;

  contactKind?: "email" | "mobile";

  verified?: boolean;

  consentChannels?: ("email" | "mobile")[];

  consentSource?: string;

  identityStatus?: IdentityVerificationStatus;

  identityProviderRef?: string;

  disclosureKeys?: string[];

  freeClaimOptionDisclosed?: boolean;

  agreementDocumentId?: string;
}

/* ========================================================================== */
/* Validation constants                                                        */
/* ========================================================================== */

const IDENTITY_STATUSES: IdentityVerificationStatus[] = [
  "not_started",
  "documents_requested",
  "under_review",
  "verified",
  "failed",
  "manual_review",
];

const PREFERRED_CONTACT_CHANNELS: ConsentChannel[] = [
  "email",
  "phone_call",
  "sms",
  "mail",
];

/* ========================================================================== */
/* Route error                                                                 */
/* ========================================================================== */

class OnboardingRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);

    this.name = "OnboardingRouteError";

    this.status = status;
  }
}

/* ========================================================================== */
/* Responses                                                                   */
/* ========================================================================== */

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,

      error: message,
    },
    {
      status,
    },
  );
}

function routeErrorResponse(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 409,
) {
  if (error instanceof OnboardingRouteError) {
    return errorResponse(error.message, error.status);
  }

  return errorResponse(
    error instanceof Error ? error.message : fallbackMessage,
    fallbackStatus,
  );
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function requiredString(value: string | undefined, label: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new OnboardingRouteError(`${label} is required.`, 400);
  }

  return normalized;
}

function optionalTrimmedString(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized || undefined;
}

function normalizeEmail(value: string | undefined): string {
  const email = requiredString(value, "Claimant email").toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OnboardingRouteError("Claimant email is invalid.", 400);
  }

  return email;
}

function normalizeUsPhone(value: string | undefined): string {
  const raw = requiredString(value, "Claimant phone");

  const digits = raw.replace(/\D/g, "");

  const normalized =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (normalized.length !== 10) {
    throw new OnboardingRouteError(
      "Claimant phone must contain a valid 10-digit U.S. number.",
      400,
    );
  }

  return `(${normalized.slice(0, 3)}) ${normalized.slice(
    3,
    6,
  )}-${normalized.slice(6)}`;
}

function claimSuffix(claimId: string): string {
  return claimId.replace(/^claim-/, "");
}

function claimantIdForClaim(claimId: string): string {
  return `claimant-${claimSuffix(claimId)}`;
}

function claimantReferenceForClaim(claimReference: string): string {
  const suffix = claimReference.replace(/^DQ-/, "");

  return `DQC-${suffix}`;
}

function participantIdForClaim(claimId: string): string {
  return `participant-${claimSuffix(claimId)}`;
}

function addDays(date: string, days: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number);

  const value = new Date(Date.UTC(year, month - 1, day));

  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10) as IsoDate;
}

/* ========================================================================== */
/* Permissions                                                                 */
/* ========================================================================== */

function requirePermission(
  session: StaffSession,
  permission: Permission,
  message: string,
): void {
  if (!can(session, permission)) {
    throw new OnboardingRouteError(message, 403);
  }
}

function requireReadPermissions(session: StaffSession): void {
  requirePermission(
    session,
    "claim.read",
    "You do not have permission to read this Claim.",
  );

  requirePermission(
    session,
    "claimant.read",
    "You do not have permission to read claimant onboarding information.",
  );
}

function requireMutationPermissions(
  session: StaffSession,
  action: OnboardingAction,
): void {
  requireReadPermissions(session);

  requirePermission(
    session,
    "claim.write",
    "You do not have permission to change this Claim.",
  );

  switch (action) {
    case "start":
    case "update_contact":
    case "verify_contact":
    case "record_contact_consent":
    case "set_identity":
      requirePermission(
        session,
        "claimant.write",
        "You do not have permission to change claimant onboarding information.",
      );

      return;

    case "acknowledge_disclosures":
    case "sign_agreement":
      requirePermission(
        session,
        "fee_agreement.write",
        "You do not have permission to record disclosures or service-agreement actions.",
      );

      return;
  }
}

/* ========================================================================== */
/* Candidate owner                                                             */
/* ========================================================================== */

/**
 * Claimant onboarding must not silently guess entitlement where ownership is
 * ambiguous.
 *
 * Auto-seeding is permitted only where the persisted opportunity contains
 * exactly one living individual former owner and that owner's recorded share
 * is either 100% or unspecified.
 */
function candidateOwnerForOpportunity(opportunity: Opportunity): PriorOwner {
  const candidates = opportunity.priorOwners.filter(
    (owner) => owner.ownerKind === "individual" && !owner.deceased,
  );

  if (candidates.length !== 1) {
    throw new OnboardingRouteError(
      "Claimant onboarding cannot be auto-seeded because the opportunity does not contain exactly one living individual former owner.",
      409,
    );
  }

  const candidate = candidates[0];

  if (
    candidate.ownershipShare !== undefined &&
    candidate.ownershipShare !== 1
  ) {
    throw new OnboardingRouteError(
      "Claimant onboarding cannot be auto-seeded because the located former owner does not hold a recorded 100% ownership share.",
      409,
    );
  }

  return candidate;
}

/* ========================================================================== */
/* Operational gate                                                           */
/* ========================================================================== */

function assertOnboardingMayAdvance(
  readiness: PersistedClaimFilingReadiness,
): void {
  if (!readiness.jurisdictionClear) {
    throw new OnboardingRouteError(
      `Claimant onboarding is blocked by the current jurisdiction rule. ${readiness.nextInternalAction}`,
      409,
    );
  }

  if (!readiness.startupGreenLaneClear) {
    throw new OnboardingRouteError(
      `Claimant onboarding is blocked because this Claim is outside Duequity's Startup Green Lane. ${readiness.nextInternalAction}`,
      409,
    );
  }

  if (!readiness.legalClear) {
    throw new OnboardingRouteError(
      `Claimant onboarding is blocked because the Claim is not currently cleared for straightforward administrative handling. ${readiness.nextInternalAction}`,
      409,
    );
  }

  if (!readiness.deadlineClear) {
    throw new OnboardingRouteError(
      "Claimant onboarding is blocked because the recorded filing deadline has expired.",
      409,
    );
  }
}

/* ========================================================================== */
/* Staff ownership                                                            */
/* ========================================================================== */

/**
 * Protect an already-created claimant before any staff-facing claimant data is
 * returned or mutated.
 *
 * We intentionally inspect the persisted record server-side so we can
 * distinguish:
 *
 *   no claimant exists yet
 *   versus
 *   a claimant exists but belongs to another staff member
 *
 * In the second case we return a generic 404 and disclose no claimant details.
 */
async function assertExistingClaimantOwnership(
  claimId: string,
  session: StaffSession,
) {
  const existing = await getClaimantOnboarding(claimId);

  if (!existing) {
    return undefined;
  }

  if (!staffCanAccessClaimantOnboarding(session, existing)) {
    throw new OnboardingRouteError("Claimant onboarding was not found.", 404);
  }

  return existing;
}

/* ========================================================================== */
/* Context                                                                     */
/* ========================================================================== */

async function resolveOnboardingContext(
  claimId: string,
  session: StaffSession,
) {
  const resolved = await resolveClaimRecord(claimId);

  if (!resolved) {
    throw new OnboardingRouteError("Claim not found.", 404);
  }

  const claim = resolved.claim;

  /*
   * Ownership is enforced before claimant-specific onboarding information is
   * returned. If onboarding has not started, the current authorized staff actor
   * may continue through the normal start flow.
   */
  const existingOnboarding = await assertExistingClaimantOwnership(
    claim.id,
    session,
  );

  const [opportunity, jurisdictionPackages] = await Promise.all([
    getOpportunityById(claim.opportunityId),

    listJurisdictionRulePackages(),
  ]);

  if (!opportunity) {
    throw new OnboardingRouteError(
      "The source opportunity could not be resolved.",
      409,
    );
  }

  if (
    opportunity.id !== claim.opportunityId ||
    opportunity.jurisdictionId !== claim.jurisdictionId ||
    opportunity.propertyId !== claim.propertyId
  ) {
    throw new OnboardingRouteError(
      "The Claim does not match its persisted source opportunity.",
      409,
    );
  }

  const jurisdictionPackage = jurisdictionPackages
    .filter(
      (rulePackage) =>
        rulePackage.status === "approved" &&
        rulePackage.rule?.id === claim.jurisdictionId,
    )
    .slice()
    .sort((left, right) => right.version - left.version)[0];

  const jurisdiction = jurisdictionPackage?.rule;

  if (!jurisdictionPackage || !jurisdiction) {
    throw new OnboardingRouteError(
      "No current approved jurisdiction rule is published for this Claim.",
      409,
    );
  }

  if (!clearedForState(session, jurisdictionPackage.stateCode)) {
    throw new OnboardingRouteError(
      `You are not cleared to work on Claims in ${jurisdictionPackage.stateCode}.`,
      403,
    );
  }

  const candidateOwner = candidateOwnerForOpportunity(opportunity);

  const disclosures = requiredDisclosures(jurisdiction);

  const businessDate = currentIsoDate();

  const readiness = await resolvePersistedClaimFilingReadiness(
    claim,
    jurisdiction,
    businessDate,
  );

  return {
    claim,

    opportunity,

    jurisdictionPackage,

    jurisdiction,

    candidateOwner,

    disclosures,

    readiness,

    existingOnboarding,

    actorUserId: session.user.id,

    businessDate,
  };
}

function serializeDisclosure(
  disclosure: ReturnType<typeof requiredDisclosures>[number],
) {
  return {
    key: disclosure.key,

    text: disclosure.text,

    requiresAcknowledgement: disclosure.requiresAcknowledgement,
  };
}

/* ========================================================================== */
/* Agreement prerequisites                                                     */
/* ========================================================================== */

async function assertAgreementMayBeSigned({
  claimId,
  session,
  feeAgreement,
  jurisdictionLegalRuleVersion,
  requiredDisclosureKeys,
  agreementDocumentId,
}: {
  claimId: string;

  session: StaffSession;

  feeAgreement: FeeAgreement | undefined;

  jurisdictionLegalRuleVersion: number | undefined;

  requiredDisclosureKeys: string[];

  agreementDocumentId: string;
}) {
  if (
    jurisdictionLegalRuleVersion === undefined ||
    !Number.isInteger(jurisdictionLegalRuleVersion) ||
    jurisdictionLegalRuleVersion < 1
  ) {
    throw new OnboardingRouteError(
      "The current jurisdiction does not have a valid legal-rule version. Agreement signing is blocked.",
      409,
    );
  }

  if (!feeAgreement) {
    throw new OnboardingRouteError(
      "The Claim fee-agreement record could not be resolved.",
      409,
    );
  }

  if (
    feeAgreement.legalRuleVersionSnapshot === undefined ||
    !Number.isInteger(feeAgreement.legalRuleVersionSnapshot) ||
    feeAgreement.legalRuleVersionSnapshot < 1
  ) {
    throw new OnboardingRouteError(
      "The Claim fee agreement does not contain a valid legal-rule version snapshot. Recalculate pricing before agreement signing.",
      409,
    );
  }

  if (feeAgreement.legalRuleVersionSnapshot !== jurisdictionLegalRuleVersion) {
    throw new OnboardingRouteError(
      "The jurisdiction legal rule changed after commercial pricing was locked. Agreement signing is blocked until pricing is recalculated under the current approved rule.",
      409,
    );
  }

  const onboarding = await getClaimantOnboardingForStaff(
    session,
    claimId,
  );

  if (!onboarding) {
    throw new OnboardingRouteError(
      "Start claimant onboarding before signing the service agreement.",
      409,
    );
  }

  if (onboarding.claimant.identityVerification !== "verified") {
    throw new OnboardingRouteError(
      "Claimant identity must be verified before the service agreement can be signed.",
      409,
    );
  }

  const acknowledged = new Set(
    onboarding.disclosureAcknowledgements.map(
      (acknowledgement) => acknowledgement.key,
    ),
  );

  const missingDisclosureKeys = requiredDisclosureKeys.filter(
    (key) => !acknowledged.has(key),
  );

  if (missingDisclosureKeys.length > 0) {
    throw new OnboardingRouteError(
      `The service agreement cannot be signed until every required disclosure is acknowledged. Missing: ${missingDisclosureKeys.join(
        ", ",
      )}.`,
      409,
    );
  }

  if (!onboarding.freeClaimOptionDisclosedAt) {
    throw new OnboardingRouteError(
      "The free direct-claim option must be disclosed and recorded before the service agreement can be signed.",
      409,
    );
  }

  /*
   * Claim document ownership is being hardened separately in the staff document
   * service. At this route boundary, claimant ownership has already been
   * positively established before we inspect documents belonging to this Claim.
   */
  const documents = await listClaimDocuments(claimId);

  const agreementDocument = documents.find(
    (document) =>
      document.id === agreementDocumentId &&
      document.kind === "fee_agreement" &&
      document.status === "accepted",
  );

  if (!agreementDocument) {
    throw new OnboardingRouteError(
      "The service-agreement document must already exist as an accepted fee-agreement document on this Claim before signing can be recorded.",
      409,
    );
  }
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id } = await context.params;

  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  try {
    requireReadPermissions(session);

    const {
      claim,
      jurisdictionPackage,
      jurisdiction,
      candidateOwner,
      disclosures,
      readiness,
      existingOnboarding,
    } = await resolveOnboardingContext(id, session);

    const onboarding =
      existingOnboarding ??
      (
        await getClaimantOnboardingForStaff(
          session,
          claim.id,
        )
      );

    /*
     * Eligible service-agreement documents.
     *
     * Claimant ownership has already been established before this read.
     *
     * Only an accepted internal fee-agreement document on this same Claim
     * qualifies, which is the identical condition
     * `assertAgreementMayBeSigned` enforces on POST.
     */
    const claimDocuments = await listClaimDocuments(claim.id);

    const feeAgreementDocuments = claimDocuments
      .filter(
        (document) =>
          document.kind === "fee_agreement" && document.status === "accepted",
      )
      .map((document) => ({
        id: document.id,

        title: document.title,

        originalFileName: document.originalFileName ?? null,

        reviewedAt: document.reviewedAt ?? null,
      }));

    return NextResponse.json({
      ok: true,

      claim: {
        id: claim.id,

        reference: claim.reference,

        opportunityId: claim.opportunityId,

        jurisdictionId: claim.jurisdictionId,
      },

      jurisdiction: {
        id: jurisdiction.id,

        stateCode: jurisdictionPackage.stateCode,

        packageVersion: jurisdictionPackage.version,

        legalRuleVersion: jurisdiction.legalRuleVersion ?? null,
      },

      operationalGate: {
        jurisdictionClear: readiness.jurisdictionClear,

        startupGreenLaneClear: readiness.startupGreenLaneClear,

        legalClear: readiness.legalClear,

        deadlineClear: readiness.deadlineClear,

        mayAdvance:
          readiness.jurisdictionClear &&
          readiness.startupGreenLaneClear &&
          readiness.legalClear &&
          readiness.deadlineClear,

        nextInternalAction: readiness.nextInternalAction,
      },

      candidateOwner: {
        legalName: candidateOwner.nameOnRecord,

        ownerKind: candidateOwner.ownerKind,

        ownershipShare: candidateOwner.ownershipShare ?? null,
      },

      disclosures: disclosures.map(serializeDisclosure),

      requiredDisclosureKeys: disclosures
        .filter((disclosure) => disclosure.requiresAcknowledgement)
        .map((disclosure) => disclosure.key),

      feeAgreementDocuments,

      onboarding: onboarding ?? null,

      onboardingStatus: onboarding
        ? claimantOnboardingStatus(onboarding)
        : null,
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Claimant onboarding could not be loaded.",
      409,
    );
  }
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id } = await context.params;

  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  let body: OnboardingRequestBody;

  try {
    body = (await request.json()) as OnboardingRequestBody;
  } catch {
    return errorResponse("Invalid JSON request.");
  }

  if (!body.action) {
    return errorResponse("Onboarding action is required.");
  }

  try {
    requireMutationPermissions(session, body.action);

    const {
      claim,
      jurisdiction,
      candidateOwner,
      disclosures,
      readiness,
      actorUserId,
      businessDate,
    } = await resolveOnboardingContext(id, session);

    assertOnboardingMayAdvance(readiness);

    const requiredDisclosureKeys = disclosures
      .filter((disclosure) => disclosure.requiresAcknowledgement)
      .map((disclosure) => disclosure.key);

    const knownDisclosureKeys = new Set(
      disclosures.map((disclosure) => disclosure.key),
    );

    const occurredAt = new Date().toISOString();

    switch (body.action) {
      case "start": {
        const email = normalizeEmail(body.email);

        const phone = normalizeUsPhone(body.phone);

        const preferredContactChannel = body.preferredContactChannel ?? "email";

        if (!PREFERRED_CONTACT_CHANNELS.includes(preferredContactChannel)) {
          return errorResponse("Preferred contact channel is invalid.");
        }

        const onboarding = await startClaimantOnboarding({
          claimId: claim.id,

          claimReference: claim.reference,

          claimantId: claimantIdForClaim(claim.id),

          claimantReference: claimantReferenceForClaim(claim.reference),

          participantId: participantIdForClaim(claim.id),

          legalName: candidateOwner.nameOnRecord,

          preferredName: optionalTrimmedString(body.preferredName),

          email,

          phone,

          entityType: "individual",

          relationship: "self_former_owner",

          participantRole: "primary_claimant",

          assertedShare: candidateOwner.ownershipShare ?? 1,

          preferredContactChannel,

          preferredLanguage:
            optionalTrimmedString(body.preferredLanguage) ?? "en",

          actorUserId,

          staffSession: session,

          businessDate,

          occurredAt,
        });

        return NextResponse.json({
          ok: true,

          onboarding,

          onboardingStatus: claimantOnboardingStatus(onboarding),
        });
      }

      case "update_contact": {
        const onboarding = await updateClaimantContactDetails({
          claimId: claim.id,

          email: normalizeEmail(body.email),

          phone: normalizeUsPhone(body.phone),

          actorUserId,

          staffSession: session,

          occurredAt,
        });

        return NextResponse.json({
          ok: true,

          onboarding,

          onboardingStatus: claimantOnboardingStatus(onboarding),
        });
      }

      case "verify_contact": {
        if (body.contactKind !== "email" && body.contactKind !== "mobile") {
          return errorResponse("Contact kind must be email or mobile.");
        }

        if (typeof body.verified !== "boolean") {
          return errorResponse("Verified must be true or false.");
        }

        const onboarding = await setClaimantContactVerification({
          claimId: claim.id,

          kind: body.contactKind,

          verified: body.verified,

          actorUserId,

          staffSession: session,

          occurredAt,
        });

        return NextResponse.json({
          ok: true,

          onboarding,

          onboardingStatus: claimantOnboardingStatus(onboarding),
        });
      }

      case "record_contact_consent": {
        const channels = [...new Set(body.consentChannels ?? [])];

        if (channels.length === 0) {
          return errorResponse("At least one consent channel is required.");
        }

        if (
          channels.some(
            (channel) => channel !== "email" && channel !== "mobile",
          )
        ) {
          return errorResponse("Consent channels may only be email or mobile.");
        }

        const onboarding = await recordClaimantContactConsent({
          claimId: claim.id,

          channels,

          consentDate: businessDate,

          consentSource: requiredString(body.consentSource, "Consent source"),

          actorUserId,

          staffSession: session,

          occurredAt,
        });

        return NextResponse.json({
          ok: true,

          onboarding,

          onboardingStatus: claimantOnboardingStatus(onboarding),
        });
      }

      case "set_identity": {
        if (
          !body.identityStatus ||
          !IDENTITY_STATUSES.includes(body.identityStatus)
        ) {
          return errorResponse("Identity verification status is invalid.");
        }

        const providerRef = optionalTrimmedString(body.identityProviderRef);

        if (body.identityStatus === "verified" && !providerRef) {
          return errorResponse(
            "Verified identity status requires an identity verification evidence reference.",
          );
        }

        const onboarding = await setClaimantIdentityVerification({
          claimId: claim.id,

          status: body.identityStatus,

          businessDate,

          providerRef,

          actorUserId,

          staffSession: session,

          occurredAt,
        });

        return NextResponse.json({
          ok: true,

          onboarding,

          onboardingStatus: claimantOnboardingStatus(onboarding),
        });
      }

      case "acknowledge_disclosures": {
        const disclosureKeys = [...new Set(body.disclosureKeys ?? [])];

        if (disclosureKeys.length === 0) {
          return errorResponse(
            "At least one disclosure acknowledgement is required.",
          );
        }

        const unknownKeys = disclosureKeys.filter(
          (key) => !knownDisclosureKeys.has(key),
        );

        if (unknownKeys.length > 0) {
          return errorResponse(
            `Unknown disclosure keys: ${unknownKeys.join(", ")}.`,
          );
        }

        const onboarding = await acknowledgeClaimantDisclosures({
          claimId: claim.id,

          disclosureKeys,

          acknowledgementDate: businessDate,

          freeClaimOptionDisclosed: body.freeClaimOptionDisclosed === true,

          actorUserId,

          staffSession: session,

          occurredAt,
        });

        return NextResponse.json({
          ok: true,

          onboarding,

          onboardingStatus: claimantOnboardingStatus(onboarding),

          requiredDisclosureKeys,
        });
      }

      case "sign_agreement": {
        const agreementDocumentId = requiredString(
          body.agreementDocumentId,
          "Accepted service-agreement document ID",
        );

        await assertAgreementMayBeSigned({
          claimId: claim.id,

          session,

          feeAgreement: claim.feeAgreement,

          jurisdictionLegalRuleVersion: jurisdiction.legalRuleVersion,

          requiredDisclosureKeys,

          agreementDocumentId,
        });

        const cancellationDeadline =
          jurisdiction.cancellationPeriodDays !== undefined
            ? addDays(businessDate, jurisdiction.cancellationPeriodDays)
            : undefined;

        const onboarding = await signClaimantServiceAgreement({
          claimId: claim.id,

          requiredDisclosureKeys,

          signedAt: businessDate,

          cancellationDeadline,

          documentId: agreementDocumentId,

          actorUserId,

          staffSession: session,

          occurredAt,
        });

        return NextResponse.json({
          ok: true,

          onboarding,

          onboardingStatus: claimantOnboardingStatus(onboarding),
        });
      }

      default:
        return errorResponse("Unsupported onboarding action.");
    }
  } catch (error) {
    return routeErrorResponse(error, "Claimant onboarding action failed.", 409);
  }
}