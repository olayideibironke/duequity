import "server-only";

import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
  join,
} from "node:path";

import type {
  Jurisdiction,
  SaleType,
  StateCode,
} from "@/domain/types";

import {
  resolveAddressGeography,
  type ResolvedAddressGeography,
} from "@/server/geography-resolver";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * DUEQUITY NATIONAL JURISDICTION INTELLIGENCE
 *
 * Production-facing rule boundary:
 *
 *   state FIPS
 *   + county GEOID
 *   + sale type
 *   = applicable jurisdiction rule package
 *
 * Canonical production reads come from:
 *
 *   public.jurisdiction_rule_packages
 *
 * The historical .duequity-data jurisdiction JSON file is retained only as a
 * compatibility write mirror for the legacy local review workflow. It is NOT
 * a production read authority.
 *
 * Canonical publication remains controlled separately by the Stage 2
 * jurisdiction publication workflow.
 */

/* ========================================================================== */
/* Status                                                                      */
/* ========================================================================== */

export type JurisdictionIntelligenceStatus =
  | "unverified"
  | "review_required"
  | "conflict"
  | "approved";

/* ========================================================================== */
/* Rule scope                                                                  */
/* ========================================================================== */

export type JurisdictionRuleScope =
  | "state"
  | "county";

/* ========================================================================== */
/* Authoritative sources                                                       */
/* ========================================================================== */

export type JurisdictionAuthoritySourceKind =
  | "statute"
  | "court_rule"
  | "judiciary"
  | "state_agency"
  | "county_agency"
  | "clerk"
  | "tax_collector"
  | "treasurer"
  | "sheriff"
  | "regulator"
  | "official_form"
  | "fee_schedule"
  | "other_official";

export interface JurisdictionAuthoritySource {
  id: string;

  kind: JurisdictionAuthoritySourceKind;

  authorityName: string;

  url: string;

  title?: string;

  retrievedAt: string;

  effectiveDate?: string;

  contentHash?: string;
}

/* ========================================================================== */
/* Payment and representation intelligence                                     */
/* ========================================================================== */

export type JurisdictionPaymentRoute =
  | "claimant_only"
  | "authorized_representative"
  | "joint_payee"
  | "split_disbursement"
  | "assignee"
  | "unknown";

export type JurisdictionYesNoUnknown =
  | "yes"
  | "no"
  | "unknown";

export type DuequityLaunchPaymentTrack =
  | "direct_claimant_recovery"
  | "managed_representative_recovery"
  | "future_acquisition"
  | "blocked";

export type JurisdictionFeeCollectionMethod =
  | "contractual_post_recovery"
  | "representative_disbursement"
  | "joint_payee_disbursement"
  | "split_disbursement"
  | "assignment_acquisition"
  | "unknown";

export interface JurisdictionPaymentRouting {
  paymentRoute: JurisdictionPaymentRoute;

  launchTrack: DuequityLaunchPaymentTrack;

  representativeMayFile: JurisdictionYesNoUnknown;

  representativeMayReceivePayment: JurisdictionYesNoUnknown;

  assignmentRequiredForRepresentativePayment: JurisdictionYesNoUnknown;

  feeCollectionMethod: JurisdictionFeeCollectionMethod;

  evidenceSourceIds: string[];

  notes?: string;
}

/* ========================================================================== */
/* Rule package                                                                */
/* ========================================================================== */

export interface JurisdictionRulePackage {
  id: string;

  version: number;

  scope: JurisdictionRuleScope;

  stateFips: string;

  stateCode: StateCode;

  stateName: string;

  countyGeoid?: string;

  countyName?: string;

  saleType: SaleType;

  status: JurisdictionIntelligenceStatus;

  sources: JurisdictionAuthoritySource[];

  rule?: Jurisdiction;

  paymentRouting?: JurisdictionPaymentRouting;

  /**
   * Canonical Stage 2 intake authorization.
   *
   * Older local packages may not contain this property.
   *
   * When the canonical Supabase registry explicitly records false, operational
   * intake remains closed even if individual rule fields appear otherwise ready.
   */
  intakeAuthorized?: boolean;

  reviewReason?: string;

  conflictReason?: string;

  approvedByUserId?: string;

  approvedAt?: string;

  createdAt: string;

  updatedAt: string;
}

/* ========================================================================== */
/* Legacy local compatibility store                                            */
/* ========================================================================== */

interface JurisdictionIntelligenceStore {
  schemaVersion: 1;

  packages: JurisdictionRulePackage[];
}

const LEGACY_STORE_PATH =
  join(
    process.cwd(),
    ".duequity-data",
    "jurisdiction-intelligence.json",
  );

const EMPTY_STORE: JurisdictionIntelligenceStore = {
  schemaVersion: 1,

  packages: [],
};

let mutationQueue:
  Promise<void> =
  Promise.resolve();

/* ========================================================================== */
/* Canonical Supabase rows                                                     */
/* ========================================================================== */

interface CanonicalJurisdictionRulePackageRow {
  package_id: string;

  version:
    | number
    | string;

  scope: string;

  state_fips: string;

  state_code: string;

  state_name: string;

  county_geoid:
    | string
    | null;

  county_name:
    | string
    | null;

  sale_type: string;

  status: string;

  jurisdiction_id: string;

  legal_rule_version:
    | number
    | string;

  intake_authorized: boolean;

  agency_name: string;

  agency_website:
    | string
    | null;

  agency_phone:
    | string
    | null;

  agency_address:
    | unknown
    | null;

