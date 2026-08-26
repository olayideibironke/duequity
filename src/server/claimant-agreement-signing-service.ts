import "server-only";

import {
  createHash,
} from "node:crypto";

import {
  CLAIM_DOCUMENT_STORAGE_BUCKET,
} from "@/server/claim-document-store";

import {
  generateSignedAgreementPdf,
} from "@/server/claimant-agreement-pdf";

import {
  getSupabaseAdmin,
} from "@/server/supabase-admin";

/* ========================================================================== */
/* Limits                                                                      */
/* ========================================================================== */

const MAX_SIGNATURE_BYTES =
  2 *
  1024 *
  1024;

const MAX_FINAL_PDF_BYTES =
  15 *
  1024 *
  1024;

/* ========================================================================== */
/* Public types                                                                */
/* ========================================================================== */

export interface FinalizeClaimantAgreementSignatureInput {
  claimantId:
    string;

  envelopeId:
    string;

  typedLegalName:
    string;

  signatureDataUrl:
    string;
}

export interface FinalizeClaimantAgreementSignatureResult {
  ok:
    true;

  status:
    "submitted";

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

  signedLegalName:
    string;

  signedAt:
    string;

  finalDocumentId:
    string;

  finalDocumentSha256:
    string;

  signatureSha256:
    string;

  fileName:
    string;

  pageCount:
    number;

  cancellationDeadline?:
    string;

  idempotent:
    boolean;
}

/* ========================================================================== */
/* Database rows                                                               */
/* ========================================================================== */

interface ClaimantOnboardingSigningRow {
  claim_id:
    string;

  claim_reference:
    string;

  claimant_id:
    string;

  claimant_reference:
    string;

  claimant_auth_user_id:
    string | null;

  legal_name:
    string;

  identity_verification:
    string;

  identity_verified_at:
    string | null;

  service_agreement_signed_at:
    string | null;

  service_agreement_document_id:
    string | null;
}

interface AgreementEnvelopeSigningRow {
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

  template_key:
    string;

  template_version:
    number | string;

  agreement_title:
    string;

  status:
    string;

  recovery_basis:
    "estimated" |
    "confirmed";

  recovery_amount_cents:
    number | string;

  fee_model:
    "percentage" |
    "flat" |
    "capped_success";

  selected_percentage:
    number | string | null;

  selected_flat_amount_cents:
    number | string | null;

  projected_fee_cents:
    number | string;

  projected_claimant_net_cents:
    number | string;

  payment_route:
    string;

  electronic_consent_at:
    string | null;

  electronic_consent_text_snapshot:
    string | null;

  acknowledged_keys_snapshot:
    string[] | null;

  required_acknowledgement_keys:
    string[];

  agreement_snapshot:
    unknown;

  agreement_hash:
    string;

  signed_legal_name:
    string | null;

  signature_sha256:
    string | null;

  signed_at:
    string | null;

  submitted_at:
    string | null;

  final_document_id:
    string | null;

  final_document_sha256:
    string | null;

  signature_certificate_snapshot:
    unknown;
}

interface AgreementSnapshot {
  schemaVersion:
    number;

  claimant: {
    claimantId:
      string;

    claimantReference:
      string;

    legalName:
      string;
  };

  claim: {
    claimId:
      string;

    claimReference:
      string;
  };

  jurisdiction: {
    label:
      string;

    paymentRoute:
      string;

    paymentLaunchTrack:
      string;

    cancellationPeriodDays:
      number | null;
  };

  commercial: {
    quoteId:
      string;

    snapshotHash:
      string;

    recoveryBasis:
      "estimated" |
      "confirmed";

    recoveryAmountCents:
      number;

    feeModel:
      "percentage" |
      "flat" |
      "capped_success";

    selectedPercentage?:
      number;

    selectedFlatAmountCents?:
      number;

    projectedFeeCents:
      number;

    projectedClaimantNetCents:
      number;
  };

