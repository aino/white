import { build } from 'esbuild'
import { resolve } from 'path'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'fs'

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = resolve(ROOT, 'infra/lambda/bundle')
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

// Copy templates and assets.json into a location the edge handler can import
cpSync(TEMPLATES_DIR, resolve(ROOT, 'infra/lambda/_templates'), { recursive: true })

// Bundle the edge handler with all dependencies into a single file
await build({
  entryPoints: [resolve(ROOT, 'infra/lambda/edge-handler.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: resolve(OUT_DIR, 'index.js'),
  external: ['@aws-sdk/*'],
  // Resolve the White handler imports
  plugins: [
    {
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

        // Resolve src/ imports from handler.js
        build.onResolve({ filter: /^\.\.\/src\// }, (args) => ({
          path: resolve(ROOT, args.path.replace('..', '.')),
        }))

        // Ignore CSS imports
        build.onResolve({ filter: /\.css$/ }, () => ({
          path: 'css-stub',
          namespace: 'css-stub',
        }))
        build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({
          contents: '',
          loader: 'js',
        }))
      },
    },
  ],
})

// Inject bucket name into the bundle
const bundle = readFileSync(resolve(OUT_DIR, 'index.js'), 'utf-8')
writeFileSync(resolve(OUT_DIR, 'index.js'), bundle.replace('__BUCKET_NAME__', bucketName))

console.log(`Lambda bundle written to ${OUT_DIR}/index.js (bucket: ${bucketName})`)
