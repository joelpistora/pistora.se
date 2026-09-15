# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Pistora – Project Overview & Status

> This document is the living source of truth for the project. Update it
> whenever we make a decision or wrap up a phase, so work can be picked back
> up at any time without losing context. Full decision history lives in
> [DECISIONS.md](DECISIONS.md); ops/DNS/tunnel notes in `infra/`.

## Commands

Run from the repo root (npm workspaces). `web` = frontend, `api` = backend.

| Task | Command |
|---|---|
| Frontend dev server (`localhost:3000`) | `npm run dev` |
| Frontend production build | `npm run build` |
| Frontend production server | `npm run start` |
| Lint frontend | `npm run lint` |
| Backend dev server (`0.0.0.0:3001`, auto-restart) | `npm run dev:api` |
| Backend build (`tsc` → `apps/api/dist/`) | `npm run build:api` |
| Backend production server (`node dist/server.js`) | `npm run start:api` |
| Backend tests (`node:test`) | `npm run test:api` |
| Type-check every workspace (shared + api + web) | `npm run typecheck` |
| Install / refresh all workspace deps | `npm install` |

- Target one workspace directly: `npm run <script> --workspace web` (or `api`).
- Type-check the backend without emitting: `npx tsc --noEmit -p apps/api`.
- Smoke-test the API: `curl localhost:3001/health` → `{"status":"ok"}`.
- `PORT` env var overrides the API port.
- **The API needs `STORAGE_ROOT`** — an absolute path to an existing directory —
  set in `apps/api/.env` (copy `apps/api/env.example`). `npm run dev:api` exits
  with a clear message if it's missing or invalid. One-time:
  `mkdir -p ~/pistora-storage`.
- **Tests:** `node:test` via `tsx`, no extra deps. Run one file:
  `node --import tsx --test apps/api/src/routes/files.test.ts`. Run one case:
  add `--test-name-pattern "<regex>"`. `buildApp(config)` in `apps/api/src/app.ts`
  is the inject-testable factory; tests pass a temp `STORAGE_ROOT` per case
  (`apps/api/src/test-helpers.ts`).

## Codebase structure

Monorepo, npm workspaces, one root `package-lock.json` and `node_modules/`.
Root `package.json` is a coordinator only (`private`, no deps) — its scripts
forward to the workspaces.

