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
