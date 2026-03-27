import Layout from 'src/components/Layout'

export default function About({ title, locale, path }) {
  return (
    <Layout locale={locale} title={title} path={path}>
      <h1>About</h1>
      <p>
        White renders static HTML from JSX at build time. Client-side navigation
        prefetches on hover and swaps the content area.
      </p>
      <p>
        Components with a <code>key</code> attribute persist across pages — same
        DOM node, same state, same listeners.
      </p>
    </Layout>
  )
}
