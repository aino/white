import Layout from 'src/components/Layout'
import Counter from 'src/components/Counter'

export default function About({ title, locale, path }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>{title}</h1>
      <p>
        This is a static page. The counter below is the same persistent
        component from the home page — its state survives navigation because it
        has a <code>key</code> attribute.
      </p>
      <Counter value={0} pathname={path} />
      <p>
        <a href="/">← Home</a>
      </p>
    </Layout>
  )
}
