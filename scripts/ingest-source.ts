import {
  fetchPublicRecordSourcePayload,
} from "@/server/public-record-source-fetcher";

import {
  toIngestionFailure,
} from "@/server/public-record-source-family";

import {
  PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY,
  parsePublicRecordSourcePayload,
} from "@/server/public-record-source-parser";

import type {
  PublicRecordSourceDefinition,
} from "@/server/public-record-source-registry";

import type {
  StateCode,
} from "@/domain/types";

/**
 * OFFICIAL SOURCE INGESTION HARNESS
 *
 * Runs one official government URL through DueQuity's real production
 * ingestion engine — classification, family parser, schema interpretation and
 * canonical normalization — and prints the result.
 *
 * Nothing is staged. No Opportunity, Claim, Claimant, or outreach is created.
 *
 * Usage:
 *
 *   node --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/duequity-loader.mjs scripts/ingest-source.ts \
 *     --state GA --county "Gwinnett County" --url "<official url>"
 *
 * Optional:
 *
 *   --samples <n>   number of sample records to print (default 3)
 *   --json          print the full machine-readable result
 */

interface Options {
  state: string;

  county: string;

  url: string;

  samples: number;

  json: boolean;
}

function parseOptions(
  argv: readonly string[],
): Options {
  const values =
    new Map<
      string,
      string
    >();

  let json =
    false;

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const token =
      argv[index];

    if (
      token === "--json"
    ) {
      json =
        true;

      continue;
    }

    if (
      token.startsWith(
        "--",
      )
    ) {
      values.set(
        token.slice(
          2,
        ),
        argv[index + 1] ??
          "",
      );

      index +=
        1;
    }
  }

  const url =
    values.get(
      "url",
    ) ??
    "";

  if (
    !url
  ) {
    throw new Error(
      "--url is required.",
    );
  }

  return {
    state:
      (
        values.get(
          "state",
        ) ??
        "XX"
      ).toUpperCase(),

    county:
      values.get(
        "county",
      ) ??
      "Unspecified County",

    url,

    samples:
      Number.parseInt(
        values.get(
          "samples",
        ) ??
          "3",
        10,
      ) ||
      3,

    json,
  };
}

export function diagnosticSource(
  options: {
    state: string;

    county: string;

    url: string;
  },
): PublicRecordSourceDefinition {
  return {
    key:
      `harness:${options.state}:${options.county}`,

    state:
      options.state as StateCode,

    countyName:
      options.county,

    sourceLevel:
      "county",

    sourceName:
      `${options.county} official surplus source`,

    sourceUrl:
      options.url,

    /*
     * Declared family is only a request hint. The engine classifies the real
     * family from the response.
     */
    sourceFormat:
      "html_table",

    parserKey:
      PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY,

    agencyName:
      `${options.county} government`,

    custodian:
      "county_tax_collector",

    saleType:
      "tax_lien_foreclosure",

    status:
      "active",

    supportsBulkPull:
      true,
  };
}

export interface IngestionOutcome {
  state: string;

  county: string;

  url: string;

  supported: boolean;

  detectedFamily?: string;

  formatEvidence?: string;

  recordCount?: number;

  withExactSaleDate?: number;

  withMonthYearOnly?: number;

  withUnknownSaleTiming?: number;

  withSurplusAmount?: number;

  withAddress?: number;

  reason?: string;

  variant?: string;

  message?: string;

  samples?: unknown[];
}

