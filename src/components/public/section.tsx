import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * PUBLIC PAGE SECTIONS
 *
 * Vertical rhythm for the public site, defined once so every page breathes the
 * same way. Section 17 calls for strong whitespace and restraint; the sizes here
 * are deliberately generous on desktop and tighter on mobile.
 */

export function Section({
  children,
  tone = "canvas",
  size = "md",
  className,
  id,
  as: Component = "section",
}: {
  children: ReactNode;
  tone?: "canvas" | "paper" | "ink" | "sunken";
  size?: "sm" | "md" | "lg";
  className?: string;
  id?: string;
  as?: "section" | "div";
}) {
  return (
    <Component
      id={id}
      className={cn(
        tone === "canvas" && "bg-canvas",
        tone === "paper" && "bg-paper",
        tone === "sunken" && "bg-sunken",
        tone === "ink" && "bg-ink-950 text-ink-200",
        size === "sm" && "py-12 sm:py-16",
        size === "md" && "py-16 sm:py-20 lg:py-24",
        size === "lg" && "py-20 sm:py-28 lg:py-32",
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function Container({
  children,
  width = "wide",
  className,
}: {
  children: ReactNode;
  width?: "narrow" | "reading" | "wide";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto px-4 sm:px-6 lg:px-8",
        width === "narrow" && "max-w-3xl",
        width === "reading" && "max-w-4xl",
        width === "wide" && "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A section header.
 *
 * The eyebrow carries the section's category, the heading its claim. Headings are
 * capped well below display size: Section 18 rules out marketing headings that
 * cover half the viewport.
 */
export function SectionIntro({
  eyebrow,
  title,
  lede,
  align = "left",
  tone = "dark",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow && (
        <p
          className={cn(
            "eyebrow",
            tone === "light" ? "text-accent-300" : "text-accent-700",
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          "mt-2.5 text-2xl sm:text-3xl",
          tone === "light" && "text-white",
        )}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            "mt-3 text-lg leading-relaxed",
            tone === "light" ? "text-ink-300" : "text-ink-600",
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

/**
 * A numbered step, used on the homepage and the how it works page.
 * The number is set in the mono face so the sequence reads as a procedure.
 */
export function Step({
  number,
  title,
  children,
  tone = "dark",
}: {
  number: number;
  title: string;
  children: ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <div className="relative">
      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            tone === "light" ? "text-accent-300" : "text-accent-600",
          )}
        >
          {String(number).padStart(2, "0")}
        </span>
        <h3
          className={cn(
            "font-sans text-base font-semibold",
            tone === "light" ? "text-white" : "text-ink-900",
          )}
        >
          {title}
        </h3>
      </div>
      <p
        className={cn(
          "mt-2 pl-8 text-md leading-relaxed",
          tone === "light" ? "text-ink-300" : "text-ink-600",
        )}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * A short prose block for reading pages, constrained to a comfortable measure.
 */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "measure text-md leading-relaxed text-ink-700",
        "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:first:mt-0",
        "[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-sans [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink-900",
        "[&_p]:mt-4 [&_p]:first:mt-0",
        "[&_ul]:mt-4 [&_ul]:space-y-2 [&_ul]:pl-5",
        "[&_li]:list-disc [&_li]:marker:text-ink-300",
        "[&_ol]:mt-4 [&_ol]:space-y-2 [&_ol]:pl-5",
        "[&_ol>li]:list-decimal",
        "[&_strong]:font-semibold [&_strong]:text-ink-900",
        className,
      )}
    >
      {children}
    </div>
  );
}
