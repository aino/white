export default function Layout({
  locale,
  children,
  bodyclass,
  title,
  description,
  image,
  path,
}) {
  const siteName = 'White'
  const siteUrl = ''

  return (
    <html lang={locale || 'en'} data-component="layout">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {description && (
          <>
            <meta name="description" content={description} />
            <meta property="og:description" content={description} />
          </>
        )}
        {image && (
          <>
            <meta property="og:image" content={image.url} />
            {image.width && (
              <meta property="og:image:width" content={image.width} />
            )}
            {image.height && (
              <meta property="og:image:height" content={image.height} />
            )}
          </>
        )}
        {title ? (
          <>
            <title>
              {title} — {siteName}
            </title>
            <meta property="og:title" content={`${title} — ${siteName}`} />
          </>
        ) : (
          <>
            <title>{siteName}</title>
            <meta property="og:title" content={siteName} />
          </>
        )}
        {siteUrl && (
          <>
            <meta property="og:url" content={`${siteUrl}${path || ''}`} />
            <link rel="canonical" href={`${siteUrl}${path || ''}`} />
          </>
        )}
        {/* Prescript: detect dark mode before paint to prevent flash */}
        <script type="text/javascript">{`
          ;((html) => {
            const site = localStorage.getItem('site')
            if (site) {
              const json = JSON.parse(site)
              if (json?.appearance === 'dark') {
                html.classList.add('dark')
              }
            }
            html.classList.add('js')
          })(document.documentElement)
        `}</script>
        <script type="module">import '@white/white.js'</script>
      </head>
      <body class={bodyclass}>
        <main id="app">{children}</main>
      </body>
    </html>
  )
}
