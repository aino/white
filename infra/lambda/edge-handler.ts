import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({})
const BUCKET = process.env.BUCKET_NAME!

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
  // /about → about/index.html
  // / → index.html
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

  const s3Key = s3KeyFromUri(uri)

  // Check if page exists in S3
  try {
    await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }))
    // Page exists — let CloudFront serve it from S3
    request.uri = `/${s3Key}`
    return request
  } catch {
    // Page doesn't exist — build it
  }

  // Render the page
  const path = uri.replace(/\/$/, '') || '/'
  const html = await renderPage(path)

  if (!html) {
    // Return 404
    return {
      status: '404',
      statusDescription: 'Not Found',
      headers: {
        'content-type': [{ value: 'text/html' }],
      },
      body: '<html><body><h1>404 — Not Found</h1></body></html>',
    }
  }

  const finalHtml = injectAssets(html)

  // Save to S3 for future requests
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: finalHtml,
        ContentType: 'text/html',
        CacheControl: 'public, max-age=0, s-maxage=31536000',
      })
    )
  } catch (err) {
    console.error('Failed to save to S3:', err)
  }

  // Return the rendered page directly
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
