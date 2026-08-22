"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/surface";

interface ManagerApprovalResponse {
  ok: boolean;
  error?: string;
}

export function ManagerApprovalAction({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | undefined>();

  async function approve() {
    if (submitting) {
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
            action: "approve_manager",
            actorUserId: "usr-okonjo",
            reason: "Approved by National Claims Manager.",
          }),
        },
      );

      const data = (await response.json()) as ManagerApprovalResponse;

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Manager approval failed.");

        return;
      }

      router.refresh();
    } catch {
      setError("Manager approval failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4">
      {error && (
        <Callout tone="critical" className="mb-3">
          <p>{error}</p>
        </Callout>
      )}

      <Button
        variant="primary"
        accent
        disabled={submitting}
        onClick={() => void approve()}
      >
        {submitting ? "Approving..." : "Approve manager exception"}
      </Button>

      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        Manager approval is persisted with the approving manager, timestamp,
        policy version and original pricing snapshot.
      </p>
    </div>
  );
}
