// VOYAGO Service Worker — Offline Cache + Push Notifications
const CACHE_NAME = 'voyago-v3-pwa';

// Cache'lenecek temel dosyalar (uygulama iskeleti)
const STATIC_FILES = [
  './',
  './index.html',
  './sw.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
];

// ── INSTALL: Temel dosyaları cache'le ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Hata durumlarına toleranslı — bazıları başarısız olsa bile devam et
      return Promise.all(
        STATIC_FILES.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Cache eklenemedi:', url, err.message);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE: Eski cache'leri sil ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      ),
      self.clients.claim(),
    ])
  );
});

// ── FETCH: Akıllı önbellek stratejisi ──
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Sadece GET isteklerini cache'le
  if (req.method !== 'GET') return;

  // Supabase API çağrıları → network-only (online gerekir)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('api.openai.com') ||
    url.hostname.includes('vercel.app') && url.pathname.includes('/api/')
  ) {
    return; // Browser'ın varsayılan davranışını kullan (cache yok)
  }

  // Push bildirim API'leri için aynı
  if (url.pathname.includes('/push') || url.pathname.includes('send-push')) {
    return;
  }

  // HTML / JS / CSS / Resim → Cache-first, network fallback
  event.respondWith(
    caches.match(req).then((cached) => {
      // Cache'te varsa — döndür + arkaplanda güncelle
      if (cached) {
        // Background refresh (network varsa cache'i tazele)
        fetch(req)
          .then((freshResp) => {
            if (freshResp && freshResp.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(req, freshResp).catch(() => {});
              });
            }
          })
          .catch(() => {});
        return cached;
      }

      // Cache'te yok — network'ten al ve cache'le
      return fetch(req)
        .then((resp) => {
          // Sadece başarılı yanıtları cache'le
          if (resp && resp.status === 200) {
            const respClone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, respClone).catch(() => {});
            });
          }
          return resp;
        })
        .catch(() => {
          // Network yok, cache de yok
          // HTML isteği ise → index.html dön (uygulama localStorage'tan çalışır)
          if (req.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html').then((html) => html || new Response(
              `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>VOYAGO - Çevrimdışı</title>
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <style>body{font-family:sans-serif;text-align:center;padding:40px 20px;background:#f0f4f8;color:#1a1a1a;}h1{color:#1a5fa8;}p{color:#666;line-height:1.6;}button{background:#1a5fa8;color:white;border:none;padding:12px 30px;border-radius:10px;font-size:14px;cursor:pointer;margin-top:14px;}</style>
              </head><body>
              <h1>📡 Çevrimdışısınız</h1>
              <p>İnternet bağlantınız yok.<br>VOYAGO uygulaması cache'te yüklü değil.<br>Bir kere internete bağlanıp uygulamayı açtıktan sonra<br>çevrimdışı kullanılabilir.</p>
              <button onclick="location.reload()">🔄 Tekrar Dene</button>
              </body></html>`,
              { status: 200, headers: { 'Content-Type': 'text/html' } }
            ));
          }
          return new Response('Çevrimdışı', { status: 503 });
        });
    })
  );
});

// ── PUSH: Bildirim al ──
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
      tag: data.tag || '',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── BİLDİRİME TIKLAYINCA ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.click_action || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Açık pencere varsa odakla
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Yoksa yeni pencere aç
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ── SKIP_WAITING MESAJI (manuel update) ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
