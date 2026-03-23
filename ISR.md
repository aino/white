# White ISR — On-Demand Static Page Generation

## The Problem

An e-commerce site with 200 locale combinations and 5,000 products = 1,000,000 pages. Building all of them upfront is impractical. Rebuilding all of them on every code push is impossible. We need pages built on-demand and invalidated individually.

## Architecture

```
                          ┌─────────────────┐
                          │   CloudFront     │
                          │   (CDN cache)    │
                          └────────┬────────┘
                                   │
                     ┌─────────────┼─────────────┐
                     │             │              │
                Cache HIT    Cache MISS      /api/*
                     │             │              │
                Serve HTML   ┌─────▼──────┐  ┌───▼───┐
                instantly    │  Lambda    │  │Vercel │
                             │  @Edge     │  │Edge   │
                             └─────┬──────┘  └───────┘
                                   │
                          ┌────────┼────────┐
                          │                 │
                     In S3?            Not in S3?
                          │                 │
                     Serve it         Build it now
                     + cache          → compileTemplate
                                      → save to S3
                                      → return HTML
                                      → CloudFront caches
```

### What lives where

| Concern | Where | Why |
|---|---|---|
| Static HTML | S3 + CloudFront | Per-file updates, cheap at scale |
| JS/CSS bundle | S3 + CloudFront | Deployed alongside HTML, fingerprinted |
| API routes | Vercel Edge Functions | Already working, good DX |
| Image optimization | Vercel or CloudFront | Evaluate based on cost |
| Preview deploys | Vercel | Keep for development workflow |
| On-demand builder | Lambda@Edge | Runs compileTemplate on cache miss |
| Invalidation API | Vercel API route | Receives CMS webhooks |

## Page Lifecycle

### 1. First request (cold)

```
GET /en/products/SKU-123
  → CloudFront: MISS
  → Lambda@Edge origin request
  → Check S3: not found
  → Build the page:
      1. Load globalData (cached in Lambda memory or fetched from API/DB)
      2. getPageContext('/en/products/SKU-123', globalData)
      3. compileTemplate(templatePath, pageData)
      4. Save HTML to S3
      5. Return HTML with cache headers
  → CloudFront caches the response
  → User gets the page (~100-200ms cold)
```

### 2. Subsequent requests (warm)

```
GET /en/products/SKU-123
  → CloudFront: HIT
  → Serve from edge cache (~10-30ms)
```

### 3. Content change (CMS webhook)

```
POST /api/revalidate { tag: "product:SKU-123" }
  → Look up tags-manifest.json
  → Find affected paths: /en/products/SKU-123, /fi/products/SKU-123, ...
  → Delete those files from S3
  → Invalidate those CloudFront paths
  → Done — next request triggers a fresh build
```

Pages are NOT rebuilt eagerly on invalidation. They rebuild lazily on the next request. If nobody visits the page, no compute is wasted.

### 4. Code push (template/CSS/JS changes)

```
git push
  ├─→ Vercel: deploys API routes, edge functions (seconds)
  ├─→ CI/CD: builds new JS/CSS bundle → uploads to S3
  └─→ CI/CD: flush all HTML from S3 + invalidate CloudFront
       → all pages rebuild on-demand from next visitor
```

Full HTML flush is fine because:
- High-traffic pages rebuild within minutes from organic traffic
- Low-traffic pages rebuild on first visit (~200ms, imperceptible)
- No upfront build time at all

Optionally, pre-warm the top N pages after deploy (homepage, category pages, top products).

## What needs to be built

### Phase 1: Tag manifest

**Changes to `data.config.js`:**

```js
export const routes = {
  '/products/[slug]': {
    tags: (slug) => ['products', `product:${slug}`],
    slugs: (globalData) => globalData.products.map(p => p.slug),
    data: async ({ slug, globalData }) => { ... },
  },
  '/': {
    tags: () => ['homepage', 'products'],  // homepage shows featured products
    data: async ({ globalData }) => { ... },
  },
}
```

