import * as cdk from 'aws-cdk-lib'
import { WhiteIsrStack } from '../lib/white-isr-stack.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const configPath = resolve(__dirname, '../../isr.config.js')
const config = (await import(configPath)).default

if (!config.name || !config.vercelUrl) {
  throw new Error('isr.config.js must have name and vercelUrl')
}

const app = new cdk.App()

// Allow overrides via --context
const revalidateSecret =
  app.node.tryGetContext('revalidateSecret') ||
  process.env.REVALIDATE_SECRET ||
  `white-${config.name}-${Date.now()}`

new WhiteIsrStack(app, `white-isr-${config.name}`, {
  clientName: config.name,
  domain: config.domain,
  alternativeDomains: app.node.tryGetContext('alternativeDomains')?.split(','),
  vercelUrl: config.vercelUrl,
  revalidateSecret,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
})
