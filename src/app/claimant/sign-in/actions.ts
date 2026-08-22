"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveClaimantSession } from "@/server/claimant-session";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

const CLAIMANT_SIGN_IN_PATH = "/claimant/sign-in";

function readFormValue(
  formData: FormData,
  name: string,
): string {
  const value = formData.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function signInClaimant(
  formData: FormData,
) {
  const email =
    readFormValue(
      formData,
      "email",
    ).toLowerCase();

  const password =
    readFormValue(
      formData,
      "password",
    );

  if (
    !email ||
    !password
  ) {
    redirect(
      `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
    );
  }

  const supabase =
    await getSupabaseServerAuth();

  const {
    error,
  } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (error) {
    redirect(
      `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
    );
  }

  const claimantSession =
    await resolveClaimantSession();

  if (!claimantSession) {
    await supabase.auth.signOut();

    redirect(
      `${CLAIMANT_SIGN_IN_PATH}?error=signin`,
    );
  }

  revalidatePath(
    "/",
    "layout",
  );

  redirect("/portal");
}