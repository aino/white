# aino-commerce: ISR to Edge Cache Migration Strategy

## Goal

Replace Next.js ISR (`getStaticProps` + `revalidate`) with SSR + edge caching to:
- Reduce Vercel costs (no ISR writes)
- Keep tag-based invalidation (one tag affects multiple pages)
- Maintain same performance (edge-cached responses)
- Support 50+ locales without build time explosion

## Current Architecture (ISR)

```
Build time:
  getStaticPaths → generates paths for all products × locales
  getStaticProps → fetches data, generates HTML
  
Runtime:
  Request → Vercel serves static HTML
  After revalidate period → background regeneration
  
Invalidation:
  revalidateTag('product-123') → marks pages for regeneration
  Next request triggers ISR write ($$$)
```

**Problems:**
- Build time: O(products × locales) — 26k+ pages
- ISR writes: billed per revalidation per page
- Tag invalidation still triggers ISR writes

---

## Target Architecture (Edge Cache)

```
Build time:
  Assets only (JS/CSS)
  No HTML generation
  
Runtime:
  Request → Route Handler renders HTML
  Response cached at edge with tags
  
Invalidation:
  POST /api/revalidate → Vercel cache purge API
  No ISR write, just cache purge (free)
  Next request re-renders (function invocation)
```

**Benefits:**
- Build time: O(1) — just assets
- No ISR writes — standard function invocations
- Tag invalidation purges cache (no regeneration cost)

---

## Implementation

### Phase 1: Route Handler Pattern

Convert pages from `getStaticProps` to Route Handlers:

**Before (pages/products/[slug].tsx):**
```tsx
export async function getStaticPaths() {
  const products = await fetchAllProducts()
  return {
    paths: products.flatMap(p => 
      LOCALES.map(locale => ({ params: { slug: p.slug }, locale }))
    ),
    fallback: 'blocking'
  }
}

export async function getStaticProps({ params, locale }) {
  const product = await fetchProduct(params.slug, locale)
  return {
    props: { product },
    revalidate: 60,
  }
}
```

**After (app/[locale]/products/[slug]/route.ts):**
```tsx
import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { locale: string; slug: string } }
) {
  const { locale, slug } = params
  const product = await fetchProduct(slug, locale)
  
  if (!product) {
    return new Response('Not Found', { status: 404 })
  }
  
  const html = await renderProductPage(product, locale)
  
  // Collect all tags this page depends on
  const tags = [
    `product-${product.id}`,
    `category-${product.categoryId}`,
    `locale-${locale}`,
    `brand-${product.brandId}`,
  ]
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Vercel-Cache-Tag': tags.join(','),
    },
  })
}
```

### Phase 2: Tag Strategy

Design tags so one tag can invalidate multiple pages:

```
Tag                     Affects
─────────────────────────────────────────────────
product-123             /*/products/slim-finn (all locales)
category-jeans          All products in jeans category
brand-nudie             All Nudie products
collection-summer-24    All products in collection
locale-en-SE            All en-SE pages (nuclear option)
pricelist-27            All pages using pricelist 27
```

**Setting tags in the response:**
```tsx
// Product page tags
const tags = [
  `product-${product.id}`,
  `product-${product.slug}`,
  `category-${product.category.id}`,
  `brand-${product.brand?.id}`,
  ...product.collections.map(c => `collection-${c.id}`),
  `locale-${locale}`,
  `pricelist-${pricelist}`,
]
```

**PLP (listing page) tags:**
```tsx
// Category page — depends on ALL products in category
const tags = [
  `category-${category.id}`,
  `locale-${locale}`,
  // Also tag with each product so product changes invalidate listing
  ...products.map(p => `product-${p.id}`),
]
```

### Phase 3: Invalidation Endpoint

**app/api/revalidate/route.ts:**
```tsx
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { secret, tags } = await request.json()
  
  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const results = await invalidateTags(tags)
  
  return Response.json({ invalidated: results })
}

async function invalidateTags(tags: string[]) {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID
  
  const params = new URLSearchParams({ projectIdOrName: projectId })
  if (teamId) params.append('teamId', teamId)
  
  const response = await fetch(
    `https://api.vercel.com/v1/edge-cache/invalidate-by-tags?${params}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags }),
    }
  )
  
  return response.json()
}
```

### Phase 4: Centra Webhook Integration

**app/api/centra-webhook/route.ts:**
```tsx
export async function POST(request: NextRequest) {
  const payload = await request.json()
  
  // Validate webhook signature
  if (!validateCentraSignature(request, payload)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }
  
  // Map Centra events to cache tags
  const tags = resolveTags(payload)
  
  if (tags.length === 0) {
    return Response.json({ message: 'No tags to invalidate' })
  }
  
  const result = await invalidateTags(tags)
  
  return Response.json({ 
    event: payload.event,
    tags,
    result 
  })
}

