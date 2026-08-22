import "server-only";

import type { IsoInstant } from "@/domain/types";
import { getSupabaseAdmin } from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type OpportunityConversionStatus = "converted";

export type OpportunityConversionAuditAction = "opportunity_converted";

export interface PersistedOpportunityConversion {
  opportunityId: string;
  opportunityReference: string;

  jurisdictionId: string;

  claimId: string;
  claimReference: string;

  commercialQuoteId: string;
  commercialSnapshotHash: string;

  feeAgreementId: string;

  status: OpportunityConversionStatus;

  convertedByUserId: string;
  convertedAt: IsoInstant;

  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface OpportunityConversionAuditEntry {
  id: string;

  opportunityId: string;
  claimId: string;

  action: OpportunityConversionAuditAction;

  actorUserId: string;
  occurredAt: IsoInstant;

  commercialQuoteId: string;
  commercialSnapshotHash: string;

  feeAgreementId: string;
}

export interface CreateOpportunityConversionInput {
  opportunityId: string;
  opportunityReference: string;

  jurisdictionId: string;

  claimId: string;
  claimReference: string;

  commercialQuoteId: string;
  commercialSnapshotHash: string;

  feeAgreementId: string;

  actorUserId: string;
  occurredAt: IsoInstant;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface OpportunityConversionRow {
  id: string;

  opportunity_id: string;
  opportunity_reference: string;

  jurisdiction_id: string;

  claim_id: string;
  claim_reference: string;

  commercial_quote_id: string;
  commercial_snapshot_hash: string;

  fee_agreement_id: string;

  status: OpportunityConversionStatus;

  converted_by_user_id: string;
  converted_at: string;

  created_at: string;
  updated_at: string;
}

interface OpportunityConversionAuditRow {
  id: string;

  opportunity_id: string;
  claim_id: string;

  action: OpportunityConversionAuditAction;

  actor_user_id: string;
  occurred_at: string;

  commercial_quote_id: string;
  commercial_snapshot_hash: string;

  fee_agreement_id: string;
}

interface OpportunitySourceRow {
  reference: string;

  jurisdiction_id: string;

  active_commercial_fee_quote_id: string | null;

  row_version: number | string;
}

interface CommercialQuoteSourceRow {
  quote_id: string;

  snapshot_hash: string;

  locked_fee_agreement_id: string | null;
}

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function conversionFromRow(
  row: OpportunityConversionRow,
): PersistedOpportunityConversion {
  return {
    opportunityId: row.opportunity_id,

    opportunityReference:
      row.opportunity_reference,

    jurisdictionId:
      row.jurisdiction_id,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    commercialQuoteId:
      row.commercial_quote_id,

    commercialSnapshotHash:
      row.commercial_snapshot_hash,

    feeAgreementId:
      row.fee_agreement_id,

    status:
      row.status,

    convertedByUserId:
      row.converted_by_user_id,

    convertedAt:
      row.converted_at as IsoInstant,

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,
  };
}

function auditFromRow(
  row: OpportunityConversionAuditRow,
): OpportunityConversionAuditEntry {
  return {
    id: row.id,

    opportunityId:
      row.opportunity_id,

    claimId:
      row.claim_id,

    action:
      row.action,

    actorUserId:
      row.actor_user_id,

    occurredAt:
      row.occurred_at as IsoInstant,

    commercialQuoteId:
      row.commercial_quote_id,

    commercialSnapshotHash:
      row.commercial_snapshot_hash,

    feeAgreementId:
      row.fee_agreement_id,
  };
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function validateCreateInput(
  input: CreateOpportunityConversionInput,
): void {
  if (!input.opportunityId.trim()) {
    throw new Error(
      "An opportunity identifier is required.",
    );
  }

  if (!input.opportunityReference.trim()) {
    throw new Error(
      "An opportunity reference is required.",
    );
  }

  if (!input.jurisdictionId.trim()) {
    throw new Error(
      "A jurisdiction identifier is required.",
    );
  }

  if (!input.claimId.trim()) {
    throw new Error(
      "A claim identifier is required.",
    );
  }

  if (!input.claimReference.trim()) {
    throw new Error(
      "A claim reference is required.",
    );
  }

  if (!input.commercialQuoteId.trim()) {
    throw new Error(
      "An approved commercial quote is required before conversion.",
    );
  }

  if (!input.commercialSnapshotHash.trim()) {
    throw new Error(
      "A commercial quote snapshot hash is required before conversion.",
    );
  }

  if (!input.feeAgreementId.trim()) {
    throw new Error(
      "A fee agreement identifier is required before conversion.",
    );
  }

  if (!input.actorUserId.trim()) {
    throw new Error(
      "A staff user identifier is required before conversion.",
    );
  }
}

/* ========================================================================== */
/* Read operations                                                             */
/* ========================================================================== */

export async function getOpportunityConversion(
  opportunityId: string,
): Promise<PersistedOpportunityConversion | undefined> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("opportunity_conversions")
      .select("*")
      .eq(
        "opportunity_id",
        opportunityId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read opportunity conversion: ${error.message}`,
    );
  }

  return data
    ? conversionFromRow(
        data as OpportunityConversionRow,
      )
    : undefined;
}

export async function getOpportunityConversionByClaimId(
  claimId: string,
): Promise<PersistedOpportunityConversion | undefined> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("opportunity_conversions")
      .select("*")
      .eq(
        "claim_id",
        claimId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read opportunity conversion by claim id: ${error.message}`,
    );
  }

