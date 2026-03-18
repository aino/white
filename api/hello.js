export const GET = async (req) => {
  return new Response(JSON.stringify({ message: 'Hello from the API' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
