import "server-only";

import type {
  StaffSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type AssignedLeadClaimantWorkcaseStatus =
  | "ready_for_activation"
  | "activation_sent"
  | "activated"
  | "bound_to_claim"
  | "closed";

export interface AssignedLeadClaimantWorkcase {
  id:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  discoveredRecordId:
    string;

  originatingAssignmentId:
    string;

  originatingStaffUserId:
    string;

  assignedStaffUserId:
    string;

  latestContactId:
    string;

  legalFirstName:
    string;

  legalLastName:
    string;

  email:
    string;

  mobilePhone:
    string;

  propertyConnectionConfirmedAt:
    string;

  activationMaterialsConsentAt:
    string;

  authUserId?:
    string;

  status:
    AssignedLeadClaimantWorkcaseStatus;

  linkedClaimId?:
    string;

  linkedAt?:
    string;

  closedAt?:
    string;

  createdAt:
    string;

  updatedAt:
    string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface AssignedLeadClaimantWorkcaseRow {
  id:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  discovered_record_id:
    string;

  originating_assignment_id:
    string;

  originating_staff_user_id:
    string;

  assigned_staff_user_id:
    string;

  latest_contact_id:
    string;

  legal_first_name:
    string;

  legal_last_name:
    string;

  email:
    string;

  mobile_phone:
    string;

  property_connection_confirmed_at:
    string;

  activation_materials_consent_at:
    string;

  auth_user_id:
    string | null;

  status:
    AssignedLeadClaimantWorkcaseStatus;

  linked_claim_id:
    string | null;

  linked_at:
    string | null;

  closed_at:
    string | null;

  created_at:
    string;

  updated_at:
    string;
}

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function mapWorkcase(
  row:
    AssignedLeadClaimantWorkcaseRow,
): AssignedLeadClaimantWorkcase {
  return {
    id:
      row.id,

    claimantId:
      row.claimant_id,

    claimantReference:
      row.claimant_reference,

    discoveredRecordId:
      row.discovered_record_id,

    originatingAssignmentId:
      row.originating_assignment_id,

    originatingStaffUserId:
      row.originating_staff_user_id,

    assignedStaffUserId:
      row.assigned_staff_user_id,

    latestContactId:
      row.latest_contact_id,

    legalFirstName:
      row.legal_first_name,

    legalLastName:
      row.legal_last_name,

    email:
      row.email,

    mobilePhone:
      row.mobile_phone,

    propertyConnectionConfirmedAt:
      row.property_connection_confirmed_at,

    activationMaterialsConsentAt:
      row.activation_materials_consent_at,

    authUserId:
      row.auth_user_id ??
      undefined,

    status:
      row.status,

    linkedClaimId:
      row.linked_claim_id ??
      undefined,

    linkedAt:
      row.linked_at ??
      undefined,

    closedAt:
      row.closed_at ??
      undefined,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

/* ========================================================================== */
/* Create / refresh from interested contact                                    */
/* ========================================================================== */

/**
 * Creates the persistent pre-Claim claimant workcase after an interested
 * contact has been verified and saved.
 *
 * The database function independently proves:
 *
 * - exact active lead assignment;
 * - Stage 27 Admin work authorization;
 * - interested operational contact;
 * - legal first / last name;
 * - confirmed email;
 * - confirmed U.S. mobile;
 * - property connection confirmation;
 * - activation-material consent.
 *
 * No Opportunity, Claim, jurisdiction package, commercial quote or filing fact
 * is fabricated here.
 */
export async function ensureAssignedLeadClaimantWorkcase({
  session,
  discoveredRecordId,
  contactId,
}: {
  session:
    StaffSession;

  discoveredRecordId:
    string;

  contactId:
    string;
}): Promise<
  AssignedLeadClaimantWorkcase
> {
  const normalizedRecordId =
    discoveredRecordId
      .trim();

  const normalizedContactId =
    contactId
      .trim();

  if (
    !normalizedRecordId ||
    !normalizedContactId
  ) {
    throw new Error(
      "Assigned recovery record and verified claimant contact are required.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "ensure_assigned_lead_claimant_workcase",
      {
        p_discovered_record_id:
          normalizedRecordId,

        p_contact_id:
          normalizedContactId,

        p_staff_user_id:
          session.user.id,
      },
    );

  if (
    error ||
    !Array.isArray(
      data,
    ) ||
    data.length !==
      1
  ) {
    throw new Error(
      error?.message ??
      "DueQuity could not create the assigned claimant workcase.",
    );
  }

  return mapWorkcase(
    data[0] as
      AssignedLeadClaimantWorkcaseRow,
  );
}

/* ========================================================================== */
/* Read one by Discovery record                                                */
/* ========================================================================== */

export async function getAssignedLeadClaimantWorkcase({
  session,
  discoveredRecordId,
}: {
  session:
    StaffSession;

  discoveredRecordId:
    string;
}): Promise<
  AssignedLeadClaimantWorkcase | undefined
> {
  const normalizedRecordId =
    discoveredRecordId
      .trim();

  if (
    !normalizedRecordId
  ) {
    return undefined;
  }

  const admin =
    getSupabaseAdmin();

  let query =
    admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "*",
      )
      .eq(
        "discovered_record_id",
        normalizedRecordId,
      )
      .neq(
        "status",
        "closed",
      );

  if (
    session.user.role !==
      "super_admin" &&
    session.user.role !==
      "administrator"
  ) {
    query =
      query.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load assigned claimant workcase: ${error.message}`,
    );
  }

  return data
    ? mapWorkcase(
        data as
          AssignedLeadClaimantWorkcaseRow,
      )
    : undefined;
}

/* ========================================================================== */
/* Activation candidates                                                       */
/* ========================================================================== */

export async function listAssignedLeadClaimantActivationCandidates(
  session:
    StaffSession,
): Promise<
  AssignedLeadClaimantWorkcase[]
> {
  const admin =
    getSupabaseAdmin();

  let query =
    admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        "*",
      )
      .in(
        "status",
        [
          "ready_for_activation",
          "activation_sent",
        ],
      );

  if (
    session.user.role !==
      "super_admin" &&
    session.user.role !==
      "administrator"
  ) {
    query =
      query.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        "updated_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to load assigned-lead claimant activation candidates: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      mapWorkcase(
        row as
          AssignedLeadClaimantWorkcaseRow,
      ),
  );
}