import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  addClaimantLocatorAssociatedContact,
  addClaimantLocatorCandidate,
  addClaimantLocatorIdentity,
  reviewClaimantLocatorAssociatedContact,
  reviewClaimantLocatorCandidate,
  reviewClaimantLocatorIdentity,
  type ClaimantLocatorCandidateKind,
  type ClaimantLocatorIdentityKind,
} from "@/server/discovered-record-enrichment-store";

import {
  getDiscoveredRecordById,
} from "@/server/discovered-record-store";

import {
  recordAuditEvent,
} from "@/server/audit-event-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

/**
 * CLAIMANT LOCATOR API
 *
 * Allows authorized staff to record and review claimant-location research.
 *
 * Supported research:
 *
 *   - claimant phone
 *   - claimant email
 *   - claimant mailing address
 *   - first name
 *   - last name
 *   - aliases
 *   - relatives / associated contacts
 *   - associated contact relationship
 *   - associated contact phone / email
 *
 * Locator findings are research candidates only.
 *
 * This action does NOT:
 *
 *   - create a claimant
 *   - create a claimant Auth user
 *   - create an Opportunity
 *   - create a Claim
 *   - authorize outreach
 *   - send email, SMS, mail, or phone communications
 *   - treat a property address as a current mailing address
 *   - treat an associated contact as the claimant
 *   - approve jurisdiction rules
 */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

type ClaimantLocatorAction =
  | "add"
  | "verify"
  | "reject"
  | "add_identity"
  | "verify_identity"
  | "reject_identity"
  | "add_associated_contact"
  | "verify_associated_contact"
  | "reject_associated_contact";

interface ClaimantLocatorRequestBody {
  action?: ClaimantLocatorAction;

  kind?:
    | ClaimantLocatorCandidateKind
    | ClaimantLocatorIdentityKind;

  value?: string;

  sourceName?: string;

  sourceUrl?: string;

  sourceDate?: string;

  candidateId?: string;

  reviewNote?: string;

  name?: string;

  relationship?: string;

  phone?: string;