  template: {
    templateId:
      string;

    templateKey:
      string;

    templateVersion:
      number;

    title:
      string;

    requiredAcknowledgementKeys:
      string[];

    electronicConsentText:
      string;

    signatureIntentText:
      string;
  };

  renderedAgreement:
    string;
}

interface FinalizerRpcResult {
  ok?:
    boolean;

  status?:
    string;

  claim_id?:
    string;

  claimant_id?:
    string;

  final_document_id?:
    string;

  final_document_sha256?:
    string;

  signed_at?:
    string;

  cancellation_deadline?:
    string | null;

  idempotent?:
    boolean;
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

function normalizeLegalName(
  value:
    string,
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " ",
    )
    .toLocaleLowerCase(
      "en-US",
    );
}

function sha256(
  value:
    Uint8Array |
    Buffer |
    string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
    )
    .digest(
      "hex",
    );
}

function integerValue(
  value:
    number | string,
  label:
    string,
): number {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <
      0
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return parsed;
}

function optionalMoneyValue(
  value:
    number | string | null,
): number | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  return integerValue(
    value,
    "Stored monetary value",
  );
}

function optionalPercentageValue(
  value:
    number | string | null,
): number | undefined {
  if (
    value ===
    null
  ) {
    return undefined;
  }

  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <
      0 ||
    parsed >
      1
  ) {
    throw new Error(
      "Stored agreement percentage is invalid.",
    );
  }

  return parsed;
}

function percentageLabel(
  value:
    number,
): string {
  const amount =
    value *
    100;

  return Number.isInteger(
    amount,
  )
    ? `${amount.toFixed(
        0,
      )}%`
    : `${amount.toFixed(
        2,
      )}%`;
}

function moneyLabel(
  cents:
    number,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  ).format(
    cents /
      100,
  );
}

function humanize(
  value:
    string,
): string {
  return value
    .replaceAll(
      "_",
      " ",
    )
    .replace(
      /\b\w/g,
      (
        character,
      ) =>
        character.toUpperCase(),
    );
}

/* ========================================================================== */
/* Signature parsing                                                           */
/* ========================================================================== */

function decodeSignaturePng(
  dataUrl:
    string,
): Buffer {
  const normalized =
    dataUrl.trim();

  const match =
    /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
      normalized,
    );

  if (
    !match
  ) {
    throw new Error(
      "Electronic signature must be submitted as a PNG image.",
    );
  }

  const base64 =
    match[1].replace(
      /\s+/g,
      "",
    );

  const buffer =
    Buffer.from(
      base64,
      "base64",
    );

  if (
    buffer.byteLength <
      100
  ) {
    throw new Error(
      "The drawn electronic signature is empty or invalid.",
    );
  }

  if (
    buffer.byteLength >
      MAX_SIGNATURE_BYTES
  ) {
    throw new Error(
      "The drawn electronic signature is too large.",
    );
  }

  const pngHeader =
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);

  if (
    buffer.subarray(
      0,
      8,
    ).compare(
      pngHeader,
    ) !==
    0
  ) {
    throw new Error(
      "Electronic signature image is not a valid PNG.",
    );
  }

  return buffer;
}

/* ========================================================================== */
/* Snapshot                                                                    */
/* ========================================================================== */

function agreementSnapshot(
  value:
    unknown,
): AgreementSnapshot {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "Stored agreement snapshot is invalid.",
    );
  }

  const snapshot =
    value as
      Partial<
        AgreementSnapshot
      >;

  if (
    !snapshot.claim ||
    !snapshot.claimant ||
    !snapshot.jurisdiction ||
    !snapshot.commercial ||
    !snapshot.template ||
    typeof snapshot.renderedAgreement !==
      "string" ||
    !snapshot.renderedAgreement.trim()
  ) {
    throw new Error(
      "Stored agreement snapshot is incomplete.",
    );
  }

  return value as
    AgreementSnapshot;
}

/* ========================================================================== */
/* Labels                                                                      */
/* ========================================================================== */

