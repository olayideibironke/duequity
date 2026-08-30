import {
  Badge,
} from "@/components/ui/badge";

import {
  ProtectedSubmitButton,
} from "@/components/ui/protected-submit-button";

import {
  Callout,
} from "@/components/ui/surface";

import {
  formatCents,
} from "@/lib/format";

import {
  getLatestProspectiveClaimantContact,
} from "@/server/prospective-claimant-contact-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import type {
  ClaimantIntakeDiscoveryCandidate,
} from "@/server/claimant-intake-discovery-service";

import {
  saveInterestedProspectiveClaimantContactAction,
} from "@/app/pro/claimants/onboarding/prospective-contact-actions";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function titleCase(
  value:
    string,
): string {
  return value
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

function promotionTone(
  candidate:
    ClaimantIntakeDiscoveryCandidate,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  switch (
    candidate.promotionState
  ) {
    case "admin_assigned_ready":
    case "ready_for_promotion":
      return "positive";

    case "review_required":
    case "enrichment_required":
      return "caution";

    case "route_blocked":
      return "critical";

    default:
      return "neutral";
  }
}

function promotionTitle(
  candidate:
    ClaimantIntakeDiscoveryCandidate,
): string {
  switch (
    candidate.promotionState
  ) {
    case "admin_assigned_ready":
      return "Admin assigned · Ready for work";

    case "ready_for_promotion":
      return "Ready for Opportunity promotion";

    case "review_required":
      return "Source review required";

    case "enrichment_required":
      return "Additional recovery enrichment required";

    case "route_blocked":
      return "Recovery route blocked";

    default:
      return "Recovery review required";
  }
}

function promotionMessage(
  candidate:
    ClaimantIntakeDiscoveryCandidate,
): string {
  switch (
    candidate.promotionState
  ) {
    case "admin_assigned_ready":
      return "DueQuity Admin has assigned this exact recovery lead to your staff account. Continue your assigned work from this record. Internal research and compliance administration remain controlled by DueQuity and do not block your staff workflow.";

    case "ready_for_promotion":
      return "This source record has been reviewed, its required recovery enrichment is present, and the current DueQuity jurisdiction route is cleared. Internal processing may advance it through the controlled Opportunity workflow.";

    case "review_required":
      return "This source record has not completed DueQuity review yet. Internal recovery review must be completed before it may become an Opportunity.";

    case "enrichment_required":
      return candidate.promotionMissing.length >
        0
        ? `The source record has been reviewed, but internal processing still requires: ${candidate.promotionMissing.join(
            ", ",
          )}.`
        : "The source record has been reviewed, but required recovery enrichment is not complete.";

    case "route_blocked":
      return candidate.route.reason;

    default:
      return "This source record requires controlled recovery review before it can advance.";
  }
}

function formatTimestamp(
  value:
    string,
): string {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    },
  ).format(
    date,
  );
}

function formatUsPhone(
  value:
    string,
): string {
  const digits =
    value.replace(
      /\D/g,
      "",
    );

  if (
    digits.length !==
    10
  ) {
    return value;
  }

  return `(${digits.slice(
    0,
    3,
  )}) ${digits.slice(
    3,
    6,
  )}-${digits.slice(
    6,
  )}`;
}

/* ========================================================================== */
/* Confirmation control                                                        */
/* ========================================================================== */

function ConfirmationControl({
  name,
  children,
  locked,
}: {
  name:
    "propertyConnectionConfirmed" |
    "activationMaterialsConsentConfirmed";

  children:
    React.ReactNode;

  locked:
    boolean;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-xl border px-4 py-4",
        locked
          ? "border-accent-200 bg-accent-50"
          : "border-line bg-inset",
      ].join(
        " ",
      )}
    >
      {locked && (
        <input
          type="hidden"
          name={
            name
          }
          value="confirmed"
        />
      )}

      <input
        type="checkbox"
        name={
          locked
            ? undefined
            : name
        }
        value="confirmed"
        required={
          !locked
        }
        disabled={
          locked
        }
        defaultChecked={
          locked
        }
        className="mt-0.5 size-4"
      />

      <span className="min-w-0 text-sm leading-relaxed text-ink-700">
        {
          children
        }

        {locked && (
          <span className="mt-1 block text-xs font-semibold text-accent-700">
            ✓ Confirmed, saved and locked
          </span>
        )}
      </span>
    </label>
  );
}

/* ========================================================================== */
/* Contact form                                                                */
/* ========================================================================== */

