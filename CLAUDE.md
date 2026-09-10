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
    `UserMenu`, `StorageBar`, `AdminUsers`, `LoginForm`, `ChangePasswordForm`.
  - `src/hooks/useDirectory.ts` — `listDir()` fetch hook (abortable, `reload()`).
  - `src/lib/format.ts` — `formatSize` / `formatDate`.
  - `src/app/layout.tsx` — minimal root layout: Geist fonts on `<html>`, no
    chrome; pages own their layout. `src/app/favicon.ico` (App Router
    auto-serves it). `src/app/styles/globals.css` — Tailwind v4 only
    (`@import "tailwindcss"` + `@theme`), no legacy v3 directives.
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
- **`site/`** — hand-written static pages served from pistora.se's `wwwroot\`
  right now (not part of the npm build). `index.html` = "under construction";
  `apitest.html` = the frontend↔backend connectivity probe.
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
- [ ] **Phase 1a – Mount real 5TB drive:** update the storage api to target the  real 5TB storage drive
- [~] **Phase 2 – Frontend integration (foundation done, merging to `main`):**
      `packages/shared`, the typed API client, and a minimal client-side file
      browser (`/files`: browse, breadcrumbs, single-file upload, download) are
      built and exercised end-to-end — locally over LAN **and** in production
      against the home API via the quick tunnel (branch `phase-2-foundation`).
      Delete, rename/move, new-folder, and a properties view landed 2026-09-10
      (kebab menu per row). **Remaining (optional polish, not blocking
      anything):** drag-drop, upload progress, multi-select, mobile layout,
      a "move to folder" picker (endpoint already supports it).
- [~] **Phase 3 – Expose to the internet (running on a quick tunnel):** the
      static `apps/web` build is live on pistora.se and reaches the home API
      through a Cloudflare **quick** tunnel end-to-end. **Remaining:** migrate
      pistora.se DNS to Cloudflare → stand up the *stable* named tunnel at
      `api.pistora.se` → rebuild the frontend against that URL. Smaller loose
      ends: HTTP→HTTPS redirect + `/files` deep-link routing on IIS
      (`web.config`).
