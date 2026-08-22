import "server-only";

import type { IsoInstant } from "@/domain/types";

import { listSupportedOfficialPublicRecords } from "@/server/public-record-discovery";

import {
  discoveredRecordId,
  listDiscoveredRecords,
  saveDiscoveredRecord,
  type DiscoveredRecord,
} from "@/server/discovered-record-store";

/**
 * OFFICIAL PUBLIC-RECORD HARVESTER
 *
 * Pulls all records from activated official source adapters and stages them
 * in the discovered-record repository.
 *
 * The harvester refreshes source evidence while preserving analyst workflow
 * state already attached to an existing staged record.
 *
 * Harvesting does NOT:
 *
 *   - create an Opportunity
 *   - create a Claim
 *   - approve a jurisdiction
 *   - determine legal rules
 *   - authorize claimant intake
 *   - authorize outreach
 *   - calculate commercial pricing
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export interface PublicRecordHarvestResult {
  harvestedAt: IsoInstant;

  sourceRecordCount: number;

  stagedRecordCount: number;

  createdCount: number;

  refreshedCount: number;

  records: DiscoveredRecord[];
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function nowIsoInstant(): IsoInstant {
  return new Date().toISOString() as IsoInstant;
}

/* ========================================================================== */
/* Harvest                                                                     */
/* ========================================================================== */

export async function harvestSupportedPublicRecords(): Promise<PublicRecordHarvestResult> {
  const harvestedAt = nowIsoInstant();

  const sourceRecords = await listSupportedOfficialPublicRecords();

  if (sourceRecords.length === 0) {
    throw new Error(
      "No official public records were returned by the activated source adapters. Harvesting was not treated as successful.",
    );
  }

  const existingRecords = await listDiscoveredRecords();

  const existingIds = new Set(existingRecords.map((record) => record.id));

  const stagedRecords: DiscoveredRecord[] = [];

  let createdCount = 0;

  let refreshedCount = 0;

  for (const sourceRecord of sourceRecords) {
    const id = discoveredRecordId(
      sourceRecord.adapterKey,
      sourceRecord.recordKey,
    );

    const existedBefore = existingIds.has(id);

    const staged = await saveDiscoveredRecord({
      adapterKey: sourceRecord.adapterKey,

      recordKey: sourceRecord.recordKey,

      sourceKind: "county_tax_sale_list",

      sourceName: sourceRecord.sourceName,

      sourceUrl: sourceRecord.sourceUrl,

      sourceReference: sourceRecord.sourceReference,

      formerOwnerName: sourceRecord.formerOwnerName,

      currentOwnerName: sourceRecord.currentOwnerName,

      propertyId: sourceRecord.propertyId,

      addressLine1: sourceRecord.addressLine1,

      city: sourceRecord.city,

      county: sourceRecord.county,

      state: sourceRecord.state,

      postalCode: sourceRecord.postalCode,

      saleType: sourceRecord.saleType,

      saleDate: sourceRecord.saleDate,

      dateTransferred: sourceRecord.dateTransferred,

      caseNumber: sourceRecord.caseNumber,

      parcelNumber: sourceRecord.parcelNumber,

      mapNumber: sourceRecord.mapNumber,

      gridNumber: sourceRecord.gridNumber,

      legalDescription: sourceRecord.legalDescription,

      agencyName: sourceRecord.agencyName,

      agencyPhone: sourceRecord.agencyPhone,

      custodian: sourceRecord.custodian,

      sourceListedBidCents: sourceRecord.bidCents,

      sourceListedDepositCents: sourceRecord.depositCents,

      sourceListedSurplusCents: sourceRecord.sourceListedSurplusCents,

      /*
       * Preserve the source's original "Balance Owed" column for existing
       * consumers while also storing the richer surplus evidence field.
       */
      sourceListedBalanceCents: sourceRecord.balanceOwedCents,

      sourceRetrievedAt: harvestedAt,
    });

    stagedRecords.push(staged);

    if (existedBefore) {
      refreshedCount += 1;
    } else {
      createdCount += 1;

      existingIds.add(id);
    }
  }

  return {
    harvestedAt,

    sourceRecordCount: sourceRecords.length,

    stagedRecordCount: stagedRecords.length,

    createdCount,

    refreshedCount,

    records: stagedRecords,
  };
}
