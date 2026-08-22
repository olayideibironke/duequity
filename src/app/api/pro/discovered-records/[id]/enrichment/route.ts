import { NextRequest, NextResponse } from "next/server";

import type { MonetaryFact, PropertyType, Provenance } from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import { resolveStaffSession } from "@/server/staff-session";

import { getDiscoveredRecordById } from "@/server/discovered-record-store";

import {
  evaluateDiscoveredRecordEnrichmentReadiness,
  getDiscoveredRecordEnrichment,
  saveDiscoveredRecordEnrichment,
  type SourceBalanceInterpretation,
  type VerifiedFactInput,
  type VerifiedMonetaryFactInput,
} from "@/server/discovered-record-enrichment-store";

/**
 * DISCOVERED RECORD ENRICHMENT API
 *
 * Reads and writes verified enrichment facts for a reviewed discovered record.
 *
 * Enrichment remains separate from Opportunity creation.
 *
 * This endpoint does NOT:
 *
 *   - create an Opportunity
 *   - create a Claim
 *   - approve a jurisdiction
 *   - approve legal rules
 *   - authorize claimant intake
 *   - authorize outreach
 *   - approve commercial pricing
 */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface EnrichmentRequestBody {
  propertyType?: VerifiedFactInput<PropertyType>;

  salePrice?: VerifiedMonetaryFactInput;

  debtSatisfied?: VerifiedMonetaryFactInput;

  taxesOwed?: VerifiedMonetaryFactInput;

  saleCosts?: VerifiedMonetaryFactInput;

  juniorLiens?: VerifiedMonetaryFactInput;

  estimatedSurplus?: VerifiedMonetaryFactInput;

  confirmedSurplus?: VerifiedMonetaryFactInput;

  sellingEntity?: VerifiedFactInput<string>;

  sourceBalanceInterpretation?: VerifiedFactInput<SourceBalanceInterpretation>;
}

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

function successResponse(body: unknown) {
  return NextResponse.json(body, {
    status: 200,

    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function hasAnyEnrichmentField(body: EnrichmentRequestBody): boolean {
  return (
    body.propertyType !== undefined ||
    body.salePrice !== undefined ||
    body.debtSatisfied !== undefined ||
    body.taxesOwed !== undefined ||
    body.saleCosts !== undefined ||
    body.juniorLiens !== undefined ||
    body.estimatedSurplus !== undefined ||
    body.confirmedSurplus !== undefined ||
    body.sellingEntity !== undefined ||
    body.sourceBalanceInterpretation !== undefined
  );
}

function hasValidProvenanceShape(value: unknown): value is Provenance {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Provenance>;

  return (
    typeof candidate.sourceKind === "string" &&
    typeof candidate.sourceName === "string" &&
    typeof candidate.sourceDate === "string" &&
    typeof candidate.quality === "string"
  );
}

function hasValidMonetaryFactShape(value: unknown): value is MonetaryFact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MonetaryFact>;

  return (
    typeof candidate.amount === "number" &&
    typeof candidate.quality === "string"
  );
}

function validateVerifiedFactInput(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    value?: unknown;

    provenance?: unknown;
  };

  return (
    candidate.value !== undefined &&
    hasValidProvenanceShape(candidate.provenance)
  );
}

function validateVerifiedMoneyInput(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    fact?: unknown;

    provenance?: unknown;
  };

  return (
    hasValidMonetaryFactShape(candidate.fact) &&
    hasValidProvenanceShape(candidate.provenance)
  );
}

