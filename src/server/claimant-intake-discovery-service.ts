import "server-only";

import {
  can,
  clearedForState,
  type StaffSession,
} from "@/lib/session";

import {
  evaluateDiscoveredRecordEnrichmentReadiness,
  getDiscoveredRecordEnrichment,
} from "@/server/discovered-record-enrichment-store";

import {
  resolveStaffLeadAccessScope,
} from "@/server/lead-assignment-service";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * CLAIMANT INTAKE DISCOVERY SEARCH
 *
 * This service extends staff claimant-intake lookup backward into the
 * discovered-record layer.
 *
 * SECURITY BOUNDARY:
 *
 * - Super Admin / Administrator may search all accessible recovery records.
 * - Ordinary staff may search ONLY discovered records actively assigned to
 *   their own staff account.
 *
 * County/state clearance remains a separate compliance gate. An employee can
 * be nationally cleared without receiving national lead visibility.
 *
 * This service is READ ONLY.
 *
 * It does not:
 *
 * - promote a discovered record;
 * - create an Opportunity;
 * - create a Claim;
 * - create a claimant;
 * - change jurisdiction routing;
 * - bypass enrichment/review gates.
 */

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type ClaimantIntakeDiscoveryStage =
  | "discovered_new"
  | "discovered_reviewed";

export type ClaimantIntakeDiscoveryPromotionState =
  | "review_required"
  | "enrichment_required"
  | "route_blocked"
  | "ready_for_promotion";

export type ClaimantIntakeDiscoveryRouteCode =
  | "DCR"
  | "MRR"
  | "ATTY"
  | "BLOCKED";

export interface ClaimantIntakeDiscoveryRoute {
  code:
    ClaimantIntakeDiscoveryRouteCode;

  label:
    string;

  intakeCleared:
    boolean;

  reason:
    string;

  filingPartyLabel:
    string;

  paymentRouteLabel:
    string;
}

export interface ClaimantIntakeDiscoveryCandidate {
  discoveredRecordId:
    string;

  stage:
    ClaimantIntakeDiscoveryStage;

  promotionState:
    ClaimantIntakeDiscoveryPromotionState;

  formerOwnerName:
    string;

  propertyAddress:
    string;

  addressLine1:
    string;

  city:
    string;

  county:
    string;

  state:
    string;

  postalCode?:
    string;

  parcelNumber?:
    string;

  caseNumber?:
    string;

  sourceReference:
    string;

  sourceName:
    string;

  saleType:
    string;

  saleDate?:
    string;

  sourceListedBalanceCents?:
    number;

  reviewedAt?:
    string;

  route:
    ClaimantIntakeDiscoveryRoute;

  promotionMissing:
    string[];
}

export interface ClaimantIntakeDiscoverySearchResult {
  query:
    string;

  totalMatches:
    number;

  candidates:
    ClaimantIntakeDiscoveryCandidate[];
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface DiscoveredRecordRow {
  id:
    string;

  status:
    string;

  source_name:
    string;

  source_reference:
    string;

  former_owner_name:
    string;

  address_line1:
    string;

  city:
    string;

  county:
    string;

  state_code:
    string;

  postal_code:
    string | null;

  sale_type:
    string;

  sale_date:
    string | null;

  case_number:
    string | null;

  parcel_number:
    string | null;

  source_listed_balance_cents:
    number | string | null;

  reviewed_at:
    string | null;

  promoted_opportunity_id:
    string | null;
}

interface JurisdictionPackageRow {
  package_id:
    string;

  version:
    number | string;

  status:
    string;

  state_code:
    string;

  county_name:
    string | null;

  sale_type:
    string | null;

  intake_authorized:
    boolean;

  payment_route:
    string | null;

  payment_launch_track:
    string | null;

  representative_may_file:
    string | null;

  representative_may_receive_payment:
    string | null;

  payment_route_ready:
    boolean;

  legal_gate:
    string | null;

  claim_submission_gate:
    string | null;

  fee_gate:
    string | null;

  payment_gate:
    string | null;

