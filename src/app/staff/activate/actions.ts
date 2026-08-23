"use server";

import { redirect } from "next/navigation";

import type {
  StaffUser,
  StateCode,
} from "@/domain/types";

import { isUserRole } from "@/lib/session";
import { recordAuditEvent } from "@/server/audit-event-store";
import { getSupabaseAdmin } from "@/server/supabase-admin";
import { getSupabaseServerAuth } from "@/server/supabase-auth";

const ACTIVATE_PATH =
  "/staff/activate";

interface InvitedStaffRow {
  id: string;

  name: string;

  email: string;

  role: string;

  title: string;

  states_cleared: string[] | null;

  mfa_enrolled: boolean;

  status: string;
}

function readPasswordValue(
  formData: FormData,
  name: string,
): string {
  const value =
    formData.get(name);

  /*
   * Never trim passwords.
   */
  return typeof value === "string"
    ? value
    : "";
}

function isStrongStaffPassword(
  password: string,
): boolean {
  return (
    password.length >= 12 &&
    /[a-z]/.test(
      password,
    ) &&
    /[A-Z]/.test(
      password,
    ) &&
    /[0-9]/.test(
      password,
    ) &&
    /[^A-Za-z0-9\s]/.test(
      password,
    )
  );
}

function normalizeStatesCleared(
  values: string[] | null,
): StateCode[] {
  if (!values) {
    return [];
  }

  return values
    .map((value) =>
      value
        .trim()
        .toUpperCase(),
    )
    .filter((value) =>
      /^[A-Z]{2}$/.test(
        value,
      ),
    ) as StateCode[];
}

export async function activateStaffAccount(
  formData: FormData,
) {
  const password =
    readPasswordValue(
      formData,
      "password",
    );

  const confirmPassword =
    readPasswordValue(
      formData,
      "confirmPassword",
    );

  if (
    !isStrongStaffPassword(
      password,
    ) ||
    password !== confirmPassword
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=invalid-password`,
    );
  }

  const supabase =
    await getSupabaseServerAuth();

  const {
    data: {
      user: authUser,
    },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !authUser ||
    !authUser.email
  ) {
    await supabase.auth.signOut();

    redirect(
      `${ACTIVATE_PATH}?status=expired`,
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
        "id, name, email, role, title, states_cleared, mfa_enrolled, status",
      )
      .eq(
        "id",
        authUser.id,
      )
      .maybeSingle();

  if (
    profileError ||
    !data
  ) {
    await supabase.auth.signOut();

    redirect(
      `${ACTIVATE_PATH}?status=expired`,
    );
  }

  const staff =
    data as InvitedStaffRow;

  if (
    staff.status !== "invited" ||
    staff.email
      .trim()
      .toLowerCase() !==
      authUser.email
        .trim()
        .toLowerCase() ||
    !isUserRole(
      staff.role,
    ) ||
    staff.role === "claimant"
  ) {
    await supabase.auth.signOut();

    redirect(
      `${ACTIVATE_PATH}?status=expired`,
    );
  }

  /*
   * Replace the administrator-issued temporary password with the
   * employee's private permanent password.
   */
  const {
    error: passwordError,
  } =
    await supabase.auth.updateUser({
      password,
    });

  if (passwordError) {
    redirect(
      `${ACTIVATE_PATH}?status=failed`,
    );
  }

  /*
   * Record verified activation before granting active staff authority.
   *
   * If audit persistence fails, staff_users remains invited and the account
   * still receives no DueQuity staff permissions.
   */
  const activatedStaff: StaffUser = {
    id:
      staff.id,

    name:
      staff.name,

    email:
      staff.email,

    role:
      staff.role,

    title:
      staff.title,

    statesCleared:
      normalizeStatesCleared(
        staff.states_cleared,
      ),

    mfaEnrolled:
      staff.mfa_enrolled,

    status:
      "active",
  };

  try {
    await recordAuditEvent({
      actor:
        activatedStaff,

      action:
        "staff.activation_authorized",

      targetType:
        "staff_user",

      targetId:
        staff.id,

      targetLabel:
        staff.email,

      outcome:
        "success",

      detail:
        "Staff first-login activation authorized after identity verification and permanent password establishment.",
    });
  } catch {
    redirect(
      `${ACTIVATE_PATH}?status=failed`,
    );
  }

  const {
    data: activatedProfile,
    error: activationError,
  } =
    await admin
      .from("staff_users")
      .update({
        status:
          "active",

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        staff.id,
      )
      .eq(
        "status",
        "invited",
      )
      .select(
        "id",
      )
      .maybeSingle();

  if (
    activationError ||
    !activatedProfile
  ) {
    redirect(
      `${ACTIVATE_PATH}?status=failed`,
    );
  }

  /*
   * Force a fresh authentication using the employee's new permanent
   * password. The temporary first-login session does not continue.
   */
  await supabase.auth.signOut();

  redirect(
    `${ACTIVATE_PATH}?status=activated`,
  );
}