let webpReady: Promise<typeof import("@jsquash/webp/encode.js")> | undefined;
let jpegReady: Promise<typeof import("@jsquash/jpeg/encode.js")> | undefined;
async function binary(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path);
  if (!response.ok)
    throw new Error(
      "The selected encoder could not load. Connect once to download it, or choose the browser encoder.",
    );
  return response.arrayBuffer();
}
export async function encodeWasm(
  canvas: OffscreenCanvas,
  format: "jpeg" | "webp",
  quality: number,
): Promise<Blob> {
  if (canvas.width * canvas.height > 12_000_000)
    throw new Error(
      "The advanced encoder supports up to 12 megapixels. Resize first or choose the browser encoder.",
    );
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ENCODE_FAILED");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  if (format === "webp") {
    webpReady ??= Promise.all([
      import("@jsquash/webp/encode.js"),
      binary("/codecs/webp_enc.wasm"),
    ])
      .then(async ([module, wasmBinary]) => {
        await module.init({ wasmBinary });
        return module;
      })
      .catch((cause: unknown) => {
        webpReady = undefined;
        throw cause;
      });
    const codec = await webpReady;
    return new Blob([await codec.default(image, { quality, method: 4 })], {
      type: "image/webp",
    });
  }
  jpegReady ??= Promise.all([
    import("@jsquash/jpeg/encode.js"),
    binary("/codecs/mozjpeg_enc.wasm"),
  ])
    .then(async ([module, wasmBinary]) => {
      await module.init({ wasmBinary });
      return module;
    })
    .catch((cause: unknown) => {
      jpegReady = undefined;
      throw cause;
    });
  const codec = await jpegReady;
  return new Blob([await codec.default(image, { quality })], {
    type: "image/jpeg",
  });
}
