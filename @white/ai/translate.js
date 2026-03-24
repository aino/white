import { createHash } from 'crypto'

export function setTranslationContext(locale, sourceLocale, translations) {
  globalThis.__whiteTranslation = {
    locale,
    sourceLocale,
    translations: translations || {},
    _untranslated: [],
    _componentStack: [],
    _currentComponent: null,
  }
}

export function clearTranslationContext() {
  const ctx = globalThis.__whiteTranslation
  globalThis.__whiteTranslation = null
  return ctx?._untranslated || []
}

export function sourceHash(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 8)
}

export function translationId(component, tag, source, key) {
  const input = key
    ? `${component}::${key}`
    : `${component}::${tag}::${source}`
  return createHash('sha1').update(input).digest('hex').slice(0, 8)
}
