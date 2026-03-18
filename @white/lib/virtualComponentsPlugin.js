import { promises as fs } from 'fs'
import path from 'path'

export default function VirtualComponentsPlugin() {
  const virtualModuleId = 'white/components'
  const resolvedVirtualModuleId = '\0' + virtualModuleId

  // Define directory to scan for components
  const componentsDir = 'src/components'

  const scanDirectory = async (dir) => {
    const absDir = path.resolve(dir)
    try {
      const entries = await fs.readdir(absDir, { withFileTypes: true })
      let components = {}

      for (const entry of entries) {
        const fullPath = path.join(absDir, entry.name)
        const relativePath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // Look for [componentName].js file inside component directory
          const componentName = entry.name.toLowerCase()
          const jsFile = path.join(fullPath, `${componentName}.js`)
          
          try {
            await fs.access(jsFile)
            // Component script exists, add to registry
            components[componentName] = path.join(relativePath, `${componentName}.js`)
          } catch {
            // No JS file for this component, skip
          }
        }
      }

      return components
    } catch (error) {
      // Directory doesn't exist, return empty object
      return {}
    }
  }

  return {
    name: 'vite-plugin-virtual-components',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        let imports = ''
        let exports = []

        // Scan components directory for component scripts
        const components = await scanDirectory(componentsDir)
        
        for (const [componentName, componentPath] of Object.entries(components)) {
          const moduleName = `${componentName}Component`
          imports += `import ${moduleName} from '${componentPath}'\n`
          exports.push(`'${componentName}': ${moduleName}`)
        }

        // Generate virtual module content
        const moduleContent = `${imports}
// Auto-generated component registry
export default {
  ${exports.join(',\n  ')}
}
`
        return moduleContent
      }
    },
  }
}