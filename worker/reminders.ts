// Rappels par notification : préparation de la file d'attente et envoi.
//
//  - refillQueue()        calcule les prochains rappels (toutes les 15 minutes, et à la demande)
//  - sendDueReminders()   envoie ceux dont l'heure est arrivée (toutes les minutes)
//
// Tout passe par la clé « service_role » de Supabase : elle ne quitte jamais ce serveur.
// Le plan gratuit de Cloudflare limite le temps de calcul à 10 ms par exécution : les plafonds
// ci-dessous (MAX_PUSHES_PER_RUN, MAX_DUE_ROWS_READ) servent à rester largement en dessous.

import { generateOccurrences } from '../src/lib/occurrenceEngine'
import type { Frequency, Period } from '../src/types'
import { sendWebPush, type VapidConfig } from './webpush'

export interface ReminderEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

// Ligne renvoyée par la fonction SQL reminder_candidates (voir supabase/reminder_candidates.sql).
export interface Candidate {
  user_id: string
  period_id: string
  minutes_before: number
  timezone: string
  calendar_name: string | null
  period_name: string
  start_date: string
  frequency: string
  duration_days: number | null
  interval_weeks: number | null
  week_of_month: number | null
  start_time: string | null
  end_time: string | null
  exceptions: string[] | null
}

export interface QueueInput {
  user_id: string
  period_id: string
  occurrence_date: string
  fire_at: string
  title: string
  body: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

// Un rappel préparé avec un peu de retard part quand même ; au-delà, on ne prévient plus.
const PREPARE_GRACE_MS = 5 * MINUTE
const SEND_WINDOW_MS = 30 * MINUTE
// On prépare les rappels qui partent dans les 48 prochaines heures.
const HORIZON_MS = 48 * HOUR
// Heure de référence d'un événement sans horaire (journée entière ou bloc de jours), heure locale.
const ALL_DAY_REFERENCE = '08:00'
// Plafonds d'une exécution (plan gratuit : 10 ms de calcul).
const MAX_PUSHES_PER_RUN = 5
const MAX_DUE_ROWS_READ = 10
// Doit rester égal à « limit » dans supabase/reminder_candidates.sql.
const CANDIDATES_LIMIT = 100
// Le passage général traite un quart des personnes toutes les 15 minutes (soit chacune une fois par heure).
export const REFILL_SLICES = 4
const CLEANUP_AFTER_MS = 3 * 24 * HOUR

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FREQUENCIES: readonly string[] = ['once', 'weekly', 'custom_days', 'alternating', 'monthly']

// ---------------------------------------------------------------------------
// Dates et fuseaux horaires (sans bibliothèque : Intl suffit)
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  const candidate = timeZone || 'Europe/Paris'
  try {
    formatterFor(candidate)
    return candidate
  } catch {
    return 'Europe/Paris'
  }
}

function zonedParts(ms: number, timeZone: string) {
  const values: Record<string, number> = {}
  for (const part of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value)
  }
  return { y: values.year, m: values.month, d: values.day, h: values.hour % 24, mi: values.minute, s: values.second }
}

// Décalage (en ms) entre l'heure locale du fuseau et l'heure UTC, à cet instant.
function offsetMs(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000
}

const pad = (n: number) => String(n).padStart(2, '0')

// « 2026-10-19 » + « 22:00 » à Paris -> instant UTC en millisecondes.
export function zonedTimeToUtc(date: string, hhmm: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, h, mi)
  let ts = naive - offsetMs(naive, timeZone)
  const second = offsetMs(ts, timeZone)
  if (naive - second !== ts) ts = naive - second // changement d'heure entre les deux estimations
  return ts
}

