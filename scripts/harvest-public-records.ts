import {
  harvestSupportedPublicRecords,
} from "../src/server/public-record-harvester";

async function main() {
  const result =
    await harvestSupportedPublicRecords();

  console.log(
    JSON.stringify(
      {
        ok:
          true,

        harvestedAt:
          result.harvestedAt,

        sourceRecordCount:
          result.sourceRecordCount,

        stagedRecordCount:
          result.stagedRecordCount,

        createdCount:
          result.createdCount,

        refreshedCount:
          result.refreshedCount,

        operationalEffects: {
          opportunitiesCreated:
            0,

          claimsCreated:
            0,

          jurisdictionRulesCreated:
            false,

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