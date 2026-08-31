import "server-only";

import {
  createHash,
  randomUUID,
} from "node:crypto";

import ExcelJS from "exceljs";

import type {
  StaffSession,
} from "@/lib/session";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Public types                                                               */
/* ========================================================================== */

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
  county: string;
  state_code: string;
  promoted_opportunity_id:
    string | null;
}

interface StaffUserRow {
  id: string;
  name: string;
  role: string;
  status: string;
  states_cleared:
    string[] | null;
}

interface CreatedBatchRow {
  id: string;
  reference: string;
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

function cellText(
  cell: ExcelJS.Cell,
): string {
  return cell.text
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

/* ========================================================================== */
/* Workbook parsing                                                           */
/* ========================================================================== */

function findHeaderRow(
  worksheet:
    ExcelJS.Worksheet,
): {
  rowNumber: number;
  headers: string[];
} {
  const scanLimit =
    Math.min(
      worksheet.rowCount,
      25,
    );

  for (
    let rowNumber = 1;
    rowNumber <= scanLimit;
    rowNumber += 1
  ) {
    const row =
      worksheet.getRow(rowNumber);

    const headers:
      string[] = [];

    for (
      let column = 1;
      column <=
        worksheet.columnCount;
      column += 1
    ) {
      headers.push(
        normalizeHeader(
          cellText(
            row.getCell(column),
          ),
        ),
      );
    }

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
      normalized.has("county") &&
      normalized.has("state")
    ) {
      return {
        rowNumber,
        headers,
      };
    }
  }

  throw new Error(
    'DueQuity could not find the required workbook headers "DueQuity Record ID", "County", and "State".',
  );
}

function parseWorkbookRows({
  worksheet,
  headerRowNumber,
  headers,
}: {
  worksheet:
    ExcelJS.Worksheet;
  headerRowNumber: number;
  headers: string[];
}): ParsedWorkbookRow[] {
  const headerIndex =
    new Map<string, number>();

  headers.forEach(
    (header, index) => {
      if (header) {
        headerIndex.set(
          header.toLowerCase(),
          index + 1,
        );
      }
    },
  );

  const idColumn =
    headerIndex.get(
      "duequity record id",
    );

  const countyColumn =
    headerIndex.get("county");

  const stateColumn =
    headerIndex.get("state");

  if (
    !idColumn ||
    !countyColumn ||
    !stateColumn
  ) {
    throw new Error(
      "The uploaded workbook is missing required DueQuity lead columns.",
    );
  }

  const rows:
    ParsedWorkbookRow[] = [];

  for (
    let rowNumber =
      headerRowNumber + 1;
    rowNumber <=
      worksheet.rowCount;
    rowNumber += 1
  ) {
    const row =
      worksheet.getRow(rowNumber);

    const discoveredRecordId =
      cellText(
        row.getCell(idColumn),
      );

    const county =
      cellText(
        row.getCell(
          countyColumn,
        ),
      );

    const stateCode =
      normalizeState(
        cellText(
          row.getCell(
            stateColumn,
          ),
        ),
      );

    const anyContent =
      headers.some(
        (header, index) =>
          Boolean(
            header &&
            cellText(
              row.getCell(
                index + 1,
              ),
            ),
          ),
      );

    if (!anyContent) {
      continue;
    }

    if (!discoveredRecordId) {
      throw new Error(
        `Excel row ${rowNumber} contains lead data but no DueQuity Record ID.`,
      );
    }

    if (!county) {
      throw new Error(
        `Excel row ${rowNumber} is missing County.`,
      );
    }

    if (
      !/^[A-Z]{2}$/.test(
        stateCode,
      )
    ) {
      throw new Error(
        `Excel row ${rowNumber} has an invalid State value.`,
      );
    }

    const sourceRowSnapshot:
      Record<string, string> =
      {};

    headers.forEach(
      (header, index) => {
        if (!header) {
          return;
        }

        sourceRowSnapshot[
          header
        ] =
          cellText(
            row.getCell(
              index + 1,
            ),
          );
      },
    );

    rows.push({
      rowNumber,
      discoveredRecordId,
      county,
      stateCode,
      sourceRowSnapshot,
    });
  }

  if (
    rows.length === 0
  ) {
    throw new Error(
      "The uploaded workbook contains no lead rows.",
    );
  }

  return rows;
}

/* ========================================================================== */
/* Upload + assign                                                            */
/* ========================================================================== */

export async function uploadAndAssignLeadWorkbook({
  session,
  file,
  staffUserId,
}: {
  session: StaffSession;
  file: File;
  staffUserId: string;
}): Promise<
  LeadWorkbookUploadResult
> {
  requireDistributionAdmin(session);

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
    fileNameFromUpload(file);

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

  /*
   * Keep the browser-style ArrayBuffer for ExcelJS.
   * Node Buffer is created separately for SHA-256 hashing.
   */
  const arrayBuffer =
    await file.arrayBuffer();

  const bytes =
    Buffer.from(arrayBuffer);

  const fileSha256 =
    createHash("sha256")
      .update(bytes)
      .digest("hex");

  const workbook =
    new ExcelJS.Workbook();

  await workbook.xlsx.load(
    arrayBuffer,
  );

  const worksheet =
    workbook.getWorksheet(
      "Surplus Records",
    ) ??
    workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(
      "The uploaded workbook does not contain a worksheet.",
    );
  }

