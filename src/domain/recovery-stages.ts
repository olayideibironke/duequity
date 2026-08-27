import type { RecoveryStage } from "@/domain/types";

/**
 * RECOVERY STAGES
 *
 * The configured claimant-facing recovery timeline.
 *
 * These are data with an ordinal rather than a hard-coded sequence, because the
 * stages a claimant sees must be configurable without a code change.
 *
 * Claimant labels avoid operational vocabulary. A claimant reads plain recovery
 * language rather than internal workflow terms.
 *
 * A stage key appearing on a Claim is the claim's position in this list. The list
 * itself asserts nothing about any individual claim.
 */

export const RECOVERY_STAGES: RecoveryStage[] = [
  {
    key: "identified",
    ordinal: 1,
    claimantLabel: "Opportunity identified",
    internalLabel: "Opportunity identified",
    claimantDescription:
      "DueQuity located a public record suggesting surplus funds may remain from a property sale.",
  },
  {
    key: "owner_located",
    ordinal: 2,
    claimantLabel: "Former owner located",
    internalLabel: "Owner located",
    claimantDescription:
      "We identified and reached the former owner of record, an estate representative, or a potentially eligible heir.",
  },
  {
    key: "identity_confirmed",
    ordinal: 3,
    claimantLabel: "Identity confirmed",
    internalLabel: "Identity verified",
    claimantDescription:
      "Your identity has been confirmed so we can continue the recovery process and complete any required authorization steps.",
  },
  {
    key: "entitlement_review",
    ordinal: 4,
    claimantLabel: "Eligibility review",
    internalLabel: "Entitlement and jurisdiction review",
    claimantDescription:
      "We are reviewing ownership, claimant eligibility, and the rules that apply to the recovery in this jurisdiction.",
  },
  {
    key: "documents_requested",
    ordinal: 5,
    claimantLabel: "Documents requested",
    internalLabel: "Document collection",
    claimantDescription:
      "The authority handling the recovery requires specific documents before the claim can proceed.",
  },
  {
    key: "package_prepared",
    ordinal: 6,
    claimantLabel: "Claim package prepared",
    internalLabel: "Package assembled and reviewed",
    claimantDescription:
      "Your recovery package has been assembled and checked against the requirements established for your claim.",
  },
  {
    key: "submitted",
    ordinal: 7,
    claimantLabel: "Claim submitted",
    internalLabel: "Filed with agency",
    claimantDescription:
      "The recovery package has been submitted, or its submission has been coordinated, through the process permitted for your jurisdiction.",
  },
  {
    key: "agency_review",
    ordinal: 8,
    claimantLabel: "Agency review",
    internalLabel: "Awaiting agency determination",
    claimantDescription:
      "The authority handling the recovery is reviewing the claim. This stage is controlled by that authority, not by DueQuity.",
  },
  {
    key: "additional_information",
    ordinal: 9,
    claimantLabel: "Additional information requested",
    internalLabel: "Agency information request",
    claimantDescription:
      "The authority handling the recovery has requested additional information or documentation before it can continue.",
  },
  {
    key: "approved",
    ordinal: 10,
    claimantLabel: "Approved",
    internalLabel: "Approved by agency",
    claimantDescription:
      "The recovery has been approved and the permitted payment process can move forward.",
  },
  {
    key: "payment_issued",
    ordinal: 11,
    claimantLabel: "Payment issued",
    internalLabel: "Payment issued by agency",
    claimantDescription:
      "Payment has been issued through the route permitted for your claim. Depending on the jurisdiction, funds may be paid directly to you, your estate, authorized counsel, or through an authorized representative payment process.",
  },
  {
    key: "completed",
    ordinal: 12,
    claimantLabel: "Recovery completed",
    internalLabel: "File closed",
    claimantDescription:
      "The recovery process is complete and the claim file has been closed.",
  },
];

export function getStage(key: string): RecoveryStage {
  const found = RECOVERY_STAGES.find((stage) => stage.key === key);

  if (!found) {
    throw new Error(`Unknown recovery stage: ${key}`);
  }

  return found;
}