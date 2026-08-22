"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconClose } from "./icon";
import { IconButton } from "./button";

/**
 * OVERLAYS
 *
 * Built on the native <dialog> element rather than a portal library.
 *
 * showModal() gives focus trapping, Escape to close, inert background content and
 * the top layer for free, all of which a hand rolled overlay commonly gets wrong.
 * That is a genuine accessibility gain and it costs no dependency.
 *
 * Two presentations, one mechanism:
 *   Modal    centred, for confirmations and short focused forms
 *   Drawer   right edge on desktop, bottom sheet on mobile, for detail and review
 */

interface OverlayBase {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // The native close event fires for Escape as well as close(), so a single
    // listener keeps React state and the dialog element in agreement.
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  // Clicking the backdrop closes. The backdrop is the dialog element itself
  // outside its content box, so the check is whether the target is the dialog.
  const onBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === ref.current) ref.current?.close();
  };

  return { ref, onBackdropClick };
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: OverlayBase & { size?: "sm" | "md" | "lg" }) {
  const { ref, onBackdropClick } = useDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-labelledby="modal-title"
      className={cn(
        "m-auto w-[calc(100vw-2rem)] rounded-xl border border-line bg-paper p-0 text-ink-800 shadow-overlay",
        "backdrop:bg-ink-950/45 backdrop:backdrop-blur-[1px]",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-xl",
        size === "lg" && "max-w-3xl",
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 id="modal-title" className="text-base font-semibold text-ink-900">
            {title}
          </h2>

          {description && (
            <p className="mt-1 text-sm text-ink-600">{description}</p>
          )}
        </div>

        <IconButton label="Close" onClick={onClose} size="sm">
          <IconClose size={16} />
        </IconButton>
      </div>

      <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>

      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle bg-inset px-5 py-3.5">
          {footer}
        </div>
      )}
    </dialog>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: OverlayBase) {
  const { ref, onBackdropClick } = useDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-labelledby="drawer-title"
      className={cn(
        // Mobile: bottom sheet. Desktop: right edge panel, full height.
        "fixed inset-x-0 bottom-0 top-auto m-0 max-h-[88vh] w-full max-w-none rounded-t-xl border border-line bg-paper p-0 text-ink-800 shadow-overlay",
        "sm:inset-y-0 sm:right-0 sm:left-auto sm:ml-auto sm:h-full sm:max-h-none sm:w-[30rem] sm:max-w-[calc(100vw-3rem)] sm:rounded-none sm:rounded-l-xl",
        "backdrop:bg-ink-950/45",
      )}
    >
      <div className="flex h-full flex-col">
        {/* Drag affordance for the mobile sheet presentation. */}
        <div
          aria-hidden="true"
          className="flex justify-center pt-2 pb-1 sm:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0">
            <h2
              id="drawer-title"
              className="text-base font-semibold text-ink-900"
            >
              {title}
            </h2>

            {description && (
              <p className="mt-1 text-sm text-ink-600">{description}</p>
            )}
          </div>

          <IconButton label="Close" onClick={onClose} size="sm">
            <IconClose size={16} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle bg-inset px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}

/**
 * A confirmation dialog for consequential actions.
 *
 * Section 43 and the general rule on irreversible operations: a destructive or
 * outward facing action states what will happen and who it affects before it runs.
 * Used for submitting a claim to an agency, disqualifying an opportunity, and
 * changing a jurisdiction compliance status.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
}) {
  const { ref, onBackdropClick } = useDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      className={cn(
        "m-auto w-[calc(100vw-2rem)] rounded-xl border border-line bg-paper p-0 text-ink-800 shadow-overlay",
        "backdrop:bg-ink-950/45",
      )}
      style={{
        maxWidth: "580px",
      }}
    >
      <div className="px-5 py-4">
        <h2 id="confirm-title" className="text-base font-semibold text-ink-900">
          {title}
        </h2>

        <div id="confirm-body" className="mt-2 text-sm text-ink-700">
          {body}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle bg-inset px-5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center rounded-md border border-line-strong bg-paper px-4 text-base font-medium text-ink-800 shadow-xs transition-colors hover:bg-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-700"
        >
          {cancelLabel}
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy || undefined}
          className={cn(
            "inline-flex h-10 items-center rounded-md px-4 text-base font-medium text-white shadow-xs transition-colors disabled:opacity-50",
            tone === "danger"
              ? "bg-critical-600 hover:bg-critical-700 focus-visible:outline-critical-600"
              : "bg-ink-900 hover:bg-ink-800 focus-visible:outline-ink-900",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}