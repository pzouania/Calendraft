import { supabase } from './supabaseClient'

// Limites sur les événements, vérifiées par la base de données (voir supabase/events_limits.sql) :
//  - au plus 10 créations d'événements par minute et par personne ;
//  - au plus 3 événements à horaire précis en même temps dans un calendrier.
// Quand une limite est atteinte, la base refuse l'enregistrement avec un message codé que ce fichier sait lire.
//
// Les événements importés (emploi du temps en ligne) comptent aussi dans les 3 événements simultanés. Ils ne sont pas
// dans la base : avant d'enregistrer, checkWithImported les lit via le serveur Calendraft, puis demande à la base de faire
// le même calcul que d'habitude en y ajoutant ces créneaux (fonction check_event_slot).

export interface SlotBlocker {
  // Vide pour un événement importé (il n'existe pas dans la base).
  period_id: string
  name: string
  color: string
  // Jour précis de ce créneau occupé (AAAA-MM-JJ) et horaire de l'événement (HH:MM).
  date: string
  start: string
  end: string
  // Vrai si l'événement se répète ou dure plusieurs jours : on peut alors ne retirer que ce jour.
  recurring: boolean
  // Vrai pour un événement de l'emploi du temps importé : il ne peut pas être supprimé depuis Calendraft.
  imported: boolean
}

export interface SlotConflict {
  // Prochain jour en conflit, horaire de l'événement qu'on enregistre, nombre de jours en conflit à partir de ce jour.
  date: string
  start: string
  end: string
  dates: number
  blockers: SlotBlocker[]
}

export type LimitError =
  | { kind: 'slot_full'; conflict: SlotConflict }
  | { kind: 'rate_limit'; retryAfter: number }
  | { kind: 'invalid' }

interface DbErrorLike {
  message?: string
  details?: string | null
  code?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const ID_RE = /^[\w-]{1,64}$/

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readBlocker(raw: unknown, index: number): SlotBlocker | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const date = asText(r.date)
  if (!DATE_RE.test(date)) return null
  const imported = r.imported === true
  // Un événement importé n'a pas d'identifiant dans la base : on lui en donne un, utile seulement pour l'affichage.
  const id = imported ? `imported-${index}` : asText(r.period_id)
  if (!ID_RE.test(id)) return null
  return {
    period_id: id,
    name: asText(r.name, 'Événement'),
    color: /^#[0-9a-f]{3,8}$/i.test(asText(r.color)) ? asText(r.color) : '#2563eb',
    date,
    start: TIME_RE.test(asText(r.start)) ? asText(r.start) : '',
    end: TIME_RE.test(asText(r.end)) ? asText(r.end) : '',
    recurring: !imported && r.recurring === true,
    imported,
  }
}

function readConflictObject(raw: Record<string, unknown>): SlotConflict {
  const blockers = Array.isArray(raw.blockers)
    ? raw.blockers.map(readBlocker).filter((b): b is SlotBlocker => b !== null)
    : []
  const dates = typeof raw.dates === 'number' && raw.dates >= 1 ? Math.floor(raw.dates) : 1
  return {
    date: DATE_RE.test(asText(raw.date)) ? asText(raw.date) : '',
    start: TIME_RE.test(asText(raw.start)) ? asText(raw.start) : '',
    end: TIME_RE.test(asText(raw.end)) ? asText(raw.end) : '',
    dates,
    blockers,
  }
}

function readConflict(details: string | null | undefined): SlotConflict {
  const empty: SlotConflict = { date: '', start: '', end: '', dates: 1, blockers: [] }
  if (!details) return empty
  try {
    const raw = JSON.parse(details) as unknown
    if (!raw || typeof raw !== 'object') return empty
    return readConflictObject(raw as Record<string, unknown>)
  } catch {
    return empty
  }
}

// Reconnaît une limite atteinte dans une erreur de la base ; renvoie null pour toute autre erreur.
export function parseLimitError(error: DbErrorLike | null | undefined): LimitError | null {
  const message = error?.message ?? ''
  if (message.startsWith('calendraft:slot_full')) {
    return { kind: 'slot_full', conflict: readConflict(error?.details) }
  }
  if (message.startsWith('calendraft:rate_limit')) {
    let retryAfter = 60
    try {
      const raw = JSON.parse(error?.details ?? '{}') as { retry_after?: unknown }
      if (typeof raw.retry_after === 'number' && raw.retry_after >= 1) retryAfter = Math.min(60, Math.ceil(raw.retry_after))
    } catch {
      // On garde la valeur par défaut.
    }
    return { kind: 'rate_limit', retryAfter }
  }
  if (message.startsWith('calendraft:invalid_event')) return { kind: 'invalid' }
  return null
}