- **`apps/web`** — Next.js 15 App Router frontend (React 19, TS, Tailwind v4).
  **Fully client-side** — no Server Components fetch API data, so `next build`
  emits a static site to `out/` (`output: "export"` in `next.config.ts`).
  - `src/app/` — routes: `/` ("Pistora Web" hub: `<ApiStatus>` live ping + three
    buttons — Open files → `/files`, Music (disabled, "coming soon"), Powerhouse
    → external `skanepowerhouse.com`) and `/files` (the file browser), plus
    `error.tsx` / `not-found.tsx`. Portfolio scaffold (`/projects`, `/contact`,
    `Navbar`, `Footer`) was stripped in Phase 2.
  - `src/app/files/page.tsx` — thin Server Component; one-line blurb + wraps
    `<FileBrowser>` in `<Suspense>` (required — `FileBrowser` uses
    `useSearchParams`).
  - `src/components/` — `FileBrowser` (owns path from `?path=`, usage-refresh
    key), `Breadcrumbs`, `FileTable` (Name/Size/Modified; folder row →
    navigate; every row has a `KebabMenu` (⋮) — Download (files), Rename
    (inline), Properties, Delete), `KebabMenu` (shared fixed-position dropdown),
    `FileProperties` (stat modal), `NewFolderButton` + `UploadButton` (inline,
    into the current folder), `ApiStatus`, `HomeButton` (fixed top-left house
    icon → `/`, hidden on `/`). Auth UI: `AuthProvider`, `RequireAuth`,
    `UserMenu`, `StorageBar`, `AdminUsers`, `LoginForm` (+ `RequestAccountLink`,
    the self-service "request an account" inline form), `ChangePasswordForm`.
  - `src/hooks/useDirectory.ts` — `listDir()` fetch hook (abortable, `reload()`).
  - `src/lib/format.ts` — `formatSize` / `formatDate`.
  - `src/app/layout.tsx` — minimal root layout: Bricolage Grotesque (headings) +
    Hanken Grotesk (body) + JetBrains Mono via `next/font`
    (`--font-bricolage-grotesque` / `--font-hanken-grotesk` /
    `--font-jetbrains-mono`) on `<html>`, `viewport.themeColor`, no chrome;
    pages own their layout. A base-layer rule maps `h1/h2/h3` to
    `--font-display`.
    `src/app/favicon.ico` (App Router auto-serves it; stale — regenerate from
    `icon.svg`). `src/app/styles/globals.css` — Tailwind v4 only (`@import
    "tailwindcss"` + `@theme inline`), no legacy v3 directives. **Design tokens:**
    `--background` / `--surface` / `--foreground` (Fog & Steel grays),
    `--accent` (steel blue — interactive) + `--accent-foreground`, `--amber`
    (transient states) + `--amber-foreground`; light + `prefers-color-scheme`
    dark. Steel-blue `:focus-visible` ring + accent `::selection` in the base
    layer. See DECISIONS.md → "Visual identity".
  - `src/lib/api/` — typed, framework-agnostic `fetch` client for the storage
    API (`listDir`, `statEntry`, `downloadFile`/`downloadResponse`/`fileUrl`,
    `uploadFiles`, `moveEntry`, `deleteEntry`, `makeDir`, `getUsage`,
    `getHealth`, `ping`; plus `auth.ts` — `login`/`logout`/`getMe`/… and the
    admin client fns). Throws
    `ApiError` (carries the envelope `code`) / `NetworkError`. Base URL from
    `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`; see
    `apps/web/env.example`) — **inlined at build time**, so production builds
    must set it. Import from `@/lib/api`.
  - `@/*` path alias → `apps/web/src/*`.
  - `next.config.ts` sets `outputFileTracingRoot` to the repo root; `output:
    "export"` + `images.unoptimized` for the static build.
  - TS config: `noEmit` (Next compiles), `target ES2017`, `moduleResolution
    bundler`.
