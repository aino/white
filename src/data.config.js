// Environment variables: use process.env.X directly (not destructured).
// Values from .env are injected at build time for Lambda compatibility.

export const globalData = async ({ locale } = {}) => {
  return {
    site: { name: 'White' },
  }
}

export const routes = {
  '/': {
    data: async () => ({ path: '' }),
  },
  '/about': {
    data: async () => ({ title: 'About', path: '/about' }),
  },
  '/about/[slug]': {
    params: () => [{ slug: 'hello-world' }],
    data: async ({ slug }) => {
      if (slug !== 'hello-world') return null
      return {
        title: 'Hello World',
        slug,
        path: `/about/${slug}`,
      }
    },
  },
  '/products/[category]/[slug]': {
    params: () => [{ category: 'jeans', slug: 'slim-finn' }],
    data: async ({ category, slug }) => {
      if (category !== 'jeans' || slug !== 'slim-finn') return null
      return {
        title: 'Slim Finn',
        category,
        slug,
        path: `/products/${category}/${slug}`,
      }
    },
  },
  '/404': {
    data: () => ({ path: '/404', title: 'Not Found' }),
  },
  '/500': {
    data: () => ({ path: '/500', title: 'Server Error' }),
  },
}
