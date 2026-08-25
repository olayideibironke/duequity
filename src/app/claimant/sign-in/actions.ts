"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  resolveClaimantSession,
} from "@/server/claimant-session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

const CLAIMANT_SIGN_IN_PATH =
  "/claimant/sign-in";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function readFormValue(
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
/* Sign in                                                                     */
/* ========================================================================== */

export async function signInClaimant(
  formData:
    FormData,
) {
  const email =
    readFormValue(
      formData,
      "email",
    ).toLowerCase();

  const password =
    readFormValue(
      formData,
      "password",
    );

  if (
    !email ||
    !password
  ) {
    redirect(
      `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
    );
  }

  const supabase =
    await getSupabaseServerAuth();

  const {
    error,
  } =
    await supabase.auth
      .signInWithPassword({
        email,

        password,
      });

  if (
    error
  ) {
    redirect(
      `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
    );
  }

  const claimantSession =
    await resolveClaimantSession();

  if (
    !claimantSession
  ) {
    await supabase.auth.signOut();

    redirect(
      `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data:
      claimant,
    error:
      claimantError,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .select(
        "identity_verification",
      )
      .eq(
        "claimant_id",
        claimantSession.claimantId,
      )
      .maybeSingle();

  if (
    claimantError ||
    !claimant
  ) {
    await supabase.auth.signOut();

    redirect(
      `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
    );
  }

  revalidatePath(
    "/",
    "layout",
  );

  if (
    claimant.identity_verification !==
    "verified"
  ) {
    redirect(
      "/portal/identity",
    );
  }

  redirect(
    "/portal",
  );
}