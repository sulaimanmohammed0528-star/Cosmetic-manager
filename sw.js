const CACHE_NAME = 'labsuite-v1';
const ASSETS = ['./index.html', './styles.css', './app.js', './manifest.json'];

// Install background system assets
self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then(response => response || fetch(e.request)));
});

// Listener engine to trigger smart notifications to your phone
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'TRIGGER_NOTIFICATION') {
        self.registration.showNotification(event.data.title, {
            body: event.data.body,
            icon: 'https://flaticon.com',
            vibrate:,
            badge: 'https://flaticon.com'
        });
    }
});
