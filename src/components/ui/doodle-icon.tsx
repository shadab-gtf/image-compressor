import type { ReactNode, SVGProps } from "react";

export type DoodleToolName =
  "compress" | "cutout" | "resize" | "convert" | "enhance" | "layers";
export type DoodleIllustrationName =
  | DoodleToolName
  | "storefront"
  | "website"
  | "content"
  | "select-image"
  | "adjust-image"
  | "save-image";
export type DoodleControlName =
  | "upload"
  | "download"
  | "sliders"
  | "palette"
  | "lock"
  | "shield"
  | "bolt"
  | "check"
  | "arrow"
  | "folder"
  | "trash"
  | "retry"
  | "archive"
  | "pause"
  | "play"
  | "close"
  | "image"
  | "inspect"
  | "info"
  | "chevron-down"
  | "chevron-right"
  | "compare";
export type DoodleIconName = DoodleIllustrationName | DoodleControlName;

export interface DoodleIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: DoodleIconName;
  size?: number;
}

// Original pen illustrations. Each silhouette is drawn independently, with
// imperfect curves and small ink details rather than a distortion filter.
// Paper matches the surrounding surface in both light and dark themes.
const paper = "var(--sf-surface, #f8f6ef)";

const illustrations: Record<DoodleIllustrationName, ReactNode> = {
  compress: (
    <>
      <path
        d="M28 83c10-3 31-3 41 .1 3 1-4 3-18 3-15 .3-26-1.5-23-3.1Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="m40 66-3 12-10 2m28-13 4 10 10 2" />
      <path
        d="M34 25c8-3 23-3 29-.5 2.5 10 1 28 .3 41-8 3-20 3-29 0-1.6-11-2-29-.3-40.5Z"
        fill={paper}
      />
      <path
        d="M35 29c7 1 20 .6 27-.8M34 62c7-1 23-1.2 29 .1"
        strokeWidth="1.7"
      />
      <path d="M8 44c5-.8 10-1 16-.4m-6-6 7 6-7 6M88 44c-6-.6-10-.2-16 .4m6-6-7 6 7 6" />
      <path
        d="M40 12c.8 2 1.5 4 2.4 5.6M55 11l-.8 6M27 16l4 4"
        strokeWidth="2.2"
      />
      <ellipse
        cx="43"
        cy="41"
        rx="1.8"
        ry="2.5"
        fill="currentColor"
        stroke="none"
        transform="rotate(10 43 41)"
      />
      <ellipse
        cx="55"
        cy="40"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
        transform="rotate(-12 55 40)"
      />
      <path d="M41 49c3 7 12 8 17-.3" />
      <path d="m27 78 10-2-1 6-11 .3Z" fill="currentColor" strokeWidth="1.3" />
      <path d="m60 76 9 2 2 4-12-.3Z" fill="currentColor" strokeWidth="1.3" />
    </>
  ),
  cutout: (
    <>
      <path
        d="m18 39-1-22 25-1M55 16l23 2-1 18M77 47l-2 25-15 1M29 73l-14-2 1-20"
        strokeDasharray="4 5"
        strokeWidth="2.3"
      />
      <path
        d="M31 69c-8 3-11 7-13 13 10 0 15-2 19-6m22-4 7 9 11-3-11-13"
        fill={paper}
      />
      <path d="M31 55c-8-2-12-8-15-14m0 0-2-7m2 7-7-2m7 2-6 4" />
      <path d="M62 51c9-1 14-9 17-14m0 0 2-7m-2 7 7-2m-7 2 6 4" />
      <path
        d="M45 23c-13 1-20 14-16 24 1 5 5 8 9 10-6 5-10 12-10 17 11 5 24 7 38 1-1-8-4-14-11-18 8-3 13-9 11-18-1-10-11-17-21-16Z"
        fill={paper}
      />
      <ellipse
        cx="42"
        cy="39"
        rx="1.8"
        ry="2.5"
        fill="currentColor"
        stroke="none"
        transform="rotate(13 42 39)"
      />
      <ellipse
        cx="55"
        cy="38"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <path d="M40 46c4 6 13 7 19-1" />
      <path d="m70 9 1.4 5M84 12l-4 5M87 23l-5 .5" strokeWidth="2.1" />
      <path d="M36 85c7 2 17 2 24 .1" strokeWidth="2" />
    </>
  ),
  resize: (
    <>
      <path d="M28 78v7l-10 1m31-9 3 7 10 1" />
      <path
        d="M18 33c10-1 28-1 40 .4l2 42c-13 3-26 4-40 1-2-11-3-30-2-43.4Z"
        fill={paper}
      />
      <path d="m22 69 9-9 9 8 6-6 10 10" strokeWidth="2" />
      <path d="M61 30c8-7 13-12 20-19m-16 1 17-2-1 17" />
      <path
        d="m70 40 12 1-.8 17M69 76l11 .6 1-8"
        strokeDasharray="4 4.5"
        strokeWidth="2.1"
      />
      <ellipse
        cx="30"
        cy="47"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <ellipse
        cx="43"
        cy="46"
        rx="1.8"
        ry="2.5"
        fill="currentColor"
        stroke="none"
        transform="rotate(-10 43 46)"
      />
      <path d="M29 53c4 5 11 5 16-1" />
      <path d="M19 86c3 1 7 1 10 .2m22-1c4 1.3 8 1.6 12 .8" strokeWidth="3.7" />
      <path d="M13 20 9 16m13 4-1-8M10 28l-5-.7" strokeWidth="2" />
    </>
  ),
  convert: (
    <>
      <path d="M23 18c11-12 32-11 46-1m-2-8 3 9-10 1" />
      <path d="M73 77c-12 12-35 11-48 0m1 8-3-9 10 .2" />
      <path
        d="M12 30c6-1 14-2 22-1l10 10-1 29c-10 2-22 2-31 0-1.5-11-1-26 0-38Z"
        fill={paper}
      />
      <path d="m33 29-.5 11 11-.5" />
      <path
        d="M55 29c8-1 15-1 21 .5l10 11-1 27c-10 1.6-21 2-31 0-.3-12-.5-25 1-38.5Z"
        fill={paper}
      />
      <path d="m76 30-1 10 11 .5" />
      <ellipse
        cx="22"
        cy="46"
        rx="1.6"
        ry="2.1"
        fill="currentColor"
        stroke="none"
      />
      <ellipse
        cx="33"
        cy="45"
        rx="1.6"
        ry="2.1"
        fill="currentColor"
        stroke="none"
      />
      <path d="M20 52c3 6 11 7 16-.5" />
      <ellipse
        cx="65"
        cy="47"
        rx="1.7"
        ry="2.1"
        fill="currentColor"
        stroke="none"
      />
      <path d="m75 47 3-1.5M63 54c3 5 10 5 15-1" />
      <path d="m7 76-3 3m85-56 3-3" strokeWidth="2" />
    </>
  ),
  enhance: (
    <>
      <path d="m38 68-6 12-10 2m37-14 6 13 10-2" />
      <path
        d="M46 16c4 7 8 14 12 20 8 3 15 5 23 9-7 5-14 9-23 12-3 8-6 17-10 23-5-8-9-15-12-23-8-3-15-6-22-10 7-5 15-8 23-11 2-7 5-14 9-20Z"
        fill={paper}
      />
      <path
        d="M26 11c.4 4 2 7 6 8-4 .7-6 4-7 8-.8-4-3-6-7-7 4-2 6-4 8-9ZM79 63l2 5 6 1-5 3-1 5-3-4-5-2 5-2Z"
        strokeWidth="2"
      />
      <ellipse
        cx="41"
        cy="44"
        rx="1.8"
        ry="2.5"
        fill="currentColor"
        stroke="none"
      />
      <ellipse
        cx="54"
        cy="43"
        rx="1.8"
        ry="2.5"
        fill="currentColor"
        stroke="none"
        transform="rotate(10 54 43)"
      />
      <path d="M40 52c4 7 13 7 18-1" />
      <path d="m65 18 3-5M76 27l5-2M11 64l-4 3" strokeWidth="2.1" />
      <path d="m22 82 10-1m32 1 12-2" strokeWidth="3.8" />
    </>
  ),
  layers: (
    <>
      <path d="m27 75-2 10-10 .6m43-11 7 9 11-1" />
      <path
        d="M34 12c14 .2 31 4 45 7l-8 49c-14-1-30-4-45-7 1-16 4-33 8-49Z"
        fill={paper}
      />
      <path
        d="M21 22c13-1 32 0 46 2l1 50c-18 0-34 1-50-2 0-16 1-33 3-50Z"
        fill={paper}
      />
      <path
        d="M10 37c14-4 30-5 47-6 4 15 7 31 8 46-14 4-31 7-47 7-3-13-6-29-8-47Z"
        fill={paper}
      />
      <path d="M16 44c12-4 27-6 38-6" strokeWidth="1.7" />
      <ellipse
        cx="30"
        cy="54"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
        transform="rotate(-10 30 54)"
      />
      <ellipse
        cx="44"
        cy="52"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <path d="M29 62c5 6 14 6 20-3" />
      <path d="M81 37c3 .4 6 1.6 8 4m-11 4c3 1 6 2.5 8 5" strokeWidth="2" />
      <path d="m16 86 10-.3m39-1 11-1" strokeWidth="3.6" />
    </>
  ),
  "select-image": (
    <>
      <path d="M29 14c13-.5 28 .8 41 3l-4 48c-13 .7-27-.4-40-2Z" fill={paper} />
      <path
        d="M16 26c14-1.5 30-1.2 44 .3 1.1 16 1.5 33 .2 49-14 2-29 2.3-44 .4-1.7-16-1.5-33-.2-49.7Z"
        fill={paper}
      />
      <ellipse
        cx="30"
        cy="40"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <ellipse
        cx="43"
        cy="39"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <path d="M29 48c4 6 12 6 17-.8" />
      <path d="m22 67 10-10 9 8 6-6 7 8" strokeWidth="2.2" />
      <path
        d="M59 53c8 5 17 12 25 18l-11 1.2-5 10c-3.5-10-6.1-19.2-9-29.2Z"
        fill={paper}
      />
      <path d="m77 30 5-4m-5 13 8-.5M9 18l-4-4" strokeWidth="2.1" />
      <path d="M23 84c7 1 18 1.2 26 .2" strokeWidth="2" />
    </>
  ),
  "adjust-image": (
    <>
      <path d="m31 75-4 9-9 .5m42-10 6 9 11-.7" />
      <path d="M19 49c-5-1-8-4-10-8m68 10c5-1 8-5 10-9" />
      <path
        d="M20 19c18-1.5 37-1 54 .9 2.2 18 2.8 38 1.3 56-17 2-35 2-53 .2-2.2-18-3.1-38-2.3-57.1Z"
        fill={paper}
      />
      <ellipse
        cx="38"
        cy="31"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <ellipse
        cx="51"
        cy="30"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <path d="M36 38c4 6 13 6 18-1" />
      <path
        d="M30 49c11-.6 22-.3 34 .3m-33 10c11-.6 22-.2 34 .2M32 69c11-.4 22-.2 32 .3"
        strokeWidth="2.1"
      />
      <path
        d="m39 46 6 .1-.1 6-6-.1Zm16 10 6 .2-.1 6-6-.3ZM37 66l6 .1.1 6-6-.1Z"
        fill={paper}
        strokeWidth="2.1"
      />
      <path d="m13 25-4-2m4-7-2-5M79 15l4-4m-2 12 6-.5" strokeWidth="2" />
      <path d="m18 85 9-.6m39 .4 11-.7" strokeWidth="3.6" />
    </>
  ),
  "save-image": (
    <>
      <path
        d="M20 14c13-1.6 28-1.4 41 .1 1.4 15 1.7 31 .8 46-14 1.9-27 2.1-41 .2-1.4-15-1.6-32-.8-46.3Z"
        fill={paper}
      />
      <ellipse
        cx="33"
        cy="28"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <ellipse
        cx="46"
        cy="27"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <path d="M32 36c4 6 12 6 17-.7" />
      <path d="m26 53 10-10 9 8 5-5 7 7" strokeWidth="2.2" />
      <path d="M75 39c.4 9 .2 18-.3 28m-10-9 10 10c3.3-3 6.7-6.6 10.1-10.4" />
      <path d="M16 72c-.5 5-.5 9 1.5 12 19 2.4 42 2.4 63 .5 2-3.4 2.2-7.7 1.7-12" />
      <path d="M30 72c6 .6 14 .6 21 .2" strokeWidth="2" />
      <path d="m71 21 5 5 10-12" strokeWidth="3" />
      <path d="m11 33-5-1m7 10-5 2" strokeWidth="2.1" />
    </>
  ),
  storefront: (
    <>
      <path d="M16 83c17 2 44 2 67-.4" strokeWidth="2" />
      <path
        d="M22 34c15-1 34-.8 50 .5l.4 45c-17 1.8-34 1.4-51-.2-.5-15-.4-30 .6-45.3Z"
        fill={paper}
      />
      <path
        d="M24 18c13-1.2 32-.8 45 .7l10 16c-20 1.3-40 1.1-62 .2Z"
        fill={paper}
      />
      <path
        d="M17 35c-.8 7 9 10 13 .2 1 8 11 8 15 .2 2 8 12 8 16-.2 1 7 12 9 18-.3"
        fill={paper}
      />
      <path d="m36 18-6 17m18-17-3 17m13-16 3 16" strokeWidth="2.1" />
      <path d="M29 48c9-1 20-.7 28 .2l.2 21c-9 1.2-18 1.3-28-.1-.5-7-.5-14-.2-21.1Z" />
      <ellipse
        cx="37"
        cy="55"
        rx="1.7"
        ry="2.2"
        fill="currentColor"
        stroke="none"
      />
      <ellipse
        cx="48"
        cy="54.5"
        rx="1.7"
        ry="2.2"
        fill="currentColor"
        stroke="none"
      />
      <path d="M37 61c3 4 9 4 13-.8" strokeWidth="2.2" />
      <path
        d="M63 61c6-.6 13-.4 19 .5l2 20c-8 1.4-15 1.1-23-.2Z"
        fill={paper}
      />
      <path
        d="M67 63c-.6-8 1.5-11 5.5-11 4.2 0 6 3.7 5.5 11"
        strokeWidth="2.2"
      />
      <path d="m10 21-4-2m8-5-2-5M81 18l4-4" strokeWidth="2" />
    </>
  ),
  website: (
    <>
      <path d="m34 73-3 10-10 1m37-10 6 9 10-1" />
      <path
        d="M17 24c18-2 40-1.6 61 .4 2 14 2 32 .5 47-19 2.6-41 2.6-61 0-1.3-14-1.7-32-.5-47.4Z"
        fill={paper}
      />
      <path d="M17 35c18-1 43-.8 62 .5" strokeWidth="2.1" />
      <path d="m25 29.5.1.1m6.8-.2.1.1m6.8-.1.1.1" strokeWidth="3" />
      <path d="M49 29.6c7-.4 14-.3 21 .3" strokeWidth="1.7" />
      <ellipse
        cx="39"
        cy="47"
        rx="1.8"
        ry="2.5"
        fill="currentColor"
        stroke="none"
        transform="rotate(8 39 47)"
      />
      <ellipse
        cx="53"
        cy="46"
        rx="1.8"
        ry="2.4"
        fill="currentColor"
        stroke="none"
      />
      <path d="M37 55c5 7 14 8 21-1" />
      <path
        d="M68 58c6 4 12 9 17 14l-8 .9-3.9 7.1c-2.1-7-3.8-14-5.1-22Z"
        fill={paper}
        strokeWidth="2.3"
      />
      <path d="M7 44l-4 .3m7 9-6 .3m6 9-4 .3" strokeWidth="2.2" />
      <path
        d="M70 7c1 4 3 7 7 8-4 1-7 3-8 7-.8-4-3-6-7-7 4-1 6-4 8-8Z"
        fill={paper}
        strokeWidth="2.1"
      />
      <path d="m83 29 5-1m-3-7 3-3" strokeWidth="2" />
      <path d="m21 84 10-.7m33 .3 10-1" strokeWidth="3.6" />
    </>
  ),
  content: (
    <>
      <path d="M58 13c9 .2 18 1.2 27 3l-4 29c-9-.4-18-1.6-27-3Z" fill={paper} />
      <path
        d="M62 24c1-4 6-4 8-.4 3-3 7-1 7 2.3-.3 4-5 7-8 9-3-3-7-6-7-10.9Z"
        strokeWidth="2.1"
      />
      <path d="m31 74-4 10-10 .3m45-10 6 9 10-1" />
      <path
        d="M16 36c4-.7 10-1 16-1l6-10c7-1 14-.7 20 .3l6 10c6 .2 12 .7 16 1.5 1.2 12 1.4 25 .2 37-20 2.5-43 2.6-64 .1-1.5-13-1.4-26-.2-37.9Z"
        fill={paper}
      />
      <path d="m22 29 6 .1.2 6" strokeWidth="2.3" />
      <path d="M47 39c10-.7 18 7 18 17-.1 10-7.7 17.5-17.6 17-9.7-.3-17-7.4-17.2-17.2C30 47 37 39.5 47 39Z" />
      <ellipse
        cx="41"
        cy="53"
        rx="1.7"
        ry="2.3"
        fill="currentColor"
        stroke="none"
      />
      <ellipse
        cx="53"
        cy="52"
        rx="1.7"
        ry="2.3"
        fill="currentColor"
        stroke="none"
        transform="rotate(-8 53 52)"
      />
      <path d="M40 60c4 6 11 6 16-1" strokeWidth="2.3" />
      <path d="m69 43 5 .3-.1 4-5-.3Z" fill="currentColor" strokeWidth="1" />
      <path d="m12 18 3 6m8-9-1 7M7 29l6 1" strokeWidth="2.1" />
      <path d="m85 61 5 2m-6 5 4 3" strokeWidth="2" />
      <path d="m17 84 10-.2m41-.2 10-1" strokeWidth="3.6" />
    </>
  ),
};

