import "server-only";

import {
  jurisdictionLegalRule,
} from "@/domain/legal";

import type {
  Opportunity,
  Property,
} from "@/domain/types";

import {
  can,
  clearedForState,
  type StaffSession,
} from "@/lib/session";

import {
  evaluateJurisdictionPaymentRouting,
  listJurisdictionRulePackages,
  type JurisdictionPaymentRouting,
  type JurisdictionRulePackage,
} from "@/server/jurisdiction-intelligence";

import {
  listOpportunityConversions,
} from "@/server/opportunity-conversion-store";

import {
  getOpportunityById,
  getPropertyById,
  listOpportunities,
  listProperties,
} from "@/server/opportunity-store";

/**
 * CLAIMANT INTAKE SERVICE
 *
 * Staff-facing resolver for the first operational step after a potential
 * claimant voluntarily agrees to continue with DueQuity.
 *
 * NORMAL SEARCH
 *
 * Normal/fuzzy searches use the operational Opportunity and Property lists.
 * Records explicitly excluded from operational lists therefore do not appear
 * in ordinary staff searches.
 *
 * DIRECT QA / CONTROLLED ACCESS
 *
 * An exact persisted Opportunity/Claim identifier may resolve a record through
 * the existing direct-access boundary. This preserves controlled QA access
 * without allowing training records to leak into normal operational search.
 *
 * This service does NOT:
 *
 * - create jurisdiction rules;
 * - let staff choose a recovery route;
 * - create a Claim;
 * - bypass opportunity conversion;
 * - create a claimant;
 * - send an activation invitation;
 * - make entitlement decisions.
 */

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export type ClaimantIntakeRouteCode =
  | "DCR"
  | "MRR"
  | "ATTY"
  | "BLOCKED";

export type ClaimantIntakeRouteTone =
  | "positive"
  | "caution"
  | "critical"
  | "neutral";

export interface ClaimantIntakeRouteSummary {
  code:
    ClaimantIntakeRouteCode;

  label:
    string;

  tone:
    ClaimantIntakeRouteTone;

  intakeCleared:
    boolean;

  filingPartyLabel:
    string;

  paymentRouteLabel:
    string;

  representativeMayFile:
    JurisdictionPaymentRouting["representativeMayFile"]
    | "unknown";

  representativeMayReceivePayment:
    JurisdictionPaymentRouting["representativeMayReceivePayment"]
    | "unknown";

  reason:
    string;
}

export interface ClaimantIntakeCandidate {
  opportunityId:
    string;

  opportunityReference:
    string;

  propertyId:
    string;

  formerOwnerNames:
    string[];

  propertyAddress:
    string;

  city:
    string;

  county?:
    string;

  state:
    string;

  postalCode:
    string;

  saleType:
    string;

  surplusAmount:
    number;

  surplusQuality:
    "estimated" | "confirmed";

  opportunityStatus:
    string;

  jurisdictionId:
    string;

  jurisdictionPackageId?:
    string;

  jurisdictionPackageVersion?:
    number;

  route:
    ClaimantIntakeRouteSummary;

  converted:
    boolean;

  claimId?:
    string;

  claimReference?:
    string;

  readyForClaimantCreation:
    boolean;
}

export interface ClaimantIntakeSearchResult {
  query:
    string;

  candidates:
    ClaimantIntakeCandidate[];

  totalMatches:
    number;
}

/* ========================================================================== */
/* Authorization                                                               */
/* ========================================================================== */

function requireFinderAuthority(
  session:
    StaffSession,
): void {
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
      "Your DueQuity role is not authorized to locate claimant intake records.",
    );
  }
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function normalizeSearch(
  value:
    string,
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " ",
    )
    .toLowerCase()
    .slice(
      0,
      200,
    );
}

function propertyAddress(
  property:
    Property,
): string {
  return [
    property.address.line1,
    property.address.line2,
    property.address.city,
    property.address.state,
    property.address.postalCode,
  ]
    .filter(
      Boolean,
    )
    .join(
      ", ",
    );
}

