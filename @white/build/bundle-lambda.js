import { build } from 'esbuild'
import { resolve } from 'path'
import { cpSync, existsSync, mkdirSync, readFileSync } from 'fs'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT_DIR = resolve(ROOT, 'dist/isr/bundle')
const RENDER_OUT_DIR = resolve(ROOT, 'dist/isr/render-bundle')
const TEMPLATES_DIR = resolve(ROOT, 'dist/templates')

// Bucket name passed as CLI arg: node scripts/bundle-lambda.js white-isr-client-name
const bucketName = process.argv[2]
if (!bucketName) {
  console.error('Usage: node scripts/bundle-lambda.js <bucket-name>')
  process.exit(1)
}

// Parse .env for build-time injection into Lambda bundles.
// Lambda@Edge doesn't support runtime env vars, so all process.env.X
// references (e.g. in data.config.js) are replaced with literal values by esbuild.
// Note: only process.env.X access works — destructuring (const { X } = process.env) does not.
function parseDotenv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const vars = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex).trim()
      let value = trimmed.slice(eqIndex + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      vars[key] = value
    }
    return vars
  } catch {
    return {}
  }
}

const dotenvVars = parseDotenv(resolve(ROOT, '.env'))
const envDefine = Object.fromEntries(
  Object.entries(dotenvVars).map(([key, val]) => [`process.env.${key}`, JSON.stringify(val)])
)

// Verify templates are compiled
if (!existsSync(resolve(TEMPLATES_DIR, 'registry.js'))) {
  console.error('Templates not compiled. Run: npm run build:templates')
  process.exit(1)
}

if (!existsSync(resolve(TEMPLATES_DIR, 'assets.json'))) {
  console.error('Asset manifest not found. Run: npm run build:templates')
  process.exit(1)
}

// Copy templates and assets.json into a location the handlers can import
cpSync(TEMPLATES_DIR, resolve(ROOT, 'dist/isr/_templates'), { recursive: true })

// Shared esbuild plugin for resolving White handler imports
function resolveWhitePlugin() {
  return {
    name: 'resolve-white',
    setup(build) {
      // Redirect handler.js import to @white/lambda/handler.js
      build.onResolve({ filter: /\.\/handler\.js$/ }, () => ({
        path: resolve(ROOT, '@white/lambda/handler.js'),
      }))

      // Redirect assets.json to the compiled assets manifest
      build.onResolve({ filter: /\.\/assets\.json$/ }, () => ({
        path: resolve(TEMPLATES_DIR, 'assets.json'),
      }))

      // Resolve dist/templates imports from handler.js
      build.onResolve({ filter: /dist\/templates/ }, (args) => ({
        path: resolve(ROOT, 'dist/templates', args.path.split('dist/templates/')[1]),
      }))

      // Resolve src/ imports from handler.js and render-handler.ts
      build.onResolve({ filter: /\.\.\/.*src\// }, (args) => ({
        path: resolve(ROOT, 'src', args.path.split('/src/')[1]),
      }))

      // Ignore CSS/SCSS imports
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
}

// Bundle the edge handler
await build({
  entryPoints: [resolve(ROOT, '@white/isr/lambda/edge-handler.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: resolve(OUT_DIR, 'index.js'),
  external: ['@aws-sdk/*'],
  plugins: [resolveWhitePlugin()],
  define: {
    ...envDefine,
    'process.env.BUCKET': JSON.stringify(bucketName),
  },
})

console.log(`Edge Lambda bundle written to ${OUT_DIR}/index.js (bucket: ${bucketName})`)

// Bundle the render handler
mkdirSync(RENDER_OUT_DIR, { recursive: true })

await build({
  entryPoints: [resolve(ROOT, '@white/isr/lambda/render-handler.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: resolve(RENDER_OUT_DIR, 'index.js'),
  external: ['@aws-sdk/*'],
  plugins: [resolveWhitePlugin()],
  define: envDefine,
})

console.log(`Render Lambda bundle written to ${RENDER_OUT_DIR}/index.js`)
