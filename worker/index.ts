import { REFILL_SLICES, refillQueue, sendDueReminders } from './reminders'
import { sendWebPush, type VapidConfig } from './webpush'

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  SUPABASE_URL: string
  FEED_WORKER_SECRET?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

// Types minimaux des exécutions planifiées (cron) de Cloudflare.
interface ScheduledController {
  cron: string
  scheduledTime: number
}
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void
}

interface RawEvent {
  uid: string
  summary: string
  location: string
  start: string
  end: string
  cancelled: boolean
}

interface FeedEvent {
  uid: string
  title: string
  location: string
  date: string
  start: string | null
  end: string | null
  segment: 'full' | 'start' | 'end'
}

const MAX_BYTES = 5 * 1024 * 1024
const MAX_EVENTS = 5000
const TIMEOUT_MS = 8000
const CACHE_SECONDS = 600
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const OE_RE =
  /(?<!\p{L})\?(?=uvr|uf|il(?!\p{L}))|(?<=\p{L})\?(?=uvr|uf|ur)|(?<=v)\?(?=ux)|(?<=n)\?(?=ud)/giu

const parisFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function toParis(ms: number): { date: string; time: string } {
  const p: Record<string, string> = {}
  for (const part of parisFmt.formatToParts(new Date(ms))) p[part.type] = part.value
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

function addOneDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function parseIcsDate(value: string): { date: string; time: string | null } | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, , z] = m
  if (h === undefined) return { date: `${y}-${mo}-${d}`, time: null }
  if (z) {
    const p = toParis(Date.UTC(+y, +mo - 1, +d, +h, +mi))
    return { date: p.date, time: p.time }
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }
}

function unfold(text: string): string[] {
  const lines: string[] = []
  for (const line of text.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function fixLigatures(text: string): string {
  if (!text.includes('?')) return text
  return text.replace(OE_RE, (_match: string, offset: number, whole: string) => {
    const next = whole[offset + 1] ?? ''
    return next !== next.toLowerCase() ? 'Œ' : 'œ'
  })
}

function unescapeText(value: string): string {
  return fixLigatures(value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim())
}

function parseIcs(text: string) {
  const events: RawEvent[] = []
  let current: RawEvent | null = null
  let recurring = 0

  for (const line of unfold(text)) {
    const marker = line.trim().toUpperCase()
    if (marker === 'BEGIN:VEVENT') {
      current = { uid: '', summary: '', location: '', start: '', end: '', cancelled: false }
      continue
    }
    if (marker === 'END:VEVENT') {
      if (current && current.start) events.push(current)
      current = null
      continue
    }
    if (!current) continue

    const idx = line.indexOf(':')
    if (idx < 0) continue
    const name = line.slice(0, idx).split(';')[0].toUpperCase()
    const value = line.slice(idx + 1)

    switch (name) {
      case 'UID':
        current.uid = value.trim()
        break
      case 'SUMMARY':
        current.summary = unescapeText(value)
        break
      case 'LOCATION':
        current.location = unescapeText(value)
        break
      case 'DTSTART':
        current.start = value.trim()
        break
      case 'DTEND':
        current.end = value.trim()
        break
      case 'STATUS':
        current.cancelled = value.trim().toUpperCase() === 'CANCELLED'
        break
      case 'RRULE':
        recurring++
        break
    }
  }

  return { events, recurring }
}

function expand(raw: RawEvent): FeedEvent[] {
  const start = parseIcsDate(raw.start)
  if (!start) return []
  const end = raw.end ? parseIcsDate(raw.end) : null
  const base = { uid: raw.uid, title: raw.summary || 'Sans titre', location: raw.location }

  if (start.time === null) {
    const out: FeedEvent[] = []
    const last = end && end.date > start.date ? end.date : null
    let day = start.date
    for (let i = 0; i < 31; i++) {
      out.push({ ...base, date: day, start: null, end: null, segment: 'full' })
      day = addOneDay(day)
      if (!last || day >= last) break
    }
    return out
  }

  const endDate = end?.date ?? start.date
  const endTime = end?.time ?? start.time

  if (endDate <= start.date) {
    return [{ ...base, date: start.date, start: start.time, end: endTime, segment: 'full' }]
  }

  if (endDate === addOneDay(start.date) && endTime === '00:00') {
    return [{ ...base, date: start.date, start: start.time, end: '24:00', segment: 'full' }]
  }

  return [
    { ...base, date: start.date, start: start.time, end: endTime, segment: 'start' },
    { ...base, date: endDate, start: start.time, end: endTime, segment: 'end' },
  ]
}

function byDateTime(a: FeedEvent, b: FeedEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const x = a.start ?? ''
  const y = b.start ?? ''
  return x < y ? -1 : x > y ? 1 : 0
}

function validateFeedUrl(raw: unknown): URL | null {
  let u: URL
  try {
    u = new URL(String(raw ?? '').trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  if (u.port && u.port !== '443') return null
  const host = u.hostname.toLowerCase()
  if (!host.includes('.')) return null
  if (host.startsWith('[') || host.includes(':')) return null
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) return null
  return u
}

async function fetchFeed(
  url: string
): Promise<{ ok: true; text: string } | { ok: false; reason: string; status?: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'user-agent': 'Calendraft/1.0 (+https://calendraft.fr)',
        accept: 'text/calendar, text/plain, */*',
      },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    } as RequestInit)

    if (res.status >= 300 && res.status < 400) return { ok: false, reason: 'redirect', status: res.status }
    if (!res.ok) return { ok: false, reason: 'http_error', status: res.status }

    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_BYTES) return { ok: false, reason: 'too_large' }

    const text = await res.text()
    if (text.length > MAX_BYTES) return { ok: false, reason: 'too_large' }
    if (!/BEGIN:VCALENDAR/i.test(text)) return { ok: false, reason: 'not_ics' }

    return { ok: true, text }
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return { ok: false, reason: timedOut ? 'timeout' : 'network_error' }
  } finally {
    clearTimeout(timer)
  }
}

