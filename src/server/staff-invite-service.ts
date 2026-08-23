import "server-only";

import type {
  StateCode,
} from "@/domain/types";

import {
  can,
  isUserRole,
  type StaffSession,
} from "@/lib/session";

import { recordAuditEvent } from "@/server/audit-event-store";
import { getSupabaseAdmin } from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export interface InviteStaffUserInput {
  session: StaffSession;

  name: string;

  email: string;

  title: string;

  role: string;

  statesCleared: string[];

  redirectTo: string;
}

export interface InviteStaffUserResult {
  staffUserId: string;

  email: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function normalizeText(
  value: string,
): string {
  return value.trim();
}

function normalizeEmail(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function validEmail(
  value: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

function normalizeStates(
  values: string[],
): StateCode[] {
  return Array.from(
    new Set(
      values
        .map((value) =>
          value
            .trim()
            .toUpperCase(),
        )
        .filter((value) =>
          /^[A-Z]{2}$/.test(
            value,
          ),
        ),
    ),
  ).sort() as StateCode[];
}

async function cleanupInvitedUser(
  staffUserId: string,
): Promise<void> {
  const admin =
    getSupabaseAdmin();

  /*
   * staff_users.id references auth.users.id with ON DELETE RESTRICT,
   * so the application profile must be removed before the Auth user.
   */
  await admin
    .from("staff_users")
    .delete()
    .eq(
      "id",
      staffUserId,
    );

  await admin.auth.admin.deleteUser(
    staffUserId,
  );
}

/* ========================================================================== */
/* Invite                                                                      */
/* ========================================================================== */

export async function inviteStaffUser(
  input: InviteStaffUserInput,
): Promise<InviteStaffUserResult> {
  /*
   * Never allow the local development session adapter to provision real
   * Supabase identities.
   */
  if (
    input.session.provider !== "supabase"
  ) {
    throw new Error(
      "A verified Supabase staff session is required to invite staff.",
    );
  }

  if (
    !can(
      input.session,
      "user.manage",
    )
  ) {
    throw new Error(
      "The current staff role cannot manage users.",
    );
  }

  const name =
    normalizeText(
      input.name,
    );

  const email =
    normalizeEmail(
      input.email,
    );

  const title =
    normalizeText(
      input.title,
    );

  const role =
    normalizeText(
      input.role,
    );

  const statesCleared =
    normalizeStates(
      input.statesCleared,
    );

  if (
    !name ||
    !email ||
    !validEmail(email) ||
    !title ||
    !role ||
    !input.redirectTo.trim()
  ) {
    throw new Error(
      "Staff invitation details are incomplete or invalid.",
    );
  }

  if (
    !isUserRole(role) ||
    role === "claimant"
  ) {
    throw new Error(
      "The selected staff role is invalid.",
    );
  }

  /*
   * Administrators may manage ordinary staff accounts, but only a
   * super administrator may create another administrator or super
   * administrator.
   */
  if (
    input.session.user.role !== "super_admin" &&
    (
      role === "administrator" ||
      role === "super_admin"
    )
  ) {
    throw new Error(
      "Only a super administrator may invite an administrator or super administrator.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data: existingStaff,
    error: existingStaffError,
  } =
    await admin
      .from("staff_users")
      .select(
        "id",
      )
      .ilike(
        "email",
        email,
      )
      .maybeSingle();

  if (existingStaffError) {
    throw new Error(
      `Unable to check existing staff accounts: ${existingStaffError.message}`,
    );
  }

  if (existingStaff) {
    throw new Error(
      "A DueQuity staff profile already exists for this email address.",
    );
  }

  const {
    data: inviteData,
    error: inviteError,
  } =
    await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo:
          input.redirectTo.trim(),

        data: {
          full_name:
            name,
        },
      },
    );

  if (
    inviteError ||
    !inviteData.user
  ) {
    throw new Error(
      inviteError?.message ||
        "Supabase did not create the staff invitation.",
    );
  }

  const staffUserId =
    inviteData.user.id;

  const {
    error: profileError,
  } =
    await admin
      .from("staff_users")
      .insert({
        id:
          staffUserId,

        name,

        email,

        role,

        title,

        states_cleared:
          statesCleared,

        mfa_enrolled:
          false,

        status:
          "invited",
      });

  if (profileError) {
    await admin.auth.admin.deleteUser(
      staffUserId,
    );

    throw new Error(
      `Unable to create staff profile: ${profileError.message}`,
    );
  }

  try {
    await recordAuditEvent({
      actor:
        input.session.user,

      action:
        "staff.invited",

      targetType:
        "staff_user",

      targetId:
        staffUserId,

      targetLabel:
        email,

      outcome:
        "success",

      detail:
        `Staff invitation created for ${name} with role ${role}.`,
    });
  } catch (error) {
    await cleanupInvitedUser(
      staffUserId,
    );

    throw error;
  }

  return {
    staffUserId,

    email,
  };
}