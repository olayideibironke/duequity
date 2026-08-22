"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/surface";
import { formatCents } from "@/lib/format";

interface ManagerReviewResponse {
  ok: boolean;
  error?: string;
}

function percentLabel(value: number): string {
  const percent = value * 100;

  return Number.isInteger(percent)
    ? `${percent.toFixed(0)}%`
    : `${percent.toFixed(1)}%`;
}

export function PricingExceptionRequest({
  opportunityId,
  actorUserId,
  recoveryAmount,
  currentPercentage,
  staffCeilingPercentage,
  managerCeilingPercentage,
}: {
  opportunityId: string;
  actorUserId: string;
  recoveryAmount: number;
  currentPercentage: number;
  staffCeilingPercentage: number;
  managerCeilingPercentage: number;
}) {
  const router = useRouter();

  const minimumExceptionPercent =
    Math.round((staffCeilingPercentage * 100 + 0.1) * 10) / 10;

  const managerMaximumPercent = managerCeilingPercentage * 100;

  const [requestedPercent, setRequestedPercent] = useState(
    Math.min(
      managerMaximumPercent,
      Math.max(minimumExceptionPercent, currentPercentage * 100 + 1),
    ).toString(),
  );

  const [reason, setReason] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [submitted, setSubmitted] = useState(false);

  const [error, setError] = useState<string | undefined>();

  const requestedPercentage = Number(requestedPercent) / 100;

  const validPercentage =
    Number.isFinite(requestedPercentage) &&
    requestedPercentage > staffCeilingPercentage &&
    requestedPercentage <= managerCeilingPercentage;

  const projectedFee = useMemo(() => {
    if (!validPercentage) {
      return undefined;
    }

    return Math.round(recoveryAmount * requestedPercentage);
  }, [recoveryAmount, requestedPercentage, validPercentage]);

  const projectedClaimantNet =
    projectedFee !== undefined
      ? Math.max(0, recoveryAmount - projectedFee)
      : undefined;

  async function submitException() {
    if (submitting || !validPercentage || !reason.trim()) {
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      const response = await fetch(
        `/api/pro/commercial-pricing/${encodeURIComponent(opportunityId)}`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            action: "request_manager_review",

            actorUserId,

            requestedPercentage,

            reason: reason.trim(),
          }),
        },
      );

      const data = (await response.json()) as ManagerReviewResponse;

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Manager review request failed.");

        return;
      }

      setSubmitted(true);

      router.refresh();
    } catch {
      setError("Manager review request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Callout tone="positive" className="mt-4" title="Sent to manager">
        <p>
          The pricing exception has been persisted and added to the manager
          review queue.
        </p>

        <p className="mt-2 text-xs">
          Requested rate:{" "}
          <span className="font-semibold">
            {percentLabel(requestedPercentage)}
          </span>
        </p>
      </Callout>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-line bg-inset px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-ink-900">
          Request pricing exception
        </p>

        <p className="mt-1 text-xs leading-relaxed text-ink-600">
          Use this only when there is a business reason to quote outside
          ordinary staff authority. The manager ceiling remains a hard limit.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`pricing-exception-${opportunityId}`}
            className="text-xs font-medium text-ink-700"
          >
            Requested rate
          </label>

          <div className="mt-1 flex items-center gap-2">
            <input
              id={`pricing-exception-${opportunityId}`}
              type="number"
              min={minimumExceptionPercent}
              max={managerMaximumPercent}
              step="0.1"
              value={requestedPercent}
              onChange={(event) => setRequestedPercent(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-900 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
            />

            <span className="text-sm font-medium text-ink-600">%</span>
          </div>

          <p className="mt-1.5 text-2xs text-ink-500">
            Staff ceiling: {percentLabel(staffCeilingPercentage)}. Manager
            ceiling: {percentLabel(managerCeilingPercentage)}.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-ink-700">
            Exception economics
          </p>

          {validPercentage &&
          projectedFee !== undefined &&
          projectedClaimantNet !== undefined ? (
            <div className="mt-1 space-y-1 text-sm">
              <p>
                Duequity fee:{" "}
                <span className="font-semibold text-ink-900">
                  {formatCents(projectedFee)}
                </span>
              </p>

              <p>
                Claimant projected net:{" "}
                <span className="font-semibold text-ink-900">
                  {formatCents(projectedClaimantNet)}
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-critical-700">
              Enter a rate above the staff ceiling and no higher than the
              manager ceiling.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor={`pricing-exception-reason-${opportunityId}`}
          className="text-xs font-medium text-ink-700"
        >
          Business reason
        </label>

        <textarea
          id={`pricing-exception-reason-${opportunityId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="Explain why this opportunity needs pricing outside ordinary staff authority."
          className="mt-1 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink-900 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
        />
      </div>

      {error && (
        <Callout tone="critical" className="mt-3">
          <p>{error}</p>
        </Callout>
      )}

      <Button
        variant="secondary"
        className="mt-4"
        disabled={submitting || !validPercentage || !reason.trim()}
        onClick={() => void submitException()}
      >
        {submitting ? "Sending to manager..." : "Send to manager"}
      </Button>

      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        The server recalculates the requested rate against the jurisdiction
        ceiling, Duequity policy and manager authority before adding it to the
        approval queue.
      </p>
    </div>
  );
}