function bearer(request: Request): string | null {
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}

function apiKey(request: Request): string | null {
  const k = request.headers.get('x-supabase-key')
  return k && k.length < 400 ? k : null
}

async function handleCheck(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405)

  const token = bearer(request)
  const key = apiKey(request)
  if (!token || !key) return json({ ok: false, reason: 'unauthorized' }, 401)

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: key },
  })
  if (!userRes.ok) return json({ ok: false, reason: 'unauthorized' }, 401)

  let body: { url?: unknown }
  try {
    body = (await request.json()) as { url?: unknown }
  } catch {
    return json({ ok: false, reason: 'bad_url' }, 400)
  }

  const target = validateFeedUrl(body.url)
  if (!target) return json({ ok: false, reason: 'bad_url' }, 400)

  const feed = await fetchFeed(target.toString())
  if (!feed.ok) return json({ ok: false, reason: feed.reason, status: feed.status })

  const { events, recurring } = parseIcs(feed.text)
  const active = events.filter((e) => !e.cancelled)
  const segments = active.flatMap(expand).sort(byDateTime)
  const today = toParis(Date.now()).date

  return json({
    ok: true,
    eventCount: active.length,
    recurring,
    earliest: segments[0]?.date ?? null,
    latest: segments[segments.length - 1]?.date ?? null,
    upcoming: segments
      .filter((e) => e.date >= today)
      .slice(0, 5)
      .map((e) => ({ title: e.title, date: e.date, start: e.start, end: e.end, location: e.location })),
  })
}

