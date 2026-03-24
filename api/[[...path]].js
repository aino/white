import { getPageContext } from '../lambda/getPageContext.js'
import { globalData, routes } from '../src/data.config.js'
import { LOCALES } from '../src/config.js'

let templates = null

async function loadTemplates() {
  if (templates) return templates
  templates = (await import('../dist/templates/registry.js')).default
  return templates
}

export const GET = async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/'

  const registry = await loadTemplates()

  const context = await getPageContext(path, {
    routes,
    globalData,
    locales: LOCALES,
  })

  if (!context) {
    const NotFound = registry['/404']
    if (NotFound) {
      const ctx404 = await getPageContext('/404', {
        routes,
        globalData,
        locales: LOCALES,
      })
      return new Response(
        '<!DOCTYPE html>' + NotFound(ctx404?.data || { locale: LOCALES[0] }),
        {
          status: 404,
          headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
        }
      )
    }
    return new Response('Not Found', { status: 404 })
  }

  const Template = registry[context.key]
  if (!Template) {
    return new Response('Template not found', { status: 500 })
  }

  const html = '<!DOCTYPE html>' + Template(context.data)

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store',
    },
  })
}
