"use client";

import { useCallback, useRef, useState } from "react";
import {
  ApiError,
  isNetworkError,
  makeDir,
  uploadFileWithProgress,
} from "@/lib/api";
import type { QueuedFile } from "@/lib/dropFiles";

export interface UploadItem {
  id: number;
  name: string;
  /** Destination folder (full path). */
  dir: string;
  loaded: number;
  total: number;
  status: "queued" | "uploading" | "done" | "error" | "cancelled";
  error?: string;
}

function message(err: unknown): string {
  if (isNetworkError(err)) return "can't reach the API";
  if (err instanceof ApiError && err.code === "quota_exceeded") return "over your storage limit";
  if (err instanceof ApiError) return err.message;
  return "failed";
}

/**
 * A sequential upload queue with per-file progress and cancel. Folders in the
 * queue (`QueuedFile.dir`) are created with `mkdir -p` first. `onSettled` fires
 * after each file finishes so the listing and usage bar can refresh.
 */
export function useUploads(onSettled: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const nextId = useRef(1);
  const queue = useRef<{ id: number; file: File; dir: string }[]>([]);
  const running = useRef(false);
  const controllers = useRef(new Map<number, AbortController>());
  const settled = useRef(onSettled);
  settled.current = onSettled;

  const patch = useCallback((id: number, p: Partial<UploadItem>) => {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    for (let job = queue.current.shift(); job; job = queue.current.shift()) {
      const { id, file, dir } = job;
      const ctl = new AbortController();
      controllers.current.set(id, ctl);
      patch(id, { status: "uploading" });
      try {
        if (dir) await makeDir(dir, { signal: ctl.signal });
        await uploadFileWithProgress(dir, file, {
          signal: ctl.signal,
          onProgress: (loaded, total) => patch(id, { loaded, total }),
        });
        patch(id, { status: "done", loaded: file.size });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          patch(id, { status: "cancelled" });
        } else {
          patch(id, { status: "error", error: message(err) });
        }
      } finally {
        controllers.current.delete(id);
        settled.current();
      }
    }
    running.current = false;
  }, [patch]);

  const enqueue = useCallback(
    (base: string, files: QueuedFile[]) => {
      const added: UploadItem[] = files.map((f) => {
        const dir = [base, f.dir].filter(Boolean).join("/");
        const id = nextId.current++;
        queue.current.push({ id, file: f.file, dir });
        return {
          id,
          name: f.dir ? `${f.dir}/${f.file.name}` : f.file.name,
          dir,
          loaded: 0,
          total: f.file.size,
          status: "queued",
        };
      });
      setItems((all) => [...all, ...added]);
      void pump();
    },
    [pump],
  );

  const cancel = useCallback((id: number) => {
    const ctl = controllers.current.get(id);
    if (ctl) return ctl.abort();
    queue.current = queue.current.filter((j) => j.id !== id);
    patch(id, { status: "cancelled" });
  }, [patch]);

  const clearFinished = useCallback(() => {
    setItems((all) => all.filter((i) => i.status === "queued" || i.status === "uploading"));
  }, []);

  return { items, enqueue, cancel, clearFinished };
}
