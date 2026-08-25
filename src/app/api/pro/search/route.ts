import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  canAccessDiscoveredRecords,
} from "@/lib/pro-access";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
  type StaffSession,
} from "@/lib/session";

import {
  resolveStaffSession,
} from "@/server/staff-session";

import {
  listClaimantOnboardingsForStaff,
} from "@/server/claimant-onboarding-store";

import {
  resolveClaimRecord,
} from "@/server/claim-record";

import {
  listDiscoveredRecords,
} from "@/server/discovered-record-store";

import {
  listJurisdictionRulePackages,
} from "@/server/jurisdiction-intelligence";

import {
  listOpportunityConversions,
} from "@/server/opportunity-conversion-store";

import {
  listOpportunities,
  listProperties,
} from "@/server/opportunity-store";

import {
  resolveOpportunityStaffAccess,
} from "@/server/opportunity-staff-access";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export type OperationsSearchResultKind =
  | "opportunity"
  | "claim"
  | "claimant"
  | "property"
  | "jurisdiction"
  | "discovered_record";

interface OperationsSearchResult {
  kind:
    OperationsSearchResultKind;

  id:
    string;

  href:
    string;

  title:
    string;

  subtitle:
    string;

  matchedOn:
    string;
}

const MINIMUM_QUERY_LENGTH =
  2;

const MAXIMUM_RESULTS =
  25;

const KIND_ORDER:
  Record<
    OperationsSearchResultKind,
    number
  > = {
  claim:
    0,

  opportunity:
    1,

  claimant:
    2,

  discovered_record:
    3,

  property:
    4,

  jurisdiction:
    5,
};

type Haystack = [
  value:
    string | undefined,

  label:
    string,
];

function firstMatch(
  query:
    string,
  haystacks:
    Haystack[],
):
  | string
  | undefined {
  for (
    const [
      value,
      label,
    ] of
      haystacks
  ) {
    if (
      value &&
      value
        .toLowerCase()
        .includes(
          query,
        )
    ) {
      return label;
    }
  }

  return undefined;
}

async function runSearch(
  session:
    StaffSession,
  query:
    string,
): Promise<
  OperationsSearchResult[]
