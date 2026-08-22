import {
  evaluateDiscoveredRecordEnrichmentReadiness,
  saveDiscoveredRecordEnrichment,
} from "../src/server/discovered-record-enrichment-store";

/**
 * BRIAN OWENS DISCOVERED-RECORD ENRICHMENT VALIDATION
 *
 * Completes the remaining evidence-supported enrichment fields for the
 * Carroll County discovery.
 *
 * Evidence supports:
 *
 *   Property type:
 *     single_family
 *
 *   Sale price / official bid:
 *     $36,983.00
 *
 *   Aggregate debt satisfied at tax sale:
 *     $8,172.12
 *
 *   Estimated surplus:
 *     $28,810.88
 *
 *   Confirmed source-listed surplus:
 *     $28,810.88
 *
 *   Selling entity:
 *     Carroll County Tax Collector
 *
 * IMPORTANT ACCOUNTING RULE:
 *
 * Carroll County's official tax-sale terms describe the amount paid at sale
 * as the aggregate taxes and other outstanding charges, interest, penalties,
 * and expenses incurred in making the sale.
 *
 * Duequity therefore maps the official $8,172.12 Deposit into the aggregate
 * debtSatisfied field for this record.
 *
 * taxesOwed and saleCosts remain unset because the official evidence available
 * here does not break the $8,172.12 into separate components. Populating those
 * fields in addition to debtSatisfied could double-count the same obligations.
 *
 * Property type is supported by public property-record providers rather than
 * the Carroll County surplus source. Its provenance therefore remains
 * commercial_provider rather than county_tax_sale_list.
 *
 * This script does NOT:
 *
 *   - create an Opportunity
 *   - create a Claim
 *   - approve Carroll County
 *   - approve Maryland legal rules
 *   - authorize claimant intake
 *   - authorize outreach
 *   - calculate or approve commercial pricing
 */

const RECORD_ID =
  "dr-dcf1fc96f65ca916c96233d6";

const SOURCE_REFERENCE =
  "Property ID 02-009056; Case C-06-CV-23-000194";

const BID_CENTS =
  3_698_300;

const DEBT_SATISFIED_CENTS =
  817_212;

const SURPLUS_CENTS =
  BID_CENTS -
  DEBT_SATISFIED_CENTS;

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function validateSourceArithmetic():
  void {
  if (
    SURPLUS_CENTS !==
    2_881_088
  ) {
    throw new Error(
      "Brian Owens source arithmetic does not equal the official $28,810.88 surplus value.",
    );
  }
}

/* ========================================================================== */
/* Main                                                                        */
/* ========================================================================== */

