"use client";

import { useEffect, useState } from "react";
import { ApiError, isNetworkError, type DirListing } from "@/lib/api";
import { formatDate, formatSize } from "@/lib/format";

function join(path: string, name: string): string {
  return path ? `${path}/${name}` : name;
}

/**
 * Read-only browser for a shared item (user share or public link). `list` and
 * `fileHref` close over which share is being viewed; `sub` (kept in local state)
 * is the path inside the shared folder. A single-file share just offers a download.
 */
export default function ShareViewer({
  name,
  type,
  list,
  fileHref,
  onBack,
}: {
  name: string;
  type: "file" | "directory";
  list: (sub: string) => Promise<DirListing>;
  fileHref: (sub: string) => string;
  onBack?: () => void;
}) {
  const [sub, setSub] = useState("");
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (type !== "directory") return;
    let live = true;
    setListing(null);
    setError(null);
    list(sub)
      .then((l) => live && setListing(l))
      .catch((err: unknown) => {
        if (!live) return;
        setError(
          isNetworkError(err)
            ? "Can't reach the API."
            : err instanceof ApiError
              ? err.message
              : "Couldn't load this folder.",
        );
      });
    return () => {
      live = false;
    };
  }, [list, sub, type]);

  const crumbs = sub ? sub.split("/") : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {onBack && (
          <button type="button" onClick={onBack} className="text-accent hover:underline">
            ← Back
          </button>
        )}
        <button
          type="button"
          disabled={!sub}
          onClick={() => setSub("")}
          className="font-medium disabled:cursor-default"
        >
          {name}
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="text-foreground/40">/</span>
            <button
              type="button"
              onClick={() => setSub(crumbs.slice(0, i + 1).join("/"))}
              disabled={i === crumbs.length - 1}
              className="disabled:cursor-default"
            >
              {c}
            </button>
          </span>
        ))}
      </div>

      {type === "file" && (
        <a
          href={fileHref("")}
          download
          className="w-fit rounded border border-foreground/20 px-3 py-1.5 text-sm uppercase tracking-wide hover:bg-foreground/10"
        >
          Download {name}
        </a>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {type === "directory" && !listing && !error && (
        <p className="text-sm text-foreground/60">Loading…</p>
      )}
      {listing && listing.entries.length === 0 && (
        <p className="text-sm text-foreground/60">This folder is empty.</p>
      )}
      {listing && listing.entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/15 text-left text-foreground/60">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Size</th>
                <th className="hidden py-2 pr-4 font-medium sm:table-cell">Modified</th>
              </tr>
            </thead>
            <tbody>
              {listing.entries.map((e) => {
                const isDir = e.type === "directory";
                return (
                  <tr
                    key={e.name}
                    onClick={() => isDir && setSub(join(sub, e.name))}
                    className={`border-b border-foreground/10 ${
                      isDir ? "cursor-pointer hover:bg-foreground/5" : ""
                    }`}
                  >
                    <td className="break-all py-2 pr-4">
                      <span className="mr-2 text-foreground/50" aria-hidden>
                        {isDir ? "📁" : "📄"}
                      </span>
                      {isDir ? (
                        e.name
                      ) : (
                        <a
                          href={fileHref(join(sub, e.name))}
                          download
                          className="text-accent hover:underline"
                        >
                          {e.name}
                        </a>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-foreground/70">
                      {isDir ? "—" : formatSize(e.size)}
                    </td>
                    <td className="hidden py-2 pr-4 text-foreground/70 sm:table-cell">
                      {formatDate(e.modifiedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
