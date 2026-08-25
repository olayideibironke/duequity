import "server-only";

import type {
  StaffSession,
} from "@/lib/session";

import {
  can,
} from "@/lib/session";

import {
  recordAuditEvent,
} from "@/server/audit-event-store";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const CLAIMANT_INVITATION_LIFETIME_MS =
  60 * 60 * 1000;

const GOVERNMENT_ID_REASON =
  "DueQuity requires one current government-issued photo ID before claim processing can continue.";

const GOVERNMENT_ID_GUIDANCE =
  "Upload one current government-issued photo ID: a valid Driver's License, valid U.S. Passport, valid State ID, or other current government-issued photo ID. Do not send identity documents through ordinary email or Messages.";

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type ClaimantActivationInvitationStatus =
  | "preparing"
  | "sent"
  | "activated"
  | "revoked"
  | "failed"
  | "expired";

export interface ClaimantActivationCandidate {
  claimantId: string;

  claimantReference: string;

  claimId: string;

  claimReference: string;

  currentLegalName: string;

  currentEmail: string;

  currentMobilePhone: string;

  originatingStaffUserId: string;

  assignedStaffUserId: string;
}

export interface ClaimantActivationInvitation {
  id: string;

  claimId: string;

  claimantId: string;

  claimantReference: string;

  legalFirstName: string;

  legalLastName: string;

  email: string;

  mobilePhone: string;

  authUserId?: string;

  status:
    ClaimantActivationInvitationStatus;

  sentByStaffUserId: string;

  sentAt?: string;

  activatedAt?: string;

  revokedAt?: string;

  expiresAt: string;

  createdAt: string;

  updatedAt: string;
}

export interface InviteClaimantInput {
  session: StaffSession;

  claimantId: string;

  legalFirstName: string;

  legalLastName: string;

  email: string;

  mobilePhone: string;

  redirectTo: string;
}

export interface InviteClaimantResult {
  invitationId: string;

  claimantId: string;

  claimantReference: string;

  email: string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimantOnboardingInviteRow {
  claim_id: string;

  claim_reference: string;

  claimant_id: string;

  claimant_reference: string;

  claimant_auth_user_id:
    | string
    | null;

  legal_name: string;

  email: string;

  mobile_phone: string;

  contact_methods: unknown;

  entity_type: string;

  identity_verification: string;

  originating_staff_user_id: string;

  assigned_staff_user_id: string;
}

interface ClaimantActivationInvitationRow {
  id: string;

  claim_id: string;

  claimant_id: string;

  claimant_reference: string;

  legal_first_name: string;

  legal_last_name: string;

  email: string;

  mobile_phone: string;

  auth_user_id:
    | string
    | null;

  status:
    ClaimantActivationInvitationStatus;

  sent_by_staff_user_id: string;

  sent_at:
    | string
    | null;

  activated_at:
    | string
    | null;

  revoked_at:
    | string
    | null;

  expires_at: string;

  created_at: string;

  updated_at: string;
}

interface ClaimDocumentRequestRow {
  id: string;

  status: string;

