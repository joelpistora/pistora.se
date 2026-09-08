# Pistora

A custom web app + home server tied to the domain **pistora.se**. A static
frontend (hosted on pistora.se) talks to a Node.js backend running at home,
which serves files from an attached multi-TB drive — a self-hosted
alternative to iCloud/Google Drive.

Long-term hobby project. See [CLAUDE.md](CLAUDE.md) for the full status,
roadmap, and decision log.

## Repo layout

Monorepo, npm workspaces, one root lockfile.

| Path | What |
|---|---|
| `apps/web` | Next.js 15 frontend (App Router, React 19, TypeScript, Tailwind v4) |
| `apps/api` | Fastify 5 backend (TypeScript, ESM) — currently just `GET /health` |
| `packages/shared` | Shared TypeScript types (planned, not yet created) |

## Prerequisites

- Node.js 24+
- npm 10+

## Getting started

```bash
npm install
```

Run the frontend (http://localhost:3000):

```bash
npm run dev
```

Run the backend (http://localhost:3001), with auto-restart on save:

```bash
npm run dev:api
```

```bash
curl localhost:3001/health   # -> {"status":"ok"}
```

## Commands

All from the repo root.

| Command | Does |
|---|---|
| `npm run dev` | Frontend dev server |
| `npm run build` | Frontend production build |
| `npm run start` | Frontend production server |
| `npm run lint` | Lint the frontend |
| `npm run dev:api` | Backend dev server (tsx watch) |
| `npm run build:api` | Compile the backend (`tsc` → `apps/api/dist/`) |
| `npm run start:api` | Run the compiled backend |

Target a single workspace directly with `npm run <script> --workspace web`
(or `api`). The API port can be overridden with the `PORT` env var.

## Deployment (target)

The `apps/web` build is served statically from pistora.se. `apps/api` runs on
a home machine (WSL2 on Windows 11) and is reached from the frontend via
`api.pistora.se`, bridged by a tunnel rather than port forwarding. The two
deploy independently.
