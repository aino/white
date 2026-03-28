export const GET = async (req) => {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  const slug = url.searchParams.get('slug') || '/'

  if (secret !== process.env.DRAFT_SECRET) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(null, {
    status: 307,
    headers: {
      Location: slug,
      'Set-Cookie': `__draft=true; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
    },
  })
}
