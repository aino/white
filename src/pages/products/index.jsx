import Layout from 'src/components/Layout'

export default function Products({ title, locale, path, products }) {
  const grouped = {}
  for (const p of products) {
    ;(grouped[p.category] ||= []).push(p)
  }

  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>Products</h1>
      <p>
        These pages use nested dynamic <code>[category]/[slug]</code> routes.
      </p>
      {Object.entries(grouped).map(([category, items]) => (
        <>
          <h2>{category}</h2>
          <ul>
            {items.map((p) => (
              <li>
                <a href={`/products/${p.category}/${p.slug}`}>{p.name}</a>
              </li>
            ))}
          </ul>
        </>
      ))}
      <p>
        <a href="/">← Home</a>
      </p>
    </Layout>
  )
}
