import Layout from 'src/components/Layout'

export default function ServerError({ title, locale, path }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>500</h1>
      <p>Something went wrong.</p>
      <p>
        <a href="/">← Home</a>
      </p>
    </Layout>
  )
}
