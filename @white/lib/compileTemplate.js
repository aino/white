import { minify } from 'html-minifier-terser'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { setTranslationContext, clearTranslationContext } from '../ai/translate.js'

function loadTranslations(locale, sourceLocale) {
  if (locale === sourceLocale) return {}
  try {
    const filePath = resolve(process.cwd(), `.white/translations/${locale}.json`)
    const data = JSON.parse(readFileSync(filePath, 'utf8'))
    const indexed = {}
    for (const [component, entries] of Object.entries(data)) {
      indexed[component] = {}
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (entry.source) indexed[component][entry.source] = entry
        }
      }
    }
    return indexed
  } catch {
    return {}
  }
}

export default async function compileTemplate(templatePath, data, viteServer, { locales } = {}) {
  const jsxPath = templatePath.replace('.html', '.jsx')

  try {
    const module = await viteServer.ssrLoadModule(jsxPath)
    const Component = module.default

    if (!Component) {
      throw new Error(`No default export in ${jsxPath}`)
    }

    const locale = data.locale || (locales && locales[0]) || 'en'
    const sourceLocale = (locales && locales[0]) || 'en'
    const translations = loadTranslations(locale, sourceLocale)

    setTranslationContext(locale, sourceLocale, translations)
    const html = '<!DOCTYPE html>' + Component(data)
    clearTranslationContext()

    return await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      minifyCSS: true,
      minifyJS: true,
    })
  } catch (err) {
    clearTranslationContext()
    console.error(`Error rendering JSX ${jsxPath}:`, err)
    throw err
  }
}
