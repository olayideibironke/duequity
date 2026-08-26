"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";

/**
 * CLAIM DOCUMENTS PANEL
 *
 * Operational document workspace for persistently converted claims.
 *
 * The server remains authoritative for:
 *
 * - jurisdiction-required agency document kinds
 * - Duequity internal workflow document kinds
 * - claim and claimant linkage
 * - accepted file types and maximum size
 * - durable metadata
 * - document safety scanning
 * - document review decisions
 * - whether an agency document request is satisfied
 * - staff upload and review permissions
 *
 * Workflow:
 *
 * upload
 *   -> safety scan
 *   -> clean / under review
 *   -> explicit human accept or reject
 *
 * Uploading a file does not satisfy a filing requirement.
 * Passing a safety scan does not satisfy a filing requirement.
 * A human must explicitly accept the uploaded document.
 *
 * Agency filing evidence and Duequity internal evidence are intentionally
 * rendered as separate lanes. An accepted internal fee agreement never counts
 * as a county, court, tax collector or custodian filing requirement.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type DocumentKind =
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

type DocumentSensitivity =
  | "public_record"
  | "internal"
  | "sensitive"
  | "restricted";

type DocumentStatus =
  | "requested"
  | "uploaded"
  | "scanning"
  | "under_review"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

type DocumentRequestStatus =
  | "outstanding"
  | "received"
  | "accepted"
  | "waived"
  | "overdue";

interface DocumentRequestRecord {
  id:
    string;

  claimId:
    string;

  kind:
    DocumentKind;

  reason:
    string;

  requestedFromClaimantId?:
    string;

  requestedAt:
    string;

  dueBy?:
    string;

  required:
    boolean;

  status:
    DocumentRequestStatus;

  guidance?:
    string;

  fulfilledByDocumentId?:
    string;

  waivedReason?:
    string;
}

interface StoredDocumentRecord {
  id:
    string;

  claimId?:
    string;

  opportunityId?:
    string;

  claimantId?:
    string;

  kind:
    DocumentKind;

  title:
    string;

  originalFileName?:
    string;

  mimeType:
    string;

  byteSize:
    number;

  sensitivity:
    DocumentSensitivity;

  status:
    DocumentStatus;

  storageKey:
    string;

  uploadedByUserId?:
    string;

  uploadedByClaimantId?:
    string;

  uploadedAt?:
    string;

  reviewedByUserId?:
    string;

  reviewedAt?:
    string;

  rejectionReason?:
    string;

  pageCount?:
    number;

  expiresAt?:
    string;
}

interface DocumentReadiness {
  claimId:
    string;

  requiredRequests:
    DocumentRequestRecord[];

  acceptedRequiredRequests:
    DocumentRequestRecord[];

  outstandingRequiredRequests:
    DocumentRequestRecord[];

  requiredCount:
    number;

  acceptedCount:
    number;

  outstandingCount:
    number;

  complete:
    boolean;
}

interface DocumentApiPayload {
  ok:
    true;

  requests:
    DocumentRequestRecord[];

  documents:
    StoredDocumentRecord[];

  readiness:
    DocumentReadiness;

  internalWorkflow: {
    supportedKinds:
      DocumentKind[];

    documents:
      StoredDocumentRecord[];
  };

  permissions: {
    mayUpload:
      boolean;

    mayReview:
      boolean;

    mayRunSafetyScan:
      boolean;

    mayReadRestricted:
      boolean;
  };

  claim: {
    id:
      string;

    reference:
      string;

    jurisdictionId:
      string;
  };

  claimant: {
    id:
      string;

    legalName:
      string;
  } | null;

  jurisdiction: {
    id:
      string;

    agencyName:
      string;

    stateCode:
      string;

    packageVersion:
      number;

    legalRuleVersion:
      number | null;

    requiredDocumentKinds:
      DocumentKind[];
  };

  filingGate: {
    jurisdictionClear:
      boolean;

    startupGreenLaneClear:
      boolean;

    legalClear:
      boolean;

    deadlineClear:
      boolean;

    nextInternalAction:
      string;
  };
}

interface ApiErrorPayload {
  ok?:
    false;

  error?:
    string;
}

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

function documentKindLabel(
  kind:
    DocumentKind,
): string {
  switch (
    kind
  ) {
    case "government_id":
      return "Government ID";

    case "proof_of_former_ownership":
      return "Proof of former ownership";

    case "recorded_deed":
      return "Recorded deed";

    case "death_certificate":
      return "Death certificate";

    case "probate_letters":
      return "Probate letters";

    case "letters_of_administration":
      return "Letters of administration";

    case "will":
      return "Will";

    case "trust_instrument":
      return "Trust instrument";

    case "articles_of_organization":
      return "Articles of organization";

    case "certificate_of_good_standing":
      return "Certificate of good standing";

    case "w9":
      return "W-9";

    case "affidavit_of_heirship":
      return "Affidavit of heirship";

    case "affidavit_of_entitlement":
      return "Affidavit of entitlement";

    case "court_order":
      return "Court order";

    case "agency_claim_form":
      return "Agency claim form";

    case "agency_correspondence":
      return "Agency correspondence";

    case "fee_agreement":
      return "Fee agreement";

    case "lien_release":
      return "Lien release";

    case "bankruptcy_discharge":
      return "Bankruptcy discharge";

    case "marriage_certificate":
      return "Marriage certificate";

    case "utility_bill_proof_of_residence":
      return "Utility bill / proof of residence";

    case "other":
      return "Other document";
  }
}

function requestStatusLabel(
  status:
    DocumentRequestStatus,
): string {
  switch (
    status
  ) {
    case "outstanding":
      return "Outstanding";

    case "received":
      return "Received";

    case "accepted":
      return "Accepted";

    case "waived":
      return "Waived";

    case "overdue":
      return "Overdue";

    default:
      return status;
  }
}

function documentStatusLabel(
  status:
    DocumentStatus,
): string {
  switch (
    status
  ) {
    case "requested":
      return "Requested";

    case "uploaded":
      return "Safety check required";

    case "scanning":
      return "Safety check running";

    case "under_review":
      return "Ready for review";

    case "accepted":
      return "Accepted";

    case "rejected":
      return "Rejected";

    case "expired":
      return "Expired";

    case "superseded":
      return "Superseded";

    default:
      return status;
  }
}

function safetyStatusLabel(
  status:
    DocumentStatus,
): string {
  switch (
    status
  ) {
    case "uploaded":
      return "Safety check required";

    case "scanning":
      return "Safety check running";

    case "under_review":
    case "accepted":
      return "Safety check passed";

    case "rejected":
      return "Document blocked or rejected";

    case "expired":
      return "Document expired";

    case "superseded":
      return "Document superseded";

    default:
      return "Safety status pending";
  }
}

function sensitivityLabel(
  sensitivity:
    DocumentSensitivity,
): string {
  switch (
    sensitivity
  ) {
    case "public_record":
      return "Public record";

    case "internal":
      return "Internal";

    case "sensitive":
      return "Sensitive";

    case "restricted":
      return "Restricted";

    default:
      return sensitivity;
  }
}

function formatBytes(
  bytes:
    number,
): string {
  if (
    bytes <
    1024
  ) {
    return `${bytes} B`;
  }

  const kilobytes =
    bytes /
    1024;

  if (
    kilobytes <
    1024
  ) {
    return `${kilobytes.toFixed(
      1,
    )} KB`;
  }

  const megabytes =
    kilobytes /
    1024;

  return `${megabytes.toFixed(
    1,
  )} MB`;
}

function formatTimestamp(
  value:
    string |
    undefined,
): string {
  if (
    !value
  ) {
    return "Not recorded";
  }

  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    },
  ).format(
    parsed,
  );
}

/* ========================================================================== */
/* Tone helpers                                                                */
/* ========================================================================== */

