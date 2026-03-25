export const GET = async (req) => {
  const referer = req.headers.get('referer')
  const redirect = referer ? new URL(referer).pathname : '/'

  return new Response(null, {
    status: 307,
    headers: {
      Location: redirect,
      'Set-Cookie': `__draft=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  })
}
