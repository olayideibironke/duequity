import "server-only";

import {
  classifyPublicRecordFamily,
  decodeSourceText,
  ingestionFailure,
  isArcGisJsonValue,
  looksLikeArcGisEndpoint,
} from "@/server/public-record-source-family";

import type {
  PublicRecordSourceDefinition,
  PublicRecordSourceFormat,
} from "@/server/public-record-source-registry";

/**
 * NATIONAL PUBLIC-RECORD SOURCE FETCHER
 *
 * Transport is separated from parsing.
 *
 * This module retrieves an official source, determines the family the response
 * ACTUALLY belongs to, and preserves the raw evidence. It does not know what a
 * county column means, who a claimant is, whether a surplus amount is
 * confirmed, or whether intake is allowed.
 *
 * Retrieval is always performed as bytes and then classified. The registry's
 * declared format is a routing hint used for request negotiation only, so a
 * county that swaps an HTML list for a spreadsheet, or serves a PDF from an
 * extensionless URL, keeps ingesting with no code change.
 *
 * Supported transport families:
 *
 *   - HTML table
 *   - CSV / delimited text
 *   - XLSX workbook
 *   - PDF (searchable / table-like)
 *   - JSON API
 *   - ArcGIS REST FeatureServer / MapServer
 *   - web portal (fails closed pending review)
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface PublicRecordPayloadBase {
  sourceKey: string;

  sourceUrl: string;

  /**
   * URL actually retrieved. ArcGIS query composition and redirects can differ
   * from the configured source URL.
   */
  retrievedUrl: string;

  contentType?: string;

  retrievedAt: string;

  /**
   * Registry-declared family before classification.
   */
  declaredFormat: PublicRecordSourceFormat;

  /**
   * How the real family was determined.
   */
  formatEvidence: string;
}

export interface PublicRecordTextPayload extends PublicRecordPayloadBase {
  kind: "text";

  format: "html_table" | "csv" | "web_portal";

  text: string;
}

export interface PublicRecordJsonPayload extends PublicRecordPayloadBase {
  kind: "json";

  format: "json_api" | "arcgis";

  value: unknown;

  /**
   * Number of ArcGIS pages merged into `value`. Absent for plain JSON.
   */
  pagesRetrieved?: number;
}

export interface PublicRecordBinaryPayload extends PublicRecordPayloadBase {
  kind: "binary";

  format: "xlsx" | "pdf_table";

  bytes: Uint8Array;
}

export type PublicRecordSourcePayload =
  PublicRecordTextPayload | PublicRecordJsonPayload | PublicRecordBinaryPayload;

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const REQUEST_TIMEOUT_MS = 45000;

/** Deadline for streaming one official document body. */
const BODY_TIMEOUT_MS = 60000;

/** Ceiling on one official document. Larger publications need review. */
const MAX_DOCUMENT_BYTES = 80 * 1024 * 1024;

const USER_AGENT = "DueQuity Official Public Record Research";

/** Bounded ArcGIS pagination. Official layers are paged, never unbounded. */
const ARCGIS_PAGE_SIZE = 1000;

const ARCGIS_MAX_PAGES = 25;

/* ========================================================================== */
/* HTTP helpers                                                                */
/* ========================================================================== */

function acceptHeader(format: PublicRecordSourceFormat): string {
  switch (format) {
    case "html_table":
    case "web_portal":
      return "text/html,application/xhtml+xml,*/*;q=0.5";

    case "csv":
      return "text/csv,text/plain;q=0.9,*/*;q=0.5";

    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel;q=0.9,application/octet-stream;q=0.8,*/*;q=0.5";

    case "pdf_table":
      return "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5";

    case "json_api":
    case "arcgis":
      return "application/json,text/json;q=0.9,*/*;q=0.5";
  }
}

async function fetchOfficialUrl(
  url: string,
  sourceName: string,
  format: PublicRecordSourceFormat,
): Promise<{
  response: Response;

  bytes: Uint8Array;
}> {
  const controller = new AbortController();

  /*
   * The abort signal covers the request/headers phase only. Aborting while the
   * body is still streaming leaves the socket's HTTP parser paused and makes
   * Node assert, which crashes the process instead of failing the request. The
   * body is bounded below by a reader deadline and cancelled gracefully.
   */
  let headerTimeout: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  const clearHeaderTimeout = (): void => {
    if (headerTimeout) {
      clearTimeout(headerTimeout);

      headerTimeout = undefined;
    }
  };

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",

      cache: "no-store",

      redirect: "follow",

      signal: controller.signal,

      headers: {
        Accept: acceptHeader(format),

        "User-Agent": USER_AGENT,
      },
    });
  } catch {
    throw ingestionFailure({
      reason: "SOURCE_UNREACHABLE",

      message: `DueQuity could not reach ${sourceName}.`,
    });
  } finally {
    clearHeaderTimeout();
  }

  if (!response.ok) {
    /*
     * Drain rather than cancel: cancelling pauses the HTTP parser and the
     * runtime asserts if the server then closes the socket.
     */
    try {
      await response.arrayBuffer();
    } catch {
      // The body may already be released.
    }

    throw ingestionFailure({
      reason: "SOURCE_UNREACHABLE",

      message: `${sourceName} returned HTTP ${response.status}.`,
    });
  }

  const bytes = await readResponseBytes(response, sourceName);

  return {
    response,

    bytes,
  };
}

