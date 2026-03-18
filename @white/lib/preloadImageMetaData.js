import fs from 'fs'
import { join, relative } from 'path'
import sharp from 'sharp'

function getAllImagePaths(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true })

  return files.flatMap((file) => {
    const fullPath = join(dir, file.name)
    if (file.isDirectory()) {
      return getAllImagePaths(fullPath) // Recurse into subdirectory
    } else if (/\.(jpe?g|png|webp|gif|svg)$/i.test(file.name)) {
      return fullPath // Return full path for valid image files
    }
    return [] // Ignore non-image files
  })
}

// Use this function in preloadAllImageMetadata
export default async function preloadImageMetadata() {
  const imageMetadataCache = {}
  const imageDir = join(__dirname, '../../src', 'public', 'images')
  if (!fs.existsSync(imageDir)) {
    return imageMetadataCache
  }
  const imagePaths = getAllImagePaths(imageDir)

  for (const fullPath of imagePaths) {
    const relativePath = `/images/${relative(imageDir, fullPath)}` // Compute relative path
    try {
      const metadata = await sharp(fullPath).metadata()
      imageMetadataCache[relativePath] = metadata
    } catch (error) {
      console.error(`Error reading metadata for ${relativePath}:`, error)
      imageMetadataCache[relativePath] = {} // Fallback for missing metadata
    }
  }
  return imageMetadataCache
}
