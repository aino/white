// CMS webhook translator — resolves content changes to cache tags,
// then invalidates via Vercel or AWS depending on ISR config.
//
// Customize resolveTags() for each client's CMS data model.

import { ISR } from '../../src/config.js'

// Customize this function per client.
// Maps CMS webhook payloads to cache tags that need invalidation.
async function resolveTags(payload) {
  const { contentType, id, path } = payload

  // If path is provided, use path-based invalidation (most reliable)
  if (path) {
    const pathTag = path.replace(/^\//, '').replace(/\//g, '-')
    return [`path-${pathTag}`]
  }

  switch (contentType) {
    case 'product':
      // Product changed — invalidate by slug/id (both are tagged)
      return [`product-${id}`]

    case 'category':
      return [`category-${id}`]

    case 'page':
      return [`path-${id}`]

    default:
      // Unknown content type — return null to purge all
      return null
  }
}

async function invalidateVercel(tags) {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID

  if (!token || !projectId) {
    throw new Error('Missing VERCEL_TOKEN or VERCEL_PROJECT_ID')
  }

  if (tags === null) {
    return { error: 'Full purge not supported on Vercel ISR. Use specific tags.' }
  }

  // Try project name first, fall back to ID
  const projectName = process.env.VERCEL_PROJECT_NAME || 'white'
  const params = new URLSearchParams({ projectIdOrName: projectName })
  if (teamId) params.append('teamId', teamId)

  const response = await fetch(
    `https://api.vercel.com/v1/edge-cache/invalidate-by-tags?${params}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags }),
    }
  )

  const data = await response.json().catch(() => ({}))

  // If project name fails, try with project ID
  if (!response.ok && projectId !== projectName) {
    const params2 = new URLSearchParams({ projectIdOrName: projectId })
    if (teamId) params2.append('teamId', teamId)

    const response2 = await fetch(
      `https://api.vercel.com/v1/edge-cache/invalidate-by-tags?${params2}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tags }),
      }
    )
    const data2 = await response2.json().catch(() => ({}))
    return {
      status: response2.status,
      ok: response2.ok,
      tags,
      tried: [projectName, projectId],
      ...data2,
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    tags,
    tried: [projectName],
    ...data,
  }
}

async function invalidateAWS(tags) {
  // Legacy AWS path-based invalidation
  // Convert tags back to paths for AWS CloudFront
  const config = (await import('../../isr.config.js')).default

  const paths = tags?.map((tag) => {
    if (tag.startsWith('product-')) return `/*/products/${tag.replace('product-', '')}`
    if (tag.startsWith('page-')) return `/*/${tag.replace('page-', '')}`
    return '/*'
  }) || null

  const response = await fetch(config.aws.revalidateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: config.aws.revalidateSecret,
      paths,
    }),
  })

  return response.json()
}

export const POST = async (req) => {
  const payload = await req.json()

  // Optional: validate CMS webhook secret
  const cmsSecret = process.env.CMS_WEBHOOK_SECRET
  if (cmsSecret && payload.secret !== cmsSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const tags = await resolveTags(payload)

  let result
  if (ISR === 'vercel') {
    result = await invalidateVercel(tags)
  } else if (ISR === 'aws') {
    result = await invalidateAWS(tags)
  } else {
    result = { error: 'ISR not enabled' }
  }

  return new Response(JSON.stringify(result), {
    status: result.error ? 400 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