- **`apps/api`** — Fastify 5 backend (TypeScript, ESM, `"type": "module"`).
  Local imports need explicit `.js` extensions (NodeNext).
  - `src/server.ts` — thin entrypoint: `process.loadEnvFile()` → `loadConfig()`
    → `buildApp()` → `listen()` on `${HOST||0.0.0.0}:${PORT||3001}`.
  - `src/app.ts` — `buildApp(config)`: the Fastify factory, no port binding, so
    tests drive it with `app.inject()`. Registers `@fastify/cors` (+
    `exposedHeaders` for downloads), `@fastify/sensible` (`httpErrors.*`),
    `@fastify/multipart`, the error handler, and the route plugins.
  - `src/config.ts` — `AppConfig` + `loadConfig()`; fails fast if `STORAGE_ROOT`
    is missing or not a directory. `buildApp` never reads `process.env`.
    `corsOrigins` is `(string | RegExp)[]`: unset `CORS_ORIGINS` → pistora.se +
    any loopback origin/port (dev); set → that exact list (prod).
  - `src/storage.ts` — `createStorage(root)`: the path-safety primitive.
    `resolve()` turns a client path into an absolute path guaranteed inside the
    root (lexical `..` check + symlink-escape check) or throws `PathError`.
    Every fs operation in a route goes through it. `forUser()` is the seam
    per-user isolation slots into when auth lands.
  - `src/routes/` — `health.ts` (`/health`, `/api/ping`), `files.ts`
    (`/api/files/*`: list / stat / download / upload / delete / `PATCH` rename-move),
    `dirs.ts` (`/api/dirs/*`: `mkdir -p`), plus `auth.ts`, `admin.ts`, `usage.ts`.
    `src/http.ts` = error envelope
    `{ error: { code, message } }`. `src/mime.ts`. DTOs moved to
    `packages/shared` in Phase 2 (imported as `import type { ... } from "shared"`).
  - Dev: `tsx watch` runs `.ts` directly. Prod: `tsc` emits `src/` → `dist/`
    (test files excluded), run with plain `node`. `dist/` is git-ignored.
  - TS config: `strict`, `target ES2023`, `module NodeNext`, emits to `dist/`.
  - **Storage API shape:** one shared namespace under `STORAGE_ROOT`, nested
    folders, no auth yet. `GET /api/files/<path>` → JSON listing for a
    directory, byte stream for a file (`?stat=1` for metadata, `?download=1`
    forces attachment). `POST /api/files/<dir>` multipart → streamed to a temp
    file then atomically renamed; overwrites allowed. `DELETE` (`?recursive=1`
    for a non-empty dir). `PATCH /api/files/<path>` `{ to }` = rename/move —
    parent must exist, no overwrite (`409`), no quota re-check (same per-user
    root). `POST /api/dirs/<path>` = `mkdir -p`. Range requests
    not supported yet (`Accept-Ranges: none`). (Everything but `/health` +
    `/api/auth/*` is now behind the session-cookie auth hook; `request.storage`
    is scoped to `users/<email>/` per caller — admins get the whole root.)
    `POST /api/auth/request-account` `{ email }` — public self-service
    signup trigger from the login page: creates the account immediately
    (same OTP mechanism as the admin's `POST /api/admin/users`), but emails
    the OTP to the admin, not the caller, and always replies `204` (never
    echoes the OTP). Throttled by IP.
- **`packages/shared`** — created in Phase 2. Holds the storage DTOs (`FileEntry`,
  `DirListing`, `FileMetadata`, `ErrorEnvelope`, `ErrorCode`) imported by both
  apps. `"type": "module"`, `private`, **no build step** — `package.json#exports`
  points at `src/index.ts` and both consumers read the `.ts` source directly
  (`apps/api` NodeNext, `apps/web` bundler). Wired as `"shared": "*"` in each app;
  `npm install` symlinks it into `node_modules/shared`. `apps/api` imports it
  **type-only** (`import type`), so nothing in `apps/api/dist/` resolves `shared`
  at runtime — enforced by `verbatimModuleSyntax` in `apps/api/tsconfig.json`.
  **Policy: types-only, no runtime code** (see the header comment in
  `src/index.ts`); adding a runtime value needs a real `tsc` build first.
- **`site/`** — hand-written static pages, not part of the npm build.
  `index.html` = "under construction", served from pistora.se's `wwwroot\`;
  `apitest.html` = the frontend↔backend connectivity probe. `site/joel/` =
  the `joel.pistora.se` placeholder page (Phase 6) + its `wrangler.jsonc`,
  deployed separately via Cloudflare Workers (static assets), not Hostek.
- **`infra/`** — ops notes & configs, not code. `infra/cloudflared/` (tunnel
  config example), `infra/dns/` (pistora.se DNS inventory + Cloudflare migration
  plan + Hostek support-request draft).

**Runtime shape (target):** the static `apps/web` build is hosted on
pistora.se and talks to `apps/api` running at home (WSL2) via `api.pistora.se`,
bridged by a tunnel. Frontend and backend deploy separately and never share a
process.

## What is this project?

A custom web app + home server, tied to the domain **pistora.se** (hosted at
hostek.se). Three goals at once:

1. Build a custom web app (frontend) + backend server for home use
2. Get hands-on practice with Claude Code ahead of a new job
3. Set up a 4TB+ SSD that's reachable (upload/download files) through the
   web app, as an alternative/complement to iCloud/Google Drive

Long-term hobby project — no hard deadline, but want to get started quickly
for the sake of practicing Claude Code.

**What lives where:**
- **`pistora.se`** — the self-hosted **storage product**: file upload/download
  backed by the home drive, with accounts for a small set of chosen users
  (multi-user, per-user storage, sharing between accounts; no public signup).
- **`joel.pistora.se`** — Joel's **personal portfolio app**, on its own
  subdomain, built later.
- **`api.pistora.se`** — the home backend, reached via the tunnel.

## Architecture (rough sketch)

| Part | What | Where |
|---|---|---|
| Frontend | React app | Static hosting on pistora.se (hostek.se) |
| Backend/API | Node.js server | Windows 11 machine at home (32GB RAM, reliable for 5 years) |
| Storage | 4TB+ SSD attached to the same machine | Home |
| Bridge between frontend ↔ home backend | Tunnel service (e.g. Cloudflare Tunnel) instead of port forwarding | — |

**Decision/insight:** Typical Swedish web hosts (likely including
hostek.se) don't run long-lived Node processes — that requires a VPS.
Doesn't matter here since the backend runs at home anyway. Frontend =
static build on pistora.se talking to the home backend via e.g.
`api.pistora.se`.

**Remote access (outside the home network):** Nice to have, not critical →
build locally first, expose to the internet in a later phase.

**Repo layout:** Monorepo, npm workspaces — chosen so the frontend, backend,
and a future `packages/shared` (shared TS types) live in one repo with one
lockfile. `packages/shared` is added only when the apps first exchange data.
See `## Codebase structure` above for the current wiring.

**Server OS:** WSL2 on the Windows 11 machine. Development and the
home backend both run here. The repo lives on the WSL2 native filesystem
(`~/code/pistora.se`), **not** `/mnt/c/...` — 9p/DrvFs makes npm/build
I/O ~10x slower. Access it from Windows via `\\wsl$\...` if needed.

## Roadmap / phases

- [x] **Phase 0 – Foundations & tooling:** repo, monorepo, backend scaffold,
      hosting + tunnel mechanics all proven (see below)
- [x] **Phase 1 – Backend + storage locally:** storage endpoints
      (`/api/files`, `/api/dirs`), the path-safety primitive, and a `node:test`
      suite landed against a placeholder `STORAGE_ROOT` (PR #1, merged
      2026-09-09). Standalone follow-up, not blocking: mount the real 5TB drive
      when it arrives. Auth is deliberately Phase 4.
- [x] **Phase 1a – Mount real 5TB drive:** update the storage api to target the  real 5TB storage drive
- [~] **Phase 2 – Frontend integration (foundation done, merging to `main`):**
      `packages/shared`, the typed API client, and a minimal client-side file
      browser (`/files`: browse, breadcrumbs, single-file upload, download) are
      built and exercised end-to-end — locally over LAN **and** in production
      against the home API via the quick tunnel (branch `phase-2-foundation`).
      Delete, rename/move, new-folder, and a properties view landed 2026-09-10
      (kebab menu per row). **Remaining (optional polish, not blocking
      anything):** drag-drop, upload progress, multi-select, mobile layout,
      a "move to folder" picker (endpoint already supports it).
- [x] **Phase 3 – Expose to the internet:** `pistora.se` DNS migrated to
      Cloudflare (2026-09-15), a named Cloudflare Tunnel runs `api.pistora.se`
      → `localhost:3001` as a persistent systemd service, and the static
      `apps/web` build is live on pistora.se driving that API end-to-end.
      HTTP→HTTPS redirect + `/files`-style deep-link routing on IIS handled by
      `apps/web/public/web.config`.
- [x] **Phase 4 – Auth & per-user storage:** custom email + password auth —
      session cookies (SQLite-backed), admin-invited users (OTP email, forced
      password change on first login), per-user storage via
      `storage.forUser(email)`, per-user quotas. Confirmed working in
      **production**: login, `/files` browsing, and a hard reload on a deep
      link all work with no redirect loop. Supersedes the earlier Cloudflare
      Access plan — see Decision log. **Remaining:** sharing between accounts
      (reuses the existing SQLite datastore).
- [ ] **Phase 5 – Extras:** sync with iCloud/Google Drive, rate limiting,
      Range-request support, polish.
- [x] **Phase 6 v1 – joel.pistora.se placeholder: live.** Joel's personal
      site, on its own subdomain, separate from the storage product. v1 scope
      deliberately minimal — a placeholder page (`site/joel/index.html`):
      photo, name, mailto + LinkedIn/Instagram/Spotify links, no
      framework/build step, hosted on **Cloudflare Workers (static assets)**
      (not Hostek, and not Cloudflare Pages — Cloudflare moved Pages to
      maintenance mode during 2026, all new investment goes to Workers, so
      this was set up on Workers from the start to avoid a future migration;
      `site/joel/wrangler.jsonc` is the minimal, no-npm-deps config), with a
      visual identity of its own distinct from "Fog & Steel". Confirmed live
      2026-09-15: Worker connected to the repo (Git-connected, root
      `site/joel`, auto-deploys on push), custom domain `joel.pistora.se`
      resolving and serving over HTTPS, all four links verified.
      **Remaining (not blocking, future work):** the full portfolio (About,
      Projects, Work experience) — not started, no content/design decided.
      `site/joel/photo.jpg` is committed for now (small circular avatar); a
      full-width redesign is planned (design direction TBD from Joel), at
      which point the photo should move out of git to separate hosting (e.g.
      Cloudflare R2) — deferred, not yet decided.

**Where we are right now:** **Phases 0–4 done (branch `phase-2-file-actions`,
not yet merged to `main`) — the full stack (storage, file browser, auth,
per-user quotas) is live in production at `pistora.se` ↔ `api.pistora.se`.**
- `apps/api` (Fastify 5 + TS): storage endpoints (`/api/files`, `/api/dirs`)
  plus full auth (`/api/auth/*`, `/api/admin/*`, `/api/usage`) — session
  cookies, SQLite-backed users, admin-invited OTP signup, per-user quotas.
  `request.storage` is scoped per caller via `storage.forUser(email)`. Full
  surface + module map: "Codebase structure → `apps/api`" above.
- `apps/web`: `/` hub, `/files` file browser (browse / upload / download /
  rename-move / delete / new-folder / properties, kebab menu per row),
  `/login`, `/admin` (invite/edit users), `/account/password`. Fog & Steel
  visual identity (Bricolage Grotesque + Hanken Grotesk + JetBrains Mono).
  `output: "export"` + `trailingSlash: true` → static `out/`.
- **Deployed:** the static export is uploaded to pistora.se's `wwwroot/` over
  FTPS, driving the home API through the named tunnel at `api.pistora.se`.
  Same registrable site as `pistora.se`, so the `SameSite=Lax` session cookie
  flows correctly — auth works in prod, not just locally.

**Cloudflare cutover — done (2026-09-15).** What actually happened, since it
deviated from the original runbook in `infra/dns/cloudflare-migration-plan.md`:
- DNS: nameservers switched to Cloudflare's (`amir.ns.cloudflare.com` /
  `clara.ns.cloudflare.com`), verified via `dig NS pistora.se @1.1.1.1` — note
  this box's own local resolver kept serving a stale cached answer for a while
  after the cutover; always re-check against a public resolver (`@1.1.1.1`)
  before concluding DNS hasn't propagated.
