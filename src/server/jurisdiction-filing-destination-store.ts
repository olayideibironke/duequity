import "server-only";

import type {
  IsoInstant,
} from "@/domain/types";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * JURISDICTION FILING DESTINATION STORE
 *
 * Operational filing destinations for approved DueQuity jurisdiction routes.
 *
 * PURPOSE
 *
 * DueQuity staff must never have to independently search for the address,
 * email address, government portal, courthouse, clerk office, or other
 * destination needed to submit a claim.
 *
 * The approved jurisdiction workflow must resolve:
 *
 *   - WHO receives the filing;
 *   - WHERE it is sent;
 *   - HOW it is submitted;
 *   - WHAT instructions apply;
 *   - WHICH official source supports that destination.
 *
 * This store is deliberately separate from the legal/payment jurisdiction
 * rule so that operational destination changes can be versioned without
 * rewriting historical legal determinations.
 *
 * HISTORICAL PRINCIPLE
 *
 * Filing destinations are versioned.
 *
 * A later change to an agency address, email address, portal, department or
 * filing process must create a new destination version instead of silently
 * changing the historical destination used by an older filing package.
 *
 * SUBMISSION BLOCKING PRINCIPLE
 *
 * A real external submission must not be recorded unless the selected
 * submission method has a complete verified operational destination.
 *
 * Examples:
 *
 *   email
 *     -> verified filing email required
 *
 *   mail
 *     -> complete mailing address required
 *
 *   online
 *     -> official filing portal required
 *
 *   in_person
 *     -> complete physical delivery address required
 *
 *   court_e_filing
 *     -> official court/e-filing portal required
 *
 * No function in this file contacts an agency or submits a claim.
 */

/* ========================================================================== */
/* Submission methods                                                          */
/* ========================================================================== */

export type JurisdictionFilingMethod =
  | "email"
  | "mail"
  | "online"
  | "in_person"
  | "court_e_filing";

/* ========================================================================== */
/* Destination status                                                          */
/* ========================================================================== */

export type JurisdictionFilingDestinationStatus =
  | "verified"
  | "superseded";

/* ========================================================================== */
/* Address                                                                     */
/* ========================================================================== */

export interface JurisdictionFilingAddress {
  line1: string;

  line2?: string;

  city: string;

  stateCode: string;

  postalCode: string;

  countryCode: string;
}

/* ========================================================================== */
/* Destination                                                                 */
/* ========================================================================== */

export interface JurisdictionFilingDestination {
  id: string;

  jurisdictionPackageId: string;

  jurisdictionPackageVersion: number;

  jurisdictionId: string;

  destinationVersion: number;

  status: JurisdictionFilingDestinationStatus;

  submissionMethod: JurisdictionFilingMethod;

  agencyName: string;

  departmentName?: string;

  attentionLine?: string;

  filingEmail?: string;

  mailingAddress?: JurisdictionFilingAddress;

  physicalAddress?: JurisdictionFilingAddress;

  portalUrl?: string;

  phone?: string;

  filingInstructions: string[];

  officialSourceUrl: string;

  officialSourceTitle?: string;

  evidenceNote?: string;

  verifiedByUserId: string;

  verifiedAt: IsoInstant;

  supersededAt?: IsoInstant;

  supersededByDestinationId?: string;

  createdAt: IsoInstant;
}

/* ========================================================================== */
/* Readiness                                                                   */
/* ========================================================================== */

export interface JurisdictionFilingDestinationReadiness {
  complete: boolean;

  submissionMethod: JurisdictionFilingMethod;

  missingFields: string[];

  detail: string;
}

/* ========================================================================== */
/* Database row                                                                */
/* ========================================================================== */

interface JurisdictionFilingDestinationRow {
  id: string;

  jurisdiction_package_id: string;

  jurisdiction_package_version: number;

  jurisdiction_id: string;

  destination_version: number;

