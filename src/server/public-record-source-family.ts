import "server-only";

import type { PublicRecordSourceFormat } from "@/server/public-record-source-registry";

/**
 * NATIONAL SOURCE-FAMILY CLASSIFIER
 *
 * DueQuity must ingest official surplus/excess-funds records nationally without
 * a per-county parser. The only durable way to do that is to detect what a
 * government response ACTUALLY is and route it to a reusable family parser.
 *
 * Declared registry format is treated as a hint, not as truth. Counties
 * routinely:
 *
 *   - serve a PDF from a ".aspx" URL
 *   - serve HTML from a ".csv" URL
 *   - serve a legacy .xls workbook labelled as Excel
 *   - move a list from an HTML table to a spreadsheet without notice
 *
 * Every ingestion failure carries a machine-readable reason so an unsupported
 * source reports UNSUPPORTED SOURCE FAMILY / REVIEW REQUIRED instead of
 * silently producing incorrect records.
 */

/* ========================================================================== */
/* Failure reasons                                                             */
/* ========================================================================== */

export type PublicRecordIngestionFailureReason =
  /** The official host could not be reached or returned a non-OK status. */
  | "SOURCE_UNREACHABLE"

  /** The official response was empty. */
  | "SOURCE_EMPTY"

  /**
   * The response is a real government document, but its family has no
   * reusable DueQuity parser. Requires review, never a guess.
   */
  | "UNSUPPORTED_SOURCE_FAMILY"

  /** No table-like structure could be recovered from the payload. */
  | "UNRECOGNIZED_TABLE_STRUCTURE"

  /**
   * A table was recovered and headers were recognized, but the columns do not
   * describe surplus/excess-funds records.
   */
  | "INCOMPLETE_SURPLUS_SCHEMA"

  /** Structure and schema were understood, but no rows produced records. */
  | "NO_RECORDS_PARSED"

  /** Internal wiring problem (payload/source/profile mismatch). */
  | "SOURCE_CONFIGURATION_MISMATCH";

export interface PublicRecordIngestionFailure {
  reason: PublicRecordIngestionFailureReason;

  message: string;

  /**
   * Detected family when classification succeeded but parsing did not.
   */
  detectedFamily?: PublicRecordSourceFormat;

  /**
   * Narrow descriptor for review triage, for example "legacy_xls",
   * "image_only_pdf", "interactive_portal".
   */
  variant?: string;
}

export class PublicRecordIngestionError extends Error {
  readonly reason: PublicRecordIngestionFailureReason;

  readonly detectedFamily?: PublicRecordSourceFormat;

  readonly variant?: string;

  constructor(failure: PublicRecordIngestionFailure) {
    super(failure.message);

    this.name = "PublicRecordIngestionError";

    this.reason = failure.reason;

    this.detectedFamily = failure.detectedFamily;

    this.variant = failure.variant;
  }
}

export function ingestionFailure(
  failure: PublicRecordIngestionFailure,
): PublicRecordIngestionError {
  return new PublicRecordIngestionError(failure);
}

/**
 * Normalize any thrown value into a reportable ingestion failure.
 *
 * Unclassified errors are reported as review-required rather than as a
 * successful empty harvest.
 */
export function toIngestionFailure(
  error: unknown,
  fallbackMessage: string,
): PublicRecordIngestionFailure {
  if (error instanceof PublicRecordIngestionError) {
    return {
      reason: error.reason,

      message: error.message,

      ...(error.detectedFamily
        ? {
            detectedFamily: error.detectedFamily,
          }
        : {}),

      ...(error.variant
        ? {
            variant: error.variant,
          }
        : {}),
    };
  }

  return {
    reason: "UNSUPPORTED_SOURCE_FAMILY",

    message: error instanceof Error ? error.message : fallbackMessage,
  };
}

export function ingestionFailureIsReviewRequired(
  reason: PublicRecordIngestionFailureReason,
): boolean {
  return (
    reason === "UNSUPPORTED_SOURCE_FAMILY" ||
    reason === "UNRECOGNIZED_TABLE_STRUCTURE" ||
    reason === "INCOMPLETE_SURPLUS_SCHEMA"
  );
}

/* ========================================================================== */
/* Byte / text signatures                                                      */
/* ========================================================================== */

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

const ALTERNATE_ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

/** Legacy Microsoft OLE2 compound file: .xls, .doc, .ppt. */
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46];

const RTF_SIGNATURE = [0x7b, 0x5c, 0x72, 0x74, 0x66];

function hasSignature(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }

  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) {
      return false;
    }
  }

  return true;
}

