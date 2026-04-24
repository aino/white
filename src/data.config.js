// Environment variables: use process.env.X directly (not destructured).
// Values from .env are injected at build time for Lambda compatibility.

// Generate 500 products for stress testing
const PRODUCT_COUNT = 500
const products = Array.from({ length: PRODUCT_COUNT }, (_, i) => ({
  id: i + 1,
  slug: `product-${String(i + 1).padStart(3, '0')}`,
  title: `Product ${i + 1}`,
  category: ['jeans', 'shirts', 'jackets', 'shoes', 'accessories'][i % 5],
}))

const productsBySlug = Object.fromEntries(products.map((p) => [p.slug, p]))
const productSlugs = products.map((p) => ({ slug: p.slug }))

export const globalData = async ({ locale } = {}) => {
  return {
    site: { name: 'White' },
    productCount: PRODUCT_COUNT,
  }
}

export const routes = {
  '/': {
    data: async () => ({ path: '' }),
  },
  '/about': {
    data: async () => ({ title: 'About', path: '/about' }),
  },
  '/products': {
    data: async () => ({
      title: 'Products',
      products: products.slice(0, 20),
      path: '/products',
    }),
  },
  '/products/[slug]': {
    params: () => productSlugs,
    data: async ({ slug }) => {
      const product = productsBySlug[slug]
      if (!product) return null
      return {
        ...product,
        path: `/products/${slug}`,
      }
    },
  },
  '/404': {
    data: () => ({ path: '/404', title: 'Not Found' }),
  },
  '/500': {
    data: () => ({ path: '/500', title: 'Server Error' }),
  },
  // Error testing routes
  '/test/error': {
    data: async () => {
      throw new Error('Simulated API failure')
    },
  },
  '/test/flaky': {
    data: async () => {
      // Fail on even minutes (allows testing cache → fail scenario)
      const minute = new Date().getMinutes()
      if (minute % 2 === 0) {
        throw new Error('Flaky API failure (even minute)')
      }
      return { title: 'Flaky Page', renderedAt: new Date().toISOString() }
    },
  },
}
