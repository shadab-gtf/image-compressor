# Image enhancement: what works and what comes next

## What was wrong

The original enhancer applied contrast, saturation and a small unsharp mask. Its 2× mode was canvas interpolation. Interpolation increases dimensions but does not reconstruct detail, so blurred photos stayed blurred.

## Implemented

- Real-ESRGAN General x4v3 restoration for 2×, 3× and 4× output. The compact General variant processes padded 128×128 tiles and predicts 4× RGB detail; lower scales resample that prediction. This is not the much heavier x4plus model.
- BiRefNet Lite 512 FP32 for people, products and general objects. ImageNet-normalized input produces logits, sigmoid creates the alpha mask and the mask is resized to the original resolution. This is a lower-resolution Lite export, not full-size BiRefNet or Bria RMBG.
- `npm run setup:studio` installs pinned exports with SHA-256 verification. Models and runtime are served from this website. There is no external inference API, quota, account or watermark.
- ONNX Runtime runs in a disposable worker, with download/tile progress and immediate worker cancellation. Real-ESRGAN and the new restoration models select WebGPU when available, with WASM CPU support. Model downloads are cached when browser storage permits. Real-ESRGAN data is about 5 MB; BiRefNet data is about 192 MB, plus the shared runtime. Large models are split into byte-preserving static parts for hosting.
- **Motion deblur — NAFNet** runs a dedicated deblurring model at original resolution. Reflected padding and overlapping 384-pixel inference tiles provide context around each 256-pixel output region.
- **Restore faces — RestoreFormer++** detects faces with YuNet, aligns five facial landmarks, restores each 512-pixel face, and blends it back into the photograph with feathered edges. Up to eight detected faces are processed sequentially to limit memory use.
- **Full image — deblur + enhance** is the default. It applies NAFNet to the whole photo, then Real-ESRGAN across every image tile, including clothing, objects and backgrounds. **Full image + face repair** adds a final RestoreFormer++ pass on detected faces. If no face is detected, the full-image result is retained. Face-only mode asks the user to crop closer or choose full-image enhancement when detection fails. Restoration strength controls NAFNet and face blending with the source.
- Source transparency is reapplied to the predicted RGB image. Color and sharpening adjustments are applied afterward in the existing worker.
- Quick adjustments remains available for large photos. Its enlargement uses interpolation, clearly described in the interface. MODNet Portrait AI is a smaller background model for people; Simple background needs no model.
- AI input is limited to 1,000,000 pixels. Exports are limited to 24 MP and 8,192 pixels per side. Source decoding retains the existing header checks and 40 MB file limit.

## Quality expectations

### Text and screenshot mode

PaddleOCR.js 0.4.2 now runs PP-OCRv5 mobile detection and recognition in a dedicated local worker. Models total about 21.5 MB; its OpenCV/ORT worker and runtime add about 36 MB. Assets are hosted on this origin and cached after first use when storage allows. No paid inference API is used.

Choose **Screenshot & text — fast**, enhance, then **Read text with PaddleOCR**. Review recognized words and select only the lines to replace. Reconstruction uses a user-selected solid background, text color and a clean font. It is designed for horizontal text on flat backgrounds, not automatic recreation of lettering on textured or curved surfaces. OCR cannot recover words whose pixels are missing.

The photo runtime now uses up to four WASM CPU threads on cross-origin-isolated browsers, with a single-thread fallback. Model and tile quality remain unchanged. The fast screenshot fixture (640 × 160 input, 2× output) enhanced in about 0.9 seconds in the local browser check, excluding OCR initialization and recognition. This is a fixture timing, not a performance promise for every device.

### Severely blurred portraits and 8K

Dedicated face restoration and motion deblurring are now integrated. Start with **Full image — deblur + enhance** to process the entire frame. **Full image + face repair** adds a face-specific finishing pass. The faster **AI upscale** option skips NAFNet. The separate **Restore faces** and **Motion deblur** options run only their named model and resample the rest for 2×/3×/4× output. A restoration strength of 75% is the default. Lower it if facial features look too different from the original.

NAFNet downloads about 91.7 MB; Real-ESRGAN about 5 MB; RestoreFormer++ about 74.4 MB plus a 0.23 MB face detector. Full-image processing needs the first two; adding face repair needs all three (about 171 MB total), plus the shared 28.3 MB GPU-capable runtime. Models are initialized and released by stage, with WebGPU-to-CPU fallback if GPU session creation fails. Processing stays on the device. Severe defocus, tiny faces, occlusion and heavy motion can still defeat the models; reconstructed facial details are estimates, not an identity-accurate recovery.

AI source images remain limited to 1 MP and standard exports to 24 MP. A separate 8K JPEG export resamples the restored result to a 7,680-pixel long edge, preserves aspect ratio, fills transparency white and limits output to 60 MP. It uses a cancellable worker and can require several hundred megabytes of memory; desktop use is recommended. An 8K image size alone does not provide recovered 8K detail.

2× is a good first choice for small, soft images. 3× and 4× increase both width and height: 4× means sixteen times the pixels. A larger file does not automatically look better. AI predicts plausible detail and can alter faces, lettering and textures; it cannot promise exact recovery of unreadable text or severe motion blur.

