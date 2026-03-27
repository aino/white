import Layout from 'src/components/Layout'

export default function Product({ title, locale, path, category, slug }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>{title}</h1>
      <p>
        This page demonstrates nested dynamic routes. Both{' '}
        <code>[category]</code> and <code>[slug]</code> are extracted from the
        URL and passed as props.
      </p>
      <p class="route">
        Route: /products/[category]/[slug] → /products/{category}/{slug}
      </p>
    </Layout>
  )
}
