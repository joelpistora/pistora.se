import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { dirSize } from "./fs-usage.js";

let root: string;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pistora-usage-"));
});
after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test("dirSize sums regular files recursively", () => {
  fs.mkdirSync(path.join(root, "a/b"), { recursive: true });
  fs.writeFileSync(path.join(root, "top.txt"), "x".repeat(100));
  fs.writeFileSync(path.join(root, "a/mid.txt"), "y".repeat(50));
  fs.writeFileSync(path.join(root, "a/b/deep.txt"), "z".repeat(25));
  return dirSize(root).then((n) => assert.equal(n, 175));
});

test("dirSize skips .upload-*.part temp files and symlinks", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pistora-usage2-"));
  fs.writeFileSync(path.join(d, "real.bin"), "a".repeat(10));
  fs.writeFileSync(path.join(d, ".upload-deadbeef-0.part"), "b".repeat(9999));
  try {
    fs.symlinkSync(path.join(d, "real.bin"), path.join(d, "link.bin"));
  } catch {
    // symlinks may be unavailable — the temp-file assertion still holds
  }
  assert.equal(await dirSize(d), 10);
  fs.rmSync(d, { recursive: true, force: true });
});

test("dirSize of a missing directory is 0", async () => {
  assert.equal(await dirSize(path.join(root, "nope")), 0);
});
