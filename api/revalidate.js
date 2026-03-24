// CMS webhook translator — resolves content changes to page paths,
// then calls the AWS revalidation API to purge those pages.
//
// This file is client-specific. Customize resolvePaths() for each
// client's CMS data model and routing structure.
//
// ENV vars (set by agency during setup):
//   REVALIDATE_URL    — AWS API Gateway URL
//   REVALIDATE_SECRET — shared secret for AWS endpoint
//   CMS_WEBHOOK_SECRET — secret from the CMS (optional)

// Customize this function per client.
// Maps CMS webhook payloads to page paths that need revalidation.
async function resolvePaths(payload) {
  const { contentType, id } = payload

  switch (contentType) {
    case 'product':
      // Product changed — invalidate the product page + any listing pages
      return [
        `/products/${id}`,
        '/', // homepage might show featured products
      ]

    case 'page':
      // Generic page — invalidate by ID/slug
      return [`/${id}`]

    default:
      // Unknown content type — purge everything
      return null
  }
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

  const paths = await resolvePaths(payload)

  // Call AWS revalidation API
  const response = await fetch(process.env.REVALIDATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: process.env.REVALIDATE_SECRET,
      paths, // null = purge all, array = purge specific paths
    }),
  })

  const result = await response.json()

  return new Response(JSON.stringify(result), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
