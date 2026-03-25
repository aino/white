import { minify } from 'html-minifier-terser'

export default async function compileTemplate(templatePath, data, viteServer) {
  // Render JSX component using the existing Vite server
  const jsxPath = templatePath.replace('.html', '.jsx')

  try {
    const module = await viteServer.ssrLoadModule(jsxPath)
    const Component = module.default

    if (!Component) {
      throw new Error(`No default export in ${jsxPath}`)
    }

    const html = '<!DOCTYPE html>' + Component(data)

    return await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      minifyCSS: true,
      minifyJS: true,
    })
  } catch (err) {
    console.error(`Error rendering JSX ${jsxPath}:`, err)
    throw err
  }
}
