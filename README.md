# White

Static site generator with **Persistent Component Architecture** - where components can optionally maintain their state across page transitions without any virtual DOM or state management library.

## Disclaimer

Don’t use this for production! It’s an Aino experiment in back-to-basics with modern DX.

## What's Unique

- **Physical DOM node transfer** between pages (with event listeners intact)
- **Zero virtual DOM overhead** - just 2KB of client JavaScript
- **Server-side JSX** for familiar component syntax
- **Opt-in persistence** via the `key` attribute
- **Automatic component lifecycle** management
- **Smart prefetching** on hover

## Why White?

- **Reactive frameworks** add unnecessary bloat for content-focused websites
- Most websites need **URLs, navigation, and lightweight HTML**, not global state management
- **Native JavaScript and DOM APIs** are efficient and often overlooked
- By **separating markup from scripts**, developers write cleaner, more focused code
- White gives you **React-like components** with **multi-page app benefits**

## Get Started

1. Clone the repository
2. Run `npm install` to install dependencies
3. Start development server with `npm run dev`
4. Build for production with `npm run build`

## Core Concepts

### 🎯 Persistent Component Architecture

Components with `key` attributes maintain their complete state across page navigations:

```jsx
// Page 1: User clicks counter to 5
<Counter key="main-counter" value={1} />

// Navigate to Page 2: Counter still shows 5!
<Counter key="main-counter" value={1} />
```

Without a key, components are fresh on each page:

```jsx
<Counter value={1} /> // Always resets to 1
```

### 🔧 Component Structure

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
    <div data-component="counter" data-value={value}>
      <span>{value}</span>
      <button>+</button>
    </div>
  )
}
```

```javascript
// components/Counter/counter.js
import state from '@white/utils/state'
import { q } from '@white/utils/dom'

export default async function counter(node) {
  const initialValue = parseInt(node.dataset.value)
  const [span, button] = q('span, button', node)

  const count = state(initialValue, (value) => {
    span.textContent = value
  })

  const onClick = () => count.set((c) => c + 1)
  button.addEventListener('click', onClick)

  return () => {
    // Cleanup when component unmounts
    count.destroy()
    button.removeEventListener('click', onClick)
  }
}
```

### 🧹 Cleanup Functions

Both component scripts and page scripts return a **destroy function**. White calls this automatically when the component is removed from the DOM or when the user navigates away from a page:

```javascript
export default async function myComponent(node) {
  // Setup: runs when component mounts
  const interval = setInterval(tick, 1000)
  node.addEventListener('click', onClick)

  // Return a cleanup function
  return () => {
    // Teardown: runs when component unmounts or page changes
    clearInterval(interval)
    node.removeEventListener('click', onClick)
  }
}
```

This prevents memory leaks and stale event listeners. Every `addEventListener` should have a matching `removeEventListener` in the cleanup. Every `state()` should call `.destroy()`. Every timer should be cleared.

**Persistent components** (those with a `key` attribute) are only cleaned up when they no longer appear in the next page's DOM. If the component exists on both pages, it is physically transferred and the destroy function is *not* called.

### 📁 File Structure

```
├── pages/
│   ├── index.jsx           # Home page
│   ├── about/
│   │   ├── index.jsx       # About page
│   │   ├── about.js        # Page scripts (auto-loaded)
│       └── about.css       # Page styles (auto-bundled)
│   └── work/
│       ├── index.jsx       # Work index
│       └── [slug]/
│           └── index.jsx   # Dynamic work pages
├── components/
│   ├── Layout/
│   │   ├── index.jsx
│   │   ├── layout.js       # Component behavior (auto-loaded)
│   │   └── layout.css      # Component styles (auto-bundled)
│   └── Counter/
│       ├── index.jsx
│       ├── counter.js      # Component behavior (auto-loaded)
│       └── counter.css     # Component styles (auto-bundled)
└── js/
    ├── main.js             # Global initialization
```

### 🎨 Layouts

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

### 🔀 Page Scripts & Styles

**Scripts** are automatically discovered and loaded from both `pages/` and `components/` directories. No manual imports needed!

```javascript
// pages/about/about.js (auto-loaded for /about route)
export const path = /^\/about/ // Matches /about pages