  return data
    ? conversionFromRow(
        data as OpportunityConversionRow,
      )
    : undefined;
}

export async function listOpportunityConversions(): Promise<
  PersistedOpportunityConversion[]
> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("opportunity_conversions")
      .select("*")
      .order(
        "converted_at",
        {
          ascending: false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to list opportunity conversions: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    conversionFromRow(
      row as OpportunityConversionRow,
    ),
  );
}

export async function opportunityConversionAudit(): Promise<
  OpportunityConversionAuditEntry[]
> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("opportunity_conversion_audit")
      .select("*")
      .order(
        "occurred_at",
        {
          ascending: false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to read opportunity conversion audit: ${error.message}`,
    );
  }

  return (data ?? []).map((row) =>
    auditFromRow(
      row as OpportunityConversionAuditRow,
    ),
  );
}

/* ========================================================================== */
/* Conversion                                                                  */
/* ========================================================================== */

export async function createOpportunityConversion(
  input: CreateOpportunityConversionInput,
): Promise<PersistedOpportunityConversion> {
  validateCreateInput(input);

  const opportunityId =
    input.opportunityId.trim();

  const claimId =
    input.claimId.trim();

  const commercialQuoteId =
    input.commercialQuoteId.trim();

  const commercialSnapshotHash =
    input.commercialSnapshotHash.trim();

  const feeAgreementId =
    input.feeAgreementId.trim();

  /*
   * Preserve the existing idempotent behavior.
   */
  const existing =
    await getOpportunityConversion(
      opportunityId,
    );

  if (existing) {
    const sameConversion =
      existing.claimId === claimId &&
      existing.commercialQuoteId ===
        commercialQuoteId &&
      existing.commercialSnapshotHash ===
        commercialSnapshotHash &&
      existing.feeAgreementId ===
        feeAgreementId;

    if (sameConversion) {
      return existing;
    }

    throw new Error(
      "This opportunity has already been converted using a different claim or commercial pricing record.",
    );
  }

  const claimCollision =
    await getOpportunityConversionByClaimId(
      claimId,
    );

  if (claimCollision) {
    throw new Error(
      "The generated claim identifier is already assigned to another opportunity.",
    );
  }

  const supabase =
    getSupabaseAdmin();

  /*
   * Read only the current opportunity version required by the hardened
   * database conversion function.
   */
  const {
    data: opportunityData,
    error: opportunityError,
  } = await supabase
    .from("opportunities")
    .select(
      "reference, jurisdiction_id, active_commercial_fee_quote_id, row_version",
    )
    .eq(
      "id",
      opportunityId,
    )
    .maybeSingle();

  if (opportunityError) {
    throw new Error(
      `Unable to read opportunity before conversion: ${opportunityError.message}`,
    );
  }

  if (!opportunityData) {
    throw new Error(
      "Opportunity not found.",
    );
  }

  const opportunity =
    opportunityData as OpportunitySourceRow;

  if (
    opportunity.reference !==
    input.opportunityReference.trim()
  ) {
    throw new Error(
      "Opportunity reference does not match the current opportunity record.",
    );
  }

  if (
    opportunity.jurisdiction_id !==
    input.jurisdictionId.trim()
  ) {
    throw new Error(
      "Opportunity jurisdiction does not match the current opportunity record.",
    );
  }

  if (
    opportunity.active_commercial_fee_quote_id !==
    commercialQuoteId
  ) {
    throw new Error(
      "The supplied commercial quote is not the active quote for this opportunity.",
    );
  }

  const {
    data: quoteData,
    error: quoteError,
  } = await supabase
    .from("commercial_fee_quotes")
    .select(
      "quote_id, snapshot_hash, locked_fee_agreement_id",
    )
    .eq(
      "quote_id",
      commercialQuoteId,
    )
    .maybeSingle();

  if (quoteError) {
    throw new Error(
      `Unable to read commercial quote before conversion: ${quoteError.message}`,
    );
  }

  if (!quoteData) {
    throw new Error(
      "Commercial quote not found.",
    );
  }

  const quote =
    quoteData as CommercialQuoteSourceRow;

  if (
    quote.snapshot_hash !==
    commercialSnapshotHash
  ) {
    throw new Error(
      "Commercial quote snapshot does not match the approved pricing record.",
    );
  }

  if (
    quote.locked_fee_agreement_id !==
    feeAgreementId
  ) {
    throw new Error(
      "Commercial quote is not locked to the supplied fee agreement.",
    );
  }

  const expectedRowVersion =
    Number(
      opportunity.row_version,
    );

  if (
    !Number.isInteger(
      expectedRowVersion,
    ) ||
    expectedRowVersion < 1
  ) {
    throw new Error(
      "Opportunity has an invalid database row version.",
    );
  }

  /*
   * The database function owns the atomic conversion transaction.
   *
   * It creates the conversion, updates the opportunity, validates the
   * jurisdiction and commercial controls, and writes the conversion audit.
   */
  const { error: conversionError } =
    await supabase.rpc(
      "convert_opportunity_to_claim",
      {
        p_opportunity_id:
          opportunityId,

        p_claim_id:
          claimId,

        p_claim_reference:
          input.claimReference.trim(),

        p_fee_agreement_id:
          feeAgreementId,

        p_actor_user_id:
          input.actorUserId.trim(),

        p_expected_opportunity_row_version:
          expectedRowVersion,
      },
    );

  if (conversionError) {
    throw new Error(
      `Unable to convert opportunity to claim: ${conversionError.message}`,
    );
  }

  const converted =
    await getOpportunityConversion(
      opportunityId,
    );

  if (!converted) {
    throw new Error(
      "Opportunity conversion completed but the persisted conversion record could not be read.",
    );
  }

  return converted;
}