import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises' // Use promises version for async operations
import middlewareHandler, {
  config as middlewareConfig,
} from '../../src/middleware.js'
import { matchesMiddleware } from './middlewareMatcher.js'
import { API_PORT } from './ports.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()

// Middleware to parse JSON request bodies
app.use(express.json())

// Apply Vercel middleware BEFORE API routing
app.use(async (req, res, next) => {
  try {
    // Check if path matches middleware matcher - always use default exclusions
    if (!matchesMiddleware(req.path, middlewareConfig?.matcher || [])) {
      return next()
    }

    const result = await middlewareHandler(req)
    // Handle middleware response if it returns anything
    if (result && result.headers) {
      // Apply any headers from middleware
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value)
      })
    }
    next()
  } catch (error) {
    console.error('Middleware error:', error)
    next()
  }
})

// Dynamically load route files from the "api" folder
const apiDir = join(__dirname, '../../api')

;(async () => {
  try {
    const files = await fs.readdir(apiDir, { withFileTypes: true })

    await Promise.all(
      files.filter((f) => f.isFile() && f.name.endsWith('.js')).map(async (f) => {
        const file = f.name
        // Convert Vercel route conventions to Express (path-to-regexp v8):
        //   [[...path]] → {*path}  (optional catch-all)
        //   [...path]   → *path   (catch-all)
        //   [param]     → :param
        const route = `/api/${file.replace('.js', '')}`
          .replace(/\[\[\.\.\.(\w+)\]\]/g, '{*$1}')
          .replace(/\[\.\.\.(\w+)\]/g, '*$1')
          .replace(/\[(\w+)\]/g, ':$1')
        const module = await import(join(apiDir, file))
        app.all(route, async (req, res) => {
          // Build a Web API Request from the Express request so Vercel-style
          // handlers (new URL(req.url), req.headers.get(), req.json()) work.
          const protocol = req.protocol || 'http'
          const host = req.get('host') || 'localhost'
          const webRequest = new Request(`${protocol}://${host}${req.originalUrl}`, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
          })

          // Support both default export and named HTTP method exports
          const handler = module.default || module[req.method.toUpperCase()]

          if (!handler) {
            return res.status(405).json({ error: `Method ${req.method} not allowed` })
          }

          try {
            const result = await handler(webRequest)

            // Handle Web API Response objects
            if (result && result instanceof Response) {
              res.status(result.status)
              result.headers.forEach((value, key) => res.setHeader(key, value))
              const text = await result.text()
              res.send(text)
            }
          } catch (error) {
            res.status(500).json({ error: error.message })
          }
        })
      })
    )

    app.listen(API_PORT, () => {
      console.log(`API server running at http://localhost:${API_PORT}`)
    })
  } catch (error) {
    console.error('Failed to load API routes:', error)
  }
})()
