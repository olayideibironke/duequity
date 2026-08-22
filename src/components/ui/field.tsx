"use client";

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const CONTROL_BASE =
  "w-full rounded-md border bg-paper text-base text-ink-900 shadow-xs transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-400 " +
  "focus:outline-none focus-visible:border-accent-500 focus-visible:ring-3 focus-visible:ring-accent-500/20 " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-500";

const CONTROL_SIZES = {
  sm: "h-9 px-2.5 text-sm",
  md: "h-11 px-3",
  lg: "h-12 px-3.5 text-md",
} as const;

type ControlSize = keyof typeof CONTROL_SIZES;

interface FieldShellProps {
  label: string;
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  sensitive?: boolean;
  children: (ids: { controlId: string; describedBy?: string }) => ReactNode;
  className?: string;
}

export function Field({
  label,
  labelHidden = false,
  hint,
  error,
  required = false,
  sensitive = false,
  children,
  className,
}: FieldShellProps) {
  const base = useId();
  const controlId = `${base}-control`;
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={controlId}
          className={cn(
            "text-sm font-medium text-ink-800",
            labelHidden && "sr-only",
          )}
        >
          {label}
          {required && (
            <span className="ml-1 text-critical-600" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </label>

        {sensitive && (
          <span className="text-2xs text-ink-500">Encrypted in transit</span>
        )}
      </div>

      {hint && (
        <p id={hintId} className="mt-1 text-xs text-ink-500">
          {hint}
        </p>
      )}

      <div className="mt-1.5">{children({ controlId, describedBy })}</div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-critical-700"
        >
          <span aria-hidden="true" className="mt-px">
            !
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "id" | "prefix"
> {
  label: string;
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: string;
  sensitive?: boolean;
  controlSize?: ControlSize;
  adornment?: ReactNode;
  fieldClassName?: string;
}

export function TextField({
  label,
  labelHidden,
  hint,
  error,
  sensitive,
  controlSize = "md",
  adornment,
  className,
  fieldClassName,
  required,
  ...rest
}: TextFieldProps) {
  return (
    <Field
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      error={error}
      required={required}
      sensitive={sensitive}
      className={fieldClassName}
    >
      {({ controlId, describedBy }) => (
        <div className="relative">
          {adornment && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400"
            >
              {adornment}
            </span>
          )}

          <input
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            className={cn(
              CONTROL_BASE,
              CONTROL_SIZES[controlSize],
              adornment && "pl-9",
              error ? "border-critical-600" : "border-line-strong",
              className,
            )}
            {...rest}
          />
        </div>
      )}
    </Field>
  );
}

export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "id"
> {
  label: string;
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: string;
  controlSize?: ControlSize;
  options: {
    value: string;
    label: string;
    disabled?: boolean;
  }[];
  placeholder?: string;
  fieldClassName?: string;
}

export function SelectField({
  label,
  labelHidden,
  hint,
  error,
  controlSize = "md",
  options,
  placeholder,
  className,
  fieldClassName,
  required,
  ...rest
}: SelectFieldProps) {
  return (
    <Field
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
    >
      {({ controlId, describedBy }) => (
        <div className="relative">
          <select
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            className={cn(
              CONTROL_BASE,
              CONTROL_SIZES[controlSize],
              "cursor-pointer appearance-none pr-9",
              error ? "border-critical-600" : "border-line-strong",
              className,
            )}
            {...rest}
          >
            {placeholder && <option value="">{placeholder}</option>}

            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>

          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-400"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path
                d="M1 1L5 5L9 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      )}
    </Field>
  );
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> {
  label: string;
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: string;
  fieldClassName?: string;
}

export function TextAreaField({
  label,
  labelHidden,
  hint,
  error,
  className,
  fieldClassName,
  required,
  rows = 4,
  ...rest
}: TextAreaFieldProps) {
  return (
    <Field
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
    >
      {({ controlId, describedBy }) => (
        <textarea
          id={controlId}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={cn(
            CONTROL_BASE,
            "min-h-24 resize-y px-3 py-2.5 leading-relaxed",
            error ? "border-critical-600" : "border-line-strong",
            className,
          )}
          {...rest}
        />
      )}
    </Field>
  );
}

/**
 * Native checkbox.
 *
 * We deliberately keep the browser's real checked state instead of removing
 * native appearance. This guarantees a visible checkmark across browsers while
 * still using Duequity's accent color.
 */
export function Checkbox({
  label,
  description,
  error,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & {
  label: ReactNode;
  description?: ReactNode;
  error?: string;
}) {
  const base = useId();
  const id = `${base}-checkbox`;
  const descId = description ? `${base}-desc` : undefined;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex gap-2.5">
        <input
          type="checkbox"
          id={id}
          aria-describedby={descId}
          aria-invalid={error ? true : undefined}
          className={cn(
            "mt-0.5 size-5 shrink-0 cursor-pointer accent-accent-600",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...rest}
        />

        <label
          htmlFor={id}
          className="cursor-pointer text-sm leading-relaxed text-ink-800"
        >
          {label}
        </label>
      </div>

      {description && (
        <p id={descId} className="mt-1 pl-7 text-xs text-ink-500">
          {description}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-1 pl-7 text-xs font-medium text-critical-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function RadioCardGroup<T extends string>({
  legend,
  legendHidden = false,
  name,
  value,
  onChange,
  options,
  error,
  columns = 1,
  className,
}: {
  legend: string;
  legendHidden?: boolean;
  name: string;
  value: T | "";
  onChange: (value: T) => void;
  options: {
    value: T;
    label: string;
    description?: string;
    disabled?: boolean;
  }[];
  error?: string;
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend
        className={cn(
          "text-sm font-medium text-ink-800",
          legendHidden && "sr-only",
        )}
      >
        {legend}
      </legend>

      <div className={cn("mt-2 grid gap-2", columns === 2 && "sm:grid-cols-2")}>
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border px-3.5 py-3 transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-500",
                selected
                  ? "border-accent-500 bg-accent-50 ring-1 ring-accent-500"
                  : "border-line-strong bg-paper hover:border-ink-300 hover:bg-inset",
                option.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className={cn(
                  "mt-0.5 size-4.5 shrink-0 cursor-pointer appearance-none rounded-full border bg-paper",
                  "checked:border-5 checked:border-accent-600",
                  "focus-visible:outline-none",
                  selected ? "border-accent-600" : "border-line-strong",
                )}
              />

              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-base font-medium",
                    selected ? "text-accent-900" : "text-ink-900",
                  )}
                >
                  {option.label}
                </span>

                {option.description && (
                  <span className="mt-0.5 block text-sm text-ink-600">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-critical-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
