import type { Metadata } from "next";
import { createPageMetadata, SITE } from "@/lib/site";
import {
  DEFAULT_OPTIONS,
  type CompressionOptions,
  type OutputOptions,
  type ProcessingOptions,
  type ResizeOptions,
} from "@/types/options";

/**
 * The SEO tool pages.
 *
 * Every entry here is a page that contains the real tool, not a doorway: the
 * `options` field is seeded straight into the queue store when the page mounts,
 * so landing on /compress-image-to-500kb arrives with a 500 KB target already
 * selected. A slug may only exist in this registry if the pipeline can actually
 * perform it today.
 */

export const TOOL_SLUGS = [
  "compress-image",
  "resize-image",
  "convert-image",
  "optimize-image",
  "png-to-webp",
  "png-to-avif",
  "jpg-to-webp",
  "jpg-to-avif",
  "webp-to-jpg",
  "webp-to-png",
  "avif-to-jpg",
  "png-to-jpg",
  "jpg-to-png",
  "compress-image-to-100kb",
  "compress-image-to-200kb",
  "compress-image-to-500kb",
  "bulk-image-compressor",
  "bulk-image-resizer",
] as const;

export type ToolSlug = (typeof TOOL_SLUGS)[number];

export type ToolIconName = "compress" | "resize" | "convert" | "optimize" | "layers";

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface HowStep {
  title: string;
  detail: string;
}

export interface ToolPageDefinition {
  slug: ToolSlug;
  icon: ToolIconName;
  /** Small label above the h1. */
  eyebrow: string;
  h1: string;
  /** Hero sub-headline. One sentence, concrete. */
  sub: string;
  /** Bare <title>; the root layout appends the site name. */
  title: string;
  description: string;
  keywords: string[];
  /** Short labels describing the options this page seeds into the queue. */
  presetChips: string[];
  /** Body copy. Each string is one paragraph. */
  intro: string[];
  steps: HowStep[];
  faqs: FaqEntry[];
  related: ToolSlug[];
  options: ProcessingOptions;
}

function options(
  overrides: {
    resize?: Partial<ResizeOptions>;
    compression?: Partial<CompressionOptions>;
    output?: Partial<OutputOptions>;
  } = {},
): ProcessingOptions {
  return {
    resize: { ...DEFAULT_OPTIONS.resize, ...overrides.resize },
    compression: { ...DEFAULT_OPTIONS.compression, ...overrides.compression },
    output: { ...DEFAULT_OPTIONS.output, ...overrides.output },
  };
}

/* -------------------------------------------------------------------------- */
/* Shared copy                                                                 */
/* -------------------------------------------------------------------------- */

const PRIVACY_FAQ: FaqEntry = {
  question: "Are my images uploaded to a server?",
  answer:
    "No. Decoding and encoding run in your browser, using the same image engine that paints pictures onto the page. The site also ships a Content-Security-Policy with connect-src 'self', which means the browser itself blocks any request to another origin — so image bytes have nowhere to go even in principle, not just by convention.",
};

const COST_FAQ: FaqEntry = {
  question: "Is there a catch — credits, watermarks or a sign-up?",
  answer:
    "None of those. There is no account, no per-image credit, no watermark and no daily quota, because there is no server cost to recover: your own device does the work. The only real limit is how much memory your browser can give a batch.",
};

const ADD_STEP: HowStep = {
  title: "Add your images",
  detail:
    "Drop files onto the box above, pick them from your device, or choose a whole folder at once. JPEG, PNG, WebP, AVIF, GIF and BMP are read, as long as your browser can decode them.",
};

const DOWNLOAD_STEP: HowStep = {
  title: "Check the numbers, then download",
  detail:
    "Every file reports its original size, its new size, the percentage saved and the final dimensions. Download them individually or pull the whole batch down as one ZIP.",
};

/* -------------------------------------------------------------------------- */
/* Target-size pages                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The three byte-budget pages differ only in the number and in why that number
 * exists, so the shared mechanics live here and each page supplies its own
 * reason for being.
 */
