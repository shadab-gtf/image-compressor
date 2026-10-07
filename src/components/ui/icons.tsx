import type { SVGProps } from "react";

/**
 * One icon system, one grid.
 *
 * Every glyph is drawn on a 24x24 box with a 1.75 stroke, round caps and round
 * joins, and inherits `currentColor`. That consistency is why the product can
 * mix icons freely without them looking borrowed from three different libraries.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---- Tools ------------------------------------------------------------- */

/** Arrows pressing inward: compress. */
export const IconCompress = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h4v4M20 4h-4v4M4 20h4v-4M20 20h-4v-4" />
    <path d="M9.5 9.5h5v5h-5z" />
  </Icon>
);

/** Corner handle being dragged: resize. */
export const IconResize = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 3.5h10v10h-10z" />
    <path d="M9 9h11.5v11.5H9" />
  </Icon>
);

/** Two formats exchanging: convert. */
export const IconConvert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h12l-3-3M20 16H8l3 3" />
  </Icon>
);

/** Spark over a frame: optimize. */
export const IconOptimize = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
    <path d="M18 16.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
  </Icon>
);

export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5M3 17.5l9 5 9-5" />
  </Icon>
);

export const IconCrop = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 2v15.5H22M2 6.5h15.5V22" />
  </Icon>
);

export const IconInspect = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.8-3.8M11 8v6M8 11h6" />
  </Icon>
);

/* ---- Actions ----------------------------------------------------------- */

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M3.5 15v2.5A3.5 3.5 0 007 21h10a3.5 3.5 0 003.5-3.5V15" />
  </Icon>
);

export const IconFolder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7.5A2.5 2.5 0 015.5 5h3.2a2 2 0 011.5.7l1 1.3h7.3A2.5 2.5 0 0121 9.5v7A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5z" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v12m0 0l-4.5-4.5M12 16l4.5-4.5" />
    <path d="M3.5 15v2.5A3.5 3.5 0 007 21h10a3.5 3.5 0 003.5-3.5V15" />
  </Icon>
);

export const IconArchive = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7.5h18V19a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <path d="M2 4.5h20V8H2zM10 12h4" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.4v.1" />
  </Icon>
);

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5v14M15 5v14" />
  </Icon>
);

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5l12 7.5-12 7.5z" />
  </Icon>
);

export const IconRetry = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 11-2.6-5.9" />
    <path d="M20.5 3.5V9H15" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0110.8 3.5h2.4a1.3 1.3 0 011.3 1.3v1.7" />
    <path d="M6 6.5l.9 13A1.6 1.6 0 008.5 21h7a1.6 1.6 0 001.6-1.5l.9-13" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12h15m0 0l-5.5-5.5M19.5 12L14 17.5" />
  </Icon>
);

export const IconSliders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
    <circle cx="16" cy="8" r="2" />
    <circle cx="10" cy="16" r="2" />
  </Icon>
);

/* ---- Trust and state --------------------------------------------------- */

export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.8l7.5 3v5.4c0 4.5-3 8.4-7.5 10-4.5-1.6-7.5-5.5-7.5-10V5.8z" />
    <path d="M8.8 12l2.3 2.3 4.1-4.6" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 10.5h13V20a1 1 0 01-1 1h-11a1 1 0 01-1-1z" />
    <path d="M8.5 10.5V7a3.5 3.5 0 017 0v3.5" />
  </Icon>
);

export const IconBolt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" />
  </Icon>
);

export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M3.5 17l4.8-4.8a2 2 0 012.8 0l6.4 6.4" />
  </Icon>
);

export const IconHeart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20.5C5.5 16.3 3 13 3 9.6A4.6 4.6 0 017.6 5c1.8 0 3.3 1 4.4 2.6C13.1 6 14.6 5 16.4 5A4.6 4.6 0 0121 9.6c0 3.4-2.5 6.7-9 10.9z" />
  </Icon>
);

/* ---- Theme ------------------------------------------------------------- */

export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </Icon>
);

export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 13.4A8.2 8.2 0 1110.6 4a6.6 6.6 0 009.4 9.4z" />
  </Icon>
);

export const IconMonitor = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8.5 21h7M12 17v4" />
  </Icon>
);