- [ ] **Phase 4 – Auth & per-user storage (starts after the DNS migration):**
      Cloudflare Access as the front door (email one-time-PIN, free ≤50 users) +
      a Fastify middleware that verifies the Access JWT and routes each request
      through `storage.forUser(email)` for per-user directories. Then sharing
      between accounts (needs a small datastore — the project's first). Gated on
      Phase 3's migration because Access binds to a Cloudflare-proxied hostname
      — see Decision log.
- [ ] **Phase 5 – Extras:** sync with iCloud/Google Drive, quotas, rate
      limiting, Range-request support, polish.

**Where we are right now:** **Phases 0–1 done & merged. Phase 2 foundation +
minimal file browser done on branch `phase-2-foundation` (being merged to
`main`) — proven end-to-end locally and in production through the quick tunnel.
Phase 3 half-done (quick tunnel live). Next up is a free choice: the DNS
migration, more Phase 2 polish, or Phase 4 auth once migrated.**
- `apps/api` (Fastify 5 + TS): storage endpoints under `/api/files` +
  `/api/dirs` (list / upload / download / delete / mkdir, nested folders,
  streaming multipart, atomic-rename writes), a hardened path-safety helper
  (`src/storage.ts`), `buildApp()` factory, fail-fast config, `node:test` suite
  (34 tests, green). Code-reviewed (`/code-review high`) — fixes in `8ac4027`.
  No auth yet — Phase 4. Serves a placeholder `STORAGE_ROOT` (`~/pistora-storage`)
  until the drive arrives. Full API surface + module map: see "Codebase
  structure → `apps/api`" above.
- `apps/web`: portfolio scaffold stripped; minimal `layout.tsx` (Geist wiring
  fixed); `globals.css` reconciled to Tailwind v4; `output: "export"` (static
  build to `out/`). Typed API client at `src/lib/api/` (smoke-tested: mkdir →
  upload → list → stat → download → delete → 404). **UI:** `/` "Pistora Web" hub
  (API-status ping + Open files / Music-soon / Powerhouse buttons); `/files`
  file browser — table listing, breadcrumb
  navigation via `?path=`, folder-click to descend, a per-row kebab menu
  (Download / Rename / Properties / Delete, folder delete warns on contents),
  a New folder button, single-file upload into the current folder. Plain-text
  loading/empty/error states. No drag-drop/upload-progress/multi-select yet.
- `packages/shared`: created, holds the storage DTOs + `ErrorCode`; consumed as
  source by both apps, no build step. First real use of the workspace.
- **Deployed:** the `apps/web` static export (`out/`) is uploaded to pistora.se's
  `wwwroot/` over FTPS (replacing the holding page). The live site drives the
  home API through a Cloudflare **quick tunnel** — a fresh `*.trycloudflare.com`
  URL each time it restarts, baked into the build via `NEXT_PUBLIC_API_BASE`.
  Ephemeral by nature; the stable `api.pistora.se` is Phase 3's remaining work.

**Blocking Phase 3 *and* Phase 4:** a *stable* `api.pistora.se` (and Cloudflare
Access for auth) both need pistora.se's DNS moved to Cloudflare. Plan + DNS
inventory + Hostek request are in `infra/dns/`. Waiting on the domain-account
holder / Hostek admin to change the nameservers.

**Phase 2 progress:**
1. ~~Strip the stock scaffold; fix `layout.tsx` font wiring + `globals.css`
   v4/v3 mix.~~ **Done.**
2. ~~Create `packages/shared`, move the DTOs into it, wire `"shared": "*"` in
   both apps.~~ **Done** (source-only, no build — see Codebase structure).
3. ~~Typed API client in `apps/web` (`src/lib/api/`).~~ **Done** — `fetch`
   wrapper over `/api/files` + `/api/dirs`, `ApiError`/`NetworkError`, base URL
   from `NEXT_PUBLIC_API_BASE`.
4. ~~File-browser UI~~ **Done (v1 + actions):** `/files` — table listing +
   breadcrumbs (`?path=`), folder navigation, single-file upload, download,
   per-row kebab menu (rename / properties / delete), new folder. **Deferred:**
   drag-drop, upload progress, multi-select, move-to-folder picker.
5. ~~Prove upload/download end-to-end~~ **Done** — locally over `localhost`, and
   in production (pistora.se → quick tunnel → home API).

**Phase 2 foundation is complete.** Merge `phase-2-foundation` → `main`. Then
pick the next thread freely: Phase 3 DNS migration, Phase 2 polish features
(drag-drop / upload progress / multi-select / …), or Phase 4 auth (only *after*
the migration).

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
  contents of `apps/web/out/` into `wwwroot/`. Loose ends for a clean Phase 3
  finish: **no HTTP→HTTPS redirect** on pistora.se (http visitors get
  CORS-blocked — API allowlist is https-only), and a hard-loaded
  `pistora.se/files` may 404 on IIS (export emits `files.html`, not
  `files/index.html`; client-side nav from `/` works). Both fixed with a
  `web.config` (`trailingSlash: true` + redirect rule).
- `packages/shared` runtime-elision footgun: `apps/api` prod only works because
  the `shared` import is type-only. `verbatimModuleSyntax` guards it; a
  `grep -rn 'from "shared"' apps/api/dist` after a build should stay empty.
- Next.js `15.5.25`: `npm audit` shows 3 items (`sharp` libvips CVEs, bundled
  `postcss`) that only a major bump to Next 16 clears — do it deliberately.
  (`next lint` is also deprecated, removed in Next 16.)
- `site/apitest.html` holds a hard-coded ephemeral tunnel URL — expected to be
  stale; repoint to `https://api.pistora.se` once the DNS migration lands.
- Storage API has no auth, no quota, no rate limiting, no Range-request support
  yet, and one shared namespace (no per-user dirs). All deliberate for Phase 1;
  `storage.forUser()` is the seam auth slots into.
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

- **Auth approach (decided 2026-09-10):** Cloudflare Access (free Zero Trust,
  ≤50 users, email one-time-PIN) as the front door, sequenced *after* the DNS
  migration. See Decision log. Open sub-questions: protect the whole site vs
  just `/files` + the API; how the JS client handles an expired-session 302;
  where sharing metadata lives (first datastore — SQLite? a JSON file?).
- The site is currently public with **no auth** (quick tunnel, shared only with
  trusted people by hand) — deliberate and temporary until Phase 4.
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
- **Auth = Cloudflare Access, after the DNS migration (2026-09-10):** Phase 4
  auth is sequenced behind Phase 3's Cloudflare migration. Access (free Zero
  Trust, email one-time-PIN, ≤50 users) is the front door — it removes password
  storage, session management, email verification, and MFA — but binds only to
  a Cloudflare-proxied hostname, so the zone must move first. The API verifies
  the Access JWT (`Cf-Access-Jwt-Assertion`) and routes each request through
  `storage.forUser(email)` for per-user directories; sharing between accounts
  stays application work (the project's first datastore). Building custom
  email/password auth beforehand would be throwaway.
