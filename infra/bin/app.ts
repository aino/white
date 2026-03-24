import * as cdk from 'aws-cdk-lib'
import { WhiteIsrStack } from '../lib/white-isr-stack.js'

const app = new cdk.App()

const clientName = app.node.tryGetContext('clientName')
const domain = app.node.tryGetContext('domain')
const vercelUrl = app.node.tryGetContext('vercelUrl')

if (!clientName || !domain || !vercelUrl) {
  throw new Error(
    'Required context: --context clientName=xxx --context domain=xxx --context vercelUrl=xxx'
  )
}

const alternativeDomains = app.node.tryGetContext('alternativeDomains')

new WhiteIsrStack(app, `white-isr-${clientName}`, {
  clientName,
  domain,
  alternativeDomains: alternativeDomains?.split(','),
  vercelUrl,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // Required for Lambda@Edge + ACM
  },
})