export function localDate(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Calcul des rappels à partir des événements
// ---------------------------------------------------------------------------

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function dayLabel(occurrenceDate: string, reminderDate: string): string {
  const diff = daysBetween(reminderDate, occurrenceDate)
  if (diff <= 0) return "Aujourd'hui"
  if (diff === 1) return 'Demain'
  const weekday = WEEKDAYS[new Date(`${occurrenceDate}T00:00:00Z`).getUTCDay()]
  const [, month, day] = occurrenceDate.split('-')
  return `Le ${weekday} ${day}/${month}`
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function toPeriod(c: Candidate, allDay: boolean): Period {
  const frequency = (FREQUENCIES.includes(c.frequency) ? c.frequency : 'once') as Frequency
  return {
    id: c.period_id,
    calendar_id: '',
    name: c.period_name,
    color: '',
    start_date: c.start_date,
    frequency,
    // Pour un événement sans horaire, on ne prévient qu'au début du bloc (pas chaque jour du bloc).
    duration_days: allDay ? 1 : Math.max(1, c.duration_days ?? 1),
    interval_weeks: Math.max(1, c.interval_weeks ?? 1),
    week_of_month: c.week_of_month,
    start_time: c.start_time,
    end_time: c.end_time,
    created_at: '',
  }
}

// Le moteur d'occurrences parcourt les récurrences depuis la date de départ : pour un événement
// commencé il y a des années, c'est lent (et le plan gratuit ne laisse que 10 ms de calcul).
// On avance donc la date de départ d'un nombre entier de semaines, ce qui ne change aucune occurrence
// de la fenêtre examinée (la marge couvre la durée et, en mensuel, le début du mois).
export function fastForward(period: Period, windowStart: string): Period {
  let stepDays = 0
  if (period.frequency === 'weekly' || period.frequency === 'alternating') stepDays = period.interval_weeks * 7
  else if (period.frequency === 'custom_days' || period.frequency === 'monthly') stepDays = 7
  if (stepDays === 0) return period

  const margin = period.duration_days + 7 + (period.frequency === 'monthly' ? 31 : 0)
  const gap = daysBetween(period.start_date, windowStart) - margin
  const steps = Math.floor(gap / stepDays)
  if (steps <= 0) return period
  return { ...period, start_date: addDaysToDate(period.start_date, steps * stepDays) }
}

export function buildQueueRows(candidates: Candidate[], nowMs: number): QueueInput[] {
  const rows: QueueInput[] = []
  const seen = new Set<string>()
  const earliest = nowMs - PREPARE_GRACE_MS
  const latest = nowMs + HORIZON_MS

  for (const c of candidates) {
    if (!UUID_RE.test(c.user_id) || !UUID_RE.test(c.period_id) || !DATE_RE.test(c.start_date)) continue
    if (!Number.isFinite(c.minutes_before) || c.minutes_before < 0) continue

    const timeZone = safeTimeZone(c.timezone)
    const startTime = c.start_time ? c.start_time.slice(0, 5) : null
    const endTime = c.end_time ? c.end_time.slice(0, 5) : null
    const allDay = startTime === null
    const lead = c.minutes_before * MINUTE

    // Dates d'événement à examiner (un jour de marge de chaque côté).
    const from = addDaysToDate(localDate(earliest + lead, timeZone), -1)
    const to = addDaysToDate(localDate(latest + lead, timeZone), 1)
    const excluded = new Set((c.exceptions ?? []).filter((d) => DATE_RE.test(d)))

    const occurrences = generateOccurrences(
      fastForward(toPeriod(c, allDay), from),
      new Date(`${from}T00:00:00`),
      new Date(`${to}T00:00:00`),
      excluded
    )

    for (const occ of occurrences) {
      // Un événement qui passe minuit a deux segments : on ne prévient qu'au départ.
      if (occ.segment === 'end') continue
      const key = `${c.user_id}|${c.period_id}|${occ.date}`
      if (seen.has(key)) continue

      const instant = zonedTimeToUtc(occ.date, startTime ?? ALL_DAY_REFERENCE, timeZone)
      const fireAt = instant - lead
      if (fireAt < earliest || fireAt > latest) continue

      seen.add(key)
      const when = dayLabel(occ.date, localDate(fireAt, timeZone))
      const time = startTime ? (endTime ? ` de ${startTime} à ${endTime}` : ` à ${startTime}`) : ''
      const calendar = c.calendar_name ? ` · ${truncate(c.calendar_name, 40)}` : ''
      rows.push({
        user_id: c.user_id,
        period_id: c.period_id,
        occurrence_date: occ.date,
        fire_at: new Date(fireAt).toISOString(),
        title: truncate(c.period_name, 80),
        body: `${when}${time}${calendar}`,
      })
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Accès à Supabase avec la clé serveur
// ---------------------------------------------------------------------------

function serviceHeaders(env: ReminderEnv, extra: Record<string, string> = {}): Record<string, string> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json', ...extra }
  // Les anciennes clés sont des jetons JWT (eyJ...), les nouvelles (sb_secret_...) ne le sont pas.
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`
  return headers
}

async function rest(env: ReminderEnv, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = serviceHeaders(env, init.headers as Record<string, string> | undefined)
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers })
}

async function restJson<T>(env: ReminderEnv, path: string, init: RequestInit = {}): Promise<T> {
  const res = await rest(env, path, init)
  if (!res.ok) throw new Error(`supabase_${res.status}`)
  return (await res.json()) as T
}

const iso = (ms: number) => encodeURIComponent(new Date(ms).toISOString())

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function idList(ids: string[]): string {
  return ids.filter((id) => UUID_RE.test(id)).join(',')
}

// ---------------------------------------------------------------------------
// 1) Préparation de la file d'attente
// ---------------------------------------------------------------------------

export interface RefillStats {
  candidates: number
  queued: number
  removed: number
  truncated: boolean
}

// Tranche d'une personne : dernier octet de son identifiant (même règle que dans la fonction SQL).
export function sliceOf(userId: string, slices: number): number {
  return parseInt(userId.slice(-2), 16) % slices
}

// { userId } : une seule personne (à la demande) ; { slice } : une tranche de personnes (passage régulier).
export type RefillScope = { userId: string } | { slice: number }

export async function refillQueue(env: ReminderEnv, nowMs: number, scope: RefillScope): Promise<RefillStats> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('not_configured')
  const userId = 'userId' in scope ? scope.userId : undefined
  const slice = 'slice' in scope ? scope.slice : undefined
  if (userId !== undefined && !UUID_RE.test(userId)) throw new Error('invalid_user')
  if (slice !== undefined && !(Number.isInteger(slice) && slice >= 0 && slice < REFILL_SLICES)) {
    throw new Error('invalid_slice')
  }

  const candidates = await restJson<Candidate[]>(env, 'rpc/reminder_candidates', {
    method: 'POST',
    body: JSON.stringify({
      p_user: userId ?? null,
      p_slice: slice ?? null,
      p_slices: slice === undefined ? null : REFILL_SLICES,
    }),
  })
  const rows = buildQueueRows(candidates, nowMs)
  const truncated = candidates.length >= CANDIDATES_LIMIT

  // Ajout ou mise à jour (l'horaire d'un événement a pu changer). Un rappel déjà envoyé le reste.
  for (const part of chunk(rows, 100)) {
    const res = await rest(env, 'reminder_queue?on_conflict=user_id,period_id,occurrence_date', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(part),
    })
    if (!res.ok) throw new Error(`supabase_${res.status}`)
  }

  // Suppression des rappels devenus inutiles (événement supprimé ou modifié, rappel retiré, accès perdu).
  // Si la liste des événements est tronquée, on ne supprime rien par prudence.
  let removed = 0
  if (!truncated) {
    const wanted = new Set(rows.map((r) => `${r.user_id}|${r.period_id}|${r.occurrence_date}`))
    const filter = userId ? `&user_id=eq.${userId}` : ''
    const pending = await restJson<Array<{ id: string; user_id: string; period_id: string; occurrence_date: string }>>(
      env,
      `reminder_queue?select=id,user_id,period_id,occurrence_date&sent_at=is.null&fire_at=gt.${iso(nowMs - PREPARE_GRACE_MS)}${filter}&limit=2000`
    )
    const orphans = pending
      .filter((p) => slice === undefined || sliceOf(p.user_id, REFILL_SLICES) === slice)
      .filter((p) => !wanted.has(`${p.user_id}|${p.period_id}|${p.occurrence_date}`))
      .map((p) => p.id)
    for (const part of chunk(orphans, 100)) {
      const list = idList(part)
      if (!list) continue
      const res = await rest(env, `reminder_queue?id=in.(${list})`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`supabase_${res.status}`)
      removed += part.length
    }
  }

  // Ménage des vieilles lignes (envoyées ou expirées), une fois par heure.
  if (slice === 0) {
    await rest(env, `reminder_queue?fire_at=lt.${iso(nowMs - CLEANUP_AFTER_MS)}`, { method: 'DELETE' }).catch(
      () => undefined
    )
  }

  return { candidates: candidates.length, queued: rows.length, removed, truncated }
}

// ---------------------------------------------------------------------------
// 2) Envoi des rappels dont l'heure est arrivée
// ---------------------------------------------------------------------------

interface DueRow {
  id: string
  user_id: string
  title: string
  body: string
}

interface DeviceRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface SendStats {
  due: number
  sent: number
  retry: number
  failed: number
  devicesRemoved: number
}

async function safeSend(
  device: DeviceRow,
  payload: unknown,
  vapid: VapidConfig
): Promise<{ ok: boolean; status: number; gone: boolean }> {
  try {
    return await sendWebPush(
      { endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth },
      payload,
      vapid,
      { ttl: 1800, urgency: 'high' }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // Clés d'abonnement inutilisables : l'appareil ne pourra jamais recevoir, on le retire.
    if (message.startsWith('invalid_subscription')) return { ok: false, status: 0, gone: true }
    return { ok: false, status: 0, gone: false } // panne réseau : on réessaiera
  }
}

const isTransient = (status: number) => status === 0 || status === 429 || status >= 500

export async function sendDueReminders(env: ReminderEnv, nowMs: number, vapid: VapidConfig): Promise<SendStats> {
  const stats: SendStats = { due: 0, sent: 0, retry: 0, failed: 0, devicesRemoved: 0 }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('not_configured')

  const due = await restJson<DueRow[]>(
    env,
    `reminder_queue?select=id,user_id,title,body&sent_at=is.null&fire_at=lte.${iso(nowMs)}&fire_at=gt.${iso(
      nowMs - SEND_WINDOW_MS
    )}&order=fire_at.asc&limit=${MAX_DUE_ROWS_READ}`
  )
  stats.due = due.length
  if (due.length === 0) return stats

  const userIds = [...new Set(due.map((r) => r.user_id))]
  const devices = await restJson<DeviceRow[]>(
    env,
    `push_subscriptions?select=id,user_id,endpoint,p256dh,auth&user_id=in.(${idList(userIds)})&order=created_at.desc`
  )
  const devicesByUser = new Map<string, DeviceRow[]>()
  for (const d of devices) devicesByUser.set(d.user_id, [...(devicesByUser.get(d.user_id) ?? []), d])

  let pushes = 0
  const goneDeviceIds = new Set<string>()

  for (const row of due) {
    const targets = (devicesByUser.get(row.user_id) ?? []).slice(0, MAX_PUSHES_PER_RUN)
    // Plafond de la minute : le reste partira à l'exécution suivante.
    if (pushes > 0 && pushes + targets.length > MAX_PUSHES_PER_RUN) break

    // On « réserve » le rappel avant l'envoi : deux exécutions ne peuvent pas l'envoyer deux fois.
    const claimed = await restJson<Array<{ id: string }>>(env, `reminder_queue?id=eq.${encodeURIComponent(row.id)}&sent_at=is.null`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ sent_at: new Date(nowMs).toISOString() }),
    })
    if (claimed.length === 0) continue
    if (targets.length === 0) continue // personne à prévenir : rappel clos

    pushes += targets.length
    const payload = { title: row.title, body: row.body, url: '/', tag: `rappel-${row.id}` }
    const results = await Promise.all(targets.map((t) => safeSend(t, payload, vapid)))

    targets.forEach((t, i) => {
      if (results[i].gone) goneDeviceIds.add(t.id)
    })

    if (results.some((r) => r.ok)) {
      stats.sent += 1
    } else if (results.some((r) => !r.gone && isTransient(r.status))) {
      // Aucun appareil joint à cause d'une panne passagère : on remet le rappel en attente.
      await rest(env, `reminder_queue?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ sent_at: null }),
      }).catch(() => undefined)
      stats.retry += 1
    } else {
      stats.failed += 1
    }
  }

  if (goneDeviceIds.size > 0) {
    const list = idList([...goneDeviceIds])
    if (list) {
      await rest(env, `push_subscriptions?id=in.(${list})`, { method: 'DELETE' }).catch(() => undefined)
      stats.devicesRemoved = goneDeviceIds.size
    }
  }
  return stats
}
