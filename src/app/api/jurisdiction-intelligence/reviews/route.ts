import { NextRequest, NextResponse } from "next/server";

import type { SaleType } from "@/domain/types";
import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";
import { getJurisdictionEvidencePacket } from "@/server/jurisdiction-evidence-harvester";
import {
  createJurisdictionReviewDraftFromEvidence,
  listJurisdictionReviewDrafts,
} from "@/server/jurisdiction-review-store";
import { resolveStaffSession } from "@/server/staff-session";

/**
 * JURISDICTION REVIEW COLLECTION API
 *
 * GET
 *   Lists jurisdiction review drafts visible to the current staff operator.
 *
 * POST
 *   Creates a human review draft from an already-complete official-source
 *   evidence packet.
 *
 * Safety boundaries:
 *
 * - Reading requires jurisdiction.read.
 * - Creating a draft requires jurisdiction.write.
 * - State clearance is enforced server-side.
 * - The route never creates or approves a legal rule.
 * - A partial or failed evidence packet cannot become a review draft.
 * - Final activation is intentionally handled by a separate approval route
 *   guarded by compliance.approve.
 */

const SALE_TYPES = new Set<SaleType>([
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

function jsonError(message: string, status: number) {
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

function isSaleType(value: unknown): value is SaleType {
  return typeof value === "string" && SALE_TYPES.has(value as SaleType);
}

function isStateFips(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}$/.test(value);
}

function isCountyGeoid(value: unknown, stateFips: string): value is string {
  return (
    typeof value === "string" &&
    /^\d{5}$/.test(value) &&
    value.startsWith(stateFips)
  );
}

export async function GET() {
  const session = await resolveStaffSession();

  if (!session) {
    return jsonError(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "jurisdiction.read")) {
    return jsonError(
      "You do not have permission to read jurisdiction reviews.",
      403,
    );
  }

  try {
    const drafts = await listJurisdictionReviewDrafts();

    const visibleDrafts = drafts.filter((draft) =>
      clearedForState(session, draft.stateCode),
    );

    return NextResponse.json({
      ok: true,

      operator: {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
      },

      count: visibleDrafts.length,

      drafts: visibleDrafts,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unable to list jurisdiction review drafts.",
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await resolveStaffSession();

  if (!session) {
    return jsonError(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "jurisdiction.write")) {
    return jsonError(
      "You do not have permission to create jurisdiction reviews.",
      403,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  if (typeof body !== "object" || body === null) {
    return jsonError("Request body must be a JSON object.", 400);
  }

  const input = body as Record<string, unknown>;

  if (!isStateFips(input.stateFips)) {
    return jsonError("stateFips must be a two-digit FIPS code.", 400);
  }

  const stateFips = input.stateFips;

  if (!isCountyGeoid(input.countyGeoid, stateFips)) {
    return jsonError(
      "countyGeoid must be a five-digit GEOID belonging to stateFips.",
      400,
    );
  }

  if (!isSaleType(input.saleType)) {
    return jsonError("saleType is not supported.", 400);
  }

  const countyGeoid = input.countyGeoid;

  const saleType = input.saleType;

  try {
    /*
     * Read the evidence packet before mutation so state clearance can be checked
     * against the packet's resolved StateCode.
     */
    const packet = await getJurisdictionEvidencePacket({
      stateFips,
      countyGeoid,
      saleType,
    });

    if (!packet) {
      return jsonError(
        "No jurisdiction evidence packet exists for this geography and sale type.",
        404,
      );
    }

    if (packet.evidenceStatus !== "complete") {
      return jsonError(
        `Jurisdiction evidence must be complete before review begins. Current status: ${packet.evidenceStatus}.`,
        409,
      );
    }

    if (!clearedForState(session, packet.stateCode)) {
      return jsonError(
        `You are not cleared to review jurisdiction rules in ${packet.stateCode}.`,
        403,
      );
    }

    const draft = await createJurisdictionReviewDraftFromEvidence({
      stateFips,
      countyGeoid,
      saleType,

      actorUserId: session.user.id,

      actorName: session.user.name,
    });

    return NextResponse.json(
      {
        ok: true,

        created:
          draft.createdByUserId === session.user.id && draft.revision === 1,

        draft,

        safety: {
          legalRuleApproved: false,

          jurisdictionActivated: false,

          intakeAllowed: false,

          approvalPermissionRequired: "compliance.approve",
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unable to create jurisdiction review draft.",
      500,
    );
  }
}