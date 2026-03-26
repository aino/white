import { resolve, join } from 'path'
import { PAGES_DIR } from './index'
import fs from 'fs'
import { globSync } from 'glob'
import { LOCALES } from '../../src/config.js'

/**
 *
 * @param {Array} dynamic
 * @returns
 */
export default function dynamicFiles(dynamic) {
  return {
    name: 'dynamic-files',
    enforce: 'pre',

    async buildStart() {
      if (process.env.NODE_ENV === 'development') return

      this.tempFiles = []

      // 1. Generate dynamic files
      for (const entry of dynamic) {
        const { expanded, pattern } = typeof entry === 'string'
          ? { expanded: entry, pattern: entry }
          : entry
        const paths = expanded.replace(/^\//, '').split('/')
        const tempDir = resolve(__dirname, '../../', PAGES_DIR, ...paths)
        const tempFilePath = resolve(tempDir, 'index.html')

        // Resolve the JSX template from the route pattern
        const templatePath = resolve(
          __dirname,
          '../../',
          PAGES_DIR,
          pattern.replace(/^\//, ''),
          'index.jsx'
        )

        if (!fs.existsSync(templatePath)) {
          throw new Error(`Could not find JSX template ${templatePath}`)
        }

        fs.mkdirSync(tempDir, { recursive: true })

        // Create a temporary HTML file that references the JSX
        const htmlContent =
          '<!DOCTYPE html><html><head></head><body></body></html>'
        fs.writeFileSync(tempFilePath, htmlContent)
        this.tempFiles.push(tempFilePath)
      }

      // 2. Find all index.html files
      const htmlFiles = globSync('**/index.html', {
        cwd: resolve(__dirname, '../../', PAGES_DIR),
        absolute: false,
      })

      // 3. Copy files into locale-specific directories
      for (const locale of LOCALES.slice(1)) {
        for (const file of htmlFiles) {
          const orig = resolve(__dirname, '../../', PAGES_DIR, file)
          const dir = resolve(
            __dirname,
            '../../',
            PAGES_DIR,
            locale,
            file.replace(/\/?index\.html$/, '')
          )
          fs.mkdirSync(dir, { recursive: true })
          const tempFilePath = join(dir, 'index.html')
          fs.copyFileSync(orig, tempFilePath)
        }
      }
    },

    closeBundle() {
      this.tempFiles?.forEach((file) => {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file)
            const dir = resolve(file, '..')
            if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
              fs.rmdirSync(dir)
            }
          }
        } catch (e) {
          // Silently ignore cleanup errors
        }
      })
      LOCALES.slice(1).forEach((locale) => {
        const dir = resolve(__dirname, '../../', PAGES_DIR, locale)
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true })
        }
      })
    },
  }
}
