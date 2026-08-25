import "server-only";

import {
  addClaimantLocatorCandidate,
  addClaimantLocatorIdentity,
} from "@/server/discovered-record-enrichment-store";

import type {
  DiscoveredRecord,
} from "@/server/discovered-record-store";

/* ========================================================================== */
/* Constants                                                                   */
/* ========================================================================== */

const REQUEST_TIMEOUT_MS =
  15_000;

const GWINNETT_TAX_MASTER_LAYER =
  "https://gis3.gwinnettcounty.com/mapvis/rest/services/GISDataBrowser/GC_Parcel/MapServer/9";

const GWINNETT_TAX_MASTER_QUERY =
  `${GWINNETT_TAX_MASTER_LAYER}/query`;

const GWINNETT_SOURCE_NAME =
  "Gwinnett County GIS Tax Master";

const GWINNETT_ADAPTER_KEY =
  "ga-gwinnett-official-gis-tax-master";

const GWINNETT_OWNER_SEARCH_LIMIT =
  250;

const GWINNETT_OUT_FIELDS = [
  "RPIN",
  "PIN",
  "LOCADDR",
  "LOCCITY",
  "LOCSTATE",
  "LOCZIP",
  "OWNER1",
  "OWNER2",
  "MAILADDR",
  "MAILCITY",
  "MAILSTAT",
  "MAILZIP",
  "DOC1REF",
  "DOC2REF",
  "DOC3REF",
  "GRANTOR1",
  "GRANTOR2",
  "GRANTOR3",
].join(
  ",",
);

/* ========================================================================== */
/* Public result types                                                         */
/* ========================================================================== */

export type ClaimantLocatorResearchStatus =
  | "researched"
  | "unsupported"
  | "missing_parcel"
  | "no_property_match"
  | "owner_not_matched"
  | "ambiguous_owner_match"
  | "no_locator_data";

export interface ClaimantLocatorResearchResult {
  discoveredRecordId: string;

  adapterKey?: string;

  status: ClaimantLocatorResearchStatus;

  parcelNumber?: string;

  formerOwnerName: string;

  propertyRecordsFound: number;

  currentParcelOwnerNames?: string[];

  formerOwnerAppearsInGrantorHistory?: boolean;

  ownerSearchRecordsFound?: number;

  ownerSearchMatchedRecords?: number;

  ownerMatched: boolean;

  matchedOwnerName?: string;

  mailingAddressCandidatesFound?: number;

  mailingAddressCandidatesSaved: number;

  aliasCandidatesSaved: number;

  duplicateFindingsSkipped: number;

  notes: string[];
}

export interface ClaimantLocatorCountyResearchResult {
  processedCount: number;

  researchedCount: number;

  unsupportedCount: number;

  ownerMatchedCount: number;

  mailingAddressCandidatesSaved: number;

  aliasCandidatesSaved: number;

  duplicateFindingsSkipped: number;

  results: ClaimantLocatorResearchResult[];
}

/* ========================================================================== */
/* Adapter types                                                               */
/* ========================================================================== */

interface LocatorResearchAdapter {
  key: string;

  supports(
    record: DiscoveredRecord,
  ): boolean;

  research(
    record: DiscoveredRecord,
    actorUserId: string,
  ): Promise<ClaimantLocatorResearchResult>;
}

/* ========================================================================== */
/* ArcGIS types                                                                */
/* ========================================================================== */

interface ArcGisError {
  code?: number;

  message?: string;

  details?: string[];
}

interface GwinnettTaxMasterAttributes {
  RPIN?: unknown;

  PIN?: unknown;

  LOCADDR?: unknown;

  LOCCITY?: unknown;

  LOCSTATE?: unknown;

  LOCZIP?: unknown;

  OWNER1?: unknown;

  OWNER2?: unknown;

  MAILADDR?: unknown;

  MAILCITY?: unknown;

  MAILSTAT?: unknown;

  MAILZIP?: unknown;

  DOC1REF?: unknown;

  DOC2REF?: unknown;

