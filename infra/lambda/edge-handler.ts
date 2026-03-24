import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({ region: 'us-east-1' })
// Lambda@Edge doesn't support env vars — bucket name injected at bundle time
const BUCKET = '__BUCKET_NAME__'

// These will be bundled at deploy time
import { handler as renderPage } from './handler.js'
import assets from './assets.json'

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

export async function handler(event: any) {
  const request = event.Records[0].cf.request
  const uri = request.uri

  // Let S3 serve static assets directly
  if (uri.startsWith('/assets/')) {
    return request
  }

  // Always render fresh — CloudFront only calls this on cache miss
  const path = uri.replace(/\/$/, '') || '/'
  const html = await renderPage(path)

  if (!html) {
    // Try rendering the 404 template
    const notFoundHtml = await renderPage('/404')
    return {
      status: '404',
      statusDescription: 'Not Found',
      headers: {
        'content-type': [{ value: 'text/html' }],
      },
      body: notFoundHtml ? injectAssets(notFoundHtml) : '<html><body><h1>404 — Not Found</h1></body></html>',
    }
  }

  const finalHtml = injectAssets(html)

  // Save to S3 as backup (not used for serving — CloudFront caches the response)
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3KeyFromUri(uri),
        Body: finalHtml,
        ContentType: 'text/html',
      })
    )
  } catch (err) {
    console.error('Failed to save to S3:', err)
  }

  return {
    status: '200',
    statusDescription: 'OK',
    headers: {
      'content-type': [{ value: 'text/html' }],
      'cache-control': [{ value: 'public, max-age=0, s-maxage=31536000' }],
    },
    body: finalHtml,
  }
}
