/** A file plus the folder (relative to the drop target) it should land in. */
export interface QueuedFile {
  file: File;
  /** "" for the target folder itself, else "sub/dir". */
  dir: string;
}

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(out);
        out.push(...batch);
        next(); // readEntries returns chunks; keep going until empty
      }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, dir: string, out: QueuedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) =>
      (entry as FileSystemFileEntry).file(res, rej),
    );
    out.push({ file, dir });
  } else if (entry.isDirectory) {
    const sub = dir ? `${dir}/${entry.name}` : entry.name;
    for (const child of await readAll((entry as FileSystemDirectoryEntry).createReader())) {
      await walk(child, sub, out);
    }
  }
}

/** Expand a drop's `DataTransfer` into files, recursing into dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<QueuedFile[]> {
  const out: QueuedFile[] = [];
  // Entries must be grabbed synchronously, before the first await.
  const entries = Array.from(dt.items)
    .map((i) => (i.kind === "file" ? i.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) {
    for (const file of Array.from(dt.files)) out.push({ file, dir: "" });
    return out;
  }
  for (const e of entries) await walk(e, "", out);
  return out;
}

/** Files from an `<input webkitdirectory>` pick, using `webkitRelativePath`. */
export function filesFromInput(files: FileList): QueuedFile[] {
  return Array.from(files).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const i = rel.lastIndexOf("/");
    return { file, dir: i > 0 ? rel.slice(0, i) : "" };
  });
}