**Build-time manifest generation:**

During build (or on-demand), iterate all routes + slugs + locales and collect tags into a JSON file:

```json
{
  "product:SKU-123": [
    "/en/products/SKU-123",
    "/fi/products/SKU-123",
    "... (200 locale variants)"
  ],
  "products": [
    "/en/products/SKU-123",
    "/en/products/SKU-456",
    "/en/",
    "... (all product pages + pages that list products)"
  ]
}
```

This manifest is used by the invalidation API to know which paths to flush.

**Important:** The manifest needs to be regenerated when products are added/removed (new slugs). The invalidation API should handle this — when a "product:new" event comes in that isn't in the manifest, trigger a manifest rebuild.

### Phase 2: Standalone compiler

Currently `compileTemplate` depends on `viteServer.ssrLoadModule()`. This won't work in Lambda — there's no Vite server.

#### Why this is simpler than it looks

The Lambda only produces HTML. It does NOT need:
- The client-side bundle (`white.js`, component scripts, CSS) — already built by Vite, served as static assets from S3
- Virtual modules (`white/scripts`, `white/components`, `white/css`) — those are client-side only
- CSS processing — CSS is in the static bundle
- Image optimization — handled by Vercel/CloudFront

The JSX import chain for a page is pure functions all the way down:

```
src/pages/about/[slug]/index.jsx
  → src/components/Layout/index.jsx
    → src/components/Header/index.jsx
    → src/components/Footer/index.jsx
  → src/components/Counter/index.jsx
  → @white/lib/jsx-runtime.js (h, Fragment — string concatenation)
```

No side effects, no state, no CSS imports. Just functions that call `h()` and return strings.

#### Approach: pre-compile templates at deploy time

Don't run esbuild in Lambda at request time. Pre-compile all page templates during CI/CD and include them in the Lambda package:

**Step 1 — Build script (`scripts/compile-templates.js`):**

Uses esbuild to bundle each page template into a standalone JS module:

```js
import esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/pages/index.jsx', 'src/pages/about/[slug]/index.jsx', ...],
  bundle: true,
  format: 'esm',
  outdir: 'dist/templates',
  jsx: 'transform',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  inject: ['@white/lib/jsx-runtime.js'],  // provides h and Fragment
  alias: {
    'src': './src',
    '@white': './@white',
    'lib/jsx-runtime': './@white/lib/jsx-runtime.js',
  },
  external: [],  // bundle everything — no runtime dependencies
  platform: 'node',
})
```

Output: one self-contained JS file per page template, no imports, no dependencies.

```
dist/templates/
  index.js            # homepage template (bundled with Layout, Header, Footer, etc.)
  about/index.js      # about page template
  about/[slug]/index.js  # dynamic about page template
  404/index.js        # 404 template
```

Each file exports a default function that takes data props and returns an HTML string. ~5-20KB per template.

**Step 2 — Template registry:**

Generate a route-to-template map:

```js
// dist/templates/registry.js
export default {
  '/': () => import('./index.js'),
  '/about': () => import('./about/index.js'),
  '/about/[slug]': () => import('./about/[slug]/index.js'),
  '/404': () => import('./404/index.js'),
}
```

**Step 3 — Lambda handler:**

```js
import { getPageContext } from './getPageContext.js'
import templates from './templates/registry.js'

export async function handler(url) {
  // 1. Resolve page context (route matching + data fetching via data.config.js)
  const context = await getPageContext(url)
  if (!context) return null // 404

  // 3. Load pre-compiled template
  const loadTemplate = templates[context.key]
  if (!loadTemplate) return null
  const { default: Template } = await loadTemplate()

  // 4. Render HTML
  const html = '<!DOCTYPE html>' + Template(context.data)

  return html
}
```

No esbuild at runtime. No Vite. No module resolution. Just import a pre-compiled function and call it with data.

