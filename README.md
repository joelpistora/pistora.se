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
| `apps/api` | Fastify 5 backend (TypeScript, ESM) — file storage endpoints under `/api/files` + `/api/dirs`, plus `/health` |
| `packages/shared` | Shared TypeScript DTOs, imported by both apps (source-only, no build step) |

## Prerequisites

- Node.js 24+
- npm 10+

## Getting started

```bash
npm install
```

One-time backend setup — the API needs a directory to serve files from:

```bash
mkdir -p ~/pistora-storage
cp apps/api/env.example apps/api/.env
# then edit apps/api/.env: STORAGE_ROOT=/home/<you>/pistora-storage
```

One-time frontend setup — point the client at the API (defaults to
`http://localhost:3001` if skipped):

```bash
cp apps/web/env.example apps/web/.env.local
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

`npm run dev:api` exits with a clear message if `STORAGE_ROOT` is unset or
doesn't point at an existing directory.

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
| `npm run test:api` | Backend test suite (`node:test`) |
| `npm run typecheck` | Type-check every workspace (shared + api + web) |

Target a single workspace directly with `npm run <script> --workspace web`
(or `api`). The API port can be overridden with the `PORT` env var.

Run one backend test file, or one case by name:

```bash
node --import tsx --test apps/api/src/routes/files.test.ts
node --import tsx --test --test-name-pattern "traversal" apps/api/src/routes/files.test.ts
```

## Deployment (target)

The `apps/web` build is served statically from pistora.se. `apps/api` runs on
a home machine (WSL2 on Windows 11) and is reached from the frontend via
`api.pistora.se`, bridged by a tunnel rather than port forwarding. The two
deploy independently.
