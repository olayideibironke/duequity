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
 * ADMIN LEAD DISTRIBUTION
 *
 * This service powers the Admin-side distribution workspace.
 *
 * Security model:
 *
 * - Super Admin / Administrator may distribute leads.
 * - Ordinary staff cannot call these operations.
 * - Assignment is to an exact recovery record, not an entire county.
 * - Staff state clearance is checked separately from assignment.
 *
 * A staff member may be nationally cleared while still seeing only the exact
 * leads assigned to them.
 */

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export interface LeadDistributionStaffOption {
  id:
    string;

  name:
    string;

  email:
    string;

  title:
    string;

  role:
    string;

  statesCleared:
    string[];
}

export interface LeadDistributionAssignment {
  id:
    string;

  staffUserId:
    string;

  staffName:
    string;

  staffEmail:
    string;

  assignedAt:
    string;

  assignedByStaffUserId:
    string;
}

export interface LeadDistributionDiscoveryRecord {
  id:
    string;

  status:
    "new" | "reviewed";

  formerOwnerName:
    string;

  addressLine1:
    string;

  city:
    string;

  county:
    string;

  stateCode:
    string;

  postalCode?:
    string;

  parcelNumber?:
    string;

  caseNumber?:
    string;

  sourceName:
    string;

  sourceListedBalanceCents?:
    number;

  activeAssignment?:
    LeadDistributionAssignment;
}

export interface LeadDistributionSearchResult {
  query:
    string;

  totalMatches:
    number;

  records:
    LeadDistributionDiscoveryRecord[];
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface StaffUserRow {
  id:
    string;

  name:
    string;

  email:
    string;

  title:
    string;

  role:
    string;

  states_cleared:
    string[] | null;

  status:
    string;
}

interface DiscoveredRecordRow {
  id:
    string;

  status:
    string;

  former_owner_name:
    string;

  address_line1:
    string;

  city:
    string;

  county:
    string;

  state_code:
    string;

  postal_code:
    string | null;

  parcel_number:
    string | null;

  case_number:
    string | null;

  source_name:
    string;

  source_listed_balance_cents:
    number | string | null;

  promoted_opportunity_id:
    string | null;
}

interface LeadAssignmentRow {
  id:
    string;

  discovered_record_id:
    string | null;

  assigned_to_staff_user_id:
    string;

  assigned_by_staff_user_id:
    string;

  assigned_at:
    string;

  status:
    string;
}

/* ========================================================================== */
/* Authorization                                                               */
/* ========================================================================== */

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
      "Only a DueQuity Administrator may distribute leads.",
    );
  }
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function normalizeText(
  value:
    string,
): string {
  return value
    .normalize(
      "NFKD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function matchesQuery({
  row,
  query,
}: {
  row:
    DiscoveredRecordRow;

  query:
    string;
}): boolean {
  const normalizedQuery =
    normalizeText(
      query,
    );

  if (!normalizedQuery) {
    return false;
  }

  const tokens =
    normalizedQuery
      .split(
        " ",
      )
      .filter(
        Boolean,
      );

  const searchable =
    normalizeText(
      [
        row.id,
        row.former_owner_name,
        row.address_line1,
        row.city,
        row.county,
        row.state_code,
        row.postal_code ??
          "",
        row.parcel_number ??
          "",
        row.case_number ??
          "",
        row.source_name,
      ].join(
        " ",
      ),
    );

  return tokens.every(
    (
      token,
    ) =>
      searchable.includes(
        token,
      ),
  );
}

