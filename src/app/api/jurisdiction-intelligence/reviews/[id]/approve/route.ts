import { NextRequest, NextResponse } from "next/server";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  ensureCanonicalJurisdictionPublication,
} from "@/server/jurisdiction-canonical-publication";

import {
  getJurisdictionEvidencePacket,
} from "@/server/jurisdiction-evidence-harvester";

import {
  getJurisdictionRulePackage,
} from "@/server/jurisdiction-intelligence";

import {
  approveJurisdictionReviewDraft,
  getJurisdictionReviewDraft,
} from "@/server/jurisdiction-review-store";

import { resolveStaffSession } from "@/server/staff-session";

/**
 * JURISDICTION REVIEW APPROVAL API
 *
 * POST
 *   Performs the final compliance activation of a jurisdiction review.
 *
 * Safety boundaries:
 *
 * - Requires jurisdiction.read.
 * - Requires compliance.approve.
 * - Enforces state clearance server-side.
 * - New approvals must already be ready_for_approval.
 * - Existing locally approved reviews may be canonicalized into Stage 2.
 * - The review store re-validates source selection and required findings.
 * - Canonical publication uses the controlled Supabase approval function.
 * - No direct JurisdictionRulePackage insert is permitted here.
 */

function jsonError(
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

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/* ========================================================================== */
/* Canonical publication                                                       */
/* ========================================================================== */

async function canonicalizeApprovedReview({
  reviewId,
  actorUserId,
  actorName,
}: {
  reviewId: string;

  actorUserId: string;

  actorName: string;
}) {
  const review =
    await getJurisdictionReviewDraft(
      reviewId,
    );

  if (!review) {
    throw new Error(
      "Jurisdiction review not found.",
    );
  }

  if (
    review.status !==
      "approved"
  ) {
    throw new Error(
      "Only an approved jurisdiction review may be canonicalized.",
    );
  }

  if (
    !review.approvedPackageId
  ) {
    throw new Error(
      "Approved jurisdiction review is missing its local package identifier.",
    );
  }

  const [
    packet,
    rulePackage,
  ] =
    await Promise.all([
      getJurisdictionEvidencePacket({
        stateFips:
          review.stateFips,

        countyGeoid:
          review.countyGeoid,

        saleType:
          review.saleType,
      }),

      getJurisdictionRulePackage(
        review.approvedPackageId,
      ),
    ]);

  if (!packet) {
    throw new Error(
      "The approved jurisdiction review's evidence packet could not be resolved.",
    );
  }

  if (!rulePackage) {
    throw new Error(
      "The approved jurisdiction review's rule package could not be resolved.",
    );
  }

  return ensureCanonicalJurisdictionPublication({
    packet,

    draft:
      review,

    rulePackage,

    actorUserId,

    actorName,
  });
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const session =
    await resolveStaffSession();

  if (!session) {
    return jsonError(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  if (
    !can(
      session,
      "jurisdiction.read",
    )
  ) {
    return jsonError(
      "You do not have permission to read jurisdiction reviews.",
      403,
    );
  }

  if (
    !can(
      session,
      "compliance.approve",
    )
  ) {
    return jsonError(
      "You do not have permission to approve jurisdiction rules.",
      403,
    );
  }

  const {
    id,
  } =
    await params;

  try {
    const draft =
      await getJurisdictionReviewDraft(
        id,
      );

    if (!draft) {
      return jsonError(
        "Jurisdiction review not found.",
        404,
      );
    }

    if (
      !clearedForState(
        session,
        draft.stateCode,
      )
    ) {
      return jsonError(
        `You are not cleared to approve jurisdiction rules in ${draft.stateCode}.`,
        403,
      );
    }

    /*
     * Compatibility path for reviews approved before Stage 2 became the
     * canonical persistence layer.
     *
     * This does not perform a second legal approval. It publishes the already
     * approved local evidence, review, and package through the controlled
     * Stage 2 database lifecycle.
     */
    if (
      draft.status ===
        "approved"
    ) {
      const canonical =
        await canonicalizeApprovedReview({
          reviewId:
            draft.id,

          actorUserId:
            session.user.id,

          actorName:
            session.user.name,
        });

      return NextResponse.json(
        {
          ok: true,

          approved: true,

          alreadyApproved:
            true,

          canonicalized:
            true,

          operator: {
            id:
              session.user.id,

            name:
              session.user.name,

            role:
              session.user.role,
          },

          review:
            draft,

          canonical: {
            packageId:
              canonical.packageId,

            packageVersion:
              canonical.packageVersion,

            legalRuleVersion:
              canonical.legalRuleVersion,

            intakeAuthorized:
              canonical.intakeAuthorized,
          },
        },
        {
          status: 200,
        },
      );
    }

    if (
      draft.status !==
        "ready_for_approval"
    ) {
      return jsonError(
        `Jurisdiction review must be ready_for_approval before activation. Current status: ${draft.status}.`,
        409,
      );
    }

    /*
     * Existing human-governed local approval remains the application review
     * boundary. Immediately after it succeeds, the same approved evidence and
     * findings are published through the canonical Stage 2 lifecycle.
     */
    const result =
      await approveJurisdictionReviewDraft({
        id,

        actorUserId:
          session.user.id,

        actorName:
          session.user.name,
      });

    const packet =
      await getJurisdictionEvidencePacket({
        stateFips:
          result.review.stateFips,

        countyGeoid:
          result.review.countyGeoid,

        saleType:
          result.review.saleType,
      });

    if (!packet) {
      throw new Error(
        "Approved jurisdiction evidence packet could not be resolved for canonical publication.",
      );
    }

    const canonical =
      await ensureCanonicalJurisdictionPublication({
        packet,

        draft:
          result.review,

        rulePackage:
          result.package,

        actorUserId:
          session.user.id,

        actorName:
          session.user.name,
      });

    return NextResponse.json(
      {
        ok: true,

        approved: true,

        alreadyApproved:
          false,

        canonicalized:
          true,

        operator: {
          id:
            session.user.id,

          name:
            session.user.name,

          role:
            session.user.role,
        },

        review:
          result.review,

        package:
          result.package,

        canonical: {
          packageId:
            canonical.packageId,

          packageVersion:
            canonical.packageVersion,

          legalRuleVersion:
            canonical.legalRuleVersion,

          intakeAuthorized:
            canonical.intakeAuthorized,
        },

        activation: {
          jurisdictionApproved:
            true,

          packageStatus:
            result.package.status,

          packageId:
            canonical.packageId,

          packageVersion:
            canonical.packageVersion,

          legalRuleVersion:
            canonical.legalRuleVersion,

          intakeAllowed:
            canonical.intakeAuthorized,

          approvedByUserId:
            result.package
              .approvedByUserId,

          approvedAt:
            result.package
              .approvedAt,
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to approve jurisdiction review.";

    const status =
      message.includes(
        "not found",
      ) ||
      message.includes(
        "could not be resolved",
      )
        ? 404
        : message.includes(
              "must be",
            ) ||
            message.includes(
              "requires",
            ) ||
            message.includes(
              "missing",
            ) ||
            message.includes(
              "incomplete",
            ) ||
            message.includes(
              "selected",
            ) ||
            message.includes(
              "scope",
            ) ||
            message.includes(
              "canonical",
            )
          ? 409
          : 500;

    return jsonError(
      message,
      status,
    );
  }
}