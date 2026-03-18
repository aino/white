# White

Static site generator with **Persistent Component Architecture** - where components can optionally maintain their state across page transitions without any virtual DOM or state management library.

## Displaimer

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
import state from 'src/js/utils/state'

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

**Styles** are automatically bundled from all `.css` files in `pages/` and `components/`:

```css
/* pages/about/about.css - automatically included in build */
.about-page {
  background: #f0f0f0;
}

/* components/Counter/counter.css - automatically included */
.counter {
  border: 1px solid #ccc;
}
```

Import all styles with the virtual module:

```javascript
// js/white.js
import 'white/css' // Imports ALL .css files automatically
```

**Note:** White uses plain CSS only - no SCSS, Less, or CSS modules. Use class-based scoping for component isolation.

### 📊 State Management

Simple state utility for reactive updates:

```javascript
import state from 'src/js/utils/state'

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

### 🌐 Dynamic Routes

Create dynamic pages with `[slug]` directories:

```javascript
// data.config.js
export const pages = {
  '/work/[slug]': {
    slugs: async () => ['project-a', 'project-b'],
    data: async ({ slug }) => ({
      project: await fetch(`/api/projects/${slug}`),
    }),
  },
}
```

### 🎯 Data Configuration

Configs like locales is in `config.js`

```javascript
export const LOCALES = ['en', 'sv']
```

Configure page data in `data.config.js`:

```javascript
export const locales = ['en', 'sv']

export const global = ({ lang }) => ({
  siteName: 'My Site',
})

export const pages = {
  '/': {
    data: async ({ lang }) => ({
      title: lang === 'en' ? 'Home' : 'Hem',
    }),
  },
  '/about': {
    data: () => ({ title: 'About Us' }),
  },
}
```

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
export default async function cart(node) {
  const items = JSON.parse(node.dataset.items || '[]')

  const onClick = (e) => {
    if (e.target.dataset.remove) {
      // Remove item logic
      updateCart(items.filter((item) => item.id !== e.target.dataset.remove))
    }
    if (e.target.dataset.checkout) {
      // Checkout logic
    }
  }

  node.addEventListener('click', onClick)

  return () => {
    node.removeEventListener('click', onClick)
  }
}
```

The cart maintains its state as users navigate between pages - just like a real SPA, but with multi-page app benefits!

## Deployment

White works on any static hosting platform:

- **Vercel** (recommended)
- **Netlify**
- **GitHub Pages**
- **Cloudflare Pages**

```bash
npm run build  # Generates ./dist
```
