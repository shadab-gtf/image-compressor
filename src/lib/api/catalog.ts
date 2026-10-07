import { DEFAULT_OPTIONS, type ProcessingOptions } from "@/types/options";
import type {
  SiteCatalog,
  ToolDefinition,
  ToolNavigationGroup,
} from "@/types/catalog";

function options(
  overrides: {
    compression?: Partial<ProcessingOptions["compression"]>;
    resize?: Partial<ProcessingOptions["resize"]>;
    output?: Partial<ProcessingOptions["output"]>;
  } = {},
): ProcessingOptions {
  return {
    compression: { ...DEFAULT_OPTIONS.compression, ...overrides.compression },
    resize: { ...DEFAULT_OPTIONS.resize, ...overrides.resize },
    output: { ...DEFAULT_OPTIONS.output, ...overrides.output },
  };
}
const tools: ToolDefinition[] = [
  {
    slug: "export-recipes", name: "Export recipes", seoTitle: "Free Multi-Size Image Export",
    title: "One photo. Every size you need.", description: "Prepare a product listing, website card and social post together. Edit the sizes, names and formats, then download your variants in one ZIP. Your photo stays on your device.",
    shortDescription: "Create named image variants in one ZIP.", icon: "layers",
    steps: ["Choose a photo and a starting recipe.", "Edit each variant's name, size, format and quality.", "Download a ZIP with your images and an export report."],
    note: "Recipes keep small images at their original resolution. Fit preserves the whole photo; Fill crops the centre. A skipped variant is listed in the report. Up to 20 variants and 128 MiB of output per photo.",
  },
  {
    slug: "crop-image", name: "Crop & rotate", seoTitle: "Free Image Cropper and Rotator",
    title: "Crop your photo to the part that matters.", description: "Frame a product, straighten a photo or crop a portrait for your next post. Drag the corners, choose a familiar aspect ratio and save a PNG, all on your device.",
    shortDescription: "Crop, rotate and straighten with a live selection.", icon: "resize", mode: "crop-image",
    steps: ["Choose a photo from your device.", "Drag the crop handles, choose a ratio and adjust rotation.", "Apply your crop, check the result and download PNG."],
    note: "Straightening can leave transparent corners. The crop uses your original image pixels; it does not invent detail or enlarge a small selection.",
  },
  {
    slug: "compress-image",
    name: "Compress image",
    seoTitle: "Free Image Compressor",
    title: "Compress images for everyday sharing.",
    description:
      "Reduce the size of photos, screenshots and graphics for a website, email or upload form. Choose automatic compression, set the quality yourself or aim for a file-size limit.",
    shortDescription: "Reduce file size with control over quality.",
    icon: "compress",
    featured: true,
    options: options(),
    steps: [
      "Choose the photos or graphics you want to make smaller.",
      "Use automatic compression, adjust quality or set a target file size.",
      "Compare the image and file size, then download the version you want.",
    ],
    note: "An already compressed image may not get smaller. Lossless mode exports PNG, which can be larger than a JPEG. Keep your original until you have checked the result.",
  },
  {
    slug: "remove-background",
    name: "Remove background",
    seoTitle: "Free Background Remover",
    title: "Remove photo backgrounds for free.",
    description:
      "Create a transparent PNG for a product listing, profile or design. BiRefNet AI handles people and general subjects on your device; Portrait AI and Simple background offer lighter alternatives.",
    shortDescription: "Cut out people, products and general subjects.",
    icon: "cutout",
    featured: true,
    badge: "On-device AI",
    mode: "remove-background",
    steps: [
      "Choose the person, product or object you want to cut out.",
      "Pick BiRefNet AI, Portrait AI or Simple background for your photo.",
      "Check the edges with the comparison slider, then save a transparent PNG.",
    ],
    note: "BiRefNet Lite downloads about 192 MB of model data on first use and needs more device memory. Portrait AI uses a smaller model for people. Check fine hair, glass and busy scenes before saving. Downloads have no watermark.",
  },
  {
    slug: "resize-image",
    name: "Resize image",
    seoTitle: "Free Image Resizer",
    title: "Resize images to fit your next project.",
    description:
      "Set a width, height or percentage for a website, product listing or post. Keep the whole photo in proportion, or crop it to fill the dimensions you need.",
    shortDescription: "Set dimensions for websites, products and posts.",
    icon: "resize",
    featured: true,
    options: options({ resize: { mode: "maxWidth", width: 1600 } }),
    steps: [
      "Choose your image and check the dimensions your project needs.",
      "Enter a width, height or percentage. Use a box size to fit or crop the photo.",
      "Review the crop and final dimensions, then download the resized image.",
    ],
    note: "Images stay at or below their original size unless you enable upscaling. Enlarging an image adds pixels, but does not recover missing detail.",
  },
  {
    slug: "convert-image",
    name: "Convert image",
    seoTitle: "Free Image Converter",
    title: "Convert images to the format you need.",
    description:
      "Change an image to JPEG, PNG or WebP without uploading it. Choose a format that suits the job: a photo to share, a transparent graphic or an image for your website.",
    shortDescription: "Switch between JPG, PNG and WebP.",
    icon: "convert",
    featured: true,
    options: options({ output: { format: "auto" } }),
    steps: [
      "Add the image or batch you want to convert.",
      "Choose an available output format and adjust quality if needed.",
      "Check the result, including transparent areas, and download your files.",
    ],
    note: "Available formats depend on your browser. Animated images export as a still frame, and JPEG does not keep transparency. See the format guide for details.",
  },
  {
    slug: "enhance-image",
    name: "Enhance image",
    seoTitle: "Free Image Enhancer",
    title: "Give small photos a clearer, larger finish.",
    description:
      "Use free AI enhancement to improve soft, low-resolution photos and enlarge them by 2×, 3× or 4×. Fine-tune color and sharpness, compare the original and save a PNG. Your photo stays on your device; strong blur and missing detail may not be recoverable.",
    shortDescription: "Improve small photos with AI and 2×–4× upscaling.",
    icon: "enhance",
    featured: true,
    badge: "Free",
    mode: "enhance-image",
    steps: [
      "Choose a small photo to improve, or use Quick adjustments for a larger image.",
      "Choose AI or Quick adjustments, set the output scale and apply your changes.",
      "Compare the result with the original and download the finished PNG.",
    ],
    note: "Real-ESRGAN runs on your device and predicts detail rather than recovering the exact original. Check faces, text and fine textures. AI accepts up to 1 MP input; Quick adjustments handles larger photos. No credits, signup or watermark.",
  },
  {
    slug: "bulk-image-compressor",
    name: "Batch process",
    seoTitle: "Free Batch Image Compressor",
    title: "Compress, resize and convert images in bulk.",
    description:
      "Prepare a folder of photos with one set of quality, size and format settings. Review each result, then download individual files or collect the batch in a ZIP.",
    shortDescription: "Apply shared settings and download a ZIP.",
    icon: "layers",
    featured: true,
    options: options(),
    steps: [
      "Add several images or choose a folder from your device.",
      "Set quality, resizing and output format once for the batch.",
      "Review the completed files and download them individually or as a ZIP.",
    ],
    note: "There are no paid credits or daily quotas. Batch size depends on your device's available memory, so smaller batches work best on mobile.",
  },
  {
    slug: "bulk-image-resizer",
    name: "Bulk image resizer",
    seoTitle: "Free Batch Image Resizer",
    title: "Resize a batch of images in one go.",
    description:
      "Prepare a collection of product photos, blog images or portfolio work without resizing each file separately. Use one maximum width or crop the batch to a matching set of dimensions.",
    shortDescription: "Resize a collection with the same settings.",
    icon: "resize",
    options: options({ resize: { mode: "maxWidth", width: 1600 } }),
    steps: [
      "Add the photos you want to resize together.",
      "Set a maximum width to keep proportions, or choose a box to crop every photo.",
      "Check the resulting dimensions and download the resized batch as a ZIP.",
    ],
    note: "Maximum-width resizing keeps each image's proportions. Choose Fill box when you want to crop different photos to the same dimensions.",
  },
  ...([
    {
      kb: 100,
      useCase: "Make room for a photo in an upload form with a strict 100 KB limit.",
      advice: "A 100 KB limit can soften fine detail or small text. Check any minimum image dimensions required by the site you are uploading to.",
    },
    {
      kb: 200,
      useCase: "Trim a photo for a form or attachment that needs an image under 200 KB.",
      advice: "Check that faces, text and other important details still look clear. Keep more pixels if the receiving site has minimum dimension requirements.",
    },
    {
      kb: 500,
      useCase: "Prepare a photo for a product listing, shared file or upload with a 500 KB cap.",
      advice: "Try keeping the original dimensions first. Large camera photos may still need resizing to reach 500 KB at a useful quality setting.",
    },
  ] as const).map(
    ({ kb, useCase, advice }): ToolDefinition => ({
      slug: `compress-image-to-${kb}kb`,
      name: `Compress to ${kb} KB`,
      seoTitle: `Compress Image to ${kb} KB for Free`,
      title: `Compress an image to ${kb} KB.`,
      description: `${useCase} ShrinkFox adjusts JPEG quality and can reduce dimensions to work toward your target.`,
      shortDescription: `Work toward a ${kb} KB upload limit.`,
      icon: "compress",
      options: options({
        compression: {
          mode: "targetSize",
          targetBytes: kb * 1000,
          targetTolerance: 0,
        },
        output: { format: "jpeg" },
      }),
      steps: [
        `Choose the image you need to bring under ${kb} KB.`,
        `Keep the ${kb} KB target and decide whether to allow smaller dimensions.`,
        "Check the reported file size and image quality, then download your JPEG.",
      ],
      note: `${advice} The target is not guaranteed. JPEG replaces transparent areas with your chosen background color.`,
    }),
  ),
  ...(
    [
      {
        slug: "png-to-webp",
        name: "PNG to WebP",
        format: "webp",
        title: "Convert PNG to WebP for your website.",
        description:
          "Make a WebP version of a PNG graphic, screenshot or product image. Transparent areas are supported, and you can adjust quality to balance detail and file size.",
        shortDescription: "Create WebP images with transparent backgrounds.",
        steps: [
          "Choose one or more PNG images from your device.",
          "Keep WebP as the output and choose a quality setting for your image.",
          "Check text, edges and transparency before downloading the WebP files.",
        ],
        note: "WebP export needs browser support. Quality-based conversion can change image detail, and some PNG files are already smaller. Compare the result and keep the original for future edits.",
      },
      {
        slug: "jpg-to-webp",
        name: "JPG to WebP",
        format: "webp",
        title: "Convert JPG photos to WebP.",
        description:
          "Prepare WebP photos for a blog, portfolio or online shop. Convert a single JPG or a batch, then compare file sizes and visible detail before using the new images.",
        shortDescription: "Prepare WebP photos for blogs and websites.",
        steps: [
          "Add the JPG or JPEG photos you want to convert.",
          "Choose WebP quality and resize any photos that are larger than you need.",
          "Review detail and file size, then download your WebP photos or a ZIP.",
        ],
        note: "WebP export needs browser support. Converting a JPEG cannot restore detail lost in earlier compression, and a smaller output is not guaranteed.",
      },
      {
        slug: "webp-to-jpg",
        name: "WebP to JPG",
        format: "jpeg",
        title: "Convert WebP to JPG for easy sharing.",
        description:
          "Need a JPEG for an app, form or editor that will not accept WebP? Convert it in your browser and choose a background color for any transparent areas.",
        shortDescription: "Make a JPG for apps that do not accept WebP.",
        steps: [
          "Choose the WebP image or batch you need as JPEG files.",
          "Set JPEG quality and choose a color to replace any transparent areas.",
          "Check the background and image detail, then download the JPG files.",
        ],
        note: "JPEG cannot keep transparency, and an animated WebP becomes a still image. The converted file may be larger than the original WebP.",
      },
    ] as const
  ).map(
    (item): ToolDefinition => ({
      slug: item.slug,
      name: item.name,
      seoTitle: `Free ${item.name} Converter`,
      title: item.title,
      description: item.description,
      shortDescription: item.shortDescription,
      icon: "convert",
      options: options({
        output: { format: item.format },
        compression: { mode: "quality", quality: 85 },
      }),
      steps: item.steps,
      note: item.note,
    }),
  ),
];
// Static navigation is derived from the catalog; rendering a header performs no fetching.
function navigationCategory(tool: ToolDefinition): string {
  if (tool.slug.startsWith("compress-image-to-")) return "target-size";
  if (tool.mode || tool.slug.startsWith("bulk-")) return "studio-batch";
  if (tool.icon === "convert" && tool.slug !== "convert-image")
    return "quick-convert";
  return "essentials";
}