  DOC3REF?: unknown;

  GRANTOR1?: unknown;

  GRANTOR2?: unknown;

  GRANTOR3?: unknown;
}

interface GwinnettTaxMasterFeature {
  attributes?: GwinnettTaxMasterAttributes;
}

interface GwinnettTaxMasterResponse {
  features?: GwinnettTaxMasterFeature[];

  error?: ArcGisError;
}

/* ========================================================================== */
/* Text helpers                                                                */
/* ========================================================================== */

function optionalText(
  value: unknown,
): string | undefined {
  if (
    typeof value ===
    "number" &&
    Number.isFinite(
      value,
    )
  ) {
    return String(
      value,
    );
  }

  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const normalized =
    value
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  return normalized ||
    undefined;
}

function uniqueValues(
  values: Array<
    string | undefined
  >,
): string[] {
  const seen =
    new Set<string>();

  const result:
    string[] =
    [];

  for (
    const value of
      values
  ) {
    const trimmed =
      value
        ?.replace(
          /\s+/g,
          " ",
        )
        .trim();

    if (
      !trimmed
    ) {
      continue;
    }

    const key =
      trimmed.toLowerCase();

    if (
      seen.has(
        key,
      )
    ) {
      continue;
    }

    seen.add(
      key,
    );

    result.push(
      trimmed,
    );
  }

  return result;
}

function normalizeCounty(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /\bcounty\b/g,
      "",
    )
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function normalizeParcel(
  value: string,
): string {
  return value
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      "",
    );
}