  fulfilled_by_document_id:
    | string
    | null;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function normalizeText(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " ",
    );
}

function normalizeEmail(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function normalizePhone(
  value: string,
): string {
  return value.replace(
    /\D/g,
    "",
  );
}

function validEmail(
  value: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

function equivalentLegalName(
  left: string,
  right: string,
): boolean {
  return (
    normalizeText(
      left,
    ).toLowerCase() ===
    normalizeText(
      right,
    ).toLowerCase()
  );
}

function safeIdPart(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z0-9_-]/g,
    "-",
  );
}

function governmentIdRequestId(
  claimId: string,
): string {
  return `doc-request-${safeIdPart(
    claimId,
  )}-government_id`;
}

function currentIsoDate(): string {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function isSuperAdmin(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
    "super_admin"
  );
}

function invitationFromRow(
  row:
    ClaimantActivationInvitationRow,
): ClaimantActivationInvitation {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimantId:
      row.claimant_id,

    claimantReference:
      row.claimant_reference,

    legalFirstName:
      row.legal_first_name,

    legalLastName:
      row.legal_last_name,

    email:
      row.email,

    mobilePhone:
      row.mobile_phone,

    authUserId:
      row.auth_user_id ??
      undefined,

    status:
      row.status,

    sentByStaffUserId:
      row.sent_by_staff_user_id,

    sentAt:
      row.sent_at ??
      undefined,

    activatedAt:
      row.activated_at ??
      undefined,

    revokedAt:
      row.revoked_at ??
      undefined,

    expiresAt:
      row.expires_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

/* ========================================================================== */
/* Authorization                                                               */
/* ========================================================================== */

function requireInvitationAuthority(
  session:
    StaffSession,
): void {
  if (
    !can(
      session,
      "claim.read",
    ) ||
    !can(
      session,
      "claim.write",
    ) ||
    !can(
      session,
      "claimant.read",
    ) ||
    !can(
      session,
      "claimant.write",
    )
  ) {
    throw new Error(
      "Your DueQuity role is not authorized to create claimant activation invitations.",
    );
  }
}

function requireClaimantOwnership(
  session:
    StaffSession,
  claimant:
    ClaimantOnboardingInviteRow,
): void {
  if (
    isSuperAdmin(
      session,
    )
  ) {
    return;
  }

  if (
    claimant.assigned_staff_user_id !==
    session.user.id
  ) {
    /*
     * Deliberately use the same error as a missing claimant.
     *
     * Staff must not be able to determine that another staff member owns a
     * claimant merely by probing claimant IDs.
     */
    throw new Error(
      "The selected claimant record could not be found.",
    );
  }
}

/* ========================================================================== */
/* Expiration cleanup                                                          */
/* ========================================================================== */

async function expireStaleInvitations(): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claimant_activation_invitations",
      )
      .select(
        "id, claimant_id, auth_user_id",
      )
      .eq(
        "status",
        "sent",
      )
      .lt(
        "expires_at",
        now,
      );

  if (error) {
    throw new Error(
      `Unable to inspect expired claimant invitations: ${error.message}`,
    );
  }

  for (
    const rawRow of
      data ??
      []
  ) {
    const row =
      rawRow as {
        id: string;

        claimant_id: string;

        auth_user_id:
          | string
          | null;
      };

    const {
      error:
        expireError,
    } =
      await admin
        .from(
          "claimant_activation_invitations",
        )
        .update({
          status:
            "expired",

          updated_at:
            now,
        })
        .eq(
          "id",
          row.id,
        )
        .eq(
          "status",
          "sent",
        );

    if (expireError) {
      throw new Error(
        `Unable to expire claimant invitation: ${expireError.message}`,
      );
    }

    if (
      row.auth_user_id
    ) {
      await admin
        .from(
          "claimant_onboarding",
        )
        .update({
          claimant_auth_user_id:
            null,
        })
        .eq(
          "claimant_id",
          row.claimant_id,
        )
        .eq(
          "claimant_auth_user_id",
          row.auth_user_id,
        );

      await admin.auth.admin.deleteUser(
        row.auth_user_id,
      );
    }
  }
}

/* ========================================================================== */
/* Government ID requirement                                                   */
/* ========================================================================== */

