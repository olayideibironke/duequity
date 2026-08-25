"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Badge,
} from "@/components/ui/badge";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type GovernmentIdType =
  | "drivers_license"
  | "us_passport"
  | "state_id"
  | "other_government_photo_id";

type IdentityVerificationStatus =
  | "not_started"
  | "documents_requested"
  | "under_review"
  | "verified"
  | "failed"
  | "manual_review";

type DocumentStatus =
  | "requested"
  | "uploaded"
  | "scanning"
  | "under_review"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

type SafetyStatus =
  | "pending"
  | "clean"
  | "rejected"
  | "unsafe";

interface IdentityDocument {
  id:
    string;

  governmentIdType:
    GovernmentIdType;

  governmentIdTypeLabel:
    string;

  originalFileName?:
    string;

  mimeType:
    string;

  byteSize:
    number;

  status:
    DocumentStatus;

  safetyStatus:
    SafetyStatus;

  uploadedAt:
    string;

  reviewedAt?:
    string;

  rejectionReason?:
    string;
}

interface IdentityState {
  claimantId:
    string;

  claimantReference:
    string;

  claimId:
    string;

  claimReference:
    string;

  legalName:
    string;

  identityVerification:
    IdentityVerificationStatus;

  identityVerifiedAt?:
    string;

  request:
    | {
        id:
          string;

        status:
          | "outstanding"
          | "received"
          | "accepted"
          | "waived"
          | "overdue";

        required:
          boolean;

        guidance?:
          string;
      }
    | null;

  documents:
    IdentityDocument[];

  latestDocument?:
    IdentityDocument;

  mayUpload:
    boolean;

  uploadBlockReason?:
    string;
}

interface IdentityApiPayload {
  ok:
    true;

  state:
    IdentityState;
}

interface IdentityApiError {
  ok?:
    false;

  error?:
    string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formatBytes(
  value:
    number,
): string {
  if (
    value <
    1024
  ) {
    return `${value} B`;
  }

  if (
    value <
    1024 * 1024
  ) {
    return `${(
      value /
      1024
    ).toFixed(
      1,
    )} KB`;
  }

  return `${(
    value /
    (
      1024 *
      1024
    )
  ).toFixed(
    1,
  )} MB`;
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

function verificationLabel(
  status:
    IdentityVerificationStatus,
): string {
  switch (
    status
  ) {
    case "not_started":
      return "Not started";

    case "documents_requested":
      return "ID required";

    case "under_review":
      return "Under review";

    case "verified":
      return "Verified";

    case "failed":
      return "Verification failed";

    case "manual_review":
      return "Manual review";

    default:
      return status;
  }
}

function verificationTone(
  status:
    IdentityVerificationStatus,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral"
  | "info" {
  switch (
    status
  ) {
    case "verified":
      return "positive";

    case "under_review":
      return "info";

    case "failed":
      return "critical";

    case "documents_requested":
    case "manual_review":
      return "caution";

    default:
      return "neutral";
  }
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function GovernmentIdUpload({
  initialState,
}: {
  initialState:
    IdentityState;
}) {
  const router =
    useRouter();

  const [
    state,
    setState,
  ] =
    useState(
      initialState,
    );

  const [
    governmentIdType,
    setGovernmentIdType,
  ] =
    useState<GovernmentIdType | "">(
      "",
    );

  const [
    file,
    setFile,
  ] =
    useState<File | null>(
      null,
    );

  const [
    uploading,
    setUploading,
  ] =
    useState(
      false,
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

  const latest =
    state.latestDocument;

  async function upload() {
    if (
      !governmentIdType
    ) {
      setError(
        "Select the type of government-issued ID.",
      );

      return;
    }

    if (
      !file
    ) {
      setError(
        "Choose the government ID file you want to upload.",
      );

      return;
    }

    if (
      file.size >
      15 * 1024 * 1024
    ) {
      setError(
        "The selected file exceeds the 15 MB limit.",
      );

      return;
    }

    setUploading(
      true,
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );

    try {
      const formData =
        new FormData();

      formData.set(
        "governmentIdType",
        governmentIdType,
      );

      formData.set(
        "file",
        file,
      );

      const response =
        await fetch(
          "/api/portal/identity-document",
          {
            method:
              "POST",

            body:
              formData,
          },
        );

      const payload =
        await response.json() as
          | IdentityApiPayload
          | IdentityApiError;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          "error" in payload &&
          payload.error
            ? payload.error
            : "Your government ID could not be uploaded.",
        );
      }

      setState(
        payload.state,
      );

      setGovernmentIdType(
        "",
      );

      setFile(
        null,
      );

      setSuccess(
        "Your government ID was securely received. DueQuity will complete the required security and identity review before claim processing continues.",
      );

      router.refresh();
    } catch (
      uploadError
    ) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Your government ID could not be uploaded.",
      );
    } finally {
      setUploading(
        false,
      );
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-ink-500">
              Identity verification
            </p>

            <h2 className="mt-1 text-lg font-semibold text-ink-900">
              Government-issued photo ID
            </h2>

            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-600">
              DueQuity needs one current government-issued photo ID to verify
              that the person using this claimant account is the correct
              claimant.
            </p>
          </div>

          <Badge
            tone={
              verificationTone(
                state.identityVerification,
              )
            }
            size="md"
          >
            {verificationLabel(
              state.identityVerification,
            )}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-inset px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
              Legal name
            </p>

            <p className="mt-1 text-sm font-semibold text-ink-900">
              {state.legalName}
            </p>
          </div>

          <div className="rounded-md border border-line bg-inset px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
              Claimant ID
            </p>

            <p className="mt-1 font-mono text-sm font-semibold text-ink-900">
              {state.claimantReference}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-line bg-inset px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
            Recovery reference
          </p>

          <p className="mt-1 font-mono text-sm text-ink-800">
            {state.claimReference}
          </p>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-critical-200 bg-critical-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-critical-800">
            Upload could not be completed
          </p>

          <p className="mt-1 text-sm leading-relaxed text-critical-700">
            {error}
          </p>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-md border border-accent-200 bg-accent-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-accent-900">
            ID received
          </p>

          <p className="mt-1 text-sm leading-relaxed text-accent-800">
            {success}
          </p>
        </div>
      )}

      {state.identityVerification ===
        "verified" ? (
        <section className="rounded-lg border border-accent-200 bg-accent-50 p-4 sm:p-5">
          <Badge
            tone="positive"
            size="md"
          >
            Identity verified
          </Badge>

          <h2 className="mt-3 text-lg font-semibold text-accent-950">
            Verification complete
          </h2>

          <p className="mt-1 text-sm leading-relaxed text-accent-800">
            DueQuity has accepted your identity evidence. The identity
            verification control no longer blocks your recovery workflow.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-ink-900">
            Upload your ID
          </h2>

          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            Choose the exact type of ID being submitted. DueQuity does not ask
            you to type the ID number into this form.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="governmentIdType"
                className="block text-sm font-semibold text-ink-800"
              >
                ID type
              </label>

              <select
                id="governmentIdType"
                value={
                  governmentIdType
                }
                disabled={
                  uploading ||
                  !state.mayUpload
                }
                onChange={(
                  event,
                ) => {
                  setGovernmentIdType(
                    event.target.value as
                      | GovernmentIdType
                      | "",
                  );
                }}
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  Select ID type
                </option>

                <option value="drivers_license">
                  Valid Driver&apos;s License
                </option>

                <option value="us_passport">
                  Valid U.S. Passport
                </option>

                <option value="state_id">
                  Valid State ID
                </option>

                <option value="other_government_photo_id">
                  Other valid government photo ID
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="governmentIdFile"
                className="block text-sm font-semibold text-ink-800"
              >
                ID file
              </label>

              <input
                id="governmentIdFile"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                disabled={
                  uploading ||
                  !state.mayUpload
                }
                onChange={(
                  event,
                ) => {
                  setFile(
                    event.currentTarget.files?.[0] ??
                    null,
                  );
                }}
                className="block w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink-700 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <p className="text-xs text-ink-500">
                PDF, JPEG, PNG or WebP. Maximum 15 MB.
              </p>
            </div>
          </div>

          {!state.mayUpload &&
            state.uploadBlockReason && (
            <div className="mt-4 rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
              <p className="text-sm font-semibold text-caution-900">
                New upload unavailable
              </p>

              <p className="mt-1 text-sm leading-relaxed text-caution-800">
                {
                  state.uploadBlockReason
                }
              </p>
            </div>
          )}

          {state.mayUpload && (
            <button
              type="button"
              disabled={
                uploading ||
                !governmentIdType ||
                !file
              }
              onClick={() => {
                void upload();
              }}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading
                ? "Uploading securely..."
                : "Upload government ID"}
            </button>
          )}
        </section>
      )}