// Retire un seul jour d'un événement (comme « Supprimer ce jour » dans le détail d'une journée).
// Renvoie un message d'erreur, ou null si tout va bien.
export async function removeBlockerDay(blocker: SlotBlocker): Promise<string | null> {
  if (blocker.imported) return "Un événement importé ne peut pas être supprimé depuis Calendraft."
  const { error } = await supabase.from('period_exceptions').insert({
    period_id: blocker.period_id,
    exception_date: blocker.date,
  })
  // Jour déjà retiré entre-temps : le résultat est celui qu'on voulait.
  if (error && error.code !== '23505') return error.message
  return null
}

// Supprime l'événement entier, avec toutes ses dates.
export async function removeBlockerEvent(blocker: SlotBlocker): Promise<string | null> {
  if (blocker.imported) return "Un événement importé ne peut pas être supprimé depuis Calendraft."
  const { data, error } = await supabase.from('periods').delete().eq('id', blocker.period_id).select('id')
  if (error) return error.message
  if (!data || data.length === 0) {
    return "La suppression n'a pas été effectuée : l'événement n'existe plus, ou vous n'avez pas le droit de le supprimer."
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Événements importés
// ---------------------------------------------------------------------------------------------

// Les colonnes de l'événement qu'on enregistre (celles qui décident de ses jours et de ses heures).
export interface CheckSchedule {
  start_date: string
  frequency: string
  duration_days: number
  interval_weeks: number
  week_of_month: number | null
  start_time: string
  end_time: string
}

// Ce qui n'a pas pu être vérifié en entier (l'enregistrement a lieu quand même) :
//  - 'unreachable' : l'emploi du temps en ligne n'a pas répondu ;
//  - 'truncated' : il compte trop d'événements pour être lu en entier.
export type ImportedNotice = 'unreachable' | 'truncated'

export interface ImportedCheck {
  conflict: SlotConflict | null
  notice: ImportedNotice | null
}

interface FeedLoad {
  configured: boolean
  color: string
  truncated: boolean
  events: unknown[]
}

// Lectures déjà faites pendant que le formulaire est ouvert (clé : fenêtre de dates), pour ne pas relire l'emploi du temps
// après chaque suppression dans la boîte « créneau complet ».
export type FeedCache = Map<string, FeedLoad>

const NONE: ImportedCheck = { conflict: null, notice: null }
const FETCH_TIMEOUT_MS = 12000

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Jours dont on lit l'emploi du temps importé : ceux où l'événement tombe (un événement unique : ses propres jours ;
// une répétition : de 30 jours avant aujourd'hui à 800 jours après, ce qui reste sous la limite de lecture du serveur).
export function importedWindow(s: Pick<CheckSchedule, 'start_date' | 'frequency' | 'duration_days'>, now = today()): { from: string; to: string } {
  const duration = Math.min(366, Math.max(1, Math.floor(s.duration_days) || 1))
  let from: string
  let to: string
  if (s.frequency === 'once') {
    from = s.start_date
    to = addDays(s.start_date, duration + 1)
  } else {
    from = s.frequency === 'monthly' && s.start_date > addDays(now, -30) ? s.start_date : addDays(now, -30)
    to = addDays(now, 800)
  }
  return { from: addDays(from, -1), to: addDays(to, 1) }
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Vrai si le créneau [ps, pe) d'une journée chevauche l'horaire de l'événement (qui peut passer minuit).
function overlapsDayWindow(ps: number, pe: number, startMin: number, endMin: number): boolean {
  if (endMin > startMin) return ps < endMin && pe > startMin
  return pe > startMin || ps < endMin
}

// Découpe les événements importés en créneaux d'une seule journée, comme l'affichage du calendrier :
// « full » = de l'heure de début à l'heure de fin ; « start » = de l'heure de début à minuit ; « end » = de minuit à l'heure de fin.
// Les événements sans heure (journée entière) ne comptent pas. On ne garde que les créneaux qui touchent l'horaire de l'événement.
export function importedPieces(events: unknown[], startTime: string, endTime: string): [string, string, string][] {
  const startMin = minutesOf(startTime)
  const endMin = minutesOf(endTime)
  const out: [string, string, string][] = []
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const date = asText(e.date)
    const start = asText(e.start)
    const end = asText(e.end)
    const segment = asText(e.segment)
    if (!DATE_RE.test(date) || !TIME_RE.test(start) || !(TIME_RE.test(end))) continue

    let ps: number
    let pe: number
    if (segment === 'full') {
      ps = minutesOf(start)
      pe = end === '24:00' ? 1440 : minutesOf(end)
    } else if (segment === 'start') {
      ps = minutesOf(start)
      pe = 1440
    } else if (segment === 'end') {
      ps = 0
      pe = end === '24:00' ? 1440 : minutesOf(end)
    } else {
      continue
    }
    if (pe <= ps || !overlapsDayWindow(ps, pe, startMin, endMin)) continue

    const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
    const from = `${date}T${hm(ps)}`
    const to = pe === 1440 ? `${addDays(date, 1)}T00:00` : `${date}T${hm(pe)}`
    out.push([from, to, asText(e.title).slice(0, 80)])
  }
  return out
}

async function loadFeed(calendarId: string, from: string, to: string, cache: FeedCache): Promise<FeedLoad | 'unreachable' | 'unavailable'> {
  const key = `${calendarId}|${from}|${to}`
  const known = cache.get(key)
  if (known) return known

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return 'unavailable'

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch('/api/feed/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ calendarId, from, to }),
      signal: controller.signal,
    })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return 'unavailable'
    if (body.ok === true && body.configured === true && Array.isArray(body.events)) {
      const load: FeedLoad = {
        configured: true,
        color: asText(body.color, '#64748b'),
        truncated: body.truncated === true,
        events: body.events,
      }
      cache.set(key, load)
      return load
    }
    if (body.ok === true && body.configured === false) {
      const load: FeedLoad = { configured: false, color: '', truncated: false, events: [] }
      cache.set(key, load)
      return load
    }
    // Un emploi du temps est bien réglé mais ne répond pas : on le signale après l'enregistrement.
    if (body.reason === 'feed_unreachable') return 'unreachable'
    return 'unavailable'
  } catch {
    return 'unavailable'
  } finally {
    window.clearTimeout(timer)
  }
}

// Vérifie le créneau de l'événement en comptant aussi les événements importés du calendrier.
// Cette vérification ne bloque jamais l'enregistrement par elle-même : si l'emploi du temps importé ou la fonction de
// la base ne répond pas, on renvoie « pas de conflit » (et, quand on sait qu'un emploi du temps existe, un avertissement).
// Les événements enregistrés dans Calendraft, eux, restent contrôlés par la base au moment de l'enregistrement.
export async function checkWithImported(args: {
  calendarId: string
  // L'événement qu'on modifie (il ne se compte pas lui-même) ; null à la création.
  excludeId: string | null
  schedule: CheckSchedule
  cache: FeedCache
}): Promise<ImportedCheck> {
  const { calendarId, excludeId, schedule, cache } = args
  const { from, to } = importedWindow(schedule)

  const feed = await loadFeed(calendarId, from, to, cache)
  if (feed === 'unreachable') return { conflict: null, notice: 'unreachable' }
  if (feed === 'unavailable' || !feed.configured) return NONE

  const notice: ImportedNotice | null = feed.truncated ? 'truncated' : null
  const items = importedPieces(feed.events, schedule.start_time, schedule.end_time)
  // Aucun événement importé ne touche cet horaire : rien à ajouter au contrôle de la base.
  if (items.length === 0) return { conflict: null, notice }

  try {
    const { data, error } = await supabase.rpc('check_event_slot', {
      p_calendar: calendarId,
      p_exclude: excludeId,
      p_start: schedule.start_date,
      p_frequency: schedule.frequency,
      p_interval_weeks: schedule.interval_weeks,
      p_week_of_month: schedule.week_of_month,
      p_duration_days: schedule.duration_days,
      p_start_time: schedule.start_time,
      p_end_time: schedule.end_time,
      p_imported: { color: feed.color, items },
    })
    if (error || !data || typeof data !== 'object') return { conflict: null, notice }
    return { conflict: readConflictObject(data as Record<string, unknown>), notice }
  } catch {
    return { conflict: null, notice }
  }
}
