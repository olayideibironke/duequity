import "server-only";

import ExcelJS from "exceljs";

import { flattenJsonPayloadToTable } from "@/server/public-record-json-table-flattener";

import { extractPublicRecordPdfRows } from "@/server/public-record-pdf-row-extractor";

import type { PublicRecordSourcePayload } from "@/server/public-record-source-fetcher";

import {
  detectCsvDelimiter,
  ingestionFailure,
} from "@/server/public-record-source-family";

import type { PublicRecordSourceDefinition } from "@/server/public-record-source-registry";

import type { PublicRecordTableProfile } from "@/server/public-record-table-profile";

/**
 * NATIONAL PUBLIC-RECORD ROW EXTRACTOR
 *
 * Converts source-native payloads into a common row structure:
 *
 *   string[][]
 *
 * It does not assign business meaning to columns. The table profile decides
 * which column represents owner, parcel, sale timing, surplus, and so on.
 *
 * Supported row transports:
 *
 *   - HTML tables (per-table, with colspan/rowspan expansion)
 *   - CSV / delimited text (comma, tab, semicolon, pipe)
 *   - XLSX workbooks (every readable worksheet)
 *   - text-based PDF tables
 *   - JSON APIs and ArcGIS layers (structurally flattened)
 *
 * A single payload may legitimately contain several candidate tables: a page
 * with one table per sale year, a workbook with an instructions sheet in front
 * of the data sheet, a JSON envelope. Rather than guessing, the extractor emits
 * every candidate and lets the schema-interpretation stage keep whichever one
 * actually resolves as a surplus table. That is what removes per-county work.
 */

/* ========================================================================== */
/* Shared text helpers                                                         */
/* ========================================================================== */

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCellText(value: string): string {
  return value
    .replace(/ /g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/* ========================================================================== */
/* Candidate tables                                                            */
/* ========================================================================== */

export interface PublicRecordTableCandidate {
  /**
   * Human-readable origin of the candidate for staff diagnostics, for example
   * "html table 2" or "worksheet Excess Funds 2023".
   */
  label: string;

  rows: string[][];
}

/* ========================================================================== */
/* HTML table extraction                                                       */
/* ========================================================================== */

function attributeSpan(attributes: string, name: string): number {
  const match = new RegExp(`${name}\\s*=\\s*["']?(\\d{1,3})`, "i").exec(
    attributes,
  );

  if (!match) {
    return 1;
  }

  const value = Number.parseInt(match[1], 10);

  return Number.isFinite(value) && value >= 1 && value <= 100 ? value : 1;
}

interface HtmlCell {
  text: string;

  colspan: number;

  rowspan: number;
}

function parseHtmlRowCells(rowHtml: string): HtmlCell[] {
  const cells: HtmlCell[] = [];

  const cellPattern = /<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi;

  let match: RegExpExecArray | null;

  while ((match = cellPattern.exec(rowHtml)) !== null) {
    const attributes = match[2];

    cells.push({
      text: htmlToText(match[3]),

      colspan: attributeSpan(attributes, "colspan"),

      rowspan: attributeSpan(attributes, "rowspan"),
    });
  }

  return cells;
}

interface PendingRowspan {
  text: string;

  remaining: number;
}

/**
 * Expand one HTML table's rows into a rectangular grid.
 *
 * colspan/rowspan misalignment is one of the most common reasons a county HTML
 * list "suddenly" stops parsing. Expanding spans generically fixes it for every
 * jurisdiction at once.
 *
 * Rows that use no spans are emitted unchanged so previously validated
 * configured column indexes stay stable.
 */
function expandHtmlTableRows(rawRows: readonly HtmlCell[][]): string[][] {
  const usesSpans = rawRows.some((row) =>
    row.some((cell) => cell.colspan > 1 || cell.rowspan > 1),
  );

  if (!usesSpans) {
    return rawRows
      .map((row) => row.map((cell) => cell.text))
      .filter((row) => row.length > 0);
  }

  const pending = new Map<number, PendingRowspan>();

  const grid: string[][] = [];

  for (const row of rawRows) {
    const output: string[] = [];

    let column = 0;

    const placePending = (): void => {
      let carried = pending.get(column);

      while (carried && carried.remaining > 0) {
        output[column] = carried.text;

        carried.remaining -= 1;

        if (carried.remaining === 0) {
          pending.delete(column);
        }

        column += 1;

        carried = pending.get(column);
      }
    };

    for (const cell of row) {
      placePending();

      for (let span = 0; span < cell.colspan; span += 1) {
        output[column] = cell.text;

        if (cell.rowspan > 1) {
          pending.set(column, {
            text: cell.text,

            remaining: cell.rowspan - 1,
          });
        }

        column += 1;
      }
    }

    placePending();

    for (let index = 0; index < output.length; index += 1) {
      if (output[index] === undefined) {
        output[index] = "";
      }
    }

    if (output.length > 0) {
      grid.push(output);
    }
  }

  return grid;
}

/**
 * Extract each `<table>` in the document as its own candidate.
 *
 * Nested tables are handled by taking the innermost table content first, which
 * is where county layout wrappers keep the real data.
 */
export function extractHtmlTableCandidates(
  html: string,
): PublicRecordTableCandidate[] {
  const candidates: PublicRecordTableCandidate[] = [];

  const tablePattern = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;

  let tableMatch: RegExpExecArray | null;

  let tableIndex = 0;

  while ((tableMatch = tablePattern.exec(html)) !== null) {
    tableIndex += 1;

    const rawRows: HtmlCell[][] = [];

    const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowPattern.exec(tableMatch[1])) !== null) {
      const cells = parseHtmlRowCells(rowMatch[1]);

      if (cells.length > 0) {
        rawRows.push(cells);
      }
    }

    if (rawRows.length === 0) {
      continue;
    }

    candidates.push({
      label: `html table ${tableIndex}`,

      rows: expandHtmlTableRows(rawRows),
    });
  }

  /*
   * A list split across sibling tables (one per sale year) is common. Offer the
   * merged view as an additional candidate so schema interpretation can choose.
   */
  if (candidates.length > 1) {
    candidates.push({
      label: "html tables merged",

      rows: candidates.flatMap((candidate) => candidate.rows),
    });
  }

  /*
   * Some jurisdictions publish `<tr>` rows without a wrapping `<table>` after
   * template processing. Fall back to a document-wide row scan.
   */
  if (candidates.length === 0) {
    const rawRows: HtmlCell[][] = [];

    const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const cells = parseHtmlRowCells(rowMatch[1]);

      if (cells.length > 0) {
        rawRows.push(cells);
      }
    }

    if (rawRows.length > 0) {
      candidates.push({
        label: "html rows",

        rows: expandHtmlTableRows(rawRows),
      });
    }
  }

  return candidates;
}

