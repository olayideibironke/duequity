import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";

import { Card } from "@/components/ui/surface";

import {
  RecordList,
  RecordListItem,
  Table,
  TableRegion,
  TableToolbar,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
} from "@/components/ui/table";

import {
  evaluateJurisdictionPaymentRouting,
  listJurisdictionRulePackages,
  type DuequityLaunchPaymentTrack,
  type JurisdictionPaymentRoute,
  type JurisdictionRulePackage,
} from "@/server/jurisdiction-intelligence";

import {
  listJurisdictionReviewDrafts,
  type JurisdictionReviewDraft,
} from "@/server/jurisdiction-review-store";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

/* ========================================================================== */
/* Metadata                                                                    */
/* ========================================================================== */

export const metadata: Metadata = {
  title: "Jurisdictions",
};

/* ========================================================================== */
/* Keys                                                                        */
/* ========================================================================== */

function reviewKey(review: JurisdictionReviewDraft): string {
  return [review.stateFips, review.countyGeoid, review.saleType].join(":");
}

function packageKey(rulePackage: JurisdictionRulePackage): string {
  return [
    rulePackage.stateFips,
    rulePackage.countyGeoid ?? "STATE",
    rulePackage.saleType,
  ].join(":");
}

/* ========================================================================== */
/* Labels                                                                      */
/* ========================================================================== */

function saleTypeLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function paymentRouteLabel(
  route: JurisdictionPaymentRoute | undefined,
): string {
  switch (route) {
    case "claimant_only":
      return "Claimant payee";

    case "authorized_representative":
      return "Representative payee";

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

function launchTrackLabel(
  track: DuequityLaunchPaymentTrack | undefined,
): string {
  switch (track) {
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

/* ========================================================================== */
/* Status badges                                                               */
/* ========================================================================== */

function reviewStatusBadge(status: JurisdictionReviewDraft["status"]) {
  switch (status) {
    case "draft":
      return <Badge tone="neutral">Draft</Badge>;

    case "ready_for_approval":
      return <Badge tone="caution">Ready for approval</Badge>;

    case "changes_required":
      return <Badge tone="critical">Changes required</Badge>;

    case "approved":
      return <Badge tone="positive">Approved</Badge>;
  }
}

function evidenceStatusBadge(
  status: JurisdictionReviewDraft["evidenceStatus"],
) {
  switch (status) {
    case "complete":
      return <Badge tone="positive">Complete</Badge>;

    case "partial":
      return <Badge tone="caution">Partial</Badge>;

    case "failed":
      return <Badge tone="critical">Failed</Badge>;
  }
}

function paymentRouteBadge(route: JurisdictionPaymentRoute | undefined) {
  switch (route) {
    case "claimant_only":
      return <Badge tone="positive">Claimant payee</Badge>;

    case "authorized_representative":
      return <Badge tone="positive">Representative payee</Badge>;

    case "joint_payee":
      return <Badge tone="positive">Joint payee</Badge>;

    case "split_disbursement":
      return <Badge tone="positive">Split disbursement</Badge>;

    case "assignee":
      return <Badge tone="caution">Future acquisition</Badge>;

    case "unknown":
    case undefined:
      return <Badge tone="critical">Unknown</Badge>;
  }
}

/* ========================================================================== */
/* Payment-route resolution                                                    */
/* ========================================================================== */

function resolvedPaymentRoute({
  review,
  rulePackage,
}: {
  review: JurisdictionReviewDraft;

  rulePackage?: JurisdictionRulePackage;
}): JurisdictionPaymentRoute | undefined {
  return (
    rulePackage?.paymentRouting?.paymentRoute ?? review.findings.paymentRoute
  );
}

function resolvedLaunchTrack({
  review,
  rulePackage,
}: {
  review: JurisdictionReviewDraft;

  rulePackage?: JurisdictionRulePackage;
}): DuequityLaunchPaymentTrack | undefined {
  return (
    rulePackage?.paymentRouting?.launchTrack ??
    review.findings.paymentLaunchTrack
  );
}

/* ========================================================================== */
/* Intake evaluation                                                          */
/* ========================================================================== */

function intakeState(rulePackage: JurisdictionRulePackage | undefined): {
  label: string;

  open: boolean;

  tone: "positive" | "critical" | "counsel";
} {
  if (!rulePackage || rulePackage.status !== "approved" || !rulePackage.rule) {
    return {
      label: "Blocked",

      open: false,

      tone: "critical",
    };
  }

  const complianceStatus = rulePackage.rule.complianceStatus;

  /*
   * Duequity's startup Green Lane does not activate attorney-only recoveries.
   */
  if (complianceStatus === "attorney_only") {
    return {
      label: "Attorney only",

      open: false,

      tone: "counsel",
    };
  }

  if (complianceStatus !== "approved") {
    return {
      label: "Blocked",

      open: false,

      tone: "critical",
    };
  }

  const paymentEvaluation = evaluateJurisdictionPaymentRouting(
    rulePackage.paymentRouting,
  );

  if (!paymentEvaluation.ready) {
    return {
      label: "Payment blocked",

      open: false,

      tone: "critical",
    };
  }

  return {
    label: "Open",

    open: true,

    tone: "positive",
  };
}

function intakeBadge(rulePackage: JurisdictionRulePackage | undefined) {
  const state = intakeState(rulePackage);

  return <Badge tone={state.tone}>{state.label}</Badge>;
}

/* ========================================================================== */
/* Register row                                                                */
/* ========================================================================== */

interface JurisdictionRegisterRow {
  review: JurisdictionReviewDraft;

  rulePackage?: JurisdictionRulePackage;
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProJurisdictionsPage() {
  /*
   * Server-side session gate.
   *
   * Resolved before any store read. The layout also withholds the operations
   * shell, but layout and page render in parallel, so the page must refuse to
   * read operational data on its own account.
   */
  if (!(await resolveStaffSession())) {
    return <StaffAuthenticationRequired />;
  }

  const [reviews, packages] = await Promise.all([
    listJurisdictionReviewDrafts(),
    listJurisdictionRulePackages(),
  ]);

  /*
   * Show only the latest human review revision for each:
   *
   * state + county + sale type
   */
  const latestByKey = new Map<string, JurisdictionReviewDraft>();

  for (const review of reviews) {
    const key = reviewKey(review);

    const existing = latestByKey.get(key);

    if (!existing || review.revision > existing.revision) {
      latestByKey.set(key, review);
    }
  }

  const packageById = new Map(
    packages.map((rulePackage) => [rulePackage.id, rulePackage]),
  );

  const packageByKey = new Map(
    packages.map((rulePackage) => [packageKey(rulePackage), rulePackage]),
  );

  const rows: JurisdictionRegisterRow[] = [...latestByKey.values()]
    .map((review) => {
      let rulePackage: JurisdictionRulePackage | undefined;

      if (review.approvedPackageId) {
        rulePackage = packageById.get(review.approvedPackageId);
      }

      if (!rulePackage && review.scope) {
        rulePackage = packageByKey.get(
          [
            review.stateFips,

            review.scope === "county" ? review.countyGeoid : "STATE",

            review.saleType,
          ].join(":"),
        );
      }

      return {
        review,
        rulePackage,
      };
    })
    .sort((a, b) => {
      const stateCompare = a.review.stateName.localeCompare(b.review.stateName);

      if (stateCompare !== 0) {
        return stateCompare;
      }

      const countyCompare = (a.review.countyName ?? "").localeCompare(
        b.review.countyName ?? "",
      );

      if (countyCompare !== 0) {
        return countyCompare;
      }

      return a.review.saleType.localeCompare(b.review.saleType);
    });

  const openCount = rows.filter(
    (row) => intakeState(row.rulePackage).open,
  ).length;

  const paymentUnknownCount = rows.filter(({ review, rulePackage }) => {
    const route = resolvedPaymentRoute({
      review,
      rulePackage,
    });

    return !route || route === "unknown";
  }).length;

  return (
    <div className="space-y-5">
      {/* ================================================================== */}
      {/* Header                                                             */}
      {/* ================================================================== */}

      <div>
        <p className="eyebrow text-ink-500">Governance</p>

        <h1 className="mt-1.5 text-2xl">Jurisdictions</h1>

        <p className="mt-1 max-w-3xl text-sm text-ink-600">
          Official-source jurisdiction reviews control whether Duequity may
          accept, assist, and collect its agreed recovery fee under the
          permitted payment route.
        </p>
      </div>

      {/* ================================================================== */}
      {/* Operational summary                                                */}
      {/* ================================================================== */}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Reviews
          </p>

          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {rows.length}
          </p>

          <p className="mt-1 text-xs text-ink-500">
            Latest jurisdiction revisions
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Live intake
          </p>

          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {openCount}
          </p>

          <p className="mt-1 text-xs text-ink-500">
            Legal and payment gates cleared
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Payment research
          </p>

          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {paymentUnknownCount}
          </p>

          <p className="mt-1 text-xs text-ink-500">Routes still unknown</p>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* Register                                                           */}
      {/* ================================================================== */}

      <Card className="overflow-hidden">
        <TableToolbar
          count={rows.length}
          noun={{
            one: "jurisdiction review",

            many: "jurisdiction reviews",
          }}
        />

        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-ink-900">
              No jurisdiction reviews yet
            </p>

            <p className="mx-auto mt-1 max-w-lg text-sm text-ink-500">
              A completed official-source evidence packet must create a human
              review before a jurisdiction can be approved for live operation.
            </p>
          </div>
        ) : (
          <>
            {/* ============================================================ */}
            {/* Desktop                                                      */}
            {/* ============================================================ */}

            <div className="hidden lg:block">
              <TableRegion label="Jurisdiction review register">
                <Table caption="Latest jurisdiction reviews, evidence state, payment route and live intake status">
                  <THead>
                    <TH>Jurisdiction</TH>

                    <TH width="14%">Sale type</TH>

                    <TH width="11%">Evidence</TH>

                    <TH width="14%">Review</TH>

                    <TH width="18%">Payment route</TH>

                    <TH width="12%">Intake</TH>

                    <TH width="9%">Revision</TH>
                  </THead>

                  <TBody>
                    {rows.map(({ review, rulePackage }) => {
                      const paymentRoute = resolvedPaymentRoute({
                        review,
                        rulePackage,
                      });

                      const launchTrack = resolvedLaunchTrack({
                        review,
                        rulePackage,
                      });

                      return (
                        <TR
                          key={review.id}
                          tone={
                            review.status === "changes_required"
                              ? "critical"
                              : review.status !== "approved"
                                ? "caution"
                                : undefined
                          }
                        >
                          <TDPrimary
                            href={`/pro/jurisdictions/${review.id}`}
                            secondary={`${review.stateCode} · GEOID ${review.countyGeoid}`}
                          >
                            {review.countyName
                              ? `${review.countyName}, ${review.stateName}`
                              : review.stateName}
                          </TDPrimary>

                          <TD>
                            <span className="text-xs text-ink-700">
                              {saleTypeLabel(review.saleType)}
                            </span>
                          </TD>

                          <TD>{evidenceStatusBadge(review.evidenceStatus)}</TD>

                          <TD>{reviewStatusBadge(review.status)}</TD>

                          <TD>
                            {paymentRouteBadge(paymentRoute)}

                            <span className="mt-1 block text-2xs leading-relaxed text-ink-500">
                              {launchTrackLabel(launchTrack)}
                            </span>
                          </TD>

                          <TD>{intakeBadge(rulePackage)}</TD>

                          <TD nowrap>
                            <span className="font-mono text-xs text-ink-700">
                              r{review.revision}
                            </span>

                            {rulePackage && (
                              <span className="mt-0.5 block text-2xs text-ink-400">
                                Rule v{rulePackage.version}
                              </span>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableRegion>
            </div>

            {/* ============================================================ */}
            {/* Mobile                                                       */}
            {/* ============================================================ */}

            <div className="lg:hidden">
              <RecordList>
                {rows.map(({ review, rulePackage }) => {
                  const paymentRoute = resolvedPaymentRoute({
                    review,
                    rulePackage,
                  });

                  const launchTrack = resolvedLaunchTrack({
                    review,
                    rulePackage,
                  });

                  const intake = intakeState(rulePackage);

                  return (
                    <RecordListItem
                      key={review.id}
                      href={`/pro/jurisdictions/${review.id}`}
                      title={
                        review.countyName
                          ? `${review.countyName}, ${review.stateName}`
                          : review.stateName
                      }
                      subtitle={saleTypeLabel(review.saleType)}
                      status={reviewStatusBadge(review.status)}
                      tone={
                        review.status === "changes_required"
                          ? "critical"
                          : undefined
                      }
                      facts={[
                        {
                          label: "Evidence",

                          value: review.evidenceStatus,
                        },
                        {
                          label: "Payment route",

                          value: paymentRouteLabel(paymentRoute),
                        },
                        {
                          label: "Recovery track",

                          value: launchTrackLabel(launchTrack),
                        },
                        {
                          label: "Intake",

                          value: intake.label,
                        },
                        {
                          label: "Revision",

                          value: `r${review.revision}`,
                        },
                        {
                          label: "County GEOID",

                          value: review.countyGeoid,
                        },
                      ]}
                    />
                  );
                })}
              </RecordList>
            </div>
          </>
        )}
      </Card>

      {/* ================================================================== */}
      {/* Safety note                                                        */}
      {/* ================================================================== */}

      <p className="text-xs leading-relaxed text-ink-500">
        Live intake requires both an approved legal rule and a verified payment
        route. Claimant-payee jurisdictions use Direct Claimant Recovery.
        Authorized representative, joint-payee, and split-disbursement
        jurisdictions may use Managed Representative Recovery. Assignment and
        acquisition remain outside the current launch model.
      </p>
    </div>
  );
}