// Disable AWS CLI pager so output doesn't hang
process.env.AWS_PAGER = ''

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const clientName = process.argv[2]

if (!clientName) {
  const clients = JSON.parse(readFileSync(resolve(ROOT, 'infra/clients.json'), 'utf-8'))
  console.error('Usage: node scripts/deploy.js <client-name>')
  console.error('Available clients:', Object.keys(clients).join(', '))
  process.exit(1)
}

const clients = JSON.parse(readFileSync(resolve(ROOT, 'infra/clients.json'), 'utf-8'))
const client = clients[clientName]

if (!client) {
  console.error(`Client "${clientName}" not found in infra/clients.json`)
  process.exit(1)
}

const run = (cmd) => {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT })
}

console.log(`\nDeploying ${clientName}...`)
console.log(`  Bucket: ${client.bucket}`)
console.log(`  Distribution: ${client.distributionId}`)

// 1. Build assets + templates
run('npm run build:isr')

// 2. Bundle Lambda with bucket name
run(`node scripts/bundle-lambda.js ${client.bucket}`)

// 3. Upload assets to S3
run(`aws s3 sync dist/assets s3://${client.bucket}/assets/ --cache-control "public, max-age=31536000, immutable"`)

// 4. Update Lambda function code
const lambdaName = `white-isr-${clientName}`
const functionArn = execSync(
  `aws lambda list-functions --region us-east-1 --query "Functions[?contains(FunctionName, '${lambdaName}') && contains(FunctionName, 'IsrHandler')].FunctionArn | [0]" --output text`,
  { encoding: 'utf-8' }
).trim()

if (!functionArn) {
  console.error(`\nLambda function not found for ${lambdaName}. Run initial CDK deploy first:`)
  console.error(`  cd infra && npx cdk deploy --context clientName=${clientName} --context vercelUrl=${client.vercelUrl} --context revalidateSecret=${client.revalidateSecret}`)
  process.exit(1)
}

// Create zip from bundle
run('cd infra/lambda/bundle && zip -j /tmp/white-lambda.zip index.js')

// Update function code
run(`aws lambda update-function-code --function-name ${functionArn} --zip-file fileb:///tmp/white-lambda.zip --region us-east-1`)

// Wait for update to complete
run(`aws lambda wait function-updated --function-name ${functionArn} --region us-east-1`)

// Publish new version
const versionOutput = execSync(
  `aws lambda publish-version --function-name ${functionArn} --region us-east-1 --query "Version" --output text`,
  { encoding: 'utf-8' }
).trim()

console.log(`\nPublished Lambda version: ${versionOutput}`)

// 5. Update CloudFront to use new Lambda version
console.log('\nUpdating CloudFront distribution...')
run(`aws cloudfront get-distribution-config --id ${client.distributionId} --output json > /tmp/cf-config.json`)

// Update the Lambda association version in the config
const cfConfig = JSON.parse(readFileSync('/tmp/cf-config.json', 'utf-8'))
const etag = cfConfig.ETag
const distConfig = cfConfig.DistributionConfig

// Find and update Lambda@Edge association
const defaultBehavior = distConfig.DefaultCacheBehavior
if (defaultBehavior.LambdaFunctionAssociations?.Items) {
  for (const assoc of defaultBehavior.LambdaFunctionAssociations.Items) {
    if (assoc.EventType === 'origin-request') {
      // Replace version number in ARN
      assoc.LambdaFunctionARN = assoc.LambdaFunctionARN.replace(/:\d+$/, `:${versionOutput}`)
    }
  }
}

const { writeFileSync } = await import('fs')
writeFileSync('/tmp/cf-update.json', JSON.stringify(distConfig))

run(`aws cloudfront update-distribution --id ${client.distributionId} --distribution-config file:///tmp/cf-update.json --if-match ${etag} --output text --query "Distribution.Status"`)

// Wait for CloudFront to finish deploying the new config
console.log('Waiting for CloudFront deployment...')
run(`aws cloudfront wait distribution-deployed --id ${client.distributionId}`)

// 6. Invalidate CloudFront cache
run(`aws cloudfront create-invalidation --distribution-id ${client.distributionId} --paths "/*" --query "Invalidation.Id" --output text`)

console.log(`\n✅ Deployed ${clientName} successfully`)
console.log(`   URL: https://${client.distributionId}.cloudfront.net (or custom domain)`)
