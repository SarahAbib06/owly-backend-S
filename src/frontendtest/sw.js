// sw.js

self.addEventListener('push', event => {
  console.log('[Service Worker] Notification reçue');

  let data = {
    title: 'Nouveau message',
    body: 'Tu as un nouveau message',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.log('Données non JSON');
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    vibrate: [200, 100, 200],
    data: data.data || { url: '/' },
    tag: data.tag || 'chat-msg',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification cliquée');
  event.notification.close();

  const url = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});