import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyReply } from "fastify";
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

export function sendFile(
  reply: FastifyReply,
  abs: string,
  stats: fs.Stats,
  forceDownload: boolean,
): FastifyReply {
  const filename = path.basename(abs);
  const disposition = forceDownload ? "attachment" : "inline";
  const asciiName = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  reply
    .header("Content-Type", contentTypeFor(filename))
    .header("Content-Length", stats.size)
    .header("Last-Modified", stats.mtime.toUTCString())
    .header("Accept-Ranges", "none")
    .header("Cache-Control", "private, max-age=0, must-revalidate")
    .header(
      "Content-Disposition",
      `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

  return reply.send(fs.createReadStream(abs));
}
