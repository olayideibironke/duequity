import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  StateCode,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  listDiscoveredRecords,
  type DiscoveredRecord,
} from "@/server/discovered-record-store";

import {
  loadNationalGeography,
} from "@/server/geography-resolver";

import {
  researchClaimantLocatorForDiscoveredRecord,
} from "@/server/claimant-locator-research";

import {
  researchIndividualPublicWebContacts,
} from "@/server/claimant-locator-individual-public-web-research";

import {
  researchPublicWebBusinessContacts,
} from "@/server/claimant-locator-public-web-research";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type ContactResearchLane =
  | "individual"
  | "business"
  | "unsupported";

interface NormalizedContactResearch {
  lane: ContactResearchLane;

  status:
    | "researched"
    | "unsupported"
    | "missing_identity_anchor"
    | "no_safe_sources"
    | "no_contact_data";

  acceptedSourceCount: number;

  rejectedSourceCount: number;

  phoneCandidatesSaved: number;

  emailCandidatesSaved: number;

  associatedContactsSaved: number;

  duplicateFindingsSkipped: number;

  phones: string[];

  emails: string[];

  associatedContacts: Array<{
    name: string;

    relationship?: string;

    phone?: string;

    email?: string;
  }>;

  notes: string[];
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      ok:
        false,

      error:
        message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
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

function integerParam(
  request: NextRequest,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw =
    request.nextUrl
      .searchParams
      .get(
        name,
      );

  if (
    !raw
  ) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      raw,
      10,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  return Math.min(
    Math.max(
      parsed,
      min,
    ),
    max,
  );
}

function normalizedIndividualResearch(
  research: Awaited<
    ReturnType<
      typeof researchIndividualPublicWebContacts
    >
  >,
): NormalizedContactResearch {
  return {
    lane:
      "individual",

    status:
      research.status,

    acceptedSourceCount:
      research.acceptedSourceCount,

    rejectedSourceCount:
      research.rejectedSourceCount,

    phoneCandidatesSaved:
      research.phoneCandidatesSaved,

    emailCandidatesSaved:
      research.emailCandidatesSaved,

    associatedContactsSaved:
      0,

    duplicateFindingsSkipped:
      research.duplicateFindingsSkipped,

    phones:
      research.phones,

    emails:
      research.emails,

    associatedContacts:
      [],

    notes:
      research.notes,
  };
}

function normalizedBusinessResearch(
  research: Awaited<
    ReturnType<
      typeof researchPublicWebBusinessContacts
    >
  >,
): NormalizedContactResearch {
  return {
    lane:
      research.status ===
        "unsupported"
        ? "unsupported"
        : "business",

    status:
      research.status,

    acceptedSourceCount:
      research.acceptedSourceCount,

    rejectedSourceCount:
      research.rejectedSourceCount,

    phoneCandidatesSaved:
      research.phoneCandidatesSaved,

    emailCandidatesSaved:
      research.emailCandidatesSaved,

    associatedContactsSaved:
      research.associatedContactsSaved,

    duplicateFindingsSkipped:
      research.duplicateFindingsSkipped,

    phones:
      research.phones,

    emails:
      research.emails,

    associatedContacts:
      research.associatedContacts,

    notes:
      research.notes,
  };
}

/**
 * CONTACT RESEARCH ORCHESTRATION
 *
 * Order matters:
 *
 * 1. Official claimant-locator/property research gets first opportunity to
 *    establish authoritative address/ownership anchors.
 *
 * 2. Individual public-web research runs next.
 *
 * 3. If the record is not an individual supported by that lane, business/entity
 *    research is attempted.
 *
 * None of these actions:
 *
 * - creates a claimant
 * - creates an Opportunity
 * - creates a Claim
 * - verifies candidates automatically
 * - authorizes outreach
 */
async function researchRecordContacts(
  record: DiscoveredRecord,
  actorUserId: string,
): Promise<{
  officialLocator: Awaited<
    ReturnType<
      typeof researchClaimantLocatorForDiscoveredRecord
    >
  >;

  contactResearch: NormalizedContactResearch;
}> {
  const officialLocator =
    await researchClaimantLocatorForDiscoveredRecord(
      record,
      actorUserId,
    );

  const individualResearch =
    await researchIndividualPublicWebContacts({
      record,

      actorUserId,
    });

  if (
    individualResearch.status !==
    "unsupported"
  ) {
    return {
      officialLocator,

      contactResearch:
        normalizedIndividualResearch(
          individualResearch,
        ),
    };
  }

  const businessResearch =
    await researchPublicWebBusinessContacts({
      record,

      actorUserId,
    });

  return {
    officialLocator,

    contactResearch:
      normalizedBusinessResearch(
        businessResearch,
      ),
  };
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

/**
 * BATCH CLAIMANT LOCATOR RESEARCH
 *
 * Runs the existing official locator layer and identity-safe public-web contact
 * research across a bounded county batch.
 *
 * Findings remain research candidates until reviewed.
 *
 * offset + limit keep each request resumable and bounded.
 */
export async function POST(
  request: NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
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
      "You do not have permission to run batch claimant locator research.",
      403,
    );
  }

