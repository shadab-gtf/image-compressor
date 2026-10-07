# ShrinkFox

A free image toolkit with private, on-device processing. Built with Next.js 16.4, React, TypeScript, browser workers and a self-hosted portrait-matting model.

## Run locally

Requires Node.js 22.20+ and npm.

```sh
npm ci
npm run setup:studio
npm run dev
```

`setup:studio` downloads a pinned MODNet model, copies the pinned ONNX Runtime Web files and verifies SHA-256 checksums. These assets are served from your own origin. No model API key, account or per-image credits are required. Re-running setup verifies existing files without downloading them again.

## Production

Set `NEXT_PUBLIC_SITE_URL` to your actual public HTTPS origin before building. Without it, search indexing is disabled and the sitemap is empty, so preview deployments do not publish localhost canonical URLs.

```sh
npm run check
npm run build
npm start
```

Use a Next.js-compatible Node host with HTTPS. Preserve the security headers in `next.config.ts`. Ensure the deploy includes generated `public/models` and `public/wasm` assets; an incomplete deployment cannot run portrait AI. Install the app from the header or supported browser install menu. Offline features require a prior online visit and available browser storage.

## Included tools

- Compression with smart quality, explicit quality, true lossless PNG and target-size search.
- Proportional resize, exact dimensions, contain, cover/crop and batch presets.
- Conversion to browser-supported encoders, with actual output MIME verification.
- Folder/batch processing, cancellable workers, image comparison and ZIP downloads.
- Local MODNet portrait background removal; edge-connected simple-background removal for plain product backdrops.
- Contrast, saturation, sharpening and optional 2× smooth interpolation. Enhancement is not generative restoration.
- Responsive landing page with a real before/after compression example, tool pages, format guide, privacy explanation, titles, descriptions, social preview, structured data, sitemap and robots.
- Installable PWA, skeleton loading, route error boundaries, keyboard navigation and reduced-motion styles.

The landing example is an AI-generated still-life photo. Its displayed sizes come from a real ShrinkFox browser export, reproducible with `npm run showcase` against a running local server.

## Architecture

`src/app` pages supply local catalog data from `src/lib/api` to layout sections in `src/components/sections`. The pages remain Server Components. The local catalog needs no external API or artificial loading delay.

Interactive tool features live under `src/features`. Stateless shared presentation lives under `src/components/ui`. File operations go through typed services and disposable or bounded workers. Model loading happens inside the studio worker, never in a page or presentation component. Suspense and route skeletons cover asynchronous rendering and lazy studio code.

The AI runtime is dynamically imported only for portrait processing. Source images and output blobs remain in memory; model/site caches contain public assets only. Navigating away cancels active work. Download results before refreshing or closing the workspace.

## Limits and quality

There is no application subscription, daily quota or credit meter. This does not mean unlimited hardware, bandwidth or hosting. Hosting providers can charge for traffic and storage; free plans have their own limits. Devices can exhaust memory before an application's safety limits.

| Operation | Limit |
| --- | --- |
| Compressor | 128 MiB input, 40 MP, 16,384px maximum edge |
| Studio | 40 MiB input, 24 MP, 8,192px maximum edge; resized output must also fit |
| Portrait AI | About 26 MB model plus about 14 MB runtime downloaded on demand |

JPEG and PNG are the most portable formats. WebP and AVIF depend on actual browser support. AVIF decoding does not imply AVIF encoding. Animated GIF, WebP, APNG and AVIF inputs export a still frame. TIFF support is limited by the browser. HEIC, RAW, PDF, SVG and JPEG XL are not supported.

Portrait AI specializes in people. It is not a general product segmentation model. Fine hair, transparent materials, similar foreground/background colors and complex scenes can need manual cleanup. Simple-background mode is useful for plain edge-connected backgrounds, not complex scenes. 2× interpolation increases dimensions, not recovered detail.

Lossless mode forces PNG. Resizing and palette reduction still alter pixels. Target-size mode can return the closest result when a requested size is impossible. Color profiles, print metadata and HDR content may change during browser conversion.

## Verification scripts

```sh
npm run lint
npm run typecheck
npm run test:engines
npm run test:studio
npm run test:pwa
npm run test:images
npm run e2e
npm run e2e:studio
npm run test:site
```

Engine tests cover oversized-header rejection before decode, format fallback, true lossless output, EXIF privacy, ZIP integrity/naming and cancellation races. Studio tests check pixel values, transparency, real model inference, actual PNG downloads and cancellation. Site checks cover routes, metadata, icons, mobile layout, install guidance and offline behavior. Browser checks require Chrome/Edge; the Playwright site test supports `CHROME_PATH` or an installed Playwright Chromium. Use `E2E_BASE` to target a running server; site/PWA checks require a production server, default port 3100.

