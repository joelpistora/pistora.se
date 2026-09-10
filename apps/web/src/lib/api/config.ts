/**
 * Base URL of the Pistora storage API.
 *
 * `NEXT_PUBLIC_*` vars are inlined by Next at build time. For local dev, put
 * `NEXT_PUBLIC_API_BASE=http://localhost:3001` in `apps/web/.env.local`. The
 * fallback below is the production API — a build with no env var set still
 * points somewhere sane, but always set the var explicitly for prod builds.
 *
 * Cookie auth requires the API to be the SAME registrable site as the web app
 * (`api.pistora.se` ↔ `pistora.se`, or `localhost:3001` ↔ `localhost:3000`).
 * A `*.trycloudflare.com` quick tunnel is a different site — login will loop.
 */
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "https://api.pistora.se"
).replace(/\/+$/, "");
