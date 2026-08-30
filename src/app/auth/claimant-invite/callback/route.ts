import type {
  EmailOtpType,
} from "@supabase/supabase-js";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Redirect helper                                                             */
/* ========================================================================== */

function redirectTo(
  request:
    NextRequest,
  path:
    string,
) {
  return NextResponse.redirect(
    new URL(
      path,
      request.url,
    ),
  );
}

/* ========================================================================== */
/* Callback                                                                    */
/* ========================================================================== */

export async function GET(
  request:
    NextRequest,
) {
  const supabase =
    await getSupabaseServerAuth();

  const code =
    request.nextUrl.searchParams
      .get(
        "code",
      )
      ?.trim();

  const tokenHash =
    request.nextUrl.searchParams
      .get(
        "token_hash",
      )
      ?.trim();

  const type =
    request.nextUrl.searchParams
      .get(
        "type",
      )
      ?.trim();

  /*
   * Support both PKCE callbacks and token-hash invitation templates.
   */
  if (code) {
    const {
      error,
    } =
      await supabase.auth
        .exchangeCodeForSession(
          code,
        );

    if (error) {
      return redirectTo(
        request,
        "/claimant/sign-in?error=activation",
      );
    }
  } else if (
    tokenHash &&
    type ===
      "invite"
  ) {
    const {
      error,
    } =
      await supabase.auth
        .verifyOtp({
          token_hash:
            tokenHash,

          type:
            type as EmailOtpType,
        });

    if (error) {
      return redirectTo(
        request,
        "/claimant/sign-in?error=activation",
      );
    }
  }

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
    return redirectTo(
      request,
      "/claimant/sign-in?error=activation",
    );
  }

  const admin =
    getSupabaseAdmin();

  /*
   * Claimant Auth identities may never overlap with DueQuity staff.
   */
  const {
    data:
      staffUser,
    error:
      staffError,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id",
      )
      .eq(
        "id",
        user.id,
      )
      .maybeSingle();

  if (
    staffError ||
    staffUser
  ) {
    await supabase.auth.signOut({
      scope:
        "local",
    });

    return redirectTo(
      request,
      "/claimant/sign-in?error=activation",
    );
  }

  /* ======================================================================== */
  /* Existing Claim-backed activation                                         */
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
    await supabase.auth.signOut({
      scope:
        "local",
    });

    return redirectTo(
      request,
      "/claimant/sign-in?error=activation",
    );
  }

  const claimInvitation =
    claimInvitationRows?.[0];

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

      return redirectTo(
        request,
        "/claimant/sign-in?error=activation-expired",
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

      return redirectTo(
        request,
        "/claimant/sign-in?error=activation",
      );
    }

    return redirectTo(
      request,
      "/claimant/activate",
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
    assignedInvitationError
  ) {
    await supabase.auth.signOut({
      scope:
        "local",
    });

    return redirectTo(
      request,
      "/claimant/sign-in?error=activation",
    );
  }

  const assignedInvitation =
    assignedInvitationRows?.[0];

  if (
    !assignedInvitation
  ) {
    await supabase.auth.signOut({
      scope:
        "local",
    });

    return redirectTo(
      request,
      "/claimant/sign-in?error=activation",
    );
  }

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

    return redirectTo(
      request,
      "/claimant/sign-in?error=activation-expired",
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

    return redirectTo(
      request,
      "/claimant/sign-in?error=activation",
    );
  }

  return redirectTo(
    request,
    "/claimant/activate",
  );
}