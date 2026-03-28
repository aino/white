import vercel from '../../vercel.json'
import { IMAGE_QUALITY } from '../../src/config'

// Use /_sharp/ only in Vite dev mode; all builds use /_vercel/image
// (works on Vercel natively, and on CloudFront via /_vercel/* proxy)
const isDev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV

export const imageSizes = vercel.images.sizes

export function getImageSrc({ url, size, quality = IMAGE_QUALITY }) {
  if (!url) return url
  const encodedUrl = encodeURIComponent(url)
  if (isDev) {
    return `/_sharp/?path=${encodedUrl}&w=${size}&q=${quality}`
  }
  return `/_vercel/image?url=${encodedUrl}&w=${size}&q=${quality}`
}

export function generateSrcSet(url, quality = IMAGE_QUALITY) {
  return imageSizes
    .map((size) => `${getImageSrc({ url, size, quality })} ${size}w`)
    .join(', ')
}
