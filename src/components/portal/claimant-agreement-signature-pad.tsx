"use client";

import type {
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface SignAgreementApiResponse {
  ok:
    boolean;

  agreement?: {
    envelopeId:
      string;

    status:
      "submitted";

    claimId:
      string;

    claimReference:
      string;

    claimantId:
      string;

    claimantReference:
      string;

    signedLegalName:
      string;

    signedAt:
      string;

    finalDocumentId:
      string;

    finalDocumentSha256:
      string;

    signatureSha256:
      string;

    fileName:
      string;

    pageCount:
      number;

    cancellationDeadline?:
      string;

    idempotent:
      boolean;
  };

  error?:
    string;
}

interface ClaimantAgreementSignaturePadProps {
  envelopeId:
    string;

  claimantLegalName:
    string;

  claimantReference:
    string;

  claimReference:
    string;

  signatureIntentText:
    string;
}

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

function normalizedLegalName(
  value:
    string,
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " ",
    )
    .toLocaleLowerCase(
      "en-US",
    );
}

function dateTime(
  value:
    string,
): string {
  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "long",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",

      timeZoneName:
        "short",
    },
  ).format(
    parsed,
  );
}

/* ========================================================================== */
/* Canvas                                                                      */
/* ========================================================================== */

const CANVAS_WIDTH =
  1200;

const CANVAS_HEIGHT =
  360;

const CANVAS_INITIALIZED_ATTRIBUTE =
  "duequitySignatureInitialized";

function prepareCanvas(
  canvas:
    HTMLCanvasElement,
): CanvasRenderingContext2D {
  canvas.width =
    CANVAS_WIDTH;

  canvas.height =
    CANVAS_HEIGHT;

  const context =
    canvas.getContext(
      "2d",
      {
        alpha:
          false,
      },
    );

  if (
    !context
  ) {
    throw new Error(
      "Your browser could not initialize the electronic signature pad.",
    );
  }

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
  );

  context.strokeStyle =
    "#16191d";

  context.fillStyle =
    "#16191d";

  context.lineWidth =
    5;

  context.lineCap =
    "round";

  context.lineJoin =
    "round";

  return context;
}

function pointerCoordinates({
  canvas,
  event,
}: {
  canvas:
    HTMLCanvasElement;

  event:
    ReactPointerEvent<HTMLCanvasElement>;
}): {
  x:
    number;

  y:
    number;
} {
  const rect =
    canvas.getBoundingClientRect();

  return {
    x:
      (
        event.clientX -
        rect.left
      ) *
      (
        canvas.width /
        rect.width
      ),

    y:
      (
        event.clientY -
        rect.top
      ) *
      (
        canvas.height /
        rect.height
      ),
  };
}

/* ========================================================================== */
/* Component                                                                   */
/* ========================================================================== */

