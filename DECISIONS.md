# Decision log

Full history of project decisions. `CLAUDE.md` keeps only a short pointer here
plus the handful of still-load-bearing ones. Newest at the bottom.

## Phase 0 — Foundations & tooling (2026-09-07 → 2026-09-09)

- **2026-09-07:** High-level architecture and phases established (static
  frontend on pistora.se ↔ home backend via a tunnel; 5TB drive on the home
  machine; phases 0–4).
- **2026-09-07:** Purchased WD Elements 5TB portable external HDD (USB 3.2 Gen 1,
  Windows-formatted, ~1450 SEK) as the storage drive; re-ordered from Amazon,
  not yet on hand.
- **2026-09-07:** Repo connected to GitHub remote `joelpistora/pistora.se`;
  consolidated two divergent scaffolds onto `main`, dropped stale `master`.
- **2026-09-07:** Monorepo layout chosen — `apps/web`, `apps/api`,
  `packages/shared`, npm workspaces; single root lockfile. Frontend moved into
  `apps/web`; root npm-workspaces manifest added; build verified green.
- **2026-09-07:** Server OS = WSL2 on the Windows 11 machine (same box for dev
  and the home backend). Repo on the WSL2 native filesystem for I/O speed.
- **2026-09-07:** Backend framework = **Fastify** (TypeScript). Chosen over
  Express 5 (TS bolt-on, more boilerplate), NestJS (too heavy for a hobby file
  server), Hono (edge-first, thinner for heavy file I/O). Fastify gives TS-native
  DX, JSON Schema validation, first-class streaming + `@fastify/multipart` for
  the large-file upload/download that is the core requirement, and a plugin
  architecture worth practising. New job has no known/Node stack → chosen on
  project merits.
- **2026-09-08:** `apps/api` scaffolded — Fastify 5 + TypeScript (ESM, `tsx` dev
  runner, `tsc` build to `dist/`), `GET /health`, port 3001. Root scripts
  `dev:api` / `build:api` / `start:api`. `dist/` gitignored.
- **2026-09-08:** Product scope confirmed — **pistora.se is two surfaces of one
  product: a public personal site (open) and the file app (auth-gated), sharing
  one domain and identity.** File storage is **multi-user** for a small closed
  circle of trusted people (accounts, per-user storage, sharing between accounts
  as a first-class feature); no public signup. The current `apps/web` scaffold
  copy ("portfolio" / "Pistora Enterprise") is throwaway, not product truth.
  (A fuller `apps/web/PRODUCT.md` existed briefly from the scrapped Impeccable
  design run; deleted, not committed. Superseded 2026-09-09 — see below.)
- **2026-09-08:** Interim public page = a single hand-written static
  `site/index.html` ("pistora.se is under construction") — no framework, no JS,
  uploaded straight to `wwwroot\`. `apps/web` (Next.js) stays the eventual real
  frontend; an earlier attempt to design its landing page was scrapped and
  reverted.
- **2026-09-08:** **Frontend hosting mechanism proven.** hostek.se = Hostek AB
  shared **Windows/IIS** box `91.189.42.160`, panel **MSPControl**
  (`mspc.hostek.se`), not cPanel. Web root `Home\pistora.se\wwwroot\`
  (`pistora.se` is an add-on domain under a `capitalpidesign.se`-primary hosting
  plan). Two working upload paths, both verified: (a) MSPControl **File
  Manager**; (b) **FTPS** — FileZilla to `91.189.42.160:21`, explicit TLS, with
  a dedicated FTP account scoped to `pistora.se/wwwroot`. Routing/404/HTTPS would
  be an IIS `web.config`, not `.htaccess`.
- **2026-09-08:** **First end-to-end frontend↔backend call proven over the
  public internet.** `site/apitest.html` on pistora.se → Cloudflare **quick
  tunnel** (`cloudflared tunnel --url http://localhost:3001`, ephemeral
  `*.trycloudflare.com`) → Fastify `GET /api/ping` at home → JSON rendered in the
  page. API now registers `@fastify/cors` (allowlist `https://pistora.se`,
  `https://www.pistora.se`, `http://localhost:3000`) and has `/api/ping`
  alongside `/health`.
