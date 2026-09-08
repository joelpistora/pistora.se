# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Pistora – Project Overview & Status

> This document is the living source of truth for the project. Update it
> whenever we make a decision or wrap up a phase, so work can be picked back
> up at any time without losing context.

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
| Install / refresh all workspace deps | `npm install` |

- Target one workspace directly: `npm run <script> --workspace web` (or `api`).
- Type-check the backend without emitting: `npx tsc --noEmit -p apps/api`.
- Smoke-test the API: `curl localhost:3001/health` → `{"status":"ok"}`.
- `PORT` env var overrides the API port.
- **Tests:** no runner configured yet. When one is added, document how to run a
  single test here.

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
  - `src/server.ts` — builds the Fastify instance (Pino `logger: true`),
    registers routes, `listen()` on `0.0.0.0:${PORT||3001}`. Only `GET /health`
    so far.
  - Dev: `tsx watch` runs `.ts` directly. Prod: `tsc` emits `src/` → `dist/`,
    run with plain `node`. `dist/` is git-ignored.
  - TS config: `strict`, `target ES2023`, `module NodeNext`, emits to `dist/`.
- **`packages/shared`** — planned, not yet created. Will hold TS types imported
  by both apps once they exchange data; consumed as a workspace dependency
  (`"shared": "*"`).

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

- [ ] **Phase 0 – Foundations & tooling:** set up the server machine, repo,
      Claude Code workflow
- [ ] **Phase 1 – Backend + storage locally:** API + SSD connection,
      working on the home network
- [ ] **Phase 2 – Frontend integration locally:** web app ↔ backend over
      LAN, upload/download working end-to-end
- [ ] **Phase 3 – Expose to the internet:** Cloudflare Tunnel (or similar) +
      deploy frontend to pistora.se
- [ ] **Phase 4 – Extras:** sync with iCloud/Google, authentication/
      security, polish

**Where we are right now:** Phase 0. Repo connected to GitHub
(`joelpistora/pistora.se`, `main`). Monorepo layout is live — the Next.js 15
frontend (App Router, React 19, TS, Tailwind v4) sits in `apps/web`, builds
clean. `apps/api` scaffolded — Fastify + TypeScript, one `GET /health`
route, builds and boots green. Next: decide what the first real endpoints
are (Phase 1 — storage) and how the SSD mounts into WSL2.

**Known issues / follow-ups:**
- Next.js on `15.5.25` (critical React-flight RCE cleared). `npm audit`
  still shows 3 items — `sharp` libvips CVEs and Next's bundled `postcss`
  — that only a major bump to Next 16 resolves. Do that as its own
  deliberate upgrade.
- `apps/web/src/app/layout.tsx` loads the Geist fonts but never applies
  them to `<body>` (unused-var warnings)
- `apps/web/src/app/styles/globals.css` mixes Tailwind v4 (`@import
  "tailwindcss"`) with legacy v3 directives (`@tailwind base` etc.)

## Background on the developer (relevant to how we work together)

- ~1 year of fullstack experience (frontend + backend)
- No prior experience self-hosting a server (self-rated 2.5/5)
- Completed the Claude architecture certificate, wants to put the
  knowledge into practice
- Starting a new job soon — wants hands-on practice with Claude Code

## Open questions / to decide later

- Authentication/security before exposing to the internet
- How the SSD gets formatted and mounted into WSL2 (NTFS vs ext4 vs
  exFAT) — decide when the drive arrives

## Decision log

- 2026-09-07: High-level architecture and phases established as above
- 2026-09-07: Purchased WD Elements 5TB portable external HDD (USB 3.2 Gen 1, Windows-formatted, ~1450 SEK) as the storage drive
- 2026-09-07: Repo connected to GitHub remote `joelpistora/pistora.se`; consolidated two divergent scaffolds onto `main`, dropped stale `master`
- 2026-09-07: Monorepo layout chosen — `apps/web`, `apps/api`, `packages/shared`, npm workspaces
- 2026-09-07: Server OS = WSL2 on the Windows 11 machine (same box for dev and home backend)
- 2026-09-07: Backend framework decision deferred until `apps/api` work begins
- 2026-09-07: Re-ordered the storage drive from Amazon; not yet on hand
- 2026-09-07: Frontend moved into `apps/web`; root npm-workspaces manifest added; single root lockfile; build verified green
- 2026-09-07: Backend framework = **Fastify** (TypeScript). Chosen over Express 5 (TS is bolt-on, more boilerplate), NestJS (too heavy for a hobby file server), and Hono (edge-first, thinner for heavy file I/O). Fastify gives TS-native DX, built-in JSON Schema validation, first-class streaming + `@fastify/multipart` for the large-file upload/download that is the core requirement, and a plugin architecture worth having practiced. New job has no known/Node stack, so chosen on project merits.
- 2026-09-08: `apps/api` scaffolded — Fastify 5 + TypeScript (ESM, `tsx` dev runner, `tsc` build to `dist/`), `GET /health` route, port 3001. Root scripts `dev:api`/`build:api`/`start:api` added. `dist` gitignored.
- 2026-09-08: Product scope confirmed — **pistora.se is two surfaces of one product: a public personal site (open) and the file app (auth-gated), sharing one domain and identity.** File storage is **multi-user** for a small closed circle of trusted people (accounts, per-user storage, sharing between accounts as a first-class feature); no public signup. The current `apps/web` scaffold's "portfolio" / "Pistora Enterprise" copy is throwaway, not product truth.
- 2026-09-08: **Frontend hosting mechanism proven.** hostek.se = Hostek AB shared **Windows/IIS** box `91.189.42.160` (A record for `pistora.se` + `www`), managed via **MSPControl** (`mspc.hostek.se`), not cPanel. Web root `Home\pistora.se\wwwroot\` (`Home\` also holds two other domains — scope any FTP account below `pistora.se`). Two working upload paths, both verified with test files serving at `https://pistora.se/<name>`: (a) MSPControl **File Manager**; (b) **FTPS** — FileZilla to `91.189.42.160:21`, explicit TLS, per-FTP-account creds (no `ftp.pistora.se` DNS record exists). Any standard extension serves incl. `.txt`. Routing/404/HTTPS would be a `web.config` (IIS), not `.htaccess`. Current `wwwroot\index.html` is a throwaway "blueprint" placeholder. Next: static-export `apps/web` and do the first real deploy; automation (GitHub Actions FTP) and tunnel-vs-automation ordering still open.
- 2026-09-08: Interim public page = a single hand-written static `index.html` at repo root (`site/index.html`) showing "pistora.se is under construction" — no framework, no JS, upload straight to `wwwroot\`. `apps/web` (Next.js) stays the eventual real frontend; the earlier attempt to design its landing page was scrapped.
