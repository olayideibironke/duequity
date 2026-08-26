import { NextRequest, NextResponse } from "next/server";

import type { StateCode } from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import { loadNationalGeography } from "@/server/geography-resolver";

import { fetchPublicRecordSourcePayload } from "@/server/public-record-source-fetcher";

import { toIngestionFailure } from "@/server/public-record-source-family";

import {
  PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY,
  parsePublicRecordSourcePayload,
} from "@/server/public-record-source-parser";

import type { PublicRecordSourceDefinition } from "@/server/public-record-source-registry";

import { resolvePublicRecordSourceWithDiagnostics } from "@/server/public-record-source-auto-discovery";

import { resolveStaffSession } from "@/server/staff-session";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/**
 * NATIONAL INGESTION DIAGNOSTIC
 *
 * Read-only. Runs the real production ingestion engine and reports what family
 * was detected, how many official records parsed, and — when parsing is not
 * possible — the review reason.
 *
 * Two modes:
 *
 *   1. Jurisdiction mode
 *      ?state=GA&countyGeoid=13135
 *      Full pipeline: discovery → classification → parse.
 *
 *   2. Direct-source mode
 *      ?state=GA&countyGeoid=13135&url=<official government URL>
 *      Skips discovery and runs classification → parse against one known
 *      official document. Used to certify a source family.
 *
 * This endpoint does NOT:
 *
 *   - stage discovered records
 *   - create Opportunities, Claims, or Claimants
 *   - approve jurisdictions
 *   - authorize intake or outreach
 */

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,

      error: message,
    },
    {
      status,

      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function jsonResponse(body: unknown) {
  return NextResponse.json(body, {
    status: 200,

    headers: {
      "Cache-Control": "no-store",
    },
  });
}

const OPERATIONAL_EFFECTS = {
  recordsStaged: 0,

  opportunitiesCreated: 0,

  claimsCreated: 0,

  claimantsCreated: 0,

  outreachAuthorized: false,
} as const;

function sampleRecord(record: {
  formerOwnerName: string;

  propertyId?: string;

  parcelNumber?: string;

  addressLine1?: string;

  city?: string;

  postalCode?: string;

  saleDate?: string;

  saleMonthYear?: string;

  sourceSaleTimingText?: string;

  caseNumber?: string;

  sourceListedSurplusCents?: number;
}) {
  return {
    formerOwnerName: record.formerOwnerName,

    propertyId: record.propertyId ?? null,

    parcelNumber: record.parcelNumber ?? null,

    addressLine1: record.addressLine1 ?? null,

    city: record.city ?? null,

    postalCode: record.postalCode ?? null,

    saleDate: record.saleDate ?? null,

    saleMonthYear: record.saleMonthYear ?? null,

    sourceSaleTimingText: record.sourceSaleTimingText ?? null,

    caseNumber: record.caseNumber ?? null,

    sourceListedSurplusDollars:
      record.sourceListedSurplusCents !== undefined
        ? (record.sourceListedSurplusCents / 100).toFixed(2)
        : null,
  };
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(request: NextRequest) {
  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "opportunity.write")) {
    return errorResponse(
      "You do not have permission to run the public-record ingestion diagnostic.",
      403,
    );
  }

  const parameters = request.nextUrl.searchParams;

  const stateParam = parameters.get("state")?.trim().toUpperCase();

  const countyGeoid = parameters.get("countyGeoid")?.trim();

  const directUrl = parameters.get("url")?.trim();

  if (!stateParam || !countyGeoid) {
    return errorResponse("State and countyGeoid are required.", 400);
  }

  const geography = await loadNationalGeography();

  const state = geography.states.find(
    (candidate) => candidate.postalCode === stateParam,
  );

  if (!state) {
    return errorResponse(
      "State was not found in the national geography registry.",
      400,
    );
  }

  const county = state.counties.find(
    (candidate) => candidate.geoid === countyGeoid,
  );

  if (!county) {
    return errorResponse(
      "County GEOID was not found in the selected state.",
      400,
    );
  }

  if (!clearedForState(session, state.postalCode)) {
    return errorResponse(
      `You are not cleared to inspect public-record sources in ${state.postalCode}.`,
      403,
    );
  }

  const jurisdiction = {
    state: state.postalCode,

    stateName: state.name,

    county: county.name,

    countyGeoid: county.geoid,
  };

  /* -- Direct-source mode -------------------------------------------------- */

  if (directUrl) {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(directUrl);
    } catch {
      return errorResponse(
        "The url parameter is not a valid absolute URL.",
        400,
      );
    }

    if (parsedUrl.protocol !== "https:") {
      return errorResponse(
        "Only https official sources may be inspected.",
        400,
      );
    }

    const source: PublicRecordSourceDefinition = {
      key: `ingestion-diagnostic:${state.postalCode}:${county.geoid}`,

      state: state.postalCode as StateCode,

      countyGeoid: county.geoid,

      countyName: county.name,

      sourceLevel: "county",

      sourceName: `${county.name} official surplus source (diagnostic)`,

      sourceUrl: parsedUrl.toString(),

      /*
       * Declared format is only a request hint. The engine classifies the real
       * family from the response itself.
       */
      sourceFormat: "html_table",

      parserKey: PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY,

      agencyName: `${county.name} government`,

      custodian: "county_tax_collector",

      saleType: "tax_lien_foreclosure",

      status: "active",

      supportsBulkPull: true,
    };

    try {
      const payload = await fetchPublicRecordSourcePayload(source);

      const records = await parsePublicRecordSourcePayload(source, payload);

      return jsonResponse({
        ok: true,

        mode: "direct_source",

        jurisdiction,

        source: {
          sourceUrl: source.sourceUrl,

          retrievedUrl: payload.retrievedUrl,

          detectedFamily: payload.format,

          formatEvidence: payload.formatEvidence,

          contentType: payload.contentType ?? null,
        },

        parsing: {
          supported: true,

          recordCount: records.length,

          recordsWithExactSaleDate: records.filter(
            (record) => record.saleDate !== undefined,
          ).length,

          recordsWithMonthYearOnly: records.filter(
            (record) =>
              record.saleDate === undefined &&
              record.saleMonthYear !== undefined,
          ).length,

          recordsWithUnknownSaleTiming: records.filter(
            (record) =>
              record.saleDate === undefined &&
              record.saleMonthYear === undefined,
          ).length,

          recordsWithSurplusAmount: records.filter(
            (record) => record.sourceListedSurplusCents !== undefined,
          ).length,

          sampleRecords: records.slice(0, 8).map(sampleRecord),
        },

        operationalEffects: OPERATIONAL_EFFECTS,
      });
    } catch (error) {
      const failure = toIngestionFailure(error, "Ingestion failed.");

      return jsonResponse({
        ok: true,

        mode: "direct_source",

        jurisdiction,

        source: {
          sourceUrl: source.sourceUrl,
        },

        parsing: {
          supported: false,

          reason: failure.reason,

          detectedFamily: failure.detectedFamily ?? null,

          variant: failure.variant ?? null,

          message: failure.message,

          reviewRequired: true,
        },

        operationalEffects: OPERATIONAL_EFFECTS,
      });
    }
  }

  /* -- Jurisdiction mode --------------------------------------------------- */

  try {
    const resolution = await resolvePublicRecordSourceWithDiagnostics({
      state: state.postalCode,

      county: county.name,

      countyGeoid: county.geoid,
    });

    if (!resolution.source) {
      return jsonResponse({
        ok: true,

        mode: "jurisdiction",

        jurisdiction,

        resolved: false,

        reviewRequired: true,

        reason: resolution.reviewReason ?? "UNSUPPORTED_SOURCE_FAMILY",

        message: resolution.message,

        discovery: {
          domainsInspected: resolution.domainsInspected,

          candidatesConsidered: resolution.candidatesConsidered,

          attempts: resolution.attempts,
        },

        operationalEffects: OPERATIONAL_EFFECTS,
      });
    }

    const source = resolution.source;

    const payload = await fetchPublicRecordSourcePayload(source);

    const records = await parsePublicRecordSourcePayload(source, payload);

    return jsonResponse({
      ok: true,

      mode: "jurisdiction",

      jurisdiction,

      resolved: true,

      source: {
        key: source.key,

        sourceName: source.sourceName,

        sourceUrl: source.sourceUrl,

        declaredFamily: source.sourceFormat,

        detectedFamily: payload.format,

        formatEvidence: payload.formatEvidence,

        parserKey: source.parserKey,

        agencyName: source.agencyName,

        custodian: source.custodian,

        saleType: source.saleType,

        fromRegistry: resolution.fromRegistry,
      },

      parsing: {
        supported: true,

        recordCount: records.length,

        sampleRecords: records.slice(0, 8).map(sampleRecord),
      },

      discovery: {
        domainsInspected: resolution.domainsInspected,

        candidatesConsidered: resolution.candidatesConsidered,

        attempts: resolution.attempts,
      },

      operationalEffects: OPERATIONAL_EFFECTS,
    });
  } catch (error) {
    const failure = toIngestionFailure(error, "Ingestion diagnostic failed.");

    return jsonResponse({
      ok: true,

      mode: "jurisdiction",

      jurisdiction,

      resolved: true,

      parsing: {
        supported: false,

        reason: failure.reason,

        detectedFamily: failure.detectedFamily ?? null,

        variant: failure.variant ?? null,

        message: failure.message,

        reviewRequired: true,
      },

      operationalEffects: OPERATIONAL_EFFECTS,
    });
  }
}
