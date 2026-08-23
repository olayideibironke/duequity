"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import type {
  ClaimantLocatorAssociatedContact,
  ClaimantLocatorCandidate,
  ClaimantLocatorCandidateKind,
  ClaimantLocatorCandidateStatus,
  ClaimantLocatorIdentityCandidate,
  ClaimantLocatorIdentityKind,
} from "@/server/discovered-record-enrichment-store";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface LocatorResponse {
  ok: boolean;

  error?: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function candidateKindLabel(
  kind: ClaimantLocatorCandidateKind,
): string {
  switch (
    kind
  ) {
    case "phone":
      return "Phone";

    case "email":
      return "Email";

    case "mailing_address":
      return "Mailing address";
  }
}

function identityKindLabel(
  kind: ClaimantLocatorIdentityKind,
): string {
  switch (
    kind
  ) {
    case "first_name":
      return "First name";

    case "last_name":
      return "Last name";

    case "alias":
      return "Alias / alternate name";
  }
}

function statusClasses(
  status: ClaimantLocatorCandidateStatus,
): string {
  if (
    status === "verified"
  ) {
    return "border-positive-200 bg-positive-50 text-positive-800";
  }

  if (
    status === "rejected"
  ) {
    return "border-critical-200 bg-critical-50 text-critical-800";
  }

  return "border-caution-200 bg-caution-50 text-caution-800";
}

function statusLabel(
  status: ClaimantLocatorCandidateStatus,
): string {
  if (
    status === "verified"
  ) {
    return "Verified";
  }

  if (
    status === "rejected"
  ) {
    return "Rejected";
  }

  return "Candidate";
}

function sortByFoundAt<
  T extends {
    foundAt: string;
  },
>(
  items: T[],
): T[] {
  return [
    ...items,
  ].sort(
    (
      left,
      right,
    ) =>
      new Date(
        right.foundAt,
      ).getTime() -
      new Date(
        left.foundAt,
      ).getTime(),
  );
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimantLocatorControls({
  recordId,
  candidates,
  identities = [],
  associatedContacts = [],
}: {
  recordId: string;

  candidates: ClaimantLocatorCandidate[];

  identities?: ClaimantLocatorIdentityCandidate[];

  associatedContacts?: ClaimantLocatorAssociatedContact[];
}) {
  const router =
    useRouter();

  /* ======================================================================== */
  /* Claimant contact                                                         */
  /* ======================================================================== */

  const [
    kind,
    setKind,
  ] =
    useState<ClaimantLocatorCandidateKind>(
      "phone",
    );

  const [
    value,
    setValue,
  ] =
    useState(
      "",
    );

  const [
    sourceName,
    setSourceName,
  ] =
    useState(
      "",
    );

  const [
    sourceUrl,
    setSourceUrl,
  ] =
    useState(
      "",
    );

  const [
    sourceDate,
    setSourceDate,
  ] =
    useState(
      "",
    );

  /* ======================================================================== */
  /* Identity                                                                 */
  /* ======================================================================== */

  const [
    identityKind,
    setIdentityKind,
  ] =
    useState<ClaimantLocatorIdentityKind>(
      "first_name",
    );

  const [
    identityValue,
    setIdentityValue,
  ] =
    useState(
      "",
    );

  const [
    identitySourceName,
    setIdentitySourceName,
  ] =
    useState(
      "",
    );

  const [
    identitySourceUrl,
    setIdentitySourceUrl,
  ] =
    useState(
      "",
    );

  const [
    identitySourceDate,
    setIdentitySourceDate,
  ] =
    useState(
      "",
    );

  /* ======================================================================== */
  /* Associated contact                                                       */
  /* ======================================================================== */

  const [
    associatedName,
    setAssociatedName,
  ] =
    useState(
      "",
    );

  const [
    associatedRelationship,
    setAssociatedRelationship,
  ] =
    useState(
      "",
    );

  const [
    associatedPhone,
    setAssociatedPhone,
  ] =
    useState(
      "",
    );

  const [
    associatedEmail,
    setAssociatedEmail,
  ] =
    useState(
      "",
    );

  const [
    associatedSourceName,
    setAssociatedSourceName,
  ] =
    useState(
      "",
    );

  const [
    associatedSourceUrl,
    setAssociatedSourceUrl,
  ] =
    useState(
      "",
    );

  const [
    associatedSourceDate,
    setAssociatedSourceDate,
  ] =
    useState(
      "",
    );

  /* ======================================================================== */
  /* Shared state                                                             */
  /* ======================================================================== */

  const [
    reviewNotes,
    setReviewNotes,
  ] =
    useState<Record<string, string>>(
      {},
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState<string | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    success,
    setSuccess,
  ] =
    useState<string | null>(
      null,
    );

  const sortedCandidates =
    useMemo(
      () =>
        sortByFoundAt(
          candidates,
        ),
      [
        candidates,
      ],
    );

  const sortedIdentities =
    useMemo(
      () =>
        sortByFoundAt(
          identities,
        ),
      [
        identities,
      ],
    );

  const sortedAssociatedContacts =
    useMemo(
      () =>
        sortByFoundAt(
          associatedContacts,
        ),
      [
        associatedContacts,
      ],
    );

  async function postLocator(
    body: Record<string, unknown>,
  ): Promise<LocatorResponse> {
    const response =
      await fetch(
        `/api/pro/discovered-records/${encodeURIComponent(recordId)}/claimant-locator`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              body,
            ),
        },
      );

    const payload =
      await response.json() as LocatorResponse;

    if (
      !response.ok ||
      !payload.ok
    ) {
      throw new Error(
        payload.error ??
          "Unable to update claimant locator research.",
      );
    }

    return payload;
  }

  /* ======================================================================== */
  /* Add claimant contact                                                     */
  /* ======================================================================== */

  async function addCandidate() {
    if (
      submitting
    ) {
      return;
    }

    if (
      !value.trim() ||
      !sourceName.trim() ||
      !sourceDate.trim()
    ) {
      setError(
        "Candidate value, source name, and source date are required.",
      );

      return;
    }

    setSubmitting(
      "add",
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );

    try {
      await postLocator({
        action:
          "add",

        kind,

        value:
          value.trim(),

        sourceName:
          sourceName.trim(),

        sourceUrl:
          sourceUrl.trim() ||
          undefined,

        sourceDate:
          sourceDate.trim(),
      });

      setValue(
        "",
      );

      setSourceName(
        "",
      );

      setSourceUrl(
        "",
      );

      setSourceDate(
        "",
      );

      setSuccess(
        "Contact finding recorded. It remains unverified.",
      );

      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to record claimant contact finding.",
      );
    } finally {
      setSubmitting(
        null,
      );
    }
  }

  /* ======================================================================== */
  /* Add identity                                                             */
  /* ======================================================================== */

  async function addIdentity() {
    if (
      submitting
    ) {
      return;
    }

    if (
      !identityValue.trim() ||
      !identitySourceName.trim() ||
      !identitySourceDate.trim()
    ) {
      setError(
        "Identity value, source name, and source date are required.",
      );

      return;
    }

    setSubmitting(
      "add_identity",
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );

    try {
      await postLocator({
        action:
          "add_identity",

        kind:
          identityKind,

        value:
          identityValue.trim(),

        sourceName:
          identitySourceName.trim(),

        sourceUrl:
          identitySourceUrl.trim() ||
          undefined,

        sourceDate:
          identitySourceDate.trim(),
      });

      setIdentityValue(
        "",
      );

      setIdentitySourceName(
        "",
      );

      setIdentitySourceUrl(
        "",
      );

      setIdentitySourceDate(
        "",
      );

      setSuccess(
        "Identity finding recorded. It remains unverified.",
      );

      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to record claimant identity finding.",
      );
    } finally {
      setSubmitting(
        null,
      );
    }
  }

  /* ======================================================================== */
  /* Add associated contact                                                   */
  /* ======================================================================== */

  async function addAssociatedContact() {
    if (
      submitting
    ) {
      return;
    }

    if (
      !associatedName.trim() ||
      (
        !associatedPhone.trim() &&
        !associatedEmail.trim()
      ) ||
      !associatedSourceName.trim() ||
      !associatedSourceDate.trim()
    ) {
      setError(
        "Associated contact name, at least one phone or email, source name, and source date are required.",
      );

      return;
    }

    setSubmitting(
      "add_associated_contact",
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );

    try {
      await postLocator({
        action:
          "add_associated_contact",

        name:
          associatedName.trim(),

        relationship:
          associatedRelationship.trim() ||
          undefined,

        phone:
          associatedPhone.trim() ||
          undefined,

        email:
          associatedEmail.trim() ||
          undefined,

        sourceName:
          associatedSourceName.trim(),

        sourceUrl:
          associatedSourceUrl.trim() ||
          undefined,

        sourceDate:
          associatedSourceDate.trim(),
      });

      setAssociatedName(
        "",
      );

      setAssociatedRelationship(
        "",
      );

      setAssociatedPhone(
        "",
      );

      setAssociatedEmail(
        "",
      );

      setAssociatedSourceName(
        "",
      );

      setAssociatedSourceUrl(
        "",
      );

      setAssociatedSourceDate(
        "",
      );

      setSuccess(
        "Associated contact finding recorded. It remains separate from the claimant and unverified.",
      );

      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to record associated contact finding.",
      );
    } finally {
      setSubmitting(
        null,
      );
    }
  }

  /* ======================================================================== */
  /* Review claimant contact                                                  */
  /* ======================================================================== */

  async function reviewCandidate(
    candidate: ClaimantLocatorCandidate,
    action:
      | "verify"
      | "reject",
  ) {
    if (
      submitting
    ) {
      return;
    }

    const submissionKey =
      `${action}:${candidate.id}`;

    setSubmitting(
      submissionKey,
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );

    try {
      await postLocator({
        action,

        candidateId:
          candidate.id,

        reviewNote:
          reviewNotes[
            candidate.id
          ]?.trim() ||
          undefined,
      });

      setSuccess(
        action === "verify"
          ? "Contact finding verified. Outreach is still not authorized."
          : "Contact finding rejected.",
      );

      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to review claimant contact finding.",
      );
    } finally {
      setSubmitting(
        null,
      );
    }
  }

  /* ======================================================================== */
  /* Review identity                                                          */
  /* ======================================================================== */

  async function reviewIdentity(
    candidate: ClaimantLocatorIdentityCandidate,
    action:
      | "verify_identity"
      | "reject_identity",
  ) {
    if (
      submitting
    ) {
      return;
    }

    const submissionKey =
      `${action}:${candidate.id}`;

    setSubmitting(
      submissionKey,
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );

    try {
      await postLocator({
        action,

        candidateId:
          candidate.id,

        reviewNote:
          reviewNotes[
            candidate.id
          ]?.trim() ||
          undefined,
      });

      setSuccess(
        action === "verify_identity"
          ? "Identity finding verified. Outreach is still not authorized."
          : "Identity finding rejected.",
      );

      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to review claimant identity finding.",
      );
    } finally {
      setSubmitting(
        null,
      );
    }
  }

  /* ======================================================================== */
  /* Review associated contact                                                */
  /* ======================================================================== */

  async function reviewAssociatedContact(
    candidate: ClaimantLocatorAssociatedContact,
    action:
      | "verify_associated_contact"
      | "reject_associated_contact",
  ) {
    if (
      submitting
    ) {
      return;
    }

    const submissionKey =
      `${action}:${candidate.id}`;

    setSubmitting(
      submissionKey,
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );

    try {
      await postLocator({
        action,

        candidateId:
          candidate.id,

        reviewNote:
          reviewNotes[
            candidate.id
          ]?.trim() ||
          undefined,
      });

      setSuccess(
        action === "verify_associated_contact"
          ? "Associated contact finding verified. The person remains separate from the claimant."
          : "Associated contact finding rejected.",
      );

      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to review associated contact finding.",
      );
    } finally {
      setSubmitting(
        null,
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-caution-200 bg-caution-50 px-4 py-3.5">
        <p className="text-sm font-semibold text-caution-900">
          Research findings only
        </p>

        <p className="mt-1 text-xs leading-relaxed text-caution-800">
          Locator data is not claimant identity proof. Staff must verify
          research findings before Duequity may rely on them. Verification does
          not authorize outreach, create a claimant account, or convert an
          associated person into the claimant.
        </p>
      </div>

      {/* ========================================================== identity */}
      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            Claimant identity research
          </p>

          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            Record first name, last name, or aliases only when supported by a
            researched source. Do not split or infer names from the county
            owner field.
          </p>
        </div>

        <div className="grid gap-4 rounded-md border border-line bg-inset p-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="claimant-identity-kind"
              className="block text-xs font-semibold text-ink-700"
            >
              Identity type
            </label>

            <select
              id="claimant-identity-kind"
              value={identityKind}
              onChange={(event) =>
                setIdentityKind(
                  event.target.value as ClaimantLocatorIdentityKind,
                )
              }
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            >
              <option value="first_name">
                First name
              </option>

              <option value="last_name">
                Last name
              </option>

              <option value="alias">
                Alias / alternate name
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="claimant-identity-value"
              className="block text-xs font-semibold text-ink-700"
            >
              Identity value
            </label>

            <input
              id="claimant-identity-value"
              type="text"
              value={identityValue}
              onChange={(event) =>
                setIdentityValue(
                  event.target.value,
                )
              }
              placeholder={
                identityKind === "first_name"
                  ? "Verified or researched first name"
                  : identityKind === "last_name"
                    ? "Verified or researched last name"
                    : "Alias or alternate name"
              }
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="claimant-identity-source-name"
              className="block text-xs font-semibold text-ink-700"
            >
              Source name
            </label>

            <input
              id="claimant-identity-source-name"
              type="text"
              value={identitySourceName}
              onChange={(event) =>
                setIdentitySourceName(
                  event.target.value,
                )
              }
              placeholder="Research source"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="claimant-identity-source-date"
              className="block text-xs font-semibold text-ink-700"
            >
              Source date
            </label>

            <input
              id="claimant-identity-source-date"
              type="date"
              value={identitySourceDate}
              onChange={(event) =>
                setIdentitySourceDate(
                  event.target.value,
                )
              }
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="claimant-identity-source-url"
              className="block text-xs font-semibold text-ink-700"
            >
              Source URL
            </label>

            <input
              id="claimant-identity-source-url"
              type="url"
              value={identitySourceUrl}
              onChange={(event) =>
                setIdentitySourceUrl(
                  event.target.value,
                )
              }
              placeholder="https://"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={submitting !== null}
              onClick={() =>
                void addIdentity()
              }
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === "add_identity"
                ? "Recording..."
                : "Record identity finding"}
            </button>
          </div>
        </div>

        {sortedIdentities.length === 0 ? (
          <div className="rounded-md border border-line bg-paper px-4 py-4">
            <p className="text-xs text-ink-500">
              No claimant identity findings recorded.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedIdentities.map(
              (candidate) => {
                const verifyKey =
                  `verify_identity:${candidate.id}`;

                const rejectKey =
                  `reject_identity:${candidate.id}`;

                return (
                  <div
                    key={candidate.id}
                    className="rounded-md border border-line bg-paper p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                          {identityKindLabel(
                            candidate.kind,
                          )}
                        </p>

                        <p className="mt-1 break-words text-sm font-semibold text-ink-900">
                          {candidate.value}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-2xs font-semibold ${statusClasses(
                          candidate.status,
                        )}`}
                      >
                        {statusLabel(
                          candidate.status,
                        )}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
                      <p>
                        Source:{" "}
                        <span className="font-medium text-ink-700">
                          {candidate.source.sourceName}
                        </span>
                      </p>

                      <p>
                        Source date:{" "}
                        <span className="font-medium text-ink-700">
                          {candidate.source.sourceDate}
                        </span>
                      </p>

                      {candidate.source.sourceUrl && (
                        <p className="sm:col-span-2">
                          <a
                            href={candidate.source.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                          >
                            Open researched source
                          </a>
                        </p>
                      )}
                    </div>

                    {candidate.reviewNote && (
                      <div className="mt-3 rounded-md border border-line bg-inset px-3 py-2.5">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                          Review note
                        </p>

                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-700">
                          {candidate.reviewNote}
                        </p>
                      </div>
                    )}

                    {candidate.status === "candidate" && (
                      <div className="mt-4 border-t border-line pt-4">
                        <label
                          htmlFor={`identity-review-${candidate.id}`}
                          className="block text-xs font-semibold text-ink-700"
                        >
                          Verification note
                        </label>

                        <textarea
                          id={`identity-review-${candidate.id}`}
                          value={
                            reviewNotes[
                              candidate.id
                            ] ?? ""
                          }
                          onChange={(event) =>
                            setReviewNotes(
                              (
                                current,
                              ) => ({
                                ...current,

                                [candidate.id]:
                                  event.target.value,
                              }),
                            )
                          }
                          rows={3}
                          maxLength={2000}
                          className="mt-1.5 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
                        />

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={submitting !== null}
                            onClick={() =>
                              void reviewIdentity(
                                candidate,
                                "verify_identity",
                              )
                            }
                            className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting === verifyKey
                              ? "Verifying..."
                              : "Mark verified"}
                          </button>

                          <button
                            type="button"
                            disabled={submitting !== null}
                            onClick={() =>
                              void reviewIdentity(
                                candidate,
                                "reject_identity",
                              )
                            }
                            className="inline-flex min-h-9 items-center justify-center rounded-md border border-critical-300 bg-paper px-3.5 py-2 text-sm font-semibold text-critical-700 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting === rejectKey
                              ? "Rejecting..."
                              : "Reject finding"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
        )}
      </section>

      {/* ================================================= claimant contact */}
      <section className="space-y-3 border-t border-line pt-6">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            Claimant contact research
          </p>

          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            Record located phone numbers, email addresses, and current mailing
            address candidates with their source.
          </p>
        </div>

        <div className="grid gap-4 rounded-md border border-line bg-inset p-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="claimant-locator-kind"
              className="block text-xs font-semibold text-ink-700"
            >
              Candidate type
            </label>

            <select
              id="claimant-locator-kind"
              value={kind}
              onChange={(event) =>
                setKind(
                  event.target.value as ClaimantLocatorCandidateKind,
                )
              }
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            >
              <option value="phone">
                Phone
              </option>

              <option value="email">
                Email
              </option>

              <option value="mailing_address">
                Mailing address
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="claimant-locator-value"
              className="block text-xs font-semibold text-ink-700"
            >
              Candidate value
            </label>

            <input
              id="claimant-locator-value"
              type={
                kind === "email"
                  ? "email"
                  : kind === "phone"
                    ? "tel"
                    : "text"
              }
              value={value}
              onChange={(event) =>
                setValue(
                  event.target.value,
                )
              }
              placeholder={
                kind === "phone"
                  ? "(555) 123-4567"
                  : kind === "email"
                    ? "name@example.com"
                    : "Current mailing address from researched source"
              }
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="claimant-locator-source-name"
              className="block text-xs font-semibold text-ink-700"
            >
              Source name
            </label>

            <input
              id="claimant-locator-source-name"
              type="text"
              value={sourceName}
              onChange={(event) =>
                setSourceName(
                  event.target.value,
                )
              }
              placeholder="Name of researched source"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="claimant-locator-source-date"
              className="block text-xs font-semibold text-ink-700"
            >
              Source date
            </label>

            <input
              id="claimant-locator-source-date"
              type="date"
              value={sourceDate}
              onChange={(event) =>
                setSourceDate(
                  event.target.value,
                )
              }
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="claimant-locator-source-url"
              className="block text-xs font-semibold text-ink-700"
            >
              Source URL
            </label>

            <input
              id="claimant-locator-source-url"
              type="url"
              value={sourceUrl}
              onChange={(event) =>
                setSourceUrl(
                  event.target.value,
                )
              }
              placeholder="https://"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={submitting !== null}
              onClick={() =>
                void addCandidate()
              }
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === "add"
                ? "Recording..."
                : "Record contact finding"}
            </button>
          </div>
        </div>

        {sortedCandidates.length === 0 ? (
          <div className="rounded-md border border-line bg-paper px-4 py-4">
            <p className="text-xs text-ink-500">
              No claimant contact findings recorded.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCandidates.map(
              (candidate) => {
                const verifyKey =
                  `verify:${candidate.id}`;

                const rejectKey =
                  `reject:${candidate.id}`;

                return (
                  <div
                    key={candidate.id}
                    className="rounded-md border border-line bg-paper p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                          {candidateKindLabel(
                            candidate.kind,
                          )}
                        </p>

                        <p className="mt-1 break-words text-sm font-semibold text-ink-900">
                          {candidate.value}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-2xs font-semibold ${statusClasses(
                          candidate.status,
                        )}`}
                      >
                        {statusLabel(
                          candidate.status,
                        )}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
                      <p>
                        Source:{" "}
                        <span className="font-medium text-ink-700">
                          {candidate.source.sourceName}
                        </span>
                      </p>

                      <p>
                        Source date:{" "}
                        <span className="font-medium text-ink-700">
                          {candidate.source.sourceDate}
                        </span>
                      </p>

                      {candidate.source.sourceUrl && (
                        <p className="sm:col-span-2">
                          <a
                            href={candidate.source.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                          >
                            Open researched source
                          </a>
                        </p>
                      )}
                    </div>

                    {candidate.reviewNote && (
                      <div className="mt-3 rounded-md border border-line bg-inset px-3 py-2.5">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                          Review note
                        </p>

                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-700">
                          {candidate.reviewNote}
                        </p>
                      </div>
                    )}

                    {candidate.status === "candidate" && (
                      <div className="mt-4 border-t border-line pt-4">
                        <label
                          htmlFor={`locator-review-note-${candidate.id}`}
                          className="block text-xs font-semibold text-ink-700"
                        >
                          Verification note
                        </label>

                        <textarea
                          id={`locator-review-note-${candidate.id}`}
                          value={
                            reviewNotes[
                              candidate.id
                            ] ?? ""
                          }
                          onChange={(event) =>
                            setReviewNotes(
                              (
                                current,
                              ) => ({
                                ...current,

                                [candidate.id]:
                                  event.target.value,
                              }),
                            )
                          }
                          rows={3}
                          maxLength={2000}
                          className="mt-1.5 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
                        />

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={submitting !== null}
                            onClick={() =>
                              void reviewCandidate(
                                candidate,
                                "verify",
                              )
                            }
                            className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting === verifyKey
                              ? "Verifying..."
                              : "Mark verified"}
                          </button>

                          <button
                            type="button"
                            disabled={submitting !== null}
                            onClick={() =>
                              void reviewCandidate(
                                candidate,
                                "reject",
                              )
                            }
                            className="inline-flex min-h-9 items-center justify-center rounded-md border border-critical-300 bg-paper px-3.5 py-2 text-sm font-semibold text-critical-700 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting === rejectKey
                              ? "Rejecting..."
                              : "Reject finding"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
        )}
      </section>

      {/* =============================================== associated contacts */}
      <section className="space-y-3 border-t border-line pt-6">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            Relative / associated contact research
          </p>

          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            Record a relative or associated person only when lawfully obtained
            from a research source. This person remains distinct from the
            claimant.
          </p>
        </div>

        <div className="grid gap-4 rounded-md border border-line bg-inset p-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="associated-contact-name"
              className="block text-xs font-semibold text-ink-700"
            >
              Contact name
            </label>

            <input
              id="associated-contact-name"
              type="text"
              value={associatedName}
              onChange={(event) =>
                setAssociatedName(
                  event.target.value,
                )
              }
              placeholder="Associated person's name"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="associated-contact-relationship"
              className="block text-xs font-semibold text-ink-700"
            >
              Relationship
            </label>

            <input
              id="associated-contact-relationship"
              type="text"
              value={associatedRelationship}
              onChange={(event) =>
                setAssociatedRelationship(
                  event.target.value,
                )
              }
              placeholder="Relative, spouse, associate, unknown"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="associated-contact-phone"
              className="block text-xs font-semibold text-ink-700"
            >
              Phone
            </label>

            <input
              id="associated-contact-phone"
              type="tel"
              value={associatedPhone}
              onChange={(event) =>
                setAssociatedPhone(
                  event.target.value,
                )
              }
              placeholder="(555) 123-4567"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="associated-contact-email"
              className="block text-xs font-semibold text-ink-700"
            >
              Email
            </label>

            <input
              id="associated-contact-email"
              type="email"
              value={associatedEmail}
              onChange={(event) =>
                setAssociatedEmail(
                  event.target.value,
                )
              }
              placeholder="name@example.com"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="associated-contact-source-name"
              className="block text-xs font-semibold text-ink-700"
            >
              Source name
            </label>

            <input
              id="associated-contact-source-name"
              type="text"
              value={associatedSourceName}
              onChange={(event) =>
                setAssociatedSourceName(
                  event.target.value,
                )
              }
              placeholder="Research source"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div>
            <label
              htmlFor="associated-contact-source-date"
              className="block text-xs font-semibold text-ink-700"
            >
              Source date
            </label>

            <input
              id="associated-contact-source-date"
              type="date"
              value={associatedSourceDate}
              onChange={(event) =>
                setAssociatedSourceDate(
                  event.target.value,
                )
              }
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="associated-contact-source-url"
              className="block text-xs font-semibold text-ink-700"
            >
              Source URL
            </label>

            <input
              id="associated-contact-source-url"
              type="url"
              value={associatedSourceUrl}
              onChange={(event) =>
                setAssociatedSourceUrl(
                  event.target.value,
                )
              }
              placeholder="https://"
              className="mt-1.5 min-h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={submitting !== null}
              onClick={() =>
                void addAssociatedContact()
              }
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === "add_associated_contact"
                ? "Recording..."
                : "Record associated contact"}
            </button>
          </div>
        </div>

        {sortedAssociatedContacts.length === 0 ? (
          <div className="rounded-md border border-line bg-paper px-4 py-4">
            <p className="text-xs text-ink-500">
              No relatives or associated contacts recorded.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedAssociatedContacts.map(
              (candidate) => {
                const verifyKey =
                  `verify_associated_contact:${candidate.id}`;

                const rejectKey =
                  `reject_associated_contact:${candidate.id}`;

                return (
                  <div
                    key={candidate.id}
                    className="rounded-md border border-line bg-paper p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900">
                          {candidate.name}
                        </p>

                        <p className="mt-1 text-xs text-ink-500">
                          Relationship:{" "}
                          <span className="font-medium text-ink-700">
                            {candidate.relationship ??
                              "Not established"}
                          </span>
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-2xs font-semibold ${statusClasses(
                          candidate.status,
                        )}`}
                      >
                        {statusLabel(
                          candidate.status,
                        )}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
                      <p>
                        Phone:{" "}
                        <span className="font-medium text-ink-700">
                          {candidate.phone ??
                            "Not recorded"}
                        </span>
                      </p>

                      <p>
                        Email:{" "}
                        <span className="break-words font-medium text-ink-700">
                          {candidate.email ??
                            "Not recorded"}
                        </span>
                      </p>

                      <p>
                        Source:{" "}
                        <span className="font-medium text-ink-700">
                          {candidate.source.sourceName}
                        </span>
                      </p>

                      <p>
                        Source date:{" "}
                        <span className="font-medium text-ink-700">
                          {candidate.source.sourceDate}
                        </span>
                      </p>

                      {candidate.source.sourceUrl && (
                        <p className="sm:col-span-2">
                          <a
                            href={candidate.source.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-800"
                          >
                            Open researched source
                          </a>
                        </p>
                      )}
                    </div>

                    {candidate.reviewNote && (
                      <div className="mt-3 rounded-md border border-line bg-inset px-3 py-2.5">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                          Review note
                        </p>

                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-700">
                          {candidate.reviewNote}
                        </p>
                      </div>
                    )}

                    {candidate.status === "candidate" && (
                      <div className="mt-4 border-t border-line pt-4">
                        <label
                          htmlFor={`associate-review-${candidate.id}`}
                          className="block text-xs font-semibold text-ink-700"
                        >
                          Verification note
                        </label>

                        <textarea
                          id={`associate-review-${candidate.id}`}
                          value={
                            reviewNotes[
                              candidate.id
                            ] ?? ""
                          }
                          onChange={(event) =>
                            setReviewNotes(
                              (
                                current,
                              ) => ({
                                ...current,

                                [candidate.id]:
                                  event.target.value,
                              }),
                            )
                          }
                          rows={3}
                          maxLength={2000}
                          className="mt-1.5 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
                        />

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={submitting !== null}
                            onClick={() =>
                              void reviewAssociatedContact(
                                candidate,
                                "verify_associated_contact",
                              )
                            }
                            className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting === verifyKey
                              ? "Verifying..."
                              : "Mark verified"}
                          </button>

                          <button
                            type="button"
                            disabled={submitting !== null}
                            onClick={() =>
                              void reviewAssociatedContact(
                                candidate,
                                "reject_associated_contact",
                              )
                            }
                            className="inline-flex min-h-9 items-center justify-center rounded-md border border-critical-300 bg-paper px-3.5 py-2 text-sm font-semibold text-critical-700 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting === rejectKey
                              ? "Rejecting..."
                              : "Reject finding"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-critical-200 bg-critical-50 px-3.5 py-3 text-sm text-critical-800"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-md border border-positive-200 bg-positive-50 px-3.5 py-3 text-sm text-positive-800"
        >
          {success}
        </div>
      )}

      <p className="border-t border-line pt-5 text-xs leading-relaxed text-ink-500">
        Claimant Locator manages research evidence only. It does not create a
        claimant, create a claimant login, authorize outreach, begin claimant
        onboarding, or treat a relative or associated contact as the claimant.
      </p>
    </div>
  );
}