/**
 * Flat document-wide HTML row extraction.
 *
 * Preserved for configured profiles whose column indexes were validated against
 * the whole-document row order.
 */
function extractHtmlRows(html: string): string[][] {
  const candidates = extractHtmlTableCandidates(html);

  const merged = candidates.find(
    (candidate) => candidate.label === "html tables merged",
  );

  if (merged) {
    return merged.rows;
  }

  return candidates[0]?.rows ?? [];
}

/* ========================================================================== */
/* Delimited text extraction                                                   */
/* ========================================================================== */

/**
 * Parse delimited text while preserving:
 *
 *   - quoted delimiters
 *   - quoted line breaks
 *   - escaped double quotes
 *   - blank cells
 *
 * The delimiter is sniffed, not assumed, because government exports arrive as
 * comma, tab, semicolon, and pipe separated files interchangeably.
 *
 * Column meaning remains entirely outside this function.
 */
function extractDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];

  let row: string[] = [];

  let field = "";

  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        const nextCharacter = text[index + 1];

        if (nextCharacter === '"') {
          field += '"';

          index += 1;

          continue;
        }

        quoted = false;

        continue;
      }

      field += character;

      continue;
    }

    if (character === '"') {
      quoted = true;

      continue;
    }

    if (character === delimiter) {
      row.push(normalizeCellText(field));

      field = "";

      continue;
    }

    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      row.push(normalizeCellText(field));

      field = "";

      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }

      row = [];

      continue;
    }

    field += character;
  }

  /*
   * Preserve the final row when the file does not end with a newline.
   */
  if (field.length > 0 || row.length > 0) {
    row.push(normalizeCellText(field));

    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function extractCsvRows(csv: string): string[][] {
  return extractDelimitedRows(csv, detectCsvDelimiter(csv));
}

/* ========================================================================== */
/* XLSX extraction                                                             */
/* ========================================================================== */

function excelCellText(cell: ExcelJS.Cell): string {
  /*
   * Merged regions store the value only on the master cell. Reading the master
   * keeps a merged header or carried-down owner value visible in every covered
   * column, matching how the sheet reads on screen.
   */
  const resolved = cell.isMerged && cell.master ? cell.master : cell;

  const value = resolved.value;

  if (value instanceof Date) {
    /*
     * Emit a real ISO date rather than a locale string. Excel date cells are
     * exact instants, so no precision is invented.
     */
    return value.toISOString().slice(0, 10);
  }

  if (value !== null && typeof value === "object" && "result" in value) {
    const result = (
      value as {
        result?: unknown;
      }
    ).result;

    if (result instanceof Date) {
      return result.toISOString().slice(0, 10);
    }

    if (typeof result === "string" || typeof result === "number") {
      return normalizeCellText(String(result));
    }
  }

  return normalizeCellText(resolved.text ?? "");
}

function worksheetRows(worksheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];

  const width = Math.max(worksheet.columnCount, worksheet.actualColumnCount, 1);

  worksheet.eachRow(
    {
      includeEmpty: false,
    },
    (worksheetRow) => {
      const cells: string[] = [];

      /*
       * Iterate a stable sheet width so blank cells between populated columns
       * preserve profile column indexes.
       */
      const rowWidth = Math.max(worksheetRow.cellCount, width);

      for (let column = 1; column <= rowWidth; column += 1) {
        cells.push(excelCellText(worksheetRow.getCell(column)));
      }

      /*
       * Trailing blank cells are preserved. Trimming them would make row width
       * vary by row and break the profile's column-index contract for records
       * whose final column is simply empty.
       */
      if (cells.some((value) => value.length > 0)) {
        rows.push(cells);
      }
    },
  );

  return rows;
}

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();

  /*
   * ExcelJS 4.x declares Workbook.xlsx.load() against an older non-generic
   * Node Buffer type. Newer @types/node versions expose Buffer as a generic,
   * which causes an otherwise valid runtime Buffer to fail TypeScript
   * assignment checking.
   */
  const workbookBuffer = Buffer.from(bytes) as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0];

  try {
    await workbook.xlsx.load(workbookBuffer);
  } catch {
    throw ingestionFailure({
      reason: "UNSUPPORTED_SOURCE_FAMILY",

      message:
        "The official workbook could not be opened as Office Open XML. Review required.",

      detectedFamily: "xlsx",

      variant: "unreadable_workbook",
    });
  }

  return workbook;
}

