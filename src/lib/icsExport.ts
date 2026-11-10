import { generateOccurrences } from './occurrenceEngine'
import { holidayLabel, holidaysBetween, type HolidayLang, type SchoolZone } from './schoolHolidays'
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
//    si une exception retire seulement un des deux côtés de la nuit, on garde seulement ce qui est affiché à l'écran ;
//  - les événements importés d'un emploi du temps en ligne (FeedSourceEvent) sont ajoutés tels qu'ils sont écrits dans le
//    flux de l'école : même début, même fin, même lieu, un seul événement même s'il dure plusieurs jours ;
//  - les vacances scolaires de la zone du calendrier (si elle est choisie) sont ajoutées en événements « toute la journée » :
//    une vacance = UN événement, de son premier jour jusqu'à la reprise exclue (comme le format le veut), non bloquant.

export interface IcsEvent {
  uid: string
  summary: string
  startDate: string // AAAA-MM-JJ
  startTime: string | null // HH:MM, null = toute la journée
  endDate: string // AAAA-MM-JJ (pour un événement « toute la journée » : jour SUIVANT le dernier, comme le veut le format)
  endTime: string | null
  // Lieu (événements importés seulement).
  location?: string
  // Vrai pour un événement venu de l'emploi du temps en ligne.
  imported?: boolean
}

// Événement d'un emploi du temps en ligne, tel que le serveur le lit dans le flux (voir worker/index.ts, format « source »).
// Contrairement à ce que montre l'écran (un morceau par jour), c'est l'événement entier : début et fin réels.
export interface FeedSourceEvent {
  uid: string
  title: string
  location: string
  startDate: string // AAAA-MM-JJ
  startTime: string | null // HH:MM, null = toute la journée
  endDate: string // AAAA-MM-JJ (toute la journée : jour SUIVANT le dernier)
  endTime: string | null
}

export interface IcsCalendarInfo {
  name: string
  color?: string | null
}

export interface IcsFile {
  text: string
  eventCount: number
  // Dont événements importés d'un emploi du temps en ligne.
  importedCount: number
  // Vacances scolaires ajoutées au fichier (en plus de eventCount : ce ne sont pas des événements du calendrier).
  holidayCount: number
  // Vrai si le calendrier contient plus d'événements que la limite : les plus lointains ne sont pas dans le fichier.
  truncated: boolean
}

export interface IcsFileOptions {
  stamp: Date
  subscription?: boolean
  // Événements importés à ajouter à ceux du calendrier (mis en forme ici, dans l'application).
  feed?: FeedSourceEvent[]
  // Ou bien un bloc d'événements importés déjà au format du fichier (BEGIN:VEVENT ... END:VEVENT), inséré tel quel. C'est ce que
  // fait le serveur Cloudflare pour le lien de synchronisation : la base fabrique le bloc, car le serveur gratuit n'a pas assez
  // de temps de calcul pour lire et mettre en forme un emploi du temps de plusieurs centaines de cours à chaque requête.
  importedBlock?: { text: string; count: number }
  // Zone des vacances scolaires à ajouter au fichier (null ou absent : pas de vacances).
  holidayZone?: SchoolZone | null
  // Langue des textes écrits par l'application dans le fichier (noms des vacances, « sans titre »). Français par défaut.
  lang?: HolidayLang
}

export const ICS_MAX_EVENTS = 5000
// Fenêtre du lien de synchro (et du fichier « à venir ») : un peu de passé, deux ans d'avenir.
export const ICS_PAST_DAYS = 92
export const ICS_FUTURE_DAYS = 730

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})/

// ---------- Dates (calcul pur sur « AAAA-MM-JJ », indépendant du fuseau de la machine) ----------

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isDay(value: string): boolean {
  const m = DAY_RE.exec(value)
  if (!m) return false
  const year = +m[1]
  const month = +m[2]
  const day = +m[3]
  if (month < 1 || month > 12 || day < 1) return false
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return day <= (month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1])
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
  // Cas normal (AAAA-MM-JJ) sans expression régulière : cette fonction est appelée des milliers de fois par fichier.
  if (day.length === 10 && day.charCodeAt(4) === 45 && day.charCodeAt(7) === 45) return day.slice(0, 4) + day.slice(5, 7) + day.slice(8, 10)
  return day.replace(/-/g, '')
}

function uidFor(periodId: string, day: string): string {
  return `${periodId}-${compactDay(day)}@calendraft.fr`
}

