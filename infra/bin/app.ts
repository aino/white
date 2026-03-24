import * as cdk from 'aws-cdk-lib'
import { WhiteIsrStack } from '../lib/white-isr-stack.js'

const app = new cdk.App()

const clientName = app.node.tryGetContext('clientName')
const vercelUrl = app.node.tryGetContext('vercelUrl')

if (!clientName || !vercelUrl) {
  throw new Error(
    'Required context: --context clientName=xxx --context vercelUrl=xxx'
  )
}

const domain = app.node.tryGetContext('domain')
const alternativeDomains = app.node.tryGetContext('alternativeDomains')

new WhiteIsrStack(app, `white-isr-${clientName}`, {
  clientName,
  domain: domain || undefined,
  alternativeDomains: alternativeDomains?.split(','),
  vercelUrl,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
})
