import { t as tr, type Params, type TranslationKey } from '../i18n'
import type { Occurrence, Period } from '../types'
import { toDateOnly } from './dateUtils'
import { generateAllOccurrences } from './occurrenceEngine'

// Modèles de rythmes : un modèle est une suite d'événements répétés « toutes les X semaines » (le seul rythme que connaît
// le calendrier), créés d'un seul coup avec des noms, des couleurs et des horaires prêts à l'emploi.
// Ce fichier ne fait que des calculs : l'enregistrement dans la base est dans rhythmCreate.ts.

export type TemplateGroup = 'family' | 'work' | 'school'

// Texte du titre de chaque groupe (dictionnaires, clés rhythm.group.*).
export const GROUP_TITLE_KEYS: Record<TemplateGroup, TranslationKey> = {
  family: 'rhythm.group.family',
  work: 'rhythm.group.work',
  school: 'rhythm.group.school',
}

export const GROUP_ORDER: TemplateGroup[] = ['family', 'work', 'school']

// Fonction de traduction fournie par le composant (useI18n) : les textes suivent la langue choisie.
export type Translate = (key: TranslationKey, params?: Params) => string

// Une série = un événement du modèle (« Poste du matin », « Chez moi »...). Avec start et end : horaire précis.
// Le nom par défaut est une clé de traduction : il est traduit au moment où le modèle est proposé.
export interface SeriesDef {
  nameKey: TranslationKey
  color: string
  start?: string
  end?: string
}

// Un morceau répété : commence le jour `weekday` (0 = lundi) de la semaine `week` du cycle, dure `days` jours (ou nuits),
// et revient toutes les `every` semaines.
// Modèle en jours (voir TemplateDef.daily) : `offset` est le jour du cycle où commence le morceau (0 = premier jour)
// et `every` la longueur du cycle en jours ; `weekday` et `week` ne servent pas.
export interface SlotDef {
  series: number
  weekday: number
  week: number
  every: number
  days: number
  offset?: number
}

export interface TemplateText {
  title: string
  summary: string
  help?: string
}

export interface TemplateDef {
  id: string
  group: TemplateGroup
  // Titre, résumé et aide du modèle, dans la langue de la fonction de traduction donnée.
  text: (t: Translate) => TemplateText
  // 'monday' : le cycle commence forcément un lundi (on prend le lundi de la semaine choisie).
  // 'any' : le cycle commence le jour choisi, quel qu'il soit.
  anchor: 'monday' | 'any'
  // Plusieurs séries : la personne peut en retirer (par exemple ne garder que ses propres semaines de garde).
  canDisable: boolean
  series: SeriesDef[]
  slots: SlotDef[]
  // Rotation en jours (4x8, 5x8) : le cycle dure `cycle` jours et chaque équipe est décalée de `shift` jours.
  // Le menu « phase » propose alors les cycle/shift points de départ possibles (une équipe chacun) au lieu des semaines.
  daily?: { cycle: number; shift: number }
  // Texte décrivant ce qui se passe pendant la semaine `phase` du cycle (menu « La première semaine correspond à »).
  // Modèle en jours : ce que fait l'équipe `phase` le jour choisi.
  weekLabel: (phase: number, names: string[], t: Translate) => string
}

const BLUE = '#2563eb'
const GREEN = '#16a34a'
const YELLOW = '#ca8a04'
const ORANGE = '#ea580c'
const VIOLET = '#7c3aed'

const PARENTS: SeriesDef[] = [
  { nameKey: 'rhythm.series.home', color: BLUE },
  { nameKey: 'rhythm.series.otherParent', color: ORANGE },
]

// Modèle dont le titre, le résumé et l'aide sont de simples clés de traduction.
function plain(title: TranslationKey, summary: TranslationKey, help?: TranslationKey): TemplateDef['text'] {
  return (t) => ({ title: t(title), summary: t(summary), ...(help ? { help: t(help) } : {}) })
}

function alternance(school: number, company: number): TemplateDef {
  const cycle = school + company
  return {
    id: `alternance-${school}-${company}`,
    group: 'school',
    text: (t) => {
      const params = { school: t('rhythm.weeks', { count: school }), company: t('rhythm.weeks', { count: company }) }
      return {
        title: t('rhythm.t.alternance.title', params),
        summary: t('rhythm.t.alternance.summary', params),
        help: t('rhythm.t.alternance.help'),
      }
    },
    anchor: 'monday',
    canDisable: true,
    series: [
      { nameKey: 'rhythm.series.school', color: BLUE },
      { nameKey: 'rhythm.series.company', color: GREEN },
    ],
    slots: [
      { series: 0, weekday: 0, week: 0, every: cycle, days: 7 * school },
      { series: 1, weekday: 0, week: school, every: cycle, days: 7 * company },
    ],
    weekLabel: (phase, names, t) => {
      const inSchool = phase < school
      const length = inSchool ? school : company
      const index = inSchool ? phase : phase - school
      return `${names[inSchool ? 0 : 1]}${length > 1 ? t('rhythm.week.alternanceCount', { index: index + 1, total: length }) : ''}`
    },
  }
}