function recordScore({
  row,
  query,
}: {
  row:
    DiscoveredRecordRow;

  query:
    string;
}): number {
  const normalizedQuery =
    normalizeText(
      query,
    );

  const owner =
    normalizeText(
      row.former_owner_name,
    );

  const address =
    normalizeText(
      row.address_line1,
    );

  const parcel =
    normalizeText(
      row.parcel_number ??
        "",
    );

  const caseNumber =
    normalizeText(
      row.case_number ??
        "",
    );

  if (
    owner ===
    normalizedQuery
  ) {
    return 100;
  }

  if (
    parcel &&
    parcel ===
      normalizedQuery
  ) {
    return 95;
  }

  if (
    caseNumber &&
    caseNumber ===
      normalizedQuery
  ) {
    return 95;
  }

  if (
    address ===
    normalizedQuery
  ) {
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
  value:
    number | string | null,
): number | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  const parsed =
    Number(
      value,
    );

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed <
      0
  ) {
    return undefined;
  }

  return parsed;
}

function staffClearedForState({
  staff,
  stateCode,
}: {
  staff:
    StaffUserRow;

  stateCode:
    string;
}): boolean {
  const clearances =
    staff.states_cleared ??
    [];

  /*
   * DueQuity's existing convention:
   *
   * Empty clearance list means the role is intentionally cleared nationally.
   */
  if (
    clearances.length ===
    0
  ) {
    return true;
  }

  return clearances
    .map(
      (
        value,
      ) =>
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

/* ========================================================================== */
/* Staff options                                                               */
/* ========================================================================== */

export async function listLeadDistributionStaffOptions(
  session:
    StaffSession,
): Promise<
  LeadDistributionStaffOption[]
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
        "staff_users",
      )
      .select(
        [
          "id",
          "name",
          "email",
          "title",
          "role",
          "states_cleared",
          "status",
        ].join(
          ", ",
        ),
      )
      .eq(
        "status",
        "active",
      )
      .order(
        "name",
        {
          ascending:
            true,
        },
      );

  if (error) {
    throw new Error(
      `Unable to load DueQuity staff for lead distribution: ${error.message}`,
    );
  }

  return (
    (
      data ??
      []
    ) as unknown as
      StaffUserRow[]
  )
    .filter(
      (
        staff,
      ) =>
        staff.role !==
          "super_admin" &&
        staff.role !==
          "administrator",
    )
    .map(
      (
        staff,
      ) => ({
        id:
          staff.id,

        name:
          staff.name,

        email:
          staff.email,

        title:
          staff.title,

        role:
          staff.role,

        statesCleared:
          staff.states_cleared ??
          [],
      }),
    );
}

/* ========================================================================== */
/* Search distributable Discovery leads                                        */
/* ========================================================================== */

export async function searchLeadDistributionDiscoveryRecords({
  session,
  query,
}: {
  session:
    StaffSession;

  query:
    string;
}): Promise<
  LeadDistributionSearchResult
