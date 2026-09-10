"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getMe,
  logout as apiLogout,
  setUnauthorizedHandler,
  type AuthUser,
} from "@/lib/api";

interface AuthContextValue {
  /** The signed-in user, or null. `null` while `loading` too — check `loading` first. */
  user: AuthUser | null;
  /** True until the initial `/api/auth/me` check resolves. */
  loading: boolean;
  /** Re-fetch the current user (after login / password change). */
  refresh: () => Promise<void>;
  /** End the session server-side and clear local state. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await getMe();
      if (mounted.current) setUser(user);
    } catch {
      if (mounted.current) setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      if (mounted.current) setUser(null);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // A 401 from any API call means the session is gone — drop the cached user
    // so the route guards send the visitor to /login.
    setUnauthorizedHandler(() => {
      if (mounted.current) setUser(null);
    });

    void refresh().finally(() => {
      if (mounted.current) setLoading(false);
    });

    return () => {
      mounted.current = false;
      setUnauthorizedHandler(null);
    };
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
