# ShrinkFox product and growth roadmap

Updated 7 October 2026. The implementation status below separates available features from future expansion and release checks. This is not a promise of market leadership.

## Implementation status

Enhancement update: Full-image deblur + enhancement is now the default: NAFNet processes the whole frame, followed by Real-ESRGAN detail enhancement. Optional RestoreFormer++ face repair runs afterward. PaddleOCR.js with reviewed text reconstruction, fast screenshot processing and restoration strength controls are also available. Neural restoration supports WebGPU and WASM CPU execution. A separate 7,680-pixel long-edge JPEG export enlarges the processed result; it does not guarantee recovered 8K detail. Dedicated defocus evaluation and physical-device benchmarks remain future work. See [IMAGE-ENHANCEMENT.md](IMAGE-ENHANCEMENT.md).

| Order | Implemented in this release | Remaining validation or expansion |
| --- | --- | --- |
| 1 | Erase/restore mask editor, reversible stroke history, undo/redo, brush size, opacity/hardness, pen pressure, pointer capture, zoom and pan | Physical pen/tablet and Android/iPhone checks; broader hair/glass quality fixtures |
| 2 | Transparent, solid, gradient and uploaded-image backgrounds; shared preview/export compositing; original-resolution PNG | Additional difficult-edge evaluations; background lighting and colour decontamination are future work |
| 3 | `/crop-image`: draggable corners and selection, common aspect ratios, keyboard arrows/Shift, rule-of-thirds grid, 90° rotation and ±15° straightening | Physical-device checks; straightening intentionally leaves transparent corners |
| 4 | `/export-recipes`: editable product/social/website recipes, named variants, individual failure reports, cancellation and ZIP download | Currently one source photo per recipe; up to 20 variants and 128 MiB of output. Batch recipes and user-defined recipe backups can follow |
| 5 | Settings-only local presets, apply/save/delete/delete-all, JSON backup/import, nested schema validation and storage explanations | Browser storage is local and can be cleared; cloud sync is not provided |
| 6 | Optional, lazy, self-hosted MozJPEG and libwebp WASM encoders through pinned jSquash packages; notices and browser fallback choice | 12 MP advanced-encoder cap. AVIF WASM and comparative physical-phone memory/quality benchmarks remain future work |
| 7 | Existing BiRefNet Lite general remover with WASM CPU execution, portrait/plain-background alternatives and disclosed download budget | Expanded representative product/animal/hair/glass comparisons |
| 8 | Real-ESRGAN 2×/3×/4×, NAFNet motion deblur, RestoreFormer++ face restoration, combined processing, strength control, tiled execution, cancellation, comparison and input caps | Physical-device performance matrix, selective face control and more defocus fixtures; severe blur and unreadable text cannot be guaranteed recoverable |
| 9 | Original bounded TIFF 6.0 reader: single-page, uncompressed, chunky 8-bit RGB/grayscale, orientations 1–8 and alpha | ICC-tagged, compressed/tiled, CMYK, high-bit-depth and BigTIFF are rejected. HEIC/RAW/JXL/PDF/SVG need separate adapter and license reviews |
| 10 | Pixel-based memory estimates before worker scheduling, isolated errors/retries, serial recipe workers and streamed ZIP to a chosen disk file where supported | File System Access is browser dependent; regular download fallback remains. Large physical-device soak tests are pending |

Four server-rendered guides now cover image formats, upload limits, product photos and transparency. They link to relevant tools and are included in public route, metadata, sitemap and offline handling. Saved settings are covered in the privacy page. No analytics or image persistence was added.

Downloads preserve the source basename unless a custom rename pattern is supplied: selecting or dropping `xyz.png` produces `xyz.webp` for WebP and `xyz.jpg` for JPEG. The browser regression test checks both selection and drag-and-drop download names.

Run `npm run check`, `npm run test:roadmap`, `npm run test:seo` and `npm run test:pwa` against a production build. The roadmap browser test verifies downloaded mask pixels, reversible corrections, backgrounds, crop geometry, recipe archives, preset persistence, JPEG/WebP WASM exports, a real TIFF fixture with all orientations/partial alpha, and narrow viewport overflow. Emulation does not substitute for physical phone testing.

