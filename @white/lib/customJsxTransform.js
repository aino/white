import { transformWithOxc } from 'vite'

export default function customJsxTransform() {
  return {
    name: 'custom-jsx-transform',
    enforce: 'pre',
    async transform(code, id) {
      // Skip node_modules
      if (id.includes('node_modules')) {
        return null
      }

      // Handle JSX files
      if (id.endsWith('.jsx') || id.endsWith('.tsx')) {
        const lang = id.endsWith('.tsx') ? 'tsx' : 'jsx'

        // For react directory files, use React's JSX transform
        if (id.includes('/react/')) {
          const result = await transformWithOxc(code, id, {
            lang,
            jsx: { runtime: 'automatic' },
          })
          return result
        } else {
          // For other JSX files, use custom h function
          const codeWithImport = `import { h, Fragment } from 'lib/jsx-runtime'\n${code}`
          const result = await transformWithOxc(codeWithImport, id, {
            lang,
            jsx: {
              runtime: 'classic',
              pragma: 'h',
              pragmaFrag: 'Fragment',
            },
          })
          return result
        }
      }

      return null
    }
  }
}
