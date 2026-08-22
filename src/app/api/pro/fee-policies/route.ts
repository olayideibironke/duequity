import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  validateCommercialFeePolicy,
} from "@/domain/commercial-pricing";

import type {
  CommercialFeePolicy,
  IsoDate,
  IsoInstant,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  approveCommercialFeePolicy,
  getCommercialFeePolicyById,
  saveCommercialFeePolicyDraft,
} from "@/server/commercial-fee-policy-store";

import {
  listJurisdictionRulePackages,
} from "@/server/jurisdiction-intelligence";

import {
  resolveStaffSession,
} from "@/server/staff-session";

/**
 * COMMERCIAL FEE POLICY GOVERNANCE API
 *
 * POST actions:
 *
 *   save_draft
 *     Saves a commercial fee policy draft after validating it against
 *     the currently approved jurisdiction rule.
 *
 *   approve
 *     Performs the separate human approval step for an existing draft.
 *
 * Safety boundaries:
 *
 *   - staff authentication required
 *   - fee_policy.write required to save drafts
 *   - fee_policy.approve required to approve
 *   - staff state clearance enforced
 *   - an approved jurisdiction rule must already exist
 *   - policy terms must pass the commercial pricing validator
 *   - this route does not create quotes
 *   - this route does not create opportunities or claims
 *   - this route does not authorize claimant outreach
 */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Runtime vocabulary                                                          */
/* ========================================================================== */

const FEE_MODELS = new Set<string>([
  "flat",
  "percentage",
  "capped_success",
  "no_fee",
]);

const SALE_TYPES = new Set<string>([
  "judicial_foreclosure",
  "nonjudicial_foreclosure",
  "sheriff_sale",
  "trustee_sale",
  "tax_deed_sale",
  "tax_lien_foreclosure",
  "hoa_foreclosure",
  "municipal_lien_foreclosure",
  "partition_sale",
]);

const CUSTODIANS = new Set<string>([
  "county_treasurer",
  "county_tax_collector",
  "clerk_of_court",
  "circuit_court",
  "sheriff",
  "trustee",
  "municipality",
  "state_unclaimed_property",
  "escrow_agent",
  "unknown",
]);

/* ========================================================================== */
/* Responses                                                                   */
/* ========================================================================== */

