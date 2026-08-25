import "server-only";

import type {
  Opportunity,
  Property,
} from "@/domain/types";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

export interface SaveOpportunityRecordInput {
  opportunity: Opportunity;

  property: Property;
}

export interface OpportunityJurisdictionProvenanceInput {
  jurisdictionPackageId: string;

  jurisdictionPackageVersion: number;

  jurisdictionLegalRuleVersion: number;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface PropertyRow {
  id: string;

  property_snapshot: unknown;

  row_version: number | string;
}

interface OpportunityRow {
  id: string;

  reference: string;

  property_id: string;

  jurisdiction_id: string;

  jurisdiction_package_id:
    | string
    | null;

  jurisdiction_package_version:
    | number
    | string
    | null;

  jurisdiction_legal_rule_version:
    | number
    | string
    | null;

  sale_snapshot: unknown;

  prior_owners: unknown;

  estimated_surplus_snapshot: unknown;

  confirmed_surplus_snapshot:
    | unknown
    | null;

  custodian: string;

  claim_deadline:
    | string
    | null;

  status:
    Opportunity["status"];

  owner_located:
    Opportunity["ownerLocated"];

  contact_confidence:
    Opportunity["contactConfidence"];

  flags: unknown;

  priority:
    | 1
    | 2
    | 3;

  risk_score: number;

  active_commercial_fee_quote_id:
    | string
    | null;

  assigned_to_user_id:
    | string
    | null;

  converted_claim_id:
    | string
    | null;

  disqualified_reason:
    | Opportunity["disqualifiedReason"]
    | null;

  created_on: string;

  last_activity_on: string;

  provenance: unknown;

  notes: unknown;

  row_version:
    | number
    | string;
}

interface OperationalRecordDispositionRow {
  record_type:
    | "opportunity"
    | "property";

  record_id:
    string;

  purpose:
    | "training"
    | "retired_qa";

  exclude_from_operational_lists:
    boolean;

  direct_access_allowed:
    boolean;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function rowVersion(
  value:
    number | string,
): number {
  const version =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      version,
    ) ||
    version <
      1
  ) {
    throw new Error(
      "Stored record has an invalid database row version.",
    );
  }

  return version;
}

function requirePositiveInteger(
  value:
    number,
  label:
    string,
): number {
  if (
    !Number.isInteger(
      value,
    ) ||
    value <
      1
  ) {
    throw new Error(
      `${label} must be a positive integer.`,
    );
  }

  return value;
}

function optionalStoredPositiveInteger(
  value:
    | number
    | string
    | null,
  label:
    string,
): number | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  const parsed =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <
      1
  ) {
    throw new Error(
      `${label} contains an invalid stored version.`,
    );
  }

  return parsed;
}

function normalizedJurisdictionProvenance(
  input:
    OpportunityJurisdictionProvenanceInput,
): OpportunityJurisdictionProvenanceInput {
  const jurisdictionPackageId =
    input.jurisdictionPackageId.trim();

  if (
    !jurisdictionPackageId
  ) {
    throw new Error(
      "Jurisdiction package id is required before Opportunity provenance can be frozen.",
    );
  }

  return {
    jurisdictionPackageId,

    jurisdictionPackageVersion:
      requirePositiveInteger(
        input.jurisdictionPackageVersion,
        "Jurisdiction package version",
      ),

    jurisdictionLegalRuleVersion:
      requirePositiveInteger(
        input.jurisdictionLegalRuleVersion,
        "Jurisdiction legal rule version",
      ),
  };
}

function requireObject<T>(
  value:
    unknown,
  label:
    string,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `${label} contains an invalid database snapshot.`,
    );
  }

  return value as T;
}

function requireArray<T>(
  value:
    unknown,
  label:
    string,
): T[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `${label} contains an invalid database snapshot.`,
    );
  }

  return value as T[];
}

function propertyFromRow(
  row:
    PropertyRow,
): Property {
  const property =
    requireObject<Property>(
      row.property_snapshot,
      "Property",
    );

  if (
    property.id !==
    row.id
  ) {
    throw new Error(
      "Property snapshot does not match its database record.",
    );
  }

  return property;
}