      {latest && (
        <section className="rounded-lg border border-line bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow text-ink-500">
                Latest ID submission
              </p>

              <h2 className="mt-1 text-base font-semibold text-ink-900">
                {
                  latest.governmentIdTypeLabel
                }
              </h2>

              {latest.originalFileName && (
                <p className="mt-1 text-sm text-ink-600">
                  {
                    latest.originalFileName
                  }
                </p>
              )}
            </div>

            <Badge
              tone={
                latest.status ===
                  "accepted"
                  ? "positive"
                  : latest.status ===
                      "rejected"
                    ? "critical"
                    : "caution"
              }
            >
              {latest.status.replaceAll(
                "_",
                " ",
              )}
            </Badge>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-500">
                Uploaded
              </dt>

              <dd className="mt-0.5 font-medium text-ink-800">
                {formatTimestamp(
                  latest.uploadedAt,
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-500">
                File size
              </dt>

              <dd className="mt-0.5 font-medium text-ink-800">
                {formatBytes(
                  latest.byteSize,
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-500">
                Security check
              </dt>

              <dd className="mt-0.5 font-medium text-ink-800">
                {latest.safetyStatus ===
                  "pending"
                  ? "Pending secure file safety check"
                  : latest.safetyStatus.replaceAll(
                      "_",
                      " ",
                    )}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-500">
                Identity review
              </dt>

              <dd className="mt-0.5 font-medium text-ink-800">
                {verificationLabel(
                  state.identityVerification,
                )}
              </dd>
            </div>
          </dl>

          {latest.rejectionReason && (
            <div className="mt-4 rounded-md border border-critical-200 bg-critical-50 px-4 py-3">
              <p className="text-sm font-semibold text-critical-800">
                Replacement required
              </p>

              <p className="mt-1 text-sm leading-relaxed text-critical-700">
                {
                  latest.rejectionReason
                }
              </p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-line bg-inset p-4">
        <p className="text-sm font-semibold text-ink-800">
          Protect your identity
        </p>

        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          Upload identity documents only through this secure portal. Do not send
          your ID through ordinary email, text message, or to a personal staff
          account. Do not enter Social Security numbers, passwords, PINs, bank
          information, or card details in this workflow.
        </p>
      </section>
    </div>
  );
}