export default function ProductsPage({ title, products }) {
  return (
    <main id="app">
      <div className="content">
        <h1>{title}</h1>
        <p>Showing {products.length} of 500 products</p>
        <ul>
          {products.map((p) => (
            <li key={p.slug}>
              <a href={`/products/${p.slug}`}>{p.title}</a> ({p.category})
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
// Fri Apr 24 14:36:08 CEST 2026
