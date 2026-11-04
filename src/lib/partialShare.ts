import type { Params, TranslationKey } from '../i18n'

// Partage d'un jour ou d'une occurrence d'événement (lecture seule) : types et petites fonctions communes.

type Translate = (key: TranslationKey, params?: Params) => string

export type PartialScope = 'day' | 'occurrence'

export interface PartialItem {
  date: string
  name: string
  color: string
  segment: 'full' | 'start' | 'end'
  start: string | null
  end: string | null
}

export interface PartialCalendarInfo {
  name: string
  icon: string | null
  color: string | null
}

// Ce que voit la personne qui reçoit le partage : uniquement les lignes du jour (ou de l'occurrence).
export interface PartialPayload {
  scope: PartialScope
  date: string
  last_date: string | null
  event_name: string | null
  calendar: PartialCalendarInfo
  items: PartialItem[]
}

// Vue du propriétaire (liste des partages d'un calendrier).
export interface PartialShareOut {
  id: string
  scope: PartialScope
  date: string
  last_date: string | null
  event_name: string | null
  email: string | null
  token: string | null
  created_at: string
}

// Vue de la personne invitée (liste « partagés avec moi »).
export interface PartialShareIn {
  id: string
  scope: PartialScope
  date: string
  last_date: string | null
  event_name: string | null
  calendar: PartialCalendarInfo
  created_at: string
}

type FormatDate = (value: Date | string, options: Intl.DateTimeFormatOptions) => string

export const partialShareUrl = (token: string) => `${window.location.origin}/j/${token}`

const ERROR_TEXT: Record<string, string> = {
  not_authenticated: 'Votre session a expiré. Reconnectez-vous.',
  not_owner: 'Seul le propriétaire du calendrier peut partager.',
  bad_input: 'Jour ou événement invalide.',
  bad_email: 'Saisissez une adresse email valide.',
  nothing_to_share: 'Aucun événement du calendrier ce jour-là : il n’y a rien à partager.',
  no_occurrence: 'Cet événement n’a pas lieu ce jour-là.',
  self_share: 'Vous ne pouvez pas partager avec votre propre adresse.',
  already_shared: 'Ce partage existe déjà pour cette adresse.',
  too_many: 'Limite atteinte : 200 partages par calendrier. Retirez-en quelques-uns avant d’en ajouter.',
}

// Message lisible pour une erreur renvoyée par les fonctions de partage.
export function partialShareError(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? ''
  const token = /calendraft:([a-z_]+)/.exec(message)?.[1]
  if (token && ERROR_TEXT[token]) return ERROR_TEXT[token]
  if (error?.code === 'PGRST202' || /Could not find the function|does not exist/i.test(message)) {
    return 'Le partage d’un jour n’est pas encore activé sur le serveur (le script SQL de l’étape 4 doit être exécuté).'
  }
  return message || 'Une erreur est survenue. Réessayez dans un instant.'
}

// Même texte d'horaire que dans le détail d'un jour.
export function itemTimeLabel(item: PartialItem, t: Translate): string {
  if (!item.start || !item.end) return t('event.allDay')
  if (item.segment === 'start') return t('dayDetail.endsNextDay', { start: item.start, end: item.end })
  if (item.segment === 'end') return t('dayDetail.startedPreviousDay', { start: item.start, end: item.end })
  return `${item.start} – ${item.end}`
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Ordre d'affichage : par jour, puis journée entière, suite de la veille, puis heure de début.
export function sortItems(items: PartialItem[]): PartialItem[] {
  const key = (i: PartialItem) => (!i.start || !i.end ? -1 : i.segment === 'end' ? 0 : toMinutes(i.start))
  return [...items].sort((a, b) => a.date.localeCompare(b.date) || key(a) - key(b) || a.name.localeCompare(b.name))
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function longDay(date: string, formatDate: FormatDate): string {
  return capitalize(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
}

// « 20 oct. 2026 » ou « 20 oct. 2026 → 22 oct. 2026 » pour un événement sur plusieurs jours.
export function dateRangeLabel(first: string, last: string | null, formatDate: FormatDate): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  const a = formatDate(first, opts)
  if (!last || last === first) return a
  return `${a} → ${formatDate(last, opts)}`
}

// Une ligne de la liste des partages : ce qui est partagé.
export function describeShare(share: { scope: PartialScope; date: string; last_date: string | null; event_name: string | null }, formatDate: FormatDate): string {
  const range = dateRangeLabel(share.date, share.last_date, formatDate)
  return share.scope === 'day' ? `Journée du ${range}` : `« ${share.event_name ?? 'Événement'} » · ${range}`
}
