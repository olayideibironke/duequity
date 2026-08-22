import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * SUPABASE SERVER AUTH CLIENT
 *
 * Uses the public Supabase publishable key together with the authenticated
 * user's secure cookies.
 *
 * This client is for authentication/session work only.
 *
 * Privileged database operations continue to use `getSupabaseAdmin()` and the
 * server-only service-role credential.
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

export async function getSupabaseServerAuth() {
  const cookieStore =
    await cookies();

  const supabaseUrl =
    requireEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_URL",
    );

  const publishableKey =
    requireEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );

  return createServerClient(
    supabaseUrl,
    publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            for (
              const {
                name,
                value,
                options,
              } of cookiesToSet
            ) {
              cookieStore.set(
                name,
                value,
                options,
              );
            }
          } catch {
            /*
             * Server Components cannot always write cookies.
             *
             * Auth-changing actions and route handlers can write them. A read
             * from a non-mutating Server Component must not fail simply because
             * cookie refresh was unavailable in that rendering context.
             */
          }
        },
      },
    },
  );
}