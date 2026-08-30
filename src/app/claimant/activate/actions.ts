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

  /* ======================================================================== */
  /* Resolve existing Claim-backed invitation first                           */
  /* ======================================================================== */

  const {
    data:
      claimInvitationRows,
    error:
      claimInvitationError,
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
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      );

  if (
    claimInvitationError
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=invalid-invitation`,
    );
  }

  const claimInvitation =
    claimInvitationRows?.[0];

  /* ======================================================================== */
  /* Existing Claim-backed activation                                         */
  /* ======================================================================== */

  if (
    claimInvitation
  ) {
    if (
      new Date(
        String(
          claimInvitation.expires_at,
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
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          claimInvitation.id,
        )
        .eq(
          "status",
          "sent",
        );

      await supabase.auth.signOut({
        scope:
          "local",
      });

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
          claimInvitation.claimant_id,
        )
        .maybeSingle();

    if (
      claimantError ||
      !claimant ||
      claimant.claimant_auth_user_id !==
        user.id ||
      claimant.claimant_reference !==
        claimInvitation.claimant_reference ||
      String(
        claimant.email,
      ).toLowerCase() !==
        String(
          claimInvitation.email,
        ).toLowerCase()
    ) {
      await supabase.auth.signOut({
        scope:
          "local",
      });

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
      new Date()
        .toISOString();

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
          claimInvitation.id,
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
      await supabase.auth.signOut({
        scope:
          "local",
      });

      redirect(
        `${ACTIVATE_PATH}?status=unavailable`,
      );
    }

    await supabase.auth.signOut({
      scope:
        "local",
    });

    revalidatePath(
      "/",
      "layout",
    );

    redirect(
      "/claimant/sign-in?account=activated",
    );
  }

  /* ======================================================================== */
  /* Admin-assigned pre-Claim activation                                      */
  /* ======================================================================== */

  const {
    data:
      assignedInvitationRows,
    error:
      assignedInvitationError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_activation_invitations",
      )
      .select(
        "id, workcase_id, claimant_id, claimant_reference, email, status, expires_at",
      )
      .eq(
        "auth_user_id",
        user.id,
      )
      .eq(
        "status",
        "sent",
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      );

  if (
    assignedInvitationError ||
    !assignedInvitationRows?.[0]
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=invalid-invitation`,
    );
  }

  const assignedInvitation =
    assignedInvitationRows[0];

  if (
    new Date(
      String(
        assignedInvitation.expires_at,
      ),
    ).getTime() <=
    Date.now()
  ) {
    await admin.rpc(
      "expire_assigned_lead_claimant_activation_invitation",
      {
        p_invitation_id:
          assignedInvitation.id,
      },
    );

    await supabase.auth.signOut({
      scope:
        "local",
    });

    redirect(
      `${ACTIVATE_PATH}?status=expired`,
    );
  }

  const {
    data:
      workcase,
    error:
      workcaseError,
  } =
    await admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "id, claimant_id, claimant_reference, email, auth_user_id, status",
      )
      .eq(
        "id",
        assignedInvitation.workcase_id,
      )
      .maybeSingle();

  if (
    workcaseError ||
    !workcase ||
    workcase.claimant_id !==
      assignedInvitation.claimant_id ||
    workcase.claimant_reference !==
      assignedInvitation.claimant_reference ||
    workcase.auth_user_id !==
      user.id ||
    workcase.status !==
      "activation_sent" ||
    String(
      workcase.email,
    ).toLowerCase() !==
      String(
        assignedInvitation.email,
      ).toLowerCase()
  ) {
    await supabase.auth.signOut({
      scope:
        "local",
    });

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

  const {
    data:
      activatedWorkcase,
    error:
      activationError,
  } =
    await admin.rpc(
      "activate_assigned_lead_claimant_workcase",
      {
        p_auth_user_id:
          user.id,

        p_claimant_id:
          assignedInvitation.claimant_id,
      },
    );

  if (
    activationError ||
    !Array.isArray(
      activatedWorkcase,
    ) ||
    activatedWorkcase.length !==
      1
  ) {
    await supabase.auth.signOut({
      scope:
        "local",
    });

    redirect(
      `${ACTIVATE_PATH}?status=unavailable`,
    );
  }

  await supabase.auth.signOut({
    scope:
      "local",
  });

  revalidatePath(
    "/",
    "layout",
  );

  redirect(
    "/claimant/sign-in?account=activated",
  );
}