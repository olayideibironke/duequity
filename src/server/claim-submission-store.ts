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
 * CLAIM SUBMISSION STORE
 *
 * Durable Supabase-backed repository for recording external claim-submission
 * facts after independent pre-filing approval.
 *
 * This store DOES NOT:
 *
 *   - send a claim;
 *   - contact an authority;
 *   - upload to a government portal;
 *   - email an agency;
 *   - file a court pleading.
 *
 * It records real-world events that have already occurred.
 *
 * CLAIMANT-CONTROLLED ROUTES
 *
 * Where the approved filing package says representativeMayFile = "no",
 * the database independently requires:
 *
 *   routeMode = claimant_controlled
 *   filingParty = claimant
 *
 * The application therefore cannot persist DueQuity as the filer for those
 * jurisdictions.
 *
 * FILING DESTINATION PROVENANCE
 *
 * Every durable external submission now carries:
 *
 *   - filing destination ID;
 *   - filing destination version;
 *   - exact frozen destination snapshot;
 *   - SHA-256 snapshot hash.
 *
 * The application supplies only the verified filing-destination ID.
 *
 * PostgreSQL independently resolves and freezes the destination version,
 * snapshot and hash through the claim-submission insert guard.
 *
 * This means the application cannot invent or substitute its own historical
 * destination snapshot.
 *
 * DURABILITY
 *
 * Submission and acknowledgment records are stored in Supabase.
 *
 * The original filing-package provenance, destination provenance and
 * submission facts are immutable.
 *
 * Authority acknowledgment is the only supported state transition in this
 * narrow workflow.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type ClaimSubmissionRouteMode =
  | "claimant_controlled"
  | "representative_controlled";

export type ClaimSubmissionFilingParty =
  | "claimant"
  | "authorized_representative";

export type ClaimSubmissionStatus =
  | "submitted"
  | "acknowledged";

export interface PersistedClaimSubmission {
  id: string;

  claimId: string;

  claimReference: string;

  filingPackageId: string;

  filingPackageVersion: number;

  routeMode: ClaimSubmissionRouteMode;

  filingParty: ClaimSubmissionFilingParty;

  authorityName: string;

  custodian: string;

  submissionMethod: string;

  filingDestinationId: string;

  filingDestinationVersion: number;

  filingDestinationSnapshot: Record<
    string,
    unknown
  >;

  filingDestinationSnapshotHash: string;

  status: ClaimSubmissionStatus;

  submittedAt: IsoInstant;

  recordedByUserId: string;

  externalReference?: string;

  submissionNote?: string;

  acknowledgedAt?: IsoInstant;

  acknowledgmentRecordedByUserId?: string;

  acknowledgmentReference?: string;

  acknowledgmentSummary?: string;

  rowVersion: number;

  createdAt: IsoInstant;

  updatedAt: IsoInstant;
}

export type ClaimSubmissionAuditAction =
  | "claim_submission_recorded"
  | "claim_submission_acknowledged";

export interface ClaimSubmissionAuditEntry {
  id: string;

  claimId: string;

  submissionId: string;

  action: ClaimSubmissionAuditAction;

  actorUserId: string;

  occurredAt: IsoInstant;

  detail?: string;
}

/* ========================================================================== */
/* Inputs                                                                      */
/* ========================================================================== */

export interface RecordClaimSubmissionInput {
  claimId: string;

  claimReference: string;

  filingPackageId: string;

  filingPackageVersion: number;

  routeMode: ClaimSubmissionRouteMode;

  filingParty: ClaimSubmissionFilingParty;

  authorityName: string;

  custodian: string;

  submissionMethod: string;

  filingDestinationId: string;

  submittedAt: IsoInstant;

  actorUserId: string;

  externalReference?: string;

  submissionNote?: string;
}

export interface RecordClaimSubmissionAcknowledgmentInput {
  submissionId: string;

  acknowledgedAt: IsoInstant;

  actorUserId: string;

  externalReference?: string;