Lighthouse targets are goals, not a guaranteed deployed score. Measure a production build on representative mobile hardware and network conditions before claiming a score or zero layout shift.

Toolkit verification on 7 October 2026 passed the build, type checks, engine/studio regression checks and real-browser download, mobile-layout and offline-processing checks. Before the full-width Pin Sans refresh, mobile Lighthouse measured 92 performance, 100 accessibility, 100 best practices and 0 observed layout shift. SEO measured 66 with preview indexing deliberately disabled. These scores are not a measurement of later UI changes. The 95+ performance target still needs work, especially responsive showcase image delivery; configure the real public origin and retest the deployed site before launch.

The responsive UI uses the supplied Pin Sans fonts and full-width layouts with 16px phone, 24px tablet and 32–48px desktop edge padding. Mobile navigation stays above the device safe area; editor actions and install/update notices avoid covering it. Presets and metadata options use readable native selects, and mobile text inputs use 16px text to avoid focus zoom.

The desktop All tools menu is generated from the same catalog as tool pages and supports hover, click and keyboard navigation. Original hand-drawn SVG illustrations cover tools, use cases and workflow steps; header and navigation retain their compact line icons. Hover, comparison, switch and menu motion respect reduced-motion preferences. The footer credits GTF Technologies.

The inline fox logo preserves its orange face, cream cheeks and dark eyes in both themes; its pointed muzzle turns white in dark mode. Page titles place the tool or topic first, followed by the requested “No watermark | No signup | No credit card required” benefits and the brand name. Open Graph and Twitter titles use the same shared title builder. Tool descriptions and FAQs explain actual format, quality and device limits in plain language. Long titles may be shortened in search results; metadata does not guarantee search rankings.

Each tool has its own instructions and practical format or quality guidance, including the target-size and conversion pages. Privacy, format, workspace and install/offline copy explains what happens to files and what to do next. The JPEG background control uses a rainbow colour wheel with a live selection marker; clicking it or activating it with the keyboard opens the browser's native colour picker.

## Free resources and licensing

- [MODNet source and Apache-2.0 license](https://github.com/ZHKKKe/MODNet): portrait matting.
- [Pinned Xenova MODNet export](https://huggingface.co/Xenova/modnet/tree/fa2fa546052fba4c08921230a26cc69a333fca12): ONNX model.
- [ONNX Runtime](https://github.com/microsoft/onnxruntime): MIT runtime; bundled notices are retained under `public/wasm`.
- [Browser canvas encoding](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob): local image export without a server API.

Runtime/model licenses and third-party notices are shipped with the assets. The UI uses the supplied Pin Sans font files in `public/fonts`, loaded with `next/font/local` at regular, medium, bold and heavy weights. Fonts are served locally and cached with the PWA assets; no external font request is made.

## Audit corrections

The initial app linked to missing routes, declared a manifest without a complete install/offline implementation, used lossy maximum-quality output under a lossless label, and removed EXIF pointers while leaving personal metadata recoverable. Cancellation could also let stale worker responses affect retried jobs. The current implementation adds real tool routes, corrects claims, reconstructs safe EXIF and terminates cancelled workers.

`npm audit --omit=dev` reported no production advisories during this upgrade. The current ESLint dependency chain reports a high-severity `braces` advisory with no compatible patched release available at verification time. Do not apply the suggested forced downgrade of Next's lint configuration to an incompatible major version; recheck upstream updates regularly.

## Future expansion

See [SHRINKFOX-ROADMAP.md](SHRINKFOX-ROADMAP.md) for prioritized features, quality gates and a growth plan. [SEO-LAUNCH-GUIDE.md](SEO-LAUNCH-GUIDE.md) covers the planned Vercel origin, sitemap/robots setup, H1–H6 structure, alt text and launch verification. Run `npm run test:seo` against a production server for the repeatable technical checks; it reports preview indexing separately from public launch readiness.

Add a tool entry in `src/lib/api/catalog.ts`, a typed operation contract and a worker-backed feature where needed. Keep model/codec code lazy, add clear format limits and preserve the local-processing privacy boundary.

Useful next additions are permissively licensed general-object segmentation, mask brush refinement, tested WASM codecs for additional formats, local AI super-resolution and streamed large ZIP output. Each needs model/license review, quality fixtures, memory budgets and browser verification before being advertised. An account, billing system and cloud uploads are intentionally unnecessary for these free local tools.
