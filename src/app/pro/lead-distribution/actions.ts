"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  assignDiscoveryLeadFromDistribution,
  reassignDiscoveryLeadFromDistribution,
} from "@/server/lead-distribution-service";

import {
  preflightLeadWorkbook,
  uploadAndAssignLeadWorkbook,
  type LeadWorkbookPreflight,
  type LeadWorkbookUploadResult,
} from "@/server/lead-upload-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

/* ========================================================================== */
/* Public action results                                                      */
/* ========================================================================== */

export type LeadWorkbookPreflightActionResult =
  | {
      ok: true;
      preflight: LeadWorkbookPreflight;
    }
  | {
      ok: false;
      error: string;
    };

export type LeadWorkbookAssignmentActionResult =
  | {
      ok: true;
      result: LeadWorkbookUploadResult;
    }
  | {
      ok: false;
      error: string;
    };

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function formText(
  formData: FormData,
  key: string,
): string {
  const value =
    formData.get(key);

  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function actionError(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error &&
    error.message.trim()
    ? error.message
    : fallback;
}

/* ========================================================================== */
/* Workbook preflight                                                         */
/* ========================================================================== */

export async function preflightLeadWorkbookAction(
  formData: FormData,
): Promise<
  LeadWorkbookPreflightActionResult
> {
  const session =
    await resolveStaffSession();

  if (!session) {
    return {
      ok: false,
      error:
        "Your staff session has expired. Sign in again before distributing leads.",
    };
  }

  const staffUserId =
    formText(
      formData,
      "staffUserId",
    );

  const fileEntry =
    formData.get(
      "leadWorkbook",
    );

  if (
    !staffUserId ||
    !(fileEntry instanceof File) ||
    fileEntry.size <= 0
  ) {
    return {
      ok: false,
      error:
        "Choose an Excel workbook and the staff member who should receive it.",
    };
  }

  try {
    const preflight =
      await preflightLeadWorkbook({
        session,
        file: fileEntry,
        staffUserId,
      });

    return {
      ok: true,
      preflight,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        actionError(
          error,
          "DueQuity could not inspect this workbook.",
        ),
    };
  }
}

/* ========================================================================== */
/* Confirm workbook assignment                                                */
/* ========================================================================== */

export async function confirmLeadWorkbookAssignmentAction(
  formData: FormData,
): Promise<
  LeadWorkbookAssignmentActionResult
> {
  const session =
    await resolveStaffSession();

  if (!session) {
    return {
      ok: false,
      error:
        "Your staff session has expired. Sign in again before distributing leads.",
    };
  }

  const staffUserId =
    formText(
      formData,
      "staffUserId",
    );

  const confirmationKey =
    formText(
      formData,
      "confirmationKey",
    );

  const fileEntry =
    formData.get(
      "leadWorkbook",
    );

  if (
    !staffUserId ||
    !confirmationKey ||
    !(fileEntry instanceof File) ||
    fileEntry.size <= 0
  ) {
    return {
      ok: false,
      error:
        "Run Check workbook before confirming the assignment.",
    };
  }

  try {
    const result =
      await uploadAndAssignLeadWorkbook({
        session,
        file: fileEntry,
        staffUserId,
        confirmationKey,
      });

    revalidatePath(
      "/pro/lead-distribution",
    );

    revalidatePath(
      "/pro/my-leads",
    );

    return {
      ok: true,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        actionError(
          error,
          "DueQuity could not distribute this workbook.",
        ),
    };
  }
}

/* ========================================================================== */
/* Manual single-lead assignment                                              */
/* ========================================================================== */

export async function assignDiscoveryLeadAction(
  formData: FormData,
): Promise<void> {
  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      "/staff/sign-in",
    );
  }

  const discoveredRecordId =
    formText(
      formData,
      "discoveredRecordId",
    );

  const staffUserId =
    formText(
      formData,
      "staffUserId",
    );

  const query =
    formText(
      formData,
      "q",
    );

  const returnUrl =
    `/pro/lead-distribution?q=${encodeURIComponent(
      query,
    )}`;

  if (
    !discoveredRecordId ||
    !staffUserId
  ) {
    redirect(
      `${returnUrl}&status=invalid`,
    );
  }

  try {
    await assignDiscoveryLeadFromDistribution({
      session,
      discoveredRecordId,
      staffUserId,
    });
  } catch (error) {
    const message =
      actionError(
        error,
        "",
      );

    if (
      message.includes(
        "already actively assigned",
      )
    ) {
      redirect(
        `${returnUrl}&status=already-assigned`,
      );
    }

    if (
      message.includes(
        "not currently cleared",
      )
    ) {
      redirect(
        `${returnUrl}&status=state-not-cleared`,
      );
    }

    if (
      message.includes(
        "already been promoted",
      )
    ) {
      redirect(
        `${returnUrl}&status=already-promoted`,
      );
    }

    if (
      message.includes(
        "Administrator",
      ) ||
      message.includes(
        "administrator",
      )
    ) {
      redirect(
        `${returnUrl}&status=not-authorized`,
      );
    }

    redirect(
      `${returnUrl}&status=unavailable`,
    );
  }

  redirect(
    `${returnUrl}&status=assigned&savedLead=${encodeURIComponent(
      discoveredRecordId,
    )}`,
  );
}

/* ========================================================================== */
/* Explicit single-lead reassignment                                          */
/* ========================================================================== */

export async function reassignDiscoveryLeadAction(
  formData: FormData,
): Promise<void> {
  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      "/staff/sign-in",
    );
  }

  const discoveredRecordId =
    formText(
      formData,
      "discoveredRecordId",
    );

  const staffUserId =
    formText(
      formData,
      "staffUserId",
    );

  const expectedCurrentAssignmentId =
    formText(
      formData,
      "expectedCurrentAssignmentId",
    );

  const confirmation =
    formText(
      formData,
      "confirmReassign",
    );

  const query =
    formText(
      formData,
      "q",
    );

  const returnUrl =
    `/pro/lead-distribution?q=${encodeURIComponent(
      query,
    )}`;

  if (
    !discoveredRecordId ||
    !staffUserId ||
    !expectedCurrentAssignmentId ||
    confirmation !== "yes"
  ) {
    redirect(
      `${returnUrl}&status=reassign-confirmation-required`,
    );
  }

  try {
    await reassignDiscoveryLeadFromDistribution({
      session,
      discoveredRecordId,
      staffUserId,
      expectedCurrentAssignmentId,
    });
  } catch (error) {
    const message =
      actionError(
        error,
        "",
      );

    if (
      message.includes(
        "lead assignment changed",
      ) ||
      message.includes(
        "active lead assignment no longer exists",
      ) ||
      message.includes(
        "no longer has the active assignment",
      )
    ) {
      redirect(
        `${returnUrl}&status=reassign-stale`,
      );
    }

    if (
      message.includes(
        "not currently cleared",
      )
    ) {
      redirect(
        `${returnUrl}&status=state-not-cleared`,
      );
    }

    redirect(
      `${returnUrl}&status=reassign-failed`,
    );
  }

  redirect(
    `${returnUrl}&status=reassigned&savedLead=${encodeURIComponent(
      discoveredRecordId,
    )}`,
  );
}