async function main() {
  validateSourceArithmetic();

  const enrichment =
    await saveDiscoveredRecordEnrichment(
      {
        discoveredRecordId:
          RECORD_ID,

        actorUserId:
          "local-validation-admin",

        /* ====================================================== property type */

        propertyType: {
          value:
            "single_family",

          provenance: {
            sourceKind:
              "commercial_provider",

            sourceName:
              "Redfin public property record",

            sourceReference:
              "2715 Old Taneytown Rd; APN 02 009056",

            sourceDate:
              "2026-08-20",

            lastVerified:
              "2026-08-20",

            quality:
              "verified",

            analystNote:
              "Public property-record data matching APN 02 009056 identifies the property as Single Family Residential. Realtor.com independently identifies the same address as Single Family. This property classification does not originate from the Carroll County surplus-funds source.",
          },
        },

        /* ========================================================== sale price */

        salePrice: {
          fact: {
            amount:
              BID_CENTS,

            quality:
              "confirmed",

            basis:
              "Official Carroll County Tax Sale Surplus Funds List Bid column.",

            asOf:
              "2026-08-20",
          },

          provenance: {
            sourceKind:
              "county_tax_sale_list",

            sourceName:
              "Carroll County Tax Sale Surplus Funds List",

            sourceReference:
              SOURCE_REFERENCE,

            sourceDate:
              "2026-08-20",

            lastVerified:
              "2026-08-20",

            quality:
              "confirmed",

            analystNote:
              "Official Carroll County source lists a $36,983.00 bid for Property ID 02-009056.",
          },
        },

        /* ====================================================== debt satisfied */

        debtSatisfied: {
          fact: {
            amount:
              DEBT_SATISFIED_CENTS,

            quality:
              "verified",

            basis:
              "Official source Deposit of $8,172.12. Carroll County tax-sale terms describe the amount due at sale as the aggregate taxes and other outstanding charges, interest, penalties, and expenses incurred in making the sale. The remainder of the bid remains on credit.",

            asOf:
              "2026-08-20",
          },

          provenance: {
            sourceKind:
              "county_tax_sale_list",

            sourceName:
              "Carroll County Tax Sale Surplus Funds List and 2024 Tax Sale Terms",

            sourceReference:
              SOURCE_REFERENCE,

            sourceDate:
              "2026-08-20",

            lastVerified:
              "2026-08-20",

            quality:
              "verified",

            analystNote:
              "Duequity maps the official $8,172.12 Deposit into aggregate debtSatisfied for this tax-lien record. taxesOwed and saleCosts remain unset because the available evidence does not provide a reliable component breakdown and those amounts must not be double-counted.",
          },
        },

        /* ================================================= estimated surplus */

        estimatedSurplus: {
          fact: {
            amount:
              SURPLUS_CENTS,

            quality:
              "verified",

            basis:
              "Official bid of $36,983.00 minus official aggregate amount paid at sale of $8,172.12 equals $28,810.88.",

            asOf:
              "2026-08-20",
          },

          provenance: {
            sourceKind:
              "county_tax_sale_list",

            sourceName:
              "Carroll County Tax Sale Surplus Funds List",

            sourceReference:
              SOURCE_REFERENCE,

            sourceDate:
              "2026-08-20",

            lastVerified:
              "2026-08-20",

            quality:
              "verified",

            analystNote:
              "Arithmetic derived from source-native Bid and Deposit values.",
          },
        },

        /* ================================================= confirmed surplus */

        confirmedSurplus: {
          fact: {
            amount:
              SURPLUS_CENTS,

            quality:
              "confirmed",

            basis:
              "Carroll County publishes $28,810.88 for this property on its official Tax Sale Surplus Funds List.",

            asOf:
              "2026-08-20",
          },

          provenance: {
            sourceKind:
              "county_tax_sale_list",

            sourceName:
              "Carroll County Tax Sale Surplus Funds List",

            sourceReference:
              SOURCE_REFERENCE,

            sourceDate:
              "2026-08-20",

            lastVerified:
              "2026-08-20",

            quality:
              "confirmed",

            analystNote:
              "The official county source currently publishes this record with a $28,810.88 surplus amount. Individual entitlement remains subject to separate verification.",
          },
        },

        /* ===================================================== selling entity */

        sellingEntity: {
          value:
            "Carroll County Tax Collector",

          provenance: {
            sourceKind:
              "county_tax_sale_list",

            sourceName:
              "Carroll County 2024 Tax Sale Terms",

            sourceReference:
              "Carroll County tax-sale process administered by the Tax Collector",

            sourceDate:
              "2026-08-20",

            lastVerified:
              "2026-08-20",

            quality:
              "verified",

            analystNote:
              "Official Carroll County tax-sale materials identify the Tax Collector as the governmental actor administering the sale.",
          },
        },

        /* ========================================== source balance meaning */

        sourceBalanceInterpretation: {
          value:
            "confirmed_surplus",

          provenance: {
            sourceKind:
              "county_tax_sale_list",

            sourceName:
              "Carroll County Tax Sale Surplus Funds List",

            sourceReference:
              SOURCE_REFERENCE,

            sourceDate:
              "2026-08-20",

            lastVerified:
              "2026-08-20",

            quality:
              "confirmed",

            analystNote:
              "Carroll County publishes the record on its official Surplus Funds List and describes the listed value as the surplus amount.",
          },
        },
      },
    );

  const readiness =
    evaluateDiscoveredRecordEnrichmentReadiness(
      enrichment,
      {
        hasSourceListedBalance:
          true,
      },
    );

  console.log(
    JSON.stringify(
      {
        ok:
          true,

        sourceAccounting: {
          bidCents:
            BID_CENTS,

          debtSatisfiedCents:
            DEBT_SATISFIED_CENTS,

          estimatedSurplusCents:
            SURPLUS_CENTS,

          arithmeticCheck:
            BID_CENTS -
              DEBT_SATISFIED_CENTS ===
            SURPLUS_CENTS,
        },

        enrichment: {
          discoveredRecordId:
            enrichment.discoveredRecordId,

          propertyType:
            enrichment.propertyType,

          salePrice:
            enrichment.salePrice,

          debtSatisfied:
            enrichment.debtSatisfied,

          taxesOwed:
            enrichment.taxesOwed ??
            null,

          saleCosts:
            enrichment.saleCosts ??
            null,

          estimatedSurplus:
            enrichment.estimatedSurplus,

          confirmedSurplus:
            enrichment.confirmedSurplus,

          sellingEntity:
            enrichment.sellingEntity,

          sourceBalanceInterpretation:
            enrichment.sourceBalanceInterpretation,

          updatedAt:
            enrichment.updatedAt,

          updatedByUserId:
            enrichment.updatedByUserId,
        },

        readiness,

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