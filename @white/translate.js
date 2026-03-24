// Index an array of translation entries into a lookup object
export function indexTranslations(arr) {
  if (!Array.isArray(arr)) return arr || {}
  const index = {}
  for (const entry of arr) {
    if (entry.source) index[entry.source] = entry
  }
  return index
}

export function t(s) {
  const ctx = globalThis.__whiteTranslation
  if (!ctx || ctx.locale === ctx.sourceLocale) return s
  const entry = ctx.translations[s]
  if (entry?.value) return entry.value
  if (ctx._untranslated) ctx._untranslated.add(s)
  return s
}

export function translateDOM(container) {
  for (const el of container.querySelectorAll('[translate]')) {
    el.innerText = t(el.innerText)
    el.removeAttribute('translate')
  }
}
