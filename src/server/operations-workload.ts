import "server-only";

import { evaluateIntakeGate } from "@/domain/compliance";

import { resolveLegalPosition } from "@/domain/legal-position";

import { DOCUMENT_KIND_LABEL } from "@/domain/status";

import type {
  Claim,
  DocumentRequest,
  IsoDate,
  Jurisdiction,
} from "@/domain/types";

import { listClaimDocumentRequests } from "@/server/claim-document-store";

import { resolveClaimRecord } from "@/server/claim-record";

import { listJurisdictionRulePackages } from "@/server/jurisdiction-intelligence";

import { listOpportunityConversions } from "@/server/opportunity-conversion-store";

import { listOpportunities } from "@/server/opportunity-store";

/**
 * OPERATIONS WORKLOAD
 *
 * The single server-side derivation of "what work is outstanding right now".
 *
 * Duequity has no task store. There is deliberately no table of hand-created
 * to-dos, because a hand-created to-do can survive after the condition that
 * justified it has gone away, and a stale operational queue is worse than none.
 *
 * Every item returned here is derived from a persisted fact:
 *
 *   - an opportunity whose jurisdiction has no approved rule package
 *   - an opportunity whose approved jurisdiction rule blocks intake
 *   - a claim with no approved jurisdiction rule
 *   - a claim whose legal lane awaits a human determination
 *   - a claim carrying an unresolved legal classification conflict
 *   - an outstanding or overdue persisted document requirement
 *
 * When the underlying fact is resolved, the item disappears. Nothing is invented
 * and nothing persists past its cause.
 *
 * This module exists so that the navigation badge counts and the work queue page
 * cannot disagree. Both read the same derivation.
 */

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type DerivedTaskKind =
  "compliance_review" | "document_request" | "legal_review";

export interface DerivedOperationsTask {
  id: string;
  title: string;
  detail: string;
  kind: DerivedTaskKind;
  status: "open" | "blocked";
  priority: 1 | 2 | 3;
  dueBy?: IsoDate;
  reference: string;
  href: string;
}

export interface OperationsWorkloadClaimRow {
  claim: Claim;
  documentRequests: DocumentRequest[];
}

export interface OperationsWorkload {
  /** Business date the derivation was evaluated against. */
  today: IsoDate;

  tasks: DerivedOperationsTask[];

  openTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  dueThisWeekTaskCount: number;

  /** Persisted opportunities that have not yet been converted to a claim. */
  openOpportunityCount: number;

  /** Resolved claims that are neither paid, closed nor withdrawn. */
  openClaimCount: number;

  /** Outstanding or overdue persisted document requirements. */
  outstandingDocumentCount: number;

  /** Opportunities whose jurisdiction currently forbids the normal intake path. */
  complianceBlockedCount: number;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function currentIsoDate(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number);

  const value = new Date(Date.UTC(year, month - 1, day));

  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10) as IsoDate;
}

function isOpenTask(task: DerivedOperationsTask): boolean {
  return task.status === "open" || task.status === "blocked";
}

/* ========================================================================== */
/* Derivation                                                                  */
/* ========================================================================== */

