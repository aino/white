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
    return JSON.parse(readFileSync(filePath, 'utf8'))
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
async function autoTranslate(locale, untranslated, translations) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || untranslated.size === 0) return null

  let TRANSLATE
  try {
    TRANSLATE = (await import('../../src/config.js')).TRANSLATE
  } catch {}

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const localeName = locale
  const strings = [...untranslated]
  const numbered = strings.map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join('\n')

  let rules = `- Preserve ALL HTML tags exactly as-is (only translate text content between tags)
- Return ONLY a JSON object mapping each English string to its ${localeName} translation
- Use the exact English strings as keys (including any HTML)`

  if (TRANSLATE?.keep?.length) {
    rules += `\n- NEVER translate these words, keep them exactly as-is: ${TRANSLATE.keep.join(', ')}`
  }
  if (TRANSLATE?.style) {
    rules += `\n- Brand voice: ${TRANSLATE.style}`
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Translate the following UI text from English to ${localeName}.\n\nRules:\n${rules}\n\nStrings to translate:\n${numbered}\n\nRespond with only the JSON object, no markdown code fences.`,
    }],
  })

  let text = response.content[0].text.trim()
  text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const result = JSON.parse(text)

  // Merge into translations and save
  const updated = { ...translations }
  for (const source of strings) {
    if (result[source]) {
      updated[source] = { value: result[source], status: 'auto', sourceHash: hash(source) }
    }
  }
  saveTranslations(locale, updated)
  console.log(`  Auto-translated ${strings.length} strings → ${locale}`)
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
    if (dev && untranslated.size > 0 && locale !== sourceLocale) {
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
