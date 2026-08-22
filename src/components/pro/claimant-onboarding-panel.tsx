"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

/**
 * CLAIMANT ONBOARDING PANEL
 *
 * Interactive operations control for a persistently converted claim.
 *
 * The server remains authoritative for:
 *
 *   - claimant identity
 *   - claim linkage
 *   - source ownership
 *   - required disclosures
 *   - cancellation period
 *   - agreement eligibility
 *
 * This client only submits explicit human actions to the onboarding API.
 *
 * OPERATIONAL GATE
 *
 * The API refuses every onboarding mutation while the Claim's jurisdiction is
 * not cleared, its payment route is outside the Startup Green Lane, its legal
 * lane is not administrative, or its filing deadline has passed.
 *
 * This panel reads that gate from the API and disables the controls rather than
 * letting an operator fill in a form and discover the block on submit. The gate
 * remains enforced server side regardless; the disabled control is a courtesy,
 * not the control.
 *
 * SERVICE AGREEMENT DOCUMENT
 *
 * The signature action requires an accepted internal fee-agreement document that
 * already exists on this Claim. The server supplies the eligible documents, and
 * this panel offers only those. There is no free-text document identifier field,
 * because a typed identifier can only ever be a guess at something the server
 * will reject.
 *
 * Validation build note:
 *
 * Identity and contact verification actions are manual staff-recorded controls in
 * the current local build. Production will replace those controls with
 * authenticated staff actions and approved verification providers.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type IdentityVerificationStatus =
  | "not_started"
  | "documents_requested"
  | "under_review"
  | "verified"
  | "failed"
  | "manual_review";

type PreferredContactChannel = "email" | "phone_call" | "sms" | "mail";

type OnboardingStatus =
  | "identity_pending"
  | "disclosures_pending"
  | "agreement_pending"
  | "complete"
  | null;

interface DisclosureRecord {
  key: string;
  text: string;
  requiresAcknowledgement: boolean;
}

interface ContactRecord {
  id: string;
  kind: "email" | "mobile" | "landline" | "mailing_address";
  value: string;
  isPrimary: boolean;
  verified: boolean;
  consentGivenAt?: string;
  optedOutAt?: string;
}

interface DisclosureAcknowledgement {
  key: string;
  acknowledgedAt: string;
  acknowledgedByUserId: string;
}

interface ServiceAgreementRecord {
  signedAt: string;
  signedByClaimantId: string;
  requiredDisclosureKeysSnapshot: string[];
  cancellationDeadline?: string;
  documentId?: string;
  recordedByUserId: string;
  recordedAt: string;
}

interface OnboardingRecord {
  claimId: string;
  claimReference: string;

  claimant: {
    id: string;
    reference: string;
    legalName: string;
    preferredName?: string;
    entityType: "individual" | "estate" | "trust" | "business";
    contactMethods: ContactRecord[];
    preferredContactChannel: PreferredContactChannel;
    consentRecordedAt?: string;
    consentSource?: string;
    identityVerification: IdentityVerificationStatus;
    identityVerifiedAt?: string;
    identityProviderRef?: string;
    preferredLanguage: string;
    createdAt: string;
  };

  participant: {
    id: string;
    claimantId: string;
    role: string;
    relationship: string;
    assertedShare?: number;
    addedAt: string;
  };

  disclosureAcknowledgements: DisclosureAcknowledgement[];

  freeClaimOptionDisclosedAt?: string;

  serviceAgreement?: ServiceAgreementRecord;

  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface OperationalGate {
  jurisdictionClear: boolean;
  startupGreenLaneClear: boolean;
  legalClear: boolean;
  deadlineClear: boolean;
  mayAdvance: boolean;
  nextInternalAction: string;
}

interface JurisdictionSummary {
  id: string;
  stateCode: string;
  packageVersion: number;
  legalRuleVersion: number | null;
}

interface FeeAgreementDocumentRecord {
  id: string;
  title: string;
  originalFileName: string | null;
  reviewedAt: string | null;
}

interface OnboardingApiPayload {
  ok: true;

  claim: {
    id: string;
    reference: string;
    opportunityId: string;
    jurisdictionId: string;
  };

  jurisdiction: JurisdictionSummary;

  operationalGate: OperationalGate;

  candidateOwner: {
    legalName: string;
    ownerKind: string;
    ownershipShare: number | null;
  };

  disclosures: DisclosureRecord[];

  requiredDisclosureKeys: string[];

  feeAgreementDocuments: FeeAgreementDocumentRecord[];

  onboarding: OnboardingRecord | null;

  onboardingStatus: OnboardingStatus;
}

interface ApiErrorPayload {
  ok?: false;
  error?: string;
}

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

/**
 * Convert any U.S. phone input into a progressive display format.
 *
 * Examples:
 *
 *   3          -> (3
 *   301        -> (301)
 *   3012       -> (301) 2
 *   301201     -> (301) 201
 *   3012010293 -> (301) 201-0293
 *
 * A pasted leading country code 1 is removed automatically.
 * Anything after the tenth U.S. digit is discarded.
 */
function formatUsPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.length >= 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 10);

  if (digits.length === 0) {
    return "";
  }

  if (digits.length < 3) {
    return `(${digits}`;
  }

  if (digits.length === 3) {
    return `(${digits})`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function identityLabel(status: IdentityVerificationStatus): string {
  switch (status) {
    case "not_started":
      return "Not started";

    case "documents_requested":
      return "Documents requested";

    case "under_review":
      return "Under review";

    case "verified":
      return "Verified";

    case "failed":
      return "Failed";

    case "manual_review":
      return "Manual review";

    default:
      return status;
  }
}

function onboardingStatusLabel(status: OnboardingStatus): string {
  switch (status) {
    case "identity_pending":
      return "Identity pending";

    case "disclosures_pending":
      return "Disclosures pending";

    case "agreement_pending":
      return "Agreement pending";

    case "complete":
      return "Onboarding complete";

    default:
      return "Not started";
  }
}

/* ========================================================================== */
/* Small UI helpers                                                            */
/* ========================================================================== */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-ink-700">
      {children}
    </label>
  );
}

function GateItem({ clear, label }: { clear: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        aria-hidden
        className={
          clear
            ? "flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-600 text-[10px] font-bold text-white"
            : "flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-critical-600 text-[10px] font-bold text-white"
        }
      >
        {clear ? "✓" : "!"}
      </span>

      <span
        className={clear ? "text-ink-700" : "font-medium text-critical-800"}
      >
        {label}
      </span>
    </li>
  );
}

