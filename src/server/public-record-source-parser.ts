import "server-only";

import type {
  IsoDate,
} from "@/domain/types";

import type {
  OfficialPublicRecord,
} from "@/server/public-record-discovery";

import {
  resolvePublicRecordJsonProfile,
  publicRecordJsonProfileImplemented,
  type PublicRecordJsonDateFormat,
  type PublicRecordJsonMoneyPath,
  type PublicRecordJsonProfile,
  type PublicRecordJsonRecordKeyField,
} from "@/server/public-record-json-profile";

import {
  extractPublicRecordRows,
} from "@/server/public-record-row-extractor";

import type {
  PublicRecordJsonPayload,
  PublicRecordSourcePayload,
} from "@/server/public-record-source-fetcher";

import type {
  PublicRecordSourceDefinition,
} from "@/server/public-record-source-registry";

import {
  publicRecordHeadersLookLikeSurplusTable,
  resolvePublicRecordTableHeaders,
  type PublicRecordResolvedHeaders,
} from "@/server/public-record-table-header-resolver";

import {
  publicRecordTableProfileImplemented,
  resolvePublicRecordTableProfile,
  type PublicRecordRecordKeyField,
  type PublicRecordTableDateFormat,
  type PublicRecordTableProfile,
} from "@/server/public-record-table-profile";

/**
 * NATIONAL PUBLIC-RECORD SOURCE PARSER
 *
 * Normalizes official government surplus sources into OfficialPublicRecord.
 *
 * Supported parsing paths:
 *
 *   HTML / CSV / XLSX
 *      ↓
 *   Shared row extractor
 *      ↓
 *   Explicit validated table profile
 *      OR
 *   Explicitly selected automatic-header profile
 *      ↓
 *   Generic table mapper
 *
 *   JSON / API
 *      ↓
 *   Validated JSON profile
 *      ↓
 *   Generic JSON mapper
 *
 * Source activation remains controlled by the national source registry.
 * Parsing never approves a jurisdiction, authorizes intake, creates an
 * Opportunity, creates a Claim or authorizes outreach.
 */

/* ========================================================================== */
/* Generic parser key                                                          */
/* ========================================================================== */

export const PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY =
  "auto-header-table-v1";

/* ========================================================================== */
/* Shared text helpers                                                         */
/* ========================================================================== */

function optionalText(
  value: string | undefined,
): string | undefined {
  const normalized =
    value
      ?.replace(
        /\s+/g,
        " ",
      )
      .trim();

  return normalized ||
    undefined;
}

function unknownText(
  value: unknown,
): string | undefined {
  if (
    value === null ||
    value === undefined
  ) {
    return undefined;
  }

  if (
    typeof value ===
      "string"
  ) {
    return optionalText(
      value,
    );
  }

  if (
    typeof value ===
      "number"
  ) {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return undefined;
    }

    return String(
      value,
    );
  }

  if (
    typeof value ===
      "boolean"
  ) {
    return String(
      value,
    );
  }

  return undefined;
}

function cellText(
  cells: readonly string[],
  index: number | undefined,
): string | undefined {
  if (
    index === undefined
  ) {
    return undefined;
  }

  return optionalText(
    cells[index],
  );
}

/* ========================================================================== */
/* Shared date parsing                                                         */
/* ========================================================================== */

function parseUsSlashDate(
  value: string,
): IsoDate | undefined {
  const match =
    value
      .trim()
      .match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      );

  if (
    !match
  ) {
    return undefined;
  }

  const month =
    match[1].padStart(
      2,
      "0",
    );

  const day =
    match[2].padStart(
      2,
      "0",
    );

  return `${match[3]}-${month}-${day}` as IsoDate;
}

function parseIsoDate(
  value: string,
): IsoDate | undefined {
  const normalized =
    value.trim();

  const match =
    normalized.match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
    );

  if (
    !match
  ) {
    return undefined;
  }

  return normalized as IsoDate;
}

function parseTableDate(
  value: string | undefined,
  format: PublicRecordTableDateFormat,
): IsoDate | undefined {
  if (
    !value
  ) {
    return undefined;
  }

  switch (
    format
  ) {
    case "us_slash_date":
      return parseUsSlashDate(
        value,
      );

    case "iso_date":
      return parseIsoDate(
        value,
      );
  }
}

function parseJsonDate(
  value: unknown,
  format: PublicRecordJsonDateFormat,
): IsoDate | undefined {
  const text =
    unknownText(
      value,
    );

  if (
    !text
  ) {
    return undefined;
  }

  switch (
    format
  ) {
    case "us_slash_date":
      return parseUsSlashDate(
        text,
      );

    case "iso_date":
      return parseIsoDate(
        text,
      );
  }
}

/* ========================================================================== */
/* Automatic table date-format detection                                      */
/* ========================================================================== */

