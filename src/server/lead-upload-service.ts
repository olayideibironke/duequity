import "server-only";

import {
  createHash,
  randomUUID,
} from "node:crypto";

import readExcelFile from "read-excel-file/node";

import type {
  StaffSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Public types                                                               */
/* ========================================================================== */

export interface LeadWorkbookConflict {
  recordId: string;
  formerOwnerName: string;
  county: string;
  stateCode: string;
  assignedStaffUserId: string;
  assignedStaffName: string;
  assignedStaffEmail: string;
  assignedAt: string;
}

export interface LeadWorkbookUnavailableRow {
  recordId: string;
  formerOwnerName: string;
  status: string;
  reason: string;
}

export interface LeadWorkbookDuplicateBatch {
  batchId: string;
  batchReference: string;
  county: string;
  stateCode: string;
  sourceFileName?: string;
  createdAt: string;
  uploadedByName: string;
  uploadedByEmail: string;
}

export interface LeadWorkbookPreflight {
  fileName: string;
  fileSha256: string;
  sheetName: string;
  county: string;
  stateCode: string;
  staffUserId: string;
  staffName: string;
  staffEmail: string;
  sourceRowCount: number;
  availableRowCount: number;
  alreadyAssignedRowCount: number;
  unavailableRowCount: number;
  duplicateWorkbook?: LeadWorkbookDuplicateBatch;
  conflicts: LeadWorkbookConflict[];
  unavailableRows: LeadWorkbookUnavailableRow[];
  canAssign: boolean;
  confirmationKey: string;
}

export interface LeadWorkbookUploadResult {
  batchId: string;
  batchReference: string;
  fileName: string;
  sheetName: string;
  county: string;
  stateCode: string;
  assignedStaffUserId: string;
  assignedStaffName: string;
  sourceRowCount: number;
  assignedRowCount: number;
  skippedRowCount: number;
  skippedRecordIds: string[];
}

/* ========================================================================== */
/* Internal types                                                             */
/* ========================================================================== */

interface ParsedWorkbookRow {
  rowNumber: number;
  discoveredRecordId: string;
  county: string;
  stateCode: string;
  sourceRowSnapshot:
    Record<string, string>;
}

interface DiscoveredRecordRow {
  id: string;
  status: string;
  former_owner_name: string;
  county: string;
  state_code: string;
  promoted_opportunity_id:
    string | null;
}

interface StaffUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  states_cleared:
    string[] | null;
}

interface ExistingAssignmentRow {
  id: string;
  discovered_record_id: string | null;
  assigned_to_staff_user_id: string;
  assigned_at: string;
}

interface ExistingBatchRow {
  id: string;
  reference: string;
  source_file_name: string | null;
  state_code: string;
  county_name: string;
  uploaded_by_staff_user_id: string;
  created_at: string;
}

interface CreatedBatchRow {
  id: string;
  reference: string;
}

interface WorkbookSheet {
  sheet: string;
  data: unknown[][];
}

interface WorkbookInspection {
  fileName: string;
  fileSha256: string;
  sheetName: string;
  headerRowNumber: number;
  headers: string[];
  parsedRows: ParsedWorkbookRow[];
  stateCode: string;
  county: string;
  staff: StaffUserRow;
  discoveredById:
    Map<string, DiscoveredRecordRow>;
  availableRows: ParsedWorkbookRow[];
  unavailableRows:
    LeadWorkbookUnavailableRow[];
  conflicts:
    LeadWorkbookConflict[];
  duplicateWorkbook?:
    LeadWorkbookDuplicateBatch;
  confirmationKey: string;
}

/* ========================================================================== */
/* Authorization                                                              */
/* ========================================================================== */

