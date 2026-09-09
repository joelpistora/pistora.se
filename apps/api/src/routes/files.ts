import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { contentTypeFor } from "../mime.js";
import type { DirListing, FileEntry, FileMetadata } from "../types.js";

interface FilesQuery {
  stat?: string;
  download?: string;
  recursive?: string;
}

/**
 * Lenient flag parsing for query params: `?stat`, `?stat=1`, `?stat=true` are
 * all true; `?stat=0` / `?stat=false` / absent are false. (ajv's `coerceTypes`
 * only accepts the literal strings "true"/"false" for booleans, which is too
 * strict for a hand-typed URL.)
 */
function flag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const s = value.toLowerCase();
  return s === "" || s === "1" || s === "true" || s === "yes" || s === "on";
}

const fileEntrySchema = {
  type: "object",
  required: ["name", "type", "size", "modifiedAt"],
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    type: { type: "string", enum: ["file", "directory"] },
    size: { type: "integer" },
    modifiedAt: { type: "string" },
  },
} as const;

const querystringSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    stat: { type: "string" },
    download: { type: "string" },
    recursive: { type: "string" },
  },
} as const;

/**
 * The file namespace, mounted at `/api/files`. One wildcard path segment (`*`)
 * carries the relative path; GET disambiguates file vs directory with `stat()`.
 * Phase 1 serves a single shared namespace — no auth, no per-user roots yet.
 */
export const fileRoutes: FastifyPluginAsync = async (app) => {
  function relPath(request: FastifyRequest): string {
    return (request.params as { "*"?: string })["*"] ?? "";
  }

  // ---- list / stat / download -------------------------------------------------

  const getOpts = {
    schema: {
      querystring: querystringSchema,
      response: {
        "4xx": { $ref: "error#" },
        "5xx": { $ref: "error#" },
      },
    },
  };

  async function handleGet(request: FastifyRequest, reply: FastifyReply) {
    const rel = relPath(request);
    const query = request.query as FilesQuery;
    const abs = app.storage.resolve(rel);

    let stats: fs.Stats;
    try {
      stats = await fsp.stat(abs);
    } catch {
      throw app.httpErrors.notFound(`no such path: ${rel || "/"}`);
    }

    if (flag(query.stat)) {
      const meta: FileMetadata = {
        ...toEntry(path.basename(abs) || "/", stats),
        path: normaliseRel(rel),
        createdAt: isoOrMtime(stats),
      };
      return meta;
    }

    if (stats.isDirectory()) {
      return listDirectory(abs, rel);
    }

    return sendFile(reply, abs, stats, flag(query.download));
  }

  app.get("/", getOpts, handleGet);
  app.get("/*", getOpts, handleGet);

  // ---- upload ---------------------------------------------------------------

  const uploadOpts = {
    schema: {
      response: {
        201: {
          type: "object",
          required: ["created"],
          additionalProperties: false,
          properties: { created: { type: "array", items: fileEntrySchema } },
        },
        "4xx": { $ref: "error#" },
        "5xx": { $ref: "error#" },
      },
    },
  };

  async function handleUpload(request: FastifyRequest, reply: FastifyReply) {
    if (!request.isMultipart()) {
      throw app.httpErrors.unsupportedMediaType("expected multipart/form-data");
    }

    const rel = relPath(request);
    const dirAbs = app.storage.resolve(rel);
    const dirStat = await fsp.stat(dirAbs).catch(() => null);
    if (!dirStat?.isDirectory()) {
      throw app.httpErrors.notFound(
        `target directory does not exist: ${rel || "/"} (create it with POST /api/dirs)`,
      );
    }

    const created: FileEntry[] = [];
    for await (const part of request.files()) {
      const name = path.basename(part.filename ?? "");
      if (!name || name === "." || name === "..") {
        throw app.httpErrors.badRequest("each uploaded file needs a valid filename");
      }
      const targetAbs = app.storage.resolve(path.posix.join(rel, name));
      const tmpAbs = path.join(path.dirname(targetAbs), `.upload-${randomUUID()}.part`);

      try {
        await pipeline(part.file, fs.createWriteStream(tmpAbs, { flags: "wx" }));
        if (part.file.truncated) {
          await fsp.rm(tmpAbs, { force: true });
          throw app.httpErrors.payloadTooLarge(
            `"${name}" exceeds the ${app.config.maxFileBytes}-byte limit`,
          );
        }
        await fsp.rename(tmpAbs, targetAbs);
      } catch (err) {
        await fsp.rm(tmpAbs, { force: true }).catch(() => {});
        throw err;
      }

      const s = await fsp.stat(targetAbs);
      created.push(toEntry(name, s));
    }

    if (created.length === 0) {
      throw app.httpErrors.badRequest("no files in the request");
    }

    reply.code(201);
    return { created };
  }

  app.post("/", uploadOpts, handleUpload);
  app.post("/*", uploadOpts, handleUpload);

  // ---- delete -------------------------------------------------------------

  const deleteOpts = {
    schema: {
      querystring: querystringSchema,
      response: {
        204: { type: "null" },
        "4xx": { $ref: "error#" },
        "5xx": { $ref: "error#" },
      },
    },
  };

  async function handleDelete(request: FastifyRequest, reply: FastifyReply) {
    const rel = relPath(request);
    if (normaliseRel(rel) === "") {
      throw app.httpErrors.badRequest("refusing to delete the storage root");
    }
    const recursive = flag((request.query as FilesQuery).recursive);
    const abs = app.storage.resolve(rel);

    let stats: fs.Stats;
    try {
      stats = await fsp.stat(abs);
    } catch {
      throw app.httpErrors.notFound(`no such path: ${rel}`);
    }

    if (stats.isDirectory() && !recursive) {
      const entries = await fsp.readdir(abs);
      if (entries.length > 0) {
        throw app.httpErrors.conflict(
          "directory is not empty (pass ?recursive=1 to delete it and its contents)",
        );
      }
    }

    await fsp.rm(abs, { recursive, force: false });
    reply.code(204);
    return null;
  }

  app.delete("/*", deleteOpts, handleDelete);
};

// ---- helpers ---------------------------------------------------------------

function toEntry(name: string, stats: fs.Stats): FileEntry {
  const isDir = stats.isDirectory();
  return {
    name,
    type: isDir ? "directory" : "file",
    size: isDir ? 0 : stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

function isoOrMtime(stats: fs.Stats): string {
  const birth = stats.birthtime.getTime();
  return birth > 0 ? stats.birthtime.toISOString() : stats.mtime.toISOString();
}

function normaliseRel(rel: string): string {
  const norm = path.posix.normalize(rel).replace(/^\.?\/+/, "").replace(/\/+$/, "");
  return norm === "." ? "" : norm;
}

async function listDirectory(abs: string, rel: string): Promise<DirListing> {
  const dirents = await fsp.readdir(abs, { withFileTypes: true });
  const entries: FileEntry[] = [];

  for (const dirent of dirents) {
    // Skip symlinks and anything that isn't a plain file or directory —
    // the API only exposes regular files and folders.
    if (dirent.isSymbolicLink() || (!dirent.isFile() && !dirent.isDirectory())) {
      continue;
    }
    try {
      const s = await fsp.stat(path.join(abs, dirent.name));
      entries.push(toEntry(dirent.name, s));
    } catch {
      // entry vanished between readdir and stat — skip it
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return { path: normaliseRel(rel), entries };
}

function sendFile(
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
