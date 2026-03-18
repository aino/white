export default function Video({ width, height, url }) {
  return (
    <div
      class="video"
      style={width && height ? { aspectRatio: `${width} / ${height}` } : {}}
    >
      <video
        src={url}
        autoplay
        playsinline
        loop
        muted
        preload="auto"
        width={width}
        height={height}
        crossorigin="anonymous"
      />
    </div>
  )
}