function requireDistributionAdmin(
  session: StaffSession,
): void {
  if (
    session.user.role !== "super_admin" &&
    session.user.role !== "administrator"
  ) {
    throw new Error(
      "Only a DueQuity Administrator may upload and distribute lead workbooks.",
    );
  }
}

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function normalizeHeader(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeState(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase();
}

function normalizeCounty(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sheetCellText(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    typeof value === "string"
  ) {
    return value
      .trim()
      .replace(/\s+/g, " ");
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return String(value)
    .trim()
    .replace(/\s+/g, " ");
}

function fileNameFromUpload(
  file: File,
): string {
  const name =
    file.name.trim();

  if (!name) {
    throw new Error(
      "Uploaded workbook must have a file name.",
    );
  }

  if (
    !name
      .toLowerCase()
      .endsWith(".xlsx")
  ) {
    throw new Error(
      "DueQuity lead upload currently supports .xlsx Excel workbooks only.",
    );
  }

  return name;
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

  if (
    clearances.length === 0
  ) {
    return true;
  }

  return clearances
    .map(normalizeState)
    .includes(
      normalizeState(stateCode),
    );
}

function buildBatchReference({
  stateCode,
  county,
}: {
  stateCode: string;
  county: string;
}): string {
  const date =
    new Date();

  const datePart =
    [
      date.getUTCFullYear(),
      String(
        date.getUTCMonth() + 1,
      ).padStart(2, "0"),
      String(
        date.getUTCDate(),
      ).padStart(2, "0"),
    ].join("");

  const countyPart =
    county
      .toUpperCase()
      .replace(
        /[^A-Z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )
      .slice(0, 24);

  return [
    "LAB",
    stateCode,
    countyPart,
    datePart,
    randomUUID()
      .replaceAll("-", "")
      .slice(0, 8)
      .toUpperCase(),
  ].join("-");
}

function confirmationKeyFor({
  fileSha256,
  staffUserId,
  availableRows,
  conflicts,
  unavailableRows,
  duplicateBatchId,
}: {
  fileSha256: string;
  staffUserId: string;
  availableRows: ParsedWorkbookRow[];
  conflicts: LeadWorkbookConflict[];
  unavailableRows:
    LeadWorkbookUnavailableRow[];
  duplicateBatchId?: string;
}): string {
  const snapshot = {
    fileSha256,
    staffUserId,
    availableRecordIds:
      availableRows
        .map(
          (row) =>
            row.discoveredRecordId,
        )
        .sort(),
    conflictingRecordIds:
      conflicts
        .map(
          (row) =>
            `${row.recordId}:${row.assignedStaffUserId}`,
        )
        .sort(),
    unavailableRecordIds:
      unavailableRows
        .map(
          (row) =>
            `${row.recordId}:${row.status}`,
        )
        .sort(),
    duplicateBatchId:
      duplicateBatchId ??
      null,
  };

  return createHash("sha256")
    .update(
      JSON.stringify(snapshot),
      "utf8",
    )
    .digest("hex");
}

/* ========================================================================== */
/* Workbook parsing                                                           */
/* ========================================================================== */

function findHeaderRow(
  rows: unknown[][],
): {
  rowIndex: number;
  rowNumber: number;
  headers: string[];
} {
  const scanLimit =
    Math.min(
      rows.length,
      25,
    );

  for (
    let rowIndex = 0;
    rowIndex < scanLimit;
    rowIndex += 1
  ) {
    const row =
      rows[rowIndex] ?? [];

    const headers =
      row.map(
        (value) =>
          normalizeHeader(
            sheetCellText(value),
          ),
      );

    const normalized =
      new Set(
        headers.map(
          (value) =>
            value.toLowerCase(),
        ),
      );

    if (
      normalized.has(
        "duequity record id",
      ) &&
      normalized.has(
        "county",
      ) &&
      normalized.has(
        "state",
      )
    ) {
      return {
        rowIndex,
        rowNumber:
          rowIndex + 1,
        headers,
      };
    }
  }

  throw new Error(
    'DueQuity could not find the required workbook headers "DueQuity Record ID", "County", and "State".',
  );
}

function parseWorkbookRows({
  rows,
  headerRowIndex,
  headers,
}: {
  rows: unknown[][];
  headerRowIndex: number;
  headers: string[];
}): ParsedWorkbookRow[] {
  const headerIndex =
    new Map<string, number>();

  headers.forEach(
    (
      header,
      index,
    ) => {
      if (header) {
        headerIndex.set(
          header.toLowerCase(),
          index,
        );
      }
    },
  );

  const idColumn =
    headerIndex.get(
      "duequity record id",
    );

  const countyColumn =
    headerIndex.get(
      "county",
    );

  const stateColumn =
    headerIndex.get(
      "state",
    );

  if (
    idColumn === undefined ||
    countyColumn === undefined ||
    stateColumn === undefined
  ) {
    throw new Error(
      "The uploaded workbook is missing required DueQuity lead columns.",
    );
  }

  const parsedRows:
    ParsedWorkbookRow[] = [];

  for (
    let rowIndex =
      headerRowIndex + 1;
    rowIndex <
      rows.length;
    rowIndex += 1
  ) {
    const row =
      rows[rowIndex] ?? [];

    const discoveredRecordId =
      sheetCellText(
        row[idColumn],
      );

    const county =
      sheetCellText(
        row[countyColumn],
      );

    const stateCode =
      normalizeState(
        sheetCellText(
          row[stateColumn],
        ),
      );

    const anyContent =
      headers.some(
        (
          header,
          index,
        ) =>
          Boolean(
            header &&
            sheetCellText(
              row[index],
            ),
          ),
      );

    if (!anyContent) {
      continue;
    }

    const excelRowNumber =
      rowIndex + 1;

    if (
      !discoveredRecordId
    ) {
      throw new Error(
        `Excel row ${excelRowNumber} contains lead data but no DueQuity Record ID.`,
      );
    }

    if (!county) {
      throw new Error(
        `Excel row ${excelRowNumber} is missing County.`,
      );
    }

    if (
      !/^[A-Z]{2}$/.test(
        stateCode,
      )
    ) {
      throw new Error(
        `Excel row ${excelRowNumber} has an invalid State value.`,
      );
    }

    const sourceRowSnapshot:
      Record<string, string> =
      {};

    headers.forEach(
      (
        header,
        index,
      ) => {
        if (!header) {
          return;
        }

        sourceRowSnapshot[
          header
        ] =
          sheetCellText(
            row[index],
          );
      },
    );

    parsedRows.push({
      rowNumber:
        excelRowNumber,
      discoveredRecordId,
      county,
      stateCode,
      sourceRowSnapshot,
    });
  }

  if (
    parsedRows.length ===
    0
  ) {
    throw new Error(
      "The uploaded workbook contains no lead rows.",
    );
  }

  return parsedRows;
}

async function readWorkbookSheets(
  bytes: Buffer,
): Promise<
  WorkbookSheet[]
> {
  try {
    const sheets =
      await readExcelFile(
        bytes,
      );

    if (
      !Array.isArray(
        sheets,
      ) ||
      sheets.length === 0
    ) {
      throw new Error(
        "No worksheets were found.",
      );
    }

    return sheets.map(
      (sheet) => ({
        sheet:
          String(
            sheet.sheet,
          ),
        data:
          sheet.data as unknown[][],
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message.trim()
        ? error.message
        : "Unknown XLSX parsing error.";

    throw new Error(
      `DueQuity could not read this Excel workbook: ${message}`,
    );
  }
}

/* ========================================================================== */
/* Chunked database reads                                                     */
/* ========================================================================== */

async function loadDiscoveredRecords(
  recordIds: string[],
): Promise<
  DiscoveredRecordRow[]
> {
  const admin =
    getSupabaseAdmin();

  let rows:
    DiscoveredRecordRow[] =
    [];

  for (
    let index = 0;
    index <
      recordIds.length;
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
          ].join(", "),
        )
        .in(
          "id",
          chunk,
        );

    if (error) {
      throw new Error(
        `Unable to verify workbook recovery records: ${error.message}`,
      );
    }

    rows =
      rows.concat(
        (data ??
          []) as unknown as
          DiscoveredRecordRow[],
      );
  }

  return rows;
}

async function loadActiveAssignments(
  recordIds: string[],
): Promise<
  ExistingAssignmentRow[]
> {
  const admin =
    getSupabaseAdmin();

  let rows:
    ExistingAssignmentRow[] =
    [];

  for (
    let index = 0;
    index <
      recordIds.length;
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
        .from(
          "lead_assignments",
        )
        .select(
          "id, discovered_record_id, assigned_to_staff_user_id, assigned_at",
        )
        .eq(
          "subject_type",
          "discovered_record",
        )
        .eq(
          "status",
          "active",
        )
        .in(
          "discovered_record_id",
          chunk,
        );

    if (error) {
      throw new Error(
        `Unable to verify existing lead assignments: ${error.message}`,
      );
    }

    rows =
      rows.concat(
        (data ??
          []) as unknown as
          ExistingAssignmentRow[],
      );
  }

  return rows;
}

/* ========================================================================== */
/* Inspection core                                                            */
/* ========================================================================== */

async function inspectLeadWorkbook({
  session,
  file,
  staffUserId,
}: {
  session: StaffSession;
  file: File;
  staffUserId: string;
}): Promise<
  WorkbookInspection
> {
  requireDistributionAdmin(
    session,
  );

  const normalizedStaffUserId =
    staffUserId.trim();

  if (
    !normalizedStaffUserId
  ) {
    throw new Error(
      "Select the staff member who should receive this lead workbook.",
    );
  }

  const fileName =
    fileNameFromUpload(
      file,
    );

  if (
    file.size <= 0
  ) {
    throw new Error(
      "The uploaded workbook is empty.",
    );
  }

  if (
    file.size >
    15 * 1024 * 1024
  ) {
    throw new Error(
      "Lead workbook exceeds the 15 MB upload limit.",
    );
  }

  const arrayBuffer =
    await file.arrayBuffer();

  const bytes =
    Buffer.from(
      arrayBuffer,
    );

  const fileSha256 =
    createHash(
      "sha256",
    )
      .update(bytes)
      .digest("hex");

  const workbookSheets =
    await readWorkbookSheets(
      bytes,
    );

  const worksheet =
    workbookSheets.find(
      (sheet) =>
        sheet.sheet ===
        "Surplus Records",
    ) ??
    workbookSheets[0];

  if (!worksheet) {
    throw new Error(
      "The uploaded workbook does not contain a worksheet.",
    );
  }

  const {
    rowIndex:
      headerRowIndex,
    rowNumber:
      headerRowNumber,
    headers,
  } =
    findHeaderRow(
      worksheet.data,
    );

  const parsedRows =
    parseWorkbookRows({
      rows:
        worksheet.data,
      headerRowIndex,
      headers,
    });

  const stateCodes =
    Array.from(
      new Set(
        parsedRows.map(
          (row) =>
            normalizeState(
              row.stateCode,
            ),
        ),
      ),
    );

  const counties =
    Array.from(
      new Set(
        parsedRows.map(
          (row) =>
            normalizeCounty(
              row.county,
            ),
        ),
      ),
    );

  if (
    stateCodes.length !==
      1 ||
    counties.length !== 1
  ) {
    throw new Error(
      "Each uploaded lead workbook must contain exactly one county and one state.",
    );
  }

  const stateCode =
    stateCodes[0];

  const county =
    parsedRows[0]
      .county
      .trim();

  const recordIds =
    Array.from(
      new Set(
        parsedRows.map(
          (row) =>
            row.discoveredRecordId,
        ),
      ),
    );

  if (
    recordIds.length !==
    parsedRows.length
  ) {
    throw new Error(
      "The workbook contains duplicate DueQuity Record IDs.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const [
    staffResult,
    discoveredRowsRaw,
    activeAssignmentsRaw,
    duplicateBatchResult,
  ] =
    await Promise.all([
      admin
        .from(
          "staff_users",
        )
        .select(
          "id, name, email, role, status, states_cleared",
        )
        .eq(
          "id",
          normalizedStaffUserId,
        )
        .maybeSingle(),

      loadDiscoveredRecords(
        recordIds,
      ),

      loadActiveAssignments(
        recordIds,
      ),

      admin
        .from(
          "lead_assignment_batches",
        )
        .select(
          "id, reference, source_file_name, state_code, county_name, uploaded_by_staff_user_id, created_at",
        )
        .eq(
          "source_file_sha256",
          fileSha256,
        )
        .neq(
          "status",
          "cancelled",
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(1)
        .maybeSingle(),
    ]);

  const discoveredRows =
    discoveredRowsRaw as
      DiscoveredRecordRow[];

  const activeAssignments =
    activeAssignmentsRaw as
      ExistingAssignmentRow[];

  if (
    staffResult.error ||
    !staffResult.data
  ) {
    throw new Error(
      "The selected DueQuity staff member could not be resolved.",
    );
  }

  if (
    duplicateBatchResult.error
  ) {
    throw new Error(
      `Unable to verify prior workbook history: ${duplicateBatchResult.error.message}`,
    );
  }

  const staff =
    staffResult.data as unknown as
      StaffUserRow;

  if (
    staff.status !==
    "active"
  ) {
    throw new Error(
      "Lead workbooks may only be assigned to an active staff member.",
    );
  }

  if (
    staff.role ===
    "super_admin"
  ) {
    throw new Error(
      "The Super Admin account is not an ordinary lead-workbook assignment target.",
    );
  }

  if (
    !staffClearedForState({
      staff,
      stateCode,
    })
  ) {
    throw new Error(
      `${staff.name} is not currently cleared to work ${stateCode} leads.`,
    );
  }

  const discoveredById =
    new Map(
      discoveredRows.map(
        (record) => [
          record.id,
          record,
        ],
      ),
    );

  const missingRecordIds =
    recordIds.filter(
      (id) =>
        !discoveredById.has(
          id,
        ),
    );

  if (
    missingRecordIds.length >
    0
  ) {
    throw new Error(
      `Workbook contains ${missingRecordIds.length} DueQuity Record ID${
        missingRecordIds.length ===
        1
          ? ""
          : "s"
      } that do not exist in the current recovery database.`,
    );
  }

  for (
    const parsedRow
    of parsedRows
  ) {
    const record =
      discoveredById.get(
        parsedRow
          .discoveredRecordId,
      );

    if (!record) {
      continue;
    }

    if (
      normalizeState(
        record.state_code,
      ) !== stateCode ||
      normalizeCounty(
        record.county,
      ) !==
        normalizeCounty(
          county,
        )
    ) {
      throw new Error(
        `DueQuity record ${record.id} does not match the county/state shown in the uploaded workbook.`,
      );
    }
  }

  const staffIds =
    [
      ...new Set(
        activeAssignments.map(
          (assignment) =>
            assignment
              .assigned_to_staff_user_id,
        ),
      ),
    ];

  const staffById =
    new Map<
      string,
      {
        name: string;
        email: string;
      }
    >();

  if (
    staffIds.length > 0
  ) {
    const {
      data,
      error,
    } =
      await admin
        .from(
          "staff_users",
        )
        .select(
          "id, name, email",
        )
        .in(
          "id",
          staffIds,
        );

    if (error) {
      throw new Error(
        `Unable to resolve existing lead owners: ${error.message}`,
      );
    }

    for (
      const row
      of data ?? []
    ) {
      staffById.set(
        String(
          row.id,
        ),
        {
          name:
            String(
              row.name,
            ),
          email:
            String(
              row.email,
            ),
        },
      );
    }
  }

  const assignmentByRecordId =
    new Map(
      activeAssignments
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
              .discovered_record_id as string,
            assignment,
          ],
        ),
    );

  const conflicts:
    LeadWorkbookConflict[] =
    [];

  const unavailableRows:
    LeadWorkbookUnavailableRow[] =
    [];

  const availableRows:
    ParsedWorkbookRow[] =
    [];

  for (
    const parsedRow
    of parsedRows
  ) {
    const record =
      discoveredById.get(
        parsedRow
          .discoveredRecordId,
      );

    if (!record) {
      continue;
    }

    const existingAssignment =
      assignmentByRecordId.get(
        record.id,
      );

    if (
      existingAssignment
    ) {
      const owner =
        staffById.get(
          existingAssignment
            .assigned_to_staff_user_id,
        );

      conflicts.push({
        recordId:
          record.id,
        formerOwnerName:
          record
            .former_owner_name,
        county:
          record.county,
        stateCode:
          record.state_code,
        assignedStaffUserId:
          existingAssignment
            .assigned_to_staff_user_id,
        assignedStaffName:
          owner?.name ??
          "Unknown staff",
        assignedStaffEmail:
          owner?.email ??
          "Unknown",
        assignedAt:
          existingAssignment
            .assigned_at,
      });

      continue;
    }

    if (
      record.status !==
        "new" &&
      record.status !==
        "reviewed"
    ) {
      unavailableRows.push({
        recordId:
          record.id,
        formerOwnerName:
          record
            .former_owner_name,
        status:
          record.status,
        reason:
          "Record is no longer in an assignable Discovery stage.",
      });

      continue;
    }

    if (
      record
        .promoted_opportunity_id
    ) {
      unavailableRows.push({
        recordId:
          record.id,
        formerOwnerName:
          record
            .former_owner_name,
        status:
          "promoted",
        reason:
          "Record has already been promoted to an Opportunity.",
      });

      continue;
    }

    availableRows.push(
      parsedRow,
    );
  }

  let duplicateWorkbook:
    LeadWorkbookDuplicateBatch |
    undefined;

  if (
    duplicateBatchResult.data
  ) {
    const batch =
      duplicateBatchResult.data as unknown as
        ExistingBatchRow;

    const uploaderResult =
      await admin
        .from(
          "staff_users",
        )
        .select(
          "id, name, email",
        )
        .eq(
          "id",
          batch
            .uploaded_by_staff_user_id,
        )
        .maybeSingle();

    duplicateWorkbook = {
      batchId:
        batch.id,
      batchReference:
        batch.reference,
      county:
        batch.county_name,
      stateCode:
        batch.state_code,
      sourceFileName:
        batch.source_file_name ??
        undefined,
      createdAt:
        batch.created_at,
      uploadedByName:
        uploaderResult
          .data?.name ??
        "Unknown staff",
      uploadedByEmail:
        uploaderResult
          .data?.email ??
        "Unknown",
    };
  }

  const confirmationKey =
    confirmationKeyFor({
      fileSha256,
      staffUserId:
        staff.id,
      availableRows,
      conflicts,
      unavailableRows,
      duplicateBatchId:
        duplicateWorkbook
          ?.batchId,
    });

  return {
    fileName,
    fileSha256,
    sheetName:
      worksheet.sheet,
    headerRowNumber,
    headers,
    parsedRows,
    stateCode,
    county,
    staff,
    discoveredById,
    availableRows,
    unavailableRows,
    conflicts,
    duplicateWorkbook,
    confirmationKey,
  };
}

/* ========================================================================== */
/* Public preflight                                                           */
/* ========================================================================== */

export async function preflightLeadWorkbook({
  session,
  file,
  staffUserId,
}: {
  session: StaffSession;
  file: File;
  staffUserId: string;
}): Promise<
  LeadWorkbookPreflight
> {
  const inspection =
    await inspectLeadWorkbook({
      session,
      file,
      staffUserId,
    });

  const canAssign =
    !inspection
      .duplicateWorkbook &&
    inspection
      .conflicts.length ===
      0 &&
    inspection
      .availableRows.length >
      0;

  return {
    fileName:
      inspection.fileName,
    fileSha256:
      inspection.fileSha256,
    sheetName:
      inspection.sheetName,
    county:
      inspection.county,
    stateCode:
      inspection.stateCode,
    staffUserId:
      inspection.staff.id,
    staffName:
      inspection.staff.name,
    staffEmail:
      inspection.staff.email,
    sourceRowCount:
      inspection
        .parsedRows.length,
    availableRowCount:
      inspection
        .availableRows.length,
    alreadyAssignedRowCount:
      inspection
        .conflicts.length,
    unavailableRowCount:
      inspection
        .unavailableRows.length,
    duplicateWorkbook:
      inspection
        .duplicateWorkbook,
    conflicts:
      inspection.conflicts,
    unavailableRows:
      inspection
        .unavailableRows,
    canAssign,
    confirmationKey:
      inspection
        .confirmationKey,
  };
}

/* ========================================================================== */
/* Confirmed upload + assignment                                              */
/* ========================================================================== */

export async function uploadAndAssignLeadWorkbook({
  session,
  file,
  staffUserId,
  confirmationKey,
}: {
  session: StaffSession;
  file: File;
  staffUserId: string;
  confirmationKey: string;
}): Promise<
  LeadWorkbookUploadResult
> {
  const inspection =
    await inspectLeadWorkbook({
      session,
      file,
      staffUserId,
    });

  const suppliedKey =
    confirmationKey.trim();

  if (
    !suppliedKey ||
    suppliedKey !==
      inspection
        .confirmationKey
  ) {
    throw new Error(
      "Workbook preflight is stale. Run Check workbook again before assigning leads.",
    );
  }

  if (
    inspection
      .duplicateWorkbook
  ) {
    throw new Error(
      `This exact workbook was already distributed as batch ${inspection.duplicateWorkbook.batchReference}.`,
    );
  }

  if (
    inspection
      .conflicts.length >
    0
  ) {
    throw new Error(
      `${inspection.conflicts.length} workbook lead(s) are already actively assigned. No workbook reassignment is permitted.`,
    );
  }

  if (
    inspection
      .availableRows.length ===
    0
  ) {
    throw new Error(
      "None of the workbook leads are currently assignable at the Discovery stage.",
    );
  }

  const admin =
    getSupabaseAdmin();

  const batchReference =
    buildBatchReference({
      stateCode:
        inspection.stateCode,
      county:
        inspection.county,
    });

  const {
    data:
      batchData,
    error:
      batchError,
  } =
    await admin.rpc(
      "create_lead_upload_batch",
      {
        p_reference:
          batchReference,

        p_name:
          `${inspection.county}, ${inspection.stateCode} · ${inspection.fileName}`,

        p_source_file_name:
          inspection.fileName,

        p_source_file_sha256:
          inspection.fileSha256,

        p_state_code:
          inspection.stateCode,

        p_county_geoid:
          null,

        p_county_name:
          inspection.county,

        p_actor_staff_user_id:
          session.user.id,

        p_metadata: {
          sheetName:
            inspection
              .sheetName,

          headerRowNumber:
            inspection
              .headerRowNumber,

          headers:
            inspection.headers,

          originalRowCount:
            inspection
              .parsedRows.length,

          assignableRowCount:
            inspection
              .availableRows.length,

          skippedRowCount:
            inspection
              .unavailableRows.length,

          skippedRecordIds:
            inspection
              .unavailableRows
              .map(
                (row) =>
                  row.recordId,
              ),

          preflightConfirmationKey:
            inspection
              .confirmationKey,

          preflightConfirmedAt:
            new Date()
              .toISOString(),

          duplicateProtection:
            "exact-file-sha256-and-active-assignment-guard",
        },

        p_rows:
          inspection
            .availableRows
            .map(
              (row) => ({
                rowNumber:
                  row.rowNumber,

                discoveredRecordId:
                  row.discoveredRecordId,

                sourceRowSnapshot:
                  row.sourceRowSnapshot,
              }),
            ),
      },
    );

  if (
    batchError ||
    !Array.isArray(
      batchData,
    ) ||
    batchData.length !== 1
  ) {
    const message =
      batchError?.message ??
      "DueQuity could not create the uploaded lead batch.";

    if (
      message
        .toLowerCase()
        .includes(
          "source_file_sha256",
        ) ||
      message
        .toLowerCase()
        .includes(
          "unique",
        )
    ) {
      throw new Error(
        "This exact workbook has already been recorded in the DueQuity distribution ledger.",
      );
    }

    throw new Error(
      message,
    );
  }

  const createdBatch =
    batchData[0] as unknown as
      CreatedBatchRow;

  const {
    data:
      assignmentData,
    error:
      assignmentError,
  } =
    await admin.rpc(
      "assign_lead_batch_to_staff",
      {
        p_batch_id:
          createdBatch.id,

        p_staff_user_id:
          inspection.staff.id,

        p_actor_staff_user_id:
          session.user.id,

        p_note:
          `Assigned from preflight-approved workbook ${inspection.fileName}`,
      },
    );

  if (
    assignmentError
  ) {
    await admin.rpc(
      "close_lead_assignment_batch",
      {
        p_batch_id:
          createdBatch.id,

        p_actor_staff_user_id:
          session.user.id,

        p_status:
          "cancelled",

        p_closed_at:
          null,
      },
    );

    const message =
      assignmentError.message;

    if (
      message.includes(
        "already actively assigned",
      ) ||
      message.includes(
        "batch assignment blocked",
      )
    ) {
      throw new Error(
        "A lead assignment changed after preflight. The workbook was blocked and no duplicate assignment was created. Run Check workbook again.",
      );
    }

    throw new Error(
      `DueQuity created the upload batch but could not assign it: ${message}`,
    );
  }

  const assignedRowCount =
    Array.isArray(
      assignmentData,
    )
      ? assignmentData.length
      : inspection
          .availableRows.length;

  return {
    batchId:
      createdBatch.id,

    batchReference:
      createdBatch.reference,

    fileName:
      inspection.fileName,

    sheetName:
      inspection.sheetName,

    county:
      inspection.county,

    stateCode:
      inspection.stateCode,

    assignedStaffUserId:
      inspection.staff.id,

    assignedStaffName:
      inspection.staff.name,

    sourceRowCount:
      inspection
        .parsedRows.length,

    assignedRowCount,

    skippedRowCount:
      inspection
        .unavailableRows.length,

    skippedRecordIds:
      inspection
        .unavailableRows
        .map(
          (row) =>
            row.recordId,
        ),
  };
}