  const stateParam =
    request.nextUrl
      .searchParams
      .get(
        "state",
      )
      ?.trim()
      .toUpperCase();

  const countyGeoid =
    request.nextUrl
      .searchParams
      .get(
        "countyGeoid",
      )
      ?.trim();

  if (
    !stateParam ||
    !countyGeoid
  ) {
    return errorResponse(
      "State and countyGeoid are required.",
      400,
    );
  }

  const offset =
    integerParam(
      request,
      "offset",
      0,
      0,
      100_000,
    );

  /*
   * Contact research may involve several official/public searches per record.
   *
   * Keep each HTTP request deliberately bounded. The UI can resume with the
   * returned nextOffset until the county is complete.
   */
  const limit =
    integerParam(
      request,
      "limit",
      10,
      1,
      25,
    );

  const geography =
    await loadNationalGeography();

  const state =
    geography.states.find(
      (item) =>
        item.postalCode ===
        stateParam,
    );

  if (
    !state
  ) {
    return errorResponse(
      "The selected state is invalid.",
      400,
    );
  }

  const county =
    state.counties.find(
      (item) =>
        item.geoid ===
        countyGeoid,
    );

  if (
    !county
  ) {
    return errorResponse(
      "The selected county is invalid for this state.",
      400,
    );
  }

  const stateCode =
    state.postalCode as
      StateCode;

  if (
    !clearedForState(
      session,
      stateCode,
    )
  ) {
    return errorResponse(
      "You are not cleared to research claimant locator information for this state.",
      403,
    );
  }