function targetSizeTool(
  kb: 100 | 200 | 500,
  parts: { why: string; feasibility: string; related: ToolSlug[] },
): ToolPageDefinition {
  return {
    slug: `compress-image-to-${kb}kb` as ToolSlug,
    icon: "compress",
    eyebrow: "Target size",
    h1: `Compress an image to ${kb} KB`,
    sub: `Give ShrinkFox a byte budget and it searches for the best-looking file that fits underneath it — on your device, with no upload.`,
    title: `Compress Image to ${kb} KB — Free Online Tool`,
    description: `Compress JPG and PNG images to under ${kb} KB for free. ShrinkFox searches the quality range to find the sharpest file that fits your budget, entirely in your browser.`,
    keywords: [
      `compress image to ${kb}kb`,
      `reduce image size to ${kb}kb`,
      `${kb}kb image compressor`,
      "compress jpeg to size",
      "image size reducer",
    ],
    presetChips: [`Target ${kb} KB`, "JPEG output", "Downscale if needed"],
    intro: [
      parts.why,
      "Hitting an exact byte budget is a search problem, not a guess. ShrinkFox binary-searches the quality axis — file size is monotonic in quality for every codec here, which is what makes a bisection valid — and takes the highest quality whose output still fits. If even the lowest sensible quality overshoots, it reduces the dimensions by 20% and searches again, for up to four passes.",
      "When the target genuinely cannot be reached without destroying the image, the result is reported as not reached, together with the closest size it managed. Quietly handing back a file that is 40% over the limit is the most common dishonesty in online compressors, and this one will not do it.",
      parts.feasibility,
    ],
    steps: [
      ADD_STEP,
      {
        title: `Confirm the ${kb} KB budget`,
        detail: `The target is already set to ${kb} KB on this page. You can raise or lower it, change the tolerance, or turn off dimension reduction if the pixel size must not change.`,
      },
      {
        title: "Review what it achieved",
        detail:
          "Each file shows the final size, the quality the search settled on and whether the target was met. If one image could not fit, you will see that stated rather than implied.",
      },
    ],
    faqs: [
      {
        question: `Will the output be exactly ${kb} KB?`,
        answer: `It will be at or below ${kb} KB, not exactly on it. Encoders do not let you dial in a byte count directly — quality is the only lever, and the relationship between quality and size differs for every image. ShrinkFox finds the largest file that still fits under your ceiling, which is what an upload form actually checks.`,
      },
      {
        question: `What if my image cannot reach ${kb} KB?`,
        answer:
          "You get the smallest result it could produce, clearly marked as not reached, with its actual size. That usually means the image has far more pixels than the budget can carry. Allowing dimension reduction, or resizing first, is almost always a better fix than pushing quality lower.",
      },
      {
        question: "Does it shrink the dimensions as well as the quality?",
        answer:
          "Only when quality alone cannot get there, and only if you leave that option on. The search exhausts the quality range at full size first, then steps the dimensions down by 20% per pass. Turn it off when the pixel dimensions are fixed by a form requirement.",
      },
      {
        question: "Why is the output a JPEG?",
        answer:
          "A byte budget and a lossless format are incompatible goals: PNG has no quality dial to search, so there is nothing for the bisection to tune. JPEG does, it is accepted by essentially every upload form, and it is the format these limits were written for. Any transparency is flattened onto the background colour you choose.",
      },
      {
        question: `Is ${kb} KB measured as 1000 or 1024 bytes?`,
        answer: `${kb} KB here means ${(kb * 1000).toLocaleString("en-US")} bytes, using decimal units — the same convention your operating system's file listing and every image CDN uses. If a form insists on ${kb} KiB you have ${Math.round(kb * 24)} bytes of extra headroom, not less.`,
      },
      PRIVACY_FAQ,
    ],
    related: parts.related,
    options: options({
      compression: {
        mode: "targetSize",
        targetBytes: kb * 1000,
        targetTolerance: 0,
        allowDownscaleForTarget: true,
      },
      output: { format: "jpeg", background: "#FFFFFF" },
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* The registry                                                                */
/* -------------------------------------------------------------------------- */

export const TOOLS: Record<ToolSlug, ToolPageDefinition> = {
  "compress-image": {
    slug: "compress-image",
    icon: "compress",
    eyebrow: "Compress",
    h1: "Compress images in your browser",
    sub: "Drop a JPEG, PNG, WebP or AVIF and get a smaller file back in seconds. The encoder runs on your own device, so there is nothing to upload and no queue to wait in.",
    title: "Compress Image — Free Online Image Compressor",
    description:
      "Compress JPG, PNG, WebP and AVIF images for free. Choose smart compression, a quality level or an exact target size. Runs entirely in your browser — no upload, no account.",
    keywords: [
      "compress image",
      "image compressor",
      "reduce image file size",
      "compress jpeg",
      "compress png",
      "free image compressor",
    ],
    presetChips: ["Smart quality", "Keeps original format", "Strips personal EXIF"],
    intro: [
      "Compression works by discarding information a viewer will not miss. Photographs carry a great deal of it: sensor noise, imperceptible steps in a gradient, detail buried in shadows nobody will ever inspect. A good encoder throws that away first and leaves faces and edges alone, which is why a 4 MB phone photo usually lands somewhere between 300 and 700 KB with no visible difference at normal viewing size.",
      "ShrinkFox opens in smart mode, which reads the output format and the pixel count before choosing a quality. A 24-megapixel photograph tolerates far more compression than a 300-pixel interface icon, where artefacts sit right next to hard edges and are immediately obvious. If you would rather drive it yourself, switch to the quality slider, or hand it a byte budget and let it search.",
      "PNG behaves differently and it is worth knowing why. PNG is lossless, so the only real size lever it has is the colour palette — genuinely useful for screenshots, logos and flat illustrations, close to useless for photographs. If your PNG is really a photograph, converting it to WebP or AVIF will save far more than compressing it as PNG ever can.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Choose how hard to squeeze",
        detail:
          "Smart mode decides per image. Quality mode gives you a 1–100 slider. Target size takes a byte budget and searches for the best quality that fits. Lossless exports PNG with every pixel intact.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "How much smaller will my images get?",
        answer:
          "For ordinary camera and phone photographs, 60–85% is normal at a quality most people cannot distinguish from the original. Images that have already been through an optimizer — anything exported by a modern CMS or served through an image CDN — may only give up a few percent, and ShrinkFox will show you that rather than quietly returning a file the same size.",
      },
      {
        question: "Does compressing an image reduce its quality?",
        answer:
          "Smart and quality modes are lossy: they trade detail for bytes, and that trade is permanent in the output file. Your original is never modified, so you can always compare and try a different setting. If you need every pixel preserved exactly, use lossless mode, which exports PNG.",
      },
      {
        question: "Which formats can it compress?",
        answer:
          "It reads JPEG, PNG, WebP, AVIF, GIF and BMP wherever your browser can decode them, and writes JPEG, PNG, WebP or AVIF. HEIC, RAW, PSD, SVG and JPEG XL are not decodable in current browsers, so export those to JPEG or PNG from your camera software first.",
      },
      {
        question: "Does it remove EXIF and GPS data?",
        answer:
          "By default it strips the personal fields — GPS coordinates, camera serial numbers, owner and copyright names — while keeping orientation and colour information so the picture still displays correctly. You can switch to keeping everything, or to removing all metadata. Note that any output other than JPEG carries no metadata at all, because the browser's canvas encoder does not write it.",
      },
      {
        question: "Is there a limit on file size or how many files I can do?",
        answer:
          "Nothing is imposed. The practical ceiling is your device's memory: a desktop handles several hundred ordinary photos comfortably, phones and tablets prefer smaller batches. Images beyond roughly 100 megapixels are refused because the browser cannot allocate a canvas that large.",
      },
      PRIVACY_FAQ,
    ],
    related: [
      "compress-image-to-100kb",
      "bulk-image-compressor",
      "optimize-image",
      "resize-image",
      "convert-image",
    ],
    options: options(),
  },

  "resize-image": {
    slug: "resize-image",
    icon: "resize",
    eyebrow: "Resize",
    h1: "Resize images without uploading them",
    sub: "Set a width, a height, a percentage or a box to fit inside. Proportions are kept unless you say otherwise, and every file stays on your device.",
    title: "Resize Image — Free Online Image Resizer",
    description:
      "Resize JPG, PNG, WebP and AVIF images by width, height, percentage or bounding box. Keeps aspect ratio, never upscales by accident, and runs entirely in your browser.",
    keywords: [
      "resize image",
      "image resizer",
      "change image dimensions",
      "resize jpg",
      "resize png online",
      "bulk resize images",
    ],
    presetChips: ["Max width 1600 px", "Aspect ratio locked", "No upscaling"],
    intro: [
      "Most images on the web are far larger than the space they are displayed in. A 4000-pixel photograph sitting in an 800-pixel column costs the visitor roughly five times the bytes for no visible gain — and on a phone it also costs decode time and memory before a single frame is painted. Resizing to the dimensions you actually render at is usually a bigger win than any amount of compression.",
      "ShrinkFox downsamples in halving steps rather than one jump. Browsers sample too sparsely when a single drawImage call shrinks an image by more than about 2x, which is exactly what makes naive canvas resizing look crunchy and aliased next to a real image library. Stepping down by halves keeps every source pixel contributing, so a 6000-pixel photograph reduced to 800 stays clean.",
      "Upscaling is disabled by default. Enlarging an image cannot invent detail that was never captured; it only softens what is there and makes the file bigger. Turn it on deliberately when you need a larger pixel canvas for a layout, not in the hope of improving quality.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Pick a resize rule",
        detail:
          "Max width is the usual choice for the web. You can also set an exact width and height, scale by percentage, fit inside a box without cropping, or fill a box and centre-crop the overflow.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "Will resizing distort my images?",
        answer:
          "Not unless you ask it to. Aspect ratio is locked by default, so setting a width lets the height follow. The only way to stretch an image is to use exact mode and switch the ratio lock off, which is occasionally what you want and is never the default.",
      },
      {
        question: "What width should I use for a website?",
        answer:
          "1600 px covers most full-width content images on a 2x display, and 2400 px is right for a full-bleed hero. In-article images rarely need more than 1200–1600 px, and thumbnails are usually 400 px or less. Serve the largest size you genuinely need and let the browser scale down from there.",
      },
      {
        question: "Can I make every image exactly the same size?",
        answer:
          "Use fill mode with a width and height. It scales each image to cover the box and centre-crops whatever hangs over, so a mixed folder of portrait and landscape shots comes out as a uniform grid. Fit mode does the opposite — nothing is cropped, so the dimensions vary.",
      },
      {
        question: "Does resizing reduce quality?",
        answer:
          "Downscaling discards pixels by definition, but done properly it looks sharper, not worse, because detail is averaged rather than dropped. The quality loss people associate with resizing usually comes from upscaling, or from a single-pass shrink that undersamples. Neither happens here by default.",
      },
      PRIVACY_FAQ,
    ],
    related: ["bulk-image-resizer", "compress-image", "optimize-image", "convert-image"],
    options: options({ resize: { mode: "maxWidth", width: 1600 } }),
  },

  "convert-image": {
    slug: "convert-image",
    icon: "convert",
    eyebrow: "Convert",
    h1: "Convert images between formats",
    sub: "JPEG, PNG, WebP and AVIF in and out. ShrinkFox checks which encoders your browser genuinely has before it promises you anything.",
    title: "Convert Image — Free Online Image Converter",
    description:
      "Convert images between JPG, PNG, WebP and AVIF free in your browser. Transparency is handled explicitly, encoder support is verified, and no file is ever uploaded.",
    keywords: [
      "convert image",
      "image converter",
      "change image format",
      "convert to webp",
      "convert to avif",
      "free image format converter",
    ],
    presetChips: ["Best available format", "Smart quality", "Encoder verified"],
    intro: [
      "Formats are trade-offs rather than a ranking. JPEG is universal and has no transparency. PNG is lossless and carries an alpha channel, which makes it right for logos and screenshots and badly wrong for photographs. WebP does both jobs and typically lands 25–35% below JPEG at the same perceived quality. AVIF goes further still — often half the size of JPEG — but it encodes slowly and not every browser can write it.",
      "The automatic setting on this page picks the most efficient format your browser can actually encode: AVIF if a working encoder is present, then WebP, falling back to PNG when the image has transparency and JPEG when it does not.",
      "Converting something transparent into JPEG means the alpha channel has to go somewhere. ShrinkFox composites it onto a background colour you choose — white by default — and flags on the result that it did, so a transparent logo never silently becomes a white rectangle.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Choose the output format",
        detail:
          "Pick JPEG, PNG, WebP or AVIF, or leave it on automatic. Formats your browser cannot encode are reported rather than silently substituted.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "Which format should I convert to?",
        answer:
          "For photographs on the web, WebP is the safe default and AVIF the aggressive one. For screenshots, logos, icons and anything with hard edges or transparency, PNG or lossless-feeling WebP. For compatibility with older software and upload forms, JPEG. There is no universally best answer, only a best answer for where the file is going.",
      },
      {
        question: "Why is AVIF sometimes unavailable?",
        answer:
          "Decoding and encoding are separate capabilities. Nearly every current browser can display an AVIF, but only some ship an encoder that can write one. ShrinkFox probes for a real working encoder when the page loads instead of assuming, and tells you if yours cannot do it. WebP is the next best destination and is available essentially everywhere.",
      },
      {
        question: "Does converting a GIF keep the animation?",
        answer:
          "No. Animated GIF and APNG are read as a single still frame, because there is no animation encoder here. If you convert an animated file you will get one frame, not a shorter loop. Use a dedicated video or GIF tool for that.",
      },
      {
        question: "Can I convert HEIC, RAW or PSD files?",
        answer:
          "Not directly. The browser has to be able to decode a format before ShrinkFox can touch it, and HEIC, RAW, PSD, SVG and JPEG XL are not decodable in current browsers. Export them to JPEG or PNG from your camera software, Photos app or editor first, then convert here.",
      },
      {
        question: "Does metadata survive the conversion?",
        answer:
          "Only when the output is JPEG. The browser's canvas encoder writes no metadata at all, so ShrinkFox re-attaches a rewritten EXIF segment to JPEG output and nothing else. WebP, AVIF and PNG output come out clean. Orientation is never lost either way, because images are decoded upright before anything else happens.",
      },
      PRIVACY_FAQ,
    ],
    related: ["png-to-webp", "jpg-to-webp", "webp-to-jpg", "png-to-jpg", "compress-image"],
    options: options({ output: { format: "auto" } }),
  },

  "optimize-image": {
    slug: "optimize-image",
    icon: "optimize",
    eyebrow: "Optimize",
    h1: "Optimize images for the web",
    sub: "Cap the dimensions, re-encode to a modern format and strip the metadata in a single pass. Built for images you are about to ship.",
    title: "Optimize Image — Free Web Image Optimizer",
    description:
      "Optimize images for web performance: cap the dimensions, re-encode to the most efficient format your browser supports and strip metadata. Free, local, no upload.",
    keywords: [
      "optimize image",
      "image optimizer",
      "optimize images for web",
      "web performance images",
      "reduce page weight",
    ],
    presetChips: ["Max width 2400 px", "Best available format", "Personal EXIF removed"],
    intro: [
      "Optimising an image for the web is three decisions, not one: how many pixels it actually needs, which codec carries those pixels most cheaply, and how much of the file is not image data at all. This page applies all three at once — a 2400-pixel ceiling, the most efficient format your browser can write, and a per-image quality chosen from the format and the pixel count.",
      "The dimension cap usually matters most. Images are the largest single contributor to Largest Contentful Paint on most pages, and a hero twice as wide as the viewport costs four times the pixels to decode before anything appears. Cutting a 5000-pixel export to 2400 often halves the byte count before the encoder has done any work at all.",
      "Metadata is the quiet one. A camera JPEG can carry several kilobytes of EXIF, an ICC profile and sometimes an embedded preview thumbnail. ShrinkFox removes the personal fields by default — GPS coordinates, serial numbers, owner names — which is a privacy win first and a few free kilobytes second.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Adjust the ceiling if you need to",
        detail:
          "2400 px suits full-width heroes. Drop it to 1600 for in-article images or 800 for sidebars and cards. Anything already smaller than the ceiling is left at its original size.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "What does optimizing actually change?",
        answer:
          "Three things: the dimensions are capped so you are not shipping pixels nobody sees, the image is re-encoded with the most efficient codec your browser can write, and personal metadata is removed. Together those usually take a camera export from several megabytes to a couple of hundred kilobytes.",
      },
      {
        question: "Will this improve my Core Web Vitals?",
        answer:
          "It addresses the part of Largest Contentful Paint you control at the file level — byte count and decode cost. It cannot fix a slow server, a render-blocking stylesheet, or a hero image that is loaded lazily when it should not be. Smaller images are necessary for a good LCP, not sufficient.",
      },
      {
        question: "Do I still need a CDN or an image service?",
        answer:
          "For a site that serves a fixed set of images, optimising once at build time and shipping the result is perfectly reasonable and costs nothing. A CDN earns its place when you need per-request resizing, per-browser format negotiation or user-uploaded content at volume.",
      },
      {
        question: "Can I optimize without losing any quality?",
        answer:
          "Not in the strict sense — the efficient formats are lossy, which is where the savings come from. If you need a mathematically identical result, use lossless mode on the compress page, which exports PNG; expect far more modest savings, since the only lever left is the colour palette.",
      },
      COST_FAQ,
      PRIVACY_FAQ,
    ],
    related: ["compress-image", "resize-image", "convert-image", "bulk-image-compressor"],
    options: options({
      resize: { mode: "maxWidth", width: 2400 },
      output: { format: "auto" },
    }),
  },

  "png-to-webp": {
    slug: "png-to-webp",
    icon: "convert",
    eyebrow: "PNG to WebP",
    h1: "Convert PNG to WebP",
    sub: "Turn screenshots, logos and illustrations into WebP files that are typically a third smaller — with transparency intact.",
    title: "PNG to WebP Converter — Free, Private, No Upload",
    description:
      "Convert PNG to WebP in your browser. Transparency is preserved, files are typically 25–50% smaller, and nothing is uploaded to a server.",
    keywords: [
      "png to webp",
      "convert png to webp",
      "png to webp converter",
      "webp converter",
      "png to webp transparent",
    ],
    presetChips: ["WebP output", "Quality 85", "Transparency kept"],
    intro: [
      "PNG stores every pixel exactly, which is why a screenshot stays razor sharp in it and why a photograph saved as PNG is enormous. WebP can do both jobs: it keeps the alpha channel PNG is prized for, but encodes the pixels with a modern codec. For interface screenshots, charts, flat illustrations and logos the saving is usually 25–50%. For PNGs that are really photographs it is often 80% or more.",
      "Transparency survives the conversion. WebP carries a full 8-bit alpha channel, so a logo with a soft drop shadow comes out the other side still compositing correctly over any background colour.",
      "Browser support stopped being a reason to hesitate years ago — every current browser displays WebP. The remaining reasons to keep a PNG are a tool in your pipeline that only accepts PNG, or artwork where you genuinely cannot afford any lossy encoding at all.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Set the quality if you want to",
        detail:
          "The page starts at quality 85, which is high enough that flat graphics hold their edges. Lower it for photographic PNGs where the saving matters more than the last few percent of fidelity.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "Does converting PNG to WebP keep transparency?",
        answer:
          "Yes. WebP supports a full alpha channel and ShrinkFox preserves it, so transparent and semi-transparent pixels survive exactly as they were. No background colour is applied and nothing is flattened.",
      },
      {
        question: "Is the WebP lossy or lossless?",
        answer:
          "Lossy. ShrinkFox encodes WebP through the browser's canvas encoder, which writes lossy WebP with a quality parameter; a lossless WebP encoder is not exposed to web pages. At quality 85 the difference is very hard to see even on flat graphics, but if you need a guaranteed bit-exact result, stay on PNG.",
      },
      {
        question: "How much smaller will the file be?",
        answer:
          "Screenshots and UI graphics typically drop 25–50%. PNGs containing photographs frequently drop 80–90%, because PNG was never designed for photographic data in the first place. Small, already-tiny icons sometimes barely change, and occasionally grow — the result is shown either way.",
      },
      {
        question: "Will text and hard edges look soft?",
        answer:
          "At high quality, no. The place to watch is a screenshot of small text or a graphic with large flat areas, where lossy codecs can leave faint ringing along the edges. Compare the result before committing; your original PNG is never modified.",
      },
      {
        question: "Does the EXIF or colour profile carry over?",
        answer:
          "No. The browser's canvas encoder writes no metadata into WebP, so the output is clean of EXIF, ICC profiles and anything else. Orientation is not an issue because the image is decoded upright before encoding.",
      },
      PRIVACY_FAQ,
    ],
    related: ["png-to-avif", "jpg-to-webp", "webp-to-png", "png-to-jpg", "convert-image"],
    options: options({
      output: { format: "webp" },
      compression: { mode: "quality", quality: 85 },
    }),
  },

  "png-to-avif": {
    slug: "png-to-avif",
    icon: "convert",
    eyebrow: "PNG to AVIF",
    h1: "Convert PNG to AVIF",
    sub: "The most efficient still format in wide use, with transparency intact — when your browser ships an encoder that can write it.",
    title: "PNG to AVIF Converter — Free & Fully Local",
    description:
      "Convert PNG to AVIF in your browser. AVIF keeps transparency and is usually the smallest option available. Encoder support is verified before conversion, and nothing is uploaded.",
    keywords: [
      "png to avif",
      "convert png to avif",
      "avif converter",
      "png to avif online",
      "avif transparency",
    ],
    presetChips: ["AVIF output", "Smart quality", "Transparency kept"],
    intro: [
      "AVIF is the most efficient still-image format in general use. It is derived from the AV1 video codec, and on photographic content it routinely lands 30–50% below a WebP of equivalent perceived quality. It carries an alpha channel, so transparent PNGs convert without flattening.",
      "The catch is encoding. AVIF compresses hard because it searches hard, and that search costs time — expect AVIF exports to be noticeably slower than WebP, particularly on large images. More importantly, not every browser ships an AVIF encoder even though nearly all of them ship a decoder. ShrinkFox probes for a real encoder on load and will say plainly if yours cannot write AVIF; WebP is the fallback worth taking.",
      "AVIF quality numbers are not on the same scale as JPEG's, which trips people up constantly. A quality of 58 in AVIF looks roughly comparable to a JPEG at 80. That is why this page starts in smart mode, which picks a sensible starting point per format instead of applying one number everywhere.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Confirm AVIF is available",
        detail:
          "If your browser has no AVIF encoder the conversion is reported as unsupported rather than silently returning a PNG with the wrong extension. Switch to WebP if that happens.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "Why does AVIF export sometimes fail?",
        answer:
          "Because writing AVIF and reading it are different capabilities, and browsers shipped the decoder years before the encoder. ShrinkFox verifies that an encode actually produced AVIF bytes before handing you the file — without that check a browser that cannot write AVIF silently returns PNG data inside a .avif filename.",
      },
      {
        question: "Can everyone view an AVIF file?",
        answer:
          "Almost. Every current version of Chrome, Firefox, Safari and Edge decodes AVIF. The gaps are older devices, some email clients and a good deal of desktop software. For a website that is fine with a fallback; for a file you are emailing to someone, JPEG or WebP is the safer send.",
      },
      {
        question: "Does AVIF support transparency?",
        answer:
          "Yes, with a full alpha channel, and it compresses transparent images more efficiently than WebP does. A transparent PNG logo converts cleanly with no background colour applied.",
      },
      {
        question: "Why is it so much slower than WebP?",
        answer:
          "AVIF's encoder evaluates far more possible encodings to find a smaller result. That is the same reason it produces smaller files. On a large batch the difference is substantial, so it is worth testing a couple of images before committing a folder of several hundred.",
      },
      PRIVACY_FAQ,
    ],
    related: ["png-to-webp", "jpg-to-avif", "avif-to-jpg", "optimize-image", "convert-image"],
    options: options({ output: { format: "avif" } }),
  },

  "jpg-to-webp": {
    slug: "jpg-to-webp",
    icon: "convert",
    eyebrow: "JPG to WebP",
    h1: "Convert JPG to WebP",
    sub: "Re-encode photographs into WebP and typically save a quarter to a third of the bytes at the same perceived quality.",
    title: "JPG to WebP Converter — Free Online, No Upload",
    description:
      "Convert JPG to WebP free in your browser. Photographs are typically 25–35% smaller at matching quality. No uploads, no sign-up, no limits.",
    keywords: [
      "jpg to webp",
      "jpeg to webp",
      "convert jpg to webp",
      "jpg to webp converter",
      "webp converter free",
    ],
    presetChips: ["WebP output", "Quality 85", "Second-generation safe"],
    intro: [
      "WebP's lossy mode is built on the VP8 intra-frame codec and is simply better at photographs than JPEG's 1992-vintage transform: better prediction between blocks, a smarter entropy coder, and none of the 8x8 blocking JPEG falls into at low bitrates. In practice that means 25–35% fewer bytes for an image most people cannot tell apart from the JPEG it came from.",
      "Every re-encode is generational, and that is worth being deliberate about. Your JPEG has already discarded information; encoding it again as WebP discards a little more. At quality 85 the second generation is invisible at normal viewing size, but it is a good reason to convert from the highest-quality original you still have rather than from a file that has already been through three CMS pipelines.",
      "JPEG has no alpha channel, so there is nothing to lose on the transparency side. A JPG to WebP conversion is purely a size-against-quality trade, which makes it one of the easiest format decisions on the web.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Keep the quality high",
        detail:
          "The page starts at 85 rather than the usual default, because you are re-encoding already-compressed pixels. Drop it if size matters more than the last few percent of detail.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "How much smaller is WebP than JPEG?",
        answer:
          "For typical photographs, 25–35% at matching perceived quality. Flat or graphic content can do considerably better. Images that were already compressed aggressively as JPEG have less left to give, and the honest answer in that case is sometimes only a few percent.",
      },
      {
        question: "Will the quality drop because it is already compressed?",
        answer:
          "Slightly, in principle — this is a second lossy generation. At quality 85 it is not visible at normal viewing size. Where it can show is in areas the JPEG already struggled with: sharp edges on flat colour, and heavy gradients. Compare before you replace the original.",
      },
      {
        question: "Does the EXIF data survive?",
        answer:
          "No. ShrinkFox can only re-attach metadata to JPEG output, because that is the one format the browser lets it splice a segment into. WebP output comes out with no EXIF, no GPS and no colour profile. Orientation is unaffected — the image is decoded upright, so the pixels are already the right way round.",
      },
      {
        question: "Do I still need a JPEG fallback for old browsers?",
        answer:
          "Realistically, no. Every browser released in the last several years displays WebP. If you support genuinely ancient clients, a <picture> element with a JPEG source is the standard pattern, and costs you nothing on modern browsers.",
      },
      PRIVACY_FAQ,
    ],
    related: ["jpg-to-avif", "png-to-webp", "webp-to-jpg", "compress-image", "convert-image"],
    options: options({
      output: { format: "webp" },
      compression: { mode: "quality", quality: 85 },
    }),
  },

  "jpg-to-avif": {
    slug: "jpg-to-avif",
    icon: "convert",
    eyebrow: "JPG to AVIF",
    h1: "Convert JPG to AVIF",
    sub: "The biggest saving available for photographs — frequently half the size of the JPEG, if your browser can encode it.",
    title: "JPG to AVIF Converter — Free Online, Runs Locally",
    description:
      "Convert JPG to AVIF in your browser. Photographs are often half the size of the original JPEG at matching quality. Encoder support is verified and nothing is uploaded.",
    keywords: [
      "jpg to avif",
      "jpeg to avif",
      "convert jpg to avif",
      "avif converter",
      "jpg to avif online",
    ],
    presetChips: ["AVIF output", "Smart quality", "Slower encode"],
    intro: [
      "AVIF is where the real savings are for photographic content. Against a JPEG at matching perceived quality it commonly lands 40–50% smaller, which is a far bigger step than JPEG to WebP. On large, detailed photographs the gap widens; on small images with little detail it narrows, because the format's overhead becomes a larger share of a tiny file.",
      "Two practical caveats. First, encoding is slow — AVIF earns its size by searching the encoding space hard, and on a 24-megapixel photograph that search is measured in seconds, not milliseconds. Second, a browser can decode AVIF without being able to write it. ShrinkFox checks that the encoder genuinely produced AVIF bytes and reports a failure rather than handing you a mislabelled PNG.",
      "As with any format change, this is a second lossy generation on top of the JPEG you already have. AVIF handles that better than most codecs — it is unusually good at not compounding existing artefacts — but converting from the best original you have will always beat converting from a file that has been through several pipelines.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Try a few before a batch",
        detail:
          "AVIF encoding is substantially slower than WebP. Run two or three representative images first to judge both the quality and how long a full folder will take.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "How much smaller is AVIF than JPEG?",
        answer:
          "For photographs at matching perceived quality, 40–50% is typical and more is common on large, detailed images. Small images benefit less because container overhead is proportionally larger. ShrinkFox shows the actual figure per file rather than asking you to trust an average.",
      },
      {
        question: "Why does my browser say AVIF is unsupported?",
        answer:
          "Encoding and decoding are separate. Your browser can almost certainly display AVIF; writing it is a different feature that not every browser ships. If the encoder is missing, WebP gives you most of the benefit and works everywhere.",
      },
      {
        question: "Is AVIF safe to use on a live website?",
        answer:
          "Yes, with the usual caution. Every current major browser decodes it. A <picture> element with a WebP or JPEG fallback covers older clients and costs nothing on modern ones. Email clients are the weakest link, so do not use AVIF in a newsletter.",
      },
      {
        question: "Why is the quality number so much lower than JPEG's?",
        answer:
          "The scales are not comparable between codecs. AVIF at 58 looks roughly like JPEG at 80. Setting AVIF to 85 the way you might for JPEG wastes a great deal of the format's advantage, which is why this page uses smart mode and picks a sensible value per format.",
      },
      PRIVACY_FAQ,
    ],
    related: ["jpg-to-webp", "png-to-avif", "avif-to-jpg", "optimize-image", "convert-image"],
    options: options({ output: { format: "avif" } }),
  },

  "webp-to-jpg": {
    slug: "webp-to-jpg",
    icon: "convert",
    eyebrow: "WebP to JPG",
    h1: "Convert WebP to JPG",
    sub: "For the template, the uploader or the desktop tool that still only takes JPEG. Transparency is flattened onto a colour you choose.",
    title: "WebP to JPG Converter — Free, No Upload Required",
    description:
      "Convert WebP to JPG free in your browser. High-quality JPEG output with transparency flattened onto a background colour you pick. Nothing is uploaded.",
    keywords: [
      "webp to jpg",
      "webp to jpeg",
      "convert webp to jpg",
      "webp converter",
      "open webp file",
    ],
    presetChips: ["JPEG output", "Quality 90", "White background"],
    intro: [
      "Converting WebP to JPEG makes the file bigger, not smaller — you are moving from a newer codec back to an older one. That is entirely fine when the reason is compatibility: older design software, some print workflows, plenty of marketplace uploaders and a great many internal tools still expect a .jpg and will reject anything else.",
      "JPEG has no alpha channel. If the WebP carries transparency, those pixels must be composited against something, and ShrinkFox paints them onto a background colour you choose — white by default — rather than letting them come out black, which is what an uncleared canvas would give you. The result is flagged so the change is never a surprise.",
      "Because this is a second lossy generation, the quality setting matters more than usual. This page starts at 90 rather than the usual default: you are re-encoding pixels that have already been compressed once, and a high setting keeps the conversion itself from becoming visible.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Pick the background colour",
        detail:
          "Only relevant if the WebP has transparency. Set it to match wherever the image will sit — white works for most documents, but a matching colour avoids a visible halo.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "What happens to transparency?",
        answer:
          "It is flattened onto the background colour you choose, because JPEG cannot store an alpha channel at all. If the transparency needs to survive, convert to PNG instead — ShrinkFox has a dedicated page for that.",
      },
      {
        question: "Why is the JPEG larger than the WebP?",
        answer:
          "Because JPEG is a less efficient codec. A WebP is typically 25–35% smaller than an equivalent JPEG, so reversing the conversion gives those bytes back. You are trading size for compatibility, which is the entire point of this conversion.",
      },
      {
        question: "Will the image look worse?",
        answer:
          "Marginally, since this is a second lossy encode. At quality 90 it is not visible in normal use. If you have the original photograph somewhere, converting from that rather than from the WebP will always give a cleaner result.",
      },
      {
        question: "Is JPG the same thing as JPEG?",
        answer:
          "Yes, identical. The three-letter extension is a holdover from MS-DOS filenames, which could not handle four. ShrinkFox writes .jpg because that is what most software expects to see, but the bytes are the same either way.",
      },
      PRIVACY_FAQ,
    ],
    related: ["webp-to-png", "avif-to-jpg", "png-to-jpg", "convert-image", "compress-image"],
    options: options({
      output: { format: "jpeg", background: "#FFFFFF" },
      compression: { mode: "quality", quality: 90 },
    }),
  },

  "webp-to-png": {
    slug: "webp-to-png",
    icon: "convert",
    eyebrow: "WebP to PNG",
    h1: "Convert WebP to PNG",
    sub: "A lossless destination that keeps the alpha channel — the right conversion when something downstream insists on a PNG.",
    title: "WebP to PNG Converter — Free, Lossless, Local",
    description:
      "Convert WebP to PNG in your browser. Keeps the alpha channel, writes lossless PNG, and never uploads your files to a server.",
    keywords: [
      "webp to png",
      "convert webp to png",
      "webp to png transparent",
      "webp converter",
      "lossless webp to png",
    ],
    presetChips: ["PNG output", "Lossless", "Transparency kept"],
    intro: [
      "PNG stores the decoded pixels exactly as they come out of the WebP decoder, so nothing is lost in this direction — but nothing is gained either. Expect the PNG to be several times larger than the WebP it came from, because PNG has no lossy mode to fall back on and no model of how photographs behave.",
      "Use it when a PNG is genuinely required: an application icon, a texture going into a game engine, artwork headed for a design tool that will not read WebP, or anything that needs an alpha channel in a format every piece of software on earth understands.",
      "Transparency comes through untouched, including semi-transparent pixels and soft shadows. No background colour is applied and nothing is flattened, which is the main reason to choose PNG over JPEG as the destination here.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Leave it lossless, or reduce the palette",
        detail:
          "Lossless keeps every colour. For flat graphics — logos, icons, charts — reducing the colour palette on the compress page is the only way a PNG gets meaningfully smaller.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "Does the PNG keep transparency?",
        answer:
          "Yes, completely. PNG carries a full 8-bit alpha channel, the same as WebP, so transparent and semi-transparent pixels transfer exactly. Nothing is composited onto a background.",
      },
      {
        question: "Why is the PNG so much bigger?",
        answer:
          "Because it is lossless. WebP achieved its size by discarding information that PNG now has to store faithfully — including the compression artefacts. A photographic WebP can easily become a PNG five or ten times its size. That is the format working as designed, not a fault in the conversion.",
      },
      {
        question: "Is anything lost in the conversion?",
        answer:
          "No pixel data. The WebP is decoded and those exact pixels are written into the PNG. Metadata is a different story — the canvas encoder writes none, so EXIF and colour profiles do not carry across.",
      },
      {
        question: "How do I make the PNG smaller?",
        answer:
          "Reduce the colour palette, which is PNG's only real size lever, or resize the image. For flat graphics a 64 or 128 colour palette is often indistinguishable from full colour at a fraction of the bytes. For photographs, PNG is simply the wrong container and WebP or AVIF will beat it by an order of magnitude.",
      },
      PRIVACY_FAQ,
    ],
    related: ["webp-to-jpg", "png-to-webp", "avif-to-jpg", "convert-image"],
    options: options({
      output: { format: "png" },
      compression: { mode: "lossless" },
    }),
  },

  "avif-to-jpg": {
    slug: "avif-to-jpg",
    icon: "convert",
    eyebrow: "AVIF to JPG",
    h1: "Convert AVIF to JPG",
    sub: "Open an AVIF anywhere. Converts to a universally readable JPEG at high quality, right here in the browser.",
    title: "AVIF to JPG Converter — Free Online, No Upload",
    description:
      "Convert AVIF to JPG free in your browser. High-quality JPEG output for software that cannot open AVIF yet. Transparency is flattened onto a colour you choose.",
    keywords: [
      "avif to jpg",
      "avif to jpeg",
      "convert avif to jpg",
      "open avif file",
      "avif converter",
    ],
    presetChips: ["JPEG output", "Quality 90", "White background"],
    intro: [
      "AVIF decoding is now in every current browser, which is the only reason this conversion can run locally at all. It is still missing from a great deal of desktop software, older phones, email clients and upload forms — so when something refuses to open your .avif, converting to JPEG is the quickest way through.",
      "You will give up the size advantage. An AVIF that is 180 KB may come back as a 600 KB JPEG at matching quality. That is the cost of the older codec rather than a fault in the conversion, and it is the trade you are deliberately making in exchange for a file that opens everywhere.",
      "If the AVIF carries transparency, JPEG cannot hold it. Those pixels are flattened onto your chosen background colour and the result is flagged, so a transparent image never silently becomes a white box. Convert to PNG or WebP instead when the transparency has to survive.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Set the background if there is transparency",
        detail:
          "White is the default. Choose a colour matching wherever the image will be placed if you want to avoid a visible edge around transparent areas.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "Why can my browser open AVIF when my other software cannot?",
        answer:
          "Browsers adopted AVIF early and fast; operating systems, image viewers and design tools have been slower. That mismatch is exactly why this page exists — the browser can decode the file even when nothing else on your machine will.",
      },
      {
        question: "Will the JPEG look worse than the AVIF?",
        answer:
          "At quality 90, not noticeably in normal viewing. This is a second lossy generation, so very fine detail and smooth gradients are where any difference would appear first. The file will definitely be larger, which is the more obvious cost.",
      },
      {
        question: "What happens to transparency?",
        answer:
          "It is flattened onto the background colour you pick, because JPEG has no alpha channel. ShrinkFox marks the result so you know it happened. If that is not acceptable, convert to PNG or WebP instead.",
      },
      {
        question: "Can I convert back to AVIF later?",
        answer:
          "You can, but it is a third lossy generation and the result will be worse than the AVIF you started with. Keep the original AVIF if you may need it; treat the JPEG as a compatibility copy rather than a replacement.",
      },
      PRIVACY_FAQ,
    ],
    related: ["webp-to-jpg", "png-to-jpg", "jpg-to-avif", "convert-image"],
    options: options({
      output: { format: "jpeg", background: "#FFFFFF" },
      compression: { mode: "quality", quality: 90 },
    }),
  },

  "png-to-jpg": {
    slug: "png-to-jpg",
    icon: "convert",
    eyebrow: "PNG to JPG",
    h1: "Convert PNG to JPG",
    sub: "The right move for PNGs that are really photographs. Transparency is flattened onto a background colour you choose.",
    title: "PNG to JPG Converter — Free Online, Private",
    description:
      "Convert PNG to JPG free in your browser. Photographs saved as PNG usually shrink by 80% or more. Transparency is flattened onto a colour you pick.",
    keywords: [
      "png to jpg",
      "png to jpeg",
      "convert png to jpg",
      "png to jpg converter",
      "reduce png file size",
    ],
    presetChips: ["JPEG output", "Quality 85", "White background"],
    intro: [
      "A photograph saved as PNG is probably the most wasteful thing in most image folders. PNG is lossless and has no model of how photographs look, so it stores sensor noise with exactly the same care it gives to a face. The same picture as a JPEG at quality 85 is routinely 85–95% smaller and indistinguishable at normal viewing size.",
      "The reverse is equally true and worth saying plainly: a screenshot of text, a logo or a flat illustration should usually stay a PNG. JPEG's block transform leaves visible ringing around hard edges, and on flat-colour graphics the JPEG is often not even smaller. Check what your PNG actually contains before converting it.",
      "JPEG has no transparency, so anything see-through is composited onto a background colour. White is the default; set it to match wherever the image will end up if white is not what you want, because this step cannot be undone afterwards.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Choose the background colour",
        detail:
          "Only matters if the PNG has transparent areas. Matching the destination background avoids a visible rectangle around the subject.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "When should I not convert a PNG to JPG?",
        answer:
          "When the image is a screenshot, a logo, an icon, a chart or any flat-colour graphic, and whenever the transparency matters. JPEG is built for photographic content; on hard edges it produces visible artefacts and frequently fails to save any space at all.",
      },
      {
        question: "How much smaller will the JPEG be?",
        answer:
          "For a PNG containing a photograph, typically 85–95% smaller. For a screenshot or flat graphic, often very little, and sometimes larger. The per-file figures are shown after processing so you can judge rather than assume.",
      },
      {
        question: "What happens to the transparent areas?",
        answer:
          "They are filled with the background colour you choose before encoding, because JPEG cannot store transparency. The result is flagged as flattened. If the transparency needs to survive, convert to WebP instead, which keeps it and is still far smaller than the PNG.",
      },
      {
        question: "Is quality lost permanently?",
        answer:
          "In the JPEG, yes — lossy encoding is not reversible. Your original PNG is never modified, so you keep a pristine copy either way. If you need a smaller file without a lossy step, palette reduction on the compress page is the only lossless lever PNG has.",
      },
      PRIVACY_FAQ,
    ],
    related: ["jpg-to-png", "png-to-webp", "compress-image", "convert-image"],
    options: options({
      output: { format: "jpeg", background: "#FFFFFF" },
      compression: { mode: "quality", quality: 85 },
    }),
  },

  "jpg-to-png": {
    slug: "jpg-to-png",
    icon: "convert",
    eyebrow: "JPG to PNG",
    h1: "Convert JPG to PNG",
    sub: "A lossless container for pixels that have already been compressed — useful for editing workflows and PNG-only tools.",
    title: "JPG to PNG Converter — Free, Lossless, In-Browser",
    description:
      "Convert JPG to PNG in your browser. Lossless output for editing workflows and tools that only accept PNG. Nothing is uploaded and nothing is lost.",
    keywords: [
      "jpg to png",
      "jpeg to png",
      "convert jpg to png",
      "jpg to png converter",
      "lossless png conversion",
    ],
    presetChips: ["PNG output", "Lossless", "No re-compression"],
    intro: [
      "This conversion cannot recover anything. The JPEG already threw detail away when it was created, and PNG simply stores what is left without discarding any more. Expect the PNG to be three to ten times larger than the JPEG it came from, carrying the original's compression artefacts faithfully alongside its actual content.",
      "It is still the right move in a few situations: handing an image to a tool or print workflow that only accepts PNG, keeping a working copy that will survive repeated save cycles without accumulating fresh JPEG artefacts each time, or preparing a base layer you are about to cut transparency into.",
      "If what you actually want is a smaller file rather than a lossless one, WebP or AVIF is the better destination — both will comfortably beat the JPEG you started with, where PNG cannot.",
    ],
    steps: [
      ADD_STEP,
      {
        title: "Nothing to tune",
        detail:
          "Lossless PNG keeps every colour the JPEG decoded to. If you want a smaller PNG afterwards, the compress page exposes palette reduction, which is the only lever the format has.",
      },
      DOWNLOAD_STEP,
    ],
    faqs: [
      {
        question: "Will converting to PNG improve the quality?",
        answer:
          "No, and this is the single most common misunderstanding about the conversion. PNG preserves what it is given; it cannot restore detail the JPEG discarded. You get a larger file containing exactly the same visible image, artefacts included.",
      },
      {
        question: "Why is the PNG so much bigger than the JPG?",
        answer:
          "Because PNG is lossless. The JPEG achieved its size by throwing information away, and PNG now has to store every remaining pixel exactly — including the compression artefacts, which are detail as far as a lossless codec is concerned. Three to ten times larger is normal.",
      },
      {
        question: "Does converting to PNG add transparency?",
        answer:
          "No. It gives you a format that can carry an alpha channel, but every pixel is still fully opaque. You would need to erase or mask the areas you want transparent in an image editor afterwards.",
      },
      {
        question: "Does the EXIF data carry over?",
        answer:
          "No. PNG output written through the browser's canvas encoder carries no metadata at all. Orientation is already applied during decode, so the image is the right way up regardless.",
      },
      PRIVACY_FAQ,
    ],
    related: ["png-to-jpg", "jpg-to-webp", "convert-image", "compress-image"],
    options: options({
      output: { format: "png" },
      compression: { mode: "lossless" },
    }),
  },

  "compress-image-to-100kb": targetSizeTool(100, {
    why: "100 KB is the limit that government and examination portals reach for most often. Public-sector application forms in India and many other countries cap photograph and signature uploads at exactly 100 KB and reject anything larger without explaining why. It is also a common ceiling for email signature graphics and for avatars on older forum software.",
    feasibility:
      "100 KB is a tight budget. A 1000-pixel portrait fits comfortably; a full-resolution landscape photograph does not, and will need its dimensions reduced to get there. If a form also specifies dimensions, set those on the resize controls first and let the target search work within them.",
    related: [
      "compress-image-to-200kb",
      "compress-image-to-500kb",
      "compress-image",
      "resize-image",
    ],
  }),

  "compress-image-to-200kb": targetSizeTool(200, {
    why: "200 KB is the common middle setting: job portals, visa and university application forms, and most content management systems that want to keep page weight under control. It is enough for a sharp 1200-pixel photograph at a quality that still looks professional, which 100 KB frequently is not.",
    feasibility:
      "200 KB is a reasonable budget for most single photographs at web dimensions. A full-resolution camera export will still need downscaling; a photo that has already been resized to around 1500 pixels usually fits on quality alone, which means no dimensions are sacrificed.",
    related: [
      "compress-image-to-100kb",
      "compress-image-to-500kb",
      "compress-image",
      "optimize-image",
    ],
  }),

  "compress-image-to-500kb": targetSizeTool(500, {
    why: "500 KB is where marketplaces and property portals tend to land — eBay, Etsy, Amazon Seller Central and most real-estate listing sites allow somewhere between 500 KB and 1 MB per image. It is also a sensible self-imposed budget for a full-width hero on a content site, where going much above it starts to show in Largest Contentful Paint.",
    feasibility:
      "500 KB is generous enough that most images reach it on quality alone, with their dimensions untouched. Very large camera exports and highly detailed photographs are the exceptions. If a listing site also caps the dimensions, set those first so the search works inside the right pixel budget.",
    related: [
      "compress-image-to-200kb",
      "compress-image-to-100kb",
      "bulk-image-compressor",
      "optimize-image",
    ],
  }),

  "bulk-image-compressor": {
    slug: "bulk-image-compressor",
    icon: "layers",
    eyebrow: "Bulk",
    h1: "Bulk image compressor",
    sub: "Drop a whole folder. One set of settings, every file processed in parallel on your own machine, and a single ZIP at the end.",
    title: "Bulk Image Compressor — Compress Hundreds at Once, Free",
    description:
      "Compress hundreds of images at once in your browser. Shared settings, parallel processing, per-file results and one ZIP download. No upload, no batch limit, no account.",
    keywords: [
      "bulk image compressor",
      "batch image compression",
      "compress multiple images",
      "mass image optimizer",
      "compress folder of images",
    ],
    presetChips: ["Smart quality", "Shared settings", "ZIP download"],
    intro: [
      "Batch tools online usually mean one of three things: a hard cap on how many files you may process at once, a watermark, or a queue because somebody else's server is busy. None of those apply here, because the work happens on your machine. The limit is your own memory and patience.",
      "Processing runs across a pool of Web Workers sized to your CPU, so a folder of photographs uses the cores you actually have instead of blocking the page. Each image reports its own progress, its original and final size and a preview, and a failure on one file never stops the rest of the batch.",
      "Settings are shared across the batch by default, which is the entire point — consistent output across a catalogue, a gallery or an export folder. Any individual file can still be given its own options when one image in the set needs different treatment.",
      "ShrinkFox releases each decoded bitmap as soon as it has been encoded, which is what stops a long run from climbing into gigabytes of retained memory. Even so, phones and tablets are happier in batches of a hundred or so; desktop browsers handle several hundred ordinary photographs comfortably.",
    ],
    steps: [
      {
        title: "Add a folder or a selection",
        detail:
          "Use Select folder to sweep up an entire directory tree, or drag a multi-file selection in. Non-image files are filtered out rather than failing one by one.",
      },
      {
        title: "Set the options once",
        detail:
          "Choose smart, quality, lossless or a target size, plus any resize rule and output format. Everything in the batch inherits it unless you override a specific file.",
      },
      {
        title: "Run it, then download the ZIP",
        detail:
          "Watch per-file progress and a running total of bytes saved. Download individual results, or take the whole batch as one archive.",
      },
    ],
    faqs: [
      {
        question: "How many images can I compress at once?",
        answer:
          "There is no imposed limit. In practice a desktop browser handles several hundred ordinary photographs in one run, while phones and tablets do better with batches around a hundred. If a run starts to struggle, splitting it in half costs nothing since there is no upload to repeat.",
      },
      {
        question: "Can I download everything as one file?",
        answer:
          "Yes. The whole batch zips into a single archive, built in the browser from the results already in memory. Individual files can still be downloaded one at a time if you only want some of them.",
      },
      {
        question: "What happens if one image fails?",
        answer:
          "Only that image fails. It is marked with the reason — an unsupported format, a dimension limit, a missing encoder — and the rest of the queue carries on. You can retry just the failures afterwards rather than re-running everything.",
      },
      {
        question: "Do the settings apply to every image?",
        answer:
          "By default, yes, which is what gives you consistent output. Individual files can be given their own options when one image needs different handling, and those overrides survive a re-run of the batch.",
      },
      COST_FAQ,
      PRIVACY_FAQ,
    ],
    related: ["bulk-image-resizer", "compress-image", "optimize-image", "convert-image"],
    options: options(),
  },

  "bulk-image-resizer": {
    slug: "bulk-image-resizer",
    icon: "layers",
    eyebrow: "Bulk",
    h1: "Bulk image resizer",
    sub: "Give a whole folder the same maximum width — or exactly the same dimensions — in a single pass, locally.",
    title: "Bulk Image Resizer — Resize Hundreds at Once, Free",
    description:
      "Resize hundreds of images to the same width, height or box in your browser. Keeps proportions, skips upscaling, downloads as one ZIP. Free and fully local.",
    keywords: [
      "bulk image resizer",
      "batch resize images",
      "resize multiple images",
      "resize folder of images",
      "mass image resizer",
    ],
    presetChips: ["Max width 1600 px", "Aspect ratio locked", "ZIP download"],
    intro: [
      "Catalogues, portfolios and product grids look wrong when the images are inconsistent sizes. The fix is one rule applied to everything: a maximum width for content images, or a fixed box with centre-cropping when the grid demands identical dimensions from portrait and landscape sources alike.",
      "Max width is the safe default and the one this page starts with. Every image is reduced until its widest edge fits, proportions are preserved, and anything already smaller is left alone — upscaling is off, so a small image in the folder does not come back blurry and heavier than it started.",
      "When every output must be the same shape, use fill: it scales to cover the box and centre-crops the overflow. Fit does the opposite, scaling to sit inside the box so nothing is cropped but the final dimensions vary per image. Both run across the batch with the same settings.",
      "Resizing and compressing in one pass is almost always what you want. The dimension cap removes pixels nobody sees and the encoder then works on a smaller canvas, so the two savings compound rather than competing.",
    ],
    steps: [
      {
        title: "Add a folder or a selection",
        detail:
          "Select folder sweeps an entire directory tree. Mixed orientations and sizes are fine — the rule you set applies to all of them consistently.",
      },
      {
        title: "Choose one rule for the batch",
        detail:
          "Max width for web content, fill for a uniform grid, fit when nothing may be cropped, or percentage to scale everything down proportionally.",
      },
      {
        title: "Run it, then download the ZIP",
        detail:
          "Each file shows its old and new dimensions alongside the size saved. Take the whole batch as a single archive when it finishes.",
      },
    ],
    faqs: [
      {
        question: "Can I make every image exactly the same dimensions?",
        answer:
          "Yes, with fill mode and a width and height. It scales each image to cover the box and centre-crops whatever overhangs, so a folder of mixed portrait and landscape photographs comes out as a uniform grid.",
      },
      {
        question: "What happens to images that are already smaller?",
        answer:
          "They are left at their original size. Upscaling is disabled by default because enlarging cannot add detail — it only softens the image and makes the file bigger. You can enable it if a layout genuinely requires a larger canvas.",
      },
      {
        question: "Will the aspect ratios be preserved?",
        answer:
          "In every mode except exact with the ratio lock switched off. Max width, fit and percentage all preserve proportions exactly. Fill preserves them too and crops the excess rather than stretching anything.",
      },
      {
        question: "Can I resize and compress in the same run?",
        answer:
          "Yes, and you should. Resize settings and compression settings apply together in one pass, so the encoder works on the already-reduced canvas. That is meaningfully more efficient than running two separate passes.",
      },
      COST_FAQ,
      PRIVACY_FAQ,
    ],
    related: ["bulk-image-compressor", "resize-image", "compress-image", "optimize-image"],
    options: options({ resize: { mode: "maxWidth", width: 1600 } }),
  },
};

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

