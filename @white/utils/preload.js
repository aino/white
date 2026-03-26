import { generateSrcSet } from './image'

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
          const attrs = [
            `rel="preload"`,
            `as="image"`,
            `imagesrcset="${generateSrcSet(href)}"`,
            `imagesizes="${sizes || '100vw'}"`,
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
