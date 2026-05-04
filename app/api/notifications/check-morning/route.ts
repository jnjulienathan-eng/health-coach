import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getTodayBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL
  if (!publicKey || !privateKey || !email) throw new Error('Missing VAPID env vars')
  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey)
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = supaAdmin()
  const today = getTodayBerlin()

  const { data: entry } = await supabase
    .from('daily_entries')
    .select('morning_stack_taken')
    .eq('user_id', 'julie')
    .eq('date', today)
    .maybeSingle()

  if (entry?.morning_stack_taken === true) {
    return NextResponse.json({ sent: false, reason: 'already logged' })
  }

  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')

  if (subError) {
    console.error('Failed to fetch push_subscriptions:', subError.message)
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: false, reason: 'no subscriptions' })
  }

  configureWebPush()

  const payload = JSON.stringify({
    title: 'BodyCipher',
    body: 'Good morning — have you taken your morning supplements?',
    actions: [
      { action: 'confirm', title: 'Yes, taken' },
      { action: 'snooze', title: 'Remind me later' },
    ],
  })

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  )

  let sent = 0
  let failed = 0
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      sent++
      console.log(`Push sent to ${subscriptions[i].endpoint}`)
    } else {
      failed++
      console.error(`Push failed for ${subscriptions[i].endpoint}:`, result.reason)
    }
  })

  return NextResponse.json({ sent, failed })
}
