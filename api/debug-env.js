export const GET = () => {
  return new Response(JSON.stringify({
    hasToken: !!process.env.VERCEL_TOKEN,
    tokenPrefix: process.env.VERCEL_TOKEN?.slice(0, 8),
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID || null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
