"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseServerAuth } from "@/server/supabase-auth";

type AuthAudience =
  | "staff"
  | "claimant";

const FORGOT_PASSWORD_PATH =
  "/auth/forgot-password";

function readFormValue(
  formData: FormData,
  name: string,
): string {
  const value =
    formData.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function readAudience(
  formData: FormData,
): AuthAudience {
  return readFormValue(
    formData,
    "audience",
  ) === "staff"
    ? "staff"
    : "claimant";
}

async function resolveRequestOrigin(): Promise<string> {
  const requestHeaders =
    await headers();

  const origin =
    requestHeaders
      .get("origin")
      ?.trim();

  if (origin) {
    return origin.replace(
      /\/+$/,
      "",
    );
  }

  const forwardedHost =
    requestHeaders
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();

  const host =
    forwardedHost ||
    requestHeaders
      .get("host")
      ?.trim();

  const forwardedProto =
    requestHeaders
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();

  const protocol =
    forwardedProto ||
    (
      host?.startsWith("localhost") ||
      host?.startsWith("127.0.0.1")
        ? "http"
        : "https"
    );

  if (!host) {
    throw new Error(
      "Unable to determine the application origin.",
    );
  }

  return `${protocol}://${host}`;
}

export async function requestPasswordReset(
  formData: FormData,
) {
  const audience =
    readAudience(formData);

  const email =
    readFormValue(
      formData,
      "email",
    ).toLowerCase();

  if (!email) {
    redirect(
      `${FORGOT_PASSWORD_PATH}?audience=${audience}&status=invalid`,
    );
  }

  const origin =
    await resolveRequestOrigin();

  const supabase =
    await getSupabaseServerAuth();

  const {
    error,
  } =
    await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo:
          `${origin}/auth/recovery/callback?audience=${audience}`,
      },
    );

  if (error) {
    redirect(
      `${FORGOT_PASSWORD_PATH}?audience=${audience}&status=unavailable`,
    );
  }

  redirect(
    `${FORGOT_PASSWORD_PATH}?audience=${audience}&status=sent`,
  );
}