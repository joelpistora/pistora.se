# Supportärende till Hostek — byte av namnservrar för pistora.se

Skickas i Hosteks kundportal **efter** att Cloudflare-zonen är uppbyggd och
verifierad (steg 2 i `cloudflare-migration-plan.md`). Ersätt de två
platshållarna med de namnservrar Cloudflare tilldelar.

---

**Ämne:** Byte av namnservrar för pistora.se

Hej,

Jag vill byta de auktoritativa namnservrarna för domänen **pistora.se** till
Cloudflare.

**Nuvarande namnservrar:**
- ns1.ballou.se
- ns2.ballou.se
- ns3.ballou.se

**Önskade namnservrar (ersätt samtliga ovan):**
- `<CLOUDFLARE-NS-1>`
- `<CLOUDFLARE-NS-2>`

Jag har redan lagt upp en motsvarande DNS-zon hos Cloudflare med alla befintliga
poster (A för @ och www, båda MX mot mailchannels.net, SPF-posten, TXT-posten
`_mailchannels` samt CNAME för `mail`). Webbhotell och e-post ska alltså ligga
kvar hos er precis som nu – det är endast DNS:en/namnservrarna som flyttas, och
avsikten är att bytet ska ske utan avbrott för webbplats eller e-post.

Jag kommer inte åt att ändra namnservrarna själv i kundportalen – fältet under
domäninställningarna är låst. Kan ni antingen genomföra bytet åt mig, eller låsa
upp fältet så att jag kan göra det själv?

Såvitt jag kan se har domänen inget DNSSEC aktiverat, men om den har det:
vänligen inaktivera DNSSEC i samband med bytet.

Vänligen bekräfta när ändringen är genomförd.

Tack på förhand,
Joel Pistora

---

## Efter svar från Hostek

- Verifiera: `dig NS pistora.se @1.1.1.1` ska visa Cloudflare-namnservrarna.
- Gå vidare med steg 4–5 i `cloudflare-migration-plan.md` (verifiering + e-posttest).
- Rör inte den gamla zonen hos Hostek på ~2 veckor (rollback).
