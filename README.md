# Nomli landing (static)

Marketing site for [nomlimingle.com](https://www.nomlimingle.com/) — feed, chat, audio calls, and local Market.

**Repo:** [Dr-M06/nomli-landing-page-new](https://github.com/Dr-M06/nomli-landing-page-new)  
**Source in app monorepo:** `nomli-landing/` (copy here when deploying)

This is a static HTML site. The old Next.js / React app was removed.

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

## Crawler / ads verification

| File | Purpose |
|------|---------|
| `robots.txt` | AdsBot-Google + Googlebot + sitemap |
| `sitemap.xml` | Indexable URLs |
| `index.html` JSON-LD | Organization / WebSite / MobileApplication |
| `app-ads.txt` | AdMob publisher line |
| `manifest.json` | PWA metadata |

## Deploy

Vercel should use **framework: Other / null** (see `vercel.json`). Point the project root at this repo — no `npm install` / Next build.

```bash
# from nomliv2
rsync -a --delete nomli-landing/ ../nomli-landing-page-new/ --exclude .git
cd ../nomli-landing-page-new && git add -A && git commit -m "Update landing" && git push
```