function formerOwnerNames(
  opportunity:
    Opportunity,
): string[] {
  return [
    ...new Set(
      opportunity.priorOwners
        .map(
          (
            owner,
          ) =>
            owner.nameOnRecord
              .trim(),
        )
        .filter(
          Boolean,
        ),
    ),
  ];
}

function opportunityMatchesQuery({
  query,
  opportunity,
  property,
  claimReference,
}: {
  query:
    string;

  opportunity:
    Opportunity;

  property:
    Property;

  claimReference?:
    string;
}): boolean {
  if (!query) {
    return false;
  }

  const values = [
    opportunity.id,
    opportunity.reference,
    property.id,
    property.address.line1,
    property.address.line2,
    property.address.city,
    property.address.county,
    property.address.state,
    property.address.postalCode,
    property.parcelNumber,
    claimReference,
    ...formerOwnerNames(
      opportunity,
    ),
  ];

  return values.some(
    (
      value,
    ) =>
      value
        ?.toLowerCase()
        .includes(
          query,
        ) ===
      true,
  );
}

function packageForOpportunity(
  packages:
    JurisdictionRulePackage[],
  opportunity:
    Opportunity,
): JurisdictionRulePackage | undefined {
  return packages
    .filter(
      (
        rulePackage,
      ) =>
        rulePackage.status ===
          "approved" &&
        rulePackage.rule?.id ===
          opportunity.jurisdictionId,
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) =>
        right.version -
        left.version,
    )[0];
}

function filingPartyLabel(
  routing:
    JurisdictionPaymentRouting
    | undefined,
): string {
  switch (
    routing?.representativeMayFile
  ) {
    case "yes":
      return "Authorized representative filing permitted";

    case "no":
      return "Claimant-controlled filing";

    case "unknown":
    case undefined:
      return "Filing authority not cleared";
  }
}

function paymentRouteLabel(
  routing:
    JurisdictionPaymentRouting
    | undefined,
): string {
  switch (
    routing?.paymentRoute
  ) {
    case "claimant_only":
      return "Claimant / lawful estate representative only";

    case "authorized_representative":
      return "Authorized representative payment";

    case "joint_payee":
      return "Joint-payee payment";

    case "split_disbursement":
      return "Split disbursement";

    case "assignee":
      return "Assignment / acquisition route";

    case "unknown":
    case undefined:
      return "Payment route not cleared";
  }
}

/* ========================================================================== */
/* Route derivation                                                            */
/* ========================================================================== */

