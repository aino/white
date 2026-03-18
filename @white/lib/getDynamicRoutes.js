import { PAGES_DIR } from './index'
import { resolve } from 'path'
import { globSync } from 'glob'
import { routes, globalData } from '../../src/data.config.js'
import { LOCALES } from '../../src/config.js'

const rSlug = /\[slug\]/

export default async function getDynamicRoutes() {
  const dynamicPaths = []
  const slugPromises = []
  const input = globSync([
    resolve(__dirname, '../../', PAGES_DIR, '**/*.jsx'),
  ]).filter((path) => !path.includes('[slug]'))

  // Add @white/white.js as an entry point
  input.push(resolve(__dirname, '../white.js'))

  // Get global data once for all dynamic routes
  const globalDataCache = globalData ? await globalData() : null

  for (const [path, page] of Object.entries(routes)) {
    if (rSlug.test(path) && page.slugs) {
      // Add the template JSX file to the input so it gets processed
      const templateFile = resolve(
        __dirname,
        '../../',
        PAGES_DIR,
        `${path.replace(/^\//, '')}/index.jsx`
      )
      if (!input.includes(templateFile)) {
        input.push(templateFile)
      }

      const makeSlugs = async () => {
        const slugs = await page.slugs(globalDataCache)
        for (const slug of slugs) {
          const key = path.replace(rSlug, slug)
          dynamicPaths.push(key)
        }
      }
      slugPromises.push(makeSlugs())
    }
  }
  // input.concat(localized)

  await Promise.all(slugPromises)
  const localized = []
  const root = resolve(__dirname, '../../', PAGES_DIR)
  for (const locale of LOCALES.slice(1)) {
    for (const path of input) {
      // Only localize HTML files, not JSX files
      if (path.endsWith('.html')) {
        localized.push(path.replace(root, `${root}/${locale}`))
      }
    }
  }
  input.push(...localized)

  return { input, dynamicPaths }
}
