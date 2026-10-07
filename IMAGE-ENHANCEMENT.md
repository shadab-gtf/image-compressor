# Image enhancement: what works and what comes next

## What was wrong

The original enhancer applied contrast, saturation and a small unsharp mask. Its 2× mode was canvas interpolation. Interpolation increases dimensions but does not reconstruct detail, so blurred photos stayed blurred.

## Implemented

- Real-ESRGAN General x4v3 restoration for 2×, 3× and 4× output. The compact General variant processes padded 128×128 tiles and predicts 4× RGB detail; lower scales resample that prediction. This is not the much heavier x4plus model.
- BiRefNet Lite 512 FP32 for people, products and general objects. ImageNet-normalized input produces logits, sigmoid creates the alpha mask and the mask is resized to the original resolution. This is a lower-resolution Lite export, not full-size BiRefNet or Bria RMBG.
- `npm run setup:studio` installs pinned exports with SHA-256 verification. Models and runtime are served from this website. There is no external inference API, quota, account or watermark.
- ONNX Runtime WASM runs in a disposable worker, with download/tile progress and immediate worker cancellation. Model downloads are cached when browser storage permits. Real-ESRGAN data is about 5 MB; BiRefNet data is about 192 MB, plus a shared 14 MB runtime. BiRefNet is split into four byte-preserving static parts.
- Source transparency is reapplied to the predicted RGB image. Color and sharpening adjustments are applied afterward in the existing worker.
- Quick adjustments remains available for large photos. Its enlargement uses interpolation, clearly described in the interface. MODNet Portrait AI is a smaller background model for people; Simple background needs no model.
- AI input is limited to 1,000,000 pixels. Exports are limited to 24 MP and 8,192 pixels per side. Source decoding retains the existing header checks and 40 MB file limit.

## Quality expectations

2× is a good first choice for small, soft images. 3× and 4× increase both width and height: 4× means sixteen times the pixels. A larger file does not automatically look better. AI predicts plausible detail and can alter faces, lettering and textures; it cannot promise exact recovery of unreadable text or severe motion blur.

Real-ESRGAN is trained for real-photo restoration, but cannot guarantee exact recovery of missing detail or severe motion blur. WASM works without a GPU and can be slow. BiRefNet needs substantial memory; use Portrait AI or Simple background on constrained devices.

## Next features to build

1. Benchmark x4plus against the compact General variant, then add an optional higher-quality mode with a clear download size and processing-time estimate. Add a verified WebGPU backend and device capability checks while retaining lighter alternatives.
2. Add separate deblur and denoise controls using suitable restoration models. Test motion blur, defocus, JPEG artifacts, portraits, products and text independently.
3. Add a 100% zoom comparison so users can inspect fine detail rather than judge a scaled preview.
4. Offer Natural, Photo and Illustration presets, restoration-strength blending and low-memory device presets.
5. Add optional face restoration with an explicit warning that facial details may change. Never imply identity-accurate reconstruction.
6. Expand input limits only after measuring memory, cancellation and processing time on actual Android and iPhone devices.

Free local inference removes per-image server charges. Device memory, GPU performance and hosting bandwidth still have limits; an unlimited free GPU API is not required for this architecture.

## References

- [Real-ESRGAN official repository](https://github.com/xinntao/Real-ESRGAN)
- [Qualcomm General x4v3 ONNX export](https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3)
- [BiRefNet official repository](https://github.com/ZhengPeng7/BiRefNet)
- [Pinned browser-compatible BiRefNet Lite 512 export](https://huggingface.co/studioludens/birefnet-lite-512/tree/4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7)

## Licenses and verification

Real-ESRGAN uses BSD-3-Clause; the selected BiRefNet Lite export uses MIT. Preserve LICENSE and NOTICE files under public/models. Bria RMBG-2.0 is not included because its non-commercial terms do not meet the commercial-use requirement. The intermediate TensorFlow/UpscalerJS dependencies were removed in favor of the existing ONNX worker runtime.

Run `node --experimental-strip-types scripts/test-neural-browser.ts` against the production preview to check 2×–4× dimensions, transparency, actual neural output, cancellation, original-resolution background masks, mobile layout and same-origin requests.
