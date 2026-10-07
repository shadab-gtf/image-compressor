# ShrinkFox SEO setup and heading guide

Updated 7 October 2026. Live address: `https://shrinkfox.vercel.app`. The existing deployment was verified to emit `noindex, follow` and `Disallow: /`. This update corrects the production defaults; a redeploy is required to change the live response.

## Sitemap and robots.txt

Next.js generates these files; do not add conflicting copies under `public/`:

| Public endpoint | Source | Purpose |
| --- | --- | --- |
| `/sitemap.xml` | `src/app/sitemap.ts` | Lists public pages, including tools derived from the catalog |
| `/robots.txt` | `src/app/robots.ts` | Gives crawler access rules and the production sitemap URL |

The standard filename is **robots.txt**, not robot.txt. The sitemap covers 23 public URLs: the home page, catalogued tools, guides, formats and privacy. The workspace, offline fallback and error pages are excluded. New catalog tools are included automatically.

The shared policy lives in `src/lib/seo/crawl-policy.ts`. It removes duplicate sitemap URLs and does not invent modification dates. Production defaults to the verified Vercel origin when `NEXT_PUBLIC_SITE_URL` is absent. Vercel preview/development builds, development mode, localhost origins and `DISABLE_INDEXING=true` intentionally return an empty sitemap, block crawlers and use noindex metadata.

Production HTML marked noindex remains crawlable so a crawler can read that instruction. Blocking a URL in robots.txt is not a reliable way to remove it from search. Scripts, styles and images stay crawlable. [Google guidance on noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

## Launch on the planned Vercel address

1. Deploy this update to the existing Vercel production project at `shrinkfox.vercel.app`.
2. `NEXT_PUBLIC_SITE_URL` is optional for that address. Remove any stale localhost value or set `NEXT_PUBLIC_SITE_URL=https://shrinkfox.vercel.app` for Production. For another domain, substitute its HTTPS origin. Ensure `DISABLE_INDEXING` is not `true` in Production.
3. Redeploy. Metadata routes and page metadata are generated at build time; changing the environment without rebuilding is insufficient.
4. Verify the home page has indexable metadata and the correct canonical URL. Check `/sitemap.xml` contains absolute URLs on the final origin and `/robots.txt` links to that sitemap.
5. Verify `/app` and the offline page remain noindex. Check that important public tools respond with 200 and unknown URLs return 404 when online.
6. Add the verified site to Google Search Console, verify ownership and submit `/sitemap.xml`. Submission helps discovery; it does not guarantee indexing. [Google sitemap instructions](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
7. If moving to a custom domain later, update the environment, redirect old public URLs and rebuild. Do not run two independently indexable copies with conflicting canonicals.

Keep preview deployments non-indexed. Do not publish an assumed domain just to make a local SEO audit look better.

## H1 to H6: what the levels mean

Heading levels describe the content outline, not font size. This site uses one main H1 on each page as an editorial convention.

| Level | Use | ShrinkFox example |
| --- | --- | --- |
| H1 | Main purpose of the page | “Remove photo backgrounds for free.” |
| H2 | A major section | “A few simple steps.” or the FAQ section |
| H3 | A subsection of that H2 | An individual FAQ question or a tool card |
| H4 | A subsection within an H3 | An advanced guide's detailed technique |
| H5 | A further nested subsection | A genuinely necessary technical detail |
| H6 | The deepest heading level | Rarely needed for these tools |

Do not add H4–H6 just to include all six tags. Do not jump from H2 to H4 when opening a subsection. Returning from H4 to H2 to start another major section is fine. Use CSS for appearance rather than choosing the wrong rank. [W3C heading guidance](https://www.w3.org/WAI/tutorials/page-structure/headings/).

The home page has one H1, major H2 sections and H3 cards/FAQ questions. Tool pages have one H1 and H2 instructions. Native form labels, list steps and buttons do not need to become headings.

## Alt text and illustrations

- Describe informative images in context, such as the vase photo in the before/after example. Do not stuff search keywords into the description.
- Before/after versions should identify which version is shown.
- Decorative raster images use `alt=""`. Decorative inline SVG doodles use `aria-hidden="true"`; SVG does not use an HTML image alt attribute.
- Linked logos next to visible brand text do not need a duplicate spoken description. Controls still need meaningful accessible names.
- User-selected private images are not crawlable SEO assets. Describe their role in the editor without uploading them for search indexing.

Empty alt text is correct for a decorative image, not an SEO failure. [W3C decorative image guidance](https://www.w3.org/WAI/tutorials/images/decorative/).

## Metadata and content

Public pages have individual titles, descriptions and matching social titles. The requested title suffix includes “No watermark | No signup | No credit card required”. It is preserved, but makes titles long; search engines may shorten or rewrite them. If search-result readability suffers, a future option is to keep the main benefit in the title and move the remaining benefits into the description. [Google title guidance](https://developers.google.com/search/docs/appearance/title-link).

Use accurate tool names and examples, practical steps, useful internal links and honest limits. Do not invent ratings, experts, test results or supported formats. Structured data must describe the real application. Adding schema does not guarantee a rich result. Content should help visitors finish their task; more repeated keywords are not a substitute. [Google helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

## Verification

Run against a production server:

```powershell
npm run build
npm start -- --port 3102
```

In another terminal:

```powershell
$env:E2E_BASE = 'http://localhost:3102'
npm run test:seo
npm run test:site
```

`test:seo` checks heading order, one H1, missing image alt attributes, unique titles/descriptions, required title phrases, social title consistency, JSON-LD syntax, sitemap coverage and crawler rules. It tests both preview and public crawl-policy branches and writes a JSON report to the system temporary directory, printing its path. A semantic review is still needed for the quality of alt descriptions.

`test:site` checks page responses, headings, security headers, PWA assets, mobile layout and offline processing/downloads. For a live build, inspect canonical URLs and indexing status in Search Console too.

The updated local production build scored **100/100 in Lighthouse 13.0.3's SEO category** on 7 October 2026, and the route audit passed for 23 public pages plus the private workspace. The previous live build still requires redeployment. Rerun Lighthouse on the live production URL after deployment and check Core Web Vitals on representative devices. An SEO audit score does not guarantee indexing, traffic or rankings.

## Product priorities

See `SHRINKFOX-ROADMAP.md` for the prioritized feature and growth plan. The recommended next features are mask erase/restore, background replacement and interactive cropping, followed by export recipes and saved local presets.
