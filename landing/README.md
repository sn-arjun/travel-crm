# TravelCRM Pro marketing site

Astro, static output, no UI framework. The design is the approved "departure board" direction: split-flap boards,
airmail postmarks, a boarding-pass demo form.

```
npm ci
npm run dev                         # http://localhost:4321
npm run build                       # astro build + scripts/postbuild.mjs → dist/
node scripts/check-links.mjs        # crawls dist/: links, #ids, sitemap, reciprocal hreflang
```

## Where things live

| What | File |
|---|---|
| Owner values (domain, API address, WhatsApp number, Turnstile key, legal entity) | `public/config.js` |
| Every feature the site lists, with the plan it starts on | `src/data/features.ts` |
| Markets, prices, invoices and SEO copy per market | `src/data/markets.ts` |
| Trip story, agency types, FAQ | `src/data/content.ts` |
| Comparison pages | `src/data/compare.ts` |
| Blog posts | `src/content/blog/*.md` |
| Legal pages (drafts) | `public/legal/` |

Prices are the 2026-10 catalogue (`backend/drizzle/master/0026`, `0028`). The page shows them at build time and
refreshes them from `GET /api/v1/public/plans` when the API answers. The boarding pass posts to
`POST /api/v1/public/enquiries`.

## Pages

`/` (market picked from the visitor's time zone on the first visit, India in the HTML), `/in/ /uk/ /eu/ /us/ /au/`
(one per market, linked with hreflang), `/pricing/`, `/features/`, `/compare/` and three comparison pages,
`/blog/` with tag pages and `/rss.xml`, `/404`.

## Add a blog post

Create `src/content/blog/<slug>.md` with `title`, `description` (170 characters at most), `date` and `tags`.
Set `draft: true` to keep it out of the build.

## Rules the copy follows

- Every feature is listed as available: the product launches when the launch readiness tracker is all done.
- No ratings, review counts or customer logos until they are real (no `aggregateRating`).
- Comparison pages compare kinds of tool, never a named company.
