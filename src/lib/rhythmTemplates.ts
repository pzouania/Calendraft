import type { Occurrence, Period } from '../types'
import { toDateOnly } from './dateUtils'
import { generateAllOccurrences } from './occurrenceEngine'

// Modèles de rythmes : un modèle est une suite d'événements répétés « toutes les X semaines » (le seul rythme que connaît
// le calendrier), créés d'un seul coup avec des noms, des couleurs et des horaires prêts à l'emploi.
// Ce fichier ne fait que des calculs : l'enregistrement dans la base est dans rhythmCreate.ts.

export type TemplateGroup = 'family' | 'work' | 'school'

export const GROUP_TITLES: Record<TemplateGroup, string> = {
  family: 'Garde d’enfants',
  work: 'Horaires de travail',
  school: 'Études',
}

export const GROUP_ORDER: TemplateGroup[] = ['family', 'work', 'school']

// Une série = un événement du modèle (« Poste du matin », « Chez moi »...). Avec start et end : horaire précis.
export interface SeriesDef {
  name: string
  color: string
  start?: string
  end?: string
}

// Un morceau répété : commence le jour `weekday` (0 = lundi) de la semaine `week` du cycle, dure `days` jours (ou nuits),
// et revient toutes les `every` semaines.
export interface SlotDef {
  series: number
  weekday: number
  week: number
  every: number
  days: number
}

export interface TemplateDef {
  id: string
  group: TemplateGroup
  title: string
  summary: string
  help?: string
  // 'monday' : le cycle commence forcément un lundi (on prend le lundi de la semaine choisie).
  // 'any' : le cycle commence le jour choisi, quel qu'il soit.
  anchor: 'monday' | 'any'
  // Plusieurs séries : la personne peut en retirer (par exemple ne garder que ses propres semaines de garde).
  canDisable: boolean
  series: SeriesDef[]
  slots: SlotDef[]
  // Texte décrivant ce qui se passe pendant la semaine `phase` du cycle (menu « La première semaine correspond à »).
  weekLabel: (phase: number, names: string[]) => string
}

const BLUE = '#2563eb'
const GREEN = '#16a34a'
const YELLOW = '#ca8a04'
const ORANGE = '#ea580c'
const VIOLET = '#7c3aed'

const PARENTS: SeriesDef[] = [
  { name: 'Chez moi', color: BLUE },
  { name: 'Chez l’autre parent', color: ORANGE },
]

