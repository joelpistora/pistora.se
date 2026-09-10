"use client";

import { useRef, useState } from "react";
import {
  ApiError,
  deleteEntry,
  fileUrl,
  isNetworkError,
  listDir,
  moveEntry,
  type FileEntry,
} from "@/lib/api";
import { formatDate, formatSize } from "@/lib/format";
import FileProperties from "./FileProperties";
import KebabMenu, { type MenuAction } from "./KebabMenu";

interface FileTableProps {
  /** Current folder path, "" for the storage root. */
  path: string;
  entries: FileEntry[];
  onOpenDir: (name: string) => void;
  /** Called after a successful rename / delete so the listing + usage refresh. */
  onMutated: () => void;
}

function join(path: string, name: string): string {
  return path ? `${path}/${name}` : name;
}

/** One path segment: no slash, and not a lone/double dot. */
const VALID_NAME = /^[^/\\]+$/;
function isValidName(name: string): boolean {
  return VALID_NAME.test(name) && name !== "." && name !== "..";
}

function errText(err: unknown): string {
  if (isNetworkError(err)) return "Can't reach the API.";
  if (err instanceof ApiError) return err.message;
  return "Something went wrong.";
}

/**
 * An inline text box for renaming a row. Self-contained: fresh local state per
 * mount (key it by the entry name), and a one-shot guard so Enter-then-blur
 * doesn't fire the save twice.
 */
function RenameInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    if (save) onSave(value);
    else onCancel();
  }

  return (
    <input
      autoFocus
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="w-56 max-w-full rounded border border-accent bg-surface px-1.5 py-0.5 text-sm outline-none"
    />
  );
}

export default function FileTable({
  path,
  entries,
  onOpenDir,
  onMutated,
}: FileTableProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [propsFor, setPropsFor] = useState<FileEntry | null>(null);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      onMutated();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(null);
    }
  }

  function saveRename(entry: FileEntry, raw: string) {
    setRenaming(null);
    const next = raw.trim();
    if (!next || next === entry.name) return;
    if (!isValidName(next)) {
      setError(`"${next}" isn't a valid name — it can't contain a slash.`);
      return;
    }
    void run(entry.name, () =>
      moveEntry(join(path, entry.name), join(path, next)),
    );
  }

  async function remove(entry: FileEntry) {
    if (entry.type === "file") {
      if (!window.confirm(`Delete "${entry.name}"? This can't be undone.`)) return;
      await run(entry.name, () => deleteEntry(join(path, entry.name)));
      return;
    }

    // Folder: peek inside so the confirmation states the stakes.
    setBusy(entry.name);
    let count = -1;
    try {
      count = (await listDir(join(path, entry.name))).entries.length;
    } catch {
      /* leave count at -1 — the delete call surfaces any real problem */
    }
    setBusy(null);

    const prompt =
      count > 0
        ? `"${entry.name}" contains ${count} item${count === 1 ? "" : "s"}. Delete the folder and everything inside it? This can't be undone.`
        : count === 0
          ? `Delete the empty folder "${entry.name}"?`
          : `Delete "${entry.name}" and anything inside it? This can't be undone.`;
    if (!window.confirm(prompt)) return;
    await run(entry.name, () =>
      deleteEntry(join(path, entry.name), { recursive: count !== 0 }),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/15 text-left text-foreground/60">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Size</th>
              <th className="py-2 pr-4 font-medium">Modified</th>
              <th className="w-10 py-2 font-medium" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isDir = entry.type === "directory";
              const isRenaming = renaming === entry.name;
              const rowBusy = busy === entry.name;

              const actions: MenuAction[] = [
                ...(isDir
                  ? []
                  : [
                      {
                        label: "Download",
                        href: fileUrl(join(path, entry.name), { download: true }),
                        download: true,
                      },
                    ]),
                { label: "Rename", onClick: () => setRenaming(entry.name) },
                { label: "Properties", onClick: () => setPropsFor(entry) },
                {
                  label: "Delete",
                  danger: true,
                  onClick: () => void remove(entry),
                },
              ];

              return (
                <tr
                  key={entry.name}
                  onClick={() => {
                    if (isDir && !isRenaming) onOpenDir(entry.name);
                  }}
                  className={`border-b border-foreground/10 transition-colors ${
                    isDir && !isRenaming ? "cursor-pointer hover:bg-foreground/5" : ""
                  } ${rowBusy ? "opacity-50" : ""}`}
                >
                  <td className="py-2 pr-4">
                    <span className="mr-2 text-foreground/50" aria-hidden>
                      {isDir ? "📁" : "📄"}
                    </span>
                    {isRenaming ? (
                      <RenameInput
                        initial={entry.name}
                        onSave={(name) => saveRename(entry, name)}
                        onCancel={() => setRenaming(null)}
                      />
                    ) : (
                      entry.name
                    )}
                  </td>
                  <td className="py-2 pr-4 text-foreground/70">
                    {isDir ? "—" : formatSize(entry.size)}
                  </td>
                  <td className="py-2 pr-4 text-foreground/70">
                    {formatDate(entry.modifiedAt)}
                  </td>
                  <td className="py-2 text-right">
                    <KebabMenu
                      actions={actions}
                      disabled={rowBusy}
                      label={`Actions for ${entry.name}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {propsFor && (
        <FileProperties
          path={join(path, propsFor.name)}
          name={propsFor.name}
          onClose={() => setPropsFor(null)}
        />
      )}
    </div>
  );
}
