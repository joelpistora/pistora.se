import type { Dirent } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const UPLOAD_TEMP_RE = /^\.upload-[0-9a-fA-F-]+\.part$/;

/**
 * Total size in bytes of the regular files under `abs`, recursively. Symlinks
 * and in-progress `.upload-*.part` files are skipped (same rule the directory
 * listing uses). Missing directories count as 0.
 *
 * This is an on-demand walk — no bookkeeping to drift out of sync. Fine for the
 * ~1 GiB per-user quota; revisit with a cached total if a folder ever holds tens
 * of thousands of files.
 */
export async function dirSize(abs: string): Promise<number> {
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(abs, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile() && !UPLOAD_TEMP_RE.test(entry.name)) {
      try {
        total += (await fsp.stat(full)).size;
      } catch {
        // vanished between readdir and stat — ignore
      }
    }
  }
  return total;
}