  email?: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
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

      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function successResponse(
  payload: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      ok: true,

      ...payload,

      operationalEffects: {
        claimantsCreated: 0,

        claimantAuthUsersCreated: 0,

        opportunitiesCreated: 0,

        claimsCreated: 0,

        outreachAuthorized: false,

        outreachSent: false,

        onboardingStarted: false,
      },
    },
    {
      status: 200,

      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function isLocatorAction(
  value: unknown,
): value is ClaimantLocatorAction {
  return (
    value === "add" ||
    value === "verify" ||
    value === "reject" ||
    value === "add_identity" ||
    value === "verify_identity" ||
    value === "reject_identity" ||
    value === "add_associated_contact" ||
    value === "verify_associated_contact" ||
    value === "reject_associated_contact"
  );
}

function isCandidateKind(
  value: unknown,
): value is ClaimantLocatorCandidateKind {
  return (
    value === "phone" ||
    value === "email" ||
    value === "mailing_address"
  );
}

function isIdentityKind(
  value: unknown,
): value is ClaimantLocatorIdentityKind {
  return (
    value === "first_name" ||
    value === "last_name" ||
    value === "alias"
  );
}

function optionalString(
  value: unknown,
): string | undefined {
  if (
    typeof value !== "string"
  ) {
    return undefined;
  }

  const trimmed =
    value.trim();

  return trimmed ||
    undefined;
}

function requiredSource(
  body: ClaimantLocatorRequestBody,
):
  | {
      sourceName: string;

      sourceUrl?: string;

      sourceDate: string;
    }
  | undefined {
  const sourceName =
    optionalString(
      body.sourceName,
    );

  const sourceUrl =
    optionalString(
      body.sourceUrl,
    );

  const sourceDate =
    optionalString(
      body.sourceDate,
    );

  if (
    !sourceName ||
    !sourceDate
  ) {
    return undefined;
  }

  return {
    sourceName,

    sourceUrl,

    sourceDate,
  };
}

/* ========================================================================== */
/* POST                                                                        */
/* ========================================================================== */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  if (
    !can(
      session,
      "opportunity.write",
    )
  ) {
    return errorResponse(
      "You do not have permission to manage claimant locator research.",
      403,
    );
  }

  const {
    id,
  } =
    await context.params;

  const record =
    await getDiscoveredRecordById(
      id,
    );

  if (
    !record
  ) {
    return errorResponse(
      "Discovered record not found.",
      404,
    );
  }

  if (
    !clearedForState(
      session,
      record.state,
    )
  ) {
    return errorResponse(
      "You are not cleared to perform claimant-location research in this state.",
      403,
    );
  }

  let body: ClaimantLocatorRequestBody;

  try {
    body =
      await request.json() as ClaimantLocatorRequestBody;
  } catch {
    return errorResponse(
      "A valid JSON claimant locator request is required.",
      400,
    );
  }

  if (
    !isLocatorAction(
      body.action,
    )
  ) {
    return errorResponse(
      "Claimant locator action is invalid.",
      400,
    );
  }

  try {
    /* ====================================================================== */
    /* Claimant contact candidate                                             */
    /* ====================================================================== */

    if (
      body.action === "add"
    ) {
      if (
        !isCandidateKind(
          body.kind,
        )
      ) {
        return errorResponse(
          "Claimant locator candidate kind is required.",
          400,
        );
      }

      const value =
        optionalString(
          body.value,
        );

      const source =
        requiredSource(
          body,
        );

      if (
        !value
      ) {
        return errorResponse(
          "Claimant locator candidate value is required.",
          400,
        );
      }

      if (
        !source
      ) {
        return errorResponse(
          "Claimant locator source name and source date are required.",
          400,
        );
      }

      const updated =
        await addClaimantLocatorCandidate({
          discoveredRecordId:
            record.id,

          actorUserId:
            session.user.id,

          kind:
            body.kind,

          value,

          sourceName:
            source.sourceName,

          sourceUrl:
            source.sourceUrl,

          sourceDate:
            source.sourceDate,
        });

      const candidates =
        updated.claimantLocator
          ?.candidates ??
        [];

      const candidate =
        candidates[
          candidates.length - 1
        ];

      await recordAuditEvent({
        actor:
          session.user,

        action:
          "claimant_locator.candidate_added",

        targetType:
          "discovered_record",

        targetId:
          record.id,

        targetLabel:
          record.formerOwnerName,

        outcome:
          "success",

        detail:
          `Recorded ${body.kind} claimant locator candidate from ${source.sourceName}. Candidate remains unverified and outreach is not authorized.`,
      });

      return successResponse({
        candidate,
      });
    }

    /* ====================================================================== */
    /* Claimant identity candidate                                            */
    /* ====================================================================== */

    if (
      body.action === "add_identity"
    ) {
      if (
        !isIdentityKind(
          body.kind,
        )
      ) {
        return errorResponse(
          "Claimant identity type is required.",
          400,
        );
      }

      const value =
        optionalString(
          body.value,
        );

      const source =
        requiredSource(
          body,
        );

      if (
        !value
      ) {
        return errorResponse(
          "Claimant identity value is required.",
          400,
        );
      }

      if (
        !source
      ) {
        return errorResponse(
          "Claimant identity source name and source date are required.",
          400,
        );
      }

      const updated =
        await addClaimantLocatorIdentity({
          discoveredRecordId:
            record.id,

          actorUserId:
            session.user.id,

          kind:
            body.kind,

          value,

          sourceName:
            source.sourceName,

          sourceUrl:
            source.sourceUrl,

          sourceDate:
            source.sourceDate,
        });

      const identities =
        updated.claimantLocator
          ?.identities ??
        [];

      const candidate =
        identities[
          identities.length - 1
        ];

      await recordAuditEvent({
        actor:
          session.user,

        action:
          "claimant_locator.identity_added",

        targetType:
          "discovered_record",

        targetId:
          record.id,

        targetLabel:
          record.formerOwnerName,

        outcome:
          "success",

        detail:
          `Recorded ${body.kind} claimant identity finding from ${source.sourceName}. Finding remains unverified.`,
      });

      return successResponse({
        candidate,
      });
    }

    /* ====================================================================== */
    /* Associated contact candidate                                           */
    /* ====================================================================== */

    if (
      body.action ===
      "add_associated_contact"
    ) {
      const name =
        optionalString(
          body.name,
        );

      const relationship =
        optionalString(
          body.relationship,
        );

      const phone =
        optionalString(
          body.phone,
        );

      const email =
        optionalString(
          body.email,
        );

      const source =
        requiredSource(
          body,
        );

      if (
        !name
      ) {
        return errorResponse(
          "Associated contact name is required.",
          400,
        );
      }

      if (
        !phone &&
        !email
      ) {
        return errorResponse(
          "Associated contact requires at least a phone number or email address.",
          400,
        );
      }

      if (
        !source
      ) {
        return errorResponse(
          "Associated contact source name and source date are required.",
          400,
        );
      }

      const updated =
        await addClaimantLocatorAssociatedContact({
          discoveredRecordId:
            record.id,

          actorUserId:
            session.user.id,

          name,

          relationship,

          phone,

          email,

          sourceName:
            source.sourceName,

          sourceUrl:
            source.sourceUrl,

          sourceDate:
            source.sourceDate,
        });

      const contacts =
        updated.claimantLocator
          ?.associatedContacts ??
        [];

      const candidate =
        contacts[
          contacts.length - 1
        ];

      await recordAuditEvent({
        actor:
          session.user,

        action:
          "claimant_locator.associated_contact_added",

        targetType:
          "discovered_record",

        targetId:
          record.id,

        targetLabel:
          record.formerOwnerName,

        outcome:
          "success",

        detail:
          `Recorded associated contact research from ${source.sourceName}. The associated person is not treated as the claimant and outreach is not authorized.`,
      });

      return successResponse({
        candidate,
      });
    }

    /* ====================================================================== */
    /* Review claimant contact candidate                                      */
    /* ====================================================================== */

    if (
      body.action === "verify" ||
      body.action === "reject"
    ) {
      const candidateId =
        optionalString(
          body.candidateId,
        );

      if (
        !candidateId
      ) {
        return errorResponse(
          "Claimant locator candidate id is required.",
          400,
        );
      }

      const reviewStatus =
        body.action === "verify"
          ? "verified"
          : "rejected";

      const updated =
        await reviewClaimantLocatorCandidate({
          discoveredRecordId:
            record.id,

          candidateId,

          actorUserId:
            session.user.id,

          status:
            reviewStatus,

          reviewNote:
            optionalString(
              body.reviewNote,
            ),
        });

      const candidate =
        updated.claimantLocator
          ?.candidates.find(
            (item) =>
              item.id ===
              candidateId,
          );

      if (
        !candidate
      ) {
        throw new Error(
          "Claimant locator candidate was not found after review.",
        );
      }

      await recordAuditEvent({
        actor:
          session.user,

        action:
          reviewStatus === "verified"
            ? "claimant_locator.candidate_verified"
            : "claimant_locator.candidate_rejected",

        targetType:
          "discovered_record",

        targetId:
          record.id,

        targetLabel:
          record.formerOwnerName,

        outcome:
          "success",

        detail:
          reviewStatus === "verified"
            ? `Verified ${candidate.kind} claimant locator candidate. Verification does not authorize outreach or create a claimant.`
            : `Rejected ${candidate.kind} claimant locator candidate. No outreach or claimant record was created.`,
      });

      return successResponse({
        candidate,
      });
    }

    /* ====================================================================== */
    /* Review claimant identity                                               */
    /* ====================================================================== */

    if (
      body.action === "verify_identity" ||
      body.action === "reject_identity"
    ) {
      const candidateId =
        optionalString(
          body.candidateId,
        );

      if (
        !candidateId
      ) {
        return errorResponse(
          "Claimant identity candidate id is required.",
          400,
        );
      }

      const reviewStatus =
        body.action === "verify_identity"
          ? "verified"
          : "rejected";

      const updated =
        await reviewClaimantLocatorIdentity({
          discoveredRecordId:
            record.id,

          candidateId,

          actorUserId:
            session.user.id,

          status:
            reviewStatus,

          reviewNote:
            optionalString(
              body.reviewNote,
            ),
        });

      const candidate =
        updated.claimantLocator
          ?.identities
          ?.find(
            (item) =>
              item.id ===
              candidateId,
          );

      if (
        !candidate
      ) {
        throw new Error(
          "Claimant identity finding was not found after review.",
        );
      }

      await recordAuditEvent({
        actor:
          session.user,

        action:
          reviewStatus === "verified"
            ? "claimant_locator.identity_verified"
            : "claimant_locator.identity_rejected",

        targetType:
          "discovered_record",

        targetId:
          record.id,

        targetLabel:
          record.formerOwnerName,

        outcome:
          "success",

        detail:
          reviewStatus === "verified"
            ? `Verified ${candidate.kind} claimant identity finding. Verification does not authorize outreach or create a claimant.`
            : `Rejected ${candidate.kind} claimant identity finding.`,
      });

      return successResponse({
        candidate,
      });
    }

    /* ====================================================================== */
    /* Review associated contact                                              */
    /* ====================================================================== */

    const candidateId =
      optionalString(
        body.candidateId,
      );

    if (
      !candidateId
    ) {
      return errorResponse(
        "Associated contact candidate id is required.",
        400,
      );
    }

    const reviewStatus =
      body.action ===
      "verify_associated_contact"
        ? "verified"
        : "rejected";

    const updated =
      await reviewClaimantLocatorAssociatedContact({
        discoveredRecordId:
          record.id,

        candidateId,

        actorUserId:
          session.user.id,

        status:
          reviewStatus,

        reviewNote:
          optionalString(
            body.reviewNote,
          ),
      });

    const candidate =
      updated.claimantLocator
        ?.associatedContacts
        ?.find(
          (item) =>
            item.id ===
            candidateId,
        );

    if (
      !candidate
    ) {
      throw new Error(
        "Associated contact finding was not found after review.",
      );
    }

    await recordAuditEvent({
      actor:
        session.user,

      action:
        reviewStatus === "verified"
          ? "claimant_locator.associated_contact_verified"
          : "claimant_locator.associated_contact_rejected",

      targetType:
        "discovered_record",

      targetId:
        record.id,

      targetLabel:
        record.formerOwnerName,

      outcome:
        "success",

      detail:
        reviewStatus === "verified"
          ? "Verified an associated contact research finding. The associated person remains separate from the claimant and verification does not authorize outreach."
          : "Rejected an associated contact research finding.",
    });

    return successResponse({
      candidate,
    });
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update claimant locator research.";

    if (
      message ===
      "Discovered record not found."
    ) {
      return errorResponse(
        message,
        404,
      );
    }

    return errorResponse(
      message,
      400,
    );
  }
}