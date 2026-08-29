import "server-only";

import type {
  StaffSession,
} from "@/lib/session";

import {
  staffCanAccessDiscoveredLead,
} from "@/server/lead-assignment-service";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export interface ProspectiveClaimantContact {
  id:
    string;

  discoveredRecordId:
    string;

  contactStatus:
    "interested";

  confirmedLegalFirstName:
    string;

  confirmedLegalLastName:
    string;

  confirmedEmail:
    string;

  confirmedMobilePhone:
    string;

  propertyConnectionConfirmedAt:
    string;

  activationMaterialsConsentAt:
    string;

  contactChannel:
    "phone_call";

  capturedByStaffUserId:
    string;

  capturedAt:
    string;

  supersedesContactId?:
    string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ProspectiveClaimantContactRow {
  id:
    string;

  discovered_record_id:
    string;

  contact_status:
    string;

  confirmed_legal_first_name:
    string | null;

  confirmed_legal_last_name:
    string | null;

  confirmed_email:
    string | null;

  confirmed_mobile_phone:
    string | null;

  property_connection_confirmed_at:
    string | null;

  activation_materials_consent_at:
    string | null;

  contact_channel:
    string;

  captured_by_staff_user_id:
    string;

  captured_at:
    string;

  supersedes_contact_id:
    string | null;

  record_purpose:
    string;
}

interface DiscoveredRecordIntakeRow {
  id:
    string;

  status:
    string;

  promoted_opportunity_id:
    string | null;
}

interface ContactIdRow {
  id:
    string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function requiredText(
  value:
    string,
  label:
    string,
): string {
  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        " ",
      );

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function normalizeEmail(
  value:
    string,
): string {
  const normalized =
    requiredText(
      value,
      "Email",
    ).toLowerCase();

  const atIndex =
    normalized.indexOf(
      "@",
    );

  const lastDot =
    normalized.lastIndexOf(
      ".",
    );

  if (
    atIndex <=
      0 ||
    lastDot <=
      atIndex + 1 ||
    lastDot ===
      normalized.length -
        1
  ) {
    throw new Error(
      "Enter a valid claimant email address.",
    );
  }

  return normalized;
}

function normalizeUsMobile(
  value:
    string,
): string {
  const digits =
    value.replace(
      /\D/g,
      "",
    );

  const normalized =
    digits.length ===
      11 &&
    digits.startsWith(
      "1",
    )
      ? digits.slice(
          1,
        )
      : digits;

  if (
    !/^[0-9]{10}$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "Enter a valid 10-digit U.S. mobile phone number.",
    );
  }

  return normalized;
}

function mapContact(
  row:
    ProspectiveClaimantContactRow,
): ProspectiveClaimantContact {
  if (
    row.contact_status !==
      "interested" ||
    !row.confirmed_legal_first_name ||
    !row.confirmed_legal_last_name ||
    !row.confirmed_email ||
    !row.confirmed_mobile_phone ||
    !row.property_connection_confirmed_at ||
    !row.activation_materials_consent_at ||
    row.contact_channel !==
      "phone_call"
  ) {
    throw new Error(
      "Stored prospective claimant contact is incomplete.",
    );
  }

  return {
    id:
      row.id,

    discoveredRecordId:
      row.discovered_record_id,

    contactStatus:
      "interested",

    confirmedLegalFirstName:
      row.confirmed_legal_first_name,

    confirmedLegalLastName:
      row.confirmed_legal_last_name,

    confirmedEmail:
      row.confirmed_email,

    confirmedMobilePhone:
      row.confirmed_mobile_phone,

    propertyConnectionConfirmedAt:
      row.property_connection_confirmed_at,

    activationMaterialsConsentAt:
      row.activation_materials_consent_at,

    contactChannel:
      "phone_call",

    capturedByStaffUserId:
      row.captured_by_staff_user_id,

    capturedAt:
      row.captured_at,

    supersedesContactId:
      row.supersedes_contact_id ??
      undefined,
  };
}

/* ========================================================================== */
/* Read latest saved interested contact                                        */
/* ========================================================================== */

export async function getLatestProspectiveClaimantContact({
  session,
  discoveredRecordId,
}: {
  session:
    StaffSession;

  discoveredRecordId:
    string;
}): Promise<
  ProspectiveClaimantContact | undefined
> {
  const normalizedRecordId =
    requiredText(
      discoveredRecordId,
      "Discovery record ID",
    );

  const hasAccess =
    await staffCanAccessDiscoveredLead({
      session,

      discoveredRecordId:
        normalizedRecordId,
    });

  if (!hasAccess) {
    return undefined;
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "prospective_claimant_contacts",
      )
      .select(
        [
          "id",
          "discovered_record_id",
          "contact_status",
          "confirmed_legal_first_name",
          "confirmed_legal_last_name",
          "confirmed_email",
          "confirmed_mobile_phone",
          "property_connection_confirmed_at",
          "activation_materials_consent_at",
          "contact_channel",
          "captured_by_staff_user_id",
          "captured_at",
          "supersedes_contact_id",
          "record_purpose",
        ].join(
          ", ",
        ),
      )
      .eq(
        "discovered_record_id",
        normalizedRecordId,
      )
      .eq(
        "contact_status",
        "interested",
      )
      .eq(
        "record_purpose",
        "operational",
      )
      .order(
        "captured_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      );

  if (error) {
    throw new Error(
      `Unable to load saved claimant contact: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as unknown as
      ProspectiveClaimantContactRow[];

  const row =
    rows[0];

  return row
    ? mapContact(
        row,
      )
    : undefined;
}

/* ========================================================================== */
/* Save interested claimant contact                                            */
/* ========================================================================== */

export async function saveInterestedProspectiveClaimantContact({
  session,
  discoveredRecordId,
  legalFirstName,
  legalLastName,
  email,
  mobilePhone,
  propertyConnectionConfirmed,
  activationMaterialsConsentConfirmed,
}: {
  session:
    StaffSession;

  discoveredRecordId:
    string;

  legalFirstName:
    string;

  legalLastName:
    string;

  email:
    string;

  mobilePhone:
    string;

  propertyConnectionConfirmed:
    boolean;

  activationMaterialsConsentConfirmed:
    boolean;
}): Promise<
  ProspectiveClaimantContact
> {
  const normalizedRecordId =
    requiredText(
      discoveredRecordId,
      "Discovery record ID",
    );

  const normalizedFirstName =
    requiredText(
      legalFirstName,
      "First name",
    );

  const normalizedLastName =
    requiredText(
      legalLastName,
      "Last name",
    );

  const normalizedEmail =
    normalizeEmail(
      email,
    );

  const normalizedMobile =
    normalizeUsMobile(
      mobilePhone,
    );

  if (
    !propertyConnectionConfirmed
  ) {
    throw new Error(
      "The claimant must confirm their connection to the displayed property before contact may be saved.",
    );
  }

  if (
    !activationMaterialsConsentConfirmed
  ) {
    throw new Error(
      "The claimant must give permission for DueQuity to send onboarding and activation materials before contact may be saved.",
    );
  }

  /*
   * Assignment is enforced again at write time.
   *
   * A staff member cannot save claimant contact merely because they know a
   * Discovery record ID or manipulate a form submission.
   */
  const hasAccess =
    await staffCanAccessDiscoveredLead({
      session,

      discoveredRecordId:
        normalizedRecordId,
    });

  if (!hasAccess) {
    throw new Error(
      "This recovery lead is not assigned to your DueQuity staff account.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data:
      discoveredData,
    error:
      discoveredError,
  } =
    await admin
      .from(
        "discovered_records",
      )
      .select(
        [
          "id",
          "status",
          "promoted_opportunity_id",
        ].join(
          ", ",
        ),
      )
      .eq(
        "id",
        normalizedRecordId,
      )
      .maybeSingle();

  if (
    discoveredError ||
    !discoveredData
  ) {
    throw new Error(
      "The assigned recovery lead could not be resolved.",
    );
  }

  const discoveredRecord =
    discoveredData as unknown as
      DiscoveredRecordIntakeRow;

  if (
    discoveredRecord.status !==
      "new" &&
    discoveredRecord.status !==
      "reviewed"
  ) {
    throw new Error(
      "This recovery is no longer in an active Discovery intake stage.",
    );
  }

  if (
    discoveredRecord
      .promoted_opportunity_id
  ) {
    throw new Error(
      "This recovery has already moved to Opportunity. Continue claimant intake from the Opportunity/Claim workflow.",
    );
  }

  /*
   * Prospective contact records are append-only.
   *
   * If staff corrects or re-confirms contact information later, the new row
   * supersedes the old one without destroying history.
   */
  const {
    data:
      previousData,
    error:
      previousError,
  } =
    await admin
      .from(
        "prospective_claimant_contacts",
      )
      .select(
        "id",
      )
      .eq(
        "discovered_record_id",
        normalizedRecordId,
      )
      .eq(
        "record_purpose",
        "operational",
      )
      .order(
        "captured_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      );

  if (previousError) {
    throw new Error(
      `Unable to resolve prior claimant contact history: ${previousError.message}`,
    );
  }

  const previousRows =
    (
      previousData ??
      []
    ) as unknown as
      ContactIdRow[];

  const supersedesContactId =
    previousRows[0]?.id ??
    null;

  const capturedAt =
    new Date().toISOString();

  const {
    data:
      insertedData,
    error:
      insertError,
  } =
    await admin
      .from(
        "prospective_claimant_contacts",
      )
      .insert({
        discovered_record_id:
          normalizedRecordId,

        contact_status:
          "interested",

        confirmed_legal_first_name:
          normalizedFirstName,

        confirmed_legal_last_name:
          normalizedLastName,

        confirmed_email:
          normalizedEmail,

        confirmed_mobile_phone:
          normalizedMobile,

        property_connection_confirmed_at:
          capturedAt,

        activation_materials_consent_at:
          capturedAt,

        contact_channel:
          "phone_call",

        captured_by_staff_user_id:
          session.user.id,

        captured_at:
          capturedAt,

        supersedes_contact_id:
          supersedesContactId,

        record_purpose:
          "operational",
      })
      .select(
        [
          "id",
          "discovered_record_id",
          "contact_status",
          "confirmed_legal_first_name",
          "confirmed_legal_last_name",
          "confirmed_email",
          "confirmed_mobile_phone",
          "property_connection_confirmed_at",
          "activation_materials_consent_at",
          "contact_channel",
          "captured_by_staff_user_id",
          "captured_at",
          "supersedes_contact_id",
          "record_purpose",
        ].join(
          ", ",
        ),
      )
      .single();

  if (
    insertError ||
    !insertedData
  ) {
    throw new Error(
      insertError?.message ??
      "DueQuity could not save the claimant contact.",
    );
  }

  const insertedRow =
    insertedData as unknown as
      ProspectiveClaimantContactRow;

  return mapContact(
    insertedRow,
  );
}