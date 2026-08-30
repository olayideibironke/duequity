"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  PRECLAIM_SUPPORTING_DOCUMENT_MAX_BYTES,
  uploadPreclaimSupportingDocument,
} from "@/server/assigned-lead-supporting-document-service";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

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

/* ========================================================================== */
/* Upload pre-Claim supporting document                                        */
/* ========================================================================== */

export async function uploadSupportingDocument(
  formData:
    FormData,
) {
  const session =
    await resolveClaimantSession();

  if (
    !session
  ) {
    redirect(
      "/claimant/sign-in",
    );
  }

  const requestId =
    readText(
      formData,
      "requestId",
    );

  const fileValue =
    formData.get(
      "file",
    );

  if (
    !requestId ||
    !(fileValue instanceof File) ||
    fileValue.size <=
      0
  ) {
    redirect(
      "/portal/documents?supportingStatus=invalid",
    );
  }

  if (
    fileValue.size >
    PRECLAIM_SUPPORTING_DOCUMENT_MAX_BYTES
  ) {
    redirect(
      "/portal/documents?supportingStatus=too-large",
    );
  }

  const buffer =
    Buffer.from(
      await fileValue.arrayBuffer(),
    );

  try {
    await uploadPreclaimSupportingDocument({
      claimantId:
        session.claimantId,

      requestId,

      originalFileName:
        fileValue.name,

      mimeType:
        fileValue.type,

      buffer,
    });
  } catch {
    redirect(
      "/portal/documents?supportingStatus=failed",
    );
  }

  revalidatePath(
    "/portal/documents",
  );

  revalidatePath(
    "/pro/documents",
  );

  redirect(
    "/portal/documents?supportingStatus=uploaded",
  );
}