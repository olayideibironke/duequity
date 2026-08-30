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

export type AssignedLeadIdentityStatus =
  | "not_started"
  | "documents_requested"
  | "under_review"
  | "verified"
  | "failed"
  | "manual_review";

export interface AssignedLeadClaimantOperationsRecord {
  workcaseId:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  legalName:
    string;

  email:
    string;

  mobilePhone:
    string;

  originatingStaffUserId:
    string;

  originatingStaffName:
    string;

  assignedStaffUserId:
    string;

  assignedStaffName:
    string;

  portalAccountActive:
    boolean;

  identityVerification:
    AssignedLeadIdentityStatus;

  identityVerifiedAt?:
    string;

  governmentIdRequestStatus?:
    string;

  governmentIdDocumentStatus?:
    string;

  governmentIdSafetyStatus?:
    string;

  messagingActive:
    boolean;

  messageCount:
    number;

  unreadMessageCount:
    number;

  latestMessageAt?:
    string;

  propertyConnectionConfirmedAt:
    string;

  activationMaterialsConsentAt:
    string;

  createdAt:
    string;

  updatedAt:
    string;

  officialClaimCreated:
    false;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface WorkcaseRow {
  id:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  discovered_record_id:
    string;

  originating_staff_user_id:
    string;

  assigned_staff_user_id:
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
    string;

  linked_claim_id:
    string | null;

  created_at:
    string;

  updated_at:
    string;
}

interface IdentityRow {
  workcase_id:
    string;

  claimant_id:
    string;

  identity_verification:
    AssignedLeadIdentityStatus;

  identity_verified_at:
    string | null;
}

interface RequestRow {
  workcase_id:
    string;

  claimant_id:
    string;

  status:
    string;
}

interface DocumentRow {
  workcase_id:
    string;

  claimant_id:
    string;

  status:
    string;

  malware_scan_status:
    string;

  uploaded_at:
    string;
}

interface ThreadRow {
  id:
    string;

  workcase_id:
    string;

  claimant_id:
    string;

  status:
    string;

  last_message_at:
    string | null;
}

interface MessageRow {
  thread_id:
    string;

  sender_type:
    "staff" | "claimant";

  staff_read_at:
    string | null;

  state:
    string;
}

interface StaffRow {
  id:
    string;

