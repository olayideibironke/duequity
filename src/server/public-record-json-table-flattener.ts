import "server-only";

import { ingestionFailure } from "@/server/public-record-source-family";

/**
 * JSON / ARCGIS → TABLE FLATTENER
 *
 * DueQuity's schema interpretation, month/year precision handling, money
 * parsing, owner parsing, and record-key generation all already live in the
 * table pipeline. Rebuilding that for JSON would double the surface area that
 * has to be maintained per county.
 *
 * Instead, a JSON or ArcGIS response is structurally flattened into the same
 * shape every other family produces:
 *
 *   row 0    = field names exactly as the government published them
 *   rows 1.. = record values as text
 *
 * The generic header resolver then interprets "OWNER_NAME", "Parcel_ID",
 * "EXCESS_FUNDS", "SaleDate" and so on through the same national alias
 * vocabulary used for HTML, CSV, XLSX, and PDF sources.
 *
 * This module assigns no business meaning. It only finds the record array and
 * normalizes scalar values into text.
 */

/* ========================================================================== */
/* Record-array location                                                       */
/* ========================================================================== */

/**
 * Container keys used by government JSON endpoints to hold the record list.
 */
const RECORD_ARRAY_KEYS = [
  "features",
  "records",
  "rows",
  "data",
  "items",
  "results",
  "result",
  "value",
  "entries",
  "list",
  "elements",
] as const;

/**
 * Keys that wrap the real attribute bag of one record.
 */
const ATTRIBUTE_KEYS = [
  "attributes",
  "properties",
  "fields",
  "record",
  "values",
] as const;

const MAX_SEARCH_DEPTH = 6;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const objects = value.filter(isPlainObject);

  /*
   * Require that the array is predominantly object-shaped. A stray array of
   * strings is not a record list.
   */
  return objects.length >= Math.max(1, Math.floor(value.length * 0.5))
    ? objects
    : undefined;
}

/**
 * Locate the most plausible record array anywhere in a JSON document.
 *
 * Preference order:
 *
 *   1. a known container key
 *   2. the top-level array
 *   3. the largest object array found within a bounded depth
 */
function locateRecordArray(
  value: unknown,
): Record<string, unknown>[] | undefined {
  const topLevel = arrayOfObjects(value);

  if (topLevel) {
    return topLevel;
  }

  if (!isPlainObject(value)) {
    return undefined;
  }

  for (const key of RECORD_ARRAY_KEYS) {
    const candidate = arrayOfObjects(value[key]);

    if (candidate) {
      return candidate;
    }
  }

  let best: Record<string, unknown>[] | undefined;

  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_SEARCH_DEPTH) {
      return;
    }

    if (Array.isArray(node)) {
      const candidate = arrayOfObjects(node);

      if (candidate && (!best || candidate.length > best.length)) {
        best = candidate;
      }

      return;
    }

    if (!isPlainObject(node)) {
      return;
    }

    for (const child of Object.values(node)) {
      visit(child, depth + 1);
    }
  };

  visit(value, 0);

  return best;
}

/* ========================================================================== */
/* Attribute extraction                                                        */
/* ========================================================================== */

/**
 * Unwrap one record into its flat attribute bag.
 *
 * ArcGIS features nest under "attributes"; GeoJSON nests under "properties".
 * Nested scalar groups are flattened with a dotted key so the header resolver
 * can still recognize them.
 */
function recordAttributes(
  record: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of ATTRIBUTE_KEYS) {
    const nested = record[key];

    if (isPlainObject(nested)) {
      return flattenScalars(nested);
    }
  }

  return flattenScalars(record);
}

function flattenScalars(
  value: Record<string, unknown>,
  prefix = "",
  depth = 0,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(child) && depth < 2) {
      Object.assign(flat, flattenScalars(child, path, depth + 1));

      continue;
    }

    if (Array.isArray(child)) {
      continue;
    }

    flat[path] = child;
  }

  return flat;
}

/* ========================================================================== */
/* Value normalization                                                         */
/* ========================================================================== */

/**
 * Epoch-millisecond window treated as a plausible published sale timestamp.
 *
 * ArcGIS date fields are epoch milliseconds. Converting them to ISO dates lets
 * the shared table date detector recognize them without inventing precision:
 * a timestamp is an exact instant, so an exact ISO date is the honest reading.
 */
const MIN_EPOCH_MS = Date.UTC(1970, 0, 2);

const MAX_EPOCH_MS = Date.UTC(2100, 0, 1);

const DATE_FIELD_PATTERN = /(date|dte|_dt$|^dt_|time|sold|sale)/i;

function isoFromEpochMilliseconds(value: number): string | undefined {
  if (!Number.isFinite(value) || value < MIN_EPOCH_MS || value > MAX_EPOCH_MS) {
    return undefined;
  }

  const date = new Date(value);

  const iso = date.toISOString();

  return iso.slice(0, 10);
}

function normalizeValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (DATE_FIELD_PATTERN.test(key)) {
      const iso = isoFromEpochMilliseconds(value);

      if (iso) {
        return iso;
      }
    }

    return Number.isInteger(value) ? String(value) : String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    /*
     * Some endpoints publish epoch milliseconds as a string.
     */
    if (DATE_FIELD_PATTERN.test(key) && /^\d{12,14}$/.test(trimmed)) {
      const iso = isoFromEpochMilliseconds(Number(trimmed));

      if (iso) {
        return iso;
      }
    }

    /*
     * Trim a full ISO timestamp down to its date. Preserving the time adds no
     * public-record meaning and defeats simple date detection.
     */
    const isoTimestamp = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/.exec(trimmed);

    if (isoTimestamp) {
      return isoTimestamp[1];
    }

    return trimmed.replace(/\s+/g, " ");
  }

  return "";
}

/* ========================================================================== */
/* Public API                                                                  */
/* ========================================================================== */

export interface FlattenedJsonTable {
  rows: string[][];

  /**
   * Field names discovered in the response, in emitted column order.
   */
  fieldNames: readonly string[];

  recordCount: number;
}

const MAX_FLATTENED_COLUMNS = 200;

/**
 * Flatten a JSON or ArcGIS payload value into a header row plus data rows.
 */
export function flattenJsonPayloadToTable(
  value: unknown,
  sourceName: string,
): FlattenedJsonTable {
  const records = locateRecordArray(value);

  if (!records || records.length === 0) {
    throw ingestionFailure({
      reason: "UNRECOGNIZED_TABLE_STRUCTURE",

      message: `${sourceName} returned JSON with no locatable record array. Review required.`,
    });
  }

  const attributeRecords = records.map(recordAttributes);

  /*
   * Column order follows first appearance so the published field order is
   * preserved for staff review.
   */
  const fieldNames: string[] = [];

  const seen = new Set<string>();

  for (const record of attributeRecords) {
    for (const key of Object.keys(record)) {
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      fieldNames.push(key);

      if (fieldNames.length >= MAX_FLATTENED_COLUMNS) {
        break;
      }
    }

    if (fieldNames.length >= MAX_FLATTENED_COLUMNS) {
      break;
    }
  }

  if (fieldNames.length === 0) {
    throw ingestionFailure({
      reason: "UNRECOGNIZED_TABLE_STRUCTURE",

      message: `${sourceName} returned JSON records with no readable fields. Review required.`,
    });
  }

  const rows: string[][] = [[...fieldNames]];

  for (const record of attributeRecords) {
    const row = fieldNames.map((field) => normalizeValue(field, record[field]));

    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return {
    rows,

    fieldNames,

    recordCount: rows.length - 1,
  };
}
