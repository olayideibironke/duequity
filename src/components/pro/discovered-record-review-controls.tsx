"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

interface ReviewResponse {
  ok: boolean;

  error?: string;

  record?: {
    id: string;

    status: "reviewed" | "dismissed";

    reviewedAt?: string;

    reviewedByUserId?: string;

    reviewNote?: string;
  };
}

export function DiscoveredRecordReviewControls({
  recordId,
  currentStatus,
  existingNote,
}: {
  recordId: string;

  currentStatus: "new" | "reviewed" | "dismissed";

  existingNote?: string;
}) {
  const router = useRouter();

  const [reviewNote, setReviewNote] = useState(existingNote ?? "");

  const [submitting, setSubmitting] = useState<"reviewed" | "dismissed" | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  async function submitReview(decision: "reviewed" | "dismissed") {
    if (submitting) {
      return;
    }

    if (decision === "dismissed" && !reviewNote.trim()) {
      setError(
        "Enter a review note explaining why this record should be dismissed.",
      );

      return;
    }

    setSubmitting(decision);

    setError(null);

    setSuccess(null);

    try {
      const response = await fetch(
        `/api/pro/discovered-records/${encodeURIComponent(recordId)}/review`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            decision,

            reviewNote: reviewNote.trim() || undefined,
          }),
        },
      );

      const payload = (await response.json()) as ReviewResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to save the record review.");
      }

      setSuccess(
        decision === "reviewed"
          ? "Record marked reviewed."
          : "Record dismissed.",
      );

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save the record review.",
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="discovered-record-review-note"
          className="block text-xs font-semibold text-ink-700"
        >
          Review note
        </label>

        <textarea
          id="discovered-record-review-note"
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="Record verification notes, discrepancies, dismissal reason, or next-step research."
          className="mt-1.5 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
        />

        <p className="mt-1 text-2xs text-ink-400">
          A note is optional for Reviewed and required for Dismissed.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-critical-200 bg-critical-50 px-3 py-2.5 text-sm text-critical-800"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-md border border-positive-200 bg-positive-50 px-3 py-2.5 text-sm text-positive-800"
        >
          {success}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => void submitReview("reviewed")}
          className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "reviewed"
            ? "Saving..."
            : currentStatus === "reviewed"
              ? "Update review"
              : "Mark reviewed"}
        </button>

        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => void submitReview("dismissed")}
          className="inline-flex min-h-9 items-center justify-center rounded-md border border-critical-300 bg-paper px-3.5 py-2 text-sm font-semibold text-critical-700 transition hover:bg-critical-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "dismissed" ? "Saving..." : "Dismiss record"}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-ink-500">
        Review status affects only the discovery queue. It does not create an
        Opportunity, authorize outreach, approve jurisdiction rules, or start
        claimant intake.
      </p>
    </div>
  );
}
