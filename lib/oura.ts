// Oura Ring API v2 client — server-only.
//
// OAuth2 authorization-code flow (personal access tokens were retired Dec 2025).
// Tokens live in the oura_tokens table (one row, user_id = 'julie'), read and
// written via the service-role client (supaAdmin) — RLS is on with no policies
// and anon/authenticated have no grants, so nothing else can reach the table.
//
// Verified against Oura's docs (cloud.ouraring.com/docs/authentication and the
// v2 OpenAPI spec) on Oct 3, 2026:
// - authorize: https://cloud.ouraring.com/oauth/authorize
// - token:     https://api.ouraring.com/oauth/token (form-encoded body)
// - refresh tokens are SINGLE-USE — every refresh returns a new one, which must
//   be persisted in the same write as the new access token or the connection
//   is lost.
// - the token response has no scope field, so we store the scopes we requested.
//
// Never import this from a client component — it reads OURA_CLIENT_SECRET and
// SUPABASE_SERVICE_ROLE_KEY.

import { supaAdmin } from '@/lib/nutrition'

export const OURA_AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize'
export const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token'
export const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection'
// Must match the redirect URI registered on the Oura application exactly.
export const OURA_REDIRECT_URI = 'https://health-coach-rho.vercel.app/api/oura/callback'
// `daily` covers /sleep and /daily_readiness; `personal` covers /personal_info (user id).
export const OURA_SCOPES = 'personal daily'
// httpOnly cookie carrying the OAuth state between /api/oura/connect and /callback.
export const OURA_STATE_COOKIE = 'oura_oauth_state'

const TOKEN_USER_ID = 'julie'
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export interface OuraTokenRow {
  user_id: string
  oura_user_id: string | null
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string | null
  updated_at: string | null
}

export interface OuraTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
}

// PostgrestError is a plain object, not an Error — String(err) gives
// "[object Object]". Same helper as app/api/nutrition/food-item/route.ts.
export function describe(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    const parts = [
      typeof obj.message === 'string' ? obj.message : null,
      typeof obj.code === 'string' ? `code=${obj.code}` : null,
      typeof obj.details === 'string' ? `details=${obj.details}` : null,
      typeof obj.hint === 'string' ? `hint=${obj.hint}` : null,
    ].filter(Boolean) as string[]
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(e)
  }
  return String(e)
}

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.OURA_CLIENT_ID
  const clientSecret = process.env.OURA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('OURA_CLIENT_ID / OURA_CLIENT_SECRET not set')
  return { clientId, clientSecret }
}

export function ouraClientId(): string {
  return clientCredentials().clientId
}

async function postToken(params: Record<string, string>): Promise<OuraTokenResponse> {
  const { clientId, clientSecret } = clientCredentials()
  const body = new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret })
  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Oura token endpoint ${res.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text) as OuraTokenResponse
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error('Oura token response missing access_token / refresh_token / expires_in')
  }
  return json
}

function expiresAtIso(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString()
}

// Exchanges an authorization code for tokens. Does NOT persist — the callback
// must first confirm the Oura user id before anything is written.
export async function exchangeCodeForTokens(code: string): Promise<OuraTokenResponse> {
  return postToken({ grant_type: 'authorization_code', code, redirect_uri: OURA_REDIRECT_URI })
}

export async function loadTokenRow(): Promise<OuraTokenRow | null> {
  const { data, error } = await supaAdmin()
    .from('oura_tokens')
    .select('user_id, oura_user_id, access_token, refresh_token, expires_at, scope, updated_at')
    .eq('user_id', TOKEN_USER_ID)
    .maybeSingle()
  if (error) {
    console.error('[oura] loadTokenRow failed:', describe(error))
    throw new Error(`oura_tokens read failed: ${describe(error)}`)
  }
  return (data as OuraTokenRow | null) ?? null
}

// Upserts the full token set for 'julie' (used by the callback after the
// oura_user_id ownership check).
export async function saveTokens(tokens: OuraTokenResponse, ouraUserId: string): Promise<void> {
  const { error } = await supaAdmin()
    .from('oura_tokens')
    .upsert({
      user_id: TOKEN_USER_ID,
      oura_user_id: ouraUserId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAtIso(tokens.expires_in),
      scope: tokens.scope ?? OURA_SCOPES,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) {
    console.error('[oura] saveTokens failed:', describe(error))
    throw new Error(`oura_tokens write failed: ${describe(error)}`)
  }
}

// Refreshes using the stored refresh token. Oura refresh tokens are single-use,
// so the NEW refresh token is written in the same update as the new access token.
export async function refreshTokens(): Promise<OuraTokenRow> {
  const row = await loadTokenRow()
  if (!row) throw new Error('Oura not connected — no oura_tokens row')

  let tokens: OuraTokenResponse
  try {
    tokens = await postToken({ grant_type: 'refresh_token', refresh_token: row.refresh_token })
  } catch (e) {
    // A concurrent request may have already spent this refresh token and stored
    // a fresh pair — if so, use that instead of failing.
    const latest = await loadTokenRow()
    if (latest && latest.refresh_token !== row.refresh_token
        && new Date(latest.expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return latest
    }
    throw e
  }

  const updated: Partial<OuraTokenRow> = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAtIso(tokens.expires_in),
    scope: tokens.scope ?? row.scope,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supaAdmin()
    .from('oura_tokens')
    .update(updated)
    .eq('user_id', TOKEN_USER_ID)
    .select('user_id, oura_user_id, access_token, refresh_token, expires_at, scope, updated_at')
    .single()
  if (error) {
    // The old refresh token is already spent at this point — log loudly.
    console.error('[oura] refreshTokens: Oura issued new tokens but saving them failed:', describe(error))
    throw new Error(`oura_tokens refresh write failed: ${describe(error)}`)
  }
  return data as OuraTokenRow
}

// Returns a usable access token, refreshing first if it expires within 5 minutes.
export async function getValidAccessToken(): Promise<string> {
  const row = await loadTokenRow()
  if (!row) throw new Error('Oura not connected — no oura_tokens row')
  if (new Date(row.expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS) return row.access_token
  const refreshed = await refreshTokens()
  return refreshed.access_token
}

// GET against the v2 usercollection API with an explicit access token.
export async function ouraGetWithToken<T = unknown>(
  accessToken: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${OURA_API_BASE}/${path.replace(/^\/+/, '')}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Oura GET ${path} ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text) as T
}

// Authenticated GET against the v2 usercollection API using the stored token.
export async function ouraGet<T = unknown>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = await getValidAccessToken()
  return ouraGetWithToken<T>(token, path, params)
}