function ProspectiveContactForm({
  candidate,
  defaults,
  update,
}: {
  candidate:
    ClaimantIntakeDiscoveryCandidate;

  defaults?: {
    firstName:
      string;

    lastName:
      string;

    email:
      string;

    mobilePhone:
      string;
  };

  update:
    boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-line bg-white"
      open={
        !update
      }
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 transition hover:bg-inset [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-sm font-semibold text-ink-950">
            {update
              ? "Update confirmed claimant contact"
              : "Claimant wants to proceed"}
          </p>

          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            {update
              ? "Saved confirmations remain locked. Change contact information only when the claimant re-confirms a correction."
              : "Use this after speaking directly with the assigned lead and confirming they want DueQuity to continue."}
          </p>
        </div>

        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-white text-lg text-ink-700 transition-transform duration-200 group-open:rotate-180">
          ↓
        </span>
      </summary>

      <div className="border-t border-line-subtle p-4">
        <form
          action={
            saveInterestedProspectiveClaimantContactAction
          }
          className="space-y-5"
        >
          <input
            type="hidden"
            name="discoveredRecordId"
            value={
              candidate.discoveredRecordId
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor={`prospectiveFirst-${candidate.discoveredRecordId}`}
                className="block text-sm font-semibold text-ink-800"
              >
                Confirmed first name
              </label>

              <input
                id={`prospectiveFirst-${candidate.discoveredRecordId}`}
                name="legalFirstName"
                type="text"
                autoComplete="given-name"
                required
                defaultValue={
                  defaults?.firstName ??
                  ""
                }
                placeholder="First name"
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor={`prospectiveLast-${candidate.discoveredRecordId}`}
                className="block text-sm font-semibold text-ink-800"
              >
                Confirmed last name
              </label>

              <input
                id={`prospectiveLast-${candidate.discoveredRecordId}`}
                name="legalLastName"
                type="text"
                autoComplete="family-name"
                required
                defaultValue={
                  defaults?.lastName ??
                  ""
                }
                placeholder="Last name"
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor={`prospectiveEmail-${candidate.discoveredRecordId}`}
                className="block text-sm font-semibold text-ink-800"
              >
                Confirmed email
              </label>

              <input
                id={`prospectiveEmail-${candidate.discoveredRecordId}`}
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={
                  defaults?.email ??
                  ""
                }
                placeholder="claimant@example.com"
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />

              <p className="text-xs leading-relaxed text-ink-500">
                Read the full email address back to the claimant before saving.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor={`prospectivePhone-${candidate.discoveredRecordId}`}
                className="block text-sm font-semibold text-ink-800"
              >
                Confirmed U.S. mobile
              </label>

              <input
                id={`prospectivePhone-${candidate.discoveredRecordId}`}
                name="mobilePhone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                required
                minLength={10}
                maxLength={10}
                pattern="[0-9]{10}"
                defaultValue={
                  defaults?.mobilePhone ??
                  ""
                }
                placeholder="2025550147"
                title="Enter exactly 10 digits with no spaces or punctuation."
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
              />

              <p className="text-xs leading-relaxed text-ink-500">
                Enter exactly 10 digits. Example: 2025550147.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <ConfirmationControl
              name="propertyConnectionConfirmed"
              locked={
                update
              }
            >
              The claimant confirmed that they previously owned or had an interest in the property shown on this recovery record.
            </ConfirmationControl>

            <ConfirmationControl
              name="activationMaterialsConsentConfirmed"
              locked={
                update
              }
            >
              The claimant wants DueQuity to proceed and gave permission for DueQuity to send onboarding and secure activation materials to the confirmed email address.
            </ConfirmationControl>
          </div>

          {update ? (
            <Callout
              tone="positive"
              title="Confirmations saved"
            >
              The claimant&apos;s property connection and permission to proceed are already recorded. Those confirmations are locked to protect the audit trail. Only corrected claimant contact information should be updated here.
            </Callout>
          ) : (
            <Callout
              tone="neutral"
              title="Assigned lead record"
            >
              Saving this form records the verified claimant contact and consent on this exact Admin-assigned recovery lead. Your assigned workflow remains active after the contact is saved.
            </Callout>
          )}

          <div className="flex justify-end">
            <ProtectedSubmitButton
              label={
                update
                  ? "Save updated contact"
                  : "Save claimant contact"
              }
              pendingLabel={
                update
                  ? "Saving updated contact…"
                  : "Saving claimant contact…"
              }
              successLabel={
                update
                  ? "✓ Contact saved"
                  : "✓ Claimant contact saved"
              }
              requireDirty={
                update
              }
              className="min-w-52"
            />
          </div>
        </form>
      </div>
    </details>
  );
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export async function ClaimantIntakeDiscoveryCard({
  candidate,
}: {
  candidate:
    ClaimantIntakeDiscoveryCandidate;
}) {
  const session =
    await resolveStaffSession();

  const savedContact =
    session
      ? await getLatestProspectiveClaimantContact({
          session,

          discoveredRecordId:
            candidate.discoveredRecordId,
        })
      : undefined;

  const assignmentAuthorized =
    candidate.staffWorkAuthorized;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="border-b border-line-subtle px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-ink-950 px-2.5 py-1 font-mono text-xs font-semibold text-white">
                {
                  candidate.discoveredRecordId
                }
              </span>

              <Badge
                tone={
                  assignmentAuthorized
                    ? "info"
                    : "neutral"
                }
              >
                {assignmentAuthorized
                  ? "Assigned recovery lead"
                  : "Discovery record"}
              </Badge>

              {assignmentAuthorized ? (
                <Badge tone="positive">
                  READY · Admin assigned
                </Badge>
              ) : (
                <Badge
                  tone={
                    candidate.route.intakeCleared
                      ? "positive"
                      : candidate.route.code ===
                          "ATTY"
                        ? "caution"
                        : "critical"
                  }
                >
                  {
                    candidate.route.code
                  }{" "}
                  ·{" "}
                  {
                    candidate.route.label
                  }
                </Badge>
              )}

              {!assignmentAuthorized && (
                <Badge
                  tone={
                    candidate.stage ===
                    "discovered_reviewed"
                      ? "info"
                      : "caution"
                  }
                >
                  {
                    candidate.stage ===
                    "discovered_reviewed"
                      ? "Reviewed"
                      : "New source record"
                  }
                </Badge>
              )}

              {savedContact && (
                <Badge tone="positive">
                  Interested · Contact saved
                </Badge>
              )}
            </div>

            <h3 className="mt-3 text-lg font-semibold text-ink-950">
              {
                candidate.formerOwnerName
              }
            </h3>

            <p className="mt-1 text-sm leading-relaxed text-ink-600">
              {
                candidate.propertyAddress
              }
            </p>
          </div>

          {candidate.sourceListedBalanceCents !==
            undefined && (
            <div className="text-right">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                Source-listed surplus
              </p>

              <p className="mt-1 tnum text-lg font-semibold text-ink-950">
                {formatCents(
                  candidate.sourceListedBalanceCents,
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="border-b border-line-subtle px-5 py-5 lg:border-b-0 lg:border-r">
          <p className="eyebrow text-ink-500">
            {assignmentAuthorized
              ? "Assigned recovery information"
              : "Government / source record"}
          </p>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-ink-500">
                Former owner
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {
                  candidate.formerOwnerName
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                County / state
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {
                  candidate.county
                },{" "}
                {
                  candidate.state
                }
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-ink-500">
                Property
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {
                  candidate.propertyAddress
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Parcel
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  candidate.parcelNumber ??
                  "Not recorded"
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Case number
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  candidate.caseNumber ??
                  "Not recorded"
                }
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Sale type
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {titleCase(
                  candidate.saleType,
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-ink-500">
                Work status
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-900">
                {assignmentAuthorized
                  ? "Ready for staff work"
                  : candidate.stage ===
                      "discovered_reviewed"
                    ? "Discovery reviewed"
                    : "Discovery awaiting review"}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-ink-500">
                Source
              </dt>

              <dd className="mt-1 text-sm text-ink-800">
                {
                  candidate.sourceName
                }
              </dd>
            </div>
          </dl>
        </div>

        <div className="px-5 py-5">
          {assignmentAuthorized ? (
            <>
              <p className="eyebrow text-ink-500">
                Work authorization
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-ink-950 px-3 py-1.5 font-mono text-sm font-bold tracking-wide text-white">
                  READY
                </span>

                <Badge tone="positive">
                  Admin assigned
                </Badge>
              </div>

              <Callout
                className="mt-5"
                tone="positive"
                title="Ready for staff work"
              >
                DueQuity Admin assigned this exact lead to your account. Continue the claimant contact and operational workflow from here. Internal jurisdiction, research and compliance administration remain controlled by DueQuity and are not staff-facing blockers.
              </Callout>

              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Assignment does not expose unrelated recovery records and does not allow staff to change DueQuity legal, payment, fee or jurisdiction controls.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow text-ink-500">
                DueQuity recovery route
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-ink-950 px-3 py-1.5 font-mono text-sm font-bold tracking-wide text-white">
                  {
                    candidate.route.code
                  }
                </span>

                <Badge
                  tone={
                    candidate.route.intakeCleared
                      ? "positive"
                      : candidate.route.code ===
                          "ATTY"
                        ? "caution"
                        : "critical"
                  }
                >
                  {
                    candidate.route.label
                  }
                </Badge>
              </div>

              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="text-xs font-medium text-ink-500">
                    Filing control
                  </dt>

                  <dd className="mt-1 text-sm font-semibold text-ink-900">
                    {
                      candidate.route.filingPartyLabel
                    }
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium text-ink-500">
                    Payment route
                  </dt>

                  <dd className="mt-1 text-sm font-semibold text-ink-900">
                    {
                      candidate.route.paymentRouteLabel
                    }
                  </dd>
                </div>
              </dl>

              <Callout
                className="mt-5"
                tone={
                  candidate.route.intakeCleared
                    ? "positive"
                    : candidate.route.code ===
                        "ATTY"
                      ? "caution"
                      : "critical"
                }
                title={
                  candidate.route.intakeCleared
                    ? "Jurisdiction route identified"
                    : "Route not cleared"
                }
              >
                {
                  candidate.route.reason
                }
              </Callout>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-line-subtle px-5 py-5">
        <Callout
          tone={
            promotionTone(
              candidate,
            )
          }
          title={
            promotionTitle(
              candidate,
            )
          }
        >
          {
            promotionMessage(
              candidate,
            )
          }
        </Callout>
      </div>

      <div className="border-t border-line-subtle bg-inset px-5 py-6">
        <p className="eyebrow text-accent-700">
          Claimant contact
        </p>

        <h4 className="mt-1 text-lg font-semibold text-ink-950">
          Post-call intake
        </h4>

        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-600">
          Record verified claimant contact after speaking directly with this assigned lead.
        </p>

        {savedContact ? (
          <div className="mt-5 space-y-4">
            <Callout
              tone="positive"
              title="Claimant interested · Contact saved"
            >
              The claimant&apos;s confirmed contact information is attached to this assigned recovery and remains available as the staff workflow continues.
            </Callout>

            <div className="rounded-2xl border border-line bg-white p-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-ink-500">
                    Confirmed claimant
                  </dt>

                  <dd className="mt-1 text-sm font-semibold text-ink-950">
                    {savedContact.confirmedLegalFirstName}{" "}
                    {savedContact.confirmedLegalLastName}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium text-ink-500">
                    Contact status
                  </dt>

                  <dd className="mt-1">
                    <Badge tone="positive">
                      Interested
                    </Badge>
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium text-ink-500">
                    Confirmed email
                  </dt>

                  <dd className="mt-1 text-sm font-semibold text-ink-900">
                    {
                      savedContact.confirmedEmail
                    }
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium text-ink-500">
                    Confirmed mobile
                  </dt>

                  <dd className="mt-1 text-sm font-semibold text-ink-900">
                    {formatUsPhone(
                      savedContact.confirmedMobilePhone,
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium text-ink-500">
                    Property connection
                  </dt>

                  <dd className="mt-1 text-sm font-semibold text-accent-700">
                    Confirmed
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium text-ink-500">
                    Email / activation permission
                  </dt>

                  <dd className="mt-1 text-sm font-semibold text-accent-700">
                    Confirmed
                  </dd>
                </div>

                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-ink-500">
                    Saved
                  </dt>

                  <dd className="mt-1 text-sm text-ink-700">
                    {formatTimestamp(
                      savedContact.capturedAt,
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {assignmentAuthorized ? (
              <Callout
                tone="positive"
                title="Assigned workflow remains active"
              >
                This contact belongs to your Admin-assigned lead. Continue the staff workflow without returning to the confidential Discovery database for clearance.
              </Callout>
            ) : (
              <Callout
                tone="caution"
                title="Internal recovery processing pending"
              >
                The verified claimant contact is safely recorded. DueQuity still must complete the applicable internal processing controls before official claimant creation.
              </Callout>
            )}

            <ProspectiveContactForm
              candidate={
                candidate
              }
              defaults={{
                firstName:
                  savedContact.confirmedLegalFirstName,

                lastName:
                  savedContact.confirmedLegalLastName,

                email:
                  savedContact.confirmedEmail,

                mobilePhone:
                  savedContact.confirmedMobilePhone,
              }}
              update
            />
          </div>
        ) : assignmentAuthorized ||
          candidate.route.intakeCleared ? (
          <div className="mt-5">
            <ProspectiveContactForm
              candidate={
                candidate
              }
              update={
                false
              }
            />
          </div>
        ) : (
          <Callout
            className="mt-5"
            tone="critical"
            title="Contact intake blocked"
          >
            DueQuity does not currently have a cleared intake route for this recovery.
          </Callout>
        )}
      </div>

      <div className="border-t border-line-subtle px-5 py-5">
        {assignmentAuthorized ? (
          <>
            <p className="text-sm font-semibold text-ink-900">
              Admin-controlled assignment
            </p>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
              Your authority to work this recovery comes from the active Admin assignment. Access ends if Admin reassigns or closes the assignment. The assignment does not expose unrelated DueQuity records and does not let staff alter legal filing, payment, pricing or jurisdiction controls.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-ink-900">
              Claimant creation is not available yet
            </p>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
              This record remains in the Administrator-controlled Discovery workflow until the internal Opportunity and Claim controls are satisfied.
            </p>
          </>
        )}
      </div>
    </div>
  );
}