import type { Params, TranslationKey } from '../i18n'
import { supabase } from './supabaseClient'

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
  // Seulement pour un événement importé.
  location?: string
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
  // Le partage comprend des événements importés d'un emploi du temps en ligne (lus en direct, à part).
  include_feed: boolean
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
  include_feed: boolean
  // Événement importé partagé seul.
  imported: boolean
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
  include_feed: boolean
  imported: boolean
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
  no_feed: 'Aucun emploi du temps en ligne n’est relié à ce calendrier : il n’y a pas d’événement importé à partager.',
  no_occurrence: 'Cet événement n’a pas lieu ce jour-là.',
  self_share: 'Vous ne pouvez pas partager avec votre propre adresse.',
  already_shared: 'Ce partage existe déjà pour cette adresse. Pour le modifier, retirez-le d’abord de la liste ci-dessous.',
  too_many: 'Limite atteinte : 200 partages par calendrier. Retirez-en quelques-uns avant d’en ajouter.',
}

// Message lisible pour une erreur renvoyée par les fonctions de partage.
export function partialShareError(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? ''
  const token = /calendraft:([a-z_]+)/.exec(message)?.[1]
  if (token && ERROR_TEXT[token]) return ERROR_TEXT[token]
  if (error?.code === 'PGRST202' || /Could not find the function|does not exist/i.test(message)) {
    return 'Le partage n’est pas à jour sur le serveur (le script SQL partial_shares.sql doit être exécuté dans Supabase).'
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
export function describeShare(
  share: { scope: PartialScope; date: string; last_date: string | null; event_name: string | null; include_feed?: boolean; imported?: boolean },
  formatDate: FormatDate
): string {
  const range = dateRangeLabel(share.date, share.last_date, formatDate)
  if (share.scope === 'day') return `Journée du ${range}${share.include_feed ? ' · avec les événements importés' : ''}`
  return `« ${share.event_name ?? 'Événement'} »${share.imported ? ' (importé)' : ''} · ${range}`
}

// Événements importés d'un partage, lus en direct par le serveur dans l'emploi du temps en ligne du propriétaire.
// Lien secret : sans compte. Partage reçu par email : avec la session de la personne connectée.
export interface SharedFeedResult {
  // 'unavailable' : l'emploi du temps n'a pas pu être lu pour le moment (le reste du partage s'affiche quand même).
  status: 'ok' | 'unavailable'
  items: PartialItem[]
}

interface SharedFeedEvent {
  title: string
  location: string
  date: string
  start: string | null
  end: string | null
  segment: 'full' | 'start' | 'end'
}

export async function fetchSharedFeed(target: { token: string } | { id: string }): Promise<SharedFeedResult> {
  const unavailable: SharedFeedResult = { status: 'unavailable', items: [] }
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-supabase-key': import.meta.env.VITE_SUPABASE_ANON_KEY,
    }
    if ('id' in target) {
      const { data } = await supabase.auth.getSession()
      const jwt = data.session?.access_token
      if (!jwt) return unavailable
      headers.authorization = `Bearer ${jwt}`
    }
    const res = await fetch('/api/feed/shared', { method: 'POST', headers, body: JSON.stringify(target) })
    const body = await res.json().catch(() => null)
    if (!body || !body.ok) return unavailable
    if (!body.configured) return { status: 'ok', items: [] }
    const color = typeof body.color === 'string' ? body.color : '#7c3aed'
    const items = (body.events as SharedFeedEvent[]).map((e): PartialItem => ({
      date: e.date,
      name: e.title,
      color,
      segment: e.segment,
      start: e.start,
      end: e.end,
      location: e.location || undefined,
    }))
    return { status: 'ok', items }
  } catch {
    return unavailable
  }
}