export const TOOL_NAVIGATION_GROUPS: readonly ToolNavigationGroup[] = [
  { id: "essentials", label: "Everyday essentials" },
  { id: "studio-batch", label: "Create & batch" },
  { id: "target-size", label: "Compress to a size" },
  { id: "quick-convert", label: "Quick conversions" },
].map((group) => ({
  ...group,
  tools: tools
    .filter((tool) => navigationCategory(tool) === group.id)
    .map((tool) => ({
      href: `/${tool.slug}`,
      label: tool.name,
      description: tool.shortDescription,
      icon: tool.icon,
    })),
}));

const catalog: SiteCatalog = {
  tools,
  faqs: [
    {
      question: "Is ShrinkFox free to use?",
      answer:
        "Yes. There is no signup, no watermark on your downloads and no credit card required. The tools run on your device without subscriptions, paid credits or daily quotas. File-size limits and your device's memory still apply.",
    },
    {
      question: "Are my images uploaded anywhere?",
      answer:
        "No. Your images are processed in your browser and are not sent to a server. Your browser downloads the website and the model files for any AI tool you choose. Save the files you want to keep before refreshing or closing the workspace.",
    },
    {
      question: "Which image formats can I use?",
      answer:
        "You can work with JPEG, PNG, WebP, AVIF, GIF and BMP when your browser can read them. A local adapter reads single-page, uncompressed 8-bit RGB or grayscale TIFF without an ICC profile. Compression and conversion export JPEG, PNG, WebP, or supported AVIF; editing tools save PNG. Animation becomes a still image. Other TIFF variants, HEIC, RAW, PDF, SVG and JPEG XL are not supported.",
    },
    {
      question: "How does free background removal work?",
      answer:
        "BiRefNet AI works with people, products and general subjects. Portrait AI is a smaller model for people. Both download their model on first use, then run on your device. Simple background removes similar colors connected to the image edges without an AI model. Compare the result before saving; difficult edges can need extra cleanup.",
    },
    {
      question: "Can I use it offline?",
      answer:
        "Open the tool you need while you are online so the app can save its files for later. AI tools also need their first model download. You can then use cached tools offline, although a cleared browser cache, an update or private browsing may require another connection.",
    },
    {
      question: "Will compression change image quality?",
      answer:
        "It depends on the settings. JPEG and WebP compression can remove some detail to reduce file size. Lossless mode exports PNG without compression artifacts, though resizing still changes the image. Check the result at the size you plan to use it, especially around text and fine detail, and keep your original.",
    },
    {
      question: "Can I compress an image to 100 KB, 200 KB or 500 KB?",
      answer:
        "You can choose any of those targets or enter your own file-size limit. ShrinkFox tries different quality settings and can reduce dimensions if you allow it. Some images will not reach the target without a visible change, so check the reported file size and quality before downloading.",
    },
    {
      question: "Can I resize or compress several images at once?",
      answer:
        "Yes. Add multiple files or a folder to the batch workspace, choose shared settings, and process them together. Download individual results or a ZIP of the batch. Smaller batches help when working with large photos or a phone with limited memory.",
    },
  ],
  formats: [
    {
      name: "JPEG / JPG",
      input: "Yes",
      output: "Yes",
      note: "Useful for photos. Transparent areas need a background color.",
    },
    {
      name: "PNG",
      input: "Yes",
      output: "Yes",
      note: "Supports transparency and lossless output. Reducing palette colors changes image detail.",
    },
    {
      name: "WebP",
      input: "Browser dependent",
      output: "Browser dependent",
      note: "Efficient photos and transparency. Animated input becomes a still frame.",
    },
    {
      name: "AVIF",
      input: "Browser dependent",
      output: "Only if detected",
      note: "Many browsers can open AVIF images, but fewer can create them.",
    },
    {
      name: "GIF / APNG",
      input: "Still frame only",
      output: "No animation",
      note: "Only a still frame is processed. Animated exports are not available.",
    },
    {
      name: "BMP",
      input: "Browser dependent",
      output: "No",
      note: "Convert still images when your browser can decode them.",
    },
    {
      name: "TIFF / TIF",
      input: "Limited adapter",
      output: "No",
      note: "Single-page, uncompressed 8-bit RGB/grayscale, chunky strips, orientations 1–8 and associated/unassociated alpha. No ICC profiles, compressed/tiled TIFF, CMYK, high bit depth or BigTIFF. Convert those in a colour-managed desktop editor first.",
    },
    {
      name: "HEIC / RAW / SVG / PDF / JXL",
      input: "Not supported",
      output: "Not supported",
      note: "Save a PNG or JPEG in a compatible app first, then bring that file here.",
    },
  ],
};
// Local content does not need a network round trip. Future content providers belong here.
export function getCatalog(): SiteCatalog {
  return catalog;
}
export function getTool(slug: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.slug === slug);
}