function errorResponse(
  message: string,
  status: number,
  detail?: unknown,
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(detail !== undefined
        ? {
            detail,
          }
        : {}),
    },
    {
      status,

      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function successResponse(
  body: unknown,
) {
  return NextResponse.json(
    body,
    {
      status: 200,

      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

/* ========================================================================== */
/* General validation                                                          */
/* ========================================================================== */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isIsoDate(
  value: unknown,
): value is IsoDate {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  );
}

function optionalIsoDate(
  value: unknown,
  label: string,
): IsoDate | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  if (!isIsoDate(value)) {
    throw new Error(
      `${label} must be an ISO date in YYYY-MM-DD format.`,
    );
  }

  return value;
}

function currentIsoDate(): IsoDate {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function currentIsoInstant(): IsoInstant {
  return new Date()
    .toISOString();
}

/* ========================================================================== */
/* Commercial policy request validation                                        */
/* ========================================================================== */

function validateStringScope(
  value: unknown,
  allowed: Set<string>,
  label: string,
): void {
  if (value === undefined) {
    return;
  }

  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        !allowed.has(entry),
    )
  ) {
    throw new Error(
      `${label} contains an unsupported value.`,
    );
  }
}

function parseDraftPolicy(
  value: unknown,
): CommercialFeePolicy {
  if (!isRecord(value)) {
    throw new Error(
      "policy must be an object.",
    );
  }

  if (
    typeof value.id !== "string" ||
    !value.id.trim()
  ) {
    throw new Error(
      "Commercial fee policy id is required.",
    );
  }

  if (
    typeof value.jurisdictionId !== "string" ||
    !value.jurisdictionId.trim()
  ) {
    throw new Error(
      "Commercial fee policy jurisdiction id is required.",
    );
  }

  if (value.status !== "draft") {
    throw new Error(
      "New commercial fee policies must enter through draft status.",
    );
  }

  if (
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1
  ) {
    throw new Error(
      "Commercial fee policy version must be a positive integer.",
    );
  }

  if (!isIsoDate(value.effectiveFrom)) {
    throw new Error(
      "Commercial fee policy effectiveFrom must be an ISO date.",
    );
  }

  if (
    value.effectiveThrough !== undefined &&
    !isIsoDate(value.effectiveThrough)
  ) {
    throw new Error(
      "Commercial fee policy effectiveThrough must be an ISO date.",
    );
  }

  validateStringScope(
    value.saleTypes,
    SALE_TYPES,
    "saleTypes",
  );

  validateStringScope(
    value.custodians,
    CUSTODIANS,
    "custodians",
  );

  if (
    !Array.isArray(value.tiers) ||
    value.tiers.length === 0
  ) {
    throw new Error(
      "Commercial fee policy must contain at least one recovery tier.",
    );
  }

  for (
    const [
      index,
      tier,
    ] of value.tiers.entries()
  ) {
    if (!isRecord(tier)) {
      throw new Error(
        `Recovery tier ${index + 1} must be an object.`,
      );
    }

    if (
      typeof tier.id !== "string" ||
      !tier.id.trim()
    ) {
      throw new Error(
        `Recovery tier ${index + 1} requires an id.`,
      );
    }

    if (
      typeof tier.label !== "string" ||
      !tier.label.trim()
    ) {
      throw new Error(
        `Recovery tier ${index + 1} requires a label.`,
      );
    }

    if (
      typeof tier.minimumRecovery !== "number"
    ) {
      throw new Error(
        `Recovery tier ${index + 1} requires minimumRecovery.`,
      );
    }

    if (
      tier.maximumRecovery !== undefined &&
      typeof tier.maximumRecovery !== "number"
    ) {
      throw new Error(
        `Recovery tier ${index + 1} has an invalid maximumRecovery.`,
      );
    }

    if (
      typeof tier.model !== "string" ||
      !FEE_MODELS.has(tier.model)
    ) {
      throw new Error(
        `Recovery tier ${index + 1} has an unsupported fee model.`,
      );
    }

    if (
      typeof tier.active !== "boolean"
    ) {
      throw new Error(
        `Recovery tier ${index + 1} requires an active boolean.`,
      );
    }
  }

  return value as unknown as CommercialFeePolicy;
}

/* ========================================================================== */
/* Jurisdiction resolution                                                     */
/* ========================================================================== */

async function resolveApprovedJurisdiction(
  jurisdictionId: string,
) {
  const packages =
    await listJurisdictionRulePackages();

  const approved =
    packages
      .filter(
        (rulePackage) =>
          rulePackage.status === "approved" &&
          rulePackage.rule?.id === jurisdictionId,
      )
      .slice()
      .sort(
        (left, right) =>
          right.version - left.version,
      )[0];

  if (
    !approved ||
    !approved.rule
  ) {
    return undefined;
  }

  return {
    package: approved,
    jurisdiction: approved.rule,
  };
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return errorResponse(
      "Request body must be valid JSON.",
      400,
    );
  }

  if (!isRecord(body)) {
    return errorResponse(
      "Request body must be an object.",
      400,
    );
  }

  const action =
    body.action;

  /* ======================================================================== */
  /* Save draft                                                                */
  /* ======================================================================== */

  if (action === "save_draft") {
    if (
      !can(
        session,
        "fee_policy.write",
      )
    ) {
      return errorResponse(
        "You do not have permission to create or update commercial fee policies.",
        403,
      );
    }

    let policy: CommercialFeePolicy;

    try {
      policy =
        parseDraftPolicy(
          body.policy,
        );
    } catch (error) {
      return errorResponse(
        error instanceof Error
          ? error.message
          : "Commercial fee policy request is invalid.",
        400,
      );
    }

    try {
      const resolved =
        await resolveApprovedJurisdiction(
          policy.jurisdictionId,
        );

      if (!resolved) {
        return errorResponse(
          "No current approved jurisdiction rule exists for this commercial fee policy.",
          409,
        );
      }

      const {
        jurisdiction,
      } = resolved;

      if (
        !clearedForState(
          session,
          jurisdiction.state,
        )
      ) {
        return errorResponse(
          `You are not cleared to manage commercial pricing in ${jurisdiction.state}.`,
          403,
        );
      }

      /*
       * validateCommercialFeePolicy requires approved status because only
       * approved policies may produce quotes. For draft validation, create an
       * in-memory candidate representing what this exact draft would look like
       * if approved. Nothing is persisted as approved here.
       */
      const approvalCandidate: CommercialFeePolicy =
        {
          ...policy,
          status: "approved",
        };

      const validation =
        validateCommercialFeePolicy(
          approvalCandidate,
          jurisdiction,
          policy.effectiveFrom,
        );

      if (!validation.valid) {
        return errorResponse(
          "Commercial fee policy failed jurisdiction and pricing validation.",
          400,
          validation,
        );
      }

      const saved =
        await saveCommercialFeePolicyDraft({
          policy,
        });

      return successResponse({
        ok: true,

        action: "save_draft",

        policy: saved,

        validation,

        operationalEffects: {
          policyApproved: false,
          quoteCreated: false,
          opportunityConverted: false,
          claimCreated: false,
          outreachAuthorized: false,
        },
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error
          ? error.message
          : "Commercial fee policy draft could not be saved.",
        400,
      );
    }
  }

  /* ======================================================================== */
  /* Approve                                                                   */
  /* ======================================================================== */

  if (action === "approve") {
    if (
      !can(
        session,
        "fee_policy.approve",
      )
    ) {
      return errorResponse(
        "You do not have permission to approve commercial fee policies.",
        403,
      );
    }

    const policyId =
      typeof body.policyId === "string"
        ? body.policyId.trim()
        : "";

    if (!policyId) {
      return errorResponse(
        "policyId is required.",
        400,
      );
    }

    let reviewedOn: IsoDate | undefined;
    let reviewDueAt: IsoDate | undefined;

    try {
      reviewedOn =
        optionalIsoDate(
          body.reviewedOn,
          "reviewedOn",
        );

      reviewDueAt =
        optionalIsoDate(
          body.reviewDueAt,
          "reviewDueAt",
        );
    } catch (error) {
      return errorResponse(
        error instanceof Error
          ? error.message
          : "Commercial fee policy approval request is invalid.",
        400,
      );
    }

    try {
      const current =
        await getCommercialFeePolicyById(
          policyId,
        );

      if (!current) {
        return errorResponse(
          "Commercial fee policy not found.",
          404,
        );
      }

      const resolved =
        await resolveApprovedJurisdiction(
          current.jurisdictionId,
        );

      if (!resolved) {
        return errorResponse(
          "No current approved jurisdiction rule exists for this commercial fee policy.",
          409,
        );
      }

      const {
        jurisdiction,
      } = resolved;

      if (
        !clearedForState(
          session,
          jurisdiction.state,
        )
      ) {
        return errorResponse(
          `You are not cleared to approve commercial pricing in ${jurisdiction.state}.`,
          403,
        );
      }

      const today =
        currentIsoDate();

      const approvalCandidate: CommercialFeePolicy =
        {
          ...current,
          status: "approved",
          approvedByUserId:
            session.user.id,
          approvedAt:
            currentIsoInstant(),
          lastReviewedAt:
            reviewedOn ??
            current.lastReviewedAt ??
            today,
          reviewDueAt:
            reviewDueAt ??
            current.reviewDueAt,
        };

      const validation =
        validateCommercialFeePolicy(
          approvalCandidate,
          jurisdiction,
          today,
        );

      if (!validation.valid) {
        return errorResponse(
          "Commercial fee policy cannot be approved under the current jurisdiction rule.",
          409,
          validation,
        );
      }

      const approved =
        await approveCommercialFeePolicy({
          policyId,

          actorUserId:
            session.user.id,

          approvedAt:
            currentIsoInstant(),

          reviewedOn:
            reviewedOn ??
            today,

          reviewDueAt,
        });

      return successResponse({
        ok: true,

        action: "approve",

        policy: approved,

        validation,

        operationalEffects: {
          policyApproved: true,
          quoteCreated: false,
          opportunityConverted: false,
          claimCreated: false,
          outreachAuthorized: false,
        },
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error
          ? error.message
          : "Commercial fee policy approval failed.",
        400,
      );
    }
  }

  return errorResponse(
    "Unsupported commercial fee policy action.",
    400,
  );
}