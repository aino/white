import { build } from 'esbuild'
import { resolve } from 'path'
import { writeFileSync, readFileSync, mkdirSync, readdirSync, statSync } from 'fs'

const ROOT = resolve(import.meta.dirname, '..')
const PAGES_DIR = resolve(ROOT, 'src/pages')
const OUT_DIR = resolve(ROOT, 'dist/templates')

// Find all page templates recursively
function findTemplates(dir, base = '') {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...findTemplates(full, base ? `${base}/${entry}` : entry))
    } else if (entry === 'index.jsx') {
      results.push(base ? `${base}/index.jsx` : 'index.jsx')
    }
  }
  return results
}

const entryPoints = findTemplates(PAGES_DIR)

console.log(`Compiling ${entryPoints.length} templates...`)

// Path alias plugin (esbuild 0.14 doesn't have built-in alias)
const aliases = {
  src: resolve(ROOT, 'src'),
  '@white/utils': resolve(ROOT, '@white/utils'),
  '@white': resolve(ROOT, '@white'),
  'lib/jsx-runtime': resolve(ROOT, '@white/lib/jsx-runtime.js'),
}

const aliasPlugin = {
  name: 'alias',
  setup(build) {
    // Sort by longest prefix first so @white/utils matches before @white
    const sorted = Object.entries(aliases).sort(
      (a, b) => b[0].length - a[0].length
    )
    for (const [prefix, target] of sorted) {
      const filter = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      build.onResolve({ filter }, (args) => {
        let resolved = args.path.replace(prefix, target)
        // Resolve directory imports to index.jsx
        try {
          if (statSync(resolved).isDirectory()) {
            resolved = resolve(resolved, 'index.jsx')
          }
        } catch {}
        return { path: resolved }
      })
    }
  },
}

// Ignore CSS imports — templates don't need them
const ignoreCssPlugin = {
  name: 'ignore-css',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, () => ({
      path: 'css-stub',
      namespace: 'css-stub',
    }))
    build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({
      contents: '',
      loader: 'js',
    }))
  },
}

await build({
  entryPoints: entryPoints.map((f) => resolve(PAGES_DIR, f)),
  bundle: true,
  format: 'esm',
  outdir: OUT_DIR,
  jsx: 'transform',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  inject: [resolve(ROOT, '@white/lib/jsx-runtime.js'), resolve(ROOT, '@white/translate.js')],
  plugins: [aliasPlugin, ignoreCssPlugin],
  platform: 'node',
  target: 'node18',
})

// Generate registry mapping routes to template imports
const registry = {}
for (const entry of entryPoints) {
  const route =
    '/' +
    entry
      .replace(/\/index\.jsx$/, '')
      .replace(/^index\.jsx$/, '')

  const outPath = './' + entry.replace(/\.jsx$/, '.js')
  registry[route] = outPath
}

const registryCode = `// Auto-generated template registry
${Object.entries(registry)
  .map(([route, path], i) => `import * as t${i} from '${path}'`)
  .join('\n')}

export default {
${Object.entries(registry)
  .map(([route], i) => `  '${route}': t${i}.default,`)
  .join('\n')}
}
`

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'registry.js'), registryCode)

// Build asset manifest for injection at render time
const ASSETS_DIR = resolve(ROOT, 'dist/assets')
try {
  const files = readdirSync(ASSETS_DIR)
  const cssFiles = files.filter((f) => f.endsWith('.css'))
  const jsFiles = files.filter((f) => f.endsWith('.js') && statSync(resolve(ASSETS_DIR, f)).size > 100)

  // Find the main JS bundle (largest file, contains white.js)
  const mainJs = jsFiles.sort(
    (a, b) => statSync(resolve(ASSETS_DIR, b)).size - statSync(resolve(ASSETS_DIR, a)).size
  )[0]

  const assets = {
    css: cssFiles.map((f) => `<link rel="stylesheet" href="/assets/${f}">`).join('\n'),
    js: mainJs ? `<script type="module">import "/assets/${mainJs}"</script>` : '',
  }
  writeFileSync(resolve(OUT_DIR, 'assets.json'), JSON.stringify(assets, null, 2))
  console.log(`\nAsset manifest written (${cssFiles.length} CSS, main JS: ${mainJs || 'none'})`)
} catch (e) {
  console.warn('Could not build asset manifest:', e.message)
}

// Bundle translations for ISR/API runtime + client-side
const TRANSLATIONS_DIR = resolve(ROOT, '.white/translations')
try {
  const localeFiles = readdirSync(TRANSLATIONS_DIR).filter((f) => f.endsWith('.json'))
  if (localeFiles.length > 0) {
    const combined = {}
    // Per-locale client files (served as static assets)
    const clientDir = resolve(ROOT, 'dist/assets/translations')
    mkdirSync(clientDir, { recursive: true })
    for (const f of localeFiles) {
      const locale = f.replace('.json', '')
      const data = JSON.parse(readFileSync(resolve(TRANSLATIONS_DIR, f), 'utf8'))
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
      combined[locale] = indexed
      // Client files as-is (component-grouped, indexed on load by white.js)
      writeFileSync(resolve(clientDir, `${locale}.json`), JSON.stringify(data))
    }
    // Combined file for ISR/API (server-side, pre-indexed)
    writeFileSync(resolve(OUT_DIR, 'translations.json'), JSON.stringify(combined))
    console.log(`\nTranslations bundled (${localeFiles.map((f) => f.replace('.json', '')).join(', ')})`)
  }
} catch {
  // No translations yet — write empty object so imports don't fail
  writeFileSync(resolve(OUT_DIR, 'translations.json'), '{}')
}

console.log('Templates compiled:')
for (const [route, path] of Object.entries(registry)) {
  console.log(`  ${route} → ${path}`)
}
console.log(`\nRegistry written to dist/templates/registry.js`)
