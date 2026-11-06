import { generateOccurrences } from './occurrenceEngine'
import type { Period, PeriodException } from '../types'

// Export d'un calendrier au format iCalendar (.ics), lisible par Google Agenda, Apple Calendrier, Outlook, Thunderbird...
//
// Le fichier est produit par le MÊME moteur que l'écran (occurrenceEngine) : ce que l'agenda affiche est donc exactement
// ce que Calendraft affiche, exceptions comprises. Ce fichier est aussi utilisé par le serveur Cloudflare pour le lien de
// synchronisation, d'où l'absence de toute dépendance au navigateur.
//
// Choix de représentation :
//  - un événement sans horaire devient un événement « toute la journée » ; les jours qui se suivent forment UN seul
//    événement (une semaine de garde = une bande de 7 jours dans l'agenda) ;
//  - un événement avec horaires donne un événement par jour, à l'heure locale « flottante » (même heure sur toutes les
//    machines, pas de décalage au changement d'heure) ;
//  - un événement qui passe minuit (garde de nuit : 22:00 -> 06:00) donne UN événement par nuit, de la veille au lendemain ;
//    si une exception retire seulement un des deux côtés de la nuit, on garde seulement ce qui est affiché à l'écran.

export interface IcsEvent {
  uid: string
  summary: string
  startDate: string // AAAA-MM-JJ
  startTime: string | null // HH:MM, null = toute la journée
  endDate: string // AAAA-MM-JJ (pour un événement « toute la journée » : jour SUIVANT le dernier, comme le veut le format)
  endTime: string | null
}

export interface IcsCalendarInfo {
  name: string
  color?: string | null
}

export interface IcsFile {
  text: string
  eventCount: number
  // Vrai si le calendrier contient plus d'événements que la limite : les plus lointains ne sont pas dans le fichier.
  truncated: boolean
}

export const ICS_MAX_EVENTS = 5000
// Fenêtre du lien de synchro (et du fichier « à venir ») : un peu de passé, deux ans d'avenir.
export const ICS_PAST_DAYS = 92
export const ICS_FUTURE_DAYS = 730

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})/

// ---------- Dates (calcul pur sur « AAAA-MM-JJ », indépendant du fuseau de la machine) ----------

function isDay(value: string): boolean {
  const m = DAY_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

export function addDays(day: string, n: number): string {
  const m = DAY_RE.exec(day)
  if (!m) throw new Error('Date invalide : ' + day)
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n))
  const y = String(d.getUTCFullYear()).padStart(4, '0')
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Date locale à minuit, telle que le moteur l'attend.
function localMidnight(day: string): Date {
  const m = DAY_RE.exec(day)
  if (!m) throw new Error('Date invalide : ' + day)
  return new Date(+m[1], +m[2] - 1, +m[3])
}

export function dayString(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Fenêtre glissante autour d'un jour donné (le jour « aujourd'hui » du serveur ou de l'appareil).
export function rollingWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -ICS_PAST_DAYS), to: addDays(today, ICS_FUTURE_DAYS) }
}

function hhmm(value: string | null | undefined): string | null {
  if (!value) return null
  const m = TIME_RE.exec(value)
  return m ? `${m[1]}:${m[2]}` : null
}

// ---------- Événements ----------

export function exceptionsByPeriod(exceptions: Pick<PeriodException, 'period_id' | 'exception_date'>[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const e of exceptions) {
    const set = map.get(e.period_id) ?? new Set<string>()
    set.add(String(e.exception_date).slice(0, 10))
    map.set(e.period_id, set)
  }
  return map
}

function compactDay(day: string): string {
  return day.replace(/-/g, '')
}

function uidFor(periodId: string, day: string): string {
  return `${periodId}-${compactDay(day)}@calendraft.fr`
}

function summaryOf(name: string): string {
  const clean = name.replace(/[\r\n\t]+/g, ' ').trim()
  return clean === '' ? '(sans titre)' : clean
}

