"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuAction {
  label: string;
  /** Render the item in red (destructive). */
  danger?: boolean;
  /** A plain action. Ignored when `href` is set. */
  onClick?: () => void;
  /** Render the item as a link instead of a button (e.g. a download). */
  href?: string;
  download?: boolean;
}

/**
 * A "⋮" trigger that drops a small menu. The menu is `position: fixed`, anchored
 * to the trigger's rect, so a table's horizontal-scroll container can't clip it.
 * Closes on outside click, Escape, or any scroll. Clicks are stopped from
 * bubbling so the menu works inside a clickable table row.
 */
export default function KebabMenu({
  actions,
  disabled = false,
  label = "Actions",
}: {
  actions: MenuAction[];
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded border border-foreground/20 px-2 py-1 text-sm leading-none hover:bg-foreground/10 disabled:opacity-50"
      >
        ⋮
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          onClick={(e) => e.stopPropagation()}
          className="z-30 w-44 overflow-hidden rounded-md border border-foreground/15 bg-surface py-1 text-sm shadow-lg"
        >
          {actions.map((a) =>
            a.href ? (
              <a
                key={a.label}
                href={a.href}
                download={a.download}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block w-full px-3 py-1.5 text-left transition-colors hover:bg-foreground/10"
              >
                {a.label}
              </a>
            ) : (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  a.onClick?.();
                }}
                className={`block w-full px-3 py-1.5 text-left transition-colors hover:bg-foreground/10 ${
                  a.danger ? "text-red-600" : ""
                }`}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
