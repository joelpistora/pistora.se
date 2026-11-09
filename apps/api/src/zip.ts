import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline, Readable } from "node:stream";
import zlib from "node:zlib";

/**
 * Streaming ZIP writer for folder downloads — no dependencies, constant memory.
 *
 * Every file is emitted as local header → data → data descriptor (general
 * purpose flag bit 3), so nothing is buffered and the total size needn't be
 * known up front. All sizes/offsets are ZIP64 so folders over 4 GiB work; the
 * result opens in Info-ZIP, macOS Archive Utility, Windows Explorer and 7-Zip.
 * Symlinks, specials and in-progress upload temp files are skipped (same
 * visibility rules as directory listings).
 */

const UPLOAD_TEMP_RE = /^\.upload-[0-9a-fA-F-]+\.part$/;
const U32_MAX = 0xffffffff;

/** Already-compressed formats: deflating them burns CPU for ~0% gain. */
const STORE_EXT = new Set([
  ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".zst",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".avif",
  ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac",
  ".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi",
  ".pdf", ".docx", ".xlsx", ".pptx", ".epub",
]);

interface CentralEntry {
  name: string;
  isDir: boolean;
  method: number;
  crc: number;
  csize: number;
  usize: number;
  offset: number;
  date: number;
  time: number;
}

function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(d.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

function u64(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

const FLAG_UTF8 = 0x0800;
const FLAG_DESCRIPTOR = 0x0008;

function localHeader(e: Pick<CentralEntry, "name" | "isDir" | "method" | "date" | "time">): Buffer {
  const name = Buffer.from(e.name, "utf8");
  // Files carry a ZIP64 extra (zeroed; real sizes follow in the data descriptor).
  const extra = e.isDir ? Buffer.alloc(0) : Buffer.concat([Buffer.from([1, 0, 16, 0]), Buffer.alloc(16)]);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(e.isDir ? 20 : 45, 4);
  h.writeUInt16LE(FLAG_UTF8 | (e.isDir ? 0 : FLAG_DESCRIPTOR), 6);
  h.writeUInt16LE(e.method, 8);
  h.writeUInt16LE(e.time, 10);
  h.writeUInt16LE(e.date, 12);
  h.writeUInt32LE(0, 14); // crc — in the descriptor
  h.writeUInt32LE(e.isDir ? 0 : U32_MAX, 18);
  h.writeUInt32LE(e.isDir ? 0 : U32_MAX, 22);
  h.writeUInt16LE(name.length, 26);
  h.writeUInt16LE(extra.length, 28);
  return Buffer.concat([h, name, extra]);
}

function dataDescriptor(e: CentralEntry): Buffer {
  const b = Buffer.alloc(24);
  b.writeUInt32LE(0x08074b50, 0);
  b.writeUInt32LE(e.crc, 4);
  b.writeBigUInt64LE(BigInt(e.csize), 8);
  b.writeBigUInt64LE(BigInt(e.usize), 16);
  return b;
}

function centralHeader(e: CentralEntry): Buffer {
  const name = Buffer.from(e.name, "utf8");
  const extra = Buffer.concat([
    Buffer.from([1, 0, 24, 0]),
    u64(e.usize),
    u64(e.csize),
    u64(e.offset),
  ]);
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE((3 << 8) | 45, 4); // made by: unix, v4.5
  h.writeUInt16LE(45, 6);
  h.writeUInt16LE(FLAG_UTF8 | (e.isDir ? 0 : FLAG_DESCRIPTOR), 8);
  h.writeUInt16LE(e.method, 10);
  h.writeUInt16LE(e.time, 12);
  h.writeUInt16LE(e.date, 14);
  h.writeUInt32LE(e.crc, 16);
  h.writeUInt32LE(U32_MAX, 20);
  h.writeUInt32LE(U32_MAX, 24);
  h.writeUInt16LE(name.length, 28);
  h.writeUInt16LE(extra.length, 30);
  // 32 comment len, 34 disk, 36 internal attrs: 0
  const mode = e.isDir ? 0o040755 : 0o100644;
  h.writeUInt32LE(((mode << 16) | (e.isDir ? 0x10 : 0)) >>> 0, 38);
  h.writeUInt32LE(U32_MAX, 42);
  return Buffer.concat([h, name, extra]);
}

function endRecords(count: number, cdOffset: number, cdSize: number): Buffer {
  const z64 = Buffer.alloc(56);
  z64.writeUInt32LE(0x06064b50, 0);
  z64.writeBigUInt64LE(44n, 4);
  z64.writeUInt16LE(45, 12);
  z64.writeUInt16LE(45, 14);
  z64.writeBigUInt64LE(BigInt(count), 24);
  z64.writeBigUInt64LE(BigInt(count), 32);
  z64.writeBigUInt64LE(BigInt(cdSize), 40);
  z64.writeBigUInt64LE(BigInt(cdOffset), 48);

  const loc = Buffer.alloc(20);
  loc.writeUInt32LE(0x07064b50, 0);
  loc.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
  loc.writeUInt32LE(1, 16);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0xffff, 8);
  eocd.writeUInt16LE(0xffff, 10);
  eocd.writeUInt32LE(U32_MAX, 12);
  eocd.writeUInt32LE(U32_MAX, 16);
  return Buffer.concat([z64, loc, eocd]);
}

interface Item {
  abs: string;
  name: string;
  isDir: boolean;
  mtime: Date;
}

/** Depth-first walk; a directory's own entry comes before its children. */
async function* walk(abs: string, prefix: string): AsyncGenerator<Item> {
  let dirents: fs.Dirent[];
  try {
    dirents = await fsp.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }
  dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const d of dirents) {
    if (d.isSymbolicLink() || UPLOAD_TEMP_RE.test(d.name)) continue;
    if (!d.isFile() && !d.isDirectory()) continue;
    const child = path.join(abs, d.name);
    const stats = await fsp.stat(child).catch(() => null);
    if (!stats) continue; // vanished since readdir
    if (d.isDirectory()) {
      yield { abs: child, name: `${prefix}${d.name}/`, isDir: true, mtime: stats.mtime };
      yield* walk(child, `${prefix}${d.name}/`);
    } else {
      yield { abs: child, name: `${prefix}${d.name}`, isDir: false, mtime: stats.mtime };
    }
  }
}

