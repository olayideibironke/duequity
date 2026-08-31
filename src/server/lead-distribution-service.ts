import "server-only";

import type {
  StaffSession,
} from "@/lib/session";

import {
  assignLeadToStaff,
} from "@/server/lead-assignment-service";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * ADMIN LEAD DISTRIBUTION CONTROL PLANE
 *
 * The database is the system of record for every assignment. This service
 * exposes that history to administrators and prevents an ordinary assignment
 * action from silently turning into a reassignment.
 */

/* ========================================================================== */
/* Public types                                                               */
/* ========================================================================== */

export interface LeadDistributionStaffOption {
  id: string;
  name: string;
  email: string;
  title: string;
  role: string;
  statesCleared: string[];
}

export interface LeadDistributionAssignment {
  id: string;
  staffUserId: string;
  staffName: string;
  staffEmail: string;
  assignedAt: string;
  assignedByStaffUserId: string;
  assignedByName?: string;
  assignedByEmail?: string;
  firstSeenAt?: string;
}

export interface LeadDistributionDiscoveryRecord {
  id: string;
  status: "new" | "reviewed";
  formerOwnerName: string;
  addressLine1: string;
  city: string;
  county: string;
  stateCode: string;
  postalCode?: string;
  parcelNumber?: string;
  caseNumber?: string;
  sourceName: string;
  sourceListedBalanceCents?: number;
  activeAssignment?: LeadDistributionAssignment;
}

export interface LeadDistributionSearchResult {
  query: string;
  totalMatches: number;
  records: LeadDistributionDiscoveryRecord[];
}

export interface LeadDistributionLedgerLead {
  assignmentId: string;
  recordId: string;
  formerOwnerName: string;
  addressLine1: string;
  city: string;
  county: string;
  stateCode: string;
  postalCode?: string;
  parcelNumber?: string;
  caseNumber?: string;
  assignedToStaffUserId: string;
  assignedToName: string;
  assignedToEmail: string;
  assignedByStaffUserId: string;
  assignedByName: string;
  assignedByEmail: string;
  assignedAt: string;
  status: "active" | "ended";
  endedAt?: string;
  firstSeenAt?: string;
  batchId?: string;
  batchReference?: string;
  sourceFileName?: string;
}

export interface LeadDistributionLedgerBatch {
  id: string;
  reference: string;
  county: string;
  stateCode: string;
  sourceFileName?: string;
  sourceFileSha256?: string;
  status: "active" | "closed" | "cancelled";
  createdAt: string;
  uploadedByName: string;
  uploadedByEmail: string;
  sourceRecordCount: number;
  activeAssignmentCount: number;
  endedAssignmentCount: number;
  viewedAssignmentCount: number;
  assignedTo: Array<{
    staffUserId: string;
    name: string;
    email: string;
    count: number;
  }>;
  firstAssignedAt?: string;
  lastAssignedAt?: string;
  leads: LeadDistributionLedgerLead[];
}

export interface LeadDistributionLedger {
  totalAssignmentRecords: number;
  activeAssignmentRecords: number;
  viewedActiveAssignments: number;
  batchCount: number;
  batches: LeadDistributionLedgerBatch[];
  manualAssignments: LeadDistributionLedgerLead[];
}

/* ========================================================================== */
/* Database rows                                                              */
/* ========================================================================== */

interface StaffUserRow {
  id: string;
  name: string;
  email: string;
  title: string;
  role: string;
  states_cleared: string[] | null;
  status: string;
}

interface DiscoveredRecordRow {
  id: string;
  status: string;
  former_owner_name: string;
  address_line1: string;
  city: string;
  county: string;
  state_code: string;
  postal_code: string | null;
  parcel_number: string | null;
  case_number: string | null;
  source_name: string;
  source_listed_balance_cents: number | string | null;
  promoted_opportunity_id: string | null;
}

interface LeadAssignmentRow {
  id: string;
  batch_id: string | null;
  discovered_record_id: string | null;
  assigned_to_staff_user_id: string;
  assigned_by_staff_user_id: string;
  assigned_at: string;
  status: "active" | "ended";
  ended_at: string | null;
}

