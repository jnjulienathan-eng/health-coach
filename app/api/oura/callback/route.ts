// GET /api/oura/callback?code=...&state=...
// Oura redirects here after authorization (registered redirect URI, exact match).
//
// 1. Verifies `state` against the httpOnly cookie set by /api/oura/connect.
// 2. Exchanges the code for tokens (lib/oura.ts → exchangeCodeForTokens).
// 3. Fetches personal_info for the Oura user id.
// 4. Safety rule: if an oura_tokens row already exists with a DIFFERENT
//    oura_user_id, refuses to overwrite — so nobody else's Oura account can
//    replace Julie's connection. (Delete the row in Supabase to switch accounts.)
// 5. Upserts oura_tokens for user_id 'julie'.
// 6. Connection test: renders a minimal plain HTML page with the last 2 days of
//    /sleep periods and daily_readiness scores. This page is only reachable by
//    completing a valid OAuth round-trip — it is not a general data endpoint.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import {
  OURA_STATE_COOKIE,
  describe,
  exchangeCodeForTokens,
  loadTokenRow,
  ouraGetWithToken,
  saveTokens,
} from '@/lib/oura'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface OuraPersonalInfo { id?: string }
interface OuraSleep {
  type?: string | null
  day?: string
  bedtime_start?: string
  bedtime_end?: string
  total_sleep_duration?: number | null
  average_hrv?: number | null
  lowest_heart_rate?: number | null
}
interface OuraReadiness { day?: string; score?: number | null }
interface OuraList<T> { data?: T[] }

function esc(v: unknown): string {
  return String(v ?? '—')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body><h1>${esc(title)}</h1>${body}</body></html>`
  const res = new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
  // State is single-use — clear it whatever the outcome.
  res.cookies.set(OURA_STATE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/oura', maxAge: 0 })
  return res
}

function fail(stage: string, message: string, status = 400): NextResponse {
  console.error(`[oura/callback] ${stage}: ${message}`)
  return page('Oura connection failed', `<p><strong>${esc(stage)}</strong></p><p>${esc(message)}</p>`, status)
}

function statesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function berlinDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const totalMin = Math.round(seconds / 60)
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  const oauthError = params.get('error')
  if (oauthError) return fail('Oura returned an error', oauthError)

  const code = params.get('code')
  const state = params.get('state')
  const cookieState = req.cookies.get(OURA_STATE_COOKIE)?.value
  if (!code || !state) return fail('Missing parameters', 'code and state are required')
  if (!cookieState || !statesMatch(state, cookieState)) {
    return fail('State mismatch', 'State did not match (or the 10-minute cookie expired). Start again at /api/oura/connect.')
  }

  // Exchange code → tokens (not persisted yet).
  let tokens
  try {
    tokens = await exchangeCodeForTokens(code)
  } catch (e) {
    return fail('Token exchange', describe(e), 502)
  }

  // Oura user id for the ownership check.
  let ouraUserId: string
  try {
    const info = await ouraGetWithToken<OuraPersonalInfo>(tokens.access_token, 'personal_info')
    if (!info.id) return fail('personal_info', 'Response had no id', 502)
    ouraUserId = info.id
  } catch (e) {
    return fail('personal_info', describe(e), 502)
  }

  try {
    const existing = await loadTokenRow()
    if (existing && existing.oura_user_id !== ouraUserId) {
      return fail(
        'Refused',
        'An Oura connection already exists for a different Oura account. Nothing was changed. To switch accounts, delete the oura_tokens row in Supabase first.',
        409,
      )
    }
    await saveTokens(tokens, ouraUserId)
  } catch (e) {
    return fail('Saving tokens', describe(e), 500)
  }

  // Connection test — last 2 Berlin days (yesterday + today). end_date is
  // treated as exclusive on some Oura endpoints, so query one day past today
  // and filter by `day`.
  const yesterday = berlinDate(-1)
  const today = berlinDate(0)
  const tomorrow = berlinDate(1)
  const days = new Set([yesterday, today])
  const range = { start_date: yesterday, end_date: tomorrow }

  let sleepHtml: string
  try {
    const sleep = await ouraGetWithToken<OuraList<OuraSleep>>(tokens.access_token, 'sleep', range)
    const rows = (sleep.data ?? []).filter(s => s.day && days.has(s.day))
    sleepHtml = rows.length === 0
      ? '<p>No sleep periods for these days.</p>'
      : `<table><thead><tr><th>type</th><th>day</th><th>bedtime_start</th><th>bedtime_end</th><th>total_sleep_duration</th><th>average_hrv</th><th>lowest_heart_rate</th></tr></thead><tbody>${
        rows.map(s => `<tr><td>${esc(s.type)}</td><td>${esc(s.day)}</td><td>${esc(s.bedtime_start)}</td><td>${esc(s.bedtime_end)}</td><td>${esc(fmtDuration(s.total_sleep_duration))}</td><td>${esc(s.average_hrv)}</td><td>${esc(s.lowest_heart_rate)}</td></tr>`).join('')
      }</tbody></table>`
  } catch (e) {
    console.error('[oura/callback] sleep test fetch:', describe(e))
    sleepHtml = `<p>Sleep fetch failed: ${esc(describe(e))}</p>`
  }

  let readinessHtml: string
  try {
    const readiness = await ouraGetWithToken<OuraList<OuraReadiness>>(tokens.access_token, 'daily_readiness', range)
    const rows = (readiness.data ?? []).filter(r => r.day && days.has(r.day))
    readinessHtml = rows.length === 0
      ? '<p>No daily readiness for these days.</p>'
      : `<table><thead><tr><th>day</th><th>score</th></tr></thead><tbody>${
        rows.map(r => `<tr><td>${esc(r.day)}</td><td>${esc(r.score)}</td></tr>`).join('')
      }</tbody></table>`
  } catch (e) {
    console.error('[oura/callback] readiness test fetch:', describe(e))
    readinessHtml = `<p>Readiness fetch failed: ${esc(describe(e))}</p>`
  }

  return page(
    'Oura connected',
    `<p>Tokens saved. Days shown: ${esc(yesterday)} and ${esc(today)} (Europe/Berlin).</p>`
    + `<h2>Sleep periods (/sleep)</h2>${sleepHtml}`
    + `<h2>Daily readiness (/daily_readiness)</h2>${readinessHtml}`,
  )
}
