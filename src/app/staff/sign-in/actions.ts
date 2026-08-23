"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isUserRole } from "@/lib/session";

import { getSupabaseAdmin } from "@/server/supabase-admin";
import { resolveStaffSession } from "@/server/staff-session";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

const STAFF_SIGN_IN_PATH =
  "/staff/sign-in";

const STAFF_ACTIVATE_PATH =
  "/staff/activate";

interface StaffSignInRow {
  id: string;

  email: string;

  role: string;

  status: string;
}

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

function readPasswordValue(
  formData: FormData,
  name: string,
): string {
  const value =
    formData.get(name);

  /*
   * Passwords are never trimmed.
   *
   * A leading or trailing space may legitimately be part of a password.
   */
  return typeof value === "string"
    ? value
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
    readPasswordValue(
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
    data: signInData,
    error: signInError,
  } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (
    signInError ||
    !signInData.user ||
    !signInData.user.email
  ) {
    redirect(
      `${STAFF_SIGN_IN_PATH}?error=signin`,
    );
  }

  /*
   * Authentication is not authorization.
   *
   * Resolve the staff profile independently from the authenticated
   * Supabase identity before allowing either activation or staff access.
   */
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error: profileError,
  } =
    await admin
      .from("staff_users")
      .select(
        "id, email, role, status",
      )
      .eq(
        "id",
        signInData.user.id,
      )
      .maybeSingle();

  if (
    profileError ||
    !data
  ) {
    await supabase.auth.signOut();

    redirect(
      `${STAFF_SIGN_IN_PATH}?error=signin`,
    );
  }

  const staff =
    data as StaffSignInRow;

  const authEmail =
    signInData.user.email
      .trim()
      .toLowerCase();

  const staffEmail =
    staff.email
      .trim()
      .toLowerCase();

  if (
    staffEmail !== authEmail ||
    !isUserRole(
      staff.role,
    ) ||
    staff.role === "claimant"
  ) {
    await supabase.auth.signOut();

    redirect(
      `${STAFF_SIGN_IN_PATH}?error=signin`,
    );
  }

  /*
   * First-login onboarding.
   *
   * An invited employee is authenticated but has no staff authority yet.
   * Preserve the Supabase session and send the employee directly to the
   * permanent-password activation gate.
   */
  if (
    staff.status === "invited"
  ) {
    revalidatePath(
      "/",
      "layout",
    );

    redirect(
      STAFF_ACTIVATE_PATH,
    );
  }

  /*
   * Suspended and otherwise invalid staff states fail closed.
   */
  if (
    staff.status !== "active"
  ) {
    await supabase.auth.signOut();

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

  redirect(
    "/pro",
  );
}