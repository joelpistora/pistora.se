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
  - `src/app/` — routes: `/` (`page.tsx`), `/projects`, `/contact`, plus
    `error.tsx` and `not-found.tsx`.
  - `src/app/layout.tsx` — root layout; `Navbar` + `Footer` wrap every page.
  - `src/components/` — shared UI. `src/app/styles/globals.css` — global CSS.
  - `@/*` path alias → `apps/web/src/*`.
  - `next.config.ts` sets `outputFileTracingRoot` to the repo root so
    production builds trace workspace files correctly.
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
  - `src/storage.ts` — `createStorage(root)`: the path-safety primitive.
    `resolve()` turns a client path into an absolute path guaranteed inside the
    root (lexical `..` check + symlink-escape check) or throws `PathError`.
    Every fs operation in a route goes through it. `forUser()` is the seam
    per-user isolation slots into when auth lands.
  - `src/routes/` — `health.ts` (`/health`, `/api/ping`), `files.ts`
    (`/api/files/*`: list / stat / download / upload / delete), `dirs.ts`
    (`/api/dirs/*`: `mkdir -p`). `src/http.ts` = error envelope
    `{ error: { code, message } }`. `src/mime.ts`, `src/types.ts` (DTOs).
  - Dev: `tsx watch` runs `.ts` directly. Prod: `tsc` emits `src/` → `dist/`
    (test files excluded), run with plain `node`. `dist/` is git-ignored.
  - TS config: `strict`, `target ES2023`, `module NodeNext`, emits to `dist/`.
  - **Storage API shape:** one shared namespace under `STORAGE_ROOT`, nested
    folders, no auth yet. `GET /api/files/<path>` → JSON listing for a
    directory, byte stream for a file (`?stat=1` for metadata, `?download=1`
    forces attachment). `POST /api/files/<dir>` multipart → streamed to a temp
    file then atomically renamed; overwrites allowed. `DELETE` (`?recursive=1`
    for a non-empty dir). `POST /api/dirs/<path>` = `mkdir -p`. Range requests
    not supported yet (`Accept-Ranges: none`).
- **`packages/shared`** — planned, not yet created. Will hold TS types imported
  by both apps once they exchange data; consumed as a workspace dependency
  (`"shared": "*"`). Until then the storage DTOs live in `apps/api/src/types.ts`
  and move here when `apps/web` first consumes the API (Phase 2).
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
- [~] **Phase 1 – Backend + storage locally (mostly done):** storage endpoints
      (`/api/files`, `/api/dirs`), the path-safety primitive, and a `node:test`
      suite all landed against a placeholder `STORAGE_ROOT`. Left: mount the real
      5TB drive when it arrives; auth is deliberately Phase 4.
- [ ] **Phase 2 – Frontend integration locally:** web app ↔ backend over
      LAN, upload/download working end-to-end
- [~] **Phase 3 – Expose to the internet (partially done):** static page is
      live on pistora.se and a Cloudflare **quick** tunnel to the home API is
      proven end-to-end. Left: a *stable* named tunnel at `api.pistora.se`
      (blocked on the DNS migration) and deploying the real frontend.
- [ ] **Phase 4 – Extras:** sync with iCloud/Google, authentication/
      security, polish

**Where we are right now:** **Phase 0 done; Phase 1 mostly done.** Proven so far:
- Repo on GitHub (`joelpistora/pistora.se`, `main`), monorepo/npm-workspaces
  live. Next.js 15 scaffold in `apps/web` builds clean (still stock scaffold
  copy — throwaway).
- `apps/api` (Fastify 5 + TS): storage endpoints under `/api/files` +
  `/api/dirs` (list / upload / download / delete / mkdir, nested folders,
  streaming multipart, atomic-rename writes), a hardened path-safety helper
  (`src/storage.ts`), `buildApp()` factory, fail-fast config, and a green
  `node:test` suite (31 tests). No auth yet — Phase 4. Serves a placeholder
  `STORAGE_ROOT` (`~/pistora-storage`) until the drive arrives.
- Hosting mechanics proven: static files reach pistora.se via MSPControl File
  Manager and FTPS; `site/index.html` "under construction" is live.
- Networking proven end-to-end: a page on pistora.se successfully calls the home
  API through a Cloudflare **quick tunnel** (ephemeral URL).

**Blocking Phase 3 (not Phase 1):** a *stable* `api.pistora.se` needs
pistora.se's DNS moved to Cloudflare. Plan + DNS inventory + Hostek request are
in `infra/dns/`. Waiting on the domain-account holder / Hostek admin to change
the nameservers.

**Next session → Phase 2:** wire `apps/web` to the storage API over the LAN —
a real file browser / upload UI against `/api/files`. When the WD Elements 5TB
arrives: plug it into Windows, point `STORAGE_ROOT` at `/mnt/d/pistora` (see
Open questions). Auth work is Phase 4. The tunnel/DNS work runs in parallel.

**Known issues / follow-ups:**
- `apps/web` is still the stock `create-next-app` scaffold (portfolio copy,
  `Navbar`/`Footer`, `/projects` + `/contact`). Real frontend is a later job.
- Next.js `15.5.25`: `npm audit` shows 3 items (`sharp` libvips CVEs, bundled
  `postcss`) that only a major bump to Next 16 clears — do it deliberately.
- `apps/web/src/app/layout.tsx` loads Geist fonts but never applies them to
  `<body>`; `globals.css` mixes Tailwind v4 `@import` with legacy v3 directives.
- `site/apitest.html` holds a hard-coded ephemeral tunnel URL — expected to be
  stale; repoint to `https://api.pistora.se` once the DNS migration lands.
- Storage API has no auth, no quota, no rate limiting, no Range-request support
  yet, and one shared namespace (no per-user dirs). All deliberate for Phase 1;
  `storage.forUser()` is the seam auth slots into.

## Background on the developer (relevant to how we work together)

- ~1 year of fullstack experience (frontend + backend)
- Some prior experience self-hosting a server (self-rated 3/5)
- Completed the Claude architecture certificate, wants to put the
  knowledge into practice
- Starting a new job soon — wants hands-on practice with Claude Code

## Open questions / to decide later

- Authentication/security before exposing to the internet
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
- Frontend deploy target for the real `apps/web` — Cloudflare Pages vs GitHub
  Pages vs stay on Hostek IIS. Leaning Pages (git-push-to-deploy). Not Hostek.
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