function StepIndicator({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-inset px-3 py-2.5">
      <span
        aria-hidden
        className={
          complete
            ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-600 text-[11px] font-bold text-white"
            : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[11px] font-bold text-ink-400"
        }
      >
        {complete ? "✓" : "·"}
      </span>

      <span
        className={
          complete ? "text-xs font-medium text-ink-800" : "text-xs text-ink-500"
        }
      >
        {label}
      </span>
    </div>
  );
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimantOnboardingPanel({ claimId }: { claimId: string }) {
  const router = useRouter();

  const [data, setData] = useState<OnboardingApiPayload | null>(null);

  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState<string | null>(null);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  /* ---------------------------------------------------------------- start form */

  const [email, setEmail] = useState("");

  const [phone, setPhone] = useState("");

  const [preferredName, setPreferredName] = useState("");

  const [preferredLanguage, setPreferredLanguage] = useState("en");

  const [preferredContactChannel, setPreferredContactChannel] =
    useState<PreferredContactChannel>("email");

  /* --------------------------------------------------------------- contact edit */

  const [contactEmail, setContactEmail] = useState("");

  const [contactPhone, setContactPhone] = useState("");

  /* ------------------------------------------------------------------ consent */

  const [consentEmail, setConsentEmail] = useState(false);

  const [consentMobile, setConsentMobile] = useState(false);

  const [consentSource, setConsentSource] = useState("");

  /* ---------------------------------------------------------------- identity */

  const [identityStatus, setIdentityStatus] =
    useState<IdentityVerificationStatus>("not_started");

  const [identityProviderRef, setIdentityProviderRef] = useState("");

  /* ------------------------------------------------------------- disclosures */

  const [pendingDisclosureKeys, setPendingDisclosureKeys] = useState<string[]>(
    [],
  );

  /* ---------------------------------------------------------------- agreement */

  const [agreementDocumentId, setAgreementDocumentId] = useState("");

  /* ======================================================================== */
  /* Load                                                                      */
  /* ======================================================================== */

  /**
   * Fetch current onboarding state.
   *
   * Contains no state write of any kind, so it is safe to call directly from an
   * effect body: nothing can cascade a render before the browser has painted.
   * The caller decides what to do with the payload.
   */
  const fetchOnboarding = useCallback(
    async (signal?: AbortSignal): Promise<OnboardingApiPayload> => {
      const response = await fetch(
        `/api/pro/claims/${encodeURIComponent(claimId)}/onboarding`,
        {
          method: "GET",
          cache: "no-store",
          signal,
          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload = (await response.json()) as
        OnboardingApiPayload | ApiErrorPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Claimant onboarding could not be loaded.",
        );
      }

      return payload;
    },
    [claimId],
  );

  /**
   * Apply a fetched payload to component state.
   *
   * Called from a promise callback or an event handler, never from an effect
   * body. Editable fields are re-seeded from the server record so the form always
   * reflects what is actually persisted.
   */
  const applyPayload = useCallback((payload: OnboardingApiPayload) => {
    setData(payload);
    setError("");

    const onboarding = payload.onboarding;

    if (onboarding) {
      const emailMethod = onboarding.claimant.contactMethods.find(
        (method) => method.kind === "email",
      );

      const mobileMethod = onboarding.claimant.contactMethods.find(
        (method) => method.kind === "mobile",
      );

      setContactEmail(emailMethod?.value ?? "");

      setContactPhone(
        mobileMethod?.value ? formatUsPhoneInput(mobileMethod.value) : "",
      );

      setIdentityStatus(onboarding.claimant.identityVerification);

      setIdentityProviderRef(onboarding.claimant.identityProviderRef ?? "");

      setConsentEmail(Boolean(emailMethod?.consentGivenAt));

      setConsentMobile(Boolean(mobileMethod?.consentGivenAt));

      setConsentSource(onboarding.claimant.consentSource ?? "");
    }

    /*
     * Preselect the only eligible service-agreement document when there is
     * exactly one. Recording a signature stays an explicit human action; this
     * only saves the operator choosing from a list of one.
     */
    setAgreementDocumentId((current) => {
      const eligible = payload.feeAgreementDocuments;

      if (current && eligible.some((document) => document.id === current)) {
        return current;
      }

      return eligible.length === 1 ? eligible[0].id : "";
    });
  }, []);

  /**
   * Reload after a mutation.
   *
   * Only ever called from an event handler, so a synchronous state write here is
   * correct and expected.
   */
  const load = useCallback(async () => {
    try {
      applyPayload(await fetchOnboarding());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Claimant onboarding could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchOnboarding, applyPayload]);

  /*
   * Initial load.
   *
   * The effect body calls only `fetchOnboarding`, which writes no state. State is
   * applied in the promise callback, and the request is aborted if the panel
   * unmounts first so nothing writes to an unmounted component.
   */
  useEffect(() => {
    const controller = new AbortController();

    fetchOnboarding(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;

        applyPayload(payload);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Claimant onboarding could not be loaded.",
        );

        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [fetchOnboarding, applyPayload]);

  /* ======================================================================== */
  /* Derived state                                                             */
  /* ======================================================================== */

  const onboarding = data?.onboarding ?? null;

  const acknowledgedKeys = useMemo(
    () =>
      new Set(
        onboarding?.disclosureAcknowledgements.map(
          (acknowledgement) => acknowledgement.key,
        ) ?? [],
      ),
    [onboarding],
  );

  const requiredDisclosureKeys = data?.requiredDisclosureKeys ?? [];

  const missingRequiredDisclosureKeys = requiredDisclosureKeys.filter(
    (key) => !acknowledgedKeys.has(key),
  );

  const disclosuresComplete =
    Boolean(onboarding) &&
    missingRequiredDisclosureKeys.length === 0 &&
    Boolean(onboarding?.freeClaimOptionDisclosedAt);

  const identityComplete =
    onboarding?.claimant.identityVerification === "verified";

  const participantComplete = Boolean(onboarding?.participant);

  const agreementComplete = Boolean(onboarding?.serviceAgreement);

  const onboardingComplete =
    participantComplete &&
    identityComplete &&
    disclosuresComplete &&
    agreementComplete;

  const emailMethod = onboarding?.claimant.contactMethods.find(
    (method) => method.kind === "email",
  );

  const mobileMethod = onboarding?.claimant.contactMethods.find(
    (method) => method.kind === "mobile",
  );

  /* ---------------------------------------------------------- server gate */

  const gate = data?.operationalGate;

  const eligibleAgreementDocuments = data?.feeAgreementDocuments ?? [];

  /**
   * Whether onboarding mutations may currently be submitted.
   *
   * Mirrors the server gate exactly. The server re-evaluates it on every request,
   * so this only prevents an operator filling in a form that would be refused.
   */
  const mayAdvance = gate?.mayAdvance === true;

  /** Every mutation control is blocked while an action is in flight or the gate is closed. */
  const controlsLocked = action !== null || !mayAdvance;

  /* ======================================================================== */
  /* Action helper                                                             */
  /* ======================================================================== */

  async function runAction(
    actionName: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setAction(actionName);

    setError("");

    setSuccess("");

    try {
      const response = await fetch(
        `/api/pro/claims/${encodeURIComponent(claimId)}/onboarding`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            Accept: "application/json",
          },

          body: JSON.stringify(body),
        },
      );

      const payload = (await response.json()) as
        Record<string, unknown> | ApiErrorPayload;

      if (!response.ok || payload.ok !== true) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The onboarding action could not be completed.",
        );
      }

      setSuccess(successMessage);

      await load();

      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The onboarding action could not be completed.",
      );
    } finally {
      setAction(null);
    }
  }

  /* ======================================================================== */
  /* Loading                                                                   */
  /* ======================================================================== */

  if (loading && !data) {
    return (
      <div className="rounded-md border border-line bg-inset px-4 py-5">
        <p className="text-sm font-medium text-ink-700">
          Loading claimant onboarding
        </p>

        <p className="mt-1 text-xs text-ink-500">
          Reading the persisted claim and server-controlled onboarding state.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-md border border-critical-200 bg-critical-50 px-4 py-4">
        <p className="text-sm font-semibold text-critical-800">
          Claimant onboarding unavailable
        </p>

        <p className="mt-1 text-xs leading-relaxed text-critical-700">
          {error || "The claimant onboarding record could not be loaded."}
        </p>

        <button
          type="button"
          onClick={() => {
            void load();
          }}
          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2 text-sm font-semibold text-critical-800 transition hover:bg-critical-50"
        >
          Try again
        </button>
      </div>
    );
  }

  /* ======================================================================== */
  /* UI                                                                        */
  /* ======================================================================== */

  return (
    <div className="min-w-0 space-y-5">
      {/* ================================================================== status */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">
            {data.candidateOwner.legalName}
          </p>

          <p className="mt-0.5 text-xs text-ink-500">
            Server-derived former owner candidate
            {data.candidateOwner.ownershipShare === 1
              ? " / 100% recorded interest"
              : ""}
          </p>
        </div>

        <Badge
          tone={
            onboardingComplete ? "positive" : onboarding ? "caution" : "neutral"
          }
          size="md"
        >
          {onboardingComplete
            ? "Onboarding complete"
            : onboardingStatusLabel(data.onboardingStatus)}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StepIndicator complete={participantComplete} label="Claimant linked" />

        <StepIndicator complete={identityComplete} label="Identity verified" />

        <StepIndicator
          complete={disclosuresComplete}
          label="Disclosures complete"
        />

        <StepIndicator complete={agreementComplete} label="Agreement signed" />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-critical-200 bg-critical-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-critical-800">
            Action could not be completed
          </p>

          <p className="mt-1 text-xs leading-relaxed text-critical-700">
            {error}
          </p>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-md border border-accent-200 bg-accent-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-accent-800">Saved</p>

          <p className="mt-1 text-xs leading-relaxed text-accent-700">
            {success}
          </p>
        </div>
      )}

      {/* ============================================================ server gate */}
      {gate && !gate.mayAdvance && (
        <div
          role="alert"
          className="rounded-md border border-critical-200 bg-critical-50 px-4 py-4"
        >
          <p className="text-sm font-semibold text-critical-800">
            Claimant onboarding cannot advance
          </p>

          <p className="mt-1 text-xs leading-relaxed text-critical-700">
            The server will refuse every onboarding action on this Claim until
            the controls below are satisfied. Nothing can be recorded in the
            meantime.
          </p>

          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            <GateItem
              clear={gate.jurisdictionClear}
              label="Jurisdiction cleared"
            />

            <GateItem
              clear={gate.startupGreenLaneClear}
              label="Startup Green Lane"
            />

            <GateItem
              clear={gate.legalClear}
              label="Administrative legal lane"
            />

            <GateItem clear={gate.deadlineClear} label="Filing deadline live" />
          </ul>

          <p className="mt-3 text-xs leading-relaxed text-critical-800">
            <span className="font-semibold">Next internal action: </span>

            {gate.nextInternalAction}
          </p>
        </div>
      )}

      {/* ==================================================== jurisdiction provenance */}
      {data.jurisdiction && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-line bg-inset px-3.5 py-2.5 text-2xs text-ink-500">
          <span>
            Jurisdiction{" "}
            <span className="font-mono text-ink-700">
              {data.jurisdiction.stateCode}
            </span>
          </span>

          <span>
            Rule package v
            <span className="font-mono text-ink-700">
              {data.jurisdiction.packageVersion}
            </span>
          </span>

          <span>
            Legal rule{" "}
            <span className="font-mono text-ink-700">
              {data.jurisdiction.legalRuleVersion !== null
                ? `v${data.jurisdiction.legalRuleVersion}`
                : "not versioned"}
            </span>
          </span>
        </div>
      )}

      {/* =========================================================== start onboarding */}
      {!onboarding && (
        <section className="rounded-lg border border-line bg-inset p-4 sm:p-5">
          <div>
            <p className="eyebrow text-ink-500">Step 1</p>

            <h3 className="mt-1 text-base font-semibold text-ink-900">
              Start claimant onboarding
            </h3>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
              Duequity requires both email and a U.S. mobile number to create
              the claimant record. Recording contact information does not record
              consent to call, text or email.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Legal name</FieldLabel>

              <input
                type="text"
                value={data.candidateOwner.legalName}
                readOnly
                className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-sunken px-3 text-sm text-ink-700 outline-none"
              />
            </div>

            <div>
              <FieldLabel>Preferred name</FieldLabel>

              <input
                type="text"
                value={preferredName}
                onChange={(event) => {
                  setPreferredName(event.target.value);
                }}
                placeholder="Optional"
                autoComplete="nickname"
                className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div>
              <FieldLabel>Email address</FieldLabel>

              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                placeholder="elaine@example.com"
                autoComplete="email"
                required
                className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div>
              <FieldLabel>U.S. mobile phone</FieldLabel>

              <input
                type="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(formatUsPhoneInput(event.target.value));
                }}
                placeholder="(301) 201-0293"
                autoComplete="tel"
                inputMode="tel"
                maxLength={14}
                required
                className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />

              <p className="mt-1 text-2xs text-ink-500">
                U.S. 10-digit format, for example (301) 201-0293.
              </p>
            </div>

            <div>
              <FieldLabel>Preferred contact</FieldLabel>

              <select
                value={preferredContactChannel}
                onChange={(event) => {
                  setPreferredContactChannel(
                    event.target.value as PreferredContactChannel,
                  );
                }}
                className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              >
                <option value="email">Email</option>

                <option value="phone_call">Phone call</option>

                <option value="sms">SMS</option>

                <option value="mail">Mail</option>
              </select>
            </div>

            <div>
              <FieldLabel>Preferred language</FieldLabel>

              <select
                value={preferredLanguage}
                onChange={(event) => {
                  setPreferredLanguage(event.target.value);
                }}
                className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              >
                <option value="en">English</option>

                <option value="es">Spanish</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="max-w-2xl text-xs leading-relaxed text-ink-500">
              Starting onboarding creates the claimant and claim-participant
              linkage only. Identity, disclosures, consent and signature remain
              outstanding.
            </p>

            <button
              type="button"
              disabled={controlsLocked || !email.trim() || !phone.trim()}
              onClick={() => {
                void runAction(
                  "start",
                  {
                    action: "start",

                    email,

                    phone,

                    preferredName: preferredName || undefined,

                    preferredLanguage,

                    preferredContactChannel,
                  },
                  "Claimant record and participant linkage created.",
                );
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action === "start"
                ? "Starting onboarding..."
                : "Start onboarding"}
            </button>
          </div>
        </section>
      )}

      {/* =========================================================== existing record */}
      {onboarding && (
        <>
          {/* ------------------------------------------------------- claimant record */}
          <section className="rounded-lg border border-line p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-ink-500">Claimant record</p>

                <h3 className="mt-1 text-base font-semibold text-ink-900">
                  {onboarding.claimant.legalName}
                </h3>

                <p className="mt-1 font-mono text-2xs text-ink-500">
                  {onboarding.claimant.reference}
                </p>
              </div>

              <Badge tone="positive" size="md">
                Linked to claim
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md bg-inset px-3 py-3">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                  Role
                </p>

                <p className="mt-1 text-sm font-medium text-ink-800">
                  Primary claimant
                </p>
              </div>

              <div className="rounded-md bg-inset px-3 py-3">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                  Relationship
                </p>

                <p className="mt-1 text-sm font-medium text-ink-800">
                  Former owner
                </p>
              </div>

              <div className="rounded-md bg-inset px-3 py-3">
                <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
                  Asserted interest
                </p>

                <p className="mt-1 text-sm font-medium text-ink-800">
                  {onboarding.participant.assertedShare !== undefined
                    ? `${Math.round(
                        onboarding.participant.assertedShare * 100,
                      )}%`
                    : "Not recorded"}
                </p>
              </div>
            </div>
          </section>

          {/* --------------------------------------------------------- contact */}
          <section className="rounded-lg border border-line p-4 sm:p-5">
            <div>
              <p className="eyebrow text-ink-500">Contact</p>

              <h3 className="mt-1 text-base font-semibold text-ink-900">
                Required contact details
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                Email and mobile remain required throughout onboarding. Updating
                a contact method clears its verification state when the value
                changes.
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel>Email</FieldLabel>

                  <Badge tone={emailMethod?.verified ? "positive" : "caution"}>
                    {emailMethod?.verified ? "Verified" : "Not verified"}
                  </Badge>
                </div>

                <input
                  type="email"
                  value={contactEmail}
                  onChange={(event) => {
                    setContactEmail(event.target.value);
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel>Mobile</FieldLabel>

                  <Badge tone={mobileMethod?.verified ? "positive" : "caution"}>
                    {mobileMethod?.verified ? "Verified" : "Not verified"}
                  </Badge>
                </div>

                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(event) => {
                    setContactPhone(formatUsPhoneInput(event.target.value));
                  }}
                  placeholder="(301) 201-0293"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={14}
                  className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                />

                <p className="mt-1 text-2xs text-ink-500">
                  U.S. 10-digit format, for example (301) 201-0293.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={controlsLocked}
                onClick={() => {
                  void runAction(
                    "update_contact",
                    {
                      action: "update_contact",

                      email: contactEmail,

                      phone: contactPhone,
                    },
                    "Claimant contact details updated.",
                  );
                }}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink-800 transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action === "update_contact" ? "Saving..." : "Save contact"}
              </button>

              <button
                type="button"
                disabled={controlsLocked || Boolean(emailMethod?.verified)}
                onClick={() => {
                  void runAction(
                    "verify_email",
                    {
                      action: "verify_contact",

                      contactKind: "email",

                      verified: true,
                    },
                    "Email marked verified in the validation workflow.",
                  );
                }}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink-800 transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
              >
                Verify email
              </button>

              <button
                type="button"
                disabled={controlsLocked || Boolean(mobileMethod?.verified)}
                onClick={() => {
                  void runAction(
                    "verify_mobile",
                    {
                      action: "verify_contact",

                      contactKind: "mobile",

                      verified: true,
                    },
                    "Mobile number marked verified in the validation workflow.",
                  );
                }}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink-800 transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
              >
                Verify mobile
              </button>
            </div>

            <p className="mt-3 text-2xs leading-relaxed text-ink-500">
              These verification buttons simulate validated contact verification
              in the local build. Production will require authenticated
              verification evidence.
            </p>
          </section>

          {/* --------------------------------------------------------- consent */}
          <section className="rounded-lg border border-line p-4 sm:p-5">
            <div>
              <p className="eyebrow text-ink-500">Consent</p>

              <h3 className="mt-1 text-base font-semibold text-ink-900">
                Record contact consent separately
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                Having an email address or phone number does not itself
                authorize contact. Record only consent that was actually
                obtained.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={consentEmail}
                  onChange={(event) => {
                    setConsentEmail(event.target.checked);
                  }}
                  className="mt-0.5 h-4 w-4"
                />

                <span>
                  <span className="block text-sm font-medium text-ink-800">
                    Email consent
                  </span>

                  <span className="mt-0.5 block text-xs text-ink-500">
                    Record permission for the email channel.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={consentMobile}
                  onChange={(event) => {
                    setConsentMobile(event.target.checked);
                  }}
                  className="mt-0.5 h-4 w-4"
                />

                <span>
                  <span className="block text-sm font-medium text-ink-800">
                    Mobile channel consent
                  </span>

                  <span className="mt-0.5 block text-xs text-ink-500">
                    Validation-level mobile consent. Production policy can
                    separate SMS and calling consent where required.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <FieldLabel>Consent source</FieldLabel>

              <input
                type="text"
                value={consentSource}
                onChange={(event) => {
                  setConsentSource(event.target.value);
                }}
                placeholder="Example: inbound claimant call, written form, secure portal"
                className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <button
              type="button"
              disabled={
                controlsLocked ||
                (!consentEmail && !consentMobile) ||
                !consentSource.trim()
              }
              onClick={() => {
                const channels: ("email" | "mobile")[] = [];

                if (consentEmail) {
                  channels.push("email");
                }

                if (consentMobile) {
                  channels.push("mobile");
                }

                void runAction(
                  "record_consent",
                  {
                    action: "record_contact_consent",

                    consentChannels: channels,

                    consentSource,
                  },
                  "Claimant contact consent recorded separately from the contact details.",
                );
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink-800 transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action === "record_consent" ? "Recording..." : "Record consent"}
            </button>
          </section>

          {/* -------------------------------------------------------- identity */}
          <section className="rounded-lg border border-line p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-ink-500">Identity</p>

                <h3 className="mt-1 text-base font-semibold text-ink-900">
                  Identity verification
                </h3>
              </div>

              <Badge
                tone={
                  identityComplete
                    ? "positive"
                    : identityStatus === "failed"
                      ? "critical"
                      : "caution"
                }
                size="md"
              >
                {identityLabel(onboarding.claimant.identityVerification)}
              </Badge>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Verification status</FieldLabel>

                <select
                  value={identityStatus}
                  onChange={(event) => {
                    setIdentityStatus(
                      event.target.value as IdentityVerificationStatus,
                    );
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                >
                  <option value="not_started">Not started</option>

                  <option value="documents_requested">
                    Documents requested
                  </option>

                  <option value="under_review">Under review</option>

                  <option value="manual_review">Manual review</option>

                  <option value="verified">Verified</option>

                  <option value="failed">Failed</option>
                </select>
              </div>

              <div>
                <FieldLabel>Provider reference</FieldLabel>

                <input
                  type="text"
                  value={identityProviderRef}
                  onChange={(event) => {
                    setIdentityProviderRef(event.target.value);
                  }}
                  placeholder="Optional opaque validation reference"
                  className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => {
                void runAction(
                  "identity",
                  {
                    action: "set_identity",

                    identityStatus,

                    identityProviderRef: identityProviderRef || undefined,
                  },
                  `Identity status updated to ${identityLabel(
                    identityStatus,
                  ).toLowerCase()}.`,
                );
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink-800 transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action === "identity" ? "Saving..." : "Save identity status"}
            </button>

            <p className="mt-3 text-2xs leading-relaxed text-ink-500">
              No Social Security number, government identifier or identity
              document image is stored on the claimant record.
            </p>
          </section>

          {/* ----------------------------------------------------- disclosures */}
          <section className="rounded-lg border border-line p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-ink-500">Disclosures</p>

                <h3 className="mt-1 text-base font-semibold text-ink-900">
                  Required claimant disclosures
                </h3>

                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  Required acknowledgements are persisted individually. Notices
                  that do not require acknowledgement remain visible but are not
                  treated as signed acknowledgements.
                </p>
              </div>

              <Badge
                tone={disclosuresComplete ? "positive" : "caution"}
                size="md"
              >
                {disclosuresComplete
                  ? "Complete"
                  : `${missingRequiredDisclosureKeys.length} required`}
              </Badge>
            </div>

            <ul className="mt-4 space-y-2">
              {data.disclosures.map((disclosure) => {
                const acknowledged = acknowledgedKeys.has(disclosure.key);

                const pending = pendingDisclosureKeys.includes(disclosure.key);

                return (
                  <li
                    key={disclosure.key}
                    className="rounded-md border border-line px-3.5 py-3"
                  >
                    <div className="flex items-start gap-3">
                      {disclosure.requiresAcknowledgement ? (
                        <input
                          type="checkbox"
                          checked={acknowledged || pending}
                          disabled={acknowledged}
                          onChange={(event) => {
                            setPendingDisclosureKeys((current) => {
                              if (event.target.checked) {
                                return [
                                  ...new Set([...current, disclosure.key]),
                                ];
                              }

                              return current.filter(
                                (key) => key !== disclosure.key,
                              );
                            });
                          }}
                          aria-label={`Acknowledge ${disclosure.text}`}
                          className="mt-1 h-4 w-4 shrink-0"
                        />
                      ) : (
                        <span className="mt-0.5 shrink-0">
                          <Badge tone="neutral">Notice</Badge>
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {disclosure.requiresAcknowledgement && (
                            <Badge tone={acknowledged ? "positive" : "caution"}>
                              {acknowledged
                                ? "Acknowledged"
                                : pending
                                  ? "Selected"
                                  : "Outstanding"}
                            </Badge>
                          )}

                          <span className="font-mono text-2xs text-ink-400">
                            {disclosure.key}
                          </span>
                        </div>

                        <p className="mt-1.5 text-xs leading-relaxed text-ink-700">
                          {disclosure.text}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {pendingDisclosureKeys.length > 0 && (
              <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3">
                <p className="text-xs leading-relaxed text-caution-800">
                  You are about to record {pendingDisclosureKeys.length}{" "}
                  explicit claimant acknowledgement
                  {pendingDisclosureKeys.length === 1 ? "" : "s"}. Only continue
                  if the claimant actually received and acknowledged those
                  disclosures.
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={controlsLocked || pendingDisclosureKeys.length === 0}
              onClick={() => {
                void runAction(
                  "disclosures",
                  {
                    action: "acknowledge_disclosures",

                    disclosureKeys: pendingDisclosureKeys,

                    freeClaimOptionDisclosed:
                      pendingDisclosureKeys.includes("free_claim_option") ||
                      Boolean(onboarding.freeClaimOptionDisclosedAt),
                  },
                  "Selected claimant disclosure acknowledgements recorded.",
                ).then(() => {
                  setPendingDisclosureKeys([]);
                });
              }}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink-800 transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action === "disclosures"
                ? "Recording..."
                : "Record selected acknowledgements"}
            </button>
          </section>

          {/* ------------------------------------------------------ agreement */}
          <section className="rounded-lg border border-line p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-ink-500">Service agreement</p>

                <h3 className="mt-1 text-base font-semibold text-ink-900">
                  Claimant agreement signature
                </h3>
              </div>

              <Badge
                tone={agreementComplete ? "positive" : "caution"}
                size="md"
              >
                {agreementComplete ? "Signed" : "Not signed"}
              </Badge>
            </div>

            {agreementComplete && onboarding.serviceAgreement ? (
              <div className="mt-4 rounded-md border border-accent-200 bg-accent-50 px-4 py-4">
                <p className="text-sm font-semibold text-accent-800">
                  Service agreement recorded
                </p>

                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-500">Signed</dt>

                    <dd className="mt-0.5 font-medium text-ink-800">
                      {onboarding.serviceAgreement.signedAt}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-ink-500">Cancellation deadline</dt>

                    <dd className="mt-0.5 font-medium text-ink-800">
                      {onboarding.serviceAgreement.cancellationDeadline ??
                        "Not recorded"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-ink-500">Claimant</dt>

                    <dd className="mt-0.5 font-mono text-ink-800">
                      {onboarding.serviceAgreement.signedByClaimantId}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-ink-500">Agreement document</dt>

                    <dd className="mt-0.5 font-mono text-ink-800">
                      {onboarding.serviceAgreement.documentId ??
                        "No document reference recorded"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <StepIndicator
                    complete={identityComplete}
                    label="Identity verified"
                  />

                  <StepIndicator
                    complete={disclosuresComplete}
                    label="Required disclosures"
                  />

                  <StepIndicator
                    complete={Boolean(onboarding.freeClaimOptionDisclosedAt)}
                    label="Free claim option"
                  />
                </div>

                <div className="mt-4">
                  <FieldLabel>Executed service-agreement document</FieldLabel>

                  {eligibleAgreementDocuments.length === 0 ? (
                    <div className="mt-1.5 rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3">
                      <p className="text-xs leading-relaxed text-caution-800">
                        No accepted fee-agreement document exists on this Claim.
                        Upload the executed service agreement as a{" "}
                        <span className="font-mono">fee_agreement</span>{" "}
                        document, have it reviewed and accepted, and it will
                        appear here. The server will not record a signature
                        without one.
                      </p>
                    </div>
                  ) : (
                    <>
                      <select
                        value={agreementDocumentId}
                        onChange={(event) => {
                          setAgreementDocumentId(event.target.value);
                        }}
                        className="mt-1.5 min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                      >
                        <option value="">
                          Select the accepted agreement document
                        </option>

                        {eligibleAgreementDocuments.map((document) => (
                          <option key={document.id} value={document.id}>
                            {document.title}
                            {document.originalFileName
                              ? ` — ${document.originalFileName}`
                              : ""}
                          </option>
                        ))}
                      </select>

                      <p className="mt-1 text-2xs text-ink-500">
                        Only accepted internal fee-agreement documents already
                        recorded on this Claim are offered. The server
                        re-verifies the selection.
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-3.5 py-3">
                  <p className="text-xs leading-relaxed text-caution-800">
                    Recording the service agreement is an explicit human action.
                    Do not use this control unless the claimant actually signed
                    the agreement after identity verification and all required
                    disclosures were completed.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    controlsLocked ||
                    !identityComplete ||
                    !disclosuresComplete ||
                    !agreementDocumentId.trim()
                  }
                  onClick={() => {
                    void runAction(
                      "agreement",
                      {
                        action: "sign_agreement",

                        agreementDocumentId: agreementDocumentId.trim(),
                      },
                      "Signed claimant service agreement recorded.",
                    );
                  }}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {action === "agreement"
                    ? "Recording agreement..."
                    : "Record signed agreement"}
                </button>
              </>
            )}
          </section>

          {/* ---------------------------------------------------------- completion */}
          {onboardingComplete && (
            <section className="rounded-lg border border-accent-200 bg-accent-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-accent-900">
                    Claimant onboarding complete
                  </p>

                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-accent-800">
                    The claimant is linked, identity is verified, required
                    disclosures are acknowledged, the free direct-claim option
                    is recorded, and the service agreement is signed.
                  </p>
                </div>

                <Badge tone="positive" size="md">
                  Complete
                </Badge>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-ink-600">
                Completion of onboarding does not automatically make the claim
                filing-ready. Required agency documents, legal controls and any
                claim-specific prerequisites remain independently enforced.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
