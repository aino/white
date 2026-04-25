# @white/utils

Client-side utilities. Import from `@white/utils/<name>`.

## State & Reactivity
- `state` — Reactive value with subscriptions. Use when multiple UI parts react to the same value.
- `context` — Scoped events and state for a component. Use for interactive widgets that need cleanup.

## DOM
- `dom` — Query helpers: `q()` for querySelectorAll as array, `id()`, `create()`, `observe()` for IntersectionObserver, `update()` for diff-patching HTML.
- `detect` — Device detection: `mobile()`, `tablet()`, `desktop()`, `touch()`, `safari()`, `darkmode()`.

## Animation
- `animate` — Frame-based animation with easing. Use for JS animations not possible with CSS.
- `scroll` — Smooth scroll to position/element. Use for anchor links, back-to-top.
- `easing` — Easing functions: `linear`, `inQuad`, `outQuad`, `inOutQuad`, etc.

## Async
- `wait` — Promise delay. Use in async functions to pause.
- `debounce` — Debounce function calls. Use for search inputs, resize/scroll handlers.

## Data
- `object` — `clone()`, `equals()`, `isObject()`.
- `array` — `shuffle()`, `insertEvery()`.
- `string` — `addTrailingSlash()`, `removeTrailingSlash()`, `capitalize()`, `stripHtml()`.
- `compress` — LZString compression. Use for sharing complex state via URL.

## Forms
- `form` — `getFormFieldValues()`, `setFormFieldValues()` for nested form data.
- `handleFetchResponse` — Fetch error handling with structured errors.

## Images
- `image` — Responsive image URLs for Vercel/sharp optimization.
- `loadImage` — Promise-based image preloading.
- `preload` — Generate `<link rel="preload">` tags for critical assets.

## Internal
- `globalData` — Server-side data store. Used by renderer, not for direct use.
