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

export default function Image({
  colWidth,
  url,
  width,
  height,
  sizes,
  alt,
  type,
  ...props
}) {
  colWidth = colWidth || 2
  if (!url) {
    console.warn('No URL provided for Image component')
    return null
  }

  // Check if this is a video (by type prop or URL extension)
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

  if (url.startsWith('data:')) {
    return <img src={url} alt={alt || ''} {...props} />
  }

  if (url === 'placeholder') {
    return (
      <img
        class="placeholder"
        src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
        alt={alt || ''}
        {...props}
      />
    )
  }

  if (colWidth && !sizes) {
    const fraction = colWidth / 8
    sizes = `(max-width: 768px) 75vw, ${fraction * 100}vw`
  }

  const imageSizes = vercel.images.sizes
  const quality = 90
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

  const srcSet = imageSizes
    .map((size) => `${getImageSrc({ url, size, quality })} ${size}w`)
    .join(', ')

  return (
    <img src={src} srcSet={srcSet} alt={alt || ''} {...imageProps} {...props} />
  )
}
