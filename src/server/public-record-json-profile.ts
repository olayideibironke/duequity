import "server-only";

/**
 * NATIONAL PUBLIC-RECORD JSON PROFILES
 *
 * Official government APIs often return structured JSON instead of rows.
 *
 * A JSON profile describes how Duequity reads normalized evidence from those
 * objects without creating source-specific parser code.
 *
 * Example source shapes:
 *
 *   [
 *     {
 *       "ownerName": "JANE DOE",
 *       "parcel": "123-456",
 *       "saleDate": "2026-01-15",
 *       "surplus": 12500.50
 *     }
 *   ]
 *
 * or:
 *
 *   {
 *     "results": [
 *       {
 *         "owner": {
 *           "name": "JANE DOE"
 *         }
 *       }
 *     ]
 *   }
 *
 * Paths use simple dot notation:
 *
 *   owner.name
 *   property.parcel
 *   financial.surplus
 *
 * Array traversal and arbitrary expression execution are deliberately not
 * supported here.
 */

/* ========================================================================== */
/* Shared types                                                                */
/* ========================================================================== */

export type PublicRecordJsonDateFormat =
  | "us_slash_date"
  | "iso_date";

export type PublicRecordJsonMoneyFormat =
  | "dollars"
  | "cents";

export type PublicRecordJsonRecordKeyField =
  | "property_id"
  | "case_number"
  | "sale_date";

export interface PublicRecordJsonOwnerPaths {
  firstName?: string;

  lastNameOrCompany?: string;

  fullName?: string;
}

export interface PublicRecordJsonDatePaths {
  saleDate: string;

  saleDateFallback?: string;

  transferredDate?: string;

  format: PublicRecordJsonDateFormat;
}

export interface PublicRecordJsonAddressPaths {
  addressLine1: string;

  city?: string;

  postalCode?: string;
}

export interface PublicRecordJsonMoneyPath {
  path: string;

  format: PublicRecordJsonMoneyFormat;
}

export interface PublicRecordJsonMoneyPaths {
  bid?: PublicRecordJsonMoneyPath;

  deposit?: PublicRecordJsonMoneyPath;

  surplus?: PublicRecordJsonMoneyPath;
}

export interface PublicRecordJsonAdditionalPaths {
  propertyId?: string;

  parcelNumber?: string;

  mapNumber?: string;

  gridNumber?: string;

  legalDescription?: string;

  currentOwnerName?: string;

  caseNumber?: string;
}

export interface PublicRecordJsonProfile {
  /**
   * Stable profile identifier.
   */
  key: string;

  /**
   * Must match the parserKey stored by the national source registry.
   */
  parserKey: string;

  /**
   * Dot path to the array containing source records.
   *
   * Use null when the root JSON value itself is the array.
   */
  recordsPath: string | null;

  owner: PublicRecordJsonOwnerPaths;

  dates: PublicRecordJsonDatePaths;

  address: PublicRecordJsonAddressPaths;

  money?: PublicRecordJsonMoneyPaths;

  fields?: PublicRecordJsonAdditionalPaths;

  /**
   * Stable source-native fields used to build recordKey.
   */
  recordKey: readonly PublicRecordJsonRecordKeyField[];

  sourceReference: {
    propertyId: boolean;

    caseNumber: boolean;
  };
}

/* ========================================================================== */
/* Profile registry                                                            */
/* ========================================================================== */

/**
 * No JSON/API jurisdiction is activated yet.
 *
 * Profiles are added only after an official source has been identified and its
 * response structure has been validated.
 */
const JSON_PROFILES: readonly PublicRecordJsonProfile[] = [];

/**
 * Return every validated JSON/API profile.
 */
export function listPublicRecordJsonProfiles(): readonly PublicRecordJsonProfile[] {
  return JSON_PROFILES;
}

/**
 * Resolve a validated JSON/API profile by parserKey.
 */
export function resolvePublicRecordJsonProfile(
  parserKey: string,
): PublicRecordJsonProfile | undefined {
  return JSON_PROFILES.find(
    (profile) =>
      profile.parserKey === parserKey,
  );
}

/**
 * Whether a JSON/API parser profile is currently implemented.
 */
export function publicRecordJsonProfileImplemented(
  parserKey: string,
): boolean {
  return Boolean(
    resolvePublicRecordJsonProfile(
      parserKey,
    ),
  );
}