/**
 * Emit one candidate per readable worksheet.
 *
 * County workbooks frequently lead with an instructions or cover sheet, or hold
 * one sheet per sale year. Reading only the first sheet is a per-county trap.
 */
async function extractXlsxCandidates(
  bytes: Uint8Array,
): Promise<PublicRecordTableCandidate[]> {
  const workbook = await loadWorkbook(bytes);

  const candidates: PublicRecordTableCandidate[] = [];

  for (const worksheet of workbook.worksheets) {
    if (worksheet.state === "veryHidden") {
      continue;
    }

    const rows = worksheetRows(worksheet);

    if (rows.length === 0) {
      continue;
    }

    candidates.push({
      label: `worksheet ${worksheet.name}`,

      rows,
    });
  }

  return candidates;
}

async function extractXlsxRows(bytes: Uint8Array): Promise<string[][]> {
  const candidates = await extractXlsxCandidates(bytes);

  if (candidates.length === 0) {
    throw ingestionFailure({
      reason: "UNRECOGNIZED_TABLE_STRUCTURE",

      message: "The XLSX workbook does not contain a readable worksheet.",

      detectedFamily: "xlsx",
    });
  }

  return candidates[0].rows;
}

/* ========================================================================== */
/* Payload guards                                                              */
/* ========================================================================== */

function verifyProfileFormat(
  payload: PublicRecordSourcePayload,
  profile: PublicRecordTableProfile,
): void {
  if (!profile.supportedSourceFormats.includes(payload.format)) {
    throw ingestionFailure({
      reason: "SOURCE_CONFIGURATION_MISMATCH",

      message: `Table profile ${profile.key} does not support source family ${payload.format}.`,

      detectedFamily: payload.format,
    });
  }
}

function verifyPayloadSource(
  source: PublicRecordSourceDefinition,
  payload: PublicRecordSourcePayload,
): void {
  if (payload.sourceKey !== source.key) {
    throw ingestionFailure({
      reason: "SOURCE_CONFIGURATION_MISMATCH",

      message: `Source payload ${payload.sourceKey} does not belong to source ${source.key}.`,
    });
  }
}

/* ========================================================================== */
/* Public extraction API                                                       */
/* ========================================================================== */

/**
 * Produce every candidate table contained in one official payload.
 *
 * Family dispatch happens on the family the payload was CLASSIFIED as, not on
 * the registry's declared format, so a jurisdiction that changes publication
 * format keeps ingesting.
 */