/**
 * A PDF may not begin exactly at byte zero when a server prepends whitespace
 * or a stray BOM.
 */
function looksLikePdf(bytes: Uint8Array): boolean {
  const window = Math.min(bytes.length, 1024);

  for (let offset = 0; offset <= window - PDF_SIGNATURE.length; offset += 1) {
    if (hasSignature(bytes, PDF_SIGNATURE, offset)) {
      return true;
    }
  }

  return false;
}

function looksLikeZip(bytes: Uint8Array): boolean {
  if (hasSignature(bytes, ZIP_SIGNATURE)) {
    return true;
  }

  return ALTERNATE_ZIP_SIGNATURES.some((signature) =>
    hasSignature(bytes, signature),
  );
}

/* ========================================================================== */
/* Text decoding                                                              */
/* ========================================================================== */

function stripByteOrderMark(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

/**
 * Decode a bounded prefix for sniffing without materializing a large document
 * twice.
 */
export function decodeTextPrefix(bytes: Uint8Array, limit = 65536): string {
  const slice = bytes.length > limit ? bytes.subarray(0, limit) : bytes;

  return stripByteOrderMark(
    new TextDecoder("utf-8", {
      fatal: false,
    }).decode(slice),
  );
}

export function decodeSourceText(bytes: Uint8Array): string {
  return stripByteOrderMark(
    new TextDecoder("utf-8", {
      fatal: false,
    }).decode(bytes),
  );
}

/* ========================================================================== */
/* Delimiter sniffing                                                          */
/* ========================================================================== */

export const PUBLIC_RECORD_CSV_DELIMITERS = [",", "\t", ";", "|"] as const;

export type PublicRecordCsvDelimiter =
  (typeof PUBLIC_RECORD_CSV_DELIMITERS)[number];

/**
 * Choose the delimiter that produces the most consistent multi-column shape.
 *
 * Government "CSV" exports are frequently tab, semicolon, or pipe separated.
 * Sniffing removes an entire class of per-county parser work.
 */
export function detectCsvDelimiter(text: string): PublicRecordCsvDelimiter {
  const lines = text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 40);

  if (lines.length === 0) {
    return ",";
  }

  let best: PublicRecordCsvDelimiter = ",";

  let bestScore = -1;

  for (const delimiter of PUBLIC_RECORD_CSV_DELIMITERS) {
    const counts = lines.map((line) =>
      countUnquotedOccurrences(line, delimiter),
    );

    const populated = counts.filter((count) => count > 0);

    if (populated.length === 0) {
      continue;
    }

    const median = [...populated].sort((left, right) => left - right)[
      Math.floor(populated.length / 2)
    ];

    const consistent = counts.filter((count) => count === median).length;

    /*
     * Reward both column count and row-to-row consistency. A delimiter that
     * appears the same number of times on nearly every line is the real
     * separator.
     */
    const score = median * consistent + consistent;

    if (score > bestScore) {
      bestScore = score;

      best = delimiter;
    }
  }

  return best;
}

function countUnquotedOccurrences(line: string, delimiter: string): number {
  let count = 0;

  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      quoted = !quoted;

      continue;
    }

    if (!quoted && character === delimiter) {
      count += 1;
    }
  }

  return count;
}

/* ========================================================================== */
/* ArcGIS recognition                                                          */
/* ========================================================================== */

const ARCGIS_LAYER_PATTERN = /\/(?:feature|map)server(?:\/\d+)?\/?$/i;

const ARCGIS_QUERY_PATTERN = /\/(?:feature|map)server\/\d+\/query\b/i;

/**
 * Recognize an ArcGIS REST data endpoint from its URL shape.
 *
 * ArcGIS is a single national source family: thousands of counties expose the
 * same FeatureServer/MapServer query contract.
 */
export function looksLikeArcGisEndpoint(url: string): boolean {
  let candidate: URL;

  try {
    candidate = new URL(url);
  } catch {
    return false;
  }

  const pathname = candidate.pathname;

  return (
    ARCGIS_QUERY_PATTERN.test(pathname) || ARCGIS_LAYER_PATTERN.test(pathname)
  );
}

export function isArcGisJsonValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return Array.isArray(record.features) || Array.isArray(record.fields);
}

/* ========================================================================== */
/* Classification                                                             */
/* ========================================================================== */

export interface PublicRecordFamilyClassification {
  family: PublicRecordSourceFormat;

  /**
   * How the family was determined, for staff diagnostics.
   */
  evidence: string;
}

export interface ClassificationInput {
  bytes: Uint8Array;

  contentType?: string;

  contentDisposition?: string;