  acknowledgmentSummary?: string;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimSubmissionRow {
  id: string;

  claim_id: string;

  claim_reference: string;

  filing_package_id: string;

  filing_package_version: number;

  route_mode: ClaimSubmissionRouteMode;

  filing_party: ClaimSubmissionFilingParty;

  authority_name: string;

  custodian: string;

  submission_method: string;

  filing_destination_id: string;

  filing_destination_version: number;

  filing_destination_snapshot:
    Record<
      string,
      unknown
    >;

  filing_destination_snapshot_hash: string;

  status: ClaimSubmissionStatus;

  submitted_at: string;

  recorded_by_user_id: string;

  external_reference: string | null;

  submission_note: string | null;

  acknowledged_at: string | null;

  acknowledgment_recorded_by_user_id: string | null;

  acknowledgment_reference: string | null;

  acknowledgment_summary: string | null;

  row_version: number;

  created_at: string;

  updated_at: string;
}

interface ClaimSubmissionAuditRow {
  id: string;

  claim_id: string;

  submission_id: string;

  action: ClaimSubmissionAuditAction;

  actor_user_id: string;

  occurred_at: string;

  detail: string | null;
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
  value: string | undefined,
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

function assertRoutePairing(
  routeMode:
    ClaimSubmissionRouteMode,
  filingParty:
    ClaimSubmissionFilingParty,
): void {
  if (
    routeMode ===
      "claimant_controlled" &&
    filingParty !==
      "claimant"
  ) {
    throw new Error(
      "A claimant-controlled submission must be recorded with the claimant as the filing party.",
    );
  }

  if (
    routeMode ===
      "representative_controlled" &&
    filingParty !==
      "authorized_representative"
  ) {
    throw new Error(
      "A representative-controlled submission must be recorded with an authorized representative as the filing party.",
    );
  }
}

/* ========================================================================== */
/* Mapping                                                                     */
/* ========================================================================== */

function submissionFromRow(
  row:
    ClaimSubmissionRow,
): PersistedClaimSubmission {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    claimReference:
      row.claim_reference,

    filingPackageId:
      row.filing_package_id,

    filingPackageVersion:
      Number(
        row.filing_package_version,
      ),

    routeMode:
      row.route_mode,

    filingParty:
      row.filing_party,

    authorityName:
      row.authority_name,

    custodian:
      row.custodian,

    submissionMethod:
      row.submission_method,

    filingDestinationId:
      row.filing_destination_id,

    filingDestinationVersion:
      Number(
        row.filing_destination_version,
      ),

    filingDestinationSnapshot:
      row.filing_destination_snapshot,

    filingDestinationSnapshotHash:
      row.filing_destination_snapshot_hash,

    status:
      row.status,

    submittedAt:
      row.submitted_at as IsoInstant,

    recordedByUserId:
      row.recorded_by_user_id,

    externalReference:
      row.external_reference ??
      undefined,

    submissionNote:
      row.submission_note ??
      undefined,

    acknowledgedAt:
      row.acknowledged_at
        ? row.acknowledged_at as IsoInstant
        : undefined,

    acknowledgmentRecordedByUserId:
      row.acknowledgment_recorded_by_user_id ??
      undefined,

    acknowledgmentReference:
      row.acknowledgment_reference ??
      undefined,

    acknowledgmentSummary:
      row.acknowledgment_summary ??
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
    ClaimSubmissionAuditRow,
): ClaimSubmissionAuditEntry {
  return {
    id:
      row.id,

    claimId:
      row.claim_id,

    submissionId:
      row.submission_id,

    action:
      row.action,

    actorUserId:
      row.actor_user_id,

    occurredAt:
      row.occurred_at as IsoInstant,

    detail:
      row.detail ??
      undefined,
  };
}

/* ========================================================================== */
/* Database helpers                                                            */
/* ========================================================================== */

async function getSubmissionRow(
  submissionId: string,
): Promise<
  ClaimSubmissionRow | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_submissions",
      )
      .select(
        "*",
      )
      .eq(
        "id",
        submissionId.trim(),
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read claim submission: ${error.message}`,
    );
  }

  return data
    ? data as unknown as
        ClaimSubmissionRow
    : undefined;
}

async function appendAudit(
  input: {
    claimId: string;

    submissionId: string;

    action:
      ClaimSubmissionAuditAction;

    actorUserId: string;

    occurredAt: IsoInstant;

    detail?: string;
  },
): Promise<void> {
  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } =
    await supabase
      .from(
        "claim_submission_audit",
      )
      .insert({
        id:
          randomUUID(),

        claim_id:
          input.claimId,

        submission_id:
          input.submissionId,

        action:
          input.action,

        actor_user_id:
          input.actorUserId,

        occurred_at:
          input.occurredAt,

        detail:
          input.detail ??
          null,
      });

  if (error) {
    throw new Error(
      `Unable to write claim-submission audit: ${error.message}`,
    );
  }
}

/* ========================================================================== */
/* Reads                                                                       */
/* ========================================================================== */

export async function listClaimSubmissions(
  claimId?: string,
): Promise<
  PersistedClaimSubmission[]
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claim_submissions",
      )
      .select(
        "*",
      )
      .order(
        "submitted_at",
        {
          ascending:
            false,
        },
      );

  if (claimId) {
    query =
      query.eq(
        "claim_id",
        claimId.trim(),
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw new Error(
      `Unable to list claim submissions: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ).map(
    (
      row,
    ) =>
      submissionFromRow(
        row as unknown as
          ClaimSubmissionRow,
      ),
  );
}