function currentIsoDate(): string {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

/* ========================================================================== */
/* Owner matching                                                              */
/* ========================================================================== */

const OWNER_NOISE_TOKENS =
  new Set([
    "MR",
    "MRS",
    "MS",
    "MISS",
    "DR",
    "JR",
    "SR",
    "II",
    "III",
    "IV",
    "THE",
  ]);

const OWNER_SEARCH_NOISE_TOKENS =
  new Set([
    ...OWNER_NOISE_TOKENS,

    "LLC",
    "LTD",
    "LP",
    "LLP",
    "PLLC",
    "INC",
    "INCORPORATED",
    "CORP",
    "CORPORATION",
    "CO",
    "COMPANY",
  ]);

function ownerTokens(
  value: string,
): string[] {
  return value
    .toUpperCase()
    .replace(
      /&/g,
      " AND ",
    )
    .replace(
      /[^A-Z0-9]+/g,
      " ",
    )
    .split(
      /\s+/,
    )
    .map(
      (token) =>
        token.trim(),
    )
    .filter(
      (token) =>
        token.length >
          0 &&
        !OWNER_NOISE_TOKENS.has(
          token,
        ),
    );
}

function normalizedOwnerName(
  value: string,
): string {
  return ownerTokens(
    value,
  ).join(
    " ",
  );
}

function tokenSet(
  value: string,
): Set<string> {
  return new Set(
    ownerTokens(
      value,
    ),
  );
}

function intersectionSize(
  left: Set<string>,
  right: Set<string>,
): number {
  let count =
    0;

  for (
    const token of
      left
  ) {
    if (
      right.has(
        token,
      )
    ) {
      count +=
        1;
    }
  }

  return count;
}

function strongOwnerMatch(
  formerOwnerName: string,
  candidateOwnerName: string,
): boolean {
  const formerNormalized =
    normalizedOwnerName(
      formerOwnerName,
    );

  const candidateNormalized =
    normalizedOwnerName(
      candidateOwnerName,
    );

  if (
    !formerNormalized ||
    !candidateNormalized
  ) {
    return false;
  }

  if (
    formerNormalized ===
    candidateNormalized
  ) {
    return true;
  }

  const formerTokens =
    tokenSet(
      formerOwnerName,
    );

  const candidateTokens =
    tokenSet(
      candidateOwnerName,
    );

  const smallerSize =
    Math.min(
      formerTokens.size,
      candidateTokens.size,
    );

  if (
    smallerSize <
    2
  ) {
    return false;
  }

  return (
    intersectionSize(
      formerTokens,
      candidateTokens,
    ) ===
    smallerSize
  );
}

function ownerSearchTokens(
  value: string,
): string[] {
  const tokens =
    value
      .toUpperCase()
      .replace(
        /&/g,
        " AND ",
      )
      .replace(
        /[^A-Z0-9]+/g,
        " ",
      )
      .split(
        /\s+/,
      )
      .map(
        (token) =>
          token.trim(),
      )
      .filter(
        (token) =>
          token.length >=
            2 &&
          !OWNER_SEARCH_NOISE_TOKENS.has(
            token,
          ),
      );

  const unique =
    uniqueValues(
      tokens,
    );

  /*
   * Longer tokens normally reduce false-positive county-wide searches.
   */
  return unique
    .sort(
      (
        left,
        right,
      ) =>
        right.length -
        left.length,
    )
    .slice(
      0,
      3,
    );
}

/* ========================================================================== */
/* Address helpers                                                             */
/* ========================================================================== */

function buildMailingAddress(
  attributes: GwinnettTaxMasterAttributes,
): string | undefined {
  const addressLine =
    optionalText(
      attributes.MAILADDR,
    );

  if (
    !addressLine
  ) {
    return undefined;
  }

  const city =
    optionalText(
      attributes.MAILCITY,
    );

  const state =
    optionalText(
      attributes.MAILSTAT,
    );

  const postalCode =
    optionalText(
      attributes.MAILZIP,
    );

  const locality =
    uniqueValues([
      city,
      state,
      postalCode,
    ]).join(
      " ",
    );

  return uniqueValues([
    addressLine,

    locality ||
      undefined,
  ]).join(
    ", ",
  );
}

function buildPropertyAddress(
  attributes: GwinnettTaxMasterAttributes,
): string | undefined {
  const addressLine =
    optionalText(
      attributes.LOCADDR,
    );

  if (
    !addressLine
  ) {
    return undefined;
  }

  const city =
    optionalText(
      attributes.LOCCITY,
    );

  const state =
    optionalText(
      attributes.LOCSTATE,
    );

  const postalCode =
    optionalText(
      attributes.LOCZIP,
    );

  const locality =
    uniqueValues([
      city,
      state,
      postalCode,
    ]).join(
      " ",
    );

  return uniqueValues([
    addressLine,

    locality ||
      undefined,
  ]).join(
    ", ",
  );
}

/* ========================================================================== */
/* ArcGIS helpers                                                              */
/* ========================================================================== */

function escapeSqlLiteral(
  value: string,
): string {
  return value.replace(
    /'/g,
    "''",
  );
}

function parcelVariants(
  value: string,
): string[] {
  const trimmed =
    value
      .trim()
      .toUpperCase();

  if (
    !trimmed
  ) {
    return [];
  }

  return uniqueValues([
    trimmed,

    trimmed.replace(
      /\s+/g,
      "",
    ),

    trimmed.replace(
      /[^A-Z0-9]/g,
      "",
    ),
  ]);
}

function buildParcelWhereClause(
  parcel: string,
): string {
  const clauses:
    string[] =
    [];

  for (
    const variant of
      parcelVariants(
        parcel,
      )
  ) {
    const escaped =
      escapeSqlLiteral(
        variant,
      );

    clauses.push(
      `RPIN = '${escaped}'`,
    );

    clauses.push(
      `PIN = '${escaped}'`,
    );
  }

  return clauses.join(
    " OR ",
  );
}

function buildOwnerWhereClause(
  formerOwnerName: string,
): string | undefined {
  const tokens =
    ownerSearchTokens(
      formerOwnerName,
    );

  /*
   * A one-token county-wide identity search is too ambiguous to be used for
   * automatic claimant locating.
   */
  if (
    tokens.length <
    2
  ) {
    return undefined;
  }

  const owner1 =
    tokens
      .map(
        (token) =>
          `OWNER1 LIKE '%${escapeSqlLiteral(token)}%'`,
      )
      .join(
        " AND ",
      );

  const owner2 =
    tokens
      .map(
        (token) =>
          `OWNER2 LIKE '%${escapeSqlLiteral(token)}%'`,
      )
      .join(
        " AND ",
      );

  return `(${owner1}) OR (${owner2})`;
}

function buildQueryParameters(
  where: string,
  resultRecordCount: number,
): URLSearchParams {
  const parameters =
    new URLSearchParams();

  parameters.set(
    "where",
    where,
  );

  parameters.set(
    "outFields",
    GWINNETT_OUT_FIELDS,
  );

  parameters.set(
    "returnGeometry",
    "false",
  );

  parameters.set(
    "resultRecordCount",
    String(
      resultRecordCount,
    ),
  );

  parameters.set(
    "f",
    "json",
  );

  return parameters;
}

function provenanceQueryUrl(
  where: string,
  resultRecordCount: number,
): string {
  const parameters =
    buildQueryParameters(
      where,
      resultRecordCount,
    );

  return `${GWINNETT_TAX_MASTER_QUERY}?${parameters.toString()}`;
}

async function fetchGwinnettTaxMasterWhere(
  where: string,
  resultRecordCount: number,
): Promise<
  GwinnettTaxMasterFeature[]
> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  try {
    const parameters =
      buildQueryParameters(
        where,
        resultRecordCount,
      );

    const response =
      await fetch(
        GWINNETT_TAX_MASTER_QUERY,
        {
          method:
            "POST",

          cache:
            "no-store",

          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",

            "User-Agent":
              "DueQuity Official Claimant Locator Research",
          },

          body:
            parameters.toString(),
        },
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Gwinnett County GIS returned HTTP ${response.status}.`,
      );
    }

    const payload =
      await response.json() as
        GwinnettTaxMasterResponse;

    if (
      payload.error
    ) {
      const details =
        payload.error.details
          ?.filter(
            Boolean,
          )
          .join(
            "; ",
          );

      throw new Error(
        [
          payload.error.message ??
            "Gwinnett County GIS query failed.",

          details ||
            undefined,
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
          ),
      );
    }

    return payload.features ??
      [];
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/* ========================================================================== */
/* Feature helpers                                                             */
/* ========================================================================== */

function featureMatchesParcel(
  feature: GwinnettTaxMasterFeature,
  parcel: string,
): boolean {
  const attributes =
    feature.attributes;

  if (
    !attributes
  ) {
    return false;
  }

  const target =
    normalizeParcel(
      parcel,
    );

  const rpin =
    optionalText(
      attributes.RPIN,
    );

  const pin =
    optionalText(
      attributes.PIN,
    );

  const rpinMatches =
    rpin !==
      undefined &&
    normalizeParcel(
      rpin,
    ) ===
      target;

  const pinMatches =
    pin !==
      undefined &&
    normalizeParcel(
      pin,
    ) ===
      target;

  return (
    rpinMatches ||
    pinMatches
  );
}

function featureOwnerNames(
  feature: GwinnettTaxMasterFeature,
): string[] {
  return uniqueValues([
    optionalText(
      feature
        .attributes
        ?.OWNER1,
    ),

    optionalText(
      feature
        .attributes
        ?.OWNER2,
    ),
  ]);
}

function featureGrantorNames(
  feature: GwinnettTaxMasterFeature,
): string[] {
  return uniqueValues([
    optionalText(
      feature
        .attributes
        ?.GRANTOR1,
    ),

    optionalText(
      feature
        .attributes
        ?.GRANTOR2,
    ),

    optionalText(
      feature
        .attributes
        ?.GRANTOR3,
    ),
  ]);
}

function matchingOwnerName(
  feature: GwinnettTaxMasterFeature,
  formerOwnerName: string,
): string | undefined {
  return featureOwnerNames(
    feature,
  ).find(
    (ownerName) =>
      strongOwnerMatch(
        formerOwnerName,
        ownerName,
      ),
  );
}

interface MatchedOwnerFeature {
  feature: GwinnettTaxMasterFeature;

  ownerName: string;
}

function matchedOwnerFeatures(
  features: GwinnettTaxMasterFeature[],
  formerOwnerName: string,
): MatchedOwnerFeature[] {
  const matches:
    MatchedOwnerFeature[] =
    [];

  for (
    const feature of
      features
  ) {
    const ownerName =
      matchingOwnerName(
        feature,
        formerOwnerName,
      );

    if (
      !ownerName
    ) {
      continue;
    }

    matches.push({
      feature,

      ownerName,
    });
  }

  return matches;
}

/* ========================================================================== */
/* Persistence helpers                                                         */
/* ========================================================================== */

function duplicateFindingError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.message.includes(
      "already recorded",
    )
  );
}

async function saveMailingAddressCandidate({
  discoveredRecordId,
  actorUserId,
  value,
  sourceUrl,
  sourceDate,
}: {
  discoveredRecordId: string;

  actorUserId: string;

  value: string;

  sourceUrl: string;

  sourceDate: string;
}): Promise<
  "saved" |
  "duplicate"
> {
  try {
    await addClaimantLocatorCandidate({
      discoveredRecordId,

      actorUserId,

      kind:
        "mailing_address",

      value,

      sourceName:
        GWINNETT_SOURCE_NAME,

      sourceUrl,

      sourceDate,
    });

    return "saved";
  } catch (
    error
  ) {
    if (
      duplicateFindingError(
        error,
      )
    ) {
      return "duplicate";
    }

    throw error;
  }
}

async function saveAliasCandidate({
  discoveredRecordId,
  actorUserId,
  value,
  sourceUrl,
  sourceDate,
}: {
  discoveredRecordId: string;

  actorUserId: string;

  value: string;

  sourceUrl: string;

  sourceDate: string;
}): Promise<
  "saved" |
  "duplicate"
> {
  try {
    await addClaimantLocatorIdentity({
      discoveredRecordId,

      actorUserId,

      kind:
        "alias",

      value,

      sourceName:
        GWINNETT_SOURCE_NAME,

      sourceUrl,

      sourceDate,
    });

    return "saved";
  } catch (
    error
  ) {
    if (
      duplicateFindingError(
        error,
      )
    ) {
      return "duplicate";
    }

    throw error;
  }
}

/* ========================================================================== */
/* Gwinnett adapter                                                            */
/* ========================================================================== */

function isGwinnettRecord(
  record: DiscoveredRecord,
): boolean {
  return (
    record.state ===
      "GA" &&
    normalizeCounty(
      record.county,
    ) ===
      "gwinnett"
  );
}

function recordParcel(
  record: DiscoveredRecord,
): string | undefined {
  return (
    record.parcelNumber
      ?.trim() ||
    record.propertyId
      ?.trim() ||
    undefined
  );
}

const gwinnettOfficialGisAdapter:
  LocatorResearchAdapter = {
    key:
      GWINNETT_ADAPTER_KEY,

    supports(
      record,
    ) {
      return isGwinnettRecord(
        record,
      );
    },

    async research(
      record,
      actorUserId,
    ): Promise<ClaimantLocatorResearchResult> {
      const parcel =
        recordParcel(
          record,
        );

      const baseResult:
        ClaimantLocatorResearchResult = {
        discoveredRecordId:
          record.id,

        adapterKey:
          GWINNETT_ADAPTER_KEY,

        status:
          "researched",

        parcelNumber:
          parcel,

        formerOwnerName:
          record.formerOwnerName,

        propertyRecordsFound:
          0,

        ownerMatched:
          false,

        mailingAddressCandidatesSaved:
          0,

        aliasCandidatesSaved:
          0,

        duplicateFindingsSkipped:
          0,

        notes:
          [],
      };

      if (
        !parcel
      ) {
        return {
          ...baseResult,

          status:
            "missing_parcel",

          notes: [
            "No parcel or property identifier was available for official GIS research.",
          ],
        };
      }

      /* -------------------------------------------------------------------- */
      /* Step 1: research the actual sold parcel                              */
      /* -------------------------------------------------------------------- */

      const parcelWhere =
        buildParcelWhereClause(
          parcel,
        );

      const parcelFeatures =
        (
          await fetchGwinnettTaxMasterWhere(
            parcelWhere,
            25,
          )
        ).filter(
          (feature) =>
            featureMatchesParcel(
              feature,
              parcel,
            ),
        );

      if (
        parcelFeatures.length ===
        0
      ) {
        return {
          ...baseResult,

          status:
            "no_property_match",

          notes: [
            "Gwinnett County GIS returned no exact parcel match.",
          ],
        };
      }

      const currentParcelOwnerNames =
        uniqueValues(
          parcelFeatures.flatMap(
            featureOwnerNames,
          ),
        );

      const grantorNames =
        uniqueValues(
          parcelFeatures.flatMap(
            featureGrantorNames,
          ),
        );

      const formerOwnerAppearsInGrantorHistory =
        grantorNames.some(
          (grantorName) =>
            strongOwnerMatch(
              record.formerOwnerName,
              grantorName,
            ),
        );

      const parcelOwnerMatches =
        matchedOwnerFeatures(
          parcelFeatures,
          record.formerOwnerName,
        );

      const notes:
        string[] =
        [];

      if (
        parcelOwnerMatches.length ===
        0
      ) {
        notes.push(
          currentParcelOwnerNames.length >
            0
            ? `The sold parcel is now listed to a different current owner: ${currentParcelOwnerNames.join("; ")}. That current owner's contact information was not assigned to the former owner.`
            : "The sold parcel does not currently list the former surplus owner.",
        );
      }

      if (
        formerOwnerAppearsInGrantorHistory
      ) {
        notes.push(
          "The former surplus owner also appears in the parcel's published grantor history, providing additional ownership-chain support.",
        );
      }

      /* -------------------------------------------------------------------- */
      /* Step 2: if ownership changed, search county-wide by former owner      */
      /* -------------------------------------------------------------------- */

      let locatorMatches:
        MatchedOwnerFeature[] =
        parcelOwnerMatches;

      let ownerSearchRecordsFound =
        0;

      let sourceWhere =
        parcelWhere;

      if (
        locatorMatches.length ===
        0
      ) {
        const ownerWhere =
          buildOwnerWhereClause(
            record.formerOwnerName,
          );

        if (
          !ownerWhere
        ) {
          return {
            ...baseResult,

            status:
              "owner_not_matched",

            propertyRecordsFound:
              parcelFeatures.length,

            currentParcelOwnerNames,

            formerOwnerAppearsInGrantorHistory,

            ownerSearchRecordsFound:
              0,

            ownerSearchMatchedRecords:
              0,

            notes: [
              ...notes,

              "The former owner name did not contain enough distinctive tokens for a safe automatic county-wide owner search.",
            ],
          };
        }

        const ownerSearchFeatures =
          await fetchGwinnettTaxMasterWhere(
            ownerWhere,
            GWINNETT_OWNER_SEARCH_LIMIT,
          );

        ownerSearchRecordsFound =
          ownerSearchFeatures.length;

        locatorMatches =
          matchedOwnerFeatures(
            ownerSearchFeatures,
            record.formerOwnerName,
          );

        sourceWhere =
          ownerWhere;

        if (
          locatorMatches.length ===
          0
        ) {
          return {
            ...baseResult,

            status:
              "owner_not_matched",

            propertyRecordsFound:
              parcelFeatures.length,

            currentParcelOwnerNames,

            formerOwnerAppearsInGrantorHistory,

            ownerSearchRecordsFound,

            ownerSearchMatchedRecords:
              0,

            notes: [
              ...notes,

              "A county-wide official GIS owner search did not find a current parcel whose owner strongly matched the former surplus owner.",

              "No mailing address was assigned.",
            ],
          };
        }

        notes.push(
          `The former owner was found on ${locatorMatches.length} current Gwinnett Tax Master record${locatorMatches.length === 1 ? "" : "s"} outside the sold-parcel ownership check.`,
        );
      }

      /* -------------------------------------------------------------------- */
      /* Step 3: evaluate matching-owner mailing addresses                    */
      /* -------------------------------------------------------------------- */

      const sourceDate =
        currentIsoDate();

      const sourceUrl =
        provenanceQueryUrl(
          sourceWhere,
          locatorMatches.length ===
            parcelOwnerMatches.length &&
          parcelOwnerMatches.length >
            0
            ? 25
            : GWINNETT_OWNER_SEARCH_LIMIT,
        );

      const matchedOwnerNames =
        uniqueValues(
          locatorMatches.map(
            (match) =>
              match.ownerName,
          ),
        );

      const mailingAddresses =
        uniqueValues(
          locatorMatches.map(
            (match) =>
              match.feature
                .attributes
                ? buildMailingAddress(
                    match.feature.attributes,
                  )
                : undefined,
          ),
        );

      const propertyAddresses =
        uniqueValues(
          locatorMatches.map(
            (match) =>
              match.feature
                .attributes
                ? buildPropertyAddress(
                    match.feature.attributes,
                  )
                : undefined,
          ),
        );

      let mailingAddressCandidatesSaved =
        0;

      let aliasCandidatesSaved =
        0;

      let duplicateFindingsSkipped =
        0;

      /*
       * Do not automatically choose between conflicting current mailing
       * addresses for the same name.
       */
      if (
        mailingAddresses.length >
        1
      ) {
        return {
          ...baseResult,

          status:
            "ambiguous_owner_match",

          propertyRecordsFound:
            parcelFeatures.length,

          currentParcelOwnerNames,

          formerOwnerAppearsInGrantorHistory,

          ownerSearchRecordsFound,

          ownerSearchMatchedRecords:
            locatorMatches.length,

          ownerMatched:
            true,

          matchedOwnerName:
            matchedOwnerNames[0],

          mailingAddressCandidatesFound:
            mailingAddresses.length,

          notes: [
            ...notes,

            `The official owner search produced ${mailingAddresses.length} different mailing addresses for the matching name.`,

            "DueQuity did not automatically select one because the identity/address result is ambiguous.",
          ],
        };
      }

      if (
        mailingAddresses.length ===
        1
      ) {
        const outcome =
          await saveMailingAddressCandidate({
            discoveredRecordId:
              record.id,

            actorUserId,

            value:
              mailingAddresses[0],

            sourceUrl,

            sourceDate,
          });

        if (
          outcome ===
          "saved"
        ) {
          mailingAddressCandidatesSaved +=
            1;
        } else {
          duplicateFindingsSkipped +=
            1;
        }
      }

      /* -------------------------------------------------------------------- */
      /* Step 4: preserve alternate source rendering as candidate alias        */
      /* -------------------------------------------------------------------- */

      for (
        const ownerName of
          matchedOwnerNames
      ) {
        const exactRendering =
          ownerName
            .trim()
            .toUpperCase() ===
          record.formerOwnerName
            .trim()
            .toUpperCase();

        if (
          exactRendering
        ) {
          continue;
        }

        const outcome =
          await saveAliasCandidate({
            discoveredRecordId:
              record.id,

            actorUserId,

            value:
              ownerName,

            sourceUrl,

            sourceDate,
          });

        if (
          outcome ===
          "saved"
        ) {
          aliasCandidatesSaved +=
            1;
        } else {
          duplicateFindingsSkipped +=
            1;
        }
      }

      if (
        mailingAddresses.length ===
        0
      ) {
        notes.push(
          "The former owner was matched in the official Tax Master, but the matched record did not publish a mailing address.",
        );
      } else {
        notes.push(
          `Official current mailing-address candidate located: ${mailingAddresses[0]}.`,
        );
      }

      if (
        propertyAddresses.length >
        0
      ) {
        notes.push(
          `Matching current parcel location${propertyAddresses.length === 1 ? "" : "s"}: ${propertyAddresses.join("; ")}.`,
        );
      }

      notes.push(
        "Automatically collected locator information remains candidate data until DueQuity review.",
      );

      return {
        ...baseResult,

        status:
          mailingAddresses.length >
            0 ||
          aliasCandidatesSaved >
            0 ||
          duplicateFindingsSkipped >
            0
            ? "researched"
            : "no_locator_data",

        propertyRecordsFound:
          parcelFeatures.length,

        currentParcelOwnerNames,

        formerOwnerAppearsInGrantorHistory,

        ownerSearchRecordsFound,

        ownerSearchMatchedRecords:
          locatorMatches.length,

        ownerMatched:
          true,

        matchedOwnerName:
          matchedOwnerNames[0],

        mailingAddressCandidatesFound:
          mailingAddresses.length,

        mailingAddressCandidatesSaved,

        aliasCandidatesSaved,

        duplicateFindingsSkipped,

        notes,
      };
    },
  };