async function* generate(rootAbs: string, rootName: string): AsyncGenerator<Buffer> {
  const entries: CentralEntry[] = [];
  let offset = 0;
  const emit = (b: Buffer) => {
    offset += b.length;
    return b;
  };

  const top = await fsp.stat(rootAbs);
  const rootItem: Item = { abs: rootAbs, name: `${rootName}/`, isDir: true, mtime: top.mtime };

  async function* items(): AsyncGenerator<Item> {
    yield rootItem;
    yield* walk(rootAbs, `${rootName}/`);
  }

  for await (const item of items()) {
    const { date, time } = dosDateTime(item.mtime);

    if (item.isDir) {
      const e: CentralEntry = {
        name: item.name, isDir: true, method: 0, crc: 0, csize: 0, usize: 0,
        offset, date, time,
      };
      yield emit(localHeader(e));
      entries.push(e);
      continue;
    }

    // Open before writing the header so an unreadable file is skipped cleanly.
    let fh: fsp.FileHandle;
    try {
      fh = await fsp.open(item.abs, "r");
    } catch {
      continue;
    }

    const method = STORE_EXT.has(path.extname(item.name).toLowerCase()) ? 0 : 8;
    const e: CentralEntry = {
      name: item.name, isDir: false, method, crc: 0, csize: 0, usize: 0,
      offset, date, time,
    };
    yield emit(localHeader(e));

    const raw = fh.createReadStream();
    const measured = (async function* () {
      for await (const chunk of raw as AsyncIterable<Buffer>) {
        e.crc = zlib.crc32(chunk, e.crc);
        e.usize += chunk.length;
        yield chunk;
      }
    })();
    const source: AsyncIterable<Buffer> =
      method === 8
        ? pipeline(Readable.from(measured), zlib.createDeflateRaw({ level: 6 }), () => {})
        : measured;

    for await (const chunk of source) {
      e.csize += chunk.length;
      yield emit(chunk);
    }
    yield emit(dataDescriptor(e));
    entries.push(e);
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const e of entries) {
    const b = centralHeader(e);
    cdSize += b.length;
    yield b;
  }
  yield endRecords(entries.length, cdOffset, cdSize);
}

/** A readable ZIP of the directory at `rootAbs`, all inside a single `rootName/` folder. */
export function zipDirectory(rootAbs: string, rootName: string): Readable {
  return Readable.from(generate(rootAbs, rootName), { objectMode: false });
}
