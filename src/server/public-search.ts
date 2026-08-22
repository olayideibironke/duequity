import "server-only";

import { createHash } from "node:crypto";

import { evaluateIntakeGate } from "@/domain/compliance";

import type {
  ComplianceStatus,
  IsoDate,
  Jurisdiction,
  Opportunity,
  Property,
  SaleType,
  StateCode,
  SurplusCustodian,
} from "@/domain/types";

import { maskStreetAddress } from "@/lib/format";

import { countySlug } from "@/lib/slug";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { listOpportunities, listProperties } from "@/server/opportunity-store";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import {
  discoverOfficialPublicRecords,
  listSupportedOfficialPublicRecords,
  type OfficialPublicRecord,
} from "@/server/public-record-discovery";

/* ========================================================================== */
/* Public projection                                                           */
/* ========================================================================== */

export interface PublicMatch {
  token: string;

  addressMasked: string;

  city: string;

  county: string;

  state: StateCode;

  postalCodePrefix: string;

  saleType: SaleType;

  saleDate: IsoDate;

  caseNumber?: string;

  parcelNumber?: string;

  agencyName: string;

  agencyPhone?: string;

  agencyWebsite?: string;

  custodian: SurplusCustodian;

  surplusStatus: "confirmed_by_agency" | "possible" | "under_research";

  sourceName: string;

  sourceReference?: string;

  sourceUrl?: string;

  intake: "open" | "attorney_required" | "closed";

  intakeExplanation: string;

  jurisdictionSlug: {
    state: string;

    county: string;
  };

  claimDeadline?: IsoDate;

  complianceStatus: ComplianceStatus;
}

/* ========================================================================== */
/* Search                                                                      */
/* ========================================================================== */

export interface SearchQuery {
  address?: string;

  ownerName?: string;

  state?: string;

  county?: string;
}

export type SearchOutcome =
  | {
      kind: "empty_query";
    }
  | {
      kind: "no_match";

      query: SearchQuery;
    }
  | {
      kind: "coverage_unavailable";

      query: SearchQuery;

      message: string;
    }
  | {
      kind: "source_unavailable";

      query: SearchQuery;

      sourceName: string;

      message: string;
    }
  | {
      kind: "matches";

      matches: PublicMatch[];

      query: SearchQuery;
    };

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function normalizedTokens(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length > 1);
}

function normalizedCounty(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bcounty\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function opaquePublicToken(seed: string): string {
  const digest = createHash("sha256")
    .update(`duequity-public-v2:${seed}`)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  return `DQ${digest}`;
}

export function publicToken(opportunityId: string, propertyId: string): string {
  return opaquePublicToken(`opportunity:${opportunityId}:${propertyId}`);
}

function officialPublicToken(record: OfficialPublicRecord): string {
  return opaquePublicToken(`official:${record.adapterKey}:${record.recordKey}`);
}

function addDays(date: IsoDate, days: number): IsoDate {
  const value = new Date(`${date}T00:00:00.000Z`);

  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10) as IsoDate;
}

function buildApprovedJurisdictionMap(
  packages: Awaited<ReturnType<typeof listJurisdictionRulePackages>>,
): Map<string, Jurisdiction> {
  const map = new Map<string, Jurisdiction>();

  for (const rulePackage of packages) {
    if (rulePackage.status === "approved" && rulePackage.rule) {
      map.set(rulePackage.rule.id, rulePackage.rule);
    }
  }

  return map;
}

function findApprovedJurisdictionForOfficialRecord(
  record: OfficialPublicRecord,
  jurisdictions: Iterable<Jurisdiction>,
): Jurisdiction | undefined {
  for (const jurisdiction of jurisdictions) {
    if (jurisdiction.state !== record.state) {
      continue;
    }

    if (
      normalizedCounty(jurisdiction.county ?? "") !==
      normalizedCounty(record.county)
    ) {
      continue;
    }

    return jurisdiction;
  }

  return undefined;
}

function searchableOpportunity(
  opportunity: Opportunity,
  convertedOpportunityIds: Set<string>,
): boolean {
  if (convertedOpportunityIds.has(opportunity.id)) {
    return false;
  }

  if (opportunity.convertedClaimId) {
    return false;
  }

  if (
    String(opportunity.status) === "converted" ||
    String(opportunity.status) === "disqualified"
  ) {
    return false;
  }

  return true;
}

