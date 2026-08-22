import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";

import { Breadcrumbs } from "@/components/ui/tabs";

import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  DataItem,
  DataList,
} from "@/components/ui/surface";

import { JurisdictionReviewEditor } from "@/components/pro/jurisdiction-review-editor";

import { can } from "@/lib/session";

import { resolveStaffSession } from "@/server/staff-session";

import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

import {
  evaluateJurisdictionPaymentRouting,
  getJurisdictionRulePackage,
  type DuequityLaunchPaymentTrack,
  type JurisdictionFeeCollectionMethod,
  type JurisdictionPaymentRoute,
  type JurisdictionPaymentRouting,
  type JurisdictionYesNoUnknown,
} from "@/server/jurisdiction-intelligence";

import {
  getJurisdictionReviewDraft,
  REQUIRED_REVIEW_FINDINGS,
  type JurisdictionReviewDraft,
} from "@/server/jurisdiction-review-store";

/* ========================================================================== */
/* Labels                                                                      */
/* ========================================================================== */

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function paymentRouteLabel(
  value: JurisdictionPaymentRoute | undefined,
): string {
  switch (value) {
    case "claimant_only":
      return "Claimant payee";

    case "authorized_representative":
      return "Authorized representative payee";

    case "joint_payee":
      return "Joint payee";

    case "split_disbursement":
      return "Split disbursement";

    case "assignee":
      return "Assignment / acquisition";

    case "unknown":
    case undefined:
      return "Unknown";
  }
}

function paymentTrackLabel(
  value: DuequityLaunchPaymentTrack | undefined,
): string {
  switch (value) {
    case "direct_claimant_recovery":
      return "Direct Claimant Recovery";

    case "managed_representative_recovery":
      return "Managed Representative Recovery";

    case "future_acquisition":
      return "Future Acquisition";

    case "blocked":
    case undefined:
      return "Blocked";
  }
}

function feeCollectionLabel(
  value: JurisdictionFeeCollectionMethod | undefined,
): string {
  switch (value) {
    case "contractual_post_recovery":
      return "Contractual post-recovery fee";

    case "representative_disbursement":
      return "Representative disbursement";

    case "joint_payee_disbursement":
      return "Joint-payee disbursement";

    case "split_disbursement":
      return "Split disbursement";

    case "assignment_acquisition":
      return "Assignment / acquisition";

    case "unknown":
    case undefined:
      return "Unknown";
  }
}

function yesNoUnknownLabel(
  value: JurisdictionYesNoUnknown | undefined,
): string {
  switch (value) {
    case "yes":
      return "Yes";

    case "no":
      return "No";

    case "unknown":
    case undefined:
      return "Unknown";
  }
}

/* ========================================================================== */
/* Review status                                                               */
/* ========================================================================== */

function reviewTone(
  status: "draft" | "ready_for_approval" | "changes_required" | "approved",
): "neutral" | "caution" | "critical" | "positive" {
  switch (status) {
    case "draft":
      return "neutral";

    case "ready_for_approval":
      return "caution";

    case "changes_required":
      return "critical";

    case "approved":
      return "positive";
  }
}

/* ========================================================================== */
/* Payment routing                                                            */
/* ========================================================================== */

function reviewPaymentRouting(
  review: JurisdictionReviewDraft,
): JurisdictionPaymentRouting | undefined {
  const findings = review.findings;

  if (
    !findings.paymentRoute ||
    !findings.paymentLaunchTrack ||
    !findings.representativeMayFile ||
    !findings.representativeMayReceivePayment ||
    !findings.assignmentRequiredForRepresentativePayment ||
    !findings.feeCollectionMethod
  ) {
    return undefined;
  }

  return {
    paymentRoute: findings.paymentRoute,

    launchTrack: findings.paymentLaunchTrack,

    representativeMayFile: findings.representativeMayFile,

    representativeMayReceivePayment: findings.representativeMayReceivePayment,

    assignmentRequiredForRepresentativePayment:
      findings.assignmentRequiredForRepresentativePayment,

    feeCollectionMethod: findings.feeCollectionMethod,

    evidenceSourceIds: review.findingSourceIds.payment_routing ?? [],

    notes: findings.paymentRoutingNote?.trim() || undefined,
  };
}

/* ========================================================================== */
/* Intake                                                                      */
/* ========================================================================== */

interface IntakeState {
  label: string;

