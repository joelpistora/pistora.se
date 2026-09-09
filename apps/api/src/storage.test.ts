import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createStorage, PathError, type Storage } from "./storage.js";

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

test("forUser rejects bad ids before touching the filesystem", () => {
  assert.throws(() => storage.forUser("../root"), PathError);
  assert.throws(() => storage.forUser(""), PathError);
  assert.throws(() => storage.forUser("has space"), PathError);
});

test("forUser scopes to users/<id> when the dir exists", () => {
  fs.mkdirSync(path.join(root, "users/joel"), { recursive: true });
  const scoped = storage.forUser("joel");
  assert.equal(scoped.root, path.join(storage.root, "users/joel"));
  assert.equal(scoped.resolve("a.txt"), path.join(storage.root, "users/joel/a.txt"));
});
