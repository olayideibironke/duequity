import "server-only";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

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

function requestMethod(
  input: RequestInfo | URL,
  init?: RequestInit,
): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  if (input instanceof Request) {
    return input.method.toUpperCase();
  }

  return "GET";
}

function delay(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const fetchWithTransientJwtRetry: typeof fetch =
  async (
    input,
    init,
  ) => {
    const response =
      await fetch(
        input,
        init,
      );

    if (
      requestMethod(
        input,
        init,
      ) !== "GET" ||
      response.status !== 401
    ) {
      return response;
    }

    let responseText = "";

    try {
      responseText =
        await response
          .clone()
          .text();
    } catch {
      return response;
    }

    if (
      !responseText.includes(
        "JWT issued at future",
      )
    ) {
      return response;
    }

    /*
     * Supabase can very occasionally return this transient gateway JWT timing
     * error even though the project and database clocks are healthy.
     *
     * GET is idempotent, so retry exactly once after a short delay.
     * Writes are never retried here.
     */
    await delay(
      300,
    );

    return fetch(
      input,
      init,
    );
  };

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl =
    requireEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_URL",
    );

  const secretKey =
    requireEnvironmentVariable(
      "SUPABASE_SECRET_KEY",
    );

  adminClient =
    createClient(
      supabaseUrl,
      secretKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },

        global: {
          fetch:
            fetchWithTransientJwtRetry,
        },
      },
    );

  return adminClient;
}