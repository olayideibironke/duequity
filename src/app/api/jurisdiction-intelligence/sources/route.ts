import { NextRequest, NextResponse } from "next/server";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import type { SaleType } from "@/domain/types";

import { discoverJurisdictionSources } from "@/server/jurisdiction-source-discovery";
import { resolveStaffSession } from "@/server/staff-session";

/**
 * DUEQUITY JURISDICTION SOURCE DISCOVERY API
 *
 * Validation endpoint:
 *
 *   state FIPS
 *   + county GEOID
 *   + sale type
 *   -> ranked trusted official government-domain candidates
 *
 * This endpoint performs discovery only.
 *
 * It does NOT:
 *
 *   - interpret statutes or court rules
 *   - determine deadlines
 *   - determine fee limits
 *   - determine attorney requirements
 *   - approve a jurisdiction
 *   - permit claimant intake
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
/* GET                                                                         */
/* ========================================================================== */

export async function GET(request: NextRequest) {
  /*
   * Fail-closed staff session gate.
   *
   * This is internal staff tooling with no public caller. Without a session it
   * would be an unauthenticated proxy for outbound requests to government hosts,
   * so it refuses before doing any work.
   */
  const session = await resolveStaffSession();

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
        error: "You do not have permission to discover jurisdiction sources.",
      },
      { status: 403 },
    );
  }

  const stateFips = request.nextUrl.searchParams.get("stateFips")?.trim();

  const countyGeoid = request.nextUrl.searchParams.get("countyGeoid")?.trim();

  const rawSaleType = request.nextUrl.searchParams.get("saleType")?.trim();

  if (!stateFips || !countyGeoid || !rawSaleType) {
    return NextResponse.json(
      {
        ok: false,

        error: "stateFips, countyGeoid and saleType are required.",

        example:
          "/api/jurisdiction-intelligence/sources?stateFips=24&countyGeoid=24033&saleType=judicial_foreclosure",
      },
      {
        status: 400,
      },
    );
  }

  if (!SALE_TYPES.has(rawSaleType as SaleType)) {
    return NextResponse.json(
      {
        ok: false,

        error: `Unsupported saleType: ${rawSaleType}`,

        supportedSaleTypes: [...SALE_TYPES],
      },
      {
        status: 400,
      },
    );
  }

  try {
    const discovery = await discoverJurisdictionSources({
      stateFips,

      countyGeoid,

      saleType: rawSaleType as SaleType,
    });

    return NextResponse.json(
      {
        ok: true,

        discovery,

        rulesCreated: false,

        jurisdictionApproved: false,

        intakeAllowed: false,

        message:
          "Trusted official source candidates were ranked. Legal interpretation and jurisdiction approval have not occurred.",
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
        : "Unable to discover jurisdiction sources.";

    return NextResponse.json(
      {
        ok: false,

        error: message,

        rulesCreated: false,

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