import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DirListing, FileEntry } from "shared";
import { contentTypeFor } from "./mime.js";

/** Shared by the owner's file routes and the share routes: listing + streaming. */

/** In-progress upload files: `.upload-<uuid>.part`, written into the destination
 * directory then atomically renamed. Listed nowhere and swept on the next
 * listing of the directory they're in. */
export const UPLOAD_TEMP_PREFIX = ".upload-";
const UPLOAD_TEMP_RE = /^\.upload-[0-9a-fA-F-]+\.part$/;

export function toEntry(name: string, stats: fs.Stats): FileEntry {
  const isDir = stats.isDirectory();
  return {
    name,
    type: isDir ? "directory" : "file",
    size: isDir ? 0 : stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

export function isoOrMtime(stats: fs.Stats): string {
  const birth = stats.birthtime.getTime();
  return birth > 0 ? stats.birthtime.toISOString() : stats.mtime.toISOString();
}

export function normaliseRel(rel: string): string {
  const norm = path.posix.normalize(rel).replace(/^\.?\/+/, "").replace(/\/+$/, "");
  return norm === "." ? "" : norm;
}

export async function listDirectory(abs: string, rel: string): Promise<DirListing> {
  const dirents = await fsp.readdir(abs, { withFileTypes: true });

  const visible = dirents.filter(
    (d) =>
      // Only regular files and directories; no symlinks or specials.
      !d.isSymbolicLink() &&
      (d.isFile() || d.isDirectory()) &&
      // Hide in-progress / orphaned upload temp files.
      !UPLOAD_TEMP_RE.test(d.name),
  );

  const settled = await Promise.all(
    visible.map(async (d) => {
      try {
        return toEntry(d.name, await fsp.stat(path.join(abs, d.name)));
      } catch {
        // entry vanished between readdir and stat — drop it
        return null;
      }
    }),
  );
  const entries = settled.filter((e): e is FileEntry => e !== null);

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return { path: normaliseRel(rel), entries };
}

/**
 * Parse a single-range `Range: bytes=…` header against a file of `size` bytes.
 * Returns `null` when the header is absent/unusable (serve the whole file — a
 * multi-range request is deliberately not honoured, which RFC 9110 allows) or
 * `"invalid"` when it's a well-formed range outside the file (→ 416).
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;

  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n === 0) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size || start > end) return "invalid";
  }
  return { start, end };
}

export function sendFile(
  request: FastifyRequest,
  reply: FastifyReply,
  abs: string,
  stats: fs.Stats,
  forceDownload: boolean,
): FastifyReply {
  const filename = path.basename(abs);
  const disposition = forceDownload ? "attachment" : "inline";
  const asciiName = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const lastModified = stats.mtime.toUTCString();

  reply
    .header("Content-Type", contentTypeFor(filename))
    .header("Last-Modified", lastModified)
    .header("Accept-Ranges", "bytes")
    .header("Cache-Control", "private, max-age=0, must-revalidate")
    .header(
      "Content-Disposition",
      `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

  // If-Range: only honour Range when the validator still matches.
  const ifRange = request.headers["if-range"];
  const range =
    ifRange && ifRange !== lastModified
      ? null
      : parseRange(request.headers.range, stats.size);

  if (range === "invalid") {
    reply.removeHeader("Content-Disposition");
    return reply
      .code(416)
      .type("application/json; charset=utf-8")
      .header("Content-Range", `bytes */${stats.size}`)
      .send({
        error: {
          code: "range_not_satisfiable",
          message: "requested range is outside the file",
        },
      });
  }

  if (range) {
    return reply
      .code(206)
      .header("Content-Range", `bytes ${range.start}-${range.end}/${stats.size}`)
      .header("Content-Length", range.end - range.start + 1)
      .send(fs.createReadStream(abs, { start: range.start, end: range.end }));
  }

  return reply
    .header("Content-Length", stats.size)
    .send(fs.createReadStream(abs));
}