/* ========================================================================== */
/* Adapter registry                                                            */
/* ========================================================================== */

const LOCATOR_RESEARCH_ADAPTERS:
  readonly LocatorResearchAdapter[] = [
    gwinnettOfficialGisAdapter,
  ];

/* ========================================================================== */
/* Public single-record research                                               */
/* ========================================================================== */

export async function researchClaimantLocatorForDiscoveredRecord(
  record: DiscoveredRecord,
  actorUserId: string,
): Promise<ClaimantLocatorResearchResult> {
  const actor =
    actorUserId.trim();

  if (
    !actor
  ) {
    throw new Error(
      "Claimant locator research requires an actor user id.",
    );
  }

  const adapter =
    LOCATOR_RESEARCH_ADAPTERS.find(
      (candidate) =>
        candidate.supports(
          record,
        ),
    );

  if (
    !adapter
  ) {
    return {
      discoveredRecordId:
        record.id,

      status:
        "unsupported",

      formerOwnerName:
        record.formerOwnerName,

      propertyRecordsFound:
        0,

      ownerMatched:
        false,

      mailingAddressCandidatesSaved:
        0,

      aliasCandidatesSaved:
        0,

      duplicateFindingsSkipped:
        0,

      notes: [
        "No activated official claimant-locator research adapter exists for this jurisdiction yet.",
      ],
    };
  }

  return adapter.research(
    record,
    actor,
  );
}