- Tunnel: created from the **Cloudflare Zero Trust dashboard**
  (Networks → Tunnels → Create a tunnel → Cloudflared connector), not the CLI
  `cloudflared tunnel login/create/route dns` flow the runbook and
  `infra/cloudflared/config.example.yml` describe. The dashboard issues a
  token instead of a cert + credentials file: `sudo cloudflared service
  install <token>` installed it straight to
  `/etc/systemd/system/cloudflared.service` (`ExecStart ... tunnel run
  --token-file /etc/cloudflared/token`), and the public hostname
  (`api.pistora.se` → `http://localhost:3001`) was set on the same dashboard
  page, which also creates the proxied DNS CNAME automatically — no
  `~/.cloudflared/config.yml` involved at all. `infra/cloudflared/config.example.yml`
  is now stale as a "how we actually did it" reference (kept as a valid
  alternative CLI-based method, e.g. if the dashboard token is ever lost and a
  from-scratch CLI recreate is easier).
- `apps/web/public/web.config` and `apps/web/.env.production.local` (see
  "Codebase structure") worked exactly as prepped — no changes needed once the
  tunnel was live.
- `apps/api/.env` on the WSL2 box: confirmed `CORS_ORIGINS`/`COOKIE_SECURE`
  set to prod values before the smoke test.