  name:
    string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function isSuperAdmin(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
    "super_admin"
  );
}

function legalName(
  row:
    WorkcaseRow,
): string {
  return [
    row.legal_first_name,
    row.legal_last_name,
  ]
    .map(
      (
        value,
      ) =>
        value.trim(),
    )
    .filter(
      Boolean,
    )
    .join(
      " ",
    );
}

async function hasActiveLeadAuthorization(
  session:
    StaffSession,
  discoveredRecordId:
    string,
): Promise<
  boolean
> {
  if (
    isSuperAdmin(
      session,
    )
  ) {
    return true;
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "staff_has_active_lead_work_authorization",
      {
        p_staff_user_id:
          session.user.id,

        p_discovered_record_id:
          discoveredRecordId,

        p_opportunity_id:
          null,

        p_claim_id:
          null,
      },
    );

  if (
    error
  ) {
    throw new Error(
      `Unable to verify assigned claimant authorization: ${error.message}`,
    );
  }

  return data ===
    true;
}

async function loadStaffNames(
  ids:
    string[],
): Promise<
  Map<
    string,
    string
  >
> {
  const uniqueIds =
    [
      ...new Set(
        ids.filter(
          Boolean,
        ),
      ),
    ];

  const result =
    new Map<
      string,
      string
    >();

  if (
    uniqueIds.length ===
    0
  ) {
    return result;
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "staff_users",
      )
      .select(
        "id, name",
      )
      .in(
        "id",
        uniqueIds,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve claimant staff attribution: ${error.message}`,
    );
  }

  for (
    const rawRow of
      data ??
      []
  ) {
    const row =
      rawRow as unknown as
        StaffRow;

    result.set(
      row.id,
      row.name,
    );
  }

  return result;
}

/* ========================================================================== */
/* Loader                                                                      */
/* ========================================================================== */

async function loadAssignedLeadClaimantOperations(
  session:
    StaffSession,
): Promise<
  AssignedLeadClaimantOperationsRecord[]
> {
  const admin =
    getSupabaseAdmin();

  let workcaseQuery =
    admin
      .from(
        "assigned_lead_claimant_workcases",
      )
      .select(
        [
          "id",
          "claimant_id",
          "claimant_reference",
          "discovered_record_id",
          "originating_staff_user_id",
          "assigned_staff_user_id",
          "legal_first_name",
          "legal_last_name",
          "email",
          "mobile_phone",
          "property_connection_confirmed_at",
          "activation_materials_consent_at",
          "auth_user_id",
          "status",
          "linked_claim_id",
          "created_at",
          "updated_at",
        ].join(
          ", ",
        ),
      )
      .eq(
        "status",
        "activated",
      )
      .is(
        "linked_claim_id",
        null,
      );

  if (
    !isSuperAdmin(
      session,
    )
  ) {
    workcaseQuery =
      workcaseQuery.eq(
        "assigned_staff_user_id",
        session.user.id,
      );
  }

  const {
    data:
      rawWorkcases,
    error:
      workcaseError,
  } =
    await workcaseQuery;

  if (
    workcaseError
  ) {
    throw new Error(
      `Unable to load assigned claimant operations: ${workcaseError.message}`,
    );
  }

  let workcases =
    (
      rawWorkcases ??
      []
    ) as unknown as
      WorkcaseRow[];

  if (
    !isSuperAdmin(
      session,
    )
  ) {
    const authorization =
      await Promise.all(
        workcases.map(
          async (
            workcase,
          ) => ({
            workcase,

            authorized:
              await hasActiveLeadAuthorization(
                session,
                workcase.discovered_record_id,
              ),
          }),
        ),
      );

    workcases =
      authorization
        .filter(
          (
            item,
          ) =>
            item.authorized,
        )
        .map(
          (
            item,
          ) =>
            item.workcase,
        );
  }

  if (
    workcases.length ===
    0
  ) {
    return [];
  }

  const workcaseIds =
    workcases.map(
      (
        workcase,
      ) =>
        workcase.id,
    );

  const [
    identityResult,
    requestResult,
    documentResult,
    threadResult,
  ] =
    await Promise.all([
      admin
        .from(
          "assigned_lead_claimant_identity_profiles",
        )
        .select(
          "workcase_id, claimant_id, identity_verification, identity_verified_at",
        )
        .in(
          "workcase_id",
          workcaseIds,
        ),

      admin
        .from(
          "assigned_lead_claimant_document_requests",
        )
        .select(
          "workcase_id, claimant_id, status",
        )
        .in(
          "workcase_id",
          workcaseIds,
        )
        .eq(
          "kind",
          "government_id",
        ),

      admin
        .from(
          "assigned_lead_claimant_documents",
        )
        .select(
          "workcase_id, claimant_id, status, malware_scan_status, uploaded_at",
        )
        .in(
          "workcase_id",
          workcaseIds,
        )
        .eq(
          "kind",
          "government_id",
        )
        .order(
          "uploaded_at",
          {
            ascending:
              false,
          },
        ),

      admin
        .from(
          "assigned_lead_claimant_message_threads",
        )
        .select(
          "id, workcase_id, claimant_id, status, last_message_at",
        )
        .in(
          "workcase_id",
          workcaseIds,
        ),
    ]);

  if (
    identityResult.error
  ) {
    throw new Error(
      `Unable to load assigned claimant identity status: ${identityResult.error.message}`,
    );
  }

  if (
    requestResult.error
  ) {
    throw new Error(
      `Unable to load assigned claimant document requests: ${requestResult.error.message}`,
    );
  }

  if (
    documentResult.error
  ) {
    throw new Error(
      `Unable to load assigned claimant documents: ${documentResult.error.message}`,
    );
  }

  if (
    threadResult.error
  ) {
    throw new Error(
      `Unable to load assigned claimant messaging status: ${threadResult.error.message}`,
    );
  }

  const identities =
    (
      identityResult.data ??
      []
    ) as unknown as
      IdentityRow[];

  const requests =
    (
      requestResult.data ??
      []
    ) as unknown as
      RequestRow[];

  const documents =
    (
      documentResult.data ??
      []
    ) as unknown as
      DocumentRow[];

  const threads =
    (
      threadResult.data ??
      []
    ) as unknown as
      ThreadRow[];

  const threadIds =
    threads.map(
      (
        thread,
      ) =>
        thread.id,
    );

  let messages:
    MessageRow[] =
    [];

  if (
    threadIds.length >
    0
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "assigned_lead_claimant_messages",
        )
        .select(
          "thread_id, sender_type, staff_read_at, state",
        )
        .in(
          "thread_id",
          threadIds,
        )
        .eq(
          "state",
          "sent",
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to load assigned claimant message counts: ${error.message}`,
      );
    }

