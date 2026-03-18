import fs from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import fetch from 'node-fetch'

const middleware = async (req, res, next) => {
  const url = req.originalUrl || req.url

  // Match the dynamic image resizing route
  if (url.startsWith('/_sharp/')) {
    try {
      const query = new URL(url, 'http://localhost').searchParams
      const imagePath = query.get('path')
      const width = parseInt(query.get('w'), 10)
      const quality = parseInt(query.get('q'), 10) || 80

      if (!imagePath || !width) {
        res.statusCode = 400
        res.end('Invalid parameters')
        return
      }

      let img

      if (imagePath.startsWith('/')) {
        const imageFullPath = join(process.cwd(), 'src', 'public', imagePath)
        if (!fs.existsSync(imageFullPath)) {
          res.statusCode = 404
          res.end('Image not found')
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
          res.statusCode = 404
          res.end('Image not found')
          return
        }
        const buffer = await response.buffer()
        img = sharp(buffer)
      } else {
        res.statusCode = 400
        res.end('Invalid image path')
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
      console.error('[sharp] Error:', err.message)
      res.statusCode = 500
      res.end('Image processing error')
    }
  } else {
    next()
  }
}

export default function dynamicImageResizePlugin() {
  return {
    name: 'dynamic-image-resize',
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        await middleware(req, res, next)
      })
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        await middleware(req, res, next)
      })
    },
  }
}
