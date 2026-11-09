import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import zlib from "node:zlib";
import { makeApp, makeAuthedApp, seedUser, loginCookie } from "../test-helpers.js";

/** Minimal ZIP reader (ZIP64-aware) so tests need no dependency. */
function readZip(buf: Buffer): Map<string, Buffer | null> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, "no EOCD");
  const loc = eocd - 20;
  assert.equal(buf.readUInt32LE(loc), 0x07064b50, "no zip64 locator");
  const z64 = Number(buf.readBigUInt64LE(loc + 8));
  assert.equal(buf.readUInt32LE(z64), 0x06064b50);
  const count = Number(buf.readBigUInt64LE(z64 + 32));
  let p = Number(buf.readBigUInt64LE(z64 + 48));

  const out = new Map<string, Buffer | null>();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const extra = p + 46 + nameLen;
    assert.equal(buf.readUInt16LE(extra), 1);
    const usize = Number(buf.readBigUInt64LE(extra + 4));
    const csize = Number(buf.readBigUInt64LE(extra + 12));
    const lho = Number(buf.readBigUInt64LE(extra + 20));

    assert.equal(buf.readUInt32LE(lho), 0x04034b50);
    const dataStart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    if (name.endsWith("/")) {
      out.set(name, null);
    } else {
      const raw = buf.subarray(dataStart, dataStart + csize);
      const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
      assert.equal(data.length, usize);
      assert.equal(zlib.crc32(data), crc);
      out.set(name, Buffer.from(data));
    }
    p += 46 + nameLen + extraLen;
  }
  return out;
}

function seedTree(userDir: string) {
  fs.mkdirSync(path.join(userDir, "photos/2026"), { recursive: true });
  fs.mkdirSync(path.join(userDir, "photos/empty"), { recursive: true });
  fs.writeFileSync(path.join(userDir, "photos/a.txt"), "hello ".repeat(1000));
  fs.writeFileSync(path.join(userDir, "photos/2026/åäö ✓.txt"), "unicode");
  fs.writeFileSync(path.join(userDir, "photos/pic.jpg"), Buffer.from([1, 2, 3, 4]));
  fs.writeFileSync(path.join(userDir, "photos/.upload-abc-123.part"), "partial");
}

test("GET folder?download=1 streams a valid zip with the whole tree", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  seedTree(userDir);

  const res = await app.inject({
    method: "GET",
    url: "/api/files/photos?download=1",
    headers: { cookie },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/zip");
  assert.match(String(res.headers["content-disposition"]), /^attachment; filename="photos\.zip"/);

  const zip = readZip(res.rawPayload);
  assert.deepEqual([...zip.keys()].sort(), [
    "photos/",
    "photos/2026/",
    "photos/2026/åäö ✓.txt",
    "photos/a.txt",
    "photos/empty/",
    "photos/pic.jpg",
  ]);
  assert.equal(zip.get("photos/a.txt")!.toString(), "hello ".repeat(1000));
  assert.equal(zip.get("photos/2026/åäö ✓.txt")!.toString(), "unicode");
  assert.deepEqual([...zip.get("photos/pic.jpg")!], [1, 2, 3, 4]);
});

test("a folder without ?download still lists", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  seedTree(userDir);
  const res = await app.inject({ method: "GET", url: "/api/files/photos", headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json().entries));
});

test("root download is named files.zip", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  fs.writeFileSync(path.join(userDir, "x.txt"), "x");
  const res = await app.inject({ method: "GET", url: "/api/files/?download=1", headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-disposition"]), /files\.zip/);
  assert.ok(readZip(res.rawPayload).has("files/x.txt"));
});

test("symlinks are left out of the zip", async (t) => {
  const { app, userDir, cookie } = await makeAuthedApp(t);
  fs.mkdirSync(path.join(userDir, "d"));
  fs.writeFileSync(path.join(userDir, "d/real.txt"), "r");
  fs.symlinkSync("/etc/hostname", path.join(userDir, "d/link"));
  const res = await app.inject({ method: "GET", url: "/api/files/d?download=1", headers: { cookie } });
  assert.deepEqual([...readZip(res.rawPayload).keys()].sort(), ["d/", "d/real.txt"]);
});

test("shared folders download as zip for recipients, links and respect the shared subtree", async (t) => {
  const { app } = await makeApp(t);
  const owner = seedUser(app, { email: "owner@pistora.test" });
  const guest = seedUser(app, { email: "guest@pistora.test" });
  const ownerCookie = await loginCookie(app, owner.email, owner.password);
  const guestCookie = await loginCookie(app, guest.email, guest.password);
  const ownerDir = path.join(app.storage.root, "users", owner.email);
  fs.mkdirSync(path.join(ownerDir, "pub/sub"), { recursive: true });
  fs.writeFileSync(path.join(ownerDir, "pub/sub/f.txt"), "shared");
  fs.writeFileSync(path.join(ownerDir, "private.txt"), "nope");

  const mk = async (payload: object) =>
    (await app.inject({ method: "POST", url: "/api/shares", headers: { cookie: ownerCookie }, payload })).json();
  const userShare = await mk({ path: "pub", with: guest.email });
  const linkShare = await mk({ path: "pub", link: true });

  const viaUser = await app.inject({
    method: "GET",
    url: `/api/shares/${userShare.id}/files?download=1`,
    headers: { cookie: guestCookie },
  });
  assert.equal(viaUser.statusCode, 200);
  assert.deepEqual([...readZip(viaUser.rawPayload).keys()].sort(), ["pub/", "pub/sub/", "pub/sub/f.txt"]);

  const viaSub = await app.inject({
    method: "GET",
    url: `/api/public/${linkShare.token}/files/sub?download=1`,
    headers: {},
  });
  assert.equal(viaSub.statusCode, 200);
  assert.deepEqual([...readZip(viaSub.rawPayload).keys()].sort(), ["sub/", "sub/f.txt"]);

  const escape = await app.inject({
    method: "GET",
    url: `/api/public/${linkShare.token}/files/..?download=1`,
  });
  assert.ok([400, 403, 404].includes(escape.statusCode), String(escape.statusCode));
});
