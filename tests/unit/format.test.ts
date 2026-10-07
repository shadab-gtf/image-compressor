import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { baseName, formatFromExtension, sniffFormat, withExtension } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Fixtures: real magic bytes                                                  */
/* -------------------------------------------------------------------------- */

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/** Pads a header out so every fixture clears the 4-byte minimum length. */
const padded = (head: number[], length = 32): Uint8Array => {
  const out = new Uint8Array(Math.max(length, head.length));
  out.set(head);
  return out;
};

const JPEG = padded([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...ascii("JFIF"), 0x00]);
const PNG = padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const GIF87A = padded([...ascii("GIF87a"), 0x40, 0x00, 0x40, 0x00]);
const GIF89A = padded([...ascii("GIF89a"), 0x40, 0x00, 0x40, 0x00]);
const BMP = padded([...ascii("BM"), 0x36, 0x00, 0x00, 0x00]);
const WEBP = padded([...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBPVP8 ")]);

/** ftyp box: size, "ftyp", major brand, minor version, compatible brands. */
const ftyp = (major: string, ...compatible: string[]): Uint8Array => {
  const body = [...ascii("ftyp"), ...ascii(major), 0x00, 0x00, 0x00, 0x00];
  const brands = compatible.flatMap((brand) => ascii(brand));
  const size = 4 + body.length + brands.length;
  const header = [(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff];
  return padded([...header, ...body, ...brands], size);
};

describe("sniffFormat", () => {
  it("identifies a JPEG from its SOI marker", () => {
    assert.equal(sniffFormat(JPEG), "jpeg");
  });

  it("identifies a PNG from its full 8-byte signature", () => {
    assert.equal(sniffFormat(PNG), "png");
  });

  it("identifies both GIF87a and GIF89a", () => {
    assert.equal(sniffFormat(GIF87A), "gif");
    assert.equal(sniffFormat(GIF89A), "gif");
  });

  it("identifies a BMP from its 'BM' signature", () => {
    assert.equal(sniffFormat(BMP), "bmp");
  });

  it("identifies a WebP only when the RIFF payload is actually WEBP", () => {
    assert.equal(sniffFormat(WEBP), "webp");
  });

  it("rejects a non-WebP RIFF container such as a WAV file", () => {
    const wav = padded([...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WAVEfmt ")]);
    assert.equal(sniffFormat(wav), null);
  });

  it("identifies an AVIF declared through the major ftyp brand", () => {
    assert.equal(sniffFormat(ftyp("avif", "mif1", "miaf")), "avif");
  });

  it("identifies an AVIF image sequence declared as 'avis'", () => {
    assert.equal(sniffFormat(ftyp("avis", "msf1")), "avif");
  });

  it("identifies an AVIF whose brand appears only in the compatible-brand list", () => {
    assert.equal(sniffFormat(ftyp("mif1", "mif1", "avif", "miaf")), "avif");
  });

  it("rejects a non-AVIF ISO-BMFF file such as an MP4", () => {
    assert.equal(sniffFormat(ftyp("isom", "isom", "iso2", "mp41")), null);
  });

  it("returns null for a renamed Windows executable", () => {
    // "MZ" DOS header - deliberately adjacent to BMP's "BM".
    const exe = padded([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
    assert.equal(sniffFormat(exe), null);
  });

  it("returns null for a renamed ELF binary", () => {
    assert.equal(sniffFormat(padded([0x7f, ...ascii("ELF"), 0x02, 0x01, 0x01, 0x00])), null);
  });

  it("returns null for a renamed shell script", () => {
    assert.equal(sniffFormat(padded(ascii("#!/bin/sh\nrm -rf /tmp\n"))), null);
  });

  it("returns null for a renamed ZIP archive", () => {
    assert.equal(sniffFormat(padded([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])), null);
  });

  it("returns null for a header truncated below the 4-byte minimum", () => {
    assert.equal(sniffFormat(bytes()), null);
    assert.equal(sniffFormat(bytes(0xff)), null);
    assert.equal(sniffFormat(bytes(0xff, 0xd8)), null);
    assert.equal(sniffFormat(bytes(0xff, 0xd8, 0xff)), null);
  });

  it("returns null for a PNG signature cut short", () => {
    assert.equal(sniffFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a)), null);
  });

  it("returns null for a GIF signature cut short", () => {
    assert.equal(sniffFormat(bytes(...ascii("GIF89"))), null);
  });

  it("returns null for a RIFF header cut short before the payload tag", () => {
    assert.equal(sniffFormat(bytes(...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00)), null);
    assert.equal(
      sniffFormat(bytes(...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEB"))),
      null,
    );
  });

  it("returns null for an ftyp box cut short before the brand", () => {
    assert.equal(sniffFormat(bytes(0x00, 0x00, 0x00, 0x20, ...ascii("ftyp"))), null);
  });

  it("returns null for all-zero bytes", () => {
    assert.equal(sniffFormat(new Uint8Array(64)), null);
  });

  it("reads from a subarray view without being confused by the byte offset", () => {
    const backing = new Uint8Array(64);
    backing.set(PNG, 16);
    assert.equal(sniffFormat(backing.subarray(16)), "png");
  });
});

describe("formatFromExtension", () => {
  it("maps both .jpg and .jpeg onto the jpeg format", () => {
    assert.equal(formatFromExtension("photo.jpg"), "jpeg");
    assert.equal(formatFromExtension("photo.jpeg"), "jpeg");
  });

  it("maps every other supported extension", () => {
    assert.equal(formatFromExtension("a.png"), "png");
    assert.equal(formatFromExtension("a.webp"), "webp");
    assert.equal(formatFromExtension("a.avif"), "avif");
    assert.equal(formatFromExtension("a.gif"), "gif");
    assert.equal(formatFromExtension("a.bmp"), "bmp");
  });

  it("ignores extension case", () => {
    assert.equal(formatFromExtension("PHOTO.JPG"), "jpeg");
    assert.equal(formatFromExtension("Photo.PnG"), "png");
  });

  it("uses only the final extension of a multi-dot name", () => {
    assert.equal(formatFromExtension("archive.tar.gz"), null);
    assert.equal(formatFromExtension("my.photo.v2.webp"), "webp");
  });

  it("returns null for an unsupported extension", () => {
    assert.equal(formatFromExtension("doc.pdf"), null);
    assert.equal(formatFromExtension("page.html"), null);
    assert.equal(formatFromExtension("photo.tiff"), null);
  });

  it("returns null for a trailing dot with no extension", () => {
    assert.equal(formatFromExtension("photo."), null);
  });

  it("BUG: treats a bare filename equal to an extension as that format", () => {
    // "png" has no dot at all, so there is no extension to read - but
    // "png".split(".").pop() is "png" and the lookup matches it anyway.
    assert.equal(formatFromExtension("png"), null);
    assert.equal(formatFromExtension("jpg"), null);
  });
});

describe("withExtension", () => {
  it("replaces the final extension", () => {
    assert.equal(withExtension("photo.jpg", "webp"), "photo.webp");
  });

  it("appends an extension to a name that has none", () => {
    assert.equal(withExtension("photo", "webp"), "photo.webp");
  });

  it("keeps every earlier dot in a multi-dot name", () => {
    assert.equal(withExtension("my.photo.v2.jpg", "webp"), "my.photo.v2.webp");
  });

  it("treats a leading dot as part of the name, not as an extension", () => {
    assert.equal(withExtension(".gitignore", "webp"), ".gitignore.webp");
  });

  it("preserves spaces and non-ascii characters in the stem verbatim", () => {
    assert.equal(withExtension("my photo ü.jpeg", "avif"), "my photo ü.avif");
  });
});

describe("baseName", () => {
  it("strips the final extension", () => {
    assert.equal(baseName("photo.jpg"), "photo");
  });

  it("returns the whole name when there is no extension", () => {
    assert.equal(baseName("photo"), "photo");
    assert.equal(baseName(""), "");
  });

  it("keeps every dot but the last in a multi-dot name", () => {
    assert.equal(baseName("my.photo.v2.jpg"), "my.photo.v2");
  });

  it("keeps a dotfile name intact", () => {
    assert.equal(baseName(".gitignore"), ".gitignore");
  });

  it("drops a trailing dot along with the empty extension", () => {
    assert.equal(baseName("photo."), "photo");
  });
});
