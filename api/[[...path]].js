import { getPageContext } from '../lambda/getPageContext.js'
import { globalData, routes } from '../src/data.config.js'
import { LOCALES } from '../src/config.js'

let templates = null
let assets = null

async function loadTemplates() {
  if (templates) return templates
  templates = (await import('../dist/templates/registry.js')).default
  return templates
}

async function loadAssets() {
  if (assets) return assets
  assets = (await import('../dist/templates/assets.json', { with: { type: 'json' } })).default
  return assets
}

function injectAssets(html, assets) {
  return html.replace(
    /<script type="module">import ['"]@white\/white\.js['"]<\/script>/,
    `${assets.css}\n${assets.js}`
  )
}

async function render(path) {
  const registry = await loadTemplates()
  const assetManifest = await loadAssets()

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

  return new Response(
    injectAssets('<!DOCTYPE html>' + Template(context.data), assetManifest),
    {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store',
      },
    }
  )
}

export const GET = async (req) => {
  const url = new URL(req.url)
  // Vercel rewrites are transparent — req.url has the original path
  // Strip /api prefix only if directly accessed (not via rewrite)
  const pathname = url.pathname
  const path = pathname.replace(/^\/api$/, '/').replace(/^\/api\//, '/').replace(/\/$/, '') || '/'
  return render(path)
}
