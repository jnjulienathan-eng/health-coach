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
// - when the token response has no scope field we store the scopes we requested;
//   in practice Oura returns one (e.g. "extapi:workout", seen Oct 16, 2026).
//
// Never import this from a client component — it reads OURA_CLIENT_SECRET and
// SUPABASE_SERVICE_ROLE_KEY.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { supaAdmin } from '@/lib/nutrition'
import { recomputeScores } from '@/lib/scores-server'
import { OURA_WORKOUT_CUTOVER_DATE } from '@/lib/types'

export const OURA_AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize'
export const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token'
export const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection'
// Must match the redirect URI registered on the Oura application exactly.
export const OURA_REDIRECT_URI = 'https://health-coach-rho.vercel.app/api/oura/callback'
// `daily` covers /sleep and /daily_readiness; `personal` covers /personal_info (user id);
// `workout` covers /workout (training_sessions import).
export const OURA_SCOPES = 'personal daily workout'
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
// oura_readiness, deep_sleep_min, lowest_hr_time_pct. Overwrite-on-change: only columns whose value differs from
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
  deep_sleep_duration?: number | null
  // 5-minute HR samples from `timestamp`, `interval` seconds apart; null = no reading.
  heart_rate?: { interval?: number; items?: (number | null)[]; timestamp?: string } | null
}
interface OuraDailyReadiness { day?: string; score?: number | null }
interface OuraPage<T> { data?: T[]; next_token?: string | null }