export async function resolveOperationsWorkload(): Promise<OperationsWorkload> {
  const today = currentIsoDate();

  const [opportunities, conversions, jurisdictionPackages] = await Promise.all([
    listOpportunities(),
    listOpportunityConversions(),
    listJurisdictionRulePackages(),
  ]);

  /* ---------------------------------------------------- approved rule index */

  const approvedJurisdictionById = new Map<string, Jurisdiction>();

  for (const rulePackage of jurisdictionPackages) {
    if (rulePackage.status !== "approved" || !rulePackage.rule) {
      continue;
    }

    approvedJurisdictionById.set(rulePackage.rule.id, rulePackage.rule);
  }

  /* --------------------------------------------------------- claim rows */

  const claimRows: OperationsWorkloadClaimRow[] = (
    await Promise.all(
      conversions.map(async (conversion) => {
        const resolved = await resolveClaimRecord(conversion.claimId);

        if (!resolved) {
          return undefined;
        }

        return {
          claim: resolved.claim,

          documentRequests: await listClaimDocumentRequests(resolved.claim.id),
        };
      }),
    )
  ).flatMap((row) => (row ? [row] : []));

  /* ------------------------------------------------------------ task queue */

  const tasks: DerivedOperationsTask[] = [];

  let complianceBlockedCount = 0;

  for (const opportunity of opportunities) {
    const jurisdiction = approvedJurisdictionById.get(
      opportunity.jurisdictionId,
    );

    if (!jurisdiction) {
      complianceBlockedCount += 1;

      tasks.push({
        id: `opportunity-jurisdiction-${opportunity.id}`,

        title: "Jurisdiction approval required",

        detail:
          "This opportunity cannot move into normal intake because no approved jurisdiction rule package is available.",

        kind: "compliance_review",

        status: "blocked",

        priority: 1,

        reference: opportunity.reference,

        href: `/pro/opportunities/${opportunity.id}`,
      });

      continue;
    }

    const gate = evaluateIntakeGate(jurisdiction);

    if (gate.outcome === "blocked") {
      complianceBlockedCount += 1;

      tasks.push({
        id: `opportunity-gate-${opportunity.id}`,

        title: "Resolve jurisdiction intake block",

        detail: gate.requiredAction ?? gate.reason,

        kind: "compliance_review",

        status: "blocked",

        priority: 1,

        reference: opportunity.reference,

        href: `/pro/opportunities/${opportunity.id}`,
      });
    }
  }

  let outstandingDocumentCount = 0;

  for (const { claim, documentRequests } of claimRows) {
    const jurisdiction = approvedJurisdictionById.get(claim.jurisdictionId);

    if (!jurisdiction) {
      tasks.push({
        id: `claim-jurisdiction-${claim.id}`,

        title: "Claim missing approved jurisdiction rule",

        detail:
          "Legal and compliance routing cannot proceed until an approved jurisdiction rule package is published.",

        kind: "compliance_review",

        status: "blocked",

        priority: 1,

        reference: claim.reference,

        href: `/pro/claims/${claim.id}`,
      });
    } else {
      const legalPosition = resolveLegalPosition(claim, jurisdiction, today);

      if (
        legalPosition.lane === "legal_review" &&
        (legalPosition.handoffStatus === "review_pending" ||
          !legalPosition.humanDetermined)
      ) {
        tasks.push({
          id: `legal-review-${claim.id}`,

          title: "Legal determination required",

          detail: legalPosition.rationale,

          kind: "legal_review",

          status: "blocked",

          priority: 1,

          dueBy: legalPosition.legalDeadline,

          reference: claim.reference,

          href: `/pro/claims/${claim.id}#legal`,
        });
      }

      if (legalPosition.conflicts.length > 0) {
        tasks.push({
          id: `legal-conflict-${claim.id}`,

          title: "Resolve legal classification conflict",

          detail: legalPosition.conflicts
            .map((conflict) => conflict.summary)
            .join(" / "),

          kind: "legal_review",

          status: "blocked",

          priority: 1,

          reference: claim.reference,

          href: `/pro/claims/${claim.id}#legal`,
        });
      }
    }

    /*
     * Outstanding document requirements already represent concrete work.
     * They are surfaced here without duplicating them into another task store.
     */
    for (const request of documentRequests) {
      if (request.status !== "outstanding" && request.status !== "overdue") {
        continue;
      }

      outstandingDocumentCount += 1;

      const overdue =
        request.status === "overdue" ||
        Boolean(request.dueBy && request.dueBy < today);

      tasks.push({
        id: `document-${request.id}`,

        title: `${DOCUMENT_KIND_LABEL[request.kind]} required`,

        detail: request.reason,

        kind: "document_request",

        status: overdue ? "blocked" : "open",

        priority: overdue ? 1 : request.required ? 2 : 3,

        dueBy: request.dueBy,

        reference: claim.reference,

        href: `/pro/claims/${claim.id}`,
      });
    }
  }

  /* ------------------------------------------------------------- pipeline */

  const convertedOpportunityIds = new Set(
    conversions.map((conversion) => conversion.opportunityId),
  );

  const openOpportunityCount = opportunities.filter(
    (opportunity) => !convertedOpportunityIds.has(opportunity.id),
  ).length;

  const openClaimCount = claimRows.filter(
    ({ claim }) =>
      claim.status !== "paid" &&
      claim.status !== "closed" &&
      claim.status !== "withdrawn",
  ).length;

  /* -------------------------------------------------------------- metrics */

  const weekEnd = addDays(today, 7);

  return {
    today,

    tasks,

    openTaskCount: tasks.filter(isOpenTask).length,

    overdueTaskCount: tasks.filter((task) =>
      Boolean(task.dueBy && task.dueBy < today),
    ).length,

    blockedTaskCount: tasks.filter((task) => task.status === "blocked").length,

    dueThisWeekTaskCount: tasks.filter((task) =>
      Boolean(task.dueBy && task.dueBy >= today && task.dueBy <= weekEnd),
    ).length,

    openOpportunityCount,

    openClaimCount,

    outstandingDocumentCount,

    complianceBlockedCount,
  };
}