  attorney_required:
    boolean;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function normalizeText(
  value:
    string,
): string {
  return value
    .normalize(
      "NFKD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
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

function normalizeCounty(
  value:
    string,
): string {
  return normalizeText(
    value,
  )
    .replace(
      /\bcounty\b/g,
      "",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function centsFromDatabase(
  value:
    number | string | null,
): number | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  const parsed =
    Number(
      value,
    );

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed <
      0
  ) {
    return undefined;
  }

  return parsed;
}

function propertyAddress(
  row:
    DiscoveredRecordRow,
): string {
  return [
    row.address_line1,
    row.city,
    row.state_code,
    row.postal_code,
  ]
    .filter(
      (
        value,
      ) =>
        Boolean(
          value?.trim(),
        ),
    )
    .join(
      ", ",
    );
}

function matchesQuery(
  row:
    DiscoveredRecordRow,
  query:
    string,
): boolean {
  const normalizedQuery =
    normalizeText(
      query,
    );

  if (!normalizedQuery) {
    return false;
  }

  const tokens =
    normalizedQuery
      .split(
        " ",
      )
      .filter(
        Boolean,
      );

  const searchable =
    normalizeText(
      [
        row.id,
        row.former_owner_name,
        row.address_line1,
        row.city,
        row.county,
        row.state_code,
        row.postal_code ??
          "",
        row.parcel_number ??
          "",
        row.case_number ??
          "",
        row.source_reference,
        row.source_name,
      ].join(
        " ",
      ),
    );

  return tokens.every(
    (
      token,
    ) =>
      searchable.includes(
        token,
      ),
  );
}

function candidateScore(
  row:
    DiscoveredRecordRow,
  query:
    string,
): number {
  const normalizedQuery =
    normalizeText(
      query,
    );

  const owner =
    normalizeText(
      row.former_owner_name,
    );

  const address =
    normalizeText(
      row.address_line1,
    );

  const parcel =
    normalizeText(
      row.parcel_number ??
        "",
    );

  const caseNumber =
    normalizeText(
      row.case_number ??
        "",
    );

  if (
    owner ===
    normalizedQuery
  ) {
    return 100;
  }

  if (
    parcel &&
    parcel ===
      normalizedQuery
  ) {
    return 95;
  }

  if (
    caseNumber &&
    caseNumber ===
      normalizedQuery
  ) {
    return 95;
  }

  if (
    address ===
    normalizedQuery
  ) {
    return 90;
  }

  if (
    owner.startsWith(
      normalizedQuery,
    )
  ) {
    return 80;
  }

  if (
    owner.includes(
      normalizedQuery,
    )
  ) {
    return 70;
  }

  return 50;
}

function currentPackageForRecord({
  record,
  packages,
}: {
  record:
    DiscoveredRecordRow;

  packages:
    JurisdictionPackageRow[];
}):
  | JurisdictionPackageRow
  | undefined {
  return packages
    .filter(
      (
        candidate,
      ) =>
        candidate.status ===
          "approved" &&
        candidate.state_code ===
          record.state_code &&
        normalizeCounty(
          candidate.county_name ??
            "",
        ) ===
          normalizeCounty(
            record.county,
          ) &&
        (
          !candidate.sale_type ||
          candidate.sale_type ===
            record.sale_type
        ),
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) =>
        Number(
          right.version,
        ) -
        Number(
          left.version,
        ),
    )[0];
}

function routeForPackage(
  jurisdiction:
    JurisdictionPackageRow | undefined,
): ClaimantIntakeDiscoveryRoute {
  if (!jurisdiction) {
    return {
      code:
        "BLOCKED",

      label:
        "Jurisdiction not cleared",

      intakeCleared:
        false,

      reason:
        "No current approved DueQuity jurisdiction package matches this discovered record.",

      filingPartyLabel:
        "Not cleared",

      paymentRouteLabel:
        "Not cleared",
    };
  }

  const gatesClear =
    jurisdiction.intake_authorized ===
      true &&
    jurisdiction.payment_route_ready ===
      true &&
    jurisdiction.legal_gate ===
      "permitted" &&
    jurisdiction.claim_submission_gate ===
      "permitted" &&
    jurisdiction.fee_gate ===
      "permitted" &&
    jurisdiction.payment_gate ===
      "permitted";

  if (
    jurisdiction.attorney_required
  ) {
    return {
      code:
        "ATTY",

      label:
        "Attorney Route",

      intakeCleared:
        false,

      reason:
        "The approved jurisdiction package requires attorney handling for this recovery.",

      filingPartyLabel:
        "Attorney-controlled",

      paymentRouteLabel:
        jurisdiction.payment_route ===
          "claimant_only"
          ? "Claimant / lawful estate representative only"
          : "Attorney / approved route",
    };
  }

  if (!gatesClear) {
    return {
      code:
        "BLOCKED",

      label:
        "Not cleared",

      intakeCleared:
        false,

      reason:
        "One or more current jurisdiction, submission, fee or payment gates do not permit ordinary DueQuity intake.",

      filingPartyLabel:
        "Not cleared",

      paymentRouteLabel:
        "Not cleared",
    };
  }

  if (
    jurisdiction.payment_launch_track ===
      "direct_claimant_recovery" ||
    jurisdiction.payment_route ===
      "claimant_only"
  ) {
    return {
      code:
        "DCR",

      label:
        "Direct Claimant Recovery",

      intakeCleared:
        true,

      reason:
        "The approved jurisdiction package permits Direct Claimant Recovery.",

      filingPartyLabel:
        jurisdiction.representative_may_file ===
          "yes"
          ? "Representative filing permitted"
          : "Claimant-controlled filing",

      paymentRouteLabel:
        "Claimant / lawful estate representative only",
    };
  }

  if (
    jurisdiction.payment_launch_track ===
      "managed_representative_recovery" ||
    jurisdiction.representative_may_receive_payment ===
      "yes"
  ) {
    return {
      code:
        "MRR",

      label:
        "Managed Representative Recovery",

      intakeCleared:
        true,

      reason:
        "The approved jurisdiction package permits the managed representative recovery route.",

      filingPartyLabel:
        jurisdiction.representative_may_file ===
          "yes"
          ? "DueQuity representative filing permitted"
          : "Claimant-controlled filing",

      paymentRouteLabel:
        "Approved representative payment route",
    };
  }

  return {
    code:
      "BLOCKED",

    label:
      "Payment route not cleared",

    intakeCleared:
      false,

    reason:
      "The jurisdiction is approved, but DueQuity does not have a cleared launch payment route for this recovery.",

    filingPartyLabel:
      "Not cleared",

    paymentRouteLabel:
      "Not cleared",
  };
}

/* ========================================================================== */
/* Search                                                                      */
/* ========================================================================== */

export async function searchClaimantIntakeDiscoveryCandidates({
  session,
  query,
}: {
  session:
    StaffSession;

  query:
    string;
}): Promise<
  ClaimantIntakeDiscoverySearchResult
> {
  const normalizedQuery =
    query
      .trim()
      .slice(
        0,
        200,
      );

  if (
    normalizedQuery.length <
    2
  ) {
    return {
      query:
        normalizedQuery,

      totalMatches:
        0,

      candidates:
        [],
    };
  }

  if (
    !can(
      session,
      "opportunity.read",
    ) ||
    !can(
      session,
      "claim.read",
    ) ||
    !can(
      session,
      "claimant.read",
    )
  ) {
    throw new Error(
      "Your DueQuity role is not authorized to search claimant-intake recovery records.",
    );
  }

  /*
   * Assignment is the visibility boundary.
   *
   * State clearance answers "may this employee work in this state?"
   * Assignment answers "may this employee see this particular lead?"
   */
  const leadScope =
    await resolveStaffLeadAccessScope(
      session,
    );

  /*
   * Ordinary staff with no assigned Discovery leads receive an empty result
   * immediately. We do not load national Discovery data and hide it later.
   */
  if (
    !leadScope.globalAccess &&
    leadScope.discoveredRecordIds.size ===
      0
  ) {
    return {
      query:
        normalizedQuery,

      totalMatches:
        0,

      candidates:
        [],
    };
  }

  const admin =
    getSupabaseAdmin();

  let discoveredQuery =
    admin
      .from(
        "discovered_records",
      )
      .select(
        [
          "id",
          "status",
          "source_name",
          "source_reference",
          "former_owner_name",
          "address_line1",
          "city",
          "county",
          "state_code",
          "postal_code",
          "sale_type",
          "sale_date",
          "case_number",
          "parcel_number",
          "source_listed_balance_cents",
          "reviewed_at",
          "promoted_opportunity_id",
        ].join(
          ", ",
        ),
      )
      .in(
        "status",
        [
          "new",
          "reviewed",
        ],
      )
      .is(
        "promoted_opportunity_id",
        null,
      )
      .limit(
        5000,
      );

  if (
    !leadScope.globalAccess
  ) {
    discoveredQuery =
      discoveredQuery.in(
        "id",
        Array.from(
          leadScope.discoveredRecordIds,
        ),
      );
  }

  const [
    discoveredResult,
    jurisdictionResult,
  ] =
    await Promise.all([
      discoveredQuery,

      admin
        .from(
          "jurisdiction_rule_packages",
        )
        .select(
          [
            "package_id",
            "version",
            "status",
            "state_code",
            "county_name",
            "sale_type",
            "intake_authorized",
            "payment_route",
            "payment_launch_track",
            "representative_may_file",
            "representative_may_receive_payment",
            "payment_route_ready",
            "legal_gate",
            "claim_submission_gate",
            "fee_gate",
            "payment_gate",
            "attorney_required",
          ].join(
            ", ",
          ),
        )
        .eq(
          "status",
          "approved",
        ),
    ]);

  if (
    discoveredResult.error
  ) {
    throw new Error(
      `Unable to search discovered recovery records: ${discoveredResult.error.message}`,
    );
  }

  if (
    jurisdictionResult.error
  ) {
    throw new Error(
      `Unable to resolve approved jurisdiction packages: ${jurisdictionResult.error.message}`,
    );
  }

  const discoveredRows =
    (
      discoveredResult.data ??
      []
    ) as unknown as
      DiscoveredRecordRow[];

  const jurisdictionRows =
    (
      jurisdictionResult.data ??
      []
    ) as unknown as
      JurisdictionPackageRow[];

  const matchedRows =
    discoveredRows
      .filter(
        (
          row,
        ) =>
          clearedForState(
            session,
            row.state_code,
          ),
      )
      .filter(
        (
          row,
        ) =>
          matchesQuery(
            row,
            normalizedQuery,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          candidateScore(
            right,
            normalizedQuery,
          ) -
          candidateScore(
            left,
            normalizedQuery,
          ),
      )
      .slice(
        0,
        25,
      );

  const candidates =
    await Promise.all(
      matchedRows.map(
        async (
          row,
        ): Promise<ClaimantIntakeDiscoveryCandidate> => {
          const enrichment =
            await getDiscoveredRecordEnrichment(
              row.id,
            );

          const jurisdiction =
            currentPackageForRecord({
              record:
                row,

              packages:
                jurisdictionRows,
            });

          const route =
            routeForPackage(
              jurisdiction,
            );

          const readiness =
            evaluateDiscoveredRecordEnrichmentReadiness(
              enrichment,
              {
                hasSourceListedBalance:
                  row.source_listed_balance_cents !==
                  null,
              },
            );

          const missing =
            readiness.missing.slice();

          if (
            !row.postal_code?.trim()
          ) {
            missing.push(
              "verified postal code",
            );
          }

          if (
            !jurisdiction
          ) {
            missing.push(
              "approved jurisdiction package",
            );
          }

          let promotionState:
            ClaimantIntakeDiscoveryPromotionState;

          if (
            row.status !==
            "reviewed"
          ) {
            promotionState =
              "review_required";
          } else if (
            !route.intakeCleared
          ) {
            promotionState =
              "route_blocked";
          } else if (
            !readiness.ready ||
            !row.postal_code?.trim()
          ) {
            promotionState =
              "enrichment_required";
          } else {
            promotionState =
              "ready_for_promotion";
          }

          return {
            discoveredRecordId:
              row.id,

            stage:
              row.status ===
                "reviewed"
                ? "discovered_reviewed"
                : "discovered_new",

            promotionState,

            formerOwnerName:
              row.former_owner_name,

            propertyAddress:
              propertyAddress(
                row,
              ),

            addressLine1:
              row.address_line1,

            city:
              row.city,

            county:
              row.county,

            state:
              row.state_code,

            postalCode:
              row.postal_code ??
              undefined,

            parcelNumber:
              row.parcel_number ??
              undefined,

            caseNumber:
              row.case_number ??
              undefined,

            sourceReference:
              row.source_reference,

            sourceName:
              row.source_name,

            saleType:
              row.sale_type,

            saleDate:
              row.sale_date ??
              undefined,

            sourceListedBalanceCents:
              centsFromDatabase(
                row.source_listed_balance_cents,
              ),

            reviewedAt:
              row.reviewed_at ??
              undefined,

            route,

            promotionMissing:
              Array.from(
                new Set(
                  missing,
                ),
              ),
          };
        },
      ),
    );

  return {
    query:
      normalizedQuery,

    totalMatches:
      candidates.length,

    candidates,
  };
}