- **2026-09-09:** **A stable `api.pistora.se` requires migrating pistora.se DNS
  to Cloudflare.** Ruled out: Cloudflare subdomain-only zone (Enterprise-only
  now), Cloudflare partial/CNAME setup (Business-only, ~$250/mo), ngrok custom
  domain (~$27/mo), self-serve NS delegation (Hostek's DNS editor can't add NS
  records). A throwaway second domain (~$10/yr, `api.<other>.tld`) stays as a
  fallback. Full migration is free and the intended end state; needs the domain
  account holder / Hostek admin to change the nameservers (locked in the client
  portal).
- **2026-09-09:** **Full pistora.se DNS inventory captured** (10 records) in
  `infra/dns/pistora-se-dns.md`. Migration plan in
  `infra/dns/cloudflare-migration-plan.md`; Swedish nameserver-change request in
  `infra/dns/hostek-ns-request-sv.md`. No DNSSEC, no DKIM/DMARC. Website + email
  stay at Hostek; only DNS moves.
- **2026-09-09:** **Product framing revised.** `pistora.se` is now *the storage
  product* — multi-user file storage for a small set of chosen users (per-user
  storage, sharing between accounts, no public signup). Joel's personal
  portfolio moves off the apex to its own subdomain **`joel.pistora.se`**, built
  later. Supersedes the 2026-09-08 "one domain, two surfaces — public personal
  site (open) + file app (gated)" decision. (No `PRODUCT.md` in the repo — the
  authoritative product statement now lives in `CLAUDE.md` → "What lives where".)

## Phase 1 — Storage endpoints (2026-09-09)

- **Backend refactored for testability.** `apps/api/src/server.ts` reduced to a
  thin entrypoint (`loadEnvFile` → `loadConfig` → `buildApp` → `listen`).
  `src/app.ts` exports `buildApp(config)` — a Fastify factory that binds no port
  and never reads `process.env`, so tests drive it with `app.inject()`.
  `src/config.ts` parses the environment and **fails fast** if `STORAGE_ROOT` is
  missing or isn't a directory. Routes split into `src/routes/{health,files,dirs}.ts`.
- **REST shape:** one shared namespace under `STORAGE_ROOT`, nested folders from
  day one. `GET /api/files/*` — directory → JSON `DirListing`, file → byte
  stream; `?stat=1` → `FileMetadata`, `?download=1` → attachment disposition.
  `POST /api/files/*` — multipart upload into that directory (must already
  exist). `DELETE /api/files/*` — `?recursive=1` for a non-empty dir. `POST
  /api/dirs/*` — `mkdir -p`. Rejected alternatives: verb-prefixed routes
  (`/api/list`, `/api/download`), a single route with `?list`/`?download` flags,
  fully-RESTful `PUT`-to-path (deferred, not dropped). Directories get their own
  `/api/dirs` prefix because a directory isn't a file resource.