  custodian: string;

  claim_method: string;

  claim_form_url:
    | string
    | null;

  required_documents:
    | string[]
    | null;

  claim_deadline_days:
    | number
    | null;

  statute_reference:
    | string
    | null;

  permitted_fee_models:
    | string[]
    | null;

  fee_cap_percent:
    | number
    | string
    | null;

  fee_cap_amount_cents:
    | number
    | string
    | null;

  assignment_permitted: boolean;

  power_of_attorney_accepted: boolean;

  finder_license_required: boolean;

  bond_required: boolean;

  attorney_required: boolean;

  mandatory_contract_language:
    | string[]
    | null;

  cancellation_period_days:
    | number
    | null;

  payment_routing_note:
    | string
    | null;

  probate_required_when_deceased: boolean;

  compliance_status: string;

  legal_processing_rule: string;

  legal_rule_effective_from:
    | string
    | null;

  legal_rule_effective_through:
    | string
    | null;

  legal_review_due_at:
    | string
    | null;

  internal_notes:
    | string
    | null;

  payment_route: string;

  payment_launch_track: string;

  representative_may_file: string;

  representative_may_receive_payment: string;

  assignment_required_for_representative_payment: string;

  fee_collection_method: string;

  payment_route_ready: boolean;

  legal_gate: string;

  claim_submission_gate: string;

  fee_gate: string;

  payment_gate: string;

  gate_details: unknown;

  evidence_packet_id: string;

  evidence_packet_hash: string;

  review_draft_id: string;

  sources_snapshot: unknown;

  approved_by_user_id: string;

  approved_by_name: string;

  approved_at: string;

  last_legal_review:
    | string
    | null;

  created_at: string;

  updated_at: string;
}

/* ========================================================================== */
/* General helpers                                                             */
/* ========================================================================== */

function positiveInteger(
  value:
    | number
    | string,
  label: string,
): number {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <
      1
  ) {
    throw new Error(
      `${label} must be a positive integer.`,
    );
  }

  return parsed;
}

function optionalFiniteNumber(
  value:
    | number
    | string
    | null,
  label: string,
):
  | number
  | undefined {
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
    !Number.isFinite(
      parsed,
    )
  ) {
    throw new Error(
      `${label} contains an invalid numeric value.`,
    );
  }

  return parsed;
}

function optionalNonNegativeInteger(
  value:
    | number
    | null,
  label: string,
):
  | number
  | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  if (
    !Number.isInteger(
      value,
    ) ||
    value <
      0
  ) {
    throw new Error(
      `${label} contains an invalid integer value.`,
    );
  }

  return value;
}

function optionalText(
  value:
    | string
    | null,
):
  | string
  | undefined {
  const normalized =
    value
      ?.trim();

  return normalized ||
    undefined;
}

function stringArray(
  value:
    | string[]
    | null,
  label: string,
): string[] {
  if (
    value ===
    null
  ) {
    return [];
  }

  if (
    !Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `${label} contains invalid canonical data.`,
    );
  }

  return value.map(
    (
      item,
    ) =>
      String(
        item,
      ),
  );
}

function requiredObject<T>(
  value: unknown,
  label: string,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      `${label} contains invalid canonical data.`,
    );
  }

  return value as T;
}

function authoritySourcesFromSnapshot(
  value: unknown,
): JurisdictionAuthoritySource[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "Canonical jurisdiction package contains an invalid authority-source snapshot.",
    );
  }

  return value.map(
    (
      item,
    ) => {
      const source =
        requiredObject<
          Partial<JurisdictionAuthoritySource>
        >(
          item,
          "Jurisdiction authority source",
        );

      const id =
        String(
          source.id ??
          "",
        )
          .trim();

      const authorityName =
        String(
          source.authorityName ??
          "",
        )
          .trim();

      const url =
        String(
          source.url ??
          "",
        )
          .trim();

      const retrievedAt =
        String(
          source.retrievedAt ??
          "",
        )
          .trim();

      const kind =
        String(
          source.kind ??
          "",
        )
          .trim() as
          JurisdictionAuthoritySourceKind;

      if (
        !id ||
        !authorityName ||
        !url ||
        !retrievedAt ||
        !kind
      ) {
        throw new Error(
          "Canonical jurisdiction authority source is incomplete.",
        );
      }

      return {
        id,

        kind,

        authorityName,

        url,

        title:
          optionalText(
            source.title ??
            null,
          ),

        retrievedAt,

        effectiveDate:
          optionalText(
            source.effectiveDate ??
            null,
          ),

        contentHash:
          optionalText(
            source.contentHash ??
            null,
          ),
      };
    },
  );
}

/* ========================================================================== */
/* Legacy store helpers                                                        */
/* ========================================================================== */

async function readLegacyStore(): Promise<
  JurisdictionIntelligenceStore
> {
  let raw: string;

  try {
    raw =
      await readFile(
        LEGACY_STORE_PATH,
        "utf8",
      );
  } catch (
    error
  ) {
    const code =
      (
        error as
          NodeJS.ErrnoException
      ).code;

    if (
      code ===
      "ENOENT"
    ) {
      return {
        ...EMPTY_STORE,

        packages: [],
      };
    }

    throw error;
  }

  const normalized =
    raw.replace(
      /^\uFEFF/,
      "",
    );

  let parsed:
    JurisdictionIntelligenceStore;

  try {
    parsed =
      JSON.parse(
        normalized,
      ) as
        JurisdictionIntelligenceStore;
  } catch {
    throw new Error(
      "DueQuity legacy jurisdiction intelligence store contains invalid JSON.",
    );
  }

  if (
    parsed.schemaVersion !==
      1 ||
    !Array.isArray(
      parsed.packages,
    )
  ) {
    throw new Error(
      "DueQuity legacy jurisdiction intelligence store failed schema validation.",
    );
  }

  return parsed;
}

