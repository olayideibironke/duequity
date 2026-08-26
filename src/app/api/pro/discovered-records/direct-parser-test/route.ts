import { NextResponse } from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  fetchPublicRecordSourcePayload,
} from "@/server/public-record-source-fetcher";

import {
  PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY,
  parsePublicRecordSourcePayload,
} from "@/server/public-record-source-parser";

import type {
  PublicRecordSourceDefinition,
} from "@/server/public-record-source-registry";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      ok:
        false,

      error:
        message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

/**
 * DIRECT OFFICIAL-SOURCE PARSER DIAGNOSTIC
 *
 * Downloads the live Gwinnett official excess-funds PDF and runs it through
 * DueQuity's real automatic national parser.
 *
 * This endpoint is read-only.
 *
 * It does NOT:
 *
 *   - stage discovered records
 *   - create Opportunities
 *   - create Claims
 *   - approve jurisdictions
 *   - authorize intake
 *   - authorize outreach
 */
export async function GET() {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  if (
    !can(
      session,
      "opportunity.write",
    )
  ) {
    return errorResponse(
      "You do not have permission to run the public-record parser diagnostic.",
      403,
    );
  }

  const source:
    PublicRecordSourceDefinition = {
    key:
      "diagnostic-ga-gwinnett-excess-funds",

    state:
      "GA",

    countyGeoid:
      "13135",

    countyName:
      "Gwinnett County",

    sourceLevel:
      "county",

    sourceName:
      "Gwinnett County Tax Commissioner Excess Funds",

    sourceUrl:
      "https://www.gwinnetttaxcommissioner.com/documents/d/egov/excess-funds-all-years-rev05019026-pdf?download=true",

    sourceFormat:
      "pdf_table",

    parserKey:
      PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY,

    agencyName:
      "Gwinnett County Tax Commissioner",

    custodian:
      "county_tax_collector",

    saleType:
      "tax_lien_foreclosure",

    status:
      "active",

    supportsBulkPull:
      true,
  };

  try {
    const payload =
      await fetchPublicRecordSourcePayload(
        source,
      );

    const records =
      await parsePublicRecordSourcePayload(
        source,
        payload,
      );

    const stMoriah =
      records.find(
        (record) =>
          record.formerOwnerName
            .toUpperCase()
            .includes(
              "ST MORIAH",
            ),
      );

    return NextResponse.json(
      {
        ok:
          true,

        source: {
          sourceName:
            source.sourceName,

          sourceUrl:
            source.sourceUrl,

          sourceFormat:
            source.sourceFormat,

          parserKey:
            source.parserKey,
        },

        parsing: {
          recordCount:
            records.length,

          sampleRecords:
            records
              .slice(
                0,
                8,
              )
              .map(
                (record) => ({
                  formerOwnerName:
                    record.formerOwnerName,

                  parcelNumber:
                    record.parcelNumber,

                  propertyId:
                    record.propertyId,

                  addressLine1:
                    record.addressLine1,

                  city:
                    record.city,

                  saleDate:
                    record.saleDate,

                  saleMonthYear:
                    record.saleMonthYear,

                  sourceSaleTimingText:
                    record.sourceSaleTimingText,

                  sourceListedSurplusCents:
                    record.sourceListedSurplusCents,

                  sourceListedSurplusDollars:
                    record.sourceListedSurplusCents !==
                    undefined
                      ? (
                          record.sourceListedSurplusCents /
                          100
                        ).toFixed(
                          2,
                        )
                      : null,

                  sourceReference:
                    record.sourceReference,
                }),
              ),
        },

        mergedCellProof:
          stMoriah
            ? {
                found:
                  true,

                formerOwnerName:
                  stMoriah.formerOwnerName,

                parcelNumber:
                  stMoriah.parcelNumber,

                addressLine1:
                  stMoriah.addressLine1,

                saleDate:
                  stMoriah.saleDate,

                saleMonthYear:
                  stMoriah.saleMonthYear,

                sourceSaleTimingText:
                  stMoriah.sourceSaleTimingText,

                sourceListedSurplusCents:
                  stMoriah.sourceListedSurplusCents,

                sourceListedSurplusDollars:
                  stMoriah.sourceListedSurplusCents !==
                  undefined
                    ? (
                        stMoriah.sourceListedSurplusCents /
                        100
                      ).toFixed(
                        2,
                      )
                    : null,
              }
            : {
                found:
                  false,
              },

        message:
          "The live Gwinnett official PDF was parsed using DueQuity's production automatic table parser. No records were staged.",
      },
      {
        status:
          200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (
    error
  ) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Direct official-source parser diagnostic failed.",
      500,
    );
  }
}