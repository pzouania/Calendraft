import { t as tr, type Lang } from '../i18n'
import { supabase } from './supabaseClient'

// Lien de synchronisation d'un calendrier avec un agenda externe (voir ics_links.sql et worker/ics.ts).

export type LinkResult = { ok: true; token: string | null } | { ok: false; message: string }
export type DoneResult = { ok: true } | { ok: false; message: string }

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ERROR_KEY = {
  not_authenticated: 'icsLink.error.notAuthenticated',
  not_owner: 'icsLink.error.notOwner',
} as const

// Message lisible pour une erreur renvoyée par les fonctions du lien.
export function icsLinkError(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? ''
  const token = /calendraft:([a-z_]+)/.exec(message)?.[1]
  if (token && token in ERROR_KEY) return tr(ERROR_KEY[token as keyof typeof ERROR_KEY])
  if (error?.code === 'PGRST202' || /Could not find the function|does not exist/i.test(message)) {
    return tr('icsLink.error.outdated')
  }
  return message || tr('common.genericError')
}

// Langue des textes du fichier (noms des vacances, « sans titre »). Le français est la langue par défaut du serveur :
// l'adresse reste donc la même qu'avant tant que le français est choisi.
function langQuery(lang: Lang | undefined): string {
  return lang && lang !== 'fr' ? `?lang=${lang}` : ''
}

// Adresse du lien : https pour Google Agenda, webcal pour ouvrir directement Apple Calendrier ou Outlook.
export function icsUrl(token: string, lang?: Lang): string {
  return `${window.location.origin}/api/ics/${token}.ics${langQuery(lang)}`
}

export function webcalUrl(token: string, lang?: Lang): string {
  return `webcal://${window.location.host}/api/ics/${token}.ics${langQuery(lang)}`
}

function toToken(data: unknown): string | null | undefined {
  if (data === null || data === undefined) return null
  return typeof data === 'string' && TOKEN_RE.test(data) ? data.toLowerCase() : undefined
}

export async function fetchIcsLink(calendarId: string): Promise<LinkResult> {
  try {
    const { data, error } = await supabase.rpc('get_ics_link', { p_calendar: calendarId })
    if (error) return { ok: false, message: icsLinkError(error) }
    const token = toToken(data)
    if (token === undefined) return { ok: false, message: tr('icsLink.unexpected') }
    return { ok: true, token }
  } catch {
    return { ok: false, message: tr('common.networkRetry') }
  }
}

// Crée le lien (ou le renvoie s'il existe déjà) ; avec regenerate, le remplace par un nouveau.
export async function createIcsLink(calendarId: string, regenerate: boolean): Promise<LinkResult> {
  try {
    const { data, error } = await supabase.rpc(regenerate ? 'regenerate_ics_link' : 'create_ics_link', { p_calendar: calendarId })
    if (error) return { ok: false, message: icsLinkError(error) }
    const token = toToken(data)
    if (typeof token !== 'string') return { ok: false, message: tr('icsLink.unexpected') }
    return { ok: true, token }
  } catch {
    return { ok: false, message: tr('common.networkRetry') }
  }
}

export async function deleteIcsLink(calendarId: string): Promise<DoneResult> {
  try {
    const { error } = await supabase.rpc('delete_ics_link', { p_calendar: calendarId })
    if (error) return { ok: false, message: icsLinkError(error) }
    return { ok: true }
  } catch {
    return { ok: false, message: tr('common.networkRetry') }
  }
}

export type HolidaysResult = { ok: true; value: boolean | null } | { ok: false; message: string }

// Le lien contient-il les vacances scolaires ? value = null : pas de lien (ou pas propriétaire) ; le réglage par défaut est « oui ».
export async function fetchIcsLinkHolidays(calendarId: string): Promise<HolidaysResult> {
  try {
    const { data, error } = await supabase.rpc('get_ics_link_holidays', { p_calendar: calendarId })
    if (error) return { ok: false, message: icsLinkError(error) }
    return { ok: true, value: typeof data === 'boolean' ? data : null }
  } catch {
    return { ok: false, message: tr('common.networkRetry') }
  }
}

// Met ou retire les vacances scolaires du lien ; renvoie le réglage enregistré.
export async function updateIcsLinkHolidays(calendarId: string, on: boolean): Promise<HolidaysResult> {
  try {
    const { data, error } = await supabase.rpc('set_ics_link_holidays', { p_calendar: calendarId, p_on: on })
    if (error) return { ok: false, message: icsLinkError(error) }
    return { ok: true, value: typeof data === 'boolean' ? data : null }
  } catch {
    return { ok: false, message: tr('common.networkRetry') }
  }
}

// Le serveur Cloudflare est-il prêt à servir les liens ? null si on ne peut pas le savoir.
export async function fetchIcsReady(): Promise<boolean | null> {
  try {
    const res = await fetch('/api/ics/status', { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const body = (await res.json()) as { ready?: unknown }
    return typeof body.ready === 'boolean' ? body.ready : null
  } catch {
    return null
  }
}