function detectTableDateFormat(
  rows: readonly (readonly string[])[],
  column: number,
): PublicRecordTableDateFormat | undefined {
  let usSlashMatches =
    0;

  let isoMatches =
    0;

  for (
    const row of rows.slice(
      0,
      40,
    )
  ) {
    const value =
      cellText(
        row,
        column,
      );

    if (
      !value
    ) {
      continue;
    }

    if (
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(
        value,
      )
    ) {
      usSlashMatches +=
        1;

      continue;
    }

    if (
      /^(\d{4})-(\d{2})-(\d{2})$/.test(
        value,
      )
    ) {
      isoMatches +=
        1;
    }
  }

  if (
    usSlashMatches ===
      0 &&
    isoMatches ===
      0
  ) {
    return undefined;
  }

  if (
    usSlashMatches ===
    isoMatches
  ) {
    return undefined;
  }

  return usSlashMatches >
    isoMatches
    ? "us_slash_date"
    : "iso_date";
}

/* ========================================================================== */
/* Shared money parsing                                                        */
/* ========================================================================== */

function parseMoneyCents(
  value: string | undefined,
): number | undefined {
  if (
    !value
  ) {
    return undefined;
  }

  const normalized =
    value.replace(
      /[^0-9.-]/g,
      "",
    );

  if (
    !normalized
  ) {
    return undefined;
  }

  const amount =
    Number(
      normalized,
    );

  if (
    !Number.isFinite(
      amount,
    )
  ) {
    return undefined;
  }

  const cents =
    Math.round(
      amount *
        100,
    );

  if (
    cents <
    0
  ) {
    return undefined;
  }

  return cents;
}

function parseJsonMoney(
  value: unknown,
  rule: PublicRecordJsonMoneyPath | undefined,
): number | undefined {
  if (
    !rule ||
    value === null ||
    value === undefined
  ) {
    return undefined;
  }

  if (
    rule.format ===
    "dollars"
  ) {
    const text =
      unknownText(
        value,
      );

    return parseMoneyCents(
      text,
    );
  }

  const text =
    unknownText(
      value,
    );

  if (
    !text
  ) {
    return undefined;
  }

  const normalized =
    text.replace(
      /[^0-9.-]/g,
      "",
    );

  if (
    !normalized
  ) {
    return undefined;
  }

  const cents =
    Number(
      normalized,
    );

  if (
    !Number.isFinite(
      cents,
    ) ||
    cents <
      0
  ) {
    return undefined;
  }

  return Math.round(
    cents,
  );
}

/* ========================================================================== */
/* Generic table owner mapping                                                 */
/* ========================================================================== */

interface ParsedOwner {
  formerOwnerName: string;

  sourceFirstName?: string;

  sourceLastNameOrCompany?: string;
}

function parseOwner(
  cells: readonly string[],
  profile: PublicRecordTableProfile,
): ParsedOwner | undefined {
  const sourceFirstName =
    cellText(
      cells,
      profile.owner.firstName,
    );

  const sourceMiddleName =
    cellText(
      cells,
      profile.owner.middleName,
    );

  const sourceLastNameOrCompany =
    cellText(
      cells,
      profile.owner.lastNameOrCompany,
    );

  const fullName =
    cellText(
      cells,
      profile.owner.fullName,
    );

  const formerOwnerName =
    fullName ??
    [
      sourceFirstName,
      sourceMiddleName,
      sourceLastNameOrCompany,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value,
          ),
      )
      .join(
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (
    !formerOwnerName
  ) {
    return undefined;
  }

  return {
    formerOwnerName,

    sourceFirstName,

    sourceLastNameOrCompany,
  };
}

/* ========================================================================== */
/* Generic table case-number mapping                                           */
/* ========================================================================== */

function parseCaseNumber(
  cells: readonly string[],
  profile: PublicRecordTableProfile,
): string | undefined {
  const rule =
    profile.caseNumber;

  if (
    !rule
  ) {
    return undefined;
  }

  const value =
    cellText(
      cells,
      rule.column,
    );

  if (
    !value
  ) {
    return undefined;
  }

  if (
    !rule.pattern
  ) {
    return value;
  }

  rule.pattern.lastIndex =
    0;

  const match =
    value.match(
      rule.pattern,
    );

  if (
    !match
  ) {
    return undefined;
  }

  return optionalText(
    match[1],
  );
}

/* ========================================================================== */
/* Generic table address mapping                                               */
/* ========================================================================== */

interface ParsedAddress {
  addressLine1: string;

  city: string;

  postalCode?: string;
}

function extractPostalCode(
  value: string,
): string | undefined {
  const match =
    value.match(
      /\b(\d{5})(?:-\d{4})?\b/,
    );

  return match
    ?.[1];
}

