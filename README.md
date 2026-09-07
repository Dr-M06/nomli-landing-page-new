# Nomli landing (static)

Marketing site for [nomlimingle.com](https://www.nomlimingle.com/) — feed, chat, and local Market. Rated **16+**.

This folder **is** the production landing site (replaces the old Next.js `nomli-landing-page-new` app).

## Brand

- Accent mint: `#3DDFC2`
- Background: `#F7F8FA`
- Ink: `#12141A`
- Type: Outfit (display) + Figtree (body)

## Pages

| File | URL |
|------|-----|
| `index.html` | `/` |
| `terms.html` | `/terms` |
| `privacy.html` | `/privacy` |

## Crawler / ads verification (keep on deploy)

| File | Purpose |
|------|---------|
| `robots.txt` | AdsBot-Google + Googlebot + sitemap |
| `sitemap.xml` | Indexable URLs |
| `index.html` JSON-LD | Organization / WebSite / MobileApplication |
| `app-ads.txt` | AdMob / ads publisher line |
| `manifest.json` | PWA / install metadata |
| `_headers` / `vercel.json` | Content-Type + pretty URL rewrites |

No Universal Links / App Links — deep linking is not used.

## Local preview

```bash
cd nomli-landing
python3 -m http.server 8787
# open http://127.0.0.1:8787
```

## Deploy

Point Vercel / Cloudflare Pages / static host at this folder (not Next.js).

- **Vercel:** `vercel.json` rewrites `/terms` & `/privacy`
- **Cloudflare Pages:** `_redirects` + `_headers`
