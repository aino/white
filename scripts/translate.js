import { createServer, loadEnv } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { createHash } from 'crypto'

// Load .env files into process.env
const env = loadEnv('development', process.cwd(), '')
Object.assign(process.env, env)
import { setTranslationContext, clearTranslationContext } from '../@white/ai/translate.js'
import { LOCALES, TRANSLATE } from '../src/config.js'
import { globalData, routes } from '../src/data.config.js'

const ROOT = resolve(import.meta.dirname, '..')
const TRANSLATIONS_DIR = resolve(ROOT, '.white/translations')
const SOURCE_LOCALE = LOCALES[0]
const TARGET_LOCALES = LOCALES.filter((l) => l !== SOURCE_LOCALE)

function hash(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 8)
}

function loadTranslationFile(locale) {
  const filePath = resolve(TRANSLATIONS_DIR, `${locale}.json`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function saveTranslationFile(locale, translations) {
  mkdirSync(TRANSLATIONS_DIR, { recursive: true })
  const filePath = resolve(TRANSLATIONS_DIR, `${locale}.json`)
  writeFileSync(filePath, JSON.stringify(translations, null, 2) + '\n')
}

// Resolve all URLs from routes config (including dynamic slugs)
async function resolveAllUrls() {
  const globals = globalData ? await globalData() : {}
  const urls = []

  for (const [routeKey, page] of Object.entries(routes)) {
    if (routeKey.includes('[slug]') && page.slugs) {
      const slugs = await page.slugs(globals)
      for (const slug of slugs) {
        urls.push(routeKey.replace('[slug]', slug))
      }
    } else {
      urls.push(routeKey)
    }
  }

  return urls
}

function findTemplatePath(routeKey) {
  const relative = routeKey === '/' ? 'index.jsx' : `${routeKey.slice(1)}/index.jsx`
  const full = resolve(ROOT, 'src/pages', relative)
  return existsSync(full) ? full : null
}

// Scan source files for t('...') calls
async function discoverTCalls() {
  const { globSync } = await import('glob')
  const files = globSync(['src/**/*.{jsx,js}', '@white/**/*.js'], { cwd: ROOT, ignore: ['node_modules/**'] })
  const strings = new Set()
  const re = /\bt\(\s*(['"`])((?:(?!\1).)*)\1\s*\)/g
  for (const file of files) {
    try {
      const code = readFileSync(resolve(ROOT, file), 'utf8')
      let match
      while ((match = re.exec(code)) !== null) {
        strings.add(match[2])
      }
    } catch {}
  }
  return strings
}

// Phase 1: Discover all translatable strings by rendering every page + scanning t() calls
async function discoverStrings() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: {
      jsx: 'transform',
      jsxFactory: 'h',
      jsxFragment: 'Fragment',
      jsxInject: `import { h, Fragment } from 'lib/jsx-runtime'\nimport { t } from '@white/translate'`,
    },
  })

  const allStrings = new Set()
  const pageContexts = [] // { url, html, strings } for AI context
  const urls = await resolveAllUrls()

  for (const url of urls) {
    // Find the template for this route
    const routeKey = Object.keys(routes).find((key) => {
      if (key.includes('[slug]')) {
        const pattern = key.replace('[slug]', '[^/]+')
        return new RegExp(`^${pattern}$`).test(url.replace(/^\//, ''))
      }
      return key === url
    })
    if (!routeKey) continue

    const jsxPath = findTemplatePath(routeKey)
    if (!jsxPath) continue

    // Get page data
    const globals = globalData ? await globalData() : {}
    const page = routes[routeKey]
    let data = { ...globals, locale: SOURCE_LOCALE }
    if (page.data) {
      const slug = routeKey.includes('[slug]')
        ? url.replace(/^\//, '').split('/').pop()
        : null
      Object.assign(data, await page.data({ slug, locale: SOURCE_LOCALE, globalData: globals }))
    }

    // Set context with empty translations so all translate strings get collected
    setTranslationContext('__collect__', SOURCE_LOCALE, {})

    let html = ''
    try {
      const mod = await vite.ssrLoadModule(jsxPath)
      if (mod.default) {
        html = mod.default(data) || ''
      }
    } catch (err) {
      console.warn(`  Warning: could not render ${url}: ${err.message}`)
    }

    const untranslated = clearTranslationContext()
    if (untranslated.size > 0) {
      pageContexts.push({ url, html, strings: [...untranslated] })
    }
    for (const s of untranslated) allStrings.add(s)
  }

  await vite.close()

  // Also scan for t('...') calls in source files
  const tCallStrings = await discoverTCalls()
  for (const s of tCallStrings) allStrings.add(s)

  return { strings: allStrings, pageContexts }
}

// Phase 2: For each target locale, diff and translate missing strings
async function translateLocale(locale, strings, existing, pageContexts) {
  const updated = { ...existing }
  const toTranslate = []
  const warnings = []

  for (const source of strings) {
    const h = hash(source)
    const entry = existing[source]

    if (entry) {
      if (entry.status === 'approved') {
        // Check if source changed
        if (entry.sourceHash && entry.sourceHash !== h) {
          warnings.push(`Source changed for approved translation: "${source.slice(0, 50)}..."`)
        }
        continue
      }
      // Auto entry — re-translate if source changed or needs translation
      if (entry.sourceHash === h && !entry.needsTranslation) continue
    }

    toTranslate.push(source)
  }

  if (warnings.length > 0) {
    console.log(`\n  Warnings for ${locale}:`)
    for (const w of warnings) console.log(`    ${w}`)
  }

  if (toTranslate.length === 0) {
    console.log(`  ${locale}: all strings translated (${strings.size} total)`)
    return updated
  }

  console.log(`  ${locale}: ${toTranslate.length} strings need translation`)

  // Call AI with full page HTML as context
  const relevantPages = pageContexts?.filter((p) =>
    p.strings.some((s) => toTranslate.includes(s))
  )
  const translations = await callAI(locale, toTranslate, relevantPages)

  if (translations) {
    for (const source of toTranslate) {
      const value = translations[source]
      if (value) {
        updated[source] = {
          value,
          status: 'auto',
          sourceHash: hash(source),
        }
      }
    }
  } else {
    // No API key or API error — mark strings as needing translation
    for (const source of toTranslate) {
      if (!updated[source]) {
        updated[source] = {
          value: source,
          status: 'auto',
          sourceHash: hash(source),
          needsTranslation: true,
        }
      }
    }
  }

  return updated
}

async function callAI(locale, strings, pageContexts) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log(`    No ANTHROPIC_API_KEY — skipping AI translation`)
    return null
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const model = TRANSLATE?.model || 'claude-haiku-4-5-20251001'
  const style = TRANSLATE?.style
  const keep = TRANSLATE?.keep

  const numbered = strings.map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join('\n')

  // Parse BCP 47 locale: language-REGION
  const [lang, region] = locale.split('-')
  const localeDesc = region ? `${locale} (language: ${lang}, region: ${region})` : locale

  let rules = `- The target locale is ${localeDesc}. The language subtag "${lang}" determines the translation language.
- If the source and target language are the same (e.g. en-US → en-GB), adapt spelling, vocabulary, and conventions for the target region, or return the string unchanged if no adaptation is needed.
- Preserve ALL HTML tags and attributes exactly as-is (only translate text content)
- Return ONLY a JSON object mapping each English string to its translation
- Use the exact English strings as keys (including any HTML)`

  if (keep?.length) {
    rules += `\n- NEVER translate these words, keep them exactly as-is: ${keep.join(', ')}`
  }

  // Build page context — pick fewest pages that cover all strings to translate
  let context = ''
  if (pageContexts?.length > 0) {
    const toTranslateSet = new Set(strings)
    const uncovered = new Set(strings)
    const selected = []

    while (uncovered.size > 0) {
      // Pick page that covers the most uncovered strings
      let best = null
      let bestCount = 0
      for (const page of pageContexts) {
        const count = page.strings.filter((s) => uncovered.has(s)).length
        if (count > bestCount) {
          best = page
          bestCount = count
        }
      }
      if (!best || bestCount === 0) break
      selected.push(best)
      for (const s of best.strings) uncovered.delete(s)
    }

    const pages = selected
      .map((p) => `<!-- Page: ${p.url} -->\n${p.html}`)
      .join('\n\n')
    context = `\nHere is the HTML of representative pages where these strings appear. Use this to understand the context, tone, and placement of each string:\n\n${pages}\n`
  }

  let systemPrompt = 'You are a professional website translator.'
  if (style) {
    systemPrompt = style
  }

  let response
  try {
    response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Translate the following UI text from English to ${locale}.
${context}
Rules:
${rules}

Strings to translate:
${numbered}

Respond with only the JSON object, no markdown code fences.`,
        },
      ],
    })
  } catch (err) {
    console.error(`    API error: ${err.message}`)
    return null
  }

  try {
    let text = response.content[0].text.trim()
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    return JSON.parse(text)
  } catch (err) {
    console.error(`    Failed to parse AI response: ${err.message}`)
    console.error(`    Raw response: ${response.content[0].text.slice(0, 200)}`)
    return null
  }
}

// Phase 3: Write combined translations for ISR/API runtime
function writeCombinedTranslations(allTranslations) {
  const distDir = resolve(ROOT, 'dist/templates')
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true })
  }
  writeFileSync(
    resolve(distDir, 'translations.json'),
    JSON.stringify(allTranslations, null, 2)
  )
}

// Main
async function main() {
  if (TARGET_LOCALES.length === 0) {
    console.log('No target locales configured. Add locales to src/config.js LOCALES array.')
    console.log(`Current: LOCALES = ${JSON.stringify(LOCALES)}`)
    return
  }

  console.log(`Source locale: ${SOURCE_LOCALE}`)
  console.log(`Target locales: ${TARGET_LOCALES.join(', ')}`)
  console.log()

  // Discover strings and capture page HTML for context
  console.log('Discovering translatable strings...')
  const { strings, pageContexts } = await discoverStrings()
  console.log(`Found ${strings.size} translatable strings across ${pageContexts.length} pages\n`)

  if (strings.size === 0) {
    console.log('No strings with translate attribute found. Add translate to elements:')
    console.log('  <button translate>Contact us</button>')
    return
  }

  // Translate each locale with full page context
  const allTranslations = {}
  for (const locale of TARGET_LOCALES) {
    const existing = loadTranslationFile(locale)
    const updated = await translateLocale(locale, strings, existing, pageContexts)
    saveTranslationFile(locale, updated)
    allTranslations[locale] = updated
  }

  // Write combined file for ISR/API
  writeCombinedTranslations(allTranslations)

  console.log('\nDone. Translation files written to .white/translations/')
  console.log('Combined translations written to dist/templates/translations.json')
}

main().catch((err) => {
  console.error('Translation failed:', err)
  process.exit(1)
})
