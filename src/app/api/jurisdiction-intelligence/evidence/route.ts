import { NextRequest, NextResponse } from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import type { SaleType } from "@/domain/types";

import {
  getJurisdictionEvidencePacket,
  harvestJurisdictionEvidence,
} from "@/server/jurisdiction-evidence-harvester";

import { resolveStaffSession } from "@/server/staff-session";

/**
 * DUEQUITY JURISDICTION EVIDENCE API
 *
 * GET:
 *   Read an already-harvested evidence packet.
 *
 * POST:
 *   Run the tightly limited official-source harvester and persist the resulting
 *   evidence packet.
 *
 * This API gathers evidence only.
 *
 * It does NOT:
 *
 *   - interpret law
 *   - create jurisdiction rules
 *   - approve a jurisdiction
 *   - determine deadlines
 *   - determine fee limits
 *   - determine attorney requirements
 *   - authorize claimant intake
 */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Supported sale types                                                        */
/* ========================================================================== */

const SALE_TYPES = new Set<SaleType>([
  "judicial_foreclosure",
  "nonjudicial_foreclosure",
  "tax_deed_sale",
  "tax_lien_foreclosure",
  "sheriff_sale",
  "hoa_foreclosure",
  "trustee_sale",
  "municipal_lien_foreclosure",
  "partition_sale",
]);

/* ========================================================================== */
/* Input                                                                       */
/* ========================================================================== */

interface ParsedInput {
  stateFips: string;

  countyGeoid: string;

  saleType: SaleType;
}

function parseInput(request: NextRequest):
  | {
      ok: true;
      value: ParsedInput;
    }
  | {
      ok: false;
      response: NextResponse;
    } {
  const stateFips = request.nextUrl.searchParams.get("stateFips")?.trim();

  const countyGeoid = request.nextUrl.searchParams.get("countyGeoid")?.trim();

  const rawSaleType = request.nextUrl.searchParams.get("saleType")?.trim();

  if (!stateFips || !countyGeoid || !rawSaleType) {
    return {
      ok: false,

      response: NextResponse.json(
        {
          ok: false,

          error: "stateFips, countyGeoid and saleType are required.",

          example:
            "/api/jurisdiction-intelligence/evidence?stateFips=24&countyGeoid=24033&saleType=judicial_foreclosure",
        },
        {
          status: 400,
        },
      ),
    };
  }

  if (!/^\d{2}$/.test(stateFips)) {
    return {
      ok: false,

      response: NextResponse.json(
        {
          ok: false,

          error: `Invalid stateFips: ${stateFips}`,
        },
        {
          status: 400,
        },
      ),
    };
  }

  if (!/^\d{5}$/.test(countyGeoid) || !countyGeoid.startsWith(stateFips)) {
    return {
      ok: false,

      response: NextResponse.json(
        {
          ok: false,

          error: `Invalid countyGeoid ${countyGeoid} for stateFips ${stateFips}.`,
        },
        {
          status: 400,
        },
      ),
    };
  }

  if (!SALE_TYPES.has(rawSaleType as SaleType)) {
    return {
      ok: false,

      response: NextResponse.json(
        {
          ok: false,

          error: `Unsupported saleType: ${rawSaleType}`,

          supportedSaleTypes: [...SALE_TYPES],
        },
        {
          status: 400,
        },
      ),
    };
  }

  return {
    ok: true,

    value: {
      stateFips,

      countyGeoid,

      saleType: rawSaleType as SaleType,
    },
  };
}

/* ========================================================================== */
/* GET: inspect persisted packet                                               */
/* ========================================================================== */

export async function GET(request: NextRequest) {
  /*
   * Fail-closed staff session gate.
   *
   * This is internal staff tooling with no public caller. Without a session it
   * would be an unauthenticated proxy for outbound requests to government hosts,
   * so it refuses before doing any work.
   */
  const session =
    await resolveStaffSession();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        error: STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      },
      { status: 401 },
    );
  }

  if (!can(session, "jurisdiction.read")) {
    return NextResponse.json(
      {
        ok: false,
        error: "You do not have permission to read jurisdiction evidence.",
      },
      { status: 403 },
    );
  }

  const parsed = parseInput(request);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const packet = await getJurisdictionEvidencePacket(parsed.value);

    if (!packet) {
      return NextResponse.json(
        {
          ok: true,

          packet: null,

          harvested: false,

          legalRulesCreated: false,

          jurisdictionApproved: false,

          intakeAllowed: false,

          message:
            "No persisted evidence packet exists for this jurisdiction and sale type.",
        },
        {
          status: 200,

          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,

        packet,

        harvested: true,

        legalRulesCreated: false,

        jurisdictionApproved: false,

        intakeAllowed: false,

        message:
          "Persisted official-source evidence packet loaded. No legal interpretation has occurred.",
      },
      {
        status: 200,

        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load jurisdiction evidence.";

    return NextResponse.json(
      {
        ok: false,

        error: message,

        legalRulesCreated: false,

        jurisdictionApproved: false,

        intakeAllowed: false,
      },
      {
        status: 422,

        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

/* ========================================================================== */
/* POST: harvest and persist official evidence                                 */
/* ========================================================================== */

export async function POST(request: NextRequest) {
  /*
   * Fail-closed staff session gate.
   *
   * This is internal staff tooling with no public caller. Without a session it
   * would be an unauthenticated proxy for outbound requests to government hosts,
   * so it refuses before doing any work.
   */
  const session =
    await resolveStaffSession();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        error: STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      },
      { status: 401 },
    );
  }

  if (!can(session, "jurisdiction.write")) {
    return NextResponse.json(
      {
        ok: false,
        error: "You do not have permission to harvest jurisdiction evidence.",
      },
      { status: 403 },
    );
  }

  const parsed = parseInput(request);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const packet = await harvestJurisdictionEvidence(parsed.value);

    return NextResponse.json(
      {
        ok: true,

        packet,

        harvested: true,

        legalRulesCreated: false,

        jurisdictionApproved: false,

        intakeAllowed: false,

        message:
          "Official-source evidence harvesting completed and the evidence packet was persisted. No legal interpretation or jurisdiction approval occurred.",
      },
      {
        status: 200,

        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to harvest jurisdiction evidence.";

    return NextResponse.json(
      {
        ok: false,

        error: message,

        harvested: false,

        legalRulesCreated: false,

        jurisdictionApproved: false,

        intakeAllowed: false,
      },
      {
        status: 422,

        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}