"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveClaimantSession } from "@/server/claimant-session";
import { resolveStaffSession } from "@/server/staff-session";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

type AuthAudience =
  | "staff"
  | "claimant";

const UPDATE_PASSWORD_PATH =
  "/auth/update-password";

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

function readAudience(
  formData: FormData,
): AuthAudience {
  return readFormValue(
    formData,
    "audience",
  ) === "staff"
    ? "staff"
    : "claimant";
}

export async function updatePassword(
  formData: FormData,
) {
  const audience =
    readAudience(formData);

  const password =
    readFormValue(
      formData,
      "password",
    );

  const confirmPassword =
    readFormValue(
      formData,
      "confirmPassword",
    );

  if (
    password.length < 12 ||
    password !== confirmPassword
  ) {
    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=invalid`,
    );
  }

  const authorizedSession =
    audience === "staff"
      ? await resolveStaffSession()
      : await resolveClaimantSession();

  if (!authorizedSession) {
    const supabase =
      await getSupabaseServerAuth();

    await supabase.auth.signOut();

    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=expired`,
    );
  }

  const supabase =
    await getSupabaseServerAuth();

  const {
    error,
  } =
    await supabase.auth.updateUser({
      password,
    });

  if (error) {
    redirect(
      `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=failed`,
    );
  }

  await supabase.auth.signOut();

  revalidatePath(
    "/",
    "layout",
  );

  redirect(
    `${UPDATE_PASSWORD_PATH}?audience=${audience}&status=updated`,
  );
}