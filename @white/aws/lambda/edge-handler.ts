import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({ region: 'us-east-1' })
// Lambda@Edge doesn't support runtime env vars — injected at bundle time via esbuild define
const BUCKET = process.env.BUCKET!

// Bundled at deploy time
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
  const start = Date.now()

  if (uri.startsWith('/assets/')) {
    return request
  }

  // Extract request metadata for logging
  const headers = request.headers
  const country = headers['cloudfront-viewer-country']?.[0]?.value || 'unknown'
  const device = headers['cloudfront-is-mobile-viewer']?.[0]?.value === 'true' ? 'mobile'
    : headers['cloudfront-is-tablet-viewer']?.[0]?.value === 'true' ? 'tablet' : 'desktop'
  const ua = headers['user-agent']?.[0]?.value || ''

  const log = (status: string, source: string) => {
    console.log(JSON.stringify({
      uri, status, source, country, device, ua,
      duration: Date.now() - start,
    }))
  }

  // Try S3 first — page may have been pre-rendered by the render Lambda
  const s3Key = s3KeyFromUri(uri)
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }))
    const body = await obj.Body!.transformToString()
    log('200', 's3')
    return {
      status: '200',
      statusDescription: 'OK',
      headers: {
        'content-type': [{ value: 'text/html' }],
        'cache-control': [{ value: 'public, max-age=0, s-maxage=31536000' }],
      },
      body,
    }
  } catch (err: any) {
    if (err.name !== 'NoSuchKey') {
      console.error('S3 GetObject failed:', err)
    }
  }

  // Fallback: render on-demand (first-ever pages, or if pre-render was skipped)
  const path = uri.replace(/\/$/, '') || '/'

  try {
    const html = await renderPage(path)

    if (!html) {
      const notFoundHtml = await renderPage('/404')
      log('404', 'render')
      return {
        status: '404',
        statusDescription: 'Not Found',
        headers: {
          'content-type': [{ value: 'text/html' }],
          'cache-control': [{ value: 'public, max-age=0, s-maxage=60' }],
        },
        body: notFoundHtml ? injectAssets(notFoundHtml) : '<html><body><h1>404</h1></body></html>',
      }
    }

    const finalHtml = injectAssets(html)

    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3KeyFromUri(uri),
        Body: finalHtml,
        ContentType: 'text/html',
      }))
    } catch (err) {
      console.error('Failed to save to S3:', err)
    }

    log('200', 'render')
    return {
      status: '200',
      statusDescription: 'OK',
      headers: {
        'content-type': [{ value: 'text/html' }],
        'cache-control': [{ value: 'public, max-age=0, s-maxage=31536000' }],
      },
      body: finalHtml,
    }
  } catch (renderErr) {
    console.error('Render failed, attempting stale fallback:', renderErr)

    // Serve stale version from S3 if available
    try {
      const stale = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }))
      const body = await stale.Body!.transformToString()
      log('200', 'stale')
      return {
        status: '200',
        statusDescription: 'OK',
        headers: {
          'content-type': [{ value: 'text/html' }],
          'cache-control': [{ value: 'public, max-age=0, s-maxage=60' }],
        },
        body,
      }
    } catch {
      // No stale version — nothing we can do
      log('500', 'error')
      return {
        status: '500',
        statusDescription: 'Internal Server Error',
        headers: {
          'content-type': [{ value: 'text/html' }],
          'cache-control': [{ value: 'no-store' }],
        },
        body: '<html><body><h1>500</h1><p>Page temporarily unavailable</p></body></html>',
      }
    }
  }
}