export default function about(app) {
  console.log('About page loaded')

  return () => {
    // Cleanup when leaving page
  }
}
```

**Styles** are automatically discovered and bundled from all `.css` files in `pages/` and `components/`. Just create a `.css` file next to your component or page and it will be included in the build.

**Note:** White uses plain CSS only - no SCSS, Less, or CSS modules. Use class-based scoping for component isolation.

### 📐 Dynamic Templates

JSX templates can be imported and called directly in client-side scripts. This lets you re-render components dynamically using the same templates that generated the initial HTML:

```javascript
// components/UserList/userlist.js
import state from '@white/utils/state'
import { UserList } from './index' // Import the JSX template

export default async function userlist(node) {
  const users = state(
    JSON.parse(node.dataset.users || '[]'),
    (items) => {
      // Call the template function to generate new HTML
      node.innerHTML = UserList({ items })
    }
  )

  const onClick = async (e) => {
    if (e.target.dataset.load) {
      const response = await fetch('/api/users')
      const data = await response.json()
      users.set(data)
    }
  }

  node.addEventListener('click', onClick)
  return () => {
    users.destroy()
    node.removeEventListener('click', onClick)
  }
}
```

Since JSX compiles to plain string-returning functions, they work seamlessly as templates in both server-side rendering and client-side updates.

### 📊 State Management

Simple state utility for reactive updates:

```javascript
import state from '@white/utils/state'

const count = state(0, (newValue) => {
  element.textContent = newValue
})

// Update state
count.set(5)
count.set((prev) => prev + 1)

// Subscribe to changes
const unsubscribe = count.subscribe((newVal, oldVal) => {
  console.log('Changed:', oldVal, '→', newVal)
})
```

### 🎯 Data Configuration

All page data is configured in `data.config.js`. It exports two things: `globalData` and `routes`.

**`globalData()`** is an async function that runs once at build time. Its return value is passed to every route's `data()` and `slugs()` functions:

```javascript
// data.config.js
export const globalData = async () => {
  // Fetch from a database, API, file system, etc.
  return {
    site: { name: 'My Site' },
    posts: [
      { slug: 'hello-world', title: 'Hello World' },
      { slug: 'getting-started', title: 'Getting Started' },
    ],
  }
}
```

**`routes`** maps URL paths to data loaders. The `data()` function receives `{ locale, globalData }` and its return value is passed as props to the page component:

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

**Dynamic routes** use `[slug]` directories. They require a `slugs()` function that returns all valid slugs, and a `data()` function that also receives `slug`:

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

At build time, White generates a static HTML page for each slug. Locales are configured in `config.js`:

```javascript
export const LOCALES = ['en']
```

### 🔌 API Routes

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

## Key Benefits

### 🚀 Performance

- **2KB JavaScript bundle** (vs 50-200KB+ for React/Vue)
- **No virtual DOM diffing** overhead
- **Smart prefetching** for instant navigation
- **Automatic code splitting** by page

### 🧠 Developer Experience

- **JSX components** with familiar syntax
- **Hot reload** in development
- **Built-in image optimization**

### 🎯 Architecture

- **Multi-page app benefits** (SEO, performance, simplicity)
- **SPA-like navigation** with state persistence
- **Component isolation** with automatic cleanup
- **Progressive enhancement** - works without JavaScript

## Example: Persistent Shopping Cart

```jsx
// components/Cart/index.jsx
export default function Cart({ items = [] }) {
  return (
    <div
      data-component="cart"
      key="shopping-cart"
      data-items={JSON.stringify(items)}
    >
      <h3>Cart ({items.length})</h3>
      {items.map((item) => (
        <div key={item.id}>
          {item.name} - ${item.price}
          <button data-remove={item.id}>Remove</button>
        </div>
      ))}
      <button data-checkout>Checkout</button>
    </div>
  )
}
```

```javascript
// components/Cart/cart.js
import state from '@white/utils/state'
import { q } from '@white/utils/dom'
import { Cart } from './index' // Import the JSX template for re-rendering

export default async function cart(node) {
  const cartState = state(
    JSON.parse(node.dataset.items || '[]'),
    (items) => {
      // Re-render the component using the JSX template
      node.innerHTML = Cart({ items })
    }
  )

  const onClick = (e) => {
    if (e.target.dataset.remove) {
      cartState.set((items) =>
        items.filter((item) => item.id !== e.target.dataset.remove)
      )
    }
  }

  node.addEventListener('click', onClick)

  return () => {
    cartState.destroy()
    node.removeEventListener('click', onClick)
  }
}
```

The cart maintains its state as users navigate between pages.

## Deployment

White works on any static hosting platform:

- **Vercel** (recommended)
- **Netlify**
- **GitHub Pages**
- **Cloudflare Pages**

```bash
npm run build  # Generates ./dist
```
