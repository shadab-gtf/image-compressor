/**
 * ZIP writer.
 *
 * Hand-written rather than pulled from a library, for three reasons:
 *
 *  - Output images are *already* compressed. Running DEFLATE over a JPEG costs
 *    CPU and saves nothing, so entries are stored, and the only thing that gets
 *    stored alongside them is the small text manifest.
 *  - CRC checksums are read in streaming chunks. Original blobs are reused as
 *    output parts without retaining an ArrayBuffer copy of every file.
 *  - It keeps a file-producing code path free of third-party code.
 *
 * Format: PKZIP APPNOTE 6.3.2, store method, no ZIP64. The limits that implies
 * are checked and reported rather than silently producing a corrupt archive.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length; i += 1) {
        crc = CRC_TABLE[(crc ^ value[i]!) & 0xff]! ^ (crc >>> 8);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, which is what the ZIP header format predates its way into. */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2) & 0x1f),
    date:
      ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export type ZipEntry = { name: string; data: Blob };

export const ZIP_LIMITS = {
  maxEntries: 65_535,
  maxTotalBytes: 0xffffffff, // 4 GB - 1
} as const;

/**
 * Ensures every entry name is unique and safe.
 *
 * Duplicate names are the common case — "image.jpg" from three different
 * folders — and a ZIP with repeated names extracts unpredictably, with most
 * tools silently overwriting. Path separators and traversal segments are
 * stripped so an archive can never write outside its extraction directory.
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((raw) => {
    let safe =
      raw
        .normalize("NFC")
        .replace(/[<>:"/\\|?*]+/g, "_")
        .replace(/^\.+/, "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .replace(/[. ]+$/, "") || "image";
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;

    const dot = safe.lastIndexOf(".");
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : "";
    let candidate = safe;
    let count = 1;
    while (seen.has(candidate.toLowerCase())) {
      candidate = `${stem} (${count})${ext}`;
      count += 1;
    }
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}

export async function createZip(
  entries: ZipEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  return buildZip(entries, onProgress);
}

export interface ZipSink { write: (chunk: Blob | Uint8Array<ArrayBuffer> | ArrayBuffer) => Promise<void> }
/** Write each header and source blob directly, retaining only the small central directory. */
export async function streamZip(entries: ZipEntry[], sink: ZipSink, onProgress?: (done: number, total: number) => void): Promise<void> {
  await buildZip(entries, onProgress, sink);
}

async function buildZip(entries: ZipEntry[], onProgress?: (done: number, total: number) => void, sink?: ZipSink): Promise<Blob> {
  if (entries.length > ZIP_LIMITS.maxEntries) {
    throw new Error(
      `A single ZIP can hold ${ZIP_LIMITS.maxEntries} files; this batch has ${entries.length}.`,
    );
  }

  const encoder = new TextEncoder();
  const names = uniqueNames(entries.map((entry) => entry.name)).map((name) => encoder.encode(name));
  let projectedSize = 22;
  entries.forEach((entry, i) => {
    const name = names[i]!;
    if (name.length > 65_535) throw new Error("An archive filename is too long.");
    projectedSize += entry.data.size + 76 + 2 * name.length;
    if (entry.data.size >= ZIP_LIMITS.maxTotalBytes || projectedSize >= ZIP_LIMITS.maxTotalBytes) {
      throw new Error("This archive exceeds the 4 GB ZIP limit. Download in smaller selections.");
    }
  });
  const parts: BlobPart[] = [];
  // Pinned to ArrayBuffer (not ArrayBufferLike) so these satisfy BlobPart.
  const central: Uint8Array<ArrayBuffer>[] = [];
  const { time, date } = dosDateTime(new Date());

  let offset = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const nameBytes = names[i]!;
    const crc = await crc32(entry.data);
    const size = entry.data.size;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // flags: UTF-8 names
    local.setUint16(8, 0, true); // method: store
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra field length

    if (sink) { await sink.write(local.buffer); await sink.write(nameBytes); await sink.write(entry.data); }
    else parts.push(local.buffer, nameBytes, entry.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); // central directory signature
    dir.setUint16(4, 20, true); // version made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true); // relative offset of local header

    const record = new Uint8Array(46 + nameBytes.length);
    record.set(new Uint8Array(dir.buffer), 0);
    record.set(nameBytes, 46);
    central.push(record);

    offset += 30 + nameBytes.length + size;
    if (offset > ZIP_LIMITS.maxTotalBytes) {
      throw new Error(
        "This archive would exceed the 4 GB limit of the ZIP format. Download in smaller selections.",
      );
    }

    onProgress?.(i + 1, entries.length);
  }

  const centralSize = central.reduce((sum, record) => sum + record.length, 0);

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  if (sink) { for (const record of central) await sink.write(record); await sink.write(end.buffer); return new Blob([], { type: "application/zip" }); }
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}

/** Compresses text with the platform deflate — used for the manifest entry. */
export async function deflateText(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
