"use client";

import { useEffect, useState } from "react";
import { ping } from "@/lib/api";

type State = "checking" | "ok" | "down";

/** Silent unless the API can't be reached — never names the API itself. */
export default function ApiStatus() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    const controller = new AbortController();
    ping({ signal: controller.signal })
      .then(() => setState("ok"))
      .catch(() => {
        if (!controller.signal.aborted) setState("down");
      });
    return () => controller.abort();
  }, []);

  if (state !== "down") return null;

  return (
    <p className="flex items-center gap-2 text-sm text-red-600">
      <span className="inline-block h-2 w-2 rounded-full bg-red-500" aria-hidden />
      Cannot connect to API
    </p>
  );
}
