# Plan: migrate pistora.se DNS to Cloudflare

Goal: Cloudflare becomes the authoritative DNS for pistora.se, so we can point
`api.pistora.se` at a Cloudflare Tunnel. Website + email stay at Hostek,
unchanged. See `pistora-se-dns.md` for the record inventory this plan copies.

**Risk:** email. Mitigated by copying every mail record exactly, verifying
before the switch, lowering TTLs first, and keeping the Hostek zone as rollback.
Fully reversible by switching nameservers back.

## Steps

### 1. Prep (no visible change)
- In the Hostek DNS editor, lower TTLs to `300` on `@ A`, `www A`, both `MX`,
  the SPF `TXT`, `_mailchannels TXT`, `mail CNAME`. Wait ~1 day so the old long
  TTLs age out and the cutover is fast/reversible.

### 2. Build the zone in Cloudflare
- Create a **free** Cloudflare account (owner's email).
- Add site `pistora.se`, **Free** plan. Let Cloudflare auto-scan, then
  **manually reconcile against `pistora-se-dns.md`** — the scan misses things.
  Final Cloudflare zone must contain exactly:
  - `A  @   91.189.42.160`   — DNS only (grey cloud) for now
  - `A  www 91.189.42.160`   — DNS only
  - `MX @   mx1.mailchannels.net` (pri 10)
  - `MX @   mx2.mailchannels.net` (pri 10)
  - `TXT _mailchannels  v=mc1 auth=hostekse`
  - `TXT @  v=spf1 include:spf.ballou.se ~all`
  - `CNAME mail  nmail8.ballou.se`  — DNS only
  - (do **not** add NS records — Cloudflare supplies its own)
- Note the two Cloudflare nameservers Cloudflare assigns
  (e.g. `x.ns.cloudflare.com`, `y.ns.cloudflare.com`).

### 3. Switch the delegation (needs Hostek admin)
- Send the Swedish support request in `hostek-ns-request-sv.md`, filled with the
  two Cloudflare nameservers, asking to **replace** `ns1/2/3.ballou.se` with
  them. (Or the domain-account holder does it if they can.)
- Hostek confirms.

### 4. Verify (within minutes–hours)
- `dig NS pistora.se @1.1.1.1` → the two Cloudflare nameservers.
- `dig pistora.se @1.1.1.1` / `dig www.pistora.se` → `91.189.42.160`.
- `dig MX pistora.se @1.1.1.1` → the two mailchannels MX.
- `dig TXT pistora.se @1.1.1.1` → the SPF string.
- `dig +short mail.pistora.se @1.1.1.1` → resolves via `nmail8.ballou.se`.
- Load `https://pistora.se` — the under-construction page still serves.
- Cloudflare dashboard marks the zone **Active** and emails confirmation.

### 5. Email smoke test
- Send an email **from** an @pistora.se mailbox to an external address (Gmail).
- Reply **to** that @pistora.se mailbox from the external address; confirm it
  arrives.
- Check the Gmail copy: SPF = pass.

### 6. Leave rollback in place
- Do **not** delete or edit the Hostek DNS zone for ~2 weeks. If anything
  breaks, Hostek admin points the nameservers back to `ns1/2/3.ballou.se`.

## After migration (unblocks Phase 1+ networking)
- Add `api.pistora.se` in Cloudflare via the named tunnel:
  `cloudflared tunnel login` → `create pistora-home` →
  `~/.cloudflared/config.yml` (see `infra/cloudflared/config.example.yml`) →
  `cloudflared tunnel route dns pistora-home api.pistora.se`.
- Repoint `site/apitest.html` `API_BASE` to `https://api.pistora.se`, re-upload.
- Optionally restore normal TTLs on the stable records.
- Future subdomains (`joel.`, `files.`, …) become one-click in Cloudflare.