In dev (no `CORS_ORIGINS` set) the API allows pistora.se + **any**
`http(s)://localhost:<port>` / `127.0.0.1`, so it doesn't matter which port Next
lands on. Setting `CORS_ORIGINS` (prod) switches to an exact allowlist, no
localhost fallback.
When the WD Elements 5TB arrives: plug into Windows, point `STORAGE_ROOT` at
`/mnt/d/pistora` (see Open questions). Auth is Phase 4. Tunnel/DNS runs in
parallel.

**Known issues / follow-ups:**
- File-browser UI has browse / upload / download / rename-move / delete /
  new-folder / properties. Still missing: drag-drop, upload progress,
  multi-select, a move-to-folder picker (the `PATCH` endpoint already takes an
  arbitrary destination). Desktop-first (table scrolls on mobile, no dedicated
  small-screen layout). Follow-up job.
- `NEXT_PUBLIC_API_BASE` is inlined into the `apps/web` bundle **at build
  time**, and `next build` reads `apps/web/.env.local` too — so the deploy build
  only points at the right API if `.env.local` (or an explicit
  `NEXT_PUBLIC_API_BASE=… npm run build`) carries the public tunnel URL, not
  `localhost:3001`. A localhost build "works" only on the machine running the
  API — every other device sees "API unreachable". Verify before uploading:
  `grep -r localhost:3001 apps/web/out/_next/` must be empty.
