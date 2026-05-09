# Nomli Mingle — marketing site

Next.js App Router site for [Nomli Mingle](https://nomlimingle.com): home, about, privacy, and terms.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Environment

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL` if the deploy URL is not the production default in `lib/site.ts`.

## Favicons

```bash
npm run generate-favicons
```

(Requires a source icon; see `scripts/generate-favicons.js`.)
