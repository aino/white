import { transformWithEsbuild } from 'vite'

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
        // For react directory files, use React's JSX transform
        if (id.includes('/react/')) {
          const result = await transformWithEsbuild(code, id, {
            jsx: 'automatic',
            loader: id.endsWith('.tsx') ? 'tsx' : 'jsx'
          })
          return result
        } else {
          // For other JSX files, use custom h function
          const codeWithImport = `import { h, Fragment } from 'lib/jsx-runtime'\n${code}`
          const result = await transformWithEsbuild(codeWithImport, id, {
            jsx: 'transform',
            jsxFactory: 'h',
            jsxFragment: 'Fragment',
            loader: id.endsWith('.tsx') ? 'tsx' : 'jsx'
          })
          return result
        }
      }
      
      return null
    }
  }
}