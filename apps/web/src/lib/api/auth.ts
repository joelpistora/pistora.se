import type {
  AdminUser,
  AdminUserListResponse,
  CreateUserResponse,
  Role,
  SessionResponse,
  UserStatus,
} from "shared";
import { request } from "./client";

// ---- session ------------------------------------------------------------

export function login(email: string, password: string): Promise<SessionResponse> {
  return request<SessionResponse>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  // Cap it — a hung logout must never be able to block the sign-out UI.
  return request<void>("/api/auth/logout", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });
}

export function getMe(): Promise<SessionResponse> {
  return request<SessionResponse>("/api/auth/me");
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<SessionResponse> {
  return request<SessionResponse>("/api/auth/change-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ---- admin --------------------------------------------------------------

export function listUsers(): Promise<AdminUserListResponse> {
  return request<AdminUserListResponse>("/api/admin/users");
}

export function createUser(email: string, role?: Role): Promise<CreateUserResponse> {
  return request<CreateUserResponse>("/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(role ? { email, role } : { email }),
  });
}

export function updateUser(
  id: string,
  patch: { status?: UserStatus; role?: Role; quotaBytes?: number },
): Promise<{ user: AdminUser }> {
  return request<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function resetOtp(id: string): Promise<CreateUserResponse> {
  return request<CreateUserResponse>(
    `/api/admin/users/${encodeURIComponent(id)}/reset-otp`,
    { method: "POST" },
  );
}