// Rotation continue en jours : 2 matins, 2 après-midis, 2 nuits puis du repos (4x8 : 2 jours ; 5x8 : 4 jours).
// Les équipes sont décalées de 2 jours : le menu « phase » choisit ce que fait la personne le jour de départ.
function rotation(teams: number, cycle: number): TemplateDef {
  const shift = 2
  const rest = cycle - 3 * shift
  return {
    id: `${teams}x8`,
    group: 'work',
    text: plain(
      `rhythm.t.${teams}x8.title` as TranslationKey,
      `rhythm.t.${teams}x8.summary` as TranslationKey,
      `rhythm.t.${teams}x8.help` as TranslationKey,
    ),
    anchor: 'any',
    canDisable: false,
    series: [
      { nameKey: 'rhythm.series.morning', color: YELLOW, start: '06:00', end: '14:00' },
      { nameKey: 'rhythm.series.afternoon', color: ORANGE, start: '14:00', end: '22:00' },
      { nameKey: 'rhythm.series.night', color: VIOLET, start: '22:00', end: '06:00' },
    ],
    slots: [
      { series: 0, weekday: 0, week: 0, every: cycle, days: shift, offset: 0 },
      { series: 1, weekday: 0, week: 0, every: cycle, days: shift, offset: shift },
      { series: 2, weekday: 0, week: 0, every: cycle, days: shift, offset: 2 * shift },
    ],
    daily: { cycle, shift },
    weekLabel: (phase, names, t) => {
      if (phase < 3) return names[phase]
      const part = phase - 3
      return rest > shift ? `${t('rhythm.week.rest')}${t('rhythm.team.part', { index: part + 1, total: rest / shift })}` : t('rhythm.week.rest')
    },
  }
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'garde-1-1',
    group: 'family',
    text: plain('rhythm.t.garde11.title', 'rhythm.t.garde11.summary'),
    anchor: 'any',
    canDisable: true,
    series: PARENTS,
    slots: [
      { series: 0, weekday: 0, week: 0, every: 2, days: 7 },
      { series: 1, weekday: 0, week: 1, every: 2, days: 7 },
    ],
    weekLabel: (phase, names) => names[phase],
  },
  {
    id: 'garde-2-2-3',
    group: 'family',
    text: plain('rhythm.t.garde223.title', 'rhythm.t.garde223.summary', 'rhythm.t.garde223.help'),
    anchor: 'monday',
    canDisable: true,
    series: PARENTS,
    slots: [
      { series: 0, weekday: 0, week: 0, every: 2, days: 2 },
      { series: 0, weekday: 2, week: 1, every: 2, days: 2 },
      { series: 0, weekday: 4, week: 0, every: 2, days: 3 },
      { series: 1, weekday: 0, week: 1, every: 2, days: 2 },
      { series: 1, weekday: 2, week: 0, every: 2, days: 2 },
      { series: 1, weekday: 4, week: 1, every: 2, days: 3 },
    ],
    weekLabel: (phase, names, t) => t('rhythm.week.g223', { name: names[phase] }),
  },
  {
    id: 'garde-2-2-5-5',
    group: 'family',
    text: plain('rhythm.t.garde2255.title', 'rhythm.t.garde2255.summary', 'rhythm.t.garde2255.help'),
    anchor: 'monday',
    canDisable: true,
    series: PARENTS,
    slots: [
      { series: 0, weekday: 0, week: 0, every: 1, days: 2 },
      { series: 1, weekday: 2, week: 0, every: 1, days: 2 },
      { series: 0, weekday: 4, week: 0, every: 2, days: 3 },
      { series: 1, weekday: 4, week: 1, every: 2, days: 3 },
    ],
    weekLabel: (phase, names, t) => t('rhythm.week.g2255', { name: names[phase] }),
  },
  {
    id: 'weekend-1-2',
    group: 'family',
    text: plain('rhythm.t.weekend12.title', 'rhythm.t.weekend12.summary'),
    anchor: 'monday',
    canDisable: false,
    series: [{ nameKey: 'rhythm.series.weekend', color: GREEN }],
    slots: [{ series: 0, weekday: 4, week: 0, every: 2, days: 3 }],
    weekLabel: (phase, names, t) =>
      phase === 0 ? t('rhythm.week.weekendWith', { name: names[0] }) : t('rhythm.week.weekendWithout', { name: names[0] }),
  },
  {
    id: '2x8',
    group: 'work',
    text: plain('rhythm.t.2x8.title', 'rhythm.t.2x8.summary'),
    anchor: 'monday',
    canDisable: false,
    series: [
      { nameKey: 'rhythm.series.morning', color: ORANGE, start: '06:00', end: '14:00' },
      { nameKey: 'rhythm.series.afternoon', color: VIOLET, start: '14:00', end: '22:00' },
    ],
    slots: [
      { series: 0, weekday: 0, week: 0, every: 2, days: 5 },
      { series: 1, weekday: 0, week: 1, every: 2, days: 5 },
    ],
    weekLabel: (phase, names) => names[phase],
  },
  {
    id: '3x8',
    group: 'work',
    text: plain('rhythm.t.3x8.title', 'rhythm.t.3x8.summary', 'rhythm.t.3x8.help'),
    anchor: 'monday',
    canDisable: false,
    series: [
      { nameKey: 'rhythm.series.morning', color: YELLOW, start: '06:00', end: '14:00' },
      { nameKey: 'rhythm.series.afternoon', color: ORANGE, start: '14:00', end: '22:00' },
      { nameKey: 'rhythm.series.night', color: VIOLET, start: '22:00', end: '06:00' },
    ],
    slots: [
      { series: 0, weekday: 0, week: 0, every: 3, days: 5 },
      { series: 1, weekday: 0, week: 1, every: 3, days: 5 },
      { series: 2, weekday: 0, week: 2, every: 3, days: 5 },
    ],
    weekLabel: (phase, names) => names[phase],
  },
  rotation(4, 8),
  rotation(5, 10),
  {
    id: '7-7',
    group: 'work',
    text: plain('rhythm.t.7-7.title', 'rhythm.t.7-7.summary', 'rhythm.t.7-7.help'),
    anchor: 'any',
    canDisable: false,
    series: [{ nameKey: 'rhythm.series.work', color: BLUE, start: '07:00', end: '19:00' }],
    slots: [{ series: 0, weekday: 0, week: 0, every: 2, days: 7 }],
    weekLabel: (phase, names, t) => (phase === 0 ? names[0] : t('rhythm.week.rest')),
  },
  {
    id: 'semaines-ab',
    group: 'school',
    text: plain('rhythm.t.weeksAB.title', 'rhythm.t.weeksAB.summary'),
    anchor: 'monday',
    canDisable: true,
    series: [
      { nameKey: 'rhythm.series.weekA', color: BLUE },
      { nameKey: 'rhythm.series.weekB', color: VIOLET },
    ],
    slots: [
      { series: 0, weekday: 0, week: 0, every: 2, days: 5 },
      { series: 1, weekday: 0, week: 1, every: 2, days: 5 },
    ],
    weekLabel: (phase, names) => names[phase],
  },
  alternance(1, 1),
  alternance(2, 2),
  alternance(1, 2),
  alternance(1, 3),
]

