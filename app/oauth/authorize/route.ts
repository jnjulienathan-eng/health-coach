// GET /oauth/authorize — immediately issues an authorization code and
// redirects back to the client, with no login form and no consent screen.
//
// That's a deliberate simplification: this app has exactly one user and is
// already private (MCP_SECRET-gated until this change), so there is no
// second party to ask "allow access?" — the only thing worth validating is
// that the redirect_uri actually belongs to a client that went through
// /oauth/register (see verifyClientId in lib/mcp-auth.ts), so a malicious
// page can't smuggle an authorization code to an arbitrary URL.

import { signAuthorizationCode, verifyClientId } from '@/lib/mcp-auth'

function invalidRequest(message: string) {
  return Response.json({ error: 'invalid_request', error_description: message }, { status: 400 })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams

  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const responseType = params.get('response_type')
  const codeChallenge = params.get('code_challenge')
  const codeChallengeMethod = params.get('code_challenge_method')
  const state = params.get('state') ?? undefined
  const resource = params.get('resource') ?? undefined
  const scope = params.get('scope') ?? undefined

  if (!clientId) return invalidRequest('Missing client_id.')
  if (!redirectUri) return invalidRequest('Missing redirect_uri.')

  // client_id and redirect_uri are validated together, before anything is
  // redirected to — an unregistered/forged redirect_uri must never receive
  // a code, so errors past this point are safe to deliver via redirect.
  const client = await verifyClientId(clientId)
  if (!client) return invalidRequest('Unknown or invalid client_id.')
  if (!client.redirectUris.includes(redirectUri)) {
    return invalidRequest('redirect_uri does not match a URI registered for this client.')
  }

  const redirectWithError = (error: string, description: string) => {
    const target = new URL(redirectUri)
    target.searchParams.set('error', error)
    target.searchParams.set('error_description', description)
    if (state) target.searchParams.set('state', state)
    return Response.redirect(target.toString(), 302)
  }

  if (responseType !== 'code') {
    return redirectWithError('unsupported_response_type', 'Only response_type=code is supported.')
  }
  if (!codeChallenge) {
    return redirectWithError('invalid_request', 'Missing code_challenge (PKCE is required).')
  }
  if (codeChallengeMethod !== 'S256') {
    return redirectWithError('invalid_request', 'Only code_challenge_method=S256 is supported.')
  }

  const code = await signAuthorizationCode({
    clientId,
    redirectUri,
    codeChallenge,
    resource,
    scope,
  })

  const target = new URL(redirectUri)
  target.searchParams.set('code', code)
  if (state) target.searchParams.set('state', state)
  return Response.redirect(target.toString(), 302)
}
