import "server-only";

import {
  createHash,
} from "node:crypto";

import {
  CLAIM_DOCUMENT_STORAGE_BUCKET,
} from "@/server/claim-document-store";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export interface SignedAgreementDocumentResult {
  bytes:
    Uint8Array;

  fileName:
    string;

  mimeType:
    "application/pdf";

  byteSize:
    number;

  pageCount?:
    number;

  sha256:
    string;

  documentId:
    string;

  envelopeId:
    string;

  claimId:
    string;

  claimReference:
    string;

  claimantId:
    string;

  claimantReference:
    string;

  signedAt:
    string;
}

interface AgreementDocumentEnvelopeRow {
  id:
    string;

  claim_id:
    string;

  claim_reference:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  claimant_auth_user_id:
    string;

  status:
    string;

  signed_at:
    string | null;

  final_document_id:
    string | null;

  final_document_sha256:
    string | null;
}

interface ClaimDocumentRow {
  id:
    string;

  claim_id:
    string;

  claimant_id:
    string | null;

  kind:
    string;

  title:
    string;

  original_file_name:
    string | null;

  mime_type:
    string;

  byte_size:
    number | string;

  status:
    string;

  storage_bucket:
    string;

  storage_key:
    string;

  malware_scan_status:
    string;

  page_count:
    number | null;
}

interface ClaimantAgreementOnboardingRow {
  claim_id:
    string;

  claimant_id:
    string;

  claimant_auth_user_id:
    string | null;

  assigned_staff_user_id:
    string;

  service_agreement_signed_at:
    string | null;

  service_agreement_document_id:
    string | null;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function requiredText(
  value:
    string | null | undefined,
  label:
    string,
): string {
  const normalized =
    value?.trim() ??
    "";

  if (
    !normalized
  ) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}

function sha256(
  bytes:
    Uint8Array,
): string {
  return createHash(
    "sha256",
  )
    .update(
      bytes,
    )
    .digest(
      "hex",
    );
}

function safeFileName(
  value:
    string,
): string {
  const normalized =
    value
      .replace(
        /[\r\n"]/g,
        "",
      )
      .replace(
        /[\\/:*?<>|]+/g,
        "-",
      )
      .trim();

  if (
    !normalized
  ) {
    return "DueQuity-Recovery-Services-Agreement-Signed.pdf";
  }

  return normalized
    .toLowerCase()
    .endsWith(
      ".pdf",
    )
    ? normalized
    : `${normalized}.pdf`;
}

/* ========================================================================== */
/* Database reads                                                              */
/* ========================================================================== */

async function getEnvelope(
  envelopeId:
    string,
): Promise<
  AgreementDocumentEnvelopeRow
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claimant_agreement_envelopes",
      )
      .select(
        [
          "id",
          "claim_id",
          "claim_reference",
          "claimant_id",
          "claimant_reference",
          "claimant_auth_user_id",
          "status",
          "signed_at",
          "final_document_id",
          "final_document_sha256",
        ].join(
          ", ",
        ),
      )
      .eq(
        "id",
        envelopeId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve signed agreement: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Signed agreement could not be found.",
    );
  }

  return data as unknown as
    AgreementDocumentEnvelopeRow;
}

async function getOnboarding({
  claimId,
  claimantId,
}: {
  claimId:
    string;

  claimantId:
    string;
}): Promise<
  ClaimantAgreementOnboardingRow
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claimant_onboarding",
      )
      .select(
        [
          "claim_id",
          "claimant_id",
          "claimant_auth_user_id",
          "assigned_staff_user_id",
          "service_agreement_signed_at",
          "service_agreement_document_id",
        ].join(
          ", ",
        ),
      )
      .eq(
        "claim_id",
        claimId,
      )
      .eq(
        "claimant_id",
        claimantId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve signed agreement ownership: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Signed agreement claimant record could not be found.",
    );
  }

  return data as unknown as
    ClaimantAgreementOnboardingRow;
}

