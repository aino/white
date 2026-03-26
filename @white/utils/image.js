import vercel from '../../vercel.json'
import { IMAGE_QUALITY } from '../../src/config'

const isVercel = typeof import.meta !== 'undefined' && !!import.meta.env?.VERCEL

export const imageSizes = vercel.images.sizes

export function getImageSrc({ url, size, quality = IMAGE_QUALITY }) {
  if (!url) return url
  const encodedUrl = encodeURIComponent(url)
  if (isVercel) {
    return `/_vercel/image?url=${encodedUrl}&w=${size}&q=${quality}`
  }
  return `/_sharp/?path=${encodedUrl}&w=${size}&q=${quality}`
}

export function generateSrcSet(url, quality = IMAGE_QUALITY) {
  return imageSizes
    .map((size) => `${getImageSrc({ url, size, quality })} ${size}w`)
    .join(', ')
}
