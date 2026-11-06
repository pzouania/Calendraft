import { buildIcsFile, icsFileName, rollingWindow } from '../src/lib/icsExport'
import type { Frequency, Period, PeriodException } from '../src/types'

// Lien de synchronisation d'un calendrier : GET /api/ics/<identifiant>.ics
//
// C'est l'adresse à laquelle s'abonnent Google Agenda, Apple Calendrier, Outlook... Ces programmes n'ont ni compte
// Calendraft ni clé : seul l'identifiant secret du lien (voir ics_links.sql) autorise la lecture. Le serveur lit alors le
// calendrier dans la base avec sa clé secrète « service_role » (la même que pour les rappels) et fabrique le fichier avec
// le même code que le bouton « Télécharger » de l'application.
//
// Le fichier couvre une fenêtre glissante : 92 jours passés et 2 ans à venir. La réponse est gardée 5 minutes dans le
// cache de Cloudflare, ce qui protège la base si un agenda interroge souvent (un lien supprimé ou remplacé cesse donc de
// fonctionner au plus tard 5 minutes après).
//
// Si un emploi du temps en ligne est relié au calendrier, ses événements sont dans le fichier. C'est la base qui les met en
// forme (fonction get_ics_calendar, à partir de la dernière copie gardée par l'application, voir feed_snapshots.sql) : le
// serveur gratuit de Cloudflare n'a que ~10 ms de calcul par requête, trop peu pour lire et mettre en forme un emploi du temps
// de plusieurs centaines de cours à chaque fois. Le serveur n'a donc qu'à insérer le bloc reçu, tel quel. Les événements
// importés sont ceux de la dernière ouverture de l'application (la copie est gardée 30 jours) ; sans copie, le fichier ne
// contient que les événements du calendrier et n'est gardé qu'une minute, pour que les événements importés arrivent dès
// qu'une copie existe.

export interface IcsEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface ContextLike {
  waitUntil(promise: Promise<unknown>): void
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

const TOKEN_PATH = /^\/api\/ics\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.ics$/i
const CACHE_SECONDS = 300
const MISS_SECONDS = 60
// Emploi du temps en ligne relié mais sans copie lisible : on réessaie plus vite.
const DEGRADED_SECONDS = 60
// Bloc d'événements importés : au plus 5 000 événements (limite de la base), moins de 6 Mo.
const MAX_IMPORTED = 5000
const MAX_IMPORTED_CHARS = 6_000_000
const TIMEOUT_MS = 8000
const MAX_PERIODS = 2000
const MAX_EXCEPTIONS = 50000
const FREQUENCIES: Frequency[] = ['once', 'weekly', 'custom_days', 'alternating', 'monthly']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}/

const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

