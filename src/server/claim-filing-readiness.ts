import type {
  Claim,
  DocumentKind,
  IsoDate,
  Jurisdiction,
} from "@/domain/types";
import {
  assessFilingReadiness,
  requiredDisclosures,
  type StartupGreenLaneContext,
} from "@/domain/compliance";
import { getClaimantOnboarding } from "@/server/claimant-onboarding-store";
import { resolveClaimDocumentReadiness } from "@/server/claim-document-store";
import {
  listJurisdictionRulePackages,
  type JurisdictionPaymentRouting,
} from "@/server/jurisdiction-intelligence";

/**
 * PERSISTED CLAIM FILING READINESS
 *
 * Central source of truth for whether a persistently converted claim has passed
 * every control required before a filing package may be prepared.
 *
 * This resolver intentionally separates:
 *
 *   - claimant linkage
 *   - identity verification
 *   - disclosure acknowledgement
 *   - service agreement execution
 *   - cancellation-period clearance
 *   - persistent agency-document readiness
 *   - current approved jurisdiction status
 *   - current approved payment routing
 *   - Startup Green Lane eligibility
 *   - case-level administrative legal handling
 *   - commercial/legal pricing integrity
 *   - filing deadline
 *
 * Passing one control never silently satisfies another.
 *
 * CURRENT-RULE PRINCIPLE
 *
 * A historical conversion does not permanently authorize filing.
 *
 * Before a filing package may be prepared, Duequity re-reads the current
 * jurisdiction-intelligence store and verifies that:
 *
 *   1. an approved jurisdiction package still exists;
 *   2. the payment route still fits Duequity's launch model;
 *   3. acquisition or assignment is not required;
 *   4. the current legal and fee rules still support the signed agreement.
 *
 * If the jurisdiction is paused, superseded, removed from approval, or its
 * payment route becomes unresolved, filing readiness fails closed.
 *
 * DOCUMENT RULE
 *
 * Uploading a file is never enough.
 *
 * For a jurisdiction-required document to satisfy filing readiness:
 *
 *   1. the jurisdiction must require that document kind;
 *   2. a corresponding persistent request must exist;
 *   3. that request must be accepted;
 *   4. the request must point to an accepted document.
 *
 * A received, uploaded, under-review, rejected or superseded document does not
 * satisfy the filing-readiness control.
 *
 * Estate documents that are required only when the former owner is deceased
 * become live requirements only when the Claim carries a deceased-owner or
 * probate-required flag.
 *
 * This resolver intentionally does not treat an ordinary waiver as equivalent
 * to accepted evidence. A production waiver path requires its own authorized
 * policy and approval controls.
 */

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type FilingReadinessControlKey =
  | "claimant_linkage"
  | "identity_verification"
  | "required_disclosures"
  | "service_agreement"
  | "cancellation_window"
  | "agency_documents"
  | "legal_handling"
  | "jurisdiction_gate"
  | "startup_green_lane"
  | "commercial_integrity"
  | "filing_deadline";

export interface FilingReadinessControl {
  key: FilingReadinessControlKey;

  label: string;

  complete: boolean;

  detail: string;
}

export interface PersistedClaimFilingReadiness {
  readyToPrepare: boolean;

  onboardingComplete: boolean;

  claimantLinked: boolean;

  identityVerified: boolean;

  disclosuresComplete: boolean;

  serviceAgreementSigned: boolean;

  cancellationWindowClear: boolean;

  jurisdictionClear: boolean;

  startupGreenLaneClear: boolean;

  legalClear: boolean;

  commercialIntegrityClear: boolean;

  deadlineClear: boolean;

  agencyDocumentsComplete: boolean;

  requiredDocumentKinds: DocumentKind[];

  acceptedRequiredDocumentKinds: DocumentKind[];

  outstandingRequiredDocumentKinds: DocumentKind[];

  missingDocumentRequestKinds: DocumentKind[];

  controls: FilingReadinessControl[];

  outstandingControls: FilingReadinessControl[];

  completedControlCount: number;

  outstandingControlCount: number;

  nextInternalAction: string;
}

/* ========================================================================== */
/* Payment routing                                                             */
/* ========================================================================== */

