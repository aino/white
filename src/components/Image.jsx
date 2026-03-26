import { getImageSrc, generateSrcSet, imageSizes } from '@white/utils/image'

export default function Image({
  url,
  width,
  height,
  sizes,
  alt,
  quality,
  priority,
  ...props
}) {
  if (!url) {
    console.warn('No URL provided for Image component')
    return null
  }

  // Data URIs — no optimization
  if (url.startsWith('data:')) {
    return <img src={url} alt={alt || ''} {...props} />
  }

  let src = url
  let imageProps = {}

  if (width) {
    const size = imageSizes.reduce((prev, curr) =>
      Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev
    )
    src = getImageSrc({ url, size, quality })
    imageProps.width = width
    if (height) {
      imageProps.height = height
    }
  }

  if (sizes) {
    imageProps.sizes = sizes
  }

  if (priority) {
    imageProps.loading = 'eager'
    imageProps.fetchpriority = 'high'
  } else {
    imageProps.loading = 'lazy'
  }

  return (
    <img
      src={src}
      srcSet={generateSrcSet(url, quality)}
      alt={alt || ''}
      {...imageProps}
      {...props}
    />
  )
}