- Deploy flow (working): `npm run build --workspace web` → FTPS-upload the
  contents of `apps/web/out/` into `wwwroot/`. HTTP→HTTPS redirect and
  hard-loaded deep links (`/files`, `/login`, …) are handled by
  `apps/web/public/web.config`, shipped in every build.
- `packages/shared` runtime-elision footgun: `apps/api` prod only works because
  the `shared` import is type-only. `verbatimModuleSyntax` guards it; a
  `grep -rn 'from "shared"' apps/api/dist` after a build should stay empty.
- Next.js `15.5.25`: `npm audit` shows 3 items (`sharp` libvips CVEs, bundled
  `postcss`) that only a major bump to Next 16 clears — do it deliberately.
  (`next lint` is also deprecated, removed in Next 16.)
- Storage API has no rate limiting and no Range-request support yet. Auth,
  per-user quotas, and per-user namespacing (`storage.forUser()`) all landed
  in Phase 4.
- Multi-file uploads are not atomic as a batch — a failure partway leaves the
  earlier files committed and returns only the failing part's error (see
  DECISIONS.md → "Upload durability"). Fine for Phase 1; revisit if bulk upload
  needs all-or-nothing.

## Background on the developer (relevant to how we work together)

- ~1 year of fullstack experience (frontend + backend)
- Some prior experience self-hosting a server (self-rated 3/5)
- Completed the Claude architecture certificate, wants to put the
  knowledge into practice
- Starting a new job soon — wants hands-on practice with Claude Code

## Open questions / to decide later

- **Auth approach (decided 2026-09-10, revised same day):** custom email +
  password auth (session cookies, admin-invited users, forced first-login
  password change) — not Cloudflare Access, which was the original plan. See
  Decision log. **Confirmed working in production (2026-09-15)** now that
  `api.pistora.se` makes the cookie same-site. Open sub-question: where
  sharing metadata lives (reuses the existing SQLite datastore, or a separate
  table in it).