/* ========================================================================== */
/* Public county batch research                                                */
/* ========================================================================== */

export async function researchClaimantLocatorsForRecords(
  records: readonly DiscoveredRecord[],
  actorUserId: string,
): Promise<ClaimantLocatorCountyResearchResult> {
  const results:
    ClaimantLocatorResearchResult[] =
    [];

  for (
    const record of
      records
  ) {
    if (
      record.status ===
      "dismissed"
    ) {
      continue;
    }

    results.push(
      await researchClaimantLocatorForDiscoveredRecord(
        record,
        actorUserId,
      ),
    );
  }

  return {
    processedCount:
      results.length,

    researchedCount:
      results.filter(
        (result) =>
          result.status !==
            "unsupported" &&
          result.status !==
            "missing_parcel",
      ).length,

    unsupportedCount:
      results.filter(
        (result) =>
          result.status ===
          "unsupported",
      ).length,

    ownerMatchedCount:
      results.filter(
        (result) =>
          result.ownerMatched,
      ).length,

    mailingAddressCandidatesSaved:
      results.reduce(
        (
          total,
          result,
        ) =>
          total +
          result.mailingAddressCandidatesSaved,
        0,
      ),

    aliasCandidatesSaved:
      results.reduce(
        (
          total,
          result,
        ) =>
          total +
          result.aliasCandidatesSaved,
        0,
      ),

    duplicateFindingsSkipped:
      results.reduce(
        (
          total,
          result,
        ) =>
          total +
          result.duplicateFindingsSkipped,
        0,
      ),

    results,
  };
}