interface LeadAssignmentBatchRow {
  id: string;
  reference: string;
  source_file_name: string | null;
  source_file_sha256: string | null;
  state_code: string;
  county_name: string;
  source_record_count: number | null;
  status: "active" | "closed" | "cancelled";
  uploaded_by_staff_user_id: string;
  created_at: string;
}

interface LeadReceiptRow {
  assignment_id: string;
  first_seen_at: string;
}

/* ========================================================================== */
/* Authorization                                                              */
/* ========================================================================== */

function isDistributionAdmin(
  session: StaffSession,
): boolean {
  return (
    session.user.role === "super_admin" ||
    session.user.role === "administrator"
  );
}

function requireDistributionAdmin(
  session: StaffSession,
): void {
  if (!isDistributionAdmin(session)) {
    throw new Error(
      "Only a DueQuity Administrator may distribute leads.",
    );
  }
}

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function normalizeText(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery({
  row,
  query,
}: {
  row: DiscoveredRecordRow;
  query: string;
}): boolean {
  const normalizedQuery =
    normalizeText(query);

  if (!normalizedQuery) {
    return false;
  }

  const tokens =
    normalizedQuery
      .split(" ")
      .filter(Boolean);

  const searchable =
    normalizeText(
      [
        row.id,
        row.former_owner_name,
        row.address_line1,
        row.city,
        row.county,
        row.state_code,
        row.postal_code ?? "",
        row.parcel_number ?? "",
        row.case_number ?? "",
        row.source_name,
      ].join(" "),
    );

  return tokens.every(
    (token) =>
      searchable.includes(token),
  );
}

function recordScore({
  row,
  query,
}: {
  row: DiscoveredRecordRow;
  query: string;
}): number {
  const normalizedQuery =
    normalizeText(query);

  const owner =
    normalizeText(row.former_owner_name);

  const address =
    normalizeText(row.address_line1);

  const parcel =
    normalizeText(
      row.parcel_number ?? "",
    );

  const caseNumber =
    normalizeText(
      row.case_number ?? "",
    );

  if (owner === normalizedQuery) {
    return 100;
  }

  if (
    parcel &&
    parcel === normalizedQuery
  ) {
    return 95;
  }

  if (
    caseNumber &&
    caseNumber === normalizedQuery
  ) {
    return 95;
  }

  if (address === normalizedQuery) {
    return 90;
  }

  if (
    owner.startsWith(
      normalizedQuery,
    )
  ) {
    return 80;
  }

  return 50;
}

function centsFromDatabase(
  value: number | string | null,
): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    return undefined;
  }

  return parsed;
}

function staffClearedForState({
  staff,
  stateCode,
}: {
  staff: StaffUserRow;
  stateCode: string;
}): boolean {
  const clearances =
    staff.states_cleared ?? [];

  if (clearances.length === 0) {
    return true;
  }

  return clearances
    .map(
      (value) =>
        value
          .trim()
          .toUpperCase(),
    )
    .includes(
      stateCode
        .trim()
        .toUpperCase(),
    );
}

function staffOrFallback(
  staffById: Map<string, StaffUserRow>,
  id: string,
): StaffUserRow {
  return (
    staffById.get(id) ?? {
      id,
      name: "Unknown staff",
      email: "Unknown",
      title: "Unknown",
      role: "unknown",
      states_cleared: [],
      status: "unknown",
    }
  );
}

/* ========================================================================== */
/* Staff options                                                              */
/* ========================================================================== */

export async function listLeadDistributionStaffOptions(
  session: StaffSession,
): Promise<
  LeadDistributionStaffOption[]
> {
  requireDistributionAdmin(session);

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from("staff_users")
      .select(
        [
          "id",
          "name",
          "email",
          "title",
          "role",
          "states_cleared",
          "status",
        ].join(", "),
      )
      .eq("status", "active")
      .order(
        "name",
        {
          ascending: true,
        },
      );

  if (error) {
    throw new Error(
      `Unable to load DueQuity staff for lead distribution: ${error.message}`,
    );
  }

  return (
    (
      data ?? []
    ) as unknown as
      StaffUserRow[]
  )
    .filter(
      (staff) =>
        staff.role !== "super_admin",
    )
    .map(
      (staff) => ({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        title: staff.title,
        role: staff.role,
        statesCleared:
          staff.states_cleared ?? [],
      }),
    );
}

