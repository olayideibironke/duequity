"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

const ACTIVATE_PATH =
  "/claimant/activate";

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
/* Activation                                                                  */
/* ========================================================================== */

export async function activateClaimantAccount(
  formData:
    FormData,
) {
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
      `${ACTIVATE_PATH}?status=invalid-password`,
    );
  }

  const supabase =
    await getSupabaseServerAuth();

  const {
    data: {
      user,
    },
    error:
      userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=invalid-invitation`,
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data:
      invitation,
    error:
      invitationError,
  } =
    await admin
      .from(
        "claimant_activation_invitations",
      )
      .select(
        "id, claimant_id, claimant_reference, email, status, expires_at",
      )
      .eq(
        "auth_user_id",
        user.id,
      )
      .eq(
        "status",
        "sent",
      )
      .maybeSingle();

  if (
    invitationError ||
    !invitation
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=invalid-invitation`,
    );
  }

  if (
    new Date(
      String(
        invitation.expires_at,
      ),
    ).getTime() <=
    Date.now()
  ) {
    await admin
      .from(
        "claimant_activation_invitations",
      )
      .update({
        status:
          "expired",

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        invitation.id,
      )
      .eq(
        "status",
        "sent",
      );

    await supabase.auth.signOut();

    redirect(
      `${ACTIVATE_PATH}?status=expired`,
    );
  }

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
        "claimant_id, claimant_reference, claimant_auth_user_id, email",
      )
      .eq(
        "claimant_id",
        invitation.claimant_id,
      )
      .maybeSingle();

  if (
    claimantError ||
    !claimant ||
    claimant.claimant_auth_user_id !==
      user.id ||
    claimant.claimant_reference !==
      invitation.claimant_reference ||
    String(
      claimant.email,
    ).toLowerCase() !==
      String(
        invitation.email,
      ).toLowerCase()
  ) {
    await supabase.auth.signOut();

    redirect(
      `${ACTIVATE_PATH}?status=invalid-invitation`,
    );
  }

  const {
    error:
      passwordError,
  } =
    await supabase.auth.updateUser({
      password,
    });

  if (
    passwordError
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=unavailable`,
    );
  }

  const activatedAt =
    new Date().toISOString();

  const {
    data:
      activatedInvitation,
    error:
      activationError,
  } =
    await admin
      .from(
        "claimant_activation_invitations",
      )
      .update({
        status:
          "activated",

        activated_at:
          activatedAt,

        updated_at:
          activatedAt,
      })
      .eq(
        "id",
        invitation.id,
      )
      .eq(
        "status",
        "sent",
      )
      .select(
        "id",
      )
      .maybeSingle();

  if (
    activationError ||
    !activatedInvitation
  ) {
    await supabase.auth.signOut();

    redirect(
      `${ACTIVATE_PATH}?status=unavailable`,
    );
  }

  /*
   * Account activation is complete, but the identity-document gate remains
   * independent. The claimant may sign in and use the portal while the claim
   * remains blocked from further processing until government ID is accepted.
   */
  await supabase.auth.signOut();

  revalidatePath(
    "/",
    "layout",
  );

  redirect(
    "/claimant/sign-in?account=activated",
  );
}