function feeStructureLabel(
  envelope:
    AgreementEnvelopeSigningRow,
): string {
  if (
    envelope.fee_model ===
    "percentage"
  ) {
    const selected =
      optionalPercentageValue(
        envelope
          .selected_percentage,
      );

    if (
      selected ===
      undefined
    ) {
      throw new Error(
        "Percentage agreement is missing its locked fee percentage.",
      );
    }

    return `${percentageLabel(
      selected,
    )} of actual recovery`;
  }

  if (
    envelope.fee_model ===
    "flat"
  ) {
    const amount =
      optionalMoneyValue(
        envelope
          .selected_flat_amount_cents,
      );

    if (
      amount ===
      undefined
    ) {
      throw new Error(
        "Flat-fee agreement is missing its locked service fee.",
      );
    }

    return `${moneyLabel(
      amount,
    )} flat service fee`;
  }

  const selected =
    optionalPercentageValue(
      envelope
        .selected_percentage,
    );

  if (
    selected ===
    undefined
  ) {
    throw new Error(
      "Capped-success agreement is missing its locked fee percentage.",
    );
  }

  return `${percentageLabel(
    selected,
  )} capped success-fee formula`;
}

/* ========================================================================== */
/* Database reads                                                              */
/* ========================================================================== */

async function getOnboardingSigningRow(
  claimantId:
    string,
): Promise<
  ClaimantOnboardingSigningRow
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
          "claim_reference",
          "claimant_id",
          "claimant_reference",
          "claimant_auth_user_id",
          "legal_name",
          "identity_verification",
          "identity_verified_at",
          "service_agreement_signed_at",
          "service_agreement_document_id",
        ].join(
          ", ",
        ),
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
      `Unable to resolve claimant signing profile: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Claimant signing profile could not be found.",
    );
  }

  return data as unknown as
    ClaimantOnboardingSigningRow;
}

async function getAgreementEnvelopeSigningRow({
  claimantId,
  envelopeId,
}: {
  claimantId:
    string;

  envelopeId:
    string;
}): Promise<
  AgreementEnvelopeSigningRow
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
          "template_key",
          "template_version",
          "agreement_title",
          "status",
          "recovery_basis",
          "recovery_amount_cents",
          "fee_model",
          "selected_percentage",
          "selected_flat_amount_cents",
          "projected_fee_cents",
          "projected_claimant_net_cents",
          "payment_route",
          "electronic_consent_at",
          "electronic_consent_text_snapshot",
          "acknowledged_keys_snapshot",
          "required_acknowledgement_keys",
          "agreement_snapshot",
          "agreement_hash",
          "signed_legal_name",
          "signature_sha256",
          "signed_at",
          "submitted_at",
          "final_document_id",
          "final_document_sha256",
          "signature_certificate_snapshot",
        ].join(
          ", ",
        ),
      )
      .eq(
        "id",
        envelopeId,
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
      `Unable to resolve claimant agreement for signature: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "Agreement could not be found for this claimant.",
    );
  }

  return data as unknown as
    AgreementEnvelopeSigningRow;
}

/* ========================================================================== */
/* Storage                                                                     */
/* ========================================================================== */

function finalDocumentId(
  envelopeId:
    string,
): string {
  return `doc-esign-${envelopeId}`;
}

function finalStorageKey({
  claimId,
  envelopeId,
}: {
  claimId:
    string;

  envelopeId:
    string;
}): string {
  return [
    claimId,
    "agreements",
    envelopeId,
    "signed-recovery-services-agreement.pdf",
  ].join(
    "/",
  );
}

async function uploadFinalPdf({
  storageKey,
  bytes,
}: {
  storageKey:
    string;

  bytes:
    Buffer;
}): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const {
    error,
  } =
    await admin.storage
      .from(
        CLAIM_DOCUMENT_STORAGE_BUCKET,
      )
      .upload(
        storageKey,
        bytes,
        {
          contentType:
            "application/pdf",

          upsert:
            false,
        },
      );

  if (
    error
  ) {
    throw new Error(
      `Signed agreement could not be stored securely: ${error.message}`,
    );
  }
}

