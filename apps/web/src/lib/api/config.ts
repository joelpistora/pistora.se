/**
 * Base URL of the Pistora storage API.
 *
 * `NEXT_PUBLIC_*` vars are inlined by Next at build time, so a production
 * `apps/web` build MUST set `NEXT_PUBLIC_API_BASE` (e.g. `https://api.pistora.se`)
 * — an unset var bakes in the localhost default. For LAN dev the default matches
 * `npm run dev:api` (`0.0.0.0:3001`).
 */
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"
).replace(/\/+$/, "");
