import type { RecoveryStage } from "@/domain/types";

/**
 * RECOVERY STAGES
 *
 * The configured claimant-facing recovery timeline.
 *
 * These are data with an ordinal rather than a hard-coded sequence, because the
 * stages a claimant sees must be configurable without a code change.
 *
 * Claimant labels avoid operational vocabulary. A claimant reads "We are
 * confirming your identity", not "KYC pending".
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
      "Duequity located a public record suggesting surplus funds may remain from a property sale.",
  },
  {
    key: "owner_located",
    ordinal: 2,
    claimantLabel: "Former owner located",
    internalLabel: "Owner located",
    claimantDescription:
      "We identified and reached the former owner of record or an eligible heir.",
  },
  {
    key: "identity_confirmed",
    ordinal: 3,
    claimantLabel: "Identity confirmed",
    internalLabel: "Identity verified",
    claimantDescription:
      "Your identity has been confirmed, so we can act on the claim with the agency.",
  },
  {
    key: "entitlement_review",
    ordinal: 4,
    claimantLabel: "Entitlement review",
    internalLabel: "Entitlement and jurisdiction review",
    claimantDescription:
      "We are confirming your legal entitlement and the rules that apply in this jurisdiction.",
  },
  {
    key: "documents_requested",
    ordinal: 5,
    claimantLabel: "Documents requested",
    internalLabel: "Document collection",
    claimantDescription:
      "The agency requires specific documents before it will consider the claim.",
  },
  {
    key: "package_prepared",
    ordinal: 6,
    claimantLabel: "Claim package prepared",
    internalLabel: "Package assembled and reviewed",
    claimantDescription:
      "Your complete claim package has been assembled and checked.",
  },
  {
    key: "submitted",
    ordinal: 7,
    claimantLabel: "Claim submitted",
    internalLabel: "Filed with agency",
    claimantDescription:
      "The claim has been filed with the agency holding the funds.",
  },
  {
    key: "agency_review",
    ordinal: 8,
    claimantLabel: "Agency review",
    internalLabel: "Awaiting agency determination",
    claimantDescription:
      "The agency is reviewing the claim. This stage is controlled by the agency, not by Duequity.",
  },
  {
    key: "additional_information",
    ordinal: 9,
    claimantLabel: "Additional information requested",
    internalLabel: "Agency information request",
    claimantDescription:
      "The agency has asked for something further before it can decide.",
  },
  {
    key: "approved",
    ordinal: 10,
    claimantLabel: "Approved",
    internalLabel: "Approved by agency",
    claimantDescription:
      "The agency approved the claim and authorised payment.",
  },
  {
    key: "payment_issued",
    ordinal: 11,
    claimantLabel: "Payment issued",
    internalLabel: "Payment issued by agency",
    claimantDescription:
      "The agency issued payment. Funds go directly to you, to the estate, or to an attorney trust account.",
  },
  {
    key: "completed",
    ordinal: 12,
    claimantLabel: "Recovery completed",
    internalLabel: "File closed",
    claimantDescription: "The recovery is complete and your file is closed.",
  },
];

export function getStage(key: string): RecoveryStage {
  const found = RECOVERY_STAGES.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown recovery stage: ${key}`);
  return found;
}