// Texte d'un événement ou calendrier sans nom. Tableau local (et non le dictionnaire de l'écran) : ce fichier tourne aussi dans le Worker.
const UNTITLED: Record<HolidayLang, string> = { fr: '(sans titre)', en: '(untitled)', de: '(ohne Titel)' }

function summaryOf(name: string, lang: HolidayLang = 'fr'): string {
  const clean = name.replace(/[\r\n\t]+/g, ' ').trim()
  return clean === '' ? UNTITLED[lang] : clean
}

// Événements d'un calendrier entre deux jours inclus (from et to, au format AAAA-MM-JJ).
export function buildIcsEvents(
  periods: Period[],
  exceptions: Map<string, Set<string>>,
  from: string,
  to: string,
  lang: HolidayLang = 'fr'
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
    const summary = summaryOf(period.name, lang)
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

  out.sort(compareEvents)
  return out
}

function compareEvents(a: IcsEvent, b: IcsEvent): number {
  return a.startDate !== b.startDate ? (a.startDate < b.startDate ? -1 : 1)
    : (a.startTime ?? '') !== (b.startTime ?? '') ? ((a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1)
    : a.summary !== b.summary ? (a.summary < b.summary ? -1 : 1)
    : a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0
}

// ---------- Événements importés (emploi du temps en ligne) ----------

// Un événement tout-jour ne dépasse pas un an ; au-delà, c'est un flux mal formé.
const FEED_MAX_DAYS = 366

// Heure « HH:MM » valide : null si absente, false si illisible (25:99...).
function cleanTime(value: string | null | undefined): string | null | false {
  if (value === null || value === undefined || value === '') return null
  const m = TIME_RE.exec(value)
  if (!m || +m[1] > 23 || +m[2] > 59) return false
  return `${m[1]}:${m[2]}`
}

// Empreinte courte et stable d'un texte (identifiants d'événements sans identifiant d'origine).
function shortHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

// Identifiant stable d'un événement importé : celui de l'école (nettoyé), plus la date de début, car certaines écoles
// réutilisent un même identifiant pour plusieurs séances. Seuls les caractères sûrs sont gardés.
const SAFE_UID_RE = /^[A-Za-z0-9._-]{1,40}$/

function feedUid(sourceUid: string, title: string, location: string, startDate: string, startTime: string | null): string {
  const raw = sourceUid.trim()
  let id: string
  if (SAFE_UID_RE.test(raw)) {
    id = raw // cas normal : déjà sûr et assez court
  } else if (raw === '') {
    id = shortHash(`${title}|${location}`)
  } else {
    id = `${raw.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40)}-${shortHash(raw)}`
  }
  return `feed-${id}-${compactDay(startDate)}${startTime ? startTime.replace(':', '') : ''}@calendraft.fr`
}

function cleanLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim()
}

