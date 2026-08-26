import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_AUCTION_TAX_RATE,
  formatAuctionTaxPercent,
  normalizeAuctionTaxRate,
  parseAuctionTaxPercent,
} from "../src/lib/auction/tax";

assert.equal(parseAuctionTaxPercent(0), 0);
assert.equal(parseAuctionTaxPercent(5), 0.05);
assert.equal(parseAuctionTaxPercent("10"), 0.1);
assert.equal(parseAuctionTaxPercent(-0.1), null);
assert.equal(parseAuctionTaxPercent(10.1), null);
assert.equal(parseAuctionTaxPercent("abc"), null);

assert.equal(normalizeAuctionTaxRate(undefined), DEFAULT_AUCTION_TAX_RATE);
assert.equal(normalizeAuctionTaxRate(0.08), 0.08);
assert.equal(normalizeAuctionTaxRate(-1), 0);
assert.equal(normalizeAuctionTaxRate(1), 0.1);
assert.equal(formatAuctionTaxPercent(0.075), 7.5);

const originalCwd = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-auction-tax-"));
try {
  process.chdir(tempDir);
  const { createDraftSession, updateSessionSchedule, updateSessionTaxRate } =
    await import("../src/lib/db");

  const created = createDraftSession({
    scheduledStart: null,
    durationMinutes: 30,
    taxRate: 0.075,
  });
  assert.equal(created.taxRate, 0.075);

  const updated = updateSessionSchedule(created.id, {
    scheduledStart: null,
    taxRate: 0.1,
  });
  assert.equal(updated?.taxRate, 0.1);

  const reset = updateSessionTaxRate(created.id, 0);
  assert.equal(reset.taxRate, 0);
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("auction session tax checks passed");