function alternance(school: number, company: number): TemplateDef {
  const cycle = school + company
  const plural = (n: number) => (n > 1 ? 'semaines' : 'semaine')
  return {
    id: `alternance-${school}-${company}`,
    group: 'school',
    title: `Alternance : ${school} ${plural(school)} école, ${company} ${plural(company)} entreprise`,
    summary: `${school} ${plural(school)} à l’école, puis ${company} ${plural(company)} en entreprise, en boucle.`,
    help: 'Chaque période couvre des semaines entières, du lundi au dimanche.',
    anchor: 'monday',
    canDisable: true,
    series: [
      { name: 'École', color: BLUE },
      { name: 'Entreprise', color: GREEN },
    ],
    slots: [
      { series: 0, weekday: 0, week: 0, every: cycle, days: 7 * school },
      { series: 1, weekday: 0, week: school, every: cycle, days: 7 * company },
    ],
    weekLabel: (phase, names) => {
      const inSchool = phase < school
      const length = inSchool ? school : company
      const index = inSchool ? phase : phase - school
      return `${names[inSchool ? 0 : 1]}${length > 1 ? ` (semaine ${index + 1} sur ${length})` : ''}`
    },
  }
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'garde-1-1',
    group: 'family',
    title: 'Garde alternée : une semaine sur deux',
    summary: 'Les enfants passent une semaine chez chaque parent, en alternance.',
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
    title: 'Garde alternée 2-2-3',
    summary: 'Deux jours chez l’un, deux jours chez l’autre, puis trois jours : le rythme change chaque semaine.',
    help: 'Sur deux semaines : lundi-mardi chez le premier parent, mercredi-jeudi chez le second, vendredi-dimanche chez le premier. La semaine suivante, c’est l’inverse.',
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
    weekLabel: (phase, names) => `Lundi-mardi et week-end : « ${names[phase]} »`,
  },
  {
    id: 'garde-2-2-5-5',
    group: 'family',
    title: 'Garde alternée 2-2-5-5',
    summary: 'Chaque parent a toujours les mêmes jours de la semaine ; seuls les week-ends alternent.',
    help: 'Le premier parent a toujours le lundi et le mardi, le second le mercredi et le jeudi. Du vendredi au dimanche, les week-ends alternent.',
    anchor: 'monday',
    canDisable: true,
    series: PARENTS,
    slots: [
      { series: 0, weekday: 0, week: 0, every: 1, days: 2 },
      { series: 1, weekday: 2, week: 0, every: 1, days: 2 },
      { series: 0, weekday: 4, week: 0, every: 2, days: 3 },
      { series: 1, weekday: 4, week: 1, every: 2, days: 3 },
    ],
    weekLabel: (phase, names) => `Week-end : « ${names[phase]} »`,
  },
  {
    id: 'weekend-1-2',
    group: 'family',
    title: 'Un week-end sur deux',
    summary: 'Du vendredi au dimanche, un week-end sur deux.',
    anchor: 'monday',
    canDisable: false,
    series: [{ name: 'Week-end de garde', color: GREEN }],
    slots: [{ series: 0, weekday: 4, week: 0, every: 2, days: 3 }],
    weekLabel: (phase, names) => (phase === 0 ? `Avec « ${names[0]} »` : `Sans « ${names[0]} » (le week-end d’après)`),
  },
  {
    id: '2x8',
    group: 'work',
    title: '2x8 : matin et après-midi',
    summary: 'Une semaine du matin, une semaine de l’après-midi, du lundi au vendredi.',
    anchor: 'monday',
    canDisable: false,
    series: [
      { name: 'Poste du matin', color: ORANGE, start: '06:00', end: '14:00' },
      { name: 'Poste de l’après-midi', color: VIOLET, start: '14:00', end: '22:00' },
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
    title: '3x8 : matin, après-midi et nuit',
    summary: 'Rotation d’une semaine : matin, puis après-midi, puis nuit, du lundi au vendredi.',
    help: 'Les horaires de chaque poste sont modifiables. La semaine de nuit compte cinq nuits, du lundi soir au samedi matin.',
    anchor: 'monday',
    canDisable: false,
    series: [
      { name: 'Poste du matin', color: YELLOW, start: '06:00', end: '14:00' },
      { name: 'Poste de l’après-midi', color: ORANGE, start: '14:00', end: '22:00' },
      { name: 'Poste de nuit', color: VIOLET, start: '22:00', end: '06:00' },
    ],
    slots: [
      { series: 0, weekday: 0, week: 0, every: 3, days: 5 },
      { series: 1, weekday: 0, week: 1, every: 3, days: 5 },
      { series: 2, weekday: 0, week: 2, every: 3, days: 5 },
    ],
    weekLabel: (phase, names) => names[phase],
  },
  {
    id: '7-7',
    group: 'work',
    title: '7 jours de travail, 7 jours de repos',
    summary: 'Une semaine de travail, puis une semaine de repos, avec des journées de 12 heures.',
    help: 'Pour des nuits, mettez par exemple 19:00 à 07:00.',
    anchor: 'any',
    canDisable: false,
    series: [{ name: 'Travail', color: BLUE, start: '07:00', end: '19:00' }],
    slots: [{ series: 0, weekday: 0, week: 0, every: 2, days: 7 }],
    weekLabel: (phase, names) => (phase === 0 ? names[0] : 'Repos'),
  },
  {
    id: 'semaines-ab',
    group: 'school',
    title: 'Semaine A / semaine B',
    summary: 'Deux emplois du temps qui alternent chaque semaine, du lundi au vendredi.',
    anchor: 'monday',
    canDisable: true,
    series: [
      { name: 'Semaine A', color: BLUE },
      { name: 'Semaine B', color: VIOLET },
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
export function cycleWeeks(def: TemplateDef): number {
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

export function defaultSettings(def: TemplateDef, startDate: string): TemplateSettings {
  return {
    startDate,
    phase: 0,
    series: def.series.map((s) => ({ enabled: true, name: s.name, color: s.color, start: s.start ?? '', end: s.end ?? '' })),
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
  frequency: 'weekly'
  duration_days: number
  interval_weeks: number
  week_of_month: null
  start_time: string | null
  end_time: string | null
}

// Au plus 10 événements créés par minute : aucun modèle ne s'en approche (le plus gros en ajoute 6).
export const MAX_DRAFTS = 10

export function validateSettings(def: TemplateDef, s: TemplateSettings): string | null {
  if (!parseDate(s.startDate)) return 'Choisissez une date de début.'
  const active = s.series.filter((x) => x.enabled)
  if (active.length === 0) return 'Gardez au moins une période.'
  for (let i = 0; i < def.series.length; i++) {
    const x = s.series[i]
    if (!x.enabled) continue
    if (!x.name.trim()) return 'Donnez un nom à chaque période.'
    if (isTimed(def, i)) {
      if (!x.start || !x.end) return `Renseignez l’heure de début et l’heure de fin de « ${x.name.trim()} ».`
      if (x.start === x.end) return `L’heure de fin de « ${x.name.trim()} » doit être différente de l’heure de début.`
    }
  }
  return null
}

// Réglages rendus utilisables pendant la saisie (nom vide, heures manquantes) : sert à garder l'aperçu affiché
// pendant que la personne tape. Les événements réellement créés viennent de buildDrafts, qui exige des réglages valides.
export function lenientSettings(def: TemplateDef, s: TemplateSettings): TemplateSettings {
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
      return { ...x, name: x.name.trim() || d.name, start, end }
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
    const week = mod(slot.week - s.phase, slot.every)
    const timed = isTimed(def, slot.series)
    drafts.push({
      name: x.name.trim(),
      color: x.color,
      start_date: toDateOnly(shift(first, week * 7 + slot.weekday)),
      frequency: 'weekly',
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
