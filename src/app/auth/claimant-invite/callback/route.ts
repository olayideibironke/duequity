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
   * Support both the PKCE callback shape and the token-hash email-template
   * shape. The callback accepts only an invite flow.
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
    await supabase.auth.signOut();

    return redirectTo(
      request,
      "/claimant/sign-in?error=activation",
    );
  }

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
    await supabase.auth.signOut();

    return redirectTo(
      request,
      "/claimant/sign-in?error=activation",
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