  status: JurisdictionFilingDestinationStatus;

  submission_method: JurisdictionFilingMethod;

  agency_name: string;

  department_name: string | null;

  attention_line: string | null;

  filing_email: string | null;

  mailing_address:
    JurisdictionFilingAddress | null;

  physical_address:
    JurisdictionFilingAddress | null;

  portal_url: string | null;

  phone: string | null;

  filing_instructions: string[];

  official_source_url: string;

  official_source_title: string | null;

  evidence_note: string | null;

  verified_by_user_id: string;

  verified_at: string;

  superseded_at: string | null;

  superseded_by_destination_id: string | null;

  created_at: string;
}

/* ========================================================================== */
/* Validation helpers                                                          */
/* ========================================================================== */

function normalizedText(
  value:
    string | undefined | null,
): string | undefined {
  const normalized =
    value?.trim();

  return normalized ||
    undefined;
}

function isPositiveInteger(
  value: number,
): boolean {
  return (
    Number.isInteger(
      value,
    ) &&
    value >
      0
  );
}

function isValidEmail(
  value:
    string | undefined,
): boolean {
  if (!value) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(
    value,
  );
}

function isValidHttpUrl(
  value:
    string | undefined,
): boolean {
  if (!value) {
    return false;
  }

  try {
    const url =
      new URL(
        value,
      );

    return (
      url.protocol ===
        "https:" ||
      url.protocol ===
        "http:"
    );
  } catch {
    return false;
  }
}

function addressMissingFields(
  address:
    JurisdictionFilingAddress | undefined,
  prefix: string,
): string[] {
  if (!address) {
    return [
      `${prefix} address`,
    ];
  }

  const missing:
    string[] =
      [];

  if (
    !normalizedText(
      address.line1,
    )
  ) {
    missing.push(
      `${prefix} address line 1`,
    );
  }

  if (
    !normalizedText(
      address.city,
    )
  ) {
    missing.push(
      `${prefix} city`,
    );
  }

  if (
    !normalizedText(
      address.stateCode,
    )
  ) {
    missing.push(
      `${prefix} state`,
    );
  }

  if (
    !normalizedText(
      address.postalCode,
    )
  ) {
    missing.push(
      `${prefix} ZIP code`,
    );
  }

  if (
    !normalizedText(
      address.countryCode,
    )
  ) {
    missing.push(
      `${prefix} country`,
    );
  }

  return missing;
}

/* ========================================================================== */
/* Method normalization                                                        */
/* ========================================================================== */

/**
 * Converts an approved jurisdiction claim_method value into the narrower
 * operational filing-method vocabulary used by the destination engine.
 *
 * We intentionally fail closed on unknown values.
 */
export function normalizeJurisdictionFilingMethod(
  value:
    string | undefined | null,
): JurisdictionFilingMethod | undefined {
  const normalized =
    value
      ?.trim()
      .toLowerCase()
      .replaceAll(
        "-",
        "_",
      )
      .replaceAll(
        " ",
        "_",
      );

  switch (normalized) {
    case "email":
      return "email";

    case "mail":
    case "postal_mail":
    case "physical_mail":
      return "mail";

    case "online":
    case "portal":
    case "online_portal":
      return "online";

    case "in_person":
    case "inperson":
    case "hand_delivery":
      return "in_person";

    case "court_e_filing":
    case "court_efiling":
    case "e_filing":
    case "efiling":
      return "court_e_filing";

    default:
      return undefined;
  }
}

/* ========================================================================== */
/* Row mapping                                                                 */
/* ========================================================================== */

