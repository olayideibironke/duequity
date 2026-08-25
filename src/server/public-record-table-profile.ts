import "server-only";

import type {
  PublicRecordSourceFormat,
} from "@/server/public-record-source-registry";

/**
 * PUBLIC RECORD TABLE PROFILES
 *
 * A table profile describes how a government source's columns map into
 * Duequity's normalized public-record model.
 *
 * The important distinction:
 *
 *   Source registry:
 *     Where is the official source?
 *
 *   Source fetcher:
 *     How do we retrieve it?
 *
 *   Table profile:
 *     What do its columns mean?
 *
 *   Source parser:
 *     Convert the mapped values into normalized records.
 *
 * National sources are allowed to publish facts at different levels of
 * completeness and precision.
 *
 * In particular:
 *
 *   - an exact sale date may be absent
 *   - a source may publish only sale month/year
 *   - a property street address may be absent
 *   - parcel/property identity may still make the record usable
 *
 * Profiles describe source evidence. They must not force the parser to invent
 * missing facts.
 */

/* ========================================================================== */
/* Shared types                                                                */
/* ========================================================================== */

export type PublicRecordTableDateFormat =
  | "us_slash_date"
  | "iso_date";

/**
 * Precision-preserving formats for sources that publish only a month/year.
 *
 * These are deliberately separate from PublicRecordTableDateFormat because:
 *
 *   08/2024
 *
 * is not:
 *
 *   08/01/2024
 *
 * and Duequity must never manufacture an exact day.
 */
export type PublicRecordTableMonthYearFormat =
  | "us_slash_month_year"
  | "iso_month"
  | "month_name_year";

export type PublicRecordRecordKeyField =
  | "property_id"
  | "case_number"
  | "sale_date";

export interface PublicRecordTableOwnerColumns {
  /**
   * Use when the source provides first name separately.
   */
  firstName?: number;

  /**
   * Use when the source provides middle name or middle initial separately.
   */
  middleName?: number;

  /**
   * Use when the source provides last name, company, trust, estate or another
   * owner value separately.
   */
  lastNameOrCompany?: number;

  /**
   * Use when the source publishes one combined owner-name column.
   */
  fullName?: number;
}

export interface PublicRecordTableDateColumns {
  /**
   * Exact primary sale-date column when the source publishes day precision.
   *
   * Optional because many legitimate government surplus sources publish only
   * sale month/year.
   */
  saleDate?: number;

  /**
   * Optional fallback exact-date column when saleDate is blank.
   */
  saleDateFallback?: number;

  /**
   * Source column containing sale timing at month/year precision.
   *
   * Example:
   *
   *   08/2024
   *   2024-08
   *   August 2024
   *
   * This must not be converted into an invented first or last day.
   */
  saleMonthYear?: number;

  /**
   * Optional fallback month/year column.
   */
  saleMonthYearFallback?: number;

  /**
   * Optional independent transfer date.
   */
  transferredDate?: number;

  /**
   * Exact-date parsing format.
   *
   * Existing configured profiles depend on this field. For a source that has
   * only month/year timing, the exact-date columns are simply absent and this
   * value is not used for sale timing.
   */
  format: PublicRecordTableDateFormat;

  /**
   * Month/year parsing format when saleMonthYear is configured.
   */
  monthYearFormat?: PublicRecordTableMonthYearFormat;
}

export interface PublicRecordStructuredAddressColumns {
  mode: "structured";

  /**
   * Property/situs street-address column when the source publishes one.
   *
   * Optional because a government surplus list may identify the property by
   * parcel number without publishing a street address.
   */
  addressLine1?: number;

  city?: number;

  postalCode?: number;
}

export interface PublicRecordCombinedAddressColumns {
  /**
   * Used when one source column contains a complete premise such as:
   *
   *   123 MAIN ST WESTMINSTER 21157
   *
   * The generic parser can separate ZIP and match a configured city suffix.
   */
  mode: "combined_us_premise";

  /**
   * Combined premise column when supplied.
   *
   * Optional so a profile may preserve the shape of a source even when
   * property-location evidence is absent.
   */
  premise?: number;

  /**
   * Known locality suffixes published by the source.
   *
   * These belong in configuration rather than parser code.
   */
  knownCities?: readonly string[];