function paymentRouteReadyForLaunch(
  routing: JurisdictionPaymentRouting,
): boolean {
  if (
    routing.paymentRoute === "unknown" ||
    routing.paymentRoute === "assignee" ||
    routing.launchTrack === "blocked" ||
    routing.launchTrack === "future_acquisition" ||
    routing.feeCollectionMethod === "unknown" ||
    routing.feeCollectionMethod === "assignment_acquisition" ||
    routing.representativeMayFile === "unknown" ||
    routing.representativeMayReceivePayment === "unknown" ||
    routing.assignmentRequiredForRepresentativePayment === "unknown"
  ) {
    return false;
  }

  if (routing.assignmentRequiredForRepresentativePayment === "yes") {
    return false;
  }

  switch (routing.paymentRoute) {
    case "claimant_only":
      return (
        routing.launchTrack === "direct_claimant_recovery" &&
        routing.representativeMayReceivePayment === "no" &&
        routing.assignmentRequiredForRepresentativePayment === "no" &&
        routing.feeCollectionMethod === "contractual_post_recovery"
      );

    case "authorized_representative":
      return (
        routing.launchTrack === "managed_representative_recovery" &&
        routing.representativeMayReceivePayment === "yes" &&
        routing.assignmentRequiredForRepresentativePayment === "no" &&
        routing.feeCollectionMethod === "representative_disbursement"
      );

    case "joint_payee":
      return (
        routing.launchTrack === "managed_representative_recovery" &&
        routing.representativeMayReceivePayment === "yes" &&
        routing.assignmentRequiredForRepresentativePayment === "no" &&
        routing.feeCollectionMethod === "joint_payee_disbursement"
      );

    case "split_disbursement":
      return (
        routing.launchTrack === "managed_representative_recovery" &&
        routing.representativeMayReceivePayment === "yes" &&
        routing.assignmentRequiredForRepresentativePayment === "no" &&
        routing.feeCollectionMethod === "split_disbursement"
      );
  }
}

function startupGreenLaneContext(
  routing: JurisdictionPaymentRouting | undefined,
): StartupGreenLaneContext {
  if (!routing) {
    return {
      paymentRoute: "unknown",

      launchTrack: "blocked",

      representativeMayFile: "unknown",

      representativeMayReceivePayment: "unknown",

      assignmentRequiredForRepresentativePayment: "unknown",

      feeCollectionMethod: "unknown",

      paymentRouteReady: false,

      acquisitionRequested: false,
    };
  }

  return {
    paymentRoute: routing.paymentRoute,

    launchTrack: routing.launchTrack,

    representativeMayFile: routing.representativeMayFile,

    representativeMayReceivePayment: routing.representativeMayReceivePayment,

    assignmentRequiredForRepresentativePayment:
      routing.assignmentRequiredForRepresentativePayment,

    feeCollectionMethod: routing.feeCollectionMethod,

    paymentRouteReady: paymentRouteReadyForLaunch(routing),

    acquisitionRequested: false,
  };
}

/* ========================================================================== */
/* Compliance-check helpers                                                    */
/* ========================================================================== */

function complianceCheckComplete(
  checks: ReturnType<typeof assessFilingReadiness>["checks"],
  key: string,
): boolean {
  return checks.find((check) => check.key === key)?.satisfied ?? false;
}

function complianceCheckDetail(
  checks: ReturnType<typeof assessFilingReadiness>["checks"],
  key: string,
  fallback: string,
): string {
  const check = checks.find((candidate) => candidate.key === key);

  if (!check) {
    return fallback;
  }

  return check.detail ?? check.label;
}

function failedComplianceChecks(
  checks: ReturnType<typeof assessFilingReadiness>["checks"],
  keys: string[],
) {
  return checks.filter((check) => keys.includes(check.key) && !check.satisfied);
}

/* ========================================================================== */
/* Resolver                                                                    */
/* ========================================================================== */

