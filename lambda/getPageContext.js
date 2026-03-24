export async function getPageContext(url, { routes, globalData, locales, draft = false }) {
  if (url.startsWith('/api/')) {
    return null
  }

  // Remove leading/trailing slashes and normalize path
  const path = url.replace(/^\/|\/?\w+\.html$|\/$/g, '').trim()
  const segments = path.split('/').filter(Boolean)

  // Determine the locale from the first segment
  let locale = locales[0]
  if (locales.includes(segments[0])) {
    locale = segments.shift()
  }

  // Get global data
  const globals = globalData ? await globalData() : {}

  // Find the matching page or route
  let key = `/${segments.join('/')}`
  let page = routes[key]
  let data = { ...globals, locale, draft }
  let slug = null

  // Handle dynamic routes
  if (!page) {
    slug = segments.pop()
    key = `/${segments.concat('[slug]').join('/')}`
    page = routes[key]

    if (page) {
      if (page.slugs) {
        const slugs = await page.slugs(globals)
        if (!slugs.includes(slug)) {
          return null
        }
        if (page.data) {
          Object.assign(
            data,
            await page.data({ slug, locale, globalData: globals, draft })
          )
        }
        return { key, slug, data }
      } else {
        throw new Error('Slugs are required for dynamic routes')
      }
    } else {
      // Check if it's a static page without [slug]
      const staticKey = `/${segments.concat(slug).join('/')}`
      const staticPage = routes[staticKey]

      if (staticPage) {
        if (staticPage.data) {
          Object.assign(
            data,
            await staticPage.data({ locale, globalData: globals, draft })
          )
        }
        return { key: staticKey, slug: null, data }
      }
      return null
    }
  }

  if (page.data) {
    Object.assign(
      data,
      await page.data({ locale, globalData: globals, draft })
    )
  }
  return { key, slug, data }
}
