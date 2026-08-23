import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { getSupabaseAdmin } from "@/server/supabase-admin";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface InvitedStaffRow {
  id: string;

  email: string;

  status: string;
}

/* ========================================================================== */
/* Redirect helpers                                                            */
/* ========================================================================== */

function activationRedirect(
  request: NextRequest,
  status?: string,
): NextResponse {
  const url =
    new URL(
      "/staff/activate",
      request.url,
    );

  if (status) {
    url.searchParams.set(
      "status",
      status,
    );
  }

  return NextResponse.redirect(
    url,
    {
      status: 303,
    },
  );
}

async function rejectInvitation(
  request: NextRequest,
): Promise<NextResponse> {
  const supabase =
    await getSupabaseServerAuth();

  await supabase.auth.signOut();

  return activationRedirect(
    request,
    "invalid",
  );
}

/* ========================================================================== */
/* Callback                                                                    */
/* ========================================================================== */

export async function GET(
  request: NextRequest,
) {
  const requestUrl =
    new URL(
      request.url,
    );

  const tokenHash =
    requestUrl.searchParams.get(
      "token_hash",
    );

  const type =
    requestUrl.searchParams.get(
      "type",
    );

  /*
   * This endpoint exists only for administrator-issued staff invitations.
   * Do not accept signup, recovery, magic-link or claimant confirmation
   * tokens through this route.
   */
  if (
    !tokenHash ||
    type !== "invite"
  ) {
    return rejectInvitation(
      request,
    );
  }

  const supabase =
    await getSupabaseServerAuth();

  const {
    error: verifyError,
  } =
    await supabase.auth.verifyOtp({
      token_hash:
        tokenHash,

      type:
        "invite",
    });

  if (verifyError) {
    return rejectInvitation(
      request,
    );
  }

  const {
    data: {
      user: authUser,
    },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !authUser ||
    !authUser.email
  ) {
    return rejectInvitation(
      request,
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error: profileError,
  } =
    await admin
      .from("staff_users")
      .select(
        "id, email, status",
      )
      .eq(
        "id",
        authUser.id,
      )
      .maybeSingle();

  if (
    profileError ||
    !data
  ) {
    return rejectInvitation(
      request,
    );
  }

  const staff =
    data as InvitedStaffRow;

  if (
    staff.status !== "invited" ||
    staff.email
      .trim()
      .toLowerCase() !==
      authUser.email
        .trim()
        .toLowerCase()
  ) {
    return rejectInvitation(
      request,
    );
  }

  return activationRedirect(
    request,
  );
}