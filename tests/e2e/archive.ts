/**
 * ZIP reader for the download suite.
 *
 * The product writes its own ZIP, so the test reads its own ZIP: parsing the
 * central directory here rather than shelling out to an unzip tool means the
 * assertions are about the bytes the user receives, not about whether some
 * other program is forgiving.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";
import { sleep, waitFor } from "../lib/cdp.ts";

export type ZipEntryInfo = {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  crc: number;
  localOffset: number;
};

export type ZipInfo = {
  entries: ZipEntryInfo[];
  /** Entry count as recorded in the end-of-central-directory record. */
  declaredEntries: number;
  bytes: Buffer;
};

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

export function hasZipSignature(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.readUInt32LE(0) === SIG_LOCAL;
}

export function readZip(path: string): ZipInfo {
  const bytes = readFileSync(path);

  // The EOCD sits at the end, after a comment of up to 64 KB.
  let eocd = -1;
  for (let at = bytes.length - 22; at >= 0 && at >= bytes.length - 22 - 65_535; at -= 1) {
    if (bytes.readUInt32LE(at) === SIG_EOCD) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) throw new Error("No end-of-central-directory record: this is not a valid ZIP");

  const declaredEntries = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);

  const entries: ZipEntryInfo[] = [];
  let at = centralOffset;
  while (at + 46 <= bytes.length && bytes.readUInt32LE(at) === SIG_CENTRAL) {
    const method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16);
    const compressedSize = bytes.readUInt32LE(at + 20);
    const uncompressedSize = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const localOffset = bytes.readUInt32LE(at + 42);
    entries.push({
      name: bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8"),
      compressedSize,
      uncompressedSize,
      method,
      crc,
      localOffset,
    });
    at += 46 + nameLength + extraLength + commentLength;
  }

  return { entries, declaredEntries, bytes };
}

/** Pulls one entry's bytes out, following its local header. */
export function extractEntry(zip: ZipInfo, name: string): Buffer | null {
  const entry = zip.entries.find((e) => e.name === name);
  if (!entry) return null;
  const { bytes } = zip;
  const at = entry.localOffset;
  if (bytes.readUInt32LE(at) !== SIG_LOCAL) return null;
  const nameLength = bytes.readUInt16LE(at + 26);
  const extraLength = bytes.readUInt16LE(at + 28);
  const start = at + 30 + nameLength + extraLength;
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`Unsupported compression method ${entry.method} for ${name}`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* -------------------------------------------------------------------------- */
/* Waiting for Chrome to finish writing a download                             */
/* -------------------------------------------------------------------------- */

export type DownloadedFile = { name: string; path: string; size: number };

/**
 * Waits for a settled download matching `match`.
 *
 * Chrome writes `*.crdownload` while a transfer is in flight, so a file is only
 * considered finished when that marker is gone and its size has stopped moving.
 */
export async function waitForDownload(
  dir: string,
  match: RegExp,
  timeoutMs = 90_000,
  ignore: ReadonlySet<string> = new Set(),
): Promise<DownloadedFile> {
  const found = await waitFor(
    `a download matching ${match}`,
    timeoutMs,
    async () => {
      if (!existsSync(dir)) return null;
      const names = readdirSync(dir);
      if (names.some((n) => n.endsWith(".crdownload"))) return null;
      const hit = names.find((n) => match.test(n) && !ignore.has(n));
      if (!hit) return null;
      const path = join(dir, hit);
      const first = statSync(path).size;
      if (first === 0) return null;
      await sleep(200);
      const second = statSync(path).size;
      return first === second ? { name: hit, path, size: second } : null;
    },
    250,
  );
  return found;
}
