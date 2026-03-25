import { execSync } from 'child_process'
import { ISR } from '../src/config.js'

if (ISR) {
  console.log('ISR mode — building assets + templates (no HTML)')
  execSync('npm run build:isr', { stdio: 'inherit' })
} else {
  console.log('Static mode — building HTML + assets + templates')
  execSync('npm run build && node scripts/compile-templates.js', { stdio: 'inherit' })
}