export function claimantIntakeRouteForPackage(
  rulePackage:
    JurisdictionRulePackage
    | undefined,
): ClaimantIntakeRouteSummary {
  if (
    !rulePackage ||
    rulePackage.status !==
      "approved" ||
    !rulePackage.rule
  ) {
    return {
      code:
        "BLOCKED",

      label:
        "Route not cleared",

      tone:
        "critical",

      intakeCleared:
        false,

      filingPartyLabel:
        "Filing authority not cleared",

      paymentRouteLabel:
        "Payment route not cleared",

      representativeMayFile:
        "unknown",

      representativeMayReceivePayment:
        "unknown",

      reason:
        "No approved jurisdiction package is available for this Opportunity.",
    };
  }

  const jurisdiction =
    rulePackage.rule;

  const routing =
    rulePackage.paymentRouting;

  const legalRule =
    jurisdictionLegalRule(
      jurisdiction,
    );

  if (
    rulePackage.intakeAuthorized ===
      false
  ) {
    return {
      code:
        "BLOCKED",

      label:
        "Intake closed",

      tone:
        "critical",

      intakeCleared:
        false,

      filingPartyLabel:
        filingPartyLabel(
          routing,
        ),

      paymentRouteLabel:
        paymentRouteLabel(
          routing,
        ),

      representativeMayFile:
        routing?.representativeMayFile ??
        "unknown",

      representativeMayReceivePayment:
        routing?.representativeMayReceivePayment ??
        "unknown",

      reason:
        "The approved jurisdiction package does not currently authorize claimant intake.",
    };
  }

  if (
    legalRule ===
    "attorney_mandatory"
  ) {
    return {
      code:
        "ATTY",

      label:
        "Attorney required",

      tone:
        "caution",

      intakeCleared:
        false,

      filingPartyLabel:
        "Licensed attorney required",

      paymentRouteLabel:
        paymentRouteLabel(
          routing,
        ),

      representativeMayFile:
        routing?.representativeMayFile ??
        "unknown",

      representativeMayReceivePayment:
        routing?.representativeMayReceivePayment ??
        "unknown",

      reason:
        "The current jurisdiction rule requires attorney handling. Ordinary claimant intake must not advance through the administrative workflow.",
    };
  }

  if (
    legalRule ===
      "legal_review_recommended" ||
    legalRule ===
      "restricted" ||
    legalRule ===
      "not_yet_approved"
  ) {
    return {
      code:
        "BLOCKED",

      label:
        legalRule ===
        "legal_review_recommended"
          ? "Legal review required"
          : "Route not cleared",

      tone:
        legalRule ===
        "legal_review_recommended"
          ? "caution"
          : "critical",

      intakeCleared:
        false,

      filingPartyLabel:
        filingPartyLabel(
          routing,
        ),

      paymentRouteLabel:
        paymentRouteLabel(
          routing,
        ),

      representativeMayFile:
        routing?.representativeMayFile ??
        "unknown",

      representativeMayReceivePayment:
        routing?.representativeMayReceivePayment ??
        "unknown",

      reason:
        legalRule ===
        "legal_review_recommended"
          ? "The jurisdiction requires legal review before ordinary claimant processing may advance."
          : "The jurisdiction is not cleared for ordinary claimant processing.",
    };
  }

  const paymentEvaluation =
    evaluateJurisdictionPaymentRouting(
      routing,
    );

  if (
    !paymentEvaluation.ready
  ) {
    return {
      code:
        "BLOCKED",

      label:
        "Payment route not cleared",

      tone:
        "critical",

      intakeCleared:
        false,

      filingPartyLabel:
        filingPartyLabel(
          routing,
        ),

      paymentRouteLabel:
        paymentRouteLabel(
          routing,
        ),

      representativeMayFile:
        routing?.representativeMayFile ??
        "unknown",

      representativeMayReceivePayment:
        routing?.representativeMayReceivePayment ??
        "unknown",

      reason:
        paymentEvaluation.reason,
    };
  }

  if (
    paymentEvaluation.launchTrack ===
    "direct_claimant_recovery"
  ) {
    return {
      code:
        "DCR",

      label:
        "Direct Claimant Recovery",

      tone:
        "positive",

      intakeCleared:
        true,

      filingPartyLabel:
        filingPartyLabel(
          routing,
        ),

      paymentRouteLabel:
        paymentRouteLabel(
          routing,
        ),

      representativeMayFile:
        routing?.representativeMayFile ??
        "unknown",

      representativeMayReceivePayment:
        routing?.representativeMayReceivePayment ??
        "unknown",

      reason:
        paymentEvaluation.reason,
    };
  }

  if (
    paymentEvaluation.launchTrack ===
    "managed_representative_recovery"
  ) {
    return {
      code:
        "MRR",

      label:
        "Managed Representative Recovery",

      tone:
        "positive",

      intakeCleared:
        true,

      filingPartyLabel:
        filingPartyLabel(
          routing,
        ),

      paymentRouteLabel:
        paymentRouteLabel(
          routing,
        ),

      representativeMayFile:
        routing?.representativeMayFile ??
        "unknown",

      representativeMayReceivePayment:
        routing?.representativeMayReceivePayment ??
        "unknown",

      reason:
        paymentEvaluation.reason,
    };
  }

  return {
    code:
      "BLOCKED",

    label:
      "Route not cleared",

    tone:
      "critical",

    intakeCleared:
      false,

    filingPartyLabel:
      filingPartyLabel(
        routing,
      ),

    paymentRouteLabel:
      paymentRouteLabel(
        routing,
      ),

    representativeMayFile:
      routing?.representativeMayFile ??
      "unknown",

    representativeMayReceivePayment:
      routing?.representativeMayReceivePayment ??
      "unknown",

    reason:
      paymentEvaluation.reason,
  };
}

