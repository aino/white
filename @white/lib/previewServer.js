import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import sharp from 'sharp'
import fetch from 'node-fetch'
import middlewareHandler, { config as middlewareConfig } from '../../src/middleware.js'
import { matchesMiddleware } from './middlewareMatcher.js'
import { LOCALES as locales, ISR } from '../../src/config.js'
import * as localCache from './localCache.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 4666
const DIST_DIR = join(__dirname, '../../dist')
const API_DIR = join(__dirname, '../../api')

// Sharp image processing middleware — serves /_vercel/image locally
// so built HTML (which uses /_vercel/image URLs) works in preview mode
const sharpMiddleware = async (req, res, next) => {
  const url = req.url

  if (url.startsWith('/_vercel/image')) {
    try {
      const query = new URLSearchParams(url.split('?')[1])
      const encodedImagePath = query.get('url')
      const imagePath = decodeURIComponent(encodedImagePath)
      const width = parseInt(query.get('w'), 10)
      const quality = parseInt(query.get('q'), 10) || 80

      if (!imagePath || !width) {
        res.status(400).send('Invalid parameters')
        return
      }

      let img

      if (imagePath.startsWith('/')) {
        const imageFullPath = join(process.cwd(), 'src', 'public', imagePath)
        if (!fsSync.existsSync(imageFullPath)) {
          res.status(404).send('Image not found')
          return
        }
        img = sharp(imageFullPath)
      } else if (
        imagePath.startsWith('http://') ||
        imagePath.startsWith('https://')
      ) {
        // External URL
        const response = await fetch(imagePath)
        if (!response.ok) {
          res.status(404).send('Image not found')
          return
        }
        const buffer = await response.buffer()
        img = sharp(buffer)
      } else {
        res.status(400).send('Invalid image path')
        return
      }

      // Determine output format based on input or default to webp for better compression
      const metadata = await img.metadata()
      let outputBuffer
      let contentType
      
      if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        outputBuffer = await img.resize(width).jpeg({ quality }).toBuffer()
        contentType = 'image/jpeg'
      } else if (metadata.format === 'png') {
        outputBuffer = await img.resize(width).png({ quality }).toBuffer()
        contentType = 'image/png'
      } else {
        // Default to webp for better compression and broad support
        outputBuffer = await img.resize(width).webp({ quality }).toBuffer()
        contentType = 'image/webp'
      }

      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.end(outputBuffer)
    } catch (err) {
      console.error('Image processing error:', err)
      res.status(500).send('Image processing error')
    }
  } else {
    next()
  }
}

// Helper function to get locale from URL path
const getLocaleFromUrl = (url) => {
  const localeMatch = url.match(new RegExp(`^/(${locales.slice(1).join('|')})(/|$)`))
  return localeMatch?.[1] || locales[0]
}

// Middleware to parse JSON request bodies
app.use(express.json())

// Add sharp image processing middleware
app.use(sharpMiddleware)

// Apply Vercel middleware
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

// Setup and start server
;(async () => {
  // Setup API routes first
  try {
    const files = await fs.readdir(API_DIR)
    
    await Promise.all(
      files.map(async (file) => {
        if (!file.endsWith('.js')) return
        // Skip catch-all routes (handled by ISR renderer)
        if (file.includes('[')) return

        const route = `/api/${file.replace('.js', '')}`
        const module = await import(join(API_DIR, file))
        
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

          const handler = module.default || module[req.method.toUpperCase()]

          if (!handler) {
            return res.status(405).json({ error: `Method ${req.method} not allowed` })
          }

          try {
            const result = await handler(webRequest)

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
    
    console.log(`API routes loaded from ${API_DIR}`)
  } catch (error) {
    console.log('No API directory found or error loading routes:', error.message)
  }

  // Serve static files from dist
  app.use(express.static(DIST_DIR))

  // Page handler - static files or dynamic ISR rendering
  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found' })
    }

    if (req.method !== 'GET') {
      return next()
    }

    // ISR mode: dynamic rendering with local cache
    if (ISR === 'vercel' || ISR === 'aws') {
      const path = req.path.replace(/\/$/, '') || '/'

      // Check local cache
      const cached = localCache.get(path)
      if (cached) {
        res.setHeader('Content-Type', 'text/html')
        res.setHeader('X-Local-Cache', 'HIT')
        res.setHeader('Age', cached.age)
        return res.send(cached.html)
      }

      // Cache miss - render dynamically
      try {
        const { GET } = await import('../api/renderer.js')
        const protocol = req.protocol || 'http'
        const host = req.get('host') || 'localhost'
        const webRequest = new Request(`${protocol}://${host}/api?path=${encodeURIComponent(path)}`, {
          method: 'GET',
          headers: req.headers,
        })

        const response = await GET(webRequest)
        const html = await response.text()

        if (response.status === 200) {
          // Extract tags from response header
          const tagHeader = response.headers.get('Vercel-Cache-Tag') || ''
          const tags = tagHeader ? tagHeader.split(',') : []

          // Store in local cache
          localCache.set(path, html, tags)

          res.setHeader('X-Local-Cache', 'MISS')
        }

        res.status(response.status)
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() !== 'content-length') {
            res.setHeader(key, value)
          }
        })
        return res.send(html)
      } catch (error) {
        console.error('Render error:', error)
        return res.status(500).send('Render error: ' + error.message)
      }
    }

    // Static mode: serve pre-built HTML files
    let htmlPath = req.path
    if (htmlPath.endsWith('/')) {
      htmlPath = htmlPath + 'index.html'
    } else {
      htmlPath = htmlPath + '/index.html'
    }

    const fullPath = join(DIST_DIR, htmlPath)

    if (fsSync.existsSync(fullPath)) {
      res.sendFile(fullPath)
    } else {
      const locale = getLocaleFromUrl(req.path)
      const notFoundPath = locale === locales[0] ? '/404/index.html' : `/${locale}/404/index.html`
      const notFoundFullPath = join(DIST_DIR, notFoundPath)

      if (fsSync.existsSync(notFoundFullPath)) {
        res.status(404).sendFile(notFoundFullPath)
      } else {
        res.status(404).send('404 - Page Not Found')
      }
    }
  })
  
  app.listen(PORT, () => {
    console.log(`Preview server running at http://localhost:${PORT}`)
    console.log(`Serving static files from ${DIST_DIR}`)
  })
})()