async function getDocument(
  documentId:
    string,
): Promise<
  ClaimDocumentRow
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "claim_documents",
      )
      .select(
        [
          "id",
          "claim_id",
          "claimant_id",
          "kind",
          "title",
          "original_file_name",
          "mime_type",
          "byte_size",
          "status",
          "storage_bucket",
          "storage_key",
          "malware_scan_status",
          "page_count",
        ].join(
          ", ",
        ),
      )
      .eq(
        "id",
        documentId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to resolve signed agreement document: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Signed agreement document could not be found.",
    );
  }

  return data as unknown as
    ClaimDocumentRow;
}

/* ========================================================================== */
/* Integrity                                                                   */
/* ========================================================================== */

function validateFinalDocumentChain({
  envelope,
  onboarding,
  document,
}: {
  envelope:
    AgreementDocumentEnvelopeRow;

  onboarding:
    ClaimantAgreementOnboardingRow;

  document:
    ClaimDocumentRow;
}): void {
  if (
    envelope.status !==
      "submitted" ||
    !envelope.signed_at ||
    !envelope.final_document_id ||
    !envelope.final_document_sha256
  ) {
    throw new Error(
      "This agreement does not yet have complete signed document evidence.",
    );
  }

  if (
    onboarding
      .service_agreement_document_id !==
      envelope.final_document_id ||
    !onboarding
      .service_agreement_signed_at
  ) {
    throw new Error(
      "Signed agreement onboarding provenance does not match the final document.",
    );
  }

  if (
    document.id !==
      envelope.final_document_id ||
    document.claim_id !==
      envelope.claim_id ||
    document.claimant_id !==
      envelope.claimant_id
  ) {
    throw new Error(
      "Signed agreement document ownership does not match the agreement envelope.",
    );
  }

  if (
    document.kind !==
    "fee_agreement"
  ) {
    throw new Error(
      "Final agreement document has an invalid document type.",
    );
  }

  if (
    document.status !==
      "accepted"
  ) {
    throw new Error(
      "Final agreement document is not in accepted status.",
    );
  }

  if (
    document
      .malware_scan_status !==
    "clean"
  ) {
    throw new Error(
      "Final agreement document has not passed the required document safety state.",
    );
  }

  if (
    document
      .storage_bucket !==
    CLAIM_DOCUMENT_STORAGE_BUCKET
  ) {
    throw new Error(
      "Final agreement document is stored outside the approved private document bucket.",
    );
  }

  if (
    document.mime_type !==
    "application/pdf"
  ) {
    throw new Error(
      "Final agreement document is not a PDF.",
    );
  }
}

/* ========================================================================== */
/* Private storage                                                             */
/* ========================================================================== */

async function downloadVerifiedPdf({
  envelope,
  document,
}: {
  envelope:
    AgreementDocumentEnvelopeRow;

  document:
    ClaimDocumentRow;
}): Promise<
  Uint8Array