function validateBody(body: EnrichmentRequestBody): string | undefined {
  if (!hasAnyEnrichmentField(body)) {
    return "At least one enrichment fact is required.";
  }

  if (
    body.propertyType !== undefined &&
    !validateVerifiedFactInput(body.propertyType)
  ) {
    return "Property type enrichment is invalid.";
  }

  if (
    body.salePrice !== undefined &&
    !validateVerifiedMoneyInput(body.salePrice)
  ) {
    return "Sale price enrichment is invalid.";
  }

  if (
    body.debtSatisfied !== undefined &&
    !validateVerifiedMoneyInput(body.debtSatisfied)
  ) {
    return "Debt satisfied enrichment is invalid.";
  }

  if (
    body.taxesOwed !== undefined &&
    !validateVerifiedMoneyInput(body.taxesOwed)
  ) {
    return "Taxes owed enrichment is invalid.";
  }

  if (
    body.saleCosts !== undefined &&
    !validateVerifiedMoneyInput(body.saleCosts)
  ) {
    return "Sale costs enrichment is invalid.";
  }

  if (
    body.juniorLiens !== undefined &&
    !validateVerifiedMoneyInput(body.juniorLiens)
  ) {
    return "Junior liens enrichment is invalid.";
  }

  if (
    body.estimatedSurplus !== undefined &&
    !validateVerifiedMoneyInput(body.estimatedSurplus)
  ) {
    return "Estimated surplus enrichment is invalid.";
  }

  if (
    body.confirmedSurplus !== undefined &&
    !validateVerifiedMoneyInput(body.confirmedSurplus)
  ) {
    return "Confirmed surplus enrichment is invalid.";
  }

  if (
    body.sellingEntity !== undefined &&
    !validateVerifiedFactInput(body.sellingEntity)
  ) {
    return "Selling entity enrichment is invalid.";
  }

  if (
    body.sourceBalanceInterpretation !== undefined &&
    !validateVerifiedFactInput(body.sourceBalanceInterpretation)
  ) {
    return "Source balance interpretation enrichment is invalid.";
  }

  return undefined;
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "opportunity.read")) {
    return errorResponse(
      "You do not have permission to view discovered-record enrichment.",
      403,
    );
  }

  const { id } = await context.params;

  const record = await getDiscoveredRecordById(id);

  if (!record) {
    return errorResponse("Discovered record not found.", 404);
  }

  if (!clearedForState(session, record.state)) {
    return errorResponse(
      "You are not cleared to view records in this state.",
      403,
    );
  }

  const enrichment = await getDiscoveredRecordEnrichment(record.id);

  const readiness = evaluateDiscoveredRecordEnrichmentReadiness(enrichment, {
    hasSourceListedBalance: record.sourceListedBalanceCents !== undefined,
  });

  return successResponse({
    ok: true,

    discoveredRecord: {
      id: record.id,

      status: record.status,

      formerOwnerName: record.formerOwnerName,

      addressLine1: record.addressLine1,

      city: record.city,

      county: record.county,

      state: record.state,

      sourceListedBalanceCents: record.sourceListedBalanceCents,
    },

    enrichment: enrichment ?? null,

    readiness,
  });
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const session = await resolveStaffSession();

  if (!session) {
    return errorResponse(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "opportunity.write")) {
    return errorResponse(
      "You do not have permission to enrich discovered operational records.",
      403,
    );
  }

  const { id } = await context.params;

  const record = await getDiscoveredRecordById(id);

  if (!record) {
    return errorResponse("Discovered record not found.", 404);
  }

  if (!clearedForState(session, record.state)) {
    return errorResponse(
      "You are not cleared to enrich records in this state.",
      403,
    );
  }

  if (record.status !== "reviewed") {
    return errorResponse(
      "Only reviewed discovered records may receive verified enrichment.",
      409,
    );
  }

  let body: EnrichmentRequestBody;

  try {
    body = (await request.json()) as EnrichmentRequestBody;
  } catch {
    return errorResponse("A valid JSON enrichment request is required.", 400);
  }

  const validationError = validateBody(body);

  if (validationError) {
    return errorResponse(validationError, 400);
  }

  try {
    const enrichment = await saveDiscoveredRecordEnrichment({
      discoveredRecordId: record.id,

      actorUserId: session.user.id,

      propertyType: body.propertyType,

      salePrice: body.salePrice,

      debtSatisfied: body.debtSatisfied,

      taxesOwed: body.taxesOwed,

      saleCosts: body.saleCosts,

      juniorLiens: body.juniorLiens,

      estimatedSurplus: body.estimatedSurplus,

      confirmedSurplus: body.confirmedSurplus,

      sellingEntity: body.sellingEntity,

      sourceBalanceInterpretation: body.sourceBalanceInterpretation,
    });

    const readiness = evaluateDiscoveredRecordEnrichmentReadiness(enrichment, {
      hasSourceListedBalance: record.sourceListedBalanceCents !== undefined,
    });

    return successResponse({
      ok: true,

      enrichment,

      readiness,

      operationalEffects: {
        opportunitiesCreated: 0,

        claimsCreated: 0,

        jurisdictionApproved: false,

        intakeAuthorized: false,

        outreachAuthorized: false,
      },
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Unable to save discovered-record enrichment.",
      400,
    );
  }
}