// GET /api/oura/sync — daily cron (vercel.json, 11:00 UTC), CRON_SECRET auth.
// Safety net behind the webhook: re-syncs the last 3 Berlin days, then makes
// sure a webhook subscription exists for every (sleep | daily_readiness) ×
// (create | update | delete) combination — creating missing ones and renewing
// any that expire within 7 days.

import { NextRequest, NextResponse } from 'next/server'
import { describe, ensureWebhookSubscriptions, isAuthorizedCron, syncOuraRecentDays } from '@/lib/oura'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let sync: unknown
  try {
    sync = await syncOuraRecentDays()
  } catch (e) {
    console.error('[oura/sync] sync failed:', describe(e))
    sync = { error: describe(e) }
  }

  let subscriptions: unknown
  try {
    subscriptions = await ensureWebhookSubscriptions()
  } catch (e) {
    console.error('[oura/sync] subscriptions failed:', describe(e))
    subscriptions = { error: describe(e) }
  }

  console.log('[oura/sync]', JSON.stringify({ sync, subscriptions }))
  return NextResponse.json({ sync, subscriptions })
}
