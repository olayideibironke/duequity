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

async function rejectSignIn(): Promise<
  never
> {
  const supabase =
    await getSupabaseServerAuth();

  await supabase.auth.signOut({
    scope:
      "local",
  });

  redirect(
    `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
  );
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
    error:
      signInError,
  } =
    await supabase.auth
      .signInWithPassword({
        email,

        password,
      });

  if (
    signInError
  ) {
    redirect(
      `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
    );
  }

  /*
   * This resolver supports both claimant architectures:
   *
   * 1. Claim-backed claimant_onboarding accounts.
   * 2. Activated Admin-assigned pre-Claim workcases.
   *
   * Successful Supabase authentication alone is not enough.
   * The Auth identity must belong to a recognized DueQuity claimant.
   */
  const claimantSession =
    await resolveClaimantSession();

  const claimantId =
    claimantSession?.claimantId ??
    "";

  if (
    !claimantId
  ) {
    await rejectSignIn();
  }

  const admin =
    getSupabaseAdmin();

  /* ======================================================================== */
  /* Established Claim-backed claimant                                        */
  /* ======================================================================== */

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
        claimantId,
      )
      .maybeSingle();

  if (
    claimantError
  ) {
    await rejectSignIn();
  }

  if (
    claimant
  ) {
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

  /* ======================================================================== */
  /* Admin-assigned pre-Claim claimant                                        */
  /* ======================================================================== */

  /*
   * A pre-Claim claimant intentionally does not yet have a claimant_onboarding
   * row.
   *
   * Do not mistake that valid architecture for a failed claimant login.
   *
   * Reconfirm the activated workcase before allowing portal access so this
   * boundary remains fail-closed.
   */
  const {
    data:
      assignedWorkcase,
    error:
      assignedWorkcaseError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, status",
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .maybeSingle();

  if (
    assignedWorkcaseError ||
    !assignedWorkcase ||
    assignedWorkcase.status !==
      "activated"
  ) {
    await rejectSignIn();
  }

  revalidatePath(
    "/",
    "layout",
  );

  /*
   * The claimant account is authenticated and activated.
   *
   * Do not force this pre-Claim claimant through the Claim-bound identity
   * workflow. That workflow requires an actual persisted Claim, and DueQuity
   * must not fabricate one merely to satisfy portal routing.
   */
  redirect(
    "/portal",
  );
}