async function removeOrphanedPdf(
  storageKey:
    string,
): Promise<void> {
  const admin =
    getSupabaseAdmin();

  const {
    error,
  } =
    await admin.storage
      .from(
        CLAIM_DOCUMENT_STORAGE_BUCKET,
      )
      .remove([
        storageKey,
      ]);

  if (
    error
  ) {
    console.error(
      "Unable to remove orphaned signed agreement PDF.",
      {
        storageKey,

        error:
          error.message,
      },
    );
  }
}

/* ========================================================================== */
/* Submitted result                                                            */
/* ========================================================================== */

function submittedResult({
  onboarding,
  envelope,
  fileName,
  pageCount,
  idempotent,
}: {
  onboarding:
    ClaimantOnboardingSigningRow;

  envelope:
    AgreementEnvelopeSigningRow;

  fileName:
    string;

  pageCount:
    number;

  idempotent:
    boolean;
}): FinalizeClaimantAgreementSignatureResult {
  if (
    envelope.status !==
      "submitted" ||
    !envelope.signed_at ||
    !envelope.signed_legal_name ||
    !envelope.signature_sha256 ||
    !envelope.final_document_id ||
    !envelope.final_document_sha256
  ) {
    throw new Error(
      "Submitted agreement evidence is incomplete.",
    );
  }

  let cancellationDeadline:
    string | undefined;

  if (
    envelope
      .signature_certificate_snapshot &&
    typeof envelope
      .signature_certificate_snapshot ===
      "object" &&
    !Array.isArray(
      envelope
        .signature_certificate_snapshot,
    )
  ) {
    const certificate =
      envelope
        .signature_certificate_snapshot as
        Record<
          string,
          unknown
        >;

    const value =
      certificate[
        "cancellationDeadline"
      ];

    if (
      typeof value ===
        "string" &&
      value.trim()
    ) {
      cancellationDeadline =
        value;
    }
  }

  return {
    ok:
      true,

    status:
      "submitted",

    envelopeId:
      envelope.id,

    claimId:
      envelope.claim_id,

    claimReference:
      envelope.claim_reference,

    claimantId:
      onboarding.claimant_id,

    claimantReference:
      onboarding.claimant_reference,

    signedLegalName:
      envelope.signed_legal_name,

    signedAt:
      envelope.signed_at,

    finalDocumentId:
      envelope.final_document_id,

    finalDocumentSha256:
      envelope.final_document_sha256,

    signatureSha256:
      envelope.signature_sha256,

    fileName,

    pageCount,

    cancellationDeadline,

    idempotent,
  };
}

/* ========================================================================== */
/* Signature certificate                                                       */
/* ========================================================================== */

function signatureCertificate({
  onboarding,
  envelope,
  signedAt,
  signatureSha256,
  finalDocumentIdValue,
  finalDocumentSha256,
  storageKey,
  fileName,
  byteSize,
  pageCount,
}: {
  onboarding:
    ClaimantOnboardingSigningRow;

  envelope:
    AgreementEnvelopeSigningRow;

  signedAt:
    string;

  signatureSha256:
    string;

  finalDocumentIdValue:
    string;

  finalDocumentSha256:
    string;

  storageKey:
    string;

  fileName:
    string;

  byteSize:
    number;

  pageCount:
    number;
}): Record<
  string,
  unknown
> {
  return {
    schemaVersion:
      1,

    envelopeId:
      envelope.id,

    template: {
      key:
        envelope.template_key,

      version:
        Number(
          envelope.template_version,
        ),
    },

    claim: {
      id:
        envelope.claim_id,

      reference:
        envelope.claim_reference,
    },

    claimant: {
      id:
        envelope.claimant_id,

      reference:
        envelope.claimant_reference,

      legalName:
        onboarding.legal_name,

      authenticatedUserId:
        envelope
          .claimant_auth_user_id,
    },

    signature: {
      method:
        "drawn_and_typed",

      typedLegalName:
        onboarding.legal_name,

      signatureSha256,

      signedAt,
    },

    consent: {
      electronicConsentAt:
        envelope
          .electronic_consent_at,

      acknowledgementKeys:
        envelope
          .acknowledged_keys_snapshot ??
        [],
    },

    agreement: {
      agreementSha256:
        envelope
          .agreement_hash,
    },

    finalDocument: {
      id:
        finalDocumentIdValue,

      storageBucket:
        CLAIM_DOCUMENT_STORAGE_BUCKET,

      storageKey,

      fileName,

      mimeType:
        "application/pdf",

      byteSize,

      pageCount,

      sha256:
        finalDocumentSha256,
    },
  };
}

