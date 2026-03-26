import vercel from '../../vercel.json'

// Use Vercel image optimization only when deployed on Vercel
// VERCEL env var is exposed via envPrefix in vite config
const isVercel = !!import.meta.env.VERCEL

export const getImageSrc = ({ url, size, quality }) => {
  if (!url) {
    console.warn('getImageSrc called with undefined url')
    return url
  }
  const encodedUrl = encodeURIComponent(url)
  if (isVercel) {
    return `/_vercel/image?url=${encodedUrl}&w=${size}&q=${quality}`
  } else {
    return `/_sharp/?path=${encodedUrl}&w=${size}&q=${quality}`
  }
}

const imageSizes = vercel.images.sizes
const defaultQuality = 90

export default function Image({
  url,
  width,
  height,
  sizes,
  alt,
  quality,
  priority,
  type,
  ...props
}) {
  if (!url) {
    console.warn('No URL provided for Image component')
    return null
  }

  // Video passthrough
  const isVideo = type === 'video' || url.endsWith('.mp4')
  if (isVideo) {
    return (
      <video
        src={url}
        width={width}
        height={height}
        autoplay
        loop
        muted
        playsinline
        crossorigin="anonymous"
        {...props}
      />
    )
  }

  // Data URIs and placeholders — no optimization
  if (url.startsWith('data:')) {
    return <img src={url} alt={alt || ''} {...props} />
  }

  const q = quality || defaultQuality
  let src = url
  let imageProps = {}

  if (width) {
    const size = imageSizes.reduce((prev, curr) =>
      Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev
    )
    src = getImageSrc({ url, size, quality: q })
    imageProps.width = width
    if (height) {
      imageProps.height = height
    }
  }

  if (sizes) {
    imageProps.sizes = sizes
  }

  const srcSet = imageSizes
    .map((size) => `${getImageSrc({ url, size, quality: q })} ${size}w`)
    .join(', ')

  if (priority) {
    imageProps.loading = 'eager'
    imageProps.fetchpriority = 'high'
  } else {
    imageProps.loading = 'lazy'
  }

  return (
    <img src={src} srcSet={srcSet} alt={alt || ''} {...imageProps} {...props} />
  )
}
