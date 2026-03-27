import Layout from 'src/components/Layout'

export default function Post({ title, locale, path, slug }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>{title}</h1>
      <p>
        This page demonstrates a dynamic <code>[slug]</code> route. The slug
        value <code>{slug}</code> is extracted from the URL and passed as a prop
        to the page template.
      </p>
      <p class="route">Route: /about/[slug] → /about/{slug}</p>
    </Layout>
  )
}
