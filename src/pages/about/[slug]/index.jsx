import Layout from 'src/components/Layout'

export default function Post({ title, locale, path, slug, post }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>{post?.title || slug}</h1>
      <p>{post?.excerpt}</p>
      <p>
        <a href="/about/">← Back</a>
      </p>
    </Layout>
  )
}
