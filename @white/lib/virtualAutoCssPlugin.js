import { promises as fs } from 'fs'
import path from 'path'

export default function VirtualAutoCssPlugin() {
  const virtualModuleId = 'white/css'
  const resolvedVirtualModuleId = '\0' + virtualModuleId

  // Define directories to scan
  const dirs = ['src/pages', 'src/components']

  const scanDirectory = async (dir) => {
    const absDir = path.resolve(dir)
    try {
      const entries = await fs.readdir(absDir, { withFileTypes: true })
      let cssFiles = []

      for (const entry of entries) {
        const fullPath = path.join(absDir, entry.name)
        const relativePath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subCssFiles = await scanDirectory(relativePath)
          cssFiles.push(...subCssFiles)
        } else if (entry.name.endsWith('.css')) {
          cssFiles.push(relativePath)
        }
      }

      return cssFiles
    } catch (error) {
      // Directory doesn't exist, return empty array
      return []
    }
  }

  return {
    name: 'vite-plugin-virtual-auto-css',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        let imports = ''

        // Scan all specified directories for CSS files
        for (const dir of dirs) {
          const cssFiles = await scanDirectory(dir)
          for (const cssFile of cssFiles) {
            imports += `import '${cssFile}'\n`
          }
        }

        // Generate virtual module content
        const moduleContent = `${imports}
// Auto-generated CSS imports from pages/ and components/ directories
export default 'auto-css loaded'
`
        return moduleContent
      }
    },
  }
}