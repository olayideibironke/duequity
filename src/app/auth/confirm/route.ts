import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { resolveClaimantSession } from "@/server/claimant-session";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

export async function GET(
  request: NextRequest,
) {
  const requestUrl =
    new URL(request.url);

  const code =
    requestUrl.searchParams.get("code");

  const tokenHash =
    requestUrl.searchParams.get("token_hash");

  const type =
    requestUrl.searchParams.get("type") as EmailOtpType | null;

  const supabase =
    await getSupabaseServerAuth();

  if (tokenHash && type) {
    const {
      error,
    } =
      await supabase.auth.verifyOtp({
        token_hash:
          tokenHash,

        type,
      });

    if (error) {
      return NextResponse.redirect(
        new URL(
          "/claimant/sign-in?error=confirmation",
          request.url,
        ),
        {
          status: 303,
        },
      );
    }
  } else if (code) {
    const {
      error,
    } =
      await supabase.auth.exchangeCodeForSession(
        code,
      );

    if (error) {
      return NextResponse.redirect(
        new URL(
          "/claimant/sign-in?error=confirmation",
          request.url,
        ),
        {
          status: 303,
        },
      );
    }
  } else {
    return NextResponse.redirect(
      new URL(
        "/claimant/sign-in?error=confirmation",
        request.url,
      ),
      {
        status: 303,
      },
    );
  }

  const claimantSession =
    await resolveClaimantSession();

  if (!claimantSession) {
    await supabase.auth.signOut();

    return NextResponse.redirect(
      new URL(
        "/claimant/sign-in?error=confirmation",
        request.url,
      ),
      {
        status: 303,
      },
    );
  }

  return NextResponse.redirect(
    new URL(
      "/portal",
      request.url,
    ),
    {
      status: 303,
    },
  );
}