  try {
    const allRecords =
      await listDiscoveredRecords();

    const countyRecords =
      allRecords
        .filter(
          (record) =>
            record.state ===
              stateCode &&
            normalizeCounty(
              record.county,
            ) ===
              normalizeCounty(
                county.name,
              ) &&
            record.status !==
              "dismissed",
        )
        .sort(
          (
            left,
            right,
          ) =>
            left.id.localeCompare(
              right.id,
            ),
        );

    const selectedRecords =
      countyRecords.slice(
        offset,
        offset +
          limit,
      );

    const results = [];

    let researchedCount =
      0;

    let unsupportedCount =
      0;

    let missingIdentityAnchorCount =
      0;

    let noSafeSourcesCount =
      0;

    let noContactDataCount =
      0;

    let officialLocatorSupportedCount =
      0;

    let officialOwnerMatchedCount =
      0;

    let mailingAddressCandidatesSaved =
      0;

    let aliasCandidatesSaved =
      0;

    let phoneCandidatesSaved =
      0;

    let emailCandidatesSaved =
      0;

    let associatedContactsSaved =
      0;

    let duplicateFindingsSkipped =
      0;

    let failureCount =
      0;

    /*
     * Sequential processing is intentional.
     *
     * It keeps provider use predictable and prevents a county-wide burst of
     * concurrent external requests.
     */
    for (
      const record of
        selectedRecords
    ) {
      try {
        const {
          officialLocator,
          contactResearch,
        } =
          await researchRecordContacts(
            record,
            session.user.id,
          );

        if (
          officialLocator.status !==
          "unsupported"
        ) {
          officialLocatorSupportedCount +=
            1;
        }

        if (
          officialLocator.ownerMatched
        ) {
          officialOwnerMatchedCount +=
            1;
        }

        mailingAddressCandidatesSaved +=
          officialLocator
            .mailingAddressCandidatesSaved;

        aliasCandidatesSaved +=
          officialLocator
            .aliasCandidatesSaved;

        switch (
          contactResearch.status
        ) {
          case "researched":
            researchedCount +=
              1;
            break;

          case "unsupported":
            unsupportedCount +=
              1;
            break;

          case "missing_identity_anchor":
            missingIdentityAnchorCount +=
              1;
            break;

          case "no_safe_sources":
            noSafeSourcesCount +=
              1;
            break;

          case "no_contact_data":
            noContactDataCount +=
              1;
            break;
        }

        phoneCandidatesSaved +=
          contactResearch
            .phoneCandidatesSaved;

        emailCandidatesSaved +=
          contactResearch
            .emailCandidatesSaved;

        associatedContactsSaved +=
          contactResearch
            .associatedContactsSaved;

        duplicateFindingsSkipped +=
          officialLocator
            .duplicateFindingsSkipped +
          contactResearch
            .duplicateFindingsSkipped;

        results.push({
          recordId:
            record.id,

          formerOwnerName:
            record.formerOwnerName,

          parcelNumber:
            record.parcelNumber ??
            null,

          propertyId:
            record.propertyId ??
            null,

          caseNumber:
            record.caseNumber ??
            null,

          officialLocator: {
            adapterKey:
              officialLocator.adapterKey ??
              null,

            status:
              officialLocator.status,

            ownerMatched:
              officialLocator.ownerMatched,

            matchedOwnerName:
              officialLocator.matchedOwnerName ??
              null,

            mailingAddressCandidatesSaved:
              officialLocator
                .mailingAddressCandidatesSaved,

            aliasCandidatesSaved:
              officialLocator
                .aliasCandidatesSaved,

            notes:
              officialLocator.notes,
          },

          contactResearch: {
            lane:
              contactResearch.lane,

            status:
              contactResearch.status,

            acceptedSourceCount:
              contactResearch
                .acceptedSourceCount,

            rejectedSourceCount:
              contactResearch
                .rejectedSourceCount,

            phoneCandidatesSaved:
              contactResearch
                .phoneCandidatesSaved,

            emailCandidatesSaved:
              contactResearch
                .emailCandidatesSaved,

            associatedContactsSaved:
              contactResearch
                .associatedContactsSaved,

            phones:
              contactResearch.phones,

            emails:
              contactResearch.emails,

            associatedContacts:
              contactResearch
                .associatedContacts,

            notes:
              contactResearch.notes,
          },

          error:
            null,
        });
      } catch (
        error
      ) {
        failureCount +=
          1;

        results.push({
          recordId:
            record.id,

          formerOwnerName:
            record.formerOwnerName,

          parcelNumber:
            record.parcelNumber ??
            null,

          propertyId:
            record.propertyId ??
            null,

          caseNumber:
            record.caseNumber ??
            null,

          officialLocator:
            null,

          contactResearch:
            null,

          error:
            error instanceof Error
              ? error.message
              : "Claimant locator research failed for this record.",
        });
      }
    }

    const nextOffset =
      offset +
      selectedRecords.length;

    return NextResponse.json(
      {
        ok:
          true,

        jurisdiction: {
          state:
            stateCode,

          stateName:
            state.name,

          county:
            county.name,

          countyGeoid:
            county.geoid,
        },

        batch: {
          totalCountyRecords:
            countyRecords.length,

          offset,

          limit,

          processedCount:
            selectedRecords.length,

          nextOffset:
            nextOffset <
            countyRecords.length
              ? nextOffset
              : null,

          remainingCount:
            Math.max(
              countyRecords.length -
                nextOffset,
              0,
            ),
        },

        summary: {
          researchedCount,

          unsupportedCount,

          missingIdentityAnchorCount,

          noSafeSourcesCount,

          noContactDataCount,

          officialLocatorSupportedCount,

          officialOwnerMatchedCount,

          mailingAddressCandidatesSaved,

          aliasCandidatesSaved,

          phoneCandidatesSaved,

          emailCandidatesSaved,

          associatedContactsSaved,

          duplicateFindingsSkipped,

          failureCount,
        },

        results,

        operationalEffects: {
          opportunitiesCreated:
            0,

          claimsCreated:
            0,

          claimantsCreated:
            0,

          claimantAuthUsersCreated:
            0,

          outreachAuthorized:
            false,

          outreachSent:
            false,

          candidatesAutomaticallyVerified:
            false,
        },

        message:
          "Bounded claimant-locator research completed. Official and public-web findings remain candidates until reviewed.",
      },
      {
        status:
          200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (
    error
  ) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Batch claimant locator research failed.",
      500,
    );
  }
}