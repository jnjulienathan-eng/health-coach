// GET  /api/oura/webhook?verification_token=…&challenge=…
//   Oura's subscription verification handshake: echo { challenge } when the
//   token matches OURA_WEBHOOK_VERIFICATION_TOKEN.
//
// POST /api/oura/webhook
//   Oura event notification. Verifies x-oura-signature (HMAC-SHA256 of
//   x-oura-timestamp + body, keyed with OURA_CLIENT_SECRET), responds 200
//   straight away, then — via after() — re-syncs the last 3 Berlin days with
//   syncOuraRange() rather than fetching the single object, so creates,
//   updates and deletes are all handled the same idempotent way.

import { NextRequest, NextResponse, after } from 'next/server'
import { OURA_WEBHOOK_DATA_TYPES, describe, syncOuraRecentDays, verifyOuraWebhookSignature } from '@/lib/oura'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const expected = process.env.OURA_WEBHOOK_VERIFICATION_TOKEN
  const token = req.nextUrl.searchParams.get('verification_token')
  const challenge = req.nextUrl.searchParams.get('challenge')
  if (!expected || !token || token !== expected || !challenge) {
    return new NextResponse('Invalid verification token', { status: 401 })
  }
  return NextResponse.json({ challenge })
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  let valid = false
  try {
    valid = verifyOuraWebhookSignature(rawBody, req.headers.get('x-oura-signature'), req.headers.get('x-oura-timestamp'))
  } catch (e) {
    console.error('[oura/webhook] signature check error:', describe(e))
  }
  if (!valid) return new NextResponse('Invalid signature', { status: 401 })

  let event: { event_type?: string; data_type?: string; object_id?: string } = {}
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  const relevant = (OURA_WEBHOOK_DATA_TYPES as readonly string[]).includes(event.data_type ?? '')
  console.log(`[oura/webhook] ${event.event_type}/${event.data_type} object=${event.object_id}${relevant ? '' : ' (ignored)'}`)

  if (relevant) {
    after(async () => {
      try {
        const results = await syncOuraRecentDays()
        const changed = results.filter(r => Object.keys(r.changed).length > 0 || r.error)
        console.log('[oura/webhook] sync done:', JSON.stringify(changed))
      } catch (e) {
        console.error('[oura/webhook] sync failed:', describe(e))
      }
    })
  }

  return NextResponse.json({ ok: true })
}
