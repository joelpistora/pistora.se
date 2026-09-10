"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createUser,
  deleteUser,
  listUsers,
  resetOtp,
  updateUser,
  type AdminUser,
  type Role,
} from "@/lib/api";
import { authErrorMessage } from "@/lib/authErrors";
import { formatDate } from "@/lib/format";

const FIELD =
  "rounded border border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/50";

const GiB = 1024 * 1024 * 1024;
const toGiB = (bytes: number) => Math.round((bytes / GiB) * 100) / 100;

/** Inline GB editor for a user's quota. Admins have no quota to show. */
function QuotaEditor({
  user,
  disabled,
  onSave,
}: {
  user: AdminUser;
  disabled: boolean;
  onSave: (bytes: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(toGiB(user.quotaBytes)));

  if (user.role === "admin") {
    return <span className="text-foreground/40">— (unlimited)</span>;
  }
  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setValue(String(toGiB(user.quotaBytes)));
          setEditing(true);
        }}
        className="underline-offset-2 hover:underline disabled:opacity-50"
      >
        {toGiB(user.quotaBytes)} GB
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        step={0.1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded border border-foreground/20 bg-background px-1.5 py-0.5 text-xs"
      />
      GB
      <button
        type="button"
        onClick={() => {
          const gb = Number(value);
          if (Number.isFinite(gb) && gb >= 0) onSave(Math.round(gb * GiB));
          setEditing(false);
        }}
        className="rounded border border-foreground/20 px-1.5 py-0.5 text-xs hover:bg-foreground/10"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-foreground/50 hover:text-foreground"
      >
        Cancel
      </button>
    </span>
  );
}

interface RowAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/**
 * A "⋮" button that drops a small menu. Positioned `fixed` from the button's
 * rect so it isn't clipped by the table's horizontal-scroll container. Closes on
 * outside-click, Escape, or any scroll.
 */
function RowActions({ actions, disabled }: { actions: RowAction[]; disabled: boolean }) {
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
        aria-label="User actions"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-foreground/20 px-2 py-1 text-sm leading-none hover:bg-foreground/10 disabled:opacity-50"
      >
        ⋮
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-30 w-48 overflow-hidden rounded-md border border-foreground/15 bg-background py-1 text-sm shadow-lg"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left transition-colors hover:bg-foreground/10 ${
                a.danger ? "text-red-600" : ""
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Shown after an invite / OTP reset — the admin passes this on to the user. */
function OtpNotice({ email, otp }: { email: string; otp?: string }) {
  return (
    <div className="rounded border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm">
      Invite ready for <span className="font-medium">{email}</span>.{" "}
      {otp ? (
        <>
          One-time password: <code className="font-mono font-semibold">{otp}</code>
        </>
      ) : (
        <>The one-time password was written to the API server log.</>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ email: string; otp?: string } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { users } = await listUsers();
      setUsers(users);
      setLoadError(null);
    } catch (err) {
      setLoadError(authErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await createUser(email.trim(), role);
      setNotice({ email: res.user.email, otp: res.otp });
      setEmail("");
      setRole("user");
      await load();
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runRowAction(id: string, fn: () => Promise<unknown>) {
    setRowBusy(id);
    setLoadError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setLoadError(authErrorMessage(err));
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Register user</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Create an account by email. The person gets a one-time password and is
          forced to set their own on first sign-in.
        </p>
      </div>

      <form onSubmit={handleRegister} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email address
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className={`${FIELD} w-64`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={FIELD}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate user"}
        </button>
      </form>

      {formError && <p className="text-sm text-red-600">{formError}</p>}
      {notice && <OtpNotice email={notice.email} otp={notice.otp} />}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Users</h2>
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {!users && !loadError && (
          <p className="text-sm text-foreground/60">Loading…</p>
        )}
        {users && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-foreground/15 text-left align-bottom text-foreground/60">
                  <th className="py-2 pr-6 font-medium">Email</th>
                  <th className="py-2 pr-6 font-medium">Role</th>
                  <th className="py-2 pr-6 font-medium">Status</th>
                  <th className="py-2 pr-6 font-medium">Storage&nbsp;limit</th>
                  <th className="py-2 pr-6 font-medium whitespace-nowrap">Last sign-in</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-foreground/10 align-top">
                    <td className="py-2 pr-6">
                      <div className="whitespace-nowrap">{u.email}</div>
                      {u.mustChangePassword && (
                        <span className="text-xs text-foreground/50">
                          pending first sign-in
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-6">{u.role}</td>
                    <td className="py-2 pr-6">
                      <span className={u.status === "disabled" ? "text-red-600" : undefined}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-2 pr-6 whitespace-nowrap">
                      <QuotaEditor
                        user={u}
                        disabled={rowBusy === u.id}
                        onSave={(bytes) =>
                          runRowAction(u.id, () => updateUser(u.id, { quotaBytes: bytes }))
                        }
                      />
                    </td>
                    <td className="py-2 pr-6 whitespace-nowrap text-foreground/60">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : "never"}
                    </td>
                    <td className="py-2 text-right">
                      <RowActions
                        disabled={rowBusy === u.id}
                        actions={[
                          {
                            label: u.status === "disabled" ? "Enable" : "Disable",
                            onClick: () =>
                              runRowAction(u.id, () =>
                                updateUser(u.id, {
                                  status:
                                    u.status === "disabled" ? "active" : "disabled",
                                }),
                              ),
                          },
                          {
                            label: "Reset one-time password",
                            onClick: () =>
                              runRowAction(u.id, async () => {
                                const res = await resetOtp(u.id);
                                setNotice({ email: res.user.email, otp: res.otp });
                              }),
                          },
                          {
                            label: "Remove user…",
                            danger: true,
                            onClick: () => {
                              if (
                                window.confirm(
                                  `Remove ${u.email}? This permanently deletes their account and every file in their folder.`,
                                )
                              ) {
                                runRowAction(u.id, () => deleteUser(u.id));
                              }
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
