import { getPageContext } from '../lambda/getPageContext.js'
import { globalData, routes } from '../../src/data.config.js'
import { LOCALES, ISR } from '../../src/config.js'

let templates = null
let assets = null

async function loadTemplates() {
  if (templates) return templates
  templates = (await import('../../dist/templates/registry.js')).default
  return templates
}

async function loadAssets() {
  if (assets) return assets
  assets = (await import('../../dist/templates/assets.json', { with: { type: 'json' } })).default
  return assets
}

function injectAssets(html, assets) {
  return html.replace(
    /<script type="module">import ['"]@white\/white\.js['"]<\/script>/,
    `${assets.css}\n${assets.js}`
  )
}

function getCacheTags(context) {
  const tags = []
  if (context.locale) tags.push(`locale-${context.locale}`)
  if (context.key) tags.push(`page-${context.key.replace(/\//g, '-').replace(/^-/, '')}`)
  if (context.data?.product?.id) tags.push(`product-${context.data.product.id}`)
  if (context.data?.category?.id) tags.push(`category-${context.data.category.id}`)
  return tags.join(',')
}

async function render(path, { draft = false } = {}) {
  const registry = await loadTemplates()
  const assetManifest = await loadAssets()

  const context = await getPageContext(path, {
    routes,
    globalData,
    locales: LOCALES,
    draft,
  })

  if (!context) {
    const NotFound = registry['/404']
    if (NotFound) {
      const ctx404 = await getPageContext('/404', {
        routes,
        globalData,
        locales: LOCALES,
        draft,
      })
      return new Response(
        injectAssets('<!DOCTYPE html>' + NotFound(ctx404?.data || { locale: LOCALES[0] }), assetManifest),
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

  const headers = {
    'Content-Type': 'text/html',
  }

  if (ISR === 'vercel' && !draft) {
    // Cache for 1 hour, stale-while-revalidate for 1 day
    headers['Cache-Control'] = 'public, s-maxage=3600, stale-while-revalidate=86400'
    headers['Vercel-CDN-Cache-Control'] = 'public, s-maxage=3600, stale-while-revalidate=86400'
    const tags = getCacheTags(context)
    if (tags) headers['Vercel-Cache-Tag'] = tags
  } else {
    headers['Cache-Control'] = 'no-store'
  }

  return new Response(
    injectAssets('<!DOCTYPE html>' + Template(context.data), assetManifest),
    { headers }
  )
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => c.trim().split('='))
  )
}

export const GET = async (req) => {
  const url = new URL(req.url)
  const rawPath = url.searchParams.get('path') || url.pathname.replace(/^\/api/, '')
  const path = rawPath.replace(/\/$/, '') || '/'

  const cookies = parseCookies(req.headers.get('cookie'))
  const draft = cookies.__draft === 'true'

  const response = await render(path, { draft })

  if (draft) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  return response
}