  /**
   * Safe fallback when a city cannot be extracted from the premise.
   */
  fallbackCity?: string;
}

export type PublicRecordTableAddressColumns =
  | PublicRecordStructuredAddressColumns
  | PublicRecordCombinedAddressColumns;

export interface PublicRecordTableMoneyColumns {
  bid?: number;

  deposit?: number;

  /**
   * Source-native surplus, excess proceeds, balance owed or equivalent amount.
   */
  surplus?: number;
}

export interface PublicRecordTableAdditionalColumns {
  propertyId?: number;

  parcelNumber?: number;

  mapNumber?: number;

  gridNumber?: number;

  legalDescription?: number;

  currentOwnerName?: number;
}

export interface PublicRecordTableCaseNumberRule {
  /**
   * Column containing the case number or text from which it can be extracted.
   */
  column: number;

  /**
   * Optional extraction pattern.
   *
   * Capture group 1 must contain the resulting case number.
   *
   * When omitted, the entire normalized cell is used.
   */
  pattern?: RegExp;
}

export interface PublicRecordTableRowIdentityRule {
  /**
   * Column that identifies real data rows and allows header/footer rows to be
   * ignored.
   */
  column: number;

  /**
   * Optional validation pattern for the identity value.
   */
  pattern?: RegExp;
}

export interface PublicRecordTableProfile {
  /**
   * Stable profile identifier.
   */
  key: string;

  /**
   * Must match the parserKey stored by the national source registry.
   */
  parserKey: string;

  /**
   * Transport formats whose raw rows can use this profile.
   */
  supportedSourceFormats: readonly PublicRecordSourceFormat[];

  /**
   * Ignore source rows shorter than this.
   */
  minimumColumns: number;

  /**
   * Distinguishes actual source records from headers and unrelated rows.
   */
  rowIdentity: PublicRecordTableRowIdentityRule;

  owner: PublicRecordTableOwnerColumns;

  /**
   * Government-published sale timing.
   *
   * The profile may contain an exact date, month/year timing, or both.
   */
  dates: PublicRecordTableDateColumns;

  /**
   * Property-location mapping.
   *
   * The address object remains present so existing configured profiles remain
   * structurally compatible, but its source columns may be absent.
   */
  address: PublicRecordTableAddressColumns;

  money?: PublicRecordTableMoneyColumns;

  columns?: PublicRecordTableAdditionalColumns;

  caseNumber?: PublicRecordTableCaseNumberRule;

  /**
   * Stable source-native fields used to construct recordKey.
   *
   * Missing optional fields are represented by an empty token rather than
   * guessed.
   *
   * Automatic profiles are not required to include sale_date when the source
   * publishes only month/year timing.
   */
  recordKey: readonly PublicRecordRecordKeyField[];

  /**
   * Whether a source reference should include the property ID and case number
   * when those values are available.
   */
  sourceReference: {
    propertyId: boolean;

    caseNumber: boolean;
  };
}

/* ========================================================================== */
/* Carroll County, Maryland                                                    */
/* ========================================================================== */

/**
 * Carroll County is the first validated configuration-driven table profile.
 *
 * Official source column order:
 *
 *  0 No.
 *  1 Property ID
 *  2 Map
 *  3 Blk / Grid
 *  4 Parcel
 *  5 First Name
 *  6 Last Name / Company
 *  7 Date Sold
 *  8 Date Transferred
 *  9 Bid
 * 10 Deposit
 * 11 Balance Owed
 * 12 Liber
 * 13 Folio
 * 14 Premise
 * 15 Legal Description
 * 16 Current Owner
 * 17 Current Liber
 * 18 Current Folio
 * 19 Comment
 */