  url: string;

  /**
   * Registry-declared format. Used only to break ties, never to override real
   * response evidence.
   */
  declaredFormat?: PublicRecordSourceFormat;
}

function extensionFamily(
  pathname: string,
): PublicRecordSourceFormat | undefined {
  const lower = pathname.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return "pdf_table";
  }

  if (
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".txt")
  ) {
    return "csv";
  }

  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xlsm") ||
    lower.endsWith(".xls")
  ) {
    return "xlsx";
  }

  if (lower.endsWith(".json") || lower.endsWith(".geojson")) {
    return "json_api";
  }

  if (lower.endsWith(".htm") || lower.endsWith(".html")) {
    return "html_table";
  }

  return undefined;
}

/**
 * Determine the real source family for a retrieved official payload.
 *
 * Throws a classified UNSUPPORTED_SOURCE_FAMILY failure for genuine government
 * documents DueQuity cannot parse generically.
 */
export function classifyPublicRecordFamily(
  input: ClassificationInput,
): PublicRecordFamilyClassification {
  const bytes = input.bytes;

  if (bytes.length === 0) {
    throw ingestionFailure({
      reason: "SOURCE_EMPTY",

      message: "The official source returned an empty response.",
    });
  }

  /* -- Binary signatures win outright ------------------------------------- */

  if (looksLikePdf(bytes)) {
    return {
      family: "pdf_table",

      evidence: "pdf_signature",
    };
  }

  if (hasSignature(bytes, OLE2_SIGNATURE)) {
    throw ingestionFailure({
      reason: "UNSUPPORTED_SOURCE_FAMILY",

      message:
        "The official source published a legacy Microsoft OLE2 document (.xls/.doc). DueQuity does not parse the legacy BIFF format. Review required: request an XLSX, CSV, or PDF publication of this list.",

      variant: "legacy_ole2_office_document",
    });
  }

  if (hasSignature(bytes, RTF_SIGNATURE)) {
    throw ingestionFailure({
      reason: "UNSUPPORTED_SOURCE_FAMILY",

      message:
        "The official source published an RTF document. DueQuity has no reusable RTF table family. Review required.",

      variant: "rtf_document",
    });
  }

  if (looksLikeZip(bytes)) {
    const prefix = decodeTextPrefix(bytes, 4096);

    if (prefix.includes("opendocument.spreadsheet")) {
      throw ingestionFailure({
        reason: "UNSUPPORTED_SOURCE_FAMILY",

        message:
          "The official source published an OpenDocument spreadsheet (.ods). DueQuity has no reusable ODS family. Review required.",

        variant: "open_document_spreadsheet",
      });
    }

    return {
      family: "xlsx",

      evidence: "zip_office_open_xml_signature",
    };
  }

  /* -- Text-shaped payloads ---------------------------------------------- */

  const prefix = decodeTextPrefix(bytes);

  const trimmed = prefix.trimStart();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return {
      family: looksLikeArcGisEndpoint(input.url) ? "arcgis" : "json_api",

      evidence: "json_document_prefix",
    };
  }

  if (
    /^<(?:!doctype\s+html|html|\?xml-stylesheet|table|tbody|div|body)\b/i.test(
      trimmed,
    ) ||
    /<table\b/i.test(prefix) ||
    /<html\b/i.test(prefix)
  ) {
    return {
      family: "html_table",

      evidence: "html_markup",
    };
  }

  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
    /*
     * Non-HTML XML feeds are a real government family, but they vary far too
     * much to guess at. Fail closed and request review.
     */
    throw ingestionFailure({
      reason: "UNSUPPORTED_SOURCE_FAMILY",

      message:
        "The official source published a non-HTML XML document. DueQuity has no reusable XML record family. Review required.",

      variant: "xml_document",
    });
  }

  const declared = input.declaredFormat;

  const fromExtension = (() => {
    try {
      return extensionFamily(new URL(input.url).pathname);
    } catch {
      return undefined;
    }
  })();

  /*
   * Remaining plain text is treated as delimited data. This is the correct
   * default: CSV/TSV government exports frequently arrive with a generic
   * text/plain content type and no file extension.
   */
  if (fromExtension === "csv" || declared === "csv" || /[,;|\t]/.test(prefix)) {
    return {
      family: "csv",

      evidence: "delimited_text",
    };
  }

  throw ingestionFailure({
    reason: "UNRECOGNIZED_TABLE_STRUCTURE",

    message:
      "The official source returned text with no recognizable table, delimiter, or document structure. Review required.",

    variant: "undelimited_plain_text",
  });
}
