// POST /oauth/token — exchanges an authorization code (a short-lived signed
// JWT, see lib/mcp-auth.ts) for a long-lived access token, after verifying
// the PKCE code_verifier against the code_challenge embedded in the code.
// No refresh_token grant — the access token's ~1 year lifetime is the
// intended way this stays usable long-term without persisted state.

import { ACCESS_TOKEN_TTL_SECONDS, pkceChallengeFromVerifier, signAccessToken, verifyAuthorizationCode } from '@/lib/mcp-auth'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

const NO_STORE_HEADERS = { ...CORS_HEADERS, 'Cache-Control': 'no-store', Pragma: 'no-cache' }

function errorResponse(status: number, error: string, description: string) {
  return Response.json({ error, error_description: description }, { status, headers: NO_STORE_HEADERS })
}

async function readBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await req.json()) as Record<string, string>
  }
  const form = await req.formData()
  const out: Record<string, string> = {}
  for (const [key, value] of form.entries()) out[key] = String(value)
  return out
}

export async function POST(req: Request) {
  let body: Record<string, string>
  try {
    body = await readBody(req)
  } catch {
    return errorResponse(400, 'invalid_request', 'Could not parse request body.')
  }

  const { grant_type: grantType, code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = body

  if (grantType !== 'authorization_code') {
    return errorResponse(400, 'unsupported_grant_type', 'Only grant_type=authorization_code is supported.')
  }
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return errorResponse(400, 'invalid_request', 'code, redirect_uri, client_id, and code_verifier are required.')
  }

  const claims = await verifyAuthorizationCode(code)
  if (!claims) {
    return errorResponse(400, 'invalid_grant', 'Authorization code is invalid or expired.')
  }
  if (claims.client_id !== clientId || claims.redirect_uri !== redirectUri) {
    return errorResponse(400, 'invalid_grant', 'client_id or redirect_uri does not match the authorization request.')
  }

  const computedChallenge = await pkceChallengeFromVerifier(codeVerifier.trim())
  if (computedChallenge !== claims.code_challenge) {
    return errorResponse(400, 'invalid_grant', 'code_verifier does not match code_challenge.')
  }

  const accessToken = await signAccessToken({
    clientId: claims.client_id,
    resource: claims.resource,
    scope: claims.scope,
  })

  return Response.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: claims.scope,
    },
    { headers: NO_STORE_HEADERS }
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS })
}