async function writeLegacyStore(
  store:
    JurisdictionIntelligenceStore,
): Promise<void> {
  await mkdir(
    dirname(
      LEGACY_STORE_PATH,
    ),
    {
      recursive:
        true,
    },
  );

  const tempPath =
    `${LEGACY_STORE_PATH}.tmp`;

  const json =
    JSON.stringify(
      store,
      null,
      2,
    );

  await writeFile(
    tempPath,
    json,
    "utf8",
  );

  await rename(
    tempPath,
    LEGACY_STORE_PATH,
  );
}

async function mutateLegacyStore<T>(
  mutation:
    (
      store:
        JurisdictionIntelligenceStore,
    ) =>
      | Promise<T>
      | T,
): Promise<T> {
  let result:
    | T
    | undefined;

  let failure:
    unknown;

  const operation =
    mutationQueue.then(
      async () => {
        try {
          const store =
            await readLegacyStore();

          result =
            await mutation(
              store,
            );

          await writeLegacyStore(
            store,
          );
        } catch (
          error
        ) {
          failure =
            error;
        }
      },
    );

  mutationQueue =
    operation.then(
      () =>
        undefined,
      () =>
        undefined,
    );

  await operation;

  if (
    failure !==
    undefined
  ) {
    throw failure;
  }

  return result as T;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function assertFips(
  stateFips: string,
): void {
  if (
    !/^\d{2}$/.test(
      stateFips,
    )
  ) {
    throw new Error(
      `Invalid state FIPS: ${stateFips}`,
    );
  }
}

function assertCountyGeoid(
  countyGeoid: string,
  stateFips: string,
): void {
  if (
    !/^\d{5}$/.test(
      countyGeoid,
    )
  ) {
    throw new Error(
      `Invalid county GEOID: ${countyGeoid}`,
    );
  }

  if (
    !countyGeoid.startsWith(
      stateFips,
    )
  ) {
    throw new Error(
      `County GEOID ${countyGeoid} does not belong to state FIPS ${stateFips}.`,
    );
  }
}

function validatePaymentRouting(
  paymentRouting:
    JurisdictionPaymentRouting,
  sources:
    JurisdictionAuthoritySource[],
): void {
  const sourceIds =
    new Set(
      sources.map(
        (
          source,
        ) =>
          source.id,
      ),
    );

  for (
    const evidenceSourceId of
    paymentRouting.evidenceSourceIds
  ) {
    if (
      !sourceIds.has(
        evidenceSourceId,
      )
    ) {
      throw new Error(
        `Payment-routing evidence source ${evidenceSourceId} is not present in the jurisdiction package sources.`,
      );
    }
  }

  if (
    paymentRouting.paymentRoute !==
      "unknown" &&
    paymentRouting
      .evidenceSourceIds
      .length ===
      0
  ) {
    throw new Error(
      "A known jurisdiction payment route requires at least one supporting authority source.",
    );
  }

  switch (
    paymentRouting.paymentRoute
  ) {
    case "claimant_only":
      if (
        paymentRouting.launchTrack !==
        "direct_claimant_recovery"
      ) {
        throw new Error(
          "A claimant-only payment route must use the Direct Claimant Recovery launch track.",
        );
      }

      if (
        paymentRouting
          .representativeMayReceivePayment !==
        "no"
      ) {
        throw new Error(
          "A claimant-only payment route must record representativeMayReceivePayment as no.",
        );
      }

      if (
        paymentRouting
          .assignmentRequiredForRepresentativePayment !==
        "no"
      ) {
        throw new Error(
          "A claimant-only launch route must not require assignment of surplus rights.",
        );
      }

      if (
        paymentRouting
          .feeCollectionMethod !==
        "contractual_post_recovery"
      ) {
        throw new Error(
          "A claimant-only payment route must use contractual post-recovery fee collection.",
        );
      }

      break;

    case "authorized_representative":
      if (
        paymentRouting.launchTrack !==
        "managed_representative_recovery"
      ) {
        throw new Error(
          "An authorized-representative payment route must use the Managed Representative Recovery launch track.",
        );
      }

      if (
        paymentRouting
          .representativeMayReceivePayment !==
        "yes"
      ) {
        throw new Error(
          "An authorized-representative route must affirm that the representative may receive payment.",
        );
      }

      if (
        paymentRouting
          .assignmentRequiredForRepresentativePayment !==
        "no"
      ) {
        throw new Error(
          "Managed Representative Recovery cannot require assignment of the claimant's surplus rights.",
        );
      }

      if (
        paymentRouting
          .feeCollectionMethod !==
        "representative_disbursement"
      ) {
        throw new Error(
          "An authorized-representative payment route must use representative disbursement.",
        );
      }

      break;

    case "joint_payee":
      if (
        paymentRouting.launchTrack !==
        "managed_representative_recovery"
      ) {
        throw new Error(
          "A joint-payee route must use the Managed Representative Recovery launch track.",
        );
      }

      if (
        paymentRouting
          .representativeMayReceivePayment !==
        "yes"
      ) {
        throw new Error(
          "A joint-payee route must affirm that the representative may receive payment.",
        );
      }

      if (
        paymentRouting
          .assignmentRequiredForRepresentativePayment !==
        "no"
      ) {
        throw new Error(
          "A launch-supported joint-payee route cannot require assignment of surplus rights.",
        );
      }

      if (
        paymentRouting
          .feeCollectionMethod !==
        "joint_payee_disbursement"
      ) {
        throw new Error(
          "A joint-payee route must use joint-payee disbursement.",
        );
      }

      break;

    case "split_disbursement":
      if (
        paymentRouting.launchTrack !==
        "managed_representative_recovery"
      ) {
        throw new Error(
          "A split-disbursement route must use the Managed Representative Recovery launch track.",
        );
      }

      if (
        paymentRouting
          .representativeMayReceivePayment !==
        "yes"
      ) {
        throw new Error(
          "A split-disbursement route must affirm that the representative may receive payment.",
        );
      }

      if (
        paymentRouting
          .assignmentRequiredForRepresentativePayment !==
        "no"
      ) {
        throw new Error(
          "A launch-supported split-disbursement route cannot require assignment of surplus rights.",
        );
      }

      if (
        paymentRouting
          .feeCollectionMethod !==
        "split_disbursement"
      ) {
        throw new Error(
          "A split-disbursement route must use split disbursement fee collection.",
        );
      }

      break;

    case "assignee":
      if (
        paymentRouting.launchTrack !==
        "future_acquisition"
      ) {
        throw new Error(
          "An assignee payment route belongs only to the future Acquisition Recovery track.",
        );
      }

      if (
        paymentRouting
          .assignmentRequiredForRepresentativePayment !==
        "yes"
      ) {
        throw new Error(
          "An assignee payment route must record that assignment is required.",
        );
      }

      if (
        paymentRouting
          .feeCollectionMethod !==
        "assignment_acquisition"
      ) {
        throw new Error(
          "An assignee payment route must use assignment acquisition as its collection model.",
        );
      }

      break;

    case "unknown":
      if (
        paymentRouting.launchTrack !==
        "blocked"
      ) {
        throw new Error(
          "An unknown payment route must remain blocked.",
        );
      }

      if (
        paymentRouting
          .feeCollectionMethod !==
        "unknown"
      ) {
        throw new Error(
          "An unknown payment route must use an unknown fee collection method.",
        );
      }

      break;
  }
}

function validatePackage(
  rulePackage:
    JurisdictionRulePackage,
): void {
  assertFips(
    rulePackage.stateFips,
  );

  if (
    rulePackage.version <
      1 ||
    !Number.isInteger(
      rulePackage.version,
    )
  ) {
    throw new Error(
      "Jurisdiction rule package version must be a positive integer.",
    );
  }

  if (
    rulePackage.scope ===
    "county"
  ) {
    if (
      !rulePackage.countyGeoid ||
      !rulePackage.countyName
    ) {
      throw new Error(
        "County-scoped jurisdiction rules require county GEOID and county name.",
      );
    }

    assertCountyGeoid(
      rulePackage.countyGeoid,
      rulePackage.stateFips,
    );
  }

  if (
    rulePackage.scope ===
      "state" &&
    (
      rulePackage.countyGeoid ||
      rulePackage.countyName
    )
  ) {
    throw new Error(
      "State-scoped jurisdiction rules must not contain county geography.",
    );
  }

  if (
    rulePackage.rule &&
    rulePackage.rule.state !==
      rulePackage.stateCode
  ) {
    throw new Error(
      "Jurisdiction rule state does not match its intelligence package.",
    );
  }

  if (
    rulePackage.paymentRouting
  ) {
    validatePaymentRouting(
      rulePackage.paymentRouting,
      rulePackage.sources,
    );
  }

  if (
    rulePackage.status ===
    "approved"
  ) {
    if (
      !rulePackage.rule
    ) {
      throw new Error(
        "An approved jurisdiction package must contain a normalized operational rule.",
      );
    }

    if (
      rulePackage.sources.length ===
      0
    ) {
      throw new Error(
        "An approved jurisdiction package must contain at least one authoritative source.",
      );
    }

    if (
      !rulePackage.paymentRouting
    ) {
      throw new Error(
        "An approved jurisdiction package must contain payment and representation routing intelligence.",
      );
    }

    if (
      rulePackage
        .paymentRouting
        .paymentRoute ===
      "unknown"
    ) {
      throw new Error(
        "An approved jurisdiction package cannot have an unknown government payment route.",
      );
    }

    if (
      rulePackage
        .paymentRouting
        .representativeMayFile ===
      "unknown"
    ) {
      throw new Error(
        "An approved jurisdiction package must establish whether an authorized representative may file the claim.",
      );
    }

    if (
      rulePackage
        .paymentRouting
        .assignmentRequiredForRepresentativePayment ===
      "unknown"
    ) {
      throw new Error(
        "An approved jurisdiction package must establish whether representative payment requires assignment of surplus rights.",
      );
    }

    if (
      !rulePackage.approvedByUserId ||
      !rulePackage.approvedAt
    ) {
      throw new Error(
        "An approved jurisdiction package requires final activation approval.",
      );
    }
  }
}

/* ========================================================================== */
/* Canonical row mapping                                                       */
/* ========================================================================== */

function packageFromCanonicalRow(
  row:
    CanonicalJurisdictionRulePackageRow,
): JurisdictionRulePackage {
  if (
    row.scope !==
      "state" &&
    row.scope !==
      "county"
  ) {
    throw new Error(
      `Canonical jurisdiction package ${row.package_id} contains an invalid scope.`,
    );
  }

  if (
    row.status !==
    "approved"
  ) {
    throw new Error(
      `Canonical jurisdiction package ${row.package_id} is not approved.`,
    );
  }

  const sources =
    authoritySourcesFromSnapshot(
      row.sources_snapshot,
    );

  const evidenceSourceIds =
    sources.map(
      (
        source,
      ) =>
        source.id,
    );

  const feeCapPercent =
    optionalFiniteNumber(
      row.fee_cap_percent,
      "Canonical jurisdiction fee-cap percentage",
    );

  const feeCapAmount =
    optionalFiniteNumber(
      row.fee_cap_amount_cents,
      "Canonical jurisdiction fee-cap amount",
    );

  if (
    feeCapAmount !==
      undefined &&
    !Number.isSafeInteger(
      feeCapAmount,
    )
  ) {
    throw new Error(
      "Canonical jurisdiction fee-cap amount exceeds the safe integer range.",
    );
  }

  const agencyAddress =
    row.agency_address ===
    null
      ? undefined
      : requiredObject<
          NonNullable<
            Jurisdiction["agencyAddress"]
          >
        >(
          row.agency_address,
          "Canonical jurisdiction agency address",
        );

  const rule:
    Jurisdiction = {
    id:
      row.jurisdiction_id,

    state:
      row.state_code as
        StateCode,

    stateName:
      row.state_name,

    county:
      row.county_name ??
      undefined,

    agencyName:
      row.agency_name,

    custodian:
      row.custodian as
        Jurisdiction["custodian"],

    agencyWebsite:
      optionalText(
        row.agency_website,
      ),

    agencyPhone:
      optionalText(
        row.agency_phone,
      ),

    agencyAddress,

    claimMethod:
      row.claim_method as
        Jurisdiction["claimMethod"],

    claimFormUrl:
      optionalText(
        row.claim_form_url,
      ),

    requiredDocuments:
      stringArray(
        row.required_documents,
        "Canonical jurisdiction required documents",
      ) as
        Jurisdiction["requiredDocuments"],

    claimDeadlineDays:
      optionalNonNegativeInteger(
        row.claim_deadline_days,
        "Canonical jurisdiction claim deadline",
      ),

    statuteReference:
      optionalText(
        row.statute_reference,
      ),

    permittedFeeModels:
      stringArray(
        row.permitted_fee_models,
        "Canonical jurisdiction permitted fee models",
      ) as
        Jurisdiction["permittedFeeModels"],

    feeCapPercent,

    feeCapAmount:
      feeCapAmount as
        Jurisdiction["feeCapAmount"],

    assignmentPermitted:
      Boolean(
        row.assignment_permitted,
      ),

    powerOfAttorneyAccepted:
      Boolean(
        row.power_of_attorney_accepted,
      ),

    finderLicenseRequired:
      Boolean(
        row.finder_license_required,
      ),

    bondRequired:
      Boolean(
        row.bond_required,
      ),

    attorneyRequired:
      Boolean(
        row.attorney_required,
      ),

    mandatoryContractLanguage:
      stringArray(
        row.mandatory_contract_language,
        "Canonical jurisdiction mandatory contract language",
      ),

    cancellationPeriodDays:
      optionalNonNegativeInteger(
        row.cancellation_period_days,
        "Canonical jurisdiction cancellation period",
      ),

    paymentRoutingNote:
      optionalText(
        row.payment_routing_note,
      ),

    probateRequiredWhenDeceased:
      Boolean(
        row.probate_required_when_deceased,
      ),

    complianceStatus:
      row.compliance_status as
        Jurisdiction["complianceStatus"],

    lastLegalReview:
      row.last_legal_review
        ? (
            row.last_legal_review as
              Jurisdiction["lastLegalReview"]
          )
        : undefined,

    reviewedBy:
      optionalText(
        row.approved_by_name,
      ),

    internalNotes:
      optionalText(
        row.internal_notes,
      ),

    legalRuleVersion:
      positiveInteger(
        row.legal_rule_version,
        "Canonical jurisdiction legal-rule version",
      ),

    legalRuleEffectiveFrom:
      row.legal_rule_effective_from
        ? (
            row.legal_rule_effective_from as
              Jurisdiction["legalRuleEffectiveFrom"]
          )
        : undefined,

    legalRuleEffectiveThrough:
      row.legal_rule_effective_through
        ? (
            row.legal_rule_effective_through as
              Jurisdiction["legalRuleEffectiveThrough"]
          )
        : undefined,

    legalReviewDueAt:
      row.legal_review_due_at
        ? (
            row.legal_review_due_at as
              Jurisdiction["legalReviewDueAt"]
          )
        : undefined,

    legalSourceUrls:
      sources.map(
        (
          source,
        ) =>
          source.url,
      ),

    legalApprovedByUserId:
      row.approved_by_user_id,

    legalApprovedAt:
      row.approved_at as
        Jurisdiction["legalApprovedAt"],

    legalProcessingRule:
      row.legal_processing_rule as
        Jurisdiction["legalProcessingRule"],
  };

  const paymentRouting:
    JurisdictionPaymentRouting = {
    paymentRoute:
      row.payment_route as
        JurisdictionPaymentRoute,

    launchTrack:
      row.payment_launch_track as
        DuequityLaunchPaymentTrack,

    representativeMayFile:
      row.representative_may_file as
        JurisdictionYesNoUnknown,

    representativeMayReceivePayment:
      row.representative_may_receive_payment as
        JurisdictionYesNoUnknown,

    assignmentRequiredForRepresentativePayment:
      row.assignment_required_for_representative_payment as
        JurisdictionYesNoUnknown,

    feeCollectionMethod:
      row.fee_collection_method as
        JurisdictionFeeCollectionMethod,

    /*
     * The canonical Stage 2 table persists the complete approved source
     * snapshot but does not store a separate payment-evidence-id array.
     *
     * The canonical approved source set therefore becomes the source-backed
     * evidence set for the normalized payment-routing read model.
     */
    evidenceSourceIds,

    notes:
      optionalText(
        row.payment_routing_note,
      ),
  };

  const rulePackage:
    JurisdictionRulePackage = {
    id:
      row.package_id,

    version:
      positiveInteger(
        row.version,
        "Canonical jurisdiction package version",
      ),

    scope:
      row.scope,

    stateFips:
      row.state_fips,

    stateCode:
      row.state_code as
        StateCode,

    stateName:
      row.state_name,

    countyGeoid:
      row.county_geoid ??
      undefined,

    countyName:
      row.county_name ??
      undefined,

    saleType:
      row.sale_type as
        SaleType,

    status:
      "approved",

    sources,

    rule,

    paymentRouting,

    intakeAuthorized:
      Boolean(
        row.intake_authorized,
      ),

    approvedByUserId:
      row.approved_by_user_id,

    approvedAt:
      row.approved_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };

  validatePackage(
    rulePackage,
  );

  return rulePackage;
}

/* ========================================================================== */
/* Payment-route operational evaluation                                        */
/* ========================================================================== */

export interface JurisdictionPaymentRouteEvaluation {
  ready: boolean;

  launchTrack:
    DuequityLaunchPaymentTrack;

  reason: string;
}

export function evaluateJurisdictionPaymentRouting(
  paymentRouting:
    JurisdictionPaymentRouting
    | undefined,
): JurisdictionPaymentRouteEvaluation {
  if (
    !paymentRouting
  ) {
    return {
      ready:
        false,

      launchTrack:
        "blocked",

      reason:
        "No payment and representation routing intelligence has been recorded for this jurisdiction.",
    };
  }

  if (
    paymentRouting.paymentRoute ===
    "unknown"
  ) {
    return {
      ready:
        false,

      launchTrack:
        "blocked",

      reason:
        "The government payment route has not yet been verified.",
    };
  }

  if (
    paymentRouting.representativeMayFile ===
    "unknown"
  ) {
    return {
      ready:
        false,

      launchTrack:
        paymentRouting.launchTrack,

      reason:
        "DueQuity has not yet established whether an authorized representative may submit the recovery claim.",
    };
  }

  if (
    paymentRouting
      .assignmentRequiredForRepresentativePayment ===
    "unknown"
  ) {
    return {
      ready:
        false,

      launchTrack:
        paymentRouting.launchTrack,

      reason:
        "DueQuity has not yet established whether representative payment requires assignment of the claimant's surplus rights.",
    };
  }

  if (
    paymentRouting.paymentRoute ===
      "assignee" ||
    paymentRouting.launchTrack ===
      "future_acquisition" ||
    paymentRouting
      .assignmentRequiredForRepresentativePayment ===
      "yes"
  ) {
    return {
      ready:
        false,

      launchTrack:
        "future_acquisition",

      reason:
        "This payment structure requires acquisition or assignment of surplus rights. Acquisition Recovery is intentionally disabled for the DueQuity launch model.",
    };
  }

  if (
    paymentRouting.paymentRoute ===
    "claimant_only"
  ) {
    return {
      ready:
        true,

      launchTrack:
        "direct_claimant_recovery",

      reason:
        "The government pays the lawful claimant or estate representative directly. DueQuity may use the Direct Claimant Recovery track with a properly executed service-fee agreement.",
    };
  }

  if (
    paymentRouting.paymentRoute ===
      "authorized_representative" ||
    paymentRouting.paymentRoute ===
      "joint_payee" ||
    paymentRouting.paymentRoute ===
      "split_disbursement"
  ) {
    if (
      paymentRouting
        .representativeMayReceivePayment !==
      "yes"
    ) {
      return {
        ready:
          false,

        launchTrack:
          paymentRouting.launchTrack,

        reason:
          "The selected managed-representative route does not yet establish that DueQuity may lawfully receive or participate in the payment.",
      };
    }

    return {
      ready:
        true,

      launchTrack:
        "managed_representative_recovery",

      reason:
        "The jurisdiction supports a source-backed Managed Representative Recovery payment route without requiring DueQuity to acquire the claimant's surplus rights.",
    };
  }

  return {
    ready:
      false,

    launchTrack:
      "blocked",

    reason:
      "The jurisdiction payment structure is not supported by the current DueQuity launch model.",
  };
}

/* ========================================================================== */
/* Key                                                                         */
/* ========================================================================== */

export function jurisdictionRuleKey({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid?: string;

  saleType: SaleType;
}): string {
  return [
    stateFips,
    countyGeoid ??
      "STATE",
    saleType,
  ].join(
    ":",
  );
}

/* ========================================================================== */
/* Canonical production reads                                                  */
/* ========================================================================== */

/**
 * Return one current canonical package per package_id.
 *
 * Canonical history may contain multiple versions of the same package id.
 * Operational resolution must use the highest published version rather than
 * treating historical versions as competing current packages.
 */
export async function listJurisdictionRulePackages(): Promise<
  JurisdictionRulePackage[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "jurisdiction_rule_packages",
      )
      .select(
        "*",
      )
      .order(
        "package_id",
        {
          ascending:
            true,
        },
      )
      .order(
        "version",
        {
          ascending:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to read canonical jurisdiction rule packages: ${error.message}`,
    );
  }

  const latestByPackageId =
    new Map<
      string,
      JurisdictionRulePackage
    >();

  for (
    const rawRow of
    data ??
    []
  ) {
    const row =
      rawRow as unknown as
        CanonicalJurisdictionRulePackageRow;

    if (
      latestByPackageId.has(
        row.package_id,
      )
    ) {
      continue;
    }

    latestByPackageId.set(
      row.package_id,
      packageFromCanonicalRow(
        row,
      ),
    );
  }

  return [
    ...latestByPackageId.values(),
  ];
}

export async function getJurisdictionRulePackage(
  id: string,
): Promise<
  JurisdictionRulePackage
  | undefined
> {
  const normalizedId =
    id.trim();

  if (
    !normalizedId
  ) {
    return undefined;
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "jurisdiction_rule_packages",
      )
      .select(
        "*",
      )
      .eq(
        "package_id",
        normalizedId,
      )
      .order(
        "version",
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to read canonical jurisdiction rule package: ${error.message}`,
    );
  }

  return data
    ? packageFromCanonicalRow(
        data as unknown as
          CanonicalJurisdictionRulePackageRow,
      )
    : undefined;
}

