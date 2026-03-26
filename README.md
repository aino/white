# White

A performance-first frontend platform.

## Why

Most people don’t care enough about performance. For those who do — keep reading.

White rethinks frontend from first principles. Every design decision optimizes for the output that reaches the user — the markup, the assets, the data. No abstractions between content and response. No caching to compensate for slow rendering. No framework overhead. Built for coding agents.

The architecture is deliberately minimal — simple enough for an AI agent to read and modify without docs, simple enough for a developer to hold in their head.

### The problem with reactive frameworks

React was designed for interactive applications. Most e-commerce pages are documents with a few interactive elements.

- **Developer-first, not output-first** — reactive frameworks optimize for developer ergonomics. The trade-offs compound at scale
- **Framework lock-in** — agencies pick favourites, trends shift every few years. JavaScript, CSS and HTML never go out of style
- **Runtime tax** — 40-100KB+ JS shipped to re-render what’s already static HTML
- **Hydration bloat** — all component data serialized as JSON in the page source. 200 products on a category page = 2MB of duplicated data
- **Server components** — introduced to fix client-side bloat, but added new complexity (`’use client’`, serialization boundaries) for a result still slower than static HTML
- **Streaming / Suspense** — patches for slow server rendering. A static page from CDN arrives complete — no skeletons needed
- **Caching complexity** — Next.js has five caching mechanisms (`ISR`, `unstable_cache`, `revalidateTag`, `revalidatePath`, `cache()`). White has one: the page is static, a webhook invalidates it
- **Cost at scale** — every cache miss boots React on a server. At 200 locales × thousands of products, this adds up fast

White doesn’t replace React. It removes React from the 90% of pages that never needed it, and lets you mount it as an island on the 10% that do (cart, checkout, account).

## How it works

- **Static HTML from JSX** — server-rendered templates, 2KB client JS, no virtual DOM
- **SPA navigation** — prefetches on hover, swaps content area only. Components with `key` transfer between pages with state and listeners intact
- **Interactive islands** — vanilla JS or React components mount where needed
- **Any data source** — CMS, commerce API, database via async functions
- **Multi-locale** — automatic URL prefixing, localized hrefs, multi-market out of the box
- **Two deploy modes** — static site to any host, or on-demand ISR via AWS Lambda@Edge

## Get Started

1. Clone the repository
2. Run `npm install` to install dependencies
3. Start development server with `npm run dev`
4. Build for production with `npm run build`

## Core Concepts

### Persistent Component Architecture

Two attributes control component behavior:

- **`key`** — Persists the DOM node across page navigations. The physical element (with event listeners and state) is transferred instead of being replaced.
- **`data-component`** — Mounts a client-side script on the element. The script file name must match the attribute value.

They are independent. A `key`-only element persists without any script. A `data-component`-only element runs a script but resets on every page. Use both together for interactive persistent components:

```jsx
<div data-component="counter" key="counter" data-value={value}>
```

### Component Structure

Each component can have three files:

```
components/Counter/
├── index.jsx          # JSX template
├── counter.js         # Client-side behavior
└── counter.css        # Component styles
```

```jsx
// components/Counter/index.jsx
export default function Counter({ value }) {
  return (
    <div data-component="counter" key="counter" data-value={value}>
      <span>{value}</span>
      <button>+</button>
    </div>
  )
}
```

```javascript
// components/Counter/counter.js
export default async function counter(node, { on, state }) {
  const initialValue = parseInt(node.dataset.value)

  const count = state(initialValue, (value) => {
    node.querySelector('span').textContent = value
  })

  on('click', 'button', () => count.set((c) => c + 1))
}
```

### Lifecycle Context

Both component scripts and page scripts receive a **lifecycle context** as a second argument. The context provides helpers that automatically clean up when the component unmounts or the user navigates away:

```javascript
export default async function myComponent(node, { on, listen, state, onCleanup }) {
  // on(event, selector, handler) — delegated event listener on the component root
  on('click', 'button', (e, target) => { ... })

  // listen(target, event, handler, options?) — direct listener on any target, auto-cleaned
  listen(window, 'resize', (e) => { ... })

  // state(initial, onChange?) — reactive state, auto-destroyed
  const count = state(0, (value) => { ... })

  // onCleanup(fn) — escape hatch for anything else (timers, subscriptions)
  const interval = setInterval(tick, 1000)
  onCleanup(() => clearInterval(interval))
}
```

No manual cleanup needed — the framework handles teardown automatically.

**`on`** delegates events to the component root node. Since the listener lives on the stable `data-component` element, it survives `innerHTML` re-renders of the component's children. Use bubbling equivalents for non-bubbling events (`focusin`/`focusout` instead of `focus`/`blur`).

**`listen`** attaches a direct event listener on any target. Use it for `window`, `document`, or specific DOM nodes.

**Legacy pattern:** Returning a cleanup function still works for backward compatibility. The framework merges it with any context-based cleanups.

