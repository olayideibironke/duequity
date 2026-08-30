"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  createPreclaimSupportingDocumentRequest,
  isPreclaimSupportingDocumentKind,
} from "@/server/assigned-lead-supporting-document-service";

import {
  reviewPreclaimSupportingDocument,
  runPreclaimSupportingDocumentSafetyScan,
} from "@/server/assigned-lead-supporting-document-review-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function readText(
  formData:
    FormData,
  name:
    string,
): string {
  const value =
    formData.get(
      name,
    );

  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function readCheckbox(
  formData:
    FormData,
  name:
    string,
): boolean {
  return (
    formData.get(
      name,
    ) ===
    "on"
  );
}

/* ========================================================================== */
/* Create pre-Claim supporting-document request                                */
/* ========================================================================== */

export async function createSupportingDocumentRequest(
  formData:
    FormData,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    redirect(
      "/staff/sign-in",
    );
  }

  const workcaseId =
    readText(
      formData,
      "workcaseId",
    );

  const kind =
    readText(
      formData,
      "kind",
    );

  const reason =
    readText(
      formData,
      "reason",
    );

  const guidance =
    readText(
      formData,
      "guidance",
    );

  if (
    !workcaseId ||
    !isPreclaimSupportingDocumentKind(
      kind,
    ) ||
    !reason
  ) {
    redirect(
      "/pro/documents?supportingStatus=invalid",
    );
  }

  try {
    await createPreclaimSupportingDocumentRequest({
      session,

      workcaseId,

      kind,

      reason,

      guidance:
        guidance ||
        undefined,
    });
  } catch {
    redirect(
      "/pro/documents?supportingStatus=failed",
    );
  }

  revalidatePath(
    "/pro/documents",
  );

  redirect(
    "/pro/documents?supportingStatus=requested",
  );
}

/* ========================================================================== */
/* Supporting-document safety scan                                             */
/* ========================================================================== */

export async function scanSupportingDocument(
  formData:
    FormData,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    redirect(
      "/staff/sign-in",
    );
  }

  const documentId =
    readText(
      formData,
      "documentId",
    );

  if (
    !documentId
  ) {
    redirect(
      "/pro/documents?supportingReviewStatus=invalid",
    );
  }

  let outcome:
    "clean" |
    "unsafe" |
    "failed";

  try {
    const result =
      await runPreclaimSupportingDocumentSafetyScan(
        session,
        documentId,
      );

    outcome =
      result.outcome;
  } catch {
    redirect(
      "/pro/documents?supportingReviewStatus=scan-failed",
    );
  }

  revalidatePath(
    "/pro/documents",
  );

  if (
    outcome ===
      "clean"
  ) {
    redirect(
      "/pro/documents?supportingReviewStatus=scan-clean",
    );
  }

  if (
    outcome ===
      "unsafe"
  ) {
    redirect(
      "/pro/documents?supportingReviewStatus=scan-unsafe",
    );
  }

  redirect(
    "/pro/documents?supportingReviewStatus=scan-failed",
  );
}

/* ========================================================================== */
/* Supporting-document human review                                            */
/* ========================================================================== */

export async function reviewSupportingDocument(
  formData:
    FormData,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    redirect(
      "/staff/sign-in",
    );
  }

  const documentId =
    readText(
      formData,
      "documentId",
    );

  const decision =
    readText(
      formData,
      "decision",
    );

  const rejectionReason =
    readText(
      formData,
      "rejectionReason",
    );

  const documentReviewConfirmed =
    readCheckbox(
      formData,
      "documentReviewConfirmed",
    );

  if (
    !documentId ||
    (
      decision !==
        "accepted" &&
      decision !==
        "rejected"
    )
  ) {
    redirect(
      "/pro/documents?supportingReviewStatus=invalid",
    );
  }

  if (
    decision ===
      "accepted" &&
    !documentReviewConfirmed
  ) {
    redirect(
      "/pro/documents?supportingReviewStatus=confirmation-required",
    );
  }

  if (
    decision ===
      "rejected" &&
    !rejectionReason
  ) {
    redirect(
      "/pro/documents?supportingReviewStatus=rejection-reason-required",
    );
  }

  try {
    await reviewPreclaimSupportingDocument({
      session,

      documentId,

      decision,

      rejectionReason:
        rejectionReason ||
        undefined,

      documentReviewConfirmed,
    });
  } catch {
    redirect(
      "/pro/documents?supportingReviewStatus=review-failed",
    );
  }

  revalidatePath(
    "/pro/documents",
  );

  revalidatePath(
    "/portal/documents",
  );

  redirect(
    decision ===
      "accepted"
      ? "/pro/documents?supportingReviewStatus=accepted"
      : "/pro/documents?supportingReviewStatus=rejected",
  );
}