**Step 4 — `getPageContext` for Lambda:**

The existing `getPageContext` uses `import * as config from '../../src/data.config.js'` and `fs.existsSync`. For Lambda, extract a standalone version that:
- Receives `data.config` routes and globalData as arguments (instead of importing from a relative path)
- Removes the filesystem checks (Lambda doesn't have the source tree)
- Keeps the route matching and data fetching logic

This is a small refactor — the core logic (URL parsing, slug matching, data() calls) stays the same.

#### What gets deployed to Lambda

```
lambda/
  handler.js          # entry point
  getPageContext.js    # route matching + data fetching (standalone)
  data.config.js      # route definitions + data functions
  config.js           # LOCALES etc.
  templates/
    registry.js       # route → template map
    index.js          # pre-compiled homepage
    about/index.js    # pre-compiled about
    about/[slug]/index.js
    404/index.js
```

Total package size: ~50-200KB depending on number of templates. Well within Lambda@Edge limits (1MB for viewer request, 50MB for origin request).

#### CI/CD additions

```yaml
steps:
  - run: npm run build:assets        # Vite builds JS/CSS client bundle
  - run: npm run build:templates     # esbuild compiles JSX templates for Lambda
  - run: aws s3 sync dist/_assets s3://white-pages/_assets
  - run: aws lambda update-function-code --function-name white-isr --zip-file ...
```

#### Local testing

The standalone compiler can be tested locally without Lambda:

```js
// scripts/test-compile.js
import { handler } from './lambda/handler.js'

const html = await handler('/en/products/SKU-123')
console.log(html)
```

#### What `data.config.js` needs for e-commerce

The `data()` functions in routes would fetch from your product API/database. In Lambda, these run at request time (on cache miss only):

```js
export const routes = {
  '/products/[slug]': {
    tags: (slug) => ['products', `product:${slug}`],
    slugs: async (globalData) => globalData.products.map(p => p.slug),
    data: async ({ slug, locale, globalData }) => {
      // This runs in Lambda on cache miss
      const product = await fetch(`https://api.store.com/products/${slug}?locale=${locale}`)
      return { product: await product.json() }
    },
  },
}
```

### Phase 3: S3 + CloudFront setup

**S3 bucket structure mirrors URL paths:**

```
s3://white-pages/
  en/
    index.html
    products/
      SKU-123/index.html
      SKU-456/index.html
  fi/
    index.html
    products/
      SKU-123/index.html
  _assets/
    [hash].js
    [hash].css
  tags-manifest.json
