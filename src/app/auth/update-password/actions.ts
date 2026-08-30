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
  resolveStaffSession,
} from "@/server/staff-session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

type AuthAudience =
  | "staff"
  | "claimant";

const UPDATE_PASSWORD_PATH =
  "/auth/update-password";

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

function readAudience(
  formData:
    FormData,
): AuthAudience {
  return readFormValue(
    formData,
    "audience",
  ) ===
    "staff"
    ? "staff"
    : "claimant";
}

/* ========================================================================== */
/* Update password                                                             */
/* ========================================================================== */

export async function updatePassword(
  formData:
    FormData,
) {
  const audience =
    readAudience(
      formData,
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
    password.length <
      12 ||
    password !==
      confirmPassword
  ) {
    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=invalid`,
    );
  }

  /* ======================================================================== */
  /* Authorized DueQuity account                                              */
  /* ======================================================================== */

  const authorizedSession =
    audience ===
    "staff"
      ? await resolveStaffSession()
      : await resolveClaimantSession();

  if (
    !authorizedSession
  ) {
    const supabase =
      await getSupabaseServerAuth();

    await supabase.auth.signOut();

    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=expired`,
    );
  }

  /* ======================================================================== */
  /* Current authenticated Supabase identity                                  */
  /* ======================================================================== */

  const supabase =
    await getSupabaseServerAuth();

  const {
    data: {
      user:
        authUser,
    },
    error:
      authUserError,
  } =
    await supabase.auth.getUser();

  if (
    authUserError ||
    !authUser
  ) {
    await supabase.auth.signOut();

    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=expired`,
    );
  }

  /* ======================================================================== */
  /* Current-password reuse guard                                             */
  /* ======================================================================== */

  const admin =
    getSupabaseAdmin();

  const {
    data:
      passwordMatches,
    error:
      passwordMatchError,
  } =
    await admin.rpc(
      "current_auth_password_matches",
      {
        p_auth_user_id:
          authUser.id,

        p_candidate_password:
          password,
      },
    );

  if (
    passwordMatchError ||
    typeof passwordMatches !==
      "boolean"
  ) {
    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=failed`,
    );
  }

  if (
    passwordMatches
  ) {
    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=password-reused`,
    );
  }

  /* ======================================================================== */
  /* Persist new password                                                     */
  /* ======================================================================== */

  const {
    error,
  } =
    await supabase.auth.updateUser({
      password,
    });

  if (
    error
  ) {
    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=failed`,
    );
  }

  await supabase.auth.signOut();

  revalidatePath(
    "/",
    "layout",
  );

  redirect(
    `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=updated`,
  );
}