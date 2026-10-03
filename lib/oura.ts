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
import { recomputeScores } from '@/lib/scores-server'

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

// ── Sleep sync (Session 2) ────────────────────────────────────────────────
// syncOuraRange(startDate, endDate) is the ONE entry point that webhook, cron
// and backfill all call. It makes Oura the source of these daily_entries
// columns: bedtime, wake_time, sleep_duration_min, hrv, rhr, nap_minutes,
// oura_readiness. Overwrite-on-change: only columns whose value differs from
// what is stored are sent, so re-running over the same range is a no-op.
// See BODYCIPHER.md → "Oura Ring sleep sync" for the full mapping.

interface OuraSleepPeriod {
  id?: string
  type?: string | null
  day?: string
  bedtime_start?: string
  bedtime_end?: string
  total_sleep_duration?: number | null
  average_hrv?: number | null
  lowest_heart_rate?: number | null
}
interface OuraDailyReadiness { day?: string; score?: number | null }
interface OuraPage<T> { data?: T[]; next_token?: string | null }

// Only columns listed here are ever written by the sync.
const OURA_OWNED_COLUMNS = [
  'bedtime', 'wake_time', 'sleep_duration_min', 'hrv', 'rhr', 'nap_minutes', 'oura_readiness',
] as const
type OuraOwnedColumn = typeof OURA_OWNED_COLUMNS[number]
type OuraOwnedValues = Partial<Record<OuraOwnedColumn, string | number | null>>

const IGNORED_SLEEP_TYPES = new Set(['deleted', 'rest'])
const MIN_NAP_MINUTES = 15

export interface OuraSyncDateResult {
  date: string
  changed: Partial<Record<OuraOwnedColumn, { from: string | number | null; to: string | number | null }>>
  scoresRecomputed: boolean
  error?: string
}

function shiftIsoDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// HH:MM as written in the string (Oura's local time, e.g. "...T21:18:10.000+02:00").
function localHHMM(iso: string | undefined): string | null {
  const m = iso?.match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : null
}

function berlinCalendarDate(iso: string | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
}

function periodMinutes(p: OuraSleepPeriod): number {
  return Math.round((p.total_sleep_duration ?? 0) / 60)
}

// Follows next_token so long ranges (backfill) aren't silently truncated.
async function ouraGetAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = []
  let nextToken: string | null | undefined
  do {
    const page = await ouraGet<OuraPage<T>>(path, nextToken ? { ...params, next_token: nextToken } : params)
    out.push(...(page.data ?? []))
    nextToken = page.next_token
  } while (nextToken)
  return out
}

