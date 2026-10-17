/* Calendraft - service worker minimal et prudent.
 *
 * Ce qu'il fait :
 *  - garde en cache la page "hors connexion" et les icônes ;
 *  - met en cache les fichiers /assets/ (leur nom change à chaque version) ;
 *  - affiche /offline.html quand on ouvre une page sans réseau ;
 *  - affiche les notifications de rappel envoyées par le serveur (événement "push") et en garde
 *    une trace minimale sur l'appareil pour le diagnostic (jamais envoyée sur internet).
 *
 * Ce qu'il ne fait JAMAIS :
 *  - toucher aux requêtes vers Supabase ou tout autre site (autre origine) ;
 *  - toucher à /api/* (import d'emploi du temps) ;
 *  - mettre en cache les données, les pages ou les connexions des utilisateurs.
 *
 * Pour forcer une mise à jour des fichiers en cache, changez le numéro de VERSION.
 */
const VERSION = 'v3'
const STATIC_CACHE = `calendraft-static-${VERSION}`
const ASSETS_CACHE = `calendraft-assets-${VERSION}`
// Petit journal des notifications reçues (10 dernières), lu par /diagnostic-notifications.html.
const DEBUG_CACHE = 'calendraft-debug'
const DEBUG_KEY = '/__push-log'
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
            .filter((key) => key !== STATIC_CACHE && key !== ASSETS_CACHE && key !== DEBUG_CACHE)
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

// ---------------------------------------------------------------------------
// Notifications de rappel
// Le serveur envoie un message chiffré {title, body, url, tag} ; le navigateur le
// déchiffre et réveille ce fichier, qui affiche la notification.
// ---------------------------------------------------------------------------
async function logPush(entry) {
  try {
    const cache = await caches.open(DEBUG_CACHE)
    const previous = await cache.match(DEBUG_KEY)
    const list = previous ? await previous.json() : []
    list.unshift({ at: new Date().toISOString(), ...entry })
    await cache.put(
      DEBUG_KEY,
      new Response(JSON.stringify(list.slice(0, 10)), { headers: { 'Content-Type': 'application/json' } })
    )
  } catch {
    // Le journal ne doit jamais empêcher l'affichage d'une notification.
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  let reading = 'no_data'
  if (event.data) {
    try {
      data = event.data.json()
      reading = 'json'
    } catch {
      data = { body: event.data.text() }
      reading = 'text'
    }
  }

  const title = typeof data.title === 'string' && data.title ? data.title : 'Calendraft'
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    lang: 'fr',
    // Même tag = la notification précédente est remplacée au lieu de s'empiler.
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    data: { url: typeof data.url === 'string' ? data.url : '/' },
  }

  event.waitUntil(
    self.registration.showNotification(title, options).then(
      () => logPush({ reading, title: title.slice(0, 40), shown: true }),
      (error) => logPush({ reading, title: title.slice(0, 40), shown: false, error: String((error && error.message) || error) })
    )
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  // On n'ouvre jamais un autre site que Calendraft.
  let target
  try {
    target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
  } catch {
    return
  }
  if (target.origin !== self.location.origin) return

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        // On ne recharge la page que si l'adresse demandée est différente.
        if (client.url !== target.href && target.pathname !== '/' && 'navigate' in client) {
          await client.navigate(target.href).catch(() => undefined)
        }
        return
      }
      await self.clients.openWindow(target.href)
    })()
  )
})
