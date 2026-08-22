import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { getSupabaseServerAuth } from "@/server/supabase-auth";

type AuthAudience =
  | "staff"
  | "claimant";

function resolveAudience(
  value: string | null,
): AuthAudience {
  return value === "staff"
    ? "staff"
    : "claimant";
}

export async function GET(
  request: NextRequest,
) {
  const code =
    request.nextUrl.searchParams
      .get("code")
      ?.trim();

  const audience =
    resolveAudience(
      request.nextUrl.searchParams.get(
        "audience",
      ),
    );

  const redirectTo =
    request.nextUrl.clone();

  redirectTo.search = "";

  if (!code) {
    redirectTo.pathname =
      "/auth/forgot-password";

    redirectTo.searchParams.set(
      "audience",
      audience,
    );

    redirectTo.searchParams.set(
      "status",
      "unavailable",
    );

    return NextResponse.redirect(
      redirectTo,
    );
  }

  const supabase =
    await getSupabaseServerAuth();

  const {
    error,
  } =
    await supabase.auth.exchangeCodeForSession(
      code,
    );

  if (error) {
    redirectTo.pathname =
      "/auth/forgot-password";

    redirectTo.searchParams.set(
      "audience",
      audience,
    );

    redirectTo.searchParams.set(
      "status",
      "unavailable",
    );

    return NextResponse.redirect(
      redirectTo,
    );
  }

  redirectTo.pathname =
    "/auth/update-password";

  redirectTo.searchParams.set(
    "audience",
    audience,
  );

  return NextResponse.redirect(
    redirectTo,
  );
}