function destinationFromRow(
  row:
    JurisdictionFilingDestinationRow,
): JurisdictionFilingDestination {
  return {
    id:
      row.id,

    jurisdictionPackageId:
      row.jurisdiction_package_id,

    jurisdictionPackageVersion:
      Number(
        row.jurisdiction_package_version,
      ),

    jurisdictionId:
      row.jurisdiction_id,

    destinationVersion:
      Number(
        row.destination_version,
      ),

    status:
      row.status,

    submissionMethod:
      row.submission_method,

    agencyName:
      row.agency_name,

    departmentName:
      row.department_name ??
      undefined,

    attentionLine:
      row.attention_line ??
      undefined,

    filingEmail:
      row.filing_email ??
      undefined,

    mailingAddress:
      row.mailing_address ??
      undefined,

    physicalAddress:
      row.physical_address ??
      undefined,

    portalUrl:
      row.portal_url ??
      undefined,

    phone:
      row.phone ??
      undefined,

    filingInstructions:
      Array.isArray(
        row.filing_instructions,
      )
        ? row.filing_instructions
        : [],

    officialSourceUrl:
      row.official_source_url,

    officialSourceTitle:
      row.official_source_title ??
      undefined,

    evidenceNote:
      row.evidence_note ??
      undefined,

    verifiedByUserId:
      row.verified_by_user_id,

    verifiedAt:
      row.verified_at as IsoInstant,

    supersededAt:
      row.superseded_at
        ? row.superseded_at as IsoInstant
        : undefined,

    supersededByDestinationId:
      row.superseded_by_destination_id ??
      undefined,

    createdAt:
      row.created_at as IsoInstant,
  };
}

/* ========================================================================== */
/* Address formatting                                                          */
/* ========================================================================== */

export function jurisdictionFilingAddressLines(
  address:
    JurisdictionFilingAddress,
): string[] {
  const lines:
    string[] =
      [];

  const line1 =
    normalizedText(
      address.line1,
    );

  const line2 =
    normalizedText(
      address.line2,
    );

  if (line1) {
    lines.push(
      line1,
    );
  }

  if (line2) {
    lines.push(
      line2,
    );
  }

  const city =
    normalizedText(
      address.city,
    );

  const stateCode =
    normalizedText(
      address.stateCode,
    );

  const postalCode =
    normalizedText(
      address.postalCode,
    );

  const cityStatePostal =
    [
      city
        ? `${city},`
        : undefined,

      stateCode,

      postalCode,
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
      );

  if (cityStatePostal) {
    lines.push(
      cityStatePostal,
    );
  }

  const countryCode =
    normalizedText(
      address.countryCode,
    );

  if (
    countryCode &&
    countryCode.toUpperCase() !==
      "US" &&
    countryCode.toUpperCase() !==
      "USA"
  ) {
    lines.push(
      countryCode,
    );
  }

  return lines;
}

/* ========================================================================== */
/* Operational completeness                                                    */
/* ========================================================================== */