- **Path safety = an explicit helper** (`src/storage.ts`), not a library. Node
  has no built-in safe-join / `openat`. `createStorage(root).resolve(userPath)`
  does a lexical containment check (`path.resolve` + `path.relative`, reject
  `..`/absolute/NUL/`C:\`) **and** a symlink check (realpath the nearest
  existing ancestor, reject if it lands outside the root), throwing a
  `PathError` (400 bad input / 403 escape). Rejected: `@fastify/static` (couples
  URL to FS, weaker guarantees), Node's `--allow-fs-*` permission model (too
  coarse — can't express "only under STORAGE_ROOT"). `forUser()` is a stub seam
  for per-user isolation when auth arrives (Phase 4).
- **Added deps:** `@fastify/multipart` (streaming upload — the reason Fastify was
  chosen) and `@fastify/sensible` (for the `httpErrors.*` vocabulary). Error
  envelope is one shape everywhere: `{ error: { code, message } }`, where `code`
  is a stable slug the frontend can branch on — `PathError`'s own codes,
  `validation`, or the HTTP status mapped to a slug (`not_found`, `conflict`,
  `payload_too_large`, …); any 5xx collapses to `internal` with the detail
  logged, not returned.
- **Upload durability:** each part is streamed via `pipeline` to a
  `.upload-<uuid>.part` file **in the destination directory**, then atomically
  `rename`d into place (same-filesystem swap; readers never see a half-written
  file). `part.file.truncated` after the pipe → 413 + temp file removed.
  Overwrite-on-upload is allowed in Phase 1. A multi-file upload is **not
  atomic as a batch** — parts are committed one at a time, so a failure on
  part N leaves parts 1..N-1 written and returns only that part's error; the
  client must re-list to see what landed. Accepted for Phase 1. Orphaned
  `.upload-*.part` files (hard crash mid-write) are filtered out of directory
  listings.
- **Download:** `fs.createReadStream` + explicit `Content-Length` /
  `Content-Type` (hand-rolled `src/mime.ts`, ~45 entries, octet-stream
  fallback) / `Content-Disposition` (ASCII + RFC 5987). CORS `exposedHeaders`
  added so browser `fetch()` can read them cross-origin.
- **Range requests deferred** — `Accept-Ranges: none` for now. No video
  scrubbing / resumable downloads until a follow-up parses `Range`.
- **Tests:** Node's built-in `node:test` run via `node --import tsx --test`,
  zero new deps. `fastify.inject()` against a temp `STORAGE_ROOT` per case
  (`src/test-helpers.ts`, including a hand-built `multipartBody()` since
  `light-my-request` doesn't serialise global `FormData`). Rejected vitest/jest
  (new deps, no benefit at this scale). 34 tests green.
- **Reviewed + merged.** `/code-review high` on the branch; fixes landed in
  `8ac4027` (empty-dir DELETE 500 → 204; serial `stat` in listings →
  `Promise.all`; error `code` mapped from HTTP status instead of the literal
  `"error"`; orphan `.upload-*.part` files hidden from listings). Merged to
  `main` as PR #1, 2026-09-09.
- **`packages/shared` deferred to Phase 2.** DTOs live in `apps/api/src/types.ts`
  and move when `apps/web` first consumes the API.
- **Placeholder `STORAGE_ROOT`** = `/home/joelpistora/pistora-storage` (native
  ext4 WSL VHD, outside the repo). `apps/api/.env` (gitignored) sets it;
  `apps/api/env.example` (committed, no leading dot) documents it.
- **WSL2 mount decision:** when the WD Elements 5TB arrives, use it via DrvFs at
  `/mnt/d` keeping the factory **NTFS** format (`STORAGE_ROOT=/mnt/d/pistora`).
  Rationale: format-agnostic code (one-line switch), HDD-bound throughput makes
  9p overhead negligible for bulk streaming, Windows keeps direct access as a
  recovery net, no per-boot mount step. Documented migration to `wsl --mount
  --bare` + `mkfs.ext4` (native speed + POSIX semantics, at the cost of Windows
  losing the drive and a per-logon mount task) as Phase 3/4 hardening if DrvFs
  proves limiting. `usbipd-win` ruled out for an always-connected disk.

## Phase 2 — Frontend foundation (2026-09-09)

- **`packages/shared` created — source-only, types-only, NO `tsc` build.**
  `package.json#exports` points at `src/index.ts`; both apps read the `.ts`
  source directly via the npm-workspaces symlink (`node_modules/shared`). Works
  because the 4 DTOs are pure `interface`s and `apps/api` imports them
  `import type`, so `tsc` erases the import — nothing in `apps/api/dist/`
  resolves `shared` at runtime (verified: `grep -rn 'from "shared"'
  apps/api/dist` is empty). `exports` → `src/index.ts` satisfies `apps/api`
  (NodeNext) and `apps/web` (bundler) simultaneously with **zero build-ordering
  changes**. Rejected: a `dist/`-emitting `tsc` build (textbook, but buys
  nothing for 4 interfaces and adds a `build:shared` + ordering edges).
  Guardrail: `verbatimModuleSyntax: true` in `apps/api/tsconfig.json` makes a
  value-import of a type-only module a compile error. Upgrade path if `shared`
  ever needs runtime code: add the `tsc` build, repoint `exports` at `dist/`.
  `apps/api/src/types.ts` deleted; `apps/api/src/routes/files.ts` import
  repointed to `"shared"`. Added an `ErrorCode` union (mirrors `http.ts` +
  `PathError` slugs) for the frontend to branch on.
- **`apps/web` CNA scaffold stripped.** Deleted `/projects`, `/contact`,
  `Navbar`, `Footer`, stock `public/*.svg`. `layout.tsx` → minimal shell, Geist
  `.variable` classes now on `<html>` (were built but never applied — site was
  rendering Arial), metadata retitled to the storage product. `globals.css`
  reconciled to **Tailwind v4 only**: dropped the legacy `@tailwind
  base/components/utilities;` lines, the raw `body { font-family: Arial }`
  override, and the competing `bg-gray-50`/`text-gray-900` literals; body
  styling is now `@theme` tokens + utilities (one source of truth); dark-mode
  vars reset from hand-edited `#baecff`/`#303030` to neutral `#0a0a0a`/`#ededed`.
  `favicon.ico` moved `src/app/styles/` → `src/app/` (App Router auto-serves).
  Unused `autoprefixer` dep dropped.
- **Typed API client at `apps/web/src/lib/api/`.** Framework-agnostic `fetch`
  wrapper (no `next/*`, no `react`) — usable from server/client components and
  route handlers. Base URL from `NEXT_PUBLIC_API_BASE` (default
  `http://localhost:3001`; `apps/web/env.example` committed, `.env.local` for
  local dev). Throws `ApiError` (carries the envelope `code` / `status` /
  `details`) and `NetworkError` (fetch itself rejected). `encodePath()` throws
  on a `..` segment client-side (fetch collapses `..` in a URL before it's sent,
  so it would never reach the API's `storage.resolve()` guard). Endpoints:
  `listDir`, `statEntry`, `downloadFile` / `downloadResponse` / `fileUrl`,
  `uploadFiles`, `deleteEntry`, `makeDir`, `getHealth`, `ping`. **No React
  hooks/components yet** — that plus the end-to-end proof is the rest of Phase 2.
  Smoke-tested against the live API: mkdir → upload → list → stat → download →
  recursive delete → 404, plus client-side `..` rejection.
- **Minimal file-browser UI built (v1).** `/` is a landing page (wordmark +
  `<ApiStatus>` live ping + "Open files" link); `/files` is the browser. Design
  choices (from a 15-question interview): **table listing** (Name/Size/Modified,
  folders first), **no header chrome** (breadcrumbs + Upload inline above the
  list), folder navigation on a **single `/files` page** with the current folder
  in `?path=` (so refresh/bookmark/back all work — `router.push` per hop),
  **folder rows navigate on click**, **file rows select** and reveal a Download
  link, **button-only single-file upload** into the current folder, **plain-text**
  loading/empty/error states (no toast/skeleton/spinner libs), **system** light+dark
  theme, **desktop-first** (table scrolls on mobile). Deferred to a follow-up:
  delete, new-folder, drag-drop, upload progress, multi-select, mobile layout.
- **Frontend is client-side only → `output: "export"`.** No Server Component
  fetches API data; the browser calls the API directly. `next build` emits a
  static `apps/web/out/`, deployable to pistora.se over FTPS exactly like
  `index.html` (no Node on the host) — matches the Phase 3 hosting reality.
  `next dev` is unchanged for local work. Chosen over server-rendered listings
  (which would force a Node host pistora.se can't provide). `useSearchParams`
  therefore needs a `<Suspense>` boundary in `/files`.
- **Dev CORS = any loopback origin.** `next dev` bumps to 3001/3002/… when 3000
  is taken, which silently broke API calls (only `http://localhost:3000` was
  allowlisted → browser blocked the cross-origin fetch → "API unreachable").
  `loadConfig` now, when `CORS_ORIGINS` is unset, allows pistora.se +
  `/^https?:\/\/localhost(:\d+)?$/` + the `127.0.0.1` equivalent. Setting
  `CORS_ORIGINS` (prod) opts back into an exact string allowlist. `corsOrigins`
  widened to `(string | RegExp)[]` (passed straight to `@fastify/cors`).
- **Global home button.** `HomeButton` (`usePathname`, hidden on `/`) is a fixed
  house icon top-left in `layout.tsx` — the way back to the landing page from
  `/files` and the error/404 pages.

## Phase 2 wrap / Phase 3–4 planning (2026-09-10)

- **Phase 2 foundation done.** `packages/shared` + typed API client + v1 file
  browser (`/files`) built and proven end-to-end: locally over LAN, and in
  production (static `out/` uploaded to pistora.se `wwwroot/` via FTPS, driving
  the home API through a Cloudflare quick tunnel). Branch `phase-2-foundation`
  → `main`. Remaining Phase 2 items (delete, new-folder, drag-drop, upload
  progress, multi-select, mobile layout) are optional polish, not blockers.
- **Deploy gotcha recorded.** `next build` reads `apps/web/.env.local`, so the
  deploy build only points at the public API if `.env.local` (or an explicit
  `NEXT_PUBLIC_API_BASE=…` on the build command) carries the tunnel URL. A
  `localhost:3001` build appears to work *only* on the machine running the API.
  Verify: `grep -r localhost:3001 apps/web/out/_next/` must be empty.
- **Auth = email + password authentication (possible through google).** I want to be able to control who has access to the file storage solution. The persons that are allowed in are the people that should get a personal storage location on the harddrive. When a new user is created, they get a personal folder on the storage hard drive. They are only allowed to see/edit/upload files inside that folder. All of this should happen automatically. The user folders should be either be in root of the hard drive or in some other sub folder that I have not decided yet.
- **Adding of users.** I (Admin) should have special priveleges on the website. I should have a menu where I can add users. When I add users, an auto generated email should be sent to the users email with a one-time password. When they log in, they are forced to update their password first time. 

## File & folder actions (2026-09-10)

- **Per-entry actions live in a kebab (⋮) menu**, not inline buttons or
  click-to-select. Every file and folder row has one. Files: Download, Rename,
  Properties, Delete. Folders: Rename, Properties, Delete. Folder rows still
  navigate on click; the menu stops click propagation so it works inside the
  row. `KebabMenu` is a shared component (`position: fixed` menu so the table's
  horizontal scroll can't clip it). (`AdminUsers` has its own near-identical
  `RowActions` — left as-is; a later consolidation onto `KebabMenu` is fine.)
- **Rename / move = `PATCH /api/files/<path>` `{ to }`.** `to` is a destination
  path relative to the caller's root; a same-folder `to` is a plain rename. The
  move never crosses the per-user boundary (`request.storage` is already
  scoped), so bytes are unchanged and there is **no quota re-check**.
  Deliberately strict, unlike upload: the destination's parent folder must
  already exist (no implicit `mkdir -p`) and nothing may sit at the destination
  (**no silent overwrite** → `409`). Also refuses the storage root, a
  folder-into-its-own-subtree move, and (via `storage.resolve`) any traversal.
  The UI only exposes rename today; the endpoint already supports an arbitrary
  destination so "move to folder" is a pure frontend addition later.
- **Folder delete warns based on contents.** The UI lists the folder first; the
  confirm text names the item count and only passes `?recursive=1` when the
  folder is non-empty (or its contents couldn't be read). Backend unchanged —
  `DELETE` already refuses a non-empty dir without the flag.
- **Properties = a modal over `?stat=1`.** Type, full path, exact byte size,
  created + modified timestamps. Read-only.
- **New folder = an inline toggle-form** next to Upload (not a `window.prompt`).
  Calls the existing `POST /api/dirs` (`mkdir -p`, idempotent).

## Admin: per-user storage usage (2026-09-10)

- **`AdminUser` gained `usedBytes`.** `GET /api/admin/users` now walks each
  user's `users/<email>/` folder (`dirSize`, same on-demand walk as
  `GET /api/usage`) and the admin table shows **`used / limit`** per row instead
  of just the limit. Admins themselves show `usedBytes: 0` (no folder). Cost:
  one recursive walk per user per page load — fine at this scale; revisit with a
  cached total if a folder ever holds tens of thousands of files.
- **A quota can't be set below current usage.** `PATCH /api/admin/users/:id`
  with a `quotaBytes` under the user's stored bytes → `409`. The editor checks
  it client-side first (friendly message); the 409 is the backstop.

## Visual identity (2026-09-10)

- **Palette: "Fog & Steel" + amber.** Airy grays (`#f3f4f6` / `#2b2f34` light,
  `#111417` / `#e3e5e8` dark) with a raised `--surface` for menus/modals/inputs.
  One interactive accent — a desaturated **steel blue** (`#4f739c` / `#84a6c9`)
  on primary buttons, links, the current breadcrumb, input + keyboard focus, the
  storage-bar fill. A **burnt amber** (`#b4640f` / `#e0933c`) used sparingly for
  *transient* states only: one-time-password callout + code, forced-password
  banner, "pending first sign-in", storage bar ≥80%. Error red and the
  API-status green/red stay as semantic colours, separate from the accent.
  Tokens live in `globals.css` `:root` + a `prefers-color-scheme` dark block,
  mapped through `@theme inline` (`bg-surface`, `text-accent`, `bg-amber/10`, …).
  No theme toggle — follows the OS.
- **Type: Bricolage Grotesque (display) · Hanken Grotesk (body) · JetBrains
  Mono** (all variable, `next/font`, self-hosted). Bricolage — a contemporary
  grotesque with deliberate irregularities — carries the wordmark and all
  `h1`/`h2`/`h3` (a base-layer rule on `--font-display`); Hanken Grotesk does
  body text (legible at 13px, which the file table needs); JetBrains Mono is the
  only other voice (filenames, paths, OTPs). Chosen from a six-option specimen
  over Geist (too neutral), plain Hanken throughout (no headline character),
  IBM Plex (more corporate), a Newsreader serif display (more editorial), and an
  all-mono treatment (too costly for reading). `FileProperties` overrides its
  filename `h2` back to the body face.

## Cloudflare cutover prep (2026-09-15)

- **Nameserver migration to Cloudflare is in progress** (see
  `infra/dns/cloudflare-migration-plan.md`). Did the prep that doesn't need to
  wait for it to finish, so the frontend can be rebuilt and reuploaded the
  moment `api.pistora.se` (named tunnel) is live:
  - `apps/web/public/web.config` — HTTP→HTTPS redirect + IIS 404→`/404.html`
    mapping + a few MIME types. Ships automatically in every `out/` build
    (Next copies `public/` verbatim on export). Deep links need no rewrite
    rule — `trailingSlash: true` already exports `<route>/index.html` and
    IIS's default-document behavior handles the rest.
  - `apps/web/.env.production.local` (new, gitignored) pins
    `NEXT_PUBLIC_API_BASE=https://api.pistora.se`. Next's env-file precedence
    puts `.env.production.local` ahead of `.env.local` for any `next build`
    (which always runs with `NODE_ENV=production`), so the deploy build is
    correct regardless of what `.env.local` holds for local dev. This
    directly closes the footgun from earlier (2026-09-10ish) where a prod
    build baked in `localhost:3001` because `.env.local` hadn't been swapped
    back before running `npm run build`.
  - `site/apitest.html` repointed at `https://api.pistora.se` (was a stale
    `trycloudflare.com` URL).
  - Confirmed `cloudflared` (`2026.8.3`) is already installed on the WSL2 box
    and that it has systemd (`/etc/wsl.conf` → `systemd=true`), so
    `sudo cloudflared service install` — the standard Linux persistence path —
    applies directly; no hand-rolled unit file needed.
  - Left for the user to run interactively once the Cloudflare zone is Active
    (needs browser OAuth + their Cloudflare account): `cloudflared tunnel
    login` → `tunnel create pistora-home` → fill `~/.cloudflared/config.yml`
    → `tunnel route dns pistora-home api.pistora.se` → `service install`.
- While auditing this, found `CLAUDE.md`'s Decision log and roadmap still
  described the original **Cloudflare Access** auth plan, but the actual
  2026-09-10 session (this file, "Phase 2 wrap" + "File & folder actions"
  sections) shows auth was rebuilt as custom email+password the same day and
  is now fully implemented (sessions, admin invites, quotas). Corrected
  `CLAUDE.md` to match — the DNS-migration dependency for auth still holds,
  just for a different reason now (SameSite cookie needs same-site
  `api.pistora.se` ↔ `pistora.se`, not an Access-hostname requirement).

## Cloudflare migration live; auth confirmed in production (2026-09-15)

- **DNS cut over.** `pistora.se` nameservers now `amir.ns.cloudflare.com` /
  `clara.ns.cloudflare.com`. Verified against a public resolver
  (`dig NS pistora.se @1.1.1.1`) — this WSL2 box's own default resolver kept
  answering with the old Hostek nameservers from cache well after the cutover
  had actually propagated, which briefly looked like the migration hadn't
  taken. Worth remembering for any future "did DNS change land yet?" check.
- **Tunnel created via the Cloudflare dashboard, not the CLI.** Zero Trust →
  Networks → Tunnels → Cloudflared connector → named it `pistora-home`. The
  dashboard gives a token instead of a cert; `sudo cloudflared service install
  <token>` installed it directly as a systemd unit
  (`/etc/systemd/system/cloudflared.service`, `tunnel run --token-file
  /etc/cloudflared/token`). The public hostname (`api.pistora.se` →
  `http://localhost:3001`) was set on the same dashboard page, which also
  creates the proxied DNS CNAME automatically. Simpler than the
  `tunnel login` → `create` → `route dns` CLI sequence the original runbook
  (`infra/dns/cloudflare-migration-plan.md`) and
  `infra/cloudflared/config.example.yml` describe — no local `config.yml` or
  credentials file involved at all. Both docs now flag this as the actual
  method, keeping the CLI flow documented as a fallback.
- **Two unrelated local snags along the way, both fixed, neither a code bug:**
  `/mnt/d` (the WD Elements 5TB drive, DrvFs) had gone stale in WSL's mount
  table — `mount` still showed the entry but the device was unreachable ("No
  such device") even though Windows still showed `D:` fine. Fixed with
  `sudo umount /mnt/d && sudo mount -t drvfs D: /mnt/d`, no WSL restart
  needed. Separately, `npm run dev:api` failed with `EADDRINUSE:3001` because
  an earlier `dev:api` from a different terminal was still holding the port —
  killed the stale `tsx watch` process tree and retried.
- **Confirmed end-to-end in production:** `https://api.pistora.se/health` →
  `{"status":"ok"}` through the tunnel; on `pistora.se` — login, `/files`
  browsing, and a hard reload on a deep link all work with no redirect loop.
  This is the first time Phase 4 auth has worked outside local dev — the
  `SameSite=Lax` session cookie needed the API to be same-registrable-site
  with the web app, which only a named tunnel on `api.pistora.se` (not the old
  `*.trycloudflare.com` quick tunnel) provides.
- Phases 3 and 4 are both marked done in `CLAUDE.md`'s roadmap now. Remaining
  work is Phase 5-shaped: sharing between accounts, rate limiting,
  Range-request support, the still-optional Phase 2 UI polish (drag-drop,
  upload progress, multi-select, mobile layout).

## Self-service account requests (2026-09-15)

The login page's "contact administrator" dead-end became a real action:
`POST /api/auth/request-account` (public, unauthenticated, alongside
`/login`). **Deliberately reuses the admin's exact `POST /api/admin/users`
create-user sequence** — same `generateOtp`/`hashPassword`, same
`ensureUserDir` + `createUser` with `mustChangePassword: true` and the same
7-day `INVITE_TTL_MS` (now exported from `auth/crypto.ts` so both routes
share it) — just triggered by the requester instead of an admin, and with
`role` hard-coded to `"user"`.

The account is created **immediately**, not queued for approval — no new
"pending request" table. The differences from the admin flow are entirely in
who's told what:
- The invite email (`Mailer.sendAccountRequest`, a second message type
  alongside `sendInvite`) goes to `config.adminEmail`, carrying the
  requester's email and the OTP, so the admin can relay it by hand.
- The requester never sees the OTP — the endpoint always returns a bare
  `204`. Admin's `POST /users` can optionally echo the OTP back
  (`exposeInviteOtp`, since that call is already authenticated as an admin);
  this one never does, because leaking it to an anonymous caller would let
  anyone skip the admin step entirely.
- Throttled by `req.ip` (a separate `createLoginThrottle` instance, 5/hour)
  rather than by email — every call costs a DB write and an admin email
  regardless of outcome, so it's capped per caller, not per address.

Frontend: `RequestAccountLink` (`apps/web/src/components/`) is a small
three-state inline component on the login page (idle link → its own email
field, deliberately separate from the sign-in form's → confirmation
message), replacing the static "Contact administrator" text in `LoginForm`.
It renders its own `<form>`, so it's a sibling of the sign-in `<form>` in
`LoginForm`, never nested inside it — HTML forbids nested forms (React
raised a hydration error the first time it was nested). The admin's own "add
user" flow in `/admin` is unchanged — this is a second trigger for the same
underlying creation logic, not a replacement.

**Follow-up the same day: real email via Resend.** `Mailer` had only ever
been `ConsoleMailer` (logs the message, sends nothing) — fine for exercising
the admin-invite flow by hand, but this self-service endpoint's entire point
is notifying the admin unattended. Added `createResendMailer`
(`apps/api/src/mail/resend.ts`) — a plain `fetch` to Resend's HTTP API, no
SDK dependency, kept consistent with the project's minimal-dependency
pattern elsewhere (`node:sqlite`, `node:crypto`). Selected in `server.ts`
(not `buildApp`, which stays pure/env-free) via `MAILER=resend` +
`RESEND_API_KEY` + `MAIL_FROM`; unset, the app keeps `ConsoleMailer`. Fails
fast at startup if `MAILER=resend` is set without both other vars.

Chose Resend's zero-setup sandbox address (`onboarding@resend.dev`) as
`MAIL_FROM` over verifying `pistora.se` as a sending domain — deliberate:
control over who actually gets an account already lives entirely in "who
receives the OTP," not in whether the mail send technically succeeds, so
there's no security reason to widen delivery. The real consequence is
functional, not a security gap: Resend's sandbox domain only delivers to
the email the Resend account itself is registered under, so admin-created
invites via `POST /api/admin/users` (which mail the **invitee's** address,
not the admin's) will reliably fail to send.

That failure mode used to be fatal to the request — `sendInvite` was
awaited before the response was built, so a rejected send 500'd the whole
call even though the account row (and folder) already existed, leaving an
OTP nobody could retrieve if `EXPOSE_INVITE_OTP` was off. Fixed in
`POST /api/admin/users`, `POST /api/admin/users/:id/reset-otp`
(`apps/api/src/routes/admin.ts`), and `ensureAdminUser`
(`apps/api/src/auth/bootstrap.ts`, the first-boot admin creation, which had
the identical unguarded `await` and could otherwise have crashed server
startup entirely on a bad send): a failed send is now caught, logged at
`warn`, and the OTP is returned/logged directly regardless of
`exposeInviteOtp` — so the admin can always relay it by hand, which is the
actual delivery mechanism for admin-invited users under this `MAIL_FROM`
choice anyway (mirrors how account-request notifications already work).

## Phase 6 kickoff: joel.pistora.se placeholder (2026-09-15)

A prior planning session had scoped a full personal-portfolio Phase 6 and
paused on four open questions (hosting, visual identity, content scope,
contact mechanism), saved as a resumption checkpoint. Resumed and decided:

- **Hosting: Cloudflare Pages**, not Hostek. `pistora.se` DNS is already
  Cloudflare-authoritative; a Pages project's custom-domain feature
  auto-creates the DNS record, the same one-click pattern the
  `api.pistora.se` tunnel used. Avoids the open question of whether Hostek's
  existing IIS plan supports a second site/binding for a subdomain.
- **Visual identity: a fresh personal brand**, not "Fog & Steel" — the
  storage product's palette/type system stays scoped to `pistora.se`, not
  extended into a cross-subdomain family look.
- **v1 content scope: deliberately minimal.** Not the About/Projects/Work/
  Contact set originally discussed — just a placeholder: a photo, a name,
  and contact links. The full portfolio is future work; shipping a minimal
  page now beats leaving the subdomain unused indefinitely.
- **Contact mechanism: plain links, no backend** — mailto (`joel@pistora.se`)
  + LinkedIn + Instagram + Spotify, all confirmed real destinations, not
  placeholders.

Implementation follows the existing `site/index.html` pattern (hand-written,
dependency-free static HTML, no workspace, no build step) rather than a new
`apps/portfolio` Next.js workspace — proportionate to a v1 that's a photo and
some links, upgradable later once real portfolio content scope is decided.
Lands as `site/joel/index.html`, deployed via Cloudflare Pages pointed at
`site/joel` as the project root.

**Correction the same day: Cloudflare Workers, not Pages.** Cloudflare moved
Pages to maintenance mode during 2026 — it still works, but all new
investment (features, dashboard polish) goes to **Workers with static
assets** instead, and newer accounts' dashboards are already dropping the
separate "Pages" creation option. Since nothing had been deployed yet,
switched before committing to the deprecated path rather than migrating
later. Practical difference: Workers needs one small config file committed
alongside the page (`site/joel/wrangler.jsonc` — `assets.directory: "."`,
no npm dependency, no build step, still zero-JS-framework) that Pages didn't
require; deploy mechanism (Git-connected, auto-deploy on push, custom domain
via the dashboard) is otherwise the same shape. Also better aligned with an
earlier open question about this site eventually wanting "more logic" —
Workers is the same product that logic would run on, so there's nothing to
migrate if that need shows up later.