/**
 * Read a response body with a graceful deadline and a size ceiling.
 *
 * Cancelling the reader releases the connection cleanly, unlike aborting the
 * request signal mid-stream.
 */
async function readResponseBytes(
  response: Response,
  sourceName: string,
): Promise<Uint8Array> {
  const body = response.body;

  if (!body) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();

  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), BODY_TIMEOUT_MS);
  });

  const chunks: Uint8Array[] = [];

  let received = 0;

  let completed = false;

  try {
    for (;;) {
      const result = await Promise.race([reader.read(), deadline]);

      if (result === "timeout") {
        throw ingestionFailure({
          reason: "SOURCE_UNREACHABLE",

          message: `${sourceName} stopped responding while its document was being downloaded.`,
        });
      }

      if (result.done) {
        completed = true;

        break;
      }

      const chunk = result.value;

      if (!chunk) {
        continue;
      }

      received += chunk.byteLength;

      if (received > MAX_DOCUMENT_BYTES) {
        throw ingestionFailure({
          reason: "UNSUPPORTED_SOURCE_FAMILY",

          message: `${sourceName} published a document larger than DueQuity's ingestion limit. Review required.`,

          variant: "document_too_large",
        });
      }

      chunks.push(chunk);
    }
  } finally {
    if (timer) {
      clearTimeout(timer);
    }

    /*
     * Only cancel when the read loop exited early. Cancelling a completed
     * stream is unnecessary, and cancelling pauses the HTTP parser, which the
     * runtime asserts on if the server then closes the socket.
     */
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // The stream may already be closed.
      }
    }
  }

  const bytes = new Uint8Array(received);

  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);

    offset += chunk.byteLength;
  }

  return bytes;
}

function responseContentType(response: Response): string | undefined {
  const value = response.headers.get("content-type")?.trim();

  return value || undefined;
}

/* ========================================================================== */
/* ArcGIS query composition                                                    */
/* ========================================================================== */

/**
 * Build a records query for an ArcGIS layer URL.
 *
 * Accepts either a layer root (".../FeatureServer/0") or an existing query URL
 * and normalizes it into a paged attribute-only request. This one function
 * covers every ArcGIS-hosted county list.
 */
