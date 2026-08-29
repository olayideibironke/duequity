"use server";

import {
  redirect,
} from "next/navigation";

import {
  assignDiscoveryLeadFromDistribution,
} from "@/server/lead-distribution-service";

import {
  uploadAndAssignLeadWorkbook,
} from "@/server/lead-upload-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formText(
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

function uploadErrorStatus(
  error:
    unknown,
): string {
  const message =
    error instanceof Error
      ? error.message
      : "";

  if (
    message.includes(
      "15 MB",
    )
  ) {
    return "upload-too-large";
  }

  if (
    message.includes(
      ".xlsx",
    )
  ) {
    return "upload-file-type";
  }

  if (
    message.includes(
      "required workbook headers",
    ) ||
    message.includes(
      "missing required DueQuity lead columns",
    )
  ) {
    return "upload-columns";
  }

  if (
    message.includes(
      "exactly one county and one state",
    )
  ) {
    return "upload-mixed-county";
  }

  if (
    message.includes(
      "do not exist in the current recovery database",
    )
  ) {
    return "upload-records-missing";
  }

  if (
    message.includes(
      "duplicate DueQuity Record IDs",
    )
  ) {
    return "upload-duplicates";
  }

  if (
    message.includes(
      "not currently cleared",
    )
  ) {
    return "upload-state-not-cleared";
  }

  if (
    message.includes(
      "None of the workbook leads are currently assignable",
    )
  ) {
    return "upload-none-assignable";
  }

  if (
    message.includes(
      "Administrator",
    ) ||
    message.includes(
      "administrator",
    )
  ) {
    return "not-authorized";
  }

  return "upload-failed";
}

/* ========================================================================== */
/* Manual single-lead assignment                                               */
/* ========================================================================== */

export async function assignDiscoveryLeadAction(
  formData:
    FormData,
): Promise<void> {
  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      "/auth/login?audience=staff",
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
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : "";

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
/* County workbook upload + assignment                                         */
/* ========================================================================== */

export async function uploadAndAssignLeadWorkbookAction(
  formData:
    FormData,
): Promise<void> {
  const session =
    await resolveStaffSession();

  if (!session) {
    redirect(
      "/auth/login?audience=staff",
    );
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
    fileEntry.size <=
      0
  ) {
    redirect(
      "/pro/lead-distribution?status=upload-invalid",
    );
  }

  try {
    const result =
      await uploadAndAssignLeadWorkbook({
        session,

        file:
          fileEntry,

        staffUserId,
      });

    const params =
      new URLSearchParams({
        status:
          "upload-assigned",

        batch:
          result.batchReference,

        county:
          result.county,

        state:
          result.stateCode,

        staff:
          result.assignedStaffName,

        rows:
          String(
            result.sourceRowCount,
          ),

        assigned:
          String(
            result.assignedRowCount,
          ),

        skipped:
          String(
            result.skippedRowCount,
          ),
      });

    redirect(
      `/pro/lead-distribution?${params.toString()}`,
    );
  } catch (
    error
  ) {
    /*
     * Next.js redirect() throws internally, so successful redirects must
     * never be swallowed by this catch block.
     */
    if (
      error &&
      typeof error ===
        "object" &&
      "digest" in
        error &&
      typeof (
        error as {
          digest?:
            unknown;
        }
      ).digest ===
        "string" &&
      (
        error as {
          digest:
            string;
        }
      ).digest.startsWith(
        "NEXT_REDIRECT",
      )
    ) {
      throw error;
    }

    const status =
      uploadErrorStatus(
        error,
      );

    redirect(
      `/pro/lead-distribution?status=${encodeURIComponent(
        status,
      )}`,
    );
  }
}