  tone: "positive" | "counsel" | "critical";

  reason: string;
}

function intakeState({
  review,
  approvedPaymentRouting,
  approvedComplianceStatus,
}: {
  review: JurisdictionReviewDraft;

  approvedPaymentRouting: JurisdictionPaymentRouting | undefined;

  approvedComplianceStatus:
    | "research_required"
    | "under_legal_review"
    | "approved"
    | "attorney_only"
    | "restricted"
    | "paused"
    | undefined;
}): IntakeState {
  if (review.status !== "approved") {
    return {
      label: "Blocked",

      tone: "critical",

      reason: "The jurisdiction review has not been approved.",
    };
  }

  switch (approvedComplianceStatus) {
    case "attorney_only":
      return {
        label: "Attorney only",

        tone: "counsel",

        reason:
          "Duequity's startup Green Lane does not activate attorney-required recoveries.",
      };

    case "approved":
      break;

    default:
      return {
        label: "Blocked",

        tone: "critical",

        reason:
          "The legal and compliance rule does not permit administrative live intake.",
      };
  }

  const paymentEvaluation = evaluateJurisdictionPaymentRouting(
    approvedPaymentRouting,
  );

  if (!paymentEvaluation.ready) {
    return {
      label: "Payment blocked",

      tone: "critical",

      reason: paymentEvaluation.reason,
    };
  }

  return {
    label: "Open",

    tone: "positive",

    reason: paymentEvaluation.reason,
  };
}

/* ========================================================================== */
/* Metadata                                                                    */
/* ========================================================================== */

