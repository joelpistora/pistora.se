import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateOtp,
  generateSessionToken,
  generateUserId,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./crypto.js";

test("hashPassword / verifyPassword round-trips", () => {
  const hash = hashPassword("correct horse battery staple");
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(verifyPassword("correct horse battery staple", hash), true);
});

test("verifyPassword rejects the wrong password", () => {
  const hash = hashPassword("hunter2hunter2");
  assert.equal(verifyPassword("Hunter2Hunter2", hash), false);
});

test("verifyPassword returns false (never throws) on bad stored input", () => {
  assert.equal(verifyPassword("x", null), false);
  assert.equal(verifyPassword("x", ""), false);
  assert.equal(verifyPassword("x", "not-a-hash"), false);
  assert.equal(verifyPassword("x", "scrypt$16384$8$1$only-five-parts"), false);
  assert.equal(verifyPassword("x", "bcrypt$16384$8$1$aaaa$bbbb"), false);
  assert.equal(verifyPassword("x", "scrypt$x$y$z$aaaa$bbbb"), false);
});

test("the same password hashes differently each time (random salt)", () => {
  assert.notEqual(hashPassword("same"), hashPassword("same"));
});

test("generateOtp: length and unambiguous alphabet", () => {
  const otp = generateOtp();
  assert.equal(otp.length, 10);
  assert.match(otp, /^[2-9A-HJKMNP-TV-Z]+$/);
  assert.equal(generateOtp(6).length, 6);
});

test("generateSessionToken is url-safe and ~256-bit; hashToken is stable sha256 hex", () => {
  const tok = generateSessionToken();
  assert.match(tok, /^[A-Za-z0-9_-]+$/);
  assert.ok(tok.length >= 43);
  assert.match(hashToken(tok), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(tok), hashToken(tok));
  assert.notEqual(hashToken(tok), hashToken(generateSessionToken()));
});

test("generateUserId is a uuid that passes the storage USER_ID regex", () => {
  const id = generateUserId();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.match(id, /^[a-z0-9_-]{1,64}$/i);
});
