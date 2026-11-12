// Jours fériés de la France métropolitaine, calculés dans l'application (Pâques par l'algorithme de Meeus/Jones/Butcher) :
// aucun service extérieur, aucune mise à jour annuelle. Les noms sont écrits ici en trois langues (ce fichier est aussi
// utilisé par le serveur du fichier .ics : il n'utilise donc pas le système de traduction de l'application).
import type { Occurrence } from '../types'

export type PublicHolidayLang = 'fr' | 'en' | 'de'

export type PublicHolidayKey =
  | 'newYear' | 'easterMonday' | 'labourDay' | 'victory' | 'ascension' | 'whitMonday'
  | 'bastille' | 'assumption' | 'allSaints' | 'armistice' | 'christmas'

export interface PublicHoliday {
  key: PublicHolidayKey
  // AAAA-MM-JJ
  date: string
}

export const PUBLIC_HOLIDAY_COLOR = '#dc2626'

const NAMES: Record<PublicHolidayKey, Record<PublicHolidayLang, string>> = {
  newYear: { fr: 'Jour de l’An', en: 'New Year’s Day', de: 'Neujahr' },
  easterMonday: { fr: 'Lundi de Pâques', en: 'Easter Monday', de: 'Ostermontag' },
  labourDay: { fr: 'Fête du Travail', en: 'Labour Day', de: 'Tag der Arbeit' },
  victory: { fr: 'Victoire 1945', en: 'Victory in Europe Day', de: 'Tag des Sieges 1945' },
  ascension: { fr: 'Ascension', en: 'Ascension Day', de: 'Christi Himmelfahrt' },
  whitMonday: { fr: 'Lundi de Pentecôte', en: 'Whit Monday', de: 'Pfingstmontag' },
  bastille: { fr: 'Fête nationale', en: 'Bastille Day', de: 'Nationalfeiertag' },
  assumption: { fr: 'Assomption', en: 'Assumption Day', de: 'Mariä Himmelfahrt' },
  allSaints: { fr: 'Toussaint', en: 'All Saints’ Day', de: 'Allerheiligen' },
  armistice: { fr: 'Armistice 1918', en: 'Armistice Day', de: 'Waffenstillstand 1918' },
  christmas: { fr: 'Noël', en: 'Christmas Day', de: 'Weihnachten' },
}

export const PUBLIC_HOLIDAY_LEGEND: Record<PublicHolidayLang, string> = {
  fr: 'Jours fériés',
  en: 'Public holidays',
  de: 'Feiertage',
}

export function publicHolidayName(key: PublicHolidayKey, lang: PublicHolidayLang = 'fr'): string {
  return NAMES[key][lang]
}

const pad = (n: number) => String(n).padStart(2, '0')

function iso(year: number, month: number, day: number): string {
  // Date.UTC absorbe les débordements (Pâques + 50 jours, etc.).
  const d = new Date(Date.UTC(year, month - 1, day))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Dimanche de Pâques (calendrier grégorien) : [mois 1-12, jour].
function easter(year: number): [number, number] {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return [month, day]
}

// Les 11 jours fériés d'une année, dans l'ordre des dates.
export function publicHolidaysOfYear(year: number): PublicHoliday[] {
  const [em, ed] = easter(year)
  return [
    { key: 'newYear', date: iso(year, 1, 1) },
    { key: 'easterMonday', date: iso(year, em, ed + 1) },
    { key: 'labourDay', date: iso(year, 5, 1) },
    { key: 'victory', date: iso(year, 5, 8) },
    { key: 'ascension', date: iso(year, em, ed + 39) },
    { key: 'whitMonday', date: iso(year, em, ed + 50) },
    { key: 'bastille', date: iso(year, 7, 14) },
    { key: 'assumption', date: iso(year, 8, 15) },
    { key: 'allSaints', date: iso(year, 11, 1) },
    { key: 'armistice', date: iso(year, 11, 11) },
    { key: 'christmas', date: iso(year, 12, 25) },
  ].sort((x, y) => (x.date < y.date ? -1 : 1)) as PublicHoliday[]
}

// Jours fériés entre deux jours (AAAA-MM-JJ, inclus).
export function publicHolidaysBetween(from: string, to: string): PublicHoliday[] {
  const out: PublicHoliday[] = []
  const first = Number(from.slice(0, 4))
  const last = Number(to.slice(0, 4))
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first > 20) return out
  for (let year = first; year <= last; year++) {
    for (const h of publicHolidaysOfYear(year)) if (h.date >= from && h.date <= to) out.push(h)
  }
  return out
}

// Les jours fériés comme événements « toute la journée » en lecture seule : le calendrier, le détail du jour et le PDF
// les affichent comme les événements importés.
export function publicHolidayOccurrences(from: string, to: string, lang: PublicHolidayLang = 'fr'): Occurrence[] {
  return publicHolidaysBetween(from, to).map((h) => ({
    periodId: 'public-holiday',
    name: publicHolidayName(h.key, lang),
    color: PUBLIC_HOLIDAY_COLOR,
    date: h.date,
    startTime: null,
    endTime: null,
    segment: 'full' as const,
    readOnly: true,
  }))
}
