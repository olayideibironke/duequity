import "server-only";

import type {
  PublicRecordSourceDefinition,
  PublicRecordSourceFormat,
} from "@/server/public-record-source-registry";

/**
 * NATIONAL PUBLIC-RECORD SOURCE FETCHER
 *
 * Transport is separated from parsing.
 *
 * This module knows how to retrieve an activated official source and preserve
 * its raw response. It does not know what a county column means, who a claimant
 * is, whether a surplus amount is confirmed, or whether intake is allowed.
 *
 * Parser profiles consume the payload returned here.
 *
 * Supported transport families:
 *
 *   - HTML table
 *   - CSV
 *   - XLSX
 *   - PDF table
 *   - JSON/API
 *   - web portal
 *
 * A source definition decides which transport family applies.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export interface PublicRecordTextPayload {
  kind: "text";

  sourceKey: string;

  format:
    | "html_table"
    | "csv"
    | "web_portal";

  sourceUrl: string;

  contentType?: string;

  retrievedAt: string;

  text: string;
}

export interface PublicRecordJsonPayload {
  kind: "json";

  sourceKey: string;

  format: "json_api";

  sourceUrl: string;

  contentType?: string;

  retrievedAt: string;

  value: unknown;
}

export interface PublicRecordBinaryPayload {
  kind: "binary";

  sourceKey: string;

  format:
    | "xlsx"
    | "pdf_table";

  sourceUrl: string;

  contentType?: string;

  retrievedAt: string;

  bytes: Uint8Array;
}

export type PublicRecordSourcePayload =
  | PublicRecordTextPayload
  | PublicRecordJsonPayload
  | PublicRecordBinaryPayload;

/* ========================================================================== */
/* HTTP helpers                                                                */
/* ========================================================================== */

function acceptHeader(
  format: PublicRecordSourceFormat,
): string {
  switch (format) {
    case "html_table":
    case "web_portal":
      return "text/html,application/xhtml+xml";

    case "csv":
      return "text/csv,text/plain;q=0.9,*/*;q=0.5";

    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.9,*/*;q=0.5";

    case "pdf_table":
      return "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5";

    case "json_api":
      return "application/json,text/json;q=0.9,*/*;q=0.5";
  }
}

async function fetchOfficialSource(
  source: PublicRecordSourceDefinition,
): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(
      source.sourceUrl,
      {
        method: "GET",

        cache: "no-store",

        redirect: "follow",

        headers: {
          Accept:
            acceptHeader(
              source.sourceFormat,
            ),

          "User-Agent":
            "DueQuity Official Public Record Research",
        },
      },
    );
  } catch {
    throw new Error(
      `Duequity could not reach ${source.sourceName}.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `${source.sourceName} returned HTTP ${response.status}.`,
    );
  }

  return response;
}

function responseContentType(
  response: Response,
): string | undefined {
  const value =
    response.headers
      .get(
        "content-type",
      )
      ?.trim();

  return value ||
    undefined;
}

/* ========================================================================== */
/* Format readers                                                              */
/* ========================================================================== */

async function readTextPayload(
  source: PublicRecordSourceDefinition,
  response: Response,
): Promise<PublicRecordTextPayload> {
  if (
    source.sourceFormat !== "html_table" &&
    source.sourceFormat !== "csv" &&
    source.sourceFormat !== "web_portal"
  ) {
    throw new Error(
      `Source ${source.key} is not configured as a text source.`,
    );
  }

  const text =
    await response.text();

  if (!text.trim()) {
    throw new Error(
      `${source.sourceName} returned an empty response.`,
    );
  }

  return {
    kind:
      "text",

    sourceKey:
      source.key,

    format:
      source.sourceFormat,

    sourceUrl:
      source.sourceUrl,

    contentType:
      responseContentType(
        response,
      ),

    retrievedAt:
      new Date().toISOString(),

    text,
  };
}

async function readJsonPayload(
  source: PublicRecordSourceDefinition,
  response: Response,
): Promise<PublicRecordJsonPayload> {
  if (
    source.sourceFormat !==
    "json_api"
  ) {
    throw new Error(
      `Source ${source.key} is not configured as a JSON/API source.`,
    );
  }

  let value: unknown;

  try {
    value =
      await response.json();
  } catch {
    throw new Error(
      `${source.sourceName} returned a response that could not be parsed as JSON.`,
    );
  }

  return {
    kind:
      "json",

    sourceKey:
      source.key,

    format:
      "json_api",

    sourceUrl:
      source.sourceUrl,

    contentType:
      responseContentType(
        response,
      ),

    retrievedAt:
      new Date().toISOString(),

    value,
  };
}

async function readBinaryPayload(
  source: PublicRecordSourceDefinition,
  response: Response,
): Promise<PublicRecordBinaryPayload> {
  if (
    source.sourceFormat !== "xlsx" &&
    source.sourceFormat !== "pdf_table"
  ) {
    throw new Error(
      `Source ${source.key} is not configured as a binary source.`,
    );
  }

  const buffer =
    await response.arrayBuffer();

  if (
    buffer.byteLength ===
    0
  ) {
    throw new Error(
      `${source.sourceName} returned an empty file.`,
    );
  }

  return {
    kind:
      "binary",

    sourceKey:
      source.key,

    format:
      source.sourceFormat,

    sourceUrl:
      source.sourceUrl,

    contentType:
      responseContentType(
        response,
      ),

    retrievedAt:
      new Date().toISOString(),

    bytes:
      new Uint8Array(
        buffer,
      ),
  };
}

/* ========================================================================== */
/* Public fetch API                                                            */
/* ========================================================================== */

/**
 * Fetch the raw official-source payload using the source format declared by
 * the national registry.
 *
 * This function performs no record parsing and no operational interpretation.
 */
export async function fetchPublicRecordSourcePayload(
  source: PublicRecordSourceDefinition,
): Promise<PublicRecordSourcePayload> {
  if (
    source.status !==
    "active"
  ) {
    throw new Error(
      `Public-record source ${source.key} is not active.`,
    );
  }

  const response =
    await fetchOfficialSource(
      source,
    );

  switch (
    source.sourceFormat
  ) {
    case "html_table":
    case "csv":
    case "web_portal":
      return readTextPayload(
        source,
        response,
      );

    case "json_api":
      return readJsonPayload(
        source,
        response,
      );

    case "xlsx":
    case "pdf_table":
      return readBinaryPayload(
        source,
        response,
      );
  }
}