export function ClaimantAgreementSignaturePad({
  envelopeId,
  claimantLegalName,
  claimantReference,
  claimReference,
  signatureIntentText,
}: ClaimantAgreementSignaturePadProps) {
  const canvasRef =
    useRef<
      HTMLCanvasElement | null
    >(
      null,
    );

  const drawingRef =
    useRef(
      false,
    );

  const lastPointRef =
    useRef<{
      x:
        number;

      y:
        number;
    } | null>(
      null,
    );

  const [
    initialized,
    setInitialized,
  ] =
    useState(
      false,
    );

  const [
    hasInk,
    setHasInk,
  ] =
    useState(
      false,
    );

  const [
    typedLegalName,
    setTypedLegalName,
  ] =
    useState(
      "",
    );

  const [
    signatureIntentAccepted,
    setSignatureIntentAccepted,
  ] =
    useState(
      false,
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | undefined
    >();

  const [
    completed,
    setCompleted,
  ] =
    useState<
      NonNullable<
        SignAgreementApiResponse[
          "agreement"
        ]
      > | undefined
    >();

  const endpoint =
    useMemo(
      () =>
        `/api/portal/agreements/${encodeURIComponent(
          envelopeId,
        )}/sign`,
      [
        envelopeId,
      ],
    );

  const signedDocumentUrl =
    useMemo(
      () =>
        `/api/portal/agreements/${encodeURIComponent(
          envelopeId,
        )}/document`,
      [
        envelopeId,
      ],
    );

  const signedDocumentDownloadUrl =
    `${signedDocumentUrl}?download=1`;

  const legalNameMatches =
    normalizedLegalName(
      typedLegalName,
    ) ===
    normalizedLegalName(
      claimantLegalName,
    );

  const canSubmit =
    initialized &&
    hasInk &&
    legalNameMatches &&
    signatureIntentAccepted &&
    !submitting &&
    !completed;

  /* ======================================================================== */
  /* Stable canvas initialization                                              */
  /* ======================================================================== */

  const initializeCanvas =
    useCallback(
      (
        canvas:
          HTMLCanvasElement | null,
      ) => {
        canvasRef.current =
          canvas;

        if (
          !canvas
        ) {
          return;
        }

        /*
         * Callback refs are invoked again if their function identity changes.
         *
         * This callback is memoized with useCallback, and the DOM canvas is
         * additionally marked after initialization. Normal React state changes
         * such as typing a name or checking signature intent therefore cannot
         * repaint the canvas and erase the claimant's drawn signature.
         */
        if (
          canvas.dataset[
            CANVAS_INITIALIZED_ATTRIBUTE
          ] ===
          "true"
        ) {
          setInitialized(
            true,
          );

          return;
        }

        try {
          prepareCanvas(
            canvas,
          );

          canvas.dataset[
            CANVAS_INITIALIZED_ATTRIBUTE
          ] =
            "true";

          setInitialized(
            true,
          );
        } catch (
          initializationError
        ) {
          setInitialized(
            false,
          );

          setError(
            initializationError instanceof
              Error
              ? initializationError.message
              : "Unable to initialize the electronic signature pad.",
          );
        }
      },
      [],
    );

  /* ======================================================================== */
  /* Drawing                                                                   */
  /* ======================================================================== */

  function beginDrawing(
    event:
      ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (
      submitting ||
      completed
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (
      !canvas
    ) {
      return;
    }

    event.preventDefault();

    canvas.setPointerCapture(
      event.pointerId,
    );

    const context =
      canvas.getContext(
        "2d",
      );

    if (
      !context
    ) {
      return;
    }

    const point =
      pointerCoordinates({
        canvas,

        event,
      });

    drawingRef.current =
      true;

    lastPointRef.current =
      point;

    context.beginPath();

    context.arc(
      point.x,
      point.y,
      context.lineWidth /
        2,
      0,
      Math.PI *
        2,
    );

    context.fill();

    setHasInk(
      true,
    );

    setError(
      undefined,
    );
  }

  function continueDrawing(
    event:
      ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (
      !drawingRef.current ||
      submitting ||
      completed
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    const previous =
      lastPointRef.current;

    if (
      !canvas ||
      !previous
    ) {
      return;
    }

    event.preventDefault();

    const context =
      canvas.getContext(
        "2d",
      );

    if (
      !context
    ) {
      return;
    }

    const point =
      pointerCoordinates({
        canvas,

        event,
      });

    context.beginPath();

    context.moveTo(
      previous.x,
      previous.y,
    );

    context.lineTo(
      point.x,
      point.y,
    );

    context.stroke();

    lastPointRef.current =
      point;

    setHasInk(
      true,
    );
  }

  function endDrawing(
    event:
      ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (
      !drawingRef.current
    ) {
      return;
    }

    event.preventDefault();

    drawingRef.current =
      false;

    lastPointRef.current =
      null;

    const canvas =
      canvasRef.current;

    if (
      canvas &&
      canvas.hasPointerCapture(
        event.pointerId,
      )
    ) {
      canvas.releasePointerCapture(
        event.pointerId,
      );
    }
  }

  function clearSignature() {
    if (
      submitting ||
      completed
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (
      !canvas
    ) {
      return;
    }

    try {
      prepareCanvas(
        canvas,
      );

      canvas.dataset[
        CANVAS_INITIALIZED_ATTRIBUTE
      ] =
        "true";

      drawingRef.current =
        false;

      lastPointRef.current =
        null;

      setInitialized(
        true,
      );

      setHasInk(
        false,
      );

      setError(
        undefined,
      );
    } catch (
      clearError
    ) {
      setError(
        clearError instanceof
          Error
          ? clearError.message
          : "Unable to clear the electronic signature pad.",
      );
    }
  }

  /* ======================================================================== */
  /* Submit                                                                    */
  /* ======================================================================== */

  async function signAgreement() {
    if (
      !hasInk
    ) {
      setError(
        "Draw your electronic signature before submitting the agreement.",
      );

      return;
    }

    if (
      !legalNameMatches
    ) {
      setError(
        "Type your verified legal name exactly as shown before signing.",
      );

      return;
    }

    if (
      !signatureIntentAccepted
    ) {
      setError(
        "Confirm your intent to electronically sign and submit this agreement.",
      );

      return;
    }

    const canvas =
      canvasRef.current;

    if (
      !canvas
    ) {
      setError(
        "Electronic signature pad is not available.",
      );

      return;
    }

    setSubmitting(
      true,
    );

    setError(
      undefined,
    );

    try {
      const signatureDataUrl =
        canvas.toDataURL(
          "image/png",
        );

      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",
            },

            cache:
              "no-store",

            body:
              JSON.stringify({
                typedLegalName,

                signatureDataUrl,
              }),
          },
        );

      const payload =
        await response.json() as
          SignAgreementApiResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.agreement
      ) {
        throw new Error(
          payload.error ??
          "Unable to electronically sign the agreement.",
        );
      }

      setCompleted(
        payload.agreement,
      );
    } catch (
      signingError
    ) {
      setError(
        signingError instanceof
          Error
          ? signingError.message
          : "Unable to electronically sign the agreement.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  /* ======================================================================== */
  /* Completed                                                                 */
  /* ======================================================================== */

  if (
    completed
  ) {
    return (
      <section className="overflow-hidden rounded-2xl border border-ink-300 bg-ink-50 shadow-sm">
        <div className="p-5 sm:p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-300 bg-white text-xl font-semibold text-ink-950">
            ✓
          </div>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-700">
            Electronic signature complete
          </p>

          <h2 className="mt-1 text-xl font-semibold text-ink-950">
            Agreement signed and securely filed
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-700">
            Your DueQuity Recovery Services Agreement has been electronically
            signed, converted into the final PDF, and filed in your secure
            claimant record.
          </p>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-200 bg-white p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Signed by
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-950">
                {
                  completed.signedLegalName
                }
              </dd>
            </div>

            <div className="rounded-xl border border-ink-200 bg-white p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Signed
              </dt>

              <dd className="mt-1 text-sm font-semibold text-ink-950">
                {dateTime(
                  completed.signedAt,
                )}
              </dd>
            </div>

            <div className="rounded-xl border border-ink-200 bg-white p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Claim ID
              </dt>

              <dd className="mt-1 font-mono text-xs font-semibold text-ink-950">
                {
                  completed.claimReference
                }
              </dd>
            </div>

            <div className="rounded-xl border border-ink-200 bg-white p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Document ID
              </dt>

              <dd className="mt-1 break-all font-mono text-xs font-semibold text-ink-950">
                {
                  completed.finalDocumentId
                }
              </dd>
            </div>

            {completed.cancellationDeadline && (
              <div className="rounded-xl border border-ink-200 bg-white p-4 sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  Cancellation deadline
                </dt>

                <dd className="mt-1 text-sm font-semibold text-ink-950">
                  {
                    completed.cancellationDeadline
                  }
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-5 rounded-xl border border-ink-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-ink-700">
              Document integrity
            </p>

            <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-ink-500">
              SHA-256:{" "}
              {
                completed.finalDocumentSha256
              }
            </p>
          </div>

          <div className="mt-5 rounded-xl border border-ink-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink-900">
              Your signed agreement
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              You may view the completed PDF in your browser or save a copy for
              your records.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                href={
                  signedDocumentUrl
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-950 bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
              >
                View Signed PDF
              </a>

              <a
                href={
                  signedDocumentDownloadUrl
                }
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                Download PDF
              </a>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/portal/agreements"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
            >
              Back to Agreements
            </Link>

            <Link
              href="/portal/claims"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-300 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
            >
              View My Claims
            </Link>
          </div>
        </div>
      </section>
    );
  }

  /* ======================================================================== */
  /* Signing form                                                              */
  /* ======================================================================== */

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm print:hidden">
      <div className="border-b border-ink-100 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          Electronic signature
        </p>

        <h2 className="mt-1 text-lg font-semibold text-ink-950">
          Sign & Submit Agreement
        </h2>

        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">
          Your required disclosures and electronic-record consent must already
          be recorded before this signature can be accepted.
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-100 bg-inset p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              Verified signer
            </p>

            <p className="mt-1 text-base font-semibold text-ink-950">
              {
                claimantLegalName
              }
            </p>

            <p className="mt-1 text-xs text-ink-500">
              Claimant ID{" "}
              {
                claimantReference
              }
            </p>
          </div>

          <div className="rounded-xl border border-ink-100 bg-inset p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              Claim
            </p>

            <p className="mt-1 font-mono text-sm font-semibold text-ink-950">
              {
                claimReference
              }
            </p>

            <p className="mt-1 text-xs text-ink-500">
              This signature applies only to this agreement and claim.
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor={`typed-legal-name-${envelopeId}`}
            className="block text-sm font-semibold text-ink-900"
          >
            Type your verified legal name
          </label>

          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Enter the same legal name shown above. This typed confirmation is
            recorded with your drawn electronic signature.
          </p>

          <input
            id={`typed-legal-name-${envelopeId}`}
            type="text"
            autoComplete="name"
            spellCheck={false}
            value={
              typedLegalName
            }
            disabled={
              submitting
            }
            onChange={(
              event,
            ) => {
              setTypedLegalName(
                event.target.value,
              );

              setError(
                undefined,
              );
            }}
            className={[
              "mt-3",
              "w-full",
              "rounded-xl",
              "border",
              "bg-white",
              "px-4",
              "py-3",
              "text-base",
              "text-ink-950",
              "outline-none",
              "transition",
              typedLegalName &&
              !legalNameMatches
                ? "border-ink-400 focus:border-ink-600 focus:ring-2 focus:ring-ink-100"
                : "border-ink-200 focus:border-ink-500 focus:ring-2 focus:ring-ink-100",
            ].join(
              " ",
            )}
          />

          {typedLegalName &&
            !legalNameMatches && (
            <p className="mt-2 text-xs font-medium text-ink-600">
              The typed name does not yet match the verified legal name shown
              above.
            </p>
          )}

          {legalNameMatches && (
            <p className="mt-2 text-xs font-medium text-ink-800">
              Legal name confirmed.
            </p>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                Draw your signature
              </p>

              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Use your mouse, trackpad, stylus, or finger.
              </p>
            </div>

            <button
              type="button"
              disabled={
                submitting ||
                !hasInk
              }
              onClick={
                clearSignature
              }
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear Signature
            </button>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-ink-300 bg-white">
            <canvas
              ref={
                initializeCanvas
              }
              aria-label="Draw electronic signature"
              onPointerDown={
                beginDrawing
              }
              onPointerMove={
                continueDrawing
              }
              onPointerUp={
                endDrawing
              }
              onPointerCancel={
                endDrawing
              }
              onPointerLeave={(
                event,
              ) => {
                if (
                  drawingRef.current
                ) {
                  endDrawing(
                    event,
                  );
                }
              }}
              className="block h-[180px] w-full touch-none cursor-crosshair bg-white sm:h-[220px]"
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              Signature is embedded into the final signed PDF.
            </p>

            <span
              className={[
                "shrink-0",
                "rounded-full",
                "border",
                "px-2.5",
                "py-1",
                "text-[10px]",
                "font-semibold",
                "uppercase",
                "tracking-[0.08em]",
                hasInk
                  ? "border-ink-300 bg-ink-50 text-ink-800"
                  : "border-ink-200 bg-white text-ink-500",
              ].join(
                " ",
              )}
            >
              {hasInk
                ? "Signature drawn"
                : "Signature required"}
            </span>
          </div>
        </div>

        <label
          className={[
            "flex",
            "items-start",
            "gap-3",
            "rounded-xl",
            "border",
            "p-4",
            "transition",
            signatureIntentAccepted
              ? "border-ink-400 bg-ink-50"
              : "border-ink-200 bg-white",
          ].join(
            " ",
          )}
        >
          <input
            type="checkbox"
            checked={
              signatureIntentAccepted
            }
            disabled={
              submitting
            }
            onChange={(
              event,
            ) => {
              setSignatureIntentAccepted(
                event.target.checked,
              );

              setError(
                undefined,
              );
            }}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300"
          />

          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink-900">
              Electronic signature intent
            </span>

            <span className="mt-1 block text-sm leading-relaxed text-ink-600">
              {
                signatureIntentText
              }
            </span>
          </span>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-ink-400 bg-ink-50 px-4 py-3"
          >
            <p className="text-sm font-semibold text-ink-950">
              Agreement was not signed
            </p>

            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              {
                error
              }
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-ink-900">
              Final electronic submission
            </p>

            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Selecting Sign & Submit Agreement will apply your electronic
              signature to this exact frozen agreement, create the final signed
              PDF, and permanently record it in your DueQuity claimant file.
            </p>

            {!canSubmit && (
              <p className="mt-2 text-xs font-medium text-ink-600">
                Complete the legal-name confirmation, draw your signature, and
                accept electronic signature intent to enable final submission.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={
              !canSubmit
            }
            onClick={() =>
              void signAgreement()
            }
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-ink-950 bg-ink-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-300 disabled:bg-ink-200 disabled:text-ink-500"
          >
            {submitting
              ? "Signing & Filing..."
              : "Sign & Submit Agreement"}
          </button>
        </div>

        <div className="rounded-xl border border-ink-100 bg-inset px-4 py-3">
          <p className="text-xs leading-relaxed text-ink-500">
            DueQuity staff cannot draw this signature for you or manually mark
            this agreement as signed. Final signing is tied to your authenticated
            claimant account and verified identity.
          </p>
        </div>
      </div>
    </section>
  );
}