// Resolved at runtime in Route Handlers (not baked at build time)
const API_URL = process.env.LUCID_API_URL || 'http://localhost:3001'

async function proxyRequest(req: Request, params: Promise<{ path: string[] }>, method: string) {
  const { path } = await params
  const apiPath = '/' + path.join('/')
  const url = new URL(req.url)
  const target = `${API_URL}${apiPath}${url.search}`

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const init: RequestInit = { method, headers }

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    init.body = await req.text()
  }

  try {
    const res = await fetch(target, init)
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    })
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'L2 API unreachable' }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    )
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params, 'GET')
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params, 'POST')
}
