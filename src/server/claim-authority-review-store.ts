import "server-only";

import {
  randomUUID,
} from "node:crypto";

import type {
  IsoInstant,
} from "@/domain/types";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/**
 * CLAIM AUTHORITY REVIEW STORE
 *
 * Durable post-submission authority lifecycle.
 *
 * Submission and acknowledgment remain owned by claim_submissions.
 *
 * Once a durable external submission is recorded, Supabase automatically opens
 * the corresponding authority-review lifecycle and freezes its submission,
 * filing-package and filing-destination provenance.
 *
 * This store manages what happens after submission:
 *
 *   awaiting acknowledgment
 *   -> acknowledged
 *   -> under review
 *   -> additional information required
 *   -> approved / denied
 *   -> payment issued
 *   -> recovered
 *   -> closed
 *
 * Authority information requests are separate durable records because one claim
 * may receive multiple requests from the government authority.
 *
 * State transitions and their audit events are performed transactionally by
 * PostgreSQL functions. The application does not update lifecycle state and
 * append audit in separate requests.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type ClaimAuthorityReviewStatus =
  | "awaiting_acknowledgment"
  | "acknowledged"
  | "under_review"
  | "additional_information_required"
  | "approved"
  | "denied"
  | "payment_issued"
  | "recovered"
  | "closed";

export type ClaimAuthorityInformationRequestStatus =
  | "open"
  | "responded"
  | "satisfied"
  | "withdrawn";

export type ClaimAuthorityReviewAction =
  | "authority_review_started"
  | "authority_approved"
  | "authority_denied"
  | "authority_payment_issued"
  | "recovery_recorded"
  | "authority_review_closed";

export type ClaimAuthorityAuditAction =
  | "authority_review_opened"
  | "authority_acknowledged"
  | "authority_review_started"
  | "authority_information_requested"
  | "authority_information_responded"
  | "authority_information_satisfied"
  | "authority_information_withdrawn"
  | "authority_approved"
  | "authority_denied"
  | "authority_payment_issued"
  | "recovery_recorded"
  | "authority_review_closed";

export interface PersistedClaimAuthorityReview {
  id: string;

  claimId: string;

  claimReference: string;

  submissionId: string;

  filingPackageId: string;

  filingPackageVersion: number;

  filingDestinationId: string;

  filingDestinationVersion: number;

  filingDestinationSnapshotHash: string;

  authorityName: string;

  submissionMethod: string;

  status: ClaimAuthorityReviewStatus;

  openedAt: IsoInstant;

  acknowledgedAt?: IsoInstant;

  decisionAt?: IsoInstant;

  decisionReference?: string;

  decisionSummary?: string;

  approvedAmountCents?: number;

  denialReason?: string;

  paymentIssuedAt?: IsoInstant;

  paymentReference?: string;

  paymentAmountCents?: number;

  recoveredAt?: IsoInstant;

  recoveredAmountCents?: number;

  closedAt?: IsoInstant;

  closeSummary?: string;

  lastActionByUserId: string;

  rowVersion: number;

  createdAt: IsoInstant;

  updatedAt: IsoInstant;
}

export interface PersistedClaimAuthorityInformationRequest {
  id: string;

  authorityReviewId: string;

  claimId: string;

  submissionId: string;

  requestReference?: string;

  requestSummary: string;

  requestedAt: IsoInstant;

  dueAt?: IsoInstant;

  status:
    ClaimAuthorityInformationRequestStatus;

  responseReference?: string;

  responseSummary?: string;

  respondedAt?: IsoInstant;

  satisfiedAt?: IsoInstant;

  recordedByUserId: string;

  respondedByUserId?: string;

  rowVersion: number;

  createdAt: IsoInstant;

  updatedAt: IsoInstant;
}

export interface ClaimAuthorityAuditEntry {
  id: string;

  claimId: string;

  authorityReviewId: string;

  submissionId: string;

  action:
    ClaimAuthorityAuditAction;

  actorUserId: string;

  occurredAt: IsoInstant;

  externalReference?: string;

  summary?: string;

  detail?: Record<
    string,
    unknown
  >;

  createdAt: IsoInstant;
}

/* ========================================================================== */
/* Inputs                                                                      */
/* ========================================================================== */