export async function getClaimSubmission(
  submissionId: string,
): Promise<
  PersistedClaimSubmission | undefined
> {
  const row =
    await getSubmissionRow(
      submissionId,
    );

  return row
    ? submissionFromRow(
        row,
      )
    : undefined;
}

export async function getClaimSubmissionByClaimId(
  claimId: string,
): Promise<
  PersistedClaimSubmission | undefined
> {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_submissions",
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
      `Unable to read claim submission: ${error.message}`,
    );
  }

  return data
    ? submissionFromRow(
        data as unknown as
          ClaimSubmissionRow,
      )
    : undefined;
}

export async function claimSubmissionAudit(
  claimId?: string,
): Promise<
  ClaimSubmissionAuditEntry[]
> {
  const supabase =
    getSupabaseAdmin();

  let query =
    supabase
      .from(
        "claim_submission_audit",
      )
      .select(
        "*",
      )
      .order(
        "occurred_at",
        {
          ascending:
            false,
        },
      );

  if (claimId) {
    query =
      query.eq(
        "claim_id",
        claimId.trim(),
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw new Error(
      `Unable to read claim-submission audit: ${error.message}`,
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
          ClaimSubmissionAuditRow,
      ),
  );
}

/* ========================================================================== */
/* Record external submission                                                  */
/* ========================================================================== */

export async function recordClaimSubmission(
  input:
    RecordClaimSubmissionInput,
): Promise<
  PersistedClaimSubmission
> {
  const claimId =
    requireNonEmpty(
      input.claimId,
      "Claim ID",
    );

  const claimReference =
    requireNonEmpty(
      input.claimReference,
      "Claim reference",
    );

  const filingPackageId =
    requireNonEmpty(
      input.filingPackageId,
      "Filing package ID",
    );

  const filingDestinationId =
    requireNonEmpty(
      input.filingDestinationId,
      "Filing destination ID",
    );

  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const authorityName =
    requireNonEmpty(
      input.authorityName,
      "Authority name",
    );

  const custodian =
    requireNonEmpty(
      input.custodian,
      "Custodian",
    );

  const submissionMethod =
    requireNonEmpty(
      input.submissionMethod,
      "Submission method",
    );

  const submittedAt =
    validateIsoInstant(
      input.submittedAt,
      "Submitted at",
    );

  if (
    !Number.isInteger(
      input.filingPackageVersion,
    ) ||
    input.filingPackageVersion <
      1
  ) {
    throw new Error(
      "Filing package version must be a positive integer.",
    );
  }

  assertRoutePairing(
    input.routeMode,
    input.filingParty,
  );

  const existing =
    await getClaimSubmissionByClaimId(
      claimId,
    );

  if (existing) {
    throw new Error(
      "An external submission has already been recorded for this claim.",
    );
  }

  const submissionId =
    `claim-submission-${randomUUID()}`;

  const externalReference =
    optionalText(
      input.externalReference,
    );

  const submissionNote =
    optionalText(
      input.submissionNote,
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_submissions",
      )
      .insert({
        id:
          submissionId,

        claim_id:
          claimId,

        claim_reference:
          claimReference,

        filing_package_id:
          filingPackageId,

        filing_package_version:
          input.filingPackageVersion,

        route_mode:
          input.routeMode,

        filing_party:
          input.filingParty,

        authority_name:
          authorityName,

        custodian,

        submission_method:
          submissionMethod,

        filing_destination_id:
          filingDestinationId,

        status:
          "submitted",

        submitted_at:
          submittedAt,

        recorded_by_user_id:
          actorUserId,

        external_reference:
          externalReference ??
          null,

        submission_note:
          submissionNote ??
          null,
      })
      .select(
        "*",
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to record claim submission: ${error.message}`,
    );
  }

  const inserted =
    submissionFromRow(
      data as unknown as
        ClaimSubmissionRow,
    );

  await appendAudit({
    claimId:
      inserted.claimId,

    submissionId:
      inserted.id,

    action:
      "claim_submission_recorded",

    actorUserId,

    occurredAt:
      submittedAt,

    detail:
      inserted.routeMode ===
      "claimant_controlled"
        ? `External claimant-controlled submission recorded for ${inserted.authorityName} by ${inserted.submissionMethod}. Verified filing destination ${inserted.filingDestinationId} version ${inserted.filingDestinationVersion} was frozen into submission provenance. DueQuity was not recorded as the filer.`
        : `External authorized-representative submission recorded for ${inserted.authorityName} by ${inserted.submissionMethod}. Verified filing destination ${inserted.filingDestinationId} version ${inserted.filingDestinationVersion} was frozen into submission provenance.`,
  });

  return inserted;
}

/* ========================================================================== */
/* Record authority acknowledgment                                             */
/* ========================================================================== */

export async function recordClaimSubmissionAcknowledgment(
  input:
    RecordClaimSubmissionAcknowledgmentInput,
): Promise<
  PersistedClaimSubmission
> {
  const submissionId =
    requireNonEmpty(
      input.submissionId,
      "Submission ID",
    );

  const actorUserId =
    requireNonEmpty(
      input.actorUserId,
      "Actor user ID",
    );

  const acknowledgedAt =
    validateIsoInstant(
      input.acknowledgedAt,
      "Acknowledged at",
    );

  const row =
    await getSubmissionRow(
      submissionId,
    );

  if (!row) {
    throw new Error(
      "Claim submission not found.",
    );
  }

  const current =
    submissionFromRow(
      row,
    );

  if (
    current.status ===
    "acknowledged"
  ) {
    return current;
  }

  if (
    current.status !==
    "submitted"
  ) {
    throw new Error(
      "Authority acknowledgment can only be recorded after an external submission.",
    );
  }

  if (
    Date.parse(
      acknowledgedAt,
    ) <
    Date.parse(
      current.submittedAt,
    )
  ) {
    throw new Error(
      "Authority acknowledgment cannot precede the recorded external submission.",
    );
  }

  const acknowledgmentReference =
    optionalText(
      input.externalReference,
    );

  const acknowledgmentSummary =
    optionalText(
      input.acknowledgmentSummary,
    );

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "claim_submissions",
      )
      .update({
        status:
          "acknowledged",

        acknowledged_at:
          acknowledgedAt,

        acknowledgment_recorded_by_user_id:
          actorUserId,

        acknowledgment_reference:
          acknowledgmentReference ??
          null,

        acknowledgment_summary:
          acknowledgmentSummary ??
          null,
      })
      .eq(
        "id",
        current.id,
      )
      .eq(
        "row_version",
        current.rowVersion,
      )
      .select(
        "*",
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to record authority acknowledgment: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "The claim submission changed while this request was being processed. Reload and try again.",
    );
  }

  const updated =
    submissionFromRow(
      data as unknown as
        ClaimSubmissionRow,
    );

  await appendAudit({
    claimId:
      updated.claimId,

    submissionId:
      updated.id,

    action:
      "claim_submission_acknowledged",

    actorUserId,

    occurredAt:
      acknowledgedAt,

    detail:
      acknowledgmentSummary
        ? `Authority acknowledgment recorded. ${acknowledgmentSummary}`
        : "Authority acknowledgment recorded.",
  });

  return updated;
}