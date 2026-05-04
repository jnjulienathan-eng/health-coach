'use client'

import { useEffect } from 'react'

async function subscribeAndSend(registration: ServiceWorkerRegistration) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKey,
  })

  const { endpoint, keys } = subscription.toJSON() as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }

  await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
  })
}

// Called from a button tap — iOS requires a user gesture before requestPermission().
// Returns the resulting permission so callers can update their UI state.
export async function enableNotifications(): Promise<NotificationPermission> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'denied'
  const result = await Notification.requestPermission()
  if (result === 'granted') {
    const registration = await navigator.serviceWorker.ready
    await subscribeAndSend(registration)
  }
  return result
}

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then(async (registration) => {
        if (Notification.permission === 'granted') {
          // Already granted — ensure we have a subscription stored.
          await subscribeAndSend(registration)
        }
        // 'default': wait for user gesture via enableNotifications()
        // 'denied': do nothing
      })
      .catch(() => {})
  }, [])

  return null
}
