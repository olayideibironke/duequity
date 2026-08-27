"use server";

import {
  redirect,
} from "next/navigation";

import {
  replyToContactInquiry,
  updateContactInquiryStatus,
} from "@/server/contact-inquiry-store";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formText(
  formData: FormData,
  key: string,
): string {
  const value =
    formData.get(
      key,
    );

  return typeof value ===
    "string"
    ? value
    : "";
}

/* ========================================================================== */
/* Status                                                                      */
/* ========================================================================== */

export async function updateContactStatusAction(
  formData:
    FormData,
): Promise<void> {
  const inquiryId =
    formText(
      formData,
      "inquiryId",
    ).trim();

  if (!inquiryId) {
    redirect(
      "/pro/contact?status=invalid",
    );
  }

  let status =
    "updated";

  try {
    await updateContactInquiryStatus(
      inquiryId,
      formText(
        formData,
        "status",
      ),
    );
  } catch {
    status =
      "update-failed";
  }

  redirect(
    `/pro/contact/${encodeURIComponent(
      inquiryId,
    )}?status=${status}`,
  );
}

/* ========================================================================== */
/* Reply                                                                       */
/* ========================================================================== */

export async function replyToContactAction(
  formData:
    FormData,
): Promise<void> {
  const inquiryId =
    formText(
      formData,
      "inquiryId",
    ).trim();

  if (!inquiryId) {
    redirect(
      "/pro/contact?status=invalid",
    );
  }

  let status =
    "replied";

  try {
    await replyToContactInquiry(
      inquiryId,
      formText(
        formData,
        "bodyText",
      ),
    );
  } catch {
    status =
      "reply-failed";
  }

  redirect(
    `/pro/contact/${encodeURIComponent(
      inquiryId,
    )}?status=${status}`,
  );
}