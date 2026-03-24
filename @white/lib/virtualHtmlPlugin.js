import fs from 'fs'
import { resolve } from 'path'
import { PAGES_DIR } from './index'
import compileTemplate from './compileTemplate.js'
import { getPageContext } from './getPageContext.js'
import { LOCALES } from '../../src/config.js'
import middlewareHandler, {
  config as middlewareConfig,
} from '../../src/middleware.js'
import { matchesMiddleware } from './middlewareMatcher.js'

export const getLocaleFromUrl = (url) => {
  const localeMatch = url.match(
    new RegExp(`^/(${LOCALES.slice(1).join('|')})(/|$)`)
  )
  return localeMatch?.[1] || LOCALES[0]
}

const getTemplateContext = async (url) => {
  const pageContext = await getPageContext(url)
  if (!pageContext) {
    return null
  }
  const { key, slug, data } = pageContext
  const templatePath = resolve(
    __dirname,
    '../../',
    PAGES_DIR,
    key.replace(/^\//, ''),
    'index.jsx'
  )
  let jsxExists = false
  if (slug && /\[slug\]/.test(key)) {
    const templatePathWithSlug = templatePath.replace('[slug]', slug)
    if (fs.existsSync(templatePathWithSlug)) {
      jsxExists = true
    }
  }
  if (!jsxExists && fs.existsSync(templatePath)) {
    jsxExists = true
  }
  if (!jsxExists) {
    return null
  }
  return { templatePath, data }
}

const getLocalized404 = (url) => {
  const locale = getLocaleFromUrl(url)
  return locale === LOCALES[0] ? '/404/' : `/${locale}/404/`
}

export default function virtualHtmlPlugin() {
  return {
    name: 'virtual-html',
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const acceptHeader = req.headers['accept']
          if (!acceptHeader || !acceptHeader.includes('text/html')) {
            return next()
          }
          let templateContext = await getTemplateContext(req.url)
          if (!templateContext) {
            templateContext = await getTemplateContext(getLocalized404(req.url))
            if (!templateContext) {
              return next()
            } else {
              const locale = getLocaleFromUrl(req.url)
              const localePath = locale === LOCALES[0] ? '' : `/${locale}`
              const custom404Path = resolve(
                __dirname,
                `../dist${localePath}/404/index.html`
              )
              const custom404Content = fs.readFileSync(custom404Path, 'utf-8')
              res.writeHead(404, { 'Content-Type': 'text/html' })
              return res.end(custom404Content)
            }
          }
          return next()
        } catch (err) {
          console.error(err)
          next()
        }
      })
    },
    configureServer(server) {
      // Serve translation files for client-side t()
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/assets\/translations\/([\w-]+)\.json$/)
        if (match) {
          const filePath = resolve(__dirname, `../../.white/translations/${match[1]}.json`)
          try {
            const data = fs.readFileSync(filePath, 'utf8')
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
            return
          } catch {
            res.statusCode = 404
            res.end('{}')
            return
          }
        }
        next()
      })
      server.middlewares.use(async (req, res, next) => {
        try {
          // Apply Vercel middleware to all routes (including pages like /about)
          try {
            // Check if path matches middleware matcher - always use default exclusions
            const shouldRun = matchesMiddleware(
              req.url,
              middlewareConfig?.matcher || []
            )

            if (shouldRun) {
              const result = await middlewareHandler(req)
              // Handle middleware response if it returns anything
              if (result && result.headers) {
                // Apply any headers from middleware
                Object.entries(result.headers).forEach(([key, value]) => {
                  res.setHeader(key, value)
                })
              }
            }
          } catch (error) {
            console.error('Middleware error:', error)
          }

          // Handle API routes from /api
          if (req.url.startsWith('/api/')) {
            const apiPath = req.url.replace(/^\/api/, '').split('?')[0]
            const apiFile = resolve(__dirname, '../../api', apiPath.slice(1) + '.js')
            
            try {
              if (fs.existsSync(apiFile)) {
                const apiModule = await import(apiFile + '?t=' + Date.now())
                const method = req.method
                
                if (apiModule[method]) {
                  const response = await apiModule[method](req)
                  res.statusCode = response.status || 200
                  const body = await response.text()
                  res.end(body)
                  return
                }
              }
            } catch (error) {
              console.error('API error:', error)
            }
            return next()
          }

          const acceptHeader = req.headers['accept']
          if (!acceptHeader || !acceptHeader.includes('text/html')) {
            return next()
          }

          let templateContext = await getTemplateContext(req.url)
          if (!templateContext) {
            templateContext = await getTemplateContext(getLocalized404(req.url))
            if (!templateContext) {
              return next()
            }
          }
          const { templatePath, data } = templateContext
          let html = await compileTemplate(templatePath, data, server, { locales: LOCALES })
          // Vite's transformIndexHtml requires trailing slash to correctly resolve
          // HTML proxy modules for inline scripts. Normalize here so the actual
          // URL in the browser stays clean (no trailing slash).
          const viteUrl = req.url.endsWith('/') ? req.url : req.url + '/'
          html = await server.transformIndexHtml(viteUrl, html)
          res.setHeader('Content-Type', 'text/html')
          res.end(html)
        } catch (err) {
          console.error(err)
          next()
        }
      })
    },
  }
}
