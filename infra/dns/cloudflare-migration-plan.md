# Plan: migrate pistora.se DNS to Cloudflare

**Status: done (2026-09-15).** DNS migrated, `api.pistora.se` is live via a
named Cloudflare Tunnel, and production auth is confirmed working end to end.
This doc is kept as the historical runbook + rollback reference. One real
deviation from the plan below: the tunnel was created from the **Cloudflare
Zero Trust dashboard** (token-based `cloudflared service install`), not the
CLI `tunnel login/create/route dns` flow in step 1 below — see
`infra/cloudflared/config.example.yml` and `CLAUDE.md` → "Cloudflare cutover —
done" for what actually ran.

Goal: Cloudflare becomes the authoritative DNS for pistora.se, so we can point
`api.pistora.se` at a Cloudflare Tunnel. Website + email stay at Hostek,
unchanged. See `pistora-se-dns.md` for the record inventory this plan copies.

**Risk:** email. Mitigated by copying every mail record exactly, verifying
before the switch, lowering TTLs first, and keeping the Hostek zone as rollback.
Fully reversible by switching nameservers back.

## Steps

### 1. Prep (no visible change)
- In the Hostek DNS editor, lower TTLs to `300` on `@ A`, `www A`, both `MX`,
  the SPF `TXT`, `_mailchannels TXT`, `mail CNAME`. Wait ~1 day so the old long
  TTLs age out and the cutover is fast/reversible.

