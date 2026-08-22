import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CONTACT_CONFIDENCE,
  OWNER_LOCATED_STATUS,
} from "@/domain/status";

import type {
  Opportunity,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  getOpportunityById,
  getPropertyById,
} from "@/server/opportunity-store";

import { resolveStaffSession } from "@/server/staff-session";

import { getSupabaseAdmin } from "@/server/supabase-admin";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/**
 * OPPORTUNITY OWNER STATUS
 *
 * Records the result of owner-locating work against the existing Opportunity.
 *
 * This endpoint does not:
 *
 * - create a claimant
 * - invent contact information
 * - record consent
 * - verify identity
 * - start claimant onboarding
 *
 * It updates only the existing owner-located and contact-confidence fields.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface OwnerStatusRequestBody {
  ownerLocated?: string;

  contactConfidence?: string;
}

interface OpportunityVersionRow {
  row_version: number | string;
}

/* ========================================================================== */
/* Responses                                                                   */
/* ========================================================================== */

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      ok: false,

      error: message,
    },
    {
      status,
    },
  );
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function isOwnerLocatedStatus(
  value: string,
): value is Opportunity["ownerLocated"] {
  return Object.prototype.hasOwnProperty.call(
    OWNER_LOCATED_STATUS,
    value,
  );
}

function isContactConfidence(
  value: string,
): value is Opportunity["contactConfidence"] {
  return Object.prototype.hasOwnProperty.call(
    CONTACT_CONFIDENCE,
    value,
  );
}

function databaseRowVersion(
  value: number | string,
): number {
  const version =
    Number(value);

  if (
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new Error(
      "Opportunity has an invalid database row version.",
    );
  }

  return version;
}

function currentIsoDate(): string {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      opportunityId: string;
    }>;
  },
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  if (
    !can(
      session,
      "opportunity.read",
    )
  ) {
    return errorResponse(
      "You do not have permission to read Opportunities.",
      403,
    );
  }

  if (
    !can(
      session,
      "opportunity.write",
    )
  ) {
    return errorResponse(
      "You do not have permission to update Opportunity owner research.",
      403,
    );
  }

  const {
    opportunityId,
  } =
    await context.params;

  const opportunity =
    await getOpportunityById(
      opportunityId,
    );

  if (!opportunity) {
    return errorResponse(
      "Opportunity not found.",
      404,
    );
  }

  const property =
    await getPropertyById(
      opportunity.propertyId,
    );

  if (!property) {
    return errorResponse(
      "Opportunity property could not be resolved.",
      409,
    );
  }

  if (
    !clearedForState(
      session,
      property.address.state,
    )
  ) {
    return errorResponse(
      `You are not cleared to update Opportunities in ${property.address.state}.`,
      403,
    );
  }

  let body:
    OwnerStatusRequestBody;

  try {
    body =
      (await request.json()) as OwnerStatusRequestBody;
  } catch {
    return errorResponse(
      "Invalid JSON request.",
      400,
    );
  }

  const ownerLocated =
    body.ownerLocated?.trim();

  const contactConfidence =
    body.contactConfidence?.trim();

  if (
    !ownerLocated ||
    !isOwnerLocatedStatus(
      ownerLocated,
    )
  ) {
    return errorResponse(
      "A valid owner-located status is required.",
      400,
    );
  }

  if (
    !contactConfidence ||
    !isContactConfidence(
      contactConfidence,
    )
  ) {
    return errorResponse(
      "A valid contact-confidence value is required.",
      400,
    );
  }

  /*
   * Retry-safe.
   */
  if (
    opportunity.ownerLocated ===
      ownerLocated &&
    opportunity.contactConfidence ===
      contactConfidence
  ) {
    return NextResponse.json({
      ok: true,

      changed: false,

      opportunity,
    });
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data: versionData,
    error: versionError,
  } =
    await supabase
      .from("opportunities")
      .select("row_version")
      .eq(
        "id",
        opportunity.id,
      )
      .maybeSingle();

  if (versionError) {
    return errorResponse(
      `Unable to read Opportunity version: ${versionError.message}`,
      409,
    );
  }

  if (!versionData) {
    return errorResponse(
      "Opportunity no longer exists.",
      404,
    );
  }

  const expectedVersion =
    databaseRowVersion(
      (
        versionData as OpportunityVersionRow
      ).row_version,
    );

  const {
    data: updatedData,
    error: updateError,
  } =
    await supabase
      .from("opportunities")
      .update({
        owner_located:
          ownerLocated,

        contact_confidence:
          contactConfidence,

        last_activity_on:
          currentIsoDate(),
      })
      .eq(
        "id",
        opportunity.id,
      )
      .eq(
        "row_version",
        expectedVersion,
      )
      .select("id")
      .maybeSingle();

  if (updateError) {
    return errorResponse(
      `Unable to update Opportunity owner status: ${updateError.message}`,
      409,
    );
  }

  if (!updatedData) {
    return errorResponse(
      "Opportunity changed while owner research was being recorded. Reload and try again.",
      409,
    );
  }

  const updated =
    await getOpportunityById(
      opportunity.id,
    );

  if (!updated) {
    return errorResponse(
      "Owner status was updated but the Opportunity could not be reloaded.",
      500,
    );
  }

  return NextResponse.json({
    ok: true,

    changed: true,

    opportunity:
      updated,
  });
}