async function handleEvents(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405)

  const token = bearer(request)
  const key = apiKey(request)
  if (!token || !key) return json({ ok: false, reason: 'unauthorized' }, 401)
  if (!env.FEED_WORKER_SECRET) return json({ ok: false, reason: 'secret_missing' }, 500)

  let body: { calendarId?: unknown; from?: unknown; to?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400)
  }

  const { calendarId, from, to } = body
  if (
    typeof calendarId !== 'string' || !UUID_RE.test(calendarId) ||
    typeof from !== 'string' || !DAY_RE.test(from) ||
    typeof to !== 'string' || !DAY_RE.test(to) ||
    to < from
  ) {
    return json({ ok: false, reason: 'bad_request' }, 400)
  }

  const rpc = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_calendar_feed`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ p_calendar: calendarId, p_secret: env.FEED_WORKER_SECRET }),
  })

  if (rpc.status === 401) return json({ ok: false, reason: 'unauthorized' }, 401)
  if (!rpc.ok) return json({ ok: false, reason: 'database_error' }, 502)

  const data = (await rpc.json()) as
    | null
    | { configured: false }
    | { configured: true; url: string; label: string; color: string }

  if (!data) return json({ ok: false, reason: 'forbidden' }, 403)
  if (!data.configured) return json({ ok: true, configured: false, events: [] })

  const feed = await fetchFeed(data.url)
  if (!feed.ok) return json({ ok: false, reason: 'feed_unreachable', detail: feed.reason })

  const { events, recurring } = parseIcs(feed.text)
  const all = events
    .filter((e) => !e.cancelled)
    .flatMap(expand)
    .filter((e) => e.date >= from && e.date <= to)
    .sort(byDateTime)

  return json({
    ok: true,
    configured: true,
    label: data.label,
    color: data.color,
    recurring,
    truncated: all.length > MAX_EVENTS,
    events: all.slice(0, MAX_EVENTS),
  })
}

async function handleAssetLinks(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405)
  }

  // Le fichier est publié sous /assetlinks.json (dossier public) : un dossier
  // caché comme .well-known n'est pas toujours envoyé par le déploiement.
  const source = new Request(new URL('/assetlinks.json', request.url).toString(), {
    method: 'GET',
  })
  const res = await env.ASSETS.fetch(source)
  const type = res.headers.get('content-type') ?? ''

  // Si le fichier est absent, le site renvoie sa page d'accueil : on refuse de la servir.
  if (!res.ok || !type.includes('json')) return json({ ok: false, reason: 'not_found' }, 404)

  const text = await res.text()
  try {
    if (!Array.isArray(JSON.parse(text))) throw new Error('not an array')
  } catch {
    return json({ ok: false, reason: 'invalid_assetlinks' }, 500)
  }

  return new Response(request.method === 'HEAD' ? null : text, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}

function vapidConfig(env: Env): VapidConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'https://calendraft.fr',
  }
}

// Clé publique des notifications : le navigateur en a besoin pour s'abonner (elle n'est pas secrète).
// « remindersReady » indique seulement si le serveur peut préparer les rappels (aucune clé n'est révélée).
function handlePushConfig(request: Request, env: Env): Response {
  if (request.method !== 'GET') return json({ ok: false, reason: 'method_not_allowed' }, 405)
  const vapid = vapidConfig(env)
  if (!vapid) return json({ ok: false, reason: 'not_configured' })
  return json({ ok: true, publicKey: vapid.publicKey, remindersReady: Boolean(env.SUPABASE_SERVICE_ROLE_KEY) })
}

// Anti-rafale (par instance du serveur) : une personne ne relance pas la préparation plus d'une fois toutes les 5 s.
const lastSync = new Map<string, number>()

// Prépare tout de suite les rappels de la personne connectée (appelé quand elle change un rappel).
async function handleReminderSync(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405)

  const token = bearer(request)
  const key = apiKey(request)
  if (!token || !key) return json({ ok: false, reason: 'unauthorized' }, 401)
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, reason: 'not_configured' })

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: key },
  })
  if (!userRes.ok) return json({ ok: false, reason: 'unauthorized' }, 401)
  const user = (await userRes.json()) as { id?: unknown }
  if (typeof user.id !== 'string' || !UUID_RE.test(user.id)) return json({ ok: false, reason: 'unauthorized' }, 401)

  const now = Date.now()
  const previous = lastSync.get(user.id) ?? 0
  if (now - previous < 5000) return json({ ok: true, throttled: true })
  lastSync.set(user.id, now)
  if (lastSync.size > 500) lastSync.clear()

  try {
    const stats = await refillQueue(env, now, { userId: user.id })
    return json({ ok: true, queued: stats.queued })
  } catch {
    return json({ ok: false, reason: 'server_error' }, 502)
  }
}

// Tâches planifiées : chaque minute on envoie les rappels dus, toutes les 15 minutes on prépare les suivants.
async function runScheduled(cron: string, scheduledTime: number, env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Rappels inactifs : le secret SUPABASE_SERVICE_ROLE_KEY est absent.')
    return
  }
  try {
    if (cron === '* * * * *') {
      const vapid = vapidConfig(env)
      if (!vapid) {
        console.warn('Rappels inactifs : les clés VAPID sont absentes.')
        return
      }
      const stats = await sendDueReminders(env, Date.now(), vapid)
      if (stats.due > 0) console.log('rappels', JSON.stringify(stats))
    } else if (cron === '*/15 * * * *') {
      // 4 tranches de personnes, une toutes les 15 minutes : 00 -> 0, 15 -> 1, 30 -> 2, 45 -> 3.
      const slice = Math.floor(new Date(scheduledTime).getUTCMinutes() / 15) % REFILL_SLICES
      const stats = await refillQueue(env, Date.now(), { slice })
      if (stats.truncated) console.warn('Trop de rappels dans une tranche : certains ne sont pas préparés.')
      console.log('file de rappels', JSON.stringify({ slice, ...stats }))
    }
  } catch (error) {
    console.error('Erreur des rappels :', error instanceof Error ? error.message : 'inconnue')
  }
}

interface DeviceRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

// Envoie une notification d'essai aux appareils de la personne connectée.
async function handlePushTest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405)

  const token = bearer(request)
  const key = apiKey(request)
  if (!token || !key) return json({ ok: false, reason: 'unauthorized' }, 401)

  const vapid = vapidConfig(env)
  if (!vapid) return json({ ok: false, reason: 'not_configured' })

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: key },
  })
  if (!userRes.ok) return json({ ok: false, reason: 'unauthorized' }, 401)

  let wanted: string | null = null
  try {
    const body = (await request.json()) as { endpoint?: unknown }
    if (typeof body.endpoint === 'string' && body.endpoint.length < 1000) wanted = body.endpoint
  } catch {
    // Corps absent ou invalide : on testera tous les appareils.
  }

  // Les règles de sécurité de la base ne laissent lire que les appareils de cette personne.
  const devicesRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&order=created_at.desc&limit=10`,
    { headers: { apikey: key, authorization: `Bearer ${token}` } }
  )
  if (!devicesRes.ok) return json({ ok: false, reason: 'database_error' }, 502)

  const all = (await devicesRes.json()) as DeviceRow[]
  const devices = wanted ? all.filter((d) => d.endpoint === wanted) : all
  if (devices.length === 0) return json({ ok: false, reason: 'no_device' })

  const message = {
    title: 'Calendraft',
    body: 'Les rappels fonctionnent sur cet appareil.',
    url: '/',
    tag: 'calendraft-test',
  }

  const results = await Promise.all(
    devices.map((d) =>
      sendWebPush({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, message, vapid, {
        ttl: 300,
        urgency: 'high',
      }).catch(() => ({ ok: false, status: 0, gone: false }))
    )
  )

  // Un appareil qui n'existe plus (404 / 410) est retiré de la liste.
  const goneIds = devices.filter((_, i) => results[i].gone).map((d) => d.id)
  if (goneIds.length > 0) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${goneIds.join(',')})`, {
      method: 'DELETE',
      headers: { apikey: key, authorization: `Bearer ${token}` },
    }).catch(() => undefined)
  }

  return json({
    ok: true,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    removed: goneIds.length,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname === '/.well-known/assetlinks.json') return handleAssetLinks(request, env)
    if (pathname === '/api/feed/check') return handleCheck(request, env)
    if (pathname === '/api/feed/events') return handleEvents(request, env)
    if (pathname === '/api/push/config') return handlePushConfig(request, env)
    if (pathname === '/api/push/test') return handlePushTest(request, env)
    if (pathname === '/api/reminders/sync') return handleReminderSync(request, env)
    if (pathname.startsWith('/api/')) return json({ ok: false, reason: 'not_found' }, 404)

    return env.ASSETS.fetch(request)
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContextLike): Promise<void> {
    ctx.waitUntil(runScheduled(controller.cron, controller.scheduledTime, env))
  },
}
