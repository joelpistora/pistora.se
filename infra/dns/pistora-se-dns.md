# pistora.se — DNS & hosting facts

Snapshot captured 2026-09-09, before any Cloudflare migration. This is the
source of truth for the migration; keep it updated if records change.

## Hosting setup (all stays at Hostek)

| Thing | Where | Notes |
|---|---|---|
| Domain registration | Hostek (under a **capitalpidesign.se**-primary account, likely the user's dad's) | Nameserver change is **locked** in the client-area domain settings — needs Hostek admin / support. |
| Authoritative DNS (now) | `ns1.ballou.se`, `ns2.ballou.se`, `ns3.ballou.se` | "Ballou" = the DNS brand Hostek's Swedish side runs on (IPs registered to Hostek AB / ILAIT). Bundled with hosting, not a separate product. |
| Website | Hostek **Ballou Webbhotel .NET** (Windows/IIS), primary domain `capitalpidesign.se` | `pistora.se` is an add-on domain in this space. Web root `Home\pistora.se\wwwroot\`. Panel: MSPControl (`mspc.hostek.se`). Server IP `91.189.42.160`. |
| Email | Hostek **Ballou Email: pistora.se** (separate paid product) | Real mailboxes, several users incl. the owner. Routed via MailChannels. **This is the migration risk.** |

Products visible in the Hostek account: `Ballou Email: capitalpidesign.se`,
`Ballou Email: pistora.se`, `Ballou Webbhotel .NET: capitalpidesign.se`.

## Full DNS zone (10 records)

| Name | Type | TTL | RDATA | Purpose | Migrate to Cloudflare? |
|---|---|---|---|---|---|
| `@` | A | 1800 | `91.189.42.160` | website apex | ✅ recreate |
| `www` | A | 1800 | `91.189.42.160` | website www | ✅ recreate |
| `@` | NS | 1800 | `ns1.ballou.se` | delegation (self-ref) | ❌ Cloudflare manages its own |
| `@` | NS | 1800 | `ns2.ballou.se` | delegation | ❌ |
| `@` | NS | 1800 | `ns3.ballou.se` | delegation | ❌ |
| `@` | MX | 60 | `10 mx1.mailchannels.net` | inbound email | ✅ recreate exactly |
| `@` | MX | 60 | `10 mx2.mailchannels.net` | inbound email | ✅ recreate exactly |
| `_mailchannels` | TXT | 60 | `v=mc1 auth=hostekse` | authorizes MailChannels to send as @pistora.se | ✅ recreate exactly |
| `@` | TXT | 3600 | `v=spf1 include:spf.ballou.se ~all` | SPF (outbound anti-spoof) | ✅ recreate exactly |
| `mail` | CNAME | 1800 | `nmail8.ballou.se` | `mail.pistora.se` → webmail / IMAP / SMTP | ✅ recreate exactly |

**No DKIM** (`*._domainkey`) and **no DMARC** (`_dmarc`) records exist. Don't add
them during the migration — replicate the zone as-is. (Adding DMARC/DKIM later is
a separate, optional deliverability improvement.)

- No DNSSEC on the zone (no DNSKEY) — subdomain/NS changes have no DS complications.
- The `@ NS` records inside the Hostek zone editor are **not** the real
  delegation — the real delegation lives at the `.se` registry and is changed
  from the domain-settings page (locked for the user).

## Two nameserver screens in the Hostek client area

1. **DNS Zones → pistora.se** — full record editor (the table above). Can edit
   A/CNAME/MX/TXT and the existing NS rows, but **cannot add new NS records**
   (no NS type in the "add record" dropdown). Editing the `@ NS` rows here does
   not redelegate the domain.
2. **Domain settings → "change the name servers this domain points to"** — the
   real registrar delegation. Shows `ns1/2/3.ballou.se` + two empty slots.
   **Read-only for the user** — Hostek admin/support must make the change.

## Why we're migrating

Not for the website or email — those are fine at Hostek. Purely to get a DNS
provider that lets us point **`api.pistora.se`** (and future subdomains) at a
Cloudflare Tunnel to the home server. Hostek's DNS can't:
- add NS records (needed for subdomain delegation), and
- Cloudflare Tunnel requires Cloudflare to be authoritative for the name.

Cloudflare partial (CNAME) setup would avoid a full migration but is
Business-plan only (~$250/mo). Registering a throwaway second domain also works
(~$10/yr) but `api.<something-else>` is cosmetically worse. Full migration is
free and the intended end state.