> {
  const mayReadOpportunities =
    can(
      session,
      "opportunity.read",
    );

  const mayReadClaims =
    can(
      session,
      "claim.read",
    );

  const mayReadClaimants =
    can(
      session,
      "claimant.read",
    );

  const mayReadJurisdictions =
    can(
      session,
      "jurisdiction.read",
    );

  const mayReadDiscoveredRecords =
    canAccessDiscoveredRecords(
      session.user.role,
      session.user.email,
    );

  const results:
    OperationsSearchResult[] =
    [];

  const [
    properties,
    jurisdictionPackages,
  ] =
    await Promise.all([
      mayReadOpportunities
        ? listProperties()
        : Promise.resolve(
            [],
          ),

      mayReadJurisdictions
        ? listJurisdictionRulePackages()
        : Promise.resolve(
            [],
          ),
    ]);

  const propertyById =
    new Map(
      properties.map(
        (
          property,
        ) => [
          property.id,
          property,
        ],
      ),
    );

  if (
    mayReadClaims
  ) {
    const conversions =
      await listOpportunityConversions();

    const resolvedClaims =
      await Promise.all(
        conversions.map(
          (
            conversion,
          ) =>
            resolveClaimRecord(
              conversion.claimId,
            ),
        ),
      );

    for (
      const resolved of
        resolvedClaims
    ) {
      if (!resolved) {
        continue;
      }

      const claim =
        resolved.claim;

      const property =
        propertyById.get(
          claim.propertyId,
        );

      if (
        property &&
        !clearedForState(
          session,
          property.address.state,
        )
      ) {
        continue;
      }

      const matchedOn =
        firstMatch(
          query,
          [
            [
              claim.reference,
              "claim reference",
            ],
            [
              claim.id,
              "claim identifier",
            ],
            [
              claim.agencyReference,
              "agency reference",
            ],
            [
              property?.address.line1,
              "property address",
            ],
            [
              property?.parcelNumber,
              "parcel number",
            ],
          ],
        );

      if (!matchedOn) {
        continue;
      }

      results.push({
        kind:
          "claim",

        id:
          claim.id,

        href:
          `/pro/claims/${claim.id}`,

        title:
          claim.reference,

        subtitle:
          property
            ? `${property.address.line1}, ${property.address.city}, ${property.address.state}`
            : "Property record not resolved",

        matchedOn,
      });
    }
  }

  if (
    mayReadOpportunities
  ) {
    const opportunities =
      await listOpportunities();

    for (
      const opportunity of
        opportunities
    ) {
      /*
       * Converted claimant-owned Opportunities obey the same Stage 16
       * assignment boundary as the Opportunity pages and APIs.
       */
      const access =
        await resolveOpportunityStaffAccess(
          session,
          {
            opportunityId:
              opportunity.id,

            convertedClaimId:
              opportunity.convertedClaimId,
          },
        );

      if (
        !access.accessible
      ) {
        continue;
      }

      const property =
        propertyById.get(
          opportunity.propertyId,
        );

      if (
        property &&
        !clearedForState(
          session,
          property.address.state,
        )
      ) {
        continue;
      }

      const matchedOn =
        firstMatch(
          query,
          [
            [
              opportunity.reference,
              "opportunity reference",
            ],
            [
              opportunity.sale.caseNumber,
              "case number",
            ],
            [
              property?.parcelNumber,
              "parcel number",
            ],
            [
              property?.taxAccountNumber,
              "tax account",
            ],
            [
              property?.address.line1,
              "property address",
            ],
            [
              opportunity.priorOwners
                .map(
                  (
                    owner,
                  ) =>
                    owner.nameOnRecord,
                )
                .join(
                  " ",
                ),
              "former owner of record",
            ],
          ],
        );

      if (!matchedOn) {
        continue;
      }

      results.push({
        kind:
          "opportunity",

        id:
          opportunity.id,

        href:
          `/pro/opportunities/${opportunity.id}`,

        title:
          opportunity.reference,

        subtitle:
          property
            ? `${property.address.line1}, ${property.address.city}, ${property.address.state}`
            : "Property record not resolved",

        matchedOn,
      });
    }

    /*
     * Property records remain part of the research / property repository.
     *
     * Claimant ownership is not inferred from a property address alone.
     */
    for (
      const property of
        properties
    ) {
      if (
        !clearedForState(
          session,
          property.address.state,
        )
      ) {
        continue;
      }

      const matchedOn =
        firstMatch(
          query,
          [
            [
              property.address.line1,
              "address",
            ],
            [
              property.address.city,
              "city",
            ],
            [
              property.parcelNumber,
              "parcel number",
            ],
            [
              property.taxAccountNumber,
              "tax account",
            ],
            [
              property.address.postalCode,
              "postal code",
            ],
          ],
        );

      if (!matchedOn) {
        continue;
      }

      results.push({
        kind:
          "property",

        id:
          property.id,

        href:
          "/pro/properties",

        title:
          property.address.line1,

        subtitle:
          `${property.address.city}, ${property.address.county}, ${property.address.state}`,

        matchedOn,
      });
    }
  }

  if (
    mayReadDiscoveredRecords
  ) {
    const discovered =
      await listDiscoveredRecords();

    for (
      const record of
        discovered
    ) {
      if (
        !clearedForState(
          session,
          record.state,
        )
      ) {
        continue;
      }

      const matchedOn =
        firstMatch(
          query,
          [
            [
              record.propertyId,
              "source property identifier",
            ],
            [
              record.parcelNumber,
              "parcel number",
            ],
            [
              record.addressLine1,
              "address",
            ],
            [
              record.formerOwnerName,
              "former owner of record",
            ],
            [
              record.sourceReference,
              "source reference",
            ],
            [
              record.caseNumber,
              "case number",
            ],
          ],
        );

      if (!matchedOn) {
        continue;
      }

      results.push({
        kind:
          "discovered_record",

        id:
          record.id,

        href:
          `/pro/discovered-records/${record.id}`,

        title:
          record.addressLine1 ??
          record.propertyId ??
          record.recordKey,

        subtitle:
          `${record.county}, ${record.state} / staged ${record.status.replaceAll(
            "_",
            " ",
          )}`,

        matchedOn,
      });
    }
  }

  if (
    mayReadClaimants
  ) {
    const onboardings =
      await listClaimantOnboardingsForStaff(
        session,
      );

    const mayReadContactDetails =
      can(
        session,
        "claimant.read_sensitive",
      );

    for (
      const onboarding of
        onboardings
    ) {
      const claimant =
        onboarding.claimant;

      const matchedOn =
        firstMatch(
          query,
          [
            [
              claimant.legalName,
              "claimant name",
            ],
            [
              claimant.preferredName,
              "preferred name",
            ],
            [
              claimant.reference,
              "claimant reference",
            ],
            [
              onboarding.claimReference,
              "claim reference",
            ],
            ...(
              mayReadContactDetails
                ? ([
                    [
                      claimant.contactMethods
                        .map(
                          (
                            method,
                          ) =>
                            method.value,
                        )
                        .join(
                          " ",
                        ),
                      "contact details",
                    ],
                  ] satisfies Haystack[])
                : []
            ),
          ],
        );

      if (!matchedOn) {
        continue;
      }

      results.push({
        kind:
          "claimant",

        id:
          claimant.id,

        href:
          `/pro/claimants/${claimant.id}`,

        title:
          claimant.legalName,

        subtitle:
          `${claimant.reference} / ${onboarding.claimReference}`,

        matchedOn,
      });
    }
  }

  if (
    mayReadJurisdictions
  ) {
    for (
      const rulePackage of
        jurisdictionPackages
    ) {
      if (
        !clearedForState(
          session,
          rulePackage.stateCode,
        )
      ) {
        continue;
      }

      const matchedOn =
        firstMatch(
          query,
          [
            [
              rulePackage.countyName,
              "county",
            ],
            [
              rulePackage.stateName,
              "state",
            ],
            [
              rulePackage.stateCode,
              "state code",
            ],
            [
              rulePackage.rule?.agencyName,
              "agency",
            ],
            [
              rulePackage.id,
              "package identifier",
            ],
          ],
        );

      if (!matchedOn) {
        continue;
      }

      results.push({
        kind:
          "jurisdiction",

        id:
          rulePackage.id,

        href:
          `/pro/jurisdictions/${rulePackage.id}`,

        title:
          rulePackage.countyName
            ? `${rulePackage.countyName}, ${rulePackage.stateName}`
            : rulePackage.stateName,

        subtitle:
          `${rulePackage.rule?.agencyName ?? "No normalized rule recorded"} / package ${rulePackage.status.replaceAll(
            "_",
            " ",
          )}`,

        matchedOn,
      });
    }
  }

  return results
    .sort(
      (
        left,
        right,
      ) =>
        KIND_ORDER[
          left.kind
        ] -
        KIND_ORDER[
          right.kind
        ],
    )
    .slice(
      0,
      MAXIMUM_RESULTS,
    );
}

export async function GET(
  request:
    NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return NextResponse.json(
      {
        ok:
          false,

        error:
          STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      },
      {
        status:
          401,
      },
    );
  }

  const query =
    (
      request.nextUrl.searchParams.get(
        "q",
      ) ??
      ""
    )
      .trim()
      .toLowerCase();

  if (
    query.length <
    MINIMUM_QUERY_LENGTH
  ) {
    return NextResponse.json({
      ok:
        true,

      query,

      results:
        [],
    });
  }

  try {
    return NextResponse.json({
      ok:
        true,

      query,

      results:
        await runSearch(
          session,
          query,
        ),
    });
  } catch (
    error
  ) {
    return NextResponse.json(
      {
        ok:
          false,

        error:
          error instanceof Error
            ? error.message
            : "Operations search could not be completed.",
      },
      {
        status:
          500,
      },
    );
  }
}