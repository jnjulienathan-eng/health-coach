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

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then(async (registration) => {
        if (Notification.permission === 'granted') {
          // Already granted — ensure we have a subscription stored.
          await subscribeAndSend(registration)
        } else if (Notification.permission === 'default') {
          const result = await Notification.requestPermission()
          if (result === 'granted') {
            await subscribeAndSend(registration)
          }
        }
        // 'denied' — do nothing
      })
      .catch(() => {})
  }, [])

  return null
}
