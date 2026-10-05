import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatFundAmount,
  parseFundAmount,
} from "../src/lib/fund";

assert.equal(parseFundAmount(0), 0);
assert.equal(parseFundAmount("1234567"), 1234567);
assert.equal(parseFundAmount("1,234,567"), 1234567);
assert.equal(parseFundAmount("100万"), 1_000_000);
assert.equal(parseFundAmount("1.5万"), 15_000);
assert.equal(parseFundAmount(-1), null);
assert.equal(parseFundAmount("abc"), null);
assert.equal(formatFundAmount(null), "尚未公示");
assert.equal(formatFundAmount(1234567), "1,234,567");

console.log("guild fund parse checks passed");

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-fund-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");
    const empty = db.getGuildFund();
    assert.equal(empty.amount, null);

    const saved = db.setGuildFund(250000, "admin");
    assert.equal(saved.amount, 250000);
    assert.equal(saved.updatedBy, "admin");
    assert.ok(saved.updatedAt);

    const loaded = db.getGuildFund();
    assert.equal(loaded.amount, 250000);
    assert.equal(loaded.updatedBy, "admin");
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("guild fund db checks passed");
}

void main();