- **Drive mount (decided 2026-09-09):** when the WD Elements 5TB arrives, plug
  it into Windows and use it via DrvFs at `/mnt/d`, keeping the factory NTFS
  format (`STORAGE_ROOT=/mnt/d/pistora`). Rationale: code is format-agnostic
  (one-line `.env` change to switch), throughput is HDD-bound so 9p overhead is
  negligible for bulk streaming, Windows keeps direct access as a
  backup/recovery net, no per-boot mount step. A `wsl --mount --bare` + ext4
  reformat stays as a later hardening option; `usbipd-win` ruled out for the
  permanent disk. Note: on NTFS/DrvFs the symlink-escape branch of
  `storage.resolve()` is a harmless no-op (no POSIX symlinks); it's exercised by
  the ext4-based tests.
- Whether to migrate pistora.se DNS to Cloudflare (free, needs domain-account
  holder) vs register a throwaway domain for `api.*` (~$10/yr, no dad). Leaning
  migration. Details in `infra/dns/`.
- Frontend deploy target — currently **Hostek IIS via FTPS** (works, manual
  upload of `apps/web/out/`). Revisit after the CF migration: Cloudflare Pages
  becomes near-trivial (git-push-to-deploy) and would also put the app behind
  the same Cloudflare edge as Access.
- Making the `cloudflared` tunnel a boot service on the WSL2 box (systemd in
  `/etc/wsl.conf`, or a Windows Task Scheduler entry).

## Decision log

Full history in [DECISIONS.md](DECISIONS.md). The still-load-bearing ones:

- **Architecture:** static frontend on pistora.se ↔ home backend (WSL2 on the
  Windows 11 box) via a **tunnel**, not port forwarding. Frontend/backend deploy
  separately, never share a process.
- **Monorepo**, npm workspaces (`apps/web`, `apps/api`, future
  `packages/shared`), one root lockfile.
- **Backend = Fastify 5 + TypeScript** (ESM). Chosen for streaming +
  `@fastify/multipart` (large-file up/download is the core requirement).
- **Storage API (Phase 1):** one shared namespace under `STORAGE_ROOT`, nested
  folders, `/api/files/*` + `/api/dirs/*`, GET disambiguated by `stat()`.
  Explicit path-safety helper (`src/storage.ts`) — Node has no safe-join.
  Streamed multipart → temp file → atomic rename. `node:test` + `tsx`, zero
  test deps. No auth (Phase 4). `packages/shared` deferred to Phase 2.
- **Product:** `pistora.se` = the self-hosted **storage product** — multi-user
  file storage for a small set of chosen users (per-user storage, sharing
  between accounts, no public signup). `joel.pistora.se` = Joel's **personal
  portfolio app**, a separate subdomain built later. (Supersedes the earlier
  "one domain, two surfaces / public personal site at the apex" framing. This
  block + "What lives where" above is now the authoritative product statement —
  there is no `PRODUCT.md`.)
- **Hosting:** website + email stay at **Hostek** (Windows/IIS `91.189.42.160`,
  MSPControl panel; email via MailChannels). Only **DNS** is planned to move to
  Cloudflare, to unlock `api.pistora.se` + a named tunnel. `infra/dns/` has the
  inventory, migration plan, and Hostek request.
- **Storage drive:** WD Elements 5TB, not yet on hand. When it arrives: DrvFs
  `/mnt/d`, keep NTFS (see Open questions for the rationale and migration path).
- **Auth = custom email + password, revised same day (2026-09-10):** the
  Cloudflare Access plan (below, superseded) was dropped in favor of building
  auth directly: session cookies (SQLite-backed), admin-invited users (OTP
  email, forced password change on first login), `storage.forUser(email)` for
  per-user directories, per-user quotas. Confirmed working in production
  (2026-09-15) after the Cloudflare migration: the session cookie is
  `SameSite=Lax`, which only flows when the API is the same registrable site
  as the web app — true for `api.pistora.se` ↔ `pistora.se`, unlike the
  earlier quick tunnel's `*.trycloudflare.com` host, which was a different
  site and made login loop in prod.
  *(Superseded plan, kept for context: Cloudflare Access — free Zero Trust,
  email one-time-PIN, ≤50 users — as the front door, verifying the Access JWT
  server-side. Dropped because it's an extra moving part for little benefit
  once building the login/session/OTP flow directly turned out to be
  straightforward.)*