/* ========================================================================== */
/* Legacy compatibility write                                                  */
/* ========================================================================== */

/**
 * Compatibility mirror for the historical local jurisdiction review workflow.
 *
 * IMPORTANT:
 *
 * This function is not the canonical production publication authority.
 *
 * Stage 2 canonical publication is performed by the controlled Supabase
 * jurisdiction publication workflow.
 *
 * Production reads never depend on this local JSON mirror.
 */
export async function upsertJurisdictionRulePackage(
  rulePackage:
    JurisdictionRulePackage,
): Promise<
  JurisdictionRulePackage
> {
  validatePackage(
    rulePackage,
  );

  return mutateLegacyStore(
    (
      store,
    ) => {
      const existingIndex =
        store.packages.findIndex(
          (
            existing,
          ) =>
            existing.id ===
            rulePackage.id,
        );

      if (
        existingIndex >=
        0
      ) {
        store.packages[
          existingIndex
        ] =
          rulePackage;
      } else {
        store.packages.push(
          rulePackage,
        );
      }

      return rulePackage;
    },
  );
}

/* ========================================================================== */
/* Resolution                                                                  */
/* ========================================================================== */

export interface JurisdictionRuleResolution {
  status:
    JurisdictionIntelligenceStatus;

  intakeAllowed: boolean;

