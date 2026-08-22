"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/surface";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Checklist } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { IconArrowRight } from "@/components/ui/icon";
import { LEGAL_LANE, type LegalLane } from "@/domain/legal";
import { LegalLaneBadge } from "@/components/ui/legal-lane";
import { PricingExceptionRequest } from "@/components/pro/pricing-exception-request";

/**
 * OPPORTUNITY CONVERSION
 *
 * Conversion is fail closed.
 *
 * An opportunity cannot become a claim when:
 *
 * 1. The jurisdiction is blocked.
 * 2. The statutory deadline has expired.
 * 3. Blocking review flags remain open.
 * 4. No valid commercial pricing decision exists.
 * 5. Commercial pricing requires manager review.
 * 6. Commercial pricing has not received the required human approval.
 *
 * Commercial pricing approval is persisted server side.
 *
 * Conversion is also persisted server side. The conversion endpoint independently
 * rechecks the opportunity and locks the exact approved commercial quote snapshot.
 *
 * A page refresh therefore cannot undo either the commercial approval or the
 * completed opportunity conversion.
 */

type CommercialPricingGate =
  "allowed" | "manager_review" | "blocked" | "missing";

type PersistedApprovalStatus =
  | "draft"
  | "staff_approved"
  | "manager_review"
  | "manager_approved"
  | "rejected"
  | "locked";

interface ApprovalRecord {
  approvalStatus: PersistedApprovalStatus;
}

interface PricingDetails {
  recoveryAmount: number;
  selectedPercentage?: number;
  staffCeilingPercentage?: number;
  managerCeilingPercentage?: number;
}

interface PersistedConversion {
  opportunityId: string;
  opportunityReference: string;
  jurisdictionId: string;

  claimId: string;
  claimReference: string;

  commercialQuoteId: string;
  commercialSnapshotHash: string;

  feeAgreementId: string;

  status: "converted";

  convertedByUserId: string;
  convertedAt: string;

  createdAt: string;
  updatedAt: string;
}

interface PricingGetResponse {
  ok: boolean;

  pricing?: {
    quote?: {
      recoveryAmount: number;
      selectedPercentage?: number;
    };

    tier?: {
      staffCeilingPercentage?: number;
      managerExceptionCeilingPercentage?: number;
    };
  };

  approval?: ApprovalRecord | null;

  error?: string;
}

interface PricingPostResponse {
  ok: boolean;
  approval?: ApprovalRecord;
  error?: string;
}

interface ConversionGetResponse {
  ok: boolean;

  conversion?: PersistedConversion | null;

  approval?: ApprovalRecord | null;

  error?: string;
}

interface ConversionPostResponse {
  ok: boolean;

  conversion?: PersistedConversion;

  approval?: ApprovalRecord;

  alreadyConverted?: boolean;

  partialConversion?: boolean;

  error?: string;
}

function approvalStatusIsApproved(
  status: PersistedApprovalStatus | undefined,
): boolean {
  return (
    status === "staff_approved" ||
    status === "manager_approved" ||
    status === "locked"
  );
}

function opportunityIdFromPathname(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);

  if (
    segments.length < 3 ||
    segments[0] !== "pro" ||
    segments[1] !== "opportunities"
  ) {
    return undefined;
  }

  return segments[2];
}

