import Layout from 'src/components/Layout'

export default function Home({ locale, path }) {
  return (
    <Layout locale={locale} path={path}>
      <h1>White</h1>
      <p>A static site generator with persistent component architecture.</p>
      <nav>
        <ul>
          <li>
            <a href="/about/">About</a>
          </li>
          <li>
            <a href="/about/hello-world/">Hello World</a>
          </li>
          <li>
            <a href="/about/getting-started/">Getting Started</a>
          </li>
        </ul>
      </nav>
    </Layout>
  )
}
