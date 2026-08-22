import {
  type NextRequest,
  NextResponse,
} from "next/server";

import type {
  IsoDate,
  Opportunity,
  Property,
  Provenance,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  getDiscoveredRecordById,
  promoteDiscoveredRecord,
} from "@/server/discovered-record-store";

import {
  evaluateDiscoveredRecordEnrichmentReadiness,
  getDiscoveredRecordEnrichment,
} from "@/server/discovered-record-enrichment-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import {
  ensureOpportunityJurisdictionProvenance,
  getOpportunityById,
  saveOpportunityRecord,
} from "@/server/opportunity-store";

import { resolveStaffSession } from "@/server/staff-session";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Response helpers                                                            */
/* ========================================================================== */

function errorResponse(
  message: string,
  status = 400,
) {
  return NextResponse.json(
    {
      ok: false,

      error: message,
    },
    {
      status,
    },
  );
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date()
    .toISOString()
    .slice(0, 10) as IsoDate;
}

function normalizeCounty(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(/\bcounty\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recordSuffix(
  discoveredRecordId: string,
): string {
  return discoveredRecordId
    .replace(/^dr-/, "")
    .trim();
}

function opportunityIdForRecord(
  discoveredRecordId: string,
): string {
  return `opportunity-${recordSuffix(
    discoveredRecordId,
  )}`;
}

function propertyIdForRecord(
  discoveredRecordId: string,
): string {
  return `property-${recordSuffix(
    discoveredRecordId,
  )}`;
}

function addressIdForRecord(
  discoveredRecordId: string,
): string {
  return `address-${recordSuffix(
    discoveredRecordId,
  )}`;
}

function ownerIdForRecord(
  discoveredRecordId: string,
): string {
  return `owner-${recordSuffix(
    discoveredRecordId,
  )}`;
}

function opportunityReferenceForRecord(
  discoveredRecordId: string,
  saleDate: IsoDate,
): string {
  const year =
    saleDate.slice(0, 4);

  const suffix =
    recordSuffix(discoveredRecordId)
      .slice(0, 8)
      .toUpperCase();

  return `OPP-${year}-${suffix}`;
}

function addDays(
  date: IsoDate,
  days: number,
): IsoDate {
  const [
    year,
    month,
    day,
  ] =
    date
      .split("-")
      .map(Number);

  const value =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  value.setUTCDate(
    value.getUTCDate() + days,
  );

  return value
    .toISOString()
    .slice(0, 10) as IsoDate;
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  _request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const session =
    await resolveStaffSession();

  if (!session) {
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
      "You do not have permission to promote discovered records into Opportunities.",
      403,
    );
  }

  const {
    id,
  } =
    await context.params;

  const [
    record,
    enrichment,
    rulePackages,
  ] =
    await Promise.all([
      getDiscoveredRecordById(id),

      getDiscoveredRecordEnrichment(id),

      listJurisdictionRulePackages(),
    ]);

  if (!record) {
    return errorResponse(
      "Discovered record not found.",
      404,
    );
  }

  if (
    !clearedForState(
      session,
      record.state,
    )
  ) {
    return errorResponse(
      `You are not cleared to promote discovered records in ${record.state}.`,
      403,
    );
  }

  /*
   * Freeze against the newest currently approved package that matches the
   * discovered record's state and county.
   */
  const jurisdictionPackage =
    rulePackages
      .filter(
        (rulePackage) =>
          rulePackage.status ===
            "approved" &&
          Boolean(
            rulePackage.rule,
          ) &&
          rulePackage.rule?.state ===
            record.state &&
          normalizeCounty(
            rulePackage.rule?.county ??
              "",
          ) ===
            normalizeCounty(
              record.county,
            ),
      )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          right.version -
          left.version,
      )[0];

  const jurisdiction =
    jurisdictionPackage?.rule;

  if (
    !jurisdictionPackage ||
    !jurisdiction
  ) {
    return errorResponse(
      "No approved Duequity jurisdiction rule is available for this discovered record.",
      409,
    );
  }

  const legalRuleVersion =
    jurisdiction.legalRuleVersion;

  if (
    legalRuleVersion ===
      undefined ||
    !Number.isInteger(
      legalRuleVersion,
    ) ||
    legalRuleVersion < 1
  ) {
    return errorResponse(
      "The approved jurisdiction rule does not contain a valid legal-rule version. Opportunity promotion is blocked.",
      409,
    );
  }

  /*
   * Promotion is retry-safe when the source record is already linked to a
   * valid persisted Opportunity.
   *
   * Older Opportunities created before frozen jurisdiction provenance was
   * enforced are repaired here only when their existing values are empty.
   * The store refuses to overwrite conflicting frozen provenance.
   */
  if (
    record.status === "promoted" &&
    record.promotedOpportunityId
  ) {
    const existingOpportunity =
      await getOpportunityById(
        record.promotedOpportunityId,
      );

    if (!existingOpportunity) {
      return errorResponse(
        "The discovered record is marked promoted, but its Opportunity could not be resolved.",
        409,
      );
    }

    if (
      existingOpportunity.jurisdictionId !==
      jurisdiction.id
    ) {
      return errorResponse(
        "The existing Opportunity belongs to a different jurisdiction than the currently approved source-record match.",
        409,
      );
    }

    try {
      await ensureOpportunityJurisdictionProvenance(
        existingOpportunity.id,
        {
          jurisdictionPackageId:
            jurisdictionPackage.id,

          jurisdictionPackageVersion:
            jurisdictionPackage.version,

          jurisdictionLegalRuleVersion:
            legalRuleVersion,
        },
      );
    } catch (error) {
      return errorResponse(
        error instanceof Error
          ? error.message
          : "The existing Opportunity jurisdiction provenance could not be frozen.",
        409,
      );
    }

    const repairedOpportunity =
      await getOpportunityById(
        existingOpportunity.id,
      );

    return NextResponse.json({
      ok: true,

      alreadyPromoted: true,

      jurisdictionProvenanceFrozen:
        true,

      opportunity:
        repairedOpportunity ??
        existingOpportunity,

      discoveredRecord:
        record,
    });
  }

  if (
    record.status !== "reviewed"
  ) {
    return errorResponse(
      "The discovered record must complete operational review before promotion.",
      409,
    );
  }

  const readiness =
    evaluateDiscoveredRecordEnrichmentReadiness(
      enrichment,
      {
        hasSourceListedBalance:
          record.sourceListedBalanceCents !==
          undefined,
      },
    );

  if (!readiness.ready) {
    return errorResponse(
      `The discovered record is not ready for promotion. Missing: ${readiness.missing.join(
        ", ",
      )}.`,
      409,
    );
  }

  /*
   * These checks repeat the readiness requirements so TypeScript and the
   * promotion boundary both fail closed if the enrichment contract changes.
   */
  if (
    !enrichment?.propertyType ||
    !enrichment.salePrice ||
    !enrichment.debtSatisfied ||
    !enrichment.estimatedSurplus ||
    !enrichment.sellingEntity
  ) {
    return errorResponse(
      "Required verified enrichment is incomplete.",
      409,
    );
  }

  if (
    !record.postalCode?.trim()
  ) {
    return errorResponse(
      "A verified postal code is required before this record can become an Opportunity.",
      409,
    );
  }

  const today =
    currentIsoDate();

  const suffix =
    recordSuffix(
      record.id,
    );

  const opportunityId =
    opportunityIdForRecord(
      record.id,
    );

  const propertyId =
    record.propertyId?.trim() ||
    propertyIdForRecord(
      record.id,
    );

  const sourceDate =
    record.sourceRetrievedAt
      .slice(
        0,
        10,
      ) as IsoDate;

  const sourceProvenance: Provenance = {
    sourceKind:
      record.sourceKind,

    sourceName:
      record.sourceName,

    sourceReference:
      record.sourceReference,

    sourceUrl:
      record.sourceUrl,

    sourceDate,

    lastVerified:
      today,

    quality:
      "verified",

    analystNote:
      "Promoted from a reviewed Duequity discovered record.",
  };

  const property: Property = {
    id:
      propertyId,

    address: {
      id:
        addressIdForRecord(
          record.id,
        ),

      line1:
        record.addressLine1,

      city:
        record.city,

      county:
        record.county,

      state:
        record.state,

      postalCode:
        record.postalCode.trim(),
    },

    propertyType:
      enrichment.propertyType.value,

    parcelNumber:
      record.parcelNumber,

    legalDescription:
      record.legalDescription,

    provenance:
      sourceProvenance,
  };

  const opportunity: Opportunity = {
    id:
      opportunityId,

    reference:
      opportunityReferenceForRecord(
        record.id,
        record.saleDate,
      ),

    propertyId:
      property.id,

    jurisdictionId:
      jurisdiction.id,

    sale: {
      saleType:
        record.saleType,

      saleDate:
        record.saleDate,

      salePrice:
        enrichment.salePrice.fact,

      debtSatisfied:
        enrichment.debtSatisfied.fact,

      taxesOwed:
        enrichment.taxesOwed?.fact,

      saleCosts:
        enrichment.saleCosts?.fact,

      juniorLiens:
        enrichment.juniorLiens?.fact,

      caseNumber:
        record.caseNumber,

      sellingEntity:
        enrichment.sellingEntity.value,

      provenance:
        sourceProvenance,
    },

    priorOwners: [
      {
        id:
          ownerIdForRecord(
            record.id,
          ),

        nameOnRecord:
          record.formerOwnerName,

        ownerKind:
          "individual",

        provenance:
          sourceProvenance,
      },
    ],

    estimatedSurplus:
      enrichment.estimatedSurplus.fact,

    confirmedSurplus:
      enrichment.confirmedSurplus?.fact,

    custodian:
      record.custodian,

    claimDeadline:
      jurisdiction.claimDeadlineDays !==
      undefined
        ? addDays(
            record.saleDate,
            jurisdiction.claimDeadlineDays,
          )
        : undefined,

    status:
      enrichment.confirmedSurplus
        ? "surplus_confirmed"
        : "surplus_suspected",

    ownerLocated:
      "not_started",

    contactConfidence:
      "none",

    flags: [],

    priority: 3,

    riskScore: 0,

    createdAt:
      today,

    lastActivityAt:
      today,

    provenance:
      sourceProvenance,

    notes: [
      {
        id:
          `note-${suffix}-promotion`,

        body:
          "Created through controlled promotion from a reviewed discovered record with verified enrichment.",

        authorName:
          session.user.name,

        createdAt:
          today,

        visibility:
          "internal",
      },
    ],
  };

  let savedOpportunity: Opportunity;

  try {
    savedOpportunity =
      await saveOpportunityRecord({
        opportunity,

        property,
      });
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "The Opportunity could not be persisted.",
      409,
    );
  }

  /*
   * Freeze the exact approved jurisdiction package and legal-rule version used
   * at promotion before the discovery record is allowed to enter promoted
   * status.
   */
  try {
    await ensureOpportunityJurisdictionProvenance(
      savedOpportunity.id,
      {
        jurisdictionPackageId:
          jurisdictionPackage.id,

        jurisdictionPackageVersion:
          jurisdictionPackage.version,

        jurisdictionLegalRuleVersion:
          legalRuleVersion,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "The Opportunity jurisdiction provenance could not be frozen.",

        opportunityCreated:
          true,

        opportunityId:
          savedOpportunity.id,

        jurisdictionProvenanceFrozen:
          false,

        retrySafe:
          true,
      },
      {
        status: 409,
      },
    );
  }

  try {
    const promotedRecord =
      await promoteDiscoveredRecord({
        id:
          record.id,

        opportunityId:
          savedOpportunity.id,
      });

    const persistedOpportunity =
      await getOpportunityById(
        savedOpportunity.id,
      );

    return NextResponse.json({
      ok: true,

      alreadyPromoted: false,

      jurisdictionProvenanceFrozen:
        true,

      opportunity:
        persistedOpportunity ??
        savedOpportunity,

      discoveredRecord:
        promotedRecord,
    });
  } catch (error) {
    /*
     * The Opportunity uses deterministic identifiers, and its jurisdiction
     * provenance is already frozen. A retry can safely finish linking the
     * discovered record if persistence succeeded first.
     */
    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "The discovered record could not be marked promoted.",

        opportunityCreated:
          true,

        opportunityId:
          savedOpportunity.id,

        jurisdictionProvenanceFrozen:
          true,

        retrySafe:
          true,
      },
      {
        status: 409,
      },
    );
  }
}