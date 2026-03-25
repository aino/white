import Layout from 'src/components/Layout'
import Counter from 'src/components/Counter'

export default function Home({ locale, path, timestamp }) {
  return (
    <Layout locale={locale} path={path}>
      <h1>White</h1>
      {timestamp && <p><small>Rendered: {timestamp}</small></p>}
      <p>
        A static site generator with persistent component architecture. Navigate
        between pages and watch the counter keep its state.
      </p>
      <Counter value={0} pathname={path || '/'} />
      <nav>
        <h2>Pages</h2>
        <ul>
          <li>
            <a href="/about">About (static page)</a>
          </li>
          <li>
            <a href="/about/hello-world">Hello World (dynamic slug)</a>
          </li>
          <li>
            <a href="/about/getting-started">Getting Started (dynamic slug)</a>
          </li>
        </ul>
      </nav>
    </Layout>
  )
}