export async function resolvePersistedClaimFilingReadiness(
  claim: Claim,
  jurisdiction: Jurisdiction,
  today: IsoDate,
): Promise<PersistedClaimFilingReadiness> {
  const [onboarding, documentReadiness, rulePackages] = await Promise.all([
    getClaimantOnboarding(claim.id),

    resolveClaimDocumentReadiness(claim.id),

    listJurisdictionRulePackages(),
  ]);

  const currentJurisdictionPackage = rulePackages
    .filter(
      (rulePackage) =>
        rulePackage.status === "approved" &&
        rulePackage.rule?.id === claim.jurisdictionId,
    )
    .slice()
    .sort((left, right) => right.version - left.version)[0];

  const effectiveJurisdiction =
    currentJurisdictionPackage?.rule ?? jurisdiction;

  const currentApprovedJurisdictionExists = Boolean(
    currentJurisdictionPackage && currentJurisdictionPackage.rule,
  );

  const greenLaneContext = startupGreenLaneContext(
    currentJurisdictionPackage?.paymentRouting,
  );

  const disclosureRules = requiredDisclosures(effectiveJurisdiction);

  const requiredDisclosureKeys = disclosureRules
    .filter((disclosure) => disclosure.requiresAcknowledgement)
    .map((disclosure) => disclosure.key);

  const acknowledgedDisclosureKeys = new Set(
    onboarding?.disclosureAcknowledgements.map(
      (acknowledgement) => acknowledgement.key,
    ) ?? [],
  );

  const claimantLinked = Boolean(onboarding?.participant);

  const identityVerified =
    onboarding?.claimant.identityVerification === "verified";

  const allRequiredDisclosuresAcknowledged = requiredDisclosureKeys.every(
    (key) => acknowledgedDisclosureKeys.has(key),
  );

  const freeClaimOptionRecorded = Boolean(
    onboarding?.freeClaimOptionDisclosedAt,
  );

  const disclosuresCompleteFromOnboarding =
    allRequiredDisclosuresAcknowledged && freeClaimOptionRecorded;

  const serviceAgreementSignedFromOnboarding = Boolean(
    onboarding?.serviceAgreement?.signedAt,
  );

  /* ======================================================================== */
  /* Persistent agency documents                                               */
  /* ======================================================================== */

  const estateHandlingRequired =
    effectiveJurisdiction.probateRequiredWhenDeceased &&
    claim.flags.some(
      (flag) =>
        flag.kind === "deceased_owner" ||
        flag.kind === "probate_required",
    );

  const requiredDocumentKinds =
    effectiveJurisdiction.requiredDocuments.filter(
      (kind) =>
        kind !== "letters_of_administration" ||
        estateHandlingRequired,
    );

  const requiredRequestByKind = new Map(
    documentReadiness.requiredRequests.map((request) => [
      request.kind,
      request,
    ]),
  );

  const acceptedRequiredDocumentKinds = requiredDocumentKinds.filter((kind) => {
    const request = requiredRequestByKind.get(kind);

    return (
      request?.status === "accepted" && Boolean(request.fulfilledByDocumentId)
    );
  });

  const missingDocumentRequestKinds = requiredDocumentKinds.filter(
    (kind) => !requiredRequestByKind.has(kind),
  );

  const outstandingRequiredDocumentKinds = requiredDocumentKinds.filter(
    (kind) => !acceptedRequiredDocumentKinds.includes(kind),
  );

  const agencyDocumentsComplete =
    requiredDocumentKinds.length === 0 ||
    (missingDocumentRequestKinds.length === 0 &&
      outstandingRequiredDocumentKinds.length === 0);

  let agencyDocumentDetail: string;

  if (requiredDocumentKinds.length === 0) {
    agencyDocumentDetail =
      "The currently approved jurisdiction rule does not require additional agency document types for this claim.";
  } else if (agencyDocumentsComplete) {
    agencyDocumentDetail = `All ${requiredDocumentKinds.length} jurisdiction-required document type${
      requiredDocumentKinds.length === 1 ? " has" : "s have"
    } accepted evidence.`;
  } else if (missingDocumentRequestKinds.length > 0) {
    agencyDocumentDetail = `${missingDocumentRequestKinds.length} jurisdiction-required document request${
      missingDocumentRequestKinds.length === 1 ? " has" : "s have"
    } not yet been initialized. Filing readiness remains blocked.`;
  } else {
    agencyDocumentDetail = `${acceptedRequiredDocumentKinds.length} of ${requiredDocumentKinds.length} jurisdiction-required document type${
      requiredDocumentKinds.length === 1 ? " has" : "s have"
    } accepted evidence. ${outstandingRequiredDocumentKinds.length} ${
      outstandingRequiredDocumentKinds.length === 1 ? "remains" : "remain"
    } outstanding.`;
  }

  const complianceReadiness = assessFilingReadiness(
    claim,
    effectiveJurisdiction,
    outstandingRequiredDocumentKinds.map((kind) => kind),
    today,
    currentApprovedJurisdictionExists ? greenLaneContext : undefined,
  );

  const complianceChecks = complianceReadiness.checks;

  const serviceAgreementSigned =
    serviceAgreementSignedFromOnboarding &&
    complianceCheckComplete(complianceChecks, "fee_agreement");

  const disclosuresComplete =
    disclosuresCompleteFromOnboarding &&
    complianceCheckComplete(complianceChecks, "required_disclosures") &&
    complianceCheckComplete(complianceChecks, "free_claim_disclosed");

  const cancellationWindowClear = complianceCheckComplete(
    complianceChecks,
    "cancellation_window",
  );

  const jurisdictionClear =
    currentApprovedJurisdictionExists &&
    complianceCheckComplete(complianceChecks, "jurisdiction_cleared");

  const startupGreenLaneClear =
    currentApprovedJurisdictionExists &&
    complianceCheckComplete(complianceChecks, "startup_green_lane");

  const legalClear =
    complianceCheckComplete(complianceChecks, "administrative_legal_lane") &&
    complianceCheckComplete(complianceChecks, "no_attorney_requirement");

  const commercialIntegrityKeys = [
    "fee_agreement_active",
    "agreement_jurisdiction",
    "executed_agreement_document",
    "pricing_snapshot",
    "legal_rule_snapshot",
    "legal_fee_caps_snapshot",
    "fee_legally_valid",
    "no_blocking_flags",
  ];

  const failedCommercialIntegrityChecks = failedComplianceChecks(
    complianceChecks,
    commercialIntegrityKeys,
  );

  const commercialIntegrityClear = failedCommercialIntegrityChecks.length === 0;

  const deadlineClear = complianceCheckComplete(
    complianceChecks,
    "within_deadline",
  );

  const onboardingComplete =
    claimantLinked &&
    identityVerified &&
    disclosuresComplete &&
    serviceAgreementSigned;

  const controls: FilingReadinessControl[] = [
    {
      key: "claimant_linkage",

      label: "Claimant linked",

      complete: claimantLinked,

      detail: claimantLinked
        ? `${
            onboarding?.claimant.legalName ?? "Claimant"
          } is persistently linked to this claim.`
        : "A claimant participant must be attached to this claim.",
    },

    {
      key: "identity_verification",

      label: "Identity verified",

      complete: identityVerified,

      detail: identityVerified
        ? "Claimant identity verification is recorded as verified."
        : "Claimant identity verification must be completed.",
    },

    {
      key: "required_disclosures",

      label: "Required disclosures",

      complete: disclosuresComplete,

      detail: disclosuresComplete
        ? "Every required claimant acknowledgement and the free direct-claim option are recorded."
        : "Every required jurisdiction disclosure and the free direct-claim option must be recorded before filing.",
    },

    {
      key: "service_agreement",

      label: "Service agreement",

      complete: serviceAgreementSigned,

      detail: serviceAgreementSigned
        ? onboarding?.serviceAgreement?.cancellationDeadline
          ? `Signed service agreement recorded. Cancellation deadline: ${onboarding.serviceAgreement.cancellationDeadline}.`
          : "Signed service agreement recorded."
        : "A valid signed claimant service agreement must be recorded.",
    },

    {
      key: "cancellation_window",

      label: "Cancellation window",

      complete: cancellationWindowClear,

      detail: cancellationWindowClear
        ? "Any recorded cancellation period has cleared."
        : complianceCheckDetail(
            complianceChecks,
            "cancellation_window",
            "The service-agreement cancellation period has not cleared.",
          ),
    },

    {
      key: "agency_documents",

      label: "Agency documents",

      complete: agencyDocumentsComplete,

      detail: agencyDocumentDetail,
    },

    {
      key: "legal_handling",

      label: "Administrative legal lane",

      complete: legalClear,

      detail: legalClear
        ? "The current claim and approved jurisdiction rule clear this matter for straightforward administrative handling. No separate attorney workflow is required."
        : complianceCheckDetail(
            complianceChecks,
            "administrative_legal_lane",
            "The case has not been cleared for Duequity's administrative filing lane.",
          ),
    },

    {
      key: "jurisdiction_gate",

      label: "Current jurisdiction approval",

      complete: jurisdictionClear,

      detail: !currentApprovedJurisdictionExists
        ? "No currently approved jurisdiction rule package exists for this claim. Historical approval does not authorize a new filing."
        : jurisdictionClear
          ? "The current jurisdiction rule remains approved for administrative intake."
          : complianceCheckDetail(
              complianceChecks,
              "jurisdiction_cleared",
              "The current jurisdiction intake rule blocks filing.",
            ),
    },

    {
      key: "startup_green_lane",

      label: "Payment route and Startup Green Lane",

      complete: startupGreenLaneClear,

      detail: startupGreenLaneClear
        ? complianceCheckDetail(
            complianceChecks,
            "startup_green_lane",
            "The current payment route remains inside Duequity's Startup Green Lane.",
          )
        : complianceCheckDetail(
            complianceChecks,
            "startup_green_lane",
            "The current jurisdiction payment route is missing, unresolved, acquisition-based, or otherwise outside Duequity's launch model.",
          ),
    },

    {
      key: "commercial_integrity",

      label: "Agreement and pricing integrity",

      complete: commercialIntegrityClear,

      detail: commercialIntegrityClear
        ? "The executed agreement, legal-rule snapshot, fee ceilings, pricing snapshot, fee calculation and blocking-flag controls remain valid."
        : `Filing remains blocked by ${failedCommercialIntegrityChecks.length} agreement, pricing, legal-rule or risk control${
            failedCommercialIntegrityChecks.length === 1 ? "" : "s"
          }: ${failedCommercialIntegrityChecks
            .map((check) => check.label)
            .join("; ")}.`,
    },

    {
      key: "filing_deadline",

      label: "Filing deadline",

      complete: deadlineClear,

      detail: deadlineClear
        ? complianceCheckDetail(
            complianceChecks,
            "within_deadline",
            "The claim remains inside the recorded filing period.",
          )
        : complianceCheckDetail(
            complianceChecks,
            "within_deadline",
            "The recorded filing deadline has expired.",
          ),
    },
  ];

  const outstandingControls = controls.filter((control) => !control.complete);

  const completedControlCount = controls.length - outstandingControls.length;

  const outstandingControlCount = outstandingControls.length;

  const readyToPrepare =
    onboardingComplete &&
    agencyDocumentsComplete &&
    cancellationWindowClear &&
    jurisdictionClear &&
    startupGreenLaneClear &&
    legalClear &&
    commercialIntegrityClear &&
    deadlineClear &&
    complianceReadiness.ready;

  let nextInternalAction: string;

  if (!claimantLinked) {
    nextInternalAction =
      "Start claimant onboarding and attach the claimant participant.";
  } else if (!identityVerified) {
    nextInternalAction = "Complete claimant identity verification.";
  } else if (!disclosuresComplete) {
    nextInternalAction =
      "Present and record every required jurisdiction disclosure and the free direct-claim option.";
  } else if (!serviceAgreementSigned) {
    nextInternalAction =
      "Obtain and retain the claimant's valid signed service agreement.";
  } else if (!cancellationWindowClear) {
    nextInternalAction = complianceCheckDetail(
      complianceChecks,
      "cancellation_window",
      "Do not prepare the filing until the recorded cancellation period has cleared.",
    );
  } else if (!currentApprovedJurisdictionExists) {
    nextInternalAction =
      "Restore or publish a current approved jurisdiction rule before any filing work proceeds.";
  } else if (!jurisdictionClear) {
    nextInternalAction =
      "Resolve the current jurisdiction intake restriction before proceeding.";
  } else if (!startupGreenLaneClear) {
    nextInternalAction =
      "Resolve the current payment-routing determination. Do not file while the jurisdiction is outside Duequity's Startup Green Lane.";
  } else if (!legalClear) {
    nextInternalAction =
      "Complete or resolve the case-level legal review. Filing is limited to human-confirmed administrative recoveries.";
  } else if (!commercialIntegrityClear) {
    nextInternalAction =
      failedCommercialIntegrityChecks.length === 1
        ? `Resolve the filing control: ${failedCommercialIntegrityChecks[0].label}.`
        : `Resolve the ${failedCommercialIntegrityChecks.length} outstanding agreement, pricing, legal-rule or risk controls before filing.`;
  } else if (missingDocumentRequestKinds.length > 0) {
    nextInternalAction =
      "Initialize every jurisdiction-required document request before preparing the filing.";
  } else if (!agencyDocumentsComplete) {
    nextInternalAction =
      outstandingRequiredDocumentKinds.length === 1
        ? `Obtain and accept the outstanding ${outstandingRequiredDocumentKinds[0].replaceAll(
            "_",
            " ",
          )} document.`
        : `Obtain and accept the ${outstandingRequiredDocumentKinds.length} remaining jurisdiction-required documents.`;
  } else if (!deadlineClear) {
    nextInternalAction =
      "Escalate the expired filing deadline for legal review. Do not file through the ordinary workflow.";
  } else {
    nextInternalAction =
      "All current filing-readiness controls have passed. Prepare the filing package for independent human review.";
  }

  return {
    readyToPrepare,

    onboardingComplete,

    claimantLinked,

    identityVerified,

    disclosuresComplete,

    serviceAgreementSigned,

    cancellationWindowClear,

    jurisdictionClear,

    startupGreenLaneClear,

    legalClear,

    commercialIntegrityClear,

    deadlineClear,

    agencyDocumentsComplete,

    requiredDocumentKinds,

    acceptedRequiredDocumentKinds,

    outstandingRequiredDocumentKinds,

    missingDocumentRequestKinds,

    controls,

    outstandingControls,

    completedControlCount,

    outstandingControlCount,

    nextInternalAction,
  };
}