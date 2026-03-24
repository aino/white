import { createServer } from 'vite'
import { getPageContext } from './getPageContext.js'
import { LOCALES } from '../../src/config.js'
import compileTemplate from './compileTemplate.js'
import getDynamicRoutes from './getDynamicRoutes.js'

export default function jsxToHtmlPlugin() {
  return {
    name: 'jsx-to-html',

    // Remove load hook to let Vite handle JSX normally

    async generateBundle(options, bundle) {
      // Skip HTML generation when building assets only (ISR mode)
      if (process.env.WHITE_ASSETS_ONLY) return

      // Get dynamic paths for processing
      const { dynamicPaths } = await getDynamicRoutes()

      // Find JSX chunks and convert them to HTML files
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'custom',
        optimizeDeps: {
          noDiscovery: true,
          include: [],
        },
        esbuild: {
          jsx: 'transform',
          jsxFactory: 'h',
          jsxFragment: 'Fragment',
          jsxInject: `import { h, Fragment } from 'lib/jsx-runtime'\nimport { t } from '@white/translate'`,
        },
      })

      try {
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (
            chunk.type === 'chunk' &&
            chunk.facadeModuleId?.endsWith('.jsx')
          ) {
            const jsxPath = chunk.facadeModuleId

            try {
              // Skip React components during build
              if (jsxPath.includes('/react/')) {
                continue
              }
              
              // Generate HTML file instead of JS chunk
              let routeKey =
                jsxPath
                  .split('/pages/')[1]
                  .replace('.jsx', '')
                  .replace(/\/index$/, '') || ''
              // Handle root index file
              if (routeKey === 'index') routeKey = ''

              // Check if this is a dynamic route template
              const isDynamicTemplate = routeKey.includes('[slug]')

              if (isDynamicTemplate) {
                // For dynamic templates, generate HTML for each dynamic path
                for (const dynamicPath of dynamicPaths) {
                  // Check if this dynamic path uses this template
                  const templatePattern = routeKey.replace('[slug]', '([^/]+)')
                  const regex = new RegExp(`^${templatePattern}$`)
                  const pathToTest = dynamicPath.replace(/^\//, '')
                  const matches = regex.test(pathToTest)
                  if (matches) {
                    for (const locale of LOCALES) {
                      const url =
                        locale === LOCALES[0]
                          ? dynamicPath
                          : `/${locale}${dynamicPath}`

                      const pageContext = await getPageContext(url)
                      if (pageContext) {
                        const { data } = pageContext

                        // Use compileTemplate which handles JSX properly
                        let html
                        try {
                          html = await compileTemplate(
                            jsxPath,
                            { ...data, locale: locale },
                            vite,
                            { locales: LOCALES }
                          )
                        } catch (error) {
                          console.warn(`Failed to compile template ${jsxPath}:`, error.message)
                          continue
                        }
                        
                        if (!html || typeof html !== 'string') {
                          console.warn(`Template ${jsxPath} returned invalid HTML`)
                          continue
                        }

                        // ... (CSS and asset processing will be added after this block)

                        // Determine output filename for dynamic path
                        let htmlFileName
                        const pathWithoutSlash = dynamicPath.replace(/^\//, '')
                        htmlFileName =
                          locale === LOCALES[0]
                            ? `${pathWithoutSlash}/index.html`
                            : `${locale}/${pathWithoutSlash}/index.html`

                        // Add CSS and asset processing here
                        // Replace @/ imports with actual asset paths and add CSS links
                        html = html.replace(
                          /import\s*["'][^"']*@white\/white\.js["']/g,
                          () => {
                            // Find the white.js asset in the bundle
                            const whiteAsset = Object.values(bundle).find(
                              (asset) =>
                                asset.name === 'white.js' ||
                                (asset.facadeModuleId &&
                                  asset.facadeModuleId.includes(
                                    '@white/white.js'
                                  ))
                            )
                            if (whiteAsset) {
                              return `import "/${whiteAsset.fileName}"`
                            }
                            return `import "/@white/white.js"` // fallback
                          }
                        )

                        // Add CSS links to the head
                        const cssAssets = Object.values(bundle).filter(
                          (asset) =>
                            asset.type === 'asset' &&
                            asset.fileName.endsWith('.css')
                        )

                        if (cssAssets.length > 0) {
                          const cssLinks = cssAssets
                            .map(
                              (asset) =>
                                `<link rel="stylesheet" href="/${asset.fileName}">`
                            )
                            .join('')
                          html = html.replace('</head>', `${cssLinks}</head>`)
                        }

                        // Emit HTML file
                        this.emitFile({
                          type: 'asset',
                          fileName: htmlFileName,
                          source: html,
                        })
                      }
                    }
                  }
                }
              } else {
                // For regular (non-dynamic) routes
                for (const locale of LOCALES) {
                  const url =
                    locale === LOCALES[0]
                      ? routeKey === ''
                        ? '/'
                        : `/${routeKey}`
                      : routeKey === ''
                      ? `/${locale}`
                      : `/${locale}/${routeKey}`

                  const pageContext = await getPageContext(url)
                  if (pageContext) {
                    const { data } = pageContext

                    // Use compileTemplate which handles JSX properly
                    let html = await compileTemplate(
                      jsxPath,
                      { ...data, locale: locale },
                      vite,
                      { locales: LOCALES }
                    )

                    // Replace @/ imports with actual asset paths and add CSS links
                    html = html.replace(
                      /import\s*["'][^"']*@white\/white\.js["']/g,
                      () => {
                        // Find the white.js asset in the bundle
                        const whiteAsset = Object.values(bundle).find(
                          (asset) =>
                            asset.name === 'white.js' ||
                            (asset.facadeModuleId &&
                              asset.facadeModuleId.includes('@white/white.js'))
                        )
                        if (whiteAsset) {
                          return `import "/${whiteAsset.fileName}"`
                        }
                        return `import "/@white/white.js"` // fallback
                      }
                    )

                    // Add CSS links to the head
                    const cssAssets = Object.values(bundle).filter(
                      (asset) =>
                        asset.type === 'asset' &&
                        asset.fileName.endsWith('.css')
                    )

                    if (cssAssets.length > 0) {
                      const cssLinks = cssAssets
                        .map(
                          (asset) =>
                            `<link rel="stylesheet" href="/${asset.fileName}">`
                        )
                        .join('')
                      html = html.replace('</head>', `${cssLinks}</head>`)
                    }

                    // Determine output filename
                    let htmlFileName
                    if (routeKey === '') {
                      htmlFileName =
                        locale === LOCALES[0]
                          ? 'index.html'
                          : `${locale}/index.html`
                    } else {
                      htmlFileName =
                        locale === LOCALES[0]
                          ? `${routeKey}/index.html`
                          : `${locale}/${routeKey}/index.html`
                    }

                    // Emit HTML file
                    this.emitFile({
                      type: 'asset',
                      fileName: htmlFileName,
                      source: html,
                    })
                  }
                }
              }

              // Remove the JS chunk since we converted it to HTML
              delete bundle[fileName]
            } catch (err) {
              console.error(`Error processing JSX ${jsxPath}:`, err)
            }
          }
        }
      } finally {
        await vite.close()
      }
    },
  }
}
