import type { Metadata } from "next";

import Link from "next/link";

import { TASK_STATUS } from "@/domain/status";

import { Card, EmptyState, Stat } from "@/components/ui/surface";

import { Badge, PriorityMark, StatusBadge } from "@/components/ui/badge";

import { FilterLinks } from "@/components/ui/tabs";

import { describeDeadline, formatCount, formatDate } from "@/lib/format";

import {
  resolveOperationsWorkload,
  type DerivedOperationsTask,
  type DerivedTaskKind,
} from "@/server/operations-workload";

import { resolveStaffSession } from "@/server/staff-session";
import { StaffAuthenticationRequired } from "@/components/ui/authentication-required";

export const metadata: Metadata = {
  title: "Tasks",
};

export const dynamic = "force-dynamic";

/**
 * OPERATIONS WORK QUEUE
 *
 * Duequity has no hand-maintained task table. Every row on this page is derived
 * live from a persisted record by `resolveOperationsWorkload`, which is also the
 * source of the navigation badge counts. The two therefore cannot diverge.
 *
 * When the underlying record is resolved, the row disappears on the next read.
 * Nothing here can outlive the fact that justified it.
 */

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function taskKindLabel(kind: DerivedTaskKind): string {
  switch (kind) {
    case "compliance_review":
      return "Compliance";

    case "document_request":
      return "Documents";

    case "legal_review":
      return "Legal review";
  }
}

function isOpenTask(task: DerivedOperationsTask): boolean {
  return task.status === "open" || task.status === "blocked";
}

/* ========================================================================== */
/* Page                                                                        */
/* ========================================================================== */

export default async function ProTasksPage({
  searchParams,
}: PageProps<"/pro/tasks">) {
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

  const params = await searchParams;

  const filter =
    (Array.isArray(params.filter) ? params.filter[0] : params.filter) ?? "open";

  const {
    today,
    tasks,
    openTaskCount: openCount,
    overdueTaskCount: overdueCount,
    blockedTaskCount: blockedCount,
    dueThisWeekTaskCount: dueThisWeekCount,
  } = await resolveOperationsWorkload();

  /* ======================================================================== */
  /* Filters                                                                  */
  /* ======================================================================== */

  function apply(key: string): DerivedOperationsTask[] {
    switch (key) {
      case "open":
        return tasks.filter(isOpenTask);

      case "overdue":
        return tasks.filter((task) =>
          Boolean(task.dueBy && task.dueBy < today),
        );

      case "blocked":
        return tasks.filter((task) => task.status === "blocked");

      case "compliance_review":
        return tasks.filter((task) => task.kind === "compliance_review");

      case "document_request":
        return tasks.filter((task) => task.kind === "document_request");

      case "legal_review":
        return tasks.filter((task) => task.kind === "legal_review");

      case "all":
        return tasks;

      default:
        return tasks.filter(isOpenTask);
    }
  }

  const filteredTasks = [...apply(filter)].sort((first, second) => {
    const firstOverdue = first.dueBy && first.dueBy < today ? 0 : 1;

    const secondOverdue = second.dueBy && second.dueBy < today ? 0 : 1;

    if (firstOverdue !== secondOverdue) {
      return firstOverdue - secondOverdue;
    }

    const firstBlocked = first.status === "blocked" ? 0 : 1;

    const secondBlocked = second.status === "blocked" ? 0 : 1;

    if (firstBlocked !== secondBlocked) {
      return firstBlocked - secondBlocked;
    }

    if (first.priority !== second.priority) {
      return first.priority - second.priority;
    }

    return (first.dueBy ?? "9999-12-31").localeCompare(
      second.dueBy ?? "9999-12-31",
    );
  });

  const filters = [
    {
      key: "open",

      label: "Open",
    },

    {
      key: "overdue",

      label: "Overdue",
    },

    {
      key: "blocked",

      label: "Blocked",
    },

    {
      key: "compliance_review",

      label: "Compliance",
    },

    {
      key: "document_request",

      label: "Documents",
    },

    {
      key: "legal_review",

      label: "Legal",
    },

    {
      key: "all",

      label: "All",
    },
  ].map((item) => ({
    href: `/pro/tasks?filter=${item.key}`,

    label: item.label,

    count: apply(item.key).length,

    active: filter === item.key,
  }));

  return (
    <div className="space-y-5">
      {/* ================================================================ header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">Work</p>

          <h1 className="mt-1.5 text-2xl">Tasks</h1>

          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Live operational work derived from persisted jurisdiction, claim,
            legal and document records. Duequity does not create duplicate task
            records for conditions that already exist in the underlying
            workflow.
          </p>
        </div>
      </div>

      {/* ================================================================= stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Open"
          value={formatCount(openCount)}
          context="Current actionable work"
        />

        <Stat
          label="Overdue"
          value={formatCount(overdueCount)}
          tone={overdueCount > 0 ? "critical" : "positive"}
          context="Past a recorded due date"
        />

        <Stat
          label="Blocked"
          value={formatCount(blockedCount)}
          tone={blockedCount > 0 ? "caution" : "positive"}
          context="Cannot proceed until the underlying issue is resolved"
        />

        <Stat
          label="Due this week"
          value={formatCount(dueThisWeekCount)}
          context="Recorded deadlines in the next seven days"
        />
      </div>

      {/* =============================================================== filters */}
      <FilterLinks filters={filters} label="Filter tasks" />

      {/* ================================================================ queue */}
      <Card className="overflow-hidden">
        {filteredTasks.length === 0 ? (
          <EmptyState
            className="m-4 border-0 bg-transparent"
            title="No work matches this filter"
            description="The queue is generated from current persisted workflow conditions."
          />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {filteredTasks.map((task) => {
              const overdue = Boolean(task.dueBy && task.dueBy < today);

              const due = task.dueBy
                ? describeDeadline(task.dueBy, today)
                : undefined;

              return (
                <li
                  key={task.id}
                  className={
                    overdue
                      ? "shadow-[inset_2px_0_0_0_var(--color-critical-600)]"
                      : task.status === "blocked"
                        ? "shadow-[inset_2px_0_0_0_var(--color-caution-600)]"
                        : undefined
                  }
                >
                  <Link
                    href={task.href}
                    className="block px-4 py-3.5 transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-500 sm:px-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <PriorityMark priority={task.priority} />

                          <p className="text-base font-medium text-ink-900">
                            {task.title}
                          </p>
                        </div>

                        <p className="mt-1 text-sm leading-relaxed text-ink-600">
                          {task.detail}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                          <Badge tone="neutral">
                            {taskKindLabel(task.kind)}
                          </Badge>

                          <span className="font-mono">{task.reference}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <StatusBadge status={TASK_STATUS[task.status]} />

                        {task.dueBy && due && (
                          <span
                            className={
                              overdue
                                ? "tnum text-xs font-medium text-critical-700"
                                : "tnum text-xs text-ink-500"
                            }
                          >
                            {formatDate(task.dueBy)}

                            <span className="ml-1.5">({due.label})</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}