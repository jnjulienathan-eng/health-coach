// POST /oauth/register — RFC 7591 dynamic client registration.
//
// No client table: the issued client_id IS a signed JWT embedding the
// registered redirect_uris (see signClientId in lib/mcp-auth.ts), so a
// stateless /oauth/authorize can later verify a redirect_uri was actually
// registered without looking anything up. Public client only (PKCE, no
// client_secret) — this app has exactly one user, so any caller that can
// register is already the intended caller.

import { signClientId } from '@/lib/mcp-auth'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

function errorResponse(status: number, error: string, description: string) {
  return Response.json({ error, error_description: description }, { status, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'invalid_client_metadata', 'Request body must be JSON.')
  }

  const redirectUris = body.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((u) => typeof u === 'string')) {
    return errorResponse(400, 'invalid_client_metadata', 'redirect_uris must be a non-empty array of strings.')
  }

  const clientId = await signClientId(redirectUris)

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      client_name: typeof body.client_name === 'string' ? body.client_name : undefined,
    },
    { status: 201, headers: CORS_HEADERS }
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS })
}
