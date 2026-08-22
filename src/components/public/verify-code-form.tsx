"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { IconShield } from "@/components/ui/icon";

/**
 * VERIFICATION CODE FORM
 *
 * Navigates with the code in the URL so a result is shareable and can be revisited.
 *
 * The input uppercases as you type and strips characters that cannot appear in a
 * code, which removes the most common failure mode: someone typing a lowercase code
 * from a letter and getting a false negative on a page whose whole purpose is telling
 * them whether to trust a contact.
 */
export function VerifyCodeForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();

    if (!clean) {
      setError("Enter the verification code from the message you received.");
      return;
    }
    if (clean.length < 4) {
      setError(
        "Verification codes are four characters. Please check the message again.",
      );
      return;
    }

    setError(undefined);
    setPending(true);
    router.push(`/verify?code=${encodeURIComponent(clean)}`);
    setTimeout(() => setPending(false), 1200);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="max-w-sm">
        <TextField
          label="Verification code"
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 6),
            )
          }
          placeholder="4K2P"
          controlSize="lg"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono text-lg tracking-[0.25em]"
          hint="Four characters, printed near the top of the letter or in the email footer."
          error={error}
          required
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          accent
          loading={pending}
          leading={<IconShield size={16} />}
        >
          Verify this contact
        </Button>
        <p className="text-xs text-ink-500">
          No personal information is required to verify.
        </p>
      </div>
    </form>
  );
}