function resolveTags(payload: CentraWebhook): string[] {
  const { event, data } = payload
  
  switch (event) {
    case 'product.updated':
    case 'product.stock_changed':
      return [
        `product-${data.productId}`,
        // Also invalidate category listings
        ...data.categoryIds.map(id => `category-${id}`),
      ]
      
    case 'product.price_changed':
      return [
        `product-${data.productId}`,
        `pricelist-${data.pricelistId}`,
      ]
      
    case 'category.updated':
      return [`category-${data.categoryId}`]
      
    case 'pricelist.updated':
      // Nuclear: invalidates all pages using this pricelist
      return [`pricelist-${data.pricelistId}`]
      
    default:
      console.warn(`Unknown Centra event: ${event}`)
      return []
  }
}
```

---

## Rendering Layer

### Option A: React Server Components (recommended)

Keep using RSC but return as Response with cache headers:

```tsx
// app/[locale]/products/[slug]/route.ts
import { renderToString } from 'react-dom/server'
import ProductPage from './ProductPage'

export async function GET(request, { params }) {
  const product = await fetchProduct(params.slug)
  
  const html = renderToString(
    <ProductPage product={product} locale={params.locale} />
  )
  
  const fullHtml = `<!DOCTYPE html>
    <html>
      <head>...</head>
      <body>${html}</body>
    </html>`
  
  return new Response(fullHtml, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Vercel-Cache-Tag': `product-${product.id}`,
    },
  })
}
```

### Option B: Middleware-based caching

Add cache headers via middleware without changing page components:

```tsx
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  // Skip for API routes, _next, etc.
  if (shouldCache(request.nextUrl.pathname)) {
    response.headers.set(
      'Cache-Control', 
      'public, s-maxage=3600, stale-while-revalidate=86400'
    )
    response.headers.set(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400'
    )
    
    // Tags need to be set per-page, so this approach
    // requires a different pattern (see below)
  }
  
  return response
}
```

**Problem:** Middleware can't easily set per-page tags.

**Solution:** Use a wrapper in the app router:

```tsx
// lib/cachedPage.tsx
export function cachedResponse(
  html: string, 
  tags: string[],
  options: { maxAge?: number; swr?: number } = {}
) {
  const { maxAge = 3600, swr = 86400 } = options
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
      'Vercel-CDN-Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
      'Vercel-Cache-Tag': tags.join(','),
    },
  })
}
```

---

## Migration Steps

### Step 1: Setup (1 day)
- [ ] Add env vars: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`
- [ ] Create `/api/revalidate` endpoint
- [ ] Create `cachedResponse` helper

### Step 2: Pilot page (2-3 days)
- [ ] Convert ONE page type (e.g., PDP) to Route Handler
- [ ] Implement tag strategy for that page
- [ ] Test cache hit/miss behavior
- [ ] Test invalidation via API

### Step 3: Centra integration (1-2 days)
- [ ] Create `/api/centra-webhook` endpoint
- [ ] Map Centra events to tags
- [ ] Test end-to-end: Centra update → webhook → invalidation → fresh page

### Step 4: Full migration (1-2 weeks)
- [ ] Convert remaining pages: PLP, homepage, CMS pages
- [ ] Update sitemap generation (no getStaticPaths needed)
- [ ] Remove ISR configuration
- [ ] Monitor costs

### Step 5: Cleanup
- [ ] Remove `revalidate` from any remaining getStaticProps
- [ ] Remove `getStaticPaths` (not needed for on-demand)
- [ ] Update build scripts
- [ ] Document new architecture

---

## Cost Comparison

### Before (ISR with 50 locales)

```
Products: 500
Locales: 50
Pages: 25,000

Daily revalidations (assuming 10% update):
  2,500 ISR writes × $0.0004 = $1/day
  
Monthly: ~$30 just for revalidations
Plus function invocations for renders
```

### After (Edge Cache)

```
No ISR writes
Function invocations only on cache miss
Cache hit rate: 95%+

Daily function invocations:
  Traffic / 0.05 (cache miss rate) × $0.0000004
  
Monthly: <$5 for most sites
```

---

## Caveats

### Preview/Draft Mode
Same pattern as White — use cookie to bypass cache:

```tsx
export async function GET(request, { params }) {
  const cookies = request.cookies
  const isDraft = cookies.get('__draft')?.value === 'true'
  
  // ... render page ...
  
  if (isDraft) {
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    })
  }
  
  return cachedResponse(html, tags)
}
```

### Image Optimization
`next/image` still works — it's separate from page caching.

### Client Components
Hydration still works. The HTML response includes the React payload for client components.

### Incremental Migration
Can run both systems in parallel:
- New pages use Route Handlers + cache headers
- Old pages keep using getStaticProps
- Migrate page by page

---

## Environment Variables

```bash
# Required for cache invalidation
VERCEL_TOKEN=           # Full account token from vercel.com/account/tokens
VERCEL_PROJECT_ID=      # From project settings
VERCEL_TEAM_ID=         # From team settings (if on team)
REVALIDATE_SECRET=      # Your secret for webhook auth
```

---

## Testing Checklist

- [ ] Page loads correctly
- [ ] `X-Vercel-Cache: HIT` on second request
- [ ] `age` header increases on cached responses
- [ ] Invalidation API returns 200
- [ ] Page shows `STALE` after invalidation
- [ ] New content appears after revalidation
- [ ] Draft mode bypasses cache
- [ ] Tags are set correctly (check via curl)

---

## References

- White ISR implementation: `../white/@white/api/renderer.js`
- Vercel cache invalidation API: https://vercel.com/docs/rest-api/edge-cache
- Shopify Hydrogen approach: https://hydrogen.shopify.dev/docs/custom-storefronts/hydrogen/caching
