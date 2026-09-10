"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createUser,
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
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-foreground/15 text-left text-foreground/60">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Last sign-in</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-foreground/10">
                    <td className="py-2 pr-4">
                      {u.email}
                      {u.mustChangePassword && (
                        <span className="ml-2 text-xs text-foreground/50">
                          (pending first sign-in)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{u.role}</td>
                    <td className="py-2 pr-4">
                      <span className={u.status === "disabled" ? "text-red-600" : undefined}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-foreground/60">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : "never"}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={rowBusy === u.id}
                          onClick={() =>
                            runRowAction(u.id, () =>
                              updateUser(u.id, {
                                status: u.status === "disabled" ? "active" : "disabled",
                              }),
                            )
                          }
                          className="rounded border border-foreground/20 px-2 py-1 text-xs hover:bg-foreground/10 disabled:opacity-50"
                        >
                          {u.status === "disabled" ? "Enable" : "Disable"}
                        </button>
                        <button
                          type="button"
                          disabled={rowBusy === u.id}
                          onClick={() =>
                            runRowAction(u.id, async () => {
                              const res = await resetOtp(u.id);
                              setNotice({ email: res.user.email, otp: res.otp });
                            })
                          }
                          className="rounded border border-foreground/20 px-2 py-1 text-xs hover:bg-foreground/10 disabled:opacity-50"
                        >
                          Reset OTP
                        </button>
                      </div>
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
