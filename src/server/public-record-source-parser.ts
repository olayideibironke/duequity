import "server-only";

import type {
  IsoDate,
} from "@/domain/types";

import type {
  OfficialPublicRecord,
} from "@/server/public-record-discovery";

import {
  extractPublicRecordRows,
} from "@/server/public-record-row-extractor";

import type {
  PublicRecordSourcePayload,
} from "@/server/public-record-source-fetcher";

import type {
  PublicRecordSourceDefinition,
} from "@/server/public-record-source-registry";

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
 * Configuration-driven parser for official government surplus records.
 *
 * Flow:
 *
 *   Source registry
 *      ↓
 *   Source fetcher
 *      ↓
 *   Raw source payload
 *      ↓
 *   Shared row extractor
 *      ↓
 *   Table profile
 *      ↓
 *   Generic row mapper
 *      ↓
 *   Normalized OfficialPublicRecord
 *
 * This module does not contain:
 *
 *   - jurisdiction-specific routing
 *   - HTTP retrieval
 *   - HTML-table extraction
 *   - CSV parsing
 *   - XLSX workbook parsing
 *   - county-specific column numbers
 *
 * The table profile describes what each source column means. The shared row
 * extractor converts supported transports into string[][] rows.
 */

/* ========================================================================== */
/* Shared cell helpers                                                         */
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
/* Generic date parsing                                                        */
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

/* ========================================================================== */
/* Generic money parsing                                                       */
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

/* ========================================================================== */
/* Generic owner mapping                                                       */
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
/* Generic case-number mapping                                                 */
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
/* Generic address mapping                                                     */
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

  /*
   * Prefer the longest configured locality so names such as MOUNT AIRY are
   * matched before a shorter overlapping value.
   */
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
/* Generic row validation                                                      */
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

  /*
   * Reset lastIndex defensively in case a future profile supplies a global or
   * sticky RegExp.
   */
  profile.rowIdentity.pattern.lastIndex =
    0;

  return profile.rowIdentity.pattern.test(
    value,
  );
}

/* ========================================================================== */
/* Generic record-key generation                                               */
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
/* Generic source-reference generation                                        */
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

    /*
     * Retain the existing staging compatibility field.
     *
     * This remains source-native evidence and does not establish operational
     * confirmed surplus.
     */
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

    /*
     * Source-level only.
     *
     * The active official government source publishes the record as part of
     * its surplus-related dataset. Operational confirmation remains separate.
     */
    confirmedSurplus:
      true,
  };
}

/* ========================================================================== */
/* Generic table-profile parser                                                */
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
/* Public parser API                                                           */
/* ========================================================================== */

/**
 * Convert one retrieved official-source payload into normalized public records.
 *
 * The parserKey resolves to configuration. There are no county-specific parser
 * branches here.
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

  const profile =
    resolvePublicRecordTableProfile(
      source.parserKey,
    );

  if (
    !profile
  ) {
    throw new Error(
      `Duequity parser profile ${source.parserKey} is not implemented.`,
    );
  }

  return parseConfiguredTableSource(
    source,
    profile,
    payload,
  );
}

/**
 * Whether the configured parser profile is implemented by the current runtime.
 */
export function publicRecordParserImplemented(
  parserKey: string,
): boolean {
  return publicRecordTableProfileImplemented(
    parserKey,
  );
}