```

**CloudFront configuration:**

- Default origin: S3 bucket
- Behavior for `/api/*`: origin = Vercel
- Lambda@Edge on origin-request: builds page if not in S3
- Cache policy: respect s-maxage headers, or default TTL
- Custom error response: 403/404 from S3 triggers Lambda@Edge builder

**CloudFront invalidation:**
- Per-path invalidation: `/**/products/SKU-123*` for one product across locales
- Full invalidation: `/*` on code push
- CloudFront allows 1,000 free invalidation paths/month, then $0.005 each

### Phase 4: Invalidation API

**Vercel API route: `/api/revalidate`**

```js
export const POST = async (req) => {
  const { tag, secret } = await req.json()

  // Validate webhook secret
  if (secret !== process.env.REVALIDATE_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Load manifest
  const manifest = await fetchManifest()
  const paths = manifest[tag] || []

  if (paths.length === 0) {
    return new Response(JSON.stringify({ revalidated: 0 }), { status: 200 })
  }

  // Delete from S3
  await deleteFromS3(paths)

  // Invalidate CloudFront
  await invalidateCloudFront(paths)

  return new Response(
    JSON.stringify({ revalidated: paths.length, paths }),
    { status: 200 }
  )
}
```

### Phase 5: Deploy pipeline

**On code push (GitHub Actions or similar):**

```yaml
# 1. Deploy API/edge to Vercel (automatic via Vercel GitHub integration)
#    Vercel also gets the pre-compiled templates for preview deploys

# 2. Build assets + flush HTML (production)
steps:
  - run: npm run build:assets        # Vite builds JS/CSS client bundle
  - run: npm run build:templates     # esbuild compiles JSX templates
  - run: npm run build:manifest      # Generate tags-manifest.json
  - run: aws s3 sync dist/_assets s3://white-pages/_assets
  - run: aws s3 cp dist/tags-manifest.json s3://white-pages/tags-manifest.json
  - run: aws s3 rm s3://white-pages --recursive --exclude "_assets/*" --exclude "tags-manifest.json"
  - run: aws lambda update-function-code --function-name white-isr --zip-file ...
  - run: aws cloudfront create-invalidation --distribution-id $CDN_ID --paths "/*"

# 3. Optional: pre-warm critical pages
  - run: node scripts/prewarm.js     # Fetches top N pages to trigger builds
```

### Phase 6: Preview deploys

Preview deploys stay entirely on Vercel — no S3, no CloudFront. They use the same standalone compiler as a Vercel serverless function that renders every page dynamically:

```
project-abc123.vercel.app/en/products/SKU-123
  → Vercel serverless function
  → Load pre-compiled template (bundled in the deployment)
  → Fetch live data via data.config.js
  → Return HTML (uncached)
```

**Vercel catch-all function: `api/render/[...path].js`**

```js
import { handler } from '../lambda/handler.js'

export const GET = async (req) => {
  const path = req.url.pathname.replace('/api/render', '') || '/'
  const html = await handler(path)

  if (!html) {
    return new Response('Not Found', { status: 404 })
  }

  return new Response(html, {
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
  })
}
```

Combined with a Vercel rewrite rule so all non-API routes hit this function:

```json
// vercel.json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/api/render/$1" }
  ]
}
```

This gives every PR a working preview URL with live data and that deployment's code. Slower than production (no caching, renders on every request) but that's fine for previews.

**Key benefit:** The standalone compiler is shared between Lambda@Edge (production) and Vercel serverless (previews). Same code, same templates, different hosting. If it works in preview, it works in production.

## Cost estimate (1M potential pages, 100k monthly visitors)

| Service | Usage | Cost |
|---|---|---|
| S3 storage | ~10-50GB (only visited pages exist) | ~$1-2/mo |
| S3 requests | ~500k GET/month | ~$0.20/mo |
| CloudFront | ~100GB transfer | ~$8.50/mo |
| Lambda@Edge | ~50k invocations (cache misses) | ~$0.50/mo |
| CloudFront invalidations | ~2k paths/month | ~$5/mo |
| Vercel | API routes + images only | Free-Pro tier |
| **Total** | | **~$15-20/mo** |

Compare to: Vercel Pro ($20/mo) + serverless SSR for 1M pages = easily $100+/mo with cold starts and compute.

## Implementation order

1. **Standalone compiler** — extract `compileTemplate` from Vite dependency. esbuild bundles page templates at deploy time. Test locally. This is the foundation — everything else depends on it.
2. **Preview deploys** — Vercel catch-all serverless function using the standalone compiler. Validates the compiler works end-to-end before touching AWS.
3. **Tag manifest** — add `tags` to route config, generate manifest at build time.
4. **S3 + CloudFront** — set up bucket, distribution, and origin routing. Deploy current static build to validate.
5. **Lambda@Edge builder** — on-demand page generation on cache miss. Same compiler as previews.
6. **Invalidation API** — webhook endpoint that flushes specific pages.
7. **Deploy pipeline** — GitHub Actions for asset builds + S3 sync + CloudFront flush + Lambda deploy.
8. **Pre-warming script** — optional, fetches critical pages after deploy.

## CMS Preview Mode

Editors need to see unpublished/draft content before publishing. This requires server-side rendering on demand — the one case where static pages aren't enough.

### How it works

```
Editor clicks "Preview" in Storyblok/Sanity
  → Opens: https://yoursite.com/en/products/SKU-123?__preview=TOKEN
  → Vercel middleware detects __preview param
  → Sets a __preview cookie + redirects to clean URL
  → Subsequent requests with cookie bypass CloudFront:
      middleware rewrites to /api/preview/en/products/SKU-123
  → Vercel edge function:
      1. Validates preview token
      2. Fetches DRAFT content from CMS API
      3. Runs standalone compiler with draft data
      4. Returns HTML (never cached)
```

### Preview API route

```js
// api/preview/[...path].js
export const GET = async (req) => {
  const token = req.cookies.get('__preview')
  if (!validateToken(token)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const path = req.url.pathname.replace('/api/preview', '')
  const draftData = await cms.fetchDraft(path)
  const html = await compileStandalone(path, draftData)

  return new Response(html, {
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
  })
}
```

### CMS visual editor

For Storyblok's visual editor (iframe + postMessage), the preview route serves as the bridge. The editor sends content updates via postMessage, the iframe reloads the preview URL with updated draft data. No special infrastructure needed — it's just the preview API route responding to requests from the editor iframe.

## Sitemaps

Generated dynamically via Vercel API route, edge-cached:

```js
// api/sitemap/[index].js
export const GET = async (req) => {
  const index = parseInt(req.params.index || '0')
  const products = await fetchProductSlugs()
  const locales = LOCALES
  const perPage = 50000

  const chunk = products.slice(index * perPage, (index + 1) * perPage)
  const xml = generateSitemapXML(chunk, locales)

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 's-maxage=3600',
    },
  })
}
```

Sitemap index at `/api/sitemap` lists all chunks. Edge-cached on Vercel with 1hr TTL. Invalidated naturally by TTL expiry — no webhook needed since sitemap staleness of up to 1hr is fine for SEO.

## Redirects

Handled in Vercel middleware (`src/middleware.js`), which already runs at the edge before any response:

```js
// In middleware.js
const redirects = await fetchRedirectsMap() // from KV/S3/API, cached

export default async function middleware(req) {
  const redirect = redirects[req.url.pathname]
  if (redirect) {
    return Response.redirect(redirect.to, redirect.status || 301)
  }
}
```

Redirect map managed via CMS or API. When a product slug changes, the CMS webhook hits `/api/revalidate` which both invalidates the old page AND adds a redirect entry.

## Webhook Lifecycle

All handled by the existing `/api/revalidate` Vercel route, extended for different event types:

```js
export const POST = async (req) => {
  const { event, tag, secret, data } = await req.json()

  if (secret !== process.env.REVALIDATE_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  switch (event) {
    case 'update':
      // Product updated — invalidate affected pages
      await invalidateTag(tag)
      break

    case 'create':
      // New product — update manifest, then pages build on-demand
      await rebuildManifest()
      break

    case 'delete':
      // Product removed — invalidate pages + add redirect
      await invalidateTag(tag)
      await addRedirect(data.oldPath, data.redirectTo || '/')
      break

    case 'rename':
      // Slug changed — invalidate both old and new, add redirect
      await invalidateTag(data.oldTag)
      await invalidateTag(data.newTag)
      await addRedirect(data.oldPath, data.newPath)
      await rebuildManifest()
      break
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
```

## Resolved decisions

- **Preview deploys:** Vercel serverless with dynamic rendering. Same standalone compiler as production, no caching. Every PR gets a working preview URL.
- **Manifest storage:** `tags-manifest.json` in S3, accessible to both Lambda and the Vercel invalidation API.
- **Redirect storage:** S3 JSON file, fetched by Vercel middleware with short TTL cache. Simple enough to start, can move to Vercel KV if latency becomes an issue.
- **Image optimization:** Stay with Vercel. Already working, good DX. Revisit if costs grow.