> {
  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        CLAIM_DOCUMENT_STORAGE_BUCKET,
      )
      .download(
        document.storage_key,
      );

  if (
    error
  ) {
    throw new Error(
      `Signed agreement PDF could not be retrieved securely: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Signed agreement PDF could not be retrieved securely.",
    );
  }

  const bytes =
    new Uint8Array(
      await data.arrayBuffer(),
    );

  if (
    bytes.byteLength <=
    0
  ) {
    throw new Error(
      "Stored signed agreement PDF is empty.",
    );
  }

  const recordedSize =
    Number(
      document.byte_size,
    );

  if (
    !Number.isSafeInteger(
      recordedSize,
    ) ||
    recordedSize <=
      0 ||
    recordedSize !==
      bytes.byteLength
  ) {
    throw new Error(
      "Signed agreement PDF size does not match its immutable document record.",
    );
  }

  const actualHash =
    sha256(
      bytes,
    );

  if (
    actualHash !==
    envelope
      .final_document_sha256
  ) {
    throw new Error(
      "Signed agreement PDF integrity verification failed.",
    );
  }

  return bytes;
}

/* ========================================================================== */
/* Common document resolver                                                    */
/* ========================================================================== */

async function resolveAuthorizedDocument({
  envelopeId,
  authorize,
}: {
  envelopeId:
    string;

  authorize: (
    envelope:
      AgreementDocumentEnvelopeRow,
    onboarding:
      ClaimantAgreementOnboardingRow,
  ) =>
    void;
}): Promise<
  SignedAgreementDocumentResult
> {
  const normalizedEnvelopeId =
    requiredText(
      envelopeId,
      "Agreement ID",
    );

  const envelope =
    await getEnvelope(
      normalizedEnvelopeId,
    );

  const onboarding =
    await getOnboarding({
      claimId:
        envelope.claim_id,

      claimantId:
        envelope.claimant_id,
    });

  authorize(
    envelope,
    onboarding,
  );

  const documentId =
    requiredText(
      envelope
        .final_document_id,
      "Final agreement document ID",
    );

  const document =
    await getDocument(
      documentId,
    );

  validateFinalDocumentChain({
    envelope,

    onboarding,

    document,
  });

  const bytes =
    await downloadVerifiedPdf({
      envelope,

      document,
    });

  return {
    bytes,

    fileName:
      safeFileName(
        document
          .original_file_name ??
        `DueQuity-Recovery-Services-Agreement-${envelope.claim_reference}-Signed.pdf`,
      ),

    mimeType:
      "application/pdf",

    byteSize:
      bytes.byteLength,

    pageCount:
      document.page_count ??
      undefined,

    sha256:
      requiredText(
        envelope
          .final_document_sha256,
        "Final agreement document hash",
      ),

    documentId:
      document.id,

    envelopeId:
      envelope.id,

    claimId:
      envelope.claim_id,

    claimReference:
      envelope.claim_reference,

    claimantId:
      envelope.claimant_id,

    claimantReference:
      envelope.claimant_reference,

    signedAt:
      requiredText(
        envelope.signed_at,
        "Agreement signed timestamp",
      ),
  };
}

/* ========================================================================== */
/* Claimant access                                                             */
/* ========================================================================== */

export async function getSignedAgreementDocumentForClaimant({
  claimantId,
  claimantAuthUserId,
  envelopeId,
}: {
  claimantId:
    string;

  claimantAuthUserId:
    string;

  envelopeId:
    string;
}): Promise<
  SignedAgreementDocumentResult
> {
  const normalizedClaimantId =
    requiredText(
      claimantId,
      "Claimant ID",
    );

  const normalizedAuthUserId =
    requiredText(
      claimantAuthUserId,
      "Claimant authentication user ID",
    );

  return resolveAuthorizedDocument({
    envelopeId,

    authorize: (
      envelope,
      onboarding,
    ) => {
      if (
        envelope.claimant_id !==
          normalizedClaimantId ||
        onboarding.claimant_id !==
          normalizedClaimantId
      ) {
        throw new Error(
          "Signed agreement does not belong to this claimant.",
        );
      }

      if (
        envelope
          .claimant_auth_user_id !==
          normalizedAuthUserId ||
        onboarding
          .claimant_auth_user_id !==
          normalizedAuthUserId
      ) {
        throw new Error(
          "Authenticated claimant does not own this signed agreement.",
        );
      }
    },
  });
}

/* ========================================================================== */
/* Staff access                                                                */
/* ========================================================================== */

export async function getSignedAgreementDocumentForStaff({
  actorStaffUserId,
  actorRole,
  envelopeId,
}: {
  actorStaffUserId:
    string;

  actorRole:
    string;

  envelopeId:
    string;
}): Promise<
  SignedAgreementDocumentResult
> {
  const normalizedStaffUserId =
    requiredText(
      actorStaffUserId,
      "Staff user ID",
    );

  const normalizedRole =
    requiredText(
      actorRole,
      "Staff role",
    );

  return resolveAuthorizedDocument({
    envelopeId,

    authorize: (
      _envelope,
      onboarding,
    ) => {
      if (
        normalizedRole ===
        "super_admin"
      ) {
        return;
      }

      if (
        onboarding
          .assigned_staff_user_id !==
        normalizedStaffUserId
      ) {
        throw new Error(
          "This claimant is not currently assigned to your staff account.",
        );
      }
    },
  });
}