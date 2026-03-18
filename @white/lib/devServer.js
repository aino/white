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
    const files = await fs.readdir(apiDir)

    await Promise.all(
      files.map(async (file) => {
        const route = `/api/${file.replace('.js', '')}` // Add /api prefix
        const module = await import(join(apiDir, file))
        app.all(route, async (req, res) => {
          // Support both default export and named HTTP method exports
          if (module.default) {
            module.default(req, res)
          } else {
            // Check for named exports like GET, POST, etc.
            const method = req.method.toUpperCase()
            const methodHandler = module[method]

            if (methodHandler) {
              try {
                const result = await methodHandler(req, res)

                // Handle Vercel-style Response objects
                if (result && typeof result.text === 'function') {
                  const text = await result.text()
                  res.setHeader(
                    'Content-Type',
                    result.headers.get('content-type') || 'text/plain'
                  )
                  res.status(result.status || 200).send(text)
                } else if (result && result.body) {
                  // Handle other Response-like objects
                  res.status(result.status || 200).send(result.body)
                }
                // If handler doesn't return anything, assume it handled the response
              } catch (error) {
                res.status(500).json({ error: error.message })
              }
            } else {
              res.status(405).json({ error: `Method ${method} not allowed` })
            }
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
