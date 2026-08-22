import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * BUTTONS
 *
 * Five variants. Restrained, crisp, no gradients, no oversized radii.
 *
 * primary    the single most important action on a screen
 * secondary  a real action that is not the primary one
 * quiet      low emphasis, sits inside dense toolbars and table rows
 * ghost      navigation and dismissal, no border
 * danger     destructive or irreversible, always paired with confirmation
 *
 * Every variant hits a 44px touch target at size md or larger. Section 20.
 */

type Variant = "primary" | "secondary" | "quiet" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "disabled:pointer-events-none disabled:opacity-45 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink-900 text-white shadow-xs hover:bg-ink-800 active:bg-ink-950 " +
    "focus-visible:outline-ink-900",
  secondary:
    "border border-line-strong bg-paper text-ink-800 shadow-xs hover:border-ink-300 hover:bg-inset " +
    "active:bg-sunken focus-visible:outline-ink-700",
  quiet:
    "border border-transparent bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900 " +
    "active:bg-ink-200 focus-visible:outline-ink-700",
  ghost:
    "bg-transparent text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline " +
    "focus-visible:outline-ink-700",
  danger:
    "bg-critical-600 text-white shadow-xs hover:bg-critical-700 active:bg-critical-700 " +
    "focus-visible:outline-critical-600",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-4 text-base",
  lg: "h-12 px-5 text-md",
};

/** Accent variant, used only for the single conversion action on public pages. */
const ACCENT =
  "bg-accent-600 text-white shadow-xs hover:bg-accent-700 active:bg-accent-800 focus-visible:outline-accent-600";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Use the equity green accent. Reserved for the primary conversion action. */
  accent?: boolean;
  /** Stretch to the container width. Common on mobile. */
  block?: boolean;
  /** Render a busy state and block interaction. */
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  accent = false,
  block = false,
  loading = false,
  leading,
  trailing,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        SIZES[size],
        accent && variant === "primary" ? ACCENT : VARIANTS[variant],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : (
        leading && (
          <span aria-hidden="true" className="shrink-0">
            {leading}
          </span>
        )
      )}
      <span className={cn(loading && "opacity-70")}>{children}</span>
      {trailing && !loading && (
        <span aria-hidden="true" className="shrink-0">
          {trailing}
        </span>
      )}
    </button>
  );
}

/**
 * A link styled as a button.
 *
 * Kept as a separate component rather than a polymorphic `as` prop so that the
 * href is type checked against the app routes and a navigation control is always
 * a real anchor for keyboard and middle click behaviour.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  accent = false,
  block = false,
  leading,
  trailing,
  className,
  children,
  external = false,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  accent?: boolean;
  block?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
  external?: boolean;
} & Omit<React.ComponentProps<"a">, "href" | "className" | "children">) {
  const classes = cn(
    BASE,
    SIZES[size],
    accent && variant === "primary" ? ACCENT : VARIANTS[variant],
    block && "w-full",
    className,
  );

  const content = (
    <>
      {leading && (
        <span aria-hidden="true" className="shrink-0">
          {leading}
        </span>
      )}
      <span>{children}</span>
      {trailing && (
        <span aria-hidden="true" className="shrink-0">
          {trailing}
        </span>
      )}
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {content}
    </Link>
  );
}

/**
 * A text link inside prose. Underlined by default: a link that is only
 * distinguishable by colour fails WCAG 1.4.1.
 */
export function TextLink({
  href,
  children,
  external = false,
  className,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
  className?: string;
}) {
  const classes = cn(
    "font-medium text-accent-700 underline decoration-accent-300 decoration-1 underline-offset-2 transition-colors hover:text-accent-800 hover:decoration-accent-600",
    className,
  );

  if (external) {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** An icon only control. Requires an accessible label, enforced by the type. */
export function IconButton({
  label,
  variant = "quiet",
  size = "md",
  className,
  children,
  ...rest
}: Omit<ButtonProps, "leading" | "trailing" | "block" | "children"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        BASE,
        VARIANTS[variant],
        size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10",
        "px-0",
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}
