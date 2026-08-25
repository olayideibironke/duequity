import "server-only";

import type {
  StaffSession,
} from "@/lib/session";

import {
  getClaimantOnboarding,
  staffCanAccessClaimantOnboarding,
} from "@/server/claimant-onboarding-store";

import {
  getOpportunityConversion,
} from "@/server/opportunity-conversion-store";

/**
 * OPPORTUNITY STAFF ACCESS
 *
 * Opportunities remain part of the shared research / pre-claim pipeline until
 * they become tied to a claimant-owned Claim.
 *
 * Once claimant onboarding exists:
 *
 *   Super Admin
 *     -> may access the converted Opportunity
 *
 *   ordinary staff
 *     -> may access it only when the claimant is currently assigned to them
 *
 * This prevents a converted Opportunity from becoming a side door around the
 * Stage 16 Claimant / Claim ownership boundary.
 *
 * Claimant ownership is not inferred from:
 *
 *   - opportunity.assignedToUserId
 *   - commercial quote approver
 *   - conversion actor
 *   - created_by_user_id
 *
 * The authoritative operational ownership record is claimant_onboarding:
 *
 *   originating_staff_user_id
 *   assigned_staff_user_id
 */

type PersistedOpportunityConversion =
  NonNullable<
    Awaited<
      ReturnType<
        typeof getOpportunityConversion
      >
    >
  >;

export interface OpportunityStaffAccessResult {
  accessible: boolean;

  claimantLinked: boolean;

  claimId?: string;

  conversion?: PersistedOpportunityConversion;
}

export async function staffCanAccessClaimantOwnedClaim(
  session:
    StaffSession,
  claimId:
    string,
): Promise<boolean> {
  const normalized =
    claimId.trim();

  if (!normalized) {
    return false;
  }

  const onboarding =
    await getClaimantOnboarding(
      normalized,
    );

  /*
   * A Claim may exist immediately after conversion but before claimant
   * onboarding begins.
   *
   * Stage 16 business ownership begins when the claimant record exists.
   * Until that point, the Opportunity remains within the pre-claim operational
   * workflow and existing role / state-clearance controls continue to apply.
   */
  if (!onboarding) {
    return true;
  }

  return staffCanAccessClaimantOnboarding(
    session,
    onboarding,
  );
}

export async function resolveOpportunityStaffAccess(
  session:
    StaffSession,
  input: {
    opportunityId: string;

    convertedClaimId?: string;
  },
): Promise<
  OpportunityStaffAccessResult
> {
  const opportunityId =
    input.opportunityId.trim();

  if (!opportunityId) {
    return {
      accessible:
        false,

      claimantLinked:
        false,
    };
  }

  const conversion =
    await getOpportunityConversion(
      opportunityId,
    );

  const claimId =
    conversion?.claimId ??
    input.convertedClaimId?.trim() ??
    undefined;

  if (!claimId) {
    return {
      accessible:
        true,

      claimantLinked:
        false,

      conversion:
        conversion ??
        undefined,
    };
  }

  const onboarding =
    await getClaimantOnboarding(
      claimId,
    );

  if (!onboarding) {
    return {
      accessible:
        true,

      claimantLinked:
        false,

      claimId,

      conversion:
        conversion ??
        undefined,
    };
  }

  return {
    accessible:
      staffCanAccessClaimantOnboarding(
        session,
        onboarding,
      ),

    claimantLinked:
      true,

    claimId,

    conversion:
      conversion ??
      undefined,
  };
}