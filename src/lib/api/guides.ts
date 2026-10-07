export interface ImageGuide {
  slug: string;
  title: string;
  description: string;
  sections: { heading: string; paragraphs: string[] }[];
  tools: { href: string; label: string }[];
}
const guides: ImageGuide[] = [
  {
    slug: "choose-image-format",
    title: "JPEG, PNG or WebP: which should you choose?",
    description:
      "Choose a format that fits your photo, transparency and file-size needs. Learn when JPEG, PNG and WebP make sense and how to check your export.",
    sections: [
      {
        heading: "For everyday photos, start with JPEG",
        paragraphs: [
          "A photograph usually contains thousands of colours and gradual changes in light. JPEG can keep it useful at a much smaller size than a lossless PNG. Start with moderate quality, then check faces, text and fine textures at the size your audience will see.",
          "JPEG cannot keep transparent areas. Choose a background colour before exporting a cutout or logo. Keep your original: saving a JPEG repeatedly can lose more detail each time.",
        ],
      },
      {
        heading: "For transparency, use PNG or WebP",
        paragraphs: [
          "PNG is a dependable choice for a cutout, screenshot or graphic that needs transparency. Lossless PNG keeps pixel values after resizing, but may be large for a photograph. Palette reduction changes colours; inspect gradients and edges if you use it.",
          "WebP combines smaller files with transparency. It is useful for website images when your publishing platform accepts it. Compare the downloaded file against your source rather than assuming a newer format always looks better.",
        ],
      },
      {
        heading: "Check where the image will be used",
        paragraphs: [
          "An upload form may accept only JPEG or PNG, even when your browser opens other formats. Follow its format and dimension requirements first. ShrinkFox detects the formats your browser can write. The optional advanced encoder supplies MozJPEG and libwebp for JPEG and WebP; it does not add every format.",
        ],
      },
    ],
    tools: [
      { href: "/convert-image", label: "Convert an image" },
      { href: "/formats", label: "Check supported formats" },
    ],
  },
  {
    slug: "meet-upload-size-limit",
    title: "Make a photo fit an upload limit",
    description:
      "Reduce a photo for a form, email or website without guessing. Check the size limit, choose suitable dimensions and inspect the finished file.",
    sections: [
      {
        heading: "Read the limit before editing",
        paragraphs: [
          "Look for allowed file types, maximum file size and required dimensions. A 100 KB limit is different from a 100-pixel width limit. ShrinkFox's shortcuts use decimal bytes: 100 KB is 100,000 bytes. If a form specifies KiB or an exact byte value, enter that target instead.",
        ],
      },
      {
        heading: "Resize an unnecessarily large photo first",
        paragraphs: [
          "A camera photo may be several thousand pixels wide when a form needs a small profile picture. Cropping to the subject and reducing dimensions often saves more space than repeatedly lowering quality. Use Fill for a required shape, and check it has not cut off anything important.",
        ],
      },
      {
        heading: "Aim for the size, then inspect the result",
        paragraphs: [
          "The target-size tool tries different quality levels. It can reduce dimensions if you allow that option. Some images cannot reach a very small target without a visible change. Check the reported result rather than treating the requested size as a guarantee.",
          "Open the download before submitting it. Text should remain readable, faces should look natural and the actual size should fit the form. If it is still too large, reduce dimensions a little more or crop away unused space.",
        ],
      },
    ],
    tools: [
      { href: "/compress-image-to-100kb", label: "Try a 100 KB target" },
      { href: "/compress-image-to-200kb", label: "Try a 200 KB target" },
      { href: "/crop-image", label: "Crop your photo" },
    ],
  },
  {
    slug: "prepare-product-photos",
    title: "Prepare consistent product photos for your shop",
    description:
      "Clean up a product background, keep useful detail and export consistent sizes for thumbnails, product pages and website cards.",
    sections: [
      {
        heading: "Start with a useful original",
        paragraphs: [
          "A clear, evenly lit photo is easier to edit than a dark or heavily blurred one. Leave space around the product so you can crop it into several shapes. Keep the original separately and edit a copy.",
        ],
      },
      {
        heading: "Remove the background and check the edges",
        paragraphs: [
          "BiRefNet AI can separate many products from busy backgrounds. A plain backdrop can also work with Simple background without a model download. Examine handles, straps, reflections and transparent materials: automatic tools can remove parts you meant to keep.",
          "Use Restore to bring back missing regions and Erase to clean up leftovers. A softer brush helps with transitions; use a smaller brush around fine details. Undo backs out a stroke. Apply edits before downloading so the saved PNG uses your corrections.",
        ],
      },
      {
        heading: "Choose repeatable backgrounds and sizes",
        paragraphs: [
          "A solid colour keeps a catalogue consistent. A gradient or uploaded scene can work for a feature image, but check it suits the product lighting. A transparent PNG gives a designer more flexibility later.",
          "Export recipes let you edit several named variants and download them together. Fit keeps the whole photo; Fill crops the centre. A source that is too small stays small instead of being enlarged automatically. The report lists actual dimensions and any failed exports.",
        ],
      },
    ],
    tools: [
      { href: "/remove-background", label: "Remove a product background" },
      { href: "/export-recipes", label: "Make product variants" },
      { href: "/bulk-image-compressor", label: "Compress a collection" },
    ],
  },
  {
    slug: "keep-transparent-background",
    title: "Keep a transparent background when you download",
    description:
      "Understand the checkerboard preview, choose a format that keeps alpha and avoid unexpected backgrounds in your cutouts.",
    sections: [
      {
        heading: "The checkerboard is a preview aid",
        paragraphs: [
          "The squares behind a cutout show where it is transparent. They are not part of the exported PNG. An image viewer may display transparent areas against white, black or another colour; that alone does not mean transparency has been lost.",
        ],
      },
      {
        heading: "Export PNG for the background remover",
        paragraphs: [
          "Leave Background set to Transparent PNG in the cutout editor if you need the subject on its own. A solid, gradient or uploaded background is intentionally included in the applied result.",
          "Converting to JPEG replaces transparency with your selected matte colour. JPEG does not support alpha. Choose PNG or a supported WebP export when transparency needs to remain editable.",
        ],
      },
      {
        heading: "Inspect edges against contrasting colours",
        paragraphs: [
          "A pale fringe can be invisible on white and obvious on a dark backdrop. Try a contrasting solid colour, correct the mask, then switch back to Transparent PNG if that is your intended export. Transparent glass and fine fibres may still need careful manual work.",
        ],
      },
    ],
    tools: [
      { href: "/remove-background", label: "Edit a cutout" },
      { href: "/convert-image", label: "Choose an export format" },
    ],
  },
];
export function getGuides(): ImageGuide[] {
  return guides;
}
export function getGuide(slug: string): ImageGuide | undefined {
  return guides.find((guide) => guide.slug === slug);
}
