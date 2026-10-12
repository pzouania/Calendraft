/* Calendraft - service worker minimal et prudent.
 *
 * Ce qu'il fait :
 *  - garde en cache la page "hors connexion" et les icônes ;
 *  - met en cache les fichiers /assets/ (leur nom change à chaque version) ;
 *  - affiche /offline.html quand on ouvre une page sans réseau.
 *
 * Ce qu'il ne fait JAMAIS :
 *  - toucher aux requêtes vers Supabase ou tout autre site (autre origine) ;
 *  - toucher à /api/* (import d'emploi du temps) ;
 *  - mettre en cache les données, les pages ou les connexions des utilisateurs.
 *
 * Pour forcer une mise à jour des fichiers en cache, changez le numéro de VERSION.
 */
const VERSION = 'v1'
const STATIC_CACHE = `calendraft-static-${VERSION}`
const ASSETS_CACHE = `calendraft-assets-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]
const MAX_ASSET_ENTRIES = 80

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== ASSETS_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)))
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Autre origine (Supabase, polices, etc.) : on ne touche à rien.
  if (url.origin !== self.location.origin) return

  // API du Worker : jamais interceptée.
  if (url.pathname.startsWith('/api/')) return

  // Ouverture d'une page : réseau d'abord, page "hors connexion" si pas de réseau.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL)
        return (
          cached ||
          new Response('Hors connexion', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        )
      })
    )
    return
  }

  // Fichiers de l'application (noms uniques à chaque version) : cache d'abord.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone())
          trimCache(ASSETS_CACHE, MAX_ASSET_ENTRIES)
        }
        return response
      })
    )
    return
  }

  // Icônes et page hors connexion : cache d'abord.
  if (url.pathname.startsWith('/icons/') || url.pathname === OFFLINE_URL) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
  }
})
