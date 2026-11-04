import { supabase } from './supabaseClient'

// Limites sur les événements, vérifiées par la base de données (voir supabase/events_limits.sql) :
//  - au plus 10 créations d'événements par minute et par personne ;
//  - au plus 3 événements à horaire précis en même temps dans un calendrier.
// Quand une limite est atteinte, la base refuse l'enregistrement avec un message codé que ce fichier sait lire.

export interface SlotBlocker {
  period_id: string
  name: string
  color: string
  // Jour précis de ce créneau occupé (AAAA-MM-JJ) et horaire de l'événement (HH:MM).
  date: string
  start: string
  end: string
  // Vrai si l'événement se répète ou dure plusieurs jours : on peut alors ne retirer que ce jour.
  recurring: boolean
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

function readBlocker(raw: unknown): SlotBlocker | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = asText(r.period_id)
  const date = asText(r.date)
  if (!ID_RE.test(id)) return null
  if (!DATE_RE.test(date)) return null
  return {
    period_id: id,
    name: asText(r.name, 'Événement'),
    color: /^#[0-9a-f]{3,8}$/i.test(asText(r.color)) ? asText(r.color) : '#2563eb',
    date,
    start: TIME_RE.test(asText(r.start)) ? asText(r.start) : '',
    end: TIME_RE.test(asText(r.end)) ? asText(r.end) : '',
    recurring: r.recurring === true,
  }
}

function readConflict(details: string | null | undefined): SlotConflict {
  const empty: SlotConflict = { date: '', start: '', end: '', dates: 1, blockers: [] }
  if (!details) return empty
  try {
    const raw = JSON.parse(details) as Record<string, unknown>
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
  const { data, error } = await supabase.from('periods').delete().eq('id', blocker.period_id).select('id')
  if (error) return error.message
  if (!data || data.length === 0) {
    return "La suppression n'a pas été effectuée : l'événement n'existe plus, ou vous n'avez pas le droit de le supprimer."
  }
  return null
}
