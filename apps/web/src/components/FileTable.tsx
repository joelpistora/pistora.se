"use client";

import { useEffect, useRef, useState } from "react";
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
import MovePicker from "./MovePicker";
import ShareDialog from "./ShareDialog";
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
  const [shareFor, setShareFor] = useState<FileEntry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Names being moved via the picker (one from the kebab, or the whole selection). */
  const [moving, setMoving] = useState<string[] | null>(null);

  // A new folder / refreshed listing drops selections of rows that no longer exist.
  useEffect(() => {
    setSelected((sel) => {
      const names = new Set(entries.map((e) => e.name));
      const next = new Set([...sel].filter((n) => names.has(n)));
      return next.size === sel.size ? sel : next;
    });
  }, [entries]);
  useEffect(() => setSelected(new Set()), [path]);

  function toggle(name: string) {
    setSelected((sel) => {
      const next = new Set(sel);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }
  const allSelected = entries.length > 0 && selected.size === entries.length;

  /** Run an action over several names, then report any that failed. */
  async function bulk(names: string[], fn: (name: string) => Promise<unknown>) {
    setError(null);
    const failed: string[] = [];
    for (const name of names) {
      setBusy(name);
      try {
        await fn(name);
      } catch (err) {
        failed.push(`${name} (${errText(err)})`);
      }
    }
    setBusy(null);
    setSelected(new Set());
    onMutated();
    if (failed.length) setError(`Failed: ${failed.join(", ")}`);
  }

  async function removeSelected() {
    const names = [...selected];
    if (!window.confirm(`Delete ${names.length} item${names.length === 1 ? "" : "s"}? Folders are deleted with everything inside. This can't be undone.`)) return;
    const dirs = new Set(entries.filter((e) => e.type === "directory").map((e) => e.name));
    await bulk(names, (n) => deleteEntry(join(path, n), { recursive: dirs.has(n) }));
  }

  async function moveTo(dest: string) {
    const names = moving ?? [];
    setMoving(null);
    await bulk(names, (n) => moveEntry(join(path, n), join(dest, n)));
  }

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

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <button type="button" onClick={() => setMoving([...selected])} className="uppercase tracking-wide text-accent hover:underline">
            Move
          </button>
          <button type="button" onClick={() => void removeSelected()} className="uppercase tracking-wide text-red-600 hover:underline">
            Delete
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-foreground/60 hover:text-foreground">
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/15 text-left text-foreground/60">
              <th className="w-8 py-2 pr-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.name)))
                  }
                />
              </th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="hidden py-2 pr-4 font-medium sm:table-cell">Size</th>
              <th className="hidden py-2 pr-4 font-medium sm:table-cell">Modified</th>
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
                { label: "Move to…", onClick: () => setMoving([entry.name]) },
                { label: "Share", onClick: () => setShareFor(entry) },
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
                  <td className="w-8 py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${entry.name}`}
                      checked={selected.has(entry.name)}
                      onChange={() => toggle(entry.name)}
                    />
                  </td>
                  <td className="break-all py-2 pr-4">
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
                    <span className="block text-xs text-foreground/60 sm:hidden">
                      {isDir ? "Folder" : formatSize(entry.size)} · {formatDate(entry.modifiedAt)}
                    </span>
                  </td>
                  <td className="hidden py-2 pr-4 text-foreground/70 sm:table-cell">
                    {isDir ? "—" : formatSize(entry.size)}
                  </td>
                  <td className="hidden py-2 pr-4 text-foreground/70 sm:table-cell">
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

      {moving && (
        <MovePicker
          title={moving.length === 1 ? `Move “${moving[0]}” to…` : `Move ${moving.length} items to…`}
          moving={moving}
          from={path}
          onPick={(dest) => void moveTo(dest)}
          onClose={() => setMoving(null)}
        />
      )}

      {shareFor && (
        <ShareDialog
          path={join(path, shareFor.name)}
          name={shareFor.name}
          onClose={() => setShareFor(null)}
        />
      )}

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