  paymentRouteReady: boolean;

  launchPaymentTrack:
    DuequityLaunchPaymentTrack;

  paymentRouting?:
    JurisdictionPaymentRouting;

  sourceScope:
    | "county"
    | "state"
    | "none";

  inheritedFromState: boolean;

  packageId?: string;

  packageVersion?: number;

  rule?: Jurisdiction;

  sources:
    JurisdictionAuthoritySource[];

  reason: string;
}

function resolutionFromPackage(
  rulePackage:
    JurisdictionRulePackage,
): JurisdictionRuleResolution {
  const paymentEvaluation =
    evaluateJurisdictionPaymentRouting(
      rulePackage.paymentRouting,
    );

  if (
    rulePackage.status !==
      "approved" ||
    !rulePackage.rule
  ) {
    return {
      status:
        rulePackage.status,

      intakeAllowed:
        false,

      paymentRouteReady:
        paymentEvaluation.ready,

      launchPaymentTrack:
        paymentEvaluation.launchTrack,

      paymentRouting:
        rulePackage.paymentRouting,

      sourceScope:
        rulePackage.scope,

      inheritedFromState:
        rulePackage.scope ===
        "state",

      packageId:
        rulePackage.id,

      packageVersion:
        rulePackage.version,

      sources:
        rulePackage.sources,

      reason:
        rulePackage.conflictReason ??
        rulePackage.reviewReason ??
        "This jurisdiction rule has not been approved for live operation.",
    };
  }

  const complianceStatus =
    rulePackage
      .rule
      .complianceStatus;

  const canonicalIntakeAuthorized =
    rulePackage.intakeAuthorized !==
    false;

  const legalIntakeAllowed =
    complianceStatus ===
      "approved" &&
    canonicalIntakeAuthorized;

  const intakeAllowed =
    legalIntakeAllowed &&
    paymentEvaluation.ready;

  let reason:
    string;

  if (
    !canonicalIntakeAuthorized
  ) {
    reason =
      "The canonical jurisdiction package is published, but operational intake authorization is closed. DueQuity must not activate claimant intake until the canonical Stage 2 package records intake_authorized as true.";
  } else {
    switch (
      complianceStatus
    ) {
      case "approved":
        if (
          !paymentEvaluation.ready
        ) {
          reason =
            `The jurisdiction legal rule is approved, but live intake remains closed because the payment and representation route is not operationally cleared. ${paymentEvaluation.reason}`;
        } else if (
          paymentEvaluation.launchTrack ===
          "direct_claimant_recovery"
        ) {
          reason =
            rulePackage.scope ===
            "county"
              ? "Approved county-specific legal rule and Direct Claimant Recovery payment route resolved. Administrative intake is cleared subject to the recorded rule, claimant verification, executed service agreement, and case-level compliance checks."
              : "Approved statewide legal rule and Direct Claimant Recovery payment route resolved. Administrative intake is cleared subject to the recorded rule, claimant verification, executed service agreement, and case-level compliance checks.";
        } else {
          reason =
            rulePackage.scope ===
            "county"
              ? "Approved county-specific legal rule and Managed Representative Recovery payment route resolved. Administrative intake is cleared subject to the recorded authorization, claimant verification, executed service agreement, and case-level compliance checks."
              : "Approved statewide legal rule and Managed Representative Recovery payment route resolved. Administrative intake is cleared subject to the recorded authorization, claimant verification, executed service agreement, and case-level compliance checks.";
        }

        break;

      case "attorney_only":
        reason =
          "The jurisdiction requires an attorney workflow. DueQuity's startup Green Lane is limited to straightforward administrative recoveries, so live intake remains closed.";

        break;

      case "restricted":
        reason =
          "The approved legal review records this jurisdiction as restricted. Intake remains closed.";

        break;

      case "paused":
        reason =
          "The approved jurisdiction rule is currently paused. Intake remains closed until the pause is lifted through a new reviewed rule version.";

        break;

      case "research_required":
        reason =
          "The approved package records unresolved legal research requirements. Intake remains closed.";

        break;

      case "under_legal_review":
        reason =
          "The approved package records that legal review is still required. Intake remains closed.";

        break;
    }
  }

  return {
    status:
      "approved",

    intakeAllowed,

    paymentRouteReady:
      paymentEvaluation.ready,

    launchPaymentTrack:
      paymentEvaluation.launchTrack,

    paymentRouting:
      rulePackage.paymentRouting,

    sourceScope:
      rulePackage.scope,

    inheritedFromState:
      rulePackage.scope ===
      "state",

    packageId:
      rulePackage.id,

    packageVersion:
      rulePackage.version,

    rule:
      rulePackage.rule,

    sources:
      rulePackage.sources,

    reason,
  };
}

