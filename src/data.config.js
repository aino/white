export const globalData = async () => {
  return {
    site: { name: 'White' },
    posts: [
      { slug: 'hello-world', title: 'Hello World', excerpt: 'Your first post.' },
      { slug: 'getting-started', title: 'Getting Started', excerpt: 'How to use White.' },
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
    slugs: (globalData) => globalData.posts.map((p) => p.slug),
    data: async ({ slug, globalData }) => {
      const post = globalData.posts.find((p) => p.slug === slug)
      return {
        title: post?.title,
        post,
        slug,
        path: `/about/${slug}`,
      }
    },
  },
  '/404': {
    data: () => ({ path: '/404', title: 'Not Found' }),
  },
}