function opportunityFromRow(
  row:
    OpportunityRow,
): Opportunity {
  return {
    id:
      row.id,

    reference:
      row.reference,

    propertyId:
      row.property_id,

    jurisdictionId:
      row.jurisdiction_id,

    sale:
      requireObject<
        Opportunity["sale"]
      >(
        row.sale_snapshot,
        "Opportunity sale",
      ),

    priorOwners:
      requireArray<
        Opportunity["priorOwners"][number]
      >(
        row.prior_owners,
        "Opportunity prior owners",
      ),

    estimatedSurplus:
      requireObject<
        Opportunity["estimatedSurplus"]
      >(
        row.estimated_surplus_snapshot,
        "Opportunity estimated surplus",
      ),

    confirmedSurplus:
      row.confirmed_surplus_snapshot ===
      null
        ? undefined
        : requireObject<
            NonNullable<
              Opportunity["confirmedSurplus"]
            >
          >(
            row.confirmed_surplus_snapshot,
            "Opportunity confirmed surplus",
          ),

    custodian:
      row.custodian as Opportunity["custodian"],

    claimDeadline:
      row.claim_deadline ??
      undefined,

    status:
      row.status,

    ownerLocated:
      row.owner_located,

    contactConfidence:
      row.contact_confidence,

    flags:
      requireArray<
        Opportunity["flags"][number]
      >(
        row.flags,
        "Opportunity flags",
      ),

    priority:
      row.priority,

    riskScore:
      Number(
        row.risk_score,
      ),

    activeCommercialFeeQuoteId:
      row.active_commercial_fee_quote_id ??
      undefined,

    assignedToUserId:
      row.assigned_to_user_id ??
      undefined,

    convertedClaimId:
      row.converted_claim_id ??
      undefined,

    disqualifiedReason:
      row.disqualified_reason ??
      undefined,

    createdAt:
      row.created_on,

    lastActivityAt:
      row.last_activity_on,

    provenance:
      requireObject<
        Opportunity["provenance"]
      >(
        row.provenance,
        "Opportunity provenance",
      ),

    notes:
      requireArray<
        Opportunity["notes"][number]
      >(
        row.notes,
        "Opportunity notes",
      ),
  };
}

function assertOpportunityRecord(
  opportunity:
    Opportunity,
  property:
    Property,
): void {
  if (
    !opportunity.id.trim()
  ) {
    throw new Error(
      "Opportunity id is required.",
    );
  }

  if (
    !opportunity.reference.trim()
  ) {
    throw new Error(
      "Opportunity reference is required.",
    );
  }

  if (
    !property.id.trim()
  ) {
    throw new Error(
      "Property id is required.",
    );
  }

  if (
    opportunity.propertyId !==
    property.id
  ) {
    throw new Error(
      "Opportunity propertyId must match the supplied property.",
    );
  }

  if (
    !opportunity.jurisdictionId.trim()
  ) {
    throw new Error(
      "Opportunity jurisdictionId is required.",
    );
  }
}

/* ========================================================================== */
/* Production record disposition                                               */
/* ========================================================================== */

/**
 * Production operational records may carry an explicit disposition.
 *
 * retired_qa
 *   Historical development / staff QA evidence. Hidden from production lists
 *   and blocked from direct operational access.
 *
 * training
 *   Deliberately preserved claimant-training records. Hidden from production
 *   Opportunity / Property aggregates, but available through direct claimant
 *   training workflows.
 *
 * No disposition row means the record is an ordinary production record.
 */

async function listOperationallyExcludedRecordIds(
  recordType:
    "opportunity" | "property",
): Promise<
  Set<string>
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "operational_record_dispositions",
      )
      .select(
        "record_id",
      )
      .eq(
        "record_type",
        recordType,
      )
      .eq(
        "exclude_from_operational_lists",
        true,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve ${recordType} production dispositions: ${error.message}`,
    );
  }

  return new Set(
    (
      data ??
      []
    ).map(
      (
        row,
      ) =>
        String(
          row.record_id,
        ),
    ),
  );
}

async function getOperationalRecordDisposition(
  recordType:
    "opportunity" | "property",
  recordId:
    string,
): Promise<
  OperationalRecordDispositionRow | undefined
> {
  const normalizedRecordId =
    recordId.trim();

  if (
    !normalizedRecordId
  ) {
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
        "operational_record_dispositions",
      )
      .select(
        "record_type, record_id, purpose, exclude_from_operational_lists, direct_access_allowed",
      )
      .eq(
        "record_type",
        recordType,
      )
      .eq(
        "record_id",
        normalizedRecordId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve ${recordType} record disposition: ${error.message}`,
    );
  }

  return data
    ? data as OperationalRecordDispositionRow
    : undefined;
}

