// GET /.well-known/oauth-authorization-server — RFC 8414 authorization
// server metadata. This app is its own authorization server (see
// app/oauth/register, app/oauth/authorize, app/oauth/token, lib/mcp-auth.ts).
// mcp-handler doesn't ship a generator for this metadata (only the RFC 9728
// protected-resource side), so it's hand-built here.

import { getPublicOrigin } from 'mcp-handler'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

export async function GET(req: Request) {
  const origin = getPublicOrigin(req)
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp'],
    },
    { headers: { ...CORS_HEADERS, 'Cache-Control': 'max-age=3600' } }
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS })
}