function titleCaseLocality(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

function parseCombinedUsPremiseAddress(
  premise: string,
  knownCities: readonly string[],
  fallbackCity: string,
): ParsedAddress | undefined {
  const normalizedPremise =
    premise
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (
    !normalizedPremise
  ) {
    return undefined;
  }

  const postalCode =
    extractPostalCode(
      normalizedPremise,
    );

  const withoutZip =
    normalizedPremise
      .replace(
        /\b\d{5}(?:-\d{4})?\b/g,
        "",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  const cityMatch =
    [...knownCities]
      .sort(
        (
          left,
          right,
        ) =>
          right.length -
          left.length,
      )
      .find(
        (city) => {
          const cityPattern =
            new RegExp(
              `(?:^|\\s)${escapeRegExp(
                city,
              ).replace(
                /\\ /g,
                "\\s+",
              )}$`,
              "i",
            );

          return cityPattern.test(
            withoutZip,
          );
        },
      );

  const city =
    cityMatch
      ? titleCaseLocality(
          cityMatch,
        )
      : fallbackCity;

  let addressLine1 =
    withoutZip;

  if (
    cityMatch
  ) {
    const cityPattern =
      new RegExp(
        `\\s+${escapeRegExp(
          cityMatch,
        ).replace(
          /\\ /g,
          "\\s+",
        )}$`,
        "i",
      );

    addressLine1 =
      addressLine1
        .replace(
          cityPattern,
          "",
        )
        .trim();
  }

  if (
    !addressLine1
  ) {
    return undefined;
  }

  return {
    addressLine1,

    city,

    postalCode,
  };
}

function parseAddress(
  cells: readonly string[],
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
): ParsedAddress | undefined {
  switch (
    profile.address.mode
  ) {
    case "structured": {
      const addressLine1 =
        cellText(
          cells,
          profile.address.addressLine1,
        );

      if (
        !addressLine1
      ) {
        return undefined;
      }

      const city =
        cellText(
          cells,
          profile.address.city,
        ) ??
        source.countyName ??
        source.state;

      const postalCode =
        cellText(
          cells,
          profile.address.postalCode,
        );

      return {
        addressLine1,

        city,

        postalCode,
      };
    }

    case "combined_us_premise": {
      const premise =
        cellText(
          cells,
          profile.address.premise,
        );

      if (
        !premise
      ) {
        return undefined;
      }

      return parseCombinedUsPremiseAddress(
        premise,
        profile.address.knownCities ??
          [],
        profile.address.fallbackCity ??
          source.countyName ??
          source.state,
      );
    }
  }
}

/* ========================================================================== */
/* Generic table row validation                                               */
/* ========================================================================== */

function rowMatchesIdentityRule(
  cells: readonly string[],
  profile: PublicRecordTableProfile,
): boolean {
  if (
    cells.length <
    profile.minimumColumns
  ) {
    return false;
  }

  const value =
    cellText(
      cells,
      profile.rowIdentity.column,
    );

  if (
    !value
  ) {
    return false;
  }

  if (
    !profile.rowIdentity.pattern
  ) {
    return true;
  }

  profile.rowIdentity.pattern.lastIndex =
    0;

  return profile.rowIdentity.pattern.test(
    value,
  );
}

/* ========================================================================== */
/* Generic table record-key generation                                        */
/* ========================================================================== */

interface RecordKeyValues {
  propertyId?: string;

  caseNumber?: string;

  saleDate: IsoDate;
}

function recordKeyValue(
  field: PublicRecordRecordKeyField,
  values: RecordKeyValues,
): string {
  switch (
    field
  ) {
    case "property_id":
      return values.propertyId ??
        "";

    case "case_number":
      return values.caseNumber ??
        "";

    case "sale_date":
      return values.saleDate;
  }
}

function buildRecordKey(
  profile: PublicRecordTableProfile,
  values: RecordKeyValues,
): string {
  return profile.recordKey
    .map(
      (field) =>
        recordKeyValue(
          field,
          values,
        ),
    )
    .join(
      ":",
    );
}

/* ========================================================================== */
/* Generic table source-reference generation                                  */
/* ========================================================================== */

function buildSourceReference(
  profile: PublicRecordTableProfile,
  propertyId: string | undefined,
  caseNumber: string | undefined,
): string | undefined {
  const parts: string[] =
    [];

  if (
    profile.sourceReference.propertyId &&
    propertyId
  ) {
    parts.push(
      `Property ID ${propertyId}`,
    );
  }

  if (
    profile.sourceReference.caseNumber &&
    caseNumber
  ) {
    parts.push(
      `Case ${caseNumber}`,
    );
  }

  if (
    parts.length ===
    0
  ) {
    return undefined;
  }

  return parts.join(
    "; ",
  );
}

/* ========================================================================== */
/* Generic table-row mapping                                                   */
/* ========================================================================== */

function parseTableRow(
  cells: readonly string[],
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
): OfficialPublicRecord | undefined {
  if (
    !rowMatchesIdentityRule(
      cells,
      profile,
    )
  ) {
    return undefined;
  }

  const owner =
    parseOwner(
      cells,
      profile,
    );

  if (
    !owner
  ) {
    return undefined;
  }

  const primarySaleDate =
    parseTableDate(
      cellText(
        cells,
        profile.dates.saleDate,
      ),
      profile.dates.format,
    );

  const fallbackSaleDate =
    parseTableDate(
      cellText(
        cells,
        profile.dates.saleDateFallback,
      ),
      profile.dates.format,
    );

  const saleDate =
    primarySaleDate ??
    fallbackSaleDate;

  if (
    !saleDate
  ) {
    return undefined;
  }

  const dateTransferred =
    parseTableDate(
      cellText(
        cells,
        profile.dates.transferredDate,
      ),
      profile.dates.format,
    );

  const address =
    parseAddress(
      cells,
      source,
      profile,
    );

  if (
    !address
  ) {
    return undefined;
  }

  const propertyId =
    cellText(
      cells,
      profile.columns
        ?.propertyId,
    );

  const parcelNumber =
    cellText(
      cells,
      profile.columns
        ?.parcelNumber,
    );

  const mapNumber =
    cellText(
      cells,
      profile.columns
        ?.mapNumber,
    );

  const gridNumber =
    cellText(
      cells,
      profile.columns
        ?.gridNumber,
    );

  const legalDescription =
    cellText(
      cells,
      profile.columns
        ?.legalDescription,
    );

  const currentOwnerName =
    cellText(
      cells,
      profile.columns
        ?.currentOwnerName,
    );

  const caseNumber =
    parseCaseNumber(
      cells,
      profile,
    );

  const bidCents =
    parseMoneyCents(
      cellText(
        cells,
        profile.money
          ?.bid,
      ),
    );

  const depositCents =
    parseMoneyCents(
      cellText(
        cells,
        profile.money
          ?.deposit,
      ),
    );

  const sourceListedSurplusCents =
    parseMoneyCents(
      cellText(
        cells,
        profile.money
          ?.surplus,
      ),
    );

  const recordKey =
    buildRecordKey(
      profile,
      {
        propertyId,

        caseNumber,

        saleDate,
      },
    );

  const sourceReference =
    buildSourceReference(
      profile,
      propertyId,
      caseNumber,
    );

  return {
    adapterKey:
      source.key,

    recordKey,

    propertyId,

    formerOwnerName:
      owner.formerOwnerName,

    sourceFirstName:
      owner.sourceFirstName,

    sourceLastNameOrCompany:
      owner.sourceLastNameOrCompany,

    addressLine1:
      address.addressLine1,

    city:
      address.city,

    county:
      source.countyName ??
      source.state,

    state:
      source.state,

    postalCode:
      address.postalCode,

    saleType:
      source.saleType,

    saleDate,

    dateTransferred,

    caseNumber,

    parcelNumber,

    mapNumber,

    gridNumber,

    legalDescription,

    currentOwnerName,

    bidCents,

    depositCents,

    sourceListedSurplusCents,

    balanceOwedCents:
      sourceListedSurplusCents,

    agencyName:
      source.agencyName,

    agencyPhone:
      source.agencyPhone,

    custodian:
      source.custodian,

    sourceName:
      source.sourceName,

    sourceUrl:
      source.sourceUrl,

    sourceReference,

    confirmedSurplus:
      true,
  };
}

/* ========================================================================== */
/* Common table row-to-record mapping                                          */
/* ========================================================================== */

function parseRowsWithProfile(
  rows: readonly (readonly string[])[],
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
): OfficialPublicRecord[] {
  const records =
    rows
      .map(
        (cells) =>
          parseTableRow(
            cells,
            source,
            profile,
          ),
      )
      .filter(
        (
          record,
        ): record is OfficialPublicRecord =>
          Boolean(
            record,
          ),
      );

  if (
    records.length ===
    0
  ) {
    throw new Error(
      `${source.sourceName} was reachable, but table profile ${profile.key} could not produce any surplus records from the current source structure.`,
    );
  }

  return records;
}

/* ========================================================================== */
/* Explicit validated table profiles                                           */
/* ========================================================================== */

async function parseConfiguredTableSource(
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
  payload: PublicRecordSourcePayload,
): Promise<OfficialPublicRecord[]> {
  const rows =
    await extractPublicRecordRows(
      source,
      profile,
      payload,
    );

  return parseRowsWithProfile(
    rows,
    source,
    profile,
  );
}

/* ========================================================================== */
/* Automatic table-profile construction                                       */
/* ========================================================================== */

function sourceSupportsAutomaticTableParsing(
  source: PublicRecordSourceDefinition,
): boolean {
  return (
    source.sourceFormat ===
      "html_table" ||
    source.sourceFormat ===
      "csv" ||
    source.sourceFormat ===
      "xlsx"
  );
}

function createRowExtractionProbeProfile(
  source: PublicRecordSourceDefinition,
): PublicRecordTableProfile {
  return {
    key:
      `row-extraction-probe:${source.key}`,

    parserKey:
      source.parserKey,

    supportedSourceFormats: [
      source.sourceFormat,
    ],

    minimumColumns:
      1,

    rowIdentity: {
      column:
        0,
    },

    owner: {
      fullName:
        0,
    },

    dates: {
      saleDate:
        0,

      format:
        "us_slash_date",
    },

    address: {
      mode:
        "structured",

      addressLine1:
        0,
    },

    recordKey: [
      "sale_date",
    ],

    sourceReference: {
      propertyId:
        false,

      caseNumber:
        false,
    },
  };
}

function requiredAutoProfileColumnsPresent(
  resolution: PublicRecordResolvedHeaders,
): boolean {
  const columns =
    resolution.columns;

  const hasOwner =
    columns.full_owner_name !==
      undefined ||
    columns.first_name !==
      undefined ||
    columns.last_name_or_company !==
      undefined;

  const hasStablePropertyId =
    columns.property_id !==
    undefined;

  const hasSaleDate =
    columns.sale_date !==
    undefined;

  const hasAddress =
    columns.address_line_1 !==
    undefined;

  const hasSurplus =
    columns.surplus !==
    undefined;

  return (
    hasOwner &&
    hasStablePropertyId &&
    hasSaleDate &&
    hasAddress &&
    hasSurplus
  );
}

function buildAutomaticTableProfile(
  source: PublicRecordSourceDefinition,
  resolution: PublicRecordResolvedHeaders,
  dataRows: readonly (readonly string[])[],
): PublicRecordTableProfile | undefined {
  if (
    !publicRecordHeadersLookLikeSurplusTable(
      resolution,
    )
  ) {
    return undefined;
  }

  if (
    !requiredAutoProfileColumnsPresent(
      resolution,
    )
  ) {
    return undefined;
  }

  const columns =
    resolution.columns;

  const propertyIdColumn =
    columns.property_id;

  const saleDateColumn =
    columns.sale_date;

  const addressColumn =
    columns.address_line_1;

  const surplusColumn =
    columns.surplus;

  if (
    propertyIdColumn ===
      undefined ||
    saleDateColumn ===
      undefined ||
    addressColumn ===
      undefined ||
    surplusColumn ===
      undefined
  ) {
    return undefined;
  }

  const dateFormat =
    detectTableDateFormat(
      dataRows,
      saleDateColumn,
    );

  if (
    !dateFormat
  ) {
    return undefined;
  }

  const requiredIndexes = [
    propertyIdColumn,
    saleDateColumn,
    addressColumn,
    surplusColumn,
  ];

  if (
    columns.full_owner_name !==
    undefined
  ) {
    requiredIndexes.push(
      columns.full_owner_name,
    );
  } else {
    if (
      columns.first_name !==
      undefined
    ) {
      requiredIndexes.push(
        columns.first_name,
      );
    }

    if (
      columns.last_name_or_company !==
      undefined
    ) {
      requiredIndexes.push(
        columns.last_name_or_company,
      );
    }
  }

  const recordKey:
    PublicRecordRecordKeyField[] = [
      "property_id",
    ];

  if (
    columns.case_number !==
    undefined
  ) {
    recordKey.push(
      "case_number",
    );
  }

  recordKey.push(
    "sale_date",
  );

  return {
    key:
      `auto-header:${source.key}`,

    parserKey:
      source.parserKey,

    supportedSourceFormats: [
      source.sourceFormat,
    ],

    minimumColumns:
      Math.max(
        ...requiredIndexes,
      ) +
      1,

    rowIdentity: {
      column:
        propertyIdColumn,
    },

    owner: {
      ...(columns.full_owner_name !==
      undefined
        ? {
            fullName:
              columns.full_owner_name,
          }
        : {}),

      ...(columns.first_name !==
      undefined
        ? {
            firstName:
              columns.first_name,
          }
        : {}),

      ...(columns.last_name_or_company !==
      undefined
        ? {
            lastNameOrCompany:
              columns.last_name_or_company,
          }
        : {}),
    },

    dates: {
      saleDate:
        saleDateColumn,

      ...(columns.transferred_date !==
      undefined
        ? {
            transferredDate:
              columns.transferred_date,
          }
        : {}),

      format:
        dateFormat,
    },

    address: {
      mode:
        "structured",

      addressLine1:
        addressColumn,

      ...(columns.city !==
      undefined
        ? {
            city:
              columns.city,
          }
        : {}),

      ...(columns.postal_code !==
      undefined
        ? {
            postalCode:
              columns.postal_code,
          }
        : {}),
    },

    money: {
      surplus:
        surplusColumn,

      ...(columns.bid !==
      undefined
        ? {
            bid:
              columns.bid,
          }
        : {}),

      ...(columns.deposit !==
      undefined
        ? {
            deposit:
              columns.deposit,
          }
        : {}),
    },

    columns: {
      propertyId:
        propertyIdColumn,

      ...(columns.parcel_number !==
      undefined
        ? {
            parcelNumber:
              columns.parcel_number,
          }
        : {}),

      ...(columns.map_number !==
      undefined
        ? {
            mapNumber:
              columns.map_number,
          }
        : {}),

      ...(columns.grid_number !==
      undefined
        ? {
            gridNumber:
              columns.grid_number,
          }
        : {}),

      ...(columns.legal_description !==
      undefined
        ? {
            legalDescription:
              columns.legal_description,
          }
        : {}),

      ...(columns.current_owner_name !==
      undefined
        ? {
            currentOwnerName:
              columns.current_owner_name,
          }
        : {}),
    },

    ...(columns.case_number !==
    undefined
      ? {
          caseNumber: {
            column:
              columns.case_number,
          },
        }
      : {}),

    recordKey,

    sourceReference: {
      propertyId:
        true,

      caseNumber:
        columns.case_number !==
        undefined,
    },
  };
}

/* ========================================================================== */
/* Automatic header-driven table parser                                       */
/* ========================================================================== */

async function parseAutomaticHeaderTableSource(
  source: PublicRecordSourceDefinition,
  payload: PublicRecordSourcePayload,
): Promise<OfficialPublicRecord[]> {
  if (
    !sourceSupportsAutomaticTableParsing(
      source,
    )
  ) {
    throw new Error(
      `Automatic table parsing is not available for source format ${source.sourceFormat}.`,
    );
  }

  const probeProfile =
    createRowExtractionProbeProfile(
      source,
    );

  const rows =
    await extractPublicRecordRows(
      source,
      probeProfile,
      payload,
    );

  const resolution =
    resolvePublicRecordTableHeaders(
      rows,
    );

  if (
    !resolution
  ) {
    throw new Error(
      `${source.sourceName} did not contain a sufficiently recognizable surplus-table header.`,
    );
  }

  if (
    !publicRecordHeadersLookLikeSurplusTable(
      resolution,
    )
  ) {
    throw new Error(
      `${source.sourceName} contained recognizable headers, but the required surplus-record fields were incomplete.`,
    );
  }

  const dataRows =
    rows.slice(
      resolution.headerRowIndex +
        1,
    );

  const generatedProfile =
    buildAutomaticTableProfile(
      source,
      resolution,
      dataRows,
    );

  if (
    !generatedProfile
  ) {
    throw new Error(
      `${source.sourceName} could not be mapped safely into Duequity's automatic surplus-table profile.`,
    );
  }

  return parseRowsWithProfile(
    dataRows,
    source,
    generatedProfile,
  );
}

/* ========================================================================== */
/* JSON path resolution                                                        */
/* ========================================================================== */

function isJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
}

/**
 * Resolve a simple dot path through JSON objects.
 *
 * Array traversal and expression evaluation are intentionally unsupported.
 */
function resolveJsonPath(
  value: unknown,
  path: string,
): unknown {
  const parts =
    path
      .split(
        ".",
      )
      .map(
        (part) =>
          part.trim(),
      )
      .filter(
        Boolean,
      );

  if (
    parts.length ===
    0
  ) {
    return undefined;
  }

  let current:
    unknown =
    value;

  for (
    const part of parts
  ) {
    if (
      !isJsonObject(
        current,
      )
    ) {
      return undefined;
    }

    current =
      current[
        part
      ];
  }

  return current;
}

function jsonField(
  record: Record<string, unknown>,
  path: string | undefined,
): unknown {
  if (
    !path
  ) {
    return undefined;
  }

  return resolveJsonPath(
    record,
    path,
  );
}

/* ========================================================================== */
/* JSON records array resolution                                              */
/* ========================================================================== */

function resolveJsonRecords(
  profile: PublicRecordJsonProfile,
  payload: PublicRecordJsonPayload,
): Record<string, unknown>[] {
  const rawRecords =
    profile.recordsPath ===
    null
      ? payload.value
      : resolveJsonPath(
          payload.value,
          profile.recordsPath,
        );

  if (
    !Array.isArray(
      rawRecords,
    )
  ) {
    throw new Error(
      `JSON profile ${profile.key} could not resolve its configured records array.`,
    );
  }

  const records =
    rawRecords.filter(
      (
        value,
      ): value is Record<string, unknown> =>
        isJsonObject(
          value,
        ),
    );

  if (
    records.length ===
    0
  ) {
    throw new Error(
      `JSON profile ${profile.key} did not contain any readable record objects.`,
    );
  }

  return records;
}

/* ========================================================================== */
/* Generic JSON owner mapping                                                 */
/* ========================================================================== */

function parseJsonOwner(
  record: Record<string, unknown>,
  profile: PublicRecordJsonProfile,
): ParsedOwner | undefined {
  const sourceFirstName =
    unknownText(
      jsonField(
        record,
        profile.owner.firstName,
      ),
    );

  const sourceLastNameOrCompany =
    unknownText(
      jsonField(
        record,
        profile.owner.lastNameOrCompany,
      ),
    );

  const fullName =
    unknownText(
      jsonField(
        record,
        profile.owner.fullName,
      ),
    );

  const formerOwnerName =
    fullName ??
    [
      sourceFirstName,
      sourceLastNameOrCompany,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value,
          ),
      )
      .join(
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (
    !formerOwnerName
  ) {
    return undefined;
  }

  return {
    formerOwnerName,

    sourceFirstName,

    sourceLastNameOrCompany,
  };
}

/* ========================================================================== */
/* Generic JSON record-key generation                                        */
/* ========================================================================== */

function jsonRecordKeyValue(
  field: PublicRecordJsonRecordKeyField,
  values: RecordKeyValues,
): string {
  switch (
    field
  ) {
    case "property_id":
      return values.propertyId ??
        "";

    case "case_number":
      return values.caseNumber ??
        "";

    case "sale_date":
      return values.saleDate;
  }
}

function buildJsonRecordKey(
  profile: PublicRecordJsonProfile,
  values: RecordKeyValues,
): string {
  return profile.recordKey
    .map(
      (field) =>
        jsonRecordKeyValue(
          field,
          values,
        ),
    )
    .join(
      ":",
    );
}

/* ========================================================================== */
/* Generic JSON source-reference generation                                   */
/* ========================================================================== */

function buildJsonSourceReference(
  profile: PublicRecordJsonProfile,
  propertyId: string | undefined,
  caseNumber: string | undefined,
): string | undefined {
  const parts: string[] =
    [];

  if (
    profile.sourceReference.propertyId &&
    propertyId
  ) {
    parts.push(
      `Property ID ${propertyId}`,
    );
  }

  if (
    profile.sourceReference.caseNumber &&
    caseNumber
  ) {
    parts.push(
      `Case ${caseNumber}`,
    );
  }

  if (
    parts.length ===
    0
  ) {
    return undefined;
  }

  return parts.join(
    "; ",
  );
}

/* ========================================================================== */
/* Generic JSON record mapping                                                */
/* ========================================================================== */

function parseJsonRecord(
  record: Record<string, unknown>,
  source: PublicRecordSourceDefinition,
  profile: PublicRecordJsonProfile,
): OfficialPublicRecord | undefined {
  const owner =
    parseJsonOwner(
      record,
      profile,
    );

  if (
    !owner
  ) {
    return undefined;
  }

  const primarySaleDate =
    parseJsonDate(
      jsonField(
        record,
        profile.dates.saleDate,
      ),
      profile.dates.format,
    );

  const fallbackSaleDate =
    parseJsonDate(
      jsonField(
        record,
        profile.dates.saleDateFallback,
      ),
      profile.dates.format,
    );

  const saleDate =
    primarySaleDate ??
    fallbackSaleDate;

  if (
    !saleDate
  ) {
    return undefined;
  }

  const dateTransferred =
    parseJsonDate(
      jsonField(
        record,
        profile.dates.transferredDate,
      ),
      profile.dates.format,
    );

  const addressLine1 =
    unknownText(
      jsonField(
        record,
        profile.address.addressLine1,
      ),
    );

  if (
    !addressLine1
  ) {
    return undefined;
  }

  const city =
    unknownText(
      jsonField(
        record,
        profile.address.city,
      ),
    ) ??
    source.countyName ??
    source.state;

  const postalCode =
    unknownText(
      jsonField(
        record,
        profile.address.postalCode,
      ),
    );

  const propertyId =
    unknownText(
      jsonField(
        record,
        profile.fields
          ?.propertyId,
      ),
    );

  const parcelNumber =
    unknownText(
      jsonField(
        record,
        profile.fields
          ?.parcelNumber,
      ),
    );

  const mapNumber =
    unknownText(
      jsonField(
        record,
        profile.fields
          ?.mapNumber,
      ),
    );

  const gridNumber =
    unknownText(
      jsonField(
        record,
        profile.fields
          ?.gridNumber,
      ),
    );

  const legalDescription =
    unknownText(
      jsonField(
        record,
        profile.fields
          ?.legalDescription,
      ),
    );

  const currentOwnerName =
    unknownText(
      jsonField(
        record,
        profile.fields
          ?.currentOwnerName,
      ),
    );

  const caseNumber =
    unknownText(
      jsonField(
        record,
        profile.fields
          ?.caseNumber,
      ),
    );

  const bidCents =
    parseJsonMoney(
      jsonField(
        record,
        profile.money
          ?.bid
          ?.path,
      ),
      profile.money
        ?.bid,
    );

  const depositCents =
    parseJsonMoney(
      jsonField(
        record,
        profile.money
          ?.deposit
          ?.path,
      ),
      profile.money
        ?.deposit,
    );

  const sourceListedSurplusCents =
    parseJsonMoney(
      jsonField(
        record,
        profile.money
          ?.surplus
          ?.path,
      ),
      profile.money
        ?.surplus,
    );

  const recordKey =
    buildJsonRecordKey(
      profile,
      {
        propertyId,

        caseNumber,

        saleDate,
      },
    );

  const sourceReference =
    buildJsonSourceReference(
      profile,
      propertyId,
      caseNumber,
    );

  return {
    adapterKey:
      source.key,

    recordKey,

    propertyId,

    formerOwnerName:
      owner.formerOwnerName,

    sourceFirstName:
      owner.sourceFirstName,

    sourceLastNameOrCompany:
      owner.sourceLastNameOrCompany,

    addressLine1,

    city,

    county:
      source.countyName ??
      source.state,

    state:
      source.state,

    postalCode,

    saleType:
      source.saleType,

    saleDate,

    dateTransferred,

    caseNumber,

    parcelNumber,

    mapNumber,

    gridNumber,

    legalDescription,

    currentOwnerName,

    bidCents,

    depositCents,

    sourceListedSurplusCents,

    balanceOwedCents:
      sourceListedSurplusCents,

    agencyName:
      source.agencyName,

    agencyPhone:
      source.agencyPhone,

    custodian:
      source.custodian,

    sourceName:
      source.sourceName,

    sourceUrl:
      source.sourceUrl,

    sourceReference,

    confirmedSurplus:
      true,
  };
}

/* ========================================================================== */
/* Validated JSON/API parser                                                  */
/* ========================================================================== */

function parseConfiguredJsonSource(
  source: PublicRecordSourceDefinition,
  profile: PublicRecordJsonProfile,
  payload: PublicRecordSourcePayload,
): OfficialPublicRecord[] {
  if (
    source.sourceFormat !==
    "json_api"
  ) {
    throw new Error(
      `JSON profile ${profile.key} cannot parse source format ${source.sourceFormat}.`,
    );
  }

  if (
    payload.kind !==
      "json" ||
    payload.format !==
      "json_api"
  ) {
    throw new Error(
      `Source ${source.key} did not return the expected JSON/API payload.`,
    );
  }

  const sourceRecords =
    resolveJsonRecords(
      profile,
      payload,
    );

  const records =
    sourceRecords
      .map(
        (record) =>
          parseJsonRecord(
            record,
            source,
            profile,
          ),
      )
      .filter(
        (
          record,
        ): record is OfficialPublicRecord =>
          Boolean(
            record,
          ),
      );

  if (
    records.length ===
    0
  ) {
    throw new Error(
      `${source.sourceName} was reachable, but JSON profile ${profile.key} could not produce any surplus records from the current response structure.`,
    );
  }

  return records;
}

/* ========================================================================== */
/* Public parser API                                                           */
/* ========================================================================== */

/**
 * Convert one retrieved official-source payload into normalized public records.
 *
 * Parser selection is explicit:
 *
 *   - validated table profile
 *   - opt-in automatic table parser
 *   - validated JSON/API profile
 *
 * Missing profiles fail closed.
 */
export async function parsePublicRecordSourcePayload(
  source: PublicRecordSourceDefinition,
  payload: PublicRecordSourcePayload,
): Promise<OfficialPublicRecord[]> {
  if (
    payload.sourceKey !==
    source.key
  ) {
    throw new Error(
      `Source payload ${payload.sourceKey} does not belong to source ${source.key}.`,
    );
  }

  const explicitTableProfile =
    resolvePublicRecordTableProfile(
      source.parserKey,
    );

  if (
    explicitTableProfile
  ) {
    return parseConfiguredTableSource(
      source,
      explicitTableProfile,
      payload,
    );
  }

  if (
    source.parserKey ===
    PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY
  ) {
    return parseAutomaticHeaderTableSource(
      source,
      payload,
    );
  }

  const jsonProfile =
    resolvePublicRecordJsonProfile(
      source.parserKey,
    );

  if (
    jsonProfile
  ) {
    return parseConfiguredJsonSource(
      source,
      jsonProfile,
      payload,
    );
  }

  throw new Error(
    `Duequity parser profile ${source.parserKey} is not implemented.`,
  );
}

/**
 * Whether the configured parser profile is implemented by the current runtime.
 */
export function publicRecordParserImplemented(
  parserKey: string,
): boolean {
  return (
    publicRecordTableProfileImplemented(
      parserKey,
    ) ||
    parserKey ===
      PUBLIC_RECORD_AUTO_TABLE_PARSER_KEY ||
    publicRecordJsonProfileImplemented(
      parserKey,
    )
  );
}