export function templateById(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

// Nombre de semaines au bout desquelles le rythme recommence.
// Nombre de choix du menu « phase » : les semaines du cycle, ou les points de départ d'une rotation en jours.
export function phaseCount(def: TemplateDef): number {
  return def.daily ? def.daily.cycle / def.daily.shift : cycleWeeks(def)
}

export function cycleWeeks(def: TemplateDef): number {
  // Rotation en jours : le cycle se compte en semaines entières (8 jours : 2 semaines, 10 jours : 2 semaines).
  if (def.daily) return Math.ceil(def.daily.cycle / 7)
  return def.slots.reduce((cycle, slot) => (cycle * slot.every) / gcd(cycle, slot.every), 1)
}

export function isTimed(def: TemplateDef, series: number): boolean {
  return !!def.series[series].start && !!def.series[series].end
}

// Réglages que la personne peut changer avant d'ajouter le modèle.
export interface SeriesSettings {
  enabled: boolean
  name: string
  color: string
  start: string
  end: string
}

export interface TemplateSettings {
  // Date choisie (AAAA-MM-JJ).
  startDate: string
  // Semaine du cycle qui correspond à la première semaine affichée (0 = la première semaine du modèle).
  phase: number
  series: SeriesSettings[]
}

export function defaultSettings(def: TemplateDef, startDate: string, t: Translate): TemplateSettings {
  return {
    startDate,
    phase: 0,
    series: def.series.map((s) => ({ enabled: true, name: t(s.nameKey), color: s.color, start: s.start ?? '', end: s.end ?? '' })),
  }
}

function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return toDateOnly(date) === value ? date : null
}