function addressMatches(property: Property, rawAddress: string): boolean {
  if (!rawAddress.trim()) {
    return true;
  }

  const tokens = normalizedTokens(rawAddress);

  if (tokens.length === 0) {
    return false;
  }

  const haystack = [
    property.address.line1,
    property.address.city,
    property.address.county,
    property.address.state,
    property.address.postalCode,
    property.parcelNumber ?? "",
    property.taxAccountNumber ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return tokens.some((token) => haystack.includes(token));
}

function ownerMatches(opportunity: Opportunity, rawOwnerName: string): boolean {
  if (!rawOwnerName.trim()) {
    return true;
  }

  const tokens = normalizedTokens(rawOwnerName);

  if (tokens.length === 0) {
    return false;
  }

  return opportunity.priorOwners.some((owner) => {
    const name = owner.nameOnRecord.toLowerCase();

    return tokens.some((token) => name.includes(token));
  });
}

function stateMatches(property: Property, rawState: string): boolean {
  const state = rawState.trim().toUpperCase();

  if (!state) {
    return true;
  }

  return property.address.state === state;
}

function countyMatches(property: Property, rawCounty: string): boolean {
  if (!rawCounty.trim()) {
    return true;
  }

  return (
    normalizedCounty(property.address.county) === normalizedCounty(rawCounty)
  );
}

/* ========================================================================== */
/* Persisted opportunity projection                                            */
/* ========================================================================== */

function toPersistedPublicMatch(
  opportunity: Opportunity,
  property: Property,
  jurisdiction: Jurisdiction,
): PublicMatch {
  const gate = evaluateIntakeGate(jurisdiction);

  const blockingReview = opportunity.flags.some(
    (flag) => flag.severity === "blocking" && !flag.resolvedAt,
  );

  const intake: PublicMatch["intake"] = blockingReview
    ? "closed"
    : gate.outcome === "permitted"
      ? "open"
      : gate.outcome === "conditional"
        ? "attorney_required"
        : "closed";

  return {
    token: publicToken(opportunity.id, property.id),

    addressMasked: maskStreetAddress(property.address.line1),

    city: property.address.city,

    county: property.address.county,

    state: property.address.state,

    postalCodePrefix: property.address.postalCode.slice(0, 3),

    saleType: opportunity.sale.saleType,

    saleDate: opportunity.sale.saleDate,

    caseNumber: opportunity.sale.caseNumber,

    parcelNumber: property.parcelNumber,

    agencyName: jurisdiction.agencyName,

    agencyPhone: jurisdiction.agencyPhone,

    agencyWebsite: jurisdiction.agencyWebsite,

    custodian: opportunity.custodian,

    surplusStatus: opportunity.confirmedSurplus
      ? "confirmed_by_agency"
      : opportunity.estimatedSurplus.quality === "unverified"
        ? "under_research"
        : "possible",

    sourceName: opportunity.provenance.sourceName,

    sourceReference: opportunity.provenance.sourceReference,

    sourceUrl: opportunity.provenance.sourceUrl,

    intake,

    intakeExplanation: blockingReview
      ? "This record remains under internal review, so Duequity intake is not currently available."
      : gate.reason,

    jurisdictionSlug: {
      state: jurisdiction.state.toLowerCase(),

      county: countySlug(jurisdiction.county ?? "statewide"),
    },

    claimDeadline: opportunity.claimDeadline,

    complianceStatus: jurisdiction.complianceStatus,
  };
}

/* ========================================================================== */
/* Official live-record projection                                             */
/* ========================================================================== */

function toOfficialPublicMatch(
  record: OfficialPublicRecord,
  jurisdiction: Jurisdiction | undefined,
): PublicMatch {
  if (!jurisdiction) {
    return {
      token: officialPublicToken(record),

      addressMasked: maskStreetAddress(record.addressLine1),

      city: record.city,

      county: record.county,

      state: record.state,

      postalCodePrefix: record.postalCode?.slice(0, 3) ?? "",

      saleType: record.saleType,

      saleDate: record.saleDate,

      caseNumber: record.caseNumber,

      parcelNumber: record.parcelNumber,

      agencyName: record.agencyName,

      agencyPhone: record.agencyPhone,

      custodian: record.custodian,

      surplusStatus: record.confirmedSurplus
        ? "confirmed_by_agency"
        : "under_research",

      sourceName: record.sourceName,

      sourceReference: record.sourceReference,

      sourceUrl: record.sourceUrl,

      intake: "closed",

      intakeExplanation:
        "An official surplus record was found, but Duequity has not yet approved the legal and compliance rules required to accept this jurisdiction for claimant intake. You can still verify the record directly with the government source.",

      jurisdictionSlug: {
        state: record.state.toLowerCase(),

        county: countySlug(record.county),
      },

      complianceStatus: "research_required",
    };
  }

  const gate = evaluateIntakeGate(jurisdiction);

  const intake: PublicMatch["intake"] =
    gate.outcome === "permitted"
      ? "open"
      : gate.outcome === "conditional"
        ? "attorney_required"
        : "closed";

  const claimDeadline =
    jurisdiction.claimDeadlineDays !== undefined
      ? addDays(record.saleDate, jurisdiction.claimDeadlineDays)
      : undefined;

  return {
    token: officialPublicToken(record),

    addressMasked: maskStreetAddress(record.addressLine1),

    city: record.city,

    county: record.county,

    state: record.state,

    postalCodePrefix: record.postalCode?.slice(0, 3) ?? "",

    saleType: record.saleType,

    saleDate: record.saleDate,

    caseNumber: record.caseNumber,

    parcelNumber: record.parcelNumber,

    agencyName: jurisdiction.agencyName,

    agencyPhone: jurisdiction.agencyPhone ?? record.agencyPhone,

    agencyWebsite: jurisdiction.agencyWebsite,

    custodian: jurisdiction.custodian,

    surplusStatus: record.confirmedSurplus
      ? "confirmed_by_agency"
      : "under_research",

    sourceName: record.sourceName,

    sourceReference: record.sourceReference,

    sourceUrl: record.sourceUrl,

    intake,

    intakeExplanation: gate.reason,

    jurisdictionSlug: {
      state: jurisdiction.state.toLowerCase(),

      county: countySlug(jurisdiction.county ?? record.county),
    },

    claimDeadline,

    complianceStatus: jurisdiction.complianceStatus,
  };
}

/* ========================================================================== */
/* Public search                                                               */
/* ========================================================================== */

export async function searchPublic(query: SearchQuery): Promise<SearchOutcome> {
  const address = query.address?.trim() ?? "";

  const ownerName = query.ownerName?.trim() ?? "";

  const state = query.state?.trim() ?? "";

  const county = query.county?.trim() ?? "";

  if (!address && !ownerName && !state && !county) {
    return {
      kind: "empty_query",
    };
  }

  const [
    opportunities,
    properties,
    rulePackages,
    conversions,
    officialDiscovery,
  ] = await Promise.all([
    listOpportunities(),
    listProperties(),
    listJurisdictionRulePackages(),
    listOpportunityConversions(),
    discoverOfficialPublicRecords(query),
  ]);

  const propertyById = new Map<string, Property>(
    properties.map((property) => [property.id, property]),
  );

  const jurisdictionById = buildApprovedJurisdictionMap(rulePackages);

  const convertedOpportunityIds = new Set(
    conversions.map((conversion) => conversion.opportunityId),
  );

  const matches: PublicMatch[] = [];

  for (const opportunity of opportunities) {
    if (!searchableOpportunity(opportunity, convertedOpportunityIds)) {
      continue;
    }

    const property = propertyById.get(opportunity.propertyId);

    if (!property) {
      continue;
    }

    const jurisdiction = jurisdictionById.get(opportunity.jurisdictionId);

    if (!jurisdiction) {
      continue;
    }

    if (
      !addressMatches(property, address) ||
      !ownerMatches(opportunity, ownerName) ||
      !stateMatches(property, state) ||
      !countyMatches(property, county)
    ) {
      continue;
    }

    matches.push(toPersistedPublicMatch(opportunity, property, jurisdiction));
  }

  if (officialDiscovery.status === "supported") {
    const approvedJurisdictions = jurisdictionById.values();

    for (const record of officialDiscovery.records) {
      const jurisdiction = findApprovedJurisdictionForOfficialRecord(
        record,
        approvedJurisdictions,
      );

      matches.push(toOfficialPublicMatch(record, jurisdiction));
    }
  }

  const deduplicated = [
    ...new Map(matches.map((match) => [match.token, match])).values(),
  ];

  if (deduplicated.length > 0) {
    return {
      kind: "matches",

      matches: deduplicated,

      query,
    };
  }

  if (officialDiscovery.status === "error") {
    return {
      kind: "source_unavailable",

      query,

      sourceName: officialDiscovery.sourceName,

      message: officialDiscovery.message,
    };
  }

  if (officialDiscovery.status === "unsupported") {
    return {
      kind: "coverage_unavailable",

      query,

      message: officialDiscovery.message,
    };
  }

  return {
    kind: "no_match",

    query,
  };
}

/* ========================================================================== */
/* Token lookup                                                                */
/* ========================================================================== */

export async function getPublicMatch(
  token: string,
): Promise<PublicMatch | undefined> {
  const normalized = token.trim().toUpperCase();

  if (!normalized) {
    return undefined;
  }

  const [opportunities, properties, rulePackages, conversions] =
    await Promise.all([
      listOpportunities(),
      listProperties(),
      listJurisdictionRulePackages(),
      listOpportunityConversions(),
    ]);

  const propertyById = new Map<string, Property>(
    properties.map((property) => [property.id, property]),
  );

  const jurisdictionById = buildApprovedJurisdictionMap(rulePackages);

  const convertedOpportunityIds = new Set(
    conversions.map((conversion) => conversion.opportunityId),
  );

  for (const opportunity of opportunities) {
    if (!searchableOpportunity(opportunity, convertedOpportunityIds)) {
      continue;
    }

    const property = propertyById.get(opportunity.propertyId);

    if (!property) {
      continue;
    }

    if (publicToken(opportunity.id, property.id) !== normalized) {
      continue;
    }

    const jurisdiction = jurisdictionById.get(opportunity.jurisdictionId);

    if (!jurisdiction) {
      return undefined;
    }

    return toPersistedPublicMatch(opportunity, property, jurisdiction);
  }

  const officialRecords = await listSupportedOfficialPublicRecords();

  for (const record of officialRecords) {
    if (officialPublicToken(record) !== normalized) {
      continue;
    }

    const jurisdiction = findApprovedJurisdictionForOfficialRecord(
      record,
      jurisdictionById.values(),
    );

    return toOfficialPublicMatch(record, jurisdiction);
  }

  return undefined;
}
