/** Original bounded TIFF 6.0 reader. Supports uncompressed 8-bit chunky RGB/grey.
 * Tags: https://www.loc.gov/preservation/digital/formats/content/tiff_tags.shtml
 */
export function tiffHeader(bytes: Uint8Array) {
  if (bytes.length < 8) throw new Error("TIFF header is incomplete.");
  const little = bytes[0] === 73 && bytes[1] === 73;
  if (!little && !(bytes[0] === 77 && bytes[1] === 77))
    throw new Error("Invalid TIFF byte order.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, little) !== 42)
    throw new Error("BigTIFF is not supported.");
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > bytes.length)
    throw new Error("TIFF directory is outside the inspected header.");
  const count = view.getUint16(offset, little);
  if (count > 256 || offset + 2 + count * 12 + 4 > bytes.length)
    throw new Error("TIFF directory is too large or incomplete.");
  const tags = new Map<number, number[]>();
  const wanted = new Set([
    256, 257, 258, 259, 262, 273, 274, 277, 278, 279, 284, 338, 339,
  ]);
  let profile = false;
  let tiled = false;
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    const tag = view.getUint16(at, little);
    if (tag === 34675) profile = true;
    if (tag === 322 || tag === 324) tiled = true;
    if (!wanted.has(tag)) continue;
    if (tags.has(tag)) throw new Error("Duplicate TIFF field.");
    const type = view.getUint16(at + 2, little);
    const length = view.getUint32(at + 4, little);
    const size = type === 3 ? 2 : type === 4 ? 4 : 0;
    if (!size || !length || length > 16384)
      throw new Error("Unsupported TIFF field.");
    const start = size * length <= 4 ? at + 8 : view.getUint32(at + 8, little);
    if (start + size * length > bytes.length)
      throw new Error("TIFF field is outside the inspected header.");
    tags.set(
      tag,
      Array.from({ length }, (_, item) =>
        size === 2
          ? view.getUint16(start + item * size, little)
          : view.getUint32(start + item * size, little),
      ),
    );
  }
  const get = (tag: number, fallback = 0) => tags.get(tag)?.[0] ?? fallback;
  return {
    width: get(256),
    height: get(257),
    compression: get(259, 1),
    photo: get(262),
    samples: get(277, 1),
    orientation: get(274, 1),
    rows: get(278, get(257)),
    planar: get(284, 1),
    bits: tags.get(258) ?? [1],
    offsets: tags.get(273) ?? [],
    lengths: tags.get(279) ?? [],
    alpha: get(338),
    sampleFormat: get(339, 1),
    profile,
    tiled,
    multipage: view.getUint32(offset + 2 + count * 12, little) !== 0,
  };
}
export async function decodeTiff(file: Blob): Promise<ImageBitmap> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = tiffHeader(bytes.subarray(0, 1048576));
  const { width, height, samples, orientation } = info;
  if (
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 40000000
  )
    throw new Error("TIFF exceeds the 40 MP or 16,384-pixel safety limit.");
  const grey = info.photo === 0 || info.photo === 1;
  if (info.profile)
    throw new Error(
      "ICC-tagged TIFF needs a colour-managed desktop conversion to PNG or JPEG first.",
    );
  if (
    info.compression !== 1 ||
    info.planar !== 1 ||
    info.tiled ||
    info.multipage ||
    info.sampleFormat !== 1 ||
    info.bits.length !== samples ||
    info.bits.some((bit) => bit !== 8) ||
    !(grey
      ? samples === 1 || samples === 2
      : info.photo === 2 && (samples === 3 || samples === 4)) ||
    orientation < 1 ||
    orientation > 8
  )
    throw new Error(
      "Use a single-page, uncompressed 8-bit RGB or grayscale TIFF, or convert this variant to PNG first.",
    );
  const hasAlpha = samples === (grey ? 2 : 4);
  if (hasAlpha && info.alpha !== 1 && info.alpha !== 2)
    throw new Error("TIFF alpha type is unsupported.");
  const strips = Math.ceil(height / info.rows);
  if (
    !info.rows ||
    !Number.isFinite(strips) ||
    strips > 16384 ||
    info.offsets.length !== strips ||
    info.lengths.length !== strips
  )
    throw new Error("TIFF strips are incomplete.");
  const outWidth = orientation >= 5 ? height : width;
  const outHeight = orientation >= 5 ? width : height;
  const rgba = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let strip = 0; strip < strips; strip++) {
    const offset = info.offsets[strip]!;
    const rows = Math.min(info.rows, height - strip * info.rows);
    const length = rows * width * samples;
    if (
      info.lengths[strip]! < length ||
      offset + info.lengths[strip]! > bytes.length
    )
      throw new Error("TIFF pixel data is truncated.");
    for (let row = 0; row < rows; row++)
      for (let x = 0; x < width; x++) {
        const y = strip * info.rows + row;
        const at = offset + (row * width + x) * samples;
        let ox = x;
        let oy = y;
        if (orientation === 2) ox = width - x - 1;
        else if (orientation === 3) {
          ox = width - x - 1;
          oy = height - y - 1;
        } else if (orientation === 4) oy = height - y - 1;
        else if (orientation === 5) {
          ox = y;
          oy = x;
        } else if (orientation === 6) {
          ox = height - y - 1;
          oy = x;
        } else if (orientation === 7) {
          ox = height - y - 1;
          oy = width - x - 1;
        } else if (orientation === 8) {
          ox = y;
          oy = width - x - 1;
        }
        const to = (oy * outWidth + ox) * 4;
        const alpha = hasAlpha ? bytes[at + samples - 1]! : 255;
        for (let channel = 0; channel < 3; channel++) {
          const colour = bytes[at + (grey ? 0 : channel)]!;
          const value = grey && info.photo === 0 ? 255 - colour : colour;
          rgba[to + channel] =
            hasAlpha && info.alpha === 1
              ? alpha
                ? Math.min(255, (value * 255) / alpha)
                : 0
              : value;
        }
        rgba[to + 3] = alpha;
      }
  }
  return createImageBitmap(new ImageData(rgba, outWidth, outHeight));
}