export function resolveJurisdictionFilingDestinationReadiness(
  destination:
    JurisdictionFilingDestination,
): JurisdictionFilingDestinationReadiness {
  const missingFields:
    string[] =
      [];

  if (
    !normalizedText(
      destination.agencyName,
    )
  ) {
    missingFields.push(
      "agency name",
    );
  }

  if (
    !isPositiveInteger(
      destination.jurisdictionPackageVersion,
    )
  ) {
    missingFields.push(
      "jurisdiction package version",
    );
  }

  if (
    !isPositiveInteger(
      destination.destinationVersion,
    )
  ) {
    missingFields.push(
      "destination version",
    );
  }

  if (
    !isValidHttpUrl(
      destination.officialSourceUrl,
    )
  ) {
    missingFields.push(
      "official source URL",
    );
  }

  if (
    !normalizedText(
      destination.verifiedByUserId,
    )
  ) {
    missingFields.push(
      "verification actor",
    );
  }

  if (
    Number.isNaN(
      Date.parse(
        destination.verifiedAt,
      ),
    )
  ) {
    missingFields.push(
      "verification timestamp",
    );
  }

  switch (
    destination.submissionMethod
  ) {
    case "email": {
      if (
        !isValidEmail(
          destination.filingEmail,
        )
      ) {
        missingFields.push(
          "filing email",
        );
      }

      break;
    }

    case "mail": {
      missingFields.push(
        ...addressMissingFields(
          destination.mailingAddress,
          "mailing",
        ),
      );

      break;
    }

    case "online": {
      if (
        !isValidHttpUrl(
          destination.portalUrl,
        )
      ) {
        missingFields.push(
          "official filing portal",
        );
      }

      break;
    }

    case "in_person": {
      missingFields.push(
        ...addressMissingFields(
          destination.physicalAddress,
          "physical delivery",
        ),
      );

      break;
    }

    case "court_e_filing": {
      if (
        !isValidHttpUrl(
          destination.portalUrl,
        )
      ) {
        missingFields.push(
          "official court/e-filing portal",
        );
      }

      break;
    }
  }

  const complete =
    destination.status ===
      "verified" &&
    missingFields.length ===
      0;

  if (
    destination.status !==
    "verified"
  ) {
    return {
      complete:
        false,

      submissionMethod:
        destination.submissionMethod,

      missingFields:
        [
          "current verified destination",
          ...missingFields,
        ],

      detail:
        "This filing destination is not the current verified operational destination.",
    };
  }

  if (!complete) {
    return {
      complete:
        false,

      submissionMethod:
        destination.submissionMethod,

      missingFields,

      detail:
        `The filing destination is incomplete. Missing: ${missingFields.join(
          ", ",
        )}.`,
    };
  }

  return {
    complete:
      true,

    submissionMethod:
      destination.submissionMethod,

    missingFields:
      [],

    detail:
      "The verified operational filing destination is complete for this submission method.",
  };
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listJurisdictionFilingDestinations(
  options?: {
    jurisdictionPackageId?: string;

    jurisdictionPackageVersion?: number;

    jurisdictionId?: string;

    submissionMethod?: JurisdictionFilingMethod;

    includeSuperseded?: boolean;
  },
): Promise<
  JurisdictionFilingDestination[]
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "jurisdiction_filing_destinations",
      )
      .select(
        "*",
      )
      .order(
        "destination_version",
        {
          ascending:
            false,
        },
      );

  if (
    options
      ?.jurisdictionPackageId
  ) {
    query =
      query.eq(
        "jurisdiction_package_id",
        options
          .jurisdictionPackageId
          .trim(),
      );
  }

  if (
    options
      ?.jurisdictionPackageVersion !==
      undefined
  ) {
    query =
      query.eq(
        "jurisdiction_package_version",
        options
          .jurisdictionPackageVersion,
      );
  }

  if (
    options?.jurisdictionId
  ) {
    query =
      query.eq(
        "jurisdiction_id",
        options
          .jurisdictionId
          .trim(),
      );
  }

  if (
    options?.submissionMethod
  ) {
    query =
      query.eq(
        "submission_method",
        options.submissionMethod,
      );
  }

  if (
    !options
      ?.includeSuperseded
  ) {
    query =
      query.eq(
        "status",
        "verified",
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw new Error(
      `Unable to read jurisdiction filing destinations: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      destinationFromRow(
        row as unknown as
          JurisdictionFilingDestinationRow,
      ),
  );
}

export async function getJurisdictionFilingDestination(
  destinationId: string,
): Promise<
  JurisdictionFilingDestination | undefined
> {
  const normalizedId =
    destinationId.trim();

  if (!normalizedId) {
    return undefined;
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "jurisdiction_filing_destinations",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        normalizedId,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read jurisdiction filing destination: ${error.message}`,
    );
  }

  return data
    ? destinationFromRow(
        data as unknown as
          JurisdictionFilingDestinationRow,
      )
    : undefined;
}

/**
 * Returns the single current verified destination for an approved
 * jurisdiction-package version and method.
 *
 * More than one current destination is treated as a governance failure and
 * blocks the workflow instead of guessing.
 */
