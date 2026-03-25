/**
 * Benchmark: 10,000 products × 100 locales
 *
 * Tests:
 * 1. Template compilation speed (esbuild)
 * 2. Single page render time
 * 3. Batch render time (100 random pages)
 * 4. Locale overhead (same page, all 100 locales)
 * 5. Memory usage
 */

import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')

// --- Step 1: Generate 100 locales ---

const languages = ['en', 'sv', 'de', 'fi', 'fr', 'es', 'it', 'nl', 'da', 'no', 'pt', 'pl', 'cs', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et']
const countries = ['US', 'GB', 'SE', 'DE', 'FI', 'FR', 'ES', 'IT', 'NL', 'DK', 'NO', 'PT', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SK', 'SI', 'EE', 'AT', 'CH', 'BE', 'IE']

const locales = []
for (const lang of languages) {
  for (const country of countries) {
    locales.push(`${lang}-${country}`)
    if (locales.length >= 100) break
  }
  if (locales.length >= 100) break
}

console.log(`Generated ${locales.length} locales`)

// --- Step 2: Generate 10,000 products ---

const categories = ['jeans', 'shirts', 'jackets', 'sweaters', 'accessories', 'shoes', 'bags', 'underwear']
const fits = ['slim', 'regular', 'relaxed', 'tight', 'loose']
const colors = ['black', 'blue', 'white', 'grey', 'indigo', 'raw', 'washed', 'stone']

function generateProducts(count) {
  const products = []
  for (let i = 0; i < count; i++) {
    const category = categories[i % categories.length]
    const fit = fits[i % fits.length]
    const color = colors[i % colors.length]
    products.push({
      slug: `${fit}-${category.slice(0, -1)}-${color}-${i}`,
      name: `${fit.charAt(0).toUpperCase() + fit.slice(1)} ${category.slice(0, -1)} ${color}`,
      price: Math.floor(Math.random() * 400) + 50,
      currency: 'USD',
      category,
      color,
      fit,
      description: `A classic ${fit} fit ${category.slice(0, -1)} in ${color}. Made from organic cotton with sustainable processes.`,
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      images: [`/images/${category}/${i}-1.jpg`, `/images/${category}/${i}-2.jpg`],
      inStock: Math.random() > 0.1,
    })
  }
  return products
}

const products = generateProducts(10000)
console.log(`Generated ${products.length} products`)

// --- Step 3: Write test data.config.js ---

const dataConfig = `
const products = ${JSON.stringify(products)};

export const globalData = async ({ locale } = {}) => {
  return {
    site: { name: 'Benchmark Store' },
    locale,
  }
}

export const routes = {
  '/': {
    data: async ({ locale }) => ({
      path: '',
      featuredProducts: products.slice(0, 20),
    }),
  },
  '/products': {
    data: async ({ locale }) => ({
      path: '/products',
      title: 'All Products',
      products: products.slice(0, 200),
    }),
  },
  '/products/[slug]': {
    slugs: () => products.map(p => p.slug),
    data: async ({ slug, locale }) => {
      const product = products.find(p => p.slug === slug)
      return {
        title: product?.name,
        product,
        slug,
        path: '/products/' + slug,
      }
    },
  },
  '/404': {
    data: () => ({ path: '/404', title: 'Not Found' }),
  },
}
`

// Save original config and write benchmark config
const origConfig = readFileSync(resolve(ROOT, 'src/data.config.js'), 'utf-8')
const origLocales = readFileSync(resolve(ROOT, 'src/config.js'), 'utf-8')

writeFileSync(resolve(ROOT, 'src/data.config.js'), dataConfig)
writeFileSync(resolve(ROOT, 'src/config.js'), `export const LOCALES = ${JSON.stringify(locales)}\nexport const PORT = 4667\nexport const ISR = true\n`)

function restore() {
  writeFileSync(resolve(ROOT, 'src/data.config.js'), origConfig)
  writeFileSync(resolve(ROOT, 'src/config.js'), origLocales)
}

process.on('exit', restore)
process.on('SIGINT', () => { restore(); process.exit() })

// --- Step 4: Run benchmarks ---

console.log('\n=== Benchmark: 10,000 products × 100 locales ===\n')

// 4a. Template compilation
console.log('1. Template compilation (esbuild)...')
const compileStart = Date.now()
execSync('node scripts/compile-templates.js', { cwd: ROOT, stdio: 'pipe' })
const compileTime = Date.now() - compileStart
console.log(`   ${compileTime}ms`)

// 4b. Lambda bundle
console.log('\n2. Lambda bundle...')
const bundleStart = Date.now()
execSync('node scripts/bundle-lambda.js white-isr-benchmark', { cwd: ROOT, stdio: 'pipe' })
const bundleTime = Date.now() - bundleStart
const bundleSize = readFileSync(resolve(ROOT, 'isr/lambda/bundle/index.js')).length
console.log(`   ${bundleTime}ms (${(bundleSize / 1024 / 1024).toFixed(2)}MB bundle)`)

// 4c. Import handler and test renders
console.log('\n3. Handler import (cold start simulation)...')
const importStart = Date.now()
const { handler } = await import(resolve(ROOT, 'lambda/handler.js') + '?t=' + Date.now())
const importTime = Date.now() - importStart
console.log(`   ${importTime}ms`)

// 4d. Single product page render
console.log('\n4. Single product page render...')
const times = []
for (let i = 0; i < 20; i++) {
  const product = products[Math.floor(Math.random() * products.length)]
  const start = Date.now()
  const html = await handler(`/products/${product.slug}`)
  times.push(Date.now() - start)
}
const avg = times.reduce((a, b) => a + b, 0) / times.length
const min = Math.min(...times)
const max = Math.max(...times)
console.log(`   avg: ${avg.toFixed(1)}ms | min: ${min}ms | max: ${max}ms (20 random products)`)

// 4e. Homepage render (20 featured products)
console.log('\n5. Homepage render (20 featured products)...')
const catStart = Date.now()
const catHtml = await handler('/')
const catTime = Date.now() - catStart
const catSize = catHtml ? Buffer.byteLength(catHtml, 'utf-8') : 0
console.log(`   ${catTime}ms (${(catSize / 1024).toFixed(1)}KB HTML)`)

// 4f. Same page, all 100 locales
console.log('\n6. Same product page × 100 locales...')
const localeStart = Date.now()
for (const locale of locales) {
  await handler(`/${locale}/products/${products[0].slug}`)
}
const localeTotal = Date.now() - localeStart
console.log(`   ${localeTotal}ms total | ${(localeTotal / locales.length).toFixed(1)}ms avg per locale`)

// 4g. Memory usage
const mem = process.memoryUsage()
console.log(`\n7. Memory usage:`)
console.log(`   RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB`)
console.log(`   Heap used: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`)
console.log(`   Heap total: ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB`)

// Summary
console.log('\n=== Summary ===')
console.log(`Products: ${products.length}`)
console.log(`Locales: ${locales.length}`)
console.log(`Total possible pages: ${products.length * locales.length} (${(products.length * locales.length / 1000000).toFixed(1)}M)`)
console.log(`Template compilation: ${compileTime}ms`)
console.log(`Lambda bundle: ${bundleTime}ms (${(bundleSize / 1024 / 1024).toFixed(2)}MB)`)
console.log(`Cold start: ${importTime}ms`)
console.log(`Single page render: ${avg.toFixed(1)}ms avg`)
console.log(`Homepage (20 products): ${catTime}ms`)
console.log(`100 locale renders: ${(localeTotal / locales.length).toFixed(1)}ms avg`)
console.log(`Memory: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB heap`)
