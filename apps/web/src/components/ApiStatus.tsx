"use client";

import { useEffect, useState } from "react";
import { API_BASE, ping } from "@/lib/api";

type State = "checking" | "ok" | "down";

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

  const dot =
    state === "ok"
      ? "bg-green-500"
      : state === "down"
        ? "bg-red-500"
        : "bg-foreground/30";

  const label =
    state === "ok"
      ? `Connected to ${API_BASE}`
      : state === "down"
        ? `API unreachable at ${API_BASE}`
        : "Checking API…";

  return (
    <p className="flex items-center gap-2 text-sm text-foreground/70">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </p>
  );
}