/* ========================================================================== */
/* Candidate construction                                                      */
/* ========================================================================== */

function buildCandidate({
  session,
  opportunity,
  property,
  conversion,
  rulePackages,
}: {
  session:
    StaffSession;

  opportunity:
    Opportunity;

  property:
    Property;

  conversion:
    Awaited<
      ReturnType<
        typeof listOpportunityConversions
      >
    >[number]
    | undefined;

  rulePackages:
    JurisdictionRulePackage[];
}): ClaimantIntakeCandidate | undefined {
  const rulePackage =
    packageForOpportunity(
      rulePackages,
      opportunity,
    );

  const stateCode =
    rulePackage?.stateCode ??
    property.address.state;

  if (
    !clearedForState(
      session,
      stateCode,
    )
  ) {
    return undefined;
  }

  const route =
    claimantIntakeRouteForPackage(
      rulePackage,
    );

  const value =
    opportunity.confirmedSurplus ??
    opportunity.estimatedSurplus;

  return {
    opportunityId:
      opportunity.id,

    opportunityReference:
      opportunity.reference,

    propertyId:
      property.id,

    formerOwnerNames:
      formerOwnerNames(
        opportunity,
      ),

    propertyAddress:
      propertyAddress(
        property,
      ),

    city:
      property.address.city,

    county:
      property.address.county,

    state:
      property.address.state,

    postalCode:
      property.address.postalCode,

    saleType:
      opportunity.sale.saleType,

    surplusAmount:
      value.amount,

    surplusQuality:
      opportunity.confirmedSurplus
        ? "confirmed"
        : "estimated",

    opportunityStatus:
      String(
        opportunity.status,
      ),

    jurisdictionId:
      opportunity.jurisdictionId,

    jurisdictionPackageId:
      rulePackage?.id,

    jurisdictionPackageVersion:
      rulePackage?.version,

    route,

    converted:
      Boolean(
        conversion,
      ),

    claimId:
      conversion?.claimId,

    claimReference:
      conversion?.claimReference,

    readyForClaimantCreation:
      route.intakeCleared &&
      Boolean(
        conversion,
      ),
  };
}

/* ========================================================================== */
/* Exact direct-access lookup                                                  */
/* ========================================================================== */

async function directCandidateForExactIdentifier({
  session,
  rawQuery,
  normalizedQuery,
  conversions,
  rulePackages,
}: {
  session:
    StaffSession;

  rawQuery:
    string;

  normalizedQuery:
    string;

  conversions:
    Awaited<
      ReturnType<
        typeof listOpportunityConversions
      >
    >;

  rulePackages:
    JurisdictionRulePackage[];
}): Promise<
  ClaimantIntakeCandidate
  | undefined
> {
  const exactConversion =
    conversions.find(
      (
        conversion,
      ) =>
        [
          conversion.opportunityId,
          conversion.opportunityReference,
          conversion.claimId,
          conversion.claimReference,
        ].some(
          (
            value,
          ) =>
            value
              ?.trim()
              .toLowerCase() ===
            normalizedQuery,
        ),
    );

  let opportunityId =
    exactConversion?.opportunityId;

  /*
   * Internal Opportunity IDs may also be addressed directly.
   *
   * getOpportunityById() remains the access boundary and will return undefined
   * when direct access is not permitted for the record.
   */
  if (
    !opportunityId &&
    normalizedQuery.startsWith(
      "opportunity-",
    )
  ) {
    opportunityId =
      rawQuery.trim();
  }

  if (
    !opportunityId
  ) {
    return undefined;
  }

  const opportunity =
    await getOpportunityById(
      opportunityId,
    );

  if (
    !opportunity
  ) {
    return undefined;
  }

  const property =
    await getPropertyById(
      opportunity.propertyId,
    );

  if (
    !property
  ) {
    return undefined;
  }

  return buildCandidate({
    session,

    opportunity,

    property,

    conversion:
      exactConversion,

    rulePackages,
  });
}

