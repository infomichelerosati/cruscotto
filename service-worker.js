// service-worker.js

const CACHE_NAME = 'futuristic-speedometer-cache-v5';
const urlsToCache = [
    '/',
    'index.html',
    'app.js',
    'manifest.json',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap'
];

// Evento di installazione: apre la cache e aggiunge i file principali
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aperta');
                return cache.addAll(urlsToCache);
            })
    );
});

// Evento fetch: serve i file dalla cache se disponibili
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Se la risorsa è in cache, la restituisce
                if (response) {
                    return response;
                }
                // Altrimenti, la richiede dalla rete
                return fetch(event.request);
            })
    );
});

// Evento di attivazione: pulisce le vecchie cache
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});