// Only columns listed here are ever written by the sync.
const OURA_OWNED_COLUMNS = [
  'bedtime', 'wake_time', 'sleep_duration_min', 'hrv', 'rhr', 'nap_minutes', 'oura_readiness',
  'deep_sleep_min', 'lowest_hr_time_pct',
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

// When in the sleep period the lowest 5-minute HR sample fell, as % of the
// period (bedtime_start → bedtime_end), 1 decimal. First sample wins a tie.
// Null without an HR series or a valid period.
export function lowestHrTimePct(p: OuraSleepPeriod): number | null {
  const hr = p.heart_rate
  const start = Date.parse(p.bedtime_start ?? '')
  const end = Date.parse(p.bedtime_end ?? '')
  const seriesStart = Date.parse(hr?.timestamp ?? '')
  if (!hr?.items?.length || !hr.interval || Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(seriesStart) || end <= start) return null
  let minIdx = -1
  hr.items.forEach((v, i) => { if (v != null && (minIdx < 0 || v < (hr.items![minIdx] as number))) minIdx = i })
  if (minIdx < 0) return null
  const at = seriesStart + minIdx * hr.interval * 1000
  const pct = ((at - start) / (end - start)) * 100
  return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10
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
    out.deep_sleep_min = main.deep_sleep_duration != null ? Math.round(main.deep_sleep_duration / 60) : null
    out.lowest_hr_time_pct = lowestHrTimePct(main)
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

// ── Workout sync → training_sessions (Oct 15, 2026) ───────────────────────
// syncOuraWorkouts(startDate, endDate) replaces Health Auto Export's workout
// import. Apple Watch workouts reach Oura via Apple Health; walks confirmed in
// the Oura app come through the same endpoint. Rules:
// - Only dates >= OURA_WORKOUT_CUTOVER_DATE (Berlin date of start_datetime).
// - One row per Oura workout, keyed by source = 'oura' + external_id = Oura id.
// - Re-sync updates ONLY the Oura-owned columns (OURA_WORKOUT_COLUMNS) and only
//   when they changed. zone3_plus_minutes and notes are never written after
//   insert. Calories missing in Oura leave the stored value alone.
// - A new Oura workout that matches an existing non-Oura session (same
//   activity, start within ±10 min) is skipped. /api/health-import runs the
//   same check the other way (Oct 16, 2026), since Apple Watch workouts come
//   from Health Auto Export again — Oura's API doesn't return workouts Oura
//   imported from Apple Health.
// - Workouts that disappear from Oura are logged, not deleted (the row may
//   carry manual zone3+ minutes).
// See BODYCIPHER.md → "Oura workouts → training_sessions".

interface OuraWorkout {
  id?: string
  activity?: string | null
  calories?: number | null
  day?: string
  start_datetime?: string
  end_datetime?: string
  source?: string | null   // 'manual' | 'autodetected' | 'confirmed' | 'workout_heart_rate'
}

const OURA_WORKOUT_SOURCE = 'oura'
const OURA_WORKOUT_COLUMNS = ['date', 'activity_type', 'duration_min', 'active_calories', 'start_time'] as const
type OuraWorkoutColumn = typeof OURA_WORKOUT_COLUMNS[number]
export const WORKOUT_MATCH_WINDOW_MS = 10 * 60 * 1000

// Activity name (lowercased, non-letters stripped) → app activity_type. Targets
// are the stored quick-add types in TrainingSection.tsx, so scoring
// (sessionIntensity) and labels treat Oura sessions like manual ones. Also
// lists the names Health Auto Export stored, so the cutover match can compare
// an Oura workout with an older HAE row. Cycling stays a regular session
// ('Cycling'); daily_entries.cycling_* are legacy and never written.
const ACTIVITY_TYPE_MAP: Record<string, string> = {
  swim: 'swim', swimming: 'swim', poolswim: 'swim', poolswimming: 'swim', openwaterswimming: 'swim',
  egym: 'egym', strength: 'egym', strengthtraining: 'egym', traditionalstrengthtraining: 'egym',
  functionalstrengthtraining: 'egym', weightlifting: 'egym', weighttraining: 'egym',
  run: 'run', running: 'run', outdoorrun: 'run', indoorrun: 'run', outdoorrunning: 'run', indoorrunning: 'run',
  walk: 'walk', walking: 'walk', outdoorwalk: 'walk', indoorwalk: 'walk', outdoorwalking: 'walk', indoorwalking: 'walk',
  cycling: 'Cycling', outdoorcycling: 'Cycling', indoorcycling: 'Cycling', biking: 'Cycling', bike: 'Cycling',
}
const OTHER_ACTIVITY = 'Other'

function activityKey(activity: string | null | undefined): string {
  return (activity ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

// Oura activity → app activity_type. Unmapped values fall back to 'Other' and
// are logged so a mapping decision can be made from the Vercel logs.
export function mapOuraActivity(activity: string | null | undefined): string {
  const mapped = ACTIVITY_TYPE_MAP[activityKey(activity)]
  if (!mapped) console.warn(`[oura] unmapped workout activity "${activity}" → ${OTHER_ACTIVITY}`)
  return mapped ?? OTHER_ACTIVITY
}

export function sameActivity(a: string, b: string): boolean {
  return (ACTIVITY_TYPE_MAP[activityKey(a)] ?? OTHER_ACTIVITY) === (ACTIVITY_TYPE_MAP[activityKey(b)] ?? OTHER_ACTIVITY)
}

export function timeMs(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null
  // HAE stored "2026-04-28 07:15:00 +0200"; Oura and Postgres give ISO.
  const t = new Date(v.includes('T') ? v : v.replace(' ', 'T').replace(' ', '')).getTime()
  return Number.isNaN(t) ? null : t
}

interface StoredSession {
  id: string
  date: string
  activity_type: string
  duration_min: number | null
  active_calories: number | null
  start_time: string | null
  external_id: string | null
  source: string | null
  zone3_plus_minutes: number | null
}

export interface OuraWorkoutSyncResult {
  external_id: string | null
  date: string | null
  activity: string | null
  action: 'inserted' | 'updated' | 'unchanged' | 'skipped_autodetected' | 'skipped_matches_existing' | 'skipped_invalid' | 'failed'
  changed?: Partial<Record<OuraWorkoutColumn, { from: unknown; to: unknown }>>
  matched_session_id?: string
  error?: string
}

// Diagnostic (Oct 16, 2026): ouraGetAll for /workout, but logs the HTTP status
// of every page and, on failure, the response body. The access token is never
// logged (it's only in the Authorization header; redacted from bodies anyway).
async function ouraGetAllWorkoutsLogged(params: Record<string, string>): Promise<OuraWorkout[]> {
  const token = await getValidAccessToken()
  const redact = (s: string) => s.split(token).join('[redacted]')
  const out: OuraWorkout[] = []
  let nextToken: string | null | undefined
  let page = 0
  do {
    page++
    const url = new URL(`${OURA_API_BASE}/workout`)
    for (const [k, v] of Object.entries(nextToken ? { ...params, next_token: nextToken } : params)) url.searchParams.set(k, v)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    const text = await res.text()
    const label = `[oura] GET /workout start_date=${params.start_date} end_date=${params.end_date} page ${page}`
    if (!res.ok) {
      console.error(`${label} → HTTP ${res.status} ${res.statusText}; body: ${redact(text).slice(0, 2000)}`)
      throw new Error(`Oura GET workout ${res.status}: ${redact(text).slice(0, 300)}`)
    }
    const json = JSON.parse(text) as OuraPage<OuraWorkout>
    console.log(`${label} → HTTP ${res.status}, ${json.data?.length ?? 0} item(s)${json.next_token ? ', next_token present' : ''}`)
    out.push(...(json.data ?? []))
    nextToken = json.next_token
  } while (nextToken)
  return out
}

// Diagnostic: oura_tokens.scope holds the scope string Oura's token endpoint
// returned (e.g. "extapi:workout"), or OURA_SCOPES if it returned none.
async function logStoredOuraScope(): Promise<void> {
  try {
    const row = await loadTokenRow()
    if (!row) {
      console.warn('[oura] workout sync: no oura_tokens row')
      return
    }
    // Oura prefixes scopes with "extapi:"; OURA_SCOPES (our fallback) doesn't.
    const scopes = (row.scope ?? '').split(/\s+/).filter(Boolean).map(sc => sc.replace(/^extapi:/, ''))
    console.log(`[oura] workout sync: stored token scope="${row.scope ?? ''}" → includes workout: ${scopes.includes('workout') ? 'yes' : 'NO'}; token updated_at=${row.updated_at ?? 'null'}, expires_at=${row.expires_at}`)
  } catch (e) {
    console.error('[oura] workout sync: could not read stored scope:', describe(e))
  }
}

export async function syncOuraWorkouts(startDate: string, endDate: string): Promise<OuraWorkoutSyncResult[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw new Error(`syncOuraWorkouts: invalid range ${startDate}..${endDate}`)
  }
  const from = startDate < OURA_WORKOUT_CUTOVER_DATE ? OURA_WORKOUT_CUTOVER_DATE : startDate
  if (from > endDate) {
    console.log(`[oura] workout sync ${startDate}..${endDate}: whole range is before cutover ${OURA_WORKOUT_CUTOVER_DATE} — no /workout call`)
    return []
  }

  await logStoredOuraScope()

  // Same padding as syncOuraRange: Oura's `day` can differ from the Berlin
  // date of start_datetime, and end_date can be exclusive.
  const fetchStart = shiftIsoDate(from, -1)
  const fetchEnd = shiftIsoDate(endDate, 2)
  const workouts = await ouraGetAllWorkoutsLogged({ start_date: fetchStart, end_date: fetchEnd })
  // Diagnostic: one line per workout, emitted with the run summary at the end
  // (a pair is formatted then, once its result's action is final).
  const workoutLog: Array<string | { w: OuraWorkout; result: OuraWorkoutSyncResult }> = []
  const describeWorkout = (w: OuraWorkout) =>
    `id=${w.id ?? 'null'} activity=${w.activity ?? 'null'} start=${w.start_datetime ?? 'null'} day=${w.day ?? 'null'} source=${w.source ?? 'null'}`

  const supabase = supaAdmin()
  const columns = 'id, date, activity_type, duration_min, active_calories, start_time, external_id, source, zone3_plus_minutes'
  const ids = workouts.map(w => w.id).filter((id): id is string => !!id)
  const [inRange, byExternal] = await Promise.all([
    supabase.from('training_sessions').select(columns)
      .eq('user_id', TOKEN_USER_ID).gte('date', shiftIsoDate(from, -1)).lte('date', shiftIsoDate(endDate, 1)),
    ids.length
      ? supabase.from('training_sessions').select(columns)
        .eq('user_id', TOKEN_USER_ID).eq('source', OURA_WORKOUT_SOURCE).in('external_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (inRange.error || byExternal.error) {
    const err = inRange.error ?? byExternal.error
    console.error('[oura] syncOuraWorkouts read failed:', describe(err))
    throw new Error(`training_sessions read failed: ${describe(err)}`)
  }
  const rangeRows = (inRange.data ?? []) as unknown as StoredSession[]
  const ouraRowsById = new Map<string, StoredSession[]>()
  for (const row of (byExternal.data ?? []) as unknown as StoredSession[]) {
    const list = ouraRowsById.get(row.external_id ?? '') ?? []
    list.push(row)
    ouraRowsById.set(row.external_id ?? '', list)
  }

  const results: OuraWorkoutSyncResult[] = []
  const changedDates = new Set<string>()

  for (const w of workouts) {
    const startMs = timeMs(w.start_datetime)
    const endMs = timeMs(w.end_datetime)
    const date = berlinCalendarDate(w.start_datetime)
    if (date && (date < from || date > endDate)) {   // padding only
      workoutLog.push(`${describeWorkout(w)} → skipped: ${date < OURA_WORKOUT_CUTOVER_DATE
        ? `before cutover ${OURA_WORKOUT_CUTOVER_DATE} (Berlin date ${date})`
        : `outside requested range ${from}..${endDate} (Berlin date ${date}, fetch padding)`}`)
      continue
    }
    const result: OuraWorkoutSyncResult = { external_id: w.id ?? null, date, activity: w.activity ?? null, action: 'unchanged' }
    results.push(result)
    workoutLog.push({ w, result })

    if (!w.id || !date || startMs == null || endMs == null || endMs < startMs) {
      result.action = 'skipped_invalid'
      console.warn('[oura] workout skipped (missing id/start/end):', JSON.stringify(w))
      continue
    }
    if (w.source === 'autodetected') {
      // Unconfirmed auto-detected activity — imports once confirmed in the Oura app.
      result.action = 'skipped_autodetected'
      continue
    }

    const mapped: Partial<Record<OuraWorkoutColumn, string | number | null>> = {
      date,
      activity_type: mapOuraActivity(w.activity),
      duration_min: Math.round((endMs - startMs) / 60000),
      start_time: w.start_datetime ?? null,
    }
    if (w.calories != null) mapped.active_calories = Math.round(w.calories)

    const existing = ouraRowsById.get(w.id) ?? []
    if (existing.length > 0) {
      // Keep one row per Oura id (a concurrent saveEntry delete-reinsert could
      // in theory leave two). Prefer the one carrying manual zone3+ minutes.
      const [keep, ...extra] = [...existing].sort((a, b) =>
        Number(b.zone3_plus_minutes != null) - Number(a.zone3_plus_minutes != null))
      if (extra.length > 0) {
        const { error } = await supabase.from('training_sessions').delete().in('id', extra.map(r => r.id))
        if (error) console.error(`[oura] workout ${w.id}: duplicate cleanup failed:`, describe(error))
        else console.warn(`[oura] workout ${w.id}: removed ${extra.length} duplicate row(s)`)
      }

      const payload: Partial<Record<OuraWorkoutColumn, string | number | null>> = {}
      const changed: OuraWorkoutSyncResult['changed'] = {}
      for (const col of OURA_WORKOUT_COLUMNS) {
        if (!(col in mapped)) continue
        const to = mapped[col] ?? null
        const fromVal = keep[col] ?? null
        const same = col === 'start_time'
          ? timeMs(fromVal) === timeMs(to)
          : col === 'date' ? String(fromVal).slice(0, 10) === to
          : col === 'activity_type' ? fromVal === to
          : Number(fromVal) === Number(to) && (fromVal == null) === (to == null)
        if (!same) {
          payload[col] = to
          changed[col] = { from: fromVal, to }
        }
      }
      if (Object.keys(payload).length === 0) continue

      // Only Oura-owned columns are sent — zone3_plus_minutes/notes untouched.
      const { error } = await supabase.from('training_sessions').update(payload).eq('id', keep.id)
      if (error) {
        console.error(`[oura] workout ${w.id} update failed:`, describe(error))
        result.action = 'failed'
        result.error = `update failed: ${describe(error)}`
        continue
      }
      result.action = 'updated'
      result.changed = changed
      changedDates.add(date)
      changedDates.add(String(keep.date).slice(0, 10))
      continue
    }

    // New Oura workout: skip if it matches a session that didn't come from
    // Oura (e.g. a Health Auto Export row from before the cutover deploy).
    const match = rangeRows.find(r =>
      r.source !== OURA_WORKOUT_SOURCE
      && sameActivity(r.activity_type, String(mapped.activity_type))
      && (() => { const t = timeMs(r.start_time); return t != null && Math.abs(t - startMs) <= WORKOUT_MATCH_WINDOW_MS })())
    if (match) {
      result.action = 'skipped_matches_existing'
      result.matched_session_id = match.id
      continue
    }

    const { error } = await supabase.from('training_sessions').insert({
      user_id: TOKEN_USER_ID,
      ...mapped,
      zone3_plus_minutes: null,   // manual-only — Oura has no zone data
      source: OURA_WORKOUT_SOURCE,
      external_id: w.id,
    })
    if (error) {
      console.error(`[oura] workout ${w.id} insert failed:`, describe(error))
      result.action = 'failed'
      result.error = `insert failed: ${describe(error)}`
      continue
    }
    result.action = 'inserted'
    changedDates.add(date)
  }

  const seen = new Set(ids)
  for (const row of rangeRows) {
    if (row.source === OURA_WORKOUT_SOURCE && row.external_id && !seen.has(row.external_id)
        && row.date >= from && row.date <= endDate) {
      console.warn(`[oura] session ${row.id} (${row.date} ${row.activity_type}) no longer in Oura — left in place`)
    }
  }

  // Diagnostic run summary: requested range, API count, one line per workout.
  const outcome = ({ w, result }: { w: OuraWorkout; result: OuraWorkoutSyncResult }): string => {
    switch (result.action) {
      case 'inserted': return 'inserted'
      case 'updated': return `updated (${Object.keys(result.changed ?? {}).join(', ')})`
      case 'unchanged': return 'unchanged'
      case 'skipped_autodetected': return 'skipped: auto-detected (not confirmed in the Oura app)'
      case 'skipped_matches_existing': return `skipped: matched existing session ${result.matched_session_id} (same activity, start within ±10 min)`
      case 'failed': return `failed: ${result.error}`
      case 'skipped_invalid': {
        const s = timeMs(w.start_datetime)
        const e = timeMs(w.end_datetime)
        const missing = [
          !w.id && 'id',
          s == null && 'start_datetime',
          e == null && 'end_datetime',
          s != null && e != null && e < s && 'end before start',
        ].filter(Boolean)
        return `skipped: missing fields (${missing.join(', ')})`
      }
    }
  }
  console.log([
    `[oura] workout sync summary: requested ${startDate}..${endDate} (effective ${from}..${endDate}, cutover ${OURA_WORKOUT_CUTOVER_DATE}; fetched ${fetchStart}..${fetchEnd}) — API returned ${workouts.length} workout(s)`,
    ...workoutLog.map(entry => `  ${typeof entry === 'string' ? entry : `${describeWorkout(entry.w)} → ${outcome(entry)}`}`),
  ].join('\n'))

  // Behavior score reads sessions (readiness fit, active calories).
  for (const date of [...changedDates].sort()) {
    try {
      await recomputeScores(date)
    } catch (e) {
      console.error(`[oura] recomputeScores ${date} failed:`, describe(e))
    }
  }

  return results
}

// ── Webhooks + cron helpers (Session 2) ───────────────────────────────────
// Checked against Oura's v2 docs (Webhook Subscription Routes), Oct 3, 2026:
// - verification: GET callback?verification_token=…&challenge=… → { challenge }
// - events: POST with headers x-oura-signature / x-oura-timestamp; signature
//   is HMAC-SHA256(client_secret, timestamp + JSON body), uppercase hex
// - subscriptions: /v2/webhook/subscription with x-client-id/x-client-secret;
//   one per (data_type, event_type); renew via PUT …/renew/{id}

export const OURA_WEBHOOK_CALLBACK_URL = 'https://health-coach-rho.vercel.app/api/oura/webhook'
const OURA_WEBHOOK_API = 'https://api.ouraring.com/v2/webhook/subscription'
export const OURA_WEBHOOK_DATA_TYPES = ['sleep', 'daily_readiness', 'workout'] as const
const OURA_WEBHOOK_EVENT_TYPES = ['create', 'update', 'delete'] as const
const RENEW_WITHIN_MS = 7 * 24 * 60 * 60 * 1000
export const OURA_RECENT_SYNC_DAYS = 3

export function berlinToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
}

// Last N Berlin days ending today (today counts as one).
export async function syncOuraRecentDays(days = OURA_RECENT_SYNC_DAYS): Promise<OuraSyncDateResult[]> {
  const today = berlinToday()
  return syncOuraRange(shiftIsoDate(today, -(days - 1)), today)
}

// Same window for workouts (clamped to OURA_WORKOUT_CUTOVER_DATE inside).
export async function syncOuraWorkoutsRecentDays(days = OURA_RECENT_SYNC_DAYS): Promise<OuraWorkoutSyncResult[]> {
  const today = berlinToday()
  return syncOuraWorkouts(shiftIsoDate(today, -(days - 1)), today)
}

function hmacHexUpper(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex').toUpperCase()
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

// Oura's reference code signs timestamp + JSON.stringify(parsedBody). We check
// the raw body first and the re-serialised form as a fallback, so a whitespace
// difference between Oura's serialiser and Node's can't cause false rejections.
export function verifyOuraWebhookSignature(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  if (!signature || !timestamp) return false
  const { clientSecret } = clientCredentials()
  const received = signature.trim().toUpperCase()
  if (safeEqual(hmacHexUpper(clientSecret, timestamp + rawBody), received)) return true
  try {
    const reserialised = JSON.stringify(JSON.parse(rawBody))
    return safeEqual(hmacHexUpper(clientSecret, timestamp + reserialised), received)
  } catch {
    return false
  }
}

interface OuraWebhookSubscription {
  id: string
  callback_url: string
  event_type: string
  data_type: string
  expiration_time: string
}

export interface OuraSubscriptionResult {
  data_type: string
  event_type: string
  action: 'ok' | 'created' | 'renewed' | 'failed'
  id?: string
  expiration_time?: string
  error?: string
}

async function webhookApi<T>(method: string, url: string, body?: unknown): Promise<T> {
  const { clientId, clientSecret } = clientCredentials()
  const res = await fetch(url, {
    method,
    headers: {
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Oura webhook API ${method} ${res.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : null) as T
}

// Ensures one live subscription per (data_type, event_type) pointing at our
// callback. Creates missing ones; renews any expiring within 7 days.
export async function ensureWebhookSubscriptions(): Promise<OuraSubscriptionResult[]> {
  const verificationToken = process.env.OURA_WEBHOOK_VERIFICATION_TOKEN
  if (!verificationToken) throw new Error('OURA_WEBHOOK_VERIFICATION_TOKEN not set')

  const existing = await webhookApi<OuraWebhookSubscription[]>('GET', OURA_WEBHOOK_API)
  const ours = (existing ?? []).filter(s => s.callback_url === OURA_WEBHOOK_CALLBACK_URL)

  const results: OuraSubscriptionResult[] = []
  for (const data_type of OURA_WEBHOOK_DATA_TYPES) {
    for (const event_type of OURA_WEBHOOK_EVENT_TYPES) {
      const sub = ours
        .filter(s => s.data_type === data_type && s.event_type === event_type)
        .sort((a, b) => b.expiration_time.localeCompare(a.expiration_time))[0]
      try {
        if (!sub) {
          // Oura calls GET /api/oura/webhook to verify before this returns.
          const created = await webhookApi<OuraWebhookSubscription>('POST', OURA_WEBHOOK_API, {
            callback_url: OURA_WEBHOOK_CALLBACK_URL,
            verification_token: verificationToken,
            event_type,
            data_type,
          })
          results.push({ data_type, event_type, action: 'created', id: created.id, expiration_time: created.expiration_time })
        } else if (new Date(sub.expiration_time).getTime() - Date.now() < RENEW_WITHIN_MS) {
          const renewed = await webhookApi<OuraWebhookSubscription>('PUT', `${OURA_WEBHOOK_API}/renew/${encodeURIComponent(sub.id)}`)
          results.push({ data_type, event_type, action: 'renewed', id: renewed.id, expiration_time: renewed.expiration_time })
        } else {
          results.push({ data_type, event_type, action: 'ok', id: sub.id, expiration_time: sub.expiration_time })
        }
      } catch (e) {
        console.error(`[oura] subscription ${data_type}/${event_type} failed:`, describe(e))
        results.push({ data_type, event_type, action: 'failed', id: sub?.id, error: describe(e) })
      }
    }
  }
  return results
}

// CRON_SECRET bearer check, same as the notification / cgm-import crons.
export function isAuthorizedCron(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET
  return !!cronSecret && !!authHeader && safeEqual(authHeader, `Bearer ${cronSecret}`)
}

// Recomputes stored scores for every date in [startDate, endDate], ascending,
// skipping dates in `alreadyRecomputed` (e.g. ones syncOuraRange just did).
// Idempotent — recomputeScores() derives everything from stored inputs.
// Dates with no daily_entries row are a no-op inside recomputeScores().
export async function recomputeScoresForRange(
  startDate: string,
  endDate: string,
  alreadyRecomputed: Set<string> = new Set(),
): Promise<{ date: string; recomputed: boolean; error?: string }[]> {
  const out: { date: string; recomputed: boolean; error?: string }[] = []
  for (let date = startDate; date <= endDate; date = shiftIsoDate(date, 1)) {
    if (alreadyRecomputed.has(date)) {
      out.push({ date, recomputed: true })
      continue
    }
    try {
      await recomputeScores(date)
      out.push({ date, recomputed: true })
    } catch (e) {
      console.error(`[oura] recomputeScores ${date} failed:`, describe(e))
      out.push({ date, recomputed: false, error: describe(e) })
    }
  }
  return out
}
