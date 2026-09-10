import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createStorage, ensureUserDir, PathError, type Storage } from "./storage.js";

let root: string;
let storage: Storage;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pistora-storage-test-"));
  storage = createStorage(root);
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function expectReject(userPath: string, code: string, statusCode: number) {
  assert.throws(
    () => storage.resolve(userPath),
    (err: unknown) => {
      assert.ok(err instanceof PathError, `expected PathError for ${JSON.stringify(userPath)}`);
      assert.equal(err.code, code);
      assert.equal(err.statusCode, statusCode);
      return true;
    },
  );
}

test("allows a plain nested path", () => {
  assert.equal(storage.resolve("photos/2026/img.jpg"), path.join(storage.root, "photos/2026/img.jpg"));
});

test("normalises . segments", () => {
  assert.equal(storage.resolve("foo/./bar"), path.join(storage.root, "foo/bar"));
});

test('"" and "." resolve to the root itself', () => {
  assert.equal(storage.resolve(""), storage.root);
  assert.equal(storage.resolve("."), storage.root);
});

test("rejects a leading ../ escape", () => {
  expectReject("../etc/passwd", "path_escape", 403);
});

test("rejects a mid-path escape that nets out above the root", () => {
  expectReject("foo/../../bar", "path_escape", 403);
});

test("rejects an absolute POSIX path", () => {
  expectReject("/etc/passwd", "bad_path", 400);
});

test("rejects a Windows drive path", () => {
  expectReject("C:\\Windows\\system32", "bad_path", 400);
});

test("rejects a NUL byte", () => {
  expectReject("foo\0.txt", "bad_path", 400);
});

test("rejects a symlink that points outside the root", () => {
  const link = path.join(root, "evil");
  fs.symlinkSync("/etc", link);
  try {
    expectReject("evil/passwd", "path_escape", 403);
  } finally {
    fs.rmSync(link, { force: true });
  }
});

test("allows a symlink that stays inside the root", () => {
  fs.mkdirSync(path.join(root, "real"), { recursive: true });
  const link = path.join(root, "alias");
  fs.symlinkSync(path.join(root, "real"), link);
  try {
    assert.equal(storage.resolve("alias/note.txt"), path.join(root, "alias/note.txt"));
  } finally {
    fs.rmSync(link, { force: true });
    fs.rmSync(path.join(root, "real"), { recursive: true, force: true });
  }
});

test("allows a deeply nested not-yet-existing path", () => {
  assert.equal(
    storage.resolve("a/b/c/d/e/f/g.txt"),
    path.join(storage.root, "a/b/c/d/e/f/g.txt"),
  );
});

test("forUser rejects an unsafe folder key before touching the filesystem", () => {
  for (const bad of ["../root", "", "has space", ".hidden", "a/b", "a..b", "évil"]) {
    assert.throws(() => storage.forUser(bad), PathError, `expected reject: ${JSON.stringify(bad)}`);
  }
});

test("forUser scopes to users/<key> (email or slug) when the dir exists", () => {
  for (const key of ["joel", "joel@pistora.se"]) {
    fs.mkdirSync(path.join(root, "users", key), { recursive: true });
    const scoped = storage.forUser(key);
    assert.equal(scoped.root, path.join(storage.root, "users", key));
    assert.equal(scoped.resolve("a.txt"), path.join(storage.root, "users", key, "a.txt"));
  }
});

test("ensureUserDir creates users/<email>, is idempotent, and scopes there", () => {
  const key = "someone@example.com";
  const scoped = ensureUserDir(storage, key);
  assert.ok(fs.statSync(path.join(root, "users", key)).isDirectory());
  assert.equal(scoped.root, path.join(storage.root, "users", key));
  const again = ensureUserDir(storage, key); // second call must not throw
  assert.equal(again.root, scoped.root);
});

test("ensureUserDir rejects a bad key without touching the filesystem", () => {
  assert.throws(() => ensureUserDir(storage, "../evil"), (err: unknown) => {
    assert.ok(err instanceof PathError);
    assert.equal(err.code, "bad_user");
    return true;
  });
  assert.equal(fs.existsSync(path.join(root, "users", "..evil")), false);
});