export async function extractPublicRecordTableCandidates(
  source: PublicRecordSourceDefinition,
  payload: PublicRecordSourcePayload,
): Promise<PublicRecordTableCandidate[]> {
  verifyPayloadSource(source, payload);

  switch (payload.format) {
    case "html_table": {
      if (payload.kind !== "text") {
        throw ingestionFailure({
          reason: "SOURCE_CONFIGURATION_MISMATCH",

          message: `Source ${source.key} did not return the expected HTML payload.`,
        });
      }

      const candidates = extractHtmlTableCandidates(payload.text);

      if (candidates.length === 0) {
        throw ingestionFailure({
          reason: "UNRECOGNIZED_TABLE_STRUCTURE",

          message: `${source.sourceName} did not contain any readable HTML table rows. Review required.`,

          detectedFamily: "html_table",
        });
      }

      return candidates;
    }

    case "csv": {
      if (payload.kind !== "text") {
        throw ingestionFailure({
          reason: "SOURCE_CONFIGURATION_MISMATCH",

          message: `Source ${source.key} did not return the expected delimited-text payload.`,
        });
      }

      const rows = extractCsvRows(payload.text);

      if (rows.length === 0) {
        throw ingestionFailure({
          reason: "UNRECOGNIZED_TABLE_STRUCTURE",

          message: `${source.sourceName} did not contain any readable delimited rows. Review required.`,

          detectedFamily: "csv",
        });
      }

      return [
        {
          label: "delimited text",

          rows,
        },
      ];
    }

    case "xlsx": {
      if (payload.kind !== "binary") {
        throw ingestionFailure({
          reason: "SOURCE_CONFIGURATION_MISMATCH",

          message: `Source ${source.key} did not return the expected XLSX payload.`,
        });
      }

      const candidates = await extractXlsxCandidates(payload.bytes);

      if (candidates.length === 0) {
        throw ingestionFailure({
          reason: "UNRECOGNIZED_TABLE_STRUCTURE",

          message: `${source.sourceName} did not contain any readable worksheet rows. Review required.`,

          detectedFamily: "xlsx",
        });
      }

      return candidates;
    }

    case "pdf_table": {
      if (payload.kind !== "binary") {
        throw ingestionFailure({
          reason: "SOURCE_CONFIGURATION_MISMATCH",

          message: `Source ${source.key} did not return the expected PDF payload.`,
        });
      }

      const rows = await extractPublicRecordPdfRows(payload.bytes);

      if (rows.length === 0) {
        throw ingestionFailure({
          reason: "UNSUPPORTED_SOURCE_FAMILY",

          message: `${source.sourceName} produced no extractable text rows. The document is most likely a scanned image PDF. Review required.`,

          detectedFamily: "pdf_table",

          variant: "image_only_pdf",
        });
      }

      return [
        {
          label: "pdf table",

          rows,
        },
      ];
    }

    case "json_api":
    case "arcgis": {
      if (payload.kind !== "json") {
        throw ingestionFailure({
          reason: "SOURCE_CONFIGURATION_MISMATCH",

          message: `Source ${source.key} did not return the expected JSON payload.`,
        });
      }

      const flattened = flattenJsonPayloadToTable(
        payload.value,
        source.sourceName,
      );

      return [
        {
          label:
            payload.format === "arcgis" ? "arcgis features" : "json records",

          rows: flattened.rows,
        },
      ];
    }

    case "web_portal":
      throw ingestionFailure({
        reason: "UNSUPPORTED_SOURCE_FAMILY",

        message: `${source.sourceName} is an interactive portal with no published machine-readable list. Review required.`,

        detectedFamily: "web_portal",

        variant: "interactive_portal",
      });
  }
}

/**
 * Convert one tabular official-source payload into source-neutral rows.
 *
 * Used by configured table profiles, whose column indexes were validated
 * against the whole-payload row order.
 */
export async function extractPublicRecordRows(
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
  payload: PublicRecordSourcePayload,
): Promise<string[][]> {
  verifyProfileFormat(payload, profile);

  verifyPayloadSource(source, payload);

  switch (payload.format) {
    case "html_table":
      return payload.kind === "text" ? extractHtmlRows(payload.text) : [];

    case "csv":
      return payload.kind === "text" ? extractCsvRows(payload.text) : [];

    case "xlsx":
      return payload.kind === "binary" ? extractXlsxRows(payload.bytes) : [];

    default: {
      const candidates = await extractPublicRecordTableCandidates(
        source,
        payload,
      );

      return candidates[0]?.rows ?? [];
    }
  }
}