// Événements importés qui touchent la fenêtre [from, to] (jours inclus), au format du fichier. Les événements illisibles
// sont ignorés. Un événement n'est jamais raccourci : il garde son vrai début et sa vraie fin, même s'il dépasse la fenêtre.
export function feedEventsToIcs(events: FeedSourceEvent[], from: string, to: string, lang: HolidayLang = 'fr'): IcsEvent[] {
  if (!isDay(from) || !isDay(to) || to < from) return []

  // Ordre complet, pour que les identifiants soient les mêmes à chaque lecture quel que soit l'ordre reçu.
  // (La clé de tri est calculée une seule fois par événement : le tri est lancé sur des milliers d'événements.)
  const keyed: { key: string; e: FeedSourceEvent }[] = []
  for (const e of events) {
    if (typeof e !== 'object' || e === null) continue
    keyed.push({ key: [e.startDate, e.startTime ?? '', e.endDate, e.endTime ?? '', e.uid, e.title, e.location].join('\u0001'), e })
  }
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const sorted = keyed.map((k) => k.e)

  const used = new Map<string, string>()
  const out: IcsEvent[] = []
  for (const e of sorted) {
    if (typeof e.startDate !== 'string' || !isDay(e.startDate)) continue
    const startTime = cleanTime(e.startTime)
    if (startTime === false) continue
    const startDate = e.startDate
    const title = typeof e.title === 'string' ? e.title : ''
    const location = typeof e.location === 'string' ? cleanLine(e.location) : ''
    const sourceUid = typeof e.uid === 'string' ? e.uid : ''

    let endDate: string
    let endTime: string | null
    if (startTime === null) {
      // Toute la journée : la fin est le jour SUIVANT le dernier ; au moins un jour, au plus un an.
      endDate = typeof e.endDate === 'string' && isDay(e.endDate) && e.endDate > startDate ? e.endDate : addDays(startDate, 1)
      const limit = addDays(startDate, FEED_MAX_DAYS)
      if (endDate > limit) endDate = limit
      endTime = null
      if (!(startDate <= to && endDate > from)) continue
    } else {
      // Heure de fin illisible (24:00, 25:99...) : comme une fin absente, l'événement garde son début.
      const rawEnd = cleanTime(e.endTime) || null
      endDate = typeof e.endDate === 'string' && isDay(e.endDate) && e.endDate >= startDate ? e.endDate : startDate
      const limit = addDays(startDate, FEED_MAX_DAYS)
      if (endDate > limit) endDate = limit
      endTime = rawEnd ?? startTime
      // Fin avant le début le même jour : événement sans durée (le fichier n'aura pas de fin).
      if (endDate === startDate && endTime < startTime) endTime = startTime
      if (!(startDate <= to && endDate >= from)) continue
    }

    const signature = [title, location, startDate, startTime ?? '', endDate, endTime ?? ''].join('\u0001')
    const base = feedUid(sourceUid, title, location, startDate, startTime)
    let uid = base
    let n = 1
    let duplicate = false
    while (used.has(uid)) {
      if (used.get(uid) === signature) {
        duplicate = true
        break
      }
      n++
      uid = base.replace('@', `-${n}@`)
    }
    if (duplicate) continue
    used.set(uid, signature)

    const event: IcsEvent = { uid, summary: summaryOf(title, lang), startDate, startTime, endDate, endTime, imported: true }
    if (location !== '') event.location = location
    out.push(event)
  }
  out.sort(compareEvents)
  return out
}

// Tous les événements d'un fichier : ceux du calendrier et les importés, triés ensemble.
export function buildAllIcsEvents(
  periods: Period[],
  exceptions: Map<string, Set<string>>,
  feed: FeedSourceEvent[] | undefined,
  from: string,
  to: string,
  lang: HolidayLang = 'fr'
): IcsEvent[] {
  const own = buildIcsEvents(periods, exceptions, from, to, lang)
  if (!feed || feed.length === 0) return own
  const merged = own.concat(feedEventsToIcs(feed, from, to, lang))
  merged.sort(compareEvents)
  return merged
}

// ---------- Vacances scolaires ----------

// Une vacance touchant la période de « from » à « to » (jours inclus) = UN événement « toute la journée » entier (il n'est pas
// coupé aux bornes de la fenêtre). Le jour de reprise est exclu : c'est la fin exclusive du format.
export function holidayIcsEvents(zone: SchoolZone, from: string, to: string, lang: HolidayLang = 'fr'): IcsEvent[] {
  return holidaysBetween(zone, from, to).map((h) => ({
    uid: `holiday-${zone}-${h.kind}-${compactDay(h.from)}@calendraft.fr`,
    summary: holidayLabel(h.kind, zone, lang),
    startDate: h.from,
    startTime: null,
    endDate: h.to,
    endTime: null,
  }))
}

// ---------- Écriture du fichier ----------

// Texte iCalendar : \ ; , et retours à la ligne sont échappés, les caractères de contrôle supprimés.
const NEEDS_ESCAPE_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\\;,\r\n]/