export interface RecordAuthorityReviewStartedInput {
  reviewId: string;

  actorUserId: string;

  occurredAt: IsoInstant;

  externalReference?: string;

  summary?: string;
}

export interface RecordAuthorityInformationRequestInput {
  reviewId: string;

  actorUserId: string;

  requestedAt: IsoInstant;

  requestSummary: string;

  requestReference?: string;

  dueAt?: IsoInstant;
}

export interface RespondAuthorityInformationRequestInput {
  requestId: string;

  actorUserId: string;

  respondedAt: IsoInstant;

  responseSummary: string;

  responseReference?: string;
}

export interface ResolveAuthorityInformationRequestInput {
  requestId: string;

  actorUserId: string;

  occurredAt: IsoInstant;

  resolution:
    | "satisfied"
    | "withdrawn";

  summary?: string;
}

export interface RecordAuthorityApprovalInput {
  reviewId: string;

  actorUserId: string;

  occurredAt: IsoInstant;

  summary: string;

  externalReference?: string;

  approvedAmountCents?: number;
}

export interface RecordAuthorityDenialInput {
  reviewId: string;

  actorUserId: string;

  occurredAt: IsoInstant;

  denialReason: string;

  summary?: string;

  externalReference?: string;
}

export interface RecordAuthorityPaymentIssuedInput {
  reviewId: string;

  actorUserId: string;

  occurredAt: IsoInstant;

  paymentAmountCents: number;

  paymentReference?: string;

  summary?: string;
}

export interface RecordRecoveryInput {
  reviewId: string;

  actorUserId: string;

  occurredAt: IsoInstant;

  recoveredAmountCents: number;

  summary?: string;
}

export interface CloseAuthorityReviewInput {
  reviewId: string;

  actorUserId: string;

  occurredAt: IsoInstant;

  closeSummary: string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimAuthorityReviewRow {
  id: string;

  claim_id: string;

  claim_reference: string;

  submission_id: string;

  filing_package_id: string;

  filing_package_version: number;

  filing_destination_id: string;

  filing_destination_version: number;

  filing_destination_snapshot_hash: string;

  authority_name: string;

  submission_method: string;

  status:
    ClaimAuthorityReviewStatus;

  opened_at: string;

  acknowledged_at:
    string |
    null;

  decision_at:
    string |
    null;

  decision_reference:
    string |
    null;

  decision_summary:
    string |
    null;

  approved_amount_cents:
    number |
    null;

  denial_reason:
    string |
    null;

  payment_issued_at:
    string |
    null;

  payment_reference:
    string |
    null;

  payment_amount_cents:
    number |
    null;

  recovered_at:
    string |
    null;

  recovered_amount_cents:
    number |
    null;

  closed_at:
    string |
    null;

  close_summary:
    string |
    null;

  last_action_by_user_id: string;

  row_version: number;

  created_at: string;

  updated_at: string;
}

interface ClaimAuthorityInformationRequestRow {
  id: string;

  authority_review_id: string;

  claim_id: string;

  submission_id: string;

  request_reference:
    string |
    null;

  request_summary: string;

  requested_at: string;

  due_at:
    string |
    null;

  status:
    ClaimAuthorityInformationRequestStatus;

  response_reference:
    string |
    null;

  response_summary:
    string |
    null;

  responded_at:
    string |
    null;

  satisfied_at:
    string |
    null;

  recorded_by_user_id: string;

  responded_by_user_id:
    string |
    null;

  row_version: number;

  created_at: string;

  updated_at: string;
}

interface ClaimAuthorityAuditRow {
  id: string;

