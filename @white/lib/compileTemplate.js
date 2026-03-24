import { minify } from 'html-minifier-terser'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { createHash } from 'crypto'
import { loadEnv } from 'vite'
import { setTranslationContext, clearTranslationContext } from '../ai/translate.js'

// Load .env into process.env (Vite doesn't do this for server-side code)
Object.assign(process.env, loadEnv('development', resolve(import.meta.dirname, '../..'), ''))

function loadTranslations(locale, sourceLocale) {
  if (locale === sourceLocale) return {}
  try {
    const filePath = resolve(process.cwd(), `.white/translations/${locale}.json`)
    const data = JSON.parse(readFileSync(filePath, 'utf8'))
    // Index component-grouped format: { Component: { source: entry } }
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

function saveTranslations(locale, translations) {
  const dir = resolve(process.cwd(), '.white/translations')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `${locale}.json`), JSON.stringify(translations, null, 2) + '\n')
}

function hash(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 8)
}

// Auto-translate missing strings via AI (dev mode)
// untranslated is now an array of { source, component, tag, key }
async function autoTranslate(locale, untranslated, translations) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || untranslated.length === 0) return null

  let TRANSLATE
  try {
    TRANSLATE = (await import('../../src/config.js')).TRANSLATE
  } catch {}

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const sources = [...new Set(untranslated.map((e) => e.source))]
  const numbered = sources.map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join('\n')

  let rules = `- Preserve ALL HTML tags exactly as-is (only translate text content between tags)
- Return ONLY a JSON object mapping each English string to its ${locale} translation
- Use the exact English strings as keys (including any HTML)`

  if (TRANSLATE?.keep?.length) {
    rules += `\n- NEVER translate these words, keep them exactly as-is: ${TRANSLATE.keep.join(', ')}`
  }
  if (TRANSLATE?.style) {
    rules += `\n- Brand voice: ${TRANSLATE.style}`
  }

  const model = TRANSLATE?.model || 'claude-haiku-4-5-20251001'
  let response
  try {
    response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Translate the following UI text from English to ${locale}.\n\nRules:\n${rules}\n\nStrings to translate:\n${numbered}\n\nRespond with only the JSON object, no markdown code fences.`,
      }],
    })
  } catch (err) {
    console.warn(`  Auto-translate API error: ${err.message}`)
    return null
  }

  let text = response.content[0].text.trim()
  text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const result = JSON.parse(text)

  // Merge into component-grouped translations
  const updated = JSON.parse(JSON.stringify(translations))
  for (const entry of untranslated) {
    const { source, component } = entry
    if (!result[source]) continue
    if (!updated[component]) updated[component] = {}
    updated[component][source] = { value: result[source], status: 'auto', sourceHash: hash(source) }
  }
  saveTranslations(locale, updated)
  console.log(`  Auto-translated ${sources.length} strings → ${locale}`)
  return updated
}

export default async function compileTemplate(templatePath, data, viteServer, { locales, dev } = {}) {
  const jsxPath = templatePath.replace('.html', '.jsx')

  try {
    const module = await viteServer.ssrLoadModule(jsxPath)
    const Component = module.default

    if (!Component) {
      throw new Error(`No default export in ${jsxPath}`)
    }

    const locale = data.locale || (locales && locales[0]) || 'en'
    const sourceLocale = (locales && locales[0]) || 'en'
    let translations = loadTranslations(locale, sourceLocale)

    setTranslationContext(locale, sourceLocale, translations)
    let html = '<!DOCTYPE html>' + Component(data)
    const untranslated = clearTranslationContext()

    // In dev mode, auto-translate missing strings and re-render
    if (dev && untranslated.length > 0 && locale !== sourceLocale) {
      try {
        const updated = await autoTranslate(locale, untranslated, translations)
        if (updated) {
          translations = updated
          setTranslationContext(locale, sourceLocale, translations)
          html = '<!DOCTYPE html>' + Component(data)
          clearTranslationContext()
        }
      } catch (err) {
        console.warn(`  Auto-translate failed: ${err.message}`)
      }
    }

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
