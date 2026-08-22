"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseAdmin } from "@/server/supabase-admin";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

const ACTIVATE_PATH =
  "/claimant/activate";

interface ClaimantActivationRow {
  claimant_id: string;
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

export async function activateClaimantAccount(
  formData: FormData,
) {
  const claimantReference =
    readFormValue(
      formData,
      "claimantReference",
    );

  const email =
    readFormValue(
      formData,
      "email",
    ).toLowerCase();

  const mobilePhone =
    normalizePhone(
      readFormValue(
        formData,
        "mobilePhone",
      ),
    );

  const password =
    readFormValue(
      formData,
      "password",
    );

  const confirmPassword =
    readFormValue(
      formData,
      "confirmPassword",
    );

  if (
    !claimantReference ||
    !email ||
    mobilePhone.length !== 10 ||
    password.length < 12 ||
    password !== confirmPassword
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=invalid`,
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data: claimantData,
    error: claimantError,
  } =
    await admin
      .from("claimant_onboarding")
      .select(
        "claimant_id, claimant_auth_user_id",
      )
      .eq(
        "claimant_reference",
        claimantReference,
      )
      .ilike(
        "email",
        email,
      )
      .eq(
        "mobile_phone",
        mobilePhone,
      )
      .maybeSingle();

  if (claimantError) {
    redirect(
      `${ACTIVATE_PATH}?status=unavailable`,
    );
  }

  if (!claimantData) {
    redirect(
      `${ACTIVATE_PATH}?status=not-found`,
    );
  }

  const claimant =
    claimantData as ClaimantActivationRow;

  if (
    claimant.claimant_auth_user_id
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=already-active`,
    );
  }

  const origin =
    await resolveRequestOrigin();

  const supabase =
    await getSupabaseServerAuth();

  const {
    data: authData,
    error: authError,
  } =
    await supabase.auth.signUp({
      email,
      password,

      options: {
        emailRedirectTo:
          `${origin}/auth/confirm`,
      },
    });

  if (
    authError ||
    !authData.user
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=unavailable`,
    );
  }

  /*
   * A legitimate new email/password identity should contain an email identity.
   * Supabase can intentionally return an obfuscated response for an email that
   * already belongs to an Auth user. Never link that response to a claimant.
   */
  if (
    !authData.user.identities ||
    authData.user.identities.length === 0
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=unavailable`,
    );
  }

  /*
   * Claimant activation requires email confirmation.
   *
   * Hosted Supabase projects normally require email confirmation, which means
   * signUp returns no session until the claimant confirms the email. If a live
   * session is returned here, email confirmation has been disabled. Fail closed
   * rather than activating an identity without proving control of the email.
   */
  if (authData.session) {
    await supabase.auth.signOut();

    await admin.auth.admin.deleteUser(
      authData.user.id,
    );

    redirect(
      `${ACTIVATE_PATH}?status=unavailable`,
    );
  }

  const {
    data: linkedClaimant,
    error: linkError,
  } =
    await admin
      .from("claimant_onboarding")
      .update({
        claimant_auth_user_id:
          authData.user.id,
      })
      .eq(
        "claimant_id",
        claimant.claimant_id,
      )
      .is(
        "claimant_auth_user_id",
        null,
      )
      .select(
        "claimant_id",
      )
      .maybeSingle();

  if (
    linkError ||
    !linkedClaimant
  ) {
    await admin.auth.admin.deleteUser(
      authData.user.id,
    );

    redirect(
      `${ACTIVATE_PATH}?status=unavailable`,
    );
  }

  redirect(
    `${ACTIVATE_PATH}?status=sent`,
  );
}