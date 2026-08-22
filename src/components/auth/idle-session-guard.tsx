"use client";

import { useEffect, useRef, useState } from "react";

const WARNING_AFTER_MS = 13 * 60 * 1000;
const SIGN_OUT_AFTER_MS = 15 * 60 * 1000;
const CHECK_INTERVAL_MS = 1000;

function formatRemainingTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function submitSignOut() {
  const form = document.createElement("form");

  form.method = "POST";
  form.action = "/auth/sign-out";
  form.style.display = "none";

  document.body.appendChild(form);
  form.submit();
}

export function IdleSessionGuard() {
  const lastActivityAt = useRef(Date.now());
  const warningOpenRef = useRef(false);

  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(
    SIGN_OUT_AFTER_MS - WARNING_AFTER_MS,
  );

  useEffect(() => {
    function recordActivity() {
      if (warningOpenRef.current) {
        return;
      }

      lastActivityAt.current = Date.now();
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      "keydown",
      "mousedown",
      "pointerdown",
      "scroll",
      "touchstart",
    ];

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, recordActivity, { passive: true });
    }

    const interval = window.setInterval(() => {
      const idleForMs = Date.now() - lastActivityAt.current;

      if (idleForMs >= SIGN_OUT_AFTER_MS) {
        window.clearInterval(interval);
        submitSignOut();
        return;
      }

      if (idleForMs >= WARNING_AFTER_MS) {
        const timeRemaining = SIGN_OUT_AFTER_MS - idleForMs;

        warningOpenRef.current = true;
        setWarningOpen(true);
        setRemainingMs(timeRemaining);
        return;
      }

      setRemainingMs(SIGN_OUT_AFTER_MS - WARNING_AFTER_MS);
    }, CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);

      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, recordActivity);
      }
    };
  }, []);

  function continueSession() {
    lastActivityAt.current = Date.now();
    warningOpenRef.current = false;
    setWarningOpen(false);
    setRemainingMs(SIGN_OUT_AFTER_MS - WARNING_AFTER_MS);
  }

  if (!warningOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/60 px-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="idle-session-title"
        aria-describedby="idle-session-description"
        className="w-full max-w-md rounded-xl border border-line bg-paper p-6 shadow-xl"
      >
        <p className="eyebrow text-accent-700">Session security</p>

        <h2
          id="idle-session-title"
          className="mt-2 text-xl font-semibold text-ink-950"
        >
          Are you still there?
        </h2>

        <p
          id="idle-session-description"
          className="mt-3 text-sm leading-6 text-ink-600"
        >
          Your DueQuity session has been inactive. For your security, you will
          be signed out automatically unless you continue your session.
        </p>

        <div className="mt-5 rounded-lg border border-line bg-canvas px-4 py-3">
          <p className="text-sm text-ink-600">Automatic sign out in</p>

          <p
            className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink-950"
            aria-live="polite"
          >
            {formatRemainingTime(remainingMs)}
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={submitSignOut}
            className="rounded-md border border-line px-4 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            Sign out
          </button>

          <button
            type="button"
            onClick={continueSession}
            autoFocus
            className="rounded-md bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            Continue session
          </button>
        </div>
      </div>
    </div>
  );
}