async function ensureGovernmentIdRequest(
  row:
    ClaimantOnboardingInviteRow,
  actorUserId:
    string,
): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claim_document_requests",
      )
      .select(
        "id, status, fulfilled_by_document_id",
      )
      .eq(
        "claim_id",
        row.claim_id,
      )
      .eq(
        "kind",
        "government_id",
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to inspect the claimant government ID requirement: ${error.message}`,
    );
  }

  const existing =
    data
      ? data as ClaimDocumentRequestRow
      : undefined;

  if (!existing) {
    const {
      error:
        insertError,
    } =
      await admin
        .from(
          "claim_document_requests",
        )
        .insert({
          id:
            governmentIdRequestId(
              row.claim_id,
            ),

          claim_id:
            row.claim_id,

          kind:
            "government_id",

          reason:
            GOVERNMENT_ID_REASON,

          requested_from_claimant_id:
            row.claimant_id,

          requested_at:
            currentIsoDate(),

          due_by:
            null,

          required:
            true,

          status:
            "outstanding",

          guidance:
            GOVERNMENT_ID_GUIDANCE,

          fulfilled_by_document_id:
            null,

          waived_reason:
            null,

          row_version:
            1,

          updated_at:
            new Date().toISOString(),
        });

    if (insertError) {
      throw new Error(
        `Unable to create the claimant government ID requirement: ${insertError.message}`,
      );
    }

    const {
      error:
        auditError,
    } =
      await admin
        .from(
          "claim_document_audit",
        )
        .insert({
          id:
            crypto.randomUUID(),

          claim_id:
            row.claim_id,

          document_id:
            null,

          request_id:
            governmentIdRequestId(
              row.claim_id,
            ),

          action:
            "document_requests_synced",

          actor_user_id:
            actorUserId,

          occurred_at:
            new Date().toISOString(),

          detail:
            "Required claimant government ID request created during controlled claimant activation.",
        });

    if (auditError) {
      throw new Error(
        `Unable to record the government ID request audit event: ${auditError.message}`,
      );
    }

    return;
  }

  if (
    existing.status ===
      "accepted" &&
    existing.fulfilled_by_document_id
  ) {
    return;
  }

  const {
    error:
      updateError,
  } =
    await admin
      .from(
        "claim_document_requests",
      )
      .update({
        requested_from_claimant_id:
          row.claimant_id,

        requested_at:
          currentIsoDate(),

        required:
          true,

        status:
          existing.status ===
            "received"
            ? "received"
            : "outstanding",

        reason:
          GOVERNMENT_ID_REASON,

        guidance:
          GOVERNMENT_ID_GUIDANCE,

        waived_reason:
          null,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        existing.id,
      );

  if (updateError) {
    throw new Error(
      `Unable to refresh the claimant government ID requirement: ${updateError.message}`,
    );
  }
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listClaimantActivationCandidates(
  session:
    StaffSession,
): Promise<
  ClaimantActivationCandidate[]
> {
  await expireStaleInvitations();

  const admin =
    getSupabaseAdmin();

  let claimantQuery =
    admin
      .from(
        "claimant_onboarding",
      )
      .select(
        "claim_id, claim_reference, claimant_id, claimant_reference, claimant_auth_user_id, legal_name, email, mobile_phone, entity_type, originating_staff_user_id, assigned_staff_user_id",
      )
      .eq(
        "entity_type",
        "individual",
      )
      .is(
        "claimant_auth_user_id",
        null,
      );

  if (
    !isSuperAdmin(
      session,
    )
  ) {
    claimantQuery =
      claimantQuery.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const [
    claimantResult,
    openInvitationResult,
  ] =
    await Promise.all([
      claimantQuery.order(
        "created_at",
        {
          ascending:
            false,
        },
      ),

      admin
        .from(
          "claimant_activation_invitations",
        )
        .select(
          "claim_id",
        )
        .in(
          "status",
          [
            "preparing",
            "sent",
          ],
        ),
    ]);

  if (
    claimantResult.error
  ) {
    throw new Error(
      `Unable to load claimant activation candidates: ${claimantResult.error.message}`,
    );
  }

  if (
    openInvitationResult.error
  ) {
    throw new Error(
      `Unable to load open claimant invitations: ${openInvitationResult.error.message}`,
    );
  }

  const openClaims =
    new Set(
      (
        openInvitationResult.data ??
        []
      ).map(
        (
          item,
        ) =>
          String(
            item.claim_id,
          ),
      ),
    );

  return (
    claimantResult.data ??
    []
  )
    .filter(
      (
        item,
      ) =>
        !openClaims.has(
          String(
            item.claim_id,
          ),
        ),
    )
    .map(
      (
        item,
      ) => ({
        claimantId:
          String(
            item.claimant_id,
          ),

        claimantReference:
          String(
            item.claimant_reference,
          ),

        claimId:
          String(
            item.claim_id,
          ),

        claimReference:
          String(
            item.claim_reference,
          ),

        currentLegalName:
          String(
            item.legal_name,
          ),

        currentEmail:
          String(
            item.email,
          ),

        currentMobilePhone:
          String(
            item.mobile_phone,
          ),

        originatingStaffUserId:
          String(
            item.originating_staff_user_id,
          ),

        assignedStaffUserId:
          String(
            item.assigned_staff_user_id,
          ),
      }),
    );
}

export async function listClaimantActivationInvitations(
  session:
    StaffSession,
): Promise<
  ClaimantActivationInvitation[]
> {
  await expireStaleInvitations();

  const admin =
    getSupabaseAdmin();

  if (
    isSuperAdmin(
      session,
    )
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "claimant_activation_invitations",
        )
        .select("*")
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(
          200,
        );

    if (error) {
      throw new Error(
        `Unable to load claimant activation invitations: ${error.message}`,
      );
    }

    return (
      data ??
      []
    ).map(
      (
        row,
      ) =>
        invitationFromRow(
          row as ClaimantActivationInvitationRow,
        ),
    );
  }

  const {
    data:
      ownedRows,
    error:
      ownedError,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .select(
        "claim_id",
      )
      .eq(
        "assigned_staff_user_id",
        session.user.id,
      );

  if (ownedError) {
    throw new Error(
      `Unable to resolve claimant invitation ownership: ${ownedError.message}`,
    );
  }

  const ownedClaimIds =
    [
      ...new Set(
        (
          ownedRows ??
          []
        ).map(
          (
            row,
          ) =>
            String(
              row.claim_id,
            ),
        ),
      ),
    ];

  if (
    ownedClaimIds.length ===
    0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claimant_activation_invitations",
      )
      .select("*")
      .in(
        "claim_id",
        ownedClaimIds,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        200,
      );

  if (error) {
    throw new Error(
      `Unable to load claimant activation invitations: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      invitationFromRow(
        row as ClaimantActivationInvitationRow,
      ),
  );
}

