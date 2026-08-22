import Link from "next/link";
import { cn } from "@/lib/cn";
import { IconLogo } from "@/components/ui/icon";

/**
 * THE DUEQUITY WORDMARK
 *
 * The mark is a property outline with its lower right quadrant filled: equity that
 * remains inside the boundary of a sold property. Set in the serif alongside the
 * name so the lockup reads as an institution rather than a technology startup.
 *
 * `tone` adapts the lockup to the surface it sits on. Navigation is near black, so
 * the light variant is the one used most.
 */
export function Logo({
  tone = "dark",
  size = "md",
  showParent = false,
  href = "/",
  className,
}: {
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  /** Show the Westforge Holdings attribution beneath the wordmark. */
  showParent?: boolean;
  href?: string | null;
  className?: string;
}) {
  const markSize = size === "sm" ? 20 : size === "lg" ? 30 : 24;
  const wordSize =
    size === "sm" ? "text-lg" : size === "lg" ? "text-2xl" : "text-xl";

  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <IconLogo
        size={markSize}
        className={tone === "light" ? "text-accent-300" : "text-accent-600"}
      />
      <span className="inline-flex flex-col leading-none">
        <span
          className={cn(
            "font-serif font-semibold tracking-tight",
            wordSize,
            tone === "light" ? "text-white" : "text-ink-900",
          )}
        >
          Duequity
        </span>
        {showParent && (
          <span
            className={cn(
              "mt-1 text-2xs tracking-wide",
              tone === "light" ? "text-ink-400" : "text-ink-500",
            )}
          >
            A Westforge Holdings Product
          </span>
        )}
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-500"
      aria-label="Duequity home"
    >
      {content}
    </Link>
  );
}
