"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveStaffSession } from "@/server/staff-session";
import { inviteStaffUser } from "@/server/staff-invite-service";

const STAFF_PATH =
  "/pro/staff";

/* ========================================================================== */
/* Form helpers                                                                */
/* ========================================================================== */

function readFormValue(
  formData: FormData,
  name: string,
): string {
  const value =
    formData.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function readFormValues(
  formData: FormData,
  name: string,
): string[] {
  return formData
    .getAll(name)
    .filter(
      (value): value is string =>
        typeof value === "string",
    )
    .map((value) =>
      value.trim(),
    )
    .filter(Boolean);
}

/* ========================================================================== */
/* Request origin                                                              */
/* ========================================================================== */

async function resolveRequestOrigin(): Promise<string> {
  const requestHeaders =
    await headers();

  const origin =
    requestHeaders
      .get("origin")
      ?.trim();

  if (origin) {
    return origin.replace(
      /\/+$/,
      "",
    );
  }

  const forwardedHost =
    requestHeaders
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();

  const host =
    forwardedHost ||
    requestHeaders
      .get("host")
      ?.trim();

  const forwardedProto =
    requestHeaders
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();

  const protocol =
    forwardedProto ||
    (
      host?.startsWith("localhost") ||
      host?.startsWith("127.0.0.1")
        ? "http"
        : "https"
    );

  if (!host) {
    throw new Error(
      "Unable to determine the application origin.",
    );
  }

  return `${protocol}://${host}`;
}

/* ========================================================================== */
/* Invite action                                                               */
/* ========================================================================== */

export async function inviteStaffMember(
  formData: FormData,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      "/staff/sign-in",
    );
  }

  const name =
    readFormValue(
      formData,
      "name",
    );

  const email =
    readFormValue(
      formData,
      "email",
    );

  const title =
    readFormValue(
      formData,
      "title",
    );

  const role =
    readFormValue(
      formData,
      "role",
    );

  const statesCleared =
    readFormValues(
      formData,
      "statesCleared",
    );

  if (
    !name ||
    !email ||
    !title ||
    !role
  ) {
    redirect(
      `${STAFF_PATH}?status=invalid`,
    );
  }

  const origin =
    await resolveRequestOrigin();

  try {
    await inviteStaffUser({
      session,

      name,

      email,

      title,

      role,

      statesCleared,

      redirectTo:
        `${origin}/auth/staff-invite/callback`,
    });
  } catch {
    redirect(
      `${STAFF_PATH}?status=unavailable`,
    );
  }

  redirect(
    `${STAFF_PATH}?status=invited`,
  );
}