async function directRecordAccessAllowed(
  recordType:
    "opportunity" | "property",
  recordId:
    string,
): Promise<boolean> {
  const disposition =
    await getOperationalRecordDisposition(
      recordType,
      recordId,
    );

  if (
    !disposition
  ) {
    return true;
  }

  return disposition.direct_access_allowed;
}

/* ========================================================================== */
/* Database helpers                                                            */
/* ========================================================================== */

async function getPropertyRow(
  propertyId:
    string,
): Promise<
  PropertyRow | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "properties",
      )
      .select(
        "id, property_snapshot, row_version",
      )
      .eq(
        "id",
        propertyId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read property: ${error.message}`,
    );
  }

  return data
    ? data as PropertyRow
    : undefined;
}

async function getOpportunityRow(
  opportunityId:
    string,
): Promise<
  OpportunityRow | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "opportunities",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        opportunityId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read opportunity: ${error.message}`,
    );
  }

  return data
    ? data as OpportunityRow
    : undefined;
}

/* ========================================================================== */
/* Read operations                                                             */
/* ========================================================================== */

export async function listOpportunities(): Promise<
  Opportunity[]
> {
  const supabase =
    getSupabaseAdmin();

  const [
    opportunityResult,
    excludedIds,
  ] =
    await Promise.all([
      supabase
        .from(
          "opportunities",
        )
        .select(
          "*",
        )
        .order(
          "last_activity_on",
          {
            ascending:
              false,
          },
        ),

      listOperationallyExcludedRecordIds(
        "opportunity",
      ),
    ]);

  if (
    opportunityResult.error
  ) {
    throw new Error(
      `Unable to list opportunities: ${opportunityResult.error.message}`,
    );
  }

  return (
    opportunityResult.data ??
    []
  )
    .filter(
      (
        row,
      ) =>
        !excludedIds.has(
          String(
            row.id,
          ),
        ),
    )
    .map(
      (
        row,
      ) =>
        opportunityFromRow(
          row as OpportunityRow,
        ),
    );
}

export async function getOpportunityById(
  opportunityId:
    string,
): Promise<
  Opportunity | undefined
> {
  if (
    !await directRecordAccessAllowed(
      "opportunity",
      opportunityId,
    )
  ) {
    return undefined;
  }

  const row =
    await getOpportunityRow(
      opportunityId,
    );

  return row
    ? opportunityFromRow(
        row,
      )
    : undefined;
}

export async function listProperties(): Promise<
  Property[]
> {
  const supabase =
    getSupabaseAdmin();

  const [
    propertyResult,
    excludedIds,
  ] =
    await Promise.all([
      supabase
        .from(
          "properties",
        )
        .select(
          "id, property_snapshot, row_version",
        )
        .order(
          "persisted_at",
          {
            ascending:
              true,
          },
        ),

      listOperationallyExcludedRecordIds(
        "property",
      ),
    ]);

  if (
    propertyResult.error
  ) {
    throw new Error(
      `Unable to list properties: ${propertyResult.error.message}`,
    );
  }

  return (
    propertyResult.data ??
    []
  )
    .filter(
      (
        row,
      ) =>
        !excludedIds.has(
          String(
            row.id,
          ),
        ),
    )
    .map(
      (
        row,
      ) =>
        propertyFromRow(
          row as PropertyRow,
        ),
    );
}

export async function getPropertyById(
  propertyId:
    string,
): Promise<
  Property | undefined
> {
  if (
    !await directRecordAccessAllowed(
      "property",
      propertyId,
    )
  ) {
    return undefined;
  }

  const row =
    await getPropertyRow(
      propertyId,
    );

  return row
    ? propertyFromRow(
        row,
      )
    : undefined;
}

/* ========================================================================== */
/* Frozen jurisdiction provenance                                              */
/* ========================================================================== */

