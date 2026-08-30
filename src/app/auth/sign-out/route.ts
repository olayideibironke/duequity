import {
  revalidatePath,
} from "next/cache";

import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  getSupabaseServerAuth,
} from "@/server/supabase-auth";

/* ========================================================================== */
/* Redirect resolution                                                         */
/* ========================================================================== */

function signedOutDestination(
  request:
    NextRequest,
): string {
  const referer =
    request.headers.get(
      "referer",
    );

  if (!referer) {
    return "/";
  }

  try {
    const url =
      new URL(
        referer,
      );

    if (
      url.pathname ===
        "/pro" ||
      url.pathname.startsWith(
        "/pro/",
      ) ||
      url.pathname ===
        "/staff" ||
      url.pathname.startsWith(
        "/staff/",
      )
    ) {
      return "/staff/sign-in";
    }

    if (
      url.pathname ===
        "/portal" ||
      url.pathname.startsWith(
        "/portal/",
      ) ||
      url.pathname ===
        "/claimant" ||
      url.pathname.startsWith(
        "/claimant/",
      )
    ) {
      return "/claimant/sign-in";
    }
  } catch {
    /*
     * Invalid or unavailable Referer values fall back to the public site.
     */
  }

  return "/";
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request:
    NextRequest,
) {
  const supabase =
    await getSupabaseServerAuth();

  /*
   * Remove the browser-local Supabase session.
   *
   * After this call, resolveStaffSession() no longer substitutes a configured
   * development staff account unless the explicit local-development fallback
   * safety switch has been enabled.
   */
  await supabase.auth.signOut({
    scope:
      "local",
  });

  revalidatePath(
    "/",
    "layout",
  );

  return NextResponse.redirect(
    new URL(
      signedOutDestination(
        request,
      ),
      request.url,
    ),
    {
      status:
        303,
    },
  );
}