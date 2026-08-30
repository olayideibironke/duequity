"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

/* ========================================================================== */
/* Session policy                                                              */
/* ========================================================================== */

/*
 * DueQuity authenticated-session policy:
 *
 * 13 minutes inactivity -> security warning.
 * 15 minutes inactivity -> automatic local sign out.
 *
 * This shared guard is intentionally suitable for both staff and claimant
 * authenticated workspaces.
 */
const WARNING_AFTER_MS =
  13 *
  60 *
  1000;

const SIGN_OUT_AFTER_MS =
  15 *
  60 *
  1000;

const CHECK_INTERVAL_MS =
  1000;

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function formatRemainingTime(
  milliseconds:
    number,
): string {
  const totalSeconds =
    Math.max(
      0,
      Math.ceil(
        milliseconds /
        1000,
      ),
    );

  const minutes =
    Math.floor(
      totalSeconds /
      60,
    );

  const seconds =
    totalSeconds %
    60;

  return `${minutes}:${seconds
    .toString()
    .padStart(
      2,
      "0",
    )}`;
}

function submitSignOut() {
  const form =
    document.createElement(
      "form",
    );

  form.method =
    "POST";

  form.action =
    "/auth/sign-out";

  form.style.display =
    "none";

  document.body.appendChild(
    form,
  );

  form.submit();
}

/* ========================================================================== */
/* Guard                                                                       */
/* ========================================================================== */

export function IdleSessionGuard() {
  const lastActivityAt =
    useRef(
      Date.now(),
    );

  const warningOpenRef =
    useRef(
      false,
    );

  const [
    warningOpen,
    setWarningOpen,
  ] =
    useState(
      false,
    );

  const [
    remainingMs,
    setRemainingMs,
  ] =
    useState(
      SIGN_OUT_AFTER_MS -
      WARNING_AFTER_MS,
    );

  useEffect(
    () => {
      function recordActivity() {
        /*
         * Once the warning is visible, incidental mouse movement or scrolling
         * must not silently keep the session alive. The user must explicitly
         * choose Continue session.
         */
        if (
          warningOpenRef.current
        ) {
          return;
        }

        lastActivityAt.current =
          Date.now();
      }

      const activityEvents:
        Array<
          keyof WindowEventMap
        > = [
          "keydown",
          "mousedown",
          "pointerdown",
          "scroll",
          "touchstart",
        ];

      for (
        const eventName of
          activityEvents
      ) {
        window.addEventListener(
          eventName,
          recordActivity,
          {
            passive:
              true,
          },
        );
      }

      const interval =
        window.setInterval(
          () => {
            const idleForMs =
              Date.now() -
              lastActivityAt.current;

            if (
              idleForMs >=
              SIGN_OUT_AFTER_MS
            ) {
              window.clearInterval(
                interval,
              );

              submitSignOut();

              return;
            }

            if (
              idleForMs >=
              WARNING_AFTER_MS
            ) {
              const timeRemaining =
                SIGN_OUT_AFTER_MS -
                idleForMs;

              warningOpenRef.current =
                true;

              setWarningOpen(
                true,
              );

              setRemainingMs(
                timeRemaining,
              );

              return;
            }

            setRemainingMs(
              SIGN_OUT_AFTER_MS -
              WARNING_AFTER_MS,
            );
          },
          CHECK_INTERVAL_MS,
        );

      return () => {
        window.clearInterval(
          interval,
        );

        for (
          const eventName of
            activityEvents
        ) {
          window.removeEventListener(
            eventName,
            recordActivity,
          );
        }
      };
    },
    [],
  );

  function continueSession() {
    lastActivityAt.current =
      Date.now();

    warningOpenRef.current =
      false;

    setWarningOpen(
      false,
    );

    setRemainingMs(
      SIGN_OUT_AFTER_MS -
      WARNING_AFTER_MS,
    );
  }

  if (
    !warningOpen
  ) {
    return null;
  }

  /* ======================================================================== */
  /* Compact security warning                                                 */
  /* ======================================================================== */

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="idle-session-title"
      aria-describedby="idle-session-description"
      className="fixed bottom-4 right-4 z-[100] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-paper shadow-xl"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-accent-700">
              Session security
            </p>

            <h2
              id="idle-session-title"
              className="mt-1 text-base font-semibold text-ink-950"
            >
              Still using DueQuity?
            </h2>

            <p
              id="idle-session-description"
              className="mt-1.5 text-xs leading-relaxed text-ink-600"
            >
              Your session has been inactive and will sign out automatically for your security.
            </p>
          </div>

          <div className="shrink-0 rounded-lg border border-line bg-inset px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Sign out in
            </p>

            <p
              className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink-950"
              aria-live="polite"
            >
              {
                formatRemainingTime(
                  remainingMs,
                )
              }
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={
              submitSignOut
            }
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-inset hover:text-ink-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            Sign out now
          </button>

          <button
            type="button"
            onClick={
              continueSession
            }
            autoFocus
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-accent-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            Continue session
          </button>
        </div>
      </div>
    </div>
  );
}