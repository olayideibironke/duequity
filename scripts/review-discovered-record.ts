import {
  reviewDiscoveredRecord,
} from "../src/server/discovered-record-store";

/**
 * LOCAL DISCOVERED-RECORD REVIEW VALIDATION
 *
 * This script exists only to exercise the persistence layer during local
 * development without changing the staff permission matrix.
 *
 * It does NOT:
 *
 *   - create an Opportunity
 *   - create a Claim
 *   - approve a jurisdiction
 *   - approve legal rules
 *   - authorize claimant intake
 *   - authorize outreach
 *   - approve pricing
 */

const RECORD_ID =
  "dr-dcf1fc96f65ca916c96233d6";

async function main() {
  const record =
    await reviewDiscoveredRecord(
      {
        id:
          RECORD_ID,

        decision:
          "reviewed",

        actorUserId:
          "local-validation-admin",

        reviewNote:
          "Local validation review. Official Carroll County source record confirmed as staged evidence. No operational promotion authorized.",
      },
    );

  console.log(
    JSON.stringify(
      {
        ok:
          true,

        record: {
          id:
            record.id,

          formerOwnerName:
            record.formerOwnerName,

          status:
            record.status,

          reviewedAt:
            record.reviewedAt,

          reviewedByUserId:
            record.reviewedByUserId,

          reviewNote:
            record.reviewNote,

          promotedOpportunityId:
            record.promotedOpportunityId ??
            null,
        },

        operationalEffects: {
          opportunitiesCreated:
            0,

          claimsCreated:
            0,

          jurisdictionApproved:
            false,

          intakeAuthorized:
            false,

          outreachAuthorized:
            false,
        },
      },
      null,
      2,
    ),
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);