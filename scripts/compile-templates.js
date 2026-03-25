import { build } from 'esbuild'
import { resolve } from 'path'
import { writeFileSync, readFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'

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
        // Resolve directory imports to index.jsx, or append .js extension
        try {
          if (statSync(resolved).isDirectory()) {
            resolved = resolve(resolved, 'index.jsx')
          }
        } catch {
          if (!resolved.match(/\.\w+$/) && existsSync(resolved + '.js')) {
            resolved = resolved + '.js'
          }
        }
        return { path: resolved }
      })
    }
  },
}

// Ignore CSS imports — templates don't need them
const ignoreCssPlugin = {
  name: 'ignore-css',
  setup(build) {
    build.onResolve({ filter: /\.(css|scss)$/ }, () => ({
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
  inject: [resolve(ROOT, '@white/lib/jsx-runtime.js')],
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

console.log('Templates compiled:')
for (const [route, path] of Object.entries(registry)) {
  console.log(`  ${route} → ${path}`)
}
console.log(`\nRegistry written to dist/templates/registry.js`)
