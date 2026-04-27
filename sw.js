// VOYAGO Service Worker — Push Notifications
const CACHE_NAME = 'voyago-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push event — sunucudan bildirim geldiğinde
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'VOYAGO', body: event.data ? event.data.text() : 'Yeni bildirim' };
  }

  const title = data.title || 'VOYAGO';
  const options = {
    body: data.body || '',
    tag: data.tag || 'voyago-default',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    renotify: true,
    timestamp: data.timestamp || Date.now(),
    data: {
      click_action: data.click_action || '/',
      tag: data.tag || ''
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Bildirime tıklayınca
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.click_action) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Açık bir VOYAGO penceresi var mı?
      for (const client of clientList) {
        if ('focus' in client) {
          // Hash ile yönlendir
          client.postMessage({ type: 'voyago-notification-click', target: targetUrl, tag: event.notification.data?.tag });
          return client.focus();
        }
      }
      // Açık pencere yoksa yenisini aç
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Push subscription değişirse (silindi/yenilendi) — ileride eklenebilir
self.addEventListener('pushsubscriptionchange', (event) => {
  // Şimdilik bir şey yapmıyoruz
});
