"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getPublicShare,
  listPublicDir,
  publicFileUrl,
  type PublicShareInfo,
} from "@/lib/api";
import ShareViewer from "./ShareViewer";

/** The unauthenticated viewer behind `/s?token=…`. */
export default function PublicShare() {
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<PublicShareInfo | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!token) {
      setMissing(true);
      return;
    }
    getPublicShare(token).then(setInfo, () => setMissing(true));
  }, [token]);

  const list = useCallback((sub: string) => listPublicDir(token, sub), [token]);
  const href = useCallback((sub: string) => publicFileUrl(token, sub), [token]);

  if (missing) {
    return (
      <p className="text-sm text-foreground/70">
        This link doesn&apos;t exist, has expired, or was revoked.
      </p>
    );
  }
  if (!info) return <p className="text-sm text-foreground/60">Loading…</p>;
  return <ShareViewer name={info.name} type={info.type} list={list} fileHref={href} />;
}