export async function ensureOpportunityJurisdictionProvenance(
  opportunityId:
    string,
  input:
    OpportunityJurisdictionProvenanceInput,
): Promise<void> {
  const normalizedOpportunityId =
    opportunityId.trim();

  if (
    !normalizedOpportunityId
  ) {
    throw new Error(
      "Opportunity id is required before jurisdiction provenance can be frozen.",
    );
  }

  const provenance =
    normalizedJurisdictionProvenance(
      input,
    );

  const current =
    await getOpportunityRow(
      normalizedOpportunityId,
    );

  if (
    !current
  ) {
    throw new Error(
      "Opportunity not found while freezing jurisdiction provenance.",
    );
  }

  /*
   * A retired QA Opportunity may not be operationally reopened or rewritten.
   *
   * Training and normal production Opportunities may continue through the
   * existing provenance-freezing workflow.
   */
  if (
    !await directRecordAccessAllowed(
      "opportunity",
      normalizedOpportunityId,
    )
  ) {
    throw new Error(
      "Opportunity is retired from operational access.",
    );
  }

  const storedPackageId =
    current.jurisdiction_package_id ??
    undefined;

  const storedPackageVersion =
    optionalStoredPositiveInteger(
      current.jurisdiction_package_version,
      "Opportunity jurisdiction package version",
    );

  const storedLegalRuleVersion =
    optionalStoredPositiveInteger(
      current.jurisdiction_legal_rule_version,
      "Opportunity jurisdiction legal rule version",
    );

  if (
    storedPackageId !==
      undefined &&
    storedPackageId !==
      provenance.jurisdictionPackageId
  ) {
    throw new Error(
      "Opportunity already contains different frozen jurisdiction package provenance.",
    );
  }

  if (
    storedPackageVersion !==
      undefined &&
    storedPackageVersion !==
      provenance.jurisdictionPackageVersion
  ) {
    throw new Error(
      "Opportunity already contains a different frozen jurisdiction package version.",
    );
  }

  if (
    storedLegalRuleVersion !==
      undefined &&
    storedLegalRuleVersion !==
      provenance.jurisdictionLegalRuleVersion
  ) {
    throw new Error(
      "Opportunity already contains a different frozen jurisdiction legal-rule version.",
    );
  }

  if (
    storedPackageId ===
      provenance.jurisdictionPackageId &&
    storedPackageVersion ===
      provenance.jurisdictionPackageVersion &&
    storedLegalRuleVersion ===
      provenance.jurisdictionLegalRuleVersion
  ) {
    return;
  }

  const expectedVersion =
    rowVersion(
      current.row_version,
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "opportunities",
      )
      .update({
        jurisdiction_package_id:
          provenance.jurisdictionPackageId,

        jurisdiction_package_version:
          provenance.jurisdictionPackageVersion,

        jurisdiction_legal_rule_version:
          provenance.jurisdictionLegalRuleVersion,

        row_version:
          expectedVersion +
          1,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        normalizedOpportunityId,
      )
      .eq(
        "row_version",
        expectedVersion,
      )
      .select(
        "id",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to freeze Opportunity jurisdiction provenance: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Opportunity changed while jurisdiction provenance was being frozen. Reload and try again.",
    );
  }
}

/* ========================================================================== */
/* Property save                                                               */
/* ========================================================================== */

