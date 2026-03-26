import { setGlobalData } from '../@white/utils/globalData.js'

// Match URL segments against a route pattern like /products/[category]/[slug]
// Returns { category: 'jeans', slug: 'slim-finn' } or null if no match
function matchRoute(segments, routePattern) {
  const routeSegments = routePattern.replace(/^\//, '').split('/').filter(Boolean)
  if (segments.length !== routeSegments.length) return null

  const params = {}
  for (let i = 0; i < routeSegments.length; i++) {
    const match = routeSegments[i].match(/^\[(.+)\]$/)
    if (match) {
      params[match[1]] = segments[i]
    } else if (routeSegments[i] !== segments[i]) {
      return null
    }
  }
  return params
}

export async function getPageContext(url, { routes, globalData, locales, draft = false }) {
  if (url.startsWith('/api/')) {
    return null
  }

  const path = url.replace(/^\/|\/?\w+\.html$|\/$/g, '').trim()
  const segments = path.split('/').filter(Boolean)

  let locale = locales[0]
  if (locales.includes(segments[0])) {
    locale = segments.shift()
  }

  const globals = globalData ? await globalData({ locale, draft }) : {}
  setGlobalData(globals)

  // Try exact match first
  const exactKey = `/${segments.join('/')}`
  const exactPage = routes[exactKey]
  if (exactPage) {
    let data = { ...globals, locale, draft }
    if (exactPage.data) {
      const result = await exactPage.data({ locale, globalData: globals, draft })
      if (result === null) return null
      Object.assign(data, result)
    }
    return { key: exactKey, data }
  }

  // Try dynamic route patterns
  for (const [pattern, page] of Object.entries(routes)) {
    if (!pattern.includes('[')) continue

    const params = matchRoute(segments, pattern)
    if (!params) continue

    // If params() is defined, validate (for static builds)
    if (page.params) {
      const validParams = await page.params(globals)
      const isValid = validParams.some((p) =>
        Object.keys(params).every((k) => p[k] === params[k])
      )
      if (!isValid) continue
    }

    // Fetch page data
    let data = { ...globals, locale, draft, ...params }
    if (page.data) {
      const result = await page.data({ ...params, locale, globalData: globals, draft })
      if (result === null) return null
      Object.assign(data, result)
    }
    return { key: pattern, data }
  }

  return null
}
