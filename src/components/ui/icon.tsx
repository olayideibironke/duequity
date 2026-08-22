import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

/**
 * ICONS
 *
 * Hand drawn on a 20 by 20 grid with a consistent 1.5 stroke weight so the whole
 * product shares one drawing style. No icon package: the set needed here is small
 * and specific, and an imported library brings a second visual voice plus a
 * dependency for shapes that take a few lines each.
 *
 * All icons are decorative by default (aria-hidden) because they accompany text
 * labels. Where an icon carries meaning alone, the caller must supply a label.
 */

type IconProps = SVGProps<SVGSVGElement> & {
  /** Accessible name. Omit for decorative icons that sit beside a text label. */
  label?: string;
  size?: number;
};

function Svg({ label, size = 20, className, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("shrink-0", className)}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---- navigation and structure ---- */

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="2.5" width="6" height="4" rx="1" />
    <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="9.5" width="6" height="8" rx="1" />
  </Svg>
);

export const IconOpportunity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 15.5l4-4.5 3.5 3 5.5-7" />
    <path d="M12.5 7h3v3" />
    <path d="M2.5 17.5h15" />
  </Svg>
);

export const IconClaim = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.5h7l3.5 3.5v11a1 1 0 01-1 1H5a1 1 0 01-1-1v-13a1 1 0 011-1z" />
    <path d="M11.5 2.5v4h4" />
    <path d="M7 11h6M7 14h4" />
  </Svg>
);

export const IconClaimant = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="7" r="3" />
    <path d="M4 17c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5" />
  </Svg>
);

export const IconProperty = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5L10 3l7 5.5" />
    <path d="M4.5 7.8V16a1 1 0 001 1h9a1 1 0 001-1V7.8" />
    <path d="M8 17v-5h4v5" />
  </Svg>
);

export const IconJurisdiction = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.5l7 3v4c0 4-3 7.2-7 8.5-4-1.3-7-4.5-7-8.5v-4l7-3z" />
    <path d="M7.5 9.8l1.8 1.8 3.5-3.6" />
  </Svg>
);

export const IconCompliance = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.5l6 2.5v5c0 3.6-2.5 6.6-6 7.5-3.5-.9-6-3.9-6-7.5V5l6-2.5z" />
    <path d="M10 7v4M10 13.2v.3" />
  </Svg>
);

export const IconAttorney = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3v13" />
    <path d="M4 7h12" />
    <path d="M4 7l-1.5 4h5L6 7" />
    <path d="M16 7l-1.5 4h5L18 7" transform="translate(-2)" />
    <path d="M6.5 16.5h7" />
  </Svg>
);

export const IconTask = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3.5" width="14" height="13" rx="1.5" />
    <path d="M6.5 9l2 2 4.5-4.5" />
    <path d="M6.5 13.5h7" />
  </Svg>
);

export const IconDocument = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 2.5h6L15.5 6.5v11a1 1 0 01-1 1h-9a1 1 0 01-1-1v-14a1 1 0 011-1z" />
    <path d="M11 2.5v4.5h4.5" />
  </Svg>
);

export const IconRecovery = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M12.2 7.6c-.5-.8-1.3-1.2-2.2-1.2-1.3 0-2.2.7-2.2 1.8 0 2.3 4.6 1.2 4.6 3.6 0 1.1-1 1.9-2.4 1.9-1 0-1.9-.4-2.4-1.2" />
    <path d="M10 5v10" />
  </Svg>
);

export const IconReport = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17h14" />
    <rect x="4" y="10" width="3" height="7" rx="0.5" />
    <rect x="9" y="6" width="3" height="11" rx="0.5" />
    <rect x="14" y="12" width="3" height="5" rx="0.5" />
  </Svg>
);

export const IconAudit = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.5 13.5l4 4" />
    <path d="M9 6.5V9l1.8 1.2" />
  </Svg>
);

export const IconMessage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5.5a1.5 1.5 0 011.5-1.5h11A1.5 1.5 0 0117 5.5v7a1.5 1.5 0 01-1.5 1.5H8l-4 3v-3.2A1.5 1.5 0 013 12.3v-6.8z" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.5l6.5 2.7v5.3c0 3.7-2.7 6.8-6.5 7.8-3.8-1-6.5-4.1-6.5-7.8V5.2L10 2.5z" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8.75" cy="8.75" r="5.25" />
    <path d="M12.75 12.75L17 17" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13.5V3.5" />
    <path d="M6.5 7L10 3.5 13.5 7" />
    <path d="M3.5 13v3a1 1 0 001 1h11a1 1 0 001-1v-3" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10h11" />
    <path d="M11 6l4 4-4 4" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 10H5" />
    <path d="M9 6l-4 4 4 4" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 8L10 12.5 14.5 8" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5L12.5 10 8 14.5" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h14M3 10h14M3 14h14" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5l4 4 8-9" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3l7.5 13h-15L10 3z" />
    <path d="M10 8v3.5M10 13.8v.2" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4.2l3 1.8" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="8.5" width="12" height="8.5" rx="1.5" />
    <path d="M7 8.5V6.5a3 3 0 016 0v2" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4H5a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 005 16h9a1.5 1.5 0 001.5-1.5v-3" />
    <path d="M11.5 3.5H17V9" />
    <path d="M17 3.5l-6.5 6.5" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.2 3.5H4.5A1.5 1.5 0 003 5.2c0 6.6 5.2 11.8 11.8 11.8a1.5 1.5 0 001.7-1.5v-1.7l-3.5-1.2-1.6 1.8a11 11 0 01-4.8-4.8l1.8-1.6L6.2 3.5z" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
    <path d="M3 6l7 4.5L17 6" />
  </Svg>
);

export const IconLocation = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 17.5s5.5-5 5.5-9a5.5 5.5 0 00-11 0c0 4 5.5 9 5.5 9z" />
    <circle cx="10" cy="8.5" r="2" />
  </Svg>
);

export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5.5h14M5.5 10h9M8 14.5h4" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Svg>
);

export const IconLogo = ({ size = 24, className, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className={cn("shrink-0", className)}
    {...rest}
  >
    {/*
      The Duequity mark: a property outline whose lower right quadrant is filled,
      reading as equity that remains within the boundary of a sold property.
    */}
    <path
      d="M3.5 9.2L12 2.8l8.5 6.4v10a1.3 1.3 0 01-1.3 1.3H4.8a1.3 1.3 0 01-1.3-1.3v-10z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M12 12.5h6.9v7.9H12v-7.9z" fill="currentColor" opacity="0.9" />
  </svg>
);
