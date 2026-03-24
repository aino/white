import { createServer, loadEnv } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { createHash } from 'crypto'

// Load .env files into process.env
const env = loadEnv('development', process.cwd(), '')
Object.assign(process.env, env)
import { setTranslationContext, clearTranslationContext, translationId } from '../@white/ai/translate.js'
import { LOCALES, TRANSLATE } from '../src/config.js'
import { globalData, routes } from '../src/data.config.js'

const ROOT = resolve(import.meta.dirname, '..')
const TRANSLATIONS_DIR = resolve(ROOT, '.white/translations')
const SOURCE_LOCALE = LOCALES[0]
const TARGET_LOCALES = LOCALES.filter((l) => l !== SOURCE_LOCALE)

function hash(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 8)
}

// Load component-grouped translation file
// Format: { "Component": [ { id, source, value, status }, ... ] }
function loadTranslationFile(locale) {
  const filePath = resolve(TRANSLATIONS_DIR, `${locale}.json`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function saveTranslationFile(locale, data) {
  mkdirSync(TRANSLATIONS_DIR, { recursive: true })
  const filePath = resolve(TRANSLATIONS_DIR, `${locale}.json`)
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

// Build a lookup index: { component: { source: entry } }
function indexTranslations(data) {
  const index = {}
  for (const [component, entries] of Object.entries(data)) {
    index[component] = {}
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (entry.source) index[component][entry.source] = entry
      }
    }
  }
  return index
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

// Phase 1: Discover translatable strings with component context
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

  // entries: [ { source, component, tag, key } ]
  const allEntries = []
  const pageContexts = []
  const urls = await resolveAllUrls()

  for (const url of urls) {
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

    const globals = globalData ? await globalData() : {}
    const page = routes[routeKey]
    let data = { ...globals, locale: SOURCE_LOCALE }
    if (page.data) {
      const slug = routeKey.includes('[slug]')
        ? url.replace(/^\//, '').split('/').pop()
        : null
      Object.assign(data, await page.data({ slug, locale: SOURCE_LOCALE, globalData: globals }))
    }

    // Render in collect mode — h() records { source, component, tag, key } tuples
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
    if (untranslated.length > 0) {
      pageContexts.push({ url, html, strings: untranslated.map((e) => e.source) })
      allEntries.push(...untranslated)
    }
  }

  await vite.close()

  // t('...') calls from source scanning go into _global group
  const tCallStrings = await discoverTCalls()
  for (const s of tCallStrings) {
    // Only add if not already discovered from rendering
    if (!allEntries.some((e) => e.source === s)) {
      allEntries.push({ source: s, component: '_global', tag: undefined, key: undefined })
    }
  }

  return { entries: allEntries, pageContexts }
}

// Deduplicate entries by id
function dedupeEntries(entries) {
  const seen = new Map()
  for (const entry of entries) {
    const id = translationId(entry.component, entry.tag, entry.source, entry.key)
    if (!seen.has(id)) {
      seen.set(id, { ...entry, id })
    }
  }
  return [...seen.values()]
}

// Phase 2: For each locale, diff and translate
async function translateLocale(locale, entries, existing, pageContexts) {
  const existingIndex = indexTranslations(existing)
  const toTranslate = []
  const warnings = []
  const updated = {} // start fresh — only active entries survive
  const activeIds = new Set(entries.map((e) => e.id))

  for (const entry of entries) {
    const { id, source, component } = entry
    const existingEntry = existingIndex[component]?.[source]

    if (existingEntry && existingEntry.id === id) {
      // Keep existing translation
      if (!updated[component]) updated[component] = []
      updated[component].push(existingEntry)

      if (existingEntry.status === 'approved') {
        if (existingEntry.sourceHash && existingEntry.sourceHash !== hash(source)) {
          warnings.push(`Source changed for approved: [${component}] "${source.slice(0, 40)}..."`)
        }
        continue
      }
      if (existingEntry.sourceHash === hash(source) && !existingEntry.needsTranslation) continue

      // Source changed — remove from updated, add to toTranslate
      updated[component] = updated[component].filter((e) => e.id !== id)
    }

    toTranslate.push(entry)
  }

  // Count removed entries
  let removed = 0
  for (const [component, entries] of Object.entries(existing)) {
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (entry.id && !activeIds.has(entry.id)) removed++
      }
    }
  }
  if (removed > 0) console.log(`  ${locale}: removed ${removed} unused translations`)

  if (warnings.length > 0) {
    console.log(`\n  Warnings for ${locale}:`)
    for (const w of warnings) console.log(`    ${w}`)
  }

  if (toTranslate.length === 0) {
    console.log(`  ${locale}: all strings translated (${entries.length} total)`)
    return updated
  }

  console.log(`  ${locale}: ${toTranslate.length} strings need translation`)

  // Call AI
  const relevantPages = pageContexts?.filter((p) =>
    p.strings.some((s) => toTranslate.some((e) => e.source === s))
  )
  const aiResult = await callAI(locale, toTranslate.map((e) => e.source), relevantPages)

  for (const entry of toTranslate) {
    const { id, source, component } = entry
    const value = aiResult?.[source] || source
    if (!updated[component]) updated[component] = []

    // Remove old entry with same id if exists
    updated[component] = updated[component].filter((e) => e.id !== id)
    updated[component].push({
      id,
      source,
      value,
      status: aiResult?.[source] ? 'auto' : 'auto',
      sourceHash: hash(source),
      ...(aiResult?.[source] ? {} : { needsTranslation: true }),
    })
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

  // Build page context — pick fewest pages that cover all strings
  let context = ''
  if (pageContexts?.length > 0) {
    const uncovered = new Set(strings)
    const selected = []
    while (uncovered.size > 0) {
      let best = null
      let bestCount = 0
      for (const page of pageContexts) {
        const count = page.strings.filter((s) => uncovered.has(s)).length
        if (count > bestCount) { best = page; bestCount = count }
      }
      if (!best || bestCount === 0) break
      selected.push(best)
      for (const s of best.strings) uncovered.delete(s)
    }
    const pages = selected.map((p) => `<!-- Page: ${p.url} -->\n${p.html}`).join('\n\n')
    context = `\nHere is the HTML of representative pages where these strings appear. Use this to understand the context, tone, and placement of each string:\n\n${pages}\n`
  }

  let systemPrompt = 'You are a professional website translator.'
  if (style) systemPrompt = style

  let response
  try {
    response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Translate the following UI text from English to ${locale}.\n${context}\nRules:\n${rules}\n\nStrings to translate:\n${numbered}\n\nRespond with only the JSON object, no markdown code fences.`,
      }],
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

// Phase 3: Write combined translations
function writeCombinedTranslations(allTranslations) {
  const distDir = resolve(ROOT, 'dist/templates')
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })
  writeFileSync(resolve(distDir, 'translations.json'), JSON.stringify(allTranslations, null, 2))
}

// Main
async function main() {
  if (TARGET_LOCALES.length === 0) {
    console.log('No target locales configured. Add locales to src/config.js LOCALES array.')
    return
  }

  console.log(`Source locale: ${SOURCE_LOCALE}`)
  console.log(`Target locales: ${TARGET_LOCALES.join(', ')}\n`)

  console.log('Discovering translatable strings...')
  const { entries: rawEntries, pageContexts } = await discoverStrings()
  const entries = dedupeEntries(rawEntries)
  const components = [...new Set(entries.map((e) => e.component))]
  console.log(`Found ${entries.length} translatable strings in ${components.length} components\n`)

  if (entries.length === 0) {
    console.log('No strings with translate attribute found.')
    return
  }

  const allTranslations = {}
  for (const locale of TARGET_LOCALES) {
    const existing = loadTranslationFile(locale)
    const updated = await translateLocale(locale, entries, existing, pageContexts)
    saveTranslationFile(locale, updated)
    allTranslations[locale] = updated
  }

  writeCombinedTranslations(allTranslations)
  console.log('\nDone. Translation files written to .white/translations/')
}

main().catch((err) => {
  console.error('Translation failed:', err)
  process.exit(1)
})
