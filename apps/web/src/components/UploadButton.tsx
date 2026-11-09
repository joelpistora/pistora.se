"use client";

import { useRef } from "react";
import { filesFromInput, type QueuedFile } from "@/lib/dropFiles";

interface UploadButtonProps {
  /** Hand picked files to the upload queue. */
  onPick: (files: QueuedFile[]) => void;
}

/** "Upload files" / "Upload folder" pickers; the queue + progress live in the parent. */
export default function UploadButton({ onPick }: UploadButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (list && list.length > 0) onPick(filesFromInput(list));
    e.target.value = ""; // allow re-picking the same selection
  }

  const btn =
    "rounded border border-foreground/20 px-3 py-1.5 text-sm uppercase tracking-wide hover:bg-foreground/10";

  return (
    <>
      <input ref={fileRef} type="file" multiple onChange={handle} className="hidden" />
      <input
        ref={dirRef}
        type="file"
        multiple
        onChange={handle}
        className="hidden"
        // Non-standard but universally supported attribute for folder picking.
        {...({ webkitdirectory: "" } as Record<string, string>)}
      />
      <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
        Upload files
      </button>
      <button type="button" onClick={() => dirRef.current?.click()} className={btn}>
        Upload folder
      </button>
    </>
  );
}