export function escapeText(value: string): string {
  if (!NEEDS_ESCAPE_RE.test(value)) return value
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Une ligne ne dépasse pas 75 octets (UTF-8) ; la suite passe à la ligne suivante, précédée d'une espace.
// On ne coupe jamais au milieu d'un caractère.
const encoder = new TextEncoder()
const ASCII_RE = /^[\x00-\x7f]*$/

// Taille en octets UTF-8 d'un caractère (un caractère isolé et invalide compte 3 octets, comme l'encodeur le remplace).
function utf8Size(codePoint: number): number {
  return codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4
}

export function foldLine(line: string): string[] {
  // Chemin rapide (presque toutes les lignes) : texte ASCII d'au plus 75 caractères = au plus 75 octets, sans encoder.
  if (line.length <= 75 && ASCII_RE.test(line)) return [line]
  if (encoder.encode(line).length <= 75) return [line]
  const parts: string[] = []
  let current = ''
  let size = 0
  let limit = 75
  for (const ch of line) {
    const bytes = utf8Size(ch.codePointAt(0) as number)
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
  options: { stamp: Date; subscription?: boolean; extraEvents?: string; lang?: HolidayLang }
): string {
  // Beaucoup d'événements répètent le même titre ou le même lieu : le texte échappé et plié de chaque ligne est gardé.
  // (Le temps de calcul compte : ce code tourne dans le serveur gratuit de Cloudflare, limité à ~10 ms par requête.)
  const escaped = new Map<string, string>()
  const esc = (value: string): string => {
    let out = escaped.get(value)
    if (out === undefined) {
      out = escapeText(value)
      escaped.set(value, out)
    }
    return out
  }
  const folded = new Map<string, string[]>()
  const out: string[] = []
  const add = (line: string) => {
    // Chemin rapide : texte ASCII d'au plus 75 caractères, rien à plier.
    if (line.length <= 75 && ASCII_RE.test(line)) {
      out.push(line)
      return
    }
    let parts = folded.get(line)
    if (parts === undefined) {
      parts = foldLine(line)
      folded.set(line, parts)
    }
    for (const part of parts) out.push(part)
  }

  add('BEGIN:VCALENDAR')
  add('VERSION:2.0')
  add('PRODID:-//Calendraft//calendraft.fr//FR')
  add('CALSCALE:GREGORIAN')
  add('METHOD:PUBLISH')
  add(`X-WR-CALNAME:${escapeText(summaryOf(calendar.name, options.lang))}`)
  const color = validColor(calendar.color)
  if (color) {
    add(`X-APPLE-CALENDAR-COLOR:${color}`)
    add(`X-WR-CALCOLOR:${color}`)
  }
  if (options.subscription) {
    add('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
    add('X-PUBLISHED-TTL:PT1H')
  }

  const stampLine = `DTSTAMP:${stampOf(options.stamp)}`
  for (const e of events) {
    add('BEGIN:VEVENT')
    add(`UID:${e.uid}`)
    add(stampLine)
    const allDay = e.startTime === null || e.endTime === null
    if (allDay) {
      add(`DTSTART;VALUE=DATE:${compactDay(e.startDate)}`)
      add(`DTEND;VALUE=DATE:${compactDay(e.endDate)}`)
    } else {
      add(`DTSTART:${compactDay(e.startDate)}T${compactTime(e.startTime as string)}`)
      // Le format exige une fin strictement après le début : un événement sans durée n'a pas de fin.
      if (e.endDate > e.startDate || (e.endDate === e.startDate && (e.endTime as string) > (e.startTime as string))) {
        add(`DTEND:${compactDay(e.endDate)}T${compactTime(e.endTime as string)}`)
      }
    }
    add(`SUMMARY:${esc(e.summary)}`)
    if (e.location) add(`LOCATION:${esc(e.location)}`)
    // Un événement sur toute la journée n'occupe pas l'agenda (comme un anniversaire) : il ne bloque pas les invitations.
    if (allDay) add('TRANSP:TRANSPARENT')
    add('END:VEVENT')
  }

  // Le bloc d'événements déjà mis en forme (lignes terminées par CRLF) prend place juste avant la fin du calendrier.
  return out.join('\r\n') + '\r\n' + (options.extraEvents ?? '') + 'END:VCALENDAR\r\n'
}

// Fichier complet d'un calendrier entre deux jours inclus.
export function buildIcsFile(
  calendar: IcsCalendarInfo,
  periods: Period[],
  exceptions: Pick<PeriodException, 'period_id' | 'exception_date'>[],
  range: { from: string; to: string },
  options: IcsFileOptions
): IcsFile {
  const lang = options.lang ?? 'fr'
  const all = buildAllIcsEvents(periods, exceptionsByPeriod(exceptions), options.feed, range.from, range.to, lang)
  const truncated = all.length > ICS_MAX_EVENTS
  const events = truncated ? all.slice(0, ICS_MAX_EVENTS) : all
  const block = options.importedBlock
  // Les vacances (une vingtaine au plus) s'ajoutent après la limite : elles ne la consomment pas et ne sont jamais coupées.
  const holidays = options.holidayZone ? holidayIcsEvents(options.holidayZone, range.from, range.to, lang) : []
  return {
    text: buildIcsText(calendar, holidays.length > 0 ? events.concat(holidays) : events, {
      stamp: options.stamp, subscription: options.subscription, extraEvents: block?.text, lang,
    }),
    eventCount: events.length + (block ? block.count : 0),
    importedCount: events.filter((e) => e.imported).length + (block ? block.count : 0),
    holidayCount: holidays.length,
    truncated,
  }
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
