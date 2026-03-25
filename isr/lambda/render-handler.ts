import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'

import { handler as renderPage } from './handler.js'
import assets from './assets.json'
import { LOCALES } from '../../src/config.js'

const s3 = new S3Client({ region: 'us-east-1' })
const cf = new CloudFrontClient({ region: 'us-east-1' })

const BUCKET = process.env.BUCKET!
const DISTRIBUTION_ID = process.env.DISTRIBUTION_ID!

function injectAssets(html: string): string {
  return html.replace(
    /<script type="module">import ['"]@white\/white\.js['"]<\/script>/,
    `${assets.css}\n${assets.js}`
  )
}

function s3KeyFromUri(uri: string): string {
  const path = uri.replace(/^\//, '') || ''
  return path ? `${path}/index.html` : 'index.html'
}

function expandWithLocales(paths: string[]): string[] {
  const expanded: string[] = []
  for (const p of paths) {
    for (const locale of LOCALES) {
      expanded.push(p === '/' ? `/${locale}` : `/${locale}${p}`)
    }
    // Also render the bare path (default locale fallback)
    expanded.push(p)
  }
  return [...new Set(expanded)]
}

export async function handler(event: { paths: string[] }) {
  const fullPaths = expandWithLocales(event.paths)

  let rendered = 0

  // Render sequentially — renderPage uses global state (setGlobalData/clearGlobalData)
  for (const path of fullPaths) {
    try {
      const html = await renderPage(path)
      if (!html) continue // deleted content or unknown route

      const finalHtml = injectAssets(html)
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3KeyFromUri(path),
        Body: finalHtml,
        ContentType: 'text/html',
      }))
      rendered++
    } catch (err) {
      console.error(`Failed to render ${path}:`, err)
    }
  }

  // Invalidate CloudFront after all pages are in S3
  if (rendered > 0) {
    await cf.send(new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        Paths: { Quantity: 1, Items: ['/*'] },
        CallerReference: Date.now().toString(),
      },
    }))
  }

  console.log(`Rendered ${rendered}/${fullPaths.length} pages`)
  return { rendered, total: fullPaths.length }
}
