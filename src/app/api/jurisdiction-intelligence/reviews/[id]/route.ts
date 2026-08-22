import { NextRequest, NextResponse } from "next/server";

import type { JurisdictionAuthoritySource } from "@/server/jurisdiction-intelligence";
import {
  getJurisdictionReviewDraft,
  updateJurisdictionReviewDraft,
  type JurisdictionReviewFindingKey,
  type JurisdictionReviewFindings,
  type JurisdictionReviewUpdate,
} from "@/server/jurisdiction-review-store";
import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";
import { resolveStaffSession } from "@/server/staff-session";

/**
 * JURISDICTION REVIEW DETAIL API
 *
 * GET
 *   Loads one human jurisdiction review.
 *
 * PATCH
 *   Saves review findings and review-state metadata.
 *
 * Safety boundaries:
 *
 * - Reading requires jurisdiction.read.
 * - Saving requires jurisdiction.write.
 * - State clearance is enforced server-side.
 * - This route cannot approve or activate a jurisdiction.
 * - status: "approved" is explicitly rejected.
 * - Final activation is handled only by the dedicated approval endpoint,
 *   guarded by compliance.approve.
 */

const REVIEW_STATUSES = new Set([
  "draft",
  "ready_for_approval",
  "changes_required",
] as const);

const REVIEW_FINDINGS = new Set<JurisdictionReviewFindingKey>([
  "agency_contact",
  "custodian",
  "claim_method",
  "required_documents",
  "claim_deadline",
  "controlling_authority",
  "fee_models",
  "percentage_fee_cap",
  "amount_fee_cap",
  "assignment",
  "power_of_attorney",
  "finder_license",
  "bond",
  "attorney_requirement",
  "contract_language",
  "cancellation_period",
  "payment_routing",
  "probate_requirement",
  "compliance_status",
  "legal_processing_rule",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${label} must be an array of strings.`);
  }

  return [...new Set(value)];
}

function reviewedFindingArray(value: unknown): JurisdictionReviewFindingKey[] {
  const values = stringArray(value, "reviewedFindings");

  for (const finding of values) {
    if (!REVIEW_FINDINGS.has(finding as JurisdictionReviewFindingKey)) {
      throw new Error(`Unsupported reviewed finding: ${finding}`);
    }
  }

  return values as JurisdictionReviewFindingKey[];
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function validateFindingsShape(value: unknown): JurisdictionReviewFindings {
  if (!isRecord(value)) {
    throw new Error("findings must be a JSON object.");
  }

  /*
   * The store performs the legal-domain validation and final completeness
   * checks. This route performs transport-level type checks so malformed JSON
   * cannot poison the local review store.
   */
  const stringFields = [
    "jurisdictionId",
    "agencyName",
    "agencyWebsite",
    "agencyPhone",
    "claimFormUrl",
    "statuteReference",
    "paymentRoutingNote",
    "legalRuleEffectiveFrom",
    "legalRuleEffectiveThrough",
    "legalReviewDueAt",
    "internalNotes",
    "custodian",
    "claimMethod",
    "complianceStatus",
    "legalProcessingRule",
  ];

  for (const key of stringFields) {
    const field = value[key];

    if (field !== undefined && typeof field !== "string") {
      throw new Error(`findings.${key} must be a string when provided.`);
    }
  }

  const numberFields = [
    "claimDeadlineDays",
    "feeCapPercent",
    "feeCapAmount",
    "cancellationPeriodDays",
  ];

  for (const key of numberFields) {
    const field = value[key];

    if (
      field !== undefined &&
      (typeof field !== "number" || !Number.isFinite(field))
    ) {
      throw new Error(`findings.${key} must be a finite number when provided.`);
    }
  }

  const booleanFields = [
    "assignmentPermitted",
    "powerOfAttorneyAccepted",
    "finderLicenseRequired",
    "bondRequired",
    "attorneyRequired",
    "probateRequiredWhenDeceased",
  ];

  for (const key of booleanFields) {
    const field = value[key];

    if (field !== undefined && typeof field !== "boolean") {
      throw new Error(`findings.${key} must be a boolean when provided.`);
    }
  }

  const stringArrayFields = [
    "requiredDocuments",
    "permittedFeeModels",
    "mandatoryContractLanguage",
  ];

  for (const key of stringArrayFields) {
    const field = value[key];

    if (field !== undefined) {
      stringArray(field, `findings.${key}`);
    }
  }

  if (value.agencyAddress !== undefined && !isRecord(value.agencyAddress)) {
    throw new Error("findings.agencyAddress must be an object when provided.");
  }

  return value as unknown as JurisdictionReviewFindings;
}

function validateAdditionalSources(
  value: unknown,
): JurisdictionAuthoritySource[] {
  if (!Array.isArray(value)) {
    throw new Error("additionalSources must be an array.");
  }

  for (const source of value) {
    if (
      !isRecord(source) ||
      typeof source.id !== "string" ||
      typeof source.kind !== "string" ||
      typeof source.authorityName !== "string" ||
      typeof source.url !== "string" ||
      typeof source.retrievedAt !== "string"
    ) {
      throw new Error(
        "Each additional source must contain id, kind, authorityName, url and retrievedAt.",
      );
    }
  }

  return value as JurisdictionAuthoritySource[];
}

function validateFindingSourceIds(
  value: unknown,
): JurisdictionReviewUpdate["findingSourceIds"] {
  if (!isRecord(value)) {
    throw new Error("findingSourceIds must be an object.");
  }

  const result: NonNullable<JurisdictionReviewUpdate["findingSourceIds"]> = {};

  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (!REVIEW_FINDINGS.has(rawKey as JurisdictionReviewFindingKey)) {
      throw new Error(`Unsupported findingSourceIds key: ${rawKey}`);
    }

    result[rawKey as JurisdictionReviewFindingKey] = stringArray(
      rawValue,
      `findingSourceIds.${rawKey}`,
    );
  }

  return result;
}

function parseUpdate(body: unknown): JurisdictionReviewUpdate {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (body.status === "approved") {
    throw new Error(
      "This endpoint cannot approve a jurisdiction review. Use the dedicated compliance approval endpoint.",
    );
  }

  const update: JurisdictionReviewUpdate = {};

  if (body.scope !== undefined) {
    if (body.scope !== "state" && body.scope !== "county") {
      throw new Error('scope must be either "state" or "county".');
    }

    update.scope = body.scope;
  }

  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !REVIEW_STATUSES.has(
        body.status as "draft" | "ready_for_approval" | "changes_required",
      )
    ) {
      throw new Error("Unsupported jurisdiction review status.");
    }

    update.status = body.status as
      "draft" | "ready_for_approval" | "changes_required";
  }

  if (body.findings !== undefined) {
    update.findings = validateFindingsShape(body.findings);
  }

  if (body.reviewedFindings !== undefined) {
    update.reviewedFindings = reviewedFindingArray(body.reviewedFindings);
  }

  if (body.selectedSourceIds !== undefined) {
    update.selectedSourceIds = stringArray(
      body.selectedSourceIds,
      "selectedSourceIds",
    );
  }

  if (body.additionalSources !== undefined) {
    update.additionalSources = validateAdditionalSources(
      body.additionalSources,
    );
  }

  if (body.findingSourceIds !== undefined) {
    update.findingSourceIds = validateFindingSourceIds(body.findingSourceIds);
  }

  if (body.reviewReason !== undefined) {
    update.reviewReason = optionalString(body.reviewReason, "reviewReason");
  }

  if (body.conflictReason !== undefined) {
    update.conflictReason = optionalString(
      body.conflictReason,
      "conflictReason",
    );
  }

  if (body.reviewNotes !== undefined) {
    update.reviewNotes = optionalString(body.reviewNotes, "reviewNotes");
  }

  return update;
}

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
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

  const { id } = await params;

  try {
    const draft = await getJurisdictionReviewDraft(id);

    if (!draft) {
      return jsonError("Jurisdiction review not found.", 404);
    }

    if (!clearedForState(session, draft.stateCode)) {
      return jsonError(
        `You are not cleared to review jurisdiction rules in ${draft.stateCode}.`,
        403,
      );
    }

    return NextResponse.json({
      ok: true,

      operator: {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
      },

      draft,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unable to load jurisdiction review.",
      500,
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await resolveStaffSession();

  if (!session) {
    return jsonError(STAFF_AUTHENTICATION_REQUIRED_MESSAGE, 401);
  }

  if (!can(session, "jurisdiction.write")) {
    return jsonError(
      "You do not have permission to update jurisdiction reviews.",
      403,
    );
  }

  const { id } = await params;

  try {
    const current = await getJurisdictionReviewDraft(id);

    if (!current) {
      return jsonError("Jurisdiction review not found.", 404);
    }

    if (!clearedForState(session, current.stateCode)) {
      return jsonError(
        `You are not cleared to review jurisdiction rules in ${current.stateCode}.`,
        403,
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }

    const update = parseUpdate(body);

    const draft = await updateJurisdictionReviewDraft({
      id,

      update,

      actorUserId: session.user.id,

      actorName: session.user.name,
    });

    return NextResponse.json({
      ok: true,

      draft,

      safety: {
        legalRuleApproved: false,

        jurisdictionActivated: false,

        intakeAllowed: false,

        approvalPermissionRequired: "compliance.approve",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update jurisdiction review.";

    const status =
      message.includes("must be") ||
      message.includes("Unsupported") ||
      message.includes("cannot approve") ||
      message.includes("Missing:") ||
      message.includes("selected") ||
      message.includes("scope")
        ? 400
        : 500;

    return jsonError(message, status);
  }
}