/* ========================================================================== */
/* Search distributable Discovery leads                                      */
/* ========================================================================== */

export async function searchLeadDistributionDiscoveryRecords({
  session,
  query,
}: {
  session: StaffSession;
  query: string;
}): Promise<
  LeadDistributionSearchResult
> {
  requireDistributionAdmin(session);

  const normalizedQuery =
    query
      .trim()
      .slice(0, 200);

  if (
    normalizedQuery.length < 2
  ) {
    return {
      query: normalizedQuery,
      totalMatches: 0,
      records: [],
    };
  }

  const admin =
    getSupabaseAdmin();

  const [
    recordsResult,
    assignmentsResult,
    staffResult,
    receiptsResult,
  ] =
    await Promise.all([
      admin
        .from("discovered_records")
        .select(
          [
            "id",
            "status",
            "former_owner_name",
            "address_line1",
            "city",
            "county",
            "state_code",
            "postal_code",
            "parcel_number",
            "case_number",
            "source_name",
            "source_listed_balance_cents",
            "promoted_opportunity_id",
          ].join(", "),
        )
        .in(
          "status",
          [
            "new",
            "reviewed",
          ],
        )
        .is(
          "promoted_opportunity_id",
          null,
        )
        .limit(5000),

      admin
        .from("lead_assignments")
        .select(
          [
            "id",
            "batch_id",
            "discovered_record_id",
            "assigned_to_staff_user_id",
            "assigned_by_staff_user_id",
            "assigned_at",
            "status",
            "ended_at",
          ].join(", "),
        )
        .eq(
          "subject_type",
          "discovered_record",
        )
        .eq(
          "status",
          "active",
        ),

      admin
        .from("staff_users")
        .select(
          [
            "id",
            "name",
            "email",
            "title",
            "role",
            "states_cleared",
            "status",
          ].join(", "),
        ),

      admin
        .from("lead_assignment_receipts")
        .select(
          "assignment_id, first_seen_at",
        ),
    ]);

  if (recordsResult.error) {
    throw new Error(
      `Unable to search distributable recovery leads: ${recordsResult.error.message}`,
    );
  }

  if (assignmentsResult.error) {
    throw new Error(
      `Unable to resolve current lead assignments: ${assignmentsResult.error.message}`,
    );
  }

  if (staffResult.error) {
    throw new Error(
      `Unable to resolve assigned staff identities: ${staffResult.error.message}`,
    );
  }

  if (receiptsResult.error) {
    throw new Error(
      `Unable to resolve lead receipt status: ${receiptsResult.error.message}`,
    );
  }

  const records =
    (
      recordsResult.data ?? []
    ) as unknown as
      DiscoveredRecordRow[];

  const assignments =
    (
      assignmentsResult.data ?? []
    ) as unknown as
      LeadAssignmentRow[];

  const staffRows =
    (
      staffResult.data ?? []
    ) as unknown as
      StaffUserRow[];

  const receipts =
    (
      receiptsResult.data ?? []
    ) as unknown as
      LeadReceiptRow[];

  const staffById =
    new Map(
      staffRows.map(
        (staff) => [
          staff.id,
          staff,
        ],
      ),
    );

  const receiptByAssignmentId =
    new Map(
      receipts.map(
        (receipt) => [
          receipt.assignment_id,
          receipt.first_seen_at,
        ],
      ),
    );

  const assignmentByRecordId =
    new Map(
      assignments
        .filter(
          (assignment) =>
            Boolean(
              assignment
                .discovered_record_id,
            ),
        )
        .map(
          (assignment) => [
            assignment
              .discovered_record_id as
              string,
            assignment,
          ],
        ),
    );

  const matched =
    records
      .filter(
        (row) =>
          matchesQuery({
            row,
            query:
              normalizedQuery,
          }),
      )
      .sort(
        (left, right) =>
          recordScore({
            row: right,
            query:
              normalizedQuery,
          }) -
          recordScore({
            row: left,
            query:
              normalizedQuery,
          }),
      )
      .slice(0, 50);

  return {
    query: normalizedQuery,
    totalMatches:
      matched.length,
    records:
      matched.map(
        (row) => {
          const assignment =
            assignmentByRecordId.get(
              row.id,
            );

          const assignedStaff =
            assignment
              ? staffById.get(
                  assignment
                    .assigned_to_staff_user_id,
                )
              : undefined;

          const assigningStaff =
            assignment
              ? staffById.get(
                  assignment
                    .assigned_by_staff_user_id,
                )
              : undefined;

          return {
            id: row.id,
            status:
              row.status as
                | "new"
                | "reviewed",
            formerOwnerName:
              row.former_owner_name,
            addressLine1:
              row.address_line1,
            city: row.city,
            county: row.county,
            stateCode:
              row.state_code,
            postalCode:
              row.postal_code ??
              undefined,
            parcelNumber:
              row.parcel_number ??
              undefined,
            caseNumber:
              row.case_number ??
              undefined,
            sourceName:
              row.source_name,
            sourceListedBalanceCents:
              centsFromDatabase(
                row
                  .source_listed_balance_cents,
              ),
            activeAssignment:
              assignment &&
              assignedStaff
                ? {
                    id:
                      assignment.id,
                    staffUserId:
                      assignedStaff.id,
                    staffName:
                      assignedStaff.name,
                    staffEmail:
                      assignedStaff.email,
                    assignedAt:
                      assignment
                        .assigned_at,
                    assignedByStaffUserId:
                      assignment
                        .assigned_by_staff_user_id,
                    assignedByName:
                      assigningStaff?.name,
                    assignedByEmail:
                      assigningStaff?.email,
                    firstSeenAt:
                      receiptByAssignmentId.get(
                        assignment.id,
                      ),
                  }
                : undefined,
          };
        },
      ),
  };
}