    messages =
      (
        data ??
        []
      ) as unknown as
        MessageRow[];
  }

  const names =
    await loadStaffNames(
      workcases.flatMap(
        (
          workcase,
        ) => [
          workcase.originating_staff_user_id,
          workcase.assigned_staff_user_id,
        ],
      ),
    );

  const latestDocumentByWorkcase =
    new Map<
      string,
      DocumentRow
    >();

  for (
    const document of
      documents
  ) {
    if (
      !latestDocumentByWorkcase.has(
        document.workcase_id,
      )
    ) {
      latestDocumentByWorkcase.set(
        document.workcase_id,
        document,
      );
    }
  }

  const threadByWorkcase =
    new Map<
      string,
      ThreadRow
    >();

  for (
    const thread of
      threads
  ) {
    const current =
      threadByWorkcase.get(
        thread.workcase_id,
      );

    if (
      !current ||
      (
        thread.last_message_at ??
        ""
      ) >
      (
        current.last_message_at ??
        ""
      )
    ) {
      threadByWorkcase.set(
        thread.workcase_id,
        thread,
      );
    }
  }

  const records =
    workcases.map(
      (
        workcase,
      ): AssignedLeadClaimantOperationsRecord => {
        const identity =
          identities.find(
            (
              row,
            ) =>
              row.workcase_id ===
                workcase.id &&
              row.claimant_id ===
                workcase.claimant_id,
          );

        const request =
          requests.find(
            (
              row,
            ) =>
              row.workcase_id ===
                workcase.id &&
              row.claimant_id ===
                workcase.claimant_id,
          );

        const document =
          latestDocumentByWorkcase.get(
            workcase.id,
          );

        const thread =
          threadByWorkcase.get(
            workcase.id,
          );

        const threadMessages =
          thread
            ? messages.filter(
                (
                  message,
                ) =>
                  message.thread_id ===
                  thread.id,
              )
            : [];

        const unreadMessageCount =
          threadMessages.filter(
            (
              message,
            ) =>
              message.sender_type ===
                "claimant" &&
              !message.staff_read_at,
          ).length;

        return {
          workcaseId:
            workcase.id,

          claimantId:
            workcase.claimant_id,

          claimantReference:
            workcase.claimant_reference,

          legalName:
            legalName(
              workcase,
            ),

          email:
            workcase.email,

          mobilePhone:
            workcase.mobile_phone,

          originatingStaffUserId:
            workcase.originating_staff_user_id,

          originatingStaffName:
            names.get(
              workcase.originating_staff_user_id,
            ) ??
            "DueQuity staff",

          assignedStaffUserId:
            workcase.assigned_staff_user_id,

          assignedStaffName:
            names.get(
              workcase.assigned_staff_user_id,
            ) ??
            "DueQuity staff",

          portalAccountActive:
            Boolean(
              workcase.auth_user_id,
            ),

          identityVerification:
            identity?.identity_verification ??
            "documents_requested",

          identityVerifiedAt:
            identity?.identity_verified_at ??
            undefined,

          governmentIdRequestStatus:
            request?.status,

          governmentIdDocumentStatus:
            document?.status,

          governmentIdSafetyStatus:
            document?.malware_scan_status,

          messagingActive:
            Boolean(
              thread,
            ),

          messageCount:
            threadMessages.length,

          unreadMessageCount,

          latestMessageAt:
            thread?.last_message_at ??
            undefined,

          propertyConnectionConfirmedAt:
            workcase.property_connection_confirmed_at,

          activationMaterialsConsentAt:
            workcase.activation_materials_consent_at,

          createdAt:
            workcase.created_at,

          updatedAt:
            workcase.updated_at,

          officialClaimCreated:
            false,
        };
      },
    );

  return records.sort(
    (
      left,
      right,
    ) =>
      right.updatedAt.localeCompare(
        left.updatedAt,
      ),
  );
}

/* ========================================================================== */
/* Public reads                                                                */
/* ========================================================================== */

export async function listAssignedLeadClaimantOperationsForStaff(
  session:
    StaffSession,
): Promise<
  AssignedLeadClaimantOperationsRecord[]
> {
  return loadAssignedLeadClaimantOperations(
    session,
  );
}

export async function getAssignedLeadClaimantOperationsByClaimantIdForStaff(
  session:
    StaffSession,
  claimantId:
    string,
): Promise<
  AssignedLeadClaimantOperationsRecord | undefined
> {
  const normalized =
    claimantId.trim();

  if (
    !normalized
  ) {
    return undefined;
  }

  const records =
    await loadAssignedLeadClaimantOperations(
      session,
    );

  return records.find(
    (
      record,
    ) =>
      record.claimantId ===
      normalized,
  );
}