  claim_id: string;

  authority_review_id: string;

  submission_id: string;

  action:
    ClaimAuthorityAuditAction;

  actor_user_id: string;

  occurred_at: string;

  external_reference:
    string |
    null;

  summary:
    string |
    null;

  detail:
    Record<
      string,
      unknown
    > |
    null;

  created_at: string;
}

/* ========================================================================== */
/* Validation                                                                  */
/* ========================================================================== */

function requireNonEmpty(
  value: string,
  label: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function optionalText(
  value:
    string |
    undefined,
): string | undefined {
  const normalized =
    value?.trim();

  return normalized ||
    undefined;
}

function validateIsoInstant(
  value: string,
  label: string,
): IsoInstant {
  if (
    Number.isNaN(
      Date.parse(
        value,
      ),
    )
  ) {
    throw new Error(
      `${label} must be a valid ISO timestamp.`,
    );
  }

  return value;
}

function validateOptionalIsoInstant(
  value:
    string |
    undefined,
  label: string,
): IsoInstant | undefined {
  if (!value) {
    return undefined;
  }

  return validateIsoInstant(
    value,
    label,
  );
}

function validateCents(
  value: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <
      0
  ) {
    throw new Error(
      `${label} must be a non-negative whole-cent amount.`,
    );
  }

  return value;
}

function validateOptionalCents(
  value:
    number |
    undefined,
  label: string,
): number | undefined {
  if (
    value ===
    undefined
  ) {
    return undefined;
  }

  return validateCents(
    value,
    label,
  );
}

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function authorityReviewFromRow(
  row:
    ClaimAuthorityReviewRow,
): PersistedClaimAuthorityReview {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    submissionId:
      row.submission_id,

    filingPackageId:
      row.filing_package_id,

    filingPackageVersion:
      Number(
        row.filing_package_version,
      ),

    filingDestinationId:
      row.filing_destination_id,

    filingDestinationVersion:
      Number(
        row.filing_destination_version,
      ),

    filingDestinationSnapshotHash:
      row.filing_destination_snapshot_hash,

    authorityName:
      row.authority_name,

    submissionMethod:
      row.submission_method,

    status:
      row.status,

    openedAt:
      row.opened_at as IsoInstant,

    acknowledgedAt:
      row.acknowledged_at
        ? row.acknowledged_at as IsoInstant
        : undefined,

    decisionAt:
      row.decision_at
        ? row.decision_at as IsoInstant
        : undefined,

    decisionReference:
      row.decision_reference ??
      undefined,

    decisionSummary:
      row.decision_summary ??
      undefined,

    approvedAmountCents:
      row.approved_amount_cents ??
      undefined,

    denialReason:
      row.denial_reason ??
      undefined,

    paymentIssuedAt:
      row.payment_issued_at
        ? row.payment_issued_at as IsoInstant
        : undefined,

    paymentReference:
      row.payment_reference ??
      undefined,

    paymentAmountCents:
      row.payment_amount_cents ??
      undefined,

    recoveredAt:
      row.recovered_at
        ? row.recovered_at as IsoInstant
        : undefined,

    recoveredAmountCents:
      row.recovered_amount_cents ??
      undefined,

    closedAt:
      row.closed_at
        ? row.closed_at as IsoInstant
        : undefined,

    closeSummary:
      row.close_summary ??
      undefined,

    lastActionByUserId:
      row.last_action_by_user_id,

    rowVersion:
      Number(
        row.row_version,
      ),

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,
  };
}

