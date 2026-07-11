// lib/mcp-auth.ts
//
// Self-hosted, single-user OAuth 2.1 layer for the remote MCP route
// (app/api/[transport]/route.ts). No database, no persisted authorization
// codes or tokens — everything is a signed JWT using MCP_SECRET as the
// HS256 key, so a fresh Vercel serverless instance can verify a code or
// token minted by a different instance with no shared state.
//
// Three JWT "types" share the same secret and issuer, distinguished by a
// `typ` claim:
//   - client : minted by /oauth/register, embeds the registered redirect_uris.
//              Doubles as the client_id string itself — no client table needed.
//   - code   : minted by /oauth/authorize, embeds the PKCE code_challenge and
//              the redirect_uri/client_id it was issued for. ~5 min expiry.
//   - access : minted by /oauth/token, the bearer token for /api/mcp. ~1 year
//              expiry (single user, self-hosted — long-lived by design).

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const ISSUER = 'bodycipher-mcp'
const CODE_TTL = '5m'
const ACCESS_TOKEN_TTL = '365d'
export const ACCESS_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60

function secretKey(): Uint8Array {
  const secret = process.env.MCP_SECRET
  if (!secret) throw new Error('MCP_SECRET environment variable is not set.')
  return new TextEncoder().encode(secret)
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 7636 S256: BASE64URL(SHA256(ASCII(code_verifier))) */
export async function pkceChallengeFromVerifier(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  return base64UrlEncode(digest)
}

// ---- client_id (RFC 7591 dynamic client registration) ----

interface ClientClaims extends JWTPayload {
  typ: 'client'
  redirect_uris: string[]
}

export async function signClientId(redirectUris: string[]): Promise<string> {
  return new SignJWT({ typ: 'client', redirect_uris: redirectUris } satisfies ClientClaims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .sign(secretKey())
}

export async function verifyClientId(
  clientId: string
): Promise<{ redirectUris: string[] } | null> {
  try {
    const { payload } = await jwtVerify<ClientClaims>(clientId, secretKey(), { issuer: ISSUER })
    if (payload.typ !== 'client' || !Array.isArray(payload.redirect_uris)) return null
    return { redirectUris: payload.redirect_uris }
  } catch {
    return null
  }
}

// ---- authorization code ----

interface CodeClaims extends JWTPayload {
  typ: 'code'
  client_id: string
  redirect_uri: string
  code_challenge: string
  resource?: string
  scope?: string
}

export async function signAuthorizationCode(params: {
  clientId: string
  redirectUri: string
  codeChallenge: string
  resource?: string
  scope?: string
}): Promise<string> {
  const claims: CodeClaims = {
    typ: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    resource: params.resource,
    scope: params.scope,
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(CODE_TTL)
    .sign(secretKey())
}

export async function verifyAuthorizationCode(code: string): Promise<CodeClaims | null> {
  try {
    const { payload } = await jwtVerify<CodeClaims>(code, secretKey(), { issuer: ISSUER })
    if (payload.typ !== 'code') return null
    return payload
  } catch {
    return null
  }
}

// ---- access token ----

interface AccessClaims extends JWTPayload {
  typ: 'access'
  client_id: string
  resource?: string
  scope?: string
}

export async function signAccessToken(params: {
  clientId: string
  resource?: string
  scope?: string
}): Promise<string> {
  const claims: AccessClaims = {
    typ: 'access',
    client_id: params.clientId,
    resource: params.resource,
    scope: params.scope,
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject('julie')
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secretKey())
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify<AccessClaims>(token, secretKey(), { issuer: ISSUER })
    if (payload.typ !== 'access') return null
    return payload
  } catch {
    return null
  }
}

/** verifyToken callback for mcp-handler's withMcpAuth. */
export async function verifyBearerToken(
  _req: Request,
  bearerToken?: string
): Promise<{ token: string; clientId: string; scopes: string[]; expiresAt?: number } | undefined> {
  if (!bearerToken) return undefined
  const payload = await verifyAccessToken(bearerToken)
  if (!payload) return undefined
  return {
    token: bearerToken,
    clientId: payload.client_id,
    scopes: payload.scope ? payload.scope.split(' ') : [],
    expiresAt: payload.exp,
  }
}
