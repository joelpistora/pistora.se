# Pistora – Project Overview & Status

> This document is the living source of truth for the project. Update it
> whenever we make a decision or wrap up a phase, so work can be picked back
> up at any time without losing context.

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

**Repo layout:** Monorepo, npm workspaces. `apps/web` = Next.js frontend
(live). `apps/api` = Node.js backend (not scaffolded yet). `packages/shared`
= TypeScript types shared by both (added when first needed). Root
`package.json` holds proxy scripts — `npm run dev`/`build`/`lint` from the
root run the `web` workspace.

**Server OS:** WSL2 on the Windows 11 machine. Development and the
home backend both run here.

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
clean. Next: decide the backend framework and scaffold `apps/api`.

**Known issues / follow-ups:**
- `next@15.4.5` has a critical CVE (CVE-2025-66478) — bump to a patched
  15.4.x
- `apps/web/src/app/layout.tsx` loads the Geist fonts but never applies
  them to `<body>` (unused-var warnings)
- `apps/web/src/app/styles/globals.css` mixes Tailwind v4 (`@import
  "tailwindcss"`) with legacy v3 directives (`@tailwind base` etc.)
- Repo lives on the Windows filesystem (`/mnt/c/...`); `npm install` and
  builds are slow from WSL2 — consider moving into the WSL2 filesystem

## Background on the developer (relevant to how we work together)

- ~1 year of fullstack experience (frontend + backend)
- No prior experience self-hosting a server (self-rated 2.5/5)
- Completed the Claude architecture certificate, wants to put the
  knowledge into practice
- Starting a new job soon — wants hands-on practice with Claude Code

## Open questions / to decide later

- Which backend framework (e.g. Express/Fastify)? — deferred until we
  start `apps/api`
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
