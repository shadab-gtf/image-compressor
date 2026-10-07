import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatBytes,
  formatCount,
  formatDimensions,
  formatPercent,
  parseBytes,
  savingsPercent,
} from "@/lib/bytes";

describe("formatBytes", () => {
  it("renders exactly zero as '0 B' rather than '0.0 B'", () => {
    assert.equal(formatBytes(0), "0 B");
  });

  it("renders raw byte counts with no decimal places", () => {
    assert.equal(formatBytes(1), "1 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(999), "999 B");
  });

  it("switches to KB at exactly 1000 bytes, using decimal units not 1024", () => {
    assert.equal(formatBytes(999), "999 B");
    assert.equal(formatBytes(1000), "1.0 KB");
    assert.equal(formatBytes(1024), "1.0 KB");
  });

  it("switches to MB at exactly 1,000,000 bytes", () => {
    assert.equal(formatBytes(1_000_000), "1.0 MB");
    assert.equal(formatBytes(1_500_000), "1.5 MB");
  });

  it("switches to GB at exactly 1,000,000,000 bytes", () => {
    assert.equal(formatBytes(1_000_000_000), "1.0 GB");
    assert.equal(formatBytes(1_234_567_890), "1.2 GB");
  });

  it("drops the decimal once a value reaches three significant digits", () => {
    assert.equal(formatBytes(99_900), "99.9 KB");
    assert.equal(formatBytes(100_000), "100 KB");
  });

  it("stops at GB rather than inventing a TB unit", () => {
    assert.equal(formatBytes(5_000_000_000_000), "5000 GB");
  });

  it("honours an explicit decimal-places override", () => {
    assert.equal(formatBytes(1_500_000, 3), "1.500 MB");
    assert.equal(formatBytes(1_500_000, 0), "2 MB");
    assert.equal(formatBytes(1500, 2), "1.50 KB");
  });

  it("returns an em dash for negative, infinite and NaN inputs", () => {
    assert.equal(formatBytes(-1), "—");
    assert.equal(formatBytes(-1_000_000), "—");
    assert.equal(formatBytes(Number.POSITIVE_INFINITY), "—");
    assert.equal(formatBytes(Number.NEGATIVE_INFINITY), "—");
    assert.equal(formatBytes(Number.NaN), "—");
  });

  it("BUG: rounds 999,999 B up to '1000 KB' instead of promoting it to '1.0 MB'", () => {
    // The unit loop stops while value is 999.999, then toFixed(0) rounds the
    // mantissa to 1000 — a number that should never appear next to a unit.
    assert.equal(formatBytes(999_999), "1.0 MB");
    assert.equal(formatBytes(999_999_999), "1.0 GB");
  });
});

describe("parseBytes", () => {
  it("treats a bare number as kilobytes, matching the target-size input", () => {
    assert.equal(parseBytes("500"), 500_000);
  });

  it("parses an explicit kb suffix", () => {
    assert.equal(parseBytes("500kb"), 500_000);
    assert.equal(parseBytes("500KB"), 500_000);
  });

  it("parses a decimal value with a space before the unit", () => {
    assert.equal(parseBytes("1.2 MB"), 1_200_000);
    assert.equal(parseBytes("0.5mb"), 500_000);
  });

  it("tolerates leading and trailing whitespace", () => {
    assert.equal(parseBytes("  2mb "), 2_000_000);
  });

  it("parses every supported unit at its decimal scale", () => {
    assert.equal(parseBytes("500b"), 500);
    assert.equal(parseBytes("1gb"), 1_000_000_000);
  });

  it("rounds fractional byte counts to a whole number", () => {
    assert.equal(parseBytes("1.0005kb"), 1001);
  });

  it("returns null for text that is not a size", () => {
    assert.equal(parseBytes("garbage"), null);
    assert.equal(parseBytes(""), null);
    assert.equal(parseBytes("."), null);
    assert.equal(parseBytes("mb"), null);
    assert.equal(parseBytes("1e3"), null);
  });

  it("returns null for an unsupported unit rather than guessing", () => {
    assert.equal(parseBytes("500 TB"), null);
    assert.equal(parseBytes("500 bytes"), null);
  });

  it("returns null for zero and for negative sizes", () => {
    assert.equal(parseBytes("0"), null);
    assert.equal(parseBytes("0kb"), null);
    assert.equal(parseBytes("0.0"), null);
    assert.equal(parseBytes("-5"), null);
    assert.equal(parseBytes("-5mb"), null);
  });

  it("BUG: accepts a malformed number with two decimal points", () => {
    // /[\d.]+/ happily matches "1.2.3"; parseFloat then silently keeps "1.2".
    assert.equal(parseBytes("1.2.3"), null);
  });
});

describe("savingsPercent", () => {
  it("reports the percentage of the original that was saved", () => {
    assert.equal(savingsPercent(1000, 500), 50);
    assert.equal(savingsPercent(1000, 250), 75);
    assert.equal(savingsPercent(1000, 1000), 0);
  });

  it("goes negative when the output is LARGER than the input", () => {
    assert.equal(savingsPercent(1000, 1500), -50);
    assert.equal(savingsPercent(100, 400), -300);
  });

  it("returns 0 for a zero or negative original size instead of dividing by zero", () => {
    assert.equal(savingsPercent(0, 500), 0);
    assert.equal(savingsPercent(-100, 500), 0);
  });

  it("reports 100 when the output is empty", () => {
    assert.equal(savingsPercent(1000, 0), 100);
  });
});

describe("formatPercent", () => {
  it("renders one decimal place by default", () => {
    assert.equal(formatPercent(50), "50.0%");
    assert.equal(formatPercent(0), "0.0%");
  });

  it("honours an explicit precision and rounds to it", () => {
    assert.equal(formatPercent(12.345, 2), "12.35%");
    assert.equal(formatPercent(12.345, 0), "12%");
  });

  it("keeps the minus sign for a negative saving", () => {
    assert.equal(formatPercent(-12.5), "-12.5%");
  });

  it("returns an em dash for infinite and NaN values", () => {
    assert.equal(formatPercent(Number.NaN), "—");
    assert.equal(formatPercent(Number.POSITIVE_INFINITY), "—");
  });
});

describe("formatDimensions and formatCount", () => {
  it("joins dimensions with a spaced 'x'", () => {
    assert.equal(formatDimensions(1920, 1080), "1920 x 1080");
  });

  it("groups large counts with thousands separators", () => {
    assert.equal(formatCount(0), "0");
    assert.equal(formatCount(1234567), "1,234,567");
  });
});