export async function getCurrentJurisdictionFilingDestination(
  input: {
    jurisdictionPackageId: string;

    jurisdictionPackageVersion: number;

    submissionMethod: JurisdictionFilingMethod;
  },
): Promise<
  JurisdictionFilingDestination | undefined
> {
  const jurisdictionPackageId =
    input
      .jurisdictionPackageId
      .trim();

  if (!jurisdictionPackageId) {
    throw new Error(
      "Jurisdiction package ID is required.",
    );
  }

  if (
    !isPositiveInteger(
      input.jurisdictionPackageVersion,
    )
  ) {
    throw new Error(
      "Jurisdiction package version must be a positive integer.",
    );
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "jurisdiction_filing_destinations",
      )
      .select(
        "*",
      )
      .eq(
        "jurisdiction_package_id",
        jurisdictionPackageId,
      )
      .eq(
        "jurisdiction_package_version",
        input.jurisdictionPackageVersion,
      )
      .eq(
        "submission_method",
        input.submissionMethod,
      )
      .eq(
        "status",
        "verified",
      )
      .order(
        "destination_version",
        {
          ascending:
            false,
        },
      )
      .limit(
        2,
      );

  if (error) {
    throw new Error(
      `Unable to resolve current filing destination: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as unknown as
      JurisdictionFilingDestinationRow[];

  if (
    rows.length >
    1
  ) {
    throw new Error(
      "Multiple current verified filing destinations exist for the same jurisdiction package and submission method. Filing is blocked pending jurisdiction governance review.",
    );
  }

  return rows[0]
    ? destinationFromRow(
        rows[0],
      )
    : undefined;
}

/* ========================================================================== */
/* Operational destination gate                                                */
/* ========================================================================== */

/**
 * Fail-closed destination resolver.
 *
 * Claim Initiation and external-submission recording should use this helper
 * when an actual filing destination is required.
 *
 * It does not merely check that a row exists. It verifies that the row contains
 * all operational fields required by its method.
 */
export async function requireOperationalJurisdictionFilingDestination(
  input: {
    jurisdictionPackageId: string;

    jurisdictionPackageVersion: number;

    submissionMethod: JurisdictionFilingMethod;
  },
): Promise<
  JurisdictionFilingDestination
> {
  const destination =
    await getCurrentJurisdictionFilingDestination(
      input,
    );

  if (!destination) {
    throw new Error(
      `No verified ${input.submissionMethod.replaceAll(
        "_",
        " ",
      )} filing destination is recorded for the current approved jurisdiction package. External submission is blocked until the destination is verified.`,
    );
  }

  const readiness =
    resolveJurisdictionFilingDestinationReadiness(
      destination,
    );

  if (!readiness.complete) {
    throw new Error(
      `The verified filing destination is not operationally complete. ${readiness.detail}`,
    );
  }

  return destination;
}

/* ========================================================================== */
/* Display helpers                                                             */
/* ========================================================================== */

export function jurisdictionFilingDestinationSummary(
  destination:
    JurisdictionFilingDestination,
): string {
  switch (
    destination.submissionMethod
  ) {
    case "email":
      return (
        destination.filingEmail ??
        "Email destination not recorded"
      );

    case "mail": {
      if (
        !destination.mailingAddress
      ) {
        return "Mailing address not recorded";
      }

      return jurisdictionFilingAddressLines(
        destination.mailingAddress,
      ).join(
        ", ",
      );
    }

    case "online":
      return (
        destination.portalUrl ??
        "Online filing portal not recorded"
      );

    case "in_person": {
      if (
        !destination.physicalAddress
      ) {
        return "Physical filing address not recorded";
      }

      return jurisdictionFilingAddressLines(
        destination.physicalAddress,
      ).join(
        ", ",
      );
    }

    case "court_e_filing":
      return (
        destination.portalUrl ??
        "Court/e-filing portal not recorded"
      );
  }
}