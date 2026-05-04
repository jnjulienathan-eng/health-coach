self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'BodyCipher'
  const options = {
    body: data.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: data.tag || 'bodycypher-notification',
    data: data.data || {},
    actions: data.actions || [],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'confirm') {
    event.waitUntil(
      fetch('/api/notifications/supplement-confirm', { method: 'POST' })
    )
  }
  // 'snooze' action: notification is already closed above — logic in a later session
})
