import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getPageContext } from './getPageContext.js'
import templates from '../dist/templates/registry.js'
import { globalData, routes } from '../src/data.config.js'
import { LOCALES, TRANSLATE } from '../src/config.js'
import {
  setTranslationContext,
  clearTranslationContext,
  translationId,
  sourceHash,
  translateStrings,
} from '../@white/ai/translate.js'

const s3 = new S3Client({ region: 'us-east-1' })
const BUCKET = '__BUCKET_NAME__'
const SOURCE_LOCALE = LOCALES[0]

// In-memory translation cache (survives across warm invocations)
const translationCache = {}

async function loadTranslations(locale) {
  if (locale === SOURCE_LOCALE) return {}
  if (translationCache[locale]) return translationCache[locale]

  try {
    const res = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: `_translations/${locale}.json`,
    }))
    const data = JSON.parse(await res.Body.transformToString())
    // Index: { component: { source: entry } }
    const indexed = {}
    for (const [component, entries] of Object.entries(data)) {
      indexed[component] = {}
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (entry.source) indexed[component][entry.source] = entry
        }
      }
    }
    translationCache[locale] = indexed
    return indexed
  } catch {
    translationCache[locale] = {}
    return {}
  }
}

async function saveTranslations(locale, translations) {
  // Convert indexed format to array format for storage
  const output = {}
  for (const [component, entries] of Object.entries(translations)) {
    output[component] = Object.entries(entries).map(([source, entry]) => ({
      source,
      ...entry,
    }))
  }

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `_translations/${locale}.json`,
      Body: JSON.stringify(output, null, 2),
      ContentType: 'application/json',
    }))
  } catch (err) {
    console.error('Failed to save translations to S3:', err)
  }
}

export async function handler(url) {
  const context = await getPageContext(url, {
    routes,
    globalData,
    locales: LOCALES,
  })

  if (!context) return null

  const Template = templates[context.key]
  if (!Template) return null

  const locale = context.data.locale || SOURCE_LOCALE
  const translations = await loadTranslations(locale)

  // First render
  setTranslationContext(locale, SOURCE_LOCALE, translations)
  let html = '<!DOCTYPE html>' + Template(context.data)
  const untranslated = clearTranslationContext()

  // Auto-translate missing strings
  if (untranslated.length > 0 && locale !== SOURCE_LOCALE) {
    const sources = [...new Set(untranslated.map((e) => e.source))]
    const aiResult = await translateStrings(locale, sources, TRANSLATE)

    if (aiResult) {
      // Merge into cache
      for (const entry of untranslated) {
        const { source, component, tag, key } = entry
        if (!aiResult[source]) continue
        if (!translations[component]) translations[component] = {}
        translations[component][source] = {
          id: translationId(component, tag, source, key),
          value: aiResult[source],
          status: 'auto',
          sourceHash: sourceHash(source),
        }
      }
      translationCache[locale] = translations

      // Re-render with translations
      setTranslationContext(locale, SOURCE_LOCALE, translations)
      html = '<!DOCTYPE html>' + Template(context.data)
      clearTranslationContext()

      // Save to S3 (non-blocking)
      saveTranslations(locale, translations)
    }
  }

  return html
}