function informationRequestFromRow(
  row:
    ClaimAuthorityInformationRequestRow,
): PersistedClaimAuthorityInformationRequest {
  return {
    id:
      row.id,

    authorityReviewId:
      row.authority_review_id,

    claimId:
      row.claim_id,

    submissionId:
      row.submission_id,

    requestReference:
      row.request_reference ??
      undefined,

    requestSummary:
      row.request_summary,

    requestedAt:
      row.requested_at as IsoInstant,

    dueAt:
      row.due_at
        ? row.due_at as IsoInstant
        : undefined,

    status:
      row.status,

    responseReference:
      row.response_reference ??
      undefined,

    responseSummary:
      row.response_summary ??
      undefined,

    respondedAt:
      row.responded_at
        ? row.responded_at as IsoInstant
        : undefined,

    satisfiedAt:
      row.satisfied_at
        ? row.satisfied_at as IsoInstant
        : undefined,

    recordedByUserId:
      row.recorded_by_user_id,

    respondedByUserId:
      row.responded_by_user_id ??
      undefined,

    rowVersion:
      Number(
        row.row_version,
      ),

    createdAt:
      row.created_at as IsoInstant,

    updatedAt:
      row.updated_at as IsoInstant,
  };
}

function auditFromRow(
  row:
    ClaimAuthorityAuditRow,
): ClaimAuthorityAuditEntry {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    authorityReviewId:
      row.authority_review_id,

    submissionId:
      row.submission_id,

    action:
      row.action,

    actorUserId:
      row.actor_user_id,

    occurredAt:
      row.occurred_at as IsoInstant,

    externalReference:
      row.external_reference ??
      undefined,

    summary:
      row.summary ??
      undefined,

    detail:
      row.detail ??
      undefined,

    createdAt:
      row.created_at as IsoInstant,
  };
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function getClaimAuthorityReview(
  reviewId: string,
): Promise<
  PersistedClaimAuthorityReview |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_authority_reviews",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        reviewId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read claim authority review: ${error.message}`,
    );
  }

  return data
    ? authorityReviewFromRow(
        data as unknown as
          ClaimAuthorityReviewRow,
      )
    : undefined;
}

export async function getClaimAuthorityReviewByClaimId(
  claimId: string,
): Promise<
  PersistedClaimAuthorityReview |
  undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_authority_reviews",
      )
      .select(
        "*",
      )
      .eq(
        "claim_id",
        claimId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read claim authority review: ${error.message}`,
    );
  }

  return data
    ? authorityReviewFromRow(
        data as unknown as
          ClaimAuthorityReviewRow,
      )
    : undefined;
}

export async function listClaimAuthorityInformationRequests(
  reviewId: string,
): Promise<
  PersistedClaimAuthorityInformationRequest[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_authority_information_requests",
      )
      .select(
        "*",
      )
      .eq(
        "authority_review_id",
        reviewId.trim(),
      )
      .order(
        "requested_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to read authority information requests: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      informationRequestFromRow(
        row as unknown as
          ClaimAuthorityInformationRequestRow,
      ),
  );
}

export async function claimAuthorityReviewAudit(
  reviewId: string,
): Promise<
  ClaimAuthorityAuditEntry[]
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_authority_review_audit",
      )
      .select(
        "*",
      )
      .eq(
        "authority_review_id",
        reviewId.trim(),
      )
      .order(
        "occurred_at",
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to read authority review audit: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      auditFromRow(
        row as unknown as
          ClaimAuthorityAuditRow,
      ),
  );
}

/* ========================================================================== */
/* Transactional review event                                                  */
/* ========================================================================== */

async function recordAuthorityReviewEvent(
  input: {
    reviewId: string;

    action:
      ClaimAuthorityReviewAction;

    actorUserId: string;

    occurredAt:
      IsoInstant;

    externalReference?: string;

    summary?: string;

    approvedAmountCents?: number;

    denialReason?: string;

    paymentReference?: string;

    paymentAmountCents?: number;

    recoveredAmountCents?: number;

    closeSummary?: string;
  },
): Promise<
  PersistedClaimAuthorityReview
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "record_claim_authority_review_event",
        {
          p_review_id:
            requireNonEmpty(
              input.reviewId,
              "Authority review ID",
            ),

          p_action:
            input.action,

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Occurred at",
            ),

          p_external_reference:
            optionalText(
              input.externalReference,
            ) ??
            null,

          p_summary:
            optionalText(
              input.summary,
            ) ??
            null,

          p_approved_amount_cents:
            validateOptionalCents(
              input.approvedAmountCents,
              "Approved amount",
            ) ??
            null,

          p_denial_reason:
            optionalText(
              input.denialReason,
            ) ??
            null,

          p_payment_reference:
            optionalText(
              input.paymentReference,
            ) ??
            null,

          p_payment_amount_cents:
            input.paymentAmountCents ===
              undefined
              ? null
              : validateCents(
                  input.paymentAmountCents,
                  "Payment amount",
                ),

          p_recovered_amount_cents:
            input.recoveredAmountCents ===
              undefined
              ? null
              : validateCents(
                  input.recoveredAmountCents,
                  "Recovered amount",
                ),

          p_close_summary:
            optionalText(
              input.closeSummary,
            ) ??
            null,
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to record authority review event: ${error.message}`,
    );
  }

  return authorityReviewFromRow(
    data as unknown as
      ClaimAuthorityReviewRow,
  );
}

