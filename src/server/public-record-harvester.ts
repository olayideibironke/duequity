import "server-only";

import type {
  IsoInstant,
} from "@/domain/types";

import {
  discoverOfficialPublicRecords,
  listSupportedOfficialPublicRecords,
  type OfficialPublicRecord,
} from "@/server/public-record-discovery";

import {
  discoveredRecordId,
  listDiscoveredRecords,
  saveDiscoveredRecord,
  type DiscoveredRecord,
} from "@/server/discovered-record-store";

/**
 * OFFICIAL PUBLIC-RECORD HARVESTER
 *
 * Pulls records from activated official source adapters and stages them in the
 * discovered-record repository.
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

export interface CountyPublicRecordHarvestResult
  extends PublicRecordHarvestResult {
  state: string;

  county: string;

  sourceName: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function nowIsoInstant(): IsoInstant {
  return new Date().toISOString() as IsoInstant;
}

async function stageSourceRecords(
  sourceRecords: OfficialPublicRecord[],
  harvestedAt: IsoInstant,
): Promise<{
  records: DiscoveredRecord[];

  createdCount: number;

  refreshedCount: number;
}> {
  if (sourceRecords.length === 0) {
    return {
      records: [],

      createdCount: 0,

      refreshedCount: 0,
    };
  }

  const existingRecords =
    await listDiscoveredRecords();

  const existingIds =
    new Set(
      existingRecords.map(
        (record) =>
          record.id,
      ),
    );

  const stagedRecords: DiscoveredRecord[] = [];

  let createdCount = 0;

  let refreshedCount = 0;

  for (
    const sourceRecord of sourceRecords
  ) {
    const id =
      discoveredRecordId(
        sourceRecord.adapterKey,
        sourceRecord.recordKey,
      );

    const existedBefore =
      existingIds.has(
        id,
      );

    const staged =
      await saveDiscoveredRecord({
        adapterKey:
          sourceRecord.adapterKey,

        recordKey:
          sourceRecord.recordKey,

        sourceKind:
          "county_tax_sale_list",

        sourceName:
          sourceRecord.sourceName,

        sourceUrl:
          sourceRecord.sourceUrl,

        sourceReference:
          sourceRecord.sourceReference,

        formerOwnerName:
          sourceRecord.formerOwnerName,

        currentOwnerName:
          sourceRecord.currentOwnerName,

        propertyId:
          sourceRecord.propertyId,

        addressLine1:
          sourceRecord.addressLine1,

        city:
          sourceRecord.city,

        county:
          sourceRecord.county,

        state:
          sourceRecord.state,

        postalCode:
          sourceRecord.postalCode,

        saleType:
          sourceRecord.saleType,

        saleDate:
          sourceRecord.saleDate,

        dateTransferred:
          sourceRecord.dateTransferred,

        caseNumber:
          sourceRecord.caseNumber,

        parcelNumber:
          sourceRecord.parcelNumber,

        mapNumber:
          sourceRecord.mapNumber,

        gridNumber:
          sourceRecord.gridNumber,

        legalDescription:
          sourceRecord.legalDescription,

        agencyName:
          sourceRecord.agencyName,

        agencyPhone:
          sourceRecord.agencyPhone,

        custodian:
          sourceRecord.custodian,

        sourceListedBidCents:
          sourceRecord.bidCents,

        sourceListedDepositCents:
          sourceRecord.depositCents,

        sourceListedSurplusCents:
          sourceRecord.sourceListedSurplusCents,

        /*
         * Preserve the source's original balance field for existing consumers
         * while also storing the richer source-listed surplus evidence.
         */
        sourceListedBalanceCents:
          sourceRecord.balanceOwedCents,

        sourceRetrievedAt:
          harvestedAt,
      });

    stagedRecords.push(
      staged,
    );

    if (
      existedBefore
    ) {
      refreshedCount += 1;
    } else {
      createdCount += 1;

      existingIds.add(
        id,
      );
    }
  }

  return {
    records:
      stagedRecords,

    createdCount,

    refreshedCount,
  };
}

/* ========================================================================== */
/* County-selective harvest                                                    */
/* ========================================================================== */

export async function harvestOfficialPublicRecordsForCounty(
  state: string,
  county: string,
): Promise<CountyPublicRecordHarvestResult> {
  const normalizedState =
    state.trim();

  const normalizedCounty =
    county.trim();

  if (
    !normalizedState
  ) {
    throw new Error(
      "A state is required to pull county surplus records.",
    );
  }

  if (
    !normalizedCounty
  ) {
    throw new Error(
      "A county is required to pull county surplus records.",
    );
  }

  const discovery =
    await discoverOfficialPublicRecords({
      state:
        normalizedState,

      county:
        normalizedCounty,
    });

  if (
    discovery.status === "unsupported"
  ) {
    throw new Error(
      discovery.message,
    );
  }

  if (
    discovery.status === "error"
  ) {
    throw new Error(
      discovery.message,
    );
  }

  const harvestedAt =
    nowIsoInstant();

  const staged =
    await stageSourceRecords(
      discovery.records,
      harvestedAt,
    );

  return {
    harvestedAt,

    state:
      normalizedState.toUpperCase(),

    county:
      normalizedCounty,

    sourceName:
      discovery.sourceName,

    sourceRecordCount:
      discovery.records.length,

    stagedRecordCount:
      staged.records.length,

    createdCount:
      staged.createdCount,

    refreshedCount:
      staged.refreshedCount,

    records:
      staged.records,
  };
}

/* ========================================================================== */
/* Global harvest                                                              */
/* ========================================================================== */

export async function harvestSupportedPublicRecords(): Promise<PublicRecordHarvestResult> {
  const harvestedAt =
    nowIsoInstant();

  const sourceRecords =
    await listSupportedOfficialPublicRecords();

  if (
    sourceRecords.length === 0
  ) {
    throw new Error(
      "No official public records were returned by the activated source adapters. Harvesting was not treated as successful.",
    );
  }

  const staged =
    await stageSourceRecords(
      sourceRecords,
      harvestedAt,
    );

  return {
    harvestedAt,

    sourceRecordCount:
      sourceRecords.length,

    stagedRecordCount:
      staged.records.length,

    createdCount:
      staged.createdCount,

    refreshedCount:
      staged.refreshedCount,

    records:
      staged.records,
  };
}