function requestTone(
  status:
    DocumentRequestStatus,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  switch (
    status
  ) {
    case "accepted":
    case "waived":
      return "positive";

    case "received":
      return "caution";

    case "overdue":
      return "critical";

    default:
      return "neutral";
  }
}

function documentTone(
  status:
    DocumentStatus,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  switch (
    status
  ) {
    case "accepted":
      return "positive";

    case "rejected":
    case "expired":
      return "critical";

    case "uploaded":
    case "scanning":
    case "under_review":
      return "caution";

    default:
      return "neutral";
  }
}

function safetyTone(
  status:
    DocumentStatus,
):
  | "positive"
  | "caution"
  | "critical"
  | "neutral" {
  switch (
    status
  ) {
    case "under_review":
    case "accepted":
      return "positive";

    case "uploaded":
    case "scanning":
      return "caution";

    case "rejected":
    case "expired":
      return "critical";

    default:
      return "neutral";
  }
}

/* ========================================================================== */
/* Small UI                                                                    */
/* ========================================================================== */

function ProgressStep({
  complete,
  label,
}: {
  complete:
    boolean;

  label:
    string;
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
        {
          complete
            ? "✓"
            : "·"
        }
      </span>

      <span
        className={
          complete
            ? "text-xs font-medium text-ink-800"
            : "text-xs text-ink-500"
        }
      >
        {
          label
        }
      </span>
    </div>
  );
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimDocumentsPanel({
  claimId,
}: {
  claimId:
    string;
}) {
  const router =
    useRouter();

  const [
    data,
    setData,
  ] =
    useState<
      DocumentApiPayload |
      null
    >(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    action,
    setAction,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState(
      "",
    );

  const [
    success,
    setSuccess,
  ] =
    useState(
      "",
    );

  const [
    rejectionReasons,
    setRejectionReasons,
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {},
    );

  /* ======================================================================== */
  /* Load                                                                      */
  /* ======================================================================== */

  const fetchDocuments =
    useCallback(
      async (
        signal?:
          AbortSignal,
      ): Promise<
        DocumentApiPayload
      > => {
        const response =
          await fetch(
            `/api/pro/claims/${encodeURIComponent(
              claimId,
            )}/documents`,
            {
              method:
                "GET",

              cache:
                "no-store",

              signal,

              headers: {
                Accept:
                  "application/json",
              },
            },
          );

        const payload =
          (await response.json()) as
            | DocumentApiPayload
            | ApiErrorPayload;

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            "error" in
              payload &&
            payload.error
              ? payload.error
              : "Claim documents could not be loaded.",
          );
        }

        return payload;
      },
      [
        claimId,
      ],
    );

  const load =
    useCallback(
      async () => {
        try {
          setData(
            await fetchDocuments(),
          );

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Claim documents could not be loaded.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        fetchDocuments,
      ],
    );

  useEffect(
    () => {
      const controller =
        new AbortController();

      fetchDocuments(
        controller.signal,
      )
        .then(
          (
            payload,
          ) => {
            if (
              controller.signal.aborted
            ) {
              return;
            }

            setData(
              payload,
            );

            setError(
              "",
            );

            setLoading(
              false,
            );
          },
        )
        .catch(
          (
            loadError:
              unknown,
          ) => {
            if (
              controller.signal.aborted
            ) {
              return;
            }

            setError(
              loadError instanceof
                Error
                ? loadError.message
                : "Claim documents could not be loaded.",
            );

            setLoading(
              false,
            );
          },
        );

      return () => {
        controller.abort();
      };
    },
    [
      fetchDocuments,
    ],
  );

  /* ======================================================================== */
  /* Derived                                                                   */
  /* ======================================================================== */

  const documentsByKind =
    useMemo(
      () => {
        const grouped =
          new Map<
            DocumentKind,
            StoredDocumentRecord[]
          >();

        for (
          const document of
          data?.documents ??
          []
        ) {
          const existing =
            grouped.get(
              document.kind,
            ) ??
            [];

          existing.push(
            document,
          );

          grouped.set(
            document.kind,
            existing,
          );
        }

        return grouped;
      },
      [
        data?.documents,
      ],
    );

  /* ======================================================================== */
  /* Upload                                                                    */
  /* ======================================================================== */

  async function uploadDocument(
    kind:
      DocumentKind,
    file:
      File,
  ) {
    const actionKey =
      `upload:${kind}`;

    setAction(
      actionKey,
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );

    try {
      const formData =
        new FormData();

      formData.set(
        "kind",
        kind,
      );

      formData.set(
        "file",
        file,
      );

      const response =
        await fetch(
          `/api/pro/claims/${encodeURIComponent(
            claimId,
          )}/documents`,
          {
            method:
              "POST",

            body:
              formData,

            headers: {
              Accept:
                "application/json",
            },
          },
        );

      const payload =
        (await response.json()) as
          | DocumentApiPayload
          | ApiErrorPayload;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          "error" in
            payload &&
          payload.error
            ? payload.error
            : "The document could not be uploaded.",
        );
      }

      setData(
        payload,
      );

      setSuccess(
        `${documentKindLabel(
          kind,
        )} uploaded securely. A safety check must pass before human review.`,
      );

      router.refresh();
    } catch (
      uploadError
    ) {
      setError(
        uploadError instanceof
          Error
          ? uploadError.message
          : "The document could not be uploaded.",
      );
    } finally {
      setAction(
        null,
      );
    }
  }

  /* ======================================================================== */
  /* Safety scan                                                               */
  /* ======================================================================== */

  async function runSafetyScan(
    document:
      StoredDocumentRecord,
  ) {
    const actionKey =
      `run_safety_scan:${document.id}`;

    setAction(
      actionKey,
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/pro/claims/${encodeURIComponent(
            claimId,
          )}/documents`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "run_safety_scan",

                documentId:
                  document.id,
              }),
          },
        );

      const payload =
        (await response.json()) as
          | DocumentApiPayload
          | ApiErrorPayload;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          "error" in
            payload &&
          payload.error
            ? payload.error
            : "The document safety check could not be completed.",
        );
      }

      setData(
        payload,
      );

      const refreshedDocument =
        payload.documents.find(
          (
            candidate,
          ) =>
            candidate.id ===
            document.id,
        );

      if (
        refreshedDocument?.status ===
        "under_review"
      ) {
        setSuccess(
          `${document.title} passed the malware safety check and is ready for human review.`,
        );
      } else if (
        refreshedDocument?.status ===
        "rejected"
      ) {
        setError(
          `${document.title} did not clear the malware safety check. Do not accept or use this file. Upload a replacement document if required.`,
        );
      } else {
        setSuccess(
          `${document.title} safety check completed. Review the current document status before taking the next action.`,
        );
      }

      router.refresh();
    } catch (
      scanError
    ) {
      setError(
        scanError instanceof
          Error
          ? scanError.message
          : "The document safety check could not be completed.",
      );

      await load();
    } finally {
      setAction(
        null,
      );
    }
  }

  /* ======================================================================== */
  /* Review                                                                    */
  /* ======================================================================== */

  async function reviewDocument(
    document:
      StoredDocumentRecord,
    decision:
      | "accept_document"
      | "reject_document",
  ) {
    const actionKey =
      `${decision}:${document.id}`;

    setAction(
      actionKey,
    );

    setError(
      "",
    );

    setSuccess(
      "",
    );

    try {
      const rejectionReason =
        rejectionReasons[
          document.id
        ]?.trim();

      if (
        decision ===
          "reject_document" &&
        !rejectionReason
      ) {
        throw new Error(
          "Enter a rejection reason before rejecting this document.",
        );
      }

      const response =
        await fetch(
          `/api/pro/claims/${encodeURIComponent(
            claimId,
          )}/documents`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  decision,

                documentId:
                  document.id,

                rejectionReason:
                  decision ===
                  "reject_document"
                    ? rejectionReason
                    : undefined,
              }),
          },
        );

      const payload =
        (await response.json()) as
          | DocumentApiPayload
          | ApiErrorPayload;

      if (
        !response.ok ||
        !payload.ok
      ) {
        throw new Error(
          "error" in
            payload &&
          payload.error
            ? payload.error
            : "The document review could not be saved.",
        );
      }

      setData(
        payload,
      );

      const internalWorkflowDocument =
        data?.internalWorkflow.supportedKinds.includes(
          document.kind,
        ) ??
        false;

      setSuccess(
        decision ===
          "accept_document"
          ? internalWorkflowDocument
            ? `${document.title} accepted as Duequity internal workflow evidence. It does not satisfy an agency filing requirement.`
            : `${document.title} accepted. This document now satisfies the current agency document request.`
          : internalWorkflowDocument
            ? `${document.title} rejected. Upload corrected internal evidence before that workflow can proceed.`
            : `${document.title} rejected. A replacement filing document is required.`,
      );

      if (
        decision ===
        "reject_document"
      ) {
        setRejectionReasons(
          (
            current,
          ) => ({
            ...current,

            [
              document.id
            ]:
              "",
          }),
        );
      }

      router.refresh();
    } catch (
      reviewError
    ) {
      setError(
        reviewError instanceof
          Error
          ? reviewError.message
          : "The document review could not be saved.",
      );
    } finally {
      setAction(
        null,
      );
    }
  }

  /* ======================================================================== */
  /* Loading                                                                   */
  /* ======================================================================== */

  if (
    loading &&
    !data
  ) {
    return (
      <div className="rounded-md border border-line bg-inset px-4 py-5">
        <p className="text-sm font-medium text-ink-700">
          Loading agency documents
        </p>

        <p className="mt-1 text-xs text-ink-500">
          Reading jurisdiction requirements, document requests and persisted
          review state.
        </p>
      </div>
    );
  }

  if (
    !data
  ) {
    return (
      <div className="rounded-md border border-critical-200 bg-critical-50 px-4 py-4">
        <p className="text-sm font-semibold text-critical-800">
          Agency documents unavailable
        </p>

        <p className="mt-1 text-xs leading-relaxed text-critical-700">
          {
            error ||
            "The document workspace could not be loaded."
          }
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
      {/* ================================================================== summary */}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            Agency filing documents
          </p>

          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
            Required files must pass the automated safety check and then be
            explicitly accepted by authorized human review before they satisfy
            a filing requirement.
          </p>
        </div>

        <Badge
          tone={
            data.readiness.complete
              ? "positive"
              : "caution"
          }
          size="md"
        >
          {
            data.readiness.complete
              ? "Documents complete"
              : `${data.readiness.outstandingCount} outstanding`
          }
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <ProgressStep
          complete
          label={
            data.readiness.requiredCount ===
            0
              ? "No agency documents required"
              : `${data.readiness.requiredCount} required`
          }
        />

        <ProgressStep
          complete={
            data.readiness.acceptedCount ===
            data.readiness.requiredCount
          }
          label={
            data.readiness.requiredCount ===
            0
              ? "Nothing outstanding"
              : `${data.readiness.acceptedCount} accepted`
          }
        />

        <ProgressStep
          complete={
            data.readiness.complete
          }
          label={
            data.readiness.complete
              ? "Ready for next control"
              : `${data.readiness.outstandingCount} still blocking`
          }
        />
      </div>

      {
        data.claimant &&
        (
          <div className="rounded-md border border-line bg-inset px-4 py-3">
            <p className="text-xs text-ink-500">
              Requested from claimant
            </p>

            <p className="mt-0.5 text-sm font-semibold text-ink-900">
              {
                data.claimant.legalName
              }
            </p>
          </div>
        )
      }

      <div className="rounded-md border border-caution-200 bg-caution-50 px-4 py-3">
        <p className="text-xs font-semibold text-caution-900">
          Local validation files only
        </p>

        <p className="mt-1 text-xs leading-relaxed text-caution-800">
          Use non-sensitive test files during local validation. PDF, JPEG, PNG
          and WebP are accepted, up to 15 MB per file. Uploaded files remain
          blocked until the local Microsoft Defender safety check completes
          successfully and an authorized reviewer accepts the evidence.
        </p>
      </div>

      {
        error &&
        (
          <div
            role="alert"
            className="rounded-md border border-critical-200 bg-critical-50 px-4 py-3"
          >
            <p className="text-sm font-semibold text-critical-800">
              Action could not be completed
            </p>

            <p className="mt-1 text-xs leading-relaxed text-critical-700">
              {
                error
              }
            </p>
          </div>
        )
      }

      {
        success &&
        (
          <div
            role="status"
            className="rounded-md border border-accent-200 bg-accent-50 px-4 py-3"
          >
            <p className="text-sm font-semibold text-accent-900">
              Saved
            </p>

            <p className="mt-1 text-xs leading-relaxed text-accent-800">
              {
                success
              }
            </p>
          </div>
        )
      }

      {/* ================================================================ requests */}

      {
        data.requests.length ===
          0 &&
        (
          <section className="rounded-lg border border-accent-200 bg-accent-50 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-accent-900">
                  No agency filing documents required
                </p>

                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-accent-800">
                  The current approved jurisdiction does not require any agency
                  filing document types for this Claim. Duequity internal
                  documents remain separate below.
                </p>
              </div>

              <Badge
                tone="positive"
                size="md"
              >
                Agency documents clear
              </Badge>
            </div>
          </section>
        )
      }

      <div className="space-y-4">
        {
          data.requests.map(
            (
              request,
            ) => {
              const documents =
                documentsByKind.get(
                  request.kind,
                ) ??
                [];

              const acceptedDocument =
                request.fulfilledByDocumentId
                  ? documents.find(
                      (
                        document,
                      ) =>
                        document.id ===
                        request.fulfilledByDocumentId,
                    )
                  : undefined;

              const uploadActionKey =
                `upload:${request.kind}`;

              return (
                <section
                  key={
                    request.id
                  }
                  className={
                    request.status ===
                      "accepted" ||
                    request.status ===
                      "waived"
                      ? "overflow-hidden rounded-lg border border-accent-200 bg-white"
                      : "overflow-hidden rounded-lg border border-line bg-white"
                  }
                >
                  {/* ====================================================== request header */}

                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-inset px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-ink-900">
                          {
                            documentKindLabel(
                              request.kind,
                            )
                          }
                        </h3>

                        {
                          request.required &&
                          (
                            <Badge tone="neutral">
                              Required
                            </Badge>
                          )
                        }
                      </div>

                      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
                        {
                          request.reason
                        }
                      </p>

                      {
                        request.guidance &&
                        (
                          <p className="mt-1 text-xs leading-relaxed text-ink-500">
                            {
                              request.guidance
                            }
                          </p>
                        )
                      }
                    </div>

                    <Badge
                      tone={
                        requestTone(
                          request.status,
                        )
                      }
                      size="md"
                    >
                      {
                        requestStatusLabel(
                          request.status,
                        )
                      }
                    </Badge>
                  </div>

                  <div className="p-4 sm:p-5">
                    {/* ==================================================== accepted summary */}

                    {
                      acceptedDocument &&
                      (
                        <div className="mb-4 rounded-md border border-accent-200 bg-accent-50 px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-accent-900">
                                Requirement satisfied
                              </p>

                              <p className="mt-1 break-words text-xs text-accent-800">
                                {
                                  acceptedDocument.originalFileName ??
                                  acceptedDocument.title
                                }
                              </p>
                            </div>

                            <Badge tone="positive">
                              Accepted
                            </Badge>
                          </div>
                        </div>
                      )
                    }

                    {/* ==================================================== upload */}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-ink-700">
                          {
                            request.status ===
                            "accepted"
                              ? "Replacement file"
                              : "Document upload"
                          }
                        </p>

                        <p className="mt-0.5 text-xs text-ink-500">
                          {
                            data.permissions.mayUpload
                              ? "Uploading does not approve the document. A safety check and human review are required."
                              : "Your current staff role can view this evidence but cannot upload Claim documents."
                          }
                        </p>
                      </div>

                      <label
                        className={
                          action !==
                            null ||
                          !data.permissions.mayUpload
                            ? "inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-md border border-line bg-inset px-4 py-2 text-xs font-semibold text-ink-400"
                            : "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-800 transition hover:bg-inset"
                        }
                      >
                        {
                          action ===
                          uploadActionKey
                            ? "Uploading..."
                            : request.status ===
                              "accepted"
                              ? "Upload replacement"
                              : "Choose file"
                        }

                        <input
                          type="file"
                          className="sr-only"
                          disabled={
                            action !==
                              null ||
                            !data.permissions.mayUpload
                          }
                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                          onChange={(
                            event,
                          ) => {
                            const file =
                              event.currentTarget.files?.[
                                0
                              ];

                            event.currentTarget.value =
                              "";

                            if (
                              !file
                            ) {
                              return;
                            }

                            void uploadDocument(
                              request.kind,
                              file,
                            );
                          }}
                        />
                      </label>
                    </div>

                    {/* ==================================================== document history */}

                    {
                      documents.length >
                      0
                        ? (
                            <div className="mt-4 space-y-3">
                              <p className="eyebrow text-ink-500">
                                Document history
                              </p>

                              {
                                documents.map(
                                  (
                                    document,
                                  ) => {
                                    const canRunSafetyScan =
                                      document.status ===
                                        "uploaded" &&
                                      data.permissions.mayRunSafetyScan;

                                    const canReview =
                                      document.status ===
                                        "under_review" &&
                                      data.permissions.mayReview;

                                    const scanActionKey =
                                      `run_safety_scan:${document.id}`;

                                    const rejectActionKey =
                                      `reject_document:${document.id}`;

                                    const acceptActionKey =
                                      `accept_document:${document.id}`;

                                    return (
                                      <div
                                        key={
                                          document.id
                                        }
                                        className="rounded-md border border-line px-4 py-4"
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="break-words text-sm font-semibold text-ink-900">
                                              {
                                                document.originalFileName ??
                                                document.title
                                              }
                                            </p>

                                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-500">
                                              <span>
                                                {
                                                  formatBytes(
                                                    document.byteSize,
                                                  )
                                                }
                                              </span>

                                              <span>
                                                {
                                                  document.mimeType
                                                }
                                              </span>

                                              <span>
                                                {
                                                  sensitivityLabel(
                                                    document.sensitivity,
                                                  )
                                                }
                                              </span>
                                            </div>
                                          </div>

                                          <Badge
                                            tone={
                                              documentTone(
                                                document.status,
                                              )
                                            }
                                            size="md"
                                          >
                                            {
                                              documentStatusLabel(
                                                document.status,
                                              )
                                            }
                                          </Badge>
                                        </div>

                                        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                                          <div>
                                            <dt className="text-ink-500">
                                              Uploaded
                                            </dt>

                                            <dd className="mt-0.5 font-medium text-ink-800">
                                              {
                                                formatTimestamp(
                                                  document.uploadedAt,
                                                )
                                              }
                                            </dd>
                                          </div>

                                          <div>
                                            <dt className="text-ink-500">
                                              Reviewed
                                            </dt>

                                            <dd className="mt-0.5 font-medium text-ink-800">
                                              {
                                                formatTimestamp(
                                                  document.reviewedAt,
                                                )
                                              }
                                            </dd>
                                          </div>
                                        </dl>

                                        {/* ========================================== safety */}

                                        <div className="mt-4 rounded-md border border-line bg-inset p-3">
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                              <p className="text-xs font-semibold text-ink-800">
                                                Malware safety check
                                              </p>

                                              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                                The private uploaded file must
                                                clear the configured safety
                                                scanner before human acceptance
                                                is permitted.
                                              </p>
                                            </div>

                                            <Badge
                                              tone={
                                                safetyTone(
                                                  document.status,
                                                )
                                              }
                                            >
                                              {
                                                safetyStatusLabel(
                                                  document.status,
                                                )
                                              }
                                            </Badge>
                                          </div>

                                          {
                                            canRunSafetyScan &&
                                            (
                                              <button
                                                type="button"
                                                disabled={
                                                  action !==
                                                  null
                                                }
                                                onClick={() => {
                                                  void runSafetyScan(
                                                    document,
                                                  );
                                                }}
                                                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-ink-950 bg-ink-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-300 disabled:bg-ink-200 disabled:text-ink-500"
                                              >
                                                {
                                                  action ===
                                                  scanActionKey
                                                    ? "Running Safety Check..."
                                                    : "Run Safety Check"
                                                }
                                              </button>
                                            )
                                          }

                                          {
                                            document.status ===
                                              "uploaded" &&
                                            !data.permissions.mayRunSafetyScan &&
                                            (
                                              <p className="mt-2 text-xs font-medium text-ink-500">
                                                An authorized document reviewer
                                                must run the safety check.
                                              </p>
                                            )
                                          }

                                          {
                                            document.status ===
                                              "scanning" &&
                                            (
                                              <p className="mt-2 text-xs font-medium text-caution-800">
                                                Safety scanning is currently in
                                                progress. Human review remains
                                                blocked.
                                              </p>
                                            )
                                          }

                                          {
                                            document.status ===
                                              "under_review" &&
                                            (
                                              <p className="mt-2 text-xs font-medium text-accent-800">
                                                Safety check passed. The file is
                                                now eligible for human review.
                                              </p>
                                            )
                                          }
                                        </div>

                                        {
                                          document.rejectionReason &&
                                          (
                                            <div className="mt-3 rounded-md border border-critical-200 bg-critical-50 px-3 py-2.5">
                                              <p className="text-xs font-semibold text-critical-800">
                                                Rejection reason
                                              </p>

                                              <p className="mt-1 text-xs leading-relaxed text-critical-700">
                                                {
                                                  document.rejectionReason
                                                }
                                              </p>
                                            </div>
                                          )
                                        }

                                        {/* =========================================== human review */}

                                        {
                                          canReview &&
                                          (
                                            <div className="mt-4 border-t border-line pt-4">
                                              <p className="text-xs font-semibold text-ink-700">
                                                Human review
                                              </p>

                                              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                                The safety check has passed.
                                                Accept only after confirming the
                                                file is legible, complete,
                                                current and appropriate for this
                                                requirement.
                                              </p>

                                              <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                  type="button"
                                                  disabled={
                                                    action !==
                                                    null
                                                  }
                                                  onClick={() => {
                                                    void reviewDocument(
                                                      document,
                                                      "accept_document",
                                                    );
                                                  }}
                                                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  {
                                                    action ===
                                                    acceptActionKey
                                                      ? "Accepting..."
                                                      : "Accept document"
                                                  }
                                                </button>
                                              </div>

                                              <div className="mt-4 rounded-md border border-line bg-inset p-3">
                                                <label className="block text-xs font-semibold text-ink-700">
                                                  Rejection reason
                                                </label>

                                                <textarea
                                                  rows={
                                                    2
                                                  }
                                                  value={
                                                    rejectionReasons[
                                                      document.id
                                                    ] ??
                                                    ""
                                                  }
                                                  onChange={(
                                                    event,
                                                  ) => {
                                                    setRejectionReasons(
                                                      (
                                                        current,
                                                      ) => ({
                                                        ...current,

                                                        [
                                                          document.id
                                                        ]:
                                                          event.target.value,
                                                      }),
                                                    );
                                                  }}
                                                  placeholder="Example: image is cropped and the claimant name is not visible."
                                                  className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                                                />

                                                <button
                                                  type="button"
                                                  disabled={
                                                    action !==
                                                      null ||
                                                    !(
                                                      rejectionReasons[
                                                        document.id
                                                      ] ??
                                                      ""
                                                    ).trim()
                                                  }
                                                  onClick={() => {
                                                    void reviewDocument(
                                                      document,
                                                      "reject_document",
                                                    );
                                                  }}
                                                  className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2 text-xs font-semibold text-critical-800 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  {
                                                    action ===
                                                    rejectActionKey
                                                      ? "Rejecting..."
                                                      : "Reject document"
                                                  }
                                                </button>
                                              </div>
                                            </div>
                                          )
                                        }

                                        {
                                          document.status ===
                                            "under_review" &&
                                          !data.permissions.mayReview &&
                                          (
                                            <p className="mt-3 text-xs font-medium text-ink-500">
                                              The safety check passed. This file
                                              is awaiting human review by an
                                              authorized document reviewer.
                                            </p>
                                          )
                                        }

                                        {
                                          document.status ===
                                            "accepted" &&
                                          (
                                            <p className="mt-3 text-xs font-medium text-accent-800">
                                              This accepted file currently
                                              fulfils the document request.
                                            </p>
                                          )
                                        }

                                        {
                                          document.status ===
                                            "rejected" &&
                                          (
                                            <p className="mt-3 text-xs font-medium text-critical-700">
                                              This file cannot satisfy the
                                              request. Upload a corrected
                                              replacement.
                                            </p>
                                          )
                                        }

                                        {
                                          document.status ===
                                            "superseded" &&
                                          (
                                            <p className="mt-3 text-xs text-ink-500">
                                              This file has been replaced by a
                                              newer accepted document.
                                            </p>
                                          )
                                        }
                                      </div>
                                    );
                                  },
                                )
                              }
                            </div>
                          )
                        : (
                            <div className="mt-4 rounded-md border border-dashed border-line bg-inset px-4 py-4">
                              <p className="text-sm font-medium text-ink-700">
                                No document received yet
                              </p>

                              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                This requirement remains outstanding until a
                                file is uploaded, passes the safety check and is
                                accepted.
                              </p>
                            </div>
                          )
                    }
                  </div>
                </section>
              );
            },
          )
        }
      </div>

      {/* ===================================================== internal workflow */}

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-inset px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-ink-900">
                Duequity internal documents
              </h3>

              <Badge tone="neutral">
                Internal workflow
              </Badge>
            </div>

            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-600">
              Internal documents support Duequity&apos;s own service workflow.
              They are not jurisdiction-required filing documents and never
              increase agency-document readiness.
            </p>
          </div>

          <Badge
            tone={
              data.internalWorkflow.documents.some(
                (
                  document,
                ) =>
                  document.kind ===
                    "fee_agreement" &&
                  document.status ===
                    "accepted",
              )
                ? "positive"
                : "neutral"
            }
            size="md"
          >
            {
              data.internalWorkflow.documents.some(
                (
                  document,
                ) =>
                  document.kind ===
                    "fee_agreement" &&
                  document.status ===
                    "accepted",
              )
                ? "Agreement evidence accepted"
                : "Separate from filing evidence"
            }
          </Badge>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {
            data.internalWorkflow.supportedKinds.map(
              (
                kind,
              ) => {
                const internalDocuments =
                  data.internalWorkflow.documents.filter(
                    (
                      document,
                    ) =>
                      document.kind ===
                      kind,
                  );

                const uploadActionKey =
                  `upload:${kind}`;

                return (
                  <div
                    key={
                      kind
                    }
                    className="rounded-md border border-line p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink-900">
                          {
                            documentKindLabel(
                              kind,
                            )
                          }
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-ink-500">
                          {
                            kind ===
                            "fee_agreement"
                              ? "Accepted service-agreement evidence is required before legacy agreement-signing controls can be recorded, but it does not satisfy an agency filing-document request."
                              : "Duequity internal workflow evidence."
                          }
                        </p>
                      </div>

                      <label
                        className={
                          action !==
                            null ||
                          !data.permissions.mayUpload
                            ? "inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-md border border-line bg-inset px-4 py-2 text-xs font-semibold text-ink-400"
                            : "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-800 transition hover:bg-inset"
                        }
                      >
                        {
                          action ===
                          uploadActionKey
                            ? "Uploading..."
                            : internalDocuments.length >
                              0
                              ? "Upload replacement"
                              : "Choose file"
                        }

                        <input
                          type="file"
                          className="sr-only"
                          disabled={
                            action !==
                              null ||
                            !data.permissions.mayUpload
                          }
                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                          onChange={(
                            event,
                          ) => {
                            const file =
                              event.currentTarget.files?.[
                                0
                              ];

                            event.currentTarget.value =
                              "";

                            if (
                              !file
                            ) {
                              return;
                            }

                            void uploadDocument(
                              kind,
                              file,
                            );
                          }}
                        />
                      </label>
                    </div>

                    {
                      !data.permissions.mayUpload &&
                      (
                        <p className="mt-3 text-xs text-ink-500">
                          Your current staff role can view internal agreement
                          evidence but cannot upload Claim documents.
                        </p>
                      )
                    }

                    {
                      internalDocuments.length >
                      0
                        ? (
                            <div className="mt-4 space-y-3">
                              {
                                internalDocuments.map(
                                  (
                                    document,
                                  ) => {
                                    const canRunSafetyScan =
                                      document.status ===
                                        "uploaded" &&
                                      data.permissions.mayRunSafetyScan;

                                    const canReview =
                                      document.status ===
                                        "under_review" &&
                                      data.permissions.mayReview;

                                    const scanActionKey =
                                      `run_safety_scan:${document.id}`;

                                    const acceptActionKey =
                                      `accept_document:${document.id}`;

                                    const rejectActionKey =
                                      `reject_document:${document.id}`;

                                    return (
                                      <div
                                        key={
                                          document.id
                                        }
                                        className="rounded-md border border-line bg-inset px-4 py-4"
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="break-words text-sm font-semibold text-ink-900">
                                              {
                                                document.originalFileName ??
                                                document.title
                                              }
                                            </p>

                                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-500">
                                              <span>
                                                {
                                                  formatBytes(
                                                    document.byteSize,
                                                  )
                                                }
                                              </span>

                                              <span>
                                                {
                                                  document.mimeType
                                                }
                                              </span>

                                              <span>
                                                {
                                                  sensitivityLabel(
                                                    document.sensitivity,
                                                  )
                                                }
                                              </span>
                                            </div>
                                          </div>

                                          <Badge
                                            tone={
                                              documentTone(
                                                document.status,
                                              )
                                            }
                                            size="md"
                                          >
                                            {
                                              documentStatusLabel(
                                                document.status,
                                              )
                                            }
                                          </Badge>
                                        </div>

                                        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                                          <div>
                                            <dt className="text-ink-500">
                                              Uploaded
                                            </dt>

                                            <dd className="mt-0.5 font-medium text-ink-800">
                                              {
                                                formatTimestamp(
                                                  document.uploadedAt,
                                                )
                                              }
                                            </dd>
                                          </div>

                                          <div>
                                            <dt className="text-ink-500">
                                              Reviewed
                                            </dt>

                                            <dd className="mt-0.5 font-medium text-ink-800">
                                              {
                                                formatTimestamp(
                                                  document.reviewedAt,
                                                )
                                              }
                                            </dd>
                                          </div>
                                        </dl>

                                        {/* ========================================== safety */}

                                        <div className="mt-4 rounded-md border border-line bg-white p-3">
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                              <p className="text-xs font-semibold text-ink-800">
                                                Malware safety check
                                              </p>

                                              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                                Internal evidence must also pass
                                                the configured safety scanner
                                                before human acceptance.
                                              </p>
                                            </div>

                                            <Badge
                                              tone={
                                                safetyTone(
                                                  document.status,
                                                )
                                              }
                                            >
                                              {
                                                safetyStatusLabel(
                                                  document.status,
                                                )
                                              }
                                            </Badge>
                                          </div>

                                          {
                                            canRunSafetyScan &&
                                            (
                                              <button
                                                type="button"
                                                disabled={
                                                  action !==
                                                  null
                                                }
                                                onClick={() => {
                                                  void runSafetyScan(
                                                    document,
                                                  );
                                                }}
                                                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-ink-950 bg-ink-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-300 disabled:bg-ink-200 disabled:text-ink-500"
                                              >
                                                {
                                                  action ===
                                                  scanActionKey
                                                    ? "Running Safety Check..."
                                                    : "Run Safety Check"
                                                }
                                              </button>
                                            )
                                          }

                                          {
                                            document.status ===
                                              "under_review" &&
                                            (
                                              <p className="mt-2 text-xs font-medium text-accent-800">
                                                Safety check passed. Internal
                                                evidence is ready for human
                                                review.
                                              </p>
                                            )
                                          }

                                          {
                                            document.status ===
                                              "uploaded" &&
                                            !data.permissions.mayRunSafetyScan &&
                                            (
                                              <p className="mt-2 text-xs font-medium text-ink-500">
                                                An authorized reviewer must run
                                                the safety check.
                                              </p>
                                            )
                                          }
                                        </div>

                                        {
                                          document.rejectionReason &&
                                          (
                                            <div className="mt-3 rounded-md border border-critical-200 bg-critical-50 px-3 py-2.5">
                                              <p className="text-xs font-semibold text-critical-800">
                                                Rejection reason
                                              </p>

                                              <p className="mt-1 text-xs leading-relaxed text-critical-700">
                                                {
                                                  document.rejectionReason
                                                }
                                              </p>
                                            </div>
                                          )
                                        }

                                        {
                                          canReview &&
                                          (
                                            <div className="mt-4 border-t border-line pt-4">
                                              <p className="text-xs font-semibold text-ink-700">
                                                Internal evidence review
                                              </p>

                                              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                                The safety check has passed.
                                                Accept only after confirming the
                                                evidence is complete, legible
                                                and linked to this Claim.
                                              </p>

                                              <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                  type="button"
                                                  disabled={
                                                    action !==
                                                    null
                                                  }
                                                  onClick={() => {
                                                    void reviewDocument(
                                                      document,
                                                      "accept_document",
                                                    );
                                                  }}
                                                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-accent-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  {
                                                    action ===
                                                    acceptActionKey
                                                      ? "Accepting..."
                                                      : "Accept internal document"
                                                  }
                                                </button>
                                              </div>

                                              <div className="mt-4 rounded-md border border-line bg-white p-3">
                                                <label className="block text-xs font-semibold text-ink-700">
                                                  Rejection reason
                                                </label>

                                                <textarea
                                                  rows={
                                                    2
                                                  }
                                                  value={
                                                    rejectionReasons[
                                                      document.id
                                                    ] ??
                                                    ""
                                                  }
                                                  onChange={(
                                                    event,
                                                  ) => {
                                                    setRejectionReasons(
                                                      (
                                                        current,
                                                      ) => ({
                                                        ...current,

                                                        [
                                                          document.id
                                                        ]:
                                                          event.target.value,
                                                      }),
                                                    );
                                                  }}
                                                  placeholder="Example: the executed agreement is incomplete or the signature page is missing."
                                                  className="mt-1.5 w-full resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100"
                                                />

                                                <button
                                                  type="button"
                                                  disabled={
                                                    action !==
                                                      null ||
                                                    !(
                                                      rejectionReasons[
                                                        document.id
                                                      ] ??
                                                      ""
                                                    ).trim()
                                                  }
                                                  onClick={() => {
                                                    void reviewDocument(
                                                      document,
                                                      "reject_document",
                                                    );
                                                  }}
                                                  className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-critical-300 bg-white px-4 py-2 text-xs font-semibold text-critical-800 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  {
                                                    action ===
                                                    rejectActionKey
                                                      ? "Rejecting..."
                                                      : "Reject internal document"
                                                  }
                                                </button>
                                              </div>
                                            </div>
                                          )
                                        }

                                        {
                                          document.status ===
                                            "under_review" &&
                                          !data.permissions.mayReview &&
                                          (
                                            <p className="mt-3 text-xs font-medium text-ink-500">
                                              Safety check passed. This internal
                                              document is awaiting an authorized
                                              reviewer.
                                            </p>
                                          )
                                        }

                                        {
                                          document.status ===
                                            "accepted" &&
                                          (
                                            <p className="mt-3 text-xs font-medium text-accent-800">
                                              Accepted as Duequity internal
                                              workflow evidence. This does not
                                              satisfy an agency filing
                                              requirement.
                                            </p>
                                          )
                                        }

                                        {
                                          document.status ===
                                            "rejected" &&
                                          (
                                            <p className="mt-3 text-xs font-medium text-critical-700">
                                              This internal document was
                                              rejected or blocked. Upload a
                                              corrected replacement.
                                            </p>
                                          )
                                        }

                                        {
                                          document.status ===
                                            "superseded" &&
                                          (
                                            <p className="mt-3 text-xs text-ink-500">
                                              This internal document has been
                                              replaced by a newer accepted
                                              version.
                                            </p>
                                          )
                                        }
                                      </div>
                                    );
                                  },
                                )
                              }
                            </div>
                          )
                        : (
                            <div className="mt-4 rounded-md border border-dashed border-line bg-inset px-4 py-4">
                              <p className="text-sm font-medium text-ink-700">
                                No internal agreement document received
                              </p>

                              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                This does not block the agency-document control
                                by itself. Agreement readiness is evaluated
                                separately.
                              </p>
                            </div>
                          )
                    }
                  </div>
                );
              },
            )
          }
        </div>
      </section>

      {/* =============================================================== completion */}

      {
        data.readiness.complete
          ? (
              <section className="rounded-lg border border-accent-200 bg-accent-50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-accent-900">
                      Agency document control complete
                    </p>

                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-accent-800">
                      Every current jurisdiction-required agency document has
                      passed safety controls and has accepted matching evidence.
                    </p>
                  </div>

                  <Badge
                    tone="positive"
                    size="md"
                  >
                    {
                      data.readiness.acceptedCount
                    }{" "}
                    of{" "}
                    {
                      data.readiness.requiredCount
                    }
                  </Badge>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-ink-600">
                  Document completion does not itself authorize filing. The
                  overall claim readiness engine must still confirm every other
                  filing control.
                </p>
              </section>
            )
          : (
              <section className="rounded-lg border border-caution-200 bg-caution-50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-caution-900">
                      Documents still blocking filing
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-caution-800">
                      {
                        data.readiness.outstandingCount
                      }{" "}
                      required document
                      {
                        data.readiness.outstandingCount ===
                        1
                          ? ""
                          : "s"
                      }{" "}
                      still need accepted evidence.
                    </p>
                  </div>

                  <Badge
                    tone="caution"
                    size="md"
                  >
                    {
                      data.readiness.acceptedCount
                    }{" "}
                    of{" "}
                    {
                      data.readiness.requiredCount
                    }{" "}
                    accepted
                  </Badge>
                </div>
              </section>
            )
      }
    </div>
  );
}