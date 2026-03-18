import Image from 'src/components/Image'
import Video from 'src/components/Video'

export function ColumnContent({ image, video, html, title, width }) {
  return (
    <>
      {image && (
        <div class="image">
          <Image
            url={image.url}
            width={image.width}
            height={image.height}
            colWidth={width}
            alt={title}
          />
        </div>
      )}

      {video && <Video {...video} />}

      {html && <div class="html">{html}</div>}
    </>
  )
}

export default function Column({
  className = '',
  top,
  left,
  width,
  link,
  children,
}) {
  const classNames = ['col']
  let styles = {}

  if (top) {
    styles.top = `calc(var(--line) * ${top})`
  }

  if (left) {
    styles.left = `calc(var(--char2) * ${left})`
  }

  if (className) {
    classNames.push(className)
  }

  if (width) {
    classNames.push(`w${width}`)
  }

  if (link) {
    return (
      <a href={link} class={classNames.join(' ')} style={styles}>
        {children}
      </a>
    )
  }

  return (
    <div class={classNames.join(' ')} style={styles}>
      {children}
    </div>
  )
}