export function getTool(slug: ToolSlug): ToolPageDefinition {
  return TOOLS[slug];
}

export function toolPath(slug: ToolSlug): string {
  return `/${slug}`;
}

export function toolUrl(slug: ToolSlug): string {
  return new URL(toolPath(slug), SITE.url).href;
}

export function toolMetadata(slug: ToolSlug): Metadata {
  const tool = TOOLS[slug];
  return {
    ...createPageMetadata({
      title: tool.title,
      description: tool.description,
      path: toolPath(slug),
      keywords: tool.keywords,
    }),
    // Always declared, unlike the site-wide helper, which omits it off a public
    // origin. A self-referencing canonical is what collapses the /compress-image
    // and /compress-image?utm_source=... duplicates these pages attract.
    alternates: { canonical: toolUrl(slug) },
  };
}

/* -------------------------------------------------------------------------- */
/* Structured data                                                             */
/* -------------------------------------------------------------------------- */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonLdDocument = { [key: string]: JsonValue };

/**
 * SoftwareApplication plus FAQPage in one graph.
 *
 * Both describe the same page, so they are emitted as a single @graph with
 * explicit @id values rather than two loose scripts — that is what lets a
 * consumer tell it is one application with one FAQ, not two unrelated entities.
 */
export function toolJsonLd(slug: ToolSlug): JsonLdDocument {
  const tool = TOOLS[slug];
  const url = toolUrl(slug);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#app`,
        name: `${SITE.name} — ${tool.h1}`,
        url,
        applicationCategory: "MultimediaApplication",
        applicationSubCategory: "Image Editor",
        operatingSystem: "Any (runs in a web browser)",
        browserRequirements: "Requires a modern browser with JavaScript enabled",
        description: tool.description,
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
        featureList: [
          "Runs entirely on your device — no image is uploaded",
          "No account, no credits and no watermark",
          "Batch processing with a single ZIP download",
          "JPEG, PNG, WebP and AVIF input and output",
        ],
        permissions: "No network access to image data",
        publisher: {
          "@type": "Organization",
          name: SITE.name,
          url: SITE.url,
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: tool.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}
