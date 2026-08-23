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
   * Record the verified activation before granting active staff access.
   * If the audit insert fails, the profile remains invited and the current
   * invitation session can retry without granting staff authorization.
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
        "Staff invitation accepted, identity verified and password established.",
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

  await supabase.auth.signOut();

  redirect(
    `${ACTIVATE_PATH}?status=activated`,
  );
}