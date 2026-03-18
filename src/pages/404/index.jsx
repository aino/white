import Layout from 'src/components/Layout'

export default function NotFound({ title, locale, path }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>404</h1>
      <p>Page not found.</p>
      <p>
        <a href="/">← Home</a>
      </p>
    </Layout>
  )
}
