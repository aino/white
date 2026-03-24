import { getPageContext } from './getPageContext.js'
import templates from '../dist/templates/registry.js'
import translations from '../dist/templates/translations.json'
import { globalData, routes } from '../src/data.config.js'
import { LOCALES } from '../src/config.js'
import { setTranslationContext, clearTranslationContext } from '../@white/ai/translate.js'

const SOURCE_LOCALE = LOCALES[0]

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
  setTranslationContext(locale, SOURCE_LOCALE, translations[locale] || {})
  const html = '<!DOCTYPE html>' + Template(context.data)
  clearTranslationContext()

  return html
}
