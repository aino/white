export default function FlakyPage({ title, renderedAt }) {
  return (
    <main id="app">
      <div className="content">
        <h1>{title}</h1>
        <p>Rendered at: {renderedAt}</p>
        <p>This page fails on even minutes, succeeds on odd minutes.</p>
      </div>
    </main>
  )
}
