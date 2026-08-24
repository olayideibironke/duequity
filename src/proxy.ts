import { createServerClient } from "@supabase/ssr";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  canAccessProPath,
  staffLandingPath,
} from "@/lib/pro-access";

import {
  isUserRole,
  permissionsFor,
} from "@/lib/session";

import { getSupabaseAdmin } from "@/server/supabase-admin";

/**
 * SUPABASE AUTH SESSION + PRO ROUTE GATE
 *
 * Keeps the existing Supabase cookie-refresh architecture.
 *
 * For /pro routes only:
 * - requires a real authenticated Supabase identity
 * - requires a matching active staff_users row
 * - enforces DueQuity role permissions
 *
 * The local development adapter remains available only when explicitly enabled.
 */

function requireEnvironmentVariable(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

function localDevelopmentAdapterActive(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DUEQUITY_LOCAL_DEV_SESSION === "enabled"
  );
}

function redirectWithSessionCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
): NextResponse {
  const url =
    request.nextUrl.clone();

  url.pathname =
    pathname;

  url.search =
    "";

  const redirectResponse =
    NextResponse.redirect(url);

  /*
   * Preserve any refreshed Supabase Auth cookies.
   */
  for (
    const cookie
    of response.cookies.getAll()
  ) {
    const {
      name,
      value,
      ...options
    } =
      cookie;

    redirectResponse.cookies.set(
      name,
      value,
      options,
    );
  }

  return redirectResponse;
}

export async function proxy(
  request: NextRequest,
) {
  let response =
    NextResponse.next({
      request,
    });

  const supabase =
    createServerClient(
      requireEnvironmentVariable(
        "NEXT_PUBLIC_SUPABASE_URL",
      ),

      requireEnvironmentVariable(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ),

      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(
            cookiesToSet,
            headers,
          ) {
            for (
              const {
                name,
                value,
              }
              of cookiesToSet
            ) {
              request.cookies.set(
                name,
                value,
              );
            }

            response =
              NextResponse.next({
                request,
              });

            for (
              const {
                name,
                value,
                options,
              }
              of cookiesToSet
            ) {
              response.cookies.set(
                name,
                value,
                options,
              );
            }

            for (
              const [
                name,
                value,
              ]
              of Object.entries(
                headers,
              )
            ) {
              response.headers.set(
                name,
                value,
              );
            }
          },
        },
      },
    );

  /*
   * Preserve the existing Supabase SSR session-refresh behavior.
   */
  const {
    data: claimsData,
    error: claimsError,
  } =
    await supabase.auth.getClaims();

  const pathname =
    request.nextUrl.pathname;

  /*
   * Nothing outside DueQuity Pro needs role-route authorization here.
   */
  if (
    !pathname.startsWith(
      "/pro",
    )
  ) {
    return response;
  }

  /*
   * Preserve the existing development-only staff adapter.
   */
  if (
    localDevelopmentAdapterActive()
  ) {
    return response;
  }

  const authUserId =
    !claimsError &&
    typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : "";

  if (!authUserId) {
    return redirectWithSessionCookies(
      request,
      response,
      "/staff/sign-in",
    );
  }

  /*
   * Use DueQuity's existing privileged server client.
   *
   * No new Supabase architecture is introduced here.
   */
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from("staff_users")
      .select(
        "id, role, status",
      )
      .eq(
        "id",
        authUserId,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    return redirectWithSessionCookies(
      request,
      response,
      "/staff/sign-in",
    );
  }

  if (
    data.status !== "active" ||
    !isUserRole(
      data.role,
    ) ||
    data.role === "claimant"
  ) {
    return redirectWithSessionCookies(
      request,
      response,
      "/staff/sign-in",
    );
  }

  const permissions =
    permissionsFor(
      data.role,
    );

  if (
    !canAccessProPath(
      data.role,
      permissions,
      pathname,
    )
  ) {
    return redirectWithSessionCookies(
      request,
      response,
      staffLandingPath(
        data.role,
      ),
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};