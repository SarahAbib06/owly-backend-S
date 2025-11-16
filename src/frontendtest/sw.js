// Service Worker pour les notifications push
self.addEventListener('push', function(event) {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body,
        icon: '/icon.png',
        badge: '/badge.png',
        vibrate: [100, 50, 100],
        data: data.data,
        actions: [
            {
                action: 'open',
                title: 'Ouvrir'
            },
            {
                action: 'close',
                title: 'Fermer'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    if (event.action === 'open') {
        // Ouvrir l'application
        event.waitUntil(
            clients.openWindow('http://localhost:3000') // Remplace par ton URL
        );
    }
});