  const {
    rowNumber:
      headerRowNumber,
    headers,
  } =
    findHeaderRow(worksheet);

  const parsedRows =
    parseWorkbookRows({
      worksheet,
      headerRowNumber,
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
    stateCodes.length !== 1 ||
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

  const admin =
    getSupabaseAdmin();

  const {
    data:
      staffData,
    error:
      staffError,
  } =
    await admin
      .from("staff_users")
      .select(
        [
          "id",
          "name",
          "role",
          "status",
          "states_cleared",
        ].join(", "),
      )
      .eq(
        "id",
        normalizedStaffUserId,
      )
      .maybeSingle();

  if (
    staffError ||
    !staffData
  ) {
    throw new Error(
      "The selected DueQuity staff member could not be resolved.",
    );
  }

  const staff =
    staffData as unknown as
      StaffUserRow;

  if (
    staff.status !== "active"
  ) {
    throw new Error(
      "Lead workbooks may only be assigned to an active staff member.",
    );
  }

  /*
   * Super Admin remains excluded from ordinary county/workbook assignment.
   * An active Administrator is intentionally allowed to receive assigned work.
   */
  if (
    staff.role === "super_admin"
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

  const {
    data:
      recordData,
    error:
      recordError,
  } =
    await admin
      .from("discovered_records")
      .select(
        [
          "id",
          "status",
          "county",
          "state_code",
          "promoted_opportunity_id",
        ].join(", "),
      )
      .in(
        "id",
        recordIds,
      );

  if (recordError) {
    throw new Error(
      `Unable to verify workbook recovery records: ${recordError.message}`,
    );
  }

  const discoveredRows =
    (
      recordData ?? []
    ) as unknown as
      DiscoveredRecordRow[];

  const discoveredById =
    new Map(
      discoveredRows.map(
        (row) => [
          row.id,
          row,
        ],
      ),
    );

  const missingRecordIds =
    recordIds.filter(
      (id) =>
        !discoveredById.has(id),
    );

  if (
    missingRecordIds.length > 0
  ) {
    throw new Error(
      `Workbook contains ${missingRecordIds.length} DueQuity Record ID${
        missingRecordIds.length === 1
          ? ""
          : "s"
      } that do not exist in the current recovery database.`,
    );
  }

  const assignableRows:
    ParsedWorkbookRow[] = [];

  const skippedRecordIds:
    string[] = [];

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
        normalizeCounty(county)
    ) {
      throw new Error(
        `DueQuity record ${record.id} does not match the county/state shown in the uploaded workbook.`,
      );
    }

    if (
      (
        record.status !== "new" &&
        record.status !== "reviewed"
      ) ||
      record
        .promoted_opportunity_id
    ) {
      skippedRecordIds.push(
        record.id,
      );
      continue;
    }

    assignableRows.push(
      parsedRow,
    );
  }

  if (
    assignableRows.length === 0
  ) {
    throw new Error(
      "None of the workbook leads are currently assignable at the Discovery stage.",
    );
  }

  const batchReference =
    buildBatchReference({
      stateCode,
      county,
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
          `${county}, ${stateCode} · ${fileName}`,
        p_source_file_name:
          fileName,
        p_source_file_sha256:
          fileSha256,
        p_state_code:
          stateCode,
        p_county_geoid:
          null,
        p_county_name:
          county,
        p_actor_staff_user_id:
          session.user.id,
        p_metadata: {
          sheetName:
            worksheet.name,
          headerRowNumber,
          headers,
          originalRowCount:
            parsedRows.length,
          assignableRowCount:
            assignableRows.length,
          skippedRowCount:
            skippedRecordIds.length,
          skippedRecordIds,
        },
        p_rows:
          assignableRows.map(
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
    !Array.isArray(batchData) ||
    batchData.length !== 1
  ) {
    throw new Error(
      batchError?.message ??
      "DueQuity could not create the uploaded lead batch.",
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
          staff.id,
        p_actor_staff_user_id:
          session.user.id,
        p_note:
          `Assigned from uploaded workbook ${fileName}`,
      },
    );

  if (assignmentError) {
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

    throw new Error(
      `DueQuity created the upload batch but could not assign it: ${assignmentError.message}`,
    );
  }

  const assignedRowCount =
    Array.isArray(
      assignmentData,
    )
      ? assignmentData.length
      : assignableRows.length;

  return {
    batchId:
      createdBatch.id,
    batchReference:
      createdBatch.reference,
    fileName,
    sheetName:
      worksheet.name,
    county,
    stateCode,
    assignedStaffUserId:
      staff.id,
    assignedStaffName:
      staff.name,
    sourceRowCount:
      parsedRows.length,
    assignedRowCount,
    skippedRowCount:
      skippedRecordIds.length,
    skippedRecordIds,
  };
}
