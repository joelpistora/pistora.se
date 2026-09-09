"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useDirectory } from "@/hooks/useDirectory";
import Breadcrumbs from "./Breadcrumbs";
import FileTable from "./FileTable";
import UploadButton from "./UploadButton";

/** Normalise a path: no leading/trailing slashes, no empty segments. */
function clean(path: string): string {
  return path.split("/").filter(Boolean).join("/");
}

export default function FileBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const path = clean(searchParams.get("path") ?? "");

  const { listing, loading, error, reload } = useDirectory(path);
  const [selected, setSelected] = useState<string | null>(null);

  const navigate = useCallback(
    (next: string) => {
      setSelected(null);
      const target = clean(next);
      router.push(target ? `/files?path=${encodeURIComponent(target)}` : "/files");
    },
    [router],
  );

  const openDir = useCallback(
    (name: string) => navigate(path ? `${path}/${name}` : name),
    [navigate, path],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs path={path} onNavigate={navigate} />
        <UploadButton path={path} onUploaded={reload} />
      </div>

      {loading && <p className="text-sm text-foreground/60">Loading…</p>}

      {error && !loading && (
        <p className="text-sm text-red-600">Couldn&apos;t load this folder: {error}</p>
      )}

      {!loading && !error && listing && listing.entries.length === 0 && (
        <p className="text-sm text-foreground/60">This folder is empty.</p>
      )}

      {!loading && !error && listing && listing.entries.length > 0 && (
        <FileTable
          path={path}
          entries={listing.entries}
          selected={selected}
          onOpenDir={openDir}
          onSelectFile={(name) =>
            setSelected((cur) => (cur === name ? null : name))
          }
        />
      )}
    </div>
  );
}