/* ========================================================================== */
/* Distribution ledger                                                       */
/* ========================================================================== */

export async function listLeadDistributionLedger(
  session: StaffSession,
): Promise<LeadDistributionLedger> {
  requireDistributionAdmin(session);

  const admin =
    getSupabaseAdmin();

  const [
    assignmentsResult,
    batchesResult,
    staffResult,
    receiptsResult,
  ] =
    await Promise.all([
      admin
        .from("lead_assignments")
        .select(
          [
            "id",
            "batch_id",
            "discovered_record_id",
            "assigned_to_staff_user_id",
            "assigned_by_staff_user_id",
            "assigned_at",
            "status",
            "ended_at",
          ].join(", "),
        )
        .eq(
          "subject_type",
          "discovered_record",
        )
        .order(
          "assigned_at",
          {
            ascending: false,
          },
        )
        .limit(2500),

      admin
        .from("lead_assignment_batches")
        .select(
          [
            "id",
            "reference",
            "source_file_name",
            "source_file_sha256",
            "state_code",
            "county_name",
            "source_record_count",
            "status",
            "uploaded_by_staff_user_id",
            "created_at",
          ].join(", "),
        )
        .order(
          "created_at",
          {
            ascending: false,
          },
        )
        .limit(100),

      admin
        .from("staff_users")
        .select(
          [
            "id",
            "name",
            "email",
            "title",
            "role",
            "states_cleared",
            "status",
          ].join(", "),
        ),

      admin
        .from("lead_assignment_receipts")
        .select(
          "assignment_id, first_seen_at",
        ),
    ]);

  if (assignmentsResult.error) {
    throw new Error(
      `Unable to load lead distribution history: ${assignmentsResult.error.message}`,
    );
  }

  if (batchesResult.error) {
    throw new Error(
      `Unable to load lead distribution batches: ${batchesResult.error.message}`,
    );
  }

  if (staffResult.error) {
    throw new Error(
      `Unable to resolve distribution staff identities: ${staffResult.error.message}`,
    );
  }

  if (receiptsResult.error) {
    throw new Error(
      `Unable to load distribution receipt history: ${receiptsResult.error.message}`,
    );
  }

  const assignments =
    (
      assignmentsResult.data ?? []
    ) as unknown as
      LeadAssignmentRow[];

  const batches =
    (
      batchesResult.data ?? []
    ) as unknown as
      LeadAssignmentBatchRow[];

  const staffRows =
    (
      staffResult.data ?? []
    ) as unknown as
      StaffUserRow[];

  const receipts =
    (
      receiptsResult.data ?? []
    ) as unknown as
      LeadReceiptRow[];

  const recordIds =
    [
      ...new Set(
        assignments
          .map(
            (assignment) =>
              assignment
                .discovered_record_id,
          )
          .filter(
            (value): value is string =>
              Boolean(value),
          ),
      ),
    ];

  let discoveredRows:
    DiscoveredRecordRow[] = [];

  for (
    let index = 0;
    index < recordIds.length;
    index += 200
  ) {
    const chunk =
      recordIds.slice(
        index,
        index + 200,
      );

    const {
      data,
      error,
    } =
      await admin
        .from("discovered_records")
        .select(
          [
            "id",
            "status",
            "former_owner_name",
            "address_line1",
            "city",
            "county",
            "state_code",
            "postal_code",
            "parcel_number",
            "case_number",
            "source_name",
            "source_listed_balance_cents",
            "promoted_opportunity_id",
          ].join(", "),
        )
        .in(
          "id",
          chunk,
        );

    if (error) {
      throw new Error(
        `Unable to resolve distributed recovery records: ${error.message}`,
      );
    }

    discoveredRows =
      discoveredRows.concat(
        (data ?? []) as unknown as
          DiscoveredRecordRow[],
      );
  }

  const staffById =
    new Map(
      staffRows.map(
        (staff) => [
          staff.id,
          staff,
        ],
      ),
    );

  const batchById =
    new Map(
      batches.map(
        (batch) => [
          batch.id,
          batch,
        ],
      ),
    );

  const recordById =
    new Map(
      discoveredRows.map(
        (record) => [
          record.id,
          record,
        ],
      ),
    );

  const receiptByAssignmentId =
    new Map(
      receipts.map(
        (receipt) => [
          receipt.assignment_id,
          receipt.first_seen_at,
        ],
      ),
    );

  const mappedAssignments:
    LeadDistributionLedgerLead[] =
    assignments
      .filter(
        (assignment) =>
          Boolean(
            assignment
              .discovered_record_id,
          ),
      )
      .map(
        (assignment) => {
          const record =
            recordById.get(
              assignment
                .discovered_record_id as string,
            );

          const assignedTo =
            staffOrFallback(
              staffById,
              assignment
                .assigned_to_staff_user_id,
            );

          const assignedBy =
            staffOrFallback(
              staffById,
              assignment
                .assigned_by_staff_user_id,
            );

          const batch =
            assignment.batch_id
              ? batchById.get(
                  assignment.batch_id,
                )
              : undefined;

          return {
            assignmentId:
              assignment.id,
            recordId:
              assignment
                .discovered_record_id as string,
            formerOwnerName:
              record?.former_owner_name ??
              "Former owner not recorded",
            addressLine1:
              record?.address_line1 ??
              "",
            city:
              record?.city ??
              "",
            county:
              record?.county ??
              batch?.county_name ??
              "",
            stateCode:
              record?.state_code ??
              batch?.state_code ??
              "",
            postalCode:
              record?.postal_code ??
              undefined,
            parcelNumber:
              record?.parcel_number ??
              undefined,
            caseNumber:
              record?.case_number ??
              undefined,
            assignedToStaffUserId:
              assignedTo.id,
            assignedToName:
              assignedTo.name,
            assignedToEmail:
              assignedTo.email,
            assignedByStaffUserId:
              assignedBy.id,
            assignedByName:
              assignedBy.name,
            assignedByEmail:
              assignedBy.email,
            assignedAt:
              assignment.assigned_at,
            status:
              assignment.status,
            endedAt:
              assignment.ended_at ??
              undefined,
            firstSeenAt:
              receiptByAssignmentId.get(
                assignment.id,
              ),
            batchId:
              batch?.id,
            batchReference:
              batch?.reference,
            sourceFileName:
              batch?.source_file_name ??
              undefined,
          };
        },
      );

  const assignmentsByBatchId =
    new Map<
      string,
      LeadDistributionLedgerLead[]
    >();

  for (
    const assignment
    of mappedAssignments
  ) {
    if (!assignment.batchId) {
      continue;
    }

    const current =
      assignmentsByBatchId.get(
        assignment.batchId,
      ) ?? [];

    current.push(
      assignment,
    );

    assignmentsByBatchId.set(
      assignment.batchId,
      current,
    );
  }

  const ledgerBatches =
    batches.map(
      (batch) => {
        const batchAssignments =
          assignmentsByBatchId.get(
            batch.id,
          ) ?? [];

        const recipientCounts =
          new Map<
            string,
            {
              staffUserId: string;
              name: string;
              email: string;
              count: number;
            }
          >();

        for (
          const assignment
          of batchAssignments
        ) {
          const current =
            recipientCounts.get(
              assignment
                .assignedToStaffUserId,
            );

          if (current) {
            current.count += 1;
          } else {
            recipientCounts.set(
              assignment
                .assignedToStaffUserId,
              {
                staffUserId:
                  assignment
                    .assignedToStaffUserId,
                name:
                  assignment
                    .assignedToName,
                email:
                  assignment
                    .assignedToEmail,
                count: 1,
              },
            );
          }
        }

        const uploadedBy =
          staffOrFallback(
            staffById,
            batch
              .uploaded_by_staff_user_id,
          );

        const assignmentTimes =
          batchAssignments
            .map(
              (assignment) =>
                assignment
                  .assignedAt,
            )
            .sort();

        return {
          id: batch.id,
          reference:
            batch.reference,
          county:
            batch.county_name,
          stateCode:
            batch.state_code,
          sourceFileName:
            batch.source_file_name ??
            undefined,
          sourceFileSha256:
            batch.source_file_sha256 ??
            undefined,
          status:
            batch.status,
          createdAt:
            batch.created_at,
          uploadedByName:
            uploadedBy.name,
          uploadedByEmail:
            uploadedBy.email,
          sourceRecordCount:
            batch.source_record_count ??
            batchAssignments.length,
          activeAssignmentCount:
            batchAssignments.filter(
              (assignment) =>
                assignment.status ===
                "active",
            ).length,
          endedAssignmentCount:
            batchAssignments.filter(
              (assignment) =>
                assignment.status ===
                "ended",
            ).length,
          viewedAssignmentCount:
            batchAssignments.filter(
              (assignment) =>
                Boolean(
                  assignment.firstSeenAt,
                ),
            ).length,
          assignedTo:
            Array.from(
              recipientCounts.values(),
            ).sort(
              (left, right) =>
                right.count -
                left.count,
            ),
          firstAssignedAt:
            assignmentTimes[0],
          lastAssignedAt:
            assignmentTimes[
              assignmentTimes.length - 1
            ],
          leads:
            batchAssignments.sort(
              (left, right) =>
                right.assignedAt.localeCompare(
                  left.assignedAt,
                ),
            ),
        } satisfies LeadDistributionLedgerBatch;
      },
    );

  const manualAssignments =
    mappedAssignments
      .filter(
        (assignment) =>
          !assignment.batchId,
      )
      .sort(
        (left, right) =>
          right.assignedAt.localeCompare(
            left.assignedAt,
          ),
      );

  const activeAssignments =
    mappedAssignments.filter(
      (assignment) =>
        assignment.status ===
        "active",
    );

  return {
    totalAssignmentRecords:
      mappedAssignments.length,
    activeAssignmentRecords:
      activeAssignments.length,
    viewedActiveAssignments:
      activeAssignments.filter(
        (assignment) =>
          Boolean(
            assignment.firstSeenAt,
          ),
      ).length,
    batchCount:
      ledgerBatches.length,
    batches:
      ledgerBatches,
    manualAssignments,
  };
}