/* ========================================================================== */
/* Staff search                                                                */
/* ========================================================================== */

export async function searchClaimantIntakeCandidates({
  session,
  query,
}: {
  session:
    StaffSession;

  query:
    string;
}): Promise<
  ClaimantIntakeSearchResult
> {
  requireFinderAuthority(
    session,
  );

  const rawQuery =
    query
      .trim()
      .slice(
        0,
        200,
      );

  const normalizedQuery =
    normalizeSearch(
      rawQuery,
    );

  if (
    normalizedQuery.length <
    2
  ) {
    return {
      query:
        rawQuery,

      candidates:
        [],

      totalMatches:
        0,
    };
  }

  const [
    opportunities,
    properties,
    conversions,
    rulePackages,
  ] =
    await Promise.all([
      listOpportunities(),

      listProperties(),

      listOpportunityConversions(),

      listJurisdictionRulePackages(),
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

  const conversionByOpportunityId =
    new Map(
      conversions.map(
        (
          conversion,
        ) => [
          conversion.opportunityId,
          conversion,
        ],
      ),
    );

  const candidateByOpportunityId =
    new Map<
      string,
      ClaimantIntakeCandidate
    >();

  /*
   * Ordinary/fuzzy search.
   *
   * Only operationally listed records participate here.
   */
  for (
    const opportunity of
    opportunities
  ) {
    const property =
      propertyById.get(
        opportunity.propertyId,
      );

    if (
      !property
    ) {
      continue;
    }

    const conversion =
      conversionByOpportunityId.get(
        opportunity.id,
      );

    if (
      !opportunityMatchesQuery({
        query:
          normalizedQuery,

        opportunity,

        property,

        claimReference:
          conversion?.claimReference,
      })
    ) {
      continue;
    }

    const candidate =
      buildCandidate({
        session,

        opportunity,

        property,

        conversion,

        rulePackages,
      });

    if (
      !candidate
    ) {
      continue;
    }

    candidateByOpportunityId.set(
      candidate.opportunityId,
      candidate,
    );
  }

  /*
   * Controlled exact-reference fallback.
   *
   * This allows a direct-accessible QA/training record to be tested by its
   * exact Opportunity ID/reference or Claim ID/reference without causing it to
   * appear in normal staff searches.
   */
  const directCandidate =
    await directCandidateForExactIdentifier({
      session,

      rawQuery,

      normalizedQuery,

      conversions,

      rulePackages,
    });

  if (
    directCandidate &&
    !candidateByOpportunityId.has(
      directCandidate.opportunityId,
    )
  ) {
    candidateByOpportunityId.set(
      directCandidate.opportunityId,
      directCandidate,
    );
  }

  const matches =
    [
      ...candidateByOpportunityId.values(),
    ];

  matches.sort(
    (
      left,
      right,
    ) => {
      const leftExact =
        [
          left.opportunityId,
          left.opportunityReference,
          left.claimId,
          left.claimReference,
        ].some(
          (
            value,
          ) =>
            value
              ?.toLowerCase() ===
            normalizedQuery,
        )
          ? 1
          : 0;

      const rightExact =
        [
          right.opportunityId,
          right.opportunityReference,
          right.claimId,
          right.claimReference,
        ].some(
          (
            value,
          ) =>
            value
              ?.toLowerCase() ===
            normalizedQuery,
        )
          ? 1
          : 0;

      if (
        leftExact !==
        rightExact
      ) {
        return rightExact -
          leftExact;
      }

      if (
        left.converted !==
        right.converted
      ) {
        return left.converted
          ? -1
          : 1;
      }

      return left
        .opportunityReference
        .localeCompare(
          right.opportunityReference,
        );
    },
  );

  return {
    query:
      rawQuery,

    totalMatches:
      matches.length,

    candidates:
      matches.slice(
        0,
        20,
      ),
  };
}