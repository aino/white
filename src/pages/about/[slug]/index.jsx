import Layout from 'src/components/Layout'
import Counter from 'src/components/Counter'

export default function Post({ title, locale, path, slug, post }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1 translate>{post?.title || slug}</h1>
      <p>{post?.excerpt}</p>
      <p>
        This page was generated from a dynamic <code>[slug]</code> route. The
        slug value is: <strong>{slug}</strong>
      </p>
      <Counter value={0} pathname={path} />
      <p>
        <a href="/about">← About</a>
      </p>
    </Layout>
  )
}
