import * as config from '../../src/data.config.js'
import { resolve } from 'path'
import { PAGES_DIR } from './index'
import fs from 'fs'
import { LOCALES } from '../../src/config.js'

export async function getPageContext(url, globalDataCache = null) {
  const { locales, globalData, routes } = config

  // Skip page context for API routes
  if (url.startsWith('/api/')) {
    return null
  }

  // Remove leading/trailing slashes and normalize path
  const path = url.replace(/^\/|\/?\w+\.html$|\/$/g, '').trim()

  // Split the path into segments
  const segments = path.split('/').filter(Boolean)

  // Determine the locale from the first segment
  let locale = LOCALES[0] // Default locale
  if (LOCALES.includes(segments[0])) {
    locale = segments.shift()
  }

  // Get global data
  if (!globalDataCache && globalData) {
    globalDataCache = await globalData()
  }

  // Merge global data with locale
  const globals = globalDataCache || {}

  // Find the matching page or route
  let key = `/${segments.join('/')}`

  let page = routes[key]
  let data = {
    ...globals,
    locale,
  }
  let slug = null

  // Handle dynamic routes
  if (!page) {
    slug = segments.pop()
    key = `/${segments.concat('[slug]').join('/')}`
    page = routes[key]
    
    // If we found a dynamic route definition
    if (page) {
      if (page.slugs) {
        // Dynamic route with slugs function - validate the slug
        const slugs = await page.slugs(globalDataCache)
        if (!slugs.includes(slug)) {
          return null // Invalid slug
        }
        if (page?.data) {
          Object.assign(
            data,
            await page.data({ slug, locale, globalData: globalDataCache })
          )
        }
        return { key, slug, data }
      } else {
        // Dynamic route without slugs function - this is an error
        throw new Error('Slugs are required for dynamic routes')
      }
    } else {
      // No dynamic route found, check if it's a static page
      const staticKey = `/${segments.concat(slug).join('/')}`
      const staticPage = routes[staticKey]
      
      if (staticPage) {
        // Found static route definition
        if (staticPage?.data) {
          Object.assign(
            data,
            await staticPage.data({ locale, globalData: globalDataCache })
          )
        }
        return { key: staticKey, slug: null, data }
      } else {
        // No route definition, check if template file exists
        const templatePath = resolve(
          __dirname,
          '../../',
          PAGES_DIR,
          segments.concat(slug).join('/'),
          'index.jsx'
        )
        if (fs.existsSync(templatePath)) {
          return { key: staticKey, slug: null, data }
        }
        return null
      }
    }
  }
  if (page?.data) {
    Object.assign(
      data,
      await page.data({ locale, globalData: globalDataCache })
    )
  }
  return { key, slug, data }
}
