export default function jsxRuntimeInjector() {
  return {
    name: 'jsx-runtime-injector',
    transform(code, id) {
      // Only process .js files (not .jsx files, they already get JSX injection)
      if (!id.endsWith('.js') || id.includes('node_modules')) return
      
      // Check if the file imports any .jsx files
      const importJsxRegex = /import.*from\s+['"].*\.jsx['"]|import.*['"].*\.jsx['"]/
      
      if (importJsxRegex.test(code)) {
        // Inject the JSX runtime at the top
        return {
          code: `import { h, Fragment } from 'lib/jsx-runtime'\n${code}`,
          map: null
        }
      }
    }
  }
}