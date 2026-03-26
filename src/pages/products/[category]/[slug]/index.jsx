import Layout from 'src/components/Layout'

export default function Product({
  title,
  locale,
  path,
  category,
  slug,
  product,
}) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>{product?.name || slug}</h1>
      <p>
        This page uses nested dynamic <code>[category]/[slug]</code> params:{' '}
        <strong>{category}</strong> / <strong>{slug}</strong>
      </p>
      <p>
        <a href="/products">← Products</a>
      </p>
    </Layout>
  )
}
