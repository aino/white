process.env.AWS_PAGER = ''

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const clientName = process.argv[2]
const clients = JSON.parse(readFileSync(resolve(ROOT, 'infra/clients.json'), 'utf-8'))

if (!clientName || !clients[clientName]) {
  console.error(clientName ? `Client "${clientName}" not found.` : 'Usage: npm run deploy <client>')
  console.error('Clients:', Object.keys(clients).join(', '))
  process.exit(1)
}

const client = clients[clientName]
const step = (msg) => console.log(`\n→ ${msg}`)
const run = (cmd, opts) => execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts })
const out = (cmd) => execSync(cmd, { encoding: 'utf-8', cwd: ROOT }).trim()

const start = Date.now()
console.log(`\nDeploying ${clientName} → ${client.distributionId}`)

// Build
step('Building assets + templates')
run('npm run build:isr')
run(`node scripts/bundle-lambda.js ${client.bucket}`)

// Upload assets
step('Uploading assets to S3')
run(`aws s3 sync dist/assets s3://${client.bucket}/assets/ --cache-control "public, max-age=31536000, immutable" --quiet`)

// Update Lambda
step('Updating Lambda')
const functionArn = out(
  `aws lambda list-functions --region us-east-1 --query "Functions[?contains(FunctionName, 'white-isr-${clientName}') && contains(FunctionName, 'IsrHandler')].FunctionArn | [0]" --output text`
)

if (!functionArn || functionArn === 'None') {
  console.error(`Lambda not found. Run initial CDK deploy first.`)
  process.exit(1)
}

run('cd infra/lambda/bundle && zip -j /tmp/white-lambda.zip index.js')
run(`aws lambda update-function-code --function-name ${functionArn} --zip-file fileb:///tmp/white-lambda.zip --region us-east-1 --no-cli-pager > /dev/null`)
run(`aws lambda wait function-updated --function-name ${functionArn} --region us-east-1`)
const version = out(`aws lambda publish-version --function-name ${functionArn} --region us-east-1 --query "Version" --output text`)
console.log(`  Published version ${version}`)

// Update CloudFront Lambda association
step('Updating CloudFront')
const cfRaw = out(`aws cloudfront get-distribution-config --id ${client.distributionId} --output json`)
const cfConfig = JSON.parse(cfRaw)
const etag = cfConfig.ETag
const distConfig = cfConfig.DistributionConfig

for (const assoc of distConfig.DefaultCacheBehavior.LambdaFunctionAssociations?.Items || []) {
  if (assoc.EventType === 'origin-request') {
    assoc.LambdaFunctionARN = assoc.LambdaFunctionARN.replace(/:\d+$/, `:${version}`)
  }
}

writeFileSync('/tmp/cf-update.json', JSON.stringify(distConfig))
run(`aws cloudfront update-distribution --id ${client.distributionId} --distribution-config file:///tmp/cf-update.json --if-match ${etag} --no-cli-pager > /dev/null`)

// Wait + invalidate
step('Waiting for CloudFront propagation (~3-5 min)')
run(`aws cloudfront wait distribution-deployed --id ${client.distributionId}`)
run(`aws cloudfront create-invalidation --distribution-id ${client.distributionId} --paths "/*" --no-cli-pager > /dev/null`)

const duration = ((Date.now() - start) / 1000).toFixed(0)
console.log(`\n✅ ${clientName} deployed in ${duration}s`)
