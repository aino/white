import { getPageContext } from '../lambda/getPageContext.js'
import { globalData, routes } from '../src/data.config.js'
import { LOCALES } from '../src/config.js'
import { setTranslationContext, clearTranslationContext } from '../@white/ai/translate.js'

const SOURCE_LOCALE = LOCALES[0]
let templates = null
let assets = null
let translations = null

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

async function loadTranslations() {
  if (translations) return translations
  try {
    translations = (await import('../dist/templates/translations.json', { with: { type: 'json' } })).default
  } catch {
    translations = {}
  }
  return translations
}

function injectAssets(html, assets) {
  return html.replace(
    /<script type="module">import ['"]@white\/white\.js['"]<\/script>/,
    `${assets.css}\n${assets.js}`
  )
}

function renderWithTranslation(Template, data, trans) {
  const locale = data.locale || SOURCE_LOCALE
  setTranslationContext(locale, SOURCE_LOCALE, trans[locale] || {})
  const html = '<!DOCTYPE html>' + Template(data)
  clearTranslationContext()
  return html
}

async function render(path, { draft = false } = {}) {
  const registry = await loadTemplates()
  const assetManifest = await loadAssets()
  const trans = await loadTranslations()

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
      })
      return new Response(
        injectAssets(renderWithTranslation(NotFound, ctx404?.data || { locale: LOCALES[0] }, trans), assetManifest),
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
    injectAssets(renderWithTranslation(Template, context.data, trans), assetManifest),
    {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store',
      },
    }
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
