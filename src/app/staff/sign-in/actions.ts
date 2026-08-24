"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isUserRole } from "@/lib/session";
import { staffLandingPath } from "@/lib/pro-access";

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
    staffLandingPath(
      staffSession.user.role,
    ),
  );
}