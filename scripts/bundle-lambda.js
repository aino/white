import { build } from 'esbuild'
import { resolve } from 'path'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = resolve(ROOT, 'isr/lambda/bundle')
const RENDER_OUT_DIR = resolve(ROOT, 'isr/lambda/render-bundle')
const TEMPLATES_DIR = resolve(ROOT, 'dist/templates')

// Bucket name passed as CLI arg: node scripts/bundle-lambda.js white-isr-client-name
const bucketName = process.argv[2]
if (!bucketName) {
  console.error('Usage: node scripts/bundle-lambda.js <bucket-name>')
  process.exit(1)
}

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
cpSync(TEMPLATES_DIR, resolve(ROOT, 'isr/lambda/_templates'), { recursive: true })

// Shared esbuild plugin for resolving White handler imports
function resolveWhitePlugin() {
  return {
    name: 'resolve-white',
    setup(build) {
      // Redirect handler.js import to the project's lambda/handler.js
      build.onResolve({ filter: /\.\/handler\.js$/ }, () => ({
        path: resolve(ROOT, 'lambda/handler.js'),
      }))

      // Redirect assets.json to the compiled assets manifest
      build.onResolve({ filter: /\.\/assets\.json$/ }, () => ({
        path: resolve(TEMPLATES_DIR, 'assets.json'),
      }))

      // Resolve dist/templates imports from handler.js
      build.onResolve({ filter: /\.\.\/dist\/templates/ }, (args) => ({
        path: resolve(ROOT, args.path.replace('..', '.')),
      }))

      // Resolve src/ imports from handler.js and render-handler.ts
      build.onResolve({ filter: /\.\.\/.*\/src\// }, (args) => ({
        path: resolve(ROOT, 'src', args.path.split('/src/')[1]),
      }))
      build.onResolve({ filter: /^\.\.\/src\// }, (args) => ({
        path: resolve(ROOT, args.path.replace('..', '.')),
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
  entryPoints: [resolve(ROOT, 'isr/lambda/edge-handler.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: resolve(OUT_DIR, 'index.js'),
  external: ['@aws-sdk/*'],
  plugins: [resolveWhitePlugin()],
})

// Inject bucket name into the edge handler bundle (Lambda@Edge can't use env vars)
const edgeBundle = readFileSync(resolve(OUT_DIR, 'index.js'), 'utf-8')
writeFileSync(resolve(OUT_DIR, 'index.js'), edgeBundle.replace('__BUCKET_NAME__', bucketName))

console.log(`Edge Lambda bundle written to ${OUT_DIR}/index.js (bucket: ${bucketName})`)

// Bundle the render handler
mkdirSync(RENDER_OUT_DIR, { recursive: true })

await build({
  entryPoints: [resolve(ROOT, 'isr/lambda/render-handler.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: resolve(RENDER_OUT_DIR, 'index.js'),
  external: ['@aws-sdk/*'],
  plugins: [resolveWhitePlugin()],
})

console.log(`Render Lambda bundle written to ${RENDER_OUT_DIR}/index.js`)