**Persistent components** (those with a `key` attribute) are only cleaned up when they no longer appear in the next page's DOM. If the component exists on both pages, it is physically transferred and the cleanup is _not_ called.

### Pages & Routing

The directory structure inside `src/pages/` defines the URL routes. Each `index.jsx` becomes an HTML page:

```
src/pages/index.jsx              → /
src/pages/about/index.jsx        → /about/
src/pages/work/index.jsx         → /work/
src/pages/work/[slug]/index.jsx  → /work/project-a/, /work/project-b/, ...
```

Routes in `data.config.js` must mirror this directory structure — they provide data to the pages, not define the routes. A page can exist without a route entry (it just receives no data props). A `[slug]` directory needs a matching route — with a `slugs()` function for static builds, or just `data()` for ISR (pages render on-demand). If `data()` returns `null`, the page is a 404.

```
├── src/
│   ├── pages/
│   │   ├── index.jsx           # → /
│   │   ├── about/
│   │   │   ├── index.jsx       # → /about/
│   │   │   ├── about.js        # Page script (auto-loaded)
│   │   │   └── about.css       # Page styles (auto-bundled)
│   │   └── work/
│   │       ├── index.jsx       # → /work/
│   │       └── [slug]/
│   │           └── index.jsx   # → /work/{slug}/
│   ├── components/
│   │   ├── Layout/
│   │   │   └── index.jsx
│   │   └── Counter/
│   │       ├── index.jsx
│   │       ├── counter.js      # Component behavior (auto-loaded)
│   │       └── counter.css     # Component styles (auto-bundled)
│   └── js/
│       └── main.js             # Global initialization
├── api/
│   └── hello.js                # → /api/hello
└── data.config.js              # Route data configuration
```

### Layouts

```jsx
// components/Layout/index.jsx
export default function Layout({ children, lang }) {
  return (
    <html lang={lang}>
      <head>
        <meta charset="utf-8" />
        <title>My Site</title>
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
        <main id="app">{children}</main>
        <script type="module" src="/src/js/white.js"></script>
      </body>
    </html>
  )
}
```

### Global Data

Data that every page needs (site config, navigation, market settings) can be accessed from any component without prop drilling:

```javascript
// data.config.js
export const globalData = async ({ locale }) => {
  const market = await fetchMarket(locale)
  return { site: { name: 'My Store' }, market }
}
```

```jsx
// Any component, any nesting depth
import { getGlobalData } from '@white/utils/globalData'

export default function Header() {
  const { site, market } = getGlobalData()
  return (
    <header>
      {site.name} — {market.currency}
    </header>
  )
}
```

`getGlobalData()` is server-only — it reads from a render context set by the framework before each page render. Components receive the data without the page template having to forward it.

### Main Entry & Page Scripts

**`src/js/main.js`** is the global entry script. It runs once on initial page load and exports `pageTransition` — a function that controls how `#app` swaps between pages during SPA navigation:

```javascript
// src/js/main.js
export async function pageTransition(oldApp, newApp) {
  oldApp.replaceWith(newApp)
  scrollTo(0, 0)
}

export default async function main() {
  // Global setup: runs once on page load
}
```

You can customize `pageTransition` to add animations, fade effects, etc. The `oldApp` and `newApp` arguments are the actual `#app` DOM elements.

**Page scripts** are automatically discovered and loaded from both `pages/` and `components/` directories. No manual imports needed!

```javascript
// pages/about/about.js (auto-loaded for /about route)
export const path = /^\/about/ // Matches /about pages

export default function about(app, { on, listen, state, onCleanup }) {
  console.log('About page loaded')

  // Same lifecycle context as components — scoped to #app
  on('click', '[data-toggle]', (e, target) => { ... })
}
```

**Styles** are automatically discovered and bundled from all `.css` and `.scss` files in `pages/` and `components/`. Just create a stylesheet next to your component or page and it will be included in the build.

**SCSS and CSS Modules** are supported via Vite. Install `sass` to enable SCSS:

```bash
npm install -D sass
```

Then use `.module.css` or `.module.scss` for scoped class names:

```jsx
import styles from './product.module.scss'

export default function Product({ name }) {
  return <div class={styles.wrapper}>{name}</div>
}
```

### Dynamic Templates

JSX templates can be imported and called directly in client-side scripts. This lets you re-render components dynamically using the same templates that generated the initial HTML:

```javascript
// components/UserList/userlist.js
import { UserList } from './index' // Import the JSX template

export default async function userlist(node, { on, state }) {
  const users = state(JSON.parse(node.dataset.users || '[]'), (items) => {
    // Call the template function to generate new HTML
    node.innerHTML = UserList({ items })
  })

  on('click', '[data-load]', async () => {
    const response = await fetch('/api/users')
    const data = await response.json()
    users.set(data)
  })
}
```

Since JSX compiles to plain string-returning functions, they work seamlessly as templates in both server-side rendering and client-side updates.