/* ========================================================================== */
/* Review actions                                                              */
/* ========================================================================== */

export async function recordAuthorityReviewStarted(
  input:
    RecordAuthorityReviewStartedInput,
): Promise<
  PersistedClaimAuthorityReview
> {
  return recordAuthorityReviewEvent({
    reviewId:
      input.reviewId,

    action:
      "authority_review_started",

    actorUserId:
      input.actorUserId,

    occurredAt:
      validateIsoInstant(
        input.occurredAt,
        "Review started at",
      ),

    externalReference:
      optionalText(
        input.externalReference,
      ),

    summary:
      optionalText(
        input.summary,
      ),
  });
}

export async function recordAuthorityApproval(
  input:
    RecordAuthorityApprovalInput,
): Promise<
  PersistedClaimAuthorityReview
> {
  return recordAuthorityReviewEvent({
    reviewId:
      input.reviewId,

    action:
      "authority_approved",

    actorUserId:
      input.actorUserId,

    occurredAt:
      validateIsoInstant(
        input.occurredAt,
        "Approval timestamp",
      ),

    externalReference:
      optionalText(
        input.externalReference,
      ),

    summary:
      requireNonEmpty(
        input.summary,
        "Approval summary",
      ),

    approvedAmountCents:
      validateOptionalCents(
        input.approvedAmountCents,
        "Approved amount",
      ),
  });
}

export async function recordAuthorityDenial(
  input:
    RecordAuthorityDenialInput,
): Promise<
  PersistedClaimAuthorityReview
> {
  return recordAuthorityReviewEvent({
    reviewId:
      input.reviewId,

    action:
      "authority_denied",

    actorUserId:
      input.actorUserId,

    occurredAt:
      validateIsoInstant(
        input.occurredAt,
        "Denial timestamp",
      ),

    externalReference:
      optionalText(
        input.externalReference,
      ),

    summary:
      optionalText(
        input.summary,
      ),

    denialReason:
      requireNonEmpty(
        input.denialReason,
        "Denial reason",
      ),
  });
}

export async function recordAuthorityPaymentIssued(
  input:
    RecordAuthorityPaymentIssuedInput,
): Promise<
  PersistedClaimAuthorityReview
> {
  return recordAuthorityReviewEvent({
    reviewId:
      input.reviewId,

    action:
      "authority_payment_issued",

    actorUserId:
      input.actorUserId,

    occurredAt:
      validateIsoInstant(
        input.occurredAt,
        "Payment-issued timestamp",
      ),

    paymentReference:
      optionalText(
        input.paymentReference,
      ),

    paymentAmountCents:
      validateCents(
        input.paymentAmountCents,
        "Payment amount",
      ),

    summary:
      optionalText(
        input.summary,
      ),
  });
}

