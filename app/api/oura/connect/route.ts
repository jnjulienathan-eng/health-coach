// GET /api/oura/connect
// Starts the Oura OAuth2 authorization-code flow: generates a random state,
// stores it in a short-lived httpOnly cookie, and redirects to Oura's
// authorize page. /api/oura/callback verifies the state against the cookie.
//
// Only works where OURA_CLIENT_ID is set — Production only (not Preview).

import { NextResponse } from 'next/server'
import { OURA_AUTHORIZE_URL, OURA_REDIRECT_URI, OURA_SCOPES, OURA_STATE_COOKIE, ouraClientId } from '@/lib/oura'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function randomState(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

export async function GET() {
  let clientId: string
  try {
    clientId = ouraClientId()
  } catch (e) {
    console.error('[oura/connect]', e instanceof Error ? e.message : String(e))
    return new NextResponse('Oura is not configured in this environment (OURA_CLIENT_ID / OURA_CLIENT_SECRET missing).', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const state = randomState()
  const url = new URL(OURA_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', OURA_REDIRECT_URI)
  url.searchParams.set('scope', OURA_SCOPES)
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  // sameSite 'lax' (not 'strict') so the cookie is sent on Oura's top-level
  // redirect back to /api/oura/callback.
  res.cookies.set(OURA_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/oura',
    maxAge: 600,
  })
  return res
}