function arcGisQueryUrl(sourceUrl: string, offset: number): string {
  const url = new URL(sourceUrl);

  if (!/\/query\/?$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/query`;
  }

  const parameters = url.searchParams;

  if (!parameters.get("where") && !parameters.get("objectIds")) {
    parameters.set("where", "1=1");
  }

  if (!parameters.get("outFields")) {
    parameters.set("outFields", "*");
  }

  parameters.set("returnGeometry", "false");

  parameters.set("f", "json");

  parameters.set("resultOffset", String(offset));

  parameters.set("resultRecordCount", String(ARCGIS_PAGE_SIZE));

  return url.toString();
}

interface ArcGisPage {
  features: unknown[];

  exceededTransferLimit: boolean;

  error?: string;
}

function readArcGisPage(value: unknown): ArcGisPage {
  if (typeof value !== "object" || value === null) {
    return {
      features: [],

      exceededTransferLimit: false,

      error: "The ArcGIS layer returned a non-object response.",
    };
  }

  const record = value as Record<string, unknown>;

  const errorValue = record.error;

  if (typeof errorValue === "object" && errorValue !== null) {
    const detail = (errorValue as Record<string, unknown>).message;

    return {
      features: [],

      exceededTransferLimit: false,

      error:
        typeof detail === "string"
          ? detail
          : "The ArcGIS layer returned an error response.",
    };
  }

  return {
    features: Array.isArray(record.features) ? record.features : [],

    exceededTransferLimit: record.exceededTransferLimit === true,
  };
}

/**
 * Retrieve every page of an ArcGIS layer and merge the features.
 */
async function fetchArcGisFeatures(
  source: PublicRecordSourceDefinition,
): Promise<{
  value: unknown;

  contentType?: string;

  retrievedUrl: string;

  pagesRetrieved: number;
}> {
  const features: unknown[] = [];

  let pagesRetrieved = 0;

  let contentType: string | undefined;

  let firstUrl = source.sourceUrl;

  for (let page = 0; page < ARCGIS_MAX_PAGES; page += 1) {
    const requestUrl = arcGisQueryUrl(
      source.sourceUrl,
      page * ARCGIS_PAGE_SIZE,
    );

    if (page === 0) {
      firstUrl = requestUrl;
    }

    const { response, bytes } = await fetchOfficialUrl(
      requestUrl,
      source.sourceName,
      "arcgis",
    );

    contentType = responseContentType(response);

    let value: unknown;

    try {
      value = JSON.parse(decodeSourceText(bytes));
    } catch {
      throw ingestionFailure({
        reason: "UNSUPPORTED_SOURCE_FAMILY",

        message: `${source.sourceName} responded to an ArcGIS query with a body that is not JSON.`,

        detectedFamily: "arcgis",
      });
    }

    const parsed = readArcGisPage(value);

    if (parsed.error) {
      throw ingestionFailure({
        reason: "SOURCE_UNREACHABLE",

        message: `${source.sourceName} ArcGIS layer error: ${parsed.error}`,

        detectedFamily: "arcgis",
      });
    }

    pagesRetrieved += 1;

    features.push(...parsed.features);

    if (
      parsed.features.length < ARCGIS_PAGE_SIZE &&
      !parsed.exceededTransferLimit
    ) {
      break;
    }

    if (parsed.features.length === 0) {
      break;
    }
  }

  return {
    value: {
      features,
    },

    contentType,

    retrievedUrl: firstUrl,

    pagesRetrieved,
  };
}

/* ========================================================================== */
/* Payload construction                                                        */
/* ========================================================================== */

function buildPayload({
  source,
  family,
  evidence,
  bytes,
  contentType,
  retrievedUrl,
}: {
  source: PublicRecordSourceDefinition;

  family: PublicRecordSourceFormat;

  evidence: string;

  bytes: Uint8Array;

  contentType?: string;

  retrievedUrl: string;
}): PublicRecordSourcePayload {
  const base = {
    sourceKey: source.key,

    sourceUrl: source.sourceUrl,

    retrievedUrl,

    contentType,

    retrievedAt: new Date().toISOString(),

    declaredFormat: source.sourceFormat,

    formatEvidence: evidence,
  };

  switch (family) {
    case "pdf_table":
    case "xlsx":
      return {
        kind: "binary",

        format: family,

        bytes,

        ...base,
      };

    case "json_api":
    case "arcgis": {
      let value: unknown;

      try {
        value = JSON.parse(decodeSourceText(bytes));
      } catch {
        throw ingestionFailure({
          reason: "UNSUPPORTED_SOURCE_FAMILY",

          message: `${source.sourceName} returned a response that could not be parsed as JSON.`,

          detectedFamily: family,
        });
      }

      return {
        kind: "json",

        format: isArcGisJsonValue(value) ? "arcgis" : family,

        value,

        ...base,
      };
    }

    case "html_table":
    case "csv":
    case "web_portal": {
      const text = decodeSourceText(bytes);

      if (!text.trim()) {
        throw ingestionFailure({
          reason: "SOURCE_EMPTY",

          message: `${source.sourceName} returned an empty response.`,
        });
      }

      return {
        kind: "text",

        format: family,

        text,

        ...base,
      };
    }
  }
}

/* ========================================================================== */
/* Public fetch API                                                            */
/* ========================================================================== */

/**
 * Fetch the raw official-source payload and label it with the family the
 * response actually belongs to.
 *
 * This function performs no record parsing and no operational interpretation.
 */
export async function fetchPublicRecordSourcePayload(
  source: PublicRecordSourceDefinition,
): Promise<PublicRecordSourcePayload> {
  if (source.status !== "active") {
    throw ingestionFailure({
      reason: "SOURCE_CONFIGURATION_MISMATCH",

      message: `Public-record source ${source.key} is not active.`,
    });
  }

  /*
   * ArcGIS requires query composition and pagination before any body exists,
   * so it is retrieved through its own path rather than by classification.
   */
  if (
    source.sourceFormat === "arcgis" ||
    looksLikeArcGisEndpoint(source.sourceUrl)
  ) {
    const arcgis = await fetchArcGisFeatures(source);

    return {
      kind: "json",

      format: "arcgis",

      sourceKey: source.key,

      sourceUrl: source.sourceUrl,

      retrievedUrl: arcgis.retrievedUrl,

      contentType: arcgis.contentType,

      retrievedAt: new Date().toISOString(),

      declaredFormat: source.sourceFormat,

      formatEvidence: "arcgis_rest_endpoint",

      value: arcgis.value,

      pagesRetrieved: arcgis.pagesRetrieved,
    };
  }

  const { response, bytes } = await fetchOfficialUrl(
    source.sourceUrl,
    source.sourceName,
    source.sourceFormat,
  );

  const contentType = responseContentType(response);

  const classification = classifyPublicRecordFamily({
    bytes,

    contentType,

    contentDisposition:
      response.headers.get("content-disposition") ?? undefined,

    url: response.url || source.sourceUrl,

    declaredFormat: source.sourceFormat,
  });

  return buildPayload({
    source,

    family: classification.family,

    evidence: classification.evidence,

    bytes,

    contentType,

    retrievedUrl: response.url || source.sourceUrl,
  });
}
