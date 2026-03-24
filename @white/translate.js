// Index component-grouped translations for fast lookup
// Input:  { "Footer": [...entries], "Counter": [...entries] }
// Output: { "Footer": { "source": entry }, "Counter": { "source": entry } }
export function indexTranslations(data) {
  if (!data || typeof data !== 'object') return {}
  const indexed = {}
  for (const [component, entries] of Object.entries(data)) {
    indexed[component] = {}
    const arr = Array.isArray(entries) ? entries : []
    for (const entry of arr) {
      if (entry.source) indexed[component][entry.source] = entry
    }
  }
  return indexed
}

export function t(s) {
  const ctx = globalThis.__whiteTranslation
  if (!ctx || ctx.locale === ctx.sourceLocale) return s

  const component = ctx._componentStack?.at(-1) || ctx._currentComponent || '_global'

  // Component-scoped lookup
  const entry = ctx.translations[component]?.[s]
  if (entry?.value) return entry.value

  // Fallback: scan all components
  for (const entries of Object.values(ctx.translations)) {
    if (entries[s]?.value) return entries[s].value
  }

  return s
}

export function translateDOM(container) {
  for (const el of container.querySelectorAll('[translate]')) {
    el.innerText = t(el.innerText)
    el.removeAttribute('translate')
  }
}
