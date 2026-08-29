import "server-only";

import {
  can,
  type StaffSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type LeadAssignmentSubjectType =
  | "discovered_record"
  | "opportunity";

export type LeadAssignmentBatchStatus =
  | "active"
  | "closed"
  | "cancelled";

export interface LeadAssignmentBatch {
  id:
    string;

  reference:
    string;

  name:
    string;

  sourceKind:
    "upload" | "manual";

  sourceFileName?:
    string;

  sourceFileSha256?:
    string;

  stateCode:
    string;

  countyGeoid?:
    string;

  countyName:
    string;

  sourceRecordCount?:
    number;

  status:
    LeadAssignmentBatchStatus;

  uploadedByStaffUserId:
    string;

  createdAt:
    string;

  closedAt?:
    string;

  metadata:
    Record<
      string,
      unknown
    >;
}

export interface LeadAssignment {
  id:
    string;

  batchId?:
    string;

  subjectType:
    LeadAssignmentSubjectType;

  discoveredRecordId?:
    string;

  opportunityId?:
    string;

  assignedToStaffUserId:
    string;

  assignedByStaffUserId:
    string;

  assignedAt:
    string;

  status:
    "active" | "ended";

  endedAt?:
    string;

  supersedesAssignmentId?:
    string;

  note?:
    string;
}

export interface StaffLeadAccessScope {
  globalAccess:
    boolean;

  discoveredRecordIds:
    Set<string>;

  opportunityIds:
    Set<string>;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface LeadAssignmentBatchRow {
  id:
    string;

  reference:
    string;

  name:
    string;

  source_kind:
    "upload" | "manual";

  source_file_name:
    string | null;

  source_file_sha256:
    string | null;

  state_code:
    string;

  county_geoid:
    string | null;

  county_name:
    string;

  source_record_count:
    number | null;

  status:
    LeadAssignmentBatchStatus;

  uploaded_by_staff_user_id:
    string;

  created_at:
    string;

  closed_at:
    string | null;

  metadata:
    Record<
      string,
      unknown
    >;
}

interface LeadAssignmentRow {
  id:
    string;

  batch_id:
    string | null;

  subject_type:
    LeadAssignmentSubjectType;

  discovered_record_id:
    string | null;

  opportunity_id:
    string | null;

  assigned_to_staff_user_id:
    string;

  assigned_by_staff_user_id:
    string;

  assigned_at:
    string;

  status:
    "active" | "ended";

  ended_at:
    string | null;

  supersedes_assignment_id:
    string | null;

  note:
    string | null;
}

interface PromotedDiscoveredRow {
  id:
    string;

  promoted_opportunity_id:
    string | null;
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
      .trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function optionalText(
  value:
    string | undefined,
): string | undefined {
  const normalized =
    value
      ?.trim();

  return normalized
    ? normalized
    : undefined;
}

function isDistributionAdmin(
  session:
    StaffSession,
): boolean {
  return (
    session.user.role ===
      "super_admin" ||
    session.user.role ===
      "administrator"
  );
}

function requireDistributionAdmin(
  session:
    StaffSession,
): void {
  if (
    !isDistributionAdmin(
      session,
    )
  ) {
    throw new Error(
      "Only a DueQuity Administrator may distribute or reassign leads.",
    );
  }
}

function requireLeadRead(
  session:
    StaffSession,
): void {
  if (
    !can(
      session,
      "opportunity.read",
    )
  ) {
    throw new Error(
      "Your DueQuity role is not authorized to access assigned recovery leads.",
    );
  }
}

function mapBatch(
  row:
    LeadAssignmentBatchRow,
): LeadAssignmentBatch {
  return {
    id:
      row.id,

    reference:
      row.reference,

    name:
      row.name,

    sourceKind:
      row.source_kind,

    sourceFileName:
      row.source_file_name ??
      undefined,

    sourceFileSha256:
      row.source_file_sha256 ??
      undefined,

    stateCode:
      row.state_code,

    countyGeoid:
      row.county_geoid ??
      undefined,

    countyName:
      row.county_name,

    sourceRecordCount:
      row.source_record_count ??
      undefined,

    status:
      row.status,

    uploadedByStaffUserId:
      row.uploaded_by_staff_user_id,

    createdAt:
      row.created_at,

    closedAt:
      row.closed_at ??
      undefined,

    metadata:
      row.metadata ??
      {},
  };
}

function mapAssignment(
  row:
    LeadAssignmentRow,
): LeadAssignment {
  return {
    id:
      row.id,

    batchId:
      row.batch_id ??
      undefined,

    subjectType:
      row.subject_type,

    discoveredRecordId:
      row.discovered_record_id ??
      undefined,

    opportunityId:
      row.opportunity_id ??
      undefined,

    assignedToStaffUserId:
      row.assigned_to_staff_user_id,

    assignedByStaffUserId:
      row.assigned_by_staff_user_id,

    assignedAt:
      row.assigned_at,

    status:
      row.status,

    endedAt:
      row.ended_at ??
      undefined,

    supersedesAssignmentId:
      row.supersedes_assignment_id ??
      undefined,

    note:
      row.note ??
      undefined,
  };
}

/* ========================================================================== */
/* Read access scope                                                           */
/* ========================================================================== */

/**
 * Administrators receive global operational access.
 *
 * Ordinary staff receive only:
 *
 * 1. discovered records with an active assignment to them;
 * 2. Opportunities assigned directly to them;
 * 3. Opportunities promoted from a discovered record actively assigned
 *    to them.
 *
 * This is intentionally record-level access. County is assignment-batch
 * context, not the security boundary.
 */
export async function resolveStaffLeadAccessScope(
  session:
    StaffSession,
): Promise<
  StaffLeadAccessScope
> {
  requireLeadRead(
    session,
  );

  if (
    isDistributionAdmin(
      session,
    )
  ) {
    return {
      globalAccess:
        true,

      discoveredRecordIds:
        new Set(),

      opportunityIds:
        new Set(),
    };
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "lead_assignments",
      )
      .select(
        [
          "id",
          "batch_id",
          "subject_type",
          "discovered_record_id",
          "opportunity_id",
          "assigned_to_staff_user_id",
          "assigned_by_staff_user_id",
          "assigned_at",
          "status",
          "ended_at",
          "supersedes_assignment_id",
          "note",
        ].join(
          ", ",
        ),
      )
      .eq(
        "assigned_to_staff_user_id",
        session.user.id,
      )
      .eq(
        "status",
        "active",
      );

  if (error) {
    throw new Error(
      `Unable to resolve staff lead assignments: ${error.message}`,
    );
  }

  const assignments =
    (
      data ??
      []
    ) as unknown as
      LeadAssignmentRow[];

  const discoveredRecordIds =
    new Set<string>();

  const opportunityIds =
    new Set<string>();

  for (
    const assignment
    of assignments
  ) {
    if (
      assignment.subject_type ===
        "discovered_record" &&
      assignment.discovered_record_id
    ) {
      discoveredRecordIds.add(
        assignment.discovered_record_id,
      );
    }

    if (
      assignment.subject_type ===
        "opportunity" &&
      assignment.opportunity_id
    ) {
      opportunityIds.add(
        assignment.opportunity_id,
      );
    }
  }

  /*
   * Preserve access as an assigned discovered lead moves forward into
   * Opportunity. Staff should not lose the lead simply because Admin or the
   * recovery engine promoted it.
   */
  if (
    discoveredRecordIds.size >
    0
  ) {
    const {
      data:
        promotedRows,
      error:
        promotedError,
    } =
      await admin
        .from(
          "discovered_records",
        )
        .select(
          [
            "id",
            "promoted_opportunity_id",
          ].join(
            ", ",
          ),
        )
        .in(
          "id",
          Array.from(
            discoveredRecordIds,
          ),
        );

    if (
      promotedError
    ) {
      throw new Error(
        `Unable to resolve promoted assigned leads: ${promotedError.message}`,
      );
    }

    for (
      const row
      of (
        promotedRows ??
        []
      ) as unknown as
        PromotedDiscoveredRow[]
    ) {
      if (
        row.promoted_opportunity_id
      ) {
        opportunityIds.add(
          row.promoted_opportunity_id,
        );
      }
    }
  }

  return {
    globalAccess:
      false,

    discoveredRecordIds,

    opportunityIds,
  };
}

export async function staffCanAccessDiscoveredLead({
  session,
  discoveredRecordId,
}: {
  session:
    StaffSession;

  discoveredRecordId:
    string;
}): Promise<boolean> {
  const scope =
    await resolveStaffLeadAccessScope(
      session,
    );

  return (
    scope.globalAccess ||
    scope.discoveredRecordIds.has(
      discoveredRecordId,
    )
  );
}

export async function staffCanAccessOpportunityLead({
  session,
  opportunityId,
}: {
  session:
    StaffSession;

  opportunityId:
    string;
}): Promise<boolean> {
  const scope =
    await resolveStaffLeadAccessScope(
      session,
    );

  return (
    scope.globalAccess ||
    scope.opportunityIds.has(
      opportunityId,
    )
  );
}

/* ========================================================================== */
/* List batches                                                               */
/* ========================================================================== */

export async function listLeadAssignmentBatches(
  session:
    StaffSession,
): Promise<
  LeadAssignmentBatch[]
> {
  requireDistributionAdmin(
    session,
  );

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "lead_assignment_batches",
      )
      .select(
        [
          "id",
          "reference",
          "name",
          "source_kind",
          "source_file_name",
          "source_file_sha256",
          "state_code",
          "county_geoid",
          "county_name",
          "source_record_count",
          "status",
          "uploaded_by_staff_user_id",
          "created_at",
          "closed_at",
          "metadata",
        ].join(
          ", ",
        ),
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to list lead assignment batches: ${error.message}`,
    );
  }

  return (
    (
      data ??
      []
    ) as unknown as
      LeadAssignmentBatchRow[]
  ).map(
    mapBatch,
  );
}

/* ========================================================================== */
/* List assignments                                                           */
/* ========================================================================== */

export async function listLeadAssignments(
  session:
    StaffSession,
): Promise<
  LeadAssignment[]
> {
  requireLeadRead(
    session,
  );

  const admin =
    getSupabaseAdmin();

  let query =
    admin
      .from(
        "lead_assignments",
      )
      .select(
        [
          "id",
          "batch_id",
          "subject_type",
          "discovered_record_id",
          "opportunity_id",
          "assigned_to_staff_user_id",
          "assigned_by_staff_user_id",
          "assigned_at",
          "status",
          "ended_at",
          "supersedes_assignment_id",
          "note",
        ].join(
          ", ",
        ),
      )
      .order(
        "assigned_at",
        {
          ascending:
            false,
        },
      );

  if (
    !isDistributionAdmin(
      session,
    )
  ) {
    query =
      query.eq(
        "assigned_to_staff_user_id",
        session.user.id,
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw new Error(
      `Unable to list lead assignments: ${error.message}`,
    );
  }

  return (
    (
      data ??
      []
    ) as unknown as
      LeadAssignmentRow[]
  ).map(
    mapAssignment,
  );
}

/* ========================================================================== */
/* Create batch                                                               */
/* ========================================================================== */

export async function createLeadAssignmentBatch({
  session,
  reference,
  name,
  sourceKind,
  sourceFileName,
  sourceFileSha256,
  stateCode,
  countyGeoid,
  countyName,
  sourceRecordCount,
  metadata,
}: {
  session:
    StaffSession;

  reference:
    string;

  name:
    string;

  sourceKind:
    "upload" | "manual";

  sourceFileName?:
    string;

  sourceFileSha256?:
    string;

  stateCode:
    string;

  countyGeoid?:
    string;

  countyName:
    string;

  sourceRecordCount?:
    number;

  metadata?:
    Record<
      string,
      unknown
    >;
}): Promise<
  LeadAssignmentBatch
> {
  requireDistributionAdmin(
    session,
  );

  const normalizedState =
    requiredText(
      stateCode,
      "State code",
    ).toUpperCase();

  if (
    !/^[A-Z]{2}$/.test(
      normalizedState,
    )
  ) {
    throw new Error(
      "State code must contain exactly two letters.",
    );
  }

  if (
    sourceRecordCount !==
      undefined &&
    (
      !Number.isInteger(
        sourceRecordCount,
      ) ||
      sourceRecordCount <
        0
    )
  ) {
    throw new Error(
      "Source record count must be a non-negative integer.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "create_lead_assignment_batch",
      {
        p_reference:
          requiredText(
            reference,
            "Batch reference",
          ),

        p_name:
          requiredText(
            name,
            "Batch name",
          ),

        p_source_kind:
          sourceKind,

        p_source_file_name:
          optionalText(
            sourceFileName,
          ) ??
          null,

        p_source_file_sha256:
          optionalText(
            sourceFileSha256,
          )?.toLowerCase() ??
          null,

        p_state_code:
          normalizedState,

        p_county_geoid:
          optionalText(
            countyGeoid,
          ) ??
          null,

        p_county_name:
          requiredText(
            countyName,
            "County name",
          ),

        p_source_record_count:
          sourceRecordCount ??
          null,

        p_actor_staff_user_id:
          session.user.id,

        p_metadata:
          metadata ??
          {},
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
      "DueQuity could not create the lead assignment batch.",
    );
  }

  return mapBatch(
    data[0] as
      LeadAssignmentBatchRow,
  );
}

/* ========================================================================== */
/* Assign / reassign                                                          */
/* ========================================================================== */

export async function assignLeadToStaff({
  session,
  subjectType,
  recordId,
  staffUserId,
  batchId,
  note,
}: {
  session:
    StaffSession;

  subjectType:
    LeadAssignmentSubjectType;

  recordId:
    string;

  staffUserId:
    string;

  batchId?:
    string;

  note?:
    string;
}): Promise<
  LeadAssignment
> {
  requireDistributionAdmin(
    session,
  );

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "assign_lead_to_staff",
      {
        p_subject_type:
          subjectType,

        p_record_id:
          requiredText(
            recordId,
            "Lead record ID",
          ),

        p_staff_user_id:
          requiredText(
            staffUserId,
            "Staff user ID",
          ),

        p_actor_staff_user_id:
          session.user.id,

        p_batch_id:
          optionalText(
            batchId,
          ) ??
          null,

        p_occurred_at:
          null,

        p_note:
          optionalText(
            note,
          ) ??
          null,
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
      "DueQuity could not assign the lead.",
    );
  }

  return mapAssignment(
    data[0] as
      LeadAssignmentRow,
  );
}

/* ========================================================================== */
/* Unassign                                                                   */
/* ========================================================================== */

export async function unassignLeadFromStaff({
  session,
  subjectType,
  recordId,
  note,
}: {
  session:
    StaffSession;

  subjectType:
    LeadAssignmentSubjectType;

  recordId:
    string;

  note?:
    string;
}): Promise<
  LeadAssignment
> {
  requireDistributionAdmin(
    session,
  );

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "unassign_lead_from_staff",
      {
        p_subject_type:
          subjectType,

        p_record_id:
          requiredText(
            recordId,
            "Lead record ID",
          ),

        p_actor_staff_user_id:
          session.user.id,

        p_occurred_at:
          null,

        p_note:
          optionalText(
            note,
          ) ??
          null,
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
      "DueQuity could not unassign the lead.",
    );
  }

  return mapAssignment(
    data[0] as
      LeadAssignmentRow,
  );
}