const CARROLL_TAX_SALE_SURPLUS_PROFILE: PublicRecordTableProfile = {
  key:
    "md-carroll-tax-sale-surplus-table-v1",

  parserKey:
    "md-carroll-tax-sale-surplus-v1",

  supportedSourceFormats: [
    "html_table",
  ],

  minimumColumns:
    20,

  rowIdentity: {
    column:
      1,

    pattern:
      /^[0-9]{2}-/,
  },

  owner: {
    firstName:
      5,

    lastNameOrCompany:
      6,
  },

  dates: {
    saleDate:
      7,

    saleDateFallback:
      8,

    transferredDate:
      8,

    format:
      "us_slash_date",
  },

  address: {
    mode:
      "combined_us_premise",

    premise:
      14,

    knownCities: [
      "WESTMINSTER",
      "TANEYTOWN",
      "MANCHESTER",
      "HAMPSTEAD",
      "FINKSBURG",
      "SYKESVILLE",
      "MOUNT AIRY",
      "NEW WINDSOR",
      "UNION BRIDGE",
      "WOODBINE",
      "ELDERSBURG",
      "MARRIOTTSVILLE",
    ],

    fallbackCity:
      "Carroll County",
  },

  money: {
    bid:
      9,

    deposit:
      10,

    surplus:
      11,
  },

  columns: {
    propertyId:
      1,

    mapNumber:
      2,

    gridNumber:
      3,

    parcelNumber:
      4,

    legalDescription:
      15,

    currentOwnerName:
      16,
  },

  caseNumber: {
    column:
      19,

    pattern:
      /\bCASE\s*:?\s*([A-Z0-9-]+)/i,
  },

  recordKey: [
    "property_id",
    "case_number",
    "sale_date",
  ],

  sourceReference: {
    propertyId:
      true,

    caseNumber:
      true,
  },
};

/* ========================================================================== */
/* DeKalb County, Georgia                                                      */
/* ========================================================================== */

/**
 * DeKalb County Tax Commissioner Excess Funds List.
 *
 * Current official PDF column order:
 *
 * 0 Parcel ID
 * 1 Excess Amount
 * 2 Sale Date
 * 3 First Name
 * 4 Middle
 * 5 Last Name
 * 6 Situs Address
 * 7 City
 * 8 ZIP Code
 *
 * Parcel ID is mapped to both the generic propertyId field and the more
 * descriptive parcelNumber field. It remains source-native evidence.
 *
 * This profile enables source parsing only. It does not approve Georgia or
 * DeKalb County for claimant engagement, representation or payment routing.
 */
const DEKALB_EXCESS_FUNDS_PROFILE: PublicRecordTableProfile = {
  key:
    "ga-dekalb-excess-funds-pdf-table-v1",

  parserKey:
    "ga-dekalb-excess-funds-v1",

  supportedSourceFormats: [
    "pdf_table",
  ],

  minimumColumns:
    9,

  rowIdentity: {
    column:
      0,

    pattern:
      /^\d{2}\s+\d{3}\s+\d{2}\s+\d{3}$/,
  },

  owner: {
    firstName:
      3,

    middleName:
      4,

    lastNameOrCompany:
      5,
  },

  dates: {
    saleDate:
      2,

    format:
      "us_slash_date",
  },

  address: {
    mode:
      "structured",

    addressLine1:
      6,

    city:
      7,

    postalCode:
      8,
  },

  money: {
    surplus:
      1,
  },

  columns: {
    propertyId:
      0,

    parcelNumber:
      0,
  },

  recordKey: [
    "property_id",
    "sale_date",
  ],

  sourceReference: {
    propertyId:
      true,

    caseNumber:
      false,
  },
};

/* ========================================================================== */
/* Profile registry                                                            */
/* ========================================================================== */

const TABLE_PROFILES: readonly PublicRecordTableProfile[] = [
  CARROLL_TAX_SALE_SURPLUS_PROFILE,
  DEKALB_EXCESS_FUNDS_PROFILE,
];

/**
 * Return every implemented configuration-driven table profile.
 */
export function listPublicRecordTableProfiles(): readonly PublicRecordTableProfile[] {
  return TABLE_PROFILES;
}

/**
 * Resolve the table profile declared by a source parserKey.
 */
export function resolvePublicRecordTableProfile(
  parserKey: string,
): PublicRecordTableProfile | undefined {
  return TABLE_PROFILES.find(
    (profile) =>
      profile.parserKey ===
      parserKey,
  );
}

/**
 * True when the parserKey has a configuration-driven table profile.
 */
export function publicRecordTableProfileImplemented(
  parserKey: string,
): boolean {
  return Boolean(
    resolvePublicRecordTableProfile(
      parserKey,
    ),
  );
}