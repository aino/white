import Layout from 'src/components/Layout'

export default function About({ title, locale, path }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>About</h1>
      <p>This is a static page example.</p>
      <p>
        <a href="/">← Home</a>
      </p>
    </Layout>
  )
}