/* ========================================================================== */
/* Assign one unassigned Discovery lead                                      */
/* ========================================================================== */

export async function assignDiscoveryLeadFromDistribution({
  session,
  discoveredRecordId,
  staffUserId,
}: {
  session: StaffSession;
  discoveredRecordId: string;
  staffUserId: string;
}) {
  requireDistributionAdmin(session);

  const normalizedRecordId =
    discoveredRecordId.trim();

  const normalizedStaffUserId =
    staffUserId.trim();

  if (
    !normalizedRecordId ||
    !normalizedStaffUserId
  ) {
    throw new Error(
      "Lead record and staff member are required.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const [
    recordResult,
    staffResult,
    assignmentResult,
  ] =
    await Promise.all([
      admin
        .from("discovered_records")
        .select(
          [
            "id",
            "status",
            "former_owner_name",
            "county",
            "state_code",
            "promoted_opportunity_id",
          ].join(", "),
        )
        .eq(
          "id",
          normalizedRecordId,
        )
        .maybeSingle(),

      admin
        .from("staff_users")
        .select(
          [
            "id",
            "name",
            "email",
            "title",
            "role",
            "states_cleared",
            "status",
          ].join(", "),
        )
        .eq(
          "id",
          normalizedStaffUserId,
        )
        .maybeSingle(),

      admin
        .from("lead_assignments")
        .select(
          [
            "id",
            "batch_id",
            "discovered_record_id",
            "assigned_to_staff_user_id",
            "assigned_by_staff_user_id",
            "assigned_at",
            "status",
            "ended_at",
          ].join(", "),
        )
        .eq(
          "subject_type",
          "discovered_record",
        )
        .eq(
          "discovered_record_id",
          normalizedRecordId,
        )
        .eq(
          "status",
          "active",
        )
        .maybeSingle(),
    ]);

  if (
    recordResult.error ||
    !recordResult.data
  ) {
    throw new Error(
      "The selected Discovery lead could not be resolved.",
    );
  }

  if (
    staffResult.error ||
    !staffResult.data
  ) {
    throw new Error(
      "The selected DueQuity staff member could not be resolved.",
    );
  }

  if (assignmentResult.error) {
    throw new Error(
      `Unable to verify current lead ownership: ${assignmentResult.error.message}`,
    );
  }

  const record =
    recordResult.data as unknown as {
      id: string;
      status: string;
      former_owner_name: string;
      county: string;
      state_code: string;
      promoted_opportunity_id:
        string | null;
    };

  const staff =
    staffResult.data as unknown as
      StaffUserRow;

  const activeAssignment =
    assignmentResult.data as unknown as
      LeadAssignmentRow | null;

  if (
    record.status !== "new" &&
    record.status !== "reviewed"
  ) {
    throw new Error(
      "Only active Discovery-stage leads may be distributed from this screen.",
    );
  }

  if (
    record
      .promoted_opportunity_id
  ) {
    throw new Error(
      "This lead has already been promoted to an Opportunity. Assign it from the Opportunity workflow instead.",
    );
  }

  if (
    staff.status !== "active"
  ) {
    throw new Error(
      "Lead assignments require an active staff member.",
    );
  }

  if (
    staff.role === "super_admin"
  ) {
    throw new Error(
      "The Super Admin account is not an ordinary lead-assignment target.",
    );
  }

  if (
    !staffClearedForState({
      staff,
      stateCode:
        record.state_code,
    })
  ) {
    throw new Error(
      `${staff.name} is not currently cleared to work ${record.state_code} leads.`,
    );
  }

  if (activeAssignment) {
    const currentStaff =
      await admin
        .from("staff_users")
        .select("id, name, email")
        .eq(
          "id",
          activeAssignment
            .assigned_to_staff_user_id,
        )
        .maybeSingle();

    const currentName =
      currentStaff.data?.name ??
      "another staff member";

    throw new Error(
      `This lead is already actively assigned to ${currentName}. Use the explicit Reassign Lead control if ownership must change.`,
    );
  }

  return assignLeadToStaff({
    session,
    subjectType:
      "discovered_record",
    recordId:
      record.id,
    staffUserId:
      staff.id,
    note:
      `Assigned from Admin Lead Distribution: ${record.former_owner_name} · ${record.county}, ${record.state_code}`,
  });
}

/* ========================================================================== */
/* Explicit reassignment                                                     */
/* ========================================================================== */

export async function reassignDiscoveryLeadFromDistribution({
  session,
  discoveredRecordId,
  staffUserId,
  expectedCurrentAssignmentId,
}: {
  session: StaffSession;
  discoveredRecordId: string;
  staffUserId: string;
  expectedCurrentAssignmentId: string;
}) {
  requireDistributionAdmin(session);

  const admin =
    getSupabaseAdmin();

  const recordId =
    discoveredRecordId.trim();

  const targetStaffId =
    staffUserId.trim();

  const expectedAssignmentId =
    expectedCurrentAssignmentId.trim();

  if (
    !recordId ||
    !targetStaffId ||
    !expectedAssignmentId
  ) {
    throw new Error(
      "Lead, current assignment, and replacement staff member are required.",
    );
  }

  const [
    recordResult,
    targetResult,
    currentResult,
  ] =
    await Promise.all([
      admin
        .from("discovered_records")
        .select(
          "id, former_owner_name, county, state_code, promoted_opportunity_id",
        )
        .eq(
          "id",
          recordId,
        )
        .maybeSingle(),

      admin
        .from("staff_users")
        .select(
          "id, name, email, title, role, states_cleared, status",
        )
        .eq(
          "id",
          targetStaffId,
        )
        .maybeSingle(),

      admin
        .from("lead_assignments")
        .select(
          "id, batch_id, discovered_record_id, assigned_to_staff_user_id, assigned_by_staff_user_id, assigned_at, status, ended_at",
        )
        .eq(
          "subject_type",
          "discovered_record",
        )
        .eq(
          "discovered_record_id",
          recordId,
        )
        .eq(
          "status",
          "active",
        )
        .maybeSingle(),
    ]);

  if (
    recordResult.error ||
    !recordResult.data
  ) {
    throw new Error(
      "The recovery lead could not be resolved.",
    );
  }

  if (
    targetResult.error ||
    !targetResult.data
  ) {
    throw new Error(
      "The replacement staff member could not be resolved.",
    );
  }

  if (
    currentResult.error ||
    !currentResult.data
  ) {
    throw new Error(
      "This lead no longer has the active assignment shown on screen. Refresh before reassigning.",
    );
  }

  const record =
    recordResult.data as unknown as {
      id: string;
      former_owner_name: string;
      county: string;
      state_code: string;
      promoted_opportunity_id:
        string | null;
    };

  const target =
    targetResult.data as unknown as
      StaffUserRow;

  const current =
    currentResult.data as unknown as
      LeadAssignmentRow;

  if (
    current.id !==
    expectedAssignmentId
  ) {
    throw new Error(
      "The lead assignment changed after this page loaded. Refresh before reassigning.",
    );
  }

  if (
    current
      .assigned_to_staff_user_id ===
    target.id
  ) {
    throw new Error(
      "The selected staff member already owns this lead.",
    );
  }

  if (
    target.status !== "active" ||
    target.role === "super_admin"
  ) {
    throw new Error(
      "Select an active ordinary DueQuity staff account for reassignment.",
    );
  }

  if (
    !staffClearedForState({
      staff: target,
      stateCode:
        record.state_code,
    })
  ) {
    throw new Error(
      `${target.name} is not currently cleared to work ${record.state_code} leads.`,
    );
  }

  if (
    record
      .promoted_opportunity_id
  ) {
    throw new Error(
      "This recovery has already moved to Opportunity. Reassign it from the Opportunity workflow.",
    );
  }

  const currentStaffResult =
    await admin
      .from("staff_users")
      .select("id, name, email")
      .eq(
        "id",
        current
          .assigned_to_staff_user_id,
      )
      .maybeSingle();

  const previousName =
    currentStaffResult.data?.name ??
    current
      .assigned_to_staff_user_id;

  const {
    data,
    error,
  } =
    await admin.rpc(
      "reassign_discovered_lead_explicit",
      {
        p_record_id:
          record.id,
        p_expected_assignment_id:
          expectedAssignmentId,
        p_staff_user_id:
          target.id,
        p_actor_staff_user_id:
          session.user.id,
        p_note:
          `Explicit Admin reassignment from ${previousName} to ${target.name}: ${record.former_owner_name} · ${record.county}, ${record.state_code}`,
      },
    );

  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 1
  ) {
    throw new Error(
      error?.message ??
      "DueQuity could not complete the explicit lead reassignment.",
    );
  }

  return data[0];
}