const SAFE_HEADERS: Record<string, string> = {
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

function plain(body: string, status: number, cacheSeconds = 0): Response {
  return new Response(body, {
    status,
    headers: {
      ...SAFE_HEADERS,
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
    },
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SAFE_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function edgeCache(): EdgeCache | null {
  const storage = (globalThis as { caches?: { default?: EdgeCache } }).caches
  return storage?.default ?? null
}

function serviceHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' }
  // Ancienne clé (un jeton JWT) : elle sert aussi d'autorisation. Une clé « sb_secret_… » ne s'envoie que dans apikey.
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`
  return headers
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function intIn(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

function timeOrNull(value: unknown): string | null {
  return typeof value === 'string' && TIME_RE.test(value) ? value.slice(0, 5) : null
}

// La base ne renvoie que des valeurs valides ; on vérifie quand même : une ligne illisible est ignorée, elle ne fait pas
// échouer tout le calendrier.
function toPeriods(raw: unknown): Period[] {
  if (!Array.isArray(raw)) return []
  const out: Period[] = []
  for (const r of raw.slice(0, MAX_PERIODS)) {
    if (!isRecord(r)) continue
    const duration = intIn(r.duration_days, 1, 366)
    const interval = intIn(r.interval_weeks, 1, 52)
    const week = r.week_of_month === null || r.week_of_month === undefined ? null : intIn(r.week_of_month, -1, 4)
    if (
      typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.start_date !== 'string' || !DAY_RE.test(r.start_date) ||
      !FREQUENCIES.includes(r.frequency as Frequency) || duration === null || interval === null ||
      (r.week_of_month !== null && r.week_of_month !== undefined && week === null)
    ) {
      continue
    }
    out.push({
      id: r.id,
      calendar_id: '',
      name: r.name,
      color: typeof r.color === 'string' ? r.color : '#2563eb',
      start_date: r.start_date,
      frequency: r.frequency as Frequency,
      duration_days: duration,
      interval_weeks: interval,
      week_of_month: week,
      start_time: timeOrNull(r.start_time),
      end_time: timeOrNull(r.end_time),
      created_at: '',
    })
  }
  return out
}

function toExceptions(raw: unknown): Pick<PeriodException, 'period_id' | 'exception_date'>[] {
  if (!Array.isArray(raw)) return []
  const out: Pick<PeriodException, 'period_id' | 'exception_date'>[] = []
  for (const r of raw.slice(0, MAX_EXCEPTIONS)) {
    if (isRecord(r) && typeof r.period_id === 'string' && typeof r.exception_date === 'string' && DAY_RE.test(r.exception_date)) {
      out.push({ period_id: r.period_id, exception_date: r.exception_date })
    }
  }
  return out
}

// Emploi du temps en ligne tel que la base le renvoie : null = pas d'emploi du temps ; sinon la date de la dernière copie, le
// nombre d'événements et leur bloc de texte (null partout s'il n'y a pas de copie). Le bloc est vérifié avant d'être inséré :
// il doit être fait de VEVENT complets, sans fin de calendrier.
function readImported(feed: unknown): { state: 'none' | 'copy' | 'unavailable'; block?: { text: string; count: number } } {
  if (!isRecord(feed)) return { state: 'none' }
  if (typeof feed.fetched_at !== 'string') return { state: 'unavailable' }
  const count = intIn(feed.count, 0, MAX_IMPORTED)
  const text = feed.text
  if (count === null || typeof text !== 'string') return { state: 'unavailable' }
  if (count === 0) return { state: 'copy' }
  if (
    text.length > MAX_IMPORTED_CHARS || !text.startsWith('BEGIN:VEVENT\r\n') || !text.endsWith('END:VEVENT\r\n') ||
    text.includes('VCALENDAR')
  ) {
    return { state: 'unavailable' }
  }
  return { state: 'copy', block: { text, count } }
}

export async function handleIcs(request: Request, env: IcsEnv, ctx?: ContextLike): Promise<Response> {
  const url = new URL(request.url)

  // Pour l'application : le serveur est-il prêt à servir les liens ? (Rien de secret n'est révélé.)
  if (url.pathname === '/api/ics/status') {
    if (request.method !== 'GET') return json({ ok: false, reason: 'method_not_allowed' }, 405)
    return json({ ok: true, ready: Boolean(env.SUPABASE_SERVICE_ROLE_KEY) })
  }

  const match = TOKEN_PATH.exec(url.pathname)
  if (!match) return plain('Lien introuvable.', 404)

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const res = plain('Méthode non autorisée.', 405)
    res.headers.set('allow', 'GET, HEAD')
    return res
  }
  const head = request.method === 'HEAD'
  const finish = (res: Response): Response => (head ? new Response(null, { status: res.status, headers: res.headers }) : res)

  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return plain("La synchronisation n'est pas activée sur ce serveur.", 503)

  const token = match[1].toLowerCase()
  const cache = edgeCache()
  const cacheKey = new Request(`${url.origin}/api/ics/${token}.ics`)
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined)
    if (hit) return finish(hit)
  }

  let payload: unknown
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_ics_calendar`, {
      method: 'POST',
      headers: serviceHeaders(key),
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return plain('Lecture impossible pour le moment. Réessayez plus tard.', 502)
    payload = await res.json()
  } catch {
    return plain('Lecture impossible pour le moment. Réessayez plus tard.', 502)
  }

  let response: Response
  if (!isRecord(payload) || typeof payload.name !== 'string') {
    // Lien inconnu, remplacé ou supprimé. Réponse gardée une minute : un agenda qui insiste ne sollicite pas la base.
    response = plain('Lien introuvable ou désactivé.', 404, MISS_SECONDS)
  } else {
    const span = rollingWindow(parisDay.format(new Date()))

    // Emploi du temps en ligne : jamais bloquant, une copie absente ou illisible ne fait pas perdre le calendrier.
    const imported = readImported(payload.feed)

    const file = buildIcsFile(
      { name: payload.name, color: typeof payload.color === 'string' ? payload.color : null },
      toPeriods(payload.periods),
      toExceptions(payload.exceptions),
      span,
      { stamp: new Date(), subscription: true, importedBlock: imported.block }
    )
    const headers: Record<string, string> = {
      ...SAFE_HEADERS,
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="${icsFileName(payload.name)}"`,
      'cache-control': `public, max-age=${imported.state === 'unavailable' ? DEGRADED_SECONDS : CACHE_SECONDS}`,
    }
    if (imported.state !== 'none') headers['x-calendraft-feed'] = imported.state
    response = new Response(file.text, { status: 200, headers })
  }

  if (cache && ctx) ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined))
  return finish(response)
}