// Small control marks use a separate 24px grid. They share the pen's rounded,
// slightly uneven gestures without squeezing illustration details into buttons.
const controls: Record<DoodleControlName, ReactNode> = {
  upload: (
    <>
      <path d="M11.8 16c.3-4 .1-8 .5-12m-4.9 5c1.6-1.9 3-3.5 4.9-5 1.6 1.7 3 3.1 4.6 5" />
      <path d="M3.7 15.7c-.4 2.3-.5 4 1.8 4.7 4.2.6 9 .3 13 .2 2.3-.4 2.3-2.9 1.8-4.8" />
    </>
  ),
  download: (
    <>
      <path d="M11.8 3.8c.4 4 .1 8 .3 12.3m-4.6-4.3c1.7 1.8 2.9 3 4.6 4.3 1.6-1.6 3.1-3 4.7-4.7" />
      <path d="M3.7 16.5c-.4 2.6.1 4 2.4 4 4 .4 8.6.3 12.4.1 2.1-.3 2.3-2.1 1.9-4.4" />
    </>
  ),
  sliders: (
    <>
      <path d="m5.5 3-.3 5m.1 5-.1 8M12 3.5l.2 10m-.1 5.2-.1 2.6M19 3l-.2 3.6m0 5.1.3 9" />
      <path
        d="M2.6 8.3c1.8-.3 3.5-.2 5.3 0l.1 4c-1.5.3-3.5.2-5.2 0Zm6.9 5.4c1.7-.2 3.6-.2 5.1.1l.1 4.4-5.4-.1ZM16.3 7c1.6-.3 3.4-.3 5.1 0l-.1 4.1-5 .1Z"
        fill={paper}
      />
    </>
  ),
  palette: (
    <>
      <path d="M12.2 2.9c-5.4-.4-9.6 3.2-9.3 8.7.2 5.6 4.7 9.7 9.7 9.4 2.5-.1 3.6-1.8 2.3-3.5l-.7-.9c-1-1.4-.1-2.8 1.6-2.8l2.3.2c2.4.1 3.4-1.4 2.9-3.6-.8-4.5-4.2-7.4-8.8-7.5Z" />
      <path
        d="M6.7 7.4c1.3-.7 2.6 1.2 1.3 2.1-1.4.8-2.7-1.2-1.3-2.1Zm4.7-2c1.5-.5 2.2 1.7.8 2.3-1.6.5-2.4-1.8-.8-2.3Zm4.5 2c1.4-.6 2.4 1.4 1 2.2-1.4.6-2.4-1.5-1-2.2Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M7.2 13c1.5-.5 2.7.8 2.3 2.3-.4 1.4-2.6 1.6-3.1.2-.5-1 .1-2.2.8-2.5Z" strokeWidth="1.5" />
    </>
  ),
  lock: (
    <>
      <path d="M7 10c-.5-3.7.7-6.6 4.6-6.8 4.1-.1 5.3 2.7 5.1 6.6" />
      <path d="M5.1 10.3c4.8-.6 9.4-.5 13.8-.1.8 3.4.8 7.1.3 10.1-4.7.4-9.4.7-14.1-.1-.5-3.1-.4-6.6 0-9.9Z" />
      <path d="m12 14.5-.1 2.7" strokeWidth="2.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.8c2.6 1.8 5.4 2.5 8 3.1.6 7-1.8 12.4-8.1 15.2C6 18.5 3.4 13.1 4 6c2.9-.8 5.5-1.3 8-3.2Z" />
      <path d="m8.4 11.8 2.7 2.8 4.8-5" />
    </>
  ),
  bolt: (
    <path d="M13.8 2.5c-3.4 4-6.4 7.4-9 11l6.4-.3-1 8.3c3.5-4.1 6.5-8 9.2-11.1l-6.5.2Z" />
  ),
  check: (
    <path
      d="M4.5 12.8c2 1.5 3.5 3.2 5 5.1 3-4.2 6.7-8.3 10-11.1"
      strokeWidth="2.3"
    />
  ),
  arrow: (
    <>
      <path d="M3.5 12.3c5-.6 10.8-.5 16.5-.2" />
      <path d="M14.4 6.7c2 1.8 4 3.3 5.8 5.4-2 1.7-3.8 3.2-5.6 5.1" />
    </>
  ),
  folder: (
    <path d="M3.3 7.5c0-1.8.3-3 2.6-2.7l4 .2 2 2.4c2.4-.1 5.3-.3 8.1.1 1.2 3.8 1 7.6.3 11.3-5.7.6-11.4.7-16.9-.1-.5-3.2-.6-7.2-.1-11.2Zm.1 2.5c5.4-.3 11.5-.2 16.7-.1" />
  ),
  trash: (
    <>
      <path d="M4.4 6.6c5-.6 10.3-.6 15.4-.1M9 6.1l.4-3.2 5 .2.7 3.1M6.1 7.6l.7 12.6c3.6.6 7.2.7 10.3-.2l.8-12.2" />
      <path d="m10 10.8.3 6.4m3.8-6.3-.3 6.5" strokeWidth="1.5" />
    </>
  ),
  retry: (
    <>
      <path d="M19.8 9c-1.4-4.4-6.7-6.9-11-4.8C4.4 6.1 2.7 10.2 4 14.5c1.8 5.4 7.3 7.3 11.7 4.7 1.5-.9 2.4-1.9 3.1-3.2" />
      <path d="m20.2 3.7.2 5.7-5.9.1" />
    </>
  ),
  archive: (
    <>
      <path d="M3 4.2c5.7-.5 12.2-.4 18 .1l-.2 4.5c-5.4.6-11.8.4-17.8 0ZM4.7 9.2l.2 11c4.8.5 9.7.5 14.3-.1l.2-10.9" />
      <path d="M9.5 13.3c1.7-.3 3.4-.3 5.1-.1" />
    </>
  ),
  pause: (
    <>
      <path
        d="M5.6 4.2c1.5-.2 3.1-.3 4.4 0l-.2 15.6-4.4.1ZM14.5 4.1l4.2.1.1 15.6-4.5.1Z"
        fill="currentColor"
        strokeWidth="1.1"
      />
    </>
  ),
  play: (
    <path
      d="M7 3.9c4.3 2.4 7.9 5.3 12.1 8.2-4 2.9-8.2 5.6-12.2 8.1.3-5.3-.3-10.8.1-16.3Z"
      fill="currentColor"
      strokeWidth="1.3"
    />
  ),
  close: (
    <>
      <path d="M6 5.8c4.1 4.6 7.9 8.3 12.3 12.1M18 5.7c-4.3 4-7.8 8.3-12.1 12.6" />
    </>
  ),
  image: (
    <>
      <path d="M3.8 4.2c5.3-.7 10.9-.5 16.3 0 .5 5 .7 10.6.1 15.7-5.8.5-11 .8-16.4 0-.5-5.6-.7-10.7 0-15.7Z" />
      <path d="m4.4 16.8 5.4-5.5 4.6 4.3 2.6-2.5 2.8 3.2" />
      <path
        d="M14.4 8.1c1.4-1.5 3.5.8 1.9 2-1.6 1.1-3.3-.8-1.9-2Z"
        fill="currentColor"
        strokeWidth="1"
      />
    </>
  ),
  inspect: (
    <>
      <path d="M15.7 5.4c3.5 3 3.1 8-.4 10.9-3 2.3-7.6 1.9-10.1-1.2-2.5-3-1.6-7.4 1.2-9.8 2.5-2.1 6.8-2.1 9.3.1Z" />
      <path d="m16.1 16 5 5.1M8.4 10.8l5.1.1m-2.7-2.6.2 5.1" />
    </>
  ),
  info: (
    <>
      <path d="M12 2.9c5.5-.2 9.3 4.5 9 9.6-.3 5-4.4 8.9-9.6 8.4C6 20.5 2.8 16.8 3 11.5c.3-4.9 4-8.6 9-8.6Z" />
      <path d="m11.5 10.8.1 5.3m-.1-9.3.1.1" strokeWidth="2.6" />
    </>
  ),
  "chevron-down": (
    <path d="M5.5 8.8c2.4 2.6 4.6 4.5 6.5 6.7 2.4-2.4 4.7-4.7 6.6-6.8" />
  ),
  "chevron-right": (
    <path d="M8.8 5.4c2.4 2.2 4.5 4.4 6.6 6.6-2.2 2.4-4.6 4.5-6.7 6.7" />
  ),
  compare: (
    <>
      <path d="M3.1 7.6c5.2-.6 10.8-.4 16.3-.2m-4-4.1 4.8 4.2-4.9 4M20.8 16.2c-5.2.6-10.7.4-16.4.2m4 4.1-4.9-4.2 4.9-4" />
    </>
  ),
};

function isIllustration(name: DoodleIconName): name is DoodleIllustrationName {
  return name in illustrations;
}

/** Stateless and safe to render from either Server or Client Components. */
export function DoodleIcon({
  name,
  size = 24,
  children,
  ...props
}: DoodleIconProps) {
  const illustrated = isIllustration(name);
  const labelled =
    props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox={illustrated ? "0 0 96 96" : "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeWidth={illustrated ? 2.8 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      focusable="false"
      {...props}
    >
      {illustrated ? illustrations[name] : controls[name]}
      {children}
    </svg>
  );
}