`https://shrinkfox.vercel.app` is live and is now the default production origin. Its currently deployed build blocks indexing; redeploy this update to apply the corrected metadata, sitemap and robots policy. Preview/development builds remain non-indexed. The updated local production build scores 100 in Lighthouse's SEO category; this is not a ranking guarantee. Search Console verification, real search performance and physical-device benchmarks remain release work. Follow [SEO-LAUNCH-GUIDE.md](SEO-LAUNCH-GUIDE.md).

The GIMP/digiKam/ComfyUI references are workflow inspiration. This release implements browser controls and local workers; it does not install or bundle those desktop applications. The codecs use [jSquash](https://github.com/jamsinclair/jSquash), and the TIFF implementation follows [the TIFF tag specification](https://www.loc.gov/preservation/digital/formats/content/tiff_tags.shtml).

## What to compete on

Build the most useful private image workflow for people preparing product photos, website images and social posts. The strongest combination is local processing, clear quality controls, dependable downloads, a good mobile editor and no account or watermark. Measure the finished result and time taken to get it, rather than the number of tools listed.

Browser processing avoids a paid API call for every edit. Hosting, model downloads, bandwidth, maintenance and testing can still cost money. Describe the service as free to use within published device and file limits; do not promise unlimited computing or support for every format.

## What is already built

- Compression, resizing, conversion, batch processing and ZIP downloads.
- Target-size workflows for 100 KB, 200 KB and 500 KB, with honest target limitations.
- JPEG, PNG and browser-dependent WebP/AVIF output; supported input formats are documented on the format page.
- BiRefNet Lite general background removal, portrait/plain-background alternatives and transparent PNG export.
- Real-ESRGAN General restoration with 2×, 3× and 4× output, plus color and sharpening controls.
- Before/after comparison, local processing, metadata controls, PWA/offline support, mobile navigation and keyboard-accessible controls.
- Dedicated tool pages, useful instructions, page metadata, sitemap/robots generation and automated SEO checks.

## Recommended build order

Effort is relative: small means a contained change, medium spans UI and processing, large needs research, quality evaluation or substantial compatibility work. These are not delivery estimates.

| Order | Feature | Why it matters | Effort | Release requirement |
| --- | --- | --- | --- | --- |
| 1 | Erase/restore mask brush with undo and redo | People can fix hair, edges and missed regions instead of abandoning a cutout | Medium–large | Touch and pen support, adjustable brush, zoom/pan, reversible edits and export matching the preview |
| 2 | Background replacement | Turns a transparent cutout into a ready-to-use product or profile image | Medium | Solid color, gradient and user-selected image backgrounds; reliable edge compositing and alpha export |
| 3 | Interactive crop, rotate and straighten | Makes the existing resize tool easier to use for real layouts | Medium | Draggable crop handles, aspect ratios, keyboard controls and accurate output dimensions |
| 4 | Multi-size export recipes | Saves repeated work for shops, blogs and social teams | Medium | Produce named variants in one ZIP; presets remain editable; warn when an image is too small |
| 5 | Saved local presets | Helps returning users repeat their own workflow | Small–medium | Store settings only by default, offer export/import, explain storage and allow deletion |
| 6 | Better compression codecs | Gives more predictable output than browser-dependent encoders | Large | Lazy-load selected WASM codecs, review licenses, compare visual quality and memory use on phones |
| 7 | Background removal for general objects | Expands beyond portraits and plain product backgrounds | Large | A model with suitable commercial rights, a download-size budget, measured quality and a CPU fallback |
| 8 | Optional local AI upscaling | Addresses small or low-resolution source images | Large | Compare against ordinary resizing, show before/after, disclose invented detail, cap memory and support cancellation |
| 9 | Additional format adapters | Helps users with camera and phone files | Large | Add formats individually after decoder/license/security review; test orientation, profiles, transparency and real fixtures |
| 10 | Large-batch resilience | Makes the tool dependable for bigger collections | Large | Memory-aware scheduling, streamed ZIP output where supported, recovery from individual failures and clear progress |

Start with **mask correction, background replacement and interactive crop**. Together they make the existing tools more useful without immediately adding another large AI download. Then build export recipes and saved presets to encourage repeat use.

## How each phase should work

### Phase 1: Finish one image well

Prioritize cutout correction, backgrounds and cropping. Keep the original untouched and maintain a reversible edit history. Reuse the existing worker and cancellation boundaries. A person should be able to produce a clean profile picture or product image entirely on a phone.

For release, check portraits with loose hair, low contrast, glasses and transparent objects, plus products on uneven backdrops. Include difficult examples and show where automatic removal still needs help. Do not use only easy demonstrations.

### Phase 2: Make repeat work faster

Add local presets and export recipes such as a product thumbnail, product-detail image and website card. Let users inspect every requested size before processing. Keep batch failures isolated and offer a retry for just the failed files.

If local project saving is added later, make image persistence opt-in, explain the storage size and offer a clear delete action. The current privacy promise must be updated before saving private image data on disk.

### Phase 3: Improve quality and reach

Evaluate codecs and models before choosing a package. Squoosh is a useful reference for browser-based codec workflows; ONNX Runtime documents WebGPU acceleration. Neither removes the need to validate the license of each dependency and model, device compatibility or memory limits. [Squoosh source](https://github.com/GoogleChromeLabs/squoosh), [ONNX Runtime WebGPU guidance](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).

Benchmark on a mid-range Android device, Safari on iPhone and desktop Chrome/Firefox/Safari. Keep a reliable fallback when GPU acceleration or a codec is unavailable. Avoid a feature that works only on a powerful development machine.

### Phase 4: Expand only where users need it

Consider a browser extension, a documented local automation interface, optional localization and specialist export workflows after the core editor is reliable. A hosted API or cloud job queue is a separate product with operating costs, abuse controls and privacy obligations; it is not automatically an unlimited free extension of the browser app.

## Competitive direction

Tools such as remove.bg already offer cutout correction and background editing. Its documented Magic Brush workflow is evidence that correction controls are an established expectation, not a unique claim ShrinkFox can make. The proposed advantage is delivering a coherent, private workflow with transparent limits and useful free exports. [remove.bg Magic Brush](https://www.remove.bg/bg/help/a/how-to-use-magic-brush).

Use the same permitted test images and export sizes when comparing products. Record visible edge defects, file size, time to a usable result, required manual corrections and mobile failures. Publish results only with the method, settings and date; avoid unsupported “best in the world” claims.

## Growth and content plan

1. Redeploy the updated app at `https://shrinkfox.vercel.app` and verify its public crawl policy. Follow `SEO-LAUNCH-GUIDE.md` for launch checks and custom-domain changes.
2. Publish a few substantial guides with original examples: choosing JPG/PNG/WebP, meeting upload limits without losing readable text, preparing product photos, and understanding transparent PNGs.
3. Link each guide to the exact tool and sensible preset. Explain the limits and show actual downloaded results.
4. Add new landing pages only when a distinct workflow, audience or useful demonstration justifies them. Avoid dozens of near-identical keyword pages.
5. Add truthful product ownership/support information when the owner provides it. Keep the existing GTF Technologies credit; do not invent staff biographies, reviews or customer totals.
6. Use Search Console for search impressions, queries, indexing and clicks. Improve pages based on actual questions users ask. Obtain permission before adding analytics, and update the privacy explanation if tracking changes.
7. Keep the installable app useful offline. Clear error messages, fast first use and repeatable exports are retention features.

## What success should mean

Track successful exports, time to first usable result, cancellation behavior, failed jobs, result quality, memory use and download correctness in controlled tests. If collecting real usage data later, define consent, retention and a privacy-respecting measurement plan first; never upload user images for analytics by default.

For search, track indexed useful pages and relevant traffic after launch. A Lighthouse SEO score is a technical audit result, not a ranking promise. Do not optimize only for a score while making the editor slower or the content less useful.

## Avoid for now

- Accounts and subscriptions unless they solve a demonstrated user problem.
- Large bundles or AI models loaded before someone chooses the tool.
- Claiming AI enhancement when the operation is standard sharpening or resizing.
- Advertising a format because its extension is accepted without validating the file.
- Forced install prompts that cover the editor, fake urgency, fake reviews or mass-produced SEO pages.
- Generating photo-realistic backgrounds through paid services while promising unlimited free operation.

## Next release acceptance checklist

- Relevant engine fixtures pass; output files are valid and match the requested dimensions and background.
- Small screens, touch, keyboard, focus, dark mode and reduced motion are verified.
- Large inputs fail gracefully; cancel/retry never revives old results.
- Offline behavior and model-download requirements are explained accurately.
- New tool pages have distinct useful content, a clear H1 and correct metadata.
- The sitemap includes each public tool, while private workspaces stay noindex.
- License notices, format limits, privacy wording and roadmap status reflect the shipped behavior.