/* ========================================================================== */
/* Cleanup                                                                     */
/* ========================================================================== */

async function invalidateFailedInvite({
  invitationId,
  claimantId,
  authUserId,
}: {
  invitationId:
    string;

  claimantId:
    string;

  authUserId?:
    string;
}): Promise<void> {
  const admin =
    getSupabaseAdmin();

  if (
    authUserId
  ) {
    await admin
      .from(
        "claimant_onboarding",
      )
      .update({
        claimant_auth_user_id:
          null,
      })
      .eq(
        "claimant_id",
        claimantId,
      )
      .eq(
        "claimant_auth_user_id",
        authUserId,
      );

    await admin.auth.admin.deleteUser(
      authUserId,
    );
  }

  await admin
    .from(
      "claimant_activation_invitations",
    )
    .update({
      status:
        "failed",

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      invitationId,
    )
    .eq(
      "status",
      "preparing",
    );
}

/* ========================================================================== */
/* Invite                                                                      */
/* ========================================================================== */

export async function inviteClaimantUser(
  input:
    InviteClaimantInput,
): Promise<
  InviteClaimantResult
> {
  requireInvitationAuthority(
    input.session,
  );

  await expireStaleInvitations();

  const claimantId =
    normalizeText(
      input.claimantId,
    );

  const legalFirstName =
    normalizeText(
      input.legalFirstName,
    );

  const legalLastName =
    normalizeText(
      input.legalLastName,
    );

  const confirmedLegalName =
    normalizeText(
      `${legalFirstName} ${legalLastName}`,
    );

  const email =
    normalizeEmail(
      input.email,
    );

  const mobilePhone =
    normalizePhone(
      input.mobilePhone,
    );

  const redirectTo =
    input.redirectTo.trim();

  if (
    !claimantId ||
    !legalFirstName ||
    !legalLastName ||
    !validEmail(
      email,
    ) ||
    mobilePhone.length !==
      10 ||
    !redirectTo
  ) {
    throw new Error(
      "Claimant activation information is incomplete or invalid.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .select(
        "claim_id, claim_reference, claimant_id, claimant_reference, claimant_auth_user_id, legal_name, email, mobile_phone, contact_methods, entity_type, identity_verification, originating_staff_user_id, assigned_staff_user_id",
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    throw new Error(
      "The selected claimant record could not be found.",
    );
  }

  const claimant =
    data as ClaimantOnboardingInviteRow;

  requireClaimantOwnership(
    input.session,
    claimant,
  );

  if (
    claimant.entity_type !==
    "individual"
  ) {
    throw new Error(
      "This activation flow is currently limited to individual claimants. Estate, trust and business claimant records require review.",
    );
  }

  if (
    claimant.claimant_auth_user_id
  ) {
    throw new Error(
      "This claimant already has a My DueQuity authentication identity.",
    );
  }

  const persistedLegalName =
    normalizeText(
      claimant.legal_name,
    );

  const persistedEmail =
    normalizeEmail(
      claimant.email,
    );

  const persistedMobilePhone =
    normalizePhone(
      claimant.mobile_phone,
    );

  if (
    !persistedLegalName ||
    !validEmail(
      persistedEmail,
    ) ||
    persistedMobilePhone.length !==
      10
  ) {
    throw new Error(
      "The saved claimant identity or contact record is incomplete. Complete claimant onboarding before sending activation.",
    );
  }

  if (
    !equivalentLegalName(
      confirmedLegalName,
      persistedLegalName,
    )
  ) {
    throw new Error(
      "The activation legal name does not match the saved claimant record. Update the claimant onboarding record first, then send activation.",
    );
  }

  if (
    email !==
    persistedEmail
  ) {
    throw new Error(
      "The activation email does not match the saved claimant record. Save the claimant contact change first, then send activation.",
    );
  }

  if (
    mobilePhone !==
    persistedMobilePhone
  ) {
    throw new Error(
      "The activation mobile number does not match the saved claimant record. Save the claimant contact change first, then send activation.",
    );
  }

  const {
    data:
      openInvitation,
    error:
      openInvitationError,
  } =
    await admin
      .from(
        "claimant_activation_invitations",
      )
      .select(
        "id",
      )
      .eq(
        "claim_id",
        claimant.claim_id,
      )
      .in(
        "status",
        [
          "preparing",
          "sent",
        ],
      )
      .maybeSingle();

  if (
    openInvitationError
  ) {
    throw new Error(
      `Unable to verify invitation state: ${openInvitationError.message}`,
    );
  }

  if (
    openInvitation
  ) {
    throw new Error(
      "This claimant already has an active activation invitation.",
    );
  }

  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
      CLAIMANT_INVITATION_LIFETIME_MS,
    );

  const {
    data:
      invitationData,
    error:
      invitationError,
  } =
    await admin
      .from(
        "claimant_activation_invitations",
      )
      .insert({
        claim_id:
          claimant.claim_id,

        claimant_id:
          claimant.claimant_id,

        claimant_reference:
          claimant.claimant_reference,

        legal_first_name:
          legalFirstName,

        legal_last_name:
          legalLastName,

        email:
          persistedEmail,

        mobile_phone:
          persistedMobilePhone,

        auth_user_id:
          null,

        status:
          "preparing",

        sent_by_staff_user_id:
          input.session.user.id,

        sent_at:
          null,

        activated_at:
          null,

        revoked_at:
          null,

        expires_at:
          expiresAt.toISOString(),

        created_at:
          now.toISOString(),

        updated_at:
          now.toISOString(),
      })
      .select(
        "id",
      )
      .single();

  if (
    invitationError ||
    !invitationData
  ) {
    throw new Error(
      `Unable to prepare claimant activation invitation: ${
        invitationError?.message ??
        "Invitation record unavailable."
      }`,
    );
  }

  const invitationId =
    String(
      invitationData.id,
    );

  let authUserId:
    string | undefined;

  try {
    const {
      data:
        inviteData,
      error:
        inviteError,
    } =
      await admin.auth.admin
        .inviteUserByEmail(
          persistedEmail,
          {
            redirectTo,

            data: {
              audience:
                "claimant",

              claimant_id:
                claimant.claimant_id,

              claimant_reference:
                claimant.claimant_reference,

              claim_reference:
                claimant.claim_reference,

              legal_name:
                persistedLegalName,
            },
          },
        );

    if (
      inviteError ||
      !inviteData.user
    ) {
      throw new Error(
        inviteError?.message ??
        "Supabase did not create the claimant invitation identity.",
      );
    }

    authUserId =
      inviteData.user.id;

    const {
      data:
        staffCollision,
      error:
        staffCollisionError,
    } =
      await admin
        .from(
          "staff_users",
        )
        .select(
          "id",
        )
        .eq(
          "id",
          authUserId,
        )
        .maybeSingle();

    if (
      staffCollisionError
    ) {
      throw new Error(
        `Unable to verify claimant Auth audience: ${staffCollisionError.message}`,
      );
    }

    if (
      staffCollision
    ) {
      throw new Error(
        "A DueQuity staff Auth identity cannot be used as a claimant identity.",
      );
    }

    const claimantBindingUpdate:
      Record<string, unknown> = {
        claimant_auth_user_id:
          authUserId,
      };

    if (
      claimant.identity_verification ===
      "not_started"
    ) {
      claimantBindingUpdate.identity_verification =
        "documents_requested";

      claimantBindingUpdate.identity_verified_at =
        null;

      claimantBindingUpdate.identity_provider_ref =
        null;
    }

    let claimantBindingQuery =
      admin
        .from(
          "claimant_onboarding",
        )
        .update(
          claimantBindingUpdate,
        )
        .eq(
          "claimant_id",
          claimant.claimant_id,
        )
        .is(
          "claimant_auth_user_id",
          null,
        );

    /*
     * Re-check ownership on the actual update so reassignment that races this
     * request cannot allow the former assignee to finish an invitation.
     */
    if (
      !isSuperAdmin(
        input.session,
      )
    ) {
      claimantBindingQuery =
        claimantBindingQuery.eq(
          "assigned_staff_user_id",
          input.session.user.id,
        );
    }

    const {
      data:
        updatedClaimant,
      error:
        updateClaimantError,
    } =
      await claimantBindingQuery
        .select(
          "claimant_id",
        )
        .maybeSingle();

    if (
      updateClaimantError ||
      !updatedClaimant
    ) {
      throw new Error(
        `Unable to bind the claimant invitation to the claimant record: ${
          updateClaimantError?.message ??
          "Claimant record changed before invitation binding."
        }`,
      );
    }

    await ensureGovernmentIdRequest(
      claimant,
      input.session.user.id,
    );

    const sentAt =
      new Date().toISOString();

    const {
      data:
        sentInvitation,
      error:
        sentInvitationError,
    } =
      await admin
        .from(
          "claimant_activation_invitations",
        )
        .update({
          auth_user_id:
            authUserId,

          status:
            "sent",

          sent_at:
            sentAt,

          updated_at:
            sentAt,
        })
        .eq(
          "id",
          invitationId,
        )
        .eq(
          "status",
          "preparing",
        )
        .select(
          "id",
        )
        .maybeSingle();

    if (
      sentInvitationError ||
      !sentInvitation
    ) {
      throw new Error(
        `Unable to finalize claimant invitation state: ${
          sentInvitationError?.message ??
          "Invitation state changed."
        }`,
      );
    }

    await recordAuditEvent({
      actor:
        input.session.user,

      action:
        "claimant.activation_invited",

      targetType:
        "claimant",

      targetId:
        claimant.claimant_id,

      targetLabel:
        claimant.claimant_reference,

      outcome:
        "success",

      detail:
        `Controlled claimant activation invitation sent to saved claimant email ${persistedEmail}. Saved claimant identity and contact values were preserved. Government ID requirement created or preserved.`,
    });

    return {
      invitationId,

      claimantId:
        claimant.claimant_id,

      claimantReference:
        claimant.claimant_reference,

      email:
        persistedEmail,
    };
  } catch (
    inviteFailure
  ) {
    await invalidateFailedInvite({
      invitationId,

      claimantId:
        claimant.claimant_id,

      authUserId,
    });

    try {
      await recordAuditEvent({
        actor:
          input.session.user,

        action:
          "claimant.activation_invite_failed",

        targetType:
          "claimant",

        targetId:
          claimant.claimant_id,

        targetLabel:
          claimant.claimant_reference,

        outcome:
          "failure",

        detail:
          inviteFailure instanceof Error
            ? inviteFailure.message
            : "Claimant activation invitation failed.",
      });
    } catch {
      /*
       * Preserve the original invitation failure.
       */
    }

    throw inviteFailure;
  }
}