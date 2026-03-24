import { createHash } from 'crypto'

export function setTranslationContext(locale, sourceLocale, translations) {
  globalThis.__whiteTranslation = {
    locale,
    sourceLocale,
    translations: translations || {},
    _untranslated: new Set(),
  }
}

export function clearTranslationContext() {
  const ctx = globalThis.__whiteTranslation
  globalThis.__whiteTranslation = null
  return ctx?._untranslated || new Set()
}

export function translate(sourceText) {
  const ctx = globalThis.__whiteTranslation
  if (!ctx || ctx.locale === ctx.sourceLocale) return sourceText

  const entry = ctx.translations[sourceText]
  if (entry?.value) return entry.value

  ctx._untranslated.add(sourceText)
  return sourceText
}

export function sourceHash(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 8)
}
