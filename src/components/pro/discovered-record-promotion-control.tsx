"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DiscoveredRecordPromotionControlProps {
  recordId: string;
}

interface PromotionResponse {
  ok?: boolean;

  error?: string;

  opportunity?: {
    id?: string;
  };
}

export function DiscoveredRecordPromotionControl({
  recordId,
}: DiscoveredRecordPromotionControlProps) {
  const router =
    useRouter();

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string>();

  async function promote(): Promise<void> {
    if (submitting) {
      return;
    }

    const confirmed =
      window.confirm(
        "Promote this reviewed discovered record into an operational Opportunity?",
      );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      const response =
        await fetch(
          `/api/pro/discovered-records/${encodeURIComponent(
            recordId,
          )}/promote`,
          {
            method: "POST",
          },
        );

      let result: PromotionResponse = {};

      try {
        result =
          (await response.json()) as PromotionResponse;
      } catch {
        result = {};
      }

      if (
        !response.ok ||
        !result.ok
      ) {
        setError(
          result.error ||
            "This discovered record could not be promoted.",
        );

        return;
      }

      const opportunityId =
        result.opportunity?.id;

      if (!opportunityId) {
        setError(
          "Promotion completed, but the Opportunity could not be resolved.",
        );

        return;
      }

      router.push(
        `/pro/opportunities/${encodeURIComponent(
          opportunityId,
        )}`,
      );
    } catch {
      setError(
        "This discovered record could not be promoted. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void promote()}
        disabled={submitting}
        className="w-full rounded-md bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? "Promoting..."
          : "Promote to Opportunity"}
      </button>

      {error ? (
        <p
          role="alert"
          className="text-xs leading-relaxed text-critical-700"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}