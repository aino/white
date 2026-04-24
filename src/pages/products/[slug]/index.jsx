export default function ProductPage({ title, slug, category, id }) {
  return (
    <main id="app">
      <div className="content">
        <h1>{title}</h1>
        <p>Product ID: {id}</p>
        <p>Category: {category}</p>
        <p>Slug: {slug}</p>
        <p>
          <a href="/products">← Back to products</a>
        </p>
      </div>
    </main>
  )
}