// Événements d'un calendrier entre deux jours inclus (from et to, au format AAAA-MM-JJ).
export function buildIcsEvents(
  periods: Period[],
  exceptions: Map<string, Set<string>>,
  from: string,
  to: string
): IcsEvent[] {
  if (!isDay(from) || !isDay(to) || to < from) return []

  // On demande au moteur un jour de plus de chaque côté : une nuit qui commence la veille de la fenêtre (ou finit le
  // lendemain) doit rester entière, et non apparaître coupée en deux. Du côté du début, on recule aussi de la durée de
  // l'événement, pour ne pas perdre une occurrence commencée avant la fenêtre et qui la traverse encore.
  const engineTo = localMidnight(addDays(to, 1))
  const inWindow = (day: string) => day >= from && day <= to
  const out: IcsEvent[] = []

  for (const period of periods) {
    const lookBack = 1 + Math.max(1, Math.min(400, Math.floor(Number(period.duration_days)) || 1))
    const occurrences = generateOccurrences(
      period,
      localMidnight(addDays(from, -lookBack)),
      engineTo,
      exceptions.get(period.id) ?? new Set()
    )
    const summary = summaryOf(period.name)
    const timed = hhmm(period.start_time) !== null && hhmm(period.end_time) !== null

    if (!timed) {
      // Jours entiers : les jours qui se suivent ne font qu'un événement.
      const days = Array.from(new Set(occurrences.map((o) => o.date).filter(inWindow))).sort()
      let runStart = ''
      let previous = ''
      const close = () => {
        if (runStart === '') return
        out.push({
          uid: uidFor(period.id, runStart),
          summary,
          startDate: runStart,
          startTime: null,
          endDate: addDays(previous, 1),
          endTime: null,
        })
      }
      for (const day of days) {
        if (runStart !== '' && day === addDays(previous, 1)) {
          previous = day
          continue
        }
        close()
        runStart = day
        previous = day
      }
      close()
      continue
    }

    const startTime = hhmm(period.start_time) as string
    const endTime = hhmm(period.end_time) as string

    // Une seule fois chaque jour : si les répétitions se chevauchent, le moteur peut produire deux fois le même jour.
    const full = new Set<string>()
    const starts = new Set<string>()
    const ends = new Set<string>()
    for (const o of occurrences) {
      if (o.segment === 'start') starts.add(o.date)
      else if (o.segment === 'end') ends.add(o.date)
      else full.add(o.date)
    }

    for (const day of Array.from(full).sort()) {
      if (!inWindow(day)) continue
      out.push({ uid: uidFor(period.id, day), summary, startDate: day, startTime, endDate: day, endTime })
    }

    // Passage de minuit : une nuit = un segment de départ le jour D et un segment de fin le jour D + 1.
    const consumedEnds = new Set<string>()
    for (const day of Array.from(starts).sort()) {
      const next = addDays(day, 1)
      if (ends.has(next)) {
        consumedEnds.add(next)
        if (inWindow(day) || inWindow(next)) {
          out.push({ uid: uidFor(period.id, day), summary, startDate: day, startTime, endDate: next, endTime })
        }
      } else if (inWindow(day)) {
        // Le lendemain a été retiré : il ne reste que la soirée (jusqu'à minuit).
        out.push({ uid: uidFor(period.id, day), summary, startDate: day, startTime, endDate: next, endTime: '00:00' })
      }
    }
    for (const day of Array.from(ends).sort()) {
      if (consumedEnds.has(day) || !inWindow(day)) continue
      // La veille a été retirée : il ne reste que le matin (de minuit à l'heure de fin).
      out.push({ uid: uidFor(period.id, addDays(day, -1)), summary, startDate: day, startTime: '00:00', endDate: day, endTime })
    }
  }

  out.sort((a, b) =>
    a.startDate !== b.startDate ? (a.startDate < b.startDate ? -1 : 1)
    : (a.startTime ?? '') !== (b.startTime ?? '') ? ((a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1)
    : a.summary !== b.summary ? (a.summary < b.summary ? -1 : 1)
    : a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0
  )
  return out
}

// ---------- Écriture du fichier ----------

// Texte iCalendar : \ ; , et retours à la ligne sont échappés, les caractères de contrôle supprimés.
export function escapeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Une ligne ne dépasse pas 75 octets (UTF-8) ; la suite passe à la ligne suivante, précédée d'une espace.
// On ne coupe jamais au milieu d'un caractère.
export function foldLine(line: string): string[] {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return [line]
  const parts: string[] = []
  let current = ''
  let size = 0
  let limit = 75
  for (const ch of line) {
    const bytes = encoder.encode(ch).length
    if (size + bytes > limit) {
      parts.push(current)
      current = ' '
      size = 1
      limit = 75
    }
    current += ch
    size += bytes
  }
  parts.push(current)
  return parts
}

function stampOf(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function compactTime(time: string): string {
  return time.replace(':', '') + '00'
}

function validColor(color: string | null | undefined): string | null {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : null
}

export function buildIcsText(
  calendar: IcsCalendarInfo,
  events: IcsEvent[],
  options: { stamp: Date; subscription?: boolean }
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendraft//calendraft.fr//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(summaryOf(calendar.name))}`,
  ]
  const color = validColor(calendar.color)
  if (color) lines.push(`X-APPLE-CALENDAR-COLOR:${color}`, `X-WR-CALCOLOR:${color}`)
  if (options.subscription) lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H')

  const stamp = stampOf(options.stamp)
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`)
    if (e.startTime === null || e.endTime === null) {
      lines.push(`DTSTART;VALUE=DATE:${compactDay(e.startDate)}`, `DTEND;VALUE=DATE:${compactDay(e.endDate)}`)
    } else {
      lines.push(
        `DTSTART:${compactDay(e.startDate)}T${compactTime(e.startTime)}`,
        `DTEND:${compactDay(e.endDate)}T${compactTime(e.endTime)}`
      )
    }
    lines.push(`SUMMARY:${escapeText(e.summary)}`)
    // Un événement sur toute la journée n'occupe pas l'agenda (comme un anniversaire) : il ne bloque pas les invitations.
    if (e.startTime === null || e.endTime === null) lines.push('TRANSP:TRANSPARENT')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')

  return lines.flatMap(foldLine).join('\r\n') + '\r\n'
}

// Fichier complet d'un calendrier entre deux jours inclus.
export function buildIcsFile(
  calendar: IcsCalendarInfo,
  periods: Period[],
  exceptions: Pick<PeriodException, 'period_id' | 'exception_date'>[],
  range: { from: string; to: string },
  options: { stamp: Date; subscription?: boolean }
): IcsFile {
  const all = buildIcsEvents(periods, exceptionsByPeriod(exceptions), range.from, range.to)
  const truncated = all.length > ICS_MAX_EVENTS
  const events = truncated ? all.slice(0, ICS_MAX_EVENTS) : all
  return { text: buildIcsText(calendar, events, options), eventCount: events.length, truncated }
}

// Nom de fichier à partir du nom du calendrier : lettres sans accent, chiffres et tirets.
export function icsFileName(calendarName: string): string {
  const slug = calendarName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return `${slug === '' ? 'calendraft' : slug}.ics`
}