Real-ESRGAN is trained for real-photo restoration, but cannot guarantee exact recovery of missing detail or severe motion blur. WASM works without a GPU and can be slow. BiRefNet needs substantial memory; use Portrait AI or Simple background on constrained devices.

## Next features to build

1. Benchmark x4plus against the compact General variant, then consider an optional higher-quality mode with a clear download size and processing-time estimate. Measure the current GPU and CPU paths across physical devices.
2. Expand the dedicated restoration evaluation set: motion blur, defocus, JPEG artifacts, portraits, products and text. Consider a separate defocus model only after representative quality and license checks.
3. Add a 100% zoom comparison so users can inspect fine detail rather than judge a scaled preview.
4. Offer Natural, Photo and Illustration presets and measured low-memory device presets. Restoration-strength blending is now available for the dedicated models.
5. Add per-face strength and selective face restoration, while keeping the warning that facial details may change.
6. Expand input limits only after measuring memory, cancellation and processing time on actual Android and iPhone devices.

Free local inference removes per-image server charges. Device memory, GPU performance and hosting bandwidth still have limits; an unlimited free GPU API is not required for this architecture.

## References

- [Real-ESRGAN official repository](https://github.com/xinntao/Real-ESRGAN)
- [Qualcomm General x4v3 ONNX export](https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3)
- [BiRefNet official repository](https://github.com/ZhengPeng7/BiRefNet)
- [Pinned browser-compatible BiRefNet Lite 512 export](https://huggingface.co/studioludens/birefnet-lite-512/tree/4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7)
- [NAFNet official repository](https://github.com/megvii-research/NAFNet) and [OpenCV ONNX export](https://github.com/opencv/opencv_zoo/tree/main/models/deblurring_nafnet)
- [RestoreFormer++ official repository](https://github.com/wzhouxiff/RestoreFormerPlusPlus) and [browser-compatible ONNX export](https://huggingface.co/Saimon8420/restoreformer-pp-web)
- [YuNet face detector](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)

## Licenses and verification

Real-ESRGAN uses BSD-3-Clause; the selected BiRefNet Lite export uses MIT. Preserve LICENSE and NOTICE files under public/models. Bria RMBG-2.0 is not included because its non-commercial terms do not meet the commercial-use requirement. The intermediate TensorFlow/UpscalerJS dependencies were removed in favor of the existing ONNX worker runtime.

The selected NAFNet and YuNet exports include MIT licenses. RestoreFormer++ uses Apache-2.0; its selected browser export identifies the same license. Source revisions, byte counts and SHA-256 checks are pinned in `scripts/setup-restoration.ts`; notices are in `public/models/restoration`. These are local models without paid inference APIs. Retain the model notices when distributing the application.

Run `node --experimental-strip-types scripts/test-neural-browser.ts` against the production preview to check 2×–4× dimensions, transparency, actual neural output, cancellation, original-resolution background masks, mobile layout and same-origin requests.

Run `npm run test:restoration` with `BASE_URL` set to the production preview. It checks alignment, duplicate face suppression, actual full-image inference, downloads, dimensions, cancellation, mobile width and same-origin requests. Set `FACE_SAMPLE` to a local portrait to exercise face restoration; set `RESTORATION_MODES=restore` for the combined workflow. `DEBLUR_SAMPLE` accepts a local motion-blurred photo. `PARTIAL_ALPHA=true` also verifies transparency preservation. Fixtures and result images stay under ignored `temp/restoration/` and are not published.

## Additional project review — 7 October 2026

No additional package was installed after reviewing these projects. The current browser worker already supplies restoration and background removal through ONNX Runtime, Real-ESRGAN and BiRefNet.

| Project | Integration available | Decision for ShrinkFox |
| --- | --- | --- |
| [Upscayl](https://github.com/upscayl/upscayl) | Electron desktop application with native Vulkan processing; AGPL-3.0 application | No browser SDK to add. Keep the existing Real-ESRGAN ONNX implementation. Consider native GPU processing if building a separate desktop edition. |
| [Unbagrnd](https://github.com/zidniryi/unbagrnd) | Tauri application, Rust processing core and self-hosted Axum API | Its native core cannot be imported into the browser as a JavaScript inference library. A separate server would introduce hosting and photo uploads. Keep local BiRefNet; use its brush refinement and background editing workflows as product ideas. |
| [rembg](https://github.com/danielgatis/rembg) | Installable Python library, CLI and HTTP server | A usable library exists, but requires a Python runtime and overlaps the existing browser ONNX pipeline. Install only for a future explicit Python backend or desktop processing service. |
| [Clarity Upscaler](https://github.com/philz1337x/clarity-upscaler) | GPU/Python Cog implementation; free ComfyUI/A1111 workflows; separate paid app/API | No compatible browser SDK. Its diffusion workflow invents detail and needs large model files and GPU resources. Reserve a clearly labeled creative mode for a future local GPU or separately funded backend. The repository says Flux upscaling is not open source. |

Installation criteria: add a dependency only when it runs in the chosen environment, adds a tested capability, has acceptable model and code licenses, and preserves the chosen privacy/cost model. Installing a desktop application's source does not make its native inference available inside a website.