// Stored values can differ in shape from what we'd write (e.g. bedtime as
// "21:18:00" from a time column, hrv as a numeric string) — normalise first.
function normaliseStored(col: OuraOwnedColumn, v: unknown): string | number | null {
  if (v == null) return null
  if (col === 'bedtime' || col === 'wake_time') return String(v).slice(0, 5)
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Pure mapping for one app date D. Returns only the columns Oura has an
// opinion on for D; absent keys mean "leave untouched".
export function mapOuraForDate(date: string, periods: OuraSleepPeriod[], readiness: OuraDailyReadiness[]): OuraOwnedValues {
  const out: OuraOwnedValues = {}
  const valid = periods.filter(p => !IGNORED_SLEEP_TYPES.has(p.type ?? ''))

  const mains = valid.filter(p => p.type === 'long_sleep' && p.day === date)
  const main = mains.sort((a, b) => (b.total_sleep_duration ?? 0) - (a.total_sleep_duration ?? 0))[0]
  if (main) {
    out.bedtime = localHHMM(main.bedtime_start)
    out.wake_time = localHHMM(main.bedtime_end)
    out.sleep_duration_min = main.total_sleep_duration != null ? Math.round(main.total_sleep_duration / 60) : null
    out.hrv = main.average_hrv != null ? Math.round(main.average_hrv) : null
    out.rhr = main.lowest_heart_rate ?? null
  }

  // Naps: by Berlin calendar date of bedtime_start, NOT Oura's `day` (Oura
  // assigns evening naps to the next day).
  const naps = valid.filter(p =>
    p.type !== 'long_sleep'
    && berlinCalendarDate(p.bedtime_start) === date
    && periodMinutes(p) >= MIN_NAP_MINUTES,
  )
  if (naps.length > 0) {
    out.nap_minutes = naps.reduce((sum, p) => sum + periodMinutes(p), 0)
  } else if (main) {
    // Ring was worn (main sleep exists) and no nap qualifies → clear, so a
    // deleted/corrected nap doesn't linger. With no main sleep either, the
    // ring likely wasn't worn — leave nap_minutes untouched.
    out.nap_minutes = null
  }

  const r = readiness.find(x => x.day === date)
  if (r && r.score != null) out.oura_readiness = r.score

  return out
}

export async function syncOuraRange(startDate: string, endDate: string): Promise<OuraSyncDateResult[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw new Error(`syncOuraRange: invalid range ${startDate}..${endDate}`)
  }

  // Pad one day either side (evening naps carry Oura day D+1; day-boundary
  // periods), plus one more at the end because Oura's end_date can be exclusive.
  const fetchRange = { start_date: shiftIsoDate(startDate, -1), end_date: shiftIsoDate(endDate, 2) }
  const [periods, readiness] = await Promise.all([
    ouraGetAll<OuraSleepPeriod>('sleep', fetchRange),
    ouraGetAll<OuraDailyReadiness>('daily_readiness', fetchRange),
  ])

  const supabase = supaAdmin()
  const { data: storedRows, error: readErr } = await supabase
    .from('daily_entries')
    .select(`date, ${OURA_OWNED_COLUMNS.join(', ')}`)
    .eq('user_id', TOKEN_USER_ID)
    .gte('date', startDate)
    .lte('date', endDate)
  if (readErr) {
    console.error('[oura] syncOuraRange read failed:', describe(readErr))
    throw new Error(`daily_entries read failed: ${describe(readErr)}`)
  }
  const storedByDate = new Map<string, Record<string, unknown>>()
  for (const row of (storedRows ?? []) as unknown as Record<string, unknown>[]) {
    storedByDate.set(String(row.date).slice(0, 10), row)
  }

  // Ascending order: rolling baselines in recomputeScores() read earlier days.
  const results: OuraSyncDateResult[] = []
  for (let date = startDate; date <= endDate; date = shiftIsoDate(date, 1)) {
    const result: OuraSyncDateResult = { date, changed: {}, scoresRecomputed: false }
    results.push(result)

    const mapped = mapOuraForDate(date, periods, readiness)
    const stored = storedByDate.get(date)
    const payload: OuraOwnedValues = {}
    for (const col of OURA_OWNED_COLUMNS) {
      if (!(col in mapped)) continue
      const to = mapped[col] ?? null
      const from = normaliseStored(col, stored?.[col])
      if (from !== to) {
        payload[col] = to
        result.changed[col] = { from, to }
      }
    }
    if (Object.keys(payload).length === 0) continue

    // Upsert with only the changed Oura-owned columns — no other column is touched.
    const { error: writeErr } = await supabase
      .from('daily_entries')
      .upsert({ user_id: TOKEN_USER_ID, date, ...payload }, { onConflict: 'user_id,date' })
    if (writeErr) {
      console.error(`[oura] syncOuraRange write ${date} failed:`, describe(writeErr))
      result.error = `write failed: ${describe(writeErr)}`
      continue
    }

    try {
      await recomputeScores(date)
      result.scoresRecomputed = true
    } catch (e) {
      console.error(`[oura] recomputeScores ${date} failed:`, describe(e))
      result.error = `scores recompute failed: ${describe(e)}`
    }
  }

  return results
}