### 2. Build the zone in Cloudflare
- Create a **free** Cloudflare account (owner's email).
- Add site `pistora.se`, **Free** plan. Let Cloudflare auto-scan, then
  **manually reconcile against `pistora-se-dns.md`** — the scan misses things.
  Final Cloudflare zone must contain exactly:
  - `A  @   91.189.42.160`   — DNS only (grey cloud) for now
  - `A  www 91.189.42.160`   — DNS only
  - `MX @   mx1.mailchannels.net` (pri 10)
  - `MX @   mx2.mailchannels.net` (pri 10)
  - `TXT _mailchannels  v=mc1 auth=hostekse`
  - `TXT @  v=spf1 include:spf.ballou.se ~all`
  - `CNAME mail  nmail8.ballou.se`  — DNS only
  - (do **not** add NS records — Cloudflare supplies its own)
- Note the two Cloudflare nameservers Cloudflare assigns
  (e.g. `x.ns.cloudflare.com`, `y.ns.cloudflare.com`).

### 3. Switch the delegation (needs Hostek admin)
- Send the Swedish support request in `hostek-ns-request-sv.md`, filled with the
  two Cloudflare nameservers, asking to **replace** `ns1/2/3.ballou.se` with
  them. (Or the domain-account holder does it if they can.)
- Hostek confirms.

### 4. Verify (within minutes–hours)
- `dig NS pistora.se @1.1.1.1` → the two Cloudflare nameservers.
- `dig pistora.se @1.1.1.1` / `dig www.pistora.se` → `91.189.42.160`.
- `dig MX pistora.se @1.1.1.1` → the two mailchannels MX.
- `dig TXT pistora.se @1.1.1.1` → the SPF string.
- `dig +short mail.pistora.se @1.1.1.1` → resolves via `nmail8.ballou.se`.
- Load `https://pistora.se` — the under-construction page still serves.
- Cloudflare dashboard marks the zone **Active** and emails confirmation.

### 5. Email smoke test
- Send an email **from** an @pistora.se mailbox to an external address (Gmail).
- Reply **to** that @pistora.se mailbox from the external address; confirm it
  arrives.
- Check the Gmail copy: SPF = pass.

### 6. Leave rollback in place
- Do **not** delete or edit the Hostek DNS zone for ~2 weeks. If anything
  breaks, Hostek admin points the nameservers back to `ns1/2/3.ballou.se`.

## After migration — stand up `api.pistora.se` and ship the auth-gated app

The app now has **cookie-based auth** (Phase 4). The session cookie is
`SameSite=Lax`, so it only flows when the API is on the **same registrable
site** as the web app. A `*.trycloudflare.com` quick tunnel is a different site
→ login appears to work but every following request 401s and the SPA bounces
back to `/login`. `api.pistora.se` fixes this because it is same-site with
`pistora.se`.

### 1. Named tunnel for the home API
- `cloudflared` is already installed on the WSL2 box (`cloudflared version` →
  `2026.8.3`), not yet logged in (no `~/.cloudflared/cert.pem`).
- `cloudflared tunnel login` (pick the `pistora.se` zone — needs the zone
  already present in the Cloudflare account, doesn't need NS propagation to
  have finished) → `cloudflared tunnel create pistora-home` → copy
  `infra/cloudflared/config.example.yml` to `~/.cloudflared/config.yml`, fill
  the two placeholders → `cloudflared tunnel route dns pistora-home
  api.pistora.se`.
- In Cloudflare DNS: the `api` CNAME to `<uuid>.cfargotunnel.com` is created by
  that `route dns` command — **proxied (orange cloud)**, which is required.
- Run it persistently, not from a shell that closes. This WSL2 instance has
  systemd enabled (`/etc/wsl.conf` → `[boot] systemd=true`), so
  `sudo cloudflared service install` works like on a normal Linux box — it
  reads `~/.cloudflared/config.yml`, installs `/etc/systemd/system/cloudflared.service`,
  and survives a `wsl --shutdown` / Windows reboot as long as WSL auto-starts
  (or start it once per Windows login some other way if it doesn't). Verify
  `curl https://api.pistora.se/health` → `{"status":"ok"}`.

### 2. Home API production env (`apps/api/.env` on the WSL2 box)
- `STORAGE_ROOT=…`, `DB_PATH=…`, `ADMIN_EMAIL=…` — as already set.
- `CORS_ORIGINS=https://pistora.se,https://www.pistora.se` — **set it explicitly**
  in prod (this drops the dev localhost fallback).
- `COOKIE_SECURE=true` — the default; **must not be `false`** in prod (HTTPS).
- Leave `COOKIE_DOMAIN` unset — a host-only cookie on `api.pistora.se` is sent
  on same-site `fetch` from `pistora.se`, which is what we want.
- `EXPOSE_INVITE_OTP` — leave unset/false unless email sending is still not
  wired; if it's false, invite OTPs go to the API log (`journalctl` / console),
  and `npm run reset-otp --workspace api -- <email>` is the recovery hatch.

### 3. Rebuild + redeploy the frontend against the real API
- Already prepped (2026-09-15): `apps/web/.env.production.local` (gitignored,
  see `apps/web/env.production.example`) sets
  `NEXT_PUBLIC_API_BASE=https://api.pistora.se` and wins over `.env.local`'s
  `localhost:3001` for every `next build` — no more editing `.env.local` before
  a deploy build (that was the exact footgun that shipped a `localhost`-baked
  build to prod once already).
- `npm run build --workspace web`
- **Verify before upload:** `grep -rl "trycloudflare\|localhost:3001" apps/web/out/_next/`
  must be empty; `grep -rl "api.pistora.se" apps/web/out/_next/` must hit.
- FTPS-upload the contents of `apps/web/out/` into `wwwroot/` (replaces the
  previous static build).

### 4. IIS `web.config` in `wwwroot/` (deep links + HTTPS)
Already prepped (2026-09-15): `apps/web/public/web.config` — Next copies
`public/` into `out/` on export, so it ships automatically with every build.
Handles the HTTP→HTTPS redirect (http visitors are CORS-blocked, the API
allowlist is https-only) and maps IIS's 404 to the exported `/404.html`, plus a
few MIME types stock IIS doesn't know (`.svg`, `.webmanifest`, `.woff*`). Deep
links (`/login`, `/admin`, `/files`, `/account/password`) need no rewrite rule:
`trailingSlash: true` already exports each as `<route>/index.html`, and IIS's
own default-document + directory-redirect behavior serves it.

### 5. Smoke test in prod
- `https://pistora.se` loads; the account menu is absent when signed out.
- Sign in as `ADMIN_EMAIL` + the bootstrap OTP → forced password change →
  `/files` (root view). No redirect loop.
- `/admin` → invite a user → that user signs in → their quota bar shows.
- Reload `/files` directly (deep link) → no 404.

### 6. Housekeeping
- Repoint `site/apitest.html` `API_BASE` to `https://api.pistora.se`, re-upload.
- Restore normal TTLs on the stable Cloudflare records.
- Future subdomains (`joel.`, …) are one-click in Cloudflare.
