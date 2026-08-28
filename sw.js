// Service Worker para Notificações PUSH e Notificações Locais no Celular (Araújo Detail)
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Evento de clique na notificação na barra do celular
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    if (client.postMessage) {
                        client.postMessage({ action: 'OPEN_BOOKINGS' });
                    }
                    return;
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/admin');
            }
        })
    );
});