export async function ingestOfficialSource(options: {
  state: string;

  county: string;

  url: string;

  samples?: number;
}): Promise<IngestionOutcome> {
  const source =
    diagnosticSource(
      options,
    );

  const base = {
    state:
      options.state,

    county:
      options.county,

    url:
      options.url,
  };

  let detectedFamily:
    | string
    | undefined;

  let formatEvidence:
    | string
    | undefined;

  try {
    const payload =
      await fetchPublicRecordSourcePayload(
        source,
      );

    detectedFamily =
      payload.format;

    formatEvidence =
      payload.formatEvidence;

    const records =
      await parsePublicRecordSourcePayload(
        source,
        payload,
      );

    return {
      ...base,

      supported:
        true,

      detectedFamily,

      formatEvidence,

      recordCount:
        records.length,

      withExactSaleDate:
        records.filter(
          (record) =>
            record.saleDate !==
            undefined,
        ).length,

      withMonthYearOnly:
        records.filter(
          (record) =>
            record.saleDate ===
              undefined &&
            record.saleMonthYear !==
              undefined,
        ).length,

      withUnknownSaleTiming:
        records.filter(
          (record) =>
            record.saleDate ===
              undefined &&
            record.saleMonthYear ===
              undefined,
        ).length,

      withSurplusAmount:
        records.filter(
          (record) =>
            record.sourceListedSurplusCents !==
            undefined,
        ).length,

      withAddress:
        records.filter(
          (record) =>
            record.addressLine1 !==
            undefined,
        ).length,

      samples:
        records
          .slice(
            0,
            options.samples ??
              3,
          )
          .map(
            (record) => ({
              formerOwnerName:
                record.formerOwnerName,

              propertyId:
                record.propertyId ??
                null,

              parcelNumber:
                record.parcelNumber ??
                null,

              addressLine1:
                record.addressLine1 ??
                null,

              city:
                record.city ??
                null,

              postalCode:
                record.postalCode ??
                null,

              caseNumber:
                record.caseNumber ??
                null,

              saleDate:
                record.saleDate ??
                null,

              saleMonthYear:
                record.saleMonthYear ??
                null,

              sourceSaleTimingText:
                record.sourceSaleTimingText ??
                null,

              surplusDollars:
                record.sourceListedSurplusCents !==
                undefined
                  ? (
                      record.sourceListedSurplusCents /
                      100
                    ).toFixed(
                      2,
                    )
                  : null,
            }),
          ),
    };
  } catch (
    error
  ) {
    const failure =
      toIngestionFailure(
        error,
        "Ingestion failed.",
      );

    return {
      ...base,

      supported:
        false,

      ...(detectedFamily
        ? {
            detectedFamily,
          }
        : failure.detectedFamily
          ? {
              detectedFamily:
                failure.detectedFamily,
            }
          : {}),

      ...(formatEvidence
        ? {
            formatEvidence,
          }
        : {}),

      reason:
        failure.reason,

      ...(failure.variant
        ? {
            variant:
              failure.variant,
          }
        : {}),

      message:
        failure.message,
    };
  }
}

async function main(): Promise<void> {
  const options =
    parseOptions(
      process.argv.slice(
        2,
      ),
    );

  const outcome =
    await ingestOfficialSource(
      options,
    );

  if (
    options.json
  ) {
    console.log(
      JSON.stringify(
        outcome,
        null,
        2,
      ),
    );

    return;
  }

  if (
    !outcome.supported
  ) {
    console.log(
      `UNSUPPORTED / REVIEW REQUIRED`,
    );

    console.log(
      `  reason           ${outcome.reason}`,
    );

    console.log(
      `  detected family  ${outcome.detectedFamily ?? "unknown"}`,
    );

    if (
      outcome.variant
    ) {
      console.log(
        `  variant          ${outcome.variant}`,
      );
    }

    console.log(
      `  detail           ${outcome.message}`,
    );

    process.exitCode =
      1;

    return;
  }

  console.log(
    `SUPPORTED`,
  );

  console.log(
    `  detected family  ${outcome.detectedFamily} (${outcome.formatEvidence})`,
  );

  console.log(
    `  records          ${outcome.recordCount}`,
  );

  console.log(
    `  exact sale date  ${outcome.withExactSaleDate}`,
  );

  console.log(
    `  month/year only  ${outcome.withMonthYearOnly}`,
  );

  console.log(
    `  timing unknown   ${outcome.withUnknownSaleTiming}`,
  );

  console.log(
    `  surplus amount   ${outcome.withSurplusAmount}`,
  );

  console.log(
    `  with address     ${outcome.withAddress}`,
  );

  console.log(
    `  samples:`,
  );

  console.log(
    JSON.stringify(
      outcome.samples,
      null,
      2,
    ),
  );
}

/*
 * Only run as a CLI when invoked directly. The format-matrix harness imports
 * ingestOfficialSource() from this module.
 */
if (
  process.argv[1]
    ?.replace(
      /\\/g,
      "/",
    )
    .endsWith(
      "scripts/ingest-source.ts",
    )
) {
  main().catch(
    (
      error,
    ) => {
      console.error(
        error instanceof Error
          ? error.message
          : error,
      );

      process.exitCode =
        1;
    },
  );
}