async function saveProperty(
  property:
    Property,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const existing =
    await getPropertyRow(
      property.id,
    );

  const payload = {
    address_id:
      property.address.id,

    address_line1:
      property.address.line1,

    address_line2:
      property.address.line2 ??
      null,

    city:
      property.address.city,

    county:
      property.address.county,

    state_code:
      property.address.state,

    postal_code:
      property.address.postalCode,

    country_code:
      "US",

    property_type:
      property.propertyType,

    parcel_number:
      property.parcelNumber ??
      null,

    tax_account_number:
      property.taxAccountNumber ??
      null,

    legal_description:
      property.legalDescription ??
      null,

    year_built:
      property.yearBuilt ??
      null,

    assessed_value_cents:
      property.assessedValue?.amount ??
      null,

    assessed_value_snapshot:
      property.assessedValue ??
      null,

    provenance:
      property.provenance,

    property_snapshot:
      property,
  };

  if (
    existing
  ) {
    const expectedVersion =
      rowVersion(
        existing.row_version,
      );

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "properties",
        )
        .update({
          ...payload,

          row_version:
            expectedVersion +
            1,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          property.id,
        )
        .eq(
          "row_version",
          expectedVersion,
        )
        .select(
          "id",
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to update property: ${error.message}`,
      );
    }

    if (
      !data
    ) {
      throw new Error(
        "Property changed while this request was being processed. Reload and try again.",
      );
    }

    return;
  }

  const {
    error,
  } =
    await supabase
      .from(
        "properties",
      )
      .insert({
        id:
          property.id,

        ...payload,

        row_version:
          1,
      });

  if (
    error
  ) {
    throw new Error(
      `Unable to save property: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Opportunity save                                                            */
/* ========================================================================== */

async function assertReferenceAvailable(
  opportunity:
    Opportunity,
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "opportunities",
      )
      .select(
        "id",
      )
      .eq(
        "reference",
        opportunity.reference,
      )
      .neq(
        "id",
        opportunity.id,
      )
      .limit(
        1,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to validate opportunity reference: ${error.message}`,
    );
  }

  if (
    data
  ) {
    throw new Error(
      "Opportunity reference already exists.",
    );
  }
}

export async function saveOpportunityRecord(
  input:
    SaveOpportunityRecordInput,
): Promise<
  Opportunity
> {
  assertOpportunityRecord(
    input.opportunity,
    input.property,
  );

  /*
   * Retired QA identifiers cannot be silently reused by a future production
   * promotion or save.
   *
   * Training records remain deliberately writable through their controlled
   * training workflows.
   */
  if (
    !await directRecordAccessAllowed(
      "opportunity",
      input.opportunity.id,
    )
  ) {
    throw new Error(
      "Opportunity identifier belongs to a retired QA record and cannot be reused.",
    );
  }

  if (
    !await directRecordAccessAllowed(
      "property",
      input.property.id,
    )
  ) {
    throw new Error(
      "Property identifier belongs to a retired QA record and cannot be reused.",
    );
  }

  await assertReferenceAvailable(
    input.opportunity,
  );

  await saveProperty(
    input.property,
  );

  const supabase =
    getSupabaseAdmin();

  const existing =
    await getOpportunityRow(
      input.opportunity.id,
    );

  const payload = {
    reference:
      input.opportunity.reference,

    property_id:
      input.opportunity.propertyId,

    jurisdiction_id:
      input.opportunity.jurisdictionId,

    sale_type:
      input.opportunity.sale.saleType,

    sale_date:
      input.opportunity.sale.saleDate,

    sale_snapshot:
      input.opportunity.sale,

    prior_owners:
      input.opportunity.priorOwners,

    estimated_surplus_cents:
      input.opportunity.estimatedSurplus.amount,

    estimated_surplus_snapshot:
      input.opportunity.estimatedSurplus,

    confirmed_surplus_cents:
      input.opportunity.confirmedSurplus
        ?.amount ??
      null,

    confirmed_surplus_snapshot:
      input.opportunity.confirmedSurplus ??
      null,

    custodian:
      input.opportunity.custodian,

    claim_deadline:
      input.opportunity.claimDeadline ??
      null,

    status:
      input.opportunity.status,

    owner_located:
      input.opportunity.ownerLocated,

    contact_confidence:
      input.opportunity.contactConfidence,

    flags:
      input.opportunity.flags,

    priority:
      input.opportunity.priority,

    risk_score:
      input.opportunity.riskScore,

    active_commercial_fee_quote_id:
      input.opportunity
        .activeCommercialFeeQuoteId ??
      null,

    assigned_to_user_id:
      input.opportunity.assignedToUserId ??
      null,

    converted_claim_id:
      input.opportunity.convertedClaimId ??
      null,

    disqualified_reason:
      input.opportunity.disqualifiedReason ??
      null,

    created_on:
      input.opportunity.createdAt,

    last_activity_on:
      input.opportunity.lastActivityAt,

    provenance:
      input.opportunity.provenance,

    notes:
      input.opportunity.notes,
  };

  if (
    existing
  ) {
    const expectedVersion =
      rowVersion(
        existing.row_version,
      );

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "opportunities",
        )
        .update({
          ...payload,

          row_version:
            expectedVersion +
            1,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          input.opportunity.id,
        )
        .eq(
          "row_version",
          expectedVersion,
        )
        .select(
          "*",
        )
        .maybeSingle();

    if (
      error
    ) {
      throw new Error(
        `Unable to update opportunity: ${error.message}`,
      );
    }

    if (
      !data
    ) {
      throw new Error(
        "Opportunity changed while this request was being processed. Reload and try again.",
      );
    }

    return opportunityFromRow(
      data as OpportunityRow,
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "opportunities",
      )
      .insert({
        id:
          input.opportunity.id,

        ...payload,

        jurisdiction_package_id:
          null,

        jurisdiction_package_version:
          null,

        jurisdiction_legal_rule_version:
          null,

        row_version:
          1,
      })
      .select(
        "*",
      )
      .single();

  if (
    error
  ) {
    if (
      error.code ===
      "23505"
    ) {
      throw new Error(
        "Opportunity reference already exists.",
      );
    }

    throw new Error(
      `Unable to save opportunity: ${error.message}`,
    );
  }

  return opportunityFromRow(
    data as OpportunityRow,
  );
}