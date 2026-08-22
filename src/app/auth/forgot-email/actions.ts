"use server";

import { redirect } from "next/navigation";

import { getSupabaseAdmin } from "@/server/supabase-admin";

const FORGOT_EMAIL_PATH =
  "/auth/forgot-email";

interface ClaimantRecoveryRow {
  claimant_auth_user_id: string | null;
}

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

function normalizePhone(
  value: string,
): string {
  return value.replace(
    /\D/g,
    "",
  );
}

function maskEmail(
  email: string,
): string {
  const [
    localPart,
    domain,
  ] =
    email.split("@");

  if (
    !localPart ||
    !domain
  ) {
    return "Email on file";
  }

  const domainParts =
    domain.split(".");

  const domainName =
    domainParts[0] ?? "";

  const domainSuffix =
    domainParts
      .slice(1)
      .join(".");

  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? "*"}***`
      : `${localPart[0]}***${localPart[localPart.length - 1]}`;

  const maskedDomain =
    domainName.length <= 2
      ? `${domainName[0] ?? "*"}***`
      : `${domainName[0]}***${domainName[domainName.length - 1]}`;

  return domainSuffix
    ? `${maskedLocal}@${maskedDomain}.${domainSuffix}`
    : `${maskedLocal}@${maskedDomain}`;
}

export async function recoverSignInEmail(
  formData: FormData,
) {
  const claimantReference =
    readFormValue(
      formData,
      "claimantReference",
    );

  const mobilePhone =
    normalizePhone(
      readFormValue(
        formData,
        "mobilePhone",
      ),
    );

  if (
    !claimantReference ||
    mobilePhone.length !== 10
  ) {
    redirect(
      `${FORGOT_EMAIL_PATH}?status=invalid`,
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from("claimant_onboarding")
      .select(
        "claimant_auth_user_id",
      )
      .eq(
        "claimant_reference",
        claimantReference,
      )
      .eq(
        "mobile_phone",
        mobilePhone,
      )
      .maybeSingle();

  if (error) {
    redirect(
      `${FORGOT_EMAIL_PATH}?status=unavailable`,
    );
  }

  if (
    !data ||
    !(
      data as ClaimantRecoveryRow
    ).claimant_auth_user_id
  ) {
    redirect(
      `${FORGOT_EMAIL_PATH}?status=not-found`,
    );
  }

  const authUserId =
    (
      data as ClaimantRecoveryRow
    ).claimant_auth_user_id;

  if (!authUserId) {
    redirect(
      `${FORGOT_EMAIL_PATH}?status=not-found`,
    );
  }

  const {
    data: authData,
    error: authError,
  } =
    await admin.auth.admin.getUserById(
      authUserId,
    );

  if (
    authError ||
    !authData.user?.email
  ) {
    redirect(
      `${FORGOT_EMAIL_PATH}?status=unavailable`,
    );
  }

  const emailHint =
    maskEmail(
      authData.user.email,
    );

  const searchParams =
    new URLSearchParams({
      status:
        "found",

      hint:
        emailHint,
    });

  redirect(
    `${FORGOT_EMAIL_PATH}?${searchParams.toString()}`,
  );
}