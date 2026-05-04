'use client'

import { useEffect } from 'react'

// Converts a base64url string to the Uint8Array that pushManager.subscribe expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function subscribeAndSend(registration: ServiceWorkerRegistration) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
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
