"use client";

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";

import {
  useFormStatus,
} from "react-dom";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ProtectedSubmitButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "type" | "children"
  > {
  label:
    string;

  pendingLabel?:
    string;

  success?:
    boolean;

  successLabel?:
    string;

  requireValid?:
    boolean;

  requireDirty?:
    boolean;
}

/* ========================================================================== */
/* Form snapshot                                                               */
/* ========================================================================== */

function formSnapshot(
  form:
    HTMLFormElement,
): string {
  const entries =
    Array.from(
      new FormData(
        form,
      ).entries(),
    )
      .map(
        (
          [
            key,
            value,
          ],
        ) => [
          key,
          typeof value ===
            "string"
            ? value
            : value.name,
        ],
      )
      .sort(
        (
          left,
          right,
        ) => {
          const keyComparison =
            String(
              left[0],
            ).localeCompare(
              String(
                right[0],
              ),
            );

          if (
            keyComparison !==
            0
          ) {
            return keyComparison;
          }

          return String(
            left[1],
          ).localeCompare(
            String(
              right[1],
            ),
          );
        },
      );

  return JSON.stringify(
    entries,
  );
}

/* ========================================================================== */
/* Required-control validation                                                 */
/* ========================================================================== */

function requiredControlsAreValid(
  form:
    HTMLFormElement,
): boolean {
  const controls =
    Array.from(
      form.elements,
    );

  for (
    const control of controls
  ) {
    if (
      control instanceof
        HTMLInputElement
    ) {
      if (
        control.disabled ||
        !control.required
      ) {
        continue;
      }

      if (
        control.type ===
        "checkbox"
      ) {
        if (
          !control.checked
        ) {
          return false;
        }

        continue;
      }

      if (
        control.type ===
        "radio"
      ) {
        const escapedName =
          CSS.escape(
            control.name,
          );

        const checkedRadio =
          form.querySelector<HTMLInputElement>(
            `input[type="radio"][name="${escapedName}"]:checked`,
          );

        if (
          !checkedRadio
        ) {
          return false;
        }

        continue;
      }

      if (
        !control.checkValidity()
      ) {
        return false;
      }

      continue;
    }

    if (
      control instanceof
        HTMLSelectElement ||
      control instanceof
        HTMLTextAreaElement
    ) {
      if (
        control.disabled ||
        !control.required
      ) {
        continue;
      }

      if (
        !control.checkValidity()
      ) {
        return false;
      }
    }
  }

  return form.checkValidity();
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

/**
 * Standard DueQuity consequential-action submit control.
 *
 * Behavior:
 *
 * - incomplete required fields -> disabled;
 * - required checkbox/radio becomes valid -> button activates immediately;
 * - previously saved unchanged form -> durable saved state;
 * - changed valid form -> active;
 * - pending request -> disabled with pending text;
 * - explicit success -> disabled with durable success text.
 *
 * This component is a user-interface safety layer. Server validation,
 * authorization, database constraints and idempotency remain authoritative.
 */
export function ProtectedSubmitButton({
  label,

  pendingLabel =
    "Saving…",

  success =
    false,

  successLabel =
    "✓ Saved",

  requireValid =
    true,

  requireDirty =
    false,

  disabled:
    externallyDisabled =
      false,

  className =
    "",

  ...buttonProps
}: ProtectedSubmitButtonProps) {
  const {
    pending,
  } =
    useFormStatus();

  const buttonRef =
    useRef<HTMLButtonElement>(
      null,
    );

  const initialSnapshotRef =
    useRef<string | null>(
      null,
    );

  const animationFrameRef =
    useRef<number | null>(
      null,
    );

  const [
    formValid,
    setFormValid,
  ] =
    useState(
      !requireValid,
    );

  const [
    formDirty,
    setFormDirty,
  ] =
    useState(
      !requireDirty,
    );

  useEffect(
    () => {
      const button =
        buttonRef.current;

      const form =
        button?.form;

      if (
        !form
      ) {
        setFormValid(
          true,
        );

        setFormDirty(
          true,
        );

        return;
      }

      initialSnapshotRef.current =
        formSnapshot(
          form,
        );

      const refreshNow =
        () => {
          const valid =
            !requireValid ||
            requiredControlsAreValid(
              form,
            );

          setFormValid(
            valid,
          );

          if (
            requireDirty
          ) {
            setFormDirty(
              formSnapshot(
                form,
              ) !==
                initialSnapshotRef.current,
            );
          } else {
            setFormDirty(
              true,
            );
          }
        };

      /*
       * Some controls, especially required checkboxes and radios, can dispatch
       * pointer/click events before the browser has completely settled its
       * validity state.
       *
       * Refresh once immediately and again on the next animation frame.
       */
      const scheduleRefresh =
        () => {
          refreshNow();

          if (
            animationFrameRef.current !==
            null
          ) {
            window.cancelAnimationFrame(
              animationFrameRef.current,
            );
          }

          animationFrameRef.current =
            window.requestAnimationFrame(
              () => {
                animationFrameRef.current =
                  null;

                refreshNow();
              },
            );
        };

      const handleReset =
        () => {
          window.setTimeout(
            () => {
              initialSnapshotRef.current =
                formSnapshot(
                  form,
                );

              scheduleRefresh();
            },
            0,
          );
        };

      scheduleRefresh();

      form.addEventListener(
        "input",
        scheduleRefresh,
        true,
      );

      form.addEventListener(
        "change",
        scheduleRefresh,
        true,
      );

      form.addEventListener(
        "click",
        scheduleRefresh,
        true,
      );

      form.addEventListener(
        "keyup",
        scheduleRefresh,
        true,
      );

      form.addEventListener(
        "reset",
        handleReset,
      );

      return () => {
        form.removeEventListener(
          "input",
          scheduleRefresh,
          true,
        );

        form.removeEventListener(
          "change",
          scheduleRefresh,
          true,
        );

        form.removeEventListener(
          "click",
          scheduleRefresh,
          true,
        );

        form.removeEventListener(
          "keyup",
          scheduleRefresh,
          true,
        );

        form.removeEventListener(
          "reset",
          handleReset,
        );

        if (
          animationFrameRef.current !==
          null
        ) {
          window.cancelAnimationFrame(
            animationFrameRef.current,
          );

          animationFrameRef.current =
            null;
        }
      };
    },
    [
      requireDirty,
      requireValid,
    ],
  );

  const unchangedSavedState =
    requireDirty &&
    !formDirty &&
    formValid;

  const disabled =
    externallyDisabled ||
    pending ||
    success ||
    unchangedSavedState ||
    (
      requireValid &&
      !formValid
    );

  const text =
    success ||
    unchangedSavedState
      ? successLabel
      : pending
        ? pendingLabel
        : label;

  return (
    <button
      {...buttonProps}
      ref={
        buttonRef
      }
      type="submit"
      disabled={
        disabled
      }
      aria-disabled={
        disabled
      }
      aria-busy={
        pending
      }
      className={[
        "inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition",
        "bg-ink-950 text-white hover:bg-ink-800",
        "disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500 disabled:opacity-100",
        className,
      ]
        .filter(
          Boolean,
        )
        .join(
          " ",
        )}
    >
      {
        text
      }
    </button>
  );
}