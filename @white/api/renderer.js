import { getPageContext } from '../lib/getPageContext.js'
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

function getCacheTags(context, path) {
  const tags = []
  if (context.data?.locale) tags.push(`locale-${context.data.locale}`)
  if (path) {
    // Use actual request path for tag (e.g., /en-US/about → path-en-US-about)
    const pathTag = path.replace(/^\//, '').replace(/\//g, '-')
    if (pathTag) tags.push(`path-${pathTag}`)
  }
  // Add both ID and slug for products (CMS might use either)
  if (context.data?.product?.id) tags.push(`product-${context.data.product.id}`)
  if (context.data?.product?.slug) tags.push(`product-${context.data.product.slug}`)
  if (context.data?.category?.id) tags.push(`category-${context.data.category.id}`)
  if (context.data?.category?.slug) tags.push(`category-${context.data.category.slug}`)
  return tags.join(',')
}

async function renderErrorPage(registry, assetManifest, status, fallbackMessage) {
  const errorKey = `/${status}`
  const ErrorPage = registry[errorKey]
  if (ErrorPage) {
    const ctx = await getPageContext(errorKey, {
      routes,
      globalData,
      locales: LOCALES,
      draft: false,
    }).catch(() => null)
    return new Response(
      injectAssets('<!DOCTYPE html>' + ErrorPage(ctx?.data || { locale: LOCALES[0] }), assetManifest),
      {
        status,
        headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
      }
    )
  }
  return new Response(fallbackMessage, { status })
}

async function render(path, { draft = false } = {}) {
  const registry = await loadTemplates()
  const assetManifest = await loadAssets()

  let context
  try {
    context = await getPageContext(path, {
      routes,
      globalData,
      locales: LOCALES,
      draft,
    })
  } catch (err) {
    console.error('Data fetch error:', err)
    return renderErrorPage(registry, assetManifest, 500, 'Server Error')
  }

  if (!context) {
    return renderErrorPage(registry, assetManifest, 404, 'Not Found')
  }

  const Template = registry[context.key]
  if (!Template) {
    return renderErrorPage(registry, assetManifest, 500, 'Template not found')
  }

  const headers = {
    'Content-Type': 'text/html',
  }

  if ((ISR === 'vercel' || ISR === 'aws') && !draft) {
    // Cache indefinitely until explicitly invalidated via /api/revalidate
    headers['Cache-Control'] = 'public, s-maxage=31536000'
    headers['Vercel-CDN-Cache-Control'] = 'public, s-maxage=31536000'
    const tags = getCacheTags(context, path)
    if (tags) headers['Vercel-Cache-Tag'] = tags
  } else {
    headers['Cache-Control'] = 'no-store'
  }

  try {
    return new Response(
      injectAssets('<!DOCTYPE html>' + Template(context.data), assetManifest),
      { headers }
    )
  } catch (err) {
    console.error('Render error:', err)
    return renderErrorPage(registry, assetManifest, 500, 'Render Error')
  }
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
