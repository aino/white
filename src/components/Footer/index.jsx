export default function Footer({ timestamp }) {
  return (
    <footer data-component="footer">
      <p>Built with White{timestamp && ` · Rendered at ${timestamp}`}</p>
    </footer>
  )
}
