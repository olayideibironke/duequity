"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  saveInterestedProspectiveClaimantContact,
} from "@/server/prospective-claimant-contact-service";

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

function formChecked(
  formData:
    FormData,
  key:
    string,
): boolean {
  return (
    formData.get(
      key,
    ) ===
    "confirmed"
  );
}

/* ========================================================================== */
/* Save interested claimant contact                                            */
/* ========================================================================== */

export async function saveInterestedProspectiveClaimantContactAction(
  formData:
    FormData,
): Promise<void> {
  const session =
    await resolveStaffSession();

  if (!session) {
    throw new Error(
      "Staff authentication is required.",
    );
  }

  await saveInterestedProspectiveClaimantContact({
    session,

    discoveredRecordId:
      formText(
        formData,
        "discoveredRecordId",
      ),

    legalFirstName:
      formText(
        formData,
        "legalFirstName",
      ),

    legalLastName:
      formText(
        formData,
        "legalLastName",
      ),

    email:
      formText(
        formData,
        "email",
      ),

    mobilePhone:
      formText(
        formData,
        "mobilePhone",
      ),

    propertyConnectionConfirmed:
      formChecked(
        formData,
        "propertyConnectionConfirmed",
      ),

    activationMaterialsConsentConfirmed:
      formChecked(
        formData,
        "activationMaterialsConsentConfirmed",
      ),
  });

  /*
   * Stay on the same search result after saving.
   *
   * The Discovery card reloads its persisted contact state and changes from
   * "Claimant wants to proceed" to "Claimant interested · Contact saved".
   */
  revalidatePath(
    "/pro/claimants/onboarding",
  );
}