process.env.AWS_PAGER = ''

import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const config = (await import(resolve(ROOT, 'isr.config.js'))).default
const { name, aws } = config

if (!aws?.bucket || !aws?.distributionId) {
  console.error('Missing aws config in isr.config.js. Run initial CDK deploy first.')
  process.exit(1)
}

const step = (msg) => console.log(`\n→ ${msg}`)
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: ROOT })
const out = (cmd) => execSync(cmd, { encoding: 'utf-8', cwd: ROOT }).trim()

const start = Date.now()
console.log(`\nDeploying ${name} → ${aws.distributionId}`)

// Build
step('Building assets + templates')
run('npm run build:isr')
run(`node scripts/bundle-lambda.js ${aws.bucket}`)

// Upload assets
step('Uploading assets to S3')
run(`aws s3 sync dist/assets s3://${aws.bucket}/assets/ --cache-control "public, max-age=31536000, immutable" --quiet`)

// Update Lambda
step('Updating Lambda')
const functionArn = out(
  `aws lambda list-functions --region us-east-1 --query "Functions[?contains(FunctionName, 'white-isr-${name}') && contains(FunctionName, 'IsrHandler')].FunctionArn | [0]" --output text`
)

if (!functionArn || functionArn === 'None') {
  console.error(`Lambda not found. Run initial CDK deploy first:`)
  console.error(`  cd isr && npx cdk deploy --context name=${name} --context domain=${config.domain} --context vercelUrl=${config.vercelUrl}`)
  process.exit(1)
}

run(`cd isr/lambda/bundle && zip -j /tmp/white-lambda.zip index.js`)
run(`aws lambda update-function-code --function-name ${functionArn} --zip-file fileb:///tmp/white-lambda.zip --region us-east-1 --no-cli-pager > /dev/null`)
run(`aws lambda wait function-updated --function-name ${functionArn} --region us-east-1`)
const version = out(`aws lambda publish-version --function-name ${functionArn} --region us-east-1 --query "Version" --output text`)
console.log(`  Published version ${version}`)

// Update Render Lambda
step('Updating Render Lambda')
const renderFunctionArn = out(
  `aws lambda list-functions --region us-east-1 --query "Functions[?contains(FunctionName, 'white-isr-${name}') && contains(FunctionName, 'RenderHandler')].FunctionArn | [0]" --output text`
)

if (renderFunctionArn && renderFunctionArn !== 'None') {
  run(`cd isr/lambda/render-bundle && zip -j /tmp/white-render-lambda.zip index.js`)
  run(`aws lambda update-function-code --function-name ${renderFunctionArn} --zip-file fileb:///tmp/white-render-lambda.zip --region us-east-1 --no-cli-pager > /dev/null`)
  run(`aws lambda wait function-updated --function-name ${renderFunctionArn} --region us-east-1`)
  console.log('  Render Lambda updated')
} else {
  console.warn('  Render Lambda not found — skipping (run CDK deploy to create it)')
}

// Update CloudFront Lambda association
step('Updating CloudFront')
const cfRaw = out(`aws cloudfront get-distribution-config --id ${aws.distributionId} --output json`)
const cfConfig = JSON.parse(cfRaw)
const etag = cfConfig.ETag
const distConfig = cfConfig.DistributionConfig

for (const assoc of distConfig.DefaultCacheBehavior.LambdaFunctionAssociations?.Items || []) {
  if (assoc.EventType === 'origin-request') {
    assoc.LambdaFunctionARN = assoc.LambdaFunctionARN.replace(/:\d+$/, `:${version}`)
  }
}

writeFileSync('/tmp/cf-update.json', JSON.stringify(distConfig))
run(`aws cloudfront update-distribution --id ${aws.distributionId} --distribution-config file:///tmp/cf-update.json --if-match ${etag} --no-cli-pager > /dev/null`)

// Clear S3 HTML pages (keep hashed assets) so Lambda@Edge re-renders with new templates
step('Clearing S3 HTML pages')
run(`aws s3 rm s3://${aws.bucket}/ --recursive --exclude "assets/*" --quiet`)

// Wait + invalidate
step('Waiting for CloudFront propagation (~3-5 min)')
run(`aws cloudfront wait distribution-deployed --id ${aws.distributionId}`)
run(`aws cloudfront create-invalidation --distribution-id ${aws.distributionId} --paths "/*" --no-cli-pager > /dev/null`)

const duration = ((Date.now() - start) / 1000).toFixed(0)
console.log(`\n✅ ${name} deployed in ${duration}s`)