function shift(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const mod = (n: number, m: number) => ((n % m) + m) % m

// Premier jour du cycle : la date choisie, ou le lundi de sa semaine pour les modèles qui commencent un lundi.
export function anchorDate(def: TemplateDef, startDate: string): string | null {
  const date = parseDate(startDate)
  if (!date) return null
  return toDateOnly(def.anchor === 'monday' ? shift(date, -((date.getDay() + 6) % 7)) : date)
}

// Colonnes enregistrées pour chaque événement du modèle.
export interface PeriodDraft {
  name: string
  color: string
  start_date: string
  frequency: 'weekly' | 'days'
  duration_days: number
  interval_weeks: number
  week_of_month: null
  start_time: string | null
  end_time: string | null
}

// Au plus 10 événements créés par minute : aucun modèle ne s'en approche (le plus gros en ajoute 6).
export const MAX_DRAFTS = 10

export function validateSettings(def: TemplateDef, s: TemplateSettings): string | null {
  if (!parseDate(s.startDate)) return tr('rhythm.error.date')
  const active = s.series.filter((x) => x.enabled)
  if (active.length === 0) return tr('rhythm.error.none')
  for (let i = 0; i < def.series.length; i++) {
    const x = s.series[i]
    if (!x.enabled) continue
    if (!x.name.trim()) return tr('rhythm.error.name')
    if (isTimed(def, i)) {
      if (!x.start || !x.end) return tr('rhythm.error.times', { name: x.name.trim() })
      if (x.start === x.end) return tr('rhythm.error.sameTime', { name: x.name.trim() })
    }
  }
  return null
}

// Réglages rendus utilisables pendant la saisie (nom vide, heures manquantes) : sert à garder l'aperçu affiché
// pendant que la personne tape. Les événements réellement créés viennent de buildDrafts, qui exige des réglages valides.
export function lenientSettings(def: TemplateDef, s: TemplateSettings, t: Translate): TemplateSettings {
  return {
    ...s,
    series: s.series.map((x, i) => {
      const d = def.series[i]
      let start = x.start || d.start || ''
      let end = x.end || d.end || ''
      if (isTimed(def, i) && start === end) {
        start = d.start ?? ''
        end = d.end ?? ''
      }
      return { ...x, name: x.name.trim() || t(d.nameKey), start, end }
    }),
  }
}

// Les événements à créer. Renvoie une liste vide si les réglages ne sont pas valides.
export function buildDrafts(def: TemplateDef, s: TemplateSettings): PeriodDraft[] {
  const anchor = anchorDate(def, s.startDate)
  if (!anchor || validateSettings(def, s)) return []
  const first = parseDate(anchor)!
  const drafts: PeriodDraft[] = []
  for (const slot of def.slots) {
    const x = s.series[slot.series]
    if (!x.enabled) continue
    const timed = isTimed(def, slot.series)
    // Rotation en jours : le morceau commence `offset` jours après le départ du cycle, moins le décalage de l'équipe choisie.
    const startOffset = def.daily
      ? mod((slot.offset ?? 0) - s.phase * def.daily.shift, slot.every)
      : mod(slot.week - s.phase, slot.every) * 7 + slot.weekday
    drafts.push({
      name: x.name.trim(),
      color: x.color,
      start_date: toDateOnly(shift(first, startOffset)),
      frequency: def.daily ? 'days' : 'weekly',
      duration_days: slot.days,
      interval_weeks: slot.every,
      week_of_month: null,
      start_time: timed ? x.start : null,
      end_time: timed ? x.end : null,
    })
  }
  return drafts
}

// Jours du cycle tels que le calendrier les affichera (même moteur que le calendrier).
export function previewOccurrences(drafts: PeriodDraft[], anchor: string, weeks: number): Occurrence[] {
  const first = parseDate(anchor)
  if (!first || drafts.length === 0) return []
  const periods: Period[] = drafts.map((d, i) => ({ id: `draft-${i}`, calendar_id: '', created_at: '', ...d }))
  return generateAllOccurrences(periods, first, shift(first, weeks * 7 - 1))
}
