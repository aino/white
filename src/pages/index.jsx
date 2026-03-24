import Layout from 'src/components/Layout'
import Counter from 'src/components/Counter'

export default function Home({ locale, path, timestamp }) {
  return (
    <Layout locale={locale} path={path}>
      <h1 translate>White Framework</h1>
      {timestamp && (
        <p>
          <small>
            <span translate>Rendered:</span> {timestamp}
          </small>
        </p>
      )}
      <p translate>
        A static site generator with persistent component architecture. Navigate
        between pages and watch the counter keep its state.
      </p>
      <Counter value={0} pathname={path || '/'} />
      <nav>
        <h2 translate>Pages</h2>
        <ul>
          <li>
            <a href="/about" translate>
              About (static page)
            </a>
          </li>
          <li>
            <a href="/about/hello-world" translate>
              Hello World (dynamic slug)
            </a>
          </li>
          <li>
            <a href="/about/getting-started" translate>
              Getting Started (dynamic slug)
            </a>
          </li>
        </ul>
      </nav>
    </Layout>
  )
}
