"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveStaffSession } from "@/server/staff-session";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

const STAFF_SIGN_IN_PATH = "/staff/sign-in";

function readFormValue(
  formData: FormData,
  name: string,
): string {
  const value = formData.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function signInStaff(
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
      `${STAFF_SIGN_IN_PATH}?error=signin`,
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
      `${STAFF_SIGN_IN_PATH}?error=signin`,
    );
  }

  const staffSession =
    await resolveStaffSession();

  if (!staffSession) {
    await supabase.auth.signOut();

    redirect(
      `${STAFF_SIGN_IN_PATH}?error=signin`,
    );
  }

  revalidatePath(
    "/",
    "layout",
  );

  redirect("/pro");
}