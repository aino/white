/**
 * Query Lambda@Edge logs from CloudWatch.
 *
 * Usage:
 *   node scripts/logs.js errors                    # Recent errors
 *   node scripts/logs.js renders                   # Recent page renders
 *   node scripts/logs.js slow                      # Slow renders (>1s)
 *   node scripts/logs.js 404s                      # Recent 404s
 *   node scripts/logs.js stats                     # Render stats by source (s3 vs render)
 *   node scripts/logs.js countries                 # Requests by country
 *   node scripts/logs.js devices                   # Mobile vs desktop vs tablet
 *   node scripts/logs.js --query "CUSTOM_QUERY"    # Run a custom CloudWatch Insights query
 *   node scripts/logs.js --hours 48                # Look back 48 hours (default: 24)
 *
 * DATA_ACCESS instructions for AI agents:
 *
 * The Lambda logs structured JSON for every page render:
 *   { uri, status, source, country, device, duration }
 *
 * - uri: the page path (e.g. "/sv-SE/products/slim-finn")
 * - status: HTTP status ("200", "404")
 * - source: "s3" (served from cache) or "render" (built on-demand)
 * - country: two-letter country code from CloudFront (e.g. "SE", "US")
 * - device: "mobile", "tablet", or "desktop"
 * - duration: render time in milliseconds
 *
 * Errors are logged separately via console.error.
 *
 * Example CloudWatch Insights queries:
 *
 *   # All errors in last 24h
 *   fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 50
 *
 *   # Slowest renders
 *   filter source = "render" | sort duration desc | limit 20
 *
 *   # Renders by country
 *   filter source = "render" | stats count(*) by country | sort count(*) desc
 *
 *   # Mobile vs desktop ratio
 *   stats count(*) by device
 *
 *   # 404s by path
 *   filter status = "404" | stats count(*) by uri | sort count(*) desc
 *
 *   # Average render time by page
 *   filter source = "render" | stats avg(duration) as avg_ms by uri | sort avg_ms desc
 *
 * Note: Lambda@Edge logs go to the region where the request was served,
 * not us-east-1. This script queries all common regions.
 */

process.env.AWS_PAGER = ''

import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs'

import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '../..')
const config = (await import(resolve(ROOT, 'aws.config.js'))).default

// Lambda@Edge logs appear in whatever region served the request
const REGIONS = ['us-east-1', 'eu-west-1', 'eu-north-1', 'eu-central-1', 'ap-northeast-1']

const args = process.argv.slice(2)
let hours = 24
let query = null

// Parse args
const hoursIdx = args.indexOf('--hours')
if (hoursIdx !== -1) {
  hours = parseInt(args[hoursIdx + 1]) || 24
  args.splice(hoursIdx, 2)
}

const queryIdx = args.indexOf('--query')
if (queryIdx !== -1) {
  query = args[queryIdx + 1]
  args.splice(queryIdx, 2)
}

const preset = args[0]

// Preset queries
const presets = {
  errors: `fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 50`,
  renders: `filter uri != "" | fields @timestamp, uri, status, source, country, device, duration | sort @timestamp desc | limit 50`,
  slow: `filter source = "render" and duration > 1000 | fields @timestamp, uri, duration, country | sort duration desc | limit 20`,
  '404s': `filter status = "404" | fields @timestamp, uri, country, device | sort @timestamp desc | limit 50`,
  stats: `filter uri != "" | stats count(*) as requests by source | sort requests desc`,
  countries: `filter uri != "" | stats count(*) as requests by country | sort requests desc | limit 20`,
  devices: `filter uri != "" | stats count(*) as requests by device`,
}

if (!query && !preset) {
  console.log('Usage: node scripts/logs.js <preset|--query "..."> [--hours N]')
  console.log('\nPresets:', Object.keys(presets).join(', '))
  process.exit(0)
}

query = query || presets[preset]
if (!query) {
  console.error(`Unknown preset: ${preset}`)
  console.error('Available:', Object.keys(presets).join(', '))
  process.exit(1)
}

const startTime = Math.floor((Date.now() - hours * 3600000) / 1000)
const endTime = Math.floor(Date.now() / 1000)

console.log(`Querying last ${hours}h across ${REGIONS.length} regions...`)
console.log(`Query: ${query}\n`)

// Find log groups matching our ISR function in a given region
async function findLogGroups(client) {
  const groups = []
  for (const prefix of [
    `/aws/lambda/us-east-1.white-isr-${config.name}`,
    `/aws/lambda/white-isr-${config.name}`,
  ]) {
    try {
      const res = await client.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: prefix }))
      for (const g of res.logGroups || []) {
        groups.push(g.logGroupName)
      }
    } catch {}
  }
  return groups
}

async function queryRegion(region) {
  const client = new CloudWatchLogsClient({ region })
  const logGroups = await findLogGroups(client)

  if (logGroups.length === 0) return []

  const allResults = []
  for (const logGroupName of logGroups) {
    try {
      const startResult = await client.send(new StartQueryCommand({
        logGroupName,
        startTime,
        endTime,
        queryString: query,
        limit: 100,
      }))

      const queryId = startResult.queryId

      // Poll for results
      let status = 'Running'
      let results = null
      while (status === 'Running' || status === 'Scheduled') {
        await new Promise(r => setTimeout(r, 500))
        const response = await client.send(new GetQueryResultsCommand({ queryId }))
        status = response.status
        results = response.results
      }

      allResults.push(...(results || []))
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') continue
      throw err
    }
  }

  return allResults
}

// Query all regions in parallel
const regionResults = await Promise.all(
  REGIONS.map(async (region) => {
    const results = await queryRegion(region)
    return { region, results }
  })
)

// Combine and display
let totalResults = 0
for (const { region, results } of regionResults) {
  if (results.length === 0) continue
  totalResults += results.length
  console.log(`--- ${region} (${results.length} results) ---`)
  for (const row of results) {
    const obj = {}
    for (const field of row) {
      if (field.field !== '@ptr') {
        obj[field.field] = field.value
      }
    }
    console.log(JSON.stringify(obj))
  }
  console.log()
}

if (totalResults === 0) {
  console.log('No results found.')
}
