import type {
  CreateShareRequest,
  DirListing,
  PublicShareInfo,
  Share,
  ShareListResponse,
} from "shared";
import { API_BASE } from "./config";
import { request } from "./client";
import { encodePath } from "./paths";
import type { RequestOpts } from "./types";

export function createShare(
  body: CreateShareRequest,
  opts: RequestOpts = {},
): Promise<Share> {
  return request<Share>("/api/shares", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
}

/** `by-me` = shares I created (with link tokens); `with-me` = shared to me. */
export async function listShares(
  direction: "by-me" | "with-me",
  opts: RequestOpts = {},
): Promise<Share[]> {
  const res = await request<ShareListResponse>(`/api/shares?direction=${direction}`, {
    signal: opts.signal,
  });
  return res.shares;
}

export function deleteShare(id: string, opts: RequestOpts = {}): Promise<void> {
  return request<void>(`/api/shares/${encodeURIComponent(id)}`, {
    method: "DELETE",
    signal: opts.signal,
  });
}

/** List a folder inside a user share (`sub` is relative to the shared item). */
export function listSharedDir(
  id: string,
  sub: string,
  opts: RequestOpts = {},
): Promise<DirListing> {
  return request<DirListing>(
    `/api/shares/${encodeURIComponent(id)}/files/${encodePath(sub)}`,
    { signal: opts.signal },
  );
}

export function sharedFileUrl(id: string, sub: string): string {
  return `${API_BASE}/api/shares/${encodeURIComponent(id)}/files/${encodePath(sub)}?download=1`;
}

export function getPublicShare(token: string, opts: RequestOpts = {}): Promise<PublicShareInfo> {
  return request<PublicShareInfo>(`/api/public/${encodeURIComponent(token)}`, {
    signal: opts.signal,
  });
}

export function listPublicDir(
  token: string,
  sub: string,
  opts: RequestOpts = {},
): Promise<DirListing> {
  return request<DirListing>(
    `/api/public/${encodeURIComponent(token)}/files/${encodePath(sub)}`,
    { signal: opts.signal },
  );
}

export function publicFileUrl(token: string, sub: string): string {
  return `${API_BASE}/api/public/${encodeURIComponent(token)}/files/${encodePath(sub)}?download=1`;
}