**Important:** Export the inner content as a separate function and use that for client-side re-renders. The default export includes the `data-component` wrapper — re-rendering with it would replace the stable root node and break event delegation via `on`. Use `node.innerHTML` with the inner function only.

### State Management

Simple state utility for reactive updates. Inside components, use `state` from the lifecycle context (auto-destroyed on unmount). Outside components, import it directly:

```javascript
import state from '@white/utils/state'

const count = state(0, (newValue) => {
  element.textContent = newValue
})

// set — replace the entire value
count.set(5)
count.set((prev) => prev + 1)

// assign — partial update for objects, supports function updaters per property
const user = state({ name: 'Alice', score: 0 })
user.assign({ score: (prev) => prev + 1 }) // name stays, score increments
user.assign({ name: 'Bob' }) // score stays, name replaced

// Subscribe to changes
const unsubscribe = count.subscribe((newVal, oldVal) => {
  console.log('Changed:', oldVal, '→', newVal)
})
```

### Data Configuration

All page data is configured in `data.config.js`. It exports two things: `globalData` and `routes`. Both `globalData()` and route `data()` functions are async, so you can fetch from databases, APIs, or the file system.

**`globalData()`** runs before each page render. Its return value is available to every component via `getGlobalData()` and passed to every route's `data()` function:

```javascript
// data.config.js
export const globalData = async ({ locale }) => {
  return {
    site: { name: 'My Site' },
    products: await fetchProducts(locale),
  }
}
```

**`routes`** maps URL paths to data loaders. The `data()` function receives `{ locale, globalData, draft }` and its return value is passed as props to the page component:

```javascript
export const routes = {
  '/': {
    data: async ({ locale, globalData }) => ({
      title: globalData.site.name,
      path: '',
    }),
  },
  '/about': {
    data: async ({ locale }) => ({
      title: 'About',
      path: '/about',
    }),
  },
}
```

**Dynamic routes** use `[slug]` directories. For static builds, `slugs()` returns all valid slugs. For ISR, `slugs()` is optional — pages render on-demand and `data()` returning `null` triggers a 404:

```javascript
export const routes = {
  '/posts/[slug]': {
    slugs: (globalData) => globalData.posts.map((p) => p.slug),
    data: async ({ slug, locale, globalData }) => {
      const post = globalData.posts.find((p) => p.slug === slug)
      return {
        title: post.title,
        post,
        slug,
        path: `/posts/${slug}`,
      }
    },
  },
}
```

Locales are configured in `config.js`:

```javascript
export const LOCALES = ['en-US', 'sv-SE', 'de-DE']
```

The first locale is the default (no URL prefix). Other locales get prefixed automatically: `/sv-SE/about`, `/de-DE/about`. Internal `href` attributes are localized automatically during rendering — no `Link` component needed.

### API Routes

Create serverless API endpoints by adding files to the `api/` directory:

```javascript
// api/hello.js
export const GET = async (req) => {
  return new Response(JSON.stringify({ message: 'Hello' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST = async (req) => {
  const body = await req.json()
  return new Response(JSON.stringify({ received: body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

File names map to routes: `api/hello.js` → `/api/hello`. Use named exports (`GET`, `POST`, etc.) for method-specific handlers.

**Development:** Run `npm run dev:api` to start both Vite and the API server. Vite proxies `/api` requests to the Express-based API server automatically.

**Production:** On Vercel, each file in `api/` is deployed as a serverless function — no extra configuration needed.

## Draft Mode

Preview unpublished CMS content without affecting the live site. Works in both static and ISR modes.

**Setup:** Set `DRAFT_SECRET` as a Vercel environment variable.

**Enable:** CMS preview button opens the **Vercel URL** (not the production domain — draft mode is handled by Vercel, not CloudFront):

```
https://yoursite.vercel.app/api/draft?secret=YOUR_DRAFT_SECRET&slug=/about
```

This sets a cookie and redirects to the page. The page is rendered dynamically with `draft: true` passed to all `data()` functions — use this to fetch draft content from your CMS.

**Disable:** Visit `/api/draft-disable` or close the browser (cookie is session-based, 1hr expiry).

Draft responses include `X-Robots-Tag: noindex` to prevent search engines from indexing unpublished content.

## Deployment

### Static (default)

White works on any static hosting platform:

- **Vercel** (recommended)
- **Netlify**
- **GitHub Pages**
- **Cloudflare Pages**

```bash
npm run build  # Generates ./dist
```

### ISR (on-demand static generation)

For large-scale sites (thousands of products, hundreds of locales), enable ISR to build pages on-demand and cache them globally via AWS CloudFront. Pages are rendered by Lambda@Edge on first visit and cached — subsequent visitors get the page instantly from the edge. Content updates invalidate specific pages via webhook.

See [ISR.md](ISR.md) for full setup.

```js
// src/config.js
export const ISR = true
```
