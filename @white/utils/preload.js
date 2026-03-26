import { getImageSrc } from '../../src/components/Image'
import vercel from '../../vercel.json'

const imageSizes = vercel.images.sizes
const quality = 90

function generateSrcSet(url) {
  return imageSizes
    .map((size) => `${getImageSrc({ url, size, quality })} ${size}w`)
    .join(', ')
}

export function renderPreloadLinks(preloads) {
  if (!preloads || preloads.length === 0) return ''

  return preloads
    .map((item) => {
      if (typeof item === 'string') {
        item = { as: 'image', href: item }
      }

      const { as, href, sizes, type } = item

      switch (as) {
        case 'image': {
          const srcset = generateSrcSet(href)
          const attrs = [
            `rel="preload"`,
            `as="image"`,
            `imagesrcset="${srcset}"`,
            sizes ? `imagesizes="${sizes}"` : `imagesizes="100vw"`,
          ]
          return `<link ${attrs.join(' ')}>`
        }

        case 'font': {
          const attrs = [
            `rel="preload"`,
            `as="font"`,
            `href="${href}"`,
            type ? `type="${type}"` : '',
            `crossorigin`,
          ].filter(Boolean)
          return `<link ${attrs.join(' ')}>`
        }

        default: {
          const attrs = [
            `rel="preload"`,
            `as="${as}"`,
            `href="${href}"`,
            type ? `type="${type}"` : '',
          ].filter(Boolean)
          return `<link ${attrs.join(' ')}>`
        }
      }
    })
    .join('\n')
}
