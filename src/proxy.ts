import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  canAccessDiscoveredRecords,
  canAccessProPath,
  isDiscoveredRecordsPath,
  staffLandingPath,
} from "@/lib/pro-access";

import {
  isUserRole,
  permissionsFor,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * SUPABASE AUTH SESSION + PRO ROUTE GATE
 *
 * Keeps the existing Supabase cookie-refresh architecture.
 *
 * Ordinary /pro routes:
 *
 * - require authenticated active staff
 * - enforce role/permission access
 *
 * Discovered Records:
 *
 * - requires the exact authorized administrator identity
 * - requires role = super_admin
 * - applies to pages AND /api/pro/discovered-records/*
 * - cannot be bypassed by the local development session adapter
 */

/* ========================================================================== */
/* Environment                                                                 */
/* ========================================================================== */

function requireEnvironmentVariable(
  name: string,
): string {
  const value =
    process.env[
      name
    ]?.trim();

  if (
    !value
  ) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

function localDevelopmentAdapterActive(): boolean {
  return (
    process.env.NODE_ENV ===
      "development" &&
    process.env.DUEQUITY_LOCAL_DEV_SESSION ===
      "enabled"
  );
}

/* ========================================================================== */
/* Paths                                                                       */
/* ========================================================================== */

function isDiscoveredRecordsApiPath(
  pathname: string,
): boolean {
  return (
    pathname ===
      "/api/pro/discovered-records" ||
    pathname.startsWith(
      "/api/pro/discovered-records/",
    )
  );
}

/* ========================================================================== */
/* Cookie-preserving responses                                                 */
/* ========================================================================== */

function copySessionCookies(
  source:
    NextResponse,
  target:
    NextResponse,
): NextResponse {
  for (
    const cookie of
      source.cookies.getAll()
  ) {
    const {
      name,
      value,
      ...options
    } =
      cookie;

    target.cookies.set(
      name,
      value,
      options,
    );
  }

  return target;
}

function redirectWithSessionCookies(
  request:
    NextRequest,
  response:
    NextResponse,
  pathname: string,
): NextResponse {
  const url =
    request.nextUrl.clone();

  url.pathname =
    pathname;

  url.search =
    "";

  return copySessionCookies(
    response,
    NextResponse.redirect(
      url,
    ),
  );
}

function jsonWithSessionCookies(
  response:
    NextResponse,
  message: string,
  status: number,
): NextResponse {
  return copySessionCookies(
    response,
    NextResponse.json(
      {
        ok:
          false,

        error:
          message,
      },
      {
        status,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    ),
  );
}

/* ========================================================================== */
/* Proxy                                                                       */
/* ========================================================================== */

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
              } of
                cookiesToSet
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
              } of
                cookiesToSet
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
              ] of
                Object.entries(
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
   * Preserve Supabase SSR cookie/session refresh.
   */
  const {
    data:
      claimsData,
    error:
      claimsError,
  } =
    await supabase.auth.getClaims();

  const pathname =
    request.nextUrl.pathname;

  const proPage =
    pathname.startsWith(
      "/pro",
    );

  const discoveredPage =
    isDiscoveredRecordsPath(
      pathname,
    );

  const discoveredApi =
    isDiscoveredRecordsApiPath(
      pathname,
    );

  /*
   * Nothing outside Pro or the protected discovery API family requires this
   * role-route authorization layer.
   */
  if (
    !proPage &&
    !discoveredApi
  ) {
    return response;
  }

  /*
   * The development adapter may continue to support ordinary local Pro pages.
   *
   * It does NOT bypass Discovered Records. Discovery always requires the real
   * authorized Supabase administrator identity.
   */
  if (
    localDevelopmentAdapterActive() &&
    !discoveredPage &&
    !discoveredApi
  ) {
    return response;
  }

  const authUserId =
    !claimsError &&
    typeof claimsData
      ?.claims
      ?.sub ===
      "string"
      ? claimsData
          .claims
          .sub
      : "";

  if (
    !authUserId
  ) {
    if (
      discoveredApi
    ) {
      return jsonWithSessionCookies(
        response,
        "Administrator authentication is required.",
        401,
      );
    }

    return redirectWithSessionCookies(
      request,
      response,
      "/staff/sign-in",
    );
  }

  /*
   * Resolve the trusted staff profile by the authenticated Supabase user ID.
   */
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id, email, role, status",
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
    if (
      discoveredApi
    ) {
      return jsonWithSessionCookies(
        response,
        "Administrator authentication is required.",
        401,
      );
    }

    return redirectWithSessionCookies(
      request,
      response,
      "/staff/sign-in",
    );
  }

  if (
    data.status !==
      "active" ||
    !isUserRole(
      data.role,
    ) ||
    data.role ===
      "claimant"
  ) {
    if (
      discoveredApi
    ) {
      return jsonWithSessionCookies(
        response,
        "Administrator authentication is required.",
        401,
      );
    }

    return redirectWithSessionCookies(
      request,
      response,
      "/staff/sign-in",
    );
  }

  /*
   * Exact Discovered Records administrator gate.
   *
   * This happens before ordinary role authorization and before any
   * super-admin shortcut.
   */
  if (
    discoveredPage ||
    discoveredApi
  ) {
    if (
      !canAccessDiscoveredRecords(
        data.role,
        data.email,
      )
    ) {
      if (
        discoveredApi
      ) {
        return jsonWithSessionCookies(
          response,
          "Discovered Records is restricted to the DueQuity administrator.",
          403,
        );
      }

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

  const permissions =
    permissionsFor(
      data.role,
    );

  if (
    !canAccessProPath(
      data.role,
      permissions,
      pathname,
      data.email,
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