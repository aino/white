import Layout from 'src/components/Layout'

export default function Home({ locale, path }) {
  return (
    <Layout locale={locale} path={path}>
      <h1>White</h1>
      <p>
        Performance-first frontend platform. Static HTML from JSX, SPA
        navigation, and persistent interactive components.
      </p>
      <div class="hero-image">
        <img
          src="/images/1210.webp"
          alt="Turntable"
          width="1080"
          height="1080"
        />
      </div>
    </Layout>
  )
}
