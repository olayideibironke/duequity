"use server";

import {
  redirect,
} from "next/navigation";

import {
  createPublicContactInquiry,
  PublicContactSubmissionError,
} from "@/server/contact-inquiry-store";

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

export async function submitPublicContactInquiry(
  formData: FormData,
): Promise<void> {
  /*
   * Honeypot field.
   * Human visitors never interact with this input.
   */
  if (
    formText(
      formData,
      "website",
    ).trim()
  ) {
    redirect(
      "/contact?status=sent",
    );
  }

  let status:
    | "sent"
    | "invalid"
    | "rate-limited"
    | "unavailable" =
    "sent";

  try {
    await createPublicContactInquiry({
      requesterName:
        formText(
          formData,
          "name",
        ),

      requesterEmail:
        formText(
          formData,
          "email",
        ),

      requesterPhone:
        formText(
          formData,
          "phone",
        ),

      category:
        formText(
          formData,
          "category",
        ),

      subject:
        formText(
          formData,
          "subject",
        ),

      bodyText:
        formText(
          formData,
          "message",
        ),
    });
  } catch (
    error
  ) {
    if (
      error instanceof
      PublicContactSubmissionError
    ) {
      status =
        error.code ===
        "rate_limited"
          ? "rate-limited"
          : error.code;
    } else {
      status =
        "unavailable";
    }
  }

  redirect(
    `/contact?status=${status}`,
  );
}