/* ========================================================================== */
/* Finalizer result                                                            */
/* ========================================================================== */

function rpcResult(
  value:
    unknown,
): FinalizerRpcResult {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      "Agreement finalizer returned an invalid response.",
    );
  }

  return value as
    FinalizerRpcResult;
}

/* ========================================================================== */
/* Finalization                                                                */
/* ========================================================================== */

export async function finalizeClaimantAgreementSignature(
  input:
    FinalizeClaimantAgreementSignatureInput,
): Promise<
  FinalizeClaimantAgreementSignatureResult
> {
  const claimantId =
    requiredText(
      input.claimantId,
      "Claimant ID",
    );

  const envelopeId =
    requiredText(
      input.envelopeId,
      "Agreement ID",
    );

  const typedLegalName =
    requiredText(
      input.typedLegalName,
      "Typed legal name",
    );

  const [
    onboarding,
    envelope,
  ] =
    await Promise.all([
      getOnboardingSigningRow(
        claimantId,
      ),

      getAgreementEnvelopeSigningRow({
        claimantId,

        envelopeId,
      }),
    ]);

  if (
    onboarding.claim_id !==
      envelope.claim_id ||
    onboarding.claim_reference !==
      envelope.claim_reference ||
    onboarding.claimant_reference !==
      envelope.claimant_reference
  ) {
    throw new Error(
      "Claimant and agreement provenance do not match.",
    );
  }

  if (
    !onboarding
      .claimant_auth_user_id ||
    onboarding
      .claimant_auth_user_id !==
      envelope
        .claimant_auth_user_id
  ) {
    throw new Error(
      "Claimant authentication binding does not match this agreement.",
    );
  }

  /*
   * Once submitted, the immutable database evidence is authoritative.
   *
   * A browser retry must never create another agreement document.
   */
  if (
    envelope.status ===
    "submitted"
  ) {
    return submittedResult({
      onboarding,

      envelope,

      fileName:
        `DueQuity-Recovery-Services-Agreement-${envelope.claim_reference}-Signed.pdf`,

      pageCount:
        1,

      idempotent:
        true,
    });
  }

  if (
    envelope.status !==
    "consented"
  ) {
    throw new Error(
      "All required agreement acknowledgements must be recorded before electronic signature.",
    );
  }

  if (
    !envelope
      .electronic_consent_at ||
    !envelope
      .electronic_consent_text_snapshot
      ?.trim() ||
    !envelope
      .acknowledged_keys_snapshot
  ) {
    throw new Error(
      "Complete electronic consent evidence is required before signing.",
    );
  }

  const missingAcknowledgements =
    envelope
      .required_acknowledgement_keys
      .filter(
        (
          key,
        ) =>
          !envelope
            .acknowledged_keys_snapshot
            ?.includes(
              key,
            ),
      );

  if (
    missingAcknowledgements.length >
    0
  ) {
    throw new Error(
      "One or more required agreement acknowledgements have not been recorded.",
    );
  }

  /*
   * The production finalizer also checks this inside the database transaction.
   * We check here as well so the claimant receives a useful message before PDF
   * generation and storage begin.
   */
  if (
    onboarding
      .identity_verification !==
      "verified" ||
    !onboarding
      .identity_verified_at
  ) {
    throw new Error(
      "Government identity verification must be approved before the Recovery Services Agreement can be electronically signed.",
    );
  }

  if (
    onboarding
      .service_agreement_signed_at ||
    onboarding
      .service_agreement_document_id
  ) {
    throw new Error(
      "A signed service agreement is already permanently recorded for this claimant.",
    );
  }

  if (
    normalizeLegalName(
      typedLegalName,
    ) !==
    normalizeLegalName(
      onboarding.legal_name,
    )
  ) {
    throw new Error(
      "Type your verified legal name exactly as shown on the agreement before signing.",
    );
  }

  const snapshot =
    agreementSnapshot(
      envelope
        .agreement_snapshot,
    );

  if (
    snapshot.claim
      .claimId !==
      envelope.claim_id ||
    snapshot.claimant
      .claimantId !==
      envelope.claimant_id ||
    snapshot.claimant
      .legalName !==
      onboarding.legal_name ||
    snapshot.template
      .templateKey !==
      envelope.template_key ||
    snapshot.template
      .templateVersion !==
      Number(
        envelope
          .template_version,
      )
  ) {
    throw new Error(
      "Frozen agreement snapshot integrity check failed.",
    );
  }

  const signatureBytes =
    decodeSignaturePng(
      input.signatureDataUrl,
    );

  const signatureHash =
    sha256(
      signatureBytes,
    );

  const signedAt =
    new Date()
      .toISOString();

  const documentId =
    finalDocumentId(
      envelope.id,
    );

  const storageKey =
    finalStorageKey({
      claimId:
        envelope.claim_id,

      envelopeId:
        envelope.id,
    });

  const generated =
    await generateSignedAgreementPdf({
      agreementTitle:
        envelope.agreement_title,

      renderedAgreement:
        snapshot.renderedAgreement,

      claimReference:
        envelope.claim_reference,

      claimantReference:
        envelope.claimant_reference,

      claimantLegalName:
        onboarding.legal_name,

      jurisdictionLabel:
        snapshot
          .jurisdiction
          .label,

      recoveryBasis:
        envelope.recovery_basis,

      recoveryAmountCents:
        integerValue(
          envelope
            .recovery_amount_cents,
          "Recovery amount",
        ),

      feeStructureLabel:
        feeStructureLabel(
          envelope,
        ),

      projectedFeeCents:
        integerValue(
          envelope
            .projected_fee_cents,
          "Projected DueQuity fee",
        ),

      projectedClaimantNetCents:
        integerValue(
          envelope
            .projected_claimant_net_cents,
          "Projected claimant amount",
        ),

      paymentRouteLabel:
        humanize(
          envelope.payment_route,
        ),

      agreementHash:
        envelope.agreement_hash,

      signaturePngBytes:
        signatureBytes,

      signatureSha256:
        signatureHash,

      signedAtIso:
        signedAt,

      claimantAuthUserId:
        envelope
          .claimant_auth_user_id,

      acknowledgedKeys:
        [
          ...envelope
            .acknowledged_keys_snapshot,
        ],

      electronicConsentText:
        envelope
          .electronic_consent_text_snapshot,
    });

  const pdfBuffer =
    Buffer.from(
      generated.bytes,
    );

  if (
    pdfBuffer.byteLength <=
      0 ||
    pdfBuffer.byteLength >
      MAX_FINAL_PDF_BYTES
  ) {
    throw new Error(
      "Generated signed agreement PDF has an invalid file size.",
    );
  }

  const finalPdfHash =
    sha256(
      pdfBuffer,
    );

  const certificate =
    signatureCertificate({
      onboarding,

      envelope,

      signedAt,

      signatureSha256:
        signatureHash,

      finalDocumentIdValue:
        documentId,

      finalDocumentSha256:
        finalPdfHash,

      storageKey,

      fileName:
        generated.fileName,

      byteSize:
        pdfBuffer.byteLength,

      pageCount:
        generated.pageCount,
    });

  /*
   * Storage is written first because the database record must never claim a
   * signed PDF exists when the object itself was not successfully persisted.
   *
   * If database finalization subsequently fails, the object is removed.
   */
  await uploadFinalPdf({
    storageKey,

    bytes:
      pdfBuffer,
  });

  const admin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "finalize_claimant_esignature",
      {
        p_envelope_id:
          envelope.id,

        p_claimant_auth_user_id:
          envelope
            .claimant_auth_user_id,

        p_signed_legal_name:
          typedLegalName,

        p_signature_sha256:
          signatureHash,

        p_final_document_id:
          documentId,

        p_final_document_sha256:
          finalPdfHash,

        p_storage_key:
          storageKey,

        p_byte_size:
          pdfBuffer.byteLength,

        p_page_count:
          generated.pageCount,

        p_signed_at:
          signedAt,

        p_signature_certificate_snapshot:
          certificate,

        p_original_file_name:
          generated.fileName,
      },
    );

  if (
    error
  ) {
    /*
     * Before removing the object, check whether an ambiguous client/network
     * failure occurred after the transaction committed.
     */
    const refreshed =
      await getAgreementEnvelopeSigningRow({
        claimantId,

        envelopeId,
      });

    if (
      refreshed.status ===
        "submitted" &&
      refreshed
        .final_document_id ===
        documentId &&
      refreshed
        .final_document_sha256 ===
        finalPdfHash
    ) {
      return submittedResult({
        onboarding,

        envelope:
          refreshed,

        fileName:
          generated.fileName,

        pageCount:
          generated.pageCount,

        idempotent:
          true,
      });
    }

    await removeOrphanedPdf(
      storageKey,
    );

    throw new Error(
      `Electronic signature could not be finalized: ${error.message}`,
    );
  }

  const finalizer =
    rpcResult(
      data,
    );

  if (
    finalizer.ok !==
      true ||
    finalizer.status !==
      "submitted" ||
    finalizer.final_document_id !==
      documentId ||
    finalizer.final_document_sha256 !==
      finalPdfHash
  ) {
    /*
     * The database call returned without an error but not with the contract we
     * require. Do not silently claim success.
     */
    const refreshed =
      await getAgreementEnvelopeSigningRow({
        claimantId,

        envelopeId,
      });

    if (
      refreshed.status !==
        "submitted" ||
      refreshed
        .final_document_id !==
        documentId ||
      refreshed
        .final_document_sha256 !==
        finalPdfHash
    ) {
      await removeOrphanedPdf(
        storageKey,
      );

      throw new Error(
        "Electronic signature finalization did not return complete immutable document evidence.",
      );
    }
  }

  const completed =
    await getAgreementEnvelopeSigningRow({
      claimantId,

      envelopeId,
    });

  if (
    completed.status !==
      "submitted"
  ) {
    throw new Error(
      "Electronic signature was not persisted in submitted status.",
    );
  }

  const result:
    FinalizeClaimantAgreementSignatureResult = {
    ok:
      true,

    status:
      "submitted",

    envelopeId:
      completed.id,

    claimId:
      completed.claim_id,

    claimReference:
      completed.claim_reference,

    claimantId:
      completed.claimant_id,

    claimantReference:
      completed.claimant_reference,

    signedLegalName:
      requiredText(
        completed
          .signed_legal_name,
        "Persisted signed legal name",
      ),

    signedAt:
      requiredText(
        completed.signed_at,
        "Persisted signed timestamp",
      ),

    finalDocumentId:
      requiredText(
        completed
          .final_document_id,
        "Persisted signed document ID",
      ),

    finalDocumentSha256:
      requiredText(
        completed
          .final_document_sha256,
        "Persisted signed document hash",
      ),

    signatureSha256:
      requiredText(
        completed
          .signature_sha256,
        "Persisted signature hash",
      ),

    fileName:
      generated.fileName,

    pageCount:
      generated.pageCount,

    cancellationDeadline:
      typeof finalizer
        .cancellation_deadline ===
        "string"
        ? finalizer
            .cancellation_deadline
        : undefined,

    idempotent:
      finalizer.idempotent ===
      true,
  };

  return result;
}