> {
  requireDistributionAdmin(
    session,
  );

  const normalizedQuery =
    query
      .trim()
      .slice(
        0,
        200,
      );

  if (
    normalizedQuery.length <
    2
  ) {
    return {
      query:
        normalizedQuery,

      totalMatches:
        0,

      records:
        [],
    };
  }

  const admin =
    getSupabaseAdmin();

  const [
    recordsResult,
    assignmentsResult,
    staffResult,
  ] =
    await Promise.all([
      admin
        .from(
          "discovered_records",
        )
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
          ].join(
            ", ",
          ),
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
        .limit(
          5000,
        ),

      admin
        .from(
          "lead_assignments",
        )
        .select(
          [
            "id",
            "discovered_record_id",
            "assigned_to_staff_user_id",
            "assigned_by_staff_user_id",
            "assigned_at",
            "status",
          ].join(
            ", ",
          ),
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
        .from(
          "staff_users",
        )
        .select(
          [
            "id",
            "name",
            "email",
            "title",
            "role",
            "states_cleared",
            "status",
          ].join(
            ", ",
          ),
        ),
    ]);

  if (
    recordsResult.error
  ) {
    throw new Error(
      `Unable to search distributable recovery leads: ${recordsResult.error.message}`,
    );
  }

  if (
    assignmentsResult.error
  ) {
    throw new Error(
      `Unable to resolve current lead assignments: ${assignmentsResult.error.message}`,
    );
  }

  if (
    staffResult.error
  ) {
    throw new Error(
      `Unable to resolve assigned staff identities: ${staffResult.error.message}`,
    );
  }

  const records =
    (
      recordsResult.data ??
      []
    ) as unknown as
      DiscoveredRecordRow[];

  const assignments =
    (
      assignmentsResult.data ??
      []
    ) as unknown as
      LeadAssignmentRow[];

  const staffRows =
    (
      staffResult.data ??
      []
    ) as unknown as
      StaffUserRow[];

  const staffById =
    new Map(
      staffRows.map(
        (
          staff,
        ) => [
          staff.id,
          staff,
        ],
      ),
    );

  const assignmentByRecordId =
    new Map(
      assignments
        .filter(
          (
            assignment,
          ) =>
            Boolean(
              assignment.discovered_record_id,
            ),
        )
        .map(
          (
            assignment,
          ) => [
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
        (
          row,
        ) =>
          matchesQuery({
            row,

            query:
              normalizedQuery,
          }),
      )
      .sort(
        (
          left,
          right,
        ) =>
          recordScore({
            row:
              right,

            query:
              normalizedQuery,
          }) -
          recordScore({
            row:
              left,

            query:
              normalizedQuery,
          }),
      )
      .slice(
        0,
        50,
      );

  return {
    query:
      normalizedQuery,

    totalMatches:
      matched.length,

    records:
      matched.map(
        (
          row,
        ) => {
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

          return {
            id:
              row.id,

            status:
              row.status as
                "new" |
                "reviewed",

            formerOwnerName:
              row.former_owner_name,

            addressLine1:
              row.address_line1,

            city:
              row.city,

            county:
              row.county,

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
                row.source_listed_balance_cents,
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
                      assignment.assigned_at,

                    assignedByStaffUserId:
                      assignment
                        .assigned_by_staff_user_id,
                  }
                : undefined,
          };
        },
      ),
  };
}

/* ========================================================================== */
/* Assign one existing Discovery lead                                          */
/* ========================================================================== */

export async function assignDiscoveryLeadFromDistribution({
  session,
  discoveredRecordId,
  staffUserId,
}: {
  session:
    StaffSession;

  discoveredRecordId:
    string;

  staffUserId:
    string;
}) {
  requireDistributionAdmin(
    session,
  );

  const normalizedRecordId =
    discoveredRecordId
      .trim();

  const normalizedStaffUserId =
    staffUserId
      .trim();

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
  ] =
    await Promise.all([
      admin
        .from(
          "discovered_records",
        )
        .select(
          [
            "id",
            "status",
            "former_owner_name",
            "county",
            "state_code",
            "promoted_opportunity_id",
          ].join(
            ", ",
          ),
        )
        .eq(
          "id",
          normalizedRecordId,
        )
        .maybeSingle(),

      admin
        .from(
          "staff_users",
        )
        .select(
          [
            "id",
            "name",
            "email",
            "title",
            "role",
            "states_cleared",
            "status",
          ].join(
            ", ",
          ),
        )
        .eq(
          "id",
          normalizedStaffUserId,
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

  const record =
    recordResult.data as unknown as {
      id:
        string;

      status:
        string;

      former_owner_name:
        string;

      county:
        string;

      state_code:
        string;

      promoted_opportunity_id:
        string | null;
    };

  const staff =
    staffResult.data as unknown as
      StaffUserRow;

  if (
    record.status !==
      "new" &&
    record.status !==
      "reviewed"
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
    staff.status !==
      "active"
  ) {
    throw new Error(
      "Lead assignments require an active staff member.",
    );
  }

  if (
    staff.role ===
      "super_admin" ||
    staff.role ===
      "administrator"
  ) {
    throw new Error(
      "Admin accounts do not need ordinary lead assignments.",
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