export async function resolveJurisdictionRule({
  stateFips,
  countyGeoid,
  saleType,
}: {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}): Promise<
  JurisdictionRuleResolution
> {
  assertFips(
    stateFips,
  );

  assertCountyGeoid(
    countyGeoid,
    stateFips,
  );

  const packages =
    await listJurisdictionRulePackages();

  const countyMatches =
    packages.filter(
      (
        rulePackage,
      ) =>
        rulePackage.scope ===
          "county" &&
        rulePackage.stateFips ===
          stateFips &&
        rulePackage.countyGeoid ===
          countyGeoid &&
        rulePackage.saleType ===
          saleType,
    );

  if (
    countyMatches.length >
    1
  ) {
    return {
      status:
        "conflict",

      intakeAllowed:
        false,

      paymentRouteReady:
        false,

      launchPaymentTrack:
        "blocked",

      sourceScope:
        "county",

      inheritedFromState:
        false,

      sources:
        countyMatches.flatMap(
          (
            rulePackage,
          ) =>
            rulePackage.sources,
        ),

      reason:
        "Multiple current county rule packages exist for the same GEOID and sale type. Review is required.",
    };
  }

  if (
    countyMatches.length ===
    1
  ) {
    return resolutionFromPackage(
      countyMatches[0],
    );
  }

  const stateMatches =
    packages.filter(
      (
        rulePackage,
      ) =>
        rulePackage.scope ===
          "state" &&
        rulePackage.stateFips ===
          stateFips &&
        rulePackage.saleType ===
          saleType,
    );

  if (
    stateMatches.length >
    1
  ) {
    return {
      status:
        "conflict",

      intakeAllowed:
        false,

      paymentRouteReady:
        false,

      launchPaymentTrack:
        "blocked",

      sourceScope:
        "state",

      inheritedFromState:
        true,

      sources:
        stateMatches.flatMap(
          (
            rulePackage,
          ) =>
            rulePackage.sources,
        ),

      reason:
        "Multiple current statewide rule packages exist for the same state and sale type. Review is required.",
    };
  }

  if (
    stateMatches.length ===
    1
  ) {
    return resolutionFromPackage(
      stateMatches[0],
    );
  }

  return {
    status:
      "unverified",

    intakeAllowed:
      false,

    paymentRouteReady:
      false,

    launchPaymentTrack:
      "blocked",

    sourceScope:
      "none",

    inheritedFromState:
      false,

    sources:
      [],

    reason:
      "No verified canonical jurisdiction rule package exists for this county and sale type. DueQuity must research and approve the legal, representation, fee, and payment-routing requirements before live intake.",
  };
}

/* ========================================================================== */
/* Address + sale type                                                         */
/* ========================================================================== */

export interface AddressJurisdictionIntelligence {
  geography:
    ResolvedAddressGeography;

  saleType:
    SaleType;

  jurisdiction:
    JurisdictionRuleResolution;
}

export async function resolveAddressJurisdictionIntelligence(
  address:
    string,
  saleType:
    SaleType,
): Promise<
  AddressJurisdictionIntelligence
> {
  const geography =
    await resolveAddressGeography(
      address,
    );

  const jurisdiction =
    await resolveJurisdictionRule({
      stateFips:
        geography
          .state
          .stateFips,

      countyGeoid:
        geography
          .county
          .geoid,

      saleType,
    });

  return {
    geography,

    saleType,

    jurisdiction,
  };
}