export function ConvertOpportunity({
  opportunityReference,
  jurisdictionName,
  gateOutcome,
  gateReason,
  gateAction,
  blockingFlags,
  surplusConfirmed,
  deadlineExpired,
  ownerLocated,
  projectedLane,
  projectedRationale,
  commercialPricingGate = "missing",
  commercialPricingReason,
  commercialPricingViable = false,
  commercialPricingApproved = false,
  commercialPricingSummary,
}: {
  opportunityReference: string;
  jurisdictionName: string;

  gateOutcome: "permitted" | "conditional" | "blocked";

  gateReason: string;
  gateAction?: string;

  blockingFlags: {
    label: string;
    detail: string;
  }[];

  surplusConfirmed: boolean;
  deadlineExpired: boolean;
  ownerLocated: boolean;

  projectedLane: LegalLane;
  projectedRationale: string;

  commercialPricingGate?: CommercialPricingGate;

  commercialPricingReason?: string;

  commercialPricingViable?: boolean;

  commercialPricingApproved?: boolean;

  commercialPricingSummary?: string;
}) {
  const pathname = usePathname();

  const router = useRouter();

  const opportunityId = opportunityIdFromPathname(pathname);

  const [confirming, setConfirming] = useState(false);

  const [persistedConversion, setPersistedConversion] = useState<
    PersistedConversion | undefined
  >();

  const [persistedApprovalStatus, setPersistedApprovalStatus] = useState<
    PersistedApprovalStatus | undefined
  >(commercialPricingApproved ? "staff_approved" : undefined);

  const [pricingDetails, setPricingDetails] = useState<
    PricingDetails | undefined
  >();

  /*
   * Start in the pending state only when there is actually something to load.
   *
   * Deriving the initial value from the prop keeps the effect below free of a
   * synchronous state write, which would otherwise cascade a render before first
   * paint every time this panel mounts without an opportunity.
   */
  const [workflowLoading, setWorkflowLoading] = useState(
    Boolean(opportunityId),
  );

  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  const [conversionSubmitting, setConversionSubmitting] = useState(false);

  const [workflowError, setWorkflowError] = useState<string | undefined>();

  /* ======================================================================== */
  /* Load persisted approval, pricing and conversion                           */
  /* ======================================================================== */

  useEffect(() => {
    if (!opportunityId) {
      return;
    }

    const activeOpportunityId = opportunityId;

    let cancelled = false;

    async function loadWorkflow() {
      setWorkflowLoading(true);
      setWorkflowError(undefined);

      try {
        const [pricingResponse, conversionResponse] = await Promise.all([
          fetch(
            `/api/pro/commercial-pricing/${encodeURIComponent(
              activeOpportunityId,
            )}`,
            {
              method: "GET",
              cache: "no-store",
            },
          ),

          fetch(
            `/api/pro/opportunities/${encodeURIComponent(
              activeOpportunityId,
            )}/convert`,
            {
              method: "GET",
              cache: "no-store",
            },
          ),
        ]);

        const pricingData =
          (await pricingResponse.json()) as PricingGetResponse;

        const conversionData =
          (await conversionResponse.json()) as ConversionGetResponse;

        if (cancelled) {
          return;
        }

        if (!pricingResponse.ok || !pricingData.ok) {
          setWorkflowError(
            pricingData.error ??
              "Commercial pricing approval could not be loaded.",
          );
        }

        if (!conversionResponse.ok || !conversionData.ok) {
          setWorkflowError(
            conversionData.error ??
              "Opportunity conversion state could not be loaded.",
          );
        }

        const approvalStatus =
          conversionData.approval?.approvalStatus ??
          pricingData.approval?.approvalStatus;

        setPersistedApprovalStatus(approvalStatus);

        setPersistedConversion(conversionData.conversion ?? undefined);

        const quote = pricingData.pricing?.quote;

        const tier = pricingData.pricing?.tier;

        if (quote) {
          setPricingDetails({
            recoveryAmount: quote.recoveryAmount,

            selectedPercentage: quote.selectedPercentage,

            staffCeilingPercentage: tier?.staffCeilingPercentage,

            managerCeilingPercentage: tier?.managerExceptionCeilingPercentage,
          });
        } else {
          setPricingDetails(undefined);
        }
      } catch {
        if (!cancelled) {
          setWorkflowError(
            "Duequity could not load the persisted pricing and conversion state.",
          );
        }
      } finally {
        if (!cancelled) {
          setWorkflowLoading(false);
        }
      }
    }

    void loadWorkflow();

    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  /* ======================================================================== */
  /* Approval state                                                            */
  /* ======================================================================== */

  const pricingApproved =
    commercialPricingApproved ||
    approvalStatusIsApproved(persistedApprovalStatus);

  const persistedManagerReview = persistedApprovalStatus === "manager_review";

  const pricingAvailable = commercialPricingGate !== "missing";

  const pricingRequiresManager =
    commercialPricingGate === "manager_review" || persistedManagerReview;

  const pricingBlocked =
    commercialPricingGate === "blocked" ||
    commercialPricingGate === "missing" ||
    !commercialPricingViable;

  const complianceHardBlocked =
    gateOutcome === "blocked" || blockingFlags.length > 0 || deadlineExpired;

  const commercialHardBlocked =
    workflowLoading ||
    pricingBlocked ||
    pricingRequiresManager ||
    !pricingApproved;

  const hardBlocked = complianceHardBlocked || commercialHardBlocked;

  const conversionLockIncomplete = Boolean(
    persistedConversion && persistedApprovalStatus !== "locked",
  );

  const canRequestPercentageException = Boolean(
    opportunityId &&
    pricingDetails &&
    pricingDetails.selectedPercentage !== undefined &&
    pricingDetails.staffCeilingPercentage !== undefined &&
    pricingDetails.managerCeilingPercentage !== undefined &&
    pricingDetails.managerCeilingPercentage >
      pricingDetails.staffCeilingPercentage,
  );

  /* ======================================================================== */
  /* Persist staff approval                                                    */
  /* ======================================================================== */

  async function approvePricing() {
    if (!opportunityId || approvalSubmitting || persistedManagerReview) {
      return;
    }

    const activeOpportunityId = opportunityId;

    setApprovalSubmitting(true);
    setWorkflowError(undefined);

    try {
      const response = await fetch(
        `/api/pro/commercial-pricing/${encodeURIComponent(
          activeOpportunityId,
        )}`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            action: "approve_staff",
          }),
        },
      );

      const data = (await response.json()) as PricingPostResponse;

      if (!response.ok || !data.ok || !data.approval) {
        setWorkflowError(data.error ?? "Commercial pricing approval failed.");

        return;
      }

      setPersistedApprovalStatus(data.approval.approvalStatus);

      router.refresh();
    } catch {
      setWorkflowError("Commercial pricing approval failed.");
    } finally {
      setApprovalSubmitting(false);
    }
  }

  /* ======================================================================== */
  /* Persist opportunity conversion                                            */
  /* ======================================================================== */

  async function convertOpportunity() {
    if (!opportunityId || conversionSubmitting) {
      return;
    }

    const activeOpportunityId = opportunityId;

    setConfirming(false);
    setConversionSubmitting(true);
    setWorkflowError(undefined);

    try {
      const response = await fetch(
        `/api/pro/opportunities/${encodeURIComponent(
          activeOpportunityId,
        )}/convert`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({}),
        },
      );

      const data = (await response.json()) as ConversionPostResponse;

      if (!response.ok || !data.ok || !data.conversion) {
        setWorkflowError(
          data.partialConversion
            ? `${
                data.error ?? "Commercial pricing could not be locked."
              } The conversion record was persisted. Retry the conversion to finish the lock.`
            : (data.error ?? "Opportunity conversion failed."),
        );

        if (data.conversion) {
          setPersistedConversion(data.conversion);
        }

        return;
      }

      setPersistedConversion(data.conversion);

      if (data.approval) {
        setPersistedApprovalStatus(data.approval.approvalStatus);
      }

      router.refresh();
    } catch {
      setWorkflowError("Opportunity conversion failed.");
    } finally {
      setConversionSubmitting(false);
    }
  }

  /* ======================================================================== */
  /* Persisted conversion state                                                */
  /* ======================================================================== */

  if (persistedConversion && !conversionLockIncomplete) {
    return (
      <Callout tone="positive" role="status" title="Claim conversion persisted">
        <p>
          <span className="font-semibold text-ink-900">
            {persistedConversion.claimReference}
          </span>{" "}
          was created from {opportunityReference}.
        </p>

        <p className="mt-2">
          The exact approved commercial pricing snapshot was locked to{" "}
          <span className="font-mono text-xs">
            {persistedConversion.feeAgreementId}
          </span>
          . Refreshing this page will not undo the conversion or pricing lock.
        </p>

        <p className="mt-2 text-xs text-ink-600">
          Commercial quote:{" "}
          <span className="font-mono">
            {persistedConversion.commercialQuoteId}
          </span>
        </p>
      </Callout>
    );
  }

  if (persistedConversion && conversionLockIncomplete) {
    return (
      <div>
        <Callout tone="critical" title="Conversion needs completion">
          <p>
            The opportunity conversion record exists, but the commercial pricing
            lock has not completed.
          </p>

          <p className="mt-2">
            Duequity will not treat this conversion as complete until the exact
            approved quote is locked.
          </p>
        </Callout>

        {workflowError && (
          <Callout tone="critical" className="mt-3">
            <p>{workflowError}</p>
          </Callout>
        )}

        <Button
          variant="primary"
          accent
          block
          className="mt-3"
          loading={conversionSubmitting}
          onClick={() => void convertOpportunity()}
        >
          Finish conversion
        </Button>
      </div>
    );
  }

  /* ======================================================================== */
  /* Checklist                                                                 */
  /* ======================================================================== */

  const checks = [
    {
      key: "jurisdiction",
      label: "Jurisdiction cleared for intake",
      satisfied: gateOutcome !== "blocked",
      blocking: true,

      detail: gateOutcome === "blocked" ? gateReason : undefined,
    },

    {
      key: "deadline",
      label: "Within the statutory deadline",
      satisfied: !deadlineExpired,
      blocking: true,

      detail: deadlineExpired
        ? "The statutory claim window has closed. A claim cannot be opened."
        : undefined,
    },

    {
      key: "flags",
      label: "No blocking review flags",
      satisfied: blockingFlags.length === 0,
      blocking: true,

      detail:
        blockingFlags.length > 0
          ? blockingFlags.map((flag) => flag.label).join(", ")
          : undefined,
    },

    {
      key: "pricing",
      label: "Commercial pricing approved",

      satisfied: pricingApproved,

      blocking: true,

      detail: pricingApproved
        ? undefined
        : workflowLoading
          ? "Checking the persisted commercial pricing approval."
          : persistedManagerReview
            ? "A pricing exception has been sent to the manager and must be approved before conversion."
            : commercialPricingGate === "missing"
              ? "No commercial pricing decision has been supplied. Conversion is fail closed."
              : commercialPricingGate === "blocked"
                ? (commercialPricingReason ?? "Commercial pricing is blocked.")
                : commercialPricingGate === "manager_review"
                  ? (commercialPricingReason ??
                    "Manager approval is required before this opportunity can proceed.")
                  : !commercialPricingViable
                    ? "The opportunity does not currently meet Duequity's commercial viability requirement."
                    : "The pricing decision is within staff authority but still requires explicit human approval.",
    },

    {
      key: "owner",
      label: "Owner or heir located",
      satisfied: ownerLocated,
      blocking: false,

      detail: ownerLocated
        ? undefined
        : "Owner research is incomplete. A claim can be opened, but there is nobody to sign an agreement yet.",
    },

    {
      key: "surplus",
      label: "Surplus confirmed by the agency",
      satisfied: surplusConfirmed,
      blocking: false,

      detail: surplusConfirmed
        ? undefined
        : "Only an estimate is on file. Any figure shown to a claimant must be labelled as an estimate.",
    },
  ];

  return (
    <div>
      <Checklist items={checks} />

      {/* ================================================= commercial pricing */}
      <div className="mt-4 rounded-md border border-line bg-inset px-3.5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-900">
              Commercial pricing
            </p>

            {commercialPricingSummary && (
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {commercialPricingSummary}
              </p>
            )}
          </div>

          {workflowLoading ? (
            <Badge tone="neutral" size="md">
              Checking approval
            </Badge>
          ) : persistedApprovalStatus === "locked" ? (
            <Badge tone="positive" size="md">
              Locked
            </Badge>
          ) : persistedApprovalStatus === "manager_approved" ? (
            <Badge tone="positive" size="md">
              Manager approved
            </Badge>
          ) : pricingApproved ? (
            <Badge tone="positive" size="md">
              Approved
            </Badge>
          ) : persistedManagerReview ? (
            <Badge tone="caution" size="md">
              Manager review
            </Badge>
          ) : commercialPricingGate === "allowed" ? (
            <Badge tone="caution" size="md">
              Approval required
            </Badge>
          ) : commercialPricingGate === "manager_review" ? (
            <Badge tone="caution" size="md">
              Manager review
            </Badge>
          ) : commercialPricingGate === "blocked" ? (
            <Badge tone="critical" size="md">
              Pricing blocked
            </Badge>
          ) : (
            <Badge tone="critical" size="md">
              No pricing decision
            </Badge>
          )}
        </div>

        {!pricingAvailable && (
          <p className="mt-2 text-xs leading-relaxed text-critical-700">
            No commercial pricing decision has been supplied for this
            opportunity. Conversion remains unavailable.
          </p>
        )}

        {commercialPricingReason && (
          <p className="mt-2 text-xs leading-relaxed text-ink-600">
            {commercialPricingReason}
          </p>
        )}

        {workflowError && (
          <Callout tone="critical" className="mt-3">
            <p>{workflowError}</p>
          </Callout>
        )}

        {commercialPricingGate === "allowed" &&
          commercialPricingViable &&
          !pricingApproved &&
          !persistedManagerReview &&
          !workflowLoading && (
            <>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  block
                  loading={approvalSubmitting}
                  disabled={!opportunityId}
                  onClick={() => void approvePricing()}
                >
                  Approve commercial pricing
                </Button>

                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  Approval is recalculated and recorded on the server before
                  conversion becomes available.
                </p>
              </div>

              {canRequestPercentageException &&
                opportunityId &&
                pricingDetails?.selectedPercentage !== undefined &&
                pricingDetails.staffCeilingPercentage !== undefined &&
                pricingDetails.managerCeilingPercentage !== undefined && (
                  <PricingExceptionRequest
                    opportunityId={opportunityId}
                    actorUserId=""
                    recoveryAmount={pricingDetails.recoveryAmount}
                    currentPercentage={pricingDetails.selectedPercentage}
                    staffCeilingPercentage={
                      pricingDetails.staffCeilingPercentage
                    }
                    managerCeilingPercentage={
                      pricingDetails.managerCeilingPercentage
                    }
                  />
                )}
            </>
          )}

        {pricingApproved && (
          <p className="mt-2 text-xs leading-relaxed text-accent-700">
            Commercial pricing approval is persisted. Refreshing this page will
            not remove it.
          </p>
        )}

        {persistedManagerReview && (
          <Callout tone="caution" className="mt-3">
            <p>
              A pricing exception is awaiting manager approval. Staff cannot
              approve or convert this opportunity until management makes a
              decision.
            </p>
          </Callout>
        )}

        {pricingRequiresManager && !persistedManagerReview && (
          <p className="mt-2 text-xs leading-relaxed text-caution-700">
            This pricing decision is outside ordinary staff authority. A manager
            must approve it before conversion can proceed.
          </p>
        )}

        {commercialPricingGate === "blocked" && (
          <p className="mt-2 text-xs leading-relaxed text-critical-700">
            There is no pricing override on this screen. The commercial policy
            or quote must be corrected first.
          </p>
        )}

        {!commercialPricingViable && commercialPricingGate !== "missing" && (
          <p className="mt-2 text-xs leading-relaxed text-critical-700">
            The projected fee does not meet the current commercial viability
            requirement. A manager or commercial policy decision is required.
          </p>
        )}
      </div>

      {/* ================================================= projected legal lane */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-inset px-3 py-2.5">
        <p className="text-xs text-ink-600">Would open in</p>

        <LegalLaneBadge lane={projectedLane} />
      </div>

      {projectedLane === "attorney_required" && (
        <Callout tone="counsel" className="mt-3">
          <p>
            <span className="font-semibold text-ink-900">
              This claim would require independent counsel.{" "}
            </span>

            {projectedRationale}
          </p>

          <p className="mt-1.5 text-xs">
            Duequity would coordinate research, documents and agency
            communication. The legal work is the attorney&apos;s, engaged
            directly by the claimant, and Duequity takes no part of their fee.
          </p>
        </Callout>
      )}

      {projectedLane === "legal_review" && gateOutcome !== "blocked" && (
        <Callout tone="caution" className="mt-3">
          <p>
            <span className="font-semibold text-ink-900">
              This claim would open in legal review.{" "}
            </span>

            {projectedRationale}
          </p>
        </Callout>
      )}

      {gateOutcome === "conditional" &&
        projectedLane !== "attorney_required" && (
          <Callout tone="counsel" className="mt-3">
            <p>
              <span className="font-semibold text-ink-900">
                Attorney required.{" "}
              </span>

              {gateReason}
            </p>
          </Callout>
        )}

      {/* ================================================= conversion action */}
      {hardBlocked ? (
        <div className="mt-4">
          <Badge
            tone={
              complianceHardBlocked || pricingBlocked ? "critical" : "caution"
            }
            size="md"
          >
            Conversion blocked
          </Badge>

          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            {gateOutcome === "blocked"
              ? gateReason
              : deadlineExpired
                ? "The statutory claim deadline has passed for this record."
                : blockingFlags.length > 0
                  ? "One or more blocking review flags must be resolved first."
                  : workflowLoading
                    ? "Duequity is checking the persisted commercial pricing and conversion state."
                    : persistedManagerReview
                      ? "A pricing exception is awaiting manager approval."
                      : commercialPricingGate === "missing"
                        ? "A valid Duequity commercial pricing decision is required before this opportunity can be converted."
                        : commercialPricingGate === "blocked"
                          ? (commercialPricingReason ??
                            "Commercial pricing is blocked.")
                          : commercialPricingGate === "manager_review"
                            ? "Commercial pricing requires manager approval before conversion."
                            : !commercialPricingViable
                              ? "This opportunity does not currently satisfy Duequity's commercial viability requirement."
                              : "Commercial pricing must receive explicit human approval before conversion."}
          </p>

          {gateAction && (
            <p className="mt-2 text-sm leading-relaxed text-ink-700">
              <span className="font-semibold text-ink-900">Next step: </span>

              {gateAction}
            </p>
          )}

          <Button variant="secondary" block disabled className="mt-3">
            Convert to claim
          </Button>

          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            There is no conversion override here. Compliance restrictions,
            commercial pricing controls and required approvals must be resolved
            through their governing workflow.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <Button
            variant="primary"
            accent
            block
            loading={conversionSubmitting}
            disabled={workflowLoading}
            onClick={() => setConfirming(true)}
            trailing={<IconArrowRight size={16} />}
          >
            Convert to claim
          </Button>

          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Creates a persistent conversion record and locks the exact approved
            commercial pricing snapshot before the workflow is considered
            complete.
          </p>
        </div>
      )}

      {/* ================================================= confirmation */}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void convertOpportunity()}
        title="Open a claim from this opportunity?"
        confirmLabel="Open the claim"
        body={
          <div className="space-y-2">
            <p>
              A claim conversion will be persisted from {opportunityReference}{" "}
              in {jurisdictionName}, classified{" "}
              <span className="font-medium text-ink-900">
                {LEGAL_LANE[projectedLane].label.toLowerCase()}
              </span>
              .
            </p>

            <p className="font-medium text-accent-700">
              The exact approved commercial pricing snapshot will be locked as
              part of the conversion workflow.
            </p>

            {commercialPricingSummary && (
              <p className="text-ink-600">{commercialPricingSummary}</p>
            )}

            {projectedLane === "attorney_required" && (
              <p className="font-medium text-counsel-700">
                This claim requires independent counsel. Duequity will
                coordinate research and documents; the claimant engages an
                attorney directly and Duequity takes no part of their fee.
              </p>
            )}

            {projectedLane === "legal_review" && (
              <p className="font-medium text-caution-700">
                This claim opens in legal review. A compliance determination is
                required before it can be filed.
              </p>
            )}

            {gateOutcome === "conditional" &&
              projectedLane !== "attorney_required" && (
                <p className="font-medium text-counsel-700">
                  This jurisdiction requires an attorney to file. The claimant
                  must engage counsel directly, and Duequity does not share in
                  attorney fees.
                </p>
              )}

            {!surplusConfirmed && (
              <p className="font-medium text-caution-700">
                The surplus is an estimate. Every figure presented to this
                claimant must be labelled as an estimate until the agency
                confirms one.
              </p>
            )}

            <p className="text-ink-600">
              The claimant will receive the disclosures required in this
              jurisdiction, including the statement that they may claim directly
              at no cost.
            </p>
          </div>
        }
      />
    </div>
  );
}
