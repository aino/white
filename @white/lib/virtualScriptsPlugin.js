import { promises as fs } from 'fs'
import path from 'path'

export default function VirtualScriptsPlugin() {
  const virtualModuleId = 'white/scripts'
  const resolvedVirtualModuleId = '\0' + virtualModuleId

  // Define directories to scan
  const dirs = ['src/pages']

  const scanDirectory = async (dir) => {
    const absDir = path.resolve(dir)
    try {
      const entries = await fs.readdir(absDir, { withFileTypes: true })
      let jsFiles = []

      for (const entry of entries) {
        const fullPath = path.join(absDir, entry.name)
        const relativePath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subJsFiles = await scanDirectory(relativePath)
          jsFiles.push(...subJsFiles)
        } else if (entry.name.endsWith('.js')) {
          jsFiles.push(relativePath)
        }
      }

      return jsFiles
    } catch (error) {
      // Directory doesn't exist, return empty array
      return []
    }
  }

  return {
    name: 'vite-plugin-virtual-scripts',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        let imports = ''
        let exports = []

        // Scan all specified directories for JS files
        for (const dir of dirs) {
          const jsFiles = await scanDirectory(dir)
          for (const jsFile of jsFiles) {
            // Create unique module name by including directory path
            const relativePath = jsFile.replace(/^src\/pages\//, '').replace(/\.js$/, '')
            const moduleName = relativePath.replace(/[^a-zA-Z0-9_$]/g, '_')
            const importPath = jsFile

            imports += `import * as ${moduleName} from '${importPath}'\n`
            exports.push(moduleName)
          }
        }

        // Generate virtual module content
        const moduleContent = `
${imports}
export default [${exports.join(', ')}]
`
        return moduleContent
      }
    },
  }
}
