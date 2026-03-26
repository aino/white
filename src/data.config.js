export const globalData = async ({ locale } = {}) => {
  return {
    site: { name: 'White' },
    posts: [
      { slug: 'hello-world', title: 'Hello World', excerpt: 'Your first post.' },
      { slug: 'getting-started', title: 'Getting Started', excerpt: 'How to use White.' },
    ],
    products: [
      { category: 'jeans', slug: 'slim-finn', name: 'Slim Finn' },
      { category: 'jeans', slug: 'lean-dean', name: 'Lean Dean' },
      { category: 'shirts', slug: 'henry-shirt', name: 'Henry Shirt' },
    ],
  }
}

export const routes = {
  '/': {
    data: async () => ({
      path: '',
      timestamp: new Date().toISOString(),
    }),
  },
  '/about': {
    data: async () => ({
      title: 'About',
      path: '/about',
    }),
  },
  '/about/[slug]': {
    params: (globalData) => globalData.posts.map((p) => ({ slug: p.slug })),
    data: async ({ slug, globalData }) => {
      const post = globalData.posts.find((p) => p.slug === slug)
      if (!post) return null
      return {
        title: post?.title,
        post,
        slug,
        path: `/about/${slug}`,
      }
    },
  },
  '/products': {
    data: async ({ globalData }) => ({
      title: 'Products',
      products: globalData.products,
      path: '/products',
    }),
  },
  '/products/[category]/[slug]': {
    params: (globalData) =>
      globalData.products.map((p) => ({ category: p.category, slug: p.slug })),
    data: async ({ category, slug, globalData }) => {
      const product = globalData.products.find(
        (p) => p.category === category && p.slug === slug
      )
      if (!product) return null
      return {
        title: `${product.name} — ${category}`,
        product,
        category,
        slug,
        path: `/products/${category}/${slug}`,
      }
    },
  },
  '/404': {
    data: () => ({ path: '/404', title: 'Not Found' }),
  },
}
