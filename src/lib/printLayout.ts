import type { Occurrence } from '../types'
import { toDateOnly } from './dateUtils'

// Calculs de mise en page pour l'export PDF d'un mois ou d'une semaine (aucun affichage ici).

export const DAY_MINUTES = 24 * 60

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function hhmm(time: string | null): string {
  return time ? time.slice(0, 5) : ''
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

// Lundi de la semaine qui contient cette date (à minuit, heure locale).
export function mondayOf(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return addDays(day, -((day.getDay() + 6) % 7))
}

// Lundis de toutes les semaines qui touchent la période [start, end].
export function weekStartsBetween(start: Date, end: Date): Date[] {
  const weeks: Date[] = []
  const last = mondayOf(end)
  for (let cursor = mondayOf(start); cursor <= last; cursor = addDays(cursor, 7)) weeks.push(cursor)
  return weeks
}

export function groupByDate(occurrences: Occurrence[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>()
  for (const occ of occurrences) {
    const list = map.get(occ.date) ?? []
    list.push(occ)
    map.set(occ.date, list)
  }
  return map
}

export function hasTimes(occ: Occurrence): boolean {
  return !!occ.startTime && !!occ.endTime
}

// Ordre d'affichage dans une journée : d'abord les événements sans heure, puis par heure de début.
// Un événement qui se termine ce jour-là après avoir commencé la veille commence à minuit.
export function sortDay(occurrences: Occurrence[]): Occurrence[] {
  const key = (o: Occurrence) => (!hasTimes(o) ? -1 : o.segment === 'end' ? 0 : timeToMinutes(o.startTime!))
  return [...occurrences].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name))
}

// Texte d'une ligne (vue mois). Les flèches indiquent un événement qui passe minuit.
export function chipText(occ: Occurrence): string {
  if (!hasTimes(occ)) return occ.name
  const start = hhmm(occ.startTime)
  const end = hhmm(occ.endTime)
  if (occ.segment === 'start') return `${start} ${occ.name} →`
  if (occ.segment === 'end') return `← ${occ.name} · ${end}`
  return `${start} ${occ.name}`
}

// Lignes d'événements par jour selon le nombre de semaines du mois : plus il y en a, plus les cases sont basses
// (au-delà du maximum, la dernière ligne devient « + N autres »).
export function chipLayout(weekRows: number): { max: number; font: string } {
  if (weekRows <= 4) return { max: 10, font: '7pt' }
  if (weekRows === 5) return { max: 8, font: '6.5pt' }
  return { max: 7, font: '6pt' }
}

export interface Block {
  occ: Occurrence
  startMin: number
  endMin: number
  // L'événement a commencé la veille / continue le lendemain (le bloc touche alors le haut / le bas de la journée).
  fromPrevious: boolean
  toNext: boolean
}

export interface PlacedBlock extends Block {
  col: number
  cols: number
  // Nombre de colonnes occupées : un bloc s'étale sur les colonnes voisines restées libres pendant toute sa durée.
  span: number
}

export function blockOf(occ: Occurrence): Block {
  const start = timeToMinutes(occ.startTime!.slice(0, 5))
  const end = timeToMinutes(occ.endTime!.slice(0, 5))
  const segment = occ.segment ?? 'full'
  if (segment === 'start') return { occ, startMin: start, endMin: DAY_MINUTES, fromPrevious: false, toNext: true }
  if (segment === 'end') return { occ, startMin: 0, endMin: end, fromPrevious: true, toNext: false }
  return { occ, startMin: start, endMin: end <= start ? DAY_MINUTES : end, fromPrevious: false, toNext: false }
}

// Blocs qui se chevauchent : chacun reçoit une colonne, côte à côte (même principe que le détail d'un jour).
export function layoutBlocks(items: Block[]): PlacedBlock[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const placed: PlacedBlock[] = []
  let cluster: PlacedBlock[] = []
  let clusterEnd = -1

  const flush = () => {
    const cols = cluster.reduce((max, p) => Math.max(max, p.col + 1), 1)
    cluster.forEach((p) => {
      p.cols = cols
      let span = 1
      while (
        p.col + span < cols &&
        !cluster.some((q) => q.col === p.col + span && q.startMin < p.endMin && q.endMin > p.startMin)
      ) {
        span++
      }
      p.span = span
    })
    placed.push(...cluster)
    cluster = []
    clusterEnd = -1
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush()
    const used = new Set(cluster.filter((p) => p.endMin > item.startMin).map((p) => p.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ ...item, col, cols: 1, span: 1 })
    clusterEnd = Math.max(clusterEnd, item.endMin)
  }
  if (cluster.length > 0) flush()
  return placed
}

export interface Axis {
  from: number
  to: number
}

// Plage d'heures affichée : au moins de 8 h à 18 h, élargie (à l'heure pleine) pour contenir tous les événements.
export function axisFor(blocks: Block[]): Axis {
  let from = 8 * 60
  let to = 18 * 60
  for (const b of blocks) {
    // Un événement qui continue la veille / le lendemain doit rester lisible : au moins une heure visible.
    from = Math.min(from, b.fromPrevious ? Math.max(0, b.endMin - 60) : b.startMin)
    to = Math.max(to, b.toNext ? Math.min(DAY_MINUTES, b.startMin + 60) : b.endMin)
  }
  return {
    from: Math.max(0, Math.floor(from / 60) * 60),
    to: Math.min(DAY_MINUTES, Math.ceil(to / 60) * 60),
  }
}

export interface WeekDay {
  date: Date
  key: string
}

// Jours affichés : du lundi au vendredi, plus le week-end seulement s'il contient un événement.
export function weekDays(monday: Date, byDate: Map<string, Occurrence[]>): WeekDay[] {
  const all = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return { date, key: toDateOnly(date) }
  })
  const weekend = all.slice(5).some((d) => (byDate.get(d.key) ?? []).length > 0)
  return weekend ? all : all.slice(0, 5)
}
