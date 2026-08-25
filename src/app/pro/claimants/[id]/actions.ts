"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  reassignClaimantStaff,
} from "@/server/claimant-assignment-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

function formString(
  formData:
    FormData,
  key:
    string,
): string {
  const value =
    formData.get(
      key,
    );

  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

export async function reassignClaimantManagerAction(
  formData:
    FormData,
): Promise<void> {
  const claimantId =
    formString(
      formData,
      "claimantId",
    );

  const assignedStaffUserId =
    formString(
      formData,
      "assignedStaffUserId",
    );

  if (!claimantId) {
    redirect(
      "/pro/claimants?assignment=invalid",
    );
  }

  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      `/staff/sign-in?next=${encodeURIComponent(
        `/pro/claimants/${claimantId}`,
      )}`,
    );
  }

  if (
    session.user.role !==
    "super_admin"
  ) {
    redirect(
      `/pro/claimants/${claimantId}?assignment=not-authorized`,
    );
  }

  if (!assignedStaffUserId) {
    redirect(
      `/pro/claimants/${claimantId}?assignment=invalid`,
    );
  }

  let changed =
    false;

  let claimId:
    string | undefined;

  try {
    const result =
      await reassignClaimantStaff({
        session,

        claimantId,

        assignedStaffUserId,
      });

    changed =
      result.changed;

    claimId =
      result.claimId;
  } catch {
    redirect(
      `/pro/claimants/${claimantId}?assignment=failed`,
    );
  }

  revalidatePath(
    "/pro/claimants",
  );

  revalidatePath(
    `/pro/claimants/${claimantId}`,
  );

  revalidatePath(
    "/pro/claims",
  );

  if (claimId) {
    revalidatePath(
      `/pro/claims/${claimId}`,
    );
  }

  revalidatePath(
    "/pro/opportunities",
  );

  revalidatePath(
    "/pro/manager",
  );

  redirect(
    `/pro/claimants/${claimantId}?assignment=${
      changed
        ? "updated"
        : "unchanged"
    }`,
  );
}