export async function recordRecovery(
  input:
    RecordRecoveryInput,
): Promise<
  PersistedClaimAuthorityReview
> {
  return recordAuthorityReviewEvent({
    reviewId:
      input.reviewId,

    action:
      "recovery_recorded",

    actorUserId:
      input.actorUserId,

    occurredAt:
      validateIsoInstant(
        input.occurredAt,
        "Recovery timestamp",
      ),

    recoveredAmountCents:
      validateCents(
        input.recoveredAmountCents,
        "Recovered amount",
      ),

    summary:
      optionalText(
        input.summary,
      ),
  });
}

export async function closeAuthorityReview(
  input:
    CloseAuthorityReviewInput,
): Promise<
  PersistedClaimAuthorityReview
> {
  return recordAuthorityReviewEvent({
    reviewId:
      input.reviewId,

    action:
      "authority_review_closed",

    actorUserId:
      input.actorUserId,

    occurredAt:
      validateIsoInstant(
        input.occurredAt,
        "Closure timestamp",
      ),

    closeSummary:
      requireNonEmpty(
        input.closeSummary,
        "Closure summary",
      ),
  });
}

/* ========================================================================== */
/* Information requests                                                        */
/* ========================================================================== */

export async function recordAuthorityInformationRequest(
  input:
    RecordAuthorityInformationRequestInput,
): Promise<
  PersistedClaimAuthorityInformationRequest
> {
  const supabase =
    getSupabaseAdmin();

  const requestId =
    `authority-information-request-${randomUUID()}`;

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "record_claim_authority_information_request",
        {
          p_review_id:
            requireNonEmpty(
              input.reviewId,
              "Authority review ID",
            ),

          p_request_id:
            requestId,

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_requested_at:
            validateIsoInstant(
              input.requestedAt,
              "Requested at",
            ),

          p_request_summary:
            requireNonEmpty(
              input.requestSummary,
              "Request summary",
            ),

          p_request_reference:
            optionalText(
              input.requestReference,
            ) ??
            null,

          p_due_at:
            validateOptionalIsoInstant(
              input.dueAt,
              "Due at",
            ) ??
            null,
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to record authority information request: ${error.message}`,
    );
  }

  return informationRequestFromRow(
    data as unknown as
      ClaimAuthorityInformationRequestRow,
  );
}

export async function respondAuthorityInformationRequest(
  input:
    RespondAuthorityInformationRequestInput,
): Promise<
  PersistedClaimAuthorityInformationRequest
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "respond_claim_authority_information_request",
        {
          p_request_id:
            requireNonEmpty(
              input.requestId,
              "Information request ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_responded_at:
            validateIsoInstant(
              input.respondedAt,
              "Responded at",
            ),

          p_response_summary:
            requireNonEmpty(
              input.responseSummary,
              "Response summary",
            ),

          p_response_reference:
            optionalText(
              input.responseReference,
            ) ??
            null,
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to record authority information response: ${error.message}`,
    );
  }

  return informationRequestFromRow(
    data as unknown as
      ClaimAuthorityInformationRequestRow,
  );
}

export async function resolveAuthorityInformationRequest(
  input:
    ResolveAuthorityInformationRequestInput,
): Promise<
  PersistedClaimAuthorityInformationRequest
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .rpc(
        "resolve_claim_authority_information_request",
        {
          p_request_id:
            requireNonEmpty(
              input.requestId,
              "Information request ID",
            ),

          p_actor_user_id:
            requireNonEmpty(
              input.actorUserId,
              "Actor user ID",
            ),

          p_occurred_at:
            validateIsoInstant(
              input.occurredAt,
              "Resolution timestamp",
            ),

          p_resolution:
            input.resolution,

          p_summary:
            optionalText(
              input.summary,
            ) ??
            null,
        },
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to resolve authority information request: ${error.message}`,
    );
  }

  return informationRequestFromRow(
    data as unknown as
      ClaimAuthorityInformationRequestRow,
  );
}