export async function generateMetadata({
  params,
}: PageProps<"/pro/jurisdictions/[id]">): Promise<Metadata> {
  const session = await resolveStaffSession();

  if (!session) {
    return {
      title: "Jurisdiction Review",
    };
  }

  const { id } = await params;

  const review = await getJurisdictionReviewDraft(id);

  if (!review) {
    return {
      title: "Jurisdiction Review",
    };
  }

  return {
    title: `${review.countyName ?? review.stateName} ${humanize(
      review.saleType,
    )}`,
  };
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

/**
 * PRODUCTION JURISDICTION REVIEW
 *
 * Human control point between harvested official evidence and a live
 * jurisdiction rule.
 *
 * Live intake requires BOTH:
 *
 *   - approved legal/compliance rules
 *   - approved payment and representation routing
 *
 * Unknown payment routing fails closed.
 *
 * Acquisition may be researched for future use but is not part of the current
 * Duequity launch model.
 */
export default async function ProJurisdictionDetailPage({
  params,
}: PageProps<"/pro/jurisdictions/[id]">) {
  const session = await resolveStaffSession();

  if (!session) {
    return <StaffAuthenticationRequired />;
  }

  const { id } = await params;

  if (!can(session, "jurisdiction.read")) {
    notFound();
  }

  const review = await getJurisdictionReviewDraft(id);

  if (!review) {
    notFound();
  }

  const approvedPackage = review.approvedPackageId
    ? await getJurisdictionRulePackage(review.approvedPackageId)
    : undefined;

  const draftPaymentRouting = reviewPaymentRouting(review);

  const activePaymentRouting =
    approvedPackage?.paymentRouting ?? draftPaymentRouting;

  const intake = intakeState({
    review,

    approvedPaymentRouting: approvedPackage?.paymentRouting,

    approvedComplianceStatus: approvedPackage?.rule?.complianceStatus,
  });

  const paymentEvaluation =
    evaluateJurisdictionPaymentRouting(activePaymentRouting);

  const reviewedCount = review.reviewedFindings.length;

  const requiredCount = REQUIRED_REVIEW_FINDINGS.length;

  const canWrite = can(session, "jurisdiction.write");

  const canApprove = can(session, "compliance.approve");

  const paymentEvidenceCount =
    review.findingSourceIds.payment_routing?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* ================================================================== */}
      {/* Header                                                             */}
      {/* ================================================================== */}

      <div>
        <Breadcrumbs
          trail={[
            {
              href: "/pro/jurisdictions",

              label: "Jurisdictions",
            },
            {
              label: review.countyName ?? review.stateName,
            },
          ]}
        />

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow text-ink-500">
              {review.stateCode} · GEOID {review.countyGeoid}
            </p>

            <h1 className="mt-1.5 text-2xl">
              {review.countyName
                ? `${review.countyName}, ${review.stateName}`
                : review.stateName}
            </h1>

            <p className="mt-1 text-sm text-ink-600">
              {humanize(review.saleType)} · Review revision {review.revision}
            </p>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <Badge tone={reviewTone(review.status)}>
                {humanize(review.status)}
              </Badge>

              <Badge
                tone={
                  review.evidenceStatus === "complete"
                    ? "positive"
                    : review.evidenceStatus === "partial"
                      ? "caution"
                      : "critical"
                }
              >
                Evidence {humanize(review.evidenceStatus)}
              </Badge>

              <Badge
                tone={
                  activePaymentRouting && paymentEvaluation.ready
                    ? "positive"
                    : activePaymentRouting?.launchTrack === "future_acquisition"
                      ? "caution"
                      : "critical"
                }
              >
                Payment {paymentRouteLabel(activePaymentRouting?.paymentRoute)}
              </Badge>

              <Badge tone={intake.tone}>Intake {intake.label}</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Intake control                                                     */}
      {/* ================================================================== */}

      {review.status !== "approved" && (
        <Callout tone="caution" title="Intake remains blocked">
          <p>
            This evidence has not yet produced an approved operational
            jurisdiction rule. Duequity may continue research and human review,
            but live claimant intake, outreach, and operational promotion remain
            blocked.
          </p>
        </Callout>
      )}

      {review.status === "approved" && approvedPackage && (
        <Callout
          tone={intake.tone}
          title={`Approved rule · Intake ${intake.label.toLowerCase()}`}
        >
          <p>
            Rule package {approvedPackage.id}, version {approvedPackage.version}
            , is the operational source for this jurisdiction and sale type.{" "}
            {intake.reason}
          </p>
        </Callout>
      )}

      {/* ================================================================== */}
      {/* Payment and representation                                         */}
      {/* ================================================================== */}

      <Card>
        <CardHeader title="Payment & representation" />

        <CardBody>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
            <DataList>
              <DataItem label="Government payment route">
                <Badge
                  tone={
                    activePaymentRouting?.paymentRoute === "unknown"
                      ? "critical"
                      : activePaymentRouting?.paymentRoute === "assignee"
                        ? "caution"
                        : activePaymentRouting
                          ? "positive"
                          : "critical"
                  }
                >
                  {paymentRouteLabel(activePaymentRouting?.paymentRoute)}
                </Badge>
              </DataItem>

              <DataItem label="Duequity recovery track">
                {paymentTrackLabel(activePaymentRouting?.launchTrack)}
              </DataItem>

              <DataItem label="Fee collection">
                {feeCollectionLabel(activePaymentRouting?.feeCollectionMethod)}
              </DataItem>
            </DataList>

            <DataList>
              <DataItem label="Representative may file">
                {yesNoUnknownLabel(activePaymentRouting?.representativeMayFile)}
              </DataItem>

              <DataItem label="Representative may receive payment">
                {yesNoUnknownLabel(
                  activePaymentRouting?.representativeMayReceivePayment,
                )}
              </DataItem>

              <DataItem label="Assignment required">
                {yesNoUnknownLabel(
                  activePaymentRouting?.assignmentRequiredForRepresentativePayment,
                )}
              </DataItem>
            </DataList>

            <DataList>
              <DataItem label="Payment evidence">
                {paymentEvidenceCount} source
                {paymentEvidenceCount === 1 ? "" : "s"}
              </DataItem>

              <DataItem label="Payment gate">
                <Badge
                  tone={
                    paymentEvaluation.ready
                      ? "positive"
                      : activePaymentRouting?.launchTrack ===
                          "future_acquisition"
                        ? "caution"
                        : "critical"
                  }
                >
                  {paymentEvaluation.ready
                    ? "Cleared"
                    : activePaymentRouting?.launchTrack === "future_acquisition"
                      ? "Future pipeline"
                      : "Blocked"}
                </Badge>
              </DataItem>

              <DataItem label="Current launch support">
                {paymentEvaluation.ready ? "Supported" : "Not operational"}
              </DataItem>
            </DataList>
          </div>

          {activePaymentRouting?.notes && (
            <div className="mt-5 rounded-xl border border-line-soft bg-paper-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Payment-routing note
              </p>

              <p className="mt-1 text-sm leading-relaxed text-ink-700">
                {activePaymentRouting.notes}
              </p>
            </div>
          )}

          {!paymentEvaluation.ready && (
            <div className="mt-5">
              <Callout
                tone={
                  activePaymentRouting?.launchTrack === "future_acquisition"
                    ? "caution"
                    : "critical"
                }
                title={
                  activePaymentRouting?.launchTrack === "future_acquisition"
                    ? "Acquisition is not a launch workflow"
                    : "Payment routing is not cleared"
                }
              >
                <p>{paymentEvaluation.reason}</p>
              </Callout>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ================================================================== */}
      {/* Review editor + sidebar                                             */}
      {/* ================================================================== */}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {canWrite ? (
            <JurisdictionReviewEditor draft={review} canApprove={canApprove} />
          ) : (
            <Callout tone="critical" title="Read only">
              <p>
                Your current role may view this jurisdiction review but may not
                edit its findings.
              </p>
            </Callout>
          )}
        </div>

        <aside className="min-w-0 space-y-5">
          {/* ============================================================== */}
          {/* Review state                                                   */}
          {/* ============================================================== */}

          <Card>
            <CardHeader title="Review state" />

            <CardBody>
              <DataList>
                <DataItem label="Status">
                  <Badge tone={reviewTone(review.status)}>
                    {humanize(review.status)}
                  </Badge>
                </DataItem>

                <DataItem label="Evidence">
                  {humanize(review.evidenceStatus)}
                </DataItem>

                <DataItem label="Official sources">
                  {review.sourceCandidates.length +
                    review.additionalSources.length}
                </DataItem>

                <DataItem label="Selected sources">
                  {review.selectedSourceIds.length}
                </DataItem>

                <DataItem label="Payment evidence">
                  {paymentEvidenceCount}
                </DataItem>

                <DataItem label="Required findings">
                  {reviewedCount} / {requiredCount} reviewed
                </DataItem>

                <DataItem label="Evidence packet">
                  <span className="break-all font-mono text-2xs">
                    {review.evidencePacketHash}
                  </span>
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          {/* ============================================================== */}
          {/* Control                                                        */}
          {/* ============================================================== */}

          <Card>
            <CardHeader title="Control" />

            <CardBody>
              <DataList>
                <DataItem label="Current operator">
                  {session.user.name}
                </DataItem>

                <DataItem label="Role">{humanize(session.user.role)}</DataItem>

                <DataItem label="May edit">{canWrite ? "Yes" : "No"}</DataItem>

                <DataItem label="May approve">
                  {canApprove ? "Yes" : "No"}
                </DataItem>

                <DataItem label="Payment gate">
                  {paymentEvaluation.ready ? "Cleared" : "Blocked"}
                </DataItem>

                <DataItem label="Intake">
                  <Badge tone={intake.tone}>{intake.label}</Badge>
                </DataItem>
              </DataList>
            </CardBody>
          </Card>

          {/* ============================================================== */}
          {/* Approved package                                               */}
          {/* ============================================================== */}

          {approvedPackage && (
            <Card>
              <CardHeader title="Approved package" />

              <CardBody>
                <DataList>
                  <DataItem label="Package">
                    <span className="break-all font-mono text-2xs">
                      {approvedPackage.id}
                    </span>
                  </DataItem>

                  <DataItem label="Version">{approvedPackage.version}</DataItem>

                  <DataItem label="Scope">
                    {humanize(approvedPackage.scope)}
                  </DataItem>

                  <DataItem label="Payment route">
                    {paymentRouteLabel(
                      approvedPackage.paymentRouting?.paymentRoute,
                    )}
                  </DataItem>

                  <DataItem label="Recovery track">
                    {paymentTrackLabel(
                      approvedPackage.paymentRouting?.launchTrack,
                    )}
                  </DataItem>

                  <DataItem label="Approved by">
                    {review.approvedByName ??
                      approvedPackage.approvedByUserId ??
                      "Recorded"}
                  </DataItem>
                </DataList>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      {/* ================================================================== */}
      {/* Operational boundary                                               */}
      {/* ================================================================== */}

      <p className="text-xs leading-relaxed text-ink-500">
        Duequity activates only straightforward administrative recoveries with
        verified entitlement, approved legal rules, approved fee terms, and a
        known government payment route. Claimant-payee cases use Direct Claimant
        Recovery. Representative, joint-payee, and split-disbursement cases may
        use Managed Representative Recovery when expressly authorized.
        Assignment and acquisition remain a future pipeline.
      </p>
    </div>
  );
}