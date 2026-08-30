"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  ensureAssignedLeadClaimantWorkcase,
} from "@/server/assigned-lead-claimant-workcase-service";

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

/**
 * Save the verified interested claimant contact and immediately create or
 * refresh the persistent Admin-assigned pre-Claim claimant workcase.
 *
 * The contact service remains responsible for:
 *
 * - exact staff assignment access;
 * - contact validation;
 * - property-connection confirmation;
 * - activation-material consent;
 * - superseding prior contact versions.
 *
 * The workcase service then independently verifies the active Stage 27
 * administrator-authorized assignment before creating or refreshing the
 * persistent claimant workcase.
 *
 * No Opportunity, official Claim, jurisdiction package, commercial quote,
 * filing destination or payment fact is fabricated here.
 */
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

  const discoveredRecordId =
    formText(
      formData,
      "discoveredRecordId",
    );

  if (
    !discoveredRecordId
  ) {
    throw new Error(
      "Assigned recovery record is required.",
    );
  }

  const contact =
    await saveInterestedProspectiveClaimantContact({
      session,

      discoveredRecordId,

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
   * Checkpoint B
   *
   * Every successful interested-contact save must keep the persistent
   * pre-Claim claimant workcase synchronized with the newest verified contact.
   *
   * For a new workcase this creates the claimant reference.
   *
   * For an existing workcase this refreshes:
   *
   * - latest contact;
   * - confirmed legal name;
   * - confirmed email;
   * - confirmed mobile;
   * - persisted confirmation timestamps;
   * - current assigned staff owner;
   * - row version;
   * - immutable workcase event history.
   */
  await ensureAssignedLeadClaimantWorkcase({
    session,

    discoveredRecordId,

    contactId:
      contact.id,
